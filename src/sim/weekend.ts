// Fin de semana: encadena las sesiones según el formato, guarda los juegos de neumáticos de cada
// piloto, lo que sabe cada equipo, la goma en pista y el tiempo de cada día (continuo: la
// clasificación hereda el agua y las nubes de la mañana).
import { Rng, clamp } from "./rng";
import { Track } from "./track";
import { Compound, HiddenTyre, TyreSet, allocation, testAllocation, setWear, DRY, applyNomination } from "./tyres";
import { Climate, Scenario, WeatherState, createDayWeather, stepWeather, rainAt, pickScenario, evaporation, waterStep } from "./weather";
import { Session, SessionKind, Entrant, TeamDef, ResultRow, isRaceKind, isPracticeKind, LongRun } from "./session";
import { TeamKnowledge, buildKnowledge } from "./strategy";
import { SessionSnapshot, snapshotConditions, applySnapshot } from "./snapshot";
import type { RaceSummary } from "./season";
import { PuState, autoFit, bestSpare, clonePu, fitUnit, newPu, puPenalty } from "./powerunit";
import { SetupState, SessionSetup, newSetupState, carSetup } from "./setup";
import type { TestProgram } from "./development";

export interface WeekendState {
  round: number;
  circuitId: string;
  sprint: boolean;
  seed: number;
  next: number; // índice de la próxima sesión
  results: Partial<Record<SessionKind, ResultRow[]>>;
  sets: Record<number, TyreSet[]>;
  knowledge: Record<string, TeamKnowledge>;
  hidden: HiddenTyre;
  rubber: number;
  days: { scenario: Scenario; seed: number }[];
  anomaly: number;
  scoring?: Partial<Record<SessionKind, number[]>>; // puntos de una carrera acortada (si no, los normales)
  longRuns?: Partial<Record<SessionKind, LongRun[]>>; // tandas largas de cada libre
  summaries?: Partial<Record<SessionKind, RaceSummary>>; // resumen de las carreras ya corridas (para volver a verlas)
  pu?: Record<number, PuState>; // modo «crear equipo»: unidades de potencia de cada piloto
  setup?: SetupState; // reglajes (carga y altura): óptimo oculto, lo que sabe cada equipo y lo que elige el jugador
  year?: number; // temporada (sin ella, 2026)
  /** Moral de cada coche (0 a 100) y rivalidades [coche, coche, intensidad], de la temporada (ver morale.ts). */
  moral?: Record<number, number>;
  rivals?: [number, number, number][];
  /** Rueda de prensa antes de la carrera: las preguntas (se fijan al verlas) y la respuesta elegida en cada una. */
  prensaQs?: { id: string; text: string; answers: { text: string; e: { moral?: Record<string, number>; rival?: { a: string; b: string; k: number }; board?: number } }[] }[];
  prensa?: Record<string, number>;
  /** Lo que recuerda Lobato de la temporada (victorias, rachas de poles y de victorias), para comentarlo. */
  memo?: { wins: Record<string, number>; myCareerWins: Record<string, number>; poles: Record<string, number>; winStreak: Record<string, number> };
  /** Puestos de sanción en la parrilla de la carrera que vienen de la anterior (una sanción sin cumplir). */
  gridPens?: Record<number, { places: number; why: string }>;
  /** Paquete aerodinámico nuevo en tu coche: el programa de libres para probarlo y las vueltas que llevan tus pilotos
   *  probándolo (test) y en el resto de tandas (other). */
  pkgTest?: TestProgram;
  pkgLaps?: { test: number; other: number };
  /** Test de pretemporada (8 h en Barcelona con el tiempo típico de marzo). */
  preseason?: boolean;
}

/**
 * Unidades de potencia al empezar un fin de semana (modo «crear equipo»): las que traía cada piloto de
 * la carrera anterior; el equipo decide si cambia (la de tus pilotos es una propuesta que puedes cambiar).
 */
export function preparePu(st: WeekendState, prev: Record<number, PuState> | undefined, nCars: number, quota?: number) {
  const pu = prev ? clonePu(prev) : {};
  for (let id = 0; id < nCars; id++) {
    const p = (pu[id] ??= newPu(quota));
    p.base = p.units.length;
    autoFit(p);
  }
  st.pu = pu;
}

