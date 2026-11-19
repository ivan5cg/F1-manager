// Modo gran premio: eliges equipo (de los 11 de 2026), circuito, formato y tiempo, y disputas ese fin de semana
// entero (libres, clasificación, sprint si lo hay y carrera). Se guarda aparte (GP_SLOT), sin tocar las partidas.
import { BASE_TEAMS, CIRCUITS } from "./data";
import { $, esc, flagHtml, fmtDate, setBack } from "./common";
import { helmetSvg, circuitSvg } from "./visual";
import { resultsTable, mineHeadline, type Nav } from "./hubs";
import { podiumHtml } from "./podium";
import { raceSummaryHtml, drawRaceSummary, photosHtml } from "./summary";
import { newWeekend, type WeekendState } from "../sim/weekend";
import type { SeasonState, GpWeather } from "../sim/season";
import type { Scenario } from "../sim/weather";

const app = () => document.getElementById("app")!;
const short = (gp: string) => gp.replace("Gran Premio de ", "").replace(/^(los|la) /, "");

export const GP_WEATHER: Record<GpWeather, { name: string; what: string }> = {
  clima: { name: "Su clima", what: "Lo normal en ese circuito y esa fecha" },
  seco: { name: "Estable", what: "Los tres días con tiempo estable: casi seguro, en seco" },
  variable: { name: "Chubascos", what: "Chubascos los tres días: van y vienen, y pueden caer en cualquier sesión" },
  lluvia: { name: "Lluvia", what: "Cubierto y lloviendo casi todo el fin de semana" },
};

/** Lo que tienes que elegir para un gran premio (y lo que se recuerda para «Repetir»). */
export interface GpPick { team: string; circuit: string; sprint: boolean; tiempo: GpWeather }

/** Circuitos ordenados por su fecha del calendario. */
const circuitIds = () => Object.keys(CIRCUITS).sort((a, b) => String(CIRCUITS[a].fecha).localeCompare(String(CIRCUITS[b].fecha)));

/** ¿Se puede correr este circuito en el otro formato? (hace falta su horario del otro formato) */
const canSwitch = (id: string) => !!CIRCUITS[id].horarioOtro;

/** Temporada de un solo gran premio, lista para empezar. */
export function gpSeason(p: GpPick): SeasonState {
  const def = CIRCUITS[p.circuit];
  const sprint = canSwitch(p.circuit) ? p.sprint : def.formato === "sprint";
  const s: SeasonState = { v: 1, playerTeam: p.team, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [], calendar: [p.circuit], gp: { tiempo: p.tiempo } };
  if (sprint !== (def.formato === "sprint")) s.formatos = { [p.circuit]: sprint ? "sprint" : "normal" };
  return s;
}

/** El tiempo elegido sustituye al que había salido para cada día (las semillas de cada día se mantienen). */
export function applyGpWeather(st: WeekendState, tiempo: GpWeather) {
  const plan: Record<Exclude<GpWeather, "clima">, Scenario[]> = {
    seco: ["seco", "seco", "seco"],
    variable: ["chubascos", "chubascos", "chubascos"],
    lluvia: ["llovizna", "llovizna", "llovizna"],
  };
  if (tiempo === "clima") return;
  st.days.forEach((d, i) => (d.scenario = plan[tiempo][i]));
}

/** Fin de semana del gran premio (el único de su «temporada»). */
export function gpWeekend(s: SeasonState, def: any, teams: Parameters<typeof newWeekend>[2]): WeekendState {
  const st = newWeekend(1, def, teams, s.seed * 1000 + 1);
  applyGpWeather(st, s.gp?.tiempo ?? "clima");
  return st;
}

