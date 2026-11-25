// Juega un lote de fines de semana completos con gp.ts, en paralelo, y deja un JSON por fin de semana.
//   node scripts/auditoria/lote.mjs <nombre> <clima> <semillas> [circuitos ...] [--formato=sprint] [--hilos=N]
// <nombre>: carpeta de salida dentro de auditoria-out/ (no se sube a git).
// <clima>: seco | natural | lluviaD (frente el domingo) | chubD (chubascos el domingo) | lluviaS (frente el sábado) | mixto
// <semillas>: «1-4» o «1,5,9». Sin circuitos, los 24.
// Ejemplos:
//   node scripts/auditoria/lote.mjs seco seco 1-4
//   node scripts/auditoria/lote.mjs lluvia lluviaD 21-22 spa silverstone interlagos --hilos=8
// Luego: node scripts/auditoria/analiza.js auditoria-out/seco --por-circuito
import { spawn } from "child_process";
import { cpus } from "os";
import { mkdirSync, readdirSync, createWriteStream, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const [name, clima, semillas, ...rest] = args.filter((a) => !a.startsWith("--"));
if (!name || !clima || !semillas) {
  console.error("uso: node scripts/auditoria/lote.mjs <nombre> <clima> <semillas> [circuitos ...] [--formato=sprint] [--hilos=N]");
  process.exit(1);
}
const seeds = semillas.includes("-")
  ? (() => { const [a, b] = semillas.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
  : semillas.split(",").map(Number);
const ids = rest.length ? rest : readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const fmt = opt("formato") ?? "";
// cada fin de semana tarda 30-40 s solo; con muchos a la vez, más (dejan un núcleo libre)
const threads = Number(opt("hilos") ?? Math.max(1, cpus().length - 2));
const out = join("auditoria-out", name);
mkdirSync(out, { recursive: true });

const jobs = ids.flatMap((id) => seeds.map((s) => ({ id, s })));
const t0 = Date.now();
let done = 0, failed = 0;
function run({ id, s }) {
  return new Promise((ok) => {
    const file = join(out, `${id}_${s}.json`);
    const p = spawn(process.execPath, ["--import", "tsx", "scripts/auditoria/gp.ts", id, String(s), clima, ...(fmt ? [fmt] : [])], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.pipe(createWriteStream(file));
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      done++;
      const bad = code !== 0 || statSync(file).size < 1000;
      if (bad) { failed++; console.error(`✘ ${id} ${s}: ${err.trim().split("\n").slice(-3).join(" | ")}`); }
      console.log(`[${done}/${jobs.length}] ${id} semilla ${s}${bad ? " FALLO" : ""} · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      ok();
    });
  });
}
const queue = [...jobs];
await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, async () => { for (let j = queue.shift(); j; j = queue.shift()) await run(j); }));
console.log(`\n${jobs.length - failed} fines de semana en ${out} (${failed} fallos) en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
