// Por qué pierde la pole (carreras secas de un lote): cuánto gana según el equipo que la tiene y quién le gana, si la
// pole es el coche más rápido en carrera (mediana de vueltas en verde, sin boxes) y si gana el más rápido, y cómo la
// pierde (undercut, overcut o en pista) con la ventaja de ritmo del ganador.
//   node scripts/auditoria/pole.js <carpeta> [más carpetas...]
const fs = require("fs"), path = require("path");
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
for (const dir of process.argv.slice(2)) {
  const by = {}, ranks = {}, adv = [], how = { undercut: 0, overcut: 0, pista: 0, otro: 0 };
  let n = 0, poleFastest = 0, fastestWins = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const R = w.sessions.RACE, Q = w.sessions.Q;
    if (!R || R.maxWater > 0.2 || !Q || Q.maxWater > 0.2) continue;
    const fin = R.res.filter((r) => r.status === "fin");
    if (!fin.length) continue;
    const pole = R.res.find((r) => r.grid === 1), win = fin[0];
    const b = (by[pole.team] ??= { n: 0, gana: 0, companero: 0, abandona: 0, otro: {} });
    b.n++;
    if (win.ab === pole.ab) b.gana++; else if (pole.status !== "fin") b.abandona++; else if (win.team === pole.team) b.companero++; else b.otro[win.team] = (b.otro[win.team] ?? 0) + 1;
    // ritmo de carrera: vueltas en verde sin boxes (ni la de después), desde la tercera
    const clean = (r) => r.lapsRec.filter((l) => l.n > 2 && l.fl === "g" && !l.pit && !(r.lapsRec[l.n - 2] && r.lapsRec[l.n - 2].pit)).map((l) => l.t);
    const pace = fin.map((r) => ({ r, p: clean(r).length >= 10 ? med(clean(r)) : NaN })).filter((x) => Number.isFinite(x.p)).sort((a, b2) => a.p - b2.p);
    const pr = pace.findIndex((x) => x.r.grid === 1);
    if (pr >= 0) { n++; const k = pr > 3 ? "5+" : String(pr + 1); ranks[k] = (ranks[k] ?? 0) + 1; if (pr === 0) poleFastest++; if (pace[0].r.pos === 1) fastestWins++; }
    if (win.grid === 1 || pole.status !== "fin") continue;
    adv.push(med(clean(pole)) - med(clean(win)));
    // la vuelta en que el ganador se pone delante para siempre y si coincide con una parada de alguno de los dos
    let L = -1;
    for (let i = R.lapOrder.length - 1; i > 0; i--) { const o = R.lapOrder[i]; if (o && o.indexOf(win.ab) > o.indexOf(pole.ab)) { L = i + 1; break; } }
    const pits = (r) => r.lapsRec.filter((l) => l.pit).map((l) => l.n);
    const fw = pits(win).find((x) => Math.abs(x - L) <= 2), fp = pits(pole).find((x) => Math.abs(x - L) <= 2);
    how[fw !== undefined && fp !== undefined ? (fw < fp ? "undercut" : fw > fp ? "overcut" : "otro") : fw !== undefined || fp !== undefined ? "otro" : "pista"]++;
  }
  console.log(dir);
  for (const [k, v] of Object.entries(by)) console.log(`  pole ${k.padEnd(11)} ${String(v.n).padStart(3)} · gana ${Math.round((100 * v.gana) / v.n)} % · le gana su compañero ${v.companero} · abandona ${v.abandona} · otros ${JSON.stringify(v.otro)}`);
  console.log(`  la pole es la más rápida en carrera: ${Math.round((100 * poleFastest) / n)} % · puesto de ritmo de la pole ${JSON.stringify(ranks)} · gana el más rápido: ${Math.round((100 * fastestWins) / n)} %`);
  console.log(`  cuando pierde: ${JSON.stringify(how)} · ventaja de ritmo del ganador ${med(adv).toFixed(3)} s/vuelta (mediana; >0 en ${adv.filter((x) => x > 0).length} de ${adv.length})`);
}
