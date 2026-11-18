// Pantallas del modo escenario: la lista, la previa (lo que tienes delante, las reglas de la época y los objetivos),
// la carrera (la pantalla de sesión de siempre) y el resultado con sus estrellas. Nada de esto toca las partidas:
// mientras se juega, la parrilla de aquel año sustituye a la de la partida activa y al salir se devuelve.
import { CIRCUITS, getTrack, useGrid } from "./data";
import { $, esc, flagHtml, tyreHtml, setBack } from "./common";
import { helmetSvg } from "./visual";
import { sessionView } from "./sessionView";
import { podiumHtml, animateCounts } from "./podium";
import { resultsTable, mineHeadline } from "./hubs";
import { raceSummaryHtml, drawRaceSummary, buildSummary, photosHtml } from "./summary";
import { takeLastPhotos } from "./photos";
import { loadPrefs, savePrefs } from "./store";
import { ESCENARIOS, PILOTOS } from "../sim/escenarios";
import { buildScenario, evaluate, standingsAfter, type EscenarioDef, type ObjetivoEsc, type BuiltScenario } from "../sim/scenario";
import { eraOf, type Session } from "../sim/session";

const app = () => document.getElementById("app")!;
const STAR = "★";

/** Estrellas (0 a 3): la primera es superar el escenario; sin ella, las otras no cuentan. */
const starsOf = (ok: boolean[]) => (ok[0] ? ok.filter(Boolean).length : 0);
const starsHtml = (n: number, big = false) => `<span class="stars${big ? " big" : ""}" aria-label="${n} de 3 estrellas">${[0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}">${STAR}</i>`).join("")}</span>`;
const best = (id: string) => loadPrefs().escenarios?.[id] ?? 0;
const teamOf = (def: EscenarioDef) => def.equipos.find((t) => t.id === def.equipo)!;
const short = (gp: string) => gp.replace("Gran Premio de ", "").replace("los ", "");

/** Lo que cambia el reglamento de la época, en etiquetas. */
function eraChips(year: number): string {
  const e = eraOf(year);
  const chips = [
    e.ayuda === "drs" ? "DRS" : e.ayuda === "mo" ? "Modo adelantamiento" : "Sin DRS",
    e.ers <= 0 ? "Sin KERS ni batería" : e.ers < 0.3 ? "KERS" : "Híbridos con batería",
    e.vsc ? "Coche de seguridad virtual" : "Sin coche de seguridad virtual",
    "Sin repostaje",
  ];
  return `<div class="erachips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`;
}

export interface ScenarioNav {
  /** Volver al inicio (devuelve la parrilla de la partida). */
  home(): void;
}

