// Pole simulada de un circuito en seco, con los libres antes (como en un fin de semana): una línea JSON.
//   npx tsx scripts/auditoria/pole.ts <circuito> <semillas: 1-4>
// La usa calibra-pole.mjs para ajustar `poleAjuste` de cada circuito.
import { readFileSync } from "fs";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import { TeamDef } from "../../src/sim/session";

const [id, semS = "1-4"] = process.argv.slice(2);
const seeds = semS.includes("-") ? (() => { const [a, b] = semS.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : semS.split(",").map(Number);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
// la misma semilla de fin de semana que gp.ts
const weekendSeed = (s: number, circuit: string) => { let h = 7; for (const ch of circuit) h = (h * 31 + ch.charCodeAt(0)) % 997; return s * 1000 + h; };
const poles: number[] = [];
for (const s of seeds) {
  const st = newWeekend(def.ronda, def, teams, weekendSeed(s, id));
  for (const d of st.days) d.scenario = "seco";
  const wk = new Weekend(st, track, teams, "-");
  for (let k = wk.nextKind(); k && k !== "Q"; k = wk.nextKind()) { const f = wk.build(k); while (!f.finished) f.step(); wk.finish(f); }
  const q = wk.build("Q");
  let maxW = 0;
  while (!q.finished) { q.step(); maxW = Math.max(maxW, q.avgWater()); }
  if (maxW > 0.2) continue;
  const best = q.results()[0];
  const t = q.carById(best.id).bestByPart[2];
  if (t && Number.isFinite(t)) poles.push(t);
}
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
console.log(JSON.stringify({ id, real: def.poleObjetivo, ajuste: def.poleAjuste ?? 0, poles: poles.map((x) => +x.toFixed(3)), err: poles.length ? +(med(poles) - def.poleObjetivo).toFixed(3) : null }));
