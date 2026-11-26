// Distancia de cada equipo al mejor, en clasificación y en carrera (punto 2 de la auditoría: los lentos se quedan más
// cerca en carrera que en clasificación, y por eso hay pocos doblados).
//   node scripts/auditoria/equipos.mjs auditoria-out/<lote> [...]
// - Clasificación: la mejor vuelta del equipo en toda la sesión frente a la mejor de la sesión (solo las secas).
// - Carrera: mediana de las vueltas en verde y en aire limpio (a más de 2 s del de delante, sin boxes, desde la
//   vuelta 3) de sus dos coches, frente a la del equipo más rápido de esa carrera; y lo mismo con el modo de ritmo
//   de cada vuelta, para ver si la diferencia sale de cómo gestionan.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const q = {}, r = {}, push = {}, laps = {};
let n = 0;
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let d;
    try { d = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    const Q = d.sessions.Q, R = d.sessions.RACE;
    if (!Q || !R || Q.maxWater > 0.2 || R.maxWater > 0.2) continue;
    n++;
    const bestQ = {};
    for (const x of Q.res) { const t = Math.min(...(x.byPart ?? []).filter((v) => v && isFinite(v))); if (isFinite(t)) bestQ[x.team] = Math.min(bestQ[x.team] ?? Infinity, t); }
    const qb = Math.min(...Object.values(bestQ));
    for (const [k, v] of Object.entries(bestQ)) (q[k] ??= []).push((v / qb - 1) * 100);
    const lapsT = {};
    for (const x of R.res) {
      for (const l of x.lapsRec ?? []) {
        if (!l.g || l.pit || l.n < 3 || l.gap < 2 || l.fl !== "g") continue;
        (lapsT[x.team] ??= []).push(l.t);
        (push[x.team] ??= []).push(l.push);
      }
    }
    const mt = Object.fromEntries(Object.entries(lapsT).filter(([, v]) => v.length >= 6).map(([k, v]) => [k, med(v)]));
    const rb = Math.min(...Object.values(mt));
    for (const [k, v] of Object.entries(mt)) { (r[k] ??= []).push((v / rb - 1) * 100); (laps[k] ??= []).push(lapsT[k].length); }
  }
}
console.log(`${n} fines de semana secos`);
console.log("equipo        clasif. %  carrera %  carrera/clasif.  modo medio  vueltas limpias");
for (const k of Object.keys(q).sort((a, b) => med(q[a]) - med(q[b]))) {
  const a = med(q[k]), b = med(r[k] ?? []);
  const pm = (push[k] ?? []).reduce((x, y) => x + y, 0) / Math.max(1, (push[k] ?? []).length);
  console.log(`${k.padEnd(13)} ${a.toFixed(2).padStart(8)}  ${b.toFixed(2).padStart(8)}  ${(b / a).toFixed(2).padStart(14)}  ${pm.toFixed(2).padStart(10)}  ${med(laps[k] ?? []).toFixed(0).padStart(14)}`);
}
