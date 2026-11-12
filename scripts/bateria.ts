// Traza de la batería a lo largo de una vuelta de carrera: npx tsx scripts/bateria.ts singapur [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, SOC_MAX, ERS_NAMES } from "../src/sim/session";
const id = process.argv[2] ?? "singapur", seed = Number(process.argv[3] ?? 1);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const wk = new Weekend(newWeekend(def.ronda, def, teams, seed), buildTrack(def), teams, "-");
const s = wk.build("RACE");
const c = s.cars[0];
const L = s.track.length;
let lo = 1, hi = 0, line = "", next = 0;
const laps: string[] = [];
while (!s.finished && s.lapsDone(c) < 12) {
  const lap0 = s.lapsDone(c);
  s.step();
  const p = c.soc / SOC_MAX;
  if (lap0 >= 9) {
    lo = Math.min(lo, p); hi = Math.max(hi, p);
    const f = ((c.s % L) + L) % L / L;
    if (f >= next) { line += String(Math.round(p * 100)).padStart(4); next += 1 / 24; }
  }
  if (s.lapsDone(c) !== lap0 && lap0 >= 9) { laps.push(`V${lap0 + 1} [${ERS_NAMES[c.ers]}] ${line}   min ${Math.round(lo * 100)} max ${Math.round(hi * 100)}`); line = ""; next = 0; lo = 1; hi = 0; }
}
console.log(`${def.nombre}: ${s.ersLap.toFixed(1)} MJ recuperados por vuelta · batería de ${c.d.abrev} en % cada 1/24 de vuelta`);
console.log(laps.join("\n"));
