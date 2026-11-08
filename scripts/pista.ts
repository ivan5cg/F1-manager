import def from "../data/circuito-sierra.json";
import { buildTrack } from "../src/sim/track";
import { writeFileSync } from "fs";
const t = buildTrack(def);
console.log("longitud", t.length.toFixed(0), "m  vuelta ref", t.refLap.toFixed(2), "s");
let vmax = 0, vmin = 999;
for (const v of t.vref) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
console.log("vmax", (vmax * 3.6).toFixed(0), "vmin", (vmin * 3.6).toFixed(0));
for (const m of t.ms) console.log(m.i, "S" + (m.sector + 1), m.tByGrip[12].toFixed(2), "thr", m.throttle.toFixed(2), "gSens", m.cornerSens.toFixed(2), "pow", m.dPower.toFixed(3), "kg", m.dMass.toFixed(4), "eF", m.energyF.toFixed(3), "eR", m.energyR.toFixed(3), m.overtake ? "OT" + m.overtake.toFixed(2) : "", m.drs ? "DRS" : "", m.drsDetect ? "det" : "");
// svg con color por velocidad
let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
for (let i = 0; i < t.xs.length; i++) { minx = Math.min(minx, t.xs[i]); maxx = Math.max(maxx, t.xs[i]); miny = Math.min(miny, t.ys[i]); maxy = Math.max(maxy, t.ys[i]); }
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minx - 50} ${-maxy - 50} ${maxx - minx + 100} ${maxy - miny + 100}" width="800"><rect x="-9999" y="-9999" width="99999" height="99999" fill="#111"/>`;
for (let i = 0; i < t.xs.length; i += 2) {
  const v = t.vref[i] * 3.6; const h = Math.max(0, Math.min(240, (v - 70) / 260 * 240));
  s += `<circle cx="${t.xs[i]}" cy="${-t.ys[i]}" r="6" fill="hsl(${h},90%,55%)"/>`;
}
for (const m of t.ms) s += `<text x="${m.x + 15}" y="${-m.y}" fill="white" font-size="30">${m.i}</text>`;
writeFileSync(process.argv[2] ?? "pista.svg", s + "</svg>");
