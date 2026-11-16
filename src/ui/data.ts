import teamsJson from "../../data/equipos-2026.json";
import cal from "../../data/calendario.json";
import silverstone from "../../data/circuitos/silverstone.json";
import spa from "../../data/circuitos/spa.json";
import monza from "../../data/circuitos/monza.json";
import sierra from "../../data/circuitos/sierra-norte.json";
import interlagos from "../../data/circuitos/interlagos.json";
import suzuka from "../../data/circuitos/suzuka.json";
import monaco from "../../data/circuitos/monaco.json";
import singapur from "../../data/circuitos/singapur.json";
import bahrein from "../../data/circuitos/bahrein.json";
import sepang from "../../data/circuitos/sepang.json";
import market from "../../data/mercado-2026.json";
import { buildTrack, Track } from "../sim/track";
import type { TeamDef, DriverDef } from "../sim/session";
import { buildGrid, GridChange, Market, PLAYER_TEAM_ID, costOf, trueTech } from "../sim/market";
import { applyDev, DEV_RIVAL } from "../sim/development";
import type { SeasonState } from "../sim/season";

/** Los 11 equipos reales (modo clásico y base del modo «crear equipo»). */
export const BASE_TEAMS = teamsJson.equipos as unknown as TeamDef[];
export const MARKET = market as unknown as Market;
/** Parrilla de la temporada en curso: la real, o la que sale de tus fichajes (cambia con el desarrollo). */
export let TEAMS: TeamDef[] = BASE_TEAMS;
/** Quién ha tenido que cubrir a quién por tus fichajes. */
export let GRID_CHANGES: GridChange[] = [];
export const CIRCUITS: Record<string, any> = { silverstone, spa, monza, "sierra-norte": sierra, interlagos, suzuka, monaco, singapur, bahrein, sepang };
/** Calendario de las temporadas nuevas. */
export const ROUNDS: string[] = cal.rondas;
/** Calendario de una temporada: las empezadas antes de ampliar el calendario siguen con el suyo de 5 carreras. */
export function calendarOf(s: { calendar?: string[] } | null | undefined): string[] {
  return s?.calendar ?? (s ? cal.rondasV1 : cal.rondas);
}

export let DRIVERS: { id: number; d: DriverDef; team: TeamDef }[] = [];
function setTeams(teams: TeamDef[]) {
  TEAMS = teams;
  const ds: typeof DRIVERS = [];
  let id = 0;
  for (const t of teams) for (const d of t.pilotos) ds.push({ id: id++, d, team: t });
  DRIVERS = ds;
}
setTeams(BASE_TEAMS);

/** Parrilla de una temporada tras `round` carreras. */
export function gridOf(s: SeasonState | null, round = s?.round ?? 0): { teams: TeamDef[]; changes: GridChange[] } {
  if (!s) return { teams: BASE_TEAMS, changes: [] };
  const r = Math.min(round, calendarOf(s).length - 1);
  if (!s.equipo) {
    // equipo real: con desarrollo por piezas, los rivales mejoran a un ritmo fijo y el tuyo, con lo que pidas
    if (!s.dev) return { teams: BASE_TEAMS, changes: [] };
    return { teams: BASE_TEAMS.map((t) => (t.id === s.playerTeam ? applyDev(t, s.dev, r) : { ...t, agarre: t.agarre + DEV_RIVAL * r })), changes: [] };
  }
  const g = buildGrid(BASE_TEAMS, MARKET, s.equipo, s.seed, r, !!s.dev);
  if (s.dev) g.teams = g.teams.map((t) => (t.id === PLAYER_TEAM_ID ? applyDev(t, s.dev, r) : t));
  return g;
}

/** Desarrollo: lo que queda del techo de gasto («crear equipo»; null con un equipo real) y el ritmo de tu director
 *  técnico frente al medio (lo publicado, para lo que se espera; lo real, para lo que rinde). */
export function devContext(s: SeasonState): { left: number | null; pubK: number; realK: number } {
  if (!s.equipo) return { left: null, pubK: 1, realK: 1 };
  const tech = MARKET.tecnicos.find((x) => x.nombre === s.equipo!.tecnico);
  const pub = tech?.desarrollo ?? 0.06, real = tech ? trueTech(tech, s.seed).desarrollo : pub;
  return { left: MARKET.techo - costOf(MARKET, s.equipo), pubK: pub / 0.06, realK: real / 0.06 };
}
/** Deja como activa la parrilla de la temporada (llamar al cargarla y al pasar de ronda). */
export function useSeason(s: SeasonState | null) {
  const g = gridOf(s);
  GRID_CHANGES = g.changes;
  setTeams(g.teams);
}

const cache = new Map<string, Track>();
export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (!t) {
    t = buildTrack(JSON.parse(JSON.stringify(CIRCUITS[id])));
    cache.set(id, t);
  }
  return t;
}
