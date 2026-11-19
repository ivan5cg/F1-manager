// El vestuario en pantalla: la moral de tus pilotos y las rivalidades (8.2 y 8.3) y la rueda de prensa antes de la
// carrera (9.1). Las cuentas están en src/sim/morale.ts; aquí, lo que se ve y las preguntas.
import type { SeasonState } from "../sim/season";
import { driverStandings } from "../sim/season";
import type { WeekendState } from "../sim/weekend";
import { MoraleChange, Rivalry, moralOf, moralLabel, moodForWeekend, applyPress, type PressEffect } from "../sim/morale";
import { DRIVERS } from "./data";
import { esc } from "./common";
import { syncMemo } from "./ritual";

const sur = (n: string) => n.split(" ").slice(1).join(" ") || n;
const myDrivers = (s: SeasonState) => DRIVERS.filter((d) => d.team.id === s.playerTeam);

/** Lleva la moral y las rivalidades de la temporada al fin de semana (para las sesiones). */
export function syncMood(s: SeasonState) {
  if (!s.weekend || s.gp) return;
  const m = moodForWeekend(s, DRIVERS.map((d) => ({ id: d.id, nombre: d.d.nombre, mine: d.team.id === s.playerTeam })));
  s.weekend.moral = m.moral;
  s.weekend.rivals = m.rivals;
  syncMemo(s); // y lo que recuerda Lobato
}

const bar = (m: number) => `<span class="moralbar"><i style="width:${Math.round(m)}%"></i></span>`;
const moralRow = (nombre: string, m: number, extra = "") => {
  const l = moralLabel(m);
  return `<div class="row" style="gap:8px;margin:3px 0"><b style="min-width:110px">${esc(nombre)}</b>${bar(m)}<span class="${l.cls}">${l.icon} ${l.text}</span><span class="grow small dim" style="text-align:right">${extra}</span></div>`;
};

/** Tras la carrera: cómo ha cambiado la moral de tus pilotos y las rivalidades que nacen. */
export function vestuarioHtml(ch: MoraleChange[], born: Rivalry[], s: SeasonState): string {
  if (!ch.length && !born.length) return "";
  const arrow = (c: MoraleChange) => { const d = Math.round(c.after - c.before); return d > 0 ? `<span class="green">▲${d}</span>` : d < 0 ? `<span class="redt">▼${-d}</span>` : "="; };
  const mineNames = new Set(myDrivers(s).map((d) => d.d.nombre));
  return `<div class="panel"><div class="hd"><span class="t">🧠 El vestuario</span></div><div class="bd small">
    ${ch.map((c) => moralRow(c.nombre, c.after, `${arrow(c)}${c.why.length ? ` · ${esc(c.why.join(", "))}` : ""}`)).join("")}
    ${born.map((r) => `<div style="margin-top:4px">⚔️ <b>Nace una rivalidad:</b> ${esc(r.a)} y ${esc(r.b)}${mineNames.has(r.a) || mineNames.has(r.b) ? " (uno es tuyo: defenderán con todo)" : ""}.</div>`).join("")}
    <div class="dim" style="margin-top:4px">Con la moral baja, los de carácter fuerte pueden no obedecer: no dejar pasar al compañero o retrasar una parada.</div>
  </div></div>`;
}

/** En la pantalla de temporada: la moral de tus pilotos y las rivalidades más vivas. */
export function moodPanel(s: SeasonState): string {
  if (s.gp) return "";
  const mine = myDrivers(s);
  const riv = (s.rivals ?? []).slice(0, 4);
  return `<div class="panel"><div class="hd"><span class="t">🧠 Vestuario</span></div><div class="bd small">
    ${mine.map((d) => moralRow(d.d.nombre, moralOf(s, d.d.nombre))).join("")}
    ${riv.length ? `<div style="margin-top:6px"><b>Rivalidades</b>: ${riv.map((r) => `${esc(sur(r.a))} – ${esc(sur(r.b))} ${"🔥".repeat(r.k >= 0.7 ? 3 : r.k >= 0.4 ? 2 : 1)}`).join(" · ")}</div>` : ""}
    <div class="dim" style="margin-top:4px">La moral sube con buenos resultados y órdenes a favor, y baja con órdenes en contra y malas carreras. Toca un poco el ritmo, si obedecen y si quieren renovar.</div>
  </div></div>`;
}

// ------------------------------------------------------------------ rueda de prensa
export interface Answer { text: string; e: PressEffect }
export interface Question { id: string; text: string; answers: Answer[] }

