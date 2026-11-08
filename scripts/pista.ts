// Analiza un circuito: npx tsx scripts/pista.ts silverstone [salida.svg]
import { readFileSync, writeFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
const id = process.argv[2] ?? "silverstone";
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const t0 = Date.now();
const t = buildTrack(def);
let vmax = 0, vmin = 999;
for (const v of t.vref) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
const ot = t.ms.filter((m) => m.overtake > 0).map((m) => `${m.i}(${m.overtake.toFixed(2)})`).join(" ");
const drs = t.ms.filter((m) => m.drs).map((m) => m.i).join(",");
let eF = 0, eR = 0; for (const m of t.ms) { eF += m.energyF; eR += m.energyR; }
let g1 = 0, g0 = 0; for (const m of t.ms) { g0 += m.tByGrip[12]; g1 += m.tByGrip[11]; }
console.log(`${t.name}: ${t.length.toFixed(0)} m, vuelta ref ${t.refLap.toFixed(2)} s (pole objetivo ${def.poleObjetivo}), mu ${t.car.mu.toFixed(3)}, vmax ${(vmax * 3.6).toFixed(0)} vmin ${(vmin * 3.6).toFixed(0)} km/h, ${t.ms.length} minisectores, calle boxes ${t.pit.laneLength.toFixed(0)} m, -5% agarre: +${(g1 - g0).toFixed(2)} s, eF ${eF.toFixed(2)} eR ${eR.toFixed(2)}, adelantamiento ${ot}, MO ${drs} (${Date.now() - t0} ms)`);
if (process.argv[3]) {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (let i = 0; i < t.xs.length; i++) { minx = Math.min(minx, t.xs[i]); maxx = Math.max(maxx, t.xs[i]); miny = Math.min(miny, t.ys[i]); maxy = Math.max(maxy, t.ys[i]); }
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minx - 80} ${-maxy - 80} ${maxx - minx + 160} ${maxy - miny + 160}" width="700"><rect x="-99999" y="-99999" width="999999" height="999999" fill="#111"/>`;
  for (let i = 0; i < t.xs.length; i += 2) {
    const v = t.vref[i] * 3.6; const h = Math.max(0, Math.min(240, (v - 70) / 260 * 240));
    s += `<circle cx="${t.xs[i]}" cy="${-t.ys[i]}" r="9" fill="hsl(${h},90%,55%)"/>`;
  }
  s += `<circle cx="${t.xs[0]}" cy="${-t.ys[0]}" r="25" fill="none" stroke="white" stroke-width="6"/>`;
  writeFileSync(process.argv[3], s + "</svg>");
}
