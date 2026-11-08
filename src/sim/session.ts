// Motor de sesión: libres, clasificación (Q y SQ), sprint y carrera.
// Pasos de 0,05 s. Cada coche avanza sobre el perfil de velocidad de referencia, escalado por el
// tiempo que tardaría ÉL en ese minisector con su adherencia, potencia, resistencia y masa de ese
// instante. Aire sucio, rebufo, modo adelantamiento, tapones y adelantamientos salen de las
// distancias reales entre coches.
import { Rng, clamp } from "./rng";
import { Track, Minisector, msTimeAtGrip, MIN_MASS, REF_CAR } from "./track";
import { Compound, COMPOUNDS, DRY, HiddenTyre, TyreSet, setGrip, updateSet, axleGrip, warmBlankets, setWear } from "./tyres";
import { WeatherState, stepWeather, rainAt } from "./weather";
import { Plan, planStrategy, aiDecide, aiErs, TeamKnowledge, practiceProgram, qualiTick, pickSet, learnFromRun } from "./strategy";

export const PUSH_NAMES = ["Conservar", "Gestionar", "Normal", "Atacar", "Al límite"];
export const ENGINE_NAMES = ["Ahorro", "Normal", "Potencia"];
export const ERS_NAMES = ["Recargar", "Equilibrado", "Ataque", "Adelantar"];
const PUSH_GRIP = [0.983, 0.992, 1, 1.006, 1.011];
const PUSH_ENERGY = [0.74, 0.87, 1, 1.12, 1.25];
const PUSH_ERR = [0.45, 0.7, 1, 1.7, 2.8];
const PUSH_FUEL = [0.96, 0.98, 1, 1.015, 1.03];
const ENGINE_POWER = [-1.6, 0, 0.9];
const ENGINE_FUEL = [0.93, 1, 1.05];
const ENGINE_FAIL = [0.6, 1, 2.2];
const ERS_POWER = [-3.5, 0, 2.0, 4.5];
const ERS_NET = [1.1, 0, -0.9, -2.4];
export const SOC_MAX = 4;
const MO_POWER = 6; // % extra del modo adelantamiento (2026)

export type SessionKind = "FP1" | "FP2" | "FP3" | "SQ" | "Q" | "SPRINT" | "RACE";
export const SESSION_NAMES: Record<SessionKind, string> = {
  FP1: "Libres 1", FP2: "Libres 2", FP3: "Libres 3", SQ: "Clasificación sprint", Q: "Clasificación", SPRINT: "Sprint", RACE: "Carrera",
};
export const isRaceKind = (k: SessionKind) => k === "RACE" || k === "SPRINT";
export const isQualiKind = (k: SessionKind) => k === "Q" || k === "SQ";

export interface QPart { name: string; minutes: number; advance: number | null; compound?: Compound }
export const Q_PARTS: QPart[] = [
  { name: "Q1", minutes: 18, advance: 16 },
  { name: "Q2", minutes: 15, advance: 10 },
  { name: "Q3", minutes: 12, advance: null },
];
export const SQ_PARTS: QPart[] = [
  { name: "SQ1", minutes: 12, advance: 16, compound: "M" },
  { name: "SQ2", minutes: 10, advance: 10, compound: "M" },
  { name: "SQ3", minutes: 8, advance: null, compound: "S" },
];
const Q_BREAKS = [7, 8];
const SQ_BREAKS = [7, 5];

export interface TeamDef {
  id: string; nombre: string; motor: string; color: string;
  agarre: number; potencia: number; resistencia: number; desgaste: number;
  boxes: number; fiabilidad: number; estrategia: number; meteo: number;
  pilotos: DriverDef[];
}
export interface DriverDef {
  nombre: string; abrev: string; numero: number;
  ritmo: number; regularidad: number; neumaticos: number; lluvia: number;
  ataque: number; defensa: number; agresividad: number; salida: number;
}

/** Lo que dura todo el fin de semana: juegos de neumáticos y lo que sabe el equipo. */
export interface Entrant {
  id: number;
  d: DriverDef;
  team: TeamDef;
  player: boolean;
  sets: TyreSet[];
  knowledge: TeamKnowledge;
}

export type Loc = "garage" | "lane_out" | "track" | "lane_in" | "pit" | "out" | "fin";
export type RunPhase = "out" | "push" | "cool" | "in" | "long";
export interface Run {
  kind: "inst" | "qsim" | "long" | "quali";
  setId: string;
  pushLaps: number; // vueltas lanzadas (qsim/quali) o de tanda (long)
  fuel: number; // kg
  at?: number; // segundos de sesión a los que sale (programa)
}

export interface Car {
  id: number;
  e: Entrant;
  d: DriverDef;
  team: TeamDef;
  player: boolean;
  loc: Loc;
  s: number;
  gridS: number;
  v: number;
  retireReason?: string;
  tyres: TyreSet | null;
  usedCompounds: Set<Compound>;
  stops: number;
  fuel: number;
  soc: number;
  push: number;
  engine: number;
  ers: number;
  pitRequest: string | null; // id del juego a montar
  pit?: { noseChange: boolean; t: number; total: number; entryS: number; dist: number; stationary: number; setId: string; changed: boolean };
  lane?: { t: number; total: number }; // calle de boxes en libres/clasificación
  wing: number;
  floor: number;
  delay: number;
  msK: number;
  cross: number[];
  lapTimes: number[];
  lapStart: number;
  best: number; // mejor vuelta válida de la sesión (o de la parte en curso)
  bestByPart: number[];
  lapValid: boolean;
  noise: number;
  followGap: number;
  aheadId: number;
  drs: boolean; // modo adelantamiento activo (MO)
  drsEligible: boolean;
  grant: number;
  grantUntil: number;
  finishT: number;
  plan: Plan;
  lastPitLap: number;
  pace: number;
  wearMult: number;
  slowPuncture: boolean;
  autoPush: boolean;
  autoErs: boolean;
  auto: boolean; // en libres/clasificación: la IA lleva el programa
  letPass?: number;
  advice?: { lap: number; setId: string };
  // libres / clasificación
  run?: Run & { phase: RunPhase; done: number; startT: number; lapsData: number[] };
  queue: Run[];
  eliminated: boolean;
  elimPart?: number;
  qPlan?: { part: number; deps: number[] };
  sessionLaps: number;
  pitWhy?: string;
  stintW0: number; // desgaste del juego al montarlo
  stintL0: number; // vueltas que llevaba
  learnedLap: number;
}

export type FlagState = "green" | "vsc" | "sc" | "sc_in" | "red";

export interface RaceEvent {
  t: number;
  lap: number;
  text: string;
  kind: "radio" | "control" | "pit" | "info" | "weather" | "incident";
  carId?: number;
  pause?: boolean;
  important?: boolean;
}

export interface SessionOptions {
  kind: SessionKind;
  seed: number;
  track: Track;
  entrants: Entrant[];
  hidden: HiddenTyre;
  weather: WeatherState;
  water: number[];
  rubber: number;
  grid?: number[]; // ids de inscritos en orden de parrilla (carreras)
  minutes?: number; // libres
  laps?: number; // carreras
  sprintWeekend: boolean;
}

