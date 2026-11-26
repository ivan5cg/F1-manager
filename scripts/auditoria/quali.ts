// Auditoría: solo la clasificación (sin libres), en seco, en todos los circuitos. Mejora de Q1 a Q2 y de Q2 a Q3 del
// top 10, cuántos hacen la Q3 peor que su Q2, pole frente a la real calibrada y compañeros.
//   npx tsx scripts/auditoria/quali.ts [semillas=2] [circuitos...] [--libres]
// --libres: juega antes los libres (como en un fin de semana) y cuenta los blandos nuevos que le quedan a cada uno al
// empezar la última parte.
import { readFileSync, readdirSync } from "fs";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import { TeamDef } from "../../src/sim/session";

const withFP = process.argv.includes("--libres");
const [nS = "2", ...ids0] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ids = ids0.length ? ids0 : readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
// la misma semilla de fin de semana que gp.ts
const weekendSeed = (s: number, circuit: string) => { let h = 7; for (const ch of circuit) h = (h * 31 + ch.charCodeAt(0)) % 997; return s * 1000 + h; };
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const g12: number[] = [], g23: number[] = [], worse: number[] = [], poleErr: number[] = [], mates: number[] = [];
const freshQ3: number[] = [], freshQ: number[] = [];
for (const id of ids) {
  const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
  const track = buildTrack(def);
  for (let s = 1; s <= Number(nS); s++) {
    const st = newWeekend(def.ronda, def, teams, weekendSeed(s, id));
    for (const d of st.days) d.scenario = "seco";
    const wk = new Weekend(st, track, teams, "-");
    if (withFP) for (let k = wk.nextKind(); k && k !== "Q"; k = wk.nextKind()) { const f = wk.build(k); while (!f.finished) f.step(); wk.finish(f); }
    const q = wk.build("Q");
    let maxW = 0, seen = false;
    for (const c of q.cars) freshQ.push(c.e.sets.filter((t: any) => t.c === "S" && t.laps === 0 && !t.returned).length);
    while (!q.finished) {
      q.step();
      maxW = Math.max(maxW, q.avgWater());
      if (!seen && q.part === 2) {
        seen = true;
        for (const c of q.cars.filter((x: any) => !x.eliminated)) freshQ3.push(c.e.sets.filter((t: any) => t.c === "S" && t.laps === 0 && !t.returned && t !== c.tyres).length + (c.tyres?.c === "S" && c.tyres.laps === 0 ? 1 : 0));
      }
    }
    if (maxW > 0.2) continue;
    const res = q.results();
    const part = (r: (typeof res)[number], i: number) => q.carById(r.id).bestByPart[i];
    let w = 0;
    for (const r of res.slice(0, 10)) {
      const [a, b, c] = [0, 1, 2].map((i) => part(r, i));
      if (a && b) g12.push(a - b);
      if (b && c) { g23.push(b - c); if (c > b) w++; }
    }
    worse.push(w);
    poleErr.push(part(res[0], 2) - def.poleObjetivo);
    const byTeam: Record<string, number[]> = {};
    for (const r of res) { const c = q.carById(r.id); const t = c.bestByPart.filter((x: number) => x && Number.isFinite(x)); (byTeam[c.team.id] ??= []).push(...(t.length ? [Math.min(...t)] : [])); }
    for (const v of Object.values(byTeam)) if (v.length === 2) mates.push(Math.abs(v[0] - v[1]));
  }
}
console.log(`${worse.length} clasificaciones secas · top 10: Q1→Q2 ${med(g12).toFixed(3)} s · Q2→Q3 ${med(g23).toFixed(3)} s · Q3 peor que su Q2 ${(worse.reduce((a, b) => a + b, 0) / worse.length).toFixed(1)}/10 · pole − real ${med(poleErr).toFixed(3)} s · compañeros ${med(mates).toFixed(3)} s · blandos nuevos al empezar la clasificación: ${JSON.stringify(freshQ.reduce((o: Record<number, number>, x) => ((o[x] = (o[x] ?? 0) + 1), o), {}))} · al empezar Q3: ${JSON.stringify(freshQ3.reduce((o: Record<number, number>, x) => ((o[x] = (o[x] ?? 0) + 1), o), {}))}`);
