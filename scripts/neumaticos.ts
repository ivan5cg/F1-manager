// Graining y ampollas en un fin de semana completo: por sesión y compuesto, cuántos juegos los
// sufren y cuánto. Sirve para calibrar el modelo de neumáticos.
//   npx tsx scripts/neumaticos.ts silverstone [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, SESSION_NAMES } from "../src/sim/session";
import { ALL, Compound } from "../src/sim/tyres";
const id = process.argv[2] ?? "silverstone";
const seed = Number(process.argv[3] ?? 1);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const st = newWeekend(def.ronda, def, teams, seed);
const wk = new Weekend(st, buildTrack(def), teams, "-");
console.log(`${def.gp} · semilla ${seed} · tendencia oculta al graining ${st.hidden.grainProne.toFixed(2)} · abrasividad ${def.abrasividad}`);
const pct = (x: number) => `${Math.round(x * 100)}`.padStart(3) + " %";
for (let k = wk.nextKind(); k; k = wk.nextKind()) {
  const s = wk.build(k);
  const rubber0 = s.rubber;
  // pico de cada juego en la sesión (por coche y juego), y vueltas
  const peak = new Map<string, { c: Compound; gF: number; gR: number; bF: number; bR: number; laps0: number; laps: number }>();
  let wet = false;
  while (!s.finished && s.wall < 4 * 3600) {
    s.step();
    if (s.avgWater() > 0.15) wet = true;
    for (const c of s.cars) {
      const t = c.tyres;
      if (!t || c.loc !== "track") continue;
      const key = `${c.id}:${t.id}`;
      let p = peak.get(key);
      if (!p) peak.set(key, (p = { c: t.c, gF: 0, gR: 0, bF: 0, bR: 0, laps0: t.laps, laps: 0 }));
      p.gF = Math.max(p.gF, t.F.grain); p.gR = Math.max(p.gR, t.R.grain);
      p.bF = Math.max(p.bF, t.F.blister); p.bR = Math.max(p.bR, t.R.blister);
      p.laps = t.laps - p.laps0;
    }
  }
  console.log(`\n== ${SESSION_NAMES[k]} · asfalto ${s.weather.trackT.toFixed(0)}° · goma ${rubber0.toFixed(2)}→${s.rubber.toFixed(2)}${wet ? " · MOJADO" : ""}`);
  console.log("     juegos  vueltas | graining máx. del/tras · con >30 % | ampollas máx. del/tras · con >20 %");
  for (const c of ALL) {
    const ps = [...peak.values()].filter((p) => p.c === c && p.laps >= 2);
    if (!ps.length) continue;
    const avg = (f: (p: (typeof ps)[number]) => number) => ps.reduce((a, p) => a + f(p), 0) / ps.length;
    const share = (f: (p: (typeof ps)[number]) => boolean) => ps.filter(f).length / ps.length;
    console.log(`  ${c}  ${String(ps.length).padStart(5)}  ${avg((p) => p.laps).toFixed(1).padStart(7)} | ${pct(avg((p) => p.gF))} / ${pct(avg((p) => p.gR))} · ${pct(share((p) => Math.max(p.gF, p.gR) > 0.3))}         | ${pct(avg((p) => p.bF))} / ${pct(avg((p) => p.bR))} · ${pct(share((p) => Math.max(p.bF, p.bR) > 0.2))}`);
  }
  wk.finish(s);
}
