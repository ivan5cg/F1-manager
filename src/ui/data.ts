import teamsJson from "../../data/equipos-2026.json";
import cal from "../../data/calendario.json";
import silverstone from "../../data/circuitos/silverstone.json";
import spa from "../../data/circuitos/spa.json";
import monza from "../../data/circuitos/monza.json";
import sierra from "../../data/circuitos/sierra-norte.json";
import interlagos from "../../data/circuitos/interlagos.json";
import { buildTrack, Track } from "../sim/track";
import type { TeamDef, DriverDef } from "../sim/session";

export const TEAMS = teamsJson.equipos as unknown as TeamDef[];
export const CIRCUITS: Record<string, any> = { silverstone, spa, monza, "sierra-norte": sierra, interlagos };
export const ROUNDS: string[] = cal.rondas;

export const DRIVERS: { id: number; d: DriverDef; team: TeamDef }[] = [];
{
  let id = 0;
  for (const t of TEAMS) for (const d of t.pilotos) DRIVERS.push({ id: id++, d, team: t });
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
