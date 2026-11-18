// Modo escenario: una carrera real (de 2010 en adelante) que empieza a mitad, en el momento en que se decidió, con
// los equipos y los pilotos de aquel año, el reglamento de la época y un objetivo. La situación de partida (orden,
// huecos, neumáticos, paradas, daños, banderas y agua) se coloca directamente en la sesión; el tiempo que viene tiene
// guion (cuándo llega la lluvia y con qué fuerza), pero lo que pase a partir de ahí lo decide la simulación y tú.
import { Rng, clamp } from "./rng";
import type { Track } from "./track";
import { Session, Car, TeamDef, DriverDef, ResultRow, eraOf, SOC_MAX } from "./session";
import { Compound, DRY, TyreSet, updateSet, driverRough, setWear } from "./tyres";
import { msTimeAtGrip } from "./track";
import { Climate, Scenario, WeatherState, createDayWeather, stepWeather } from "./weather";
import { Weekend, newWeekend } from "./weekend";
import { planStrategy } from "./strategy";
import { RACE_POINTS, pointsFor } from "./season";

// ------------------------------------------------------------------ datos
/** Un piloto del registro: nombre, abreviatura, año de nacimiento, de debut y su estilo (se suma a su nivel de ese año). */
export interface PilotoReg { nombre: string; abrev: string; nac: number; debut: number; estilo?: Partial<Record<keyof Estilo, number>> }
type Estilo = { regularidad: number; neumaticos: number; lluvia: number; ataque: number; defensa: number; agresividad: number; salida: number };

export interface EquipoEsc {
  id: string; nombre: string; motor: string; color: string;
  /** Como en equipos-2026.json: agarre y potencia en % frente a la referencia. */
  agarre: number; potencia: number; resistencia?: number; desgaste?: number;
  boxes: number; fiabilidad?: number; estrategia?: number; meteo?: number;
  /** [clave del registro, dorsal, nivel (ritmo) ese año] */
  pilotos: [string, number, number][];
}

/** Un coche en la situación de partida (en orden de carrera). */
export interface CocheEsc {
  k: string; // clave del registro
  gap?: number; // s por detrás del líder en la pista (con `doblado`, por detrás en esa vuelta)
  doblado?: number; // vueltas que le saca el líder
  c?: Compound; // neumático montado
  edad?: number; // vueltas que lleva ese juego
  antes?: Compound[]; // compuestos de las tandas anteriores
  paradas?: number; // si no, una por tanda anterior
  fuera?: string; // ya ha abandonado: por qué
  fueraV?: number; // en qué vuelta
  parar?: Compound; // su equipo le llama a boxes nada más empezar (lo que hizo en la carrera real)
  fondo?: number; // daño en el fondo (fracción de agarre)
  aleron?: number; // alerón dañado (fracción de agarre)
}

/** Un rival al que su equipo llama a boxes con el coche de seguridad, salvo que `salvo` (tu piloto) pare antes: entonces
 *  se queda fuera para quedarse con la posición (lo que habría hecho su muro). */
export interface ParadaEsc { k: string; c: Compound; salvo?: string }

/** Lluvia con guion: una banda que llega al circuito a los `en` minutos, con `mmh` mm/h durante unos `dura` minutos. */
export interface LluviaEsc { en: number; mmh: number; dura: number }

export type ObjetivoEsc = { txt: string } & (
  | { tipo: "pos"; k: string; max: number } // terminar en ese puesto o mejor
  | { tipo: "margen"; k: string; s: number } // ganar con al menos esos segundos
  | { tipo: "delante"; k: string; de: string } // terminar por delante de otro (o que él no termine)
  | { tipo: "campeon"; k: string; puntos: Record<string, number>; victorias: Record<string, number> }
  | { tipo: "todos"; de: ObjetivoEsc[] }
);

