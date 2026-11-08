// Simulación de carrera por pasos de tiempo (dt = 0,2 s). Cada coche avanza sobre el perfil de
// velocidad de referencia, escalado por el tiempo que tardaría ÉL en ese minisector con su
// adherencia, potencia, resistencia y masa de ese instante. Las interacciones (aire sucio,
// rebufo, DRS, tapones y adelantamientos) salen de las distancias reales entre coches.
import { Rng, clamp } from "./rng";
import { Track, Minisector, msTimeAtGrip } from "./track";
import { Compound, COMPOUNDS, DRY, HiddenTyre, TyreSet, newSet, setGrip, updateSet, axleGrip } from "./tyres";
import { WeatherState, createWeather, stepWeather, rainAt, Scenario } from "./weather";
import { Plan, planStrategy, aiDecide, aiErs, TeamKnowledge, buildKnowledge } from "./strategy";

export const PUSH_NAMES = ["Conservar", "Gestionar", "Normal", "Atacar", "Al límite"];
export const ENGINE_NAMES = ["Ahorro", "Normal", "Potencia"];
export const ERS_NAMES = ["Recargar", "Equilibrado", "Ataque", "Adelantar"];
const PUSH_GRIP = [0.983, 0.992, 1, 1.006, 1.011];
const PUSH_ENERGY = [0.74, 0.87, 1, 1.12, 1.25];
const PUSH_ERR = [0.45, 0.7, 1, 1.7, 2.8];
const PUSH_FUEL = [0.96, 0.98, 1, 1.015, 1.03];
const ENGINE_POWER = [-1.6, 0, 0.9]; // % potencia
const ENGINE_FUEL = [0.93, 1, 1.05];
const ENGINE_FAIL = [0.6, 1, 2.2];
const ERS_POWER = [-3.5, 0, 2.0, 4.5]; // % potencia
const ERS_NET = [1.1, 0, -0.9, -2.4]; // MJ por vuelta
const SOC_MAX = 4;

export interface TeamDef {
  id: string; nombre: string; color: string;
  agarre: number; potencia: number; resistencia: number; desgaste: number;
  boxes: number; fiabilidad: number; estrategia: number; meteo: number;
  pilotos: DriverDef[];
}
export interface DriverDef {
  nombre: string; abrev: string; numero: number;
  ritmo: number; regularidad: number; neumaticos: number; lluvia: number;
  ataque: number; defensa: number; agresividad: number; salida: number;
}

export type Status = "run" | "pit" | "out" | "fin";

export interface Car {
  id: number;
  d: DriverDef;
  team: TeamDef;
  player: boolean;
  s: number; // distancia total recorrida (m), negativa en parrilla
  gridS: number;
  v: number;
  status: Status;
  retireReason?: string;
  tyres: TyreSet;
  usedCompounds: Set<Compound>;
  stops: number;
  fuel: number;
  soc: number;
  push: number;
  engine: number;
  ers: number;
  pitRequest: Compound | null;
  pit?: { noseChange: boolean; t: number; total: number; entryS: number; dist: number; stationary: number; newC: Compound; changed: boolean; waitMate: boolean };
  wing: number; // daño en alerón (pérdida de agarre, 0..0,06)
  floor: number; // daño en fondo
  delay: number; // segundos a perder (errores, defensas...)
  msK: number; // índice global de minisector (vuelta * N + ms)
  cross: number[]; // tiempo al cruzar cada minisector global
  lapTimes: number[];
  lapStart: number;
  best: number;
  noise: number; // ruido de este minisector
  followGap: number; // s al coche de delante (físico)
  aheadId: number;
  drs: boolean;
  drsEligible: boolean;
  grant: number; // id del coche que puede pasar ahora
  grantUntil: number;
  finishT: number;
  plan: Plan;
  blueWait: number;
  lastPitLap: number;
  knowledge: TeamKnowledge;
  pace: number; // multiplicador de agarre por talento
  wearMult: number;
  boxThisLapNotified: boolean;
  slowPuncture: boolean;
  autoPush: boolean;
  autoErs: boolean;
  letPass?: number;
  advice?: { lap: number; c: Compound };
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

export interface RaceOptions {
  seed: number;
  track: Track;
  teams: TeamDef[];
  playerTeam: string;
  scenario?: Scenario;
  playerStartTyres?: [Compound, Compound];
}

export class Race {
  t = 0;
  dt = 0.2;
  track: Track;
  cars: Car[] = [];
  rng: Rng;
  wRng: Rng;
  weather: WeatherState;
  water: Float64Array; // mm por minisector
  rubber = 0.45;
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
  private weatherAcc = 0;
  private lastRainMsg = 0;
  private wasRaining = false;
  leaderId = -1;
  onEvent?: (e: RaceEvent) => void;

