import "./style.css";
import circuitDef from "../../data/circuito-sierra.json";
import equiposDef from "../../data/equipos.json";
import { buildTrack, Track } from "../sim/track";
import { Race, Car, TeamDef, PUSH_NAMES, ENGINE_NAMES, ERS_NAMES, RaceEvent } from "../sim/race";
import { COMPOUNDS, Compound, DRY } from "../sim/tyres";
import { rainAt, forecast, preRaceOutlook, SCENARIO_NAMES, Scenario } from "../sim/weather";
import { stintProfile, pitLoss } from "../sim/strategy";
import { Rng } from "../sim/rng";

const track: Track = buildTrack(circuitDef);
const TEAMS = equiposDef.equipos as TeamDef[];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const app = document.getElementById("app")!;

let playerTeam = localStorage.getItem("equipo") ?? "halcon";
let seed = Math.floor(Math.random() * 1e6);
let race: Race;
let speed = 4;
let paused = true;
let autoPause = localStorage.getItem("autopausa") !== "0";
let tab: "clas" | "pilotos" | "tiempo" | "radio" = "clas";
let forcedScenario: Scenario | "" = "";
let lastPilots = 0;
let raf = 0;

const $ = (sel: string, root: ParentNode = document) => root.querySelector(sel) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const fmtLap = (t: number) => (isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}` : "—");
const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const tyreHtml = (c: Compound, big = false) => `<span class="tyre${big ? " big" : ""}" style="border-color:${COMPOUNDS[c].color}">${c === "W" ? "W" : c}</span>`;
const myCars = () => race.cars.filter((c) => c.player).sort((a, b) => a.team.pilotos.indexOf(a.d) - b.team.pilotos.indexOf(b.d));

function newRace() {
  race = new Race({ seed, track, teams: TEAMS, playerTeam, scenario: forcedScenario || undefined });
}

// =================================================================== PREVIA
function briefing() {
  cancelAnimationFrame(raf);
  newRace();
  const team = TEAMS.find((t) => t.id === playerTeam)!;
  const outlook = preRaceOutlook(seed, race.weather.scenario, team.meteo, 85);
  const nr = new Rng(seed ^ 0xabc);
  const airErr = 2.5 * (1.3 - team.meteo / 100);
  const airLo = race.weather.airT + nr.gauss(0, airErr) - 1.5, airHi = airLo + 3;
  const grid = race.order();
  const me = myCars();
  const k = me[0].knowledge;
  const unc = Math.round(k.noise * 100);
  const rows = DRY.map((c) => {
    const p = stintProfile(race, me[0], k, c);
    const sp = COMPOUNDS[c];
    const life = p.wear.findIndex((w) => w > sp.cliff);
    const pace = p.dt[4] - stintProfile(race, me[0], k, "M").dt[4];
    const wpl = (p.wear[9] / 10) * 100;
    return `<tr><td>${tyreHtml(c)} ${sp.name}</td><td class="mono">${pace >= 0 ? "+" : ""}${pace.toFixed(2)} s</td><td class="mono">${wpl.toFixed(1)} %</td><td class="mono">${life < 0 ? "60+" : `${Math.round(life * (1 - k.noise))}–${Math.round(life * (1 + k.noise))}`}</td></tr>`;
  }).join("");
  const planTxt = (car: Car) => car.plan.stints.map((s, i) => `${tyreHtml(s.c)} ${i < car.plan.stints.length - 1 ? `→ v${s.endLap}` : ""}`).join(" ");
  app.innerHTML = `
  <div style="padding-bottom:20px">
    <div class="card">
      <h1>Muro de Boxes</h1>
      <div class="dim">${esc(track.name)} · ${track.laps} vueltas · ${(track.length / 1000).toFixed(3)} km</div>
      <div class="row wrap" style="margin-top:10px">
        <label class="grow">Equipo<br><select id="team" style="width:100%">${TEAMS.map((t) => `<option value="${t.id}" ${t.id === playerTeam ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}</select></label>
        <label>Semilla<br><input id="seed" class="mono" style="width:100px" value="${seed}" inputmode="numeric"></label>
        <button id="dice" style="align-self:flex-end">🎲</button>
      </div>
      <label class="small dim" style="display:block;margin-top:8px">Tiempo del día<br><select id="scn" style="width:100%">
        <option value="">Aleatorio (no sabes lo que viene)</option>
        ${(Object.keys(SCENARIO_NAMES) as Scenario[]).map((k) => `<option value="${k}" ${forcedScenario === k ? "selected" : ""}>Forzar: ${SCENARIO_NAMES[k]}</option>`).join("")}
      </select></label>
    </div>
    <div class="card">
      <h2>Previsión del meteorólogo</h2>
      <div class="kv">
        <span>Lluvia durante la carrera</span><b>${Math.round(outlook.rainProb * 100)} %</b>
        <span>Temperatura del aire</span><b>${airLo.toFixed(0)}–${airHi.toFixed(0)} °C</b>
        <span>Asfalto ahora</span><b>${race.weather.trackT.toFixed(0)} °C</b>
        <span>Viento</span><b>${race.weather.surfaceWind.toFixed(0)} km/h</b>
      </div>
      <div class="small dim" style="margin-top:6px">Fiabilidad del meteorólogo de ${esc(team.nombre)}: ${team.meteo}/100</div>
    </div>
    <div class="card">
      <h2>Datos de los libres (estimación)</h2>
      <table class="simple"><tr><th>Compuesto</th><th>Ritmo v5</th><th>Desgaste/v</th><th>Vida (v)</th></tr>${rows}</table>
      <div class="small dim" style="margin-top:6px">Cada vuelta de combustible (${race.fuelPerLap} kg) cuesta ~${(race.fuelPerLap * track.ms.reduce((a, m) => a + m.dMass, 0)).toFixed(3)} s por vuelta. Ir justo obliga a ahorrar (levantar antes de frenar) en algún momento.</div>
      <div class="small dim" style="margin-top:6px">Margen de error de tus ingenieros: ±${unc} %. El desgaste real puede salir mayor o menor; lo irás viendo en carrera. Pérdida en boxes ≈ ${(pitLoss(race) + team.boxes).toFixed(0)} s.</div>
    </div>
    <div class="card">
      <h2>Tus pilotos</h2>
      ${me.map((c, i) => `
        <div style="margin-bottom:10px">
          <div class="row"><b>P${grid.indexOf(c) + 1}</b> ${esc(c.d.nombre)} <span class="dim">#${c.d.numero}</span></div>
          <div class="small dim" style="margin:3px 0">Estrategia recomendada: <span id="plan${i}">${planTxt(c)}</span></div>
          <div class="small dim">Neumático de salida</div>
          <div class="seg" data-start="${i}">${["S", "M", "H"].map((cc) => `<button data-c="${cc}" class="${c.tyres.c === cc ? "on" : ""}">${COMPOUNDS[cc as Compound].name}</button>`).join("")}</div>
          <div class="small dim">Combustible</div>
          <div class="seg" data-fuel="${i}">${[[-1.2, "Muy justo"], [-0.5, "Justo"], [0, "Exacto"], [0.6, "Con margen"]].map(([v, n]) => `<button data-v="${v}" class="${Math.abs(race.fuelMargin(c) - (v as number)) < 0.05 ? "on" : ""}">${n}<br><span class="small dim">${(v as number) > 0 ? "+" : ""}${v} v</span></button>`).join("")}</div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>Parrilla</h2>
      <table class="simple">${grid.map((c, i) => `<tr ${c.player ? 'style="background:#241a20"' : ""}><td class="mono">${i + 1}</td><td><span style="color:${c.team.color}">■</span> ${esc(c.d.nombre)}</td><td class="dim small">${esc(c.team.nombre)}</td></tr>`).join("")}</table>
    </div>
    <div style="padding:0 12px"><button class="primary" id="go" style="width:100%;padding:14px;font-size:16px">🚦 A la parrilla</button></div>
  </div>`;
  $("#team").onchange = (e) => { playerTeam = (e.target as HTMLSelectElement).value; localStorage.setItem("equipo", playerTeam); briefing(); };
  $("#seed").onchange = (e) => { seed = Number((e.target as HTMLInputElement).value) || 1; briefing(); };
  $("#dice").onclick = () => { seed = Math.floor(Math.random() * 1e6); briefing(); };
  document.querySelectorAll<HTMLElement>("[data-start]").forEach((seg) => {
    const i = Number(seg.dataset.start);
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => {
      race.setStartTyre(me[i], b.dataset.c as Compound);
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      $("#plan" + i).innerHTML = planTxt(me[i]);
    }));
  });
  document.querySelectorAll<HTMLElement>("[data-fuel]").forEach((seg) => {
    const i = Number(seg.dataset.fuel);
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => {
      race.setFuel(me[i], Number(b.dataset.v));
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    }));
  });
  $("#scn").onchange = (e) => { forcedScenario = (e.target as HTMLSelectElement).value as Scenario | ""; briefing(); };
  $("#go").onclick = startRace;
}

// =================================================================== CARRERA
let toastTimer = 0;
let lastUi = 0;
let leftover = 0;
let sheetOpen = false;

function startRace() {
  paused = true;
  speed = 4;
  tab = "clas";
  race.onEvent = onEvent;
  app.innerHTML = `
  <div id="race">
    <div class="top">
      <span class="lap mono" id="lap"></span>
      <span class="flag" id="flag"></span>
      <span class="mono dim small" id="clock"></span>
      <div class="speed" id="speed"></div>
    </div>
    <div class="wx mono" id="wx"></div>
    <div class="mapwrap">
      <canvas id="map"></canvas>
      <div class="toast" id="toast"></div>
    </div>
    <div class="tabs" id="tabs">
      <button data-t="clas">Clasificación</button><button data-t="pilotos">Pilotos</button><button data-t="tiempo">Tiempo</button><button data-t="radio">Radio</button>
    </div>
    <div class="pane" id="pane"></div>
    <div class="controls" id="controls"></div>
  </div>`;
  const sp = $("#speed");
  sp.innerHTML = `<button data-s="0">⏸</button>` + [1, 4, 16, 64].map((s) => `<button data-s="${s}">${s}×</button>`).join("");
  sp.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    const s = Number(b.dataset.s);
    if (s === 0) paused = !paused;
    else { speed = s; paused = false; }
    hideToast();
    updateSpeedBtns();
  };
  $("#tabs").onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    tab = b.dataset.t as typeof tab;
    renderPane(true);
  };
  $("#toast").onclick = () => { hideToast(); paused = false; updateSpeedBtns(); };
  sizeMap();
  window.onresize = sizeMap;
  updateSpeedBtns();
  renderPane(true);
  renderControls();
  showToast("Pulsa una velocidad para dar la salida. La carrera se pausa sola cuando hay que decidir algo.");
  let last = performance.now();
  const loop = (now: number) => {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && !race.finished) {
      leftover += real * speed;
      let n = 0;
      while (leftover >= race.dt && n < 400) {
        race.step();
        leftover -= race.dt;
        n++;
        if (paused) { leftover = 0; break; }
      }
    }
    drawMap();
    if (now - lastUi > 250) {
      lastUi = now;
      renderTop();
      if (!sheetOpen) { renderPane(false); renderControls(); }
    }
    if (race.finished && !paused) { paused = true; setTimeout(results, 1200); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function onEvent(e: RaceEvent) {
  const mine = e.carId !== undefined && race.cars[e.carId]?.player;
  if (e.pause && autoPause && (mine || e.kind === "control" || e.kind === "weather")) {
    paused = true;
    leftover = 0;
    showToast(e.text + "<div class='small dim' style='margin-top:4px'>Toca para seguir</div>");
    updateSpeedBtns();
  } else if (mine && e.important) {
    showToast(e.text, 4000);
  }
}

function showToast(html: string, ms = 0) {
  const t = $("#toast");
  if (!t) return;
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(toastTimer);
  if (ms) toastTimer = window.setTimeout(hideToast, ms);
}
function hideToast() { $("#toast")?.classList.remove("show"); }

function updateSpeedBtns() {
  document.querySelectorAll<HTMLButtonElement>("#speed button").forEach((b) => {
    const s = Number(b.dataset.s);
    b.classList.toggle("on", s === 0 ? paused : !paused && s === speed);
  });
}

function renderTop() {
  $("#lap").textContent = `V${Math.min(race.track.laps, race.leaderLap + 1)}/${race.track.laps}`;
  const f = $("#flag");
  const names = { green: "VERDE", vsc: "VSC", sc: "SC", sc_in: "SC ENTRA", red: "ROJA" };
  f.textContent = race.chequered ? "🏁" : names[race.flag];
  f.className = "flag " + race.flag;
  $("#clock").textContent = fmtClock(race.t);
  const w = race.weather;
  const rain = race.rainOnTrack();
  $("#wx").innerHTML = `🌡️ ${w.airT.toFixed(0)}° · asfalto ${w.trackT.toFixed(0)}° · ${rain > 0.1 ? `🌧️ ${rain.toFixed(1)} mm/h` : w.cloud > 0.6 ? "☁️ cubierto" : w.cloud > 0.3 ? "⛅ nubes" : "☀️ sol"} · agua ${race.avgWater().toFixed(2)} mm`;
}

// --------------------------------------------------------------- mapa
let mapScale = 1, mapOx = 0, mapOy = 0;
function sizeMap() {
  const cv = $("#map") as HTMLCanvasElement;
  if (!cv) return;
  const w = Math.min(window.innerWidth, 520);
  const h = Math.round(Math.min(w * 0.62, window.innerHeight * 0.3));
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.height = h + "px";
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < track.xs.length; i++) {
    minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]);
    miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]);
  }
  const pad = 16 * dpr;
  mapScale = Math.min((cv.width - 2 * pad) / (maxx - minx), (cv.height - 2 * pad) / (maxy - miny));
  mapOx = (cv.width - (maxx - minx) * mapScale) / 2 - minx * mapScale;
  mapOy = (cv.height - (maxy - miny) * mapScale) / 2 + maxy * mapScale;
}
const mx = (x: number) => mapOx + x * mapScale;
const my = (y: number) => mapOy - y * mapScale;

function drawMap() {
  const cv = $("#map") as HTMLCanvasElement;
  if (!cv) return;
  const g = cv.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  g.clearRect(0, 0, cv.width, cv.height);
  // trazado por minisector, teñido por agua
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const m of track.ms) {
    const i0 = Math.floor(m.s0 / track.ds), i1 = Math.min(track.xs.length - 1, Math.floor(m.s1 / track.ds));
    const w = race.water[m.i];
    g.strokeStyle = w > 0.05 ? `rgba(58,139,232,${Math.min(1, 0.35 + w * 0.6)})` : m.drs ? "#3d4a3f" : "#3a404c";
    g.lineWidth = 7 * dpr;
    g.beginPath();
    g.moveTo(mx(track.xs[i0]), my(track.ys[i0]));
    for (let i = i0 + 1; i <= i1 + 1 && i < track.xs.length; i++) g.lineTo(mx(track.xs[i]), my(track.ys[i]));
    if (m.i === track.ms.length - 1) g.lineTo(mx(track.xs[0]), my(track.ys[0]));
    g.stroke();
  }
  // lluvia ahora mismo sobre el circuito
  const rain = race.rainOnTrack();
  if (rain > 0.05) {
    for (const m of track.ms) {
      const r = rainAt(race.weather, m.x / 1000, m.y / 1000);
      if (r < 0.1) continue;
      g.fillStyle = `rgba(90,160,255,${Math.min(0.14, r / 40)})`;
      g.beginPath(); g.arc(mx(m.x), my(m.y), 18 * dpr, 0, 7); g.fill();
    }
  }
  // meta
  g.strokeStyle = "#fff"; g.lineWidth = 2 * dpr;
  g.beginPath(); g.moveTo(mx(track.xs[0]), my(track.ys[0]) - 7 * dpr); g.lineTo(mx(track.xs[0]), my(track.ys[0]) + 7 * dpr); g.stroke();
  // coches
  const L = track.length;
  const cars = [...race.cars].sort((a, b) => Number(a.player) - Number(b.player));
  for (const c of cars) {
    if (c.status === "out") continue;
    const s = c.s + (paused ? 0 : c.v * leftover);
    const pos = ((s % L) + L) % L;
    const i = Math.min(track.xs.length - 1, Math.floor(pos / track.ds));
    let x = mx(track.xs[i]), y = my(track.ys[i]);
    if (c.status === "pit") { y += 10 * dpr; }
    const r = (c.player ? 6 : 4.2) * dpr;
    g.fillStyle = c.team.color;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (c.player) {
      g.strokeStyle = "#fff"; g.lineWidth = 1.5 * dpr; g.stroke();
      g.fillStyle = "#fff";
      g.font = `bold ${10 * dpr}px system-ui`;
      g.fillText(c.d.abrev, x + 8 * dpr, y - 6 * dpr);
    }
  }
}

// --------------------------------------------------------------- paneles
function renderPane(force: boolean) {
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
  const p = $("#pane");
  if (tab === "clas") p.innerHTML = towerHtml();
  else if (tab === "pilotos") { if (force || performance.now() - lastPilots > 1000) { lastPilots = performance.now(); pilotsPane(p); } }
  else if (tab === "tiempo") weatherPane(p, force);
  else if (tab === "radio") p.innerHTML = radioHtml();
}

function towerHtml(): string {
  const rows = race.intervals();
  return `<table class="tower mono">${rows.map(({ car: c, gap, interval, lapsDown }, i) => {
    const st = c.status === "out" ? `<span class="out">FUERA</span>` : c.status === "pit" ? `<span class="pit">BOXES</span>` : c.status === "fin" ? "🏁" : "";
    const gapTxt = c.status === "out" ? "" : i === 0 ? "Líder" : lapsDown > 0 ? `+${lapsDown} v` : `+${gap.toFixed(1)}`;
    const intTxt = c.status === "out" || i === 0 || lapsDown > 0 ? "" : `+${interval.toFixed(1)}`;
    const last = c.lapTimes[c.lapTimes.length - 1];
    return `<tr class="${c.player ? "me" : ""}"><td class="pos">${i + 1}</td><td class="bar" style="background:${c.team.color}"></td><td>${c.d.abrev} ${c.drs ? '<span class="pill" style="color:var(--good)">DRS</span>' : ""}</td><td>${tyreHtml(c.tyres.c)}<span class="small dim"> ${c.tyres.laps}</span></td><td class="gap">${gapTxt}</td><td class="gap dim">${intTxt}</td><td class="gap dim small">${st || fmtLap(last)}</td><td class="small dim">${c.stops}p</td></tr>`;
  }).join("")}</table>`;
}

function tempColor(c: Compound, t: number) {
  const sp = COMPOUNDS[c];
  const d = t - sp.opt;
  if (Math.abs(d) < sp.window * 0.5) return "var(--good)";
  if (d < -sp.window) return "var(--blue)";
  if (d > sp.window) return "var(--bad)";
  return "var(--warn)";
}

function pilotsPane(p: HTMLElement) {
  const me = myCars();
  p.innerHTML = me.map((c, idx) => {
    const t = c.tyres;
    const sp = COMPOUNDS[t.c];
    const lapsLeft = race.track.laps - race.lapsDone(c);
    const fuelLaps = c.fuel / race.fuelPerLap;
    const fuelDelta = fuelLaps - lapsLeft;
    const est = race.estLap(c);
    const axle = (name: string, a: typeof t.F) => `
      <div style="border-color:${tempColor(t.c, a.tBulk)}">
        <div class="small dim">${name}</div>
        <div class="t mono" style="color:${tempColor(t.c, a.tBulk)}">${a.tBulk.toFixed(0)}°</div>
        <div class="small dim mono">sup. ${a.tSurf.toFixed(0)}°</div>
        <div class="small mono">${Math.round((1 - a.wear) * 100)} % banda</div>
        ${a.grain > 0.05 ? `<div class="small" style="color:var(--warn)">graining ${Math.round(a.grain * 100)} %</div>` : ""}
        ${a.blister > 0.05 ? `<div class="small" style="color:var(--bad)">ampollas ${Math.round(a.blister * 100)} %</div>` : ""}
      </div>`;
    const seg = (key: string, names: string[], cur: number, auto?: boolean) => `<div class="seg" data-k="${key}" data-i="${idx}">${auto !== undefined ? `<button data-v="auto" class="${auto ? "on" : ""}">Auto</button>` : ""}${names.map((n, i) => `<button data-v="${i}" class="${!auto && cur === i ? "on" : ""}">${n}</button>`).join("")}</div>`;
    const plan = c.plan.stints.slice(c.stops).map((s, i) => `${tyreHtml(s.c)}${i < c.plan.stints.length - c.stops - 1 ? ` hasta v${s.endLap}` : ""}`).join(" → ");
    return `<div class="card">
      <div class="row"><span style="color:${c.team.color};font-size:18px">■</span><b style="font-size:16px">P${race.position(c)} ${esc(c.d.nombre)}</b><span class="grow"></span>${tyreHtml(t.c, true)}</div>
      <div class="small dim" style="margin:4px 0">${sp.name} · ${t.laps} vueltas · ventana ${sp.opt - sp.window}–${sp.opt + sp.window} °C${t.punctured || c.slowPuncture ? ' · <b style="color:var(--bad)">PINCHAZO</b>' : ""}${c.wing > 0 ? ` · <b style="color:var(--warn)">alerón dañado (−${(c.wing * 100).toFixed(1)} %)</b>` : ""}</div>
      <div class="temp">${axle("Delanteros", t.F)}${axle("Traseros", t.R)}</div>
      <div class="kv">
        <span>Última / mejor</span><b class="mono">${fmtLap(c.lapTimes[c.lapTimes.length - 1])} / ${fmtLap(c.best)}</b>
        <span>Ritmo posible ahora</span><b class="mono">${fmtLap(est)}</b>
        <span>Combustible</span><b class="mono" style="color:${fuelDelta < 0 ? "var(--bad)" : fuelDelta < 0.4 ? "var(--warn)" : "inherit"}">${c.fuel.toFixed(1)} kg (${fuelDelta >= 0 ? "+" : ""}${fuelDelta.toFixed(1)} v)</b>
        <span>Batería</span><b class="mono">${(c.soc / 4 * 100).toFixed(0)} %</b>
        <span>Plan</span><b>${plan}</b>
      </div>
      <h2 style="margin-top:10px">Ritmo</h2>${seg("push", PUSH_NAMES, c.push)}
      <h2>Motor</h2>${seg("engine", ENGINE_NAMES, c.engine)}
      <h2>Batería (ERS)</h2>${seg("ers", ERS_NAMES, c.ers, c.autoErs)}
      <button data-let="${idx}" style="width:100%">🔁 Dejar pasar al compañero</button>
    </div>`;
  }).join("") + `<div class="card"><label class="row"><input type="checkbox" id="ap" ${autoPause ? "checked" : ""}> Pausar automáticamente en los momentos clave</label></div>`;
  p.querySelectorAll<HTMLElement>(".seg").forEach((sg) => {
    sg.onclick = (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement;
      if (!b) return;
      const c = me[Number(sg.dataset.i)];
      const k = sg.dataset.k!;
      if (k === "push") c.push = Number(b.dataset.v);
      if (k === "engine") c.engine = Number(b.dataset.v);
      if (k === "ers") { if (b.dataset.v === "auto") c.autoErs = true; else { c.autoErs = false; c.ers = Number(b.dataset.v); } }
      pilotsPane(p);
      renderControls();
    };
  });
  p.querySelectorAll<HTMLButtonElement>("[data-let]").forEach((b) => (b.onclick = () => {
    const c = me[Number(b.dataset.let)];
    race.letTeammatePass(c);
    showToast(`📻 ${c.d.abrev}: "Entendido, dejo pasar a mi compañero."`, 3000);
  }));
  const ap = $("#ap", p) as HTMLInputElement;
  ap.onchange = () => { autoPause = ap.checked; localStorage.setItem("autopausa", autoPause ? "1" : "0"); };
}

let radarCache = { t: -999, fcT: -999 };
let fcData: ReturnType<typeof forecast> | null = null;
function weatherPane(p: HTMLElement, force: boolean) {
  if (force || !$("#radar", p)) {
    p.innerHTML = `<div class="card"><h2>Radar</h2><canvas id="radar" class="radar"></canvas>
      <div class="small dim" id="wind" style="margin-top:6px"></div></div>
      <div class="card"><h2>Previsión en el circuito</h2><div id="fc"></div></div>
      <div class="card"><h2>Pista</h2><div id="trk" class="kv"></div></div>`;
    radarCache.t = -999;
  }
  if (race.t - radarCache.t > 4 || force) { radarCache.t = race.t; drawRadar($("#radar", p) as HTMLCanvasElement); }
  const team = TEAMS.find((t) => t.id === playerTeam)!;
  if (!fcData || race.t - radarCache.fcT > 30 || force) {
    radarCache.fcT = race.t;
    fcData = forecast(race.weather, team.meteo, new Rng(Math.floor(race.t) + seed), 30);
  }
  const f = fcData;
  $("#fc", p).innerHTML = `<div class="fc">${f.horizons.map((h, i) => `<div><span>${Math.round(f.prob[i] * 100)}%</span><i style="height:${Math.max(2, f.prob[i] * 50)}px;opacity:${0.4 + Math.min(0.6, f.p50[i] / 8)}"></i><span>${h === 0 ? "ya" : "+" + h}</span></div>`).join("")}</div>
    <div class="small dim" style="margin-top:6px">Probabilidad de lluvia (minutos). Intensidad esperada: ${f.p50.map((x) => x.toFixed(1)).slice(1, 6).join(" · ")} mm/h. El meteorólogo extrapola lo que ve en el radar; no sabe qué células nacerán ni cuándo se deshará cada una.</div>`;
  const w = race.weather;
  const secs = [0, 1, 2].map((s) => {
    const ms = track.ms.filter((m) => m.sector === s);
    return ms.reduce((a, m) => a + race.water[m.i], 0) / ms.length;
  });
  $("#trk", p).innerHTML = `<span>Aire / asfalto</span><b class="mono">${w.airT.toFixed(1)} / ${w.trackT.toFixed(1)} °C</b>
    <span>Agua S1 / S2 / S3</span><b class="mono">${secs.map((x) => x.toFixed(2)).join(" / ")} mm</b>
    <span>Goma en pista</span><b class="mono">${Math.round(race.rubber * 100)} %</b>
    <span>Nubes</span><b class="mono">${Math.round(w.cloud * 100)} %</b>
    <span>Referencia</span><b class="small dim">lisos hasta ~0,15 mm · intermedios ~0,15–1 mm · lluvia &gt;1 mm</b>`;
  $("#wind", p).innerHTML = `Viento en altura ${w.windSpeed.toFixed(0)} km/h hacia ${dirName(w.windDir)} · superficie ${w.surfaceWind.toFixed(0)} km/h. Radio del radar: 40 km.`;
}

function dirName(a: number) {
  const names = ["el este", "el noreste", "el norte", "el noroeste", "el oeste", "el suroeste", "el sur", "el sureste"];
  return names[Math.round(((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4)) % 8];
}

function radarColor(r: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [[0.2, [80, 160, 230]], [1, [40, 120, 240]], [2.5, [40, 200, 80]], [5, [230, 220, 40]], [10, [240, 140, 30]], [20, [230, 40, 40]], [40, [200, 40, 200]]];
  if (r < 0.2) return [0, 0, 0, 0];
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) {
      const [r0, c0] = stops[i - 1], [r1, c1] = stops[i];
      const t = (r - r0) / (r1 - r0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, 200];
    }
  }
  return [200, 40, 200, 220];
}

function drawRadar(cv: HTMLCanvasElement) {
  const size = 240;
  cv.width = size; cv.height = size;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(size, size);
  const R = 40; // km
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px / size) * 2 * R - R, y = R - (py / size) * 2 * R;
    const r = rainAt(race.weather, x, y);
    const [cr, cg, cb, ca] = radarColor(r);
    const o = (py * size + px) * 4;
    const ground = (Math.sin(x * 0.7) * Math.cos(y * 0.6) + 1) * 4;
    img.data[o] = 18 + ground + (cr - 18) * ca / 255;
    img.data[o + 1] = 24 + ground + (cg - 24) * ca / 255;
    img.data[o + 2] = 20 + ground + (cb - 20) * ca / 255;
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // anillos cada 10 km
  g.strokeStyle = "rgba(255,255,255,0.15)";
  for (let k = 10; k <= 40; k += 10) { g.beginPath(); g.arc(size / 2, size / 2, (k / R) * size / 2, 0, 7); g.stroke(); }
  // circuito
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(size / 2, size / 2, 3, 0, 7); g.fill();
  // viento
  const w = race.weather;
  g.strokeStyle = "#fff"; g.lineWidth = 2;
  const ax = size - 24, ay = 24, dx = Math.cos(w.windDir) * 14, dy = -Math.sin(w.windDir) * 14;
  g.beginPath(); g.moveTo(ax - dx, ay - dy); g.lineTo(ax + dx, ay + dy); g.stroke();
  g.beginPath(); g.arc(ax + dx, ay + dy, 3, 0, 7); g.fill();
}

function radioHtml(): string {
  const evs = race.events.filter((e) => e.kind !== "info" || e.important || (e.carId !== undefined && race.cars[e.carId].player)).slice(-120).reverse();
  return evs.map((e) => `<div class="radio ${e.important ? "imp" : ""}"><span class="when mono">V${e.lap}</span>${e.text}</div>`).join("") || `<div class="radio dim">Sin mensajes todavía.</div>`;
}

// --------------------------------------------------------------- controles
function renderControls() {
  const box = $("#controls");
  if (!box) return;
  const me = myCars();
  const ord = race.order();
  box.innerHTML = me.map((c, i) => {
    const pos = ord.indexOf(c);
    const ahead = ord[pos - 1], behind = ord[pos + 1];
    const ga = ahead && c.status === "run" ? race.gapBetween(ahead, c) : 0;
    const gb = behind && behind.status === "run" ? race.gapBetween(c, behind) : 0;
    const gapTxt = (g: number, lapped: boolean) => (lapped || g > race.lapRefRace * 0.95 ? "1v+" : g.toFixed(1));
    const t = c.tyres;
    const sp = COMPOUNDS[t.c];
    const wear = Math.max(t.F.wear, t.R.wear);
    const life = Math.max(0, 1 - wear);
    const col = wear > sp.cliff ? "var(--bad)" : wear > sp.cliff - 0.12 ? "var(--warn)" : "var(--good)";
    const st = c.status === "out" ? "FUERA" : c.status === "pit" ? "EN BOXES" : c.status === "fin" ? "🏁" : "";
    return `<div class="dc">
      <div class="head"><span class="p mono">P${pos + 1}</span><span class="n">${c.d.abrev}</span><span class="grow"></span>${tyreHtml(t.c)}<span class="small mono">${t.laps}</span></div>
      <div class="wearbar"><i style="width:${life * 100}%;background:${col}"></i></div>
      <div class="meta mono"><span>${ahead ? `▲${gapTxt(ga, race.lapsDone(ahead) > race.lapsDone(c) + 1)}` : "—"}</span><span>${st || PUSH_NAMES[c.push]}</span><span>${behind && behind.status !== "out" ? `▼${gapTxt(gb, race.lapsDone(c) > race.lapsDone(behind) + 1)}` : "—"}</span></div>
      <div class="btns">
        <button data-push="${i}" data-d="-1">−</button>
        <button data-push="${i}" data-d="1">+</button>
        <button class="box ${c.pitRequest ? "on" : ""}" data-box="${i}" ${c.status !== "run" ? "disabled" : ""}>${c.pitRequest ? `BOX ${c.pitRequest}` : "BOX"}</button>
      </div>
    </div>`;
  }).join("");
  box.querySelectorAll<HTMLButtonElement>("[data-push]").forEach((b) => (b.onclick = () => {
    const c = me[Number(b.dataset.push)];
    c.push = Math.max(0, Math.min(4, c.push + Number(b.dataset.d)));
    renderControls();
  }));
  box.querySelectorAll<HTMLButtonElement>("[data-box]").forEach((b) => (b.onclick = () => openBox(me[Number(b.dataset.box)])));
}

function openBox(c: Car) {
  sheetOpen = true;
  const k = c.knowledge;
  const left = race.track.laps - race.lapsDone(c);
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  const opts = (["S", "M", "H", "I", "W"] as Compound[]).map((cc) => {
    let info = "";
    if (DRY.includes(cc)) {
      const p = stintProfile(race, c, k, cc);
      const life = p.wear.findIndex((w) => w > COMPOUNDS[cc].cliff);
      info = `~${life < 0 ? "60+" : life} v`;
    } else info = cc === "I" ? "mojado" : "lluvia";
    return `<button data-c="${cc}" class="${c.pitRequest === cc ? "on" : ""}">${tyreHtml(cc, true)}<span>${COMPOUNDS[cc].name}</span><span class="dim">${info}</span></button>`;
  }).join("");
  const used = [...c.usedCompounds].map((x) => COMPOUNDS[x].name).join(", ");
  bg.innerHTML = `<div class="sheet">
    <div class="row"><b style="font-size:16px">Parada de ${esc(c.d.nombre)}</b><span class="grow"></span><span class="dim small">quedan ${left} v</span></div>
    <div class="small dim" style="margin-top:4px">Para al final de esta vuelta (si aún no ha pasado la entrada de boxes). Usados: ${used}. En seco hay que usar dos compuestos distintos.</div>
    <div class="opts">${opts}</div>
    <div class="row"><button id="cancel" class="grow">${c.pitRequest ? "Anular parada" : "Cerrar"}</button></div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); sheetOpen = false; renderControls(); };
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelectorAll<HTMLButtonElement>("[data-c]").forEach((b) => (b.onclick = () => {
    c.pitRequest = b.dataset.c as Compound;
    showToast(`📻 Ingeniero: "${c.d.abrev}, box, box. Montamos ${COMPOUNDS[c.pitRequest].name.toLowerCase()}."`, 3000);
    close();
  }));
  $("#cancel", bg).onclick = () => { c.pitRequest = null; close(); };
}

