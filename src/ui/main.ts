import "./style.css";

// tema visual (las fichas de color están en style.css)
document.documentElement.dataset.tema = "grafito";
import { TEAMS, CIRCUITS, ROUNDS, DRIVERS, getTrack, useSeason, devContext, CALENDARS } from "./data";
import { applyMidSeason } from "./nextSeason";
import { newDev } from "../sim/development";
import { builderScreen, PLAYER_TEAM_ID } from "./teamBuilder";
import { loadSeason, saveSeason, loadSession, clearSession, isParked, setActiveSlot, deleteSlot, initStore, roomyStorage, askPersist, slotList, loadPrefs, getActiveSlot } from "./store";
import type { SessionSnapshot } from "../sim/snapshot";
import { startScreen, seasonScreen, weekendScreen, resultsScreen, longRunsPanel, teamPickerScreen, Nav } from "./hubs";
import { sessionView } from "./sessionView";
import { scenariosScreen } from "./scenarios";
import { SeasonState, driverStandings, teamStandings, pointsFor, RACE_POINTS, SPRINT_POINTS } from "../sim/season";
import { podiumHtml, standingsHtml, animateCounts, shareSheet } from "./podium";
import { Weekend } from "../sim/weekend";
import { Session, SessionKind, SESSION_NAMES, isRaceKind } from "../sim/session";
import { raceSummaryHtml, drawRaceSummary, buildSummary, photosHtml } from "./summary";
import { takeLastPhotos } from "./photos";
import { runToEnd } from "./simulate";
import { esc, setBack } from "./common";

// las partidas se cargan de IndexedDB antes de pintar nada (ver initStore, al final)
let season: SeasonState | null = null;

/** La sesión guardada a medias, si es la que toca ahora en el fin de semana en curso. */
function pendingSnap(): SessionSnapshot | null {
  const cur = season?.weekend;
  if (!cur) return null;
  const p = loadSession();
  return p && p.weekend.round === cur.round && p.weekend.circuitId === cur.circuitId && p.weekend.next === cur.next ? p : null;
}