  constructor(public opt: RaceOptions) {
    this.track = opt.track;
    this.N = this.track.ms.length;
    this.rng = new Rng(opt.seed);
    this.wRng = this.rng.fork();
    const hr = this.rng.fork();
    this.weather = createWeather(this.wRng, opt.scenario);
    this.water = new Float64Array(this.N);
    // agua inicial si ya llueve
    const r0 = this.rainOnTrack();
    if (r0 > 0.3) this.water.fill(Math.min(2, r0 * 0.25));
    this.hidden = {
      wearMult: { S: hr.logn(0.13), M: hr.logn(0.12), H: hr.logn(0.12), I: hr.logn(0.15), W: hr.logn(0.12) },
      thermalOffset: hr.gauss(0, 3.5),
      grainProne: hr.logn(0.35),
    };
    this.lapRefRace = this.track.refLap;
    let t0 = 0, t1 = 0;
    for (const m of this.track.ms) { t0 += msTimeAtGrip(m, 1); t1 += msTimeAtGrip(m, 0.99); }
    this.secPerGrip = t1 - t0;
    this.fuelPerLap = 1.72;

    // coches
    let id = 0;
    for (const team of opt.teams) {
      for (const d of team.pilotos) {
        const player = team.id === opt.playerTeam;
        const knowledge = buildKnowledge(this, team, this.rng.fork());
        const car: Car = {
          id: id++, d, team, player,
          s: 0, gridS: 0, v: 0, status: "run",
          tyres: newSet("M"), usedCompounds: new Set(), stops: 0,
          fuel: 0, soc: SOC_MAX * 0.95,
          push: 2, engine: 1, ers: 1, pitRequest: null,
          wing: 0, floor: 0, delay: 0, msK: -1, cross: [], lapTimes: [], lapStart: 0, best: Infinity,
          noise: 0, followGap: 99, aheadId: -1, drs: false, drsEligible: false,
          grant: -1, grantUntil: 0, finishT: 0, plan: { stints: [] }, blueWait: 0, lastPitLap: -1,
          knowledge,
          pace: 1 + (d.ritmo - 85) * 0.0007 + team.agarre / 180,
          wearMult: team.desgaste * (1.18 - d.neumaticos * 0.002),
          boxThisLapNotified: false, slowPuncture: false, autoPush: !player, autoErs: true,
        };
        // combustible: el equipo apuesta por un margen (algunos van justos)
        car.fuel = this.fuelPerLap * this.track.laps * this.rng.range(0.975, 1.005) + 1.0;
        if (player) car.fuel = this.fuelPerLap * this.track.laps + 0.5;
        this.cars.push(car);
      }
    }
    this.qualifying(opt.playerStartTyres);
  }

  get L() { return this.track.length; }

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

  avgWater(): number {
    let w = 0;
    for (let i = 0; i < this.N; i++) w += this.water[i];
    return w / this.N;
  }

  /** Clasificación simplificada (fase 2: sesión jugable). */
  private qualifying(playerTyres?: [Compound, Compound]) {
    const wet = this.avgWater();
    const qc: Compound = wet > 0.9 ? "W" : wet > 0.2 ? "I" : "S";
    const times = this.cars.map((c) => {
      const g = c.pace * (wet > 0.1 ? 1 + (c.d.lluvia - 80) * 0.0008 * Math.min(1, wet) : 1) * COMPOUNDS[qc].base * this.rngGauss(1, 0.0022 * (1.2 - c.d.regularidad / 100) / 0.2);
      return { c, t: this.lapRefRace - (g - 1) * 100 * this.secPerGrip - this.cars.indexOf(c) * 0 };
    });
    times.sort((a, b) => a.t - b.t);
    times.forEach(({ c }, i) => {
      c.gridS = -12 - i * 8;
      c.s = c.gridS;
      c.msK = -1;
      c.lapStart = 0;
    });
    // estrategia inicial
    for (const c of this.cars) {
      c.plan = planStrategy(this, c, c.knowledge, 0, null, 0, new Set(), this.rng.fork());
      let start = c.plan.stints[0]?.c ?? "M";
      if (c.player && playerTyres) start = playerTyres[c.team.pilotos.indexOf(c.d)] ?? start;
      if (wet > 0.9) start = "W"; else if (wet > 0.2 && DRY.includes(start)) start = "I";
      c.tyres = newSet(start);
      c.usedCompounds.add(start);
    }
  }

  private rngGauss(mu: number, s: number) { return this.rng.gauss(mu, s); }

  position(c: Car): number {
    return this.order().indexOf(c) + 1;
  }

