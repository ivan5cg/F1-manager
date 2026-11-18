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
import melbourne from "../../data/circuitos/melbourne.json";
import shanghai from "../../data/circuitos/shanghai.json";
import miami from "../../data/circuitos/miami.json";
import montreal from "../../data/circuitos/montreal.json";
import barcelona from "../../data/circuitos/barcelona.json";
import spielberg from "../../data/circuitos/spielberg.json";
import hungaroring from "../../data/circuitos/hungaroring.json";
import zandvoort from "../../data/circuitos/zandvoort.json";
import madrid from "../../data/circuitos/madrid.json";
import baku from "../../data/circuitos/baku.json";
import austin from "../../data/circuitos/austin.json";
import mexico from "../../data/circuitos/mexico.json";
import lasvegas from "../../data/circuitos/lasvegas.json";
import lusail from "../../data/circuitos/lusail.json";
import yasmarina from "../../data/circuitos/yasmarina.json";
import market from "../../data/mercado-2026.json";
import { buildTrack, Track } from "../sim/track";
import type { TeamDef, DriverDef } from "../sim/session";
import { buildGrid, GridChange, Market, PLAYER_TEAM_ID, costOf, trueTech } from "../sim/market";
import { applyDev, DEV_RIVAL } from "../sim/development";
import { type SeasonState, type SeatSwap, personId } from "../sim/season";

/** Los 11 equipos reales (modo clásico y base del modo «crear equipo»). */
export const BASE_TEAMS = teamsJson.equipos as unknown as TeamDef[];
export const MARKET = market as unknown as Market;
/** Parrilla de la temporada en curso: la real, o la que sale de tus fichajes (cambia con el desarrollo). */
export let TEAMS: TeamDef[] = BASE_TEAMS;
/** Quién ha tenido que cubrir a quién por tus fichajes. */
export let GRID_CHANGES: GridChange[] = [];
export const CIRCUITS: Record<string, any> = { silverstone, spa, monza, "sierra-norte": sierra, interlagos, suzuka, monaco, singapur, bahrein, sepang, melbourne, shanghai, miami, montreal, barcelona, spielberg, hungaroring, zandvoort, madrid, baku, austin, mexico, lasvegas, lusail, yasmarina };
/** Calendario corto (el de siempre, 9 carreras): el de las temporadas nuevas si no se elige el completo. */
export const ROUNDS: string[] = cal.rondas;
type CalEntry = string | { id: string; formato?: "normal" | "sprint" };
/** Los dos calendarios: ids en orden y el formato de los que no corren con el de su circuito. */
export const CALENDARS: Record<"corta" | "completa", { ids: string[]; formatos: Record<string, "normal" | "sprint"> }> = {
  corta: { ids: cal.rondas, formatos: {} },
  completa: {
    ids: (cal.completa as CalEntry[]).map((e) => (typeof e === "string" ? e : e.id)),
    formatos: Object.fromEntries((cal.completa as CalEntry[]).filter((e): e is { id: string; formato: "normal" | "sprint" } => typeof e !== "string" && !!e.formato).map((e) => [e.id, e.formato])),
  },
};
/** Calendario de una temporada: las empezadas antes de ampliar el calendario siguen con el suyo de 5 carreras. */
export function calendarOf(s: { calendar?: string[] } | null | undefined): string[] {
  return s?.calendar ?? (s ? cal.rondasV1 : cal.rondas);
}
/** Datos de un circuito tal como corre en esa temporada (el formato puede no ser el suyo). */
export function circuitOf(s: { formatos?: Record<string, string> } | null | undefined, id: string): any {
  const def = CIRCUITS[id];
  const f = s?.formatos?.[id];
  return f && f !== def.formato ? { ...def, formato: f } : def;
}
/** Cuánto de una temporada de evoluciones se ha hecho tras `round` rondas: la temporada corta tiene 8 rondas de
 *  evoluciones y una larga reparte las mismas entre todas sus carreras. */
export function devRounds(s: { calendar?: string[] } | null | undefined, round: number): number {
  const n = calendarOf(s).length;
  return n > 9 ? (round * 8) / (n - 1) : round;
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
  const g = gridBase(s, round);
  return s.swaps?.length ? { ...g, teams: applySwaps(g.teams, s.swaps, round) } : g;
}

