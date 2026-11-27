// Rendimiento estimado de cada coche (pantalla de temporada, en los dos modos): lo que le falta a cada uno frente al
// más rápido en una vuelta de referencia de 1:30, ronda a ronda, con el coche tal como corre cada gran premio
// (desarrollo del jugador, curvas ATR y paquetes de los rivales, director técnico en «crear equipo»).
//
// Es solo el coche: sin pilotos, sin reglajes y en un circuito medio (la media de los tres tipos de curva). Los pesos
// salen de ajustar el nivel de los coches de 2026 a lo que mide el banco de auditoría en clasificación
// (`scripts/auditoria/base-2026-11c/equipos.txt`): 1 de agarre ≈ 1,09 % de la vuelta, 1 de potencia ≈ 0,24 % y 1 de
// resistencia ≈ 0,39 % (más resistencia, más lento). No toca la simulación.
import type { TeamDef } from "../sim/session";
import type { SeasonState } from "../sim/season";
import { calendarOf, gridOf } from "./data";
import { esc } from "./common";
import { reducedMotion, teamCrest } from "./visual";

const LAP_S = 90;
const K_AGARRE = 1.09, K_POTENCIA = 0.24, K_RESIST = 0.39; // % de la vuelta por unidad

/** Nivel del coche en s por vuelta (más es más rápido; solo vale para comparar). */
export function carLevel(t: TeamDef): number {
  const cv = t.curvas ?? [0, 0, 0];
  const grip = t.agarre + (cv[0] + cv[1] + cv[2]) / 3;
  return ((K_AGARRE * grip + K_POTENCIA * t.potencia - K_RESIST * t.resistencia) / 100) * LAP_S;
}

export interface PerfSeries {
  /** Rondas (índice) con dato: de la primera a la del próximo gran premio (o la última, con la temporada acabada). */
  rounds: number[];
  teams: { id: string; nombre: string; color: string; gap: number[] }[];
}

/** Lo que le falta a cada coche frente al mejor de esa ronda (s), de la primera ronda a la actual. */
export function perfSeries(s: SeasonState): PerfSeries {
  const cal = calendarOf(s).length;
  const last = Math.min(s.round, cal - 1);
  const rounds = Array.from({ length: last + 1 }, (_, r) => r);
  const byId = new Map<string, PerfSeries["teams"][number]>();
  for (const r of rounds) {
    const teams = gridOf(s, r).teams;
    const lv = teams.map((t) => ({ t, x: carLevel(t) }));
    const best = Math.max(...lv.map((v) => v.x));
    for (const { t, x } of lv) {
      let e = byId.get(t.id);
      if (!e) { e = { id: t.id, nombre: t.nombre, color: t.color, gap: [] }; byId.set(t.id, e); }
      e.nombre = t.nombre; e.color = t.color;
      e.gap[r] = best - x;
    }
  }
  return { rounds, teams: [...byId.values()] };
}

const fmt = (x: number, d = 2) => x.toFixed(d).replace(".", ",");
const delta = (x: number) => (Math.abs(x) < 0.005 ? `<span class="dim">=</span>` : `<span class="${x < 0 ? "green" : "redt"}">${x < 0 ? "▲" : "▼"}${fmt(Math.abs(x))}</span>`);

