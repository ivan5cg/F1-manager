// Minitemporada: calendario, puntos y clasificaciones de pilotos y constructores.
import type { TeamDef, ResultRow, DriverDef } from "./session";
import type { SeasonRecord } from "./career";
import type { WeekendState } from "./weekend";
import type { Compound } from "./tyres";
import type { CustomTeam } from "./market";
import type { PuState } from "./powerunit";
import type { DevState } from "./development";
import type { Objective } from "./objectives";

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** Lo que hace falta para volver a dibujar el resumen de una carrera ya corrida (se guarda con la temporada). */
export interface RaceSummary {
  laps: number; // vueltas previstas
  lapOrder: number[][]; // orden (ids) al cerrar cada vuelta; [0] = parrilla
  order: number[]; // ids en orden de llegada
  stints: Record<number, { c: Compound; from: number }[]>;
  ends: Record<number, number>; // vuelta en la que acabó cada coche
  mine: number[]; // ids de los pilotos del jugador
  key: { lap: number; text: string }[]; // momentos clave
  fl?: { id: number; t: number; lap: number }; // vuelta rápida
  photos?: { src: string; text: string; lap: number }[]; // fotos del 3D (máx. 10), si se vio en 3D y hay sitio
}

export interface RoundResult {
  round: number;
  circuitId: string;
  q?: ResultRow[];
  sprint?: ResultRow[];
  race?: ResultRow[];
  raceTable?: number[]; // carrera acortada: tabla de puntos reducida
  sprintTable?: number[];
  summary?: RaceSummary;
  sprintSummary?: RaceSummary;
  /** Lo que escribió la directiva tras la carrera. */
  board?: string;
}

export interface SeasonState {
  v: number;
  playerTeam: string;
  seed: number;
  round: number; // índice de la ronda en curso
  calendar?: string[]; // ids de los circuitos, en orden (las temporadas antiguas no lo tienen: 5 carreras)
  /** Formato de los fines de semana que no corren con el de su circuito (calendario completo: Silverstone sprint, Interlagos normal). */
  formatos?: Record<string, "normal" | "sprint">;
  weekend: WeekendState | null;
  rounds: RoundResult[];
  /** Modo «crear equipo»: lo que fichó el jugador (su equipo es el último de la parrilla). */
  equipo?: CustomTeam;
  /** Modo «crear equipo»: unidades de potencia de cada piloto tras la última carrera. */
  pu?: Record<number, PuState>;
  /** Desarrollo del coche por piezas (las temporadas de antes no lo tienen: su coche mejora solo, como entonces). */
  dev?: DevState;
  /** Objetivos de la directiva para la temporada (se ponen al abrirla por primera vez). */
  objetivos?: Objective[];
  // ---- varias temporadas (career.ts): las de la primera temporada no tienen nada de esto (es 2026)
  /** Año de la temporada (sin él, 2026). */
  year?: number;
  /** Moral de tus pilotos (por nombre, 0 a 100) y rivalidades entre pilotos (ver morale.ts). */
  moral?: Record<string, number>;
  rivals?: { a: string; b: string; k: number }[];
  /** Lo que piensa la directiva de lo dicho en la rueda de prensa (−3 a 3); se le pasa al escribir tras la carrera. */
  boardMood?: number;
  /** «Crear equipo»: semilla de los valores reales (ocultos) de pilotos, jefes, técnicos y motores: la de la primera
   *  temporada, para que no cambien de un año a otro (sin ella, la de la temporada). */
  trueSeed?: number;
  /** Equipos de la temporada (coches y pilotos) si ya no son los de 2026: con equipo real, los 11; en «crear
   *  equipo», los de la IA. */
  grid?: TeamDef[];
  /** «Crear equipo»: tus pilotos tal como son esta temporada (con su edad) y lo que conserva tu coche del año pasado. */
  misPilotos?: DriverDef[];
  carry?: number;
  /** Pilotos sin equipo (libres, reservas y novatos) y hasta qué año tiene contrato cada piloto. */
  pool?: DriverDef[];
  contracts?: Record<string, number>;
  /** Salario de cada piloto con contrato (M por temporada; en «crear equipo», los tuyos cuentan en el techo de gasto). */
  salaries?: Record<string, number>;
  /** Temporadas anteriores, lo que ha pasado en el mercado antes de esta y lo que cambia el presupuesto. */
  history?: SeasonRecord[];
  news?: string[];
  devBonus?: number;
  /** Temporadas seguidas sin cumplir ningún objetivo (con dos, la directiva avisa de que el jefe peligra). */
  aviso?: number;
  /** Cambios de piloto a mitad de temporada (lesiones, destituciones, tus fichajes), en orden. */
  swaps?: SeatSwap[];
  /** Modo gran premio: un solo fin de semana (calendario de un circuito), con el tiempo que se eligió. */
  gp?: { tiempo: GpWeather };
}

