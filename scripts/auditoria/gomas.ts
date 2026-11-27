// Neumáticos en carrera (banco rápido, parrilla por ritmo): reparto de vueltas por compuesto, tanda media de cada uno,
// cuántos usan el duro y el blando, y estrategias más comunes. Para comparar con 2026 (medio-duro a una parada por
// defecto; en Singapur, 42 % de las vueltas con duro y 42 % con medio, tandas de 36 / 30 / 18 vueltas H / M / S).
//   npx tsx scripts/auditoria/gomas.ts <semillas: 1-2> [circuitos ...]
import { benchRace } from "../banco";

const args = process.argv.slice(2);
const [semS = "1-2", ...ids] = args;
const seeds = semS.includes("-") ? (() => { const [a, b] = semS.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : semS.split(",").map(Number);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
for (const id of ids) {
  const laps = { S: 0, M: 0, H: 0 } as Record<string, number>;
  const len: Record<string, number[]> = { S: [], M: [], H: [] };
  const strat: Record<string, number> = {};
  let usedH = 0, usedS = 0, n = 0;
  for (const seed of seeds) {
    const s = benchRace(id, seed, true, false);
    while (!s.finished && s.wall < 4 * 3600) s.step();
    for (const r of s.results().filter((x) => x.status === "fin")) {
      const c = s.carById(r.id);
      const st = c.stintLog;
      n++;
      if (st.some((x) => x.c === "H")) usedH++;
      if (st.some((x) => x.c === "S")) usedS++;
      const key = st.map((x) => x.c).join("");
      strat[key] = (strat[key] ?? 0) + 1;
      for (let i = 0; i < st.length; i++) {
        const to = i + 1 < st.length ? st[i + 1].from : r.laps;
        const k = to - st[i].from;
        if (k > 0 && st[i].c in laps) { laps[st[i].c] += k; len[st[i].c].push(k); }
      }
    }
  }
  const t = laps.S + laps.M + laps.H;
  const top = Object.entries(strat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round((100 * v) / n)} %`).join(", ");
  console.log(`${id.padEnd(12)} vueltas S/M/H ${[laps.S, laps.M, laps.H].map((x) => Math.round((100 * x) / t)).join("/")} % · tanda S/M/H ${[len.S, len.M, len.H].map((a) => (a.length ? mean(a).toFixed(1) : "–")).join("/")} · usan H ${Math.round((100 * usedH) / n)} % S ${Math.round((100 * usedS) / n)} % · ${top}`);
}
