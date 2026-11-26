// Banco rápido: solo carreras en seco (parrilla por ritmo, sin libres ni clasificación), para probar cambios deprisa.
// Por circuito: uso del duro y del blando, paradas, adelantamientos (sin la primera vuelta), doblados, gana la pole y
// el ritmo de carrera de cada equipo frente al mejor (mediana de vueltas en aire limpio, en verde, sin boxes).
//   npx tsx scripts/auditoria/rapida.ts <semillas: 1-4> [circuitos ...] [--equipos]
import { readdirSync } from "fs";
import { benchRace } from "../banco";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [semS = "1-2", ...ids0] = args.filter((a) => !a.startsWith("--"));
const seeds = semS.includes("-") ? (() => { const [a, b] = semS.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : semS.split(",").map(Number);
const ids = ids0.length ? ids0 : readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

const teamGap: Record<string, number[]> = {};
const tot = { H: [] as number[], S: [] as number[], stops: [] as number[], pass: [] as number[], lapped: [] as number[], pole: [] as number[] };
for (const id of ids) {
  const per = { H: [] as number[], S: [] as number[], stops: [] as number[], pass: [] as number[], lapped: [] as number[], pole: [] as number[] };
  for (const seed of seeds) {
    const s = benchRace(id, seed, true, false);
    const clean = new Map<number, number[]>();
    const seen = new Map<number, number>();
    const ok = new Map<number, boolean>();
    while (!s.finished && s.wall < 4 * 3600) {
      s.step();
      for (const c of s.cars) {
        if (s.flag !== "green" || c.loc !== "track" || (c.aheadId >= 0 && c.followGap < 1.2)) ok.set(c.id, false);
        const n = c.lapTimes.length;
        if ((seen.get(c.id) ?? 0) !== n) {
          if (n > 2 && ok.get(c.id) !== false) (clean.get(c.id) ?? clean.set(c.id, []).get(c.id)!).push(c.lapTimes[n - 1]);
          seen.set(c.id, n);
          ok.set(c.id, true);
        }
      }
    }
    const res = s.results();
    const fin = res.filter((r) => r.status === "fin");
    const lead = fin[0]?.laps ?? 0;
    per.lapped.push(fin.filter((r) => r.laps < lead).length);
    per.pole.push(res[0]?.grid === 1 ? 1 : 0);
    per.pass.push(s.passCount - s.passLap1);
    for (const r of fin) {
      const c = s.carById(r.id);
      per.H.push(c.stintLog.some((x) => x.c === "H") ? 1 : 0);
      per.S.push(c.stintLog.some((x) => x.c === "S") ? 1 : 0);
      per.stops.push(r.stops);
    }
    // ritmo de carrera por equipo: mediana de las vueltas limpias de sus dos coches
    const byTeam: Record<string, number[]> = {};
    for (const c of s.cars) { const v = clean.get(c.id); if (v && v.length >= 5) (byTeam[c.team.id] ??= []).push(...v); }
    const tm = Object.fromEntries(Object.entries(byTeam).map(([k, v]) => [k, med(v)]));
    const best = Math.min(...Object.values(tm));
    for (const [k, v] of Object.entries(tm)) (teamGap[k] ??= []).push((v / best - 1) * 100);
  }
  console.log(`${id.padEnd(12)} duro ${(mean(per.H) * 100).toFixed(0).padStart(3)} % · blando ${(mean(per.S) * 100).toFixed(0).padStart(3)} % · paradas ${mean(per.stops).toFixed(2)} · adelant. ${mean(per.pass).toFixed(1).padStart(5)} · doblados ${mean(per.lapped).toFixed(1)} · pole gana ${(mean(per.pole) * 100).toFixed(0)} %`);
  for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k].push(...per[k]);
}
console.log(`TOTAL        duro ${(mean(tot.H) * 100).toFixed(0)} % · blando ${(mean(tot.S) * 100).toFixed(0)} % · paradas ${mean(tot.stops).toFixed(2)} · adelant. ${mean(tot.pass).toFixed(1)} · doblados ${mean(tot.lapped).toFixed(2)} · pole gana ${(mean(tot.pole) * 100).toFixed(0)} %`);
if (flags.includes("--equipos")) console.log("ritmo de carrera frente al mejor (%): " + Object.entries(teamGap).map(([k, v]) => [k, med(v)] as const).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · "));