export interface EscenarioDef {
  id: string;
  year: number;
  circuito: string; // id de data/circuitos
  gp: string; // «Gran Premio de Abu Dabi»
  titulo: string;
  equipo: string; // id de tu equipo
  vueltas: number; // vueltas de aquella carrera
  vuelta: number; // vueltas completadas por el líder al empezar (en salida parada: la vuelta que se cierra al arrancar)
  hora: string; // hora local al empezar («17:23»)
  /** Lo que pasó de verdad (se cuenta antes y después). */
  historia: string;
  /** Lo que tienes delante (la previa). */
  situacion: string;
  /** Lo que no es igual que entonces (trazado, compuestos...). */
  nota?: string;
  tiempo: { base: Scenario; agua?: number; lluvia?: LluviaEsc[]; viento?: number };
  /** Cómo está la carrera al empezar: coche de seguridad en pista o salida parada tras una bandera roja. */
  bandera?: { tipo: "sc"; por: string; vueltas: number } | { tipo: "parada" };
  /** Lo que pasó después y no depende de ti (un coche de seguridad de la carrera real): en esa vuelta del líder, cuando
   * lleva hecha la fracción `en` de ella (0,5 si no se dice). */
  eventos?: { vuelta: number; en?: number; sc: string; fuera?: string; paran?: ParadaEsc[] }[];
  equipos: EquipoEsc[];
  coches: CocheEsc[];
  /** Tres estrellas: la primera es superar el escenario. */
  objetivos: [ObjetivoEsc, ObjetivoEsc, ObjetivoEsc];
}

// ------------------------------------------------------------------ parrilla
/** Equipos de un escenario con sus pilotos completos, y la clave del registro de cada coche (id = orden). */
export function scenarioTeams(def: EscenarioDef, reg: Record<string, PilotoReg>): { teams: TeamDef[]; keys: string[] } {
  const keys: string[] = [];
  const teams = def.equipos.map((e): TeamDef => ({
    id: e.id, nombre: e.nombre, motor: e.motor, color: e.color,
    agarre: e.agarre, potencia: e.potencia, resistencia: e.resistencia ?? 0, desgaste: e.desgaste ?? 1,
    boxes: e.boxes, fiabilidad: e.fiabilidad ?? 1, estrategia: e.estrategia ?? 78, meteo: e.meteo ?? 78,
    pilotos: e.pilotos.map(([k, numero, ritmo]) => {
      const p = reg[k];
      if (!p) throw new Error(`Piloto sin registro: ${k}`);
      keys.push(k);
      return driverOf(p, numero, ritmo);
    }),
  }));
  return { teams, keys };
}

function driverOf(p: PilotoReg, numero: number, ritmo: number): DriverDef {
  const st = p.estilo ?? {};
  const v = (base: number, k: keyof Estilo) => Math.round(clamp(base + (st[k] ?? 0), 40, 99));
  return {
    nombre: p.nombre, abrev: p.abrev, numero, ritmo,
    regularidad: v(ritmo - 3, "regularidad"), neumaticos: v(ritmo - 4, "neumaticos"), lluvia: v(ritmo - 3, "lluvia"),
    ataque: v(ritmo - 3, "ataque"), defensa: v(ritmo - 3, "defensa"), agresividad: v(60, "agresividad"), salida: v(ritmo - 5, "salida"),
    nacimiento: p.nac, debut: p.debut,
  };
}

// ------------------------------------------------------------------ tiempo
const hhmm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
/** Minutos de radar que se simulan antes de empezar (para que el radar tenga historia y la lluvia llegue de lejos). */
const LEAD = 40;

function scenarioWeather(def: EscenarioDef, clima: Climate, rng: Rng): WeatherState {
  const t = def.tiempo;
  // en seco con guion no nace nada por su cuenta: solo llueve lo que diga el guion
  const cl: Climate = t.base === "seco" ? { ...clima, celulasSeco: 0, pequenas: 0 } : clima;
  const w = createDayWeather(rng.fork(), cl, t.base, 0, hhmm(def.hora) - LEAD);
  if (t.viento) w.windSpeed = t.viento;
  if (t.base === "seco") w.cells = [];
  for (const r of t.lluvia ?? []) rainBand(w, r, rng);
  for (let m = 0; m < LEAD; m++) stepWeather(w, 1);
  return w;
}

/** Banda de lluvia que llega al circuito (0, 0) a los r.en minutos de empezar y descarga unos r.dura minutos. */
function rainBand(w: WeatherState, r: LluviaEsc, rng: Rng) {
  const ws = w.windSpeed / 60; // km/min
  const ux = Math.cos(w.windDir), uy = Math.sin(w.windDir), px = -uy, py = ux;
  const T = r.en + LEAD;
  const dist = ws * T;
  // madura al llegar: GROW (0,3) < edad/vida < DECAY (0,55) mientras pasa
  const life = 4 * (T + r.dura);
  for (let lat = -14; lat <= 14; lat += 7) {
    w.cells.push({
      x: -ux * dist + px * lat + rng.gauss(0, 0.6), y: -uy * dist + py * lat + rng.gauss(0, 0.6),
      vx: ux * ws, vy: uy * ws,
      sigma: clamp((ws * r.dura) / 3, 1.2, 9), ax: 2.4, ang: w.windDir + Math.PI / 2 + rng.gauss(0, 0.1),
      peak: r.mmh * rng.range(0.95, 1.2) * (Math.abs(lat) > 10 ? 0.7 : 1),
      age: 0.42 * life - T, life, seed: rng.range(0, 1000),
    });
  }
}

