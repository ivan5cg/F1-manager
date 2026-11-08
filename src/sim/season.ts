// Minitemporada: calendario, puntos y clasificaciones de pilotos y constructores.
import { TeamDef, ResultRow } from "./session";
import { WeekendState } from "./weekend";

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

export interface RoundResult {
  round: number;
  circuitId: string;
  q?: ResultRow[];
  sprint?: ResultRow[];
  race?: ResultRow[];
  raceTable?: number[]; // carrera acortada: tabla de puntos reducida
  sprintTable?: number[];
}

export interface SeasonState {
  v: number;
  playerTeam: string;
  seed: number;
  round: number; // índice de la ronda en curso
  calendar?: string[]; // ids de los circuitos, en orden (las temporadas antiguas no lo tienen: 5 carreras)
  weekend: WeekendState | null;
  rounds: RoundResult[];
}

export function pointsFor(rows: ResultRow[] | undefined, table: number[]): Map<number, number> {
  const m = new Map<number, number>();
  if (!rows) return m;
  rows.forEach((r, i) => { if (r.status === "fin" && i < table.length) m.set(r.id, table[i]); });
  return m;
}

export interface Standing { id: number; points: number; wins: number; best: number }

export function driverStandings(s: SeasonState, nDrivers: number): Standing[] {
  const out: Standing[] = Array.from({ length: nDrivers }, (_, id) => ({ id, points: 0, wins: 0, best: 99 }));
  for (const r of s.rounds) {
    for (const [id, p] of pointsFor(r.race, r.raceTable ?? RACE_POINTS)) out[id].points += p;
    for (const [id, p] of pointsFor(r.sprint, r.sprintTable ?? SPRINT_POINTS)) out[id].points += p;
    r.race?.forEach((row, i) => {
      if (i === 0 && row.status === "fin") out[row.id].wins++;
      if (row.status === "fin") out[row.id].best = Math.min(out[row.id].best, i + 1);
    });
  }
  return out.sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best);
}

export function teamStandings(s: SeasonState, teams: TeamDef[]): { team: TeamDef; points: number }[] {
  const ds = driverStandings(s, teams.reduce((a, t) => a + t.pilotos.length, 0));
  const byId = new Map(ds.map((d) => [d.id, d.points]));
  let id = 0;
  return teams.map((t) => {
    let p = 0;
    for (const _ of t.pilotos) p += byId.get(id++) ?? 0;
    return { team: t, points: p };
  }).sort((a, b) => b.points - a.points);
}