/** Cierra una sesión terminada (jugada o simulada): guarda resultados y enseña la pantalla de resultados. */
function finishSession(wk: Weekend, kind: SessionKind, sess: Session) {
  const s = season!;
  const st = wk.st;
  clearSession();
  wk.finish(sess);
  const gp = CIRCUITS[st.circuitId].gp;
  const sum = isRaceKind(kind) ? buildSummary(sess) : null;
  if (sum) st.summaries = { ...st.summaries, [kind]: sum };
  let extra = "";
  if (kind === "RACE") {
    if (st.pu) s.pu = st.pu;
    s.rounds.push({ round: st.round, circuitId: st.circuitId, q: st.results.Q, sprint: st.results.SPRINT, race: st.results.RACE, raceTable: st.scoring?.RACE, sprintTable: st.scoring?.SPRINT, summary: st.summaries?.RACE, sprintSummary: st.summaries?.SPRINT });
    s.round++;
    s.weekend = null;
    // cambios de piloto para la próxima carrera: lesiones tras un accidente y destituciones
    const mid = applyMidSeason(s);
    if (mid.length) extra += `<div class="panel"><div class="hd"><span class="t">Cambios de pilotos</span></div><div class="bd small">${mid.map((t) => `<div>${esc(t)}</div>`).join("")}</div></div>`;
    // el mundial tras la carrera: los cinco primeros, y tus pilotos y tu equipo estén donde estén
    const all = driverStandings(s, DRIVERS.length);
    const before = driverStandings({ ...s, rounds: s.rounds.slice(0, -1) }, DRIVERS.length);
    const ts = teamStandings(s, TEAMS);
    const tp = ts.findIndex((x) => x.team.id === s.playerTeam);
    extra = standingsHtml(gp, before, all, s.playerTeam, `<div class="small dim" style="margin-top:6px">Constructores: ${esc(ts[tp].team.nombre)}, ${tp + 1}.º con ${ts[tp].points} pts.</div>`);
    // la parrilla de la siguiente ronda (con lo que ha desarrollado cada equipo)
    useSeason(s);
  }
  if (kind.startsWith("FP") && sess.longRuns.length) extra = longRunsPanel(sess.longRuns.map((r) => ({ kind, r })), s.playerTeam) + extra;
  if (sess.shortened) {
    const t = sess.pointsTable();
    extra = `<div class="panel"><div class="hd"><span class="t">Carrera acortada</span></div><div class="bd small">Suspendida y no reanudada: cuenta la clasificación al final de la vuelta ${sess.shortened.laps} de ${sess.laps} (${Math.round((100 * sess.shortened.laps) / sess.laps)} %). ${!t ? "Puntos completos (más del 75 %)." : t.length ? `Puntos reducidos: ${t.join("-")}.` : "Sin puntos: no se completaron dos vueltas en verde."}</div></div>` + extra;
  }
  // fotos de la carrera (si se vio en 3D): se guardan con su resumen (si hay sitio) para verlas desde el calendario
  const pics = sum ? takeLastPhotos().slice(0, 10) : [];
  if (pics.length) {
    extra = photosHtml(pics) + extra;
    if (roomyStorage() && sum) sum.photos = pics;
  }
  if (sum) extra = raceSummaryHtml(sum) + extra;
  saveSeason(s);
  const rows = sess.results();
  // carrera o sprint: podio con confeti y la tarjeta para compartir
  let top = "";
  if (kind === "RACE" || kind === "SPRINT") {
    top = podiumHtml(rows, kind === "SPRINT" ? `Podio · Sprint de ${gp.replace("Gran Premio de ", "")}` : `Podio · ${gp}`, s.playerTeam)
      + `<div style="padding:0 10px"><button class="big-cta" id="sharebtn">Compartir resultado</button></div>`;
  }
  resultsScreen(kind, rows, s, gp, extra, () => (kind === "RACE" ? nav.season() : nav.weekend()), top);
  if (sum) requestAnimationFrame(() => drawRaceSummary(sum));
  animateCounts();
  const sb = document.getElementById("sharebtn");
  if (sb && (kind === "RACE" || kind === "SPRINT")) sb.onclick = () => {
    const table = kind === "RACE" ? s.rounds[s.rounds.length - 1]?.raceTable ?? RACE_POINTS : st.scoring?.SPRINT ?? SPRINT_POINTS;
    const ds = driverStandings(s, DRIVERS.length);
    const myTeam = TEAMS.find((t) => t.id === s.playerTeam)!;
    void shareSheet({
      kind, year: s.year ?? 2026, circuitId: st.circuitId, rows, points: pointsFor(rows, table), sum, playerTeam: s.playerTeam, teamName: myTeam.nombre, teamColor: myTeam.color,
      standing: ds.map((x, i) => ({ id: x.id, pos: i + 1, points: x.points })).filter((x) => x.id < 1000 && DRIVERS[x.id].team.id === s.playerTeam),
    });
  };
  window.scrollTo(0, 0);
}

/** Deja activa una partida y carga su temporada (y su parrilla). */
function activate(slot: number) {
  setActiveSlot(slot);
  season = loadSeason();
  useSeason(season);
}

/** Entra en la partida activa: la sesión a medias si la hay, si no la temporada (o el inicio). */
function enter() {
  // si se cerró la app a mitad de una sesión, se retoma donde estaba
  // (salvo que el jugador saliera de ella a propósito: entonces espera en el fin de semana)
  const pending = pendingSnap();
  if (pending && !isParked()) nav.session(pending.kind, pending);
  else if (pending) nav.weekend();
  else {
    if (loadSession()) clearSession();
    if (season) nav.season(); else nav.home();
  }
}