// ------------------------------------------------------------------ montaje
export interface BuiltScenario {
  sess: Session;
  wk: Weekend;
  teams: TeamDef[];
  /** Id del coche (en la sesión) de cada clave del registro. */
  idOf: Map<string, number>;
}

/** Prepara el escenario: la carrera ya empezada, lista para seguir. `seed` cambia lo que pasa a partir de ahí. */
export function buildScenario(def: EscenarioDef, reg: Record<string, PilotoReg>, cdef: any, track: Track, seed: number): BuiltScenario {
  const rng = new Rng(seed);
  const { teams, keys } = scenarioTeams(def, reg);
  const idOf = new Map(keys.map((k, i) => [k, i]));
  const st = newWeekend(0, { ...cdef, formato: "normal" }, teams, seed);
  st.year = def.year;
  st.rubber = 0.6;
  // a mitad de carrera los equipos ya saben bastante de sus neumáticos (libres y lo que llevan de carrera)
  const kr = rng.fork();
  for (const k of Object.values(st.knowledge)) {
    for (const c of DRY) { k.noise[c] = Math.max(0.03, k.noise[c] * 0.45); k.hidden.wearMult[c] = st.hidden.wearMult[c] * kr.logn(k.noise[c]); }
    k.hidden.thermalOffset = st.hidden.thermalOffset + kr.gauss(0, 1.5);
  }
  const wk = new Weekend(st, track, teams, def.equipo, { setups: false });
  const weather = scenarioWeather(def, cdef.clima, rng);
  const agua = def.tiempo.agua ?? 0;
  const water = track.ms.map((m) => agua * (0.85 + 0.3 * ((m.i * 7919) % 100) / 100));
  const listed = def.coches.map((c) => {
    const id = idOf.get(c.k);
    if (id === undefined) throw new Error(`Coche sin equipo en ${def.id}: ${c.k}`);
    return id;
  });
  const sess = new Session({
    kind: "RACE", seed: seed * 31 + 7, track, entrants: wk.entrants(), hidden: st.hidden,
    weather, water, rubber: Math.max(0.2, 0.6 - agua * 0.2), grid: listed, laps: def.vueltas,
    sprintWeekend: false, year: def.year, era: eraOf(def.year),
  });
  warp(sess, def, idOf, agua, rng);
  for (const e of def.eventos ?? []) {
    const fire = () => {
      if (e.fuera) { const id = idOf.get(e.fuera); const c = id !== undefined ? sess.carById(id) : null; if (c && c.loc === "track") sess.retire(c, "accidente", 0.6, "garage"); }
      sess.deploy("sc", e.sc, 0.5);
      for (const p of e.paran ?? []) callIn(sess, idOf, p);
    };
    // el líder empieza la vuelta `e.vuelta` al cerrar la anterior: desde ahí, la fracción de vuelta que diga
    const schedule = () => sess.timers.push({ t: sess.t + (e.en ?? 0.5) * sess.lapRefRace * 1.03, fn: fire });
    if (e.vuelta - 1 === def.vuelta) schedule();
    else sess.onLap.push((lap) => { if (lap === e.vuelta - 1) schedule(); });
  }
  return { sess, wk, teams, idOf };
}

/** Su muro le llama a boxes; si el que dice `salvo` para antes de que llegue a la entrada, se queda fuera. */
function callIn(sess: Session, idOf: Map<string, number>, p: ParadaEsc) {
  const c = sess.carById(idOf.get(p.k)!);
  if (c.loc !== "track") return;
  const set = c.e.sets.find((z) => z.c === p.c && z.laps === 0);
  if (!set) return;
  c.pitRequest = set.id;
  if (!p.salvo) return;
  const o = sess.carById(idOf.get(p.salvo)!);
  const L = sess.L;
  const entry = (Math.floor(c.s / L) + (((c.s % L) + L) % L > sess.track.pit.entry ? 1 : 0)) * L + sess.track.pit.entry;
  const watch = () => {
    if (c.loc !== "track" || c.s > entry) return; // ya ha entrado (o ya ha pasado la entrada)
    if (o.pitRequest || o.loc === "pit" || o.loc === "lane_in") c.pitRequest = null;
    else if (!c.pitRequest) c.pitRequest = set.id;
    sess.timers.push({ t: sess.t + 0.25, fn: watch });
  };
  watch();
}

