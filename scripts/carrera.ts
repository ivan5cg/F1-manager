// Simula una carrera completa sin interfaz: npx tsx scripts/carrera.ts [semilla] [escenario]
import def from "../data/circuito-sierra.json";
import equipos from "../data/equipos.json";
import { buildTrack } from "../src/sim/track";
import { Race, TeamDef } from "../src/sim/race";
import { COMPOUNDS } from "../src/sim/tyres";
const seed = Number(process.argv[2] ?? 1);
const sc = process.argv[3] as any;
const track = buildTrack(def);
const t0 = Date.now();
const race = new Race({ seed, track, teams: equipos.equipos as TeamDef[], playerTeam: "-", scenario: sc });
console.log(`Escenario ${race.weather.scenario}, aire ${race.weather.airT.toFixed(1)}°C asfalto ${race.weather.trackT.toFixed(1)}°C, ocultos`, JSON.stringify(race.hidden));
race.onEvent = (e) => { if (e.kind !== "radio") console.log(`V${e.lap} ${e.text}`); };
let lastLap = -1;
while (!race.finished && race.t < 3 * 3600) {
  race.step();
  if (race.leaderLap !== lastLap && race.leaderLap % 10 === 0) {
    lastLap = race.leaderLap;
    const l = race.order()[0];
    console.log(`  -- V${race.leaderLap} líder ${l.d.abrev} ${l.tyres.c}${l.tyres.laps} desgaste F${(l.tyres.F.wear*100).toFixed(0)} R${(l.tyres.R.wear*100).toFixed(0)} Tcarcasa ${l.tyres.F.tBulk.toFixed(0)}/${l.tyres.R.tBulk.toFixed(0)} agua ${race.avgWater().toFixed(2)} lluvia ${race.rainOnTrack().toFixed(1)} asfalto ${race.weather.trackT.toFixed(1)}`);
  }
}
console.log(`\nSimulada en ${Date.now() - t0} ms, ${(race.t / 60).toFixed(1)} min de carrera`);
for (const { car: c, gap, lapsDown } of race.intervals()) {
  const stints = c.plan.stints.map((s) => s.c + s.endLap).join(" ");
  const lts = c.lapTimes.slice(1);
  const med = [...lts].sort((a, b) => a - b)[Math.floor(lts.length / 2)] ?? 0;
  console.log(`${race.position(c).toString().padStart(2)} ${c.d.abrev} ${c.team.nombre.padEnd(20)} ${c.status === "out" ? "ABANDONO " + c.retireReason : lapsDown > 0 ? `+${lapsDown}v` : "+" + gap.toFixed(1)}  paradas ${c.stops} [${[...c.usedCompounds].join("")}] plan ${stints}  mejor ${c.best.toFixed(2)} mediana ${med.toFixed(2)} fuel ${c.fuel.toFixed(1)}`);
}
void COMPOUNDS;
console.log("secPerGrip", race.secPerGrip.toFixed(3), "fuelPerLap", race.fuelPerLap);
const rr = race.cars.find((c) => c.d.abrev === (process.argv[4] ?? "RAN"))!;
console.log(rr.d.abrev, "vueltas", rr.lapTimes.map((x) => x.toFixed(1)).join(" "));