  /** Orden de carrera. */
  order(): Car[] {
    return [...this.cars].sort((a, b) => {
      const fa = a.status === "fin", fb = b.status === "fin";
      if (fa && fb) return this.lapsDone(b) - this.lapsDone(a) || a.finishT - b.finishT;
      if (fa !== fb) {
        // un coche que ha terminado va delante de los que aún no han completado esa vuelta
        const lapsA = this.lapsDone(a), lapsB = this.lapsDone(b);
        if (lapsA !== lapsB) return lapsB - lapsA;
        return fa ? -1 : 1;
      }
      const oa = a.status === "out", ob = b.status === "out";
      if (oa !== ob) return oa ? 1 : -1;
      if (oa && ob) return b.s - a.s;
      return b.s - a.s;
    });
  }

  lapsDone(c: Car) { return Math.max(0, Math.floor(c.s / this.L)); }

  /** Diferencia en segundos entre dos coches en el último punto de cronometraje común. */
  gapBetween(ahead: Car, behind: Car): number {
    const k = behind.msK;
    if (k < 0) return 0;
    const ta = ahead.cross[k], tb = behind.cross[k];
    if (ta === undefined || tb === undefined) return 0;
    return tb - ta;
  }

  // ------------------------------------------------------------------ paso
  step() {
    if (this.finished) return;
    const dt = this.dt;
    this.t += dt;

    this.weatherAcc += dt;
    if (this.weatherAcc >= 5) {
      stepWeather(this.weather, this.weatherAcc / 60);
      this.updateWater(this.weatherAcc);
      this.weatherAcc = 0;
      this.weatherRadio();
    }
    this.updateFlags(dt);

    this.leaderId = this.order()[0].id;
    const running = this.cars.filter((c) => c.status === "run" || c.status === "pit");
    for (const c of running) this.moveCar(c, dt);
    this.interactions();

    // fin
    if (this.cars.every((c) => c.status === "fin" || c.status === "out")) {
      this.finished = true;
      this.log({ kind: "control", text: "🏁 Carrera terminada", important: true, pause: true });
    }
  }

  private updateWater(dtS: number) {
    const w = this.weather;
    const evap = 2.2e-5 * (1 + (w.trackT - 20) / 15) * (1 + w.surfaceWind / 20) * (1 - 0.5 * w.cloud);
    const raining = this.rainOnTrack();
    for (let i = 0; i < this.N; i++) {
      const m = this.track.ms[i];
      const r = rainAt(w, m.x / 1000, m.y / 1000);
      const d = this.water[i];
      const dd = r / 3600 - 9e-4 * d * (1 + d / 2) - (d > 0 ? evap : 0);
      this.water[i] = clamp(d + dd * dtS, 0, 4);
    }
    // la lluvia limpia la goma
    if (raining > 0.5) this.rubber = Math.max(0, this.rubber - 0.0005 * raining * dtS);
  }

  private weatherRadio() {
    const raining = this.rainOnTrack();
    const now = raining > 0.3;
    if (now && !this.wasRaining && this.t - this.lastRainMsg > 120) {
      this.lastRainMsg = this.t;
      const where = this.track.ms.reduce((best, m) => (rainAt(this.weather, m.x / 1000, m.y / 1000) > rainAt(this.weather, best.x / 1000, best.y / 1000) ? m : best));
      this.log({ kind: "weather", text: `🌧️ Empieza a llover en el sector ${where.sector + 1} (${raining.toFixed(1)} mm/h)`, pause: true, important: true });
    }
    if (!now && this.wasRaining && this.t - this.lastRainMsg > 120) {
      this.lastRainMsg = this.t;
      this.log({ kind: "weather", text: "🌤️ Ha dejado de llover. La pista empezará a secarse por la trazada.", pause: true, important: true });
    }
    this.wasRaining = now;
  }

