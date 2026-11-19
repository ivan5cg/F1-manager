// El ritual de la temporada en pantalla (9.4 a 9.6): hitos tras la carrera, previa de cada gran premio, gala de fin de
// año y sala de trofeos. Las cuentas están en src/sim/hitos.ts.
import type { SeasonState } from "../sim/season";
import { driverStandings } from "../sim/season";
import type { WeekendState } from "../sim/weekend";
import { SeatAt, Hito, Award, allTrofeos, gala, lobatoMemo } from "../sim/hitos";
import { fmt } from "../sim/session";
import { CIRCUITS, DRIVERS, whoAt, who, calendarOf } from "./data";
import { esc, flagHtml } from "./common";

export const gpOf = (id: string): string => CIRCUITS[id]?.gp ?? id;
const short = (gp: string) => gp.replace(/^Gran Premio (de |del |de la |de los )?/i, "");

/** Quién iba en cada asiento en cada ronda de la temporada (con los cambios a mitad de año). */
export function seatAt(s: SeasonState): SeatAt {
  return (ri, seat) => { const w = whoAt(s, ri, seat); return { nombre: w.d.nombre, equipo: w.team.nombre, mine: w.team.id === s.playerTeam, debut: w.d.debut }; };
}

/** Lo que recuerda Lobato, al día para el fin de semana. */
export function syncMemo(s: SeasonState) {
  if (s.weekend && !s.gp) s.weekend.memo = lobatoMemo(s, seatAt(s), gpOf);
}

/** Los hitos de una carrera, como rótulo de tele. */
export function hitosHtml(hs: Hito[]): string {
  if (!hs.length) return "";
  return `<div class="hitos">${hs.map((h) => `<div class="hito"><span class="hi">${h.icon}</span><span>${esc(h.text)}</span></div>`).join("")}</div>`;
}

// ------------------------------------------------------------------ previa
// La clave de algunos circuitos, como la diría la tele; el resto sale de sus datos.
const KEYS: Record<string, string> = {
  monaco: "La clasificación lo es todo: aquí casi no se adelanta. Una parada, y rezar por un coche de seguridad.",
  monza: "El templo de la velocidad: poca carga, rebufo y frenadas al límite. Aquí se adelanta.",
  spa: "Eau Rouge, la recta de Kemmel y un tiempo que cambia de un sector a otro.",
  silverstone: "Curvas rápidas que castigan las gomas delanteras. Y en Inglaterra siempre puede llover.",
  singapur: "De noche, con calor y muros: carrera larga, coche de seguridad casi seguro.",
  suzuka: "El ocho perfecto: las eses del primer sector deciden quién tiene coche.",
  interlagos: "Corta, en subida y con lluvias de repente: aquí pasa de todo.",
  baku: "La recta más larga del año y una curva del castillo donde no cabe un error.",
  lasvegas: "Noche y frío: calentar las gomas es la mitad del trabajo.",
};

/** La clave estratégica del circuito, de sus datos: adelantar, desgaste, paradas, muros y formato. */
function keyOf(def: any): string[] {
  const out: string[] = [];
  const u = def.adelantamientos?.umbral ?? 1;
  if (u >= 1.8) out.push("Adelantar es casi imposible: la posición de salida pesa muchísimo.");
  else if (u <= 0.9) out.push("Se adelanta bien: una buena estrategia puede remontar.");
  if ((def.abrasividad ?? 1) >= 1.25) out.push("Asfalto abrasivo: las gomas sufren y se para más.");
  else if ((def.abrasividad ?? 1) <= 0.8) out.push("Desgasta poco: a una parada.");
  const loss = def.boxes?.perdida;
  if (loss >= 24) out.push(`Parar cuesta mucho (unos ${Math.round(loss)} s): cada parada pesa.`);
  else if (loss && loss <= 18) out.push(`Parar sale barato (unos ${Math.round(loss)} s): ojo al undercut.`);
  if (def.entorno) out.push("Urbano, con los muros cerca: coche de seguridad probable.");
  if (def.formato === "sprint") out.push("Fin de semana sprint: una sola sesión de libres antes de que cuente.");
  return out;
}

