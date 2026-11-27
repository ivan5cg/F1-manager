// Túnel de viento y CFD (pantalla de temporada) y el paquete aerodinámico del fin de semana (programa de libres y
// decisión de montarlo antes de la primera clasificación). El modelo está en src/sim/development.ts.
import {
  AERO_BANDS, TEST_PROGRAMS, TestProgram, AeroPkg, aeroPeriodLen, aeroPeriodOf, aeroPkgRound, aeroExpect, splitAt, measurePkg, atrMult, atrMidRound,
} from "../sim/development";
import type { SeasonState } from "../sim/season";
import type { Weekend } from "../sim/weekend";
import { CIRCUITS, calendarOf, devContext, myAtr, useSeason } from "./data";
import { esc } from "./common";
import { saveSeason } from "./store";

/** Agarre en un circuito medio → s por vuelta (vuelta de 1:30; ver rendimiento.ts). */
const GRIP_S = 0.98;
const fmtS = (x: number) => `${x >= 0 ? "−" : "+"}${Math.abs(x * GRIP_S).toFixed(2).replace(".", ",")} s`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const gpName = (s: SeasonState, r: number) => {
  const cal = calendarOf(s);
  return r < cal.length ? CIRCUITS[cal[r]].gp.replace("Gran Premio de ", "GP de ").replace(/ \(.*\)$/, "") : "después de la última carrera";
};
const seedOf = (s: SeasonState) => (s.equipo ? (s.trueSeed ?? s.seed) : s.seed);

/** El paquete que se estrena en el fin de semana en curso (si lo hay). */
export function weekendPkg(s: SeasonState): AeroPkg | undefined {
  const st = s.weekend;
  if (!st || !s.dev?.aero) return undefined;
  return s.dev.aero.pkgs.find((p) => p.ready === st.round - 1);
}

/** Índice de la primera clasificación del fin de semana (desde ahí, parque cerrado). */
const firstQuali = (wk: Weekend) => wk.sessions().findIndex((k) => k === "Q" || k === "SQ");

/**
 * Tras los libres: mide el paquete con las vueltas que se le han dedicado y, si nadie ha decidido, el equipo lo monta
 * cuando lo medido es positivo. Devuelve true si ha cambiado algo (la parrilla ya está al día).
 */
export function settlePkg(s: SeasonState, wk: Weekend): boolean {
  const p = weekendPkg(s);
  if (!p || p.medido !== undefined || wk.st.next < firstQuali(wk)) return false;
  p.programa ??= wk.st.pkgTest ?? "equilibrado";
  p.laps = wk.st.pkgLaps?.test ?? 0;
  p.otherLaps = wk.st.pkgLaps?.other ?? 0;
  measurePkg(p, seedOf(s));
  p.montar = p.medido! > 0;
  useSeason(s);
  return true;
}

/** Panel del fin de semana: el programa de libres para el paquete y, después, si se monta. */
export function pkgWeekendHtml(s: SeasonState, wk: Weekend, pending: boolean): string {
  const p = weekendPkg(s);
  if (!p) return "";
  const q = firstQuali(wk), st = wk.st;
  const split = AERO_BANDS.map((b, i) => (p.split[i] >= 0.05 ? `${b.short} ${pct(p.split[i])}` : "")).filter(Boolean).join(" · ");
  const head = `<div class="small" style="margin-bottom:6px">Llega el paquete aerodinámico del periodo ${p.period + 1} (${split}). Tus ingenieros esperan <b>${fmtS(p.expect)}/vuelta</b> en un circuito medio, pero lo que da de verdad solo se sabe probándolo.</div>`;
  let body: string;
  if (p.medido === undefined) {
    const prog = st.pkgTest ?? "equilibrado";
    const can = st.next === 0 && !pending;
    body = `<div class="seg" style="margin-bottom:6px">${(Object.keys(TEST_PROGRAMS) as TestProgram[]).map((k) => `<button data-pkgprog="${k}" class="${prog === k ? "on" : ""}"${can ? "" : " disabled"}>${TEST_PROGRAMS[k].name}</button>`).join("")}</div>
      <div class="small dim">${TEST_PROGRAMS[prog].what} ${can ? "Se elige antes de los libres 1; al simularlos, el equipo lo cumple." : `Programa: ${TEST_PROGRAMS[prog].name.toLowerCase()}. ${st.pkgLaps ? `Llevan ${st.pkgLaps.test} vueltas de prueba de piezas.` : ""} Antes de la clasificación decides si se monta.`}</div>`;
  } else {
    const can = st.next <= q && !wk.setupLocked() && !pending;
    const lo = p.medido - 1.6 * p.sigma!, hi = p.medido + 1.6 * p.sigma!;
    body = `<div class="small" style="margin-bottom:6px">Medido en libres (${p.laps} vueltas de prueba de piezas): <b>${fmtS(p.medido)}/vuelta</b>, entre ${fmtS(hi)} y ${fmtS(lo)}.${p.medido < 0 ? ` <span class="redt">Parece que va peor que la pieza vieja.</span>` : ""}</div>
      <div class="seg" style="margin-bottom:6px"><button data-pkgmount="1" class="${p.montar !== false ? "on" : ""}"${can ? "" : " disabled"}>Montarlo</button><button data-pkgmount="0" class="${p.montar === false ? "on" : ""}"${can ? "" : " disabled"}>Dejar la pieza vieja</button></div>
      <div class="small dim">${can ? "Se decide antes de la clasificación: desde ahí, parque cerrado. Si lo dejas, el paquete se descarta y las horas de túnel se pierden." : p.montar === false ? "Descartado: corres con la pieza vieja." : "Montado: va en el coche el resto del año."}</div>`;
  }
  return `<div class="panel"><div class="hd"><span class="t">Paquete aerodinámico nuevo</span></div><div class="bd">${head}${body}</div></div>`;
}