// =================================================================== RESULTADOS
function results() {
  cancelAnimationFrame(raf);
  const ord = race.order();
  const best = ord.reduce((b, c) => (c.best < b.best ? c : b), ord[0]);
  const leader = ord[0];
  app.innerHTML = `<div style="padding-bottom:20px">
    <div class="card"><h1>🏁 Resultado</h1><div class="dim">${esc(track.name)} · ${SCENARIO_NAMES[race.weather.scenario]} · semilla ${seed}</div></div>
    <div class="card"><table class="simple">
      <tr><th>#</th><th>Piloto</th><th>Tiempo</th><th>Par.</th><th>Pts</th></tr>
      ${ord.map((c, i) => {
        const laps = race.lapsDone(c);
        const t = c.status === "out" ? `<span style="color:var(--bad)">${esc(c.retireReason ?? "")}</span>` : i === 0 ? fmtClock(c.finishT) : laps < race.lapsDone(leader) ? `+${race.lapsDone(leader) - laps} v` : `+${(c.finishT - leader.finishT).toFixed(1)}`;
        const pts = c.status === "fin" ? (POINTS[i] ?? 0) + (c === best && i < 10 ? 1 : 0) : 0;
        return `<tr ${c.player ? 'style="background:#241a20"' : ""}><td class="mono">${i + 1}</td><td><span style="color:${c.team.color}">■</span> ${esc(c.d.nombre)}${c === best ? " ⏱️" : ""}</td><td class="mono small">${t}</td><td class="mono">${c.stops}</td><td class="mono">${pts || ""}</td></tr>`;
      }).join("")}
    </table>
    <div class="small dim" style="margin-top:6px">⏱️ Vuelta rápida: ${best.d.abrev} ${fmtLap(best.best)}</div></div>
    <div class="card"><h2>Lo que nadie sabía</h2><div class="kv small">
      ${DRY.map((c) => `<span>Desgaste real del ${COMPOUNDS[c].name.toLowerCase()}</span><b>${race.hidden.wearMult[c] >= 1 ? "+" : ""}${Math.round((race.hidden.wearMult[c] - 1) * 100)} % sobre lo previsto</b>`).join("")}
      <span>Temperatura de neumáticos</span><b>${race.hidden.thermalOffset >= 0 ? "+" : ""}${race.hidden.thermalOffset.toFixed(1)} °C sobre lo previsto</b>
    </div></div>
    <div style="padding:0 12px" class="row"><button id="again" class="grow">↺ Repetir (misma semilla)</button><button id="next" class="primary grow">Nueva carrera</button></div>
  </div>`;
  $("#again").onclick = () => briefing();
  $("#next").onclick = () => { seed = Math.floor(Math.random() * 1e6); briefing(); };
}

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
briefing();
