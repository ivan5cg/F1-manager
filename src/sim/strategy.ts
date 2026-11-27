// Estrategia e IA de los equipos.
// Cada equipo tiene un conocimiento IMPERFECTO del desgaste real; lo mejora rodando tandas largas
// en libres. Con lo que sabe simula stints con el mismo modelo de neumáticos que la carrera y
// busca la mejor combinación de paradas con los juegos que le quedan.
import { Rng, clamp } from "./rng";
import { Compound, COMPOUNDS, DRY, HiddenTyre, TyreSet, newSet, updateSet, setGrip, setWear, WET, driverRough, steadyGrip, bestWaterGrip, waterWear, wearGrip } from "./tyres";
import { msTimeAtGrip } from "./track";
import { forecast, Forecast } from "./weather";
import type { Session, Car, TeamDef, Run } from "./session";

/** Segundos de más que cuesta cambiar el morro en una parada. */
export const NOSE_TIME = 7.5;

export interface Stint { c: Compound; endLap: number; setId?: string }
export interface Plan { stints: Stint[]; total?: number; /** vueltas que se ha retrasado ya la parada por tráfico */ hold?: number }

export interface TeamKnowledge {
  hidden: HiddenTyre; // su estimación de lo oculto
  noise: Record<Compound, number>; // error relativo de su estimación por compuesto
  measured: Partial<Record<Compound, { perLap: number; laps: number }>>;
  /** Caché de perfiles de tanda, por compuesto, coche y temperatura (es una función pura de esas claves). */
  profile: Record<string, { dt: number[]; wear: number[]; trackT: number; cum?: number[] }>;
  wetIn: number;
  wetOut: number;
  quality: number; // meteorólogo
  strategy: number;
  fc: Forecast | null;
  fcT: number;
}

const MAX_AGE = 70;
/** Calentar el juego nuevo en la vuelta de salida (s): los duros tardan más. */
const WARM_UP: Record<Compound, number> = { S: 0.6, M: 0.9, H: 1.3, I: 0.5, W: 0.4 };

export function buildKnowledge(truth: HiddenTyre, team: TeamDef, rng: Rng): TeamKnowledge {
  const n0 = 0.06 + ((100 - team.estrategia) / 100) * 0.3;
  const noise = { S: n0, M: n0, H: n0, I: n0 * 1.3, W: n0 * 1.3 };
  return {
    hidden: {
      wearMult: { S: truth.wearMult.S * rng.logn(n0), M: truth.wearMult.M * rng.logn(n0), H: truth.wearMult.H * rng.logn(n0), I: truth.wearMult.I * rng.logn(n0), W: truth.wearMult.W * rng.logn(n0) },
      thermalOffset: truth.thermalOffset + rng.gauss(0, 1 + n0 * 12),
      grainProne: truth.grainProne * rng.logn(n0 * 2),
    },
    noise, measured: {}, profile: {},
    // cuándo pasa cada equipo de slicks a intermedios y vuelve: alrededor del punto de cruce, unos antes y otros tarde
    wetIn: WET.si * rng.range(0.9, 1.4), wetOut: WET.si * rng.range(0.6, 0.9),
    quality: team.meteo, strategy: team.estrategia, fc: null, fcT: -999,
  };
}

/** Lo que aprende un equipo de una tanda: mide el desgaste real del compuesto. */
export function learnFromRun(sess: Session, car: Car, run: Run & { lapsData: number[] }) {
  const set = car.tyres;
  // con agua el desgaste no se parece al de seco: no sirve para afinar la estrategia
  if (!set || sess.avgWater() > 0.15 || !DRY.includes(set.c)) return;
  const k = car.e.knowledge;
  const c = set.c;
  const laps = run.lapsData.length;
  if (laps < 3) return;
  const before = k.noise[c];
  k.noise[c] = Math.max(0.02, before * (laps >= 8 ? 0.4 : 0.6));
  const r = sess.rng;
  k.hidden.wearMult[c] = sess.hidden.wearMult[c] * r.logn(k.noise[c]);
  k.hidden.thermalOffset = sess.hidden.thermalOffset + r.gauss(0, 1 + k.noise[c] * 8);
  k.hidden.grainProne = sess.hidden.grainProne * r.logn(k.noise[c] * 1.5);
  k.measured[c] = { perLap: (setWear(set) / Math.max(1, set.laps)) * r.logn(0.04), laps: (k.measured[c]?.laps ?? 0) + laps };
  // el resto de compuestos también se entienden algo mejor (mismo asfalto)
  for (const o of DRY) if (o !== c) k.noise[o] = Math.max(0.03, k.noise[o] * 0.85);
  k.profile = {};
  if (car.player) sess.log({ kind: "radio", carId: car.id, text: `📊 Ingenieros: datos de la tanda de ${car.d.abrev} con ${COMPOUNDS[c].name.toLowerCase()} (${laps} v). Error de la estimación: ±${Math.round(before * 100)} % → ±${Math.round(k.noise[c] * 100)} %.`, important: true });
}

/** Simula un stint en seco con el modelo de neumáticos y devuelve pérdida por edad. */
export function stintProfile(sess: Session, car: Car, k: TeamKnowledge, c: Compound) {
  // cada coche desgasta distinto: el perfil es de ESE coche (antes lo heredaba el compañero)
  const trackT = Math.round(sess.weather.trackT / 3) * 3, airT = Math.round(sess.weather.airT / 3) * 3;
  // la goma en pista cambia el graining: el perfil de unos libres con pista verde no vale para la carrera
  const rubber = Math.round(sess.rubber * 5) / 5;
  const key = `${c}:${car.id}:${trackT}:${airT}:${rubber}`;
  const cached = k.profile[key];
  if (cached) return cached;
  const tr = sess.track;
  const set = newSet(c);
  const dt: number[] = [], wear: number[] = [];
  const lapRef = sess.lapRefRace;
  const spg = sess.secPerGrip;
  for (let age = 0; age < MAX_AGE; age++) {
    // gastado del todo: lo que queda no se va a usar (se rellena con un coste prohibitivo)
    if (age > 0 && wear[age - 1] > 0.985) { dt.push(dt[age - 1] + 5); wear.push(1); continue; }
    let gripSum = 0, tSum = 0;
    for (const m of tr.ms) {
      const tm = msTimeAtGrip(m, 1);
      const steps = Math.max(1, Math.round(tm / 2.0));
      const h = tm / steps;
      for (let s = 0; s < steps; s++) {
        updateSet(set, {
          trackT, airT, water: 0,
          eF: (m.energyF / tm) * lapRef, eR: (m.energyR / tm) * lapRef,
          push: 1, carWear: car.wearMult, abrasiveness: tr.abrasiveness,
          rubber, rough: driverRough(car.d.neumaticos),
        }, h, lapRef, k.hidden);
      }
      gripSum += setGrip(set, 0) * tm;
      tSum += tm;
    }
    const g = gripSum / tSum;
    dt.push(-(g - 1) * 100 * spg);
    wear.push(setWear(set));
  }
  // sumas acumuladas: el coste de una tanda sale en O(1)
  const cum = [0];
  for (let i = 0; i < dt.length; i++) cum.push(cum[i] + dt[i]);
  const p = { dt, wear, trackT, cum };
  k.profile[key] = p;
  return p;
}

function stintCost(sess: Session, car: Car, k: TeamKnowledge, c: Compound, from: number, laps: number): number {
  if (laps <= 0) return 0;
  const p = stintProfile(sess, car, k, c);
  if (from + laps > MAX_AGE) return 1e9;
  let t: number;
  if (p.cum) t = p.cum[from + laps] - p.cum[from];
  else { t = 0; for (let a = from; a < from + laps; a++) t += p.dt[a]; }
  const w = p.wear[from + laps - 1];
  if (w > 0.93) t += (w - 0.93) * 400;
  return t;
}

export function pitLoss(sess: Session): number {
  const tr = sess.track;
  let tPortion = 0;
  for (let i = 0; i < tr.vref.length; i++) {
    const s = i * tr.ds;
    if (s >= tr.pit.entry || s < tr.pit.exit) tPortion += tr.ds / tr.vref[i];
  }
  return tr.pit.laneLength / tr.pit.limit - tPortion * 1.05 + 2;
}

/**
 * Lo que cuesta parar con el virtual o con el coche de seguridad, en veces lo que cuesta en verde: el pit-lane va a la
 * velocidad de siempre y el tramo que se salta, con los topes del circuito (Session.neutralCap).
 */
export function pitLossUnder(sess: Session, flag: "vsc" | "sc"): number {
  const tr = sess.track, cap = sess.neutralCap[flag];
  let tG = 0, tN = 0;
  for (let i = 0; i < tr.vref.length; i++) {
    const s = i * tr.ds;
    if (s >= tr.pit.entry || s < tr.pit.exit) { tG += tr.ds / tr.vref[i]; tN += tr.ds / Math.min(tr.vref[i], cap); }
  }
  const lane = tr.pit.laneLength / tr.pit.limit + 2;
  return clamp((lane - tN * 1.05) / Math.max(1, lane - tG * 1.05), 0.2, 1);
}

/** Juegos disponibles (sin el montado), del menos al más gastado. */
export function availableSets(car: Car): Record<Compound, TyreSet[]> {
  const out = { S: [], M: [], H: [], I: [], W: [] } as Record<Compound, TyreSet[]>;
  for (const s of car.e.sets) if (!s.returned && !s.punctured && s !== car.tyres) out[s.c].push(s);
  for (const c of Object.keys(out) as Compound[]) out[c].sort((a, b) => setWear(a) - setWear(b));
  return out;
}

/**
 * Mejor estrategia en seco desde fromLap con el neumático actual (curC, edad curAge).
 * Si curC es null también elige el de salida. Solo usa los juegos que quedan.
 */
