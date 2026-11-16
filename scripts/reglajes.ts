// Calibración de los reglajes: npx tsx scripts/reglajes.ts silverstone [semillas] [--vuelta]
//  · --vuelta: tiempo de vuelta de un coche (seco y mojado) con cada reglaje, para ver que el óptimo cae donde debe.
//  · sin él: fines de semana completos con y sin reglajes en varias semillas; compara la pole, el ritmo del ganador y
//    la posición media de cada equipo (sin tocar nada, la media de la parrilla no debería moverse).
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef } from "../src/sim/session";
import { setupEstimate } from "../src/sim/setup";
const id = process.argv[2] ?? "silverstone";
const nSeeds = Number(process.argv[3] ?? 6);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);

if (process.argv.includes("--vuelta")) {
  const st = newWeekend(def.ronda, def, teams, 1);
  const wk = new Weekend(st, track, teams, "-");
  const s = wk.build("FP1");
  const c = s.cars[0];
  c.tyres = c.e.sets[0];
  const ss = st.setup!;
  console.log(`${def.nombre}: óptimo carga ${ss.opt.a.toFixed(2)} altura ${ss.opt.r.toFixed(2)}`);
  for (const water of [0, 1]) {
    console.log(water ? "Mojado (1 mm):" : "Seco:");
    console.log("altura \\ carga  " + [-2, -1, 0, 1, 2].map((a) => String(a).padStart(8)).join(""));
    for (const r of [-2, -1, 0, 1, 2]) {
      const row = [-2, -1, 0, 1, 2].map((a) => { c.setup = { a, r }; let t = 0; for (const m of track.ms) t += s.msTime(c, m, water).t; return t; });
      console.log(String(r).padStart(6) + "          " + row.map((t) => t.toFixed(3).padStart(8)).join(""));
    }
  }
  for (const t of teams) { const e = setupEstimate(ss, t); console.log(`${t.nombre.padEnd(18)} cree carga ${e.a.toFixed(2)} altura ${e.r.toFixed(2)} (±${e.sigma.toFixed(2)})`); }
  process.exit(0);
}

type Acc = { pole: number[]; win: number[]; qPos: Record<string, number[]>; rPos: Record<string, number[]> };
const acc = (): Acc => ({ pole: [], win: [], qPos: {}, rPos: {} });
const res: Record<string, Acc> = { sin: acc(), con: acc() };
for (let seed = 1; seed <= nSeeds; seed++) {
  for (const mode of ["sin", "con"] as const) {
    const st = newWeekend(def.ronda, def, teams, seed);
    const wk = new Weekend(st, track, teams, "-", { setups: mode === "con" });
    const A = res[mode];
    for (let k = wk.nextKind(); k; k = wk.nextKind()) {
      const s = wk.build(k);
      while (!s.finished && s.wall < 4 * 3600) s.step();
      const rows = s.results();
      if (k === "Q") { A.pole.push(rows[0].best); rows.forEach((r) => (A.qPos[s.carById(r.id).team.id] ??= []).push(r.pos)); }
      if (k === "RACE") { const w = s.carById(rows[0].id); A.win.push(rows[0].time / Math.max(1, rows[0].laps)); rows.forEach((r) => (A.rPos[s.carById(r.id).team.id] ??= []).push(r.pos)); void w; }
      wk.finish(s);
    }
  }
  process.stdout.write(".");
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`\n${def.nombre}, ${nSeeds} semillas`);
for (const m of ["sin", "con"]) console.log(`${m} reglajes: pole media ${mean(res[m].pole).toFixed(3)} s · vuelta media del ganador ${mean(res[m].win).toFixed(3)} s`);
console.log("equipo              Q sin  Q con   C sin  C con");
for (const t of teams) console.log(`${t.nombre.padEnd(18)} ${mean(res.sin.qPos[t.id]).toFixed(1).padStart(5)} ${mean(res.con.qPos[t.id]).toFixed(1).padStart(6)}  ${mean(res.sin.rPos[t.id]).toFixed(1).padStart(6)} ${mean(res.con.rPos[t.id]).toFixed(1).padStart(6)}`);
