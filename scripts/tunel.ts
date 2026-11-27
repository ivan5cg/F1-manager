// Túnel de viento: un fin de semana con paquete aerodinámico nuevo, con cada programa de libres. Dice cuántas vueltas
// de prueba de piezas salen, el error de la medida y lo que saben tus ingenieros de los neumáticos al acabar.
//   npx tsx scripts/tunel.ts [circuito=silverstone] [semilla=1] [equipo=williams] [--sprint]
import { circuit, TEAMS } from "./banco";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { aeroSigma, TEST_PROGRAMS, TestProgram } from "../src/sim/development";

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const id = pos[0] ?? "silverstone", seed = Number(pos[1] ?? 1), team = pos[2] ?? "williams";
const { def: def0, track } = circuit(id);
const def = args.includes("--sprint") ? { ...def0, formato: "sprint" } : def0;
console.log(`${def.gp} · ${def.formato} · ${team} · semilla ${seed}`);
for (const prog of Object.keys(TEST_PROGRAMS) as TestProgram[]) {
  const st = newWeekend(def.ronda, def, TEAMS, seed * 1000 + 17);
  for (const d of st.days) d.scenario = "seco";
  st.pkgTest = prog;
  const wk = new Weekend(st, track, TEAMS, team);
  for (const k of wk.sessions()) {
    if (!k.startsWith("FP")) break;
    const s = wk.build(k);
    while (!s.finished && s.wall < 3 * 3600) s.step();
    wk.finish(s);
  }
  const pl = st.pkgLaps ?? { test: 0, other: 0 };
  const kn = st.knowledge[team].noise;
  const sig = aeroSigma(pl.test, pl.other) * 0.98;
  console.log(`${TEST_PROGRAMS[prog].name.padEnd(22)} prueba ${String(pl.test).padStart(3)} v · resto ${String(pl.other).padStart(3)} v · medida ±${sig.toFixed(3)} s · error gomas S ${(kn.S * 100).toFixed(0)} % M ${(kn.M * 100).toFixed(0)} % H ${(kn.H * 100).toFixed(0)} %`);
}
