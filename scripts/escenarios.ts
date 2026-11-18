// Banco de pruebas del modo escenario: monta cada escenario, comprueba la situación de partida y lo corre hasta el
// final con el equipo llevando también a tus pilotos. Dice cuántas veces se cumple cada objetivo.
//   npx tsx scripts/escenarios.ts [id] [veces=3] [--detalle]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { buildScenario, evaluate } from "../src/sim/scenario";
import { ESCENARIOS, PILOTOS } from "../src/sim/escenarios";
import { COMPOUNDS } from "../src/sim/tyres";

const only = process.argv[2] && !process.argv[2].startsWith("-") && isNaN(Number(process.argv[2])) ? process.argv[2] : null;
const runs = Number(process.argv.find((a, i) => i >= 2 && /^\d+$/.test(a)) ?? 3);
const detail = process.argv.includes("--detalle");

for (const def of ESCENARIOS.filter((d) => !only || d.id === only)) {
  const cdef = JSON.parse(readFileSync(`data/circuitos/${def.circuito}.json`, "utf8"));
  const track = buildTrack(cdef);
  const stars = [0, 0, 0];
  const t0 = Date.now();
  for (let r = 0; r < runs; r++) {
    const tb = Date.now();
    const { sess, idOf } = buildScenario(def, PILOTOS, cdef, track, 1000 + r * 17);
    const tBuild = Date.now() - tb;
    if (r === 0) {
      const ord = sess.order().filter((c) => c.loc !== "out");
      console.log(`\n== ${def.id} · ${def.titulo} · vuelta ${sess.leaderLap}/${sess.laps} · bandera ${sess.flag} · agua ${sess.avgWater().toFixed(2)} mm · montaje ${tBuild} ms`);
      console.log("   " + ord.slice(0, 8).map((c, i) => `${i + 1}.${c.d.abrev}${i ? "+" + sess.gapBetween(ord[0], c).toFixed(1) : ""}(${c.tyres!.c}${c.tyres!.laps} ${Math.round(Math.max(c.tyres!.F.wear, c.tyres!.R.wear) * 100)}%)`).join(" "));
      const mine = sess.cars.filter((c) => c.player);
      for (const c of mine) console.log(`   tuyo ${c.d.abrev}: P${ord.indexOf(c) + 1}, plan ${c.plan.stints.map((s) => s.c + s.endLap).join(" ")}, gasolina ${c.fuel.toFixed(1)} kg`);
    }
    sess.autoPlayers = true;
    if (detail && r === 0) sess.onEvent = (e) => { if (e.kind === "control" || (e.kind === "pit" && e.carId !== undefined && sess.carById(e.carId).player) || e.kind === "weather") console.log(`   V${e.lap} ${e.text}`); };
    while (!sess.finished && sess.wall < 6 * 3600) sess.step();
    const rows = sess.results();
    const ok = evaluate(def, rows, idOf);
    ok.forEach((x, i) => { if (x) stars[i]++; });
    const top = rows.slice(0, 6).map((x) => sess.carById(x.id).d.abrev).join(" ");
    // los que nombran los objetivos (el rival por el título, por ejemplo)
    const keys = new Set<string>();
    const walk = (o: any) => { if (o.k) keys.add(o.k); if (o.de && Array.isArray(o.de)) o.de.forEach(walk); else if (o.de) keys.add(o.de); if (o.puntos) Object.keys(o.puntos).forEach((k) => keys.add(k)); };
    def.objetivos.forEach(walk);
    const named = [...keys].map((k) => { const x = rows.find((y) => y.id === idOf.get(k))!; return `${k} ${x.status === "fin" ? "P" + x.pos : x.status}`; }).join(", ");
    const mine = rows.filter((x) => sess.carById(x.id).player).map((x) => `${sess.carById(x.id).d.abrev} P${x.pos}${x.status !== "fin" ? `(${x.status})` : ""} ${x.stops}p`).join(", ");
    console.log(`   #${r + 1}: ${top} | tuyos: ${mine} | ${named} | objetivos ${ok.map((x) => (x ? "★" : "·")).join("")} | ${sess.stats.sc} SC ${sess.stats.vsc} VSC ${sess.stats.red} roja`);
  }
  console.log(`   estrellas en ${runs}: ${stars.join(" / ")} · ${((Date.now() - t0) / runs / 1000).toFixed(1)} s por carrera`);
  void COMPOUNDS;
}