export const NORMAL_SESSIONS: SessionKind[] = ["FP1", "FP2", "FP3", "Q", "RACE"];
export const SPRINT_SESSIONS: SessionKind[] = ["FP1", "SQ", "SPRINT", "Q", "RACE"];
export const TEST_SESSIONS: SessionKind[] = ["TEST"];
export const DAY_NAMES = ["Viernes", "Sábado", "Domingo"];

/** Clima típico de marzo en Montmeló (Barcelona-Catalunya) para los test de pretemporada. */
export const BARCELONA_MARCH_CLIMA: Climate = {
  latitud: 41.57,
  maxima: 16.5,
  minima: 8.5,
  dispersion: 2.8,
  sol: 15,
  viento: 14,
  pequenas: 0.45,
  pesos: { seco: 64, chubascos: 14, frente: 10, llovizna: 12 },
  tardeConvectiva: 0.25,
};

/** Definición del circuito de Barcelona adaptada al test de pretemporada (marzo, 8 h). */
export function preseasonDef(barcelonaDef: any, year: number): any {
  return {
    ...barcelonaDef,
    gp: `Test de Pretemporada ${year} · Barcelona`,
    fecha: `${year}-03-04`,
    formato: "normal",
    clima: {
      ...BARCELONA_MARCH_CLIMA,
      fuente: "Marzo en Montmeló: máxima ~16,5 °C, mínima ~8,5 °C, mañanas frescas y algún chubasco o llovizna primaveral",
    },
    horario: { test: "V 09:00", fp1: "V 09:00", fp2: "V 13:00", fp3: "S 09:00", q: "S 14:00", carrera: "D 14:00" },
  };
}

/** Crea el estado del test de pretemporada de 8 horas en Barcelona (tiempo típico de marzo). */
export function newPreseasonWeekend(barcelonaDef: any, teams: TeamDef[], seed: number, year: number): WeekendState {
  const def = preseasonDef(barcelonaDef, year);
  const st = newWeekend(0, def, teams, seed);
  st.preseason = true;
  st.year = year;
  let id = 0;
  for (const t of teams) for (const _ of t.pilotos) st.sets[id++] = testAllocation();
  return st;
}
const DAY_FULL: Record<string, string> = { J: "Jueves", V: "Viernes", S: "Sábado", D: "Domingo" };
/** Los tres días del fin de semana de un circuito (letras): casi siempre viernes a domingo; en Bakú y Las Vegas, de jueves a sábado. */
const daysOf = (def: any): string => def.dias ?? "VSD";
/** Horario del circuito para un formato: el suyo, o el del otro formato si el calendario lo cambia (horarioOtro). */
/**
 * Forma de cada piloto en el fin de semana: σ en fracción de agarre (0,15 % ≈ 0,13 s por vuelta), la misma en libres,
 * clasificación y carrera. Es lo que hace que el que va bien el sábado vaya bien el domingo: en 2026 la pole acabó
 * delante de su compañero en 17 de 18 carreras, y en el juego, sin esto, en dos de cada tres (la clasificación era
 * azar de esa vuelta y la carrera azar aparte). Sale de la semilla y del piloto, sin tocar el azar de las sesiones.
 */
const FORM = 0.0015;
export function weekendForm(seed: number, who: string): number {
  const u = [0, 1].map((k) => {
    const txt = `${seed}:${who}:${k}`;
    let h = 2166136261;
    for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619);
    // mezcla final (murmur3): sin ella, semillas seguidas daban casi la misma forma
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return ((h >>> 0) + 0.5) / 4294967296;
  });
  return FORM * Math.sqrt(-2 * Math.log(u[0])) * Math.cos(2 * Math.PI * u[1]);
}

/** Vueltas de una sprint (~100 km, reglamento FIA): el dato del circuito o calculado desde su longitud. */
export function sprintLapsOf(def: any, trackLengthM?: number): number {
  if (def.vueltasSprint) return def.vueltasSprint;
  if (trackLengthM && trackLengthM > 500) return Math.max(12, Math.round(100_000 / trackLengthM));
  return Math.max(12, Math.round((def.vueltas ?? 60) / 3));
}