/** Coloca la carrera en la vuelta del escenario: posiciones, huecos, cronometraje, neumáticos, paradas y banderas. */
function warp(sess: Session, def: EscenarioDef, idOf: Map<string, number>, agua: number, rng: Rng) {
  const N = def.vuelta, L = sess.L, NM = sess.track.ms.length;
  const standing = def.bandera?.tipo === "parada";
  const lapT = sess.lapRefRace * (agua > 0.3 ? 1.12 : 1.03);
  const v = L / lapT; // m/s medios de una vuelta
  const t = N * lapT + (standing ? 0 : 1);
  sess.t = t;
  sess.wall = t;
  sess.flag = "green"; sess.scLapsLeft = 0; sess.scWet = false;
  const runners = def.coches.filter((x) => !x.fuera);
  const leadS = standing ? N * L - 12 : N * L + v * 1;
  for (const cs of def.coches) {
    const c = sess.carById(idOf.get(cs.k)!);
    const i = runners.indexOf(cs);
    const s = cs.fuera ? Math.max(1, cs.fueraV ?? 1) * L - 300 : standing ? N * L - 12 - i * 8 : leadS - (cs.doblado ?? 0) * L - (cs.gap ?? 0) * v;
    c.s = s;
    c.msK = Math.floor(s / L) * NM + sess.msIndexAt(s);
    c.cross = [];
    for (let k = 0; k <= c.msK; k++) {
      const bS = Math.floor(k / NM) * L + sess.track.ms[k % NM].s0;
      c.cross[k] = t - (s - bS) / v;
    }
    const done = sess.lapsDone(c);
    c.lapStart = c.cross[done * NM] ?? 0;
    c.lapTimes = Array.from({ length: done }, (_, j) => (j === 0 ? lapT * 1.06 : lapT * (1 + rng.gauss(0, 0.004))));
    c.best = Infinity;
    // neumáticos: el juego montado, gastado lo que toque; los de tandas anteriores, usados
    const comp = cs.c ?? "M";
    const prev = cs.antes ?? [];
    for (const set of c.e.sets) { set.laps = 0; set.F.wear = set.R.wear = 0; }
    const free = (x: Compound, not?: TyreSet) => c.e.sets.find((z) => z.c === x && z.laps === 0 && z !== not);
    const set = free(comp) ?? c.e.sets.find((z) => z.c === comp)!;
    for (const pc of prev) { const u = free(pc, set); if (u) { u.laps = 14; u.F.wear = u.R.wear = 0.55; } }
    c.usedCompounds = new Set();
    sess.mount(c, set);
    const edad = cs.edad ?? 0;
    ageSet(sess, c, set, edad, DRY.includes(comp) ? 0 : Math.max(agua, 0.6));
    c.stintW0 = 0; c.stintL0 = 0;
    const from = Math.max(0, N - edad);
    c.stintLog = [...prev.map((pc, j) => ({ c: pc, from: Math.round((from * j) / Math.max(1, prev.length)), used: false })), { c: comp, from, used: false }];
    c.usedCompounds = new Set([...prev, comp]);
    c.stops = cs.paradas ?? prev.length;
    c.lastPitLap = prev.length ? from : -1;
    c.fuel = sess.fuelLap(c) * Math.max(0, def.vueltas - done) * (c.player ? 1 : rng.range(0.99, 1.01)) + (c.player ? 0.5 : 0.8);
    c.soc = c.socAvg = SOC_MAX * 0.7;
    c.floor = cs.fondo ?? 0;
    c.wing = cs.aleron ?? 0;
    c.conf = 0;
    c.launch = undefined;
    c.drs = false; c.drsEligible = false;
    if (cs.fuera) {
      c.loc = "out";
      c.retireReason = cs.fuera;
      c.v = 0;
      continue;
    }
    c.loc = "track";
    c.retireReason = undefined;
    const pi = Math.min(sess.track.vref.length - 1, Math.floor((((s % L) + L) % L) / sess.track.ds));
    c.v = standing ? 0 : sess.track.vref[pi];
    if (standing) { c.gridS = s; sess.rollLaunch(c); sess.formationLap(c); }
    c.plan = planStrategy(sess, c, c.e.knowledge, done, comp, edad, rng.fork());
    if (cs.parar) c.pitRequest = c.e.sets.find((z) => z.c === cs.parar && z.laps === 0)?.id ?? null;
  }
  const order = runners.map((x) => idOf.get(x.k)!);
  sess.lapOrder = Array.from({ length: (standing ? N - 1 : N) + 1 }, () => [...order]);
  sess.leaderLap = standing ? N - 1 : N;
  sess.greenLeaderLaps = sess.leaderLap;
  sess.drsEnabledFromLap = standing ? N + 2 : 0;
  sess.events = [];
  if (standing) {
    sess.restartHold = true;
    sess.startHold = 0;
  }
  if (def.bandera?.tipo === "sc") {
    sess.deploy("sc", def.bandera.por, 0.5);
    sess.scLapsLeft = def.bandera.vueltas;
    sess.scWet = sess.avgWater() > 1.15;
    sess.drsEnabledFromLap = N + def.bandera.vueltas + 2;
  }
}

