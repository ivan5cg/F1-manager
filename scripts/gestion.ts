// Lo nuevo de la simulación del bloque 13, sin interfaz:
//  1) banderas azules ignoradas y sanciones sin cumplir que pasan a la parrilla siguiente, en una serie de carreras;
//  2) tras una bandera roja por lluvia, el coche de seguridad y después salida parada (se fuerza la bandera roja).
// npx tsx scripts/gestion.ts [circuito] [carreras]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef, Session } from "../src/sim/session";

const id = process.argv[2] ?? "silverstone", n = Number(process.argv[3] ?? 8);
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const track = buildTrack(def);
const race = (seed: number) => { const s = new Weekend(newWeekend(1, def, teams, seed), track, teams, "ferrari").build("RACE"); s.autoPlayers = true; return s; };

console.log(`1) ${n} carreras en ${id}`);
let blue = 0, grid = 0;
for (let r = 0; r < n; r++) {
  const s = race(300 + r);
  const ev: string[] = [];
  s.onEvent = (e) => { if (e.code === "azules") { blue++; ev.push(e.text.replace(/^\S+ /, "")); } };
  while (!s.finished && s.wall < 4 * 3600) s.step();
  const gp = s.gridPenaltiesNext();
  grid += gp.length;
  console.log(`   carrera ${r + 1}: ${ev.length ? ev.join("; ") : "sin banderas azules ignoradas"}${gp.length ? ` · a la parrilla siguiente: ${gp.map((g) => `${s.carById(g.carId).d.abrev} ${g.places} puestos (${g.why})`).join(", ")}` : ""}`);
}
console.log(`   media: ${(blue / n).toFixed(2)} banderas azules ignoradas y ${(grid / n).toFixed(2)} sanciones a la parrilla siguiente por carrera`);

console.log("\n2) Bandera roja por lluvia a mitad de carrera (forzada) y lo que viene después");
const s: Session = race(77);
const log: string[] = [];
s.onEvent = (e) => { if (e.kind === "control" && /ROJA|coche de seguridad|salida parada|semáforos|Relanzada|reanuda/i.test(e.text)) log.push(`V${s.leaderLap + 1} ${e.text}`); };
const any = s as any;
while (s.leaderLap < 20) s.step();
// bandera roja por lluvia: la pista ya está practicable cuando toca reanudar (para ver qué hace al reanudar)
any.flag = "red"; any.redReason = "rain"; any.flagTimer = 1; any.redWall = s.wall;
for (const c of s.cars) if (c.loc === "track") { c.pitRequest = null; }
while (!s.finished && s.leaderLap < 30 && s.wall < 4 * 3600) s.step();
for (const l of log) console.log("   " + l);
