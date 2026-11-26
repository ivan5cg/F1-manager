// Lo que comparten los bancos de pruebas de la carrera (carrera.ts, realismo.ts): una carrera sin libres ni
// clasificación, con lo que los equipos habrían aprendido en los libres y una parrilla por ritmo con algo de azar.
import { readFileSync } from "fs";
import { buildTrack, Track } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { Session, TeamDef, ResultRow } from "../src/sim/session";
import { Rng } from "../src/sim/rng";

const tracks = new Map<string, { def: any; track: Track }>();
export const TEAMS = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];

export function circuit(id: string) {
  let t = tracks.get(id);
  if (!t) {
    const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
    t = { def, track: buildTrack(def) };
    tracks.set(id, t);
  }
  return t;
}

/**
 * Carrera lista para correr. `dry`: los tres días en seco (si no, el tiempo que toque con esa semilla). `quali`: la
 * parrilla sale de correr la clasificación (si no, una por ritmo con algo de azar, que es más rápida).
 */
export function benchRace(id: string, seed: number, dry = true, quali = false): Session {
  const { def, track } = circuit(id);
  // una semilla por circuito, como el juego (una por ronda): con la misma en todos, las carreras de una semilla
  // compartían los dados (en la salida, los mismos para cada puesto de parrilla en todos los circuitos)
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const ws = seed * 1000 + h;
  const st = newWeekend(def.ronda, def, TEAMS, ws);
  if (dry) for (const d of st.days) d.scenario = "seco";
  // lo que habrían aprendido en los libres
  const kr = new Rng(ws * 77 + 5);
  for (const k of Object.values(st.knowledge)) {
    for (const c of ["S", "M", "H"] as const) { k.noise[c] = Math.max(0.03, k.noise[c] * 0.45); k.hidden.wearMult[c] = st.hidden.wearMult[c] * kr.logn(k.noise[c]); }
    k.hidden.thermalOffset = st.hidden.thermalOffset + kr.gauss(0, 1.5);
  }
  st.rubber = 0.6;
  const wk = new Weekend(st, track, TEAMS, "-");
  if (quali) {
    st.next = wk.sessions().indexOf("Q");
    const q = wk.build("Q");
    while (!q.finished && q.wall < 4 * 3600) q.step();
    wk.finish(q);
    st.next = wk.sessions().indexOf("RACE");
    return wk.build("RACE");
  }
  // parrilla: por ritmo con algo de azar, como una clasificación
  const ents = wk.entrants();
  const q = ents.map((e) => ({ id: e.id, k: -(e.d.ritmo - 85) * 0.0007 - e.team.agarre / 180 - e.team.potencia * 0.0012 + kr.gauss(0, 0.0022) })).sort((a, b) => a.k - b.k);
  st.results.Q = q.map((x, i) => ({ id: x.id, pos: i + 1, best: 90, time: 0, laps: 0, status: "ok", stops: 0 }) as ResultRow);
  st.next = wk.sessions().indexOf("RACE");
  return wk.build("RACE");
}
