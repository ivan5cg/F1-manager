// npx tsx scripts/auditoria/deg.ts <circuito> [...]
// Curva de degradación del modelo (perfil de tanda de la IA con el desgaste real): s perdidos por vuelta frente al blando
// nuevo, por compuesto y edad; también el efecto del modo de ritmo y la diferencia de agarre entre compuestos.
import { benchRace } from "../banco";
import { stintProfile } from "../../src/sim/strategy";
import { COMPOUNDS, steadyGrip } from "../../src/sim/tyres";

for (const id of process.argv.slice(2)) {
  const s = benchRace(id, 1, true, false);
  const c = s.cars.find((x) => x.d.abrev === "RUS")!;
  const truth = { ...c.e.knowledge, hidden: s.hidden, profile: {} } as any;
  const out: string[] = [];
  const kg = s.track.ms.reduce((a, m) => a + m.dMass, 0);
  out.push(`${id}: vuelta ref ${s.lapRefRace.toFixed(2)} · s por 1 % de agarre ${s.secPerGrip.toFixed(3)} · s/kg ${kg.toFixed(4)} · combustible ${(s.fuelPerLap * s.laps).toFixed(1)} kg (${(kg * s.fuelPerLap).toFixed(3)} s/vuelta) · asfalto ${s.weather.trackT.toFixed(1)}° · abrasividad ${s.track.abrasiveness}`);
  const base = stintProfile(s, c, truth, "S").dt[1];
  for (const comp of ["S", "M", "H"] as const) {
    const p = stintProfile(s, c, truth, comp);
    const cliff = p.wear.findIndex((w) => w > COMPOUNDS[comp].cliff);
    const pts = [1, 5, 10, 15, 20, 25, 30, 35, 40].map((a) => `${a}:${(p.dt[a] - base).toFixed(2)}`);
    out.push(`  ${comp} (Δ frente a S nuevo) ${pts.join(" ")} · precipicio en la vuelta ${cliff} · deg media 2-12: ${((p.dt[12] - p.dt[2]) / 10).toFixed(3)} s/v`);
  }
  out.push(`  agarre estable nuevo S/M/H: ${["S", "M", "H"].map((x) => steadyGrip(x as any, 0, s.weather.trackT).toFixed(4)).join(" / ")}`);
  console.log(out.join("\n"));
}
