// Auditoría: la misma carrera varias veces. Juega el fin de semana hasta la clasificación una vez y luego la carrera
// (o la sprint) con K semillas distintas, con la misma parrilla. Dice cuánto decide el azar de la carrera.
//   npx tsx scripts/auditoria/repite.ts <circuito> <semilla> <K> [RACE|SPRINT]   (una línea JSON por la salida)
import { readFileSync } from "fs";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import { TeamDef } from "../../src/sim/session";

const [id, seedS, kS = "6", kindArg = "RACE"] = process.argv.slice(2);
const kind = kindArg as "RACE" | "SPRINT";
const seed = Number(seedS), K = Number(kS);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
// la misma semilla de fin de semana que gp.ts
const weekendSeed = (s: number, circuit: string) => { let h = 7; for (const ch of circuit) h = (h * 31 + ch.charCodeAt(0)) % 997; return s * 1000 + h; };
const st = newWeekend(def.ronda, def, teams, weekendSeed(seed, id));
for (const d of st.days) d.scenario = "seco";
const wk = new Weekend(st, track, teams, "-");
const ents = wk.entrants();
for (let k = wk.nextKind(); k && k !== kind; k = wk.nextKind()) { const s = wk.build(k); while (!s.finished && s.wall < 5 * 3600) s.step(); wk.finish(s); }
const runs: { win: string; order: string[]; wet: boolean; lead1: string }[] = [];
let grid: string[] = [];
for (let r = 0; r < K; r++) {
  const s = wk.build(kind, r);
  let maxW = 0;
  while (!s.finished && s.wall < 5 * 3600) { s.step(); if (Math.round(s.wall / 0.05) % 200 === 0) maxW = Math.max(maxW, s.avgWater()); }
  grid = s.lapOrder[0].map((i) => ents[i].d.abrev);
  const res = s.results();
  runs.push({ win: ents[res[0].id].d.abrev, order: res.slice(0, 6).map((x) => ents[x.id].d.abrev + (x.status === "fin" ? "" : "×")), wet: maxW > 0.2, lead1: ents[s.lapOrder[1][0]].d.abrev });
}
console.log(JSON.stringify({ id, seed, grid: grid.slice(0, 8), runs }));
