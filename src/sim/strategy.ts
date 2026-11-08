// Estrategia e IA de los equipos.
// Cada equipo tiene un conocimiento IMPERFECTO del desgaste real; lo mejora rodando tandas largas
// en libres. Con lo que sabe simula stints con el mismo modelo de neumáticos que la carrera y
// busca la mejor combinación de paradas con los juegos que le quedan.
import { Rng } from "./rng";
import { Compound, COMPOUNDS, DRY, HiddenTyre, TyreSet, newSet, updateSet, setGrip, setWear, WET } from "./tyres";
import { msTimeAtGrip } from "./track";
import { forecast, Forecast } from "./weather";
import type { Session, Car, TeamDef, Run } from "./session";

export interface Stint { c: Compound; endLap: number; setId?: string }
export interface Plan { stints: Stint[]; total?: number }

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
  const key = `${c}:${car.id}:${trackT}:${airT}`;
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
export function planStrategy(sess: Session, car: Car, k: TeamKnowledge, fromLap = 0, curC: Compound | null = null, curAge = 0, rng: Rng | null = null): Plan {
  const n = (k.noise.M + k.noise.S) / 2;
  const temp = 1 + n * 15;
  // solo hacen falta las opciones cercanas a la mejor (con rng se elige entre ellas)
  const options = enumeratePlans(sess, car, k, fromLap, curC, curAge, rng ? temp * 3 : 0);
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

/** Todas las estrategias posibles en seco (0, 1 o 2 paradas) con los juegos que quedan, de mejor a peor. */
function enumeratePlans(sess: Session, car: Car, k: TeamKnowledge, fromLap = 0, curC: Compound | null = null, curAge = 0, margin = Infinity): Plan[] {
  const total = sess.laps;
  // se descartan sobre la marcha las que ya están peor que la mejor + margen (sin crear objetos)
  let bestT = Infinity;
  const keep = (t: number) => { if (t < bestT) bestT = t; return t <= bestT + margin; };
  const remain = total - fromLap;
  // pérdida en boxes + lo que cuesta perder posición en pista (tráfico al volver)
  const loss = pitLoss(sess) + car.team.boxes + 1.0 + 4;
  const avail = availableSets(car);
  const used = curC ? new Set(car.usedCompounds) : new Set<Compound>();
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
    const idx = (c: Compound, n: number) => n + (st.own && c === c0 ? 1 : 0); // índice del juego libre
    if (ruleOk([c0])) { const t = stintCost(sess, car, k, c0, a0, remain); if (keep(t)) options.push({ stints: [{ c: c0, endLap: total, setId: id0 }], total: t }); }
    for (const c2 of DRY) {
      const i2 = idx(c2, 0);
      if (!avail[c2][i2] || !ruleOk([c0, c2])) continue;
      const a2 = ageOf(c2, i2);
      for (let l1 = 4; l1 <= remain - 4; l1++) {
        const t = stintCost(sess, car, k, c0, a0, l1) + stintCost(sess, car, k, c2, a2, remain - l1) + loss;
        if (keep(t)) options.push({ stints: [{ c: c0, endLap: fromLap + l1, setId: id0 }, { c: c2, endLap: total, setId: avail[c2][i2].id }], total: t });
      }
    }
    for (const c2 of DRY) for (const c3 of DRY) {
      const i2 = idx(c2, 0);
      const i3 = idx(c3, c3 === c2 ? 1 : 0);
      if (!avail[c2][i2] || !avail[c3][i3] || !ruleOk([c0, c2, c3])) continue;
      const a2 = ageOf(c2, i2), a3 = ageOf(c3, i3);
      for (let l1 = 4; l1 <= remain - 8; l1++) for (let l2 = 4; l1 + l2 <= remain - 4; l2++) {
        const t = stintCost(sess, car, k, c0, a0, l1) + stintCost(sess, car, k, c2, a2, l2) + stintCost(sess, car, k, c3, a3, remain - l1 - l2) + 2 * loss;
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
  const seen = new Set<string>();
  const picked: Plan[] = [];
  for (const o of all) {
    const sig = o.stints.map((x) => x.c).join("-");
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(o);
    if (picked.length >= n) break;
  }
  if (!picked.length) return [];
  const best = picked[0].total!;
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
      if (i > 0) t += pitLoss(sess) + car.team.boxes + 1.0 + 4;
      from = st.endLap;
    });
    return t;
  };
  return picked.map((p) => ({ plan: p, stops: p.stints.length - 1, delta: p.total! - best, ifWorse: cost(worse, p) - cost(k, p) }));
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

/** Compuesto que toca según el agua y la previsión. null = el actual vale. */
function weatherCall(sess: Session, car: Car): Compound | null {
  const k = car.e.knowledge;
  const water = sess.avgWater() * sess.rng.logn(0.15);
  const cur = car.tyres!.c;
  const rainNow = sess.rainOnTrack();
  const isDry = DRY.includes(cur);
  const fc = teamForecast(sess, car);
  const soonDry = fc.prob[2] < 0.3 && fc.prob[3] < 0.25;
  const soonWet = fc.prob[1] > 0.6 && fc.p50[1] > 2;
  const left = sess.laps - sess.lapsDone(car);
  if (isDry) {
    if (water > k.wetIn && water < WET.si * 2.5 && soonDry && left > 5 && sess.rng.chance(0.6)) return null;
    if (water > k.wetIn || (soonWet && water > k.wetIn * 0.5)) return water > WET.iw * 1.05 ? "W" : "I";
    return null;
  }
  // intermedio ↔ lluvia alrededor del cruce, con margen para no cambiar por una vuelta
  if (cur === "I" && water > WET.iw * 1.1) return "W";
  if (cur === "W" && water < WET.iw * 0.8 && rainNow < 4) return "I";
  if (cur === "I" && water < k.wetOut && rainNow < 0.4 && fc.prob[2] < 0.5) {
    const avail = availableSets(car);
    const pref: Compound[] = left < 18 ? ["S", "M", "H"] : left < 32 ? ["M", "S", "H"] : ["H", "M", "S"];
    return pref.find((c) => avail[c].length) ?? "M";
  }
  return null;
}

export function ruleSatisfied(car: Car): boolean {
  const u = car.usedCompounds;
  if (u.has("I") || u.has("W")) return true;
  return [...u].filter((c) => DRY.includes(c)).length >= 2;
}

/** Decisión de la IA al final de la vuelta. Devuelve el juego si para. */
export function aiDecide(sess: Session, car: Car, adviceOnly = false): string | null {
  if (car.loc !== "track" || sess.chequered || !car.tyres) return null;
  const done = sess.lapsDone(car) + 1;
  const total = sess.laps;
  const left = total - done;
  if (!adviceOnly) aiModes(sess, car, left);
  if (left < 1 || car.pitRequest) return null;
  const decideC = (c: Compound) => {
    const set = sess.bestSetFor(car, c) ?? sess.bestSetFor(car, c === "I" ? "W" : c === "W" ? "I" : "M");
    if (!set) return null;
    if (!adviceOnly) car.pitRequest = set.id;
    return set.id;
  };
  const wc = weatherCall(sess, car);
  if (wc && wc !== car.tyres.c) {
    if (!adviceOnly && DRY.includes(wc)) car.plan = { stints: [...car.plan.stints.slice(0, car.stops + 1), { c: wc, endLap: total }] };
    return decideC(wc);
  }
  if (!DRY.includes(car.tyres.c)) return null;
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

  let box = false;
  let why = "";
  if (wear > 0.9 && left > 2) { box = true; why = "desgaste"; }
  if (stopsLeft > 0 && done >= plannedEnd) { box = true; why = "plan"; }
  if ((sess.flag === "sc" || sess.flag === "vsc") && left > 5 && !fresh && anyDry) {
    if (stopsLeft > 0 && plannedEnd - done <= 14) { box = true; why = "SC"; }
    else if (needRule) { box = true; why = "SC regla"; }
    else if (car.tyres.laps > 14 && left > 12 && sess.rng.chance(0.5)) { box = true; why = "SC gratis"; }
  }
  const ord = sess.order();
  const i = ord.indexOf(car);
  const behind = ord[i + 1];
  if (behind && behind.lastPitLap === done - 1 && sess.gapBetween(car, behind) < 3 && stopsLeft > 0 && plannedEnd - done <= 6) { box = true; why = "cubrir undercut"; }
  if (car.followGap < 0.9 && stopsLeft > 0 && plannedEnd - done <= 3 && plannedEnd - done >= 1 && sess.rng.chance(0.3)) { box = true; why = "undercut"; }
  if (needRule && left <= 6 && !fresh) { box = true; why = "regla"; }
  if (!box || !anyDry) return null;

  const fc = teamForecast(sess, car);
  if (Math.max(fc.prob[1], fc.prob[2], fc.prob[3]) > 0.55) {
    if (sess.avgWater() > 0.06) return decideC("I");
    if (wear < 0.86) return null;
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
        car.pitWhy = `${why} v${done} ${cur}${car.tyres.laps}→${car.plan.stints.slice(car.stops + 1).map((x) => x.c + x.endLap).join(" ")}`;
      }
      return set.id;
    }
  }
  const plan = planStrategy(sess, car, k, done, null, 0, null);
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

