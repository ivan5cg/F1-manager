import { $, esc, fmtLap, fmtClock, tyreHtml, setLabel, sheet, radarColor, dirName } from "./common";
import { CIRCUITS, TEAMS } from "./data";
import { Weekend } from "../sim/weekend";
import { Session, Car, RaceEvent, SESSION_NAMES, SessionKind, isRaceKind, isQualiKind, PUSH_NAMES, ENGINE_NAMES, ERS_NAMES, SOC_MAX } from "../sim/session";
import { COMPOUNDS, Compound, DRY, ALL, setWear, TyreSet } from "../sim/tyres";
import { rainAt, forecast } from "../sim/weather";
import { makeRun, availableSets, stintProfile } from "../sim/strategy";
import { Rng } from "../sim/rng";

type TowerMode = "int" | "gap" | "tyre";

export function sessionView(wk: Weekend, kind: SessionKind, onFinish: (s: Session) => void) {
  const app = document.getElementById("app")!;
  const def = CIRCUITS[wk.st.circuitId];
  const track = wk.track;
  const sess = wk.build(kind);
  const race = isRaceKind(kind);
  const quali = isQualiKind(kind);
  let speed = race ? 4 : 16;
  let paused = true;
  let autoPause = localStorage.getItem("autopausa") !== "0";
  let mode: TowerMode = "int";
  let leftover = 0;
  let raf = 0;
  let lastUi = 0;
  let sheetOpen = false;
  let skipping = false;
  let ended = false;
  let toastTimer = 0;
  const mine = () => sess.cars.filter((c) => c.player).sort((a, b) => a.id - b.id);
  let onbId = mine()[0].id; // piloto de la cámara onboard
  const tvName = (c: Car) => { const parts = c.d.nombre.split(" "); return `${parts[0][0]} ${parts.slice(1).join(" ")}`.toUpperCase(); };
  const clean = (t: string) => t.replace(/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D\s]+/u, "");
  const TAB: Record<RaceEvent["kind"], string> = { radio: "Radio del equipo", control: "Dirección de carrera", pit: "Boxes", info: "Carrera", weather: "Meteo", incident: "Incidente" };
  const rmHtml = (tab: string, text: string, cls = "") => `<div class="rm ${cls}"><span class="tab">${tab}</span><div class="bar">${clean(text)}</div></div>`;

  app.innerHTML = `
  <div id="sess">
    <div class="ctrl"><span>${def.bandera}</span><span class="gp">${esc(SESSION_NAMES[kind])} · ${esc(def.nombre)}</span><div class="speed" id="speed"></div></div>
    <div class="lapc mono" id="lapc"></div>
    <div class="main">
      <div class="tower" id="tower"></div>
      <div class="side">
        <div class="mapbox"><canvas id="map"></canvas></div>
        <div class="onb" id="onb"><canvas id="gauge"></canvas><div class="tags" id="onbtags"></div></div>
        <div class="wxbox" id="wx"></div>
        <div class="sidebtns"><button data-s="pilotos">Pilotos</button><button data-s="tiempo">Tiempo</button><button data-s="radio">Radio</button></div>
        <div id="lapban"></div>
        <div class="ticker" id="ticker"></div>
      </div>
    </div>
    <div class="drivers" id="drivers"></div>
    <div class="toast" id="toast"></div>
  </div>`;

  // ------------------------------------------------------------- controles
  const spEl = $("#speed");
  spEl.innerHTML = `<button data-v="0">⏸</button>` + [1, 4, 16, 64].map((s) => `<button data-v="${s}">${s}×</button>`).join("") + `<button data-v="skip" title="Simular hasta el final">⏭</button>`;
  spEl.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.v === "skip") return skipToEnd();
    const s = Number(b.dataset.v);
    if (s === 0) paused = !paused;
    else { speed = s; paused = false; }
    hideToast();
    updSpeed();
  };
  document.querySelectorAll<HTMLElement>(".sidebtns button").forEach((b) => (b.onclick = () => {
    const w = b.dataset.s;
    if (w === "pilotos") pilotsSheet();
    if (w === "tiempo") weatherSheet();
    if (w === "radio") radioSheet();
  }));
  $("#toast").onclick = () => { hideToast(); paused = false; updSpeed(); };
  function updSpeed() {
    spEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      const v = b.dataset.v;
      b.classList.toggle("on", v === "0" ? paused : v === "skip" ? skipping : !paused && Number(v) === speed);
    });
  }
  function showToast(html: string, ms = 0, tab = "Muro") {
    const t = $("#toast");
    if (!t) return;
    const cls = /BANDERA ROJA/.test(html) ? "red" : /SEGURIDAD|Empieza|lluv|Lluvia/i.test(html) ? "ctl" : "";
    t.innerHTML = `<div class="rm ${cls}"><span class="tab">${tab}</span><div class="bar" style="font-size:14px;padding:7px 9px">${clean(html)}</div></div>`;
    t.classList.add("show");
    clearTimeout(toastTimer);
    if (ms) toastTimer = window.setTimeout(hideToast, ms);
  }
  function hideToast() { $("#toast")?.classList.remove("show"); }

  sess.onEvent = (e: RaceEvent) => {
    if (skipping) return;
    const isMine = e.carId !== undefined && sess.carById(e.carId).player;
    if (e.pause && autoPause && (isMine || e.kind === "control" || e.kind === "weather")) {
      paused = true;
      leftover = 0;
      showToast(e.text + "<div class='small dim' style='margin-top:4px'>Toca para seguir</div>", 0, TAB[e.kind]);
      updSpeed();
    } else if (isMine && e.important) showToast(e.text, 3500, TAB[e.kind]);
  };

  // ---------------------------------------------------------------- mapa
  let mapScale = 1, mapOx = 0, mapOy = 0;
  function sizeMap() {
    const cv = $<HTMLCanvasElement>("#map");
    const w = cv.parentElement!.clientWidth;
    const h = Math.round(w * 0.72);
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + "px";
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < track.xs.length; i++) { minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]); miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]); }
    const pad = 10 * dpr;
    mapScale = Math.min((cv.width - 2 * pad) / (maxx - minx), (cv.height - 2 * pad) / (maxy - miny));
    mapOx = (cv.width - (maxx - minx) * mapScale) / 2 - minx * mapScale;
    mapOy = (cv.height - (maxy - miny) * mapScale) / 2 + maxy * mapScale;
  }
  const mx = (x: number) => mapOx + x * mapScale;
  const my = (y: number) => mapOy - y * mapScale;
  function drawMap() {
    const cv = $<HTMLCanvasElement>("#map");
    if (!cv) return;
    const g = cv.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    g.clearRect(0, 0, cv.width, cv.height);
    g.lineCap = "round"; g.lineJoin = "round";
    for (const m of track.ms) {
      const i0 = Math.floor(m.s0 / track.ds), i1 = Math.min(track.xs.length - 1, Math.floor(m.s1 / track.ds));
      const w = sess.water[m.i];
      g.strokeStyle = w > 0.05 ? `rgba(58,139,232,${Math.min(1, 0.4 + w * 0.6)})` : "#5a5d64";
      g.lineWidth = 5 * dpr;
      g.beginPath();
      g.moveTo(mx(track.xs[i0]), my(track.ys[i0]));
      for (let i = i0 + 1; i <= i1 + 1 && i < track.xs.length; i++) g.lineTo(mx(track.xs[i]), my(track.ys[i]));
      if (m.i === track.ms.length - 1) g.lineTo(mx(track.xs[0]), my(track.ys[0]));
      g.stroke();
      const r = rainAt(sess.weather, m.x / 1000, m.y / 1000);
      if (r > 0.15) {
        g.fillStyle = `rgba(110,170,255,${Math.min(0.3, r / 25)})`;
        g.beginPath(); g.arc(mx(m.x), my(m.y), 13 * dpr, 0, 7); g.fill();
      }
    }
    g.strokeStyle = "#fff"; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(mx(track.xs[0]), my(track.ys[0]) - 6 * dpr); g.lineTo(mx(track.xs[0]), my(track.ys[0]) + 6 * dpr); g.stroke();
    const L = track.length;
    const cars = [...sess.cars].sort((a, b) => Number(a.player) - Number(b.player));
    for (const c of cars) {
      if (c.loc !== "track" && c.loc !== "pit") continue;
      const s = c.s + (paused ? 0 : c.v * leftover);
      const pos = ((s % L) + L) % L;
      const i = Math.min(track.xs.length - 1, Math.floor(pos / track.ds));
      const x = mx(track.xs[i]), y = my(track.ys[i]) + (c.loc === "pit" ? 7 * dpr : 0);
      const r = (c.player ? 5 : 3.6) * dpr;
      g.fillStyle = c.team.color;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (c.player) {
        g.strokeStyle = "#fff"; g.lineWidth = 1.5 * dpr; g.stroke();
        g.fillStyle = "#fff"; g.font = `900 ${9 * dpr}px "Titillium Web", sans-serif`;
        g.fillText(c.d.abrev, x + 6 * dpr, y - 5 * dpr);
      }
    }
  }

  // --------------------------------------------------------------- torre
  const towerEl = $("#tower");
  towerEl.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".th button")) {
      mode = race ? (mode === "int" ? "gap" : mode === "gap" ? "tyre" : "int") : mode === "int" ? "gap" : mode === "gap" ? "tyre" : "int";
      renderTower();
    }
  });
  function statusFlag(c: Car): string {
    if (c.loc === "out") return `<span class="flag outl">OUT</span>`;
    if (c.loc === "pit" || c.loc === "lane_in" || c.loc === "lane_out") return `<span class="flag pit">PIT</span>`;
    if (!race && c.loc === "garage") return "";
    if (!race && c.run?.phase === "out") return `<span class="flag outl">OUT LAP</span>`;
    if (c.drs) return `<span class="flag mo">MO</span>`;
    return "";
  }
  function renderTower() {
    const rows = sess.intervals();
    const part = sess.parts[sess.part];
    const sessBest = Math.min(...sess.cars.map((c) => (quali ? c.bestByPart[sess.part] ?? Infinity : c.best)));
    const modeName = race ? { int: "Intervalo", gap: "Líder", tyre: "Neumático" }[mode] : { int: "Tiempo", gap: "Dif.", tyre: "Neumático" }[mode];
    let head = "";
    if (race) head = `Vuelta ${Math.min(sess.laps, sess.leaderLap + 1)}/${sess.laps}`;
    else if (quali) head = `${part?.name ?? ""}`;
    else head = SESSION_NAMES[kind];
    let html = `<div class="th"><span class="tab">${head}</span><button>${modeName}</button></div>`;
    const cutAt = quali && part?.advance ? part.advance : -1;
    rows.forEach(({ car: c, gap, interval, lapsDown }, i) => {
      if (i === cutAt) html += `<div class="cut"></div>`;
      let g = "";
      if (race) {
        if (c.loc === "out") g = "OUT";
        else if (mode === "tyre") g = `${c.tyres ? c.tyres.laps : ""}`;
        else if (i === 0) g = c.loc === "fin" ? "🏁" : mode === "int" ? "Intervalo" : "Líder";
        else if (lapsDown > 0) g = `+${lapsDown} V`;
        else g = `+${Math.max(0, mode === "int" ? interval : gap).toFixed(1)}`;
      } else {
        const b = quali ? c.bestByPart[c.eliminated ? c.elimPart! : sess.part] : c.best;
        if (mode === "tyre") g = c.tyres ? `${c.tyres.laps}` : "";
        else if (b === undefined || !isFinite(b)) g = c.eliminated ? "" : "—";
        else if (mode === "gap" && i > 0 && isFinite(gap)) g = `+${gap.toFixed(3)}`;
        else g = `<span class="${b === sessBest ? "purple" : ""}">${fmtLap(b)}</span>`;
        if (c.eliminated) g = `<span class="dim">${g}</span>`;
      }
      const tyre = c.tyres && (race || c.loc !== "garage") ? tyreHtml(c.tyres.c) : "";
      html += `<div class="tr${c.player ? " me" : ""}${c.loc === "out" || c.eliminated ? " out" : ""}"><span class="p">${i + 1}</span><span class="c" style="background:${c.team.color}"></span><span class="body"><span class="n">${c.d.abrev}</span>${statusFlag(c)}<span class="g mono">${g}</span><span class="t">${mode === "tyre" || race ? tyre : ""}</span></span></div>`;
    });
    towerEl.innerHTML = html;
  }

  // ------------------------------------------------------------ cabecera
  function renderTop() {
    // contador al estilo TV: [VUELTA][28/71][ESTADO]
    let k = "", v = "", st = "", cls = "";
    if (race) { k = "Vuelta"; v = `${Math.min(sess.laps, sess.leaderLap + 1)}/${sess.laps}`; }
    else if (quali) { k = sess.parts[sess.part]?.name ?? ""; v = fmtClock(sess.inBreak > 0 ? sess.inBreak : sess.remaining()); }
    else { k = SESSION_NAMES[kind]; v = fmtClock(sess.remaining()); }
    const names: Record<string, string> = { vsc: "Coche de seguridad virtual", sc: "Coche de seguridad", sc_in: "El coche de seguridad entra", red: "Bandera roja" };
    if (sess.inBreak > 0) { st = `Empieza en ${fmtClock(sess.inBreak)}`; }
    else if (sess.flag !== "green") { st = names[sess.flag]; cls = sess.flag === "red" ? "red" : "sc"; }
    else if (sess.chequered) { st = "Bandera a cuadros"; cls = "chq"; }
    $("#lapc").innerHTML = `<span class="k">${k}</span><span class="v">${v}</span>${st ? `<span class="s ${cls}">${st}</span>` : ""}`;
    const w = sess.weather;
    const rMax = sess.maxRainOnTrack();
    const sw = sess.sectorWater();
    $("#wx").innerHTML = `<span class="tab">Aire</span><span class="bar mono">${w.airT.toFixed(0)}° <span class="dim">pista</span> ${w.trackT.toFixed(0)}°</span>
      <span class="tab">Cielo</span><span class="bar" style="white-space:nowrap">${rMax > 0.15 ? `Lluvia ${rMax.toFixed(rMax < 10 ? 1 : 0)}<span class="small" style="text-transform:none">&nbsp;mm/h</span>` : w.cloud > 0.6 ? "Cubierto" : w.cloud > 0.3 ? "Nubes" : "Sol"}</span>
      <span class="tab">Agua</span><span class="bar"><span class="wxsec grow">${sw.map((x) => `<div title="${x.toFixed(2)} mm" style="background:${x > 0.05 ? `rgba(58,139,232,${Math.min(1, 0.35 + x)})` : "#26282d"}"></div>`).join("")}</span><span class="mono small">${Math.max(...sw).toFixed(2)}</span></span>`;
    const evs = sess.events.filter((e) => e.kind !== "info" || e.important || (e.carId !== undefined && sess.carById(e.carId).player)).slice(-4).reverse();
    $("#ticker").innerHTML = evs.map((e) => rmHtml(TAB[e.kind], e.text, e.kind === "control" && /ROJA/.test(e.text) ? "red" : e.kind === "control" || e.kind === "weather" ? "ctl" : "")).join("");
    // última vuelta de tu piloto (libres/clasificación): [P][NOMBRE][TIEMPO][+DIF]
    const lb = $("#lapban");
    if (!race) {
      const c = sess.carById(onbId);
      const last = c.lapTimes[c.lapTimes.length - 1];
      const ord = sess.timingOrder();
      const pos = ord.indexOf(c) + 1;
      const ref = quali ? ord[0].bestByPart[sess.part] : ord[0].best;
      const mineBest = quali ? c.bestByPart[sess.part] : c.best;
      lb.innerHTML = last ? `<div class="lapbanner"><span class="posbox">${pos}</span><span class="bar grow">${tvName(c)}</span><span class="bar mono">${mineBest && isFinite(mineBest) ? fmtLap(mineBest) : "Sin tiempo"}</span>${ref && mineBest && ord[0] !== c ? `<span class="gold mono">+${(mineBest - ref).toFixed(3)}</span>` : ""}</div>` : "";
    } else lb.innerHTML = "";
  }

  // ------------------------------------------------------------ onboard
  let prevV = 0;
  function drawGauge() {
    const cv = $<HTMLCanvasElement>("#gauge");
    if (!cv) return;
    const c = sess.carById(onbId);
    const dpr = window.devicePixelRatio || 1;
    const S = 96 * dpr;
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2, R = S * 0.44;
    const kmh = c.loc === "track" || c.loc === "pit" ? c.v * 3.6 : 0;
    // arco de velocidad (0-360 km/h)
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineWidth = 5 * dpr; g.lineCap = "butt";
    g.strokeStyle = "rgba(255,255,255,.15)";
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    const f = Math.min(1, kmh / 360);
    const grad = g.createLinearGradient(0, S, S, 0);
    grad.addColorStop(0, "#1f6fd1"); grad.addColorStop(1, "#5fb3ff");
    g.strokeStyle = grad;
    g.beginPath(); g.arc(cx, cy, R, a0, a0 + (a1 - a0) * f); g.stroke();
    g.fillStyle = "rgba(0,0,0,.85)"; g.beginPath(); g.arc(cx, cy, R - 5 * dpr, 0, 7); g.fill();
    // velocidad y marcha
    g.textAlign = "center";
    g.fillStyle = "#39ff6a"; g.font = `900 ${22 * dpr}px "Titillium Web", sans-serif`;
    g.fillText(String(Math.round(kmh)), cx, cy - 4 * dpr);
    g.fillStyle = "#aaa"; g.font = `700 ${7 * dpr}px "Titillium Web", sans-serif`;
    g.fillText("km/h", cx, cy + 5 * dpr);
    const gears = [0, 85, 120, 155, 190, 225, 260, 295];
    let gear = 0;
    for (let i = 0; i < gears.length; i++) if (kmh >= gears[i]) gear = i + 1;
    g.fillStyle = "#fff"; g.font = `900 ${15 * dpr}px "Titillium Web", sans-serif`;
    g.fillText(kmh < 3 ? "N" : String(gear), cx, cy + 20 * dpr);
    // acelerador / freno a partir del perfil de velocidad
    const L = track.length;
    const pos = ((c.s % L) + L) % L;
    const i = Math.min(track.vref.length - 2, Math.floor(pos / track.ds));
    const ax = (track.vref[i + 1] ** 2 - track.vref[i] ** 2) / (2 * track.ds);
    const moving = kmh > 3 && c.loc === "track";
    const thr = moving ? (ax > -0.5 ? Math.min(1, 0.55 + ax / 8) : 0) : 0;
    const brk = moving ? Math.min(1, Math.max(0, -ax / 35)) : 0;
    const bw = 30 * dpr, bh = 4 * dpr, by = cy + 26 * dpr;
    g.fillStyle = "#333"; g.fillRect(cx - bw - 2 * dpr, by, bw, bh); g.fillRect(cx + 2 * dpr, by, bw, bh);
    g.fillStyle = "#39ff6a"; g.fillRect(cx - bw - 2 * dpr, by, bw * thr, bh);
    g.fillStyle = "#ff3b30"; g.fillRect(cx + 2 * dpr, by, bw * brk, bh);
    // MO (modo adelantamiento) y batería
    g.fillStyle = c.drs ? "#39ff6a" : "#444"; g.font = `900 ${8 * dpr}px "Titillium Web", sans-serif`;
    g.fillText("MO", cx + R * 0.72, cy + R * 0.95);
    const soc = c.soc / SOC_MAX;
    g.fillStyle = "#333"; g.fillRect(cx - R * 0.98, cy + R * 0.45, 5 * dpr, 16 * dpr);
    g.fillStyle = soc > 0.25 ? "#ff3b30" : "#802020"; g.fillRect(cx - R * 0.98, cy + R * 0.45 + 16 * dpr * (1 - soc), 5 * dpr, 16 * dpr * soc);
    prevV = kmh;
  }
  function renderOnbTags() {
    const c = sess.carById(onbId);
    const others = mine().filter((x) => x.id !== onbId);
    $("#onbtags").innerHTML = `<div class="bar">${tvName(c)}</div><div class="bar dim" style="text-transform:none">${esc(c.team.nombre)}</div>
      <div class="bar small" style="text-transform:none">${c.tyres ? `${tyreHtml(c.tyres.c)} ${c.tyres.laps} v · ${Math.round((1 - setWear(c.tyres)) * 100)} %` : "En el garaje"}</div>
      ${others.length ? `<button id="onbsw" style="padding:2px 4px;font-size:10px">Onboard ${others[0].d.abrev}</button>` : ""}`;
    const b = document.getElementById("onbsw");
    if (b) b.onclick = () => { onbId = others[0].id; renderOnbTags(); };
  }

  // --------------------------------------------------------- tarjetas
  const drvEl = $("#drivers");
  function phaseName(c: Car) {
    if (c.loc === "garage") return c.eliminated ? "Eliminado" : "Garaje";
    if (c.loc === "lane_out") return "Saliendo";
    if (c.loc === "lane_in") return "Entrando";
    if (c.loc === "out") return "Fuera";
    if (c.loc === "fin") return "Meta";
    if (c.loc === "pit") return "En boxes";
    const ph = c.run?.phase;
    return ph === "out" ? "V. de salida" : ph === "push" ? "V. lanzada" : ph === "cool" ? "Enfriando" : ph === "in" ? "Entrando" : ph === "long" ? `Tanda ${c.run!.done}/${c.run!.pushLaps}` : PUSH_NAMES[c.push];
  }
  function renderDrivers() {
    const ord = sess.order();
    const redRace = race && sess.flag === "red";
    drvEl.innerHTML = mine().map((c, i) => {
      const pos = ord.indexOf(c) + 1;
      const t = c.tyres;
      const wear = t ? setWear(t) : 0;
      const sp = t ? COMPOUNDS[t.c] : null;
      const col = !t || !sp ? "#444" : wear > sp.cliff ? "var(--red1)" : wear > sp.cliff - 0.12 ? "var(--gold1)" : "var(--green)";
      let line2 = "";
      if (race) {
        const ahead = ord[pos - 2], behind = ord[pos];
        const ga = ahead && c.loc === "track" ? sess.gapBetween(ahead, c) : NaN;
        const gb = behind && behind.loc === "track" ? sess.gapBetween(c, behind) : NaN;
        const f = (g: number) => (!isFinite(g) ? "—" : g > sess.lapRefRace * 0.95 ? "1V+" : g.toFixed(1));
        line2 = `<span class="gold mono">▲${f(ga)}</span><span class="bar">${phaseName(c)}</span><span class="gold mono">▼${f(gb)}</span>`;
      } else {
        const b = quali ? c.bestByPart[sess.part] : c.best;
        line2 = `<span class="bar">${phaseName(c)}</span><span class="gold mono">${fmtLap(b)}</span>`;
      }
      let btns = "";
      if (redRace) btns = `<button class="yellow" data-a="red" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>Cambiar neumáticos</button>`;
      else if (race) btns = `<button data-a="minus" data-i="${i}">−</button><button data-a="plus" data-i="${i}">+</button><button class="${c.pitRequest ? "yellow" : ""}" data-a="box" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>${c.pitRequest ? "BOX ✓" : "BOX"}</button>`;
      else btns = `<button data-a="go" data-i="${i}" ${c.loc !== "garage" || c.eliminated || sess.remaining() <= 0 || sess.flag === "red" ? "disabled" : ""}>${quali ? "Salir" : "Tanda"}</button><button data-a="in" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>Boxes</button><button class="${c.auto ? "on" : ""}" data-a="auto" data-i="${i}">Auto</button>`;
      return `<div class="dcard"><div class="h"><span class="posbox mono">${pos}</span><span class="nm" data-onb="${c.id}">${tvName(c)}${t ? tyreHtml(t.c) + `<span class="small mono">${t.laps}</span>` : ""}</span></div>
        <div class="wear"><i style="width:${(1 - wear) * 100}%;background:${col}"></i></div>
        <div class="st">${line2}</div><div class="b">${btns}</div></div>`;
    }).join("");
  }
  drvEl.addEventListener("click", (e) => {
    const nm = (e.target as HTMLElement).closest("[data-onb]") as HTMLElement | null;
    if (nm) { onbId = Number(nm.dataset.onb); renderOnbTags(); return; }
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const c = mine()[Number(b.dataset.i)];
    const a = b.dataset.a;
    if (a === "minus") c.push = Math.max(0, c.push - 1);
    if (a === "plus") c.push = Math.min(4, c.push + 1);
    if (a === "box") boxSheet(c);
    if (a === "red") redSheet(c);
    if (a === "go") quali ? qualiSheet(c) : practiceSheet(c);
    if (a === "in") { sess.abortRun(c); showToast(`📻 ${c.d.abrev}: "Entendido, entro a boxes."`, 2500); }
    if (a === "auto") { c.auto = !c.auto; if (!c.auto) c.queue = []; showToast(c.auto ? `🤖 El equipo lleva el programa de ${c.d.abrev}` : `🎮 Tú llevas a ${c.d.abrev}`, 2500); }
    renderDrivers();
  });

  // --------------------------------------------------------------- hojas
  function setButtons(c: Car, filter: (s: TyreSet) => boolean, selected?: string) {
    const sets = c.e.sets.filter((s) => !s.returned && filter(s)).sort((a, b) => ALL.indexOf(a.c) - ALL.indexOf(b.c) || setWear(a) - setWear(b));
    return sets.map((s) => `<button data-set="${s.id}" class="${selected === s.id ? "on" : ""}">${tyreHtml(s.c, true)}<span>${COMPOUNDS[s.c].name}</span><span class="dim">${setLabel(s)}</span></button>`).join("") || `<div class="dim small">No quedan juegos.</div>`;
  }
  function open(html: string, wire: (el: HTMLElement, close: () => void) => void) {
    sheetOpen = true;
    const { el, close } = sheet(html, () => { sheetOpen = false; renderDrivers(); });
    wire(el, close);
  }
  function boxSheet(c: Car) {
    const left = sess.laps - sess.lapsDone(c);
    const used = [...c.usedCompounds].map((x) => COMPOUNDS[x].name).join(", ");
    open(`<div class="row"><b class="up grow">Parada de ${esc(c.d.nombre)}</b><span class="dim small">quedan ${left} v</span></div>
      <div class="small dim">Para al final de esta vuelta. Usados: ${used}.${kind === "RACE" ? " En seco hay que usar dos compuestos." : ""}</div>
      <div class="opts">${setButtons(c, (s) => s !== c.tyres && !s.punctured, c.pitRequest ?? undefined)}</div>
      <div class="btnrow" style="padding:0"><button data-close>${c.pitRequest ? "Mantener" : "Cerrar"}</button>${c.pitRequest ? `<button class="red" id="cancel">Anular parada</button>` : ""}</div>`, (el, close) => {
      el.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        c.pitRequest = b.dataset.set!;
        const set = c.e.sets.find((s) => s.id === c.pitRequest)!;
        showToast(`📻 "${c.d.abrev}, box, box. ${COMPOUNDS[set.c].name}${set.laps ? " usados" : ""}."`, 3000);
        close();
      }));
      const cb = el.querySelector<HTMLButtonElement>("#cancel");
      if (cb) cb.onclick = () => { c.pitRequest = null; close(); };
    });
  }
  function redSheet(c: Car) {
    const sw = sess.sectorWater();
    open(`<div class="row"><span class="tab">Bandera roja</span><b class="up grow">${esc(c.d.nombre)}</b></div>
      <div class="small dim" style="margin-top:4px">Con la carrera parada se pueden cambiar los neumáticos sin perder tiempo. Agua S1·S2·S3: ${sw.map((x) => x.toFixed(2)).join(" · ")} mm. Lisos hasta ~0,15 mm, intermedios hasta ~1 mm.</div>
      <div class="opts">${setButtons(c, (s) => !s.punctured, c.tyres?.id)}</div>
      <button data-close style="width:100%">Cerrar</button>`, (el, close) => {
      el.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        if (sess.redFlagChange(c, b.dataset.set!)) showToast(`${c.d.abrev}: neumáticos cambiados.`, 2500, "Boxes");
        close();
      }));
    });
  }
  function qualiSheet(c: Car) {
    const part = sess.parts[sess.part];
    let laps = 1;
    let setId: string | undefined;
    const water = sess.avgWater();
    open(`<b class="up">${esc(c.d.nombre)} · ${part.name}</b>
      <div class="small dim">${part.compound ? `Obligatorio: ${COMPOUNDS[part.compound].name.toLowerCase()} (salvo en mojado). ` : ""}Agua en pista ${water.toFixed(2)} mm. Quedan ${fmtClock(sess.remaining())}.</div>
      <div class="opts">${setButtons(c, (s) => !part.compound || water > 0.2 || s.c === part.compound)}</div>
      <h2>Vueltas lanzadas</h2><div class="seg" id="laps">${[1, 2, 3].map((n) => `<button data-n="${n}" class="${n === laps ? "on" : ""}">${n}</button>`).join("")}</div>
      <div class="btnrow" style="padding:0"><button data-close>Cancelar</button><button class="red" id="go" disabled>Salir ahora</button></div>`, (el, close) => {
      el.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        setId = b.dataset.set; el.querySelectorAll("[data-set]").forEach((x) => x.classList.toggle("on", x === b));
        el.querySelector<HTMLButtonElement>("#go")!.disabled = false;
      }));
      el.querySelectorAll<HTMLButtonElement>("#laps button").forEach((b) => (b.onclick = () => { laps = Number(b.dataset.n); el.querySelectorAll("#laps button").forEach((x) => x.classList.toggle("on", x === b)); }));
      el.querySelector<HTMLButtonElement>("#go")!.onclick = () => {
        c.auto = false;
        const ok = sess.startRun(c, { kind: "quali", setId: setId!, pushLaps: laps, fuel: 10 + laps * 2 * sess.fuelPerLap });
        showToast(ok ? `📻 ${c.d.abrev} sale a pista.` : "No puede salir ahora.", 2500);
        close();
      };
    });
  }
  function practiceSheet(c: Car) {
    let type: "inst" | "qsim" | "long" = "long";
    let laps = 8;
    let setId: string | undefined;
    const draw = (el: HTMLElement) => {
      el.querySelector("#types")!.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.getAttribute("data-t") === type));
      el.querySelector<HTMLElement>("#lapsbox")!.style.display = type === "long" ? "" : "none";
    };
    open(`<b class="up">Tanda de ${esc(c.d.nombre)}</b>
      <div class="small dim">Una tanda larga mide el desgaste real del compuesto y reduce el error de tus ingenieros. Gasta neumáticos: los juegos usados se pueden devolver tras la sesión.</div>
      <div class="seg" id="types"><button data-t="inst">Instalación</button><button data-t="qsim">Simulación de clasificación</button><button data-t="long">Tanda larga</button></div>
      <div id="lapsbox"><h2>Vueltas</h2><div class="seg" id="laps">${[5, 8, 12, 16].map((n) => `<button data-n="${n}" class="${n === laps ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <h2>Juego</h2><div class="opts">${setButtons(c, () => true)}</div>
      <div class="btnrow" style="padding:0"><button data-close>Cancelar</button><button class="red" id="go" disabled>Salir</button></div>`, (el, close) => {
      draw(el);
      el.querySelectorAll<HTMLButtonElement>("#types button").forEach((b) => (b.onclick = () => { type = b.dataset.t as typeof type; draw(el); }));
      el.querySelectorAll<HTMLButtonElement>("#laps button").forEach((b) => (b.onclick = () => { laps = Number(b.dataset.n); el.querySelectorAll("#laps button").forEach((x) => x.classList.toggle("on", x === b)); }));
      el.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        setId = b.dataset.set; el.querySelectorAll("[data-set]").forEach((x) => x.classList.toggle("on", x === b));
        el.querySelector<HTMLButtonElement>("#go")!.disabled = false;
      }));
      el.querySelector<HTMLButtonElement>("#go")!.onclick = () => {
        const set = c.e.sets.find((s) => s.id === setId)!;
        const run = makeRun(sess, c, type, set.c, type === "long" ? laps : type === "qsim" ? 2 : 1, 0, setId);
        c.auto = false;
        c.queue = [];
        const ok = run ? sess.startRun(c, run) : false;
        showToast(ok ? `📻 ${c.d.abrev} sale a pista.` : "No puede salir ahora.", 2500);
        close();
      };
    });
  }
  function pilotsSheet() {
    const tempColor = (c: Compound, t: number) => { const sp = COMPOUNDS[c]; const d = t - sp.opt; return Math.abs(d) < sp.window * 0.5 ? "var(--green)" : d < -sp.window ? "var(--blue)" : d > sp.window ? "var(--red1)" : "var(--gold1)"; };
    const body = () => mine().map((c, idx) => {
      const t = c.tyres;
      const axle = (name: string, a: TyreSet["F"]) => !t ? "" : `<div style="border-color:${tempColor(t.c, a.tBulk)}"><div class="small dim up">${name}</div><div class="t mono" style="color:${tempColor(t.c, a.tBulk)}">${a.tBulk.toFixed(0)}°</div><div class="small dim mono">sup. ${a.tSurf.toFixed(0)}°</div><div class="small mono">${Math.round((1 - a.wear) * 100)} % banda</div>${a.grain > 0.05 ? `<div class="small yellow">graining ${Math.round(a.grain * 100)} %</div>` : ""}${a.blister > 0.05 ? `<div class="small redt">ampollas ${Math.round(a.blister * 100)} %</div>` : ""}</div>`;
      const seg = (key: string, names: string[], cur: number, auto?: boolean) => `<div class="seg" data-k="${key}" data-i="${idx}">${auto !== undefined ? `<button data-v="auto" class="${auto ? "on" : ""}">Auto</button>` : ""}${names.map((n, i) => `<button data-v="${i}" class="${!auto && cur === i ? "on" : ""}">${n}</button>`).join("")}</div>`;
      const fuelDelta = race ? c.fuel / sess.fuelPerLap - (sess.laps - sess.lapsDone(c)) : 0;
      const plan = race ? c.plan.stints.slice(c.stops).map((s, i, arr) => `${tyreHtml(s.c)}${i < arr.length - 1 ? ` v${s.endLap}` : ""}`).join(" → ") : "";
      return `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t"><span class="teamdot" style="background:${c.team.color}"></span>${esc(c.d.nombre)}</span>${t ? tyreHtml(t.c, true) : ""}</div><div class="bd">
        ${t ? `<div class="small dim">${COMPOUNDS[t.c].name} · ${t.laps} v · ventana ${COMPOUNDS[t.c].opt - COMPOUNDS[t.c].window}–${COMPOUNDS[t.c].opt + COMPOUNDS[t.c].window} °C${c.wing > 0 ? ` · <span class="yellow">alerón dañado</span>` : ""}</div><div class="temp">${axle("Delanteros", t.F)}${axle("Traseros", t.R)}</div>` : `<div class="dim">En el garaje.</div>`}
        <div class="kv"><span>Última / mejor</span><b class="mono">${fmtLap(c.lapTimes[c.lapTimes.length - 1])} / ${fmtLap(c.best)}</b>
        ${t ? `<span>Ritmo posible ahora</span><b class="mono">${fmtLap(sess.estLap(c))}</b>` : ""}
        <span>Combustible</span><b class="mono">${c.fuel.toFixed(1)} kg${race ? ` (${fuelDelta >= 0 ? "+" : ""}${fuelDelta.toFixed(1)} v)` : ""}</b>
        <span>Batería</span><b class="mono">${Math.round((c.soc / SOC_MAX) * 100)} %</b>
        ${race ? `<span>Plan</span><b>${plan}</b>` : ""}</div>
        ${race ? `<h2>Ritmo</h2>${seg("push", PUSH_NAMES, c.push)}<h2>Motor</h2>${seg("engine", ENGINE_NAMES, c.engine)}<h2>Batería</h2>${seg("ers", ERS_NAMES, c.ers, c.autoErs)}<button data-let="${idx}" style="width:100%">Dejar pasar al compañero</button>` : ""}
      </div></div>`;
    }).join("") + `<label class="row small" style="margin:8px 0"><input type="checkbox" id="ap" ${autoPause ? "checked" : ""}> Pausar sola en los momentos clave</label><button data-close style="width:100%">Cerrar</button>`;
    open(`<div id="pbody">${body()}</div>`, (el) => {
      const wire = () => {
        el.querySelectorAll<HTMLElement>(".seg").forEach((sg) => (sg.onclick = (e) => {
          const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement;
          if (!b) return;
          const c = mine()[Number(sg.dataset.i)];
          const k = sg.dataset.k;
          if (k === "push") c.push = Number(b.dataset.v);
          if (k === "engine") c.engine = Number(b.dataset.v);
          if (k === "ers") { if (b.dataset.v === "auto") c.autoErs = true; else { c.autoErs = false; c.ers = Number(b.dataset.v); } }
          el.querySelector("#pbody")!.innerHTML = body(); wire();
        }));
        el.querySelectorAll<HTMLButtonElement>("[data-let]").forEach((b) => (b.onclick = () => { const c = mine()[Number(b.dataset.let)]; sess.letTeammatePass(c); showToast(`📻 ${c.d.abrev}: "Entendido, dejo pasar a mi compañero."`, 2500); }));
        const ap = el.querySelector<HTMLInputElement>("#ap");
        if (ap) ap.onchange = () => { autoPause = ap.checked; localStorage.setItem("autopausa", autoPause ? "1" : "0"); };
        el.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = () => { el.remove(); sheetOpen = false; }));
      };
      wire();
    });
  }
  function weatherSheet() {
    const team = TEAMS.find((t) => t.id === wk.playerTeam)!;
    const pts = track.ms.filter((_, i) => i % 3 === 0).map((m) => [m.x / 1000, m.y / 1000] as [number, number]);
    const f = forecast(sess.weather, team.meteo, new Rng(Math.floor(sess.wall) + 7), 30, [0, 5, 10, 15, 20, 25, 30, 40, 50, 60], pts);
    const w = sess.weather;
    open(`<b class="up">Radar · 40 km</b><canvas id="radar" class="radar"></canvas>
      <div class="small dim" style="margin:4px 0">Viento en altura ${w.windSpeed.toFixed(0)} km/h hacia ${dirName(w.windDir)}. Punto blanco: el circuito.</div>
      <b class="up">Radar · circuito</b><canvas id="radar2" class="radar"></canvas>
      <div class="small dim">Lluvia sobre el trazado ahora mismo: puede llover en un sector y en otro no.</div>
      <h2>Previsión de tu meteorólogo (lluvia en algún punto del circuito)</h2>
      <div class="fc">${f.horizons.map((h, i) => `<div><span>${Math.round(f.prob[i] * 100)}%</span><i style="height:${Math.max(2, f.prob[i] * 46)}px;opacity:${0.4 + Math.min(0.6, f.p50[i] / 8)}"></i><span>${h === 0 ? "ya" : "+" + h}</span></div>`).join("")}</div>
      <div class="small dim" style="margin:6px 0">Extrapola lo que ve el radar; no sabe qué chubascos nacerán ni cuándo se desharán. Referencia: lisos hasta ~0,15 mm de agua, intermedios ~0,15–1 mm, lluvia por encima.</div>
      <button data-close style="width:100%">Cerrar</button>`, (el) => {
      drawRadar(el.querySelector<HTMLCanvasElement>("#radar")!, 40);
      drawRadar(el.querySelector<HTMLCanvasElement>("#radar2")!, 3.5, true);
    });
  }
  function drawRadar(cv: HTMLCanvasElement, R: number, withTrack = false) {
    const size = 220;
    let cx = 0, cy = 0;
    if (withTrack) {
      let a = 1e9, b = -1e9, c2 = 1e9, d = -1e9;
      for (let i = 0; i < track.xs.length; i++) { a = Math.min(a, track.xs[i]); b = Math.max(b, track.xs[i]); c2 = Math.min(c2, track.ys[i]); d = Math.max(d, track.ys[i]); }
      cx = (a + b) / 2000; cy = (c2 + d) / 2000;
      R = Math.max(b - a, d - c2) / 2000 * 1.6;
    }
    cv.width = size; cv.height = size;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = cx + (px / size) * 2 * R - R, y = cy + R - (py / size) * 2 * R;
      const r = rainAt(sess.weather, x, y);
      const [cr, cg, cb, ca] = radarColor(r);
      const o = (py * size + px) * 4;
      img.data[o] = 16 + ((cr - 16) * ca) / 255; img.data[o + 1] = 20 + ((cg - 20) * ca) / 255; img.data[o + 2] = 18 + ((cb - 18) * ca) / 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(255,255,255,0.15)";
    if (!withTrack) for (let k = 10; k <= R; k += 10) { g.beginPath(); g.arc(size / 2, size / 2, (k / R) * size / 2, 0, 7); g.stroke(); }
    if (withTrack) {
      g.strokeStyle = "#fff"; g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < track.xs.length; i += 3) {
        const x = ((track.xs[i] / 1000 - cx + R) / (2 * R)) * size, y = ((R - (track.ys[i] / 1000 - cy)) / (2 * R)) * size;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    } else { g.fillStyle = "#fff"; g.beginPath(); g.arc(size / 2, size / 2, 3, 0, 7); g.fill(); }
  }
  function radioSheet() {
    const evs = sess.events.slice(-150).reverse();
    open(`<span class="tab">Radio y dirección de carrera</span><div style="margin:6px 0;display:flex;flex-direction:column;gap:3px">${evs.map((e) => rmHtml(`${race ? "V" + e.lap : fmtClock(e.t)} · ${TAB[e.kind]}`, e.text, e.kind === "control" && /ROJA/.test(e.text) ? "red" : e.kind === "control" || e.kind === "weather" ? "ctl" : "")).join("") || "<div class='dim'>Sin mensajes.</div>"}</div><button data-close style="width:100%">Cerrar</button>`, () => {});
  }

  // -------------------------------------------------- previa de carrera
  function preRace(start: () => void) {
    const me = mine();
    const grid = sess.order();
    const html = () => `<b class="up">Parrilla · ${SESSION_NAMES[kind]}</b>
      <div class="small dim">${kind === "RACE" ? "En seco hay que usar dos compuestos distintos. " : "Sin parada obligatoria. "}Sin repostaje: el combustible que cargues es el que hay.</div>
      ${me.map((c, i) => `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t">P${grid.indexOf(c) + 1} · ${esc(c.d.nombre)}</span></div><div class="bd">
        <div class="small dim">Plan recomendado: ${c.plan.stints.map((s, j, a) => `${tyreHtml(s.c)}${j < a.length - 1 ? ` v${s.endLap}` : ""}`).join(" → ")}</div>
        <h2>Neumático de salida</h2><div class="opts" data-start="${i}">${setButtons(c, (s) => true, c.tyres?.id)}</div>
        <h2>Combustible</h2><div class="seg" data-fuel="${i}">${[[-1.2, "Muy justo"], [-0.5, "Justo"], [0, "Exacto"], [0.6, "Con margen"]].map(([v, n]) => `<button data-v="${v}" class="${Math.abs(sess.fuelMargin(c) - (v as number)) < 0.05 ? "on" : ""}">${n}</button>`).join("")}</div>
      </div></div>`).join("")}
      <table class="tv">${grid.map((c, i) => `<tr class="${c.player ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${c.team.color}"></span>${esc(c.d.nombre)}</td><td>${c.tyres ? tyreHtml(c.tyres.c) : ""}</td></tr>`).join("")}</table>
      <button class="red big-cta" id="lights" style="margin-top:8px">🚦 Salida</button>`;
    sheetOpen = true;
    const { el } = sheet(`<div id="pre">${html()}</div>`, () => { sheetOpen = false; });
    const wire = () => {
      el.querySelectorAll<HTMLElement>("[data-start]").forEach((box) => box.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        sess.setStartTyre(me[Number(box.dataset.start)], b.dataset.set!);
        el.querySelector("#pre")!.innerHTML = html(); wire();
      })));
      el.querySelectorAll<HTMLElement>("[data-fuel]").forEach((sg) => sg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => {
        sess.setFuel(me[Number(sg.dataset.fuel)], Number(b.dataset.v));
        el.querySelector("#pre")!.innerHTML = html(); wire();
      })));
      el.querySelector<HTMLButtonElement>("#lights")!.onclick = () => { el.remove(); sheetOpen = false; start(); };
    };
    wire();
  }

  // ---------------------------------------------------------- bucle
  function finish() {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    window.onresize = null;
    setTimeout(() => onFinish(sess), skipping ? 0 : 1200);
  }
  function skipToEnd() {
    if (skipping) return;
    if (!confirm("¿Simular hasta el final de la sesión? Tus pilotos seguirán con lo que tengan programado (o en automático).")) return;
    skipping = true;
    paused = true;
    updSpeed();
    for (const c of mine()) if (!race && !c.run && !c.queue.length) c.auto = true;
    const t0 = sess.wall;
    const chunk = () => {
      const lim = performance.now() + 30;
      while (!sess.finished && performance.now() < lim) for (let i = 0; i < 200 && !sess.finished; i++) sess.step();
      const est = race ? sess.leaderLap / sess.laps : (sess.wall - t0) / Math.max(1, (sess.parts.length ? 70 * 60 : 3600) - t0);
      showToast(`Simulando… ${Math.round(Math.min(1, est) * 100)} %<div class="progress"><i style="width:${Math.min(100, est * 100)}%"></i></div>`);
      renderTower(); renderTop(); drawMap();
      if (sess.finished) { hideToast(); finish(); } else setTimeout(chunk, 0);
    };
    chunk();
  }
  sizeMap();
  window.onresize = sizeMap;
  renderTower(); renderTop(); renderDrivers(); renderOnbTags();
  updSpeed();
  let last = performance.now();
  const loop = (now: number) => {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused && !sess.finished && !skipping) {
      leftover += real * speed;
      let n = 0;
      while (leftover >= sess.dt && n < 3000) {
        sess.step();
        leftover -= sess.dt;
        n++;
        if (paused) { leftover = 0; break; }
      }
    }
    if (!skipping) { drawMap(); drawGauge(); }
    if (now - lastUi > 250 && !skipping) {
      lastUi = now;
      renderTower(); renderTop();
      if (!sheetOpen) { renderDrivers(); renderOnbTags(); }
    }
    if (sess.finished) return finish();
    raf = requestAnimationFrame(loop);
  };
  const begin = () => {
    if (race) showToast("Pulsa una velocidad para dar la salida.");
    else showToast(quali ? "Pulsa una velocidad para empezar. «Salir» manda a tu piloto a pista; «Auto» deja que el equipo decida." : "Pulsa una velocidad para empezar. Programa tandas con «Tanda» o deja el programa en «Auto». ⏭ simula hasta el final.");
    raf = requestAnimationFrame(loop);
  };
  if (race) preRace(begin); else begin();
  void availableSets; void stintProfile; void DRY;
}