export function planStrategy(sess: Session, car: Car, k: TeamKnowledge, fromLap = 0, curC: Compound | null = null, curAge = 0, rng: Rng | null = null, keepUsed = false): Plan {
  const n = (k.noise.M + k.noise.S) / 2;
  const temp = 1 + n * 15;
  // solo hacen falta las opciones cercanas a la mejor (con rng se elige entre ellas)
  const options = enumeratePlans(sess, car, k, fromLap, curC, curAge, rng ? temp * 3 : 0, keepUsed);
  const total = sess.laps;
  if (!options.length) return { stints: [{ c: curC ?? "M", endLap: total }] };
  if (rng) {
    const best = options[0].total!;
    const pool = options.filter((o) => o.total! - best < temp * 3).slice(0, 400);
    const w = pool.map((o) => Math.exp(-(o.total! - best) / temp));
    let r = rng.next() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  }
  return options[0];
}

/**
 * Lo que cuesta en la salida y la primera vuelta cada compuesto (s equivalentes), en carrera y en la sprint: el duro
 * tracciona peor y tarda en calentar, y los puestos perdidos cuestan luego. Sin esto, salir con duro o con medio daba
 * igual y la mitad de la parrilla salía con duro.
 */
const START_COST: Partial<Record<Compound, number>> = { H: 1.2 };
/**
 * Lo que se suma desde las primeras filas (en la pole entero, y menos cuanto más atrás; nada desde la undécima): delante, cada puesto que se pierde
 * en la arrancada o en las primeras vueltas con el duro frío es uno que se había ganado en la clasificación y que luego
 * hay que recuperar en pista o en boxes, y la primera tanda larga deja al de detrás el undercut. Sin esto, una de cada
 * cuatro poles salía con duro y ganaba el 17 % de las veces (con medio, el 41 %; en 2026 la pole ganó el 71 %).
 */
const START_FRONT: Partial<Record<Compound, number>> = { H: 4 };
/** En la sprint pesa más: es corta y sin paradas, lo que se pierde en la salida ya no se recupera. */
const SPRINT_START_K = 2.5;

/** Todas las estrategias posibles en seco (0, 1 o 2 paradas) con los juegos que quedan, de mejor a peor. */
function enumeratePlans(sess: Session, car: Car, k: TeamKnowledge, fromLap = 0, curC: Compound | null = null, curAge = 0, margin = Infinity, keepUsed = false): Plan[] {
  const total = sess.laps;
  // se descartan sobre la marcha las que ya están peor que la mejor + margen (sin crear objetos)
  let bestT = Infinity;
  const keep = (t: number) => { if (t < bestT) bestT = t; return t <= bestT + margin; };
  const remain = total - fromLap;
  // pérdida en boxes + lo que cuesta perder posición en pista (tráfico al volver)
  const loss = pitLoss(sess) + car.team.boxes + 1.0 + sess.trafficCost;
  const avail = availableSets(car);
  // keepUsed: se para ahora, en plena carrera; los compuestos ya usados siguen contando para la regla
  const used = curC || keepUsed ? new Set(car.usedCompounds) : new Set<Compound>();
  const isRace = sess.kind === "RACE";
  const ruleOk = (cs: Compound[]) => {
    if (!isRace) return true;
    const all = new Set([...used, ...cs]);
    if (all.has("I") || all.has("W")) return true;
    return [...all].filter((c) => DRY.includes(c)).length >= 2;
  };
  // edad equivalente del i-ésimo juego de un compuesto (vueltas que ya lleva)
  const ageOf = (c: Compound, i: number) => {
    const s = avail[c][i];
    if (!s) return -1;
    const w = setWear(s);
    if (w <= 0) return 0;
    const p = stintProfile(sess, car, k, c);
    let a = 0;
    while (a < MAX_AGE - 1 && p.wear[a] < w) a++;
    return a;
  };
  const options: Plan[] = [];
  const starts: { c: Compound; age: number; own: boolean }[] = curC
    ? [{ c: curC, age: curAge, own: false }]
    : DRY.filter((c) => avail[c].length).map((c) => ({ c, age: ageOf(c, 0), own: true }));
  for (const st of starts) {
    const c0 = st.c, a0 = st.age;
    const id0 = st.own ? avail[c0][0]?.id : undefined;
    // salida: con el duro se tracciona peor y, frío, se pierden puestos en la primera vuelta que luego cuesta recuperar
    const gridPos = Math.max(0, sess.lapOrder[0]?.indexOf(car.id) ?? 10);
    const startCost = st.own && fromLap === 0 && (isRace || sess.kind === "SPRINT") ? ((START_COST[c0] ?? 0) + (START_FRONT[c0] ?? 0) * Math.max(0, 1 - gridPos / 10)) * (isRace ? 1 : SPRINT_START_K) : 0;
    const idx = (c: Compound, n: number) => n + (st.own && c === c0 ? 1 : 0); // índice del juego libre
    if (ruleOk([c0])) { const t = startCost + stintCost(sess, car, k, c0, a0, remain); if (keep(t)) options.push({ stints: [{ c: c0, endLap: total, setId: id0 }], total: t }); }
    for (const c2 of DRY) {
      const i2 = idx(c2, 0);
      if (!avail[c2][i2] || !ruleOk([c0, c2])) continue;
      const a2 = ageOf(c2, i2);
      for (let l1 = 4; l1 <= remain - 4; l1++) {
        const t = startCost + stintCost(sess, car, k, c0, a0, l1) + stintCost(sess, car, k, c2, a2, remain - l1) + loss;
        if (keep(t)) options.push({ stints: [{ c: c0, endLap: fromLap + l1, setId: id0 }, { c: c2, endLap: total, setId: avail[c2][i2].id }], total: t });
      }
    }
    for (const c2 of DRY) for (const c3 of DRY) {
      const i2 = idx(c2, 0);
      const i3 = idx(c3, c3 === c2 ? 1 : 0);
      if (!avail[c2][i2] || !avail[c3][i3] || !ruleOk([c0, c2, c3])) continue;
      const a2 = ageOf(c2, i2), a3 = ageOf(c3, i3);
      for (let l1 = 4; l1 <= remain - 8; l1++) for (let l2 = 4; l1 + l2 <= remain - 4; l2++) {
        const t = startCost + stintCost(sess, car, k, c0, a0, l1) + stintCost(sess, car, k, c2, a2, l2) + stintCost(sess, car, k, c3, a3, remain - l1 - l2) + 2 * loss;
        if (keep(t)) options.push({ stints: [{ c: c0, endLap: fromLap + l1, setId: id0 }, { c: c2, endLap: fromLap + l1 + l2, setId: avail[c2][i2].id }, { c: c3, endLap: total, setId: avail[c3][i3].id }], total: t });
      }
    }
  }
  const out = options.filter((o) => o.total! <= bestT + margin);
  out.sort((a, b) => a.total! - b.total!);
  return out;
}

export interface PlanOption {
  plan: Plan;
  stops: number;
  delta: number; // s respecto a la mejor
  /** s que perdería este mismo plan si los neumáticos se gastan un 15 % más de lo que cree el equipo */
  ifWorse: number;
}

