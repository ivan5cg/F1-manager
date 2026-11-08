// Resumen de una carrera recién terminada: posiciones vuelta a vuelta, tandas de neumáticos de cada
// piloto y los momentos clave. Gráficas en canvas: el resto de coches en gris y en color solo el
// ganador y tus pilotos (con etiqueta al final de la línea), para que se lean de un vistazo.
import type { Session, Car } from "../sim/session";
import { COMPOUNDS } from "../sim/tyres";
import { esc, fmtLap } from "./common";

// colores de serie validados para fondo oscuro y daltonismo (los mismos que el muro)
const COLORS = ["#bd860e", "#3a8be8", "#e94f8a"];
const FONT = (w: number, px: number) => `${w} ${px}px "Titillium Web", "Arial Narrow", sans-serif`;

function highlighted(sess: Session): { car: Car; color: string; role: string }[] {
  const res = sess.results();
  const win = sess.carById(res[0].id);
  const mine = sess.cars.filter((c) => c.player).sort((a, b) => a.id - b.id);
  const out: { car: Car; color: string; role: string }[] = [];
  if (!win.player) out.push({ car: win, color: COLORS[0], role: "Ganador" });
  mine.forEach((c, i) => out.push({ car: c, color: COLORS[i + 1], role: "Tu piloto" }));
  return out;
}

export function raceSummaryHtml(sess: Session): string {
  const hl = highlighted(sess);
  const res = sess.results();
  // momentos clave: banderas, abandonos, paradas de tus pilotos y vuelta rápida
  const keyEv = sess.events.filter((e) =>
    (e.kind === "control" && /COCHE DE SEGURIDAD —|VIRTUAL —|BANDERA ROJA —|tiempo máximo|no se reanudará/.test(e.text)) ||
    (e.kind === "incident" && /abandona/.test(e.text)) ||
    (e.kind === "pit" && /entra a boxes/.test(e.text) && e.carId !== undefined && sess.carById(e.carId).player));
  const fl = sess.cars.filter((c) => Number.isFinite(c.best)).sort((a, b) => a.best - b.best)[0];
  const flLap = fl ? fl.lapTimes.indexOf(fl.best) + 1 : 0;
  const clean = (t: string) => t.replace(/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍\s]+/u, "");
  return `
  <div class="panel"><div class="hd"><span class="t">Posiciones vuelta a vuelta</span></div><div class="bd">
    <div class="mw-leg">${hl.map((h) => `<span><i style="background:${h.color}"></i>${h.role}: <b>${esc(h.car.d.abrev)}</b></span>`).join("")}<span><i style="background:#5a6472"></i>Resto</span></div>
    <canvas class="sumchart" id="lapchart" style="height:230px"></canvas>
    <div class="small dim mono" id="lapinfo">Toca la gráfica para ver las posiciones de una vuelta.</div>
  </div></div>
  <div class="panel"><div class="hd"><span class="t">Tandas de neumáticos</span></div><div class="bd">
    <canvas class="sumchart" id="stintchart" style="height:${res.length * 13 + 22}px"></canvas>
  </div></div>
  <div class="panel"><div class="hd"><span class="t">Momentos clave</span></div><div class="bd small">
    ${fl ? `<div class="row" style="margin-bottom:4px"><span class="purple">⏱</span><span class="grow">Vuelta rápida: <b>${esc(fl.d.nombre)}</b> ${fmtLap(fl.best)} (V${flLap})</span></div>` : ""}
    ${keyEv.map((e) => `<div class="row" style="gap:6px;padding:2px 0"><span class="mono dim" style="width:30px">V${e.lap}</span><span class="grow">${esc(clean(e.text))}</span></div>`).join("") || `<div class="dim">Carrera sin incidencias.</div>`}
  </div></div>`;
}

export function drawRaceSummary(sess: Session) {
  drawLapChart(sess);
  drawStints(sess);
}

function canvasFor(id: string) {
  const cv = document.getElementById(id) as HTMLCanvasElement | null;
  if (!cv) return null;
  const W = cv.clientWidth || 360, H = cv.clientHeight || 200, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  return { cv, g, W, H };
}