/** Modos de ritmo y motor de la IA. */
export function aiModes(sess: Session, car: Car, left: number) {
  if (!car.tyres) return;
  const fuelLaps = car.fuel / sess.fuelPerLap;
  const sp = COMPOUNDS[car.tyres.c];
  const wear = setWear(car.tyres);
  const stint = car.plan.stints[car.stops];
  const toEnd = (stint?.endLap ?? sess.laps) - sess.lapsDone(car);
  let push = 2;
  if (fuelLaps < left + 0.3) push = 1;
  if (fuelLaps < left - 0.5) push = 0;
  if (wear > sp.cliff - 0.15 && toEnd > 6 && push > 1) push = 1;
  if (left <= 4 && wear < sp.cliff - 0.1 && fuelLaps > left + 0.5) push = 3;
  if (!car.player || car.autoPush) car.push = push;
  if (!car.player) car.engine = fuelLaps < left - 0.3 ? 0 : 1;
}

/** Batería: se decide en cada minisector. */
export function aiErs(sess: Session, car: Car) {
  if (car.player && !car.autoErs) return;
  const ph = car.run?.phase;
  if (ph === "out" || ph === "cool" || ph === "in") { car.ers = 0; return; }
  if (ph === "push") { car.ers = car.soc > 0.8 ? 2 : 1; return; }
  const attacking = car.followGap < 0.9 && car.aheadId >= 0;
  if (car.soc < 0.6) car.ers = 0;
  else if (attacking && car.soc > 1.2) car.ers = car.followGap < 0.5 ? 3 : 2;
  else if (car.soc < 2.2) car.ers = 0;
  else if (car.soc > 3.6) car.ers = 2;
  else car.ers = 1;
  void sess;
}

