// Varias temporadas seguidas sin correr las carreras (resultados por ritmo con azar): para ver cómo evolucionan los
// pilotos (edad, retiradas, fichajes, novatos), los coches y el presupuesto.
//   npx tsx scripts/temporadas.ts [temporadas=5] [semilla=1] [equipo=williams|propio] [--completo]
import { gridOf, useSeason, DRIVERS, TEAMS, CALENDARS, MARKET } from "../src/ui/data";
import { buildNextSeason, yearOf } from "../src/ui/nextSeason";
import type { SeasonState } from "../src/sim/season";
import { driverStandings } from "../src/sim/season";
import { objectivesFor } from "../src/sim/objectives";
import { newDev } from "../src/sim/development";
import { rating, ageOf } from "../src/sim/career";
import { Rng } from "../src/sim/rng";
import type { ResultRow } from "../src/sim/session";

const n = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 1);
const team = process.argv[4] ?? "williams";
const cal = process.argv.includes("--completo") ? CALENDARS.completa : CALENDARS.corta;
const rng = new Rng(seed);
let s: SeasonState = { v: 1, playerTeam: team, seed, round: 0, weekend: null, rounds: [], calendar: [...cal.ids], formatos: cal.formatos };
if (team === "propio") {
  s.equipo = { nombre: "Propio", color: "#fff", pilotos: ["SAI", "BEA"], jefe: MARKET.jefes[5].nombre, tecnico: MARKET.tecnicos[5].nombre, motor: "mercedes" };
  s.playerTeam = "propio";
}
for (let k = 0; k < n; k++) {
  s.dev = newDev(s.equipo ? 20 : null);
  if (s.devBonus) s.dev.budget = Math.max(15, s.dev.budget + s.devBonus);
  useSeason(s);
  s.objetivos = objectivesFor(gridOf(s, 0).teams, s.playerTeam, s.calendar!.length);
  // carreras: por ritmo del coche y del piloto, con azar
  for (let r = 0; r < s.calendar!.length; r++) {
    s.round = r;
    const teams = gridOf(s, r).teams;
    let id = 0;
    const rows = teams.flatMap((t) => t.pilotos.map((d) => ({ id: id++, k: t.agarre / 180 + t.potencia * 0.0012 + (d.ritmo - 85) * 0.0007 + rng.gauss(0, 0.004) })));
    rows.sort((a, b) => b.k - a.k);
    const race = rows.map((x, i) => ({ id: x.id, pos: i + 1, best: 90, time: 5400 + i, laps: 50, status: "fin", stops: 1 }) as ResultRow);
    s.rounds.push({ round: r + 1, circuitId: s.calendar![r], race });
  }
  s.round = s.calendar!.length;
  useSeason(s);
  const ds = driverStandings(s, DRIVERS.length);
  const ch = DRIVERS[ds[0].id];
  const lvl = TEAMS.map((t) => `${t.id.slice(0, 4)} ${t.agarre.toFixed(1)}`).join(" · ");
  console.log(`\n== ${yearOf(s)}: campeón ${ch.d.nombre} (${ch.team.nombre}) · agarre ${lvl}`);
  console.log("   parrilla:", TEAMS.map((t) => `${t.nombre.slice(0, 8)}: ${t.pilotos.map((d) => `${d.abrev}${ageOf(d, yearOf(s))}(${rating(d).toFixed(0)})`).join(" ")}`).join(" | "));
  if (s.news?.length) console.log("   mercado:", s.news.join(" "));
  const mine = DRIVERS.filter((d) => d.team.id === s.playerTeam);
  console.log(`   presupuesto ${s.dev.budget} M; tus pilotos ${mine.map((d) => d.d.nombre).join(", ")}`);
  s = buildNextSeason(s, mine.map(() => ({ keep: true })));
}
