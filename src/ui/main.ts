import "./style.css";
import { TEAMS, CIRCUITS, ROUNDS, DRIVERS, getTrack } from "./data";
import { loadSeason, saveSeason } from "./store";
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
  session(kind: SessionKind) {
    const s = season!;
    const st = s.weekend!;
    const wk = new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam);
    sessionView(wk, kind, (sess) => {
      wk.finish(sess);
      const gp = CIRCUITS[st.circuitId].gp;
      let extra = "";
      if (kind === "RACE") {
        s.rounds.push({ round: st.round, circuitId: st.circuitId, q: st.results.Q, sprint: st.results.SPRINT, race: st.results.RACE });
        s.round++;
        s.weekend = null;
        const ds = driverStandings(s, DRIVERS.length).slice(0, 5);
        extra = `<div class="panel"><div class="hd"><span class="t">Mundial tras ${esc(gp)}</span></div><div class="bd">${ds.map((x, i) => `<div class="row"><span class="pos">${i + 1}</span><span class="grow">${esc(DRIVERS[x.id].d.nombre)}</span><b class="mono">${x.points}</b></div>`).join("")}</div></div>`;
      }
      saveSeason(s);
      resultsScreen(kind, sess.results(), s, gp, extra, () => (kind === "RACE" ? nav.season() : nav.weekend()));
      window.scrollTo(0, 0);
    });
  },
};

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
if (season) nav.season(); else nav.home();
void ROUNDS;