/** Las preguntas de este fin de semana (una o dos), según cómo va la temporada. */
export function questions(s: SeasonState, st: WeekendState): Question[] {
  const mine = myDrivers(s);
  if (mine.length < 2 || s.gp) return [];
  const ds = driverStandings(s, DRIVERS.length);
  const pts = (id: number) => ds.find((x) => x.id === id)?.points ?? 0;
  const [A, B] = mine.slice().sort((x, y) => pts(y.id) - pts(x.id)).map((d) => d.d.nombre);
  const out: Question[] = [];
  const ma = moralOf(s, A), mb = moralOf(s, B);
  const last2 = s.rounds.slice(-2);
  const dry = last2.length === 2 && last2.every((r) => !(r.race ?? []).slice(0, 10).some((row) => mine.some((d) => d.id === row.id)));
  const rival = (s.rivals ?? []).find((r) => r.k >= 0.3 && (r.a === A || r.b === A || r.a === B || r.b === B));
  if (dry) out.push({ id: "racha", text: "Dos carreras seguidas sin puntos. ¿Peligra tu puesto?", answers: [
    { text: "Confío en este equipo y en mis pilotos.", e: { moral: { [A]: 3, [B]: 3 } } },
    { text: "Con este coche no se puede hacer más.", e: { moral: { [A]: 5, [B]: 5 }, board: -2 } },
    { text: "Asumo la responsabilidad. Lo arreglaremos.", e: { moral: { [A]: 1, [B]: 1 }, board: 1 } },
  ] });
  if (s.rounds.length >= 2 && (Math.abs(ma - mb) > 12 || pts(mine.find((d) => d.d.nombre === A)!.id) - pts(mine.find((d) => d.d.nombre === B)!.id) >= 20)) out.push({ id: "favorito", text: `¿Hay favoritismo hacia ${sur(A)} en el equipo?`, answers: [
    { text: "Los dos tienen las mismas opciones.", e: { moral: { [A]: -1, [B]: 4 } } },
    { text: `${sur(A)} es nuestro primer piloto.`, e: { moral: { [A]: 6, [B]: -9 } } },
    { text: "Eso lo decide la pista, no yo.", e: { moral: { [A]: 2, [B]: -2 } } },
  ] });
  if (rival) {
    const me = rival.a === A || rival.a === B ? rival.a : rival.b, other = me === rival.a ? rival.b : rival.a;
    out.push({ id: "rival", text: `${sur(me)} y ${sur(other)} no se pueden ni ver. ¿Pedirás calma?`, answers: [
      { text: "Que sigan así: es bueno para el espectáculo.", e: { moral: { [me]: 3 }, rival: { a: me, b: other, k: 0.2 } } },
      { text: "Hablaré con él para que no arriesgue.", e: { moral: { [me]: -3 }, rival: { a: me, b: other, k: -0.25 }, board: 1 } },
    ] });
  }
  if (out.length < 2 && s.rounds.length >= 3 && mb < 50) out.push({ id: "segundo", text: `${sur(B)} no termina de arrancar. ¿Os preocupa?`, answers: [
    { text: "Tiene todo nuestro apoyo.", e: { moral: { [B]: 5 } } },
    { text: "Tiene que dar un paso adelante.", e: { moral: { [B]: -6, [A]: 2 }, board: 1 } },
  ] });
  if (!out.length) {
    const g = st.results.Q?.findIndex((r) => mine.some((d) => d.id === r.id));
    out.push({ id: "previa", text: g !== undefined && g >= 0 ? `Mañana salís desde la ${g + 1}.ª posición. ¿Qué esperáis?` : "¿Qué esperáis de la carrera?", answers: [
      { text: "Ganar. Siempre salimos a ganar.", e: { moral: { [A]: 2, [B]: 2 } } },
      { text: "Sumar todo lo que se pueda.", e: { board: 1 } },
      { text: "Ya veremos: la carrera es larga.", e: {} },
    ] });
  }
  return out.slice(0, 2);
}

const effectText = (e: PressEffect) => {
  const parts = Object.entries(e.moral ?? {}).filter(([, d]) => d).map(([n, d]) => `${sur(n)} ${d > 0 ? "+" : "−"}${Math.abs(d)}`);
  if (e.rival) parts.push(e.rival.k > 0 ? "más rivalidad" : "menos rivalidad");
  if (e.board) parts.push(e.board > 0 ? "a la directiva le gusta" : "a la directiva no le gusta");
  return parts.join(" · ") || "sin efecto";
};

/** Panel de la rueda de prensa: antes de la carrera, mientras quede alguna pregunta por contestar. */
export function prensaHtml(s: SeasonState, st: WeekendState): string {
  // las preguntas se fijan la primera vez (contestar cambia la moral, y con ella lo que se preguntaría)
  const qs = (st.prensaQs ??= questions(s, st));
  if (!qs.length) return "";
  const done = st.prensa ?? {};
  return `<div class="panel" id="prensa"><div class="hd"><span class="t">🎙️ Rueda de prensa</span></div><div class="bd small">
    ${qs.map((q) => `<div style="margin-bottom:8px"><div style="font-style:italic">«${esc(q.text)}»</div>${done[q.id] !== undefined
      ? `<div style="margin-top:3px">Tú: <b>«${esc(q.answers[done[q.id]].text)}»</b> <span class="dim">(${esc(effectText(q.answers[done[q.id]].e))})</span></div>`
      : `<div class="col" style="gap:4px;margin-top:4px">${q.answers.map((a, i) => `<button data-press="${q.id}:${i}" style="text-align:left">${esc(a.text)}</button>`).join("")}</div>`}</div>`).join("")}
    <div class="dim">Lo que digas toca la moral de tus pilotos y lo que piensa la directiva.</div>
  </div></div>`;
}

/** Contestar: se guarda en el fin de semana, se aplica a la temporada y se pasa a las sesiones. */
export function wirePrensa(s: SeasonState, st: WeekendState, onDone: () => void) {
  document.querySelectorAll<HTMLButtonElement>("[data-press]").forEach((b) => (b.onclick = () => {
    const [id, i] = b.dataset.press!.split(":");
    const q = (st.prensaQs ?? []).find((x) => x.id === id);
    if (!q || (st.prensa ?? {})[id] !== undefined) return;
    (st.prensa ??= {})[id] = Number(i);
    applyPress(s, q.answers[Number(i)].e);
    syncMood(s);
    onDone();
  }));
}