export const horarioFor = (def: any, sprint: boolean) => {
  const h = def.horario, o = def.horarioOtro;
  if (o && Boolean(h?.sq) !== sprint) return o;
  if (Boolean(h?.sq) === sprint) return h;
  // circuito sin horarioOtro: sintetizar horario sprint o normal conservando sus días y horas locales
  if (sprint) {
    return { fp1: h.fp1, sq: h.fp2 ?? h.fp1, sprint: h.fp3 ?? h.q, q: h.q, carrera: h.carrera };
  }
  return { fp1: h.fp1, fp2: h.sq ?? h.fp1, fp3: h.sprint ?? h.q, q: h.q, carrera: h.carrera };
};

export function newWeekend(round: number, def: any, teams: TeamDef[], seed: number): WeekendState {
  applyNomination(def.compuestos);
  const rng = new Rng(seed);
  const sprint = def.formato === "sprint";
  const hr = rng.fork();
  const hidden: HiddenTyre = {
    wearMult: { S: hr.logn(0.13), M: hr.logn(0.12), H: hr.logn(0.12), I: hr.logn(0.15), W: hr.logn(0.12) },
    thermalOffset: hr.gauss(0, 3.5),
    grainProne: hr.logn(0.35),
  };
  const knowledge: Record<string, TeamKnowledge> = {};
  for (const t of teams) knowledge[t.id] = buildKnowledge(hidden, t, rng.fork());
  const sets: Record<number, TyreSet[]> = {};
  let id = 0;
  for (const t of teams) for (const _ of t.pilotos) sets[id++] = allocation(sprint);
  const climate: Climate = def.clima;
  const days: { scenario: Scenario; seed: number }[] = [];
  let prev: Scenario | undefined;
  for (let d = 0; d < 3; d++) {
    prev = pickScenario(rng, climate, prev);
    days.push({ scenario: prev, seed: rng.int(1, 1e9) });
  }
  return { round, circuitId: def.id, sprint, seed, next: 0, results: {}, sets, knowledge, hidden, rubber: 0.12, days, anomaly: rng.gauss(0, climate.dispersion) };
}

export class Weekend {
  /** opts.setups = false: todos con el coche de referencia, sin reglajes (para comparar en los scripts). */
  constructor(public st: WeekendState, public track: Track, public teams: TeamDef[], public playerTeam: string, public opts: { setups?: boolean } = {}) {
    applyNomination(track.def.compuestos);
    // fines de semana de antes de los reglajes (o recién creados): se crean aquí, con su propio azar
    if (opts.setups !== false && !st.setup) st.setup = newSetupState(track, teams, st.seed);
  }

  /** ¿Ya está el parque cerrado? (desde la primera clasificación del fin de semana) */
  setupLocked(): boolean { return !!this.st.setup?.locked; }

  /** Reglajes para una sesión; la primera clasificación cierra el parque y desde ahí no cambian. */
  private sessionSetup(kind: SessionKind): SessionSetup | undefined {
    const ss = this.st.setup;
    if (!ss || this.opts.setups === false) return undefined;
    const ents = this.entrants();
    if ((kind === "Q" || kind === "SQ") && !ss.locked) ss.locked = Object.fromEntries(ents.map((e) => [e.id, carSetup(ss, e.id, e.team, e.player)]));
    return { opt: ss.opt, cars: Object.fromEntries(ents.map((e) => [e.id, carSetup(ss, e.id, e.team, e.player)])) };
  }

  get def() { return this.track.def; }
  sessions(): SessionKind[] { return this.st.preseason ? TEST_SESSIONS : this.st.sprint ? SPRINT_SESSIONS : NORMAL_SESSIONS; }
  nextKind(): SessionKind | null { return this.sessions()[this.st.next] ?? null; }

  /** Día (0..2) y hora local (min) de una sesión. */
  when(kind: SessionKind): { day: number; clock: number } {
    if (kind === "TEST") return { day: 0, clock: 9 * 60 };
    const key = { FP1: "fp1", FP2: "fp2", FP3: "fp3", SQ: "sq", Q: "q", SPRINT: "sprint", RACE: "carrera" }[kind];
    const txt: string = horarioFor(this.def, this.st.sprint)[key];
    const [d, hm] = txt.split(" ");
    const [h, m] = hm.split(":").map(Number);
    return { day: Math.max(0, daysOf(this.def).indexOf(d)), clock: h * 60 + m };
  }

