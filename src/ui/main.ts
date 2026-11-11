import "./style.css";

// tema visual (las fichas de color están en style.css)
document.documentElement.dataset.tema = "grafito";
import { TEAMS, CIRCUITS, ROUNDS, DRIVERS, getTrack, useSeason } from "./data";
import { builderScreen, PLAYER_TEAM_ID } from "./teamBuilder";
import { loadSeason, saveSeason, clearSeason, loadSession, clearSession, isParked } from "./store";
import type { SessionSnapshot } from "../sim/snapshot";
import { startScreen, seasonScreen, weekendScreen, resultsScreen, longRunsPanel, Nav } from "./hubs";
import { sessionView } from "./sessionView";
import { SeasonState, driverStandings, teamStandings } from "../sim/season";
import { Weekend } from "../sim/weekend";
import { Session, SessionKind, SESSION_NAMES, isRaceKind } from "../sim/session";
import { raceSummaryHtml, drawRaceSummary, buildSummary } from "./summary";
import { runToEnd } from "./simulate";
import { esc, setBack } from "./common";

let season: SeasonState | null = loadSeason();
useSeason(season);

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
    // el mundial tras la carrera: los cinco primeros, y tus pilotos y tu equipo estén donde estén
    const all = driverStandings(s, DRIVERS.length);
    const shown = all.map((x, i) => ({ x, i })).filter(({ x, i }) => i < 5 || DRIVERS[x.id].team.id === s.playerTeam);
    const ts = teamStandings(s, TEAMS);
    const tp = ts.findIndex((x) => x.team.id === s.playerTeam);
    extra = `<div class="panel"><div class="hd"><span class="t">Mundial tras ${esc(gp)}</span></div><div class="bd">${shown.map(({ x, i }, k) => `${k > 0 && i > shown[k - 1].i + 1 ? `<div class="dim small" style="padding-left:6px">···</div>` : ""}<div class="row${DRIVERS[x.id].team.id === s.playerTeam ? " yellow" : ""}"><span class="pos">${i + 1}</span><span class="grow">${esc(DRIVERS[x.id].d.nombre)}</span><b class="mono">${x.points}</b></div>`).join("")}
      <div class="small dim" style="margin-top:6px">Constructores: ${esc(ts[tp].team.nombre)}, ${tp + 1}.º con ${ts[tp].points} pts.</div></div></div>`;
    // la parrilla de la siguiente ronda (con lo que ha desarrollado cada equipo)
    useSeason(s);
  }
  if (kind.startsWith("FP") && sess.longRuns.length) extra = longRunsPanel(sess.longRuns.map((r) => ({ kind, r })), s.playerTeam) + extra;
  if (sess.shortened) {
    const t = sess.pointsTable();
    extra = `<div class="panel"><div class="hd"><span class="t">Carrera acortada</span></div><div class="bd small">Suspendida y no reanudada: cuenta la clasificación al final de la vuelta ${sess.shortened.laps} de ${sess.laps} (${Math.round((100 * sess.shortened.laps) / sess.laps)} %). ${!t ? "Puntos completos (más del 75 %)." : t.length ? `Puntos reducidos: ${t.join("-")}.` : "Sin puntos: no se completaron dos vueltas en verde."}</div></div>` + extra;
  }
  if (sum) extra = raceSummaryHtml(sum) + extra;
  saveSeason(s);
  resultsScreen(kind, sess.results(), s, gp, extra, () => (kind === "RACE" ? nav.season() : nav.weekend()));
  if (sum) requestAnimationFrame(() => drawRaceSummary(sum));
  window.scrollTo(0, 0);
}

const nav: Nav = {
  home() { startScreen(nav, season, (team) => {
    season = { v: 1, playerTeam: team, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [], calendar: [...ROUNDS] };
    clearSession();
    saveSeason(season);
    useSeason(season);
    nav.season();
  }); window.scrollTo(0, 0); },
  build() {
    builderScreen(() => nav.home(), (spec) => {
      if (season && !confirm("¿Borrar la temporada guardada y empezar con tu equipo?")) return;
      clearSeason();
      season = { v: 1, playerTeam: PLAYER_TEAM_ID, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [], calendar: [...ROUNDS], equipo: spec };
      clearSession();
      saveSeason(season);
      useSeason(season);
      nav.season();
    });
    window.scrollTo(0, 0);
  },
  season() { if (season) seasonScreen(nav, season); else nav.home(); window.scrollTo(0, 0); },
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
// si se cerró la app a mitad de una sesión, se retoma donde estaba
// (salvo que el jugador saliera de ella a propósito: entonces espera en el fin de semana)
const pending = pendingSnap();
if (pending && !isParked()) nav.session(pending.kind, pending);
else if (pending) nav.weekend();
else {
  if (loadSession()) clearSession();
  if (season) nav.season(); else nav.home();
}