// ------------------------------------------------------------------ libres
const QUALI_FUEL = 10;

/** Cuántos blandos nuevos hay que guardar para la clasificación. */
function reserveSoft(sess: Session) {
  return sess.sprintWeekend ? 3 : 4;
}

function setForPractice(sess: Session, car: Car, c: Compound): TyreSet | undefined {
  const sets = car.e.sets.filter((s) => s.c === c && !s.returned && !s.punctured);
  const fresh = sets.filter((s) => s.laps === 0);
  const usedOk = sets.filter((s) => s.laps > 0 && setWear(s) < 0.55).sort((a, b) => setWear(a) - setWear(b));
  if (c === "S") return fresh.length > reserveSoft(sess) ? fresh[0] : usedOk[0];
  if (c === "M") return usedOk[0] ?? (fresh.length > (sess.sprintWeekend ? 3 : 2) ? fresh[0] : undefined);
  if (c === "H") return usedOk[0];
  return usedOk[0] ?? fresh[0];
}

/** Prepara una tanda. Para el jugador, setId fuerza un juego concreto. */
export function makeRun(sess: Session, car: Car, kind: Run["kind"], c: Compound, laps: number, at = 0, setId?: string): Run | null {
  const set = setId ? car.e.sets.find((s) => s.id === setId) : kind === "quali" ? pickSet(car, c, true) : setForPractice(sess, car, c) ?? (kind === "long" ? pickSet(car, c, false) : undefined);
  if (!set) return null;
  const fuel = kind === "long" ? Math.min(75, 12 + laps * sess.fuelPerLap * 1.1 + 25) : kind === "inst" ? 20 : QUALI_FUEL + laps * 2 * sess.fuelPerLap;
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
  if (sess.kind === "FP1") {
    add("inst", "M", 1, r.range(0, 6));
    add("long", r.chance(0.6) ? "M" : "S", r.int(7, 11), r.range(14, 26));
    add("qsim", "S", 2, r.range(36, 46));
  } else if (sess.kind === "FP2") {
    add("qsim", "S", 2, r.range(5, 14));
    add("long", r.chance(0.5) ? "S" : "M", r.int(9, 13), r.range(24, 34));
  } else {
    add("qsim", "S", 2, r.range(8, 16));
    add("qsim", "S", 1, r.range(38, 48));
  }
  for (let i = 1; i < runs.length; i++) runs[i].at = Math.max(runs[i].at ?? 0, (runs[i - 1].at ?? 0) + 60);
  return runs;
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
    if (part.minutes * 60 - lastDep > outLap + lap * 2 + 120) deps.push(part.minutes * 60 - r.range(50, 200));
    deps.push(lastDep);
    car.qPlan = { part: sess.part, deps };
  }
  const plan = car.qPlan;
  if (!plan.deps.length) return;
  const fc = teamForecast(sess, car);
  const urgent = Math.max(fc.prob[1], fc.prob[2]) > 0.6 && sess.avgWater() < 0.3;
  // ante la lluvia cada muro reacciona a su ritmo: unos salen ya, otros tardan en decidirse
  if (urgent && plan.urgentAt === undefined) plan.urgentAt = R - sess.rng.range(3, 20) - sess.rng.range(0, 80) * (1.25 - car.team.estrategia / 100);
  if (urgent && R > plan.urgentAt!) return;
  if (!urgent && R > plan.deps[0]) return;
  if (urgent) plan.deps = [];
  else plan.deps.shift();
  // en Q1/Q2, si va sobrado, se ahorra la última salida
  const ord = sess.timingOrder().filter((c) => !c.eliminated);
  const pos = ord.indexOf(car);
  const safe = part.advance !== null && isFinite(car.bestByPart[sess.part] ?? Infinity) && pos < part.advance - 5 && plan.deps.length === 0 && car.pace > 1.006;
  if (safe) return;
  if (R < outLap + lap * 0.95) return;
  const water = sess.avgWater();
  let c: Compound = water > WET.iw * 1.05 ? "W" : water > WET.si ? "I" : (part.compound ?? "S");
  let set = pickSet(car, c, true);
  if (!set && c === "W") { c = "I"; set = pickSet(car, c, true); }
  if (!set) return;
  const freshLeft = car.e.sets.filter((s) => s.c === c && s.laps === 0 && !s.returned).length;
  // si no habrá otra salida, dos vueltas lanzadas para tener un margen ante un error o una vuelta anulada
  const lastChance = plan.deps.length === 0 && R < outLap + lap * 3.2 + 60;
  const pushLaps = water > WET.si ? 3 : (freshLeft <= 1 && part.advance === null) || lastChance ? 2 : 1;
  sess.startRun(car, { kind: "quali", setId: set.id, pushLaps, fuel: QUALI_FUEL + pushLaps * 2 * sess.fuelPerLap });
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