// ------------------------------------------------------------------ elegir
export function gpSetupScreen(nav: Nav, onStart: (p: GpPick) => void, prev?: Partial<GpPick>) {
  const ids = circuitIds();
  let team: string | null = prev?.team ?? null;
  let circuit: string | null = prev?.circuit ?? null;
  let sprint = circuit ? CIRCUITS[circuit].formato === "sprint" : false;
  if (prev?.sprint !== undefined && circuit && canSwitch(circuit)) sprint = prev.sprint;
  let tiempo: GpWeather = prev?.tiempo ?? "clima";
  const render = () => {
    const y = window.scrollY;
    const t = BASE_TEAMS.find((x) => x.id === team);
    const c = circuit ? CIRCUITS[circuit] : null;
    const isSprint = c ? (canSwitch(circuit!) ? sprint : c.formato === "sprint") : false;
    app().innerHTML = `<div style="padding-bottom:8px">
      <div class="panel"><div class="hd"><span class="t">Gran premio</span><button id="back">Volver</button></div><div class="bd small">
        Un fin de semana suelto: eliges equipo, circuito y tiempo, y lo disputas entero, de los libres a la carrera. No toca tus partidas.
      </div></div>
      <div class="panel"><div class="hd"><span class="t">1 · Equipo</span>${t ? `<span class="small">${esc(t.nombre)}</span>` : ""}</div><div class="bd" style="padding:0">
        ${BASE_TEAMS.map((x) => `<div class="list-item" data-team="${x.id}" style="cursor:pointer;${team === x.id ? "background:rgba(225,6,0,.22)" : ""}">
          <span class="teamdot" style="background:${x.color};height:34px;width:6px"></span>
          <span class="hpair">${x.pilotos.map((p) => helmetSvg(x.color, p.numero, p.abrev, 26)).join("")}</span>
          <div class="grow"><b class="up">${esc(x.nombre)}</b><br><span class="small dim">${x.pilotos.map((p) => esc(p.nombre)).join(" · ")}</span></div>
          <span class="small" style="width:14px">${team === x.id ? "✔" : ""}</span></div>`).join("")}
      </div></div>
      <div class="panel"><div class="hd"><span class="t">2 · Circuito</span>${c ? `<span class="small">${flagHtml(c.bandera)} ${esc(short(c.gp))}</span>` : ""}</div><div class="bd">
        <div class="gpgrid">${ids.map((id) => {
          const d = CIRCUITS[id];
          return `<button class="calcard${circuit === id ? " next" : ""}" data-circ="${id}">
            <div class="cc-top">${flagHtml(d.bandera)}${d.formato === "sprint" ? '<span class="cc-spr">Sprint</span>' : ""}</div>
            <div class="cc-sil">${circuitSvg(d, 104, 60, circuit === id ? "#ffffff" : "#c9ccd2", 2.2)}</div>
            <b class="cc-gp">${esc(short(d.gp).replace(/ \(.*\)$/, ""))}</b>
            <span class="cc-date">${esc(d.nombre)}</span>
          </button>`;
        }).join("")}</div>
      </div></div>
      <div class="panel"><div class="hd"><span class="t">3 · Fin de semana</span></div><div class="bd">
        <div class="small dim">Formato</div>
        ${c && canSwitch(circuit!)
          ? `<div class="seg">${[false, true].map((v) => `<button data-fmt="${v ? 1 : 0}" class="${isSprint === v ? "on" : ""}">${v ? "Sprint" : "Normal"}</button>`).join("")}</div>`
          : `<div class="small" style="margin:3px 0 8px">${c ? (isSprint ? "Sprint: libres 1, clasificación sprint, sprint, clasificación y carrera." : "Normal: tres libres, clasificación y carrera.") : "Elige un circuito."}</div>`}
        <div class="small dim">Tiempo</div>
        <div class="seg">${(Object.keys(GP_WEATHER) as GpWeather[]).map((k) => `<button data-wx="${k}" class="${tiempo === k ? "on" : ""}">${GP_WEATHER[k].name}</button>`).join("")}</div>
        <div class="small dim">${esc(GP_WEATHER[tiempo].what)}${tiempo === "clima" && c ? ` (${esc(c.nombre)}, ${fmtDate(c.fecha)})` : ""}.</div>
      </div></div>
      <div class="sticky-cta"><button class="red big-cta" id="go" ${t && c ? "" : "disabled"}>${t && c ? `${flagHtml(c.bandera)} ${esc(short(c.gp))} con ${esc(t.nombre)}` : !t ? "Elige un equipo" : "Elige un circuito"}</button></div>
    </div>`;
    window.scrollTo(0, y);
    document.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => (el.onclick = () => { team = el.dataset.team!; render(); }));
    document.querySelectorAll<HTMLElement>("[data-circ]").forEach((el) => (el.onclick = () => { circuit = el.dataset.circ!; sprint = CIRCUITS[circuit].formato === "sprint"; render(); }));
    document.querySelectorAll<HTMLElement>("[data-fmt]").forEach((el) => (el.onclick = () => { sprint = el.dataset.fmt === "1"; render(); }));
    document.querySelectorAll<HTMLElement>("[data-wx]").forEach((el) => (el.onclick = () => { tiempo = el.dataset.wx as GpWeather; render(); }));
    $("#back").onclick = () => nav.home();
    $("#go").onclick = () => { if (team && circuit) onStart({ team, circuit, sprint: isSprint, tiempo }); };
  };
  setBack(() => nav.home());
  window.scrollTo(0, 0);
  render();
}