  private updateFlags(dt: number) {
    if (this.flag === "vsc") {
      this.flagTimer -= dt;
      if (this.flagTimer <= 0) {
        this.flag = "green";
        this.log({ kind: "control", text: "🟢 Fin del coche de seguridad virtual. Bandera verde.", important: true });
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

  private incident(c: Car, why: string, severity: number) {
    // severity 0..1: cómo de expuesto queda el coche
    const r = this.rng.next();
    if (r < 0.25 + 0.4 * severity) this.deploy("sc", why);
    else if (r < 0.55 + 0.35 * severity) this.deploy("vsc", why);
    else this.log({ kind: "control", text: `⚠️ Bandera amarilla: ${why}` });
  }

  private retire(c: Car, reason: string, severity: number) {
    c.status = "out";
    c.retireReason = reason;
    c.v = 0;
    this.log({ kind: "incident", text: `❌ ${c.d.abrev} abandona: ${reason}`, carId: c.id, important: true, pause: c.player });
    this.incident(c, `${c.d.abrev} (${reason})`, severity);
  }

  /** Tiempo objetivo del coche en un minisector, con su estado actual. */
  msTime(c: Car, m: Minisector, water: number): { t: number; grip: number } {
    const wetSkill = water > 0.1 ? 1 + (c.d.lluvia - 80) * 0.0009 * Math.min(1, water / 0.6) : 1;
    let grip = setGrip(c.tyres, water) * c.pace * wetSkill * PUSH_GRIP[c.push] * (1 + 0.012 * this.rubber) * (1 - c.wing - c.floor);
    // aire sucio: pierde carga en curva
    if (c.followGap < 1.6 && c.aheadId >= 0) grip *= 1 - 0.045 * (1 - c.followGap / 1.6) * m.cornerSens;
    let t = msTimeAtGrip(m, grip);
    const scale = t / msTimeAtGrip(m, 1);
    let power = c.team.potencia * 0.6 + ENGINE_POWER[c.engine] + (c.soc > 0.05 || c.ers === 0 ? ERS_POWER[c.ers] : -3.5);
    let dragCut = -c.team.resistencia; // % menos resistencia
    if (c.followGap < 1.2) dragCut += 7 * (1 - c.followGap / 1.2) * m.throttle; // rebufo
    if (c.drs && m.drs) dragCut += 16;
    t -= scale * (m.dPower * power + m.dDrag * dragCut);
    t += m.dMass * (c.fuel - 50);
    t *= 1 + c.noise;
    return { t, grip };
  }

  private moveCar(c: Car, dt: number) {
    const L = this.L;
    if (c.status === "pit") return this.pitStep(c, dt);
    const pos = ((c.s % L) + L) % L;
    const m = this.track.ms[this.msIndexAt(c.s)];
    const water = this.water[m.i];
    const { t } = this.msTime(c, m, water);
    const tRef = msTimeAtGrip(m, 1);
    const pi = Math.min(this.track.vref.length - 1, Math.floor(pos / this.track.ds));
    let v = this.track.vref[pi] * (tRef / t);

    // salida parada
    if (this.lapsDone(c) === 0 && c.s < 400) v = Math.min(v, Math.sqrt(2 * 11 * Math.max(0.3, c.s - c.gridS + 0.3)));
    // banderas
    if (this.flag === "vsc") v = Math.min(v, this.track.vref[pi] * 0.6);
    if (this.flag === "sc" || this.flag === "sc_in") {
      const cap = this.track.vref[pi] * (c.followGap > 1.0 || c.aheadId < 0 ? 0.62 : 0.5);
      v = Math.min(v, Math.min(cap, 62));
      if (c.id === this.leaderId) v = Math.min(v, this.track.vref[pi] * 0.5, 50);
    }
    if (c.slowPuncture || c.tyres.punctured) v = Math.min(v, 28);
    let move = v * dt;
    if (c.delay > 0) {
      const lose = Math.min(c.delay, dt * 0.6);
      c.delay -= lose;
      move *= 1 - lose / dt;
    }
    c.v = v;
    const oldS = c.s;
    c.s += move;

    // tiempos, energía, combustible
    const tr = this.track;
    const relE = (e: number) => (e / msTimeAtGrip(m, 1)) * this.lapRefRace;
    const underFlag = this.flag !== "green";
    updateSet(c.tyres, {
      trackT: this.weather.trackT, airT: this.weather.airT, water,
      eF: relE(m.energyF) * (underFlag ? 0.35 : 1) * (c.followGap < 1.2 ? 1 + 0.12 * (1 - c.followGap / 1.2) * m.cornerSens : 1),
      eR: relE(m.energyR) * (underFlag ? 0.35 : 1),
      push: PUSH_ENERGY[c.push], carWear: c.wearMult, abrasiveness: tr.abrasiveness, speed: v,
    }, dt, this.lapRefRace, this.hidden);
    // consumo por distancia recorrida (no por tiempo)
    c.fuel -= (this.fuelPerLap * ENGINE_FUEL[c.engine] * PUSH_FUEL[c.push] * (underFlag ? 0.45 : 1) * move) / this.L;
    if (!underFlag) c.soc = clamp(c.soc + (ERS_NET[c.ers] / this.lapRefRace) * dt, 0, SOC_MAX);
    else c.soc = clamp(c.soc + (1.5 / this.lapRefRace) * dt, 0, SOC_MAX);

    if (c.fuel <= 0) { c.fuel = 0; this.retire(c, "sin combustible", 0.2); return; }

    // pinchazo por desgaste
    const wmax = Math.max(c.tyres.F.wear, c.tyres.R.wear);
    if (!c.tyres.punctured && wmax > 0.96 && this.rng.chance(dt * 0.02 * (wmax - 0.95) * 20)) {
      c.tyres.punctured = true;
      // el piloto vuelve a boxes por su cuenta
      if (!c.pitRequest) c.pitRequest = water > 0.9 ? "W" : water > 0.2 ? "I" : this.track.laps - this.lapsDone(c) < 20 ? "S" : "M";
      this.log({ kind: "incident", text: `💥 ¡Pinchazo de ${c.d.abrev}! Neumático destrozado, vuelve a boxes.`, carId: c.id, important: true, pause: c.player });
    }

    // cruces de minisector
    const newK = Math.floor(c.s / L) * this.N + this.msIndexAt(c.s);
    if (c.s >= 0 && newK !== c.msK) {
      for (let k = c.msK + 1; k <= newK; k++) {
        const bS = Math.floor(k / this.N) * L + tr.ms[k % this.N].s0;
        const frac = clamp((bS - oldS) / Math.max(1e-6, c.s - oldS), 0, 1);
        c.cross[k] = this.t - dt + frac * dt;
        this.onMsEnter(c, k);
        if (c.status !== "run") return;
      }
      c.msK = newK;
    }
    // entrada a boxes
    const prevPos = ((oldS % L) + L) % L;
    if (c.pitRequest && oldS > 0 && prevPos < tr.pit.entry && (((c.s % L) + L) % L >= tr.pit.entry || ((c.s % L) + L) % L < prevPos) && !this.chequered) {
      this.enterPit(c, oldS);
    }
  }

  private msIndexAt(s: number) {
    const pos = ((s % this.L) + this.L) % this.L;
    const pi = Math.min(this.track.msOfPoint.length - 1, Math.floor(pos / this.track.ds));
    return this.track.msOfPoint[pi];
  }

  private onMsEnter(c: Car, k: number) {
    const ms = k % this.N;
    const m = this.track.ms[ms];
    // ruido del piloto: regularidad
    const sigma = 0.0035 * (1.25 - c.d.regularidad / 100) * (1 + this.water[ms] * 0.6);
    c.noise = this.rng.gauss(0, sigma);

    // nueva vuelta
    if (ms === 0) {
      const lap = k / this.N;
      if (lap >= 1) {
        const lt = c.cross[k] - c.lapStart;
        c.lapTimes.push(lt);
        if (lap > 1 && lt < c.best) c.best = lt;
        c.tyres.laps++;
      }
      if (lap >= 1) c.lapStart = c.cross[k];
      c.boxThisLapNotified = false;
      if (lap > this.leaderLap) {
        this.leaderLap = lap;
        this.onLeaderLap(lap);
      }
      if (this.chequered) {
        c.status = "fin";
        c.finishT = c.cross[k];
        if (c.player) this.log({ kind: "info", text: `🏁 ${c.d.abrev} termina P${this.position(c)}`, carId: c.id, important: true });
        return;
      }
      this.lapChecks(c, lap);
    }

    // DRS: detección
    if (m.drsDetect) {
      c.drsEligible = this.flag === "green" && this.leaderLap + 1 >= this.drsEnabledFromLap && c.followGap < 1.0 && this.avgWater() < 0.35;
    }
    if (m.drs) c.drs = c.drsEligible;
    else if (!m.drsDetect) { c.drs = false; }

    // decisión de estrategia antes del final de vuelta
    if (ms === this.N - 3 && !c.player) aiDecide(this, c);
    if (ms === this.N - 3 && c.player) this.playerAdvice(c);

    aiErs(this, c);
    if (this.flag !== "green") return;
    this.errorCheck(c, m);
    this.overtakeCheck(c, m);
  }

  private onLeaderLap(lap: number) {
    if (lap >= this.track.laps && !this.chequered) {
      this.chequered = true;
      this.log({ kind: "control", text: "🏁 Bandera a cuadros", important: true });
      for (const c of this.cars) if (c.status === "run" && this.lapsDone(c) >= this.track.laps) { c.status = "fin"; c.finishT = this.t; }
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
    // fiabilidad (una vez por vuelta y coche)
    for (const c of this.cars) {
      if (c.status !== "run") continue;
      const hz = (1 / 2600) * c.team.fiabilidad * ENGINE_FAIL[c.engine] * (1 + c.floor * 5);
      if (this.rng.chance(hz)) {
        const what = this.rng.pick(["motor", "caja de cambios", "hidráulica", "fallo eléctrico", "frenos"]);
        this.retire(c, `avería (${what})`, this.rng.range(0, 0.6));
      }
    }
  }

  private lapChecks(c: Car, lap: number) {
    if (!c.player) return;
    // radio de ingeniero: neumáticos y combustible
    const wear = Math.max(c.tyres.F.wear, c.tyres.R.wear);
    const sp = COMPOUNDS[c.tyres.c];
    if (wear > sp.cliff - 0.06 && wear < sp.cliff + 0.02 && !c.pitRequest) {
      this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Los neumáticos se están acabando, noto cómo caen."`, pause: true, important: true });
    }
    const f = c.tyres.F, r = c.tyres.R;
    if (f.grain > 0.35 || r.grain > 0.35) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "Mucho graining en los ${f.grain > r.grain ? "delanteros" : "traseros"}."` });
    if (f.blister > 0.25 || r.blister > 0.25) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ampollas en los ${f.blister > r.blister ? "delanteros" : "traseros"} de ${c.d.abrev}. Hay que bajar el ritmo o parar.`, important: true });
    const lapsLeft = this.track.laps - lap;
    const fuelLaps = c.fuel / this.fuelPerLap;
    if (lapsLeft > 3 && fuelLaps < lapsLeft - 0.3 && lap % 3 === 0) this.log({ kind: "radio", carId: c.id, text: `📻 Ingeniero: ${c.d.abrev} va ${(lapsLeft - fuelLaps).toFixed(1)} vueltas corto de combustible. Hay que ahorrar.`, important: true });
  }

  private playerAdvice(c: Car) {
    if (c.pitRequest || c.boxThisLapNotified) return;
    const sugg = aiDecide(this, c, true);
    const lap = this.lapsDone(c);
    // no insiste: repite solo si cambia la recomendación o han pasado 3 vueltas
    if (sugg && c.advice && c.advice.c === sugg && lap - c.advice.lap < 3) return;
    if (sugg) {
      c.advice = { lap, c: sugg };
      c.boxThisLapNotified = true;
      this.log({ kind: "radio", carId: c.id, text: `🧠 Estratega: para ${c.d.abrev}, recomendaría parar ESTA vuelta y montar ${COMPOUNDS[sugg].name}. (${sugg === c.plan.stints[c.stops + 1]?.c ? "según el plan" : "cambio de plan"})`, pause: true, important: true });
    }
  }

  private errorCheck(c: Car, m: Minisector) {
    if (m.cornerSens < 0.35) return;
    const water = this.water[m.i];
    const sp = COMPOUNDS[c.tyres.c];
    const coldF = Math.max(0, sp.opt - 20 - c.tyres.F.tBulk) / 20;
    const deficit = Math.max(0, 0.9 - setGrip(c.tyres, water) / sp.base) * 5;
    let p = 1.1e-4 * PUSH_ERR[c.push] * (1 + (85 - c.d.regularidad) / 25) * (1 + deficit + coldF);
    p *= 1 + 3.5 * Math.min(1, water) * (1.3 - c.d.lluvia / 100);
    if (this.lapsDone(c) === 0) p *= 2;
    if (!this.rng.chance(p * m.cornerSens * 2)) return;
    const r = this.rng.next();
    const crashP = 0.05 + 0.06 * Math.min(1, water);
    if (r < crashP) {
      this.retire(c, "accidente", 0.7);
    } else if (r < crashP + 0.2) {
      const loss = this.rng.range(1.8, 6);
      c.delay += loss;
      let dmg = "";
      if (this.rng.chance(0.15)) { c.wing += this.rng.range(0.008, 0.03); dmg = " y daña el alerón"; }
      this.log({ kind: "incident", text: `↩️ ${c.d.abrev} se sale de pista en el sector ${m.sector + 1}${dmg} (−${loss.toFixed(1)} s)`, carId: c.id, important: c.player });
    } else if (r < crashP + 0.35) {
      c.delay += this.rng.range(0.3, 0.8);
      c.tyres.flatSpot = Math.min(1, c.tyres.flatSpot + this.rng.range(0.3, 0.8));
      if (c.player) this.log({ kind: "radio", carId: c.id, text: `📻 ${c.d.abrev}: "He bloqueado, tengo un plano en el delantero."` });
    } else {
      c.delay += this.rng.range(0.15, 0.6);
    }
  }

  private overtakeCheck(c: Car, m: Minisector) {
    // c es el que ataca; el de delante físico
    if (c.aheadId < 0 || c.followGap > 0.45) return;
    const a = this.cars[c.aheadId];
    if (a === c) return;
    if (a.status !== "run") return;
    const lapped = this.lapsDone(c) > this.lapsDone(a) || (c.s - a.s) > this.L * 0.5;
    const behindIsLapped = a.s - c.s > this.L * 0.5;
    if (behindIsLapped) return; // c está doblado: no ataca
    if (lapped) {
      // banderas azules: el doblado se aparta pronto
      if (this.rng.chance(0.55)) {
        this.grantPass(c, a, this.rng.range(0.2, 0.6));
      }
      return;
    }
    // compañero con orden de equipo
    if (a.team === c.team && a.letPass === c.id) {
      this.grantPass(c, a, 0.4);
      a.letPass = undefined;
      this.log({ kind: "info", text: `🔁 ${a.d.abrev} deja pasar a ${c.d.abrev}`, carId: c.id });
      return;
    }
    const lap1 = this.lapsDone(c) === 0;
    const zone = m.overtake > 0 ? m.overtake : lap1 ? 0.12 : 0.025;
    if (zone <= 0) return;
    // diferencia de ritmo en esta zona y en la recta previa
    const water = this.water[m.i];
    const tc = this.msTime(c, m, water).t, ta = this.msTime(a, m, water).t;
    const prev = this.track.ms[(m.i - 1 + this.N) % this.N];
    const tcp = this.msTime(c, prev, this.water[prev.i]).t, tap = this.msTime({ ...a, followGap: 99, drs: false } as Car, prev, this.water[prev.i]).t;
    const delta = (ta - tc) + (tap - tcp); // s a favor del atacante
    const skill = (c.d.ataque - a.d.defensa) / 100;
    const ersEdge = (ERS_POWER[c.ers] - ERS_POWER[a.ers]) * 0.02;
    const x = delta * 9 + skill * 1.5 + ersEdge - 1.6 + zone * 2.2 - (1 - zone) * 0.4;
    const p = zone * (1 / (1 + Math.exp(-x)));
    if (!this.rng.chance(Math.min(0.85, p * 2.2))) return;
    // contacto
    const contactP = 0.01 * (0.5 + c.d.agresividad / 100) * (0.5 + a.d.agresividad / 120) * (lap1 ? 2.5 : 1) * (1 + Math.min(1, water) * 1.5);
    if (this.rng.chance(contactP)) return this.contact(c, a);
    this.grantPass(c, a, this.rng.range(0.1, 0.35));
    const pos = this.position(c);
    if (c.player || a.player || pos <= 3) this.log({ kind: "info", text: `⚔️ ${c.d.abrev} adelanta a ${a.d.abrev} por la P${pos - 1 < 1 ? 1 : pos - 1}`, carId: c.id });
  }

  private grantPass(c: Car, a: Car, lossA: number) {
    c.grant = a.id;
    c.grantUntil = this.t + 6;
    a.delay += lossA;
    // el que pasa coge el hueco ya (distancia física, vale también al doblar)
    const L = this.L;
    let gap = (((a.s % L) + L) % L) - (((c.s % L) + L) % L);
    if (gap < 0) gap += L;
    if (gap < 60) c.s += gap + 4;
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
      victim.pitRequest = victim.pitRequest ?? (this.avgWater() > 0.3 ? "I" : "M");
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
    const on = this.cars.filter((c) => c.status === "run" && c.s > -200);
    const posOf = (c: Car) => ((c.s % L) + L) % L;
    on.sort((a, b) => posOf(b) - posOf(a));
    const n = on.length;
    for (let i = 0; i < n; i++) {
      const b = on[i];
      const a = n > 1 ? on[(i - 1 + n) % n] : null;
      if (!a || a === b) { b.followGap = 99; b.aheadId = -1; continue; }
      let gapM = posOf(a) - posOf(b);
      if (gapM < 0) gapM += L;
      b.followGap = gapM / Math.max(20, b.v);
      b.aheadId = a.id;
      // tapón: no puede atravesar al de delante sin permiso
      const minGap = 7;
      if (gapM < minGap && !(b.grant === a.id && this.t < b.grantUntil)) {
        const push = minGap - gapM;
        b.s -= push;
        b.followGap = minGap / Math.max(20, b.v);
      }
    }
    // los coches en boxes y los de la parrilla no interactúan
    for (const c of this.cars) if (c.grant >= 0 && this.t > c.grantUntil) c.grant = -1;
  }

  // ------------------------------------------------------------- boxes
  private enterPit(c: Car, entryS: number) {
    const tr = this.track;
    const lapBase = Math.floor(entryS / this.L) * this.L;
    const entryAbs = lapBase + tr.pit.entry;
    const exitAbs = lapBase + this.L + tr.pit.exit;
    const team = c.team;
    let stationary = Math.max(1.9, this.rng.gauss(team.boxes, 0.12));
    if (this.rng.chance(0.05)) stationary += this.rng.range(1.5, 7);
    const noseChange = c.wing > 0.012;
    if (noseChange) stationary += 7.5; // cambio de morro
    const mate = this.cars.find((o) => o !== c && o.team === c.team && o.status === "pit");
    const newC = c.pitRequest!;
    c.pit = { noseChange, t: 0, total: tr.pit.laneLength / tr.pit.limit + stationary, entryS: entryAbs, dist: exitAbs - entryAbs, stationary, newC, changed: false, waitMate: !!mate };
    if (mate && mate.pit) c.pit.total += Math.max(0, mate.pit.total - mate.pit.t - tr.pit.laneLength / tr.pit.limit / 2) + 0.5;
    c.status = "pit";
    c.s = entryAbs;
    this.log({ kind: "pit", carId: c.id, text: `🔧 ${c.d.abrev} entra a boxes → ${COMPOUNDS[newC].name}`, important: c.player });
  }

  private pitStep(c: Car, dt: number) {
    const p = c.pit!;
    p.t += dt;
    const frac = Math.min(1, p.t / p.total);
    const oldS = c.s;
    c.s = p.entryS + p.dist * frac;
    c.v = this.track.pit.limit;
    c.fuel -= (0.2 * this.fuelPerLap / this.lapRefRace) * dt;
    if (!p.changed && frac > 0.5) {
      p.changed = true;
      c.tyres = newSet(p.newC);
      c.usedCompounds.add(p.newC);
      c.wing = 0;
      c.slowPuncture = false;
      c.stops++;
      c.lastPitLap = this.lapsDone(c);
      c.pitRequest = null;
      const nose = p.stationary > 7 && c.wing === 0;
      if (c.player || p.stationary > 4) this.log({ kind: "pit", carId: c.id, text: `⏱️ Parada de ${c.d.abrev}: ${p.stationary.toFixed(1)} s${p.noseChange ? " (cambio de morro)" : p.stationary > 4 ? " — ¡problema en la parada!" : ""}` });
      void nose;
    }
    // registra cruces de minisector mientras está en el pit (para los tiempos)
    const newK = Math.floor(c.s / this.L) * this.N + this.msIndexAt(c.s);
    for (let k = c.msK + 1; k <= newK; k++) {
      c.cross[k] = this.t;
      if (k % this.N === 0) {
        const lt = c.cross[k] - c.lapStart;
        c.lapTimes.push(lt);
        c.lapStart = c.cross[k];
        const lap = k / this.N;
        if (lap > this.leaderLap) { this.leaderLap = lap; this.onLeaderLap(lap); }
        if (this.chequered) { c.status = "fin"; c.finishT = this.t; return; }
      }
    }
    c.msK = Math.max(c.msK, newK);
    void oldS;
    if (frac >= 1) {
      c.status = "run";
      c.pit = undefined;
      const pos = this.position(c);
      if (c.player) this.log({ kind: "pit", carId: c.id, text: `↪️ ${c.d.abrev} sale de boxes P${pos}`, important: true });
    }
  }

  // ------------------------------------------------------- utilidades UI
  /** Intervalo con el de delante en la clasificación. */
  intervals(): { car: Car; gap: number; interval: number; lapsDown: number }[] {
    const ord = this.order();
    const leader = ord[0];
    return ord.map((c, i) => {
      const lapsDown = Math.floor((leader.s - c.s) / this.L);
      const gap = i === 0 ? 0 : this.gapBetween(leader, c);
      const interval = i === 0 ? 0 : this.gapBetween(ord[i - 1], c);
      return { car: c, gap, interval, lapsDown: c.status === "fin" || leader.status === "fin" ? 0 : lapsDown };
    });
  }

  carGrip(c: Car): number {
    const m = this.track.ms[this.msIndexAt(c.s)];
    return setGrip(c.tyres, this.water[m.i]);
  }

  axleGrips(c: Car) {
    return { F: axleGrip(c.tyres.c, c.tyres.F), R: axleGrip(c.tyres.c, c.tyres.R) };
  }

  /** Tiempo de vuelta estimado del coche ahora (sin tráfico). */
  estLap(c: Car): number {
    let t = 0;
    const saved = { fg: c.followGap, ah: c.aheadId, drs: c.drs, n: c.noise };
    c.followGap = 99; c.aheadId = -1; c.drs = false; c.noise = 0;
    for (const m of this.track.ms) t += this.msTime(c, m, this.water[m.i]).t;
    c.followGap = saved.fg; c.aheadId = saved.ah; c.drs = saved.drs; c.noise = saved.n;
    return t;
  }

  /** Cambia el neumático de salida (antes de la salida). */
  setStartTyre(c: Car, comp: Compound) {
    if (this.t > 0) return;
    c.tyres = newSet(comp);
    c.usedCompounds = new Set([comp]);
    const plan = planStrategy(this, c, c.knowledge, 0, comp, 0, new Set([comp]));
    c.plan = plan;
  }

  /** Carga de combustible en vueltas de margen sobre lo necesario (antes de la salida). */
  setFuel(c: Car, marginLaps: number) {
    if (this.t > 0) return;
    c.fuel = this.fuelPerLap * (this.track.laps + marginLaps) + 0.5;
  }

  fuelMargin(c: Car) {
    return (c.fuel - 0.5) / this.fuelPerLap - this.track.laps;
  }

  /** Orden de equipo: el coche delantero deja pasar al compañero. */
  letTeammatePass(front: Car) {
    const mate = this.cars.find((o) => o !== front && o.team === front.team);
    if (mate) front.letPass = mate.id;
  }
}