// ------------------------------------------------------------------ lista
export function scenariosScreen(nav: ScenarioNav) {
  const done = ESCENARIOS.reduce((a, d) => a + best(d.id), 0);
  app().innerHTML = `<div style="padding-bottom:16px">
    <div class="scenhead"><span class="kick">Modo escenario</span><h1>Escenarios</h1>
      <div>Diez momentos reales de 2010 a 2024, con la parrilla y el reglamento de aquel año. La carrera empieza donde se decidió y desde ahí la historia puede cambiar.</div>
      <div class="small" style="margin-top:6px">${starsHtml(Math.min(3, Math.round(done / ESCENARIOS.length)))} <span class="mono">${done}/${ESCENARIOS.length * 3}</span> estrellas</div></div>
    <div class="scenlist">${ESCENARIOS.map((d) => {
      const t = teamOf(d), c = CIRCUITS[d.circuito];
      return `<button class="scencard" data-id="${d.id}" style="--tc:${t.color}">
        <span class="sc-top">${flagHtml(c.bandera)} <b class="mono">${d.year}</b> · ${esc(short(d.gp))}</span>
        <span class="sc-title">${esc(d.titulo)}</span>
        <span class="sc-foot"><span class="sc-team">${esc(t.nombre)}</span>${starsHtml(best(d.id))}</span>
      </button>`;
    }).join("")}</div>
    <div style="padding:0 10px"><button id="sback" style="width:100%">Volver al inicio</button></div>
  </div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((b) => (b.onclick = () => briefing(nav, ESCENARIOS.find((d) => d.id === b.dataset.id)!)));
  $("#sback").onclick = () => nav.home();
  setBack(() => nav.home());
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ previa
function briefing(nav: ScenarioNav, def: EscenarioDef) {
  const t = teamOf(def), c = CIRCUITS[def.circuito];
  const mine = def.coches.map((x, i) => ({ x, i })).filter(({ x }) => t.pilotos.some(([k]) => k === x.k));
  const run = def.coches.filter((x) => !x.fuera);
  const b = best(def.id);
  const objHtml = (o: ObjetivoEsc, i: number) => `<div class="objrow${i < b ? " got" : ""}"><span class="stars"><i class="${i < b ? "on" : ""}">${STAR}</i></span><span class="grow">${esc(o.txt)}${i === 0 ? ` <span class="dim small">· para superarlo</span>` : ""}</span></div>`;
  app().innerHTML = `<div style="padding-bottom:8px">
    <div class="scenhead" style="--tc:${t.color}"><span class="kick">${flagHtml(c.bandera)} ${def.year} · ${esc(def.gp)}</span><h1>${esc(def.titulo)}</h1>
      <div>${esc(c.nombre)} · vuelta ${def.vuelta} de ${def.vueltas} · ${def.hora}</div></div>
    <div class="panel"><div class="hd"><span class="t">La situación</span></div><div class="bd">
      <div style="line-height:1.45">${esc(def.situacion)}</div>
      ${eraChips(def.year)}
    </div></div>
    <div class="panel"><div class="hd"><span class="t">Tu equipo · ${esc(t.nombre)}</span></div><div class="bd">
      ${mine.map(({ x }) => {
        const p = PILOTOS[x.k], num = t.pilotos.find(([k]) => k === x.k)![1];
        const where = x.fuera ? `<span class="redt">fuera: ${esc(x.fuera)}</span>` : `P${run.indexOf(x) + 1}${x.doblado ? ` · a ${x.doblado} v` : x.gap ? ` · +${x.gap.toFixed(1)} s` : ""} · ${tyreHtml(x.c ?? "M")} <span class="dim">${x.edad ?? 0} v</span>${x.fondo ? ` · <span class="yellow">fondo dañado</span>` : ""}`;
        return `<div class="row" style="margin:4px 0">${helmetSvg(t.color, num, p.abrev, 26)}<b class="grow">${esc(p.nombre)}</b><span class="small">${where}</span></div>`;
      }).join("")}
    </div></div>
    <div class="panel"><div class="hd"><span class="t">Objetivos</span></div><div class="bd">${def.objetivos.map(objHtml).join("")}</div></div>
    <details class="fold panel"><summary>Orden de carrera al empezar · ${run.length} coches</summary>
      <table class="tv">${run.map((x, i) => {
        const team = def.equipos.find((e) => e.pilotos.some(([k]) => k === x.k))!;
        return `<tr class="${team.id === def.equipo ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${team.color}"></span>${esc(PILOTOS[x.k].nombre)}</td><td class="mono small">${i === 0 ? "" : x.doblado ? `${x.doblado} v` : x.gap ? `+${x.gap.toFixed(1)}` : ""}</td><td>${tyreHtml(x.c ?? "M")} <span class="dim small">${x.edad ?? 0}</span></td></tr>`;
      }).join("")}</table>
    </details>
    <details class="fold panel"><summary>Lo que pasó de verdad <span class="dim">(cuenta el final)</span></summary><div class="small" style="line-height:1.45;padding:6px 2px">${esc(def.historia)}</div></details>
    ${def.nota ? `<div class="small dim" style="padding:0 12px 6px">${esc(def.nota)}</div>` : ""}
    <div class="sticky-cta row"><button id="bback">Volver</button><button class="red big-cta grow" id="bgo">Empezar</button></div>
  </div>`;
  $("#bback").onclick = () => scenariosScreen(nav);
  $("#bgo").onclick = () => play(nav, def);
  setBack(() => scenariosScreen(nav));
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ carrera
function play(nav: ScenarioNav, def: EscenarioDef) {
  const built = buildScenario(def, PILOTOS, CIRCUITS[def.circuito], getTrack(def.circuito), Math.floor(Math.random() * 1e9));
  useGrid(built.teams);
  takeLastPhotos(); // las fotos de antes no son de esta carrera
  const intro = `${def.titulo} · ${def.objetivos[0].txt}. Pulsa ▶ para seguir.`;
  sessionView(built.wk, "RACE", (sess) => results(nav, def, built, sess), undefined, () => briefing(nav, def), {
    session: built.sess, intro, exitLabel: "Salir del escenario", exitHint: "Vuelves a la previa: el escenario no se guarda",
  });
}

// ------------------------------------------------------------------ resultado
function results(nav: ScenarioNav, def: EscenarioDef, built: BuiltScenario, sess: Session) {
  const rows = sess.results();
  const ok = evaluate(def, rows, built.idOf);
  const n = starsOf(ok);
  const prev = best(def.id);
  if (n > prev) { const p = loadPrefs(); p.escenarios = { ...p.escenarios, [def.id]: n }; savePrefs(p); }
  const sum = buildSummary(sess);
  const pics = takeLastPhotos().slice(0, 10);
  const champ = def.objetivos.flatMap((o) => (o.tipo === "campeon" ? [o] : o.tipo === "todos" ? o.de.filter((x) => x.tipo === "campeon") : []))[0];
  const nameOf = (k: string) => PILOTOS[k].nombre;
  let champHtml = "";
  if (champ && champ.tipo === "campeon") {
    const st = standingsAfter(champ.puntos, rows, built.idOf);
    champHtml = `<div class="panel"><div class="hd"><span class="t">Mundial de pilotos</span></div><div class="bd standings">${st.map((x, i) => `<div class="row srow${x.k === champ.k ? " yellow" : ""}"><span class="pos">${i + 1}</span><span class="grow">${esc(nameOf(x.k))}${i === 0 ? " 🏆" : ""}</span>${x.after > x.before ? `<span class="gain small">+${x.after - x.before}</span>` : ""}<b class="mono">${x.after}</b></div>`).join("")}
      ${st.length > 1 && st[0].after === st[1].after ? `<div class="small dim" style="margin-top:4px">Empate a puntos: decide el número de victorias.</div>` : ""}</div></div>`;
  }
  app().innerHTML = `<div style="padding-bottom:8px">
    <div class="scenres${n ? " won" : ""}"><span class="kick">${esc(def.year + " · " + short(def.gp))}</span><h1>${n ? "Escenario superado" : "No lo has conseguido"}</h1>${starsHtml(n, true)}
      ${n > prev && prev > 0 ? `<div class="small">¡Mejoras tu marca (${prev} ${prev === 1 ? "estrella" : "estrellas"})!</div>` : ""}</div>
    <div class="panel"><div class="hd"><span class="t">Objetivos</span></div><div class="bd">${def.objetivos.map((o, i) => `<div class="objrow${ok[i] && ok[0] ? " got" : ""}"><span class="${ok[i] ? "green" : "redt"}">${ok[i] ? "✓" : "✗"}</span><span class="grow">${esc(o.txt)}</span></div>`).join("")}</div></div>
    ${podiumHtml(rows, `Podio · ${short(def.gp)} ${def.year}`, def.equipo)}
    ${mineHeadline("RACE", rows, def.equipo)}
    ${champHtml}
    <div class="panel"><div class="hd"><span class="t">🏁 Carrera · ${esc(def.gp)} ${def.year}</span></div><div class="bd" style="padding:0">${resultsTable("RACE", rows, def.equipo)}</div></div>
    ${raceSummaryHtml(sum)}
    ${pics.length ? photosHtml(pics) : ""}
    <details class="fold panel"><summary>Lo que pasó de verdad</summary><div class="small" style="line-height:1.45;padding:6px 2px">${esc(def.historia)}</div></details>
    <div class="sticky-cta row"><button id="rlist">Escenarios</button><button class="red big-cta grow" id="ragain">Reintentar</button></div>
  </div>`;
  requestAnimationFrame(() => drawRaceSummary(sum));
  animateCounts();
  $("#rlist").onclick = () => scenariosScreen(nav);
  $("#ragain").onclick = () => briefing(nav, def);
  setBack(() => scenariosScreen(nav));
  window.scrollTo(0, 0);
}