/** Calendario elegido en el inicio para las temporadas nuevas (el corto si no se ha tocado). */
function chosenCalendar(): { calendar: string[]; formatos?: Record<string, "normal" | "sprint"> } {
  const c = CALENDARS[loadPrefs().calendario ?? "corta"];
  return Object.keys(c.formatos).length ? { calendar: [...c.ids], formatos: { ...c.formatos } } : { calendar: [...c.ids] };
}

/** Temporada nueva en una partida: lo que hubiera en ella se borra. */
function newSeason(slot: number, s: SeasonState) {
  s.dev = newDev(devContext(s).left); // presupuesto de desarrollo de la temporada
  // temporadas siguientes: los objetivos del año pasado suben o bajan el presupuesto
  if (s.devBonus) s.dev.budget = Math.max(15, s.dev.budget + s.devBonus);
  // la primera partida: se pide al navegador que no borre los datos por su cuenta
  if (!slotList().some((x) => x.season)) askPersist();
  deleteSlot(slot);
  setActiveSlot(slot);
  season = s;
  saveSeason(s);
  useSeason(s);
  nav.season();
}

const nav: Nav = {
  home() { startScreen(nav); window.scrollTo(0, 0); },
  open(slot: number) { activate(slot); enter(); },
  pickTeam(slot: number) { teamPickerScreen(nav, slot); },
  startReal(slot: number, team: string) {
    newSeason(slot, { v: 1, playerTeam: team, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [], ...chosenCalendar() });
  },
  build(slot: number) {
    builderScreen(() => nav.home(), (spec) => {
      newSeason(slot, { v: 1, playerTeam: PLAYER_TEAM_ID, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [], ...chosenCalendar(), equipo: spec });
    });
    window.scrollTo(0, 0);
  },
  season() { if (season) seasonScreen(nav, season); else nav.home(); window.scrollTo(0, 0); },
  nextSeason(next: SeasonState) { newSeason(getActiveSlot(), next); },
  weekend() { if (season?.weekend) weekendScreen(nav, season, pendingSnap()); else nav.season(); window.scrollTo(0, 0); },
  session(kind: SessionKind, snap?: SessionSnapshot) {
    const s = season!;
    // al retomar una sesión a medias, el fin de semana es el de la instantánea (neumáticos ya usados, etc.)
    if (snap) s.weekend = snap.weekend;
    const st = s.weekend!;
    const wk = new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam);
    // salir a medias: la sesión queda guardada y se retoma con «Reanudar» en el fin de semana
    sessionView(wk, kind, (sess) => finishSession(wk, kind, sess), snap, () => nav.weekend());
  },
  scenarios() {
    // al volver, la parrilla vuelve a ser la de la partida activa
    scenariosScreen({ home: () => { useSeason(season); nav.home(); } });
  },
  simulate(kind: SessionKind) {
    const s = season!;
    const st = s.weekend!;
    const wk = new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam);
    const sess = wk.build(kind);
    if (isRaceKind(kind)) sess.autoPlayers = true; // en libres y clasificación todos salen ya en automático
    setBack(() => {});
    const ov = document.createElement("div");
    ov.className = "simov";
    ov.innerHTML = `<div class="simbox"><span class="tab">Simulando</span><div class="bar"><b class="up">${esc(SESSION_NAMES[kind])}</b> · <span id="simp">0 %</span><div class="progress"><i id="simb" style="width:0"></i></div></div></div>`;
    document.body.appendChild(ov);
    runToEnd(sess, wk, (p) => {
      const pct = Math.round(Math.min(1, p) * 100);
      const a = ov.querySelector<HTMLElement>("#simp"), b = ov.querySelector<HTMLElement>("#simb");
      if (a) a.textContent = `${pct} %`;
      if (b) b.style.width = `${pct}%`;
    }, () => { ov.remove(); finishSession(wk, kind, sess); });
  },
};

declare const __BUILD__: string;
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register(`sw.js?v=${__BUILD__}`).catch(() => {});
void initStore().then(() => {
  season = loadSeason();
  useSeason(season);
  enter();
});