/** Cambios de piloto a mitad de temporada hasta esa ronda: el asiento (id del coche) pasa a llevarlo otro. */
function applySwaps(teams: TeamDef[], swaps: SeatSwap[], round: number): TeamDef[] {
  const out = teams.map((t) => ({ ...t, pilotos: [...t.pilotos] }));
  for (const x of swaps) {
    if (x.round > round) continue;
    let id = 0;
    for (const t of out) for (let k = 0; k < t.pilotos.length; k++, id++) if (id === x.seat) t.pilotos[k] = x.in;
  }
  return out;
}

/** Quién es un piloto del mundial (id de asiento o, si ya no corre, 1000 + el cambio en el que salió). */
export function who(s: SeasonState | null, id: number): { id: number; d: DriverDef; team: TeamDef } {
  if (id < 1000 || !s?.swaps) return DRIVERS[id];
  const x = s.swaps[id - 1000];
  return { id, d: x.out, team: DRIVERS[x.seat].team };
}

/** Quién llevaba un asiento en una ronda (índice, 0 la primera). */
export function whoAt(s: SeasonState | null, round: number, seat: number): { id: number; d: DriverDef; team: TeamDef } {
  return s ? who(s, personId(s, round, seat)) : DRIVERS[seat];
}

function gridBase(s: SeasonState, round: number): { teams: TeamDef[]; changes: GridChange[] } {
  const r = Math.min(round, calendarOf(s).length - 1);
  // temporadas siguientes: los equipos tal como empiezan ese año (career.ts)
  const base = s.grid ?? BASE_TEAMS;
  if (!s.equipo) {
    // equipo real: con desarrollo por piezas, los rivales mejoran a un ritmo fijo y el tuyo, con lo que pidas
    if (!s.dev) return { teams: base, changes: [] };
    return { teams: base.map((t) => (t.id === s.playerTeam ? applyDev(t, s.dev, r) : { ...t, agarre: t.agarre + DEV_RIVAL * devRounds(s, r) })), changes: [] };
  }
  const g = buildGrid(base, MARKET, s.equipo, s.trueSeed ?? s.seed, devRounds(s, r), !!s.dev, s.grid ? { agarre: s.carry ?? 0, extra: s.misPilotos } : undefined);
  if (s.dev) g.teams = g.teams.map((t) => (t.id === PLAYER_TEAM_ID ? applyDev(t, s.dev, r) : t));
  return g;
}

/** Desarrollo: lo que queda del techo de gasto («crear equipo»; null con un equipo real) y el ritmo de tu director
 *  técnico frente al medio (lo publicado, para lo que se espera; lo real, para lo que rinde). */
export function devContext(s: SeasonState): { left: number | null; pubK: number; realK: number } {
  if (!s.equipo) return { left: null, pubK: 1, realK: 1 };
  const tech = MARKET.tecnicos.find((x) => x.nombre === s.equipo!.tecnico);
  const pub = tech?.desarrollo ?? 0.06, real = tech ? trueTech(tech, s.trueSeed ?? s.seed).desarrollo : pub;
  // temporadas siguientes: el techo lo gastan los salarios de ese año (tus pilotos, jefe y técnico) y el motor;
  // las cláusulas de la primera ya se pagaron
  let spent = costOf(MARKET, s.equipo);
  if (s.salaries) {
    const e = s.equipo;
    spent = (MARKET.jefes.find((x) => x.nombre === e.jefe)?.salario ?? 0) + (tech?.salario ?? 0) + (MARKET.motores.find((x) => x.id === e.motor)?.precio ?? 0)
      + e.pilotos.reduce((a, p) => a + (s.salaries![p] ?? 0), 0);
  }
  return { left: MARKET.techo - spent, pubK: pub / 0.06, realK: real / 0.06 };
}
let CUR: SeasonState | null = null;
/** Quién es un piloto del mundial de la temporada activa (con los que ya no corren). */
export const person = (id: number) => who(CUR, id);
/** Deja como activa la parrilla de la temporada (llamar al cargarla y al pasar de ronda). */
export function useSeason(s: SeasonState | null) {
  CUR = s;
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
