import { TEAMS, CIRCUITS, ROUNDS, DRIVERS, getTrack } from "./data";
import { $, esc, fmtLap, fmtRace, tyreHtml, fmtDate, sheet } from "./common";
import { SeasonState, driverStandings, teamStandings, RACE_POINTS, SPRINT_POINTS } from "../sim/season";
import { Weekend, newWeekend, DAY_NAMES } from "../sim/weekend";
import { SESSION_NAMES, SessionKind, ResultRow, isRaceKind, Car, Session } from "../sim/session";
import { COMPOUNDS, DRY, setWear } from "../sim/tyres";
import { stintProfile } from "../sim/strategy";
import { SCENARIO_NAMES } from "../sim/weather";
import { saveSeason, clearSeason } from "./store";

export interface Nav {
  home(): void;
  season(): void;
  weekend(): void;
  session(kind: SessionKind): void;
}

const app = () => document.getElementById("app")!;
const flagOf = (id: string) => CIRCUITS[id].bandera;

// ------------------------------------------------------------------ inicio
export function startScreen(nav: Nav, saved: SeasonState | null, onNew: (team: string) => void) {
  let pick = saved?.playerTeam ?? "williams";
  const render = () => {
    app().innerHTML = `
    <div style="padding-bottom:16px">
      <div class="panel"><div class="hd">Muro de Boxes · Temporada 2026</div><div class="bd">
        <h1>Muro de Boxes</h1>
        <div class="dim">Minitemporada de ${ROUNDS.length} grandes premios. Tú decides en el muro; el coche y los pilotos son los que son.</div>
        ${saved ? `<div style="margin-top:10px"><button class="red big-cta" id="cont">Continuar temporada · ${esc(TEAMS.find((t) => t.id === saved.playerTeam)!.nombre)} · ronda ${Math.min(saved.round + 1, ROUNDS.length)}/${ROUNDS.length}</button></div>` : ""}
      </div></div>
      <div class="panel"><div class="hd">${saved ? "O empieza una nueva con" : "Elige tu equipo"}</div><div class="bd" style="padding:0">
        ${TEAMS.map((t) => `<div class="list-item" data-team="${t.id}" style="cursor:pointer;${pick === t.id ? "background:rgba(225,6,0,.22)" : ""}">
          <span class="teamdot" style="background:${t.color};height:28px;width:6px"></span>
          <div class="grow"><b class="up">${esc(t.nombre)}</b> <span class="dim small">· motor ${esc(t.motor)}</span><br><span class="small">${t.pilotos.map((p) => `#${p.numero} ${esc(p.nombre)}`).join(" · ")}</span></div>
          <span class="small dim">${pick === t.id ? "✔" : ""}</span></div>`).join("")}
      </div></div>
      <div style="padding:0 10px"><button class="${saved ? "" : "red "}big-cta" id="new">${saved ? "Nueva temporada (borra la actual)" : "Empezar temporada"}</button></div>
    </div>`;
    document.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => (el.onclick = () => { pick = el.dataset.team!; render(); }));
    $("#new").onclick = () => { if (!saved || confirm("¿Borrar la temporada guardada?")) { clearSeason(); onNew(pick); } };
    if (saved) $("#cont").onclick = () => nav.season();
  };
  render();
}

