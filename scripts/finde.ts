// Simula un fin de semana completo sin interfaz: npx tsx scripts/finde.ts silverstone [semilla] [--resumen]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend, DAY_NAMES } from "../src/sim/weekend";
import { TeamDef, SESSION_NAMES, fmt, isRaceKind } from "../src/sim/session";
import { COMPOUNDS } from "../src/sim/tyres";
import { SCENARIO_NAMES } from "../src/sim/weather";
const id = process.argv[2] ?? "silverstone";
const seed = Number(process.argv[3] ?? 1);
const brief = process.argv.includes("--resumen");
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
const st = newWeekend(def.ronda, def, teams, seed);
const wk = new Weekend(st, track, teams, "-");
console.log(`${def.gp} · ${track.name} · días: ${st.days.map((d, i) => `${DAY_NAMES[i]} ${SCENARIO_NAMES[d.scenario]}`).join(", ")}`);
const names = wk.entrants().map((e) => e.d.abrev);
for (let k = wk.nextKind(); k; k = wk.nextKind()) {
  const s = wk.build(k);
  const t0 = Date.now();
  let rainy = false;
  s.onEvent = (e) => { if (!brief && (e.kind === "control" || e.kind === "weather" || e.kind === "incident")) console.log(`   ${isRaceKind(k) ? "V" + e.lap : fmt(s.t).slice(0, 5)} ${e.text}`); };
  while (!s.finished && s.wall < 4 * 3600) { s.step(); if (s.avgWater() > 0.2) rainy = true; }
  const res = s.results();
  console.log(`\n== ${SESSION_NAMES[k]} (${(Date.now() - t0) / 1000} s de cálculo, ${(s.wall / 60).toFixed(0)} min simulados, aire ${s.weather.airT.toFixed(1)}° asfalto ${s.weather.trackT.toFixed(1)}°${rainy ? ", MOJADO" : ""})`);
  const show = brief ? res.slice(0, isRaceKind(k) ? 10 : 6) : res;
  for (const r of show) {
    const c = s.carById(r.id);
    const extra = isRaceKind(k)
      ? `${r.status === "out" ? "ABANDONO " + r.reason : r.pos === 1 ? fmt(r.time) : "+" + (r.time - res[0].time).toFixed(1)} paradas ${r.stops} [${[...c.usedCompounds].join("")}] mejor ${fmt(c.best)}`
      : `${fmt(r.best)} ${r.part ?? ""} vueltas ${r.laps}`;
    console.log(`${String(r.pos).padStart(2)} ${names[r.id]} ${c.team.nombre.padEnd(16)} ${extra}`);
  }
  if (k === "RACE" || k === "SPRINT") {
    const stops: Record<number, number> = {};
    for (const r of res) if (r.status === "fin") stops[r.stops] = (stops[r.stops] ?? 0) + 1;
    console.log("paradas:", JSON.stringify(stops), "adelantamientos:", s.events.filter((e) => e.text.includes("adelanta")).length);
  }
  wk.finish(s);
}
const e0 = wk.entrants()[0];
console.log("\nJuegos de", e0.d.abrev, e0.sets.map((x) => `${x.id}${x.returned ? "(dev)" : ""}:${x.laps}v`).join(" "));
console.log("Oculto:", Object.entries(st.hidden.wearMult).map(([c, v]) => `${c} ${(v as number).toFixed(2)}`).join(" "), "térmico", st.hidden.thermalOffset.toFixed(1));
void COMPOUNDS;
