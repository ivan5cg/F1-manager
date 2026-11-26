// Rendimiento estimado de los coches ronda a ronda (el panel de la pantalla de temporada), sin interfaz.
//   npx tsx scripts/rendimiento.ts [equipo=williams|propio] [semilla=1] [--completo] [--aero=N]
// --aero=N: el jugador pide N piezas grandes de aerodinámica en la primera ronda (para ver que se nota).
import { MARKET, useSeason, CALENDARS } from "../src/ui/data";
import { newDev, orderPart } from "../src/sim/development";
import { perfSeries } from "../src/ui/rendimiento";
import type { SeasonState } from "../src/sim/season";

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const team = pos[0] ?? "williams", seed = Number(pos[1] ?? 1);
const aero = Number(args.find((a) => a.startsWith("--aero="))?.split("=")[1] ?? 0);
const s: SeasonState = { v: 1, playerTeam: team, seed, round: 0, weekend: null, rounds: [], calendar: [...CALENDARS[args.includes("--completo") ? "completa" : "corta"].ids] } as SeasonState;
if (team === "propio") {
  s.equipo = { nombre: "Propio", color: "#fff", pilotos: ["SAI", "BEA"], jefe: MARKET.jefes[5].nombre, tecnico: MARKET.tecnicos[5].nombre, motor: "mercedes" } as SeasonState["equipo"];
  s.playerTeam = "propio";
}
s.dev = newDev(s.equipo ? 20 : null);
for (let i = 0; i < aero; i++) orderPart(s.dev, "aero", 3, 0, seed);
useSeason(s);
s.round = 99;
const p = perfSeries(s);
const last = p.rounds[p.rounds.length - 1];
console.log("equipo".padEnd(14) + p.rounds.map((r) => String(r + 1).padStart(6)).join(""));
for (const t of p.teams.sort((a, b) => a.gap[last] - b.gap[last])) console.log(t.nombre.slice(0, 13).padEnd(14) + t.gap.map((x) => x.toFixed(2).padStart(6)).join(""));
