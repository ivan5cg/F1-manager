// Calibra el umbral de adelantamiento de cada circuito (`adelantamientos.umbral`): busca por bisección la ventaja
// con la que salen, en carreras en seco, los adelantamientos del objetivo (sin contar la primera vuelta).
//   npx tsx scripts/calibra.ts [circuito ...] [--carreras=6] [--escribe]
// El objetivo es la media real del circuito por OBJ_K. No se busca clavar el total histórico: con él, para que salieran
// tan pocos habría que pedir tanta ventaja que no se pasaría ni con gomas mucho más nuevas (lo que tenía el juego
// antes). Se fija la curva (en un circuito normal, ~35 % por vuelta con 1–1,5 s de ventaja) y los datos reales
// reparten la dificultad entre circuitos; además son de coches anteriores a 2026, y los de ahora, con el modo
// adelantamiento y la batería, adelantan bastante más.
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";

const OBJ_K = 2.4;
const args = process.argv.slice(2);
const n = Number(args.find((a) => a.startsWith("--carreras="))?.split("=")[1] ?? 6);
const write = args.includes("--escribe");
let ids = args.filter((a) => !a.startsWith("--"));
if (!ids.length) ids = readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));

function run(id: string, t: number): number {
  const out = execFileSync("npx", ["tsx", "scripts/carrera.ts", id, String(n), "101", `--umbral=${t}`], { encoding: "utf8" });
  const m = out.match(/adelantamientos por carrera: ([\d.]+) \(([\d.]+) en la primera vuelta\)/);
  if (!m) throw new Error("sin resultado: " + out.slice(-300));
  return Number(m[1]) - Number(m[2]);
}

for (const id of ids) {
  const file = `data/circuitos/${id}.json`;
  const raw = readFileSync(file, "utf8");
  const obj = Number(raw.match(/"objetivo":\s*([\d.]+)/)?.[1] ?? 35) * OBJ_K;
  // el resultado tiene ruido (pocas carreras): se queda con el umbral que más se ha acercado
  let lo = 0.7, hi = 4.5, t = 1.6, bestT = t, bestGot = Infinity;
  for (let i = 0; i < 6; i++) {
    const got = run(id, t);
    if (Math.abs(got - obj) < Math.abs(bestGot - obj)) { bestGot = got; bestT = t; }
    if (Math.abs(got - obj) < obj * 0.06) break;
    if (got > obj) lo = t; else hi = t;
    t = Math.round(((lo + hi) / 2) * 100) / 100;
  }
  t = bestT;
  console.log(`${id}: umbral ${t} → ${bestGot.toFixed(1)} adelantamientos (objetivo ${obj.toFixed(1)})`);
  if (write) {
    const next = /"umbral":\s*[\d.]+/.test(raw) ? raw.replace(/"umbral":\s*[\d.]+/, `"umbral": ${t}`) : raw.replace(/"factor":\s*[\d.]+/, `"umbral": ${t}`);
    writeFileSync(file, next);
  }
}
