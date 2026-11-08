import "./style.css";

// tema visual (las fichas de color están en style.css)
document.documentElement.dataset.tema = "grafito";
import { TEAMS, CIRCUITS, ROUNDS, DRIVERS, getTrack } from "./data";
import { loadSeason, saveSeason, loadSession, clearSession } from "./store";
import type { SessionSnapshot } from "../sim/snapshot";
import { startScreen, seasonScreen, weekendScreen, resultsScreen, Nav } from "./hubs";
import { sessionView } from "./sessionView";
import { SeasonState, driverStandings } from "../sim/season";
import { Weekend } from "../sim/weekend";
import { SessionKind } from "../sim/session";
import { esc } from "./common";

let season: SeasonState | null = loadSeason();

const nav: Nav = {
  home() { startScreen(nav, season, (team) => {
    season = { v: 1, playerTeam: team, seed: Math.floor(Math.random() * 1e6), round: 0, weekend: null, rounds: [] };
    saveSeason(season);
    nav.season();
  }); },
  season() { if (season) seasonScreen(nav, season); else nav.home(); window.scrollTo(0, 0); },
  weekend() { if (season?.weekend) weekendScreen(nav, season); else nav.season(); window.scrollTo(0, 0); },
  session(kind: SessionKind, snap?: SessionSnapshot) {
    const s = season!;
    // al retomar una sesión a medias, el fin de semana es el de la instantánea (neumáticos ya usados, etc.)
    if (snap) s.weekend = snap.weekend;
    const st = s.weekend!;
    const wk = new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam);
    sessionView(wk, kind, (sess) => {
      clearSession();
      wk.finish(sess);
      const gp = CIRCUITS[st.circuitId].gp;
      let extra = "";
      if (kind === "RACE") {
        s.rounds.push({ round: st.round, circuitId: st.circuitId, q: st.results.Q, sprint: st.results.SPRINT, race: st.results.RACE, raceTable: st.scoring?.RACE, sprintTable: st.scoring?.SPRINT });
        s.round++;
        s.weekend = null;
        const ds = driverStandings(s, DRIVERS.length).slice(0, 5);
        extra = `<div class="panel"><div class="hd"><span class="t">Mundial tras ${esc(gp)}</span></div><div class="bd">${ds.map((x, i) => `<div class="row"><span class="pos">${i + 1}</span><span class="grow">${esc(DRIVERS[x.id].d.nombre)}</span><b class="mono">${x.points}</b></div>`).join("")}</div></div>`;
      }
      if (sess.shortened) {
        const t = sess.pointsTable();
        extra = `<div class="panel"><div class="hd"><span class="t">Carrera acortada</span></div><div class="bd small">Suspendida y no reanudada: cuenta la clasificación al final de la vuelta ${sess.shortened.laps} de ${sess.laps} (${Math.round((100 * sess.shortened.laps) / sess.laps)} %). ${!t ? "Puntos completos (más del 75 %)." : t.length ? `Puntos reducidos: ${t.join("-")}.` : "Sin puntos: no se completaron dos vueltas en verde."}</div></div>` + extra;
      }
      saveSeason(s);
      resultsScreen(kind, sess.results(), s, gp, extra, () => (kind === "RACE" ? nav.season() : nav.weekend()));
      window.scrollTo(0, 0);
    }, snap);
  },
};

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// si se cerró la app a mitad de una sesión, se retoma donde estaba
const pending = loadSession();
const cur = season?.weekend;
if (pending && cur && pending.weekend.round === cur.round && pending.weekend.circuitId === cur.circuitId && pending.weekend.next === cur.next) nav.session(pending.kind, pending);
else {
  if (pending) clearSession();
  if (season) nav.season(); else nav.home();
}
void ROUNDS;