/** Las mejores estrategias distintas (por compuestos y número de paradas) para elegir antes de la salida. */
export function planOptions(sess: Session, car: Car, k: TeamKnowledge, n = 3): PlanOption[] {
  const all = enumeratePlans(sess, car, k, 0, null, 0);
  // «Distintas» de verdad: mismo número de paradas y mismos compuestos en otro orden es la misma
  // estrategia (S-S-M, S-M-S y M-S-S cuestan casi igual). De cada familia, solo la mejor.
  const seen = new Set<string>();
  const families: Plan[] = [];
  for (const o of all) {
    const sig = `${o.stints.length}:${o.stints.map((x) => x.c).sort().join("")}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    families.push(o);
  }
  if (!families.length) return [];
  const best = families[0].total!;
  // la más rápida, la mejor con otro número de paradas (aunque cueste: es la alternativa que uno
  // quiere poder comparar, con su precio a la vista) y el resto por tiempo si no son un disparate
  const LIMIT = 45;
  const picked: Plan[] = [families[0]];
  const otherStops = families.find((o) => o.stints.length !== families[0].stints.length && o.total! - best <= 120);
  if (otherStops) picked.push(otherStops);
  for (const o of families) {
    if (picked.length >= n) break;
    if (picked.includes(o)) continue;
    if (o.total! - best > LIMIT && picked.length >= 2) break;
    picked.push(o);
  }
  picked.sort((a, b) => a.total! - b.total!);
  // el mismo plan con un desgaste un 15 % mayor (el error típico de lo que sabe un equipo)
  const worse: TeamKnowledge = { ...k, profile: {}, hidden: { ...k.hidden, wearMult: Object.fromEntries(Object.entries(k.hidden.wearMult).map(([c, v]) => [c, (v as number) * 1.15])) as TeamKnowledge["hidden"]["wearMult"] } };
  const avail = availableSets(car);
  const ageFor = (kk: TeamKnowledge, c: Compound, setId?: string) => {
    const set = setId ? car.e.sets.find((x) => x.id === setId) : avail[c][0];
    const w = set ? setWear(set) : 0;
    if (w <= 0) return 0;
    const p = stintProfile(sess, car, kk, c);
    let a = 0;
    while (a < MAX_AGE - 1 && p.wear[a] < w) a++;
    return a;
  };
  const cost = (kk: TeamKnowledge, plan: Plan) => {
    let t = 0, from = 0;
    plan.stints.forEach((st, i) => {
      t += stintCost(sess, car, kk, st.c, ageFor(kk, st.c, st.setId), st.endLap - from);
      if (i > 0) t += pitLoss(sess) + car.team.boxes + 1.0 + sess.trafficCost;
      from = st.endLap;
    });
    return t;
  };
  return picked.map((p) => ({ plan: p, stops: p.stints.length - 1, delta: p.total! - best, ifWorse: cost(worse, p) - cost(k, p) }));
}


/**
 * Lluvia media sobre el circuito que espera el equipo dentro de m minutos (mm/h). La previsión da el máximo sobre el
 * circuito; se ajusta con lo que cae ahora de media.
 */
function rainCurve(fc: Forecast, rainNow: number, p = fc.p50): (m: number) => number {
  const scale = p[0] > 0.3 ? clamp(rainNow / p[0], 0.3, 1) : 0.6;
  return (m: number) => {
    const hz = fc.horizons;
    let i = 0;
    while (i < hz.length - 2 && m > hz[i + 1]) i++;
    const f = clamp((m - hz[i]) / (hz[i + 1] - hz[i]), 0, 1);
    return (p[i] + (p[i + 1] - p[i]) * f) * scale;
  };
}

/** Previsión del equipo (se refresca cada minuto). */
export function teamForecast(sess: Session, car: Car): Forecast {
  const k = car.e.knowledge;
  if (!k.fc || Math.abs(sess.wall - k.fcT) > 60) {
    const pts = sess.track.ms.filter((_, i) => i % 4 === 0).map((m) => [m.x / 1000, m.y / 1000] as [number, number]);
    k.fc = forecast(sess.weather, k.quality, sess.rng.fork(), 14, [0, 5, 10, 15, 20, 30], pts);
    k.fcT = sess.wall;
  }
  return k.fc;
}

/** Juego disponible de un compuesto: el más nuevo, o uno usado aprovechable. */
export function pickSet(car: Car, c: Compound, preferNew: boolean): TyreSet | undefined {
  const sets = car.e.sets.filter((s) => s.c === c && !s.returned && !s.punctured && s !== car.tyres);
  if (!sets.length) return undefined;
  sets.sort((a, b) => setWear(a) - setWear(b));
  if (!preferNew) {
    const used = sets.filter((s) => s.laps > 0 && setWear(s) < 0.6);
    if (used.length) return used[0];
  }
  return sets[0];
}

/**
 * Compuesto que toca según el agua y la previsión. null = el actual vale.
 * El muro hace la cuenta: proyecta el agua de los próximos minutos (la de ahora, la lluvia prevista, lo que drena y lo
 * que secan los coches) y compara, con cada tipo de neumático, lo que se perdería por vuelta, lo que cuesta la parada
 * (y la de volver, si la pista va a cambiar otra vez) y el riesgo de ir con el neumático equivocado. Cada equipo lee
 * el agua con su error, se fía de su meteorólogo y tiene su carácter (unos se adelantan y otros apuran).
 */
function weatherCall(sess: Session, car: Car): Compound | null {
  const k = car.e.knowledge;
  const cur = car.tyres!.c;
  const isDry = DRY.includes(cur);
  const now = sess.avgWater() * sess.rng.logn(0.15);
  const fc = teamForecast(sess, car);
  const rainNow = sess.rainOnTrack();
  // en seco y sin nada a la vista no hay nada que pensar
  if (isDry && now < 0.02 && rainNow < 0.2 && Math.max(fc.prob[1], fc.prob[2]) < 0.35) return null;
  const done = sess.lapsDone(car) + 1;
  const left = sess.laps - done;
  if (left < 1) return null;
  const lapMin = sess.lapRefRace / 60;
  const H = Math.round(clamp(left * lapMin * 1.15, 3, 24)); // minutos que se miran
  const rainAtMin = rainCurve(fc, rainNow);
  const water = sess.projectWater(now, rainAtMin, H);
  // carácter del equipo: los que tardan en poner intermedios ven «menos agua»; los que tardan en quitarlos, más
  const bias = isDry ? Math.pow(WET.si / k.wetIn, 0.5) : Math.pow((WET.si * 0.75) / k.wetOut, 0.5);
  const tT = sess.weather.trackT;
  const gRef = steadyGrip("M", 0, tT);
  const avail = availableSets(car);
  // el seco que se pondría: el que lleva, o el que toca por las vueltas que quedan. Antes se comparaba siempre con el
  // medio, y con poca agua el blando agarra bastante más (el cruce blando-intermedio está en ~0,24 mm, el del medio
  // en ~0,16): con una llovizna de 0,15-0,20 la cuenta salía a favor de intermedios cuando lo bueno era el blando
  const pref: Compound[] = left < 18 ? ["S", "M", "H"] : left < 32 ? ["M", "S", "H"] : ["H", "M", "S"];
  const dryC: Compound = isDry ? cur : pref.find((c) => avail[c].length) ?? "M";
  const kindOf = (c: Compound): Compound => (DRY.includes(c) ? dryC : c);
  // solo se cuenta con lo que hay en el garaje: sin intermedios, la alternativa no es «el de lluvia» sin más
  const kinds = [dryC, "I", "W"].filter((c) => c === kindOf(cur) || avail[c as Compound].length > 0) as Compound[];
  const lapLoss = (c: Compound, w: number, wear = 0) => {
    const g = steadyGrip(c, w, tT) * wearGrip(c, wear), best = Math.max(...kinds.map((x) => steadyGrip(x, w, tT)));
    // tiempo que se pierde frente a la pista seca, más el riesgo de irse fuera si el neumático no es el de esa agua
    return Math.min(45, (1 - g / gRef) * 100 * sess.secPerGrip) + Math.max(0, 0.92 - g / best) * 45;
  };
  const bestAt = (w: number) => kinds.reduce((b, x) => (steadyGrip(x, w, tT) > steadyGrip(b, w, tT) ? x : b));
  const stopT = pitLoss(sess) + car.team.boxes + 1;
  const stop = stopT * (sess.flag === "sc" || sess.flag === "sc_in" ? pitLossUnder(sess, "sc") : sess.flag === "vsc" ? pitLossUnder(sess, "vsc") : 1);
  const beyond = left * lapMin > H + 2; // queda carrera después de lo que se mira
  const endBest = bestAt(water[water.length - 1] * bias);
  // el juego con el que se haría cada tipo (el montado, o el menos gastado del garaje) y lo que se gasta por minuto
  // con esa agua: un intermedio usado o uno de lluvia con poca agua se deshacen en pocas vueltas, y eso es otra parada
  const perMin = (c: Compound, w: number) => (COMPOUNDS[c].wear * k.hidden.wearMult[c] * sess.track.abrasiveness * waterWear(c, w)) / lapMin;
  const total = (c: Compound) => {
    const same = c === kindOf(cur);
    let t = same ? 0 : stop;
    let wear = same ? setWear(car.tyres!) : setWear(avail[c][0]);
    let extra = 0;
    for (const w of water) {
      t += lapLoss(c, w * bias, wear) / lapMin;
      wear += perMin(c, w * bias);
      // se acaba antes de que acabe el tramo (o la carrera): habrá que poner otro juego
      if (wear > 0.9) { extra++; wear = 0.15; }
    }
    t += extra * stopT;
    // si al final del tramo ese neumático ya no es el bueno, habrá que parar otra vez
    if (beyond && endBest !== c && lapLoss(c, water[water.length - 1] * bias) - lapLoss(endBest, water[water.length - 1] * bias) > 1.5) t += stopT;
    return t;
  };
  const stay = total(kindOf(cur));
  let best: Compound = kindOf(cur), bestT = stay;
  for (const c of kinds) { const t = total(c); if (t < bestT - 1e-6) { bestT = t; best = c; } }
  if (best === kindOf(cur)) return null;
  // margen para no cambiar por nada (más si acaba de parar, evita el ping-pong en chubascos) y algo de duda según el muro
  const margin = (car.lastPitLap >= done - 4 ? 12 : 5.5) + Math.abs(sess.rng.gauss(0, (100 - k.strategy) / 12));
  if (stay - bestT < margin) return null;
  // parar ahora solo si el otro neumático ya va a ser claramente más rápido en las dos primeras vueltas con él
  const soon = Math.min(water.length, Math.max(2, Math.ceil(lapMin * 2.2)));
  const wCur = setWear(car.tyres!), wNew = setWear(avail[best][0]);
  let dSoon = 0;
  for (let m = 1; m < soon; m++) dSoon += lapLoss(kindOf(cur), water[m] * bias, wCur) - lapLoss(best, water[m] * bias, wNew);
  if (dSoon <= 0.5) return null;
  return best;
}

/** Edad equivalente (vueltas) del juego montado según el perfil que cree el equipo. */
function tyreAge(sess: Session, car: Car, k: TeamKnowledge): number {
  if (!car.tyres) return 0;
  const p = stintProfile(sess, car, k, car.tyres.c);
  const w = setWear(car.tyres);
  let a = 0;
  while (a < MAX_AGE - 1 && p.wear[a] < w) a++;
  return a;
}

export function ruleSatisfied(car: Car): boolean {
  const u = car.usedCompounds;
  if (u.has("I") || u.has("W")) return true;
  return [...u].filter((c) => DRY.includes(c)).length >= 2;
}

/**
 * Intermedios o de lluvia gastados: antes la IA no paraba nunca con ellos por desgaste y acababa pinchando (por
 * encima del 96 %). Con el ritmo de desgaste de este stint se mira si llega a la meta; si no, para antes de que
 * pinche, con el juego menos gastado que le quede del mismo tipo (aunque sea usado), el otro de agua, o slicks si
 * ya no hay agua para tanto.
 */
function wetWearCall(sess: Session, car: Car, left: number, adviceOnly: boolean): string | null {
  const t = car.tyres!;
  const w = setWear(t);
  const n = t.laps - car.stintL0;
  const rate = n >= 2 ? Math.max(0.004, (w - car.stintW0) / n) : COMPOUNDS[t.c].wear;
  // llega a meta sin pinchar (con algo de margen): no se toca
  if (w + rate * left < 0.93) return null;
  // aún le quedan vueltas: se para cuando entre en la zona de riesgo (o un poco antes, si gasta mucho)
  if (w < 0.84 && w + rate * 2 < 0.92) return null;
  const water = sess.avgWater();
  const tT = sess.weather.trackT;
  // el recambio: el juego que más agarre vaya a dar con esta agua, contando lo gastado que está. Antes se probaba en
  // orden fijo (el mismo tipo, el otro de agua, slicks) y con una llovizna de 0,15-0,20 mm tras un fin de semana mojado
  // salían intermedios usados que duraban cuatro vueltas o, peor, de lluvia, que sin agua se deshacen: blandos y aguantar
  const avail = availableSets(car);
  const dryPref: Compound[] = left < 18 ? ["S", "M", "H"] : left < 32 ? ["M", "S", "H"] : ["H", "M", "S"];
  const cands: Compound[] = [t.c, t.c === "I" ? "W" : "I", ...dryPref];
  let set: TyreSet | undefined;
  let bestG = 0;
  for (const c of cands) {
    if (c === "W" && water < WET.iw * 0.6) continue; // sin agua bastante, se recalienta y se deshace
    if (c === "I" && water < WET.si * 0.5) continue;
    if (DRY.includes(c) && water > WET.si * 1.5) continue;
    const s = avail[c][0];
    // que el cambio merezca la pena: un juego con bastante más goma que el que lleva
    if (!s || setWear(s) >= Math.min(0.7, w - 0.2)) continue;
    const g = steadyGrip(c, water, tT) * wearGrip(c, setWear(s) + 0.5 * COMPOUNDS[c].wear * waterWear(c, water) * Math.min(left, 10));
    if (g > bestG + 1e-9) { bestG = g; set = s; }
  }
  if (!set) return null;
  if (adviceOnly) { car.adviceWhy = "los neumáticos de agua están al límite: si seguimos, pinchamos"; return set.id; }
  car.pitRequest = set.id;
  car.pitWhy = `desgaste agua v${sess.lapsDone(car) + 1} ${t.c}${t.laps}→${set.c}`;
  if (DRY.includes(set.c)) car.plan = { stints: [...car.plan.stints.slice(0, car.stops + 1), { c: set.c, endLap: sess.laps }] };
  return set.id;
}

/** Decisión de la IA al final de la vuelta. Devuelve el juego si para. */
export function aiDecide(sess: Session, car: Car, adviceOnly = false): string | null {
  if (car.loc !== "track" || sess.chequered || !car.tyres) return null;
  const done = sess.lapsDone(car) + 1;
  const total = sess.laps;
  const left = total - done;
  if (left < 1 || car.pitRequest) return null;
  const decideC = (c: Compound) => {
    // sin intermedios, el de lluvia solo si hay agua para él: con poca se recalienta y se deshace en unas vueltas
    const alt: Compound | null = c === "I" ? (sess.avgWater() > WET.iw * 0.6 ? "W" : null) : c === "W" ? "I" : "M";
    const set = sess.bestSetFor(car, c) ?? (alt ? sess.bestSetFor(car, alt) : undefined);
    if (!set) return null;
    if (!adviceOnly) { car.pitRequest = set.id; car.pitWhy = `clima v${done} ${car.tyres!.c}${car.tyres!.laps}→${set.c} agua ${sess.avgWater().toFixed(2)}`; }
    return set.id;
  };
  const wc = weatherCall(sess, car);
  if (adviceOnly) car.adviceWhy = undefined;
  if (wc && wc !== car.tyres.c) {
    if (adviceOnly) car.adviceWhy = DRY.includes(wc) ? "la pista ya está para slicks" : wc === "W" ? "hay demasiada agua para lo que llevamos" : "viene agua y los slicks no van a aguantar";
    if (!adviceOnly && DRY.includes(wc)) car.plan = { stints: [...car.plan.stints.slice(0, car.stops + 1), { c: wc, endLap: total }] };
    return decideC(wc);
  }
  if (!DRY.includes(car.tyres.c)) return wetWearCall(sess, car, left, adviceOnly);
  if (left < 2) return null;

  const k = car.e.knowledge;
  const cur = car.tyres.c;
  const wear = setWear(car.tyres) + sess.rng.gauss(0, 0.012);
  const stopsLeft = car.plan.stints.length - 1 - car.stops;
  const needRule = sess.kind === "RACE" && !ruleSatisfied(car);
  const fresh = car.tyres.laps < 10 || car.lastPitLap >= done - 8;

  // aprende en carrera: compara el desgaste de ESTE stint con el que esperaba y replanifica
  const n = car.tyres.laps - car.stintL0;
  if (n >= 4 && done - car.learnedLap >= 3 && !adviceOnly) {
    const p = stintProfile(sess, car, k, cur);
    let a0 = 0;
    while (a0 < MAX_AGE - 1 && p.wear[a0] < car.stintW0) a0++;
    const predInc = p.wear[Math.min(a0 + n, MAX_AGE - 1)] - (a0 > 0 ? p.wear[a0 - 1] : 0);
    const ratio = (wear - car.stintW0) / Math.max(0.01, predInc);
    car.learnedLap = done;
    if (Math.abs(ratio - 1) > 0.12) {
      const f = Math.pow(ratio, 0.5);
      for (const c of DRY) k.hidden.wearMult[c] *= c === cur ? f : Math.pow(f, 0.5);
      k.profile = {};
      const re = planStrategy(sess, car, k, done - 1, cur, a0 + n, null);
      car.plan = { stints: [...car.plan.stints.slice(0, car.stops), ...re.stints] };
    }
  }
  const stint = car.plan.stints[car.stops] ?? car.plan.stints[car.plan.stints.length - 1];
  const plannedEnd = stint?.endLap ?? total;
  const anyDry = DRY.some((c) => availableSets(car)[c].length > 0);

  // lo listo que es el muro: los buenos ven la jugada casi siempre; los flojos, a veces una vuelta tarde
  const sharp = clamp(0.5 + (k.strategy - 60) / 70, 0.3, 0.95);
  const lossGreen = pitLoss(sess) + car.team.boxes + 1.0;
  const sp = COMPOUNDS[cur];
  const age = tyreAge(sess, car, k);
  const prof = stintProfile(sess, car, k, cur);
  const next = car.plan.stints[car.stops + 1];
  // lo que se gana por vuelta con el juego nuevo frente al que lleva (ya descontado calentarlo)
  const freshGain = () => {
    if (!next) return 0;
    const pn = stintProfile(sess, car, k, next.c);
    return prof.dt[Math.min(MAX_AGE - 1, age + 1)] - pn.dt[1] - WARM_UP[next.c];
  };
  // ¿aguanta el siguiente juego si se monta ya? (parar antes alarga lo que queda)
  const nextLasts = () => {
    if (!next) return false;
    const pn = stintProfile(sess, car, k, next.c);
    const n2 = (next.endLap ?? total) - done;
    return n2 < MAX_AGE && pn.wear[Math.max(0, n2 - 1)] < COMPOUNDS[next.c].cliff + 0.03;
  };
  const ord = sess.order();
  const me = ord.indexOf(car);
  const rival = (o: Car) => o !== car && o.loc === "track" && sess.lapsDone(o) === sess.lapsDone(car);
  // tráfico al volver: coches que ahora van por detrás y que quedarían justo delante al salir de boxes
  const traffic = (loss: number) => {
    let cost = 0;
    for (let j = me + 1; j < ord.length; j++) {
      const o = ord[j];
      if (o.loc !== "track") continue;
      const g = sess.gapBetween(car, o);
      if (g > loss + 0.5) break;
      // los que aún tienen que parar y van con gomas viejas se quitan solos o se les pasa pronto
      if (g > loss - 3 && g > 0) cost += 0.6 * sess.passHard * (o.tyres && o.tyres.laps > 12 && o.stops <= car.stops ? 0.5 : 1);
    }
    return cost;
  };
  const mate = sess.cars.find((o) => o !== car && o.team === car.team && o.loc === "track");
  // doble parada: si el compañero va justo delante y también entra, hay que esperar a que le acaben
  const stack = mate && mate.pitRequest && mate.s > car.s ? Math.max(0, car.team.boxes + 2.5 - sess.gapBetween(mate, car)) : 0;

  let box = false;
  let why = "";
  let say = ""; // la razón, dicha para el jugador
  if (wear > 0.9 && left > 2) { box = true; why = "desgaste"; say = "los neumáticos no dan más"; }
  if (stopsLeft > 0 && done >= plannedEnd) {
    const worn = box; // ya se para por desgaste: eso manda
    if (!worn) { box = true; why = "plan"; say = needRule ? "es la vuelta prevista y aún falta el segundo compuesto" : "es la vuelta prevista"; }
    // el plan puede haberse quedado viejo: el jugador no paró cuando tocaba (la parada sigue "pendiente" vueltas
    // después) o quedan ya pocas vueltas. Antes se pedía parar igual, aunque fuera a 4 del final con gomas que
    // llegan de sobra. Se hace la cuenta: si seguir (con lo que haga falta después) sale mejor que parar ya, no se para
    const stale = adviceOnly || done > plannedEnd || left <= 12;
    if (stale && !needRule && !worn) {
      const stay = enumeratePlans(sess, car, k, done, cur, age, 0)[0];
      const pit = enumeratePlans(sess, car, k, done, null, 0, 0, true)[0];
      if (stay && pit && stay.total! <= pit.total! + lossGreen + sess.trafficCost) {
        box = false; why = ""; say = "";
        // las gomas llegan: el plan pasa a ser seguir así (para no volver a pedirlo cada vuelta)
        if (!adviceOnly) car.plan = { stints: [...car.plan.stints.slice(0, car.stops), ...stay.stints] };
      }
    }
    // la ventana está abierta, pero saldría en mitad de un grupo o tendría que esperar al compañero: si las gomas
    // aguantan, una vuelta más (los muros buenos lo ven; no se alarga más de tres vueltas)
    const hold = car.plan.hold ?? 0;
    const tr = traffic(lossGreen);
    if (!adviceOnly && hold < 3 && wear < sp.cliff - 0.04 && (tr > 2 || stack > 1.5) && sess.flag === "green" && left > 6 && sess.rng.chance(sharp)) {
      box = false; why = "";
      car.plan.hold = hold + 1;
    }
  }
  // gomas hundidas con carrera por delante: se hace la cuenta de parar ya frente a seguir
  if (!box && sess.flag === "green" && wear > sp.cliff + 0.02 && left > 4 && !fresh && anyDry) {
    const stay = enumeratePlans(sess, car, k, done, cur, age, 0)[0];
    const pit = enumeratePlans(sess, car, k, done, null, 0, 0, true)[0];
    if (stay && pit && stay.total! - (pit.total! + lossGreen + sess.trafficCost) > 2) { box = true; why = "gomas acabadas"; say = "con estas gomas perdemos más que parando"; }
  }
  // alerón dañado: lo que se pierde por vuelta hasta la parada prevista (o hasta el final, si no hay más) frente a
  // adelantar la parada o hacer una de más para cambiar el morro
  if (!box && car.wing > 0.008 && left > 3 && anyDry && sess.flag !== "red") {
    const perLap = sess.wingLoss(car);
    const gain = stopsLeft > 0 ? perLap * Math.max(0, plannedEnd - done) - 3 : perLap * left - (lossGreen + NOSE_TIME + sess.trafficCost);
    if (gain > 2 && sess.rng.chance(sharp)) { box = true; why = "alerón"; say = `con el alerón dañado perdemos ${perLap.toFixed(1)} s por vuelta`; }
  }
  // neutralización: la parada cuesta la mitad. Se compara parar ahora con seguir con el plan (con lo que cree
  // saber el equipo de sus neumáticos), contando los puestos que se pierden en pista y la cola en el box
  if ((sess.flag === "sc" || sess.flag === "vsc") && left > 3 && !fresh && anyDry && !box) {
    const lossNow = lossGreen * pitLossUnder(sess, sess.flag) + stack;
    const stay = enumeratePlans(sess, car, k, done, cur, age, 0)[0];
    const pit = enumeratePlans(sess, car, k, done, null, 0, 0, true)[0];
    if (stay && pit) {
      let behind = 0;
      for (let j = me + 1; j < ord.length; j++) { const o = ord[j]; if (o.loc === "track" && sess.gapBetween(car, o) < lossNow) behind++; }
      // más o menos la mitad de los de detrás se quedará fuera; recuperar cada puesto cuesta según el circuito
      const posCost = 0.5 * behind * 0.7 * sess.passHard;
      const gain = stay.total! - (pit.total! + lossNow + posCost) + sess.rng.gauss(0, (1 - sharp) * 5);
      if (gain > 1.5 && sess.rng.chance(0.55 + 0.45 * sharp)) { box = true; why = `${sess.flag === "sc" ? "SC" : "VSC"} (+${gain.toFixed(0)} s)`; say = `con el coche de seguridad${sess.flag === "vsc" ? " virtual" : ""} la parada sale barata`; }
    }
    if (!box && needRule && left < 25) { box = true; why = "SC regla"; say = "falta el segundo compuesto y ahora la parada sale barata"; }
  }
  if (sess.flag === "green" && stopsLeft > 0 && !box && !fresh) {
    const early = plannedEnd - done;
    // defensa: uno que venía pegado ha parado la vuelta pasada. Si aún se le puede salir por delante, se cubre;
    // si ya ha ganado la posición, mejor alargar y buscarle luego con gomas más nuevas
    if (early <= 7) {
      for (const o of sess.cars) {
        if (!rival(o) || o.stops !== car.stops + 1 || o.lastPitLap < done - 2 || o.s > car.s) continue;
        const eff = sess.gapBetween(car, o) - lossGreen; // lo que le quedaría de ventaja si para ahora
        if (eff < -1.5 || eff > 3.5) continue;
        if (!sess.rng.chance(sharp)) break;
        if (eff > 0.4 + freshGain()) { box = true; why = "cubrir undercut"; say = `${o.d.abrev} acaba de parar y nos puede pasar en boxes: hay que cubrirle`; }
        else if (!adviceOnly && wear < sp.cliff - 0.08 && plannedEnd - done < 4 && plannedEnd + 3 < total - 4) {
          // ya está perdida: tres o cuatro vueltas más para tener gomas mejores que él al final
          car.plan.stints[car.stops] = { ...car.plan.stints[car.stops], endLap: done + 4 };
        }
        break;
      }
    }
    // ataque: atascado detrás de uno al que no se pasa en pista y con la parada cerca: se adelanta en boxes
    if (!box && early >= 1 && early <= 5 && car.aheadId >= 0 && nextLasts()) {
      const a = sess.carById(car.aheadId);
      const g = sess.gapBetween(a, car);
      const fg = freshGain();
      if (rival(a) && a.stops === car.stops && !a.pitRequest && g < 1.6 && (car.stuck?.n ?? 0) >= 1 && fg > 0.5 && g < fg * 2.2 + 0.3 && traffic(lossGreen) < 1.6 && stack < 0.5 && sess.rng.chance(0.25 + 0.6 * sharp)) { box = true; why = "undercut"; say = `no pasamos a ${a.d.abrev} en pista: podemos ganarle el puesto en boxes`; }
    }
    // prioridad del de delante: con un rival de su vuelta a tiro de undercut detrás, con gomas de la misma edad (le
    // toca parar como a él) y la ventana abierta, el muro no espera a que pare el otro: para primero. Esperar a
    // reaccionar no sirve, porque el undercut de una vuelta vale ~2 s (banco de auditoría) y el rival suele ir
    // a menos de eso. Sin esto, la pole solo acababa delante de su compañero en dos de cada tres carreras (en 2026,
    // 17 de 18): casi todos los que le ganaban en boxes habían parado antes.
    if (!box && early >= 1 && early <= 3 && nextLasts() && traffic(lossGreen) < 1.6 && stack < 0.5) {
      const b = ord[me + 1];
      const threat = clamp(2 * freshGain() + 0.5, 1, 4);
      if (b && rival(b) && b.team !== car.team && b.stops === car.stops && !b.pitRequest && (b.tyres?.laps ?? 0) >= car.tyres.laps - 4 && sess.gapBetween(car, b) < threat && sess.rng.chance(0.6 * sharp)) {
        box = true; why = "cubrir"; say = `${b.d.abrev} viene a ${sess.gapBetween(car, b).toFixed(1)} s y nos puede hacer el undercut: paramos antes que él`;
      }
    }
  }
  if (needRule && left <= 6 && !fresh) { box = true; why = "regla"; say = "falta el segundo compuesto"; }
  if (!box || !anyDry) return null;
  if (adviceOnly) car.adviceWhy = say;

  const fc = teamForecast(sess, car);
  if (Math.max(fc.prob[1], fc.prob[2], fc.prob[3]) > 0.55) {
    // con un poco de humedad los slicks aún van mejor: los intermedios, solo si el agua ya está cerca del cruce
    if (sess.avgWater() > WET.si * 0.8 && availableSets(car).I.length) return decideC("I");
    // se espera a la lluvia salvo que sea la última ocasión de cumplir la regla de los dos compuestos: si el agua no
    // llega a tiempo, sin esa parada el coche acabaría descalificado
    if (wear < 0.86 && why !== "regla") return null;
  }
  // si hay un siguiente stint planificado, se sigue el plan (solo cambia el momento)
  const nextPlanned = car.plan.stints[car.stops + 1];
  if (nextPlanned && why !== "desgaste" && why !== "regla") {
    const avail = availableSets(car)[nextPlanned.c];
    const set = avail.find((x) => x.id === nextPlanned.setId) ?? avail[0];
    if (set) {
      if (!adviceOnly) {
        car.plan.stints[car.stops] = { ...car.plan.stints[car.stops], endLap: done };
        car.plan.stints[car.stops + 1] = { ...nextPlanned, setId: set.id };
        car.pitRequest = set.id;
        car.plan.hold = 0;
        car.pitWhy = `${why} v${done} ${cur}${car.tyres.laps}→${car.plan.stints.slice(car.stops + 1).map((x) => x.c + x.endLap).join(" ")}`;
      }
      return set.id;
    }
  }
  const plan = planStrategy(sess, car, k, done, null, 0, null, true);
  let nextC = plan.stints[0].c;
  if (needRule && nextC === cur && plan.stints.length === 1) nextC = DRY.find((c) => c !== cur && availableSets(car)[c].length) ?? nextC;
  const id = plan.stints[0].setId && plan.stints[0].c === nextC ? plan.stints[0].setId : sess.bestSetFor(car, nextC)?.id;
  if (!id) return null;
  if (!adviceOnly) {
    const past = car.plan.stints.slice(0, car.stops + 1).map((x, j) => (j === car.stops ? { ...x, endLap: done } : x));
    car.plan = { stints: [...past, ...plan.stints] };
    car.pitRequest = id;
    car.pitWhy = `${why}* v${done} ${cur}${car.tyres.laps}→${plan.stints.map((x) => x.c + x.endLap).join(" ")}`;
  }
  return id;
}

/** Desgaste relativo de cada modo de ritmo (PUSH_ENERGY^1,6, el mismo exponente que usa tyres.ts). */
const PUSH_WEAR = [0.74, 0.87, 1, 1.12, 1.25].map((x) => Math.pow(x, 1.6));

/**
 * Modos de ritmo y motor de la IA, una vez por vuelta. Decide como un piloto con su ingeniero:
 * cuánto puede gastar (para que las gomas lleguen a la parada prevista y el combustible a la meta) y cuánto
 * le interesa gastar (atacar, defenderse, la vuelta de entrada y las de después de parar, el final de carrera);
 * y si lleva vueltas pegado a uno al que no pasa, se descuelga un par de vueltas para enfriar las gomas.
 */
export function aiModes(sess: Session, car: Car, left: number) {
  if (!car.tyres) return;
  const fuelLaps = car.fuel / sess.fuelLap(car);
  const sp = COMPOUNDS[car.tyres.c];
  const wear = setWear(car.tyres);
  const stint = car.plan.stints[car.stops];
  const done = sess.lapsDone(car) + 1;
  const toEnd = car.pitRequest ? 0 : Math.max(0, (stint?.endLap ?? sess.laps) - done);
  const sameLap = (o: Car) => o.loc === "track" && Math.abs(o.s - car.s) < sess.L * 0.5;
  const ahead = car.aheadId >= 0 ? sess.carById(car.aheadId) : null;
  const gapA = ahead && sameLap(ahead) ? car.followGap : 99;
  const gapB = car.chased ?? 99;

  // --- lo que le interesa
  let want = 2;
  const cooling = car.coolUntil !== undefined && done <= car.coolUntil;
  if (gapA < 1.3 && !cooling) want = 3;
  // el de delante se defiende con el mismo margen con el que ataca el de detrás (antes, a 1,0 s): si no, entre 1,0 y
  // 1,3 s el de detrás iba en Atacar y el de delante en Normal, y era lo que más adelantamientos al líder daba
  if (gapB < 1.3) want = Math.max(want, 3);
  // pelea de boxes: alguien de su zona ha parado hace nada (o acaba de parar él): esas vueltas valen puestos
  if (car.lastPitLap >= done - 3 && car.stops > 0) want = Math.max(want, 3);
  else if (sess.flag === "green") {
    for (const o of sess.cars) {
      if (o === car || o.loc !== "track" || o.stops !== car.stops + 1 || o.lastPitLap < done - 3) continue;
      const eff = sess.gapBetween(car, o) - (pitLoss(sess) + car.team.boxes + 1);
      if (eff > -4 && eff < 5) { want = Math.max(want, 3); break; }
    }
  }
  if (left <= 4) want = Math.max(want, 3);
  if (car.pitRequest || left <= 1) want = 4; // estas gomas ya no hacen falta
  // lleva vueltas detrás del mismo sin pasarle y aún queda tanda: a enfriar dos vueltas y volver a por él
  if (!cooling && (car.stuck?.n ?? 0) >= 4 && toEnd > 6 && gapB > 1.5 && sess.rng.chance(0.5)) { car.coolUntil = done + 2; car.stuck = undefined; want = 1; }
  if (cooling && gapB > 1.2) want = 1;

  // --- lo que se puede permitir: el ritmo más alto con el que las gomas llegan al final de la tanda
  let cap = 4;
  const n = car.tyres.laps - car.stintL0;
  if (toEnd > 0 && DRY.includes(car.tyres.c)) {
    const rate = n >= 3 ? ((wear - car.stintW0) / n) / PUSH_WEAR[car.push] : COMPOUNDS[car.tyres.c].wear * 0.9;
    const limit = sp.cliff - (toEnd > 8 ? 0.03 : 0);
    while (cap > 0 && wear + rate * PUSH_WEAR[cap] * toEnd > limit) cap--;
    // a un par de vueltas de parar, lo que quede se puede gastar
    if (toEnd <= 2 && wear < sp.cliff) cap = Math.max(cap, 3);
  }
  // la telemetría ve la banda pasada de temperatura o el piloto ya nota ampollas: a cuidar, que son para siempre
  const feel = car.tyreFeel;
  if (feel && feel.set === car.tyres.id && toEnd > 2 && (feel.risk.some(Boolean) || feel.blister.some((b) => b > 0))) cap = Math.min(cap, 1);
  let push = Math.min(want, cap);
  // con las gomas justas y nadie cerca no se regala nada; pero defendiendo posición se aguanta el ritmo normal
  if (cap < 2 && (gapB < 0.8 || gapA < 0.8) && toEnd <= 10) push = Math.max(push, Math.min(2, cap + 1));
  if (fuelLaps < left + 0.3) push = Math.min(push, 1);
  if (fuelLaps < left - 0.5) push = 0;
  // una avería que avisa: a cuidarla para llegar (motor en Ahorro y levantando)
  if (car.fault) push = Math.min(push, car.fault.lvl > 0.7 ? 0 : 1);
  if (!car.player || car.autoPush || sess.autoPlayers) car.push = push;
  if (!car.player || sess.autoPlayers) {
    // motor: a tope solo en plena pelea y con combustible de sobra (castiga la fiabilidad)
    const fight = (gapA < 0.7 && !cooling) || gapB < 0.7;
    car.engine = fuelLaps < left - 0.3 ? 0 : fight && fuelLaps > left + 0.8 && sess.flag === "green" ? 2 : 1;
    if (car.fault) car.engine = 0;
  }
  // órdenes de equipo: si el compañero viene pegado y es claramente más rápido (otra estrategia, gomas mucho más
  // nuevas), el equipo le abre paso en vez de dejar que se estorben. En tu equipo lo decides tú.
  if (!car.player && car.stuck && car.stuck.n >= 2 && ahead && ahead.team === car.team && ahead.letPass !== car.id && sess.flag === "green") {
    const faster = sess.estLap(ahead) - sess.estLap(car);
    const fresher = (ahead.tyres?.laps ?? 0) - car.tyres.laps;
    if ((faster > 0.45 || (fresher >= 8 && faster > 0.15)) && sess.rng.chance(0.4 + car.team.estrategia / 250)) ahead.letPass = car.id;
  }
}

/** Batería: se decide en cada minisector. */
export function aiErs(sess: Session, car: Car) {
  if (car.player && !car.autoErs) return;
  const ph = car.run?.phase;
  if (ph === "out" || ph === "cool" || ph === "in") { car.ers = 0; return; }
  if (ph === "push") { car.ers = car.soc > 0.8 ? 2 : 1; return; }
  const attacking = car.followGap < 0.9 && car.aheadId >= 0 && !(car.coolUntil !== undefined && sess.lapsDone(car) < car.coolUntil);
  const defending = (car.chased ?? 99) < 0.8;
  // la batería sube y baja dentro de la vuelta: el modo se decide con la media reciente
  const soc = car.socAvg ?? car.soc;
  if (soc < 0.6) car.ers = 0;
  else if (attacking && soc > 1.2) car.ers = car.followGap < 0.5 ? 3 : 2;
  // defenderse también gasta: sin batería en la recta, el modo adelantamiento del otro no tiene respuesta
  else if (defending && soc > 1.0) car.ers = soc > 2 ? 2 : 1;
  else if (soc < 2.2) car.ers = 0;
  else if (soc > 3.6) car.ers = 2;
  else car.ers = 1;
}

// ------------------------------------------------------------------ libres
const QUALI_FUEL = 10;

/** Cuántos blandos nuevos hay que guardar para la clasificación. */
function reserveSoft(sess: Session) {
  return sess.sprintWeekend ? 3 : 4;
}

function setForPractice(sess: Session, car: Car, c: Compound): TyreSet | undefined {
  const avail = (x: Compound) => car.e.sets.filter((s) => s.c === x && !s.returned && !s.punctured);
  const sets = avail(c);
  const fresh = sets.filter((s) => s.laps === 0);
  const usedOk = sets.filter((s) => s.laps > 0 && setWear(s) < 0.55).sort((a, b) => setWear(a) - setWear(b));
  if (c === "S") return fresh.length > reserveSoft(sess) ? fresh[0] : usedOk[0];
  // en finde normal hay que devolver 6 juegos tras libres y llegar a carrera con ≥3 M+H (≥1 M y ≥1 H)
  const freshM = avail("M").filter((s) => s.laps === 0).length;
  const freshH = avail("H").filter((s) => s.laps === 0).length;
  if (c === "M") {
    if (usedOk.length) return usedOk[0];
    if (sess.sprintWeekend) return freshM > 3 ? fresh[0] : undefined;
    return freshM > 1 && freshM + freshH > 3 ? fresh[0] : undefined;
  }
  if (c === "H") {
    if (usedOk.length) return usedOk[0];
    return !sess.sprintWeekend && freshH > 1 && freshM + freshH > 3 ? fresh[0] : undefined;
  }
  return usedOk[0] ?? fresh[0];
}

/** Prepara una tanda. Para el jugador, setId fuerza un juego concreto. */
export function makeRun(sess: Session, car: Car, kind: Run["kind"], c: Compound, laps: number, at = 0, setId?: string): Run | null {
  const set = setId ? car.e.sets.find((s) => s.id === setId) : kind === "quali" ? pickSet(car, c, true) : setForPractice(sess, car, c) ?? (kind === "long" ? pickSet(car, c, false) : undefined);
  if (!set) return null;
  const fuel = kind === "long" ? Math.min(75, 12 + laps * sess.fuelPerLap * 1.1 + 25) : kind === "inst" ? 20 : kind === "test" ? 12 + laps * sess.fuelPerLap * 1.1 + 8 : QUALI_FUEL + laps * 2 * sess.fuelPerLap;
  return { kind, setId: set.id, pushLaps: laps, fuel, at };
}

/** Programa de libres de la IA. */
export function practiceProgram(sess: Session, car: Car): Run[] {
  const r = sess.rng;
  const runs: Run[] = [];
  const add = (kind: Run["kind"], c: Compound, laps: number, atMin: number) => {
    const run = makeRun(sess, car, kind, c, laps, atMin * 60);
    if (run) runs.push(run);
  };
  // Lo de un equipo de verdad en una hora: vueltas de instalación, salidas cortas con medio para los reglajes, tandas
  // de clasificación con blando y tandas largas con el depósito lleno; cada uno con su orden y su número de salidas.
  // (Antes, 15 / 15 / 6 vueltas por piloto y los 22 con el mismo programa en los libres 3; en la F1 real, ~25 / ~28 / ~18.)
  const other = (c: Compound): Compound => (c === "M" ? (r.chance(0.6) ? "S" : "H") : "M");
  if (sess.kind === "FP1") {
    add("inst", "M", 1, r.range(0, 4));
    add("qsim", "M", r.int(2, 3), r.range(6, 12)); // reglajes
    const lc: Compound = r.chance(0.55) ? "M" : r.chance(0.6) ? "H" : "S";
    add("long", lc, r.int(9, 13), r.range(16, 26));
    add("qsim", "S", 2, r.range(34, 42));
    if (r.chance(0.55)) add("long", other(lc), r.int(4, 7), r.range(45, 51));
  } else if (sess.kind === "FP2") {
    if (r.chance(0.5)) add("qsim", "M", 2, r.range(1, 5)); // reglajes
    add("qsim", "S", 2, r.range(6, 12));
    if (r.chance(0.5)) add("qsim", "S", r.int(1, 2), r.range(14, 20));
    const lc: Compound = r.chance(0.5) ? "S" : "M";
    add("long", lc, r.int(12, 16), r.range(24, 30));
    if (r.chance(0.75)) add("long", other(lc), r.int(6, 9), r.range(44, 49));
  } else {
    add("qsim", "M", r.int(2, 3), r.range(2, 8)); // reglajes
    add("qsim", "S", 2, r.range(12, 20));
    if (r.chance(0.6)) add("long", "M", r.int(5, 7), r.range(24, 32));
    add("qsim", "S", r.int(1, 2), r.range(38, 46));
  }
  // paquete aerodinámico nuevo en tu coche: el programa del viernes cambia tandas largas por pruebas de piezas
  // (en un fin de semana normal, libres 1 y 2; en uno sprint, el único libre)
  if (car.player && sess.pkgTest && sess.pkgTest !== "neumaticos" && (sess.kind === "FP1" || sess.kind === "FP2")) {
    const longs = runs.filter((x) => x.kind === "long");
    const swap = sess.pkgTest === "validar" ? longs : sess.kind === "FP1" ? longs.slice(0, 1) : [];
    for (const x of swap) {
      const t = makeRun(sess, car, "test", "M", Math.min(8, Math.max(5, x.pushLaps)), x.at);
      if (t) runs[runs.indexOf(x)] = t;
    }
  }
  for (let i = 1; i < runs.length; i++) runs[i].at = Math.max(runs[i].at ?? 0, (runs[i - 1].at ?? 0) + 60);
  return runs;
}

/**
 * El equipo se hace cargo del programa de un piloto en libres o clasificación (el jugador pulsa
 * «Auto» o simula hasta el final). La tanda en curso sigue; en libres, si no queda nada
 * programado, se rehace el programa con lo que aún cabe en la sesión.
 */
export function teamTakesOver(sess: Session, car: Car) {
  car.auto = true;
  if (sess.parts.length || !sess.kind.startsWith("FP") || car.queue.length) return;
  const now = sess.partT;
  let runs = practiceProgram(sess, car).filter((r) => (r.at ?? 0) > now);
  if (!runs.length && sess.remaining() > 12 * 60) {
    const extra = makeRun(sess, car, "qsim", "S", 2, now + 30) ?? makeRun(sess, car, "long", "M", 6, now + 30);
    if (extra) runs = [extra];
  }
  car.queue = runs;
}

/**
 * Antes de salir a una tanda programada, el equipo mira la pista y el radar: con pista mojada
 * no sale con slicks. Con mucha agua, o si va a escampar pronto, espera en el garaje; si no,
 * sale unas vueltas con intermedios o de lluvia (sin gastar juegos nuevos a la ligera).
 * Devuelve la tanda a hacer, o cuántos segundos esperar, o null para saltársela.
 */
export function practiceWeather(sess: Session, car: Car, run: Run): { run: Run } | { wait: number } | null {
  const set = car.e.sets.find((s) => s.id === run.setId);
  const water = sess.avgWater() * sess.rng.logn(0.12);
  const rain = sess.maxRainOnTrack();
  const left = sess.remaining();
  const dryRun = !!set && DRY.includes(set.c);
  if (water < WET.si && rain < 1.5) return dryRun ? { run } : null;
  if (!dryRun && water > WET.si * 0.6) return { run };
  if (left < 8 * 60) return null;
  const fc = teamForecast(sess, car);
  const heavy = water > WET.iw * 1.4 || rain > 10;
  const clearingSoon = fc.prob[3] < 0.3 && rain < 1;
  // chaparrón o claro a la vista: mejor esperar (sin pasarse del final de la sesión)
  if ((heavy || (clearingSoon && water < WET.iw)) && sess.rng.chance(heavy ? 0.85 : 0.6) && left > 14 * 60) return { wait: sess.rng.range(180, 420) };
  if (water < WET.si && rain >= 1.5) return { wait: sess.rng.range(120, 240) }; // empieza a llover: a ver cómo queda
  const c: Compound = water > WET.iw * 1.05 ? "W" : "I";
  const sets = car.e.sets.filter((s) => s.c === c && !s.returned && !s.punctured);
  const used = sets.filter((s) => s.laps > 0 && setWear(s) < 0.6).sort((a, b) => setWear(a) - setWear(b))[0];
  const fresh = sets.filter((s) => s.laps === 0);
  // un juego nuevo solo si quedan de sobra para la clasificación y la carrera
  const pick = used ?? (fresh.length > 2 ? fresh[0] : undefined);
  if (!pick) return sess.rng.chance(0.7) ? { wait: sess.rng.range(240, 480) } : null;
  const laps = sess.rng.int(3, 6);
  return { run: { kind: "long", setId: pick.id, pushLaps: laps, fuel: Math.min(60, 12 + laps * sess.fuelPerLap * 1.1 + 15), at: run.at } };
}

/** En pista durante libres o clasificación: ¿hay que volver a boxes por el agua? */
export function wrongTyresForWater(sess: Session, car: Car): boolean {
  if (!car.tyres) return false;
  const water = sess.avgWater();
  if (DRY.includes(car.tyres.c)) return water > WET.si * 1.25;
  return water < WET.si * 0.5 && sess.maxRainOnTrack() < 0.5;
}

// ------------------------------------------------------------- clasificación
/** Coche que pasa de sobra a la última parte: de los diez de más ritmo de la parrilla. */
function strongCar(sess: Session, car: Car): boolean {
  return sess.cars.filter((o) => o.pace > car.pace).length < 10;
}

/** La IA decide cuándo sale a pista en cada parte de la clasificación. */
export function qualiTick(sess: Session, car: Car) {
  const part = sess.parts[sess.part];
  if (!part) return;
  const R = sess.remaining();
  const aw = sess.avgWater();
  const lap = sess.track.refLap * (1.03 + (aw > 0.03 ? Math.min(0.32, 0.06 + aw * 0.14) : 0));
  const outLap = sess.track.pit.laneLength / 2 / sess.track.pit.limit + lap / 0.86;
  if (!car.qPlan || car.qPlan.part !== sess.part) {
    const r = sess.rng;
    const deps: number[] = [];
    const lastDep = outLap + lap + r.range(15, 55);
    // con la pista mojada o lluvia encima se sale cuanto antes: puede ir a peor y hay que tener un tiempo
    const hurry = aw > WET.si * 0.6 || sess.rainOnTrack() > 1;
    if (part.minutes * 60 - lastDep > outLap + lap * 2 + 120) deps.push(part.minutes * 60 - (hurry ? r.range(5, 45) : r.range(50, 200)));
    deps.push(lastDep);
    // con la pista secándose, algún muro prudente sale igualmente pronto a por un tiempo de seguridad
    const banker = hurry && r.chance(0.08 + 0.2 * (1 - car.team.estrategia / 100));
    car.qPlan = { part: sess.part, deps, banker };
  }
  const plan = car.qPlan;
  if (!plan.deps.length) return;
  const fc = teamForecast(sess, car);
  // llega lluvia que va a empeorar la pista (no una llovizna que no impide que se siga secando): a por un tiempo ya
  const urgent = Math.max(fc.prob[1], fc.prob[2]) > 0.6 && aw < 0.3 && (plan.urgentAt !== undefined || rainWorsens(sess, fc, aw));
  // ante la lluvia cada muro reacciona a su ritmo: unos salen ya, otros tardan en decidirse
  if (urgent && plan.urgentAt === undefined) plan.urgentAt = R - sess.rng.range(3, 20) - sess.rng.range(0, 80) * (1.25 - car.team.estrategia / 100);
  if (urgent && R > plan.urgentAt!) return;
  if (!urgent && R > plan.deps[0]) return;
  // pista mojada que se va a secar: se espera en el garaje y se sale una sola vez, al final, con la pista mejor
  if (!urgent && !plan.banker && waitForDrier(sess, car, R, outLap, lap)) {
    plan.deps = [R - sess.rng.range(30, 60)];
    return;
  }
  if (urgent) plan.deps = [];
  else plan.deps.shift();
  const ord = sess.timingOrder().filter((c) => !c.eliminated);
  const pos = ord.indexOf(car);
  const water = sess.avgWater();
  const k = car.e.knowledge;
  const raining = sess.rainOnTrack();
  const wetTrack = water > WET.si * 0.6 || raining > 1;
  const myBest = car.bestByPart[sess.part] ?? Infinity;
  const lastRun = plan.deps.length === 0;
  // en Q1/Q2, si va sobrado, se ahorra la última salida (y un juego). Se mide en tiempo, no en puestos: los de atrás
  // mejorarán con la pista más rápida y el segundo juego, así que hace falta margen sobre el primero que cae.
  // Con la pista cambiando (mojada o secándose) nadie está a salvo.
  let margin = Infinity; // lo que le saca al primer eliminado (s); negativo: está fuera
  if (part.advance !== null && isFinite(myBest)) {
    const cutT = ord[part.advance]?.bestByPart[sess.part] ?? Infinity;
    margin = isFinite(cutT) ? cutT - myBest : pos < part.advance ? Infinity : -1;
  }
  const tight = lap * (0.0055 + 0.004 * (1 - k.strategy / 100));
  // para no volver a salir, además lo que mejorará la pista desde el tiempo del primero que cae: si sale al final, la
  // tendrá más rápida (y con un juego usado no le basta: los de atrás saldrán con uno nuevo)
  // y si el primero que cae marcó su tiempo con un juego usado, lo que ganará con uno nuevo
  const cut = part.advance !== null ? ord[part.advance] : undefined;
  const cutC = cut?.bestTyreByPart[sess.part];
  const tyreGain = cut?.bestEvo?.part === sess.part && cutC && DRY.includes(cutC) ? Math.max(0, wearGrip(cutC, 0.04) - wearGrip(cutC, cut.bestEvo.wear)) : 0;
  const need = tight + lap * (cut ? sess.qualiEvoGain(cut) + 0.9 * tyreGain : 0);
  const timed = ord.filter((c) => isFinite(c.bestByPart[sess.part] ?? Infinity)).length;
  const safe = part.advance !== null && lastRun && !wetTrack && isFinite(myBest) && pos < part.advance - 2 && timed > part.advance + 2 && margin > need;
  if (safe) return;
  if (R < outLap + lap * 0.95) return;
  // con la pista cada vez más mojada no se sale a empeorar: se espera por si escampa
  if (!qualiCanImprove(sess, car, outLap, margin < need)) {
    plan.deps.unshift(R - sess.rng.range(30, 60));
    return;
  }
  // pista secándose: cada equipo se atreve con los slicks a partir de su propio umbral; si aún llueve, nadie
  const drying = raining < 0.3 && Math.max(fc.prob[1], fc.prob[2]) < 0.4;
  const slickAt = drying ? clamp(k.wetOut * 1.35, WET.si * 0.8, WET.si * 1.2) : WET.si;
  let c: Compound = water > WET.iw * 1.05 ? "W" : water > slickAt ? "I" : (part.compound ?? "S");
  // riesgo de caer: 2 fuera del corte (o sin tiempo en la última salida), 1 justo (sin el margen para quedarse en el
  // garaje). Sin tiempo en la primera salida, un coche que pasa de sobra no se da por en peligro: la regla de reserva
  // de qualiSet decide si va con uno usado
  const risk = margin < 0 || (!isFinite(myBest) && (lastRun || !strongCar(sess, car))) ? 2 : margin < need ? 1 : 0;
  let set = qualiSet(sess, car, c, lastRun, risk);
  if (!set && c === "W") { c = "I"; set = qualiSet(sess, car, c, lastRun, 2); }
  if (!set) return;
  const freshLeft = car.e.sets.filter((s) => s.c === c && s.laps === 0 && !s.returned).length;
  // si no habrá otra salida, dos vueltas lanzadas para tener un margen ante un error o una vuelta anulada
  const lastChance = lastRun && R < outLap + lap * 3.2 + 60;
  // en mojado se rueda seguido: la pista cambia cada vuelta y los neumáticos de agua no piden vuelta de enfriamiento;
  // si se está secando, hasta la bandera (la última vuelta es la buena)
  const fit = Math.floor((R - outLap) / lap);
  const pushLaps = !DRY.includes(c) ? clamp(lastRun || drying ? fit : 4, 2, 7) : water > WET.si * 0.5 ? clamp(fit, 2, 5) : (part.advance === null && (freshLeft === 0 || (freshLeft === 1 && set.laps === 0))) || lastChance ? 2 : 1;
  sess.startRun(car, { kind: "quali", setId: set.id, pushLaps, fuel: QUALI_FUEL + pushLaps * 2 * sess.fuelPerLap });
}

/**
 * Clasificación con agua: ¿puede mejorar su tiempo con la pista que habrá en su próxima vuelta lanzada (dentro de
 * `inSec` segundos)? El muro proyecta el agua con su previsión y la compara con la que había en su mejor vuelta:
 * si la pista va a estar bastante más mojada, el agarre perdido no lo compensan un juego nuevo ni la goma en la
 * trazada, y salir solo gasta neumáticos y arriesga el coche. Quien está fuera del corte apura algo más.
 */
export function qualiCanImprove(sess: Session, car: Car, inSec: number, atRisk = false): boolean {
  const best = car.bestByPart[sess.part] ?? Infinity;
  const w0 = car.bestWaterByPart[sess.part];
  if (!isFinite(best) || w0 === undefined) return true;
  if (sess.avgWater() < WET.si * 0.5 && w0 < WET.si * 0.5) return true; // en seco manda la evolución de la pista
  const now = sess.avgWater() * sess.rng.logn(0.1); // cada muro lee el agua con su error
  const fc = teamForecast(sess, car);
  const lap = sess.track.refLap * 1.15;
  const mins = Math.max(1, Math.round((inSec + lap * 0.5) / 60));
  const ws = sess.projectWater(now, rainCurve(fc, sess.rainOnTrack()), mins);
  const w = ws[ws.length - 1];
  if (w <= w0) return true;
  // pérdida por vuelta (fracción): ~0,45 del agarre perdido con el mejor neumático para esa agua
  const loss = 0.45 * (1 - bestWaterGrip(w) / bestWaterGrip(w0));
  const gain = 0.005 + (atRisk ? 0.004 : 0);
  return loss < gain;
}

/** ¿La lluvia prevista para los próximos ~10 minutos va a dejar la pista más mojada que ahora? */
function rainWorsens(sess: Session, fc: Forecast, now: number): boolean {
  const ws = sess.projectWater(now, rainCurve(fc, sess.rainOnTrack()), 10);
  return Math.max(...ws) > now * 1.15 + 0.03;
}

/**
 * Clasificación con la pista mojada: ¿le compensa esperar en el garaje? El muro proyecta el agua con su previsión y
 * compara la de una vuelta lanzada ahora con la de la última que le daría tiempo a dar (saliendo a más tardar con
 * margen para tres). Si la pista va a estar claramente mejor, espera, salvo que la previsión pesimista traiga lluvia
 * (entonces mejor tener un tiempo cuanto antes) o que ya no quede margen para esperar más.
 */
function waitForDrier(sess: Session, car: Car, R: number, outLap: number, lap: number): boolean {
  if (sess.avgWater() < WET.si * 0.6) return false;
  const latest = outLap + lap * 3 + 20;
  if (R <= latest + 30) return false;
  const fc = teamForecast(sess, car);
  const now = sess.avgWater() * sess.rng.logn(0.1); // cada muro lee el agua con su error
  const mins = Math.max(1, Math.ceil(R / 60));
  const rainNow = sess.rainOnTrack();
  const gain = (p: number[]) => {
    const ws = sess.projectWater(now, rainCurve(fc, rainNow, p), mins);
    const at = (sec: number) => ws[clamp(Math.round(sec / 60) - 1, 0, ws.length - 1)];
    const wGoNow = at(outLap + lap * 0.5), wLate = at(R - lap * 1.2);
    return 0.45 * (1 - bestWaterGrip(wGoNow) / bestWaterGrip(wLate));
  };
  // lo que espera ganar, contando algo con la previsión pesimista (si vuelve a llover, esperar sale caro)
  const g50 = gain(fc.p50);
  return g50 > 0 && 0.7 * g50 + 0.3 * gain(fc.p90) > 0.008 + 0.006 * (1 - car.team.estrategia / 100);
}

/**
 * Juego para una salida de clasificación. Los nuevos son contados: se guarda uno por cada parte que queda (dos para
 * la última) y, mientras no haga falta, la primera salida de una parte se hace con un juego usado que aún sirva;
 * el nuevo se deja para el final, con la pista en su mejor momento. Si el coche está en peligro, el mejor que haya.
 */
function qualiSet(sess: Session, car: Car, c: Compound, lastRun: boolean, risk: number): TyreSet | undefined {
  const atRisk = risk > 0;
  const sets = car.e.sets.filter((s) => s.c === c && !s.returned && !s.punctured && s !== car.tyres).sort((a, b) => setWear(a) - setWear(b));
  if (!sets.length) return undefined;
  if (!DRY.includes(c)) return sets[0];
  const fresh = sets.filter((s) => s.laps === 0);
  const used = sets.filter((s) => s.laps > 0 && setWear(s) < 0.22);
  if (!fresh.length) return sets[0];
  const final = sess.parts[sess.part].advance === null;
  // partes que quedan con este compuesto (en la sprint cada parte obliga a uno)
  const later = sess.parts.slice(sess.part + 1).filter((p) => !p.compound || p.compound === c);
  const reserve = later.length + (later.some((p) => p.advance === null) ? 1 : 0);
  if (final) return lastRun || fresh.length >= 2 || !used.length ? fresh[0] : used[0];
  // última salida de Q1/Q2: nuevo si está fuera o si aún quedan los de reserva (dos para la última parte); si solo va
  // justo, también en Q1, pero en Q2 sin tocar los dos de la última parte. (Antes el que iba justo en Q2 gastaba uno de
  // los dos y la mayoría llegaba a Q3 con un solo juego nuevo: 3 de cada 10 hacían la Q3 peor que su Q2; 2026: 1.)
  const justOk = later.length > 1 ? Math.min(reserve, 1) : reserve;
  if (lastRun) return risk >= 2 || fresh.length > (risk === 1 ? justOk : reserve) || !used.length ? fresh[0] : used[0];
  // primera salida: nuevo si sobran; si no, usado (salvo que el coche no dé para pasar con uno usado). El usado, poco
  // gastado: ese tiempo es el que queda si luego se anula la vuelta buena
  const light = used.filter((x) => setWear(x) < 0.12);
  if (fresh.length - 1 >= reserve || !light.length) return fresh[0];
  return strongCar(sess, car) && !atRisk ? light[0] : fresh[0];
}

/** Neumáticos de la IA durante una bandera roja en carrera (cambio gratis). */
export function aiRedFlagTyres(sess: Session, car: Car) {
  if (!car.tyres) return;
  const water = sess.avgWater();
  const cur = car.tyres.c;
  let want: Compound | null = null;
  if (water > WET.iw * 1.1) want = "W";
  else if (water > WET.si) want = cur === "W" && water > WET.iw * 0.8 ? null : "I";
  else if (!DRY.includes(cur)) want = car.plan.stints.find((s) => DRY.includes(s.c))?.c ?? "M";
  else if (setWear(car.tyres) > 0.25) {
    // gratis: juego más fresco del compuesto que mejor encaja con lo que queda
    const left = sess.laps - sess.lapsDone(car);
    const avail = availableSets(car);
    const opts: Compound[] = left < 18 ? ["S", "M", "H"] : left < 32 ? ["M", "H", "S"] : ["H", "M", "S"];
    want = opts.find((c) => avail[c].length && (ruleSatisfied(car) || c !== cur)) ?? null;
  }
  if (!want || want === cur && setWear(car.tyres) < 0.25) return;
  const set = sess.bestSetFor(car, want) ?? (want === "W" ? sess.bestSetFor(car, "I") : undefined);
  if (set) sess.redFlagChange(car, set.id);
}