export interface ResultRow {
  id: number;
  pos: number;
  best: number;
  time: number; // carreras: tiempo total
  laps: number;
  status: "fin" | "out" | "dns" | "ok";
  reason?: string;
  stops: number;
  part?: string; // clasificación: en qué parte quedó
}

export class Session {
  kind: SessionKind;
  t = 0; // segundos de sesión (no avanza con bandera roja en clasificación)
  wall = 0; // segundos reales simulados (incluye pausas)
  dt = 0.05;
  track: Track;
  cars: Car[] = [];
  rng: Rng;
  weather: WeatherState;
  water: Float64Array;
  rubber: number;
  flag: FlagState = "green";
  flagTimer = 0;
  scLapsLeft = 0;
  drsEnabledFromLap = 3;
  events: RaceEvent[] = [];
  hidden: HiddenTyre;
  finished = false;
  chequered = false;
  leaderLap = 0;
  lapRefRace: number;
  secPerGrip: number;
  N: number;
  fuelPerLap: number;
  laps: number;
  durationS: number; // libres: duración; clasificación: duración de la parte
  parts: QPart[] = [];
  breaks: number[] = [];
  part = 0;
  partT = 0; // tiempo transcurrido en la parte
  inBreak = 0; // segundos de descanso entre partes
  sprintWeekend: boolean;
  leaderId = -1;
  onEvent?: (e: RaceEvent) => void;
  private weatherAcc = 0;
  private lastRainMsg = -999;
  private wasRaining = false;
  private tRef: number[];

  constructor(public opt: SessionOptions) {
    this.kind = opt.kind;
    this.track = opt.track;
    this.N = this.track.ms.length;
    this.rng = new Rng(opt.seed);
    this.weather = opt.weather;
    this.water = Float64Array.from(opt.water.length === this.N ? opt.water : new Array(this.N).fill(0));
    this.rubber = opt.rubber;
    this.hidden = opt.hidden;
    this.sprintWeekend = opt.sprintWeekend;
    this.lapRefRace = this.track.refLap;
    this.tRef = this.track.ms.map((m) => msTimeAtGrip(m, 1));
    let t0 = 0, t1 = 0;
    for (const m of this.track.ms) { t0 += msTimeAtGrip(m, 1); t1 += msTimeAtGrip(m, 0.99); }
    this.secPerGrip = t1 - t0;
    // 2026: ~70 kg para una carrera de 305 km
    this.fuelPerLap = (72 * this.track.length) / 305000;
    this.laps = opt.laps ?? this.track.laps;
    this.durationS = (opt.minutes ?? 60) * 60;
    if (this.kind === "Q") { this.parts = Q_PARTS; this.breaks = Q_BREAKS; }
    if (this.kind === "SQ") { this.parts = SQ_PARTS; this.breaks = SQ_BREAKS; }
    if (this.parts.length) this.durationS = this.parts[0].minutes * 60;

    for (const e of opt.entrants) {
      const d = e.d, team = e.team;
      const car: Car = {
        id: e.id, e, d, team, player: e.player,
        loc: "garage", s: 0, gridS: 0, v: 0,
        tyres: null, usedCompounds: new Set(), stops: 0,
        fuel: 20, soc: SOC_MAX * 0.95,
        push: 2, engine: 1, ers: 1, pitRequest: null,
        wing: 0, floor: 0, delay: 0, msK: -1, cross: [], lapTimes: [], lapStart: 0, best: Infinity, bestByPart: [], lapValid: true,
        noise: 0, followGap: 99, aheadId: -1, drs: false, drsEligible: false,
        grant: -1, grantUntil: 0, finishT: 0, plan: { stints: [] }, lastPitLap: -1,
        pace: 1 + (d.ritmo - 85) * 0.0007 + team.agarre / 180,
        wearMult: team.desgaste * (1.18 - d.neumaticos * 0.002),
        slowPuncture: false, autoPush: !e.player, autoErs: true, auto: true,
        queue: [], eliminated: false, sessionLaps: 0, stintW0: 0, stintL0: 0, learnedLap: -99,
      };
      this.cars.push(car);
    }
    if (isRaceKind(this.kind)) this.setupRace(opt.grid ?? opt.entrants.map((e) => e.id));
    else if (this.kind.startsWith("FP")) for (const c of this.cars) c.queue = practiceProgram(this, c);
  }

  get L() { return this.track.length; }
  carById(id: number) { return this.cars.find((c) => c.id === id)!; }

  log(e: Omit<RaceEvent, "t" | "lap">) {
    const ev = { ...e, t: this.t, lap: Math.max(1, this.leaderLap + 1) };
    this.events.push(ev);
    this.onEvent?.(ev);
  }

  rainOnTrack(): number {
    let r = 0;
    for (const m of this.track.ms) r += rainAt(this.weather, m.x / 1000, m.y / 1000);
    return r / this.N;
  }
  maxRainOnTrack(): number {
    let r = 0;
    for (const m of this.track.ms) r = Math.max(r, rainAt(this.weather, m.x / 1000, m.y / 1000));
    return r;
  }
  avgWater(): number {
    let w = 0;
    for (let i = 0; i < this.N; i++) w += this.water[i];
    return w / this.N;
  }
  sectorWater(): number[] {
    return [0, 1, 2].map((s) => {
      const ms = this.track.ms.filter((m) => m.sector === s);
      return ms.reduce((a, m) => a + this.water[m.i], 0) / ms.length;
    });
  }

  // ---------------------------------------------------------------- carrera
  private setupRace(grid: number[]) {
    const wet = this.avgWater();
    grid.forEach((id, i) => {
      const c = this.carById(id);
      c.loc = "track";
      c.gridS = -12 - i * 8;
      c.s = c.gridS;
      c.fuel = this.fuelPerLap * this.laps * this.rng.range(0.985, 1.01) + 0.8;
      if (c.player) c.fuel = this.fuelPerLap * this.laps + 0.5;
    });
    for (const c of this.cars) {
      if (!grid.includes(c.id)) { c.loc = "out"; c.retireReason = "no sale"; continue; }
      c.plan = planStrategy(this, c, c.e.knowledge, 0, null, 0, this.rng.fork());
      let start = c.plan.stints[0]?.c ?? "M";
      if (wet > 0.9) start = "W"; else if (wet > 0.2 && DRY.includes(start)) start = "I";
      const set = pickSet(c, start, true) ?? pickSet(c, start, false) ?? c.e.sets.find((s) => !s.returned && DRY.includes(s.c))!;
      this.mount(c, set);
    }
  }

  mount(c: Car, set: TyreSet) {
    warmBlankets(set);
    set.punctured = false;
    set.flatSpot = 0;
    c.tyres = set;
    c.usedCompounds.add(set.c);
    c.stintW0 = setWear(set);
    c.stintL0 = set.laps;
  }

  /** Cambia el neumático de salida (antes de la salida). */
  setStartTyre(c: Car, setId: string) {
    if (this.t > 0) return;
    const set = c.e.sets.find((s) => s.id === setId);
    if (!set) return;
    c.usedCompounds = new Set();
    this.mount(c, set);
    c.plan = planStrategy(this, c, c.e.knowledge, 0, set.c, 0, null);
  }
  setFuel(c: Car, marginLaps: number) {
    if (this.t > 0) return;
    c.fuel = this.fuelPerLap * (this.laps + marginLaps) + 0.5;
  }
  fuelMargin(c: Car) {
    return (c.fuel - 0.5) / this.fuelPerLap - this.laps;
  }

