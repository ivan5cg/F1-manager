// Fin de semana: encadena las sesiones según el formato, guarda los juegos de neumáticos de cada
// piloto, lo que sabe cada equipo, la goma en pista y el tiempo de cada día (continuo: la
// clasificación hereda el agua y las nubes de la mañana).
import { Rng, clamp } from "./rng";
import { Track } from "./track";
import { HiddenTyre, TyreSet, allocation, setWear, DRY } from "./tyres";
import { Climate, Scenario, WeatherState, createDayWeather, stepWeather, rainAt, pickScenario, evaporation, waterStep } from "./weather";
import { Session, SessionKind, Entrant, TeamDef, ResultRow, isRaceKind, LongRun } from "./session";
import { TeamKnowledge, buildKnowledge } from "./strategy";
import { SessionSnapshot, snapshotConditions, applySnapshot } from "./snapshot";
import type { RaceSummary } from "./season";

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
}

export const NORMAL_SESSIONS: SessionKind[] = ["FP1", "FP2", "FP3", "Q", "RACE"];
export const SPRINT_SESSIONS: SessionKind[] = ["FP1", "SQ", "SPRINT", "Q", "RACE"];
const DAY: Record<string, number> = { V: 0, S: 1, D: 2 };
export const DAY_NAMES = ["Viernes", "Sábado", "Domingo"];

export function newWeekend(round: number, def: any, teams: TeamDef[], seed: number): WeekendState {
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
  constructor(public st: WeekendState, public track: Track, public teams: TeamDef[], public playerTeam: string) {}

  get def() { return this.track.def; }
  sessions(): SessionKind[] { return this.st.sprint ? SPRINT_SESSIONS : NORMAL_SESSIONS; }
  nextKind(): SessionKind | null { return this.sessions()[this.st.next] ?? null; }

  /** Día (0..2) y hora local (min) de una sesión. */
  when(kind: SessionKind): { day: number; clock: number } {
    const key = { FP1: "fp1", FP2: "fp2", FP3: "fp3", SQ: "sq", Q: "q", SPRINT: "sprint", RACE: "carrera" }[kind];
    const txt: string = this.def.horario[key];
    const [d, hm] = txt.split(" ");
    const [h, m] = hm.split(":").map(Number);
    return { day: DAY[d], clock: h * 60 + m };
  }

  entrants(): Entrant[] {
    const out: Entrant[] = [];
    let id = 0;
    for (const t of this.teams) for (const d of t.pilotos) {
      out.push({ id, d, team: t, player: t.id === this.playerTeam, sets: this.st.sets[id], knowledge: this.st.knowledge[t.id] });
      id++;
    }
    return out;
  }

  /** Tiempo real del día desde las 9:00 hasta la hora pedida, con el agua en pista. */
  conditions(day: number, clock: number): { weather: WeatherState; water: number[]; rubberLoss: number } {
    const d = this.st.days[day];
    const w = createDayWeather(new Rng(d.seed), this.def.clima, d.scenario, this.st.anomaly + day * 0.3, 9 * 60);
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
    return q ? q.map((r) => r.id) : this.entrants().map((e) => e.id);
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
      minutes: 60,
      laps: kind === "SPRINT" ? this.def.vueltasSprint : this.def.vueltas,
      sprintWeekend: this.st.sprint,
    });
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
      minutes: 60,
      laps: kind === "SPRINT" ? this.def.vueltasSprint : this.def.vueltas,
      sprintWeekend: this.st.sprint,
      restore: true,
    });
    applySnapshot(sess, snap);
    return sess;
  }

  /** Cierra una sesión: guarda resultados, goma y devuelve juegos tras los libres. */
  finish(sess: Session) {
    this.st.results[sess.kind] = sess.results();
    if (sess.longRuns.length) this.st.longRuns = { ...this.st.longRuns, [sess.kind]: sess.longRuns };
    const table = sess.pointsTable();
    if (table) this.st.scoring = { ...this.st.scoring, [sess.kind]: table };
    this.st.rubber = sess.rubber;
    if (sess.kind.startsWith("FP")) {
      const n = sess.kind === "FP3" ? 2 : 1;
      for (const sets of Object.values(this.st.sets)) {
        const used = sets.filter((s) => !s.returned && s.laps > 0 && DRY.includes(s.c)).sort((a, b) => setWear(b) - setWear(a));
        for (const s of used.slice(0, n)) s.returned = true;
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