// --------------------------------------------------------------- temporada
export function seasonScreen(nav: Nav, s: SeasonState) {
  const ds = driverStandings(s, DRIVERS.length);
  const ts = teamStandings(s, TEAMS);
  const done = s.round >= ROUNDS.length;
  const champ = done ? DRIVERS[ds[0].id] : null;
  app().innerHTML = `
  <div style="padding-bottom:16px">
    <div class="panel"><div class="hd">Temporada 2026 · ${esc(TEAMS.find((t) => t.id === s.playerTeam)!.nombre)}<span class="grow"></span><button id="home">Inicio</button></div><div class="bd">
      ${done ? `<h1>🏆 ${esc(champ!.d.nombre)}</h1><div class="dim">Campeón de la minitemporada con ${ds[0].points} puntos</div>` : `<button class="red big-cta" id="go">${flagOf(ROUNDS[s.round])} Ir al ${esc(CIRCUITS[ROUNDS[s.round]].gp)}</button>`}
    </div></div>
    <div class="panel"><div class="hd">Calendario</div><div class="bd" style="padding:0">
      ${ROUNDS.map((id, i) => {
        const c = CIRCUITS[id];
        const r = s.rounds.find((x) => x.round === i + 1);
        const win = r?.race?.[0];
        return `<div class="list-item"><span class="pos">${i + 1}</span><div class="grow"><b>${c.bandera} ${esc(c.gp)}</b>${c.formato === "sprint" ? ' <span class="pill yellow">Sprint</span>' : ""}<br><span class="small dim">${esc(c.nombre)} · ${fmtDate(c.fecha)}</span></div>
          <span class="small">${win ? `🏁 ${esc(DRIVERS[win.id].d.abrev)}` : i === s.round ? '<span class="yellow">SIGUIENTE</span>' : ""}</span></div>`;
      }).join("")}
    </div></div>
    <div class="panel"><div class="hd">Mundial de pilotos</div><div class="bd" style="padding:0">
      <table class="tv">${ds.map((x, i) => { const d = DRIVERS[x.id]; return `<tr class="${d.team.id === s.playerTeam ? "me" : ""}"><td class="mono"><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${d.team.color}"></span>${esc(d.d.nombre)}</td><td class="dim small">${esc(d.team.nombre)}</td><td class="mono" style="text-align:right"><b>${x.points}</b></td></tr>`; }).join("")}</table>
    </div></div>
    <div class="panel"><div class="hd">Mundial de constructores</div><div class="bd" style="padding:0">
      <table class="tv">${ts.map((x, i) => `<tr class="${x.team.id === s.playerTeam ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${x.team.color}"></span>${esc(x.team.nombre)}</td><td class="mono" style="text-align:right"><b>${x.points}</b></td></tr>`).join("")}</table>
    </div></div>
    ${done ? `<div style="padding:0 10px"><button class="red big-cta" id="again">Nueva temporada</button></div>` : ""}
  </div>`;
  $("#home").onclick = () => nav.home();
  if (!done) $("#go").onclick = () => {
    if (!s.weekend || s.weekend.round !== s.round + 1) {
      s.weekend = newWeekend(s.round + 1, CIRCUITS[ROUNDS[s.round]], TEAMS, s.seed * 1000 + s.round * 97 + 1);
      saveSeason(s);
    }
    nav.weekend();
  };
  else $("#again").onclick = () => { clearSeason(); nav.home(); };
}

// -------------------------------------------------------------- fin de semana
export function weekendScreen(nav: Nav, s: SeasonState) {
  const st = s.weekend!;
  const def = CIRCUITS[st.circuitId];
  const track = getTrack(st.circuitId);
  const wk = new Weekend(st, track, TEAMS, s.playerTeam);
  const team = TEAMS.find((t) => t.id === s.playerTeam)!;
  const next = wk.nextKind();
  const outlook = wk.outlook(team.meteo);
  const mine = wk.entrants().filter((e) => e.player);
  const k = st.knowledge[team.id];
  // tabla de conocimiento: perfil de stint con lo que sabe el equipo
  const fakeSess = { track, weather: { trackT: outlook[0]?.track ?? 30, airT: outlook[0]?.air[1] ?? 20 }, lapRefRace: track.refLap, secPerGrip: (() => { let a = 0, b = 0; for (const m of track.ms) { a += m.tByGrip[12]; b += m.tByGrip[11]; } return (b - a) / 5; })() } as unknown as Session;
  const fakeCar = { wearMult: team.desgaste * (1.18 - mine[0].d.neumaticos * 0.002) } as unknown as Car;
  const profM = stintProfile(fakeSess, fakeCar, { ...k, profile: {} }, "M");
  const knowRows = DRY.map((c) => {
    const p = stintProfile(fakeSess, fakeCar, { ...k, profile: {} }, c);
    const life = p.wear.findIndex((w) => w > COMPOUNDS[c].cliff);
    const pace = p.dt[1] - profM.dt[1];
    const deg = (p.dt[10] - p.dt[2]) / 8;
    const n = k.noise[c];
    const meas = k.measured[c];
    return `<tr><td>${tyreHtml(c)} ${COMPOUNDS[c].name}</td><td class="mono">${pace >= 0 ? "+" : ""}${pace.toFixed(2)} s</td><td class="mono">+${deg.toFixed(2)} s</td><td class="mono">${life < 0 ? "60+" : `${Math.round(life * (1 - n))}–${Math.round(life * (1 + n))}`}</td><td class="mono ${n < 0.05 ? "green" : n > 0.12 ? "redt" : ""}">±${Math.round(n * 100)} %${meas ? " 📊" : ""}</td></tr>`;
  }).join("");
  const sessions = wk.sessions();
  app().innerHTML = `
  <div style="padding-bottom:16px">
    <div class="panel"><div class="hd">Ronda ${st.round} · ${def.bandera} ${esc(def.pais)}<span class="grow"></span><button id="back">Temporada</button></div><div class="bd">
      <h1>${esc(def.gp)}</h1>
      <div class="dim">${esc(def.nombre)} · ${(track.length / 1000).toFixed(3)} km · ${def.vueltas} vueltas${def.formato === "sprint" ? ` · <span class="yellow">fin de semana sprint (${def.vueltasSprint} v)</span>` : ""} · ${fmtDate(def.fecha)}</div>
      <canvas id="mini" style="width:100%;height:150px;margin-top:6px"></canvas>
    </div></div>
    <div class="panel"><div class="hd">Programa</div><div class="bd" style="padding:0">
      ${sessions.map((kind, i) => {
        const w = wk.when(kind);
        const res = st.results[kind];
        const isNext = i === st.next;
        const ol = outlook.find((o) => o.kind === kind);
        const top = res?.[0];
        return `<div class="list-item">
          <div style="width:62px" class="small dim up">${DAY_NAMES[w.day].slice(0, 3)} ${String(Math.floor(w.clock / 60)).padStart(2, "0")}:${String(w.clock % 60).padStart(2, "0")}</div>
          <div class="grow"><b class="up">${SESSION_NAMES[kind]}</b><br><span class="small dim">${res ? `🏁 ${esc(TEAMS.flatMap((t) => t.pilotos)[top!.id].abrev)} ${isRaceKind(kind) ? "" : fmtLap(top!.best)}` : ol ? `🌧️ ${Math.round(ol.rain * 100)} % · ${ol.air[0].toFixed(0)}–${ol.air[1].toFixed(0)} °C` : ""}</span></div>
          ${res ? `<button data-res="${kind}">Ver</button>` : isNext ? `<button class="red" id="play">Empezar</button>` : ""}
        </div>`;
      }).join("")}
    </div></div>
    <div class="panel"><div class="hd">Previsión del meteorólogo <span class="dim small">(fiabilidad ${team.meteo}/100)</span></div><div class="bd small">
      ${outlook.length ? outlook.map((o) => `<div class="row"><span class="grow up">${SESSION_NAMES[o.kind]}</span><span class="mono">lluvia ${Math.round(o.rain * 100)} %</span><span class="mono dim">${o.air[0].toFixed(0)}–${o.air[1].toFixed(0)} °C · asfalto ~${o.track.toFixed(0)} °C</span></div>`).join("") : "—"}
      <div class="dim" style="margin-top:6px">Clima típico: ${esc(def.clima.fuente)}.</div>
    </div></div>
    <div class="panel"><div class="hd">Lo que saben tus ingenieros</div><div class="bd" style="padding:0">
      <table class="tv"><tr><th>Compuesto</th><th>Nuevo</th><th>Pierde/v</th><th>Vida</th><th>Error</th></tr>${knowRows}</table>
      <div class="small dim" style="padding:6px 10px">Cada tanda larga en libres mide el desgaste real y reduce el error (📊 = ya medido). El desgaste puede salir mayor o menor de lo previsto.</div>
    </div></div>
    <div class="panel"><div class="hd">Tus juegos de neumáticos</div><div class="bd">
      ${mine.map((e) => `<div style="margin-bottom:6px"><b>${esc(e.d.nombre)}</b><div class="row wrap small" style="gap:4px;margin-top:3px">${e.sets.map((x) => `<span class="pill" style="${x.returned ? "opacity:.3;text-decoration:line-through" : ""}">${tyreHtml(x.c)} ${x.laps ? `${x.laps}v ${Math.round(setWear(x) * 100)}%` : "nuevo"}</span>`).join("")}</div></div>`).join("")}
      <div class="small dim">${st.sprint ? "Sprint: 12 de seco (6 blandos, 4 medios, 2 duros), 6 intermedios y 3 de lluvia." : "13 de seco (8 blandos, 3 medios, 2 duros), 4 intermedios y 3 de lluvia."} Tras cada libre se devuelven los más gastados. En carrera en seco hay que usar dos compuestos.</div>
    </div></div>
    <div class="panel"><div class="hd">Días</div><div class="bd small dim">${st.days.map((d, i) => `${DAY_NAMES[i]}: ${i < (wk.when(sessions[st.next] ?? "RACE").day) ? SCENARIO_NAMES[d.scenario] : "?"}`).join(" · ")}</div></div>
  </div>`;
  drawMini($<HTMLCanvasElement>("#mini"), track);
  $("#back").onclick = () => nav.season();
  if (next) $("#play").onclick = () => nav.session(next);
  document.querySelectorAll<HTMLElement>("[data-res]").forEach((b) => (b.onclick = () => resultsSheet(b.dataset.res as SessionKind, st.results[b.dataset.res as SessionKind]!, s.playerTeam)));
}

export function drawMini(cv: HTMLCanvasElement, track: ReturnType<typeof getTrack>) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext("2d")!;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < track.xs.length; i++) { minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]); miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]); }
  const pad = 10 * dpr;
  const sc = Math.min((cv.width - 2 * pad) / (maxx - minx), (cv.height - 2 * pad) / (maxy - miny));
  const ox = (cv.width - (maxx - minx) * sc) / 2 - minx * sc, oy = (cv.height - (maxy - miny) * sc) / 2 + maxy * sc;
  g.lineWidth = 5 * dpr; g.strokeStyle = "#e8e8e8"; g.lineJoin = "round";
  g.beginPath();
  for (let i = 0; i < track.xs.length; i++) { const x = ox + track.xs[i] * sc, y = oy - track.ys[i] * sc; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.stroke();
  g.fillStyle = "#e10600"; g.beginPath(); g.arc(ox + track.xs[0] * sc, oy - track.ys[0] * sc, 5 * dpr, 0, 7); g.fill();
}

// --------------------------------------------------------------- resultados
export function resultsTable(kind: SessionKind, rows: ResultRow[], playerTeam: string): string {
  const race = isRaceKind(kind);
  const pts = kind === "RACE" ? RACE_POINTS : kind === "SPRINT" ? SPRINT_POINTS : [];
  const lead = rows[0];
  const bestLap = rows.reduce((b, r) => Math.min(b, r.best ?? Infinity), Infinity);
  return `<table class="tv"><tr><th>#</th><th>Piloto</th><th>${race ? "Tiempo" : "Mejor"}</th>${race ? "<th>Par.</th><th>Pts</th>" : "<th>V</th>"}</tr>
    ${rows.map((r, i) => {
      const d = DRIVERS[r.id];
      const t = race
        ? r.status === "out" || r.status === "dns" ? `<span class="redt">${esc(r.reason ?? "abandono")}</span>` : i === 0 ? fmtRace(r.time) : r.laps < lead.laps ? `+${lead.laps - r.laps} v` : `+${(r.time - lead.time).toFixed(3)}`
        : `${fmtLap(r.best)}${r.part && i > 0 && rows[i - 1].part !== r.part ? "" : ""} <span class="dim small">${r.part ?? ""}</span>`;
      const p = race && r.status === "fin" ? pts[i] ?? "" : "";
      return `<tr class="${d.team.id === playerTeam ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${d.team.color}"></span>${esc(d.d.nombre)}${r.best === bestLap && isFinite(bestLap) && race ? ' <span class="purple">⏱</span>' : ""}</td><td class="mono">${t}</td>${race ? `<td class="mono">${r.stops}</td><td class="mono"><b>${p}</b></td>` : `<td class="mono">${r.laps}</td>`}</tr>`;
    }).join("")}</table>`;
}

export function resultsSheet(kind: SessionKind, rows: ResultRow[], playerTeam: string) {
  sheet(`<div class="row"><h1 class="grow" style="font-size:18px">${SESSION_NAMES[kind]}</h1><button data-close>Cerrar</button></div>${resultsTable(kind, rows, playerTeam)}`);
}

export function resultsScreen(kind: SessionKind, rows: ResultRow[], s: SeasonState, gp: string, extra: string, onContinue: () => void) {
  app().innerHTML = `<div style="padding-bottom:16px">
    <div class="panel"><div class="hd">🏁 ${SESSION_NAMES[kind]} · ${esc(gp)}</div><div class="bd" style="padding:0">${resultsTable(kind, rows, s.playerTeam)}</div></div>
    ${extra}
    <div style="padding:0 10px"><button class="red big-cta" id="cont">Continuar</button></div></div>`;
  $("#cont").onclick = onContinue;
}
