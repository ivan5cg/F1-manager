// Lo que cuesta seguir a otro coche: tiempo por vuelta perdido a 0,3, 0,5, 0,8 y 1,2 s detrás frente al aire limpio, en
// seco y con el mismo coche. Sirve para calibrar el aire sucio y el rebufo (ver docs/PLAN-LATERAL.md, fase 2).
//   npx tsx scripts/aire.ts [circuito ...]
// Con la posición lateral, el que sigue se abre en las curvas rápidas (Session.breatheWant): se cuenta lo que gana en
// aire sucio y lo que pierde por salirse de la trazada, como lo haría en carrera.
import { readdirSync } from "fs";
import { benchRace } from "./banco";

let ids = process.argv.slice(2);
if (!ids.length) ids = readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const GAPS = [0.3, 0.5, 0.8, 1.2];
const tot = GAPS.map(() => 0);
for (const id of ids) {
  const s: any = benchRace(id, 1);
  const c = s.cars[5], a = s.cars[4];
  const lap = (gap: number) => {
    let t = 0;
    for (const m of s.track.ms) {
      c.aheadId = gap < 50 ? a.id : -1; c.followGap = gap; c.grant = -1; c.drs = false;
      // abierto para respirar: lo que se separa de la estela del de delante y de la trazada
      // (como en Session.lateral: al apartarse deja de seguir parte de la trazada; el de delante va por ella)
      const want = gap < 50 && s.breatheWant ? s.breatheWant(c, m) : 0;
      const pi = Math.min((s.track.line?.length ?? 1) - 1, Math.floor(((m.s0 + m.s1) / 2) / s.track.ds));
      const ln = s.track.line?.[pi] ?? 0;
      const off = Math.abs(want - ln * 0.65 * Math.min(1, Math.abs(want) / 0.3));
      c.aheadDl = off * (s.track.wReal ?? 6.5) * (s.track.wr?.[pi] ?? 1);
      c.offLine = off;
      t += s.msTime(c, m, 0).t;
    }
    return t;
  };
  const clean = lap(99), loss = GAPS.map((g) => lap(g) - clean);
  loss.forEach((x, i) => (tot[i] += x));
  if (!process.env.SOLO_MEDIA) console.log(`${id.padEnd(13)} vuelta ${clean.toFixed(2)} s · pierde ${GAPS.map((g, i) => `a ${g} s ${loss[i].toFixed(3)}`).join(" · ")}`);
}
console.log(`media (s/vuelta): ${GAPS.map((g, i) => `a ${g} s ${(tot[i] / ids.length).toFixed(3)}`).join(" · ")}`);
