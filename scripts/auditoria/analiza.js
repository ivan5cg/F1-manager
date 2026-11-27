// Analiza un lote de fines de semana jugados con gp.ts: node scripts/auditoria/analiza.js <carpeta> [--por-circuito]
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
const byTrack = process.argv.includes("--por-circuito");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const W = [];
for (const f of files) { try { W.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); } catch (e) { console.error("mal", f); } }
const mean = (a) => { a = a.filter(Number.isFinite); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (a) => (100 * a.filter(Boolean).length) / Math.max(1, a.length);
const q = (a, p) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");
function linfit(xs, ys) { const n = xs.length, mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } const b = sxx ? sxy / sxx : 0; return { b, a: my - b * mx, res: ys.map((y, i) => y - (my + b * (xs[i] - mx))) }; }

function raceStats(w, R) {
  const pole = w.sessions.Q ? Math.min(...w.sessions.Q.res.map((r) => Math.min(...(r.byPart || []).filter((x) => x)))) : NaN;
  const fin = R.res.filter((r) => r.status === "fin");
  const lead = fin[0];
  const same = fin.filter((r) => r.laps === lead.laps);
  const out = { pole, FL: R.bestLap, flRatio: R.bestLap / pole };
  out.winGrid = lead.grid; out.poleWin = lead.grid === 1; out.margin = same[1] ? same[1].time - lead.time : NaN; out.gap10 = same[9] ? same[9].time - lead.time : NaN;
  out.lapped = fin.length - same.length; out.dnf = R.res.filter((r) => r.status === "out").length; out.dsq = R.res.filter((r) => r.status === "dsq").length;
  out.dnfReasons = R.res.filter((r) => r.status === "out").map((r) => r.reason);
  out.stops = fin.map((r) => r.stops);
  out.strats = fin.map((r) => r.stints.map((s) => s.c).join(""));
  out.raceMin = lead.time / 60; out.avgLapRatio = lead.time / lead.laps / pole;
  // banderas
  const fl = R.flags; let sc = 0, vsc = 0, red = 0, scLaps = [], vscSec = [];
  for (let i = 0; i < fl.length; i++) {
    if (fl[i].flag === "sc" && (i === 0 || fl[i - 1].flag !== "sc")) { sc++; const end = fl.slice(i + 1).find((x) => x.flag === "green" || x.flag === "red"); if (end) scLaps.push(end.lap - fl[i].lap); }
    if (fl[i].flag === "vsc") { vsc++; const end = fl[i + 1]; if (end) vscSec.push(end.t - fl[i].t); }
    if (fl[i].flag === "red") red++;
  }
  Object.assign(out, { sc, vsc, red, scLaps, vscSec });
  out.lap1Changes = R.grid && R.lap1 ? R.lap1.reduce((a, ab, i) => a + Math.abs(i - R.grid.indexOf(ab)), 0) : NaN;
  out.passes = R.passCount - R.passLap1; out.passLap1 = R.passLap1;
  out.contacts = R.stats.contacts; out.offs = R.stats.offs; out.pens = R.stats.pens;
  out.penMot = R.events.filter((e) => e.code === "sancion").map((e) => e.motivo);
  // vueltas en aire limpio: consistencia y degradación
  const scOnly = [], vscOnly = []; out.scOnly = scOnly; out.vscOnly = vscOnly;
  const cons = [], degsAll = { S: [], M: [], H: [], I: [], W: [] }, degs = { S: [], M: [], H: [], I: [], W: [] }, lapVsPole = [], pitLossM = [], scRatio = [], vscRatio = [], lap1Ratio = [];
  const stintLen = { S: [], M: [], H: [], I: [], W: [] };
  const freshDelta = [];
  const kg = w.kgSens;
  for (const r of R.res) {
    const L = r.lapsRec; if (!L.length) continue;
    const greenMed = med(L.filter((l) => l.g && !l.pit && l.n > 1).map((l) => l.t));
    if (r.status === "fin" && L[0]) lap1Ratio.push(L[0].t / greenMed);
    // stints
    let cur = []; const stints = [];
    for (const l of L) { if (l.pit) { if (cur.length) stints.push(cur); cur = []; continue; } if (cur.length && cur[cur.length - 1].c !== l.c) { stints.push(cur); cur = []; } cur.push(l); }
    if (cur.length) stints.push(cur);
    for (const st of stints) {
      const c = st[0].c; stintLen[c] && stintLen[c].push(st.length + 1);
      const cl = st.filter((l) => l.g && l.n > 1 && l.gap >= 2.0 && l.wing === 0 && l.floor === 0);
      if (cl.length >= 6) {
        // (el modo de ritmo se decide al final de la vuelta anterior: el de la vuelta l es el registrado en l-1)
        const pushOf = (l) => { const p = st.find((x) => x.n === l.n - 1); return p ? p.push : l.push; };
        const pm = med(cl.map(pushOf));
        const same = cl.filter((l) => pushOf(l) === pm);
        if (same.length >= 5) { const f2 = linfit(same.map((l) => l.age), same.map((l) => l.t - kg * l.fuel)); cons.push(sd(f2.res)); degs[c] && degs[c].push(f2.b); }
        degsAll[c] && degsAll[c].push(linfit(cl.map((l) => l.age), cl.map((l) => l.t - kg * l.fuel)).b);
      }
    }
    // pérdida en boxes medida: vuelta de entrada + de salida - 2 × vueltas verdes de alrededor
    for (let i = 1; i < L.length - 2; i++) if (L[i].pit && L[i + 1] && L[i + 1].pit && !L[i - 1].pit && L[i].g && L[i + 1].g) {
      const ref = med([L[i - 1], L[i + 2], L[i - 2], L[i + 3]].filter((x) => x && !x.pit && x.g).map((x) => x.t));
      if (Number.isFinite(ref)) pitLossM.push(L[i].t + L[i + 1].t - 2 * ref);
      i++;
    }
    if (r.pos <= 10 && r.status === "fin") for (const l of L) if (l.g && !l.pit && l.n > 1) lapVsPole.push(l.t / pole);
    // ratios con SC: vuelta entera neutralizada del líder (sin parar)
  }
  // SC / VSC ratio: buscar vueltas de cualquier coche del top 5 muy lentas no de boxes
  for (const r of R.res.slice(0, 5)) {
    const L = r.lapsRec; const gm = med(L.filter((l) => l.g && !l.pit && l.n > 1).map((l) => l.t));
    for (const l of L) if (!l.g && !l.pit && l.t > gm * 1.2) scRatio.push(l.t / gm);
    for (const l of L) if (!l.pit && l.fl === "s") scOnly.push(l.t / gm); else if (!l.pit && l.fl === "v") vscOnly.push(l.t / gm);
  }
  // vuelta rápida: en qué vuelta (fracción de carrera) y con qué neumático y edad
  for (const r of R.res) if (r.best === R.bestLap) { const l = r.lapsRec.find((x) => Math.abs(x.t - r.best) < 0.002); if (l) { out.flFrac = l.n / R.lapsTotal; out.flAge = l.age; out.flC = l.c; out.flFuel = l.fuel; out.flAb = r.ab; } }
  Object.assign(out, { cons, degs, degsAll, lapVsPole: med(lapVsPole), lapVsPoleP10: q(lapVsPole, 0.1), pitLossM, scRatio, lap1Ratio: med(lap1Ratio), stintLen });
  // regla: % que acaba con compuestos
  out.usedH = fin.filter((r) => r.stints.some((s) => s.c === "H")).length / Math.max(1, fin.length);
  out.usedS = fin.filter((r) => r.stints.some((s) => s.c === "S")).length / Math.max(1, fin.length);
  out.startC = R.res.map((r) => r.stints[0]?.c);
  // posiciones ganadas por el ganador; correlación parrilla-resultado
  const xs = fin.map((r) => r.grid), ys = fin.map((r) => r.pos);
  out.gridCorr = spearman(xs, ys);
  out.teamOrder = R.res.map((r) => r.team);
  return out;
}
function spearman(x, y) { const n = x.length; if (n < 3) return NaN; const rk = (a) => { const s = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(n); s.forEach(([, i], k) => (r[i] = k)); return r; }; const rx = rk(x), ry = rk(y); let d = 0; for (let i = 0; i < n; i++) d += (rx[i] - ry[i]) ** 2; return 1 - (6 * d) / (n * (n * n - 1)); }

