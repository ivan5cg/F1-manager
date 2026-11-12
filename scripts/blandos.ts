// Prueba del modelo de neumáticos: un piloto monta blandos nuevos para las últimas vueltas y se
// mide cuánto le duran y qué ritmo saca frente al resto.
//   npx tsx scripts/blandos.ts bahrein [semilla] [ritmo 0-4] [vuelta de la parada]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, PUSH_NAMES } from "../src/sim/session";
import { setWear } from "../src/sim/tyres";
const id = process.argv[2] ?? "bahrein", seed = Number(process.argv[3] ?? 1), push = Number(process.argv[4] ?? 3);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const pitLap = Number(process.argv[5] ?? def.vueltas - 9);
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const wk = new Weekend(newWeekend(def.ronda, def, teams, seed), buildTrack(def), teams, "astonmartin");
const s = wk.build("RACE");
const me = s.cars.find((c) => c.player)!;
let asked = false, lastLap = -1;
const rows: string[] = [];
while (!s.finished && s.wall < 4 * 3600) {
  s.step();
  const lap = s.lapsDone(me);
  if (!asked && lap >= pitLap - 1 && me.loc === "track") { const set = s.bestSetFor(me, "S"); if (set) { me.pitRequest = set.id; asked = true; } }
  if (asked && me.tyres?.c === "S") { me.autoPush = false; me.push = push; }
  if (lap !== lastLap && me.loc === "track") {
    lastLap = lap;
    if (lap >= pitLap - 2 && me.tyres) {
      const t = me.tyres, lt = me.lapTimes[me.lapTimes.length - 1];
      // ritmo del pelotón: mediana de la última vuelta de los demás en pista
      const others = s.cars.filter((c) => c !== me && c.loc === "track" && c.lapTimes.length).map((c) => c.lapTimes[c.lapTimes.length - 1]).sort((a, b) => a - b);
      const med = others[Math.floor(others.length / 2)];
      rows.push(`V${String(lap).padStart(2)} ${t.c}${String(t.laps).padStart(2)}v  vuelta ${lt?.toFixed(2) ?? "  —  "}  mediana resto ${med?.toFixed(2)}  desgaste ${(setWear(t) * 100).toFixed(0).padStart(3)} %  carcasa ${t.F.tBulk.toFixed(0)}/${t.R.tBulk.toFixed(0)}°  ampollas ${(Math.max(t.F.blister, t.R.blister) * 100).toFixed(0).padStart(3)} %`);
    }
  }
}
console.log(`${def.nombre}, semilla ${seed}, ${me.d.abrev} con blandos desde la vuelta ${pitLap} a ritmo «${PUSH_NAMES[push]}» · asfalto ${s.weather.trackT.toFixed(0)}° · abrasividad ${def.abrasividad}`);
console.log(rows.join("\n"));
