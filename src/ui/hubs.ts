import type { SessionSnapshot } from "../sim/snapshot";
import { TEAMS, BASE_TEAMS, CIRCUITS, ROUNDS, DRIVERS, GRID_CHANGES, getTrack, calendarOf } from "./data";
import { myTeamPanel, puSummary, puPanel, wirePu, PLAYER_TEAM_ID } from "./teamBuilder";
import { $, esc, fmtLap, fmtRace, tyreHtml, fmtDate, sheet, setLabel, groupSets, flagHtml, setBack } from "./common";
import { SeasonState, RoundResult, RaceSummary, driverStandings, teamStandings, RACE_POINTS, SPRINT_POINTS } from "../sim/season";
import { Weekend, WeekendState, newWeekend, preparePu, DAY_NAMES } from "../sim/weekend";
import { puPenalty } from "../sim/powerunit";
import { SESSION_NAMES, SessionKind, ResultRow, isRaceKind, isQualiKind, Car, Session, LongRun, TeamDef, DriverDef } from "../sim/session";
import { COMPOUNDS, DRY, ALL, setWear, Compound, TyreSet } from "../sim/tyres";
import { stintProfile } from "../sim/strategy";
import type { Track } from "../sim/track";
import { SCENARIO_NAMES } from "../sim/weather";
import { saveSeason, loadSeason, slotList, getActiveSlot, deleteSlot, exportSlot, checkImport, importInto, SLOTS } from "./store";
import { raceSummaryHtml, drawRaceSummary } from "./summary";

export interface Nav {
  home(): void;
  /** Sigue una partida guardada (la deja como activa). */
  open(slot: number): void;
  /** Temporada nueva con un equipo real: elegir equipo. */
  pickTeam(slot: number): void;
  startReal(slot: number, team: string): void;
  season(): void;
  weekend(): void;
  session(kind: SessionKind, snap?: SessionSnapshot): void;
  /** Pantalla de fichajes del modo «crear equipo» (la temporada irá a esa partida). */
  build(slot: number): void;
  /** Simula la sesión entera sin entrar en ella (el equipo lleva a tus pilotos). */
  simulate(kind: SessionKind): void;
}

const app = () => document.getElementById("app")!;
const flagOf = (id: string) => flagHtml(CIRCUITS[id].bandera);
const ord = (n: number) => `${n}.º`;

// ------------------------------------------------------------------ inicio
/** Nombre y color del equipo de una partida guardada. */
function seasonTeam(s: SeasonState): { name: string; color: string } {
  if (s.equipo) return { name: s.equipo.nombre, color: s.equipo.color };
  const t = BASE_TEAMS.find((x) => x.id === s.playerTeam);
  return { name: t?.nombre ?? s.playerTeam, color: t?.color ?? "#888" };
}

/** Dónde va una partida nueva (o importada): la primera vacía o, si están todas llenas, la que elija el jugador. */
function chooseSlot(what: string, onPick: (slot: number) => void) {
  const list = slotList();
  const empty = list.find((x) => !x.season);
  if (empty) return onPick(empty.slot);
  const { el, close } = sheet(`<div class="row"><b class="up grow">${esc(what)}</b><button data-close>Cancelar</button></div>
    <div class="small dim" style="margin:4px 0 8px">Las ${SLOTS} partidas están ocupadas. ¿Cuál sustituyes? Se borra entera (si la quieres guardar, expórtala antes).</div>
    ${list.map(({ slot, season }) => { const t = seasonTeam(season!); return `<div class="slotrow"><span class="slotn">${slot}</span><span class="teamdot" style="background:${t.color};height:28px"></span><div class="grow"><b>${esc(t.name)}</b><br><span class="small dim">${slotWhere(season!)}</span></div><button data-over="${slot}">Sustituir</button></div>`; }).join("")}`);
  el.querySelectorAll<HTMLButtonElement>("[data-over]").forEach((b) => (b.onclick = () => {
    const n = Number(b.dataset.over);
    if (!confirm(`¿Borrar la partida ${n} (${seasonTeam(list[n - 1].season!).name})?`)) return;
    close();
    onPick(n);
  }));
}

/** Por dónde va una temporada guardada. */
function slotWhere(s: SeasonState): string {
  const cal = calendarOf(s);
  if (s.round >= cal.length) return "Temporada terminada";
  const c = CIRCUITS[cal[s.round]];
  return `Ronda ${s.round + 1}/${cal.length} · ${flagHtml(c.bandera)} ${esc(c.gp.replace("Gran Premio de ", "GP de "))}`;
}