function qualiStats(w, Q) {
  const res = Q.res;
  const best = (r) => { const v = (r.byPart || []).filter((x) => x); return v.length ? Math.min(...v) : NaN; };
  const pole = res[0].byPart[res[0].byPart.length - 1];
  const o = { pole, poleObj: w.poleObj, poleErr: pole - w.poleObj };
  const p = (i) => { const r = res[i]; const part = r.byPart.length - 1; return r.byPart[part]; };
  o.gap2 = p(1) - pole; o.gap3 = p(2) - pole; o.gap10 = p(9) - pole;
  // dispersión en Q1 (todos)
  const q1 = res.map((r) => r.byPart[0]).filter((x) => x).sort((a, b) => a - b);
  o.q1Spread = q1[q1.length - 1] - q1[0]; o.q1Spread20 = q1[Math.min(19, q1.length - 1)] - q1[0];
  o.q1cut = q1[16] - q1[15]; o.q2cut = (() => { const q2 = res.map((r) => r.byPart[1]).filter((x) => x).sort((a, b) => a - b); return q2[10] - q2[9]; })();
  // evolución: Q3 frente a Q1 de los 10
  const t10 = res.slice(0, 10);
  o.evoQ1Q3 = mean(t10.map((r) => r.byPart[0] - r.byPart[2]));
  o.q3SlowerThanQ2 = t10.filter((r) => r.byPart[2] > r.byPart[1]).length;
  o.q2SlowerThanQ1 = res.slice(0, 16).filter((r) => r.byPart[1] > r.byPart[0]).length;
  // compañeros
  const byTeam = {}; for (const r of res) (byTeam[r.team] ??= []).push(r);
  o.mateGap = Object.values(byTeam).map((rs) => { if (rs.length < 2) return NaN; const k = Math.min(rs[0].byPart.filter((x) => x).length, rs[1].byPart.filter((x) => x).length) - 1; return Math.abs(rs[0].byPart[k] - rs[1].byPart[k]); });
  o.order = res.map((r) => r.ab); o.teams = res.map((r) => r.team);
  o.laps = res.map((r) => r.sessionLaps);
  o.tyres = res.slice(0, 10).map((r) => (r.tyreByPart || []).join(""));
  o.red = Q.stats.red; o.anuladas = Q.events.filter((e) => e.code === "anulada").length;
  const TOP8 = ["RUS", "ANT", "LEC", "HAM", "VER", "NOR", "PIA", "HAD"];
  o.topQ1Out = res.filter((r) => r.elim === 0 && TOP8.includes(r.ab)).length;
  o.topQ2Out = res.filter((r) => r.elim === 1 && TOP8.includes(r.ab)).length;
  o.wet = Q.maxWater > 0.2;
  return o;
}
function fpStats(w, F) {
  const res = F.res; const b = res.map((r) => r.best).filter(Number.isFinite).sort((x, y) => x - y);
  return { laps: res.map((r) => r.laps), best: b[0], spread: b[Math.min(19, b.length - 1)] - b[0], longRuns: F.longRuns.length, lrC: F.longRuns.map((l) => l.c), lrDeg: F.longRuns.filter((l) => !l.wet).map((l) => [l.c, l.deg]), red: F.stats.red, wet: F.maxWater > 0.2 };
}