  /** Orden: carreras por distancia; libres/clasificación por mejor vuelta. */
  order(): Car[] {
    if (!isRaceKind(this.kind)) return this.timingOrder();
    return [...this.cars].sort((a, b) => {
      const fa = a.loc === "fin", fb = b.loc === "fin";
      if (fa && fb) return this.lapsDone(b) - this.lapsDone(a) || a.finishT - b.finishT;
      if (fa !== fb) {
        const la = this.lapsDone(a), lb = this.lapsDone(b);
        if (la !== lb) return lb - la;
        return fa ? -1 : 1;
      }
      const oa = a.loc === "out", ob = b.loc === "out";
      if (oa !== ob) return oa ? 1 : -1;
      return b.s - a.s;
    });
  }

  /** Orden de clasificación/libres: eliminados al final por su parte. */
  timingOrder(): Car[] {
    const p = this.part;
    return [...this.cars].sort((a, b) => {
      if (this.parts.length) {
        const la = a.eliminated ? a.elimPart! : p, lb = b.eliminated ? b.elimPart! : p;
        if (la !== lb) return lb - la;
        const ta = a.bestByPart[la] ?? Infinity, tb = b.bestByPart[lb] ?? Infinity;
        if (ta !== tb) return ta - tb;
        // sin tiempo en esta parte: por la parte anterior
        for (let k = la - 1; k >= 0; k--) {
          const pa = a.bestByPart[k] ?? Infinity, pb = b.bestByPart[k] ?? Infinity;
          if (pa !== pb) return pa - pb;
        }
        return a.id - b.id;
      }
      if (a.best !== b.best) return a.best - b.best;
      return a.id - b.id;
    });
  }

  lapsDone(c: Car) { return Math.max(0, Math.floor(c.s / this.L)); }

  gapBetween(ahead: Car, behind: Car): number {
    const k = behind.msK;
    if (k < 0) return 0;
    const ta = ahead.cross[k], tb = behind.cross[k];
    if (ta === undefined || tb === undefined) return 0;
    return tb - ta;
  }

  /** Tiempo restante de la sesión o de la parte (s). */
  remaining(): number {
    if (isRaceKind(this.kind)) return 0;
    return Math.max(0, this.durationS - this.partT);
  }

  // ------------------------------------------------------------------ paso
  step() {
    if (this.finished) return;
    const dt = this.dt;
    this.wall += dt;
    this.weatherAcc += dt;
    if (this.weatherAcc >= 5) {
      stepWeather(this.weather, this.weatherAcc / 60);
      this.updateWater(this.weatherAcc);
      this.weatherAcc = 0;
      this.weatherRadio();
    }
    if (this.inBreak > 0) {
      this.inBreak -= dt;
      if (this.inBreak <= 0) this.startPart();
      return;
    }
    if (this.flag === "red") {
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) {
        this.flag = "green";
        this.log({ kind: "control", text: "🟢 Se reanuda la sesión. Pit-lane abierto.", important: true, pause: true });
      }
      return;
    }
    this.t += dt;
    if (!isRaceKind(this.kind)) this.partT += dt;
    this.updateFlags(dt);

    let leader: Car | null = null;
    for (const c of this.cars) if ((c.loc === "track" || c.loc === "pit") && (!leader || c.s > leader.s)) leader = c;
    this.leaderId = leader ? leader.id : -1;

    for (const c of this.cars) {
      if (c.loc === "track") this.moveCar(c, dt);
      else if (c.loc === "pit") this.pitStep(c, dt);
      else if (c.loc === "lane_out" || c.loc === "lane_in") this.laneStep(c, dt);
    }
    this.interactions();
    if (!isRaceKind(this.kind)) this.sessionTick();

