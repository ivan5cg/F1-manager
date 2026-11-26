// Calibra la pole de cada circuito: juega libres y clasificación en seco con varias semillas (pole.ts) y corrige
// `poleAjuste` (s) para que la mediana de la pole simulada caiga en la real (`poleObjetivo`).
//   node scripts/auditoria/calibra-pole.mjs [semillas=1-4] [circuitos ...] [--escribe] [--hilos=N] [--amortigua=1]
// Sin --escribe solo mide. El ajuste entra en el objetivo de la vuelta ideal (`buildTrack` en src/sim/track.ts), así
// que un segundo de ajuste mueve la pole casi un segundo: con una pasada suele bastar; una segunda limpia el resto.
import { spawn } from "child_process";
import { cpus } from "os";
import { readdirSync, readFileSync, writeFileSync } from "fs";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const pos = args.filter((a) => !a.startsWith("--"));
const seeds = pos[0] && /^[\d,-]+$/.test(pos[0]) ? pos.shift() : "1-4";
const ids = pos.length ? pos : readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const write = args.includes("--escribe");
const damp = Number(opt("amortigua") ?? 1);
const threads = Number(opt("hilos") ?? Math.max(1, cpus().length));

const run = (id) => new Promise((ok) => {
  let out = "";
  const p = spawn(process.execPath, ["--import", "tsx", "scripts/auditoria/pole.ts", id, seeds], { stdio: ["ignore", "pipe", "inherit"] });
  p.stdout.on("data", (d) => (out += d));
  p.on("close", () => { try { ok(JSON.parse(out.trim().split("\n").pop())); } catch { ok({ id, err: null }); } });
});
const queue = [...ids], res = [];
await Promise.all(Array.from({ length: Math.min(threads, ids.length) }, async () => { for (let id = queue.shift(); id; id = queue.shift()) res.push(await run(id)); }));
res.sort((a, b) => a.id.localeCompare(b.id));
const errs = res.filter((r) => r.err !== null).map((r) => r.err).sort((a, b) => a - b);
for (const r of res) {
  const nuevo = r.err === null ? r.ajuste : Math.round((r.ajuste - damp * r.err) * 1000) / 1000;
  console.log(`${r.id.padEnd(12)} real ${String(r.real).padStart(8)} · poles ${(r.poles ?? []).join(" ")} · error ${r.err === null ? "—" : (r.err > 0 ? "+" : "") + r.err.toFixed(3)} · ajuste ${r.ajuste} → ${nuevo}`);
  if (write && r.err !== null) {
    const file = `data/circuitos/${r.id}.json`;
    let raw = readFileSync(file, "utf8");
    if (/"poleAjuste":\s*-?[\d.]+/.test(raw)) raw = raw.replace(/"poleAjuste":\s*-?[\d.]+/, `"poleAjuste":${nuevo}`);
    else raw = raw.replace(/("poleObjetivo":\s*[\d.]+)/, `$1,"poleAjuste":${nuevo}`);
    writeFileSync(file, raw);
  }
}
console.log(`error mediano ${errs.length ? errs[Math.floor(errs.length / 2)].toFixed(3) : "—"} s · |error| > 0,3 s en ${errs.filter((e) => Math.abs(e) > 0.3).length} de ${errs.length}${write ? " · escrito en data/circuitos" : ""}`);
