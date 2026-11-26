const fs = require("fs");
const [dir, resFile] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(resFile));
const MAP = { 13: "monza", 14: "madrid", 15: "baku", 16: "sepang", 17: "singapur", 18: "austin", 19: "mexico", 20: "interlagos", 21: "lasvegas" };
const med = (a) => { a = a.filter((x) => isFinite(x)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
const real = {}, sim = {};
// distancia de cada equipo a Mercedes en la última parte a la que llegó (misma parte: sin la evolución de la pista)
function partGap(rows) {
  const best = {}, mer = {};
  for (const x of rows) {
    for (let k = 2; k >= 0; k--) if (x.parts[k]) { const b = best[x.team]; if (!b || k > b.k || (k === b.k && x.parts[k] < b.t)) best[x.team] = { k, t: x.parts[k] }; break; }
    if (x.team === "mercedes") for (let k = 0; k < 3; k++) if (x.parts[k]) mer[k] = Math.min(mer[k] ?? 1e9, x.parts[k]);
  }
  const out = {};
  for (const t in best) { let k = best[t].k; while (k > 0 && !(k in mer)) k--; if (k in mer) out[t] = 100 * (best[t].t / mer[k] - 1); }
  return out;
}
for (const [r, id] of Object.entries(MAP)) {
  const g = R[r - 1];
  if (r != 20) { const d = partGap(g.quali.map((x) => ({ team: x.team, parts: [x.q1, x.q2, x.q3] }))); for (const t in d) (real[t] ??= {})[id] = d[t]; }
  for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(id + "_"))) {
    const q = JSON.parse(fs.readFileSync(dir + "/" + f)).sessions.Q; if (!q || q.maxWater > 0.05) continue;
    const d = partGap(q.res.map((x) => ({ team: x.team, parts: [0, 1, 2].map((k) => x.byPart[k]) })));
    for (const t in d) ((sim[t] ??= {})[id] ??= []).push(d[t]);
  }
}
const ids = Object.values(MAP);
console.log("equipo       " + ids.map((i) => i.slice(0, 6).padStart(13)).join("") + "   mediana real/sim");
for (const t of Object.keys(real).sort((a, b) => med(Object.values(real[a])) - med(Object.values(real[b])))) {
  const row = ids.map((i) => { const r = real[t][i], s = med(sim[t]?.[i] ?? []); return `${isFinite(r) ? r.toFixed(2) : "  -  "}/${isFinite(s) ? s.toFixed(2) : " - "}`.padStart(13); });
  console.log(t.padEnd(12) + row.join("") + `   ${med(Object.values(real[t])).toFixed(2)}/${med(ids.map((i) => med(sim[t]?.[i] ?? []))).toFixed(2)}`);
}
