// Rendimiento estimado de los coches ronda a ronda (el panel de la pantalla de temporada), sin interfaz.
//   npx tsx scripts/rendimiento.ts [equipo=williams|propio] [semilla=1] [--completo] [--aero=N]
// --aero=N: el jugador pide N piezas grandes de aerodinámica en la primera ronda (para ver que se nota).
// --tunel[=lenta,media,rapida,recta]: túnel de viento (paquetes por periodo, medidos con el programa equilibrado y
//   montados si lo medido es positivo), con ese reparto de horas (en %) o el de por defecto.
import { MARKET, useSeason, CALENDARS, ensureAeroPkgs } from "../src/ui/data";
import { newDev, orderPart, newAeroPlan, measurePkg } from "../src/sim/development";
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
const tun = args.find((a) => a.startsWith("--tunel"));
if (tun) {
  s.dev.aero = newAeroPlan(s.dev.budget);
  const w = tun.includes("=") ? tun.split("=")[1].split(",").map(Number) : null;
  if (w) { const t = w.reduce((a, b) => a + b, 0); s.dev.aero.reparto[0] = w.map((x) => x / t); }
  const cal = s.calendar!.length;
  for (let r = 0; r < cal; r++) {
    s.round = r;
    ensureAeroPkgs(s);
    for (const p of s.dev.aero.pkgs) if (p.ready === r && p.medido === undefined) {
      p.laps = 16; p.otherLaps = 96;
      measurePkg(p, seed);
      p.montar = p.medido! > 0;
      console.log(`paquete ${p.period + 1} (ronda ${r + 1}): esperado ${p.expect.toFixed(3)} · real ${p.real.toFixed(3)} · medido ${p.medido!.toFixed(3)} · ${p.montar ? "montado" : "descartado"}`);
    }
  }
}
useSeason(s);
s.round = 99;
const p = perfSeries(s);
const last = p.rounds[p.rounds.length - 1];
console.log("equipo".padEnd(14) + p.rounds.map((r) => String(r + 1).padStart(6)).join(""));
for (const t of p.teams.sort((a, b) => a.gap[last] - b.gap[last])) console.log(t.nombre.slice(0, 13).padEnd(14) + t.gap.map((x) => x.toFixed(2).padStart(6)).join(""));