const A = { RACE: [], SPRINT: [], Q: [], SQ: [], FP1: [], FP2: [], FP3: [] };
const per = {};
for (const w of W) {
  for (const [k, S] of Object.entries(w.sessions)) {
    let x;
    if (k === "RACE" || k === "SPRINT") { if (!w.sessions.Q && k === "RACE") continue; x = raceStats(w, S); if (k === "SPRINT") { const sq = w.sessions.SQ; x.pole = Math.min(...sq.res.map((r) => Math.min(...(r.byPart || []).filter((y) => y)))); x.flRatio = S.bestLap / x.pole; } x.wet = S.maxWater > 0.2; x.maxWater = S.maxWater; }
    else if (k === "Q" || k === "SQ") x = qualiStats(w, S);
    else x = fpStats(w, S);
    x.id = w.id; x.seed = w.seed; A[k].push(x);
    ((per[w.id] ??= {})[k] ??= []).push(x);
  }
}
function reportRace(rs, name) {
  if (!rs.length) return;
  const all = (k) => rs.flatMap((r) => r[k]);
  console.log(`\n===== ${name} (${rs.length}) mojadas ${rs.filter((r) => r.wet).length}`);
  console.log(`vuelta rápida / pole: media ${f(mean(rs.map((r) => r.flRatio)), 4)} med ${f(med(rs.map((r) => r.flRatio)), 4)} [p10 ${f(q(rs.map((r) => r.flRatio), 0.1), 4)} p90 ${f(q(rs.map((r) => r.flRatio), 0.9), 4)}]`);
  console.log(`vuelta verde típica top10 / pole: med ${f(med(rs.map((r) => r.lapVsPole)), 4)} · media del ganador/pole (incl. boxes, SC) ${f(med(rs.map((r) => r.avgLapRatio)), 4)} · duración ${f(med(rs.map((r) => r.raceMin)), 1)} min`);
  console.log(`vuelta 1 / vuelta verde: ${f(mean(rs.map((r) => r.lap1Ratio)), 3)} · cambios de puesto en V1 (suma |Δ|): ${f(mean(rs.map((r) => r.lap1Changes)), 1)} · adelantamientos V1 ${f(mean(rs.map((r) => r.passLap1)), 1)} resto ${f(mean(rs.map((r) => r.passes)), 1)}`);
  console.log(`consistencia (σ residuo, aire limpio): med ${f(med(all("cons")), 3)} s  p90 ${f(q(all("cons"), 0.9), 3)}`);
  for (const c of ["S", "M", "H", "I", "W"]) { const d = rs.flatMap((r) => r.degs[c]); const d2 = rs.flatMap((r) => r.degsAll[c]); if (d.length) console.log(`  degradación ${c} (s/vuelta, corregida de combustible, mismo modo): med ${f(med(d), 3)} [con cambios de modo ${f(med(d2), 3)}] p10 ${f(q(d, 0.1), 3)} p90 ${f(q(d, 0.9), 3)} (n=${d.length}) · tanda media ${f(mean(rs.flatMap((r) => r.stintLen[c])), 1)} v`); }
  console.log(`pérdida en boxes medida: med ${f(med(all("pitLossM")), 1)} s · vuelta SC/VSC ÷ verde: med ${f(med(all("scRatio")), 2)} · vuelta entera con SC ${f(med(all("scOnly")), 2)} (n${all("scOnly").length}) · con VSC ${f(med(all("vscOnly")), 2)} (n${all("vscOnly").length})`);
  const fc = {}; for (const r of rs) if (r.flC) fc[r.flC] = (fc[r.flC] || 0) + 1;
  console.log(`vuelta rápida: en el ${f(100 * med(rs.map((r) => r.flFrac)), 0)} % de la carrera (med), edad del neumático ${f(med(rs.map((r) => r.flAge)), 0)} v, combustible ${f(med(rs.map((r) => r.flFuel)), 1)} kg, compuesto ${JSON.stringify(fc)}`);
  const st = all("stops"); const h = {}; for (const s of st) h[s] = (h[s] || 0) + 1;
  console.log(`paradas: media ${f(mean(st), 2)} reparto ${JSON.stringify(h)} · usa duro ${f(100 * mean(rs.map((r) => r.usedH)), 0)} % · usa blando ${f(100 * mean(rs.map((r) => r.usedS)), 0)} %`);
  const sh = {}; for (const s of all("strats")) sh[s] = (sh[s] || 0) + 1;
  console.log(`estrategias: ${Object.entries(sh).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  const sc = {}; for (const s of all("startC")) sc[s] = (sc[s] || 0) + 1; console.log(`neumático de salida: ${JSON.stringify(sc)}`);
  console.log(`SC: ${f(pct(rs.map((r) => r.sc > 0)), 0)} % carreras (${f(mean(rs.map((r) => r.sc)), 2)}/carrera, ${f(mean(all("scLaps")), 1)} v de media) · VSC ${f(pct(rs.map((r) => r.vsc > 0)), 0)} % (${f(mean(all("vscSec")), 0)} s) · roja ${f(pct(rs.map((r) => r.red > 0)), 0)} %`);
  console.log(`abandonos ${f(mean(rs.map((r) => r.dnf)), 2)} · dsq ${f(mean(rs.map((r) => r.dsq)), 2)} · toques ${f(mean(rs.map((r) => r.contacts)), 2)} · salidas/trompos ${f(mean(rs.map((r) => r.offs)), 2)} · sanciones ${f(mean(rs.map((r) => r.pens)), 2)}`);
  const why = {}; for (const s of all("dnfReasons")) { const k = s.replace(/\(.*?\)/, "").replace(/con \w+/, "con X").trim(); why[k] = (why[k] || 0) + 1; } console.log(`  motivos de abandono: ${JSON.stringify(why)}`);
  const pm = {}; for (const s of all("penMot")) pm[s] = (pm[s] || 0) + 1; console.log(`  sanciones por motivo: ${JSON.stringify(pm)}`);
  console.log(`gana la pole ${f(pct(rs.map((r) => r.poleWin)), 0)} % · gana desde P4+ ${f(pct(rs.map((r) => r.winGrid > 3)), 0)} % · margen ${f(med(rs.map((r) => r.margin)), 1)} s (media ${f(mean(rs.map((r) => r.margin)), 1)}) · 1.º-10.º ${f(med(rs.map((r) => r.gap10)), 1)} s · doblados ${f(mean(rs.map((r) => r.lapped)), 1)} · Spearman parrilla-final ${f(mean(rs.map((r) => r.gridCorr)), 2)}`);
}
function reportQ(qs, name) {
  if (!qs.length) return;
  console.log(`\n===== ${name} (${qs.length})`);
  console.log(`pole - objetivo: med ${f(med(qs.map((x) => x.poleErr)), 3)} [${f(q(qs.map((x) => x.poleErr), 0.1), 3)} … ${f(q(qs.map((x) => x.poleErr), 0.9), 3)}]`);
  console.log(`P2-P1 ${f(med(qs.map((x) => x.gap2)), 3)} · P3 ${f(med(qs.map((x) => x.gap3)), 3)} · P10 ${f(med(qs.map((x) => x.gap10)), 3)} · Q1 P1-P20 ${f(med(qs.map((x) => x.q1Spread20)), 3)} · Q1 todos ${f(med(qs.map((x) => x.q1Spread)), 3)}`);
  console.log(`corte Q1 (P16-P17) ${f(med(qs.map((x) => x.q1cut)), 3)} · corte Q2 ${f(med(qs.map((x) => x.q2cut)), 3)} · mejora Q1→Q3 top10 ${f(med(qs.map((x) => x.evoQ1Q3)), 3)} s · Q3 más lento que su Q2: ${f(mean(qs.map((x) => x.q3SlowerThanQ2)), 1)}/10 · Q2>Q1: ${f(mean(qs.map((x) => x.q2SlowerThanQ1)), 1)}/16`);
  const dq = qs.filter((x) => !x.wet);
  console.log(`(en seco: ${dq.length}) de los 8 de cabeza caen en Q1: ${f(mean(dq.map((x) => x.topQ1Out)), 2)} por sesión (${f(pct(dq.map((x) => x.topQ1Out > 0)), 0)} % de sesiones) · en Q2: ${f(mean(dq.map((x) => x.topQ2Out)), 2)} (${f(pct(dq.map((x) => x.topQ2Out > 0)), 0)} %) · mejora Q1→Q3 en seco ${f(med(dq.map((x) => x.evoQ1Q3)), 3)} · pole−objetivo en seco med ${f(med(dq.map((x) => x.poleErr)), 3)} σ ${f(sd(dq.map((x) => x.poleErr)), 3)}`);
  console.log(`compañeros |Δ| med ${f(med(qs.flatMap((x) => x.mateGap)), 3)} media ${f(mean(qs.flatMap((x) => x.mateGap)), 3)} · vueltas por piloto med ${f(med(qs.flatMap((x) => x.laps)), 0)} · banderas rojas ${f(pct(qs.map((x) => x.red > 0)), 0)} %`);
  const pos = {}; for (const x of qs) x.order.forEach((ab, i) => (pos[ab] ??= []).push(i + 1));
  console.log(`puesto medio: ${Object.entries(pos).map(([k, v]) => [k, mean(v)]).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
  const poles = {}; for (const x of qs) poles[x.order[0]] = (poles[x.order[0]] || 0) + 1; console.log(`poles: ${JSON.stringify(poles)}`);
  const ty = {}; for (const x of qs) for (const t of x.tyres) ty[t] = (ty[t] || 0) + 1; console.log(`neumáticos de los 10 por parte: ${JSON.stringify(ty)}`);
}
function reportFP(fs_, name) {
  if (!fs_.length) return;
  console.log(`\n===== ${name} (${fs_.length}) mojadas ${fs_.filter((x) => x.wet).length}: vueltas por piloto med ${f(med(fs_.flatMap((x) => x.laps)), 0)} [p10 ${q(fs_.flatMap((x) => x.laps), 0.1)} p90 ${q(fs_.flatMap((x) => x.laps), 0.9)}] · P1-P20 ${f(med(fs_.map((x) => x.spread)), 3)} · tandas largas ${f(mean(fs_.map((x) => x.longRuns)), 1)} · rojas ${f(pct(fs_.map((x) => x.red > 0)), 0)} %`);
  const d = {}; for (const x of fs_) for (const [c, v] of x.lrDeg) (d[c] ??= []).push(v); console.log(`  pendiente tandas largas (s/v, ya corregida): ${Object.entries(d).map(([c, v]) => `${c} ${f(med(v), 3)} (n${v.length})`).join(" · ")}`);
}
reportFP(A.FP1, "LIBRES 1"); reportFP(A.FP2, "LIBRES 2"); reportFP(A.FP3, "LIBRES 3");
// libres frente a la pole
const fpq = W.filter((w) => w.sessions.FP3 && w.sessions.Q).map((w) => { const pole = Math.min(...w.sessions.Q.res.map((r) => Math.min(...(r.byPart || []).filter((x) => x)))); return { fp1: w.sessions.FP1.bestLap - pole, fp2: w.sessions.FP2?.bestLap - pole, fp3: w.sessions.FP3.bestLap - pole }; });
if (fpq.length) console.log(`mejor de libres − pole: L1 ${f(med(fpq.map((x) => x.fp1)), 3)} · L2 ${f(med(fpq.map((x) => x.fp2)), 3)} · L3 ${f(med(fpq.map((x) => x.fp3)), 3)} · L3 más rápido que la pole en ${f(pct(fpq.map((x) => x.fp3 < 0)), 0)} % · L2 en ${f(pct(fpq.map((x) => x.fp2 < 0)), 0)} %`);
reportQ(A.SQ, "CLASIFICACIÓN SPRINT"); reportQ(A.Q, "CLASIFICACIÓN");
reportRace(A.SPRINT, "SPRINT"); reportRace(A.RACE, "CARRERA");
if (byTrack) {
  console.log("\nPor circuito (carrera): FL/pole · verde/pole · paradas · usa H % · adelant. · SC% · margen · pole err (seco)");
  for (const [id, k] of Object.entries(per)) {
    // la pole solo en las clasificaciones secas (una mojada, aunque sea en un día «Estable», la dispara: Silverstone
    // salía a +2,6 s por una Q3 con lluvia de cuatro)
    const r = k.RACE || []; const qq = (k.Q || []).filter((x) => !x.wet);
    console.log(`  ${id.padEnd(12)} ${f(mean(r.map((x) => x.flRatio)), 4)} ${f(med(r.map((x) => x.lapVsPole)), 4)} ${f(mean(r.flatMap((x) => x.stops)), 2)} ${f(100 * mean(r.map((x) => x.usedH)), 0).padStart(4)} ${f(mean(r.map((x) => x.passes + x.passLap1)), 1).padStart(5)} ${f(pct(r.map((x) => x.sc > 0)), 0).padStart(4)} ${f(mean(r.map((x) => x.margin)), 1).padStart(5)} ${f(mean(qq.map((x) => x.poleErr)), 3)} · deg S ${f(med(r.flatMap((x) => x.degs.S)), 3)} M ${f(med(r.flatMap((x) => x.degs.M)), 3)} H ${f(med(r.flatMap((x) => x.degs.H)), 3)} · boxes ${f(med(r.flatMap((x) => x.pitLossM)), 1)}`);
  }
}