    if (isRaceKind(this.kind) && this.cars.every((c) => c.loc === "fin" || c.loc === "out")) {
      this.finished = true;
      this.log({ kind: "control", text: `🏁 ${SESSION_NAMES[this.kind]} terminada`, important: true, pause: true });
    }
  }

  private updateWater(dtS: number) {
    const w = this.weather;
    const evap = 2.2e-5 * (1 + (w.trackT - 20) / 15) * (1 + w.surfaceWind / 20) * (1 - 0.5 * w.cloud);
    let raining = 0;
    for (let i = 0; i < this.N; i++) {
      const m = this.track.ms[i];
      const r = rainAt(w, m.x / 1000, m.y / 1000);
      raining += r;
      const d = this.water[i];
      const dd = r / 3600 - 9e-4 * d * (1 + d / 2) - (d > 0 ? evap : 0);
      this.water[i] = clamp(d + dd * dtS, 0, 4);
    }
    raining /= this.N;
    if (raining > 0.5) this.rubber = Math.max(0, this.rubber - 0.0004 * raining * dtS);
  }

  private weatherRadio() {
    const r = this.maxRainOnTrack();
    const now = r > 0.4;
    if (now && !this.wasRaining && this.wall - this.lastRainMsg > 120) {
      this.lastRainMsg = this.wall;
      const wet = this.track.ms.filter((m) => rainAt(this.weather, m.x / 1000, m.y / 1000) > 0.3);
      const secs = [...new Set(wet.map((m) => m.sector + 1))].join(" y ");
      const all = wet.length > this.N * 0.8;
      this.log({ kind: "weather", text: all ? `🌧️ Empieza a llover en todo el circuito (${r.toFixed(1)} mm/h)` : `🌧️ Lluvia en el sector ${secs}; el resto sigue seco`, pause: true, important: true });
    }
    if (!now && this.wasRaining && this.wall - this.lastRainMsg > 120) {
      this.lastRainMsg = this.wall;
      this.log({ kind: "weather", text: "🌤️ Deja de llover. La pista empezará a secarse por la trazada.", pause: true, important: true });
    }
    this.wasRaining = now;
  }

  private updateFlags(dt: number) {
    if (this.flag === "vsc") {
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) {
        this.flag = "green";
        this.log({ kind: "control", text: "🟢 Fin del coche de seguridad virtual", important: true });
      }
    }
  }

  private deploy(kind: "vsc" | "sc", why: string) {
    if (this.chequered || this.flag === "sc" || this.flag === "red") return;
    if (kind === "vsc" && this.flag === "vsc") { this.flagTimer += 40; return; }
    this.flag = kind;
    if (kind === "vsc") {
      this.flagTimer = this.rng.range(90, 200);
      this.log({ kind: "control", text: `🟡 COCHE DE SEGURIDAD VIRTUAL — ${why}`, pause: true, important: true });
    } else {
      this.scLapsLeft = this.rng.int(3, 5);
      this.log({ kind: "control", text: `🟨 COCHE DE SEGURIDAD — ${why}`, pause: true, important: true });
    }
  }

  private redFlag(why: string) {
    if (this.flag === "red" || this.remaining() <= 0) return;
    this.flag = "red";
    this.flagTimer = this.rng.range(240, 600);
    this.log({ kind: "control", text: `🟥 BANDERA ROJA — ${why}. Todos a boxes.`, pause: true, important: true });
    for (const c of this.cars) if (c.loc === "track" || c.loc === "lane_out" || c.loc === "lane_in") this.toGarage(c);
  }

  private incident(c: Car, why: string, severity: number) {
    if (!isRaceKind(this.kind)) {
      if (this.rng.chance(0.3 + 0.6 * severity)) this.redFlag(why);
      else this.log({ kind: "control", text: `⚠️ Bandera amarilla: ${why}` });
      return;
    }
    const r = this.rng.next();
    if (r < 0.25 + 0.4 * severity) this.deploy("sc", why);
    else if (r < 0.55 + 0.35 * severity) this.deploy("vsc", why);
    else this.log({ kind: "control", text: `⚠️ Bandera amarilla: ${why}` });
  }

  private retire(c: Car, reason: string, severity: number) {
    c.loc = "out";
    c.retireReason = reason;
    c.v = 0;
    c.run = undefined;
    c.queue = [];
    this.log({ kind: "incident", text: `❌ ${c.d.abrev} ${isRaceKind(this.kind) ? "abandona" : "se queda fuera"}: ${reason}`, carId: c.id, important: true, pause: c.player });
    this.incident(c, `${c.d.abrev} (${reason})`, severity);
  }

  /** Tiempo objetivo del coche en un minisector, con su estado actual. */
  msTime(c: Car, m: Minisector, water: number): { t: number; grip: number } {
    const tyres = c.tyres!;
    const wetSkill = water > 0.1 ? 1 + (c.d.lluvia - 80) * 0.0009 * Math.min(1, water / 0.6) : 1;
    let grip = setGrip(tyres, water) * c.pace * wetSkill * PUSH_GRIP[c.push] * (1 + 0.018 * this.rubber) * (1 - c.wing - c.floor);
    if (c.followGap < 1.6 && c.aheadId >= 0) grip *= 1 - 0.045 * (1 - c.followGap / 1.6) * m.cornerSens;
    let t = msTimeAtGrip(m, grip);
    const scale = t / this.tRef[m.i];
    let power = c.team.potencia * 0.6 + ENGINE_POWER[c.engine] + (c.soc > 0.05 || c.ers === 0 ? ERS_POWER[c.ers] : -3.5);
    if (c.drs && m.drs) power += MO_POWER;
    let dragCut = -c.team.resistencia;
    if (c.followGap < 1.2) dragCut += 7 * (1 - c.followGap / 1.2) * m.throttle;
    t -= scale * (m.dPower * power + m.dDrag * dragCut);
    t += m.dMass * (MIN_MASS + c.fuel - REF_CAR.mass);
    t *= 1 + c.noise;
    return { t, grip };
  }

  /** Factor de ritmo según la fase de la tanda (libres/clasificación). */
  private phaseScale(c: Car): { speed: number; energy: number } {
    const ph = c.run?.phase;
    if (ph === "out") return { speed: 0.86, energy: 1.0 };
    if (ph === "cool") return { speed: 0.8, energy: 0.55 };
    if (ph === "in") return { speed: 0.84, energy: 0.6 };
    return { speed: 1, energy: 1 };
  }

  private moveCar(c: Car, dt: number) {
    const L = this.L;
    const pos = ((c.s % L) + L) % L;
    const msI = this.msIndexAt(c.s);
    const m = this.track.ms[msI];
    const water = this.water[m.i];
    const { t } = this.msTime(c, m, water);
    const pi = Math.min(this.track.vref.length - 1, Math.floor(pos / this.track.ds));
    const ph = this.phaseScale(c);
    let v = this.track.vref[pi] * (this.tRef[m.i] / t) * ph.speed;

    if (isRaceKind(this.kind) && this.lapsDone(c) === 0 && c.s < 400) v = Math.min(v, Math.sqrt(2 * 11 * Math.max(0.3, c.s - c.gridS + 0.3)));
    if (this.flag === "vsc") v = Math.min(v, this.track.vref[pi] * 0.6);
    if (this.flag === "sc" || this.flag === "sc_in") {
      const cap = this.track.vref[pi] * (c.followGap > 1.0 || c.aheadId < 0 ? 0.62 : 0.5);
      v = Math.min(v, Math.min(cap, 62));
      if (c.id === this.leaderId) v = Math.min(v, this.track.vref[pi] * 0.5, 50);
    }
    if (c.slowPuncture || c.tyres!.punctured) v = Math.min(v, 28);
    let move = v * dt;
    if (c.delay > 0) {
      const lose = Math.min(c.delay, dt * 0.6);
      c.delay -= lose;
      move *= 1 - lose / dt;
    }
    c.v = v;
    const oldS = c.s;
    c.s += move;

    const relE = (e: number) => (e / this.tRef[m.i]) * this.lapRefRace;
    const slow = this.flag !== "green" ? 0.35 : ph.energy;
    updateSet(c.tyres!, {
      trackT: this.weather.trackT, airT: this.weather.airT, water,
      eF: relE(m.energyF) * slow * (c.followGap < 1.2 ? 1 + 0.12 * (1 - c.followGap / 1.2) * m.cornerSens : 1),
      eR: relE(m.energyR) * slow,
      push: PUSH_ENERGY[c.push], carWear: c.wearMult, abrasiveness: this.track.abrasiveness,
    }, dt, this.lapRefRace, this.hidden);
    const underFlag = this.flag !== "green" || ph.speed < 1;
    c.fuel -= (this.fuelPerLap * ENGINE_FUEL[c.engine] * PUSH_FUEL[c.push] * (underFlag ? 0.5 : 1) * move) / L;
    if (!underFlag) c.soc = clamp(c.soc + (ERS_NET[c.ers] / this.lapRefRace) * dt, 0, SOC_MAX);
    else c.soc = clamp(c.soc + (1.5 / this.lapRefRace) * dt, 0, SOC_MAX);
    if (c.fuel <= 0) { c.fuel = 0; this.retire(c, "sin combustible", 0.2); return; }

    const wmax = setWear(c.tyres!);
    if (!c.tyres!.punctured && wmax > 0.96 && this.rng.chance(dt * 0.02 * (wmax - 0.95) * 20)) {
      c.tyres!.punctured = true;
      if (isRaceKind(this.kind) && !c.pitRequest) c.pitRequest = this.bestSetFor(c, this.avgWater() > 0.9 ? "W" : this.avgWater() > 0.2 ? "I" : "M")?.id ?? null;
      if (c.run) c.run.phase = "in";
      this.log({ kind: "incident", text: `💥 ¡Pinchazo de ${c.d.abrev}! Vuelve a boxes.`, carId: c.id, important: true, pause: c.player });
    }

    const newK = Math.floor(c.s / L) * this.N + this.msIndexAt(c.s);
    if (c.s >= 0 && newK > c.msK) {
      for (let k = c.msK + 1; k <= newK; k++) {
        const bS = Math.floor(k / this.N) * L + this.track.ms[k % this.N].s0;
        const frac = clamp((bS - oldS) / Math.max(1e-6, c.s - oldS), 0, 1);
        c.cross[k] = this.t - dt + frac * dt;
        this.onMsEnter(c, k);
        if (c.loc !== "track") return;
      }
      c.msK = newK;
    }
    const prevPos = ((oldS % L) + L) % L;
    const newPos = ((c.s % L) + L) % L;
    const passedEntry = prevPos < this.track.pit.entry && (newPos >= this.track.pit.entry || newPos < prevPos);
    if (passedEntry && oldS > 0) {
      if (isRaceKind(this.kind)) { if (c.pitRequest && !this.chequered) this.enterPit(c, oldS); }
      else if (c.run?.phase === "in") this.enterLaneIn(c);
    }
  }

  msIndexAt(s: number) {
    const pos = ((s % this.L) + this.L) % this.L;
    const pi = Math.min(this.track.msOfPoint.length - 1, Math.floor(pos / this.track.ds));
    return this.track.msOfPoint[pi];
  }

  private onMsEnter(c: Car, k: number) {
    const ms = k % this.N;
    const m = this.track.ms[ms];
    const sigma = 0.0035 * (1.25 - c.d.regularidad / 100) * (1 + this.water[ms] * 0.6);
    c.noise = this.rng.gauss(0, sigma);

    if (ms === 0) {
      const lap = k / this.N;
      if (isRaceKind(this.kind)) this.raceLine(c, k, lap);
      else this.sessionLine(c, k);
      if (c.loc !== "track") return;
    }
    if (m.drsDetect) {
      c.drsEligible = isRaceKind(this.kind) && this.flag === "green" && this.leaderLap + 1 >= this.drsEnabledFromLap && c.followGap < 1.0 && this.avgWater() < 0.35;
    }
    if (m.drs) c.drs = c.drsEligible;
    else if (!m.drsDetect) c.drs = false;

    if (isRaceKind(this.kind)) {
      if (ms === this.N - 3 && !c.player) aiDecide(this, c);
      if (ms === this.N - 3 && c.player) this.playerAdvice(c);
    }
    aiErs(this, c);
    if (this.flag !== "green") return;
    const pushing = !c.run || c.run.phase === "push" || c.run.phase === "long";
    if (pushing) this.errorCheck(c, m);
    if (isRaceKind(this.kind)) this.overtakeCheck(c, m);
    // límites de pista en vuelta lanzada
    if (c.run?.phase === "push" && c.lapValid && m.cornerSens > 0.5 && this.rng.chance(0.0016 * PUSH_ERR[c.push])) {
      c.lapValid = false;
      if (c.player || this.isTop(c)) this.log({ kind: "control", text: `🚩 Vuelta anulada a ${c.d.abrev}: límites de pista en el sector ${m.sector + 1}`, carId: c.id, important: c.player });
    }
  }

  private isTop(c: Car) { return this.timingOrder().indexOf(c) < 3; }

  // ------------------------------------------------------------ meta: carrera
  private raceLine(c: Car, k: number, lap: number) {
    if (lap >= 1) {
      const lt = c.cross[k] - c.lapStart;
      c.lapTimes.push(lt);
      if (lap > 1 && lt < c.best) c.best = lt;
      c.tyres!.laps++;
      c.lapStart = c.cross[k];
    }
    if (lap > this.leaderLap) {
      this.leaderLap = lap;
      this.onLeaderLap(lap);
    }
    if (this.chequered && lap >= 1) {
      c.loc = "fin";
      c.finishT = c.cross[k];
      if (c.player) this.log({ kind: "info", text: `🏁 ${c.d.abrev} termina P${this.order().indexOf(c) + 1}`, carId: c.id, important: true });
      return;
    }
    this.lapChecks(c, lap);
  }

  private onLeaderLap(lap: number) {
    if (lap >= this.laps && !this.chequered) {
      this.chequered = true;
      this.log({ kind: "control", text: "🏁 Bandera a cuadros", important: true });
      return;
    }
    if (this.flag === "sc") {
      this.scLapsLeft--;
      if (this.scLapsLeft <= 0) {
        this.flag = "sc_in";
        this.log({ kind: "control", text: "🟨 El coche de seguridad entra al final de esta vuelta", important: true });
      }
    } else if (this.flag === "sc_in") {
      this.flag = "green";
      this.drsEnabledFromLap = lap + 3;
      this.log({ kind: "control", text: "🟢 ¡Relanzada! Bandera verde.", important: true, pause: true });
    }
    // lluvia torrencial: coche de seguridad
    if (this.avgWater() > 2.3 && this.flag === "green") this.deploy("sc", "lluvia torrencial");
    for (const c of this.cars) {
      if (c.loc !== "track") continue;
      const hz = (1 / 2600) * c.team.fiabilidad * ENGINE_FAIL[c.engine] * (1 + c.floor * 5);
      if (this.rng.chance(hz)) {
        const what = this.rng.pick(["motor", "caja de cambios", "hidráulica", "fallo eléctrico", "frenos", "batería"]);
        this.retire(c, `avería (${what})`, this.rng.range(0, 0.6));
      }
    }
  }

  private lapChecks(c: Car, lap: number) {
    if (!c.player || !c.tyres) return;
    const t = c.tyres;
    const wear = setWear(t);
    const sp = COMPOUNDS[t.c];
    if (wear > sp.cliff - 0.06 && wear < sp.cliff + 0.02 && !c.pitRequest) {
      this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Los neumáticos se están acabando, noto cómo caen."`, pause: true, important: true });
    }
    if (t.F.grain > 0.35 || t.R.grain > 0.35) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Mucho graining en los ${t.F.grain > t.R.grain ? "delanteros" : "traseros"}."` });
    if (t.F.blister > 0.25 || t.R.blister > 0.25) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ampollas en los ${t.F.blister > t.R.blister ? "delanteros" : "traseros"} de ${c.d.abrev}.`, important: true });
    const lapsLeft = this.laps - lap;
    const fuelLaps = c.fuel / this.fuelPerLap;
    if (lapsLeft > 3 && fuelLaps < lapsLeft - 0.3 && lap % 3 === 0) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev} va ${(lapsLeft - fuelLaps).toFixed(1)} vueltas corto de combustible. Hay que ahorrar.`, important: true });
  }

  private playerAdvice(c: Car) {
    if (c.pitRequest) return;
    const sugg = aiDecide(this, c, true);
    const lap = this.lapsDone(c);
    if (sugg && c.advice && this.carSetCompound(c, c.advice.setId) === this.carSetCompound(c, sugg) && lap - c.advice.lap < 3) return;
    if (sugg) {
      c.advice = { lap, setId: sugg };
      const set = c.e.sets.find((s) => s.id === sugg)!;
      this.log({ kind: "radio", carId: c.id, text: `🧠 Estratega: ${c.d.abrev}, recomendaría parar ESTA vuelta y montar ${COMPOUNDS[set.c].name.toLowerCase()} (${set.laps ? `usado, ${set.laps} v` : "nuevo"}).`, pause: true, important: true });
    }
  }
  private carSetCompound(c: Car, id: string) { return c.e.sets.find((s) => s.id === id)?.c; }

  /** El mejor juego disponible de un compuesto (nuevo primero, luego el menos gastado). */
  bestSetFor(c: Car, comp: Compound): TyreSet | undefined {
    return c.e.sets.filter((s) => s.c === comp && !s.returned && s !== c.tyres && !s.punctured).sort((a, b) => setWear(a) - setWear(b))[0];
  }

  // ------------------------------------------------------ meta: libres / Q
  private sessionLine(c: Car, k: number) {
    const run = c.run;
    if (!run) return;
    c.tyres!.laps++;
    c.sessionLaps++;
    this.rubber = Math.min(1, this.rubber + 0.0009);
    const wasPush = run.phase === "push" || run.phase === "long";
    if (wasPush && c.lapStart > 0) {
      const lt = c.cross[k] - c.lapStart;
      c.lapTimes.push(lt);
      run.lapsData.push(lt);
      if (c.lapValid) {
        const p = this.part;
        const prevBest = c.bestByPart[p] ?? Infinity;
        if (lt < c.best) c.best = lt;
        if (lt < prevBest) c.bestByPart[p] = lt;
        if (run.phase === "push") this.lapRadio(c, lt);
      } else if (c.player) {
        this.log({ kind: "info", text: `${c.d.abrev}: vuelta de ${fmt(lt)} anulada`, carId: c.id });
      }
      run.done++;
    }
    c.lapStart = c.cross[k];
    c.lapValid = true;
    // fase siguiente
    if (run.phase === "out") run.phase = run.kind === "long" ? "long" : run.kind === "inst" ? "in" : "push";
    else if (run.phase === "push") {
      if (run.done >= run.pushLaps || this.remaining() <= 0) run.phase = "in";
      else run.phase = run.kind === "quali" && run.pushLaps > 1 && this.rng.chance(0.5) ? "push" : "cool";
    } else if (run.phase === "cool") run.phase = this.remaining() > 0 ? "push" : "in";
    else if (run.phase === "long" && (run.done >= run.pushLaps || this.remaining() <= 0)) run.phase = "in";
    // la vuelta lanzada que empieza con el reloj a cero no cuenta
    if ((run.phase === "push" || run.phase === "long") && this.remaining() <= 0) run.phase = "in";
    if (run.phase === "push") c.push = 4;
    else if (run.phase === "long") c.push = 2;
  }

  private lapRadio(c: Car, lt: number) {
    const ord = this.timingOrder();
    const pos = ord.indexOf(c) + 1;
    const p1 = ord[0];
    const pb = p1 === c ? "" : ` (+${(lt - (this.parts.length ? p1.bestByPart[this.part] : p1.best)).toFixed(3)})`;
    const purple = p1 === c && lt === (this.parts.length ? c.bestByPart[this.part] : c.best);
    if (c.player || pos <= 3) this.log({ kind: "info", text: `⏱️ ${c.d.abrev} ${fmt(lt)} — P${pos}${purple ? " 🟪" : pb}`, carId: c.id, important: c.player });
  }

  /** Lógica de sesión: salidas de garaje, reloj, partes de la clasificación. */
  private sessionTick() {
    if (this.flag === "red") return;
    // salidas programadas / IA
    for (const c of this.cars) {
      if (c.loc !== "garage" || c.eliminated) continue;
      if (this.remaining() <= 0) continue;
      if (this.parts.length) { if (c.auto) qualiTick(this, c); }
      else if (c.queue.length) {
        const next = c.queue[0];
        if ((next.at ?? 0) <= this.partT) {
          c.queue.shift();
          this.startRun(c, next);
        }
      }
    }
    // fin de la sesión / parte
    if (this.remaining() <= 0 && !this.chequered) {
      this.chequered = true;
      this.log({ kind: "control", text: `🏁 Bandera a cuadros${this.parts.length ? ` en ${this.parts[this.part].name}` : ""}`, important: true });
      for (const c of this.cars) {
        if (c.loc === "lane_out") this.toGarage(c);
        else if (c.run && c.run.phase !== "push" && c.run.phase !== "long") c.run.phase = "in";
      }
    }
    if (this.chequered && this.cars.every((c) => c.loc === "garage" || c.loc === "out")) this.endPart();
  }

  startRun(c: Car, run: Run) {
    if (c.loc !== "garage" || this.flag === "red" || this.remaining() <= 0) return false;
    const set = c.e.sets.find((s) => s.id === run.setId && !s.returned);
    if (!set) return false;
    const part = this.parts[this.part];
    if (part?.compound && set.c !== part.compound && this.avgWater() < 0.2) return false;
    this.mount(c, set);
    c.fuel = run.fuel;
    c.run = { ...run, phase: "out", done: 0, startT: this.t, lapsData: [] };
    c.loc = "lane_out";
    c.lane = { t: 0, total: this.track.pit.laneLength / 2 / this.track.pit.limit };
    c.push = 2;
    c.wing = 0;
    c.slowPuncture = false;
    return true;
  }

  private laneStep(c: Car, dt: number) {
    const l = c.lane!;
    l.t += dt;
    c.v = this.track.pit.limit;
    if (l.t < l.total) return;
    if (c.loc === "lane_out") {
      c.loc = "track";
      const base = (Math.floor(Math.max(0, c.s) / this.L) + 1) * this.L;
      c.s = base + this.track.pit.exit;
      c.msK = Math.floor(c.s / this.L) * this.N + this.msIndexAt(c.s);
      c.lapStart = 0;
      c.lapValid = true;
    } else this.toGarage(c);
  }

  private enterLaneIn(c: Car) {
    c.loc = "lane_in";
    c.lane = { t: 0, total: this.track.pit.laneLength / 2 / this.track.pit.limit };
  }

  toGarage(c: Car) {
    const run = c.run;
    if (run && c.tyres) {
      c.tyres.laps++;
      if (run.kind === "long" || run.lapsData.length >= 3) learnFromRun(this, c, run);
    }
    c.loc = "garage";
    c.run = undefined;
    c.tyres = null;
    c.v = 0;
    c.followGap = 99;
    c.aheadId = -1;
  }

  /** Vuelve a boxes (el jugador aborta). */
  abortRun(c: Car) {
    if (c.run) c.run.phase = "in";
  }

  private endPart() {
    if (!this.parts.length) {
      this.finished = true;
      this.log({ kind: "control", text: `🏁 ${SESSION_NAMES[this.kind]} terminada`, important: true, pause: true });
      return;
    }
    const part = this.parts[this.part];
    const ord = this.timingOrder().filter((c) => !c.eliminated);
    if (part.advance !== null) {
      ord.forEach((c, i) => {
        if (i >= part.advance!) {
          c.eliminated = true;
          c.elimPart = this.part;
          if (c.player) this.log({ kind: "info", text: `❌ ${c.d.abrev} eliminado en ${part.name} (P${i + 1})`, carId: c.id, important: true });
        }
      });
      const out = ord.slice(part.advance).map((c) => c.d.abrev).join(", ");
      this.log({ kind: "control", text: `Eliminados en ${part.name}: ${out}`, important: true, pause: true });
      this.inBreak = this.breaks[this.part] * 60;
      this.part++;
      this.chequered = false;
      this.partT = 0;
      this.durationS = this.parts[this.part].minutes * 60;
    } else {
      this.finished = true;
      const pole = ord[0];
      this.log({ kind: "control", text: `🏆 POLE para ${pole.d.nombre} (${pole.team.nombre}) ${fmt(pole.bestByPart[this.part])}`, important: true, pause: true });
    }
  }

  private startPart() {
    this.inBreak = 0;
    this.log({ kind: "control", text: `🟢 Empieza la ${this.parts[this.part].name}`, important: true, pause: true });
  }

  // ------------------------------------------------------------ incidencias
  private errorCheck(c: Car, m: Minisector) {
    if (m.cornerSens < 0.35) return;
    const water = this.water[m.i];
    const tyres = c.tyres!;
    const sp = COMPOUNDS[tyres.c];
    const coldF = Math.max(0, sp.opt - 20 - tyres.F.tBulk) / 20;
    const deficit = Math.max(0, 0.9 - setGrip(tyres, water) / sp.base) * 5;
    let p = 1.1e-4 * PUSH_ERR[c.push] * (1 + (85 - c.d.regularidad) / 25) * (1 + deficit + coldF);
    p *= 1 + 3.5 * Math.min(1, water) * (1.3 - c.d.lluvia / 100);
    if (isRaceKind(this.kind) && this.lapsDone(c) === 0) p *= 2;
    if (!this.rng.chance(p * m.cornerSens * 2)) return;
    const r = this.rng.next();
    const crashP = 0.05 + 0.06 * Math.min(1, water);
    if (r < crashP) {
      this.retire(c, "accidente", 0.7);
    } else if (r < crashP + 0.2) {
      const loss = this.rng.range(1.8, 6);
      c.delay += loss;
      c.lapValid = false;
      let dmg = "";
      if (this.rng.chance(0.15)) { c.wing += this.rng.range(0.008, 0.03); dmg = " y daña el alerón"; }
      this.log({ kind: "incident", text: `↩️ ${c.d.abrev} se sale de pista en el sector ${m.sector + 1}${dmg} (−${loss.toFixed(1)} s)`, carId: c.id, important: c.player });
    } else if (r < crashP + 0.35) {
      c.delay += this.rng.range(0.3, 0.8);
      tyres.flatSpot = Math.min(1, tyres.flatSpot + this.rng.range(0.3, 0.8));
      if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "He bloqueado, tengo un plano en el delantero."` });
    } else {
      c.delay += this.rng.range(0.15, 0.6);
    }
  }

  private overtakeCheck(c: Car, m: Minisector) {
    if (c.aheadId < 0 || c.followGap > 0.45) return;
    const a = this.carById(c.aheadId);
    if (a === c || a.loc !== "track") return;
    const lapped = this.lapsDone(c) > this.lapsDone(a) || c.s - a.s > this.L * 0.5;
    if (a.s - c.s > this.L * 0.5) return;
    if (lapped) {
      if (this.rng.chance(0.55)) this.grantPass(c, a, this.rng.range(0.2, 0.6));
      return;
    }
    if (a.team === c.team && a.letPass === c.id) {
      this.grantPass(c, a, 0.4);
      a.letPass = undefined;
      this.log({ kind: "info", text: `🔁 ${a.d.abrev} deja pasar a ${c.d.abrev}`, carId: c.id });
      return;
    }
    const lap1 = this.lapsDone(c) === 0;
    const zone = m.overtake > 0 ? m.overtake : lap1 ? 0.12 : 0.025;
    const water = this.water[m.i];
    const tc = this.msTime(c, m, water).t, ta = this.msTime(a, m, water).t;
    const prev = this.track.ms[(m.i - 1 + this.N) % this.N];
    const tcp = this.msTime(c, prev, this.water[prev.i]).t;
    const saved = { fg: a.followGap, drs: a.drs };
    a.followGap = 99; a.drs = false;
    const tap = this.msTime(a, prev, this.water[prev.i]).t;
    a.followGap = saved.fg; a.drs = saved.drs;
    const delta = ta - tc + (tap - tcp);
    const skill = (c.d.ataque - a.d.defensa) / 100;
    const ersEdge = (ERS_POWER[c.ers] - ERS_POWER[a.ers]) * 0.02;
    const x = delta * 9 + skill * 1.5 + ersEdge - 1.6 + zone * 2.2 - (1 - zone) * 0.4;
    const p = zone * (1 / (1 + Math.exp(-x)));
    if (!this.rng.chance(Math.min(0.85, p * 2.2))) return;
    const contactP = 0.01 * (0.5 + c.d.agresividad / 100) * (0.5 + a.d.agresividad / 120) * (lap1 ? 2.5 : 1) * (1 + Math.min(1, water) * 1.5);
    if (this.rng.chance(contactP)) return this.contact(c, a);
    this.grantPass(c, a, this.rng.range(0.1, 0.35));
    const pos = this.order().indexOf(c) + 1;
    if (c.player || a.player || pos <= 3) this.log({ kind: "info", text: `⚔️ ${c.d.abrev} adelanta a ${a.d.abrev} por la P${Math.max(1, pos - 1)}`, carId: c.id });
  }

  /** Permiso para pasar: el de delante cede (pierde algo de tiempo) y el otro pasa por velocidad. */
  private grantPass(c: Car, a: Car, lossA: number) {
    if (c.grant === a.id && this.t < c.grantUntil) return;
    c.grant = a.id;
    c.grantUntil = this.t + 8;
    a.delay += lossA;
  }

  private contact(c: Car, a: Car) {
    const r = this.rng.next();
    if (r < 0.4) {
      c.wing += this.rng.range(0.01, 0.035);
      c.delay += this.rng.range(0.5, 2);
      this.log({ kind: "incident", text: `💢 Toque entre ${c.d.abrev} y ${a.d.abrev}: ${c.d.abrev} daña el alerón delantero`, carId: c.id, important: c.player || a.player, pause: c.player || a.player });
    } else if (r < 0.62) {
      const victim = this.rng.chance(0.5) ? a : c;
      victim.slowPuncture = true;
      victim.pitRequest = victim.pitRequest ?? this.bestSetFor(victim, this.avgWater() > 0.3 ? "I" : "M")?.id ?? null;
      this.log({ kind: "incident", text: `💥 Toque ${c.d.abrev}–${a.d.abrev}: pinchazo para ${victim.d.abrev}`, carId: victim.id, important: true, pause: victim.player });
    } else if (r < 0.93) {
      c.delay += this.rng.range(2, 5);
      a.delay += this.rng.range(2, 5);
      this.log({ kind: "incident", text: `💢 ${c.d.abrev} y ${a.d.abrev} se tocan y se van largos`, carId: c.id, important: c.player || a.player });
    } else {
      const victim = this.rng.chance(0.5) ? a : c;
      this.retire(victim, `accidente con ${victim === a ? c.d.abrev : a.d.abrev}`, 0.8);
    }
  }

  /** Orden físico en pista, aire sucio y tapones. */
  private interactions() {
    const L = this.L;
    const on = this.cars.filter((c) => c.loc === "track" && c.s > -200);
    const posOf = (c: Car) => ((c.s % L) + L) % L;
    on.sort((a, b) => posOf(b) - posOf(a));
    const n = on.length;
    const race = isRaceKind(this.kind);
    for (let i = 0; i < n; i++) {
      const b = on[i];
      const a = n > 1 ? on[(i - 1 + n) % n] : null;
      if (!a || a === b) { b.followGap = 99; b.aheadId = -1; continue; }
      let gapM = posOf(a) - posOf(b);
      if (gapM < 0) gapM += L;
      b.followGap = gapM / Math.max(20, b.v);
      b.aheadId = a.id;
      // libres/clasificación: el que no va lanzado se aparta del que sí
      if (!race && b.followGap < 1.2 && this.isFlying(b) && !this.isFlying(a)) {
        if (this.rng.chance(0.004)) {
          b.delay += this.rng.range(0.2, 0.9);
          if (b.player || a.player) this.log({ kind: "incident", text: `🚧 ${a.d.abrev} estorba a ${b.d.abrev} en su vuelta rápida`, carId: b.id, important: b.player });
        }
        if (gapM < 25) this.grantPass(b, a, 0.15);
        continue;
      }
      const minGap = 7;
      if (gapM < minGap && !(b.grant === a.id && this.t < b.grantUntil)) {
        if (!race && this.isFlying(b) === this.isFlying(a) && b.v > a.v * 1.05) { this.grantPass(b, a, 0.1); continue; }
        b.s -= minGap - gapM;
        b.followGap = minGap / Math.max(20, b.v);
      }
    }
    for (const c of this.cars) if (c.grant >= 0 && this.t > c.grantUntil) c.grant = -1;
  }

  private isFlying(c: Car) { return c.run?.phase === "push" || c.run?.phase === "long"; }

  // ------------------------------------------------------------- boxes
  private enterPit(c: Car, entryS: number) {
    const tr = this.track;
    const lapBase = Math.floor(entryS / this.L) * this.L;
    const entryAbs = lapBase + tr.pit.entry;
    const exitAbs = lapBase + this.L + tr.pit.exit;
    let stationary = Math.max(1.9, this.rng.gauss(c.team.boxes, 0.12));
    if (this.rng.chance(0.05)) stationary += this.rng.range(1.5, 7);
    const noseChange = c.wing > 0.012;
    if (noseChange) stationary += 7.5;
    const mate = this.cars.find((o) => o !== c && o.team === c.team && o.loc === "pit");
    const setId = c.pitRequest!;
    c.pit = { noseChange, t: 0, total: tr.pit.laneLength / tr.pit.limit + stationary, entryS: entryAbs, dist: exitAbs - entryAbs, stationary, setId, changed: false };
    if (mate && mate.pit) c.pit.total += Math.max(0, mate.pit.total - mate.pit.t - tr.pit.laneLength / tr.pit.limit / 2) + 0.5;
    c.loc = "pit";
    c.s = entryAbs;
    const set = c.e.sets.find((s) => s.id === setId)!;
    if (typeof process !== "undefined" && process.env?.DEPURAR) console.log("   PIT", c.d.abrev, c.pitWhy ?? "?");
    c.pitWhy = undefined;
    this.log({ kind: "pit", carId: c.id, text: `🔧 ${c.d.abrev} entra a boxes → ${COMPOUNDS[set.c].name}${set.laps ? ` (usado)` : ""}`, important: c.player });
  }

  private pitStep(c: Car, dt: number) {
    const p = c.pit!;
    p.t += dt;
    const frac = Math.min(1, p.t / p.total);
    c.s = p.entryS + p.dist * frac;
    c.v = this.track.pit.limit;
    c.fuel -= ((0.2 * this.fuelPerLap) / this.lapRefRace) * dt;
    if (!p.changed && frac > 0.5) {
      p.changed = true;
      const set = c.e.sets.find((s) => s.id === p.setId)!;
      this.mount(c, set);
      c.wing = 0;
      c.slowPuncture = false;
      c.stops++;
      c.lastPitLap = this.lapsDone(c);
      c.pitRequest = null;
      if (c.player || p.stationary > 4) this.log({ kind: "pit", carId: c.id, text: `⏱️ Parada de ${c.d.abrev}: ${p.stationary.toFixed(1)} s${p.noseChange ? " (cambio de morro)" : p.stationary > 4 ? " — ¡problema en la parada!" : ""}` });
    }
    const newK = Math.floor(c.s / this.L) * this.N + this.msIndexAt(c.s);
    for (let k = c.msK + 1; k <= newK; k++) {
      c.cross[k] = this.t;
      if (k % this.N === 0) {
        const lt = c.cross[k] - c.lapStart;
        c.lapTimes.push(lt);
        c.lapStart = c.cross[k];
        const lap = k / this.N;
        if (lap > this.leaderLap) { this.leaderLap = lap; this.onLeaderLap(lap); }
        if (this.chequered) { c.loc = "fin"; c.finishT = this.t; return; }
      }
    }
    c.msK = Math.max(c.msK, newK);
    if (frac >= 1) {
      c.loc = "track";
      c.pit = undefined;
      if (c.player) this.log({ kind: "pit", carId: c.id, text: `↪️ ${c.d.abrev} sale de boxes P${this.order().indexOf(c) + 1}`, important: true });
    }
  }

  // ------------------------------------------------------- utilidades UI
  intervals(): { car: Car; gap: number; interval: number; lapsDown: number }[] {
    const ord = this.order();
    const leader = ord[0];
    if (!isRaceKind(this.kind)) {
      const ref = this.parts.length ? leader.bestByPart[this.part] : leader.best;
      return ord.map((c, i) => {
        const b = this.parts.length ? c.bestByPart[c.eliminated ? c.elimPart! : this.part] : c.best;
        const prev = ord[i - 1];
        const pb = prev ? (this.parts.length ? prev.bestByPart[this.part] : prev.best) : 0;
        return { car: c, gap: b !== undefined && isFinite(b) && ref ? b - ref : NaN, interval: b !== undefined && isFinite(b) && pb ? b - pb : NaN, lapsDown: 0 };
      });
    }
    return ord.map((c, i) => {
      const lapsDown = Math.floor((leader.s - c.s) / this.L);
      const gap = i === 0 ? 0 : this.gapBetween(leader, c);
      const interval = i === 0 ? 0 : this.gapBetween(ord[i - 1], c);
      return { car: c, gap, interval, lapsDown: c.loc === "fin" || leader.loc === "fin" ? 0 : lapsDown };
    });
  }

  axleGrips(c: Car) {
    return c.tyres ? { F: axleGrip(c.tyres.c, c.tyres.F), R: axleGrip(c.tyres.c, c.tyres.R) } : { F: 0, R: 0 };
  }

  estLap(c: Car): number {
    if (!c.tyres) return 0;
    let t = 0;
    const saved = { fg: c.followGap, ah: c.aheadId, drs: c.drs, n: c.noise };
    c.followGap = 99; c.aheadId = -1; c.drs = false; c.noise = 0;
    for (const m of this.track.ms) t += this.msTime(c, m, this.water[m.i]).t;
    c.followGap = saved.fg; c.aheadId = saved.ah; c.drs = saved.drs; c.noise = saved.n;
    return t;
  }

  letTeammatePass(front: Car) {
    const mate = this.cars.find((o) => o !== front && o.team === front.team);
    if (mate) front.letPass = mate.id;
  }

  /** Resultado final de la sesión. */
  results(): ResultRow[] {
    const ord = this.order();
    return ord.map((c, i) => ({
      id: c.id,
      pos: i + 1,
      best: this.parts.length ? (c.bestByPart[c.eliminated ? c.elimPart! : this.part] ?? Infinity) : c.best,
      time: c.finishT,
      laps: isRaceKind(this.kind) ? this.lapsDone(c) : c.sessionLaps,
      status: c.loc === "out" ? (c.retireReason === "no sale" ? "dns" : "out") : isRaceKind(this.kind) ? "fin" : "ok",
      reason: c.retireReason,
      stops: c.stops,
      part: this.parts.length ? this.parts[c.eliminated ? c.elimPart! : this.part]?.name : undefined,
    }));
  }
}

export function fmt(t: number) {
  return isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}` : "—";
}