  /** Nombre del día (0 a 2) del fin de semana. */
  dayName(i: number): string { return DAY_FULL[daysOf(this.def)[i]] ?? DAY_NAMES[i]; }

  entrants(): Entrant[] {
    const out: Entrant[] = [];
    let id = 0;
    for (const t of this.teams) for (const d of t.pilotos) {
      const pu = this.st.pu?.[id];
      out.push({ id, d, team: t, player: t.id === this.playerTeam, sets: this.st.sets[id], knowledge: this.st.knowledge[t.id], pu: pu ? { km0: pu.units[pu.cur].km } : undefined, form: weekendForm(this.st.seed, d.abrev) });
      id++;
    }
    return out;
  }

  /** Tiempo real del día desde las 9:00 hasta la hora pedida, con el agua en pista. */
  conditions(day: number, clock: number): { weather: WeatherState; water: number[]; rubberLoss: number } {
    const d = this.st.days[day];
    const clima: Climate = this.st.preseason ? BARCELONA_MARCH_CLIMA : this.def.clima;
    const w = createDayWeather(new Rng(d.seed), clima, d.scenario, this.st.anomaly + day * 0.3, 9 * 60);
    const ms = this.track.ms;
    const water = new Array(ms.length).fill(0);
    let rubberLoss = 0;
    while (w.clock < clock) {
      stepWeather(w, 1);
      const evap = evaporation(w);
      let rsum = 0;
      for (let i = 0; i < ms.length; i++) {
        const r = rainAt(w, ms[i].x / 1000, ms[i].y / 1000);
        rsum += r;
        for (let k = 0; k < 4; k++) water[i] = waterStep(water[i], r, 15, evap);
      }
      if (rsum / ms.length > 0.5) rubberLoss += 0.02 * (rsum / ms.length);
    }
    return { weather: w, water, rubberLoss };
  }

  /** Parrilla de una carrera: resultado de su clasificación. */
  grid(kind: SessionKind): number[] {
    const q = kind === "SPRINT" ? this.st.results.SQ : this.st.results.Q;
    const ids = q ? q.map((r) => r.id) : this.entrants().map((e) => e.id);
    const pen = kind === "RACE" ? this.penalties() : {};
    if (!Object.keys(pen).length) return ids;
    // los sancionados retroceden sus puestos; a igualdad, detrás del que no lo está
    return ids.map((id, i) => ({ id, k: i + (pen[id] ?? 0) + (pen[id] ? 0.5 : 0) })).sort((a, b) => a.k - b.k).map((x) => x.id);
  }

