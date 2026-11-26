// Punto 6 de la auditoría: cómo se decide la victoria. node scripts/auditoria/cabeza.js <carpeta> [más carpetas...]
// Para carrera y sprint en seco: gana la pole, desde P2/P3/P4+, quién lidera tras la vuelta 1, cuántas veces cambia
// el liderato y por qué (en pista, en boxes o con coche de seguridad), y la distancia en clasificación P1-P2.
const fs = require("fs"), path = require("path");
const W = [];
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) { try { W.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch { /* fichero a medias */ } }
const mean = (a) => { a = a.filter(Number.isFinite); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const pct = (a) => (100 * a.filter(Boolean).length) / Math.max(1, a.length);
const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "–");

function one(w, k, qk) {
  const R = w.sessions[k], Q = w.sessions[qk];
  if (!R || !Q || R.maxWater > 0.2 || Q.maxWater > 0.2) return null;
  const fin = R.res.filter((r) => r.status === "fin");
  if (!fin.length || !R.lapOrder?.length) return null;
  const grid = R.grid, L = R.lapOrder;
  const q = Q.res.map((r) => r.byPart[r.byPart.length - 1]);
  const x = { win: fin[0].grid, p12: q[1] - q[0], lead1: L[1] ? grid.indexOf(L[1][0]) + 1 : NaN, poleLap1: L[1] ? L[1].indexOf(grid[0]) + 1 : NaN };
  // cambios de líder vuelta a vuelta: ¿en boxes (el que lideraba paró en esa vuelta), con SC, o en pista?
  const recs = Object.fromEntries(R.res.map((r) => [r.ab, r.lapsRec]));
  let pit = 0, sc = 0, track = 0;
  for (let i = 2; i < L.length; i++) {
    const a = L[i - 1][0], b = L[i][0];
    if (a === b) continue;
    const la = recs[a]?.[i - 1], lb = recs[b]?.[i - 1];
    if ((la && la.pit) || (lb && lb.pit) || (recs[a]?.[i - 2]?.pit)) pit++;
    else if ((la && /s|v|r/.test(la.fl)) || (lb && /s|v|r/.test(lb.fl))) sc++;
    else track++;
  }
  Object.assign(x, { pit, sc, track, changes: pit + sc + track, winnerLedLap1: L[1] && L[1][0] === fin[0].ab });
  // el de la pole: ¿le pasan en pista en algún momento estando en cabeza?
  x.poleLostTrack = 0;
  for (let i = 2; i < L.length; i++) if (L[i - 1][0] === grid[0] && L[i][0] !== grid[0] && !recs[grid[0]]?.[i - 1]?.pit && !/s|v|r/.test(recs[grid[0]]?.[i - 1]?.fl ?? "")) x.poleLostTrack++;
  x.poleDnf = R.res.find((r) => r.ab === grid[0])?.status !== "fin";
  x.poleFin = R.res.find((r) => r.ab === grid[0])?.pos;
  x.winTeam = fin[0].team; x.poleTeam = R.res.find((r) => r.ab === grid[0])?.team;
  return x;
}
for (const [k, qk, name] of [["RACE", "Q", "CARRERA"], ["SPRINT", "SQ", "SPRINT"]]) {
  const xs = W.map((w) => one(w, k, qk)).filter(Boolean);
  if (!xs.length) continue;
  console.log(`\n===== ${name} en seco (${xs.length})`);
  console.log(`gana desde: P1 ${f(pct(xs.map((x) => x.win === 1)))} % · P2 ${f(pct(xs.map((x) => x.win === 2)))} % · P3 ${f(pct(xs.map((x) => x.win === 3)))} % · P4+ ${f(pct(xs.map((x) => x.win > 3)))} %`);
  console.log(`la pole lidera tras la V1 ${f(pct(xs.map((x) => x.poleLap1 === 1)))} % (P2 o peor: ${f(pct(xs.map((x) => x.poleLap1 > 1)))} %) · gana el que lidera la V1 ${f(pct(xs.map((x) => x.winnerLedLap1)))} %`);
  console.log(`cambios de líder por carrera ${f(mean(xs.map((x) => x.changes)), 2)}: en pista ${f(mean(xs.map((x) => x.track)), 2)} · boxes ${f(mean(xs.map((x) => x.pit)), 2)} · neutralización ${f(mean(xs.map((x) => x.sc)), 2)}`);
  console.log(`a la pole la pasan en pista estando en cabeza ${f(pct(xs.map((x) => x.poleLostTrack > 0)))} % · abandona ${f(pct(xs.map((x) => x.poleDnf)))} % · acaba de media P${f(mean(xs.map((x) => x.poleFin)), 1)}`);
  console.log(`P1-P2 en clasificación: med ${f(med(xs.map((x) => x.p12)), 3)} s · gana la pole con P2 a >0,15 s ${f(pct(xs.filter((x) => x.p12 > 0.15).map((x) => x.win === 1)))} % (n${xs.filter((x) => x.p12 > 0.15).length}) y a <0,05 s ${f(pct(xs.filter((x) => x.p12 < 0.05).map((x) => x.win === 1)))} % (n${xs.filter((x) => x.p12 < 0.05).length})`);
  const wt = {}; for (const x of xs) wt[x.winTeam] = (wt[x.winTeam] || 0) + 1;
  const pt = {}; for (const x of xs) pt[x.poleTeam] = (pt[x.poleTeam] || 0) + 1;
  console.log(`victorias por equipo ${JSON.stringify(wt)} · poles ${JSON.stringify(pt)}`);
}

// ¿Cómo le gana el ganador a la pole? La última vez que el ganador se pone por delante del de la pole: en la salida
// (vuelta 1), en boxes (alguno de los dos paró en esa vuelta o la anterior), con neutralización o en pista.
for (const [k, qk, name] of [["RACE", "Q", "CARRERA"], ["SPRINT", "SQ", "SPRINT"]]) {
  const H = { salida: 0, boxes: 0, neutralización: 0, pista: 0, "abandono de la pole": 0 }; let n = 0;
  for (const w of W) {
    const R = w.sessions[k], Q = w.sessions[qk];
    if (!R || !Q || R.maxWater > 0.2 || Q.maxWater > 0.2 || !R.lapOrder?.length) continue;
    const win = R.res.find((r) => r.status === "fin"), pole = R.grid[0];
    if (!win || win.ab === pole) continue;
    n++;
    const pr = R.res.find((r) => r.ab === pole);
    if (pr.status !== "fin") { H["abandono de la pole"]++; continue; }
    const L = R.lapOrder, recs = Object.fromEntries(R.res.map((r) => [r.ab, r.lapsRec]));
    let last = 0;
    for (let i = 1; i < L.length; i++) { const a = L[i].indexOf(win.ab), b = L[i].indexOf(pole); const pa = L[i - 1].indexOf(win.ab), pb = L[i - 1].indexOf(pole); if (a >= 0 && b >= 0 && a < b && !(pa >= 0 && pb >= 0 && pa < pb)) last = i; }
    if (last === 0) { H.salida++; continue; }
    if (last === 1) { H.salida++; continue; }
    const lw = recs[win.ab], lp = recs[pole];
    const pit = [last - 1, last - 2, last].some((j) => lw[j]?.pit || lp[j]?.pit);
    const sc = [last - 1, last - 2].some((j) => /[svr]/.test(lw[j]?.fl ?? "") || /[svr]/.test(lp[j]?.fl ?? ""));
    H[pit ? "boxes" : sc ? "neutralización" : "pista"]++;
  }
  if (n) console.log(`\n${name}: cuando no gana la pole (${n}), el ganador se le pone delante: ${Object.entries(H).map(([k2, v]) => `${k2} ${Math.round((100 * v) / n)} %`).join(" · ")}`);
}