export function wirePkgWeekend(s: SeasonState, wk: Weekend, redraw: () => void) {
  const p = weekendPkg(s);
  if (!p) return;
  document.querySelectorAll<HTMLButtonElement>("[data-pkgprog]").forEach((b) => (b.onclick = () => {
    wk.st.pkgTest = b.dataset.pkgprog as TestProgram;
    p.programa = wk.st.pkgTest;
    redraw();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-pkgmount]").forEach((b) => (b.onclick = () => {
    p.montar = b.dataset.pkgmount === "1";
    useSeason(s);
    redraw();
  }));
}

/** Pantalla de temporada: horas de túnel, reparto del periodo y los paquetes del año. */
export function tunnelHtml(s: SeasonState, done: boolean): string {
  const a = s.dev?.aero;
  if (!a) return "";
  const cal = calendarOf(s).length, L = aeroPeriodLen(cal);
  const per = aeroPeriodOf(Math.min(s.round, cal - 1), cal);
  const atr = myAtr(s, per * L);
  const nextR = aeroPkgRound(per, cal);
  const split = splitAt(a, per);
  const ctx = devContext(s);
  const exp = aeroExpect(cal, atr, ctx.pubK);
  const midR = atrMidRound(cal);
  const can = !done && nextR !== null;
  const rows = AERO_BANDS.map((b, i) => `<div class="tunrow"><div><b>${b.name}</b> <span class="mono">${pct(split[i])}</span><br><span class="small dim">${b.what}</span></div>
    <div class="seg"><button data-tun="${i}" data-d="-1"${can && split[i] > 0.001 ? "" : " disabled"} aria-label="Menos horas a ${b.name}">−</button><button data-tun="${i}" data-d="1"${can && split[i] < 0.999 ? "" : " disabled"} aria-label="Más horas a ${b.name}">+</button></div></div>`).join("");
  const pkgs = a.pkgs.slice().sort((x, y) => y.period - x.period).map((p) => {
    // con carreras corridas con él, los datos de carrera dicen lo que da de verdad
    const raced = p.montar !== false && p.ready < s.round;
    const res = p.medido === undefined
      ? `<span class="dim">se prueba en el ${gpName(s, p.ready)}</span>`
      : p.montar === false ? `<span class="dim">descartado (medido ${fmtS(p.medido)})</span>`
      : raced ? `montado: en carrera da <b>${fmtS(p.real)}</b>/vuelta${p.real < p.expect * 0.7 ? ` <span class="redt">(ha salido malo)</span>` : p.real > p.expect * 1.15 ? ` <span class="green">(mejor de lo esperado)</span>` : ""}`
      : `montado: medido <b>${fmtS(p.medido)}</b>/vuelta`;
    return `<div class="devpart"><b>Paquete ${p.period + 1}</b> <span class="dim">· ATR ${p.atr} % · ${AERO_BANDS.map((b, i) => (p.split[i] >= 0.05 ? `${b.short} ${pct(p.split[i])}` : "")).filter(Boolean).join(", ")} · se esperaba ${fmtS(p.expect)}</span><br><span class="small">${res}</span></div>`;
  }).join("");
  return `<div class="devtun">
    <div class="small" style="margin-bottom:6px">Tu cuota ATR: <b>${atr} %</b> de las horas de túnel de viento y CFD (el primero del año anterior tiene el 70 %; el último, el 120 %)${midR !== null && s.round < midR ? `, que se revisa tras el ${gpName(s, midR - 1)}` : ""}. La aerodinámica no se compra: reparte las horas de este periodo (rondas ${per * L + 1}–${Math.min(cal, (per + 1) * L)}) y al acabar sale un paquete. Concentrar da más donde concentras.</div>
    ${nextR === null ? `<div class="small dim" style="margin-bottom:6px">Las horas de este último periodo ya van al coche del año que viene.</div>` : `<div class="small" style="margin-bottom:6px">Paquete del periodo ${per + 1}: llega al <b>${gpName(s, nextR)}</b>, unos <b>${fmtS(exp)}/vuelta</b> en un circuito medio (×${atrMult(atr).toFixed(2).replace(".", ",")} por tu ATR). Uno de cada ocho sale mal: en los libres se mide y decides si se monta.</div>`}
    ${nextR === null ? "" : rows}
    ${pkgs ? `<div class="devparts">${pkgs}</div>` : ""}
  </div>`;
}

export function wireTunnel(s: SeasonState, redraw: () => void) {
  const a = s.dev?.aero;
  if (!a) return;
  const cal = calendarOf(s).length;
  const per = aeroPeriodOf(Math.min(s.round, cal - 1), cal);
  document.querySelectorAll<HTMLButtonElement>("[data-tun]").forEach((b) => (b.onclick = () => {
    const i = Number(b.dataset.tun), d = Number(b.dataset.d) * 0.1;
    const w = [...splitAt(a, per)];
    const take = Math.max(-w[i], Math.min(d, 1 - w[i]));
    if (!take) return;
    w[i] += take;
    // lo que se quita o se pone sale de los demás en proporción a lo que tienen
    const others = w.map((x, k) => (k === i ? 0 : x));
    const sum = others.reduce((x, y) => x + y, 0);
    for (let k = 0; k < 4; k++) if (k !== i) w[k] = sum > 1e-9 ? Math.max(0, w[k] - (take * others[k]) / sum) : (1 - w[i]) / 3;
    const tot = w.reduce((x, y) => x + y, 0);
    a.reparto[per] = w.map((x) => Math.round((x / tot) * 1000) / 1000);
    saveSeason(s);
    redraw();
  }));
}