  /** Puestos de sanción en la parrilla de la carrera: unidades de potencia fuera del cupo y sanciones de la carrera anterior. */
  penalties(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [id, p] of Object.entries(this.st.pu ?? {})) { const n = puPenalty(p); if (n) out[Number(id)] = n; }
    for (const [id, g] of Object.entries(this.st.gridPens ?? {})) out[Number(id)] = (out[Number(id)] ?? 0) + g.places;
    return out;
  }

  build(kind: SessionKind, seedOffset = 0): Session {
    const { day, clock } = this.when(kind);
    const cond = this.conditions(day, clock);
    const rubber = Math.max(0, this.st.rubber - cond.rubberLoss);
    const sess = new Session({
      kind,
      seed: this.st.seed * 31 + this.sessions().indexOf(kind) * 7919 + seedOffset,
      track: this.track,
      entrants: this.entrants(),
      hidden: this.st.hidden,
      weather: cond.weather,
      water: cond.water,
      rubber,
      grid: isRaceKind(kind) ? this.grid(kind) : undefined,
      minutes: kind === "TEST" ? 480 : 60,
      laps: kind === "SPRINT" ? sprintLapsOf(this.def, this.track.length) : this.def.vueltas,
      sprintWeekend: this.st.sprint,
      setup: this.sessionSetup(kind),
      year: this.st.year,
      moral: this.st.moral,
      rivals: this.st.rivals,
      pkgTest: kind.startsWith("FP") ? this.st.pkgTest : undefined,
    });
    if (kind === "RACE") {
      for (const [id, p] of Object.entries(this.st.pu ?? {})) {
        const n = puPenalty(p);
        if (!n) continue;
        const c = sess.carById(Number(id));
        sess.log({ kind: "control", carId: c.id, important: c.player, text: `🔧 ${c.d.abrev} sale ${n} puestos atrás: unidad de potencia fuera del cupo` });
      }
      for (const [id, g] of Object.entries(this.st.gridPens ?? {})) {
        const c = sess.carById(Number(id));
        sess.log({ kind: "control", carId: c.id, important: c.player, text: `⚖️ ${c.d.abrev} sale ${g.places} puestos atrás: ${g.why} en la carrera anterior` });
      }
    }
    return sess;
  }

  /** Retoma una sesión a medias desde su instantánea (el estado del fin de semana ya es el suyo). */
  restore(snap: SessionSnapshot): Session {
    const kind = snap.kind;
    const cond = snapshotConditions(snap);
    const sess = new Session({
      kind,
      seed: this.st.seed * 31 + this.sessions().indexOf(kind) * 7919,
      track: this.track,
      entrants: this.entrants(),
      hidden: this.st.hidden,
      weather: cond.weather,
      water: cond.water,
      waterOff: cond.waterOff,
      rubber: snap.sess.rubber as number,
      minutes: kind === "TEST" ? 480 : 60,
      laps: kind === "SPRINT" ? sprintLapsOf(this.def, this.track.length) : this.def.vueltas,
      sprintWeekend: this.st.sprint,
      restore: true,
      setup: this.sessionSetup(kind),
      year: this.st.year,
      moral: this.st.moral,
      rivals: this.st.rivals,
      pkgTest: kind.startsWith("FP") ? this.st.pkgTest : undefined,
    });
    applySnapshot(sess, snap);
    return sess;
  }

  /** Cierra una sesión: guarda resultados, goma y devuelve juegos tras los libres. */
  finish(sess: Session) {
    this.st.results[sess.kind] = sess.results();
    if (this.st.pu) {
      for (const c of sess.cars) {
        const p = this.st.pu[c.id];
        if (!p) continue;
        const u = p.units[p.cur];
        u.km += c.puKm;
        if (c.puBroken) {
          u.broken = true;
          // rota antes de la carrera (en la sprint): otra usada si queda, si no una nueva
          if (sess.kind !== "RACE") { const spare = bestSpare(p); fitUnit(p, spare >= 0 ? spare : "new"); }
        }
      }
    }
    if (sess.longRuns.length) this.st.longRuns = { ...this.st.longRuns, [sess.kind]: sess.longRuns };
    const table = sess.pointsTable();
    if (table) this.st.scoring = { ...this.st.scoring, [sess.kind]: table };
    this.st.rubber = sess.rubber;
    if (sess.kind === "SPRINT" && this.st.setup) {
      // reglamento 2024-2026: tras la sprint se reabre el parque cerrado antes de la clasificación principal,
      // y las vueltas de la sprint afinan la estimación del reglaje
      for (const c of sess.cars) { const k = this.st.setup.teams[c.team.id]; if (k) k.laps += Math.round(c.sessionLaps * 0.5 || c.lapTimes.length * 0.5); }
      this.st.setup.locked = undefined;
    }
    if (sess.kind.startsWith("FP") && this.st.pkgTest) {
      const pl = (this.st.pkgLaps ??= { test: 0, other: 0 });
      for (const c of sess.cars) if (c.player) { pl.test += c.testLaps; pl.other += Math.max(0, c.sessionLaps - c.testLaps); }
    }
    if (isPracticeKind(sess.kind) && sess.kind !== "TEST") {
      // las vueltas de libres afinan lo que sabe cada equipo del reglaje
      if (this.st.setup) for (const c of sess.cars) { const k = this.st.setup.teams[c.team.id]; if (k) k.laps += c.sessionLaps; }
      // reglamento FIA: en fin de semana normal se devuelven 2 juegos de seco tras cada libre (6 en total → 7 para Q+carrera);
      // en sprint, 1 tras FP1 (quedan 11). Se priorizan los más usados sin tocar la reserva de carrera (≥1 H, ≥1 M y ≥3 M+H) ni los 4 blandos de Q.
      const n = this.st.sprint ? 1 : 2;
      for (const sets of Object.values(this.st.sets)) {
        for (let k = 0; k < n; k++) {
          const left = (c: Compound) => sets.filter((s) => !s.returned && s.c === c).length;
          const canReturn = (s: TyreSet) => {
            if (s.c === "H") return left("H") > 1 && left("M") + left("H") > 3;
            if (s.c === "M") return left("M") > 1 && left("M") + left("H") > 3;
            return left("S") > (this.st.sprint ? 3 : 4);
          };
          const dry = sets.filter((s) => !s.returned && DRY.includes(s.c));
          const pick = dry.filter((s) => s.laps > 0 && canReturn(s)).sort((a, b) => setWear(b) - setWear(a))[0]
            ?? dry.filter((s) => canReturn(s)).sort((a, b) => setWear(b) - setWear(a) || b.laps - a.laps)[0]
            ?? dry.filter((s) => s.laps > 0 && (s.c === "S" || left(s.c) > 1)).sort((a, b) => setWear(b) - setWear(a))[0]
            ?? dry.filter((s) => s.c === "S" || left(s.c) > 1).sort((a, b) => setWear(b) - setWear(a))[0];
          if (pick) pick.returned = true;
        }
      }
    }
    if (sess.kind === "Q" && !this.st.sprint) {
      // reglamento FIA: los 10 que pasan a Q3 devuelven un juego blando usado tras la clasificación (6 juegos de seco para carrera; P11-P22 conservan 7)
      for (const r of sess.results().slice(0, 10)) {
        if (r.part !== "Q3") continue;
        const sets = this.st.sets[r.id];
        if (!sets) continue;
        const softs = sets.filter((s) => !s.returned && s.c === "S");
        if (softs.length <= 1) continue;
        const used = softs.filter((s) => s.laps > 0).sort((a, b) => setWear(b) - setWear(a))[0];
        if (used) used.returned = true;
      }
    }
    for (const k of Object.values(this.st.knowledge)) { k.fc = null; k.profile = {}; }
    this.st.next++;
  }

  /** Previsión del meteorólogo para cada sesión pendiente (probabilidad de lluvia y temperatura). */
  outlook(quality: number): { kind: SessionKind; rain: number; air: [number, number]; track: number }[] {
    const rng = new Rng(this.st.seed ^ 0xf0ca);
    const miss = (1 - quality / 100) * 0.6;
    return this.sessions().slice(this.st.next).map((kind) => {
      const { day, clock } = this.when(kind);
      const truth = this.st.days[day].scenario;
      let rainy = 0;
      const temps: number[] = [];
      const tracks: number[] = [];
      const N = 16;
      const dur = isRaceKind(kind) ? 100 : kind === "Q" || kind === "SQ" ? 70 : 60;
      for (let i = 0; i < N; i++) {
        const sc: Scenario = rng.chance(miss) ? pickScenario(rng, this.def.clima) : truth;
        const w = createDayWeather(new Rng(rng.int(1, 1e9)), this.def.clima, sc, this.st.anomaly + rng.gauss(0, 1.5 * (1.3 - quality / 100)), 9 * 60);
        while (w.clock < clock) stepWeather(w, 3);
        temps.push(w.airT);
        tracks.push(w.trackT);
        let wet = false;
        for (let t = 0; t < dur && !wet; t += 3) {
          stepWeather(w, 3);
          for (const m of this.track.ms.filter((_, j) => j % 5 === 0)) if (rainAt(w, m.x / 1000, m.y / 1000) > 0.5) { wet = true; break; }
        }
        if (wet) rainy++;
      }
      temps.sort((a, b) => a - b);
      return { kind, rain: rainy / N, air: [temps[2], temps[N - 3]] as [number, number], track: tracks.reduce((a, b) => a + b, 0) / N };
    });
  }
}

/** Para guardar: quita lo que se puede recalcular. */
export function stripForSave(st: WeekendState): WeekendState {
  const knowledge: Record<string, TeamKnowledge> = {};
  for (const [k, v] of Object.entries(st.knowledge)) knowledge[k] = { ...v, fc: null, profile: {} };
  return { ...st, knowledge };
}