function drawLapChart(sess: Session) {
  const c = canvasFor("lapchart");
  if (!c) return;
  const { cv, g, W, H } = c;
  const laps = sess.lapOrder.length - 1;
  const n = sess.cars.length;
  if (laps < 1) return;
  const padL = 24, padR = 40, padT = 8, padB = 18;
  const x = (l: number) => padL + ((W - padL - padR) * l) / laps;
  const y = (p: number) => padT + ((H - padT - padB) * (p - 1)) / (n - 1);
  g.fillStyle = "#161b22"; g.fillRect(0, 0, W, H);
  g.font = FONT(600, 10); g.fillStyle = "#9aa5b4"; g.textAlign = "right"; g.textBaseline = "middle";
  for (const p of [1, 5, 10, 15, 20]) if (p <= n) { g.strokeStyle = "#252c36"; g.beginPath(); g.moveTo(padL, y(p)); g.lineTo(W - padR, y(p)); g.stroke(); g.fillText(`P${p}`, padL - 3, y(p)); }
  g.textAlign = "center"; g.textBaseline = "top";
  const step = Math.max(1, Math.ceil(laps / 6 / 5) * 5);
  for (let l = 0; l <= laps; l += step) g.fillText(l === 0 ? "Sal." : `V${l}`, x(l), H - padB + 4);
  const posOf = (id: number) => sess.lapOrder.map((o) => (o ? o.indexOf(id) + 1 : 0));
  const hl = highlighted(sess);
  const line = (id: number, color: string, w: number) => {
    const ps = posOf(id);
    g.strokeStyle = color; g.lineWidth = w; g.lineJoin = "round"; g.beginPath();
    let on = false, last = -1;
    ps.forEach((p, l) => { if (p < 1) { on = false; return; } if (!on) { g.moveTo(x(l), y(p)); on = true; } else g.lineTo(x(l), y(p)); last = l; });
    g.stroke();
    return last >= 0 ? { l: last, p: ps[last] } : null;
  };
  for (const car of sess.cars) if (!hl.some((h) => h.car === car)) line(car.id, "#3a4250", 1);
  const ends: { y: number; t: string }[] = [];
  for (const h of hl) {
    const e = line(h.car.id, h.color, 2.2);
    if (e) { g.fillStyle = h.color; g.beginPath(); g.arc(x(e.l), y(e.p), 3.5, 0, 7); g.fill(); ends.push({ y: y(e.p), t: `${h.car.d.abrev} P${e.p}` }); }
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 12);
  g.font = FONT(700, 10.5); g.fillStyle = "#ffffff"; g.textAlign = "left"; g.textBaseline = "middle";
  for (const e of ends) g.fillText(e.t, W - padR + 4, e.y);
  cv.onclick = (ev) => {
    const r = cv.getBoundingClientRect();
    const l = Math.max(0, Math.min(laps, Math.round(((ev.clientX - r.left - padL) / (W - padL - padR)) * laps)));
    const info = document.getElementById("lapinfo");
    if (info) info.innerHTML = `${l === 0 ? "Salida" : `V${l}`}: ` + hl.map((h) => `${h.car.d.abrev} P${posOf(h.car.id)[l] || "—"}`).join(" · ");
  };
}

function drawStints(sess: Session) {
  const c = canvasFor("stintchart");
  if (!c) return;
  const { g, W, H } = c;
  const res = sess.results();
  const laps = Math.max(1, sess.laps);
  const padL = 40, padR = 6, padT = 4, rowH = 13;
  const x = (l: number) => padL + ((W - padL - padR) * l) / laps;
  g.fillStyle = "#161b22"; g.fillRect(0, 0, W, H);
  g.font = FONT(700, 10); g.textBaseline = "middle";
  res.forEach((r, i) => {
    const car = sess.carById(r.id);
    const yy = padT + i * rowH;
    g.fillStyle = car.player ? "#ffd84a" : "#c9d0da"; g.textAlign = "right";
    g.fillText(car.d.abrev, padL - 5, yy + rowH / 2);
    const end = r.status === "fin" ? r.laps : Math.max(0, sess.lapsDone(car));
    car.stintLog.forEach((st, j) => {
      const to = j + 1 < car.stintLog.length ? car.stintLog[j + 1].from : end;
      if (to <= st.from) return;
      const x0 = x(st.from), x1 = x(to);
      g.fillStyle = COMPOUNDS[st.c].color;
      // 2 px de separación entre tandas
      g.fillRect(x0 + (j ? 1 : 0), yy + 2, Math.max(1, x1 - x0 - (j ? 1 : 0) - 1), rowH - 4);
      if (x1 - x0 > 16) { g.fillStyle = st.c === "H" || st.c === "M" ? "#111" : "#fff"; g.textAlign = "center"; g.font = FONT(700, 8.5); g.fillText(st.c, (x0 + x1) / 2, yy + rowH / 2 + 0.5); g.font = FONT(700, 10); }
    });
  });
  g.fillStyle = "#9aa5b4"; g.textAlign = "center"; g.font = FONT(600, 10);
  for (let l = 0; l <= laps; l += Math.max(5, Math.ceil(laps / 6 / 5) * 5)) g.fillText(l === 0 ? "" : `V${l}`, x(l), H - 8);
}
