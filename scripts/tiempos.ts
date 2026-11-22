// Tiempo de cálculo de la simulación: corre una carrera por circuito (sin interfaz) y saca los µs por paso.
// Sirve para vigilar lo que cuesta cada cambio en el motor (ver docs/PLAN-LATERAL.md, «Rendimiento»).
//   npx tsx scripts/tiempos.ts [circuito ...] [--semilla=1]
import { benchRace } from "./banco";

const args = process.argv.slice(2);
const seed = Number(args.find((a) => a.startsWith("--semilla="))?.split("=")[1] ?? 1);
const ids = args.filter((a) => !a.startsWith("--"));
for (const id of ids.length ? ids : ["monza", "monaco"]) {
  const s = benchRace(id, seed);
  let n = 0;
  const t0 = performance.now();
  while (!s.finished && s.wall < 4 * 3600) { s.step(); n++; }
  const ms = performance.now() - t0;
  console.log(`${id}: ${n} pasos, ${(ms / 1000).toFixed(1)} s, ${((ms * 1000) / n).toFixed(1)} µs por paso, ${s.cars.length} coches`);
}
