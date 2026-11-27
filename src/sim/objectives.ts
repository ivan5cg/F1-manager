// Objetivos de la directiva: al empezar la temporada, uno o dos según lo bueno que sea el coche frente a la parrilla
// (acabar en cierto puesto de constructores, ganar, subir al podio o puntuar en varias carreras). Se ven en la
// pantalla de temporada con cómo van.
import type { SeasonState } from "./season";
import { teamStandings } from "./season";
import type { TeamDef } from "./session";
import { carLevel } from "./development";

export type ObjKind = "constructores" | "victorias" | "podios" | "puntuar";
export interface Objective { kind: ObjKind; target: number }

/** Objetivos de una temporada a partir de la parrilla de salida (el puesto del coche del jugador en ella). */
export function objectivesFor(teams: TeamDef[], playerTeam: string, races = 9): Objective[] {
  const order = teams.slice().sort((a, b) => carLevel(b) - carLevel(a));
  const r = order.findIndex((t) => t.id === playerTeam) + 1, n = teams.length;
  const champ: Objective = { kind: "constructores", target: Math.min(n - 1, r <= 2 ? r : r + 1) };
  // en una temporada más larga se piden más (las mismas por carrera que en la de 9)
  const k = (x: number) => Math.max(x, Math.round((x * races) / 9));
  if (r <= 2) return [champ, { kind: "victorias", target: k(2) }];
  if (r <= 4) return [champ, { kind: "podios", target: k(2) }];
  if (r <= 7) return [champ, { kind: "puntuar", target: k(5) }];
  if (r <= 9) return [champ, { kind: "puntuar", target: k(2) }];
  return [champ, { kind: "puntuar", target: Math.max(1, Math.round(races / 11)) }];
}

export interface ObjStatus { text: string; now: string; state: "done" | "failed" | "on" | "off" }

/** Cómo va un objetivo. mine: ids de los pilotos del jugador; races: carreras de la temporada. */
export function objectiveStatus(o: Objective, s: SeasonState, teams: TeamDef[], mine: number[], races: number): ObjStatus {
  const ended = s.round >= races, left = races - s.rounds.length;
  const ord = (n: number) => `${n}.º`;
  if (o.kind === "constructores") {
    const pos = teamStandings(s, teams).findIndex((x) => x.team.id === s.playerTeam) + 1;
    const ok = pos <= o.target;
    return {
      text: `Acabar ${o.target === 1 ? "campeón" : `entre los ${o.target} primeros`} de constructores`,
      now: s.rounds.length ? `${ok ? "Ahora" : "Ahora vas"} ${ord(pos)}` : "Aún no ha empezado",
      state: ended ? (ok ? "done" : "failed") : s.rounds.length ? (ok ? "on" : "off") : "on",
    };
  }
  const count = (pred: (pos: number) => boolean) => s.rounds.filter((r) => (r.race ?? []).some((row, i) => mine.includes(row.id) && row.status === "fin" && pred(i + 1))).length;
  const wins = o.kind === "victorias", pods = o.kind === "podios";
  const got = wins ? s.rounds.reduce((a, r) => a + ((r.race?.[0] && mine.includes(r.race[0].id) && r.race[0].status === "fin") ? 1 : 0), 0)
    : pods ? s.rounds.reduce((a, r) => a + (r.race ?? []).filter((row, i) => i < 3 && row.status === "fin" && mine.includes(row.id)).length, 0)
    : count((p) => p <= 10);
  const what = wins ? ["victoria", "victorias"] : pods ? ["podio", "podios"] : ["carrera puntuando", "carreras puntuando"];
  const text = wins ? `Ganar ${o.target} carreras` : pods ? `Subir ${o.target} veces al podio` : `Puntuar en ${o.target} carreras`;
  // podios: dos coches pueden subir en la misma carrera; victorias y carreras puntuando, una por carrera
  const reach = got + left * (pods ? 2 : 1);
  const state = got >= o.target ? "done" : reach < o.target || ended ? "failed" : "on";
  return { text, now: `${got} ${got === 1 ? what[0] : what[1]} de ${o.target}`, state };
}
