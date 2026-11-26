// Sonda de neumáticos: temperatura de carcasa, graining y agarre de cada compuesto a lo largo de una tanda (perfil de la IA).
import { benchRace } from "../banco";
import { COMPOUNDS, newSet, updateSet, setGrip, axleGrip, driverRough, setWear } from "../../src/sim/tyres";
import { msTimeAtGrip } from "../../src/sim/track";
for (const id of process.argv.slice(2)) {
  const s = benchRace(id, 1, true, false);
  const car = s.cars.find((x) => x.d.abrev === "RUS")!;
  const tr = s.track, lapRef = s.lapRefRace;
  console.log(`${id}: asfalto ${s.weather.trackT.toFixed(1)} aire ${s.weather.airT.toFixed(1)} abras ${tr.abrasiveness}`);
  for (const c of ["S", "M", "H"] as const) {
    const set = newSet(c); const sp = COMPOUNDS[c];
    const row: string[] = [];
    for (let age = 0; age < 40; age++) {
      let g = 0, T = 0;
      for (const m of tr.ms) {
        const tm = msTimeAtGrip(m, 1); const steps = Math.max(1, Math.round(tm / 2)); const h = tm / steps;
        for (let k = 0; k < steps; k++) updateSet(set, { trackT: s.weather.trackT, airT: s.weather.airT, water: 0, eF: (m.energyF / tm) * lapRef, eR: (m.energyR / tm) * lapRef, push: 1, carWear: car.wearMult, abrasiveness: tr.abrasiveness, rubber: 0.8, rough: driverRough(car.d.neumaticos) }, h, lapRef, s.hidden);
        g += setGrip(set, 0) * tm; T += tm;
      }
      if ([1, 5, 10, 20, 30].includes(age)) row.push(`v${age}: F${set.F.tBulk.toFixed(0)}/R${set.R.tBulk.toFixed(0)} gr${set.F.grain.toFixed(2)}/${set.R.grain.toFixed(2)} w${setWear(set).toFixed(2)} g${(g / T).toFixed(4)}`);
    }
    console.log(`  ${c} opt ${sp.opt} win ${sp.window} base ${sp.base.toFixed(3)} | ${row.join(" | ")}`);
  }
}
