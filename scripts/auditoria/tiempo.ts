// Auditoría: solo el tiempo. Juega muchos días de un escenario en cada circuito y cuenta cuántos llueve sobre el
// circuito (más de 0,3 mm/h un rato) en una franja horaria. Sin sesiones: tarda segundos.
//   npx tsx scripts/auditoria/tiempo.ts [escenario=seco] [días=300] [desde=14:00] [hasta=16:00]
import { readFileSync, readdirSync } from "fs";
import { Rng } from "../../src/sim/rng";
import { createDayWeather, stepWeather, rainAt, Scenario } from "../../src/sim/weather";

const [sc = "seco", nS = "300", fromS = "14:00", toS = "16:00"] = process.argv.slice(2);
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const from = hm(fromS), to = hm(toS);
let tot = 0, wet = 0;
const out: string[] = [];
for (const f of readdirSync("data/circuitos").filter((x) => x.endsWith(".json"))) {
  const def = JSON.parse(readFileSync(`data/circuitos/${f}`, "utf8"));
  let w8 = 0;
  for (let i = 0; i < Number(nS); i++) {
    const w = createDayWeather(new Rng(1000 + i * 7919), def.clima, sc as Scenario, 0, 9 * 60);
    let mins = 0;
    while (w.clock < to) { stepWeather(w, 1); if (w.clock >= from && rainAt(w, 0, 0) > 0.3) mins++; }
    if (mins >= 5) w8++;
  }
  tot += Number(nS); wet += w8;
  out.push(`${f.replace(".json", "").padEnd(12)} ${(100 * w8 / Number(nS)).toFixed(1)} %`);
}
console.log(`«${sc}», de ${fromS} a ${toS}: llueve sobre el circuito (≥5 min a más de 0,3 mm/h) en el ${(100 * wet / tot).toFixed(1)} % de los días`);
if (process.argv.includes("--por-circuito")) console.log(out.join("\n"));