/** La previa del gran premio, como el arranque de una retransmisión: bandera, claves, previsión e historia. */
export function previaHtml(s: SeasonState, st: WeekendState, rain: number | undefined): string {
  const def = CIRCUITS[st.circuitId];
  if (!def) return "";
  const n = calendarOf(s).length;
  const keys = [KEYS[st.circuitId], ...keyOf({ ...def, formato: st.sprint ? "sprint" : def.formato })].filter(Boolean).slice(0, 3);
  const past = (s.history ?? []).map((h) => ({ y: h.year, w: h.ganadores?.[st.circuitId] })).filter((x) => x.w).slice(-3).reverse();
  const at = seatAt(s);
  const mine = allTrofeos(s, at, gpOf).filter((t) => t.circuitId === st.circuitId).sort((a, b) => a.pos - b.pos)[0];
  const rec = s.records?.[st.circuitId];
  return `<div class="panel previa"><div class="hd"><span class="t">📺 La previa</span><span class="small">${s.gp ? "Gran premio" : `Ronda ${st.round} de ${n}`}</span></div><div class="bd">
    <div class="row" style="gap:10px;align-items:center"><span class="pflag">${flagHtml(def.bandera)}</span><div><b>${esc(def.gp)}</b><div class="small dim">${esc(def.nombre)} · ${def.vueltas} vueltas</div></div></div>
    <div class="small" style="margin-top:6px"><b>La clave:</b> ${keys.map(esc).join(" ")}</div>
    ${rain !== undefined ? `<div class="small" style="margin-top:4px"><b>El tiempo para la carrera:</b> ${rain >= 0.6 ? "lluvia casi segura" : rain >= 0.35 ? "puede llover" : rain >= 0.15 ? "alguna nube, poca lluvia" : "seco"} (${Math.round(rain * 100)} %).</div>` : ""}
    <div class="small" style="margin-top:4px"><b>La historia:</b> ${[
      past.length ? past.map((p) => `en ${p.y} ganó ${esc(p.w!.nombre)} (${esc(p.w!.equipo)})`).join("; ") : "",
      mine ? `tu mejor resultado aquí: ${mine.pos === 1 ? "victoria" : `${mine.pos}.º`} de ${esc(mine.nombre)} en ${mine.year}` : "",
      rec ? `récord de la partida: ${fmt(rec.t)} de ${esc(rec.nombre)} (${rec.year})` : def.poleFuente ? `pole real de 2026: ${esc(String(def.poleFuente).split(",")[0])}` : "",
    ].filter(Boolean).join(" · ") || "primera vez aquí en esta partida."}</div>
  </div></div>`;
}

// ------------------------------------------------------------------ gala y sala de trofeos
/** Las tres primeras del mundial y algo más, para la gala. */
function standingsFor(s: SeasonState) {
  return driverStandings(s, DRIVERS.length).map((x) => { const w = who(s, x.id); return { nombre: w.d.nombre, equipo: w.team.nombre, points: x.points, mine: x.id < 1000 && w.team.id === s.playerTeam, debut: w.d.debut }; });
}
export const galaOf = (s: SeasonState): Award[] => gala(s, seatAt(s), gpOf, standingsFor(s));

export function galaHtml(aw: Award[], year: number): string {
  if (!aw.length) return "";
  return `<div class="panel gala"><div class="hd"><span class="t">🎬 Gala de fin de temporada ${year}</span></div><div class="bd">
    <div class="galagrid">${aw.map((a) => `<div class="award"><span class="ai">${a.icon}</span><div><div class="small dim up">${esc(a.title)}</div><b>${esc(a.who)}</b><div class="small">${esc(a.detail)}</div></div></div>`).join("")}</div>
  </div></div>`;
}

/** Sala de trofeos: una copa por cada podio de tu equipo, por temporada, y los últimos hitos. */
export function trophyRoomHtml(s: SeasonState): string {
  if (s.gp) return "";
  const tr = allTrofeos(s, seatAt(s), gpOf);
  const hs = (s.hitos ?? []).slice(-6).reverse();
  if (!tr.length && !hs.length) return "";
  const years = [...new Set(tr.map((t) => t.year))].sort((a, b) => b - a);
  const cup = (p: number) => (p === 1 ? "🏆" : p === 2 ? "🥈" : "🥉");
  const wins = tr.filter((t) => t.pos === 1).length;
  return `<details class="panel fold trophies"><summary>🏆 Sala de trofeos · ${wins} ${wins === 1 ? "victoria" : "victorias"}, ${tr.length} ${tr.length === 1 ? "podio" : "podios"}</summary><div class="bd">
    ${years.map((y) => `<div class="small dim" style="margin-top:4px">${y}</div><div class="cups">${tr.filter((t) => t.year === y).sort((a, b) => a.round - b.round).map((t) => `<span class="cup" title="${esc(`${short(t.gp)}: ${t.nombre}, ${t.pos}.º`)}">${cup(t.pos)}<small>${esc(short(t.gp))}</small></span>`).join("")}</div>`).join("")}
    ${hs.length ? `<div class="small" style="margin-top:8px"><b>Últimos hitos</b>${hs.map((h) => `<div>${h.icon} ${esc(h.text)} <span class="dim">· ${esc(short(h.gp))} ${h.year}</span></div>`).join("")}</div>` : ""}
    ${(s.history ?? []).some((h) => h.gala?.length) ? `<div class="small" style="margin-top:8px"><b>Galas anteriores</b>${(s.history ?? []).filter((h) => h.gala?.length).reverse().map((h) => `<div>${h.year}: ${h.gala!.slice(0, 3).map((a) => `${a.icon} ${esc(a.who)}`).join(" · ")}</div>`).join("")}</div>` : ""}
  </div></details>`;
}
