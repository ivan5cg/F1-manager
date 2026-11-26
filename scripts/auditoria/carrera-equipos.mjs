// Lo mismo que rendimiento/race.py, pero con las carreras del simulador: distancia de cada equipo a Mercedes por el
// tiempo total de su mejor coche (los doblados, a una vuelta del ganador por cada vuelta perdida) y doblados por
// carrera, para comparar con lo real en igualdad de condiciones.
//   node scripts/auditoria/carrera-equipos.mjs auditoria-out/<lote> [...]
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const rr = {}, lapped = [], lappedT = {};
for (const dir of process.argv.slice(2)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let d; try { d = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
  const R = d.sessions.RACE; if (!R || R.maxWater > 0.2) continue;
  const fin = R.res.filter((x) => x.status === "fin");
  const win = fin[0], L = win.laps, T = win.time, lap = T / L;
  const tot = {};
  let nl = 0;
  for (const x of fin) {
    const t = x.laps < L ? (nl++, (lappedT[x.team] = (lappedT[x.team] ?? 0) + 1), T + (L - x.laps) * lap) : x.time;
    tot[x.team] = Math.min(tot[x.team] ?? Infinity, t);
  }
  lapped.push(nl);
  if (!tot.mercedes) continue;
  for (const [k, v] of Object.entries(tot)) (rr[k] ??= []).push(100 * (v / tot.mercedes - 1));
}
console.log(`${lapped.length} carreras secas · doblados por carrera: media ${(lapped.reduce((a, b) => a + b, 0) / lapped.length).toFixed(2)} mediana ${med(lapped)} · sin doblados ${(100 * lapped.filter((x) => !x).length / lapped.length).toFixed(0)} %`);
console.log("carrera (% frente a Mercedes, tiempo total del mejor coche): " + Object.keys(rr).sort((a, b) => med(rr[a]) - med(rr[b])).map((k) => `${k} ${med(rr[k]).toFixed(2)}`).join(" · "));
console.log("doblados por equipo (total): " + JSON.stringify(lappedT));