/** Tiempo de un gran premio suelto: el del clima del circuito, o forzado. */
export type GpWeather = "clima" | "seco" | "variable" | "lluvia";

/** Un cambio de piloto a mitad de temporada: desde la ronda `round` (índice, 0 la primera), en el asiento `seat` (el id
 *  del coche), corre `in` en lugar de `out`. */
export interface SeatSwap { round: number; seat: number; in: DriverDef; out: DriverDef; why: string }

/** Id de la persona que llevaba un asiento en una ronda: el del asiento si es quien lo lleva ahora; si no, 1000 + el
 *  índice del cambio en el que salió (así el mundial cuenta por piloto aunque haya cambios). */
export function personId(s: SeasonState, round: number, seat: number): number {
  const sw = (s.swaps ?? []).filter((x) => x.seat === seat);
  if (!sw.length) return seat;
  let holder = sw[0].out;
  for (const x of sw) if (x.round <= round) holder = x.in;
  if (holder.abrev === sw[sw.length - 1].in.abrev) return seat;
  return 1000 + (s.swaps ?? []).findIndex((x) => x.seat === seat && x.out.abrev === holder.abrev);
}

export function pointsFor(rows: ResultRow[] | undefined, table: number[]): Map<number, number> {
  const m = new Map<number, number>();
  if (!rows) return m;
  rows.forEach((r, i) => { if (r.status === "fin" && i < table.length) m.set(r.id, table[i]); });
  return m;
}

export interface Standing { id: number; points: number; wins: number; best: number }

export function driverStandings(s: SeasonState, nDrivers: number): Standing[] {
  const by = new Map<number, Standing>();
  for (let id = 0; id < nDrivers; id++) by.set(id, { id, points: 0, wins: 0, best: 99 });
  const at = (round: number, seat: number) => { const k = personId(s, round, seat); let x = by.get(k); if (!x) by.set(k, (x = { id: k, points: 0, wins: 0, best: 99 })); return x; };
  s.rounds.forEach((r, ri) => {
    for (const [id, p] of pointsFor(r.race, r.raceTable ?? RACE_POINTS)) at(ri, id).points += p;
    for (const [id, p] of pointsFor(r.sprint, r.sprintTable ?? SPRINT_POINTS)) at(ri, id).points += p;
    r.race?.forEach((row, i) => {
      const x = at(ri, row.id);
      if (i === 0 && row.status === "fin") x.wins++;
      if (row.status === "fin") x.best = Math.min(x.best, i + 1);
    });
  });
  return [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
}

/** Puntos de cada asiento (para constructores: el coche suma aunque cambie el piloto). */
function seatPoints(s: SeasonState): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of s.rounds) {
    for (const [id, p] of pointsFor(r.race, r.raceTable ?? RACE_POINTS)) m.set(id, (m.get(id) ?? 0) + p);
    for (const [id, p] of pointsFor(r.sprint, r.sprintTable ?? SPRINT_POINTS)) m.set(id, (m.get(id) ?? 0) + p);
  }
  return m;
}

export function teamStandings(s: SeasonState, teams: TeamDef[]): { team: TeamDef; points: number }[] {
  const byId = seatPoints(s);
  let id = 0;
  return teams.map((t) => {
    let p = 0;
    for (const _ of t.pilotos) p += byId.get(id++) ?? 0;
    return { team: t, points: p };
  }).sort((a, b) => b.points - a.points);
}