/** Panel «Rendimiento de los coches»: la gráfica ronda a ronda y la tabla con la ronda actual. */
export function perfPanel(s: SeasonState): string {
  const p = perfSeries(s);
  const r = p.rounds[p.rounds.length - 1];
  const rows = p.teams.slice().sort((a, b) => a.gap[r] - b.gap[r]);
  const chart = p.rounds.length > 1;
  const crest = (id: string) => (id === s.playerTeam && s.equipo ? teamCrest(s.equipo, 13) + " " : "");
  return `<div class="panel"><div class="hd"><span class="t">Rendimiento de los coches</span><span class="small">${s.round >= calendarOf(s).length ? "final" : `para la ronda ${r + 1}`}</span></div><div class="bd" style="padding:0">
    ${chart ? `<canvas class="champchart" id="perfchart"></canvas>` : ""}
    <table class="tv">
      <tr class="small dim"><td></td><td>Equipo</td><td style="text-align:right">al mejor</td>${chart ? `<td style="text-align:right">última</td><td style="text-align:right">año</td>` : ""}</tr>
      ${rows.map((t, i) => `<tr class="${t.id === s.playerTeam ? "me" : ""}"><td class="mono"><span class="pos">${i + 1}</span></td><td><span class="perfdot" style="background:${t.color}"></span>${crest(t.id)}${esc(t.nombre)}</td><td class="mono" style="text-align:right">${t.gap[r] < 0.005 ? "<b>—</b>" : `+${fmt(t.gap[r])} s`}</td>${chart ? `<td class="mono small" style="text-align:right">${delta(t.gap[r] - t.gap[r - 1])}</td><td class="mono small" style="text-align:right">${delta(t.gap[r] - t.gap[0])}</td>` : ""}</tr>`).join("")}
    </table>
    <div class="small dim" style="padding:6px 10px">Estimación de los ingenieros: lo que le falta a cada coche frente al más rápido en una vuelta de 1:30, sin contar los pilotos ni el circuito. «Última» y «año»: lo que ha ganado (▲) o perdido (▼) frente al mejor desde la ronda anterior y desde la primera.</div>
  </div></div>`;
}

/** La gráfica: hueco al mejor (s, abajo es más lento) en cada ronda; tu equipo con línea gruesa. */
export function drawPerfChart(cv: HTMLCanvasElement, s: SeasonState) {
  const p = perfSeries(s);
  const cal = calendarOf(s).length;
  const last = p.rounds[p.rounds.length - 1];
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 360, H = 220;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
  const g = cv.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = 34, R = 74, T = 12, B = 24;
  const max = Math.max(0.5, Math.ceil(Math.max(...p.teams.flatMap((t) => t.gap)) * 2) / 2);
  const X = (r: number) => L + ((W - L - R) * r) / Math.max(1, cal - 1);
  const Y = (x: number) => T + ((H - T - B) * x) / max;
  const FONT = (w: number, px: number) => `${w} ${px}px "Titillium Web", sans-serif`;
  const series = p.teams.slice().sort((a, b) => Number(a.id === s.playerTeam) - Number(b.id === s.playerTeam));
  const frame = (k: number) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1; g.fillStyle = "#8e95a0"; g.font = FONT(600, 10);
    const step = max > 3 ? 1 : 0.5;
    for (let x = 0; x <= max + 1e-9; x += step) { g.beginPath(); g.moveTo(L, Y(x) + 0.5); g.lineTo(W - R, Y(x) + 0.5); g.stroke(); g.textAlign = "right"; g.fillText(x ? `+${fmt(x, 1)}` : "0", L - 5, Y(x) + 3); }
    g.textAlign = "center";
    for (let r = 0; r < cal; r++) if (cal <= 12 || r % 2 === 0 || r === cal - 1) g.fillText(String(r + 1), X(r), H - 8);
    g.save();
    g.beginPath(); g.rect(0, 0, L + (X(last) - L) * k + 4, H); g.clip();
    for (const t of series) {
      const mine = t.id === s.playerTeam;
      g.strokeStyle = t.color; g.lineWidth = mine ? 3.2 : 1.6; g.globalAlpha = mine ? 1 : 0.8;
      g.beginPath();
      p.rounds.forEach((r, i) => (i ? g.lineTo(X(r), Y(t.gap[r])) : g.moveTo(X(r), Y(t.gap[r]))));
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    if (k >= 1) {
      // nombre al final de cada línea, sin pisarse
      const labels = series.map((t) => ({ t, y: Y(t.gap[last]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 11) labels[i].y = labels[i - 1].y + 11;
      g.textAlign = "left"; g.font = FONT(800, 10);
      for (const { t, y } of labels) {
        const mine = t.id === s.playerTeam;
        g.fillStyle = t.color; g.beginPath(); g.arc(X(last), Y(t.gap[last]), mine ? 3.5 : 2.5, 0, 7); g.fill();
        g.fillStyle = mine ? "#ffd84a" : "#e6e8ec";
        g.fillText(t.nombre.length > 11 ? t.nombre.slice(0, 10) + "…" : t.nombre, X(last) + 6, y + 3.5);
      }
    }
  };
  if (reducedMotion()) return frame(1);
  const t0 = performance.now();
  const tick = (now: number) => { if (!cv.isConnected) return; const k = Math.min(1, (now - t0) / 1100); frame(k); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