/** Guarda un texto como archivo: con la hoja de compartir del móvil si la hay (para dejarlo en Archivos o mandarlo), si no, como descarga. */
async function saveFile(name: string, text: string) {
  const file = new File([text], name, { type: "application/json" });
  const n = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (n.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function startScreen(nav: Nav, notice = "") {
  const list = slotList();
  const active = getActiveSlot();
  const any = list.some((x) => x.season);
  app().innerHTML = `
  <div style="padding-bottom:16px">
    <div class="panel"><div class="hd"><span class="t">Muro de Boxes · Temporada 2026</span></div><div class="bd">
      <h1>Muro de Boxes</h1>
      <div class="dim">Temporada de ${ROUNDS.length} grandes premios. Tú decides en el muro.</div>
    </div></div>
    ${any ? `<div class="panel"><div class="hd"><span class="t">Tus partidas</span></div><div class="bd" style="padding:0">
      ${list.map(({ slot, season, midSession }) => {
        if (!season) return `<div class="slotrow empty"><span class="slotn">${slot}</span><span class="grow dim small">Vacía</span></div>`;
        const t = seasonTeam(season);
        return `<div class="slotrow${slot === active ? " on" : ""}"><span class="slotn">${slot}</span><span class="teamdot" style="background:${t.color};height:34px"></span>
          <div class="grow" style="min-width:0"><b class="up">${esc(t.name)}</b> <span class="small dim">· ${season.equipo ? "equipo propio" : "equipo real"}</span><br><span class="small">${slotWhere(season)}${midSession ? ` · <span class="yellow">sesión a medias</span>` : ""}</span></div>
          <button data-more="${slot}" aria-label="Más opciones de la partida ${slot}">⋯</button><button class="${slot === active ? "red" : ""}" data-open="${slot}">Seguir</button></div>`;
      }).join("")}
      ${notice ? `<div class="small green" style="padding:6px 10px">${notice}</div>` : ""}
      <div class="small dim" style="padding:6px 10px">Las partidas se guardan en este navegador. Para no perderlas o llevarlas a otro dispositivo, expórtalas (⋯) e impórtalas allí.</div>
    </div></div>` : ""}
    <div class="panel"><div class="hd"><span class="t">Nueva temporada</span></div><div class="bd">
      <div class="newcards">
        <button class="newcard" id="real"><b>Equipo real</b><span>Uno de los 11 equipos de 2026, tal cual: desde los que aspiran a ganar hasta el farolillo rojo.</span></button>
        <button class="newcard" id="build"><b>Crea tu equipo</b><span>Ficha pilotos, jefe, técnico y motor con 100 M de techo de gasto, y gestiona las unidades de potencia.</span></button>
      </div>
    </div></div>
    <div style="padding:0 10px"><button id="import" style="width:100%">Importar partida desde un archivo</button><input type="file" id="importf" accept=".json,application/json" hidden></div>
  </div>`;
  $("#real").onclick = () => chooseSlot("Nueva temporada", (slot) => nav.pickTeam(slot));
  $("#build").onclick = () => chooseSlot("Nueva temporada", (slot) => nav.build(slot));
  document.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => (b.onclick = () => nav.open(Number(b.dataset.open))));
  document.querySelectorAll<HTMLElement>("[data-more]").forEach((b) => (b.onclick = () => slotSheet(nav, Number(b.dataset.more))));
  const inp = $<HTMLInputElement>("#importf");
  $("#import").onclick = () => inp.click();
  inp.onchange = async () => {
    const f = inp.files?.[0];
    inp.value = "";
    if (!f) return;
    const chk = checkImport(await f.text());
    if (!chk.ok) { alert(chk.why); return; }
    const t = seasonTeam(chk.season);
    chooseSlot("Importar partida", (slot) => {
      if (!importInto(slot, chk.file)) { alert("No se ha podido guardar: el navegador no deja más espacio."); return; }
      startScreen(nav, `Importada en la partida ${slot}: ${esc(t.name)}, ${slotWhere(chk.season)}.`);
    });
  };
  const cur = list[active - 1].season;
  setBack(cur ? () => nav.open(active) : null);
}

/** Opciones de una partida guardada: exportarla a un archivo o borrarla. */
function slotSheet(nav: Nav, slot: number) {
  const s = loadSeason(slot);
  if (!s) return;
  const t = seasonTeam(s);
  const { el, close } = sheet(`<div class="row"><b class="up grow">Partida ${slot} · ${esc(t.name)}</b><button data-close>Cerrar</button></div>
    <div class="small dim" style="margin:2px 0 8px">${slotWhere(s)}</div>
    <div class="menulist">
      <button data-m="export"><b>Exportar a un archivo</b><span>Una copia de seguridad, o para seguirla en otro dispositivo con «Importar partida»</span></button>
      <button data-m="delete"><b>Borrar partida</b><span>No se puede deshacer</span></button>
    </div>`);
  el.querySelector<HTMLButtonElement>('[data-m="export"]')!.onclick = () => {
    const txt = exportSlot(slot);
    if (!txt) return;
    const base = t.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "equipo";
    void saveFile(`muro-de-boxes-${base}-ronda-${Math.min(s.round + 1, calendarOf(s).length)}.json`, txt);
    close();
  };
  el.querySelector<HTMLButtonElement>('[data-m="delete"]')!.onclick = () => {
    if (!confirm(`¿Borrar la partida ${slot} (${t.name})? No se puede deshacer.`)) return;
    deleteSlot(slot);
    close();
    nav.home();
  };
}

/** Elegir equipo real para una temporada nueva: ninguno marcado de antemano. */
export function teamPickerScreen(nav: Nav, slot: number) {
  let pick: string | null = null;
  const BT = BASE_TEAMS;
  // lo competitivo que es cada coche: puesto por chasis (agarre) y por motor entre los 11 equipos
  const rank = (key: "agarre" | "potencia", t: TeamDef) => 1 + BT.filter((o) => o[key] > t[key]).length;
  const gMin = Math.min(...BT.map((t) => t.agarre)), gMax = Math.max(...BT.map((t) => t.agarre));
  const level = (t: TeamDef) => { const r = rank("agarre", t); return r <= 2 ? "Aspira a ganar" : r <= 4 ? "Podios a tiro" : r <= 7 ? "Zona de puntos" : r <= 9 ? "Puntuar es un premio" : "Farolillo rojo"; };
  const render = () => {
    const y = window.scrollY;
    const chosen = BT.find((t) => t.id === pick);
    app().innerHTML = `
    <div style="padding-bottom:8px">
      <div class="panel"><div class="hd"><span class="t">Elige equipo</span><button id="back">Volver</button></div><div class="bd small">
        Llevas a sus dos pilotos todo el año con el coche que tiene. Cuanto más abajo, más difícil: puntuar con los últimos ya es un éxito.
      </div></div>
      <div class="panel"><div class="bd" style="padding:0">
        ${BT.map((t) => `<div class="list-item" data-team="${t.id}" style="cursor:pointer;${pick === t.id ? "background:rgba(225,6,0,.22)" : ""}">
          <span class="teamdot" style="background:${t.color};height:40px;width:6px"></span>
          <div class="grow"><b class="up">${esc(t.nombre)}</b> <span class="dim small">· motor ${esc(t.motor)}</span><br><span class="small">${t.pilotos.map((p) => `#${p.numero} ${esc(p.nombre)}`).join(" · ")}</span>
            <div class="row small" style="gap:6px;margin-top:3px"><span class="lvl"><i style="width:${Math.round(12 + (88 * (t.agarre - gMin)) / (gMax - gMin))}%"></i></span><span class="dim">coche ${ord(rank("agarre", t))} · motor ${ord(rank("potencia", t))} · <span class="${rank("agarre", t) <= 4 ? "green" : rank("agarre", t) >= 8 ? "yellow" : ""}">${level(t)}</span></span></div></div>
          <span class="small" style="width:14px">${pick === t.id ? "✔" : ""}</span></div>`).join("")}
      </div></div>
      <div class="sticky-cta"><button class="red big-cta" id="go" ${chosen ? "" : "disabled"}>${chosen ? `Empezar con ${esc(chosen.nombre)}` : "Elige un equipo"}</button></div>
    </div>`;
    window.scrollTo(0, y);
    document.querySelectorAll<HTMLElement>("[data-team]").forEach((el) => (el.onclick = () => { pick = el.dataset.team!; render(); }));
    $("#back").onclick = () => nav.home();
    $("#go").onclick = () => { if (pick) nav.startReal(slot, pick); };
  };
  setBack(() => nav.home());
  window.scrollTo(0, 0);
  render();
}

// --------------------------------------------------------------- temporada
export function seasonScreen(nav: Nav, s: SeasonState) {
  const ds = driverStandings(s, DRIVERS.length);
  const ts = teamStandings(s, TEAMS);
  const ROUNDS_S = calendarOf(s);
  const done = s.round >= ROUNDS_S.length;
  const champ = done ? DRIVERS[ds[0].id] : null;
  const myTeam = TEAMS.find((t) => t.id === s.playerTeam)!;
  const myPos = ts.findIndex((x) => x.team.id === s.playerTeam) + 1;
  const mine = ds.map((x, i) => ({ x, i })).filter(({ x }) => DRIVERS[x.id].team.id === s.playerTeam);
  app().innerHTML = `
  <div style="padding-bottom:16px">
    <div class="panel"><div class="hd"><span class="t">Temporada 2026 · ${esc(myTeam.nombre)}</span><button id="home">Inicio</button></div><div class="bd">
      ${done ? `<h1>🏆 ${esc(champ!.d.nombre)}</h1><div class="dim">Campeón de la minitemporada con ${ds[0].points} puntos</div>` : `<button class="red big-cta" id="go">${flagOf(ROUNDS_S[s.round])} ${s.weekend && s.weekend.round === s.round + 1 && s.weekend.next > 0 ? "Seguir en el" : "Ir al"} ${esc(CIRCUITS[ROUNDS_S[s.round]].gp)}</button>`}
      ${s.rounds.length ? `<div class="small" style="margin-top:8px">${esc(myTeam.nombre)}: <b>${ord(myPos)}</b> de constructores con ${ts[myPos - 1].points} pts · ${mine.map(({ x, i }) => `${esc(DRIVERS[x.id].d.abrev)} ${ord(i + 1)} (${x.points})`).join(" · ")}</div>` : ""}
    </div></div>
    ${s.equipo ? myTeamPanel(s, TEAMS) : ""}
    ${s.equipo && s.pu ? `<div class="panel"><div class="hd"><span class="t">Unidades de potencia</span></div><div class="bd">${puSummary(s.pu, DRIVERS.filter((d) => d.team.id === PLAYER_TEAM_ID).map((d) => d.id), DRIVERS.filter((d) => d.team.id === PLAYER_TEAM_ID).map((d) => d.d.abrev))}<div class="small dim" style="margin-top:4px">Porcentaje de vida gastada de cada unidad (en amarillo, la montada; tachadas, las rotas).</div></div></div>` : ""}
    ${s.equipo && GRID_CHANGES.length ? `<div class="panel"><div class="hd"><span class="t">La parrilla tras tus fichajes</span></div><div class="bd small">${GRID_CHANGES.map((c) => `${esc(c.team)}: ${c.what === "piloto" ? `${esc(c.in)} por ${esc(c.out)}` : `interino por ${esc(c.out)}`}`).join("<br>")}</div></div>` : ""}
    <div class="panel"><div class="hd"><span class="t">Calendario</span></div><div class="bd" style="padding:0">
      ${ROUNDS_S.map((id, i) => {
        const c = CIRCUITS[id];
        const r = s.rounds.find((x) => x.round === i + 1);
        const win = r?.race?.[0];
        const best = r?.race ? r.race.map((row, k) => ({ row, k })).filter(({ row }) => DRIVERS[row.id].team.id === s.playerTeam && row.status === "fin").map(({ k }) => k + 1) : [];
        return `<div class="list-item"${r ? ` data-round="${i + 1}" style="cursor:pointer"` : ""}><span class="pos">${i + 1}</span><div class="grow"><b>${flagHtml(c.bandera)} ${esc(c.gp)}</b>${c.formato === "sprint" ? ' <span class="pill yellow">Sprint</span>' : ""}<br><span class="small dim">${esc(c.nombre)} · ${fmtDate(c.fecha)}</span></div>
          <span class="small" style="text-align:right">${win ? `🏁 ${esc(DRIVERS[win.id].d.abrev)}${best.length ? `<br><span class="yellow">tú: P${best.join(" · P")}</span>` : ""}` : i === s.round ? '<span class="yellow">SIGUIENTE</span>' : ""}</span>${r ? `<span class="dim">›</span>` : ""}</div>`;
      }).join("")}
    </div></div>
    <div class="panel"><div class="hd"><span class="t">Mundial de pilotos</span></div><div class="bd" style="padding:0">
      <table class="tv">${ds.map((x, i) => { const d = DRIVERS[x.id]; return `<tr class="${d.team.id === s.playerTeam ? "me" : ""}"><td class="mono"><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${d.team.color}"></span>${esc(d.d.nombre)}</td><td class="dim small">${esc(d.team.nombre)}</td><td class="mono" style="text-align:right"><b>${x.points}</b></td></tr>`; }).join("")}</table>
    </div></div>
    <div class="panel"><div class="hd"><span class="t">Mundial de constructores</span></div><div class="bd" style="padding:0">
      <table class="tv">${ts.map((x, i) => `<tr class="${x.team.id === s.playerTeam ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${x.team.color}"></span>${esc(x.team.nombre)}</td><td class="mono" style="text-align:right"><b>${x.points}</b></td></tr>`).join("")}</table>
    </div></div>
    ${done ? `<div style="padding:0 10px"><button class="red big-cta" id="again">Nueva temporada</button></div>` : ""}
  </div>`;
  setBack(() => nav.home());
  $("#home").onclick = () => nav.home();
  document.querySelectorAll<HTMLElement>("[data-round]").forEach((el) => (el.onclick = () => { const r = s.rounds.find((x) => x.round === Number(el.dataset.round)); if (r) roundSheet(r, s.playerTeam); }));
  if (!done) $("#go").onclick = () => {
    if (!s.weekend || s.weekend.round !== s.round + 1) {
      s.weekend = newWeekend(s.round + 1, CIRCUITS[ROUNDS_S[s.round]], TEAMS, s.seed * 1000 + s.round * 97 + 1);
      if (s.equipo) preparePu(s.weekend, s.pu, DRIVERS.length);
      saveSeason(s);
    }
    nav.weekend();
  };
  else $("#again").onclick = () => nav.home();
}

/** Un gran premio ya corrido: carrera (con su resumen si se guardó), sprint y clasificación. */
function roundSheet(r: RoundResult, playerTeam: string) {
  const c = CIRCUITS[r.circuitId];
  const block = (kind: SessionKind, rows: ResultRow[] | undefined, table?: number[], sum?: RaceSummary) => !rows ? "" :
    `<h2 style="margin-top:14px">${SESSION_NAMES[kind]}</h2>${resultsTable(kind, rows, playerTeam, table)}${sum ? `<div class="sumwrap" data-sumwrap="${kind}">${raceSummaryHtml(sum)}</div>` : ""}`;
  const { el } = sheet(`<div class="row"><h1 class="grow" style="font-size:18px">${flagHtml(c.bandera)} ${esc(c.gp)}</h1><button data-close>Cerrar</button></div>
    ${block("RACE", r.race, r.raceTable, r.summary)}${block("SPRINT", r.sprint, r.sprintTable, r.sprintSummary)}${block("Q", r.q)}
    ${!r.summary ? `<div class="small dim" style="margin-top:8px">De esta carrera no se guardaron las gráficas (se corrió con una versión anterior).</div>` : ""}
    <button data-close style="width:100%;margin-top:10px">Cerrar</button>`);
  requestAnimationFrame(() => {
    for (const [kind, sum] of [["RACE", r.summary], ["SPRINT", r.sprintSummary]] as const) {
      const root = el.querySelector<HTMLElement>(`[data-sumwrap="${kind}"]`);
      if (root && sum) drawRaceSummary(sum, root);
    }
  });
}

// ------------------------------------------------------------ juegos y lo que sabe el equipo
/** Los juegos de un piloto, agrupados (los iguales, en una sola etiqueta con su número). */
export function setPills(sets: TyreSet[]): string {
  const sorted = [...sets].sort((a, b) => Number(!!a.returned) - Number(!!b.returned) || ALL.indexOf(a.c) - ALL.indexOf(b.c) || setWear(a) - setWear(b));
  return groupSets(sorted).map((g) => `<span class="pill" style="${g.sets[0].returned ? "opacity:.35;text-decoration:line-through" : ""}">${tyreHtml(g.c)} ${setLabel(g.sets[0])}${g.sets.length > 1 ? ` <b>×${g.sets.length}</b>` : ""}</span>`).join("");
}

/** Tabla «lo que saben tus ingenieros»: ritmo, caída y vida de cada compuesto, con su error. */
export function knowledgeTable(st: WeekendState, track: Track, team: TeamDef, driver: DriverDef, trackT: number, airT: number): string {
  const k = st.knowledge[team.id];
  const fakeSess = { track, weather: { trackT, airT }, lapRefRace: track.refLap, secPerGrip: (() => { let a = 0, b = 0; for (const m of track.ms) { a += m.tByGrip[12]; b += m.tByGrip[11]; } return (b - a) / 5; })() } as unknown as Session;
  const fakeCar = { id: 0, wearMult: team.desgaste * (1.18 - driver.neumaticos * 0.002) } as unknown as Car;
  const kk = { ...k, profile: {} };
  const profM = stintProfile(fakeSess, fakeCar, kk, "M");
  const rows = DRY.map((c) => {
    const p = stintProfile(fakeSess, fakeCar, kk, c);
    const life = p.wear.findIndex((w) => w > COMPOUNDS[c].cliff);
    const pace = p.dt[1] - profM.dt[1];
    const deg = (p.dt[10] - p.dt[2]) / 8;
    const n = k.noise[c];
    const meas = k.measured[c];
    return `<tr><td>${tyreHtml(c)} ${COMPOUNDS[c].name}</td><td class="mono">${pace >= 0 ? "+" : ""}${pace.toFixed(2)} s</td><td class="mono">+${deg.toFixed(2)} s</td><td class="mono">${life < 0 ? "60+" : `${Math.round(life * (1 - n))}–${Math.round(life * (1 + n))}`}</td><td class="mono ${n < 0.05 ? "green" : n > 0.12 ? "redt" : ""}">±${Math.round(n * 100)} %${meas ? " 📊" : ""}</td></tr>`;
  }).join("");
  return `<table class="tv"><tr><th>Compuesto</th><th>Nuevo</th><th>Pierde/v</th><th>Vida (v)</th><th>Error</th></tr>${rows}</table>
    <div class="small dim" style="padding:6px 10px">Cada tanda larga en libres mide el desgaste real y reduce el error (📊 = ya medido). El desgaste puede salir mayor o menor de lo previsto.</div>`;
}

/** Todas las tandas largas del fin de semana, listas para `longRunsPanel`. */
export const weekendLongRuns = (st: WeekendState) => Object.entries(st.longRuns ?? {}).flatMap(([kind, rs]) => (rs ?? []).map((r) => ({ kind: kind as SessionKind, r })));

// -------------------------------------------------------------- fin de semana
/**
 * «¿Y ahora qué?»: hasta tres consejos para la próxima sesión, con lo que ya sabe el juego (lo que
 * han medido tus ingenieros, los juegos que quedan, la previsión, la parrilla y las unidades de
 * potencia). Lo primero, lo que cuesta caro si se pasa por alto.
 */
function nextSteps(wk: Weekend, team: TeamDef, mine: { id: number; d: DriverDef; sets: TyreSet[] }[], outlook: { kind: SessionKind; rain: number }[]): string[] {
  const st = wk.st;
  const next = wk.nextKind();
  if (!next) return [];
  const name = SESSION_NAMES[next];
  const nameLow = name; // «Libres 1», «Clasificación»: nombres propios
  const out: string[] = [];
  // unidad de potencia fuera del cupo (solo se puede cambiar antes de Libres 1)
  if (st.pu && st.next === 0) for (const e of mine) {
    const p = st.pu[e.id];
    if (p && puPenalty(p)) out.push(`<b>${esc(e.d.abrev)}</b> estrena una unidad de potencia fuera del cupo: <span class="redt">${puPenalty(p)} puestos de sanción</span> en la carrera. Puedes cambiarla abajo, en «Unidades de potencia», hasta Libres 1.`);
  }
  const ol = outlook.find((o) => o.kind === next);
  if (ol && ol.rain >= 0.4) {
    const pct = Math.round(ol.rain * 100);
    const what = next.startsWith("FP") ? "las tandas en seco pueden quedarse sin hacer: aprovecha los ratos secos" : isQualiKind(next) ? "conviene marcar tiempo pronto, por si empeora" : "en la parrilla verás con qué neumático recomienda salir el equipo";
    out.push(`Tu meteorólogo da un <b>${pct} %</b> de lluvia en ${nameLow}: ${what}.`);
  }
  const k = st.knowledge[team.id];
  const fresh = (c: Compound) => Math.min(...mine.map((e) => e.sets.filter((x) => x.c === c && x.laps === 0 && !x.returned).length));
  const pctErr = (c: Compound) => `±${Math.round(k.noise[c] * 100)} %`;
  const cname = (c: Compound) => COMPOUNDS[c].name.toLowerCase();
  if (next.startsWith("FP")) {
    const unknown = DRY.filter((c) => !k.measured[c] && k.noise[c] > 0.08).sort((a, b) => k.noise[b] - k.noise[a]);
    if (unknown.length) out.push(`Tus ingenieros aún no han medido el desgaste del ${unknown.map(cname).join(" ni del ")} (error ${pctErr(unknown[0])}). Una <b>tanda larga</b> de 8 vueltas o más en ${nameLow} lo reduce y afina la estrategia de la carrera.`);
    else out.push(`Ya tenéis medidos los compuestos de seco: en ${nameLow} puedes centrarte en <b>simular la clasificación</b> con blandos.`);
    const reserve = st.sprint ? 3 : 4;
    const s = fresh("S");
    if (s <= reserve) out.push(`Quedan <b>${s} blandos nuevos</b> por piloto: guárdalos para la clasificación (cada salida buena gasta uno).`);
  } else if (isQualiKind(next)) {
    if (next === "SQ") out.push(`Clasificación sprint: <b>medios</b> en SQ1 y SQ2 y <b>blandos</b> en SQ3. Te quedan ${fresh("M")} medios y ${fresh("S")} blandos nuevos por piloto.`);
    else out.push(`Te quedan <b>${fresh("S")} blandos nuevos</b> por piloto para Q1, Q2 y Q3: cada salida gasta uno. En Q1 y Q2 mira el corte, no el primer puesto.`);
  } else {
    const grid = wk.grid(next);
    const pen = next === "RACE" ? wk.penalties() : {};
    out.push(`Salís <b>${mine.map((e) => `${esc(e.d.abrev)} P${grid.indexOf(e.id) + 1}${pen[e.id] ? ` (sanción de ${pen[e.id]} puestos)` : ""}`).join(" y ")}</b>. En la parrilla eliges estrategia, neumático de salida y gasolina: con «Exacto» no sobra nada si atacas; «Con margen» es más seguro.`);
    const worst = DRY.filter((c) => k.noise[c] > 0.1).sort((a, b) => k.noise[b] - k.noise[a])[0];
    if (next === "RACE" && worst) out.push(`Con el ${cname(worst)} tus ingenieros aún tienen un error de ${pctErr(worst)}: si lo usas, vigila cuánto cae en las primeras vueltas y replanifica en el Muro.`);
  }
  return out.slice(0, 3);
}

export function weekendScreen(nav: Nav, s: SeasonState, pending: SessionSnapshot | null = null) {
  const st = s.weekend!;
  const def = CIRCUITS[st.circuitId];
  const track = getTrack(st.circuitId);
  const wk = new Weekend(st, track, TEAMS, s.playerTeam);
  const team = TEAMS.find((t) => t.id === s.playerTeam)!;
  const next = wk.nextKind();
  const outlook = wk.outlook(team.meteo);
  const mine = wk.entrants().filter((e) => e.player);
  const sessions = wk.sessions();
  const nextDay = wk.when(sessions[st.next] ?? "RACE").day;
  const past = st.days.map((d, i) => ({ d, i })).filter(({ i }) => i < nextDay);
  const tips = nextSteps(wk, team, mine, outlook);
  app().innerHTML = `
  <div style="padding-bottom:16px">
    <div class="panel"><div class="hd"><span class="t">Ronda ${st.round} · ${flagHtml(def.bandera)} ${esc(def.pais)}</span><button id="back">Temporada</button></div><div class="bd">
      <h1>${esc(def.gp)}</h1>
      <div class="dim">${esc(def.nombre)} · ${(track.length / 1000).toFixed(3)} km · ${def.vueltas} vueltas${def.formato === "sprint" ? ` · <span class="yellow">fin de semana sprint (${def.vueltasSprint} v)</span>` : ""} · ${fmtDate(def.fecha)}</div>
      <canvas id="mini" style="width:100%;height:150px;margin-top:6px"></canvas>
    </div></div>
    ${tips.length ? `<div class="panel"><div class="hd"><span class="t">¿Y ahora qué?</span></div><div class="bd small">${tips.map((t) => `<div class="tip">${t}</div>`).join("")}</div></div>` : ""}
    <div class="panel"><div class="hd"><span class="t">Programa y previsión</span></div><div class="bd" style="padding:0">
      ${sessions.map((kind, i) => {
        const w = wk.when(kind);
        const res = st.results[kind];
        const isNext = i === st.next;
        const ol = outlook.find((o) => o.kind === kind);
        const top = res?.[0];
        const myRes = res ? res.map((r, k) => ({ r, k })).filter(({ r }) => DRIVERS[r.id].team.id === s.playerTeam).map(({ r, k }) => `${DRIVERS[r.id].d.abrev} P${k + 1}`).join(" · ") : "";
        return `<div class="list-item${isNext ? " next" : ""}">
          <div style="width:62px" class="small dim up">${DAY_NAMES[w.day].slice(0, 3)} ${String(Math.floor(w.clock / 60)).padStart(2, "0")}:${String(w.clock % 60).padStart(2, "0")}</div>
          <div class="grow"><b class="up">${SESSION_NAMES[kind]}</b><br><span class="small dim">${res ? `🏁 ${esc(DRIVERS[top!.id].d.abrev)} ${isRaceKind(kind) ? "" : fmtLap(top!.best)} · <span class="yellow">${myRes}</span>` : ol ? `🌧️ ${Math.round(ol.rain * 100)} % · ${ol.air[0].toFixed(0)}–${ol.air[1].toFixed(0)} °C · asfalto ~${ol.track.toFixed(0)} °C` : ""}</span></div>
          ${res ? `<button data-res="${kind}">Ver</button>` : isNext ? (pending ? `<button class="red" id="resume">Reanudar</button>` : `<button id="sim" title="El equipo lleva a tus pilotos y se calcula la sesión entera">Simular</button><button class="red" id="play">Empezar</button>`) : ""}
        </div>`;
      }).join("")}
      <div class="small dim" style="padding:6px 10px">${next ? `Previsión de tu meteorólogo (fiabilidad ${team.meteo}/100): probabilidad de lluvia durante la sesión y temperaturas. ` : ""}Clima típico: ${esc(def.clima.fuente)}.${past.length ? ` Hasta ahora: ${past.map(({ d, i }) => `${DAY_NAMES[i].toLowerCase()}, ${SCENARIO_NAMES[d.scenario].toLowerCase()}`).join("; ")}.` : ""}${pending ? ` <span class="yellow">Tienes ${SESSION_NAMES[pending.kind].toLowerCase()} a medias: «Reanudar» la retoma donde la dejaste.</span>` : ""}</div>
    </div></div>
    ${puPanel(st, mine.map((e) => e.id), mine.map((e) => e.d.nombre), team, def.vueltas, track.length / 1000)}
    ${longRunsPanel(weekendLongRuns(st), s.playerTeam)}
    <div class="panel"><div class="hd"><span class="t">Lo que saben tus ingenieros</span></div><div class="bd" style="padding:0">
      ${knowledgeTable(st, track, team, mine[0].d, outlook[0]?.track ?? 30, outlook[0]?.air[1] ?? 20)}
    </div></div>
    <div class="panel"><div class="hd"><span class="t">Tus juegos de neumáticos</span></div><div class="bd">
      ${mine.map((e) => `<div style="margin-bottom:6px"><b>${esc(e.d.nombre)}</b><div class="row wrap small" style="gap:4px;margin-top:3px">${setPills(e.sets)}</div></div>`).join("")}
      <div class="small dim">El porcentaje es la goma que le queda a cada juego; tachados, los devueltos. ${st.sprint ? "Sprint: 12 de seco (6 blandos, 4 medios, 2 duros), 6 intermedios y 3 de lluvia." : "13 de seco (8 blandos, 3 medios, 2 duros), 4 intermedios y 3 de lluvia."} Tras cada libre se devuelven los más gastados. En carrera en seco hay que usar dos compuestos.</div>
    </div></div>
  </div>`;
  drawMini($<HTMLCanvasElement>("#mini"), track);
  wirePu(st, () => { saveSeason(s); const y = window.scrollY; weekendScreen(nav, s, pending); window.scrollTo(0, y); });
  setBack(() => nav.season());
  $("#back").onclick = () => nav.season();
  if (next && pending) $("#resume").onclick = () => nav.session(pending.kind, pending);
  else if (next) {
    $("#play").onclick = () => nav.session(next);
    $("#sim").onclick = () => {
      const what = isRaceKind(next)
        ? `¿Simular ${SESSION_NAMES[next].toLowerCase()} sin entrar? El equipo elige la estrategia y lleva a tus pilotos (paradas, neumáticos y lluvia).`
        : `¿Simular ${SESSION_NAMES[next].toLowerCase()} sin entrar? El equipo lleva el programa de tus pilotos.`;
      if (confirm(what)) nav.simulate(next);
    };
  }
  document.querySelectorAll<HTMLElement>("[data-res]").forEach((b) => (b.onclick = () => { const kind = b.dataset.res as SessionKind; resultsSheet(kind, st.results[kind]!, s.playerTeam, st.scoring?.[kind], st.summaries?.[kind]); }));
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

// --------------------------------------------------------------- tandas largas
/**
 * Tandas largas de libres, por compuesto y de más rápida a más lenta. El ritmo está corregido a
 * depósito vacío para poder comparar tandas con distinta carga; la caída es lo que pierde por vuelta.
 */
export function longRunsPanel(runs: { kind: SessionKind; r: LongRun }[], playerTeam: string): string {
  const dry = runs.filter((x) => !x.r.wet);
  if (!dry.length) return "";
  const rows = (["S", "M", "H"] as Compound[]).map((c) => {
    const list = dry.filter((x) => x.r.c === c).sort((a, b) => a.r.avg - b.r.avg);
    if (!list.length) return "";
    const best = list[0].r.avg;
    return list.map((x, i) => {
      const dd = DRIVERS[x.r.id];
      return `<tr class="${dd.team.id === playerTeam ? "me" : ""}"><td>${i === 0 ? tyreHtml(c) : ""}</td><td><span class="teamdot" style="background:${dd.team.color}"></span>${esc(dd.d.abrev)} <span class="dim small">${SESSION_NAMES[x.kind].replace("Libres ", "L")}</span></td><td class="mono">${x.r.n}</td><td class="mono">${fmtLap(x.r.avg)}</td><td class="mono">${i === 0 ? "" : `+${(x.r.avg - best).toFixed(2)}`}</td><td class="mono ${x.r.deg > 0.12 ? "redt" : ""}">${x.r.deg >= 0 ? "+" : "−"}${Math.abs(x.r.deg).toFixed(2)}</td></tr>`;
    }).join("");
  }).join("");
  return `<div class="panel"><div class="hd"><span class="t">Tandas largas</span></div><div class="bd" style="padding:0">
    <table class="tv"><tr><th></th><th>Piloto</th><th>V</th><th>Ritmo</th><th>Dif.</th><th>Caída/v</th></tr>${rows}</table>
    <div class="small dim" style="padding:6px 10px">Ritmo medio corregido a depósito vacío (para comparar tandas con distinta carga). Caída/v: lo que pierde por vuelta con el desgaste. En rojo, las que caen mucho.</div>
  </div></div>`;
}

// --------------------------------------------------------------- resultados
const pointsOf = (kind: SessionKind, table?: number[]) => table ?? (kind === "RACE" ? RACE_POINTS : kind === "SPRINT" ? SPRINT_POINTS : []);
/** Plazas ganadas o perdidas desde la parrilla: ▲3, ▼2 o =. */
function gainHtml(r: ResultRow, pos: number): string {
  if (!r.grid) return "";
  const d = r.grid - pos;
  return d > 0 ? `<span class="green">▲${d}</span>` : d < 0 ? `<span class="redt">▼${-d}</span>` : `<span class="dim">=</span>`;
}

export function resultsTable(kind: SessionKind, rows: ResultRow[], playerTeam: string, table?: number[]): string {
  const race = isRaceKind(kind);
  const pts = pointsOf(kind, table);
  const lead = rows[0];
  const bestLap = rows.reduce((b, r) => Math.min(b, r.best ?? Infinity), Infinity);
  const hasGrid = race && rows.some((r) => r.grid);
  return `<table class="tv"><tr><th>#</th><th>Piloto</th><th>${race ? "Tiempo" : "Mejor"}</th>${race ? `${hasGrid ? `<th title="Plazas ganadas o perdidas desde la parrilla">±</th>` : ""}<th title="Paradas">Par.</th><th>Pts</th>` : "<th>V</th>"}</tr>
    ${rows.map((r, i) => {
      const d = DRIVERS[r.id];
      const t = race
        ? r.status === "out" || r.status === "dns" || r.status === "dsq" ? `<span class="redt">${esc(r.reason ?? "abandono")}</span>` : i === 0 ? fmtRace(r.time) : r.laps < lead.laps ? `+${lead.laps - r.laps} v` : `+${(r.time - lead.time).toFixed(3)}`
        : `${fmtLap(r.best)} <span class="dim small">${r.part ?? ""}</span>`;
      const p = race && r.status === "fin" ? pts[i] ?? "" : "";
      return `<tr class="${d.team.id === playerTeam ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td class="nm"><span class="teamdot" style="background:${d.team.color}"></span>${esc(d.d.nombre)}${r.best === bestLap && isFinite(bestLap) && race ? ' <span class="purple">⏱</span>' : ""}</td><td class="mono">${t}</td>${race ? `${hasGrid ? `<td class="mono small">${gainHtml(r, i + 1)}</td>` : ""}<td class="mono">${r.stops}</td><td class="mono"><b>${p}</b></td>` : `<td class="mono">${r.laps}</td>`}</tr>`;
    }).join("")}</table>`;
}

/** Cómo les ha ido a tus dos pilotos, arriba del todo: lo primero que se quiere saber. */
export function mineHeadline(kind: SessionKind, rows: ResultRow[], playerTeam: string, table?: number[]): string {
  const race = isRaceKind(kind);
  const pts = pointsOf(kind, table);
  const lines = rows.map((r, i) => ({ r, i })).filter(({ r }) => DRIVERS[r.id].team.id === playerTeam).map(({ r, i }) => {
    const d = DRIVERS[r.id];
    let detail: string;
    if (race) {
      const out = r.status === "out" || r.status === "dns" || r.status === "dsq";
      const p = r.status === "fin" ? pts[i] ?? 0 : 0;
      detail = `${out ? `<span class="redt">${esc(r.reason ?? "abandono")}</span>` : r.grid ? `salía P${r.grid} ${gainHtml(r, i + 1)}` : ""} · <b class="${p ? "yellow" : "dim"}">${p ? `+${p} pts` : "sin puntos"}</b>`;
    } else if (isQualiKind(kind)) {
      detail = `${fmtLap(r.best)} · ${r.part && !/3$/.test(r.part) ? `<span class="redt">eliminado en ${r.part}</span>` : `<span class="green">en ${r.part ?? "la última parte"}</span>`}`;
    } else {
      detail = `${fmtLap(r.best)}${i > 0 && isFinite(r.best) && isFinite(rows[0].best) ? ` (+${(r.best - rows[0].best).toFixed(3)})` : ""} · ${r.laps} v`;
    }
    return `<div class="row mineline"><span class="posbox mono">${i + 1}</span><b class="up">${esc(d.d.nombre)}</b><span class="grow small" style="text-align:right">${detail}</span></div>`;
  });
  return lines.length ? `<div class="panel"><div class="hd"><span class="t">Tus pilotos</span></div><div class="bd">${lines.join("")}</div></div>` : "";
}

export function resultsSheet(kind: SessionKind, rows: ResultRow[], playerTeam: string, table?: number[], sum?: RaceSummary) {
  const { el } = sheet(`<div class="row"><h1 class="grow" style="font-size:18px">${SESSION_NAMES[kind]}</h1><button data-close>Cerrar</button></div>${resultsTable(kind, rows, playerTeam, table)}${sum ? `<div class="sumwrap">${raceSummaryHtml(sum)}</div>` : ""}<button data-close style="width:100%;margin-top:10px">Cerrar</button>`);
  if (sum) requestAnimationFrame(() => drawRaceSummary(sum, el));
}

export function resultsScreen(kind: SessionKind, rows: ResultRow[], s: SeasonState, gp: string, extra: string, onContinue: () => void) {
  const table = s.weekend?.scoring?.[kind] ?? (kind === "RACE" ? s.rounds[s.rounds.length - 1]?.raceTable : undefined);
  app().innerHTML = `<div style="padding-bottom:8px">
    ${mineHeadline(kind, rows, s.playerTeam, table)}
    <div class="panel"><div class="hd"><span class="t">🏁 ${SESSION_NAMES[kind]} · ${esc(gp)}</span></div><div class="bd" style="padding:0">${resultsTable(kind, rows, s.playerTeam, table)}</div></div>
    ${extra}
    <div class="sticky-cta"><button class="red big-cta" id="cont">Continuar</button></div></div>`;
  setBack(onContinue);
  $("#cont").onclick = onContinue;
}