/** Gasta un juego como si llevara `laps` vueltas a ritmo de carrera con ese coche (el mismo modelo que la carrera). */
function ageSet(sess: Session, c: Car, set: TyreSet, laps: number, water: number) {
  const tr = sess.track;
  const lapRef = sess.lapRefRace;
  for (let lap = 0; lap < laps; lap++) {
    for (const m of tr.ms) {
      const tm = msTimeAtGrip(m, 1);
      const steps = Math.max(1, Math.round(tm / 2.0));
      for (let s = 0; s < steps; s++) {
        updateSet(set, {
          trackT: sess.weather.trackT, airT: sess.weather.airT, water,
          eF: (m.energyF / tm) * lapRef, eR: (m.energyR / tm) * lapRef,
          push: 1, carWear: c.wearMult, abrasiveness: tr.abrasiveness, rubber: sess.rubber, rough: driverRough(c.d.neumaticos),
        }, tm / steps, lapRef, sess.hidden);
      }
    }
    set.laps++;
  }
  if (setWear(set) > 0.97) set.F.wear = set.R.wear = Math.min(0.97, setWear(set));
}

// ------------------------------------------------------------------ objetivos
/** ¿Se ha cumplido cada objetivo? */
export function evaluate(def: EscenarioDef, rows: ResultRow[], idOf: Map<string, number>): boolean[] {
  return def.objetivos.map((o) => check(o, rows, idOf));
}

function check(o: ObjetivoEsc, rows: ResultRow[], idOf: Map<string, number>): boolean {
  const rowOf = (k: string) => rows.find((r) => r.id === idOf.get(k));
  const fin = (k: string) => { const r = rowOf(k); return r && r.status === "fin" ? r : null; };
  switch (o.tipo) {
    case "pos": { const r = fin(o.k); return !!r && r.pos <= o.max; }
    case "margen": { const r = fin(o.k); const b = rows[1]; return !!r && r.pos === 1 && (!b || b.status !== "fin" || b.laps < r.laps || b.time - r.time >= o.s); }
    case "delante": { const a = fin(o.k), b = fin(o.de); return !!a && (!b || a.pos < b.pos); }
    case "todos": return o.de.every((x) => check(x, rows, idOf));
    case "campeon": return championAfter(o.puntos, o.victorias, rows, idOf) === o.k;
  }
}

/** Quién es campeón tras la carrera, de los que se lo jugaban: puntos, luego victorias y luego el puesto de hoy. */
export function championAfter(puntos: Record<string, number>, victorias: Record<string, number>, rows: ResultRow[], idOf: Map<string, number>): string {
  const pts = pointsFor(rows, RACE_POINTS);
  const winner = rows[0]?.status === "fin" ? rows[0].id : -1;
  const pos = (k: string) => { const r = rows.find((x) => x.id === idOf.get(k)); return r && r.status === "fin" ? r.pos : 99; };
  const table = Object.keys(puntos).map((k) => {
    const id = idOf.get(k)!;
    return { k, p: puntos[k] + (pts.get(id) ?? 0), w: (victorias[k] ?? 0) + (id === winner ? 1 : 0), pos: pos(k) };
  });
  table.sort((a, b) => b.p - a.p || b.w - a.w || a.pos - b.pos);
  return table[0].k;
}

/** Puntos del mundial tras la carrera de los que se lo jugaban (para enseñarlo en los resultados). */
export function standingsAfter(puntos: Record<string, number>, rows: ResultRow[], idOf: Map<string, number>): { k: string; before: number; after: number }[] {
  const pts = pointsFor(rows, RACE_POINTS);
  return Object.keys(puntos).map((k) => ({ k, before: puntos[k], after: puntos[k] + (pts.get(idOf.get(k)!) ?? 0) })).sort((a, b) => b.after - a.after);
}
