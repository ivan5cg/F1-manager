// La experta técnica sin interfaz (10.3): corre una carrera y vuelca lo que comenta Begoña Arrieta, con la vuelta.
// npx tsx scripts/experta.ts [circuito] [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef, Session } from "../src/sim/session";
import { createExperta } from "../src/ui/experta";
const id = process.argv[2] ?? "silverstone", seed = Number(process.argv[3] ?? 5);
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
let cur: Session | null = null;
(globalThis as any).performance = { now: () => (cur?.t ?? 0) * 1000 }; // el tiempo real es el de la sesión
const s = new Weekend(newWeekend(1, def, teams, seed), buildTrack(def), teams, "ferrari").build("RACE");
s.autoPlayers = true; cur = s;
const x = createExperta(s);
s.onEvent = (e) => { const c = x.onEvent(e); if (c) console.log(`V${c.lap} [${e.code}] ${c.text}`); };
while (!s.finished && s.wall < 4 * 3600) { s.step(); const c = x.tick(); if (c) console.log(`V${c.lap} ${c.text}`); }
console.log(`\n${x.list.length} comentarios en ${s.laps} vueltas`);