/** Lo elegido en un gran premio ya empezado (para «Repetir» u «Otro gran premio»). */
export function gpPickOf(s: SeasonState): GpPick {
  const id = s.calendar![0];
  const f = s.formatos?.[id] ?? CIRCUITS[id].formato;
  return { team: s.playerTeam, circuit: id, sprint: f === "sprint", tiempo: s.gp?.tiempo ?? "clima" };
}

// ------------------------------------------------------------------ terminado
export function gpDoneScreen(nav: Nav, s: SeasonState, again: () => void, other: () => void) {
  const r = s.rounds[0];
  const c = CIRCUITS[r.circuitId];
  const team = BASE_TEAMS.find((t) => t.id === s.playerTeam)!;
  const rows = r.race ?? [];
  app().innerHTML = `<div style="padding-bottom:8px">
    <div class="panel"><div class="hd"><span class="t">${flagHtml(c.bandera)} ${esc(c.gp)} · ${esc(team.nombre)}</span><button id="home">Inicio</button></div><div class="bd small dim">
      Fin de semana terminado · ${esc(GP_WEATHER[s.gp?.tiempo ?? "clima"].name.toLowerCase())}${r.sprint ? " · con sprint" : ""}.
    </div></div>
    ${rows.length ? podiumHtml(rows, `Podio · ${short(c.gp)}`, s.playerTeam) : ""}
    ${rows.length ? mineHeadline("RACE", rows, s.playerTeam, r.raceTable) : ""}
    ${rows.length ? `<div class="panel"><div class="hd"><span class="t">🏁 Carrera</span></div><div class="bd" style="padding:0">${resultsTable("RACE", rows, s.playerTeam, r.raceTable)}</div></div>` : ""}
    ${r.summary ? `<div class="sumwrap" id="gpsum">${r.summary.photos?.length ? photosHtml(r.summary.photos) : ""}${raceSummaryHtml(r.summary)}</div>` : ""}
    ${r.sprint ? `<details class="fold panel"><summary>Sprint</summary>${resultsTable("SPRINT", r.sprint, s.playerTeam, r.sprintTable)}</details>` : ""}
    ${r.q ? `<details class="fold panel"><summary>Clasificación</summary>${resultsTable("Q", r.q, s.playerTeam)}</details>` : ""}
    <div class="sticky-cta row"><button id="other">Otro gran premio</button><button class="red big-cta grow" id="again">Repetir</button></div>
  </div>`;
  if (r.summary) requestAnimationFrame(() => drawRaceSummary(r.summary!, document.getElementById("gpsum") ?? undefined));
  $("#home").onclick = () => nav.home();
  $("#again").onclick = again;
  $("#other").onclick = other;
  setBack(() => nav.home());
  window.scrollTo(0, 0);
}

/** Por dónde va un gran premio guardado (para la pantalla de inicio). */
export function gpWhere(s: SeasonState, midSession: boolean): string {
  const id = s.calendar![0], c = CIRCUITS[id];
  const team = BASE_TEAMS.find((t) => t.id === s.playerTeam);
  const st = s.weekend;
  const state = s.rounds.length ? "terminado" : st && st.next > 0 ? `${st.next} ${st.next === 1 ? "sesión hecha" : "sesiones hechas"}` : "sin empezar";
  return `${flagHtml(c.bandera)} ${esc(short(c.gp))} · ${esc(team?.nombre ?? s.playerTeam)} · ${state}${midSession ? ` · <span class="yellow">sesión a medias</span>` : ""}`;
}
