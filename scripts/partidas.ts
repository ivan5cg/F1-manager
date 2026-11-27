// Una partida de varias temporadas con el jugador automático de tests/partida.ts, guardada en JSON para el informe.
//   npx tsx scripts/partidas.ts <equipo|propio> <semilla> [temporadas=4] [--rapida] [--sin-test] [--sin-desarrollo] [--completo] [--rondas=N] [--salida=fichero.json]
import { writeFileSync } from "fs";
import { runCareer } from "../tests/partida";
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const flag = (f: string) => args.includes(f);
const val = (f: string) => args.find((a) => a.startsWith(f + "="))?.split("=")[1];
const team = pos[0] ?? "williams", seed = Number(pos[1] ?? 1), seasons = Number(pos[2] ?? 4);
const out = val("--salida");
const res = runCareer({
  team, seed, seasons, mode: flag("--rapida") ? "rapida" : "real", preseason: !flag("--sin-test"), develop: !flag("--sin-desarrollo"),
  calendar: flag("--completo") ? "completa" : "corta", rounds: val("--rondas") ? Number(val("--rondas")) : undefined,
  log: (l) => console.log(`[${team} ${seed}] ${l}`),
});
console.log(`[${team} ${seed}] ${res.problems.length} problemas en ${(res.secs / 60).toFixed(1)} min${res.problems.length ? ":\n  " + res.problems.join("\n  ") : ""}`);
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
