// Estadísticas de muchas carreras: npx tsx scripts/lote.ts [n] [escenario]
import def from "../data/circuito-sierra.json";
import equipos from "../data/equipos.json";
import { buildTrack } from "../src/sim/track";
import { Race, TeamDef } from "../src/sim/race";
const n = Number(process.argv[2] ?? 10);
const track = buildTrack(def);
const stops: Record<number, number> = {}; let dnf = 0, sc = 0, vsc = 0, fuelOut = 0, dur = 0, winners: Record<string, number> = {}, spread = 0, ovt = 0, wet = 0, fuelEnd = 0, fin = 0;
for (let seed = 1; seed <= n; seed++) {
  const r = new Race({ seed: seed * 7919, track, teams: equipos.equipos as TeamDef[], playerTeam: "-", scenario: process.argv[3] as any });
  r.onEvent = (e) => { if (e.text.includes("COCHE DE SEGURIDAD —")) sc++; if (e.text.includes("VIRTUAL")) vsc++; if (e.text.includes("adelanta")) ovt++; };
  let rained = false;
  while (!r.finished && r.t < 3 * 3600) { r.step(); if (r.avgWater() > 0.2) rained = true; }
  if (rained) wet++;
  dur += r.t / 60;
  const ord = r.order();
  winners[ord[0].d.abrev] = (winners[ord[0].d.abrev] ?? 0) + 1;
  for (const c of r.cars) {
    if (c.status === "out") { dnf++; if (c.retireReason === "sin combustible") fuelOut++; }
    else { stops[c.stops] = (stops[c.stops] ?? 0) + 1; fuelEnd += c.fuel; fin++; }
  }
  const lastFin = ord.filter((c) => c.status === "fin");
  spread += r.gapBetween(ord[0], lastFin[Math.min(9, lastFin.length - 1)]);
}
console.log({ carreras: n, mojadas: wet, duracionMedia: (dur / n).toFixed(1), paradas: stops, abandonosPorCarrera: (dnf / n).toFixed(2), sinGasolina: fuelOut, gasolinaFinalMedia: (fuelEnd / fin).toFixed(2), SC: sc, VSC: vsc, adelantamientosPorCarrera: (ovt / n).toFixed(1), distanciaP1P10: (spread / n).toFixed(1), ganadores: winners });
