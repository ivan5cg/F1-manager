import { readFileSync } from "fs";
import { buildTrack, msTimeAtGrip } from "../../../src/sim/track";
const ids = process.argv.slice(2);
const out: any = {};
for (const id of ids) {
  const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
  const t = buildTrack(def);
  let lap = 0, P = 0, D = 0; const B = [0, 0, 0]; const T = [0, 0, 0];
  for (const m of t.ms) {
    const t0 = msTimeAtGrip(m, 1), g = t0 - msTimeAtGrip(m, 1.01);
    lap += t0; P += m.dPower; D += m.dDrag;
    for (let b = 0; b < 3; b++) { B[b] += g * m.band[b]; T[b] += t0 * m.band[b] * m.cornerSens; }
  }
  out[id] = { lap, slow: B[0], med: B[1], fast: B[2], power: P, drag: D };
  console.error(id.padEnd(11), "vuelta", lap.toFixed(1), "s/1%agarre lentas", B[0].toFixed(3), "medias", B[1].toFixed(3), "rápidas", B[2].toFixed(3), "| s/1%potencia", P.toFixed(3));
}
console.log(JSON.stringify(out));
