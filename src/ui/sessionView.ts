import { $, esc, fmtLap, fmtClock, tyreHtml, setLabel, sheet, dirName, flagHtml, lifeLeft, wearColor, groupSets, keepAwake, setBack, closeTopSheet, closeAllSheets, anySheetOpen } from "./common";
import { CIRCUITS } from "./data";
import { puLife } from "../sim/powerunit";
import { knowledgeTable, longRunsPanel, weekendLongRuns, setPills } from "./hubs";
import { runToEnd } from "./simulate";
import { Weekend } from "../sim/weekend";
import { Session, Car, RaceEvent, SESSION_NAMES, SessionKind, isRaceKind, isQualiKind, PUSH_NAMES, ENGINE_NAMES, ERS_NAMES, SOC_MAX, fmtMinSec, GRAIN_WORDS } from "../sim/session";
import { COMPOUNDS, Compound, DRY, ALL, setWear, TyreSet, WET } from "../sim/tyres";
import { rainAt, forecast, RadarFrame, windNow } from "../sim/weather";
import { renderField, colorize, terrain, RADAR_STEPS, fmtHour } from "./radar";
import { helmetSvg, reducedMotion, lightAt, skyIcon, driverFlag } from "./visual";

import { makeRun, planOptions, teamTakesOver } from "../sim/strategy";
import { Rng } from "../sim/rng";
import { snapshotSession, SessionSnapshot } from "../sim/snapshot";
import { stopOptions, undercut, gapHistory, pitLoss, StopOption } from "../sim/pitwall";
import { saveSession, loadPrefs, savePrefs, setParked, PausePrefs, SPEEDS } from "./store";

type TowerMode = "int" | "gap" | "last" | "tyre";

/**
 * Pantalla de una sesión. `onFinish` se llama al terminar; `onExit`, si el jugador sale a medias
 * (la sesión queda guardada y se retoma después).
 */
export function sessionView(wk: Weekend, kind: SessionKind, onFinish: (s: Session) => void, snap?: SessionSnapshot, onExit?: () => void) {
  const app = document.getElementById("app")!;
  const def = CIRCUITS[wk.st.circuitId];
  const track = wk.track;
  const sess = snap ? wk.restore(snap) : wk.build(kind);
  const race = isRaceKind(kind);
  const quali = isQualiKind(kind);
  const prefs = loadPrefs();
  let speed = race ? prefs.velCarrera : prefs.velSesion;
  let paused = true;
  let mode: TowerMode = "int";
  let wide = false; // torre a pantalla completa con sectores
  let leftover = 0;
  let raf = 0;
  let lastUi = 0;
  let lastDraw = 0;
  let sheetOpen = false;
  let skipping = false;
  let ended = false;
  /** «⏩ Hasta lo siguiente»: corre a toda velocidad y se para en cuanto pasa algo tuyo. */
  let ff = false;
  const FF_SPEED = 240;
  let toastTimer = 0;
  let lastSave = performance.now();
  let started = !!snap; // la carrera no cuenta hasta la salida
  /** Guarda la sesión a medias para poder retomarla si se cierra la app. */
  const persist = () => {
    if (ended || skipping || !started || sess.finished) return;
    lastSave = performance.now();
    saveSession(snapshotSession(sess, wk.st));
  };
  setParked(false); // está dentro de la sesión: si se cierra la app, al volver se retoma sola
  const onHide = () => { if (document.visibilityState === "hidden") persist(); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", persist);
  const mine = () => sess.cars.filter((c) => c.player).sort((a, b) => a.id - b.id);
  const tvName = (c: Car) => { const parts = c.d.nombre.split(" "); return `${parts[0][0]} ${parts.slice(1).join(" ")}`.toUpperCase(); };
  /** Nombre de tele con la bandera del país a continuación. */
  const nameFlag = (c: Car) => { const f = driverFlag(c.d.nombre); return f ? `${tvName(c)}<span class="nfl">${flagHtml(f)}</span>` : tvName(c); };
  const clean = (t: string) => t.replace(/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D\s]+/u, "");
  const TAB: Record<RaceEvent["kind"], string> = { radio: "Radio del equipo", control: "Dirección de carrera", pit: "Boxes", info: "Carrera", weather: "Meteo", incident: "Incidente" };
  const rmHtml = (tab: string, text: string, cls = "") => `<div class="rm ${cls}"><span class="tab">${tab}</span><div class="bar">${clean(text)}</div></div>`;

  app.innerHTML = `
  <div id="sess">
    <div class="ctrl"><button id="menu" class="menu" title="Menú: simular hasta el final, datos, ajustes, salir" aria-label="Menú">☰</button><span class="gp" title="${esc(SESSION_NAMES[kind])} · ${esc(def.nombre)}">${flagHtml(def.bandera)} <b id="gpk"></b></span><div class="speed" id="speed"></div></div>
    <div class="lapc mono" id="lapc"></div>
    <div class="main"><div class="bigban" id="bigban" aria-live="polite"></div>
      <div class="leftcol"><div class="tower" id="tower"></div><div class="toast" id="toast" title="Dirección de carrera y meteo"></div></div>
      <div class="side${race ? "" : " timed"}">
        <div class="mapbox"><canvas id="map" title="Toca un coche para seguirlo. Línea discontinua: zona de modo adelantamiento · naranja: frenada donde se adelanta${race ? " · círculo discontinuo: dónde estaría tu piloto si parase ahora" : ""}"></canvas><canvas id="map3d" hidden aria-label="Mapa 3D"></canvas><div class="lbl3d" id="lbl3d" hidden></div><div class="flyov" id="flyov"></div><div class="selchip" id="selchip"></div><button class="camb" id="camb" title="Cámara: sigue de cerca a tu piloto (o al coche que sigues)" aria-label="Cámara que sigue"><svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true"><rect x="1" y="3" width="13" height="10" rx="2" fill="currentColor"/><path d="M14.5 7 19 4.5v7L14.5 9z" fill="currentColor"/></svg><span id="camn"></span></button><button class="m3b" id="m3b" title="Cambia entre el mapa 2D y el 3D" aria-label="Mapa en 3D" aria-pressed="false">3D</button><button class="bigb" id="bigb" title="Amplía el mapa sobre la clasificación" aria-label="Ampliar el mapa" aria-pressed="false"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div>
        ${race ? `<canvas id="gapstrip" class="gapstrip" title="Toda la parrilla en una vuelta: el líder a la izquierda. El círculo discontinuo es dónde saldría tu piloto si parase ahora."></canvas>` : ""}
        <div class="wxbox" id="wx"></div>
        <div id="lapban"></div>
        <div class="ticker" id="ticker"></div>
        <div class="sidebtns${race ? " four" : ""}"><button data-s="pilotos">Pilotos</button>${race ? `<button data-s="muro">Muro</button>` : ""}<button data-s="tiempo">Radar</button><button data-s="radio">Radio</button></div>
      </div>
    </div>
    <div class="drivers" id="drivers"></div>
  </div>`;

  // ------------------------------------------------------------- controles
  const spEl = $("#speed");
  // Controles compactos: pausa/seguir, velocidad con − y +, y «hasta lo siguiente». (⏭ simular hasta
  // el final vive en el menú ☰, donde no se pulsa sin querer.) Iconos en SVG: el emoji ⏸ no sale
  // igual en todos los móviles.
  const ICON = {
    play: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>`,
    pause: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>`,
    ff: `<svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true"><path d="M1.5 2.5v11l7-5.5zM9 2.5v11l7-5.5z" fill="currentColor"/><path d="M16.5 2.5h2v11h-2z" fill="currentColor"/></svg>`,
  };
  spEl.innerHTML = `<button data-v="0" class="pp" title="Pausa / seguir (espacio)" aria-label="Pausa o seguir"></button>${SPEEDS.map((v, i) => `<button data-v="${v}" class="sv" title="Velocidad ${v}× (tecla ${i + 1})" aria-label="Velocidad ${v} por">${v}×</button>`).join("")}<button data-ff="1" class="ffb" title="Hasta lo siguiente (F): avanza deprisa y se para en cuanto pasa algo de tus pilotos" aria-label="Avanzar hasta lo siguiente">${ICON.ff}</button>`;
  /** Cambia la velocidad (0 = pausar o reanudar). La elegida se recuerda para la próxima sesión del mismo tipo. */
  function setSpeed(s: number) {
    if (skipping || ended) return;
    ff = false;
    if (s === 0) paused = !paused;
    else {
      speed = s; paused = false;
      if (race) prefs.velCarrera = s; else prefs.velSesion = s;
      savePrefs(prefs);
    }
    started = true;
    hideToast();
    updSpeed();
    if (paused) persist();
  }
  /** − y +: la velocidad anterior o siguiente (y sigue corriendo). */
  function stepSpeed(d: number) {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + d));
    setSpeed(SPEEDS[i]);
  }
  // coches tuyos al empezar a avanzar: si cambia dónde está alguno (sale, vuelve, entra a boxes), se para
  const ffLoc = new Map<number, Car["loc"]>();
  function fastForward() {
    if (skipping || ended || sess.finished) return;
    if (ff) { stopFF(); return; }
    ff = true; paused = false; started = true;
    ffLoc.clear();
    for (const c of mine()) ffLoc.set(c.id, c.loc);
    hideToast();
    updSpeed();
  }
  /** Para el avance rápido (y la sesión), con el motivo si no lo cuenta ya un aviso. */
  function stopFF(why = "") {
    if (!ff) return;
    ff = false;
    paused = true;
    leftover = 0;
    updSpeed();
    if (why && !pend.left && !pend.right) showToast(`⏩ ${why}`, 5000, "Muro");
    persist();
  }
  // dónde está, a grandes rasgos: salir del pit-lane a la pista o del pit-lane al garaje es el mismo movimiento
  const zone = (l: Car["loc"]) => (l === "garage" || l === "lane_in" ? "box" : l === "lane_out" || l === "track" ? "pista" : l);
  const ZONE_TXT: Record<string, string> = { box: "vuelve al garaje", pista: "sale a pista", pit: "entra a boxes", out: "se ha quedado fuera", fin: "ha terminado" };
  /** ¿Ha cambiado dónde está alguno de tus pilotos desde que se empezó a avanzar? */
  function ffLocChange(): string {
    for (const c of mine()) {
      const was = ffLoc.get(c.id);
      if (was === undefined) continue;
      if (zone(was) !== zone(c.loc)) { ffLoc.set(c.id, c.loc); return `${c.d.abrev} ${ZONE_TXT[zone(c.loc)] ?? ""}`.trim(); }
      ffLoc.set(c.id, c.loc);
    }
    return "";
  }
  spEl.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.ff) fastForward();
    else if (b.dataset.d) stepSpeed(Number(b.dataset.d));
    else setSpeed(Number(b.dataset.v));
  };
  $("#menu").onclick = () => menuSheet();
  document.querySelectorAll<HTMLElement>(".sidebtns button").forEach((b) => (b.onclick = () => {
    const w = b.dataset.s;
    if (w === "pilotos") pilotsSheet();
    if (w === "muro") muroSheet();
    if (w === "tiempo") weatherSheet();
    if (w === "radio") radioSheet();
  }));
  // tocar un aviso pendiente reanuda la sesión
  const resume = () => { hideToast(); paused = false; ff = false; started = true; updSpeed(); renderMessages(); };
  $("#toast").onclick = () => { if (pend.left) resume(); };
  $("#ticker").onclick = () => { if (pend.right) resume(); };
  function updSpeed() {
    spEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.disabled = skipping));
    const pp = spEl.querySelector<HTMLButtonElement>(".pp")!;
    pp.innerHTML = paused ? ICON.play : ICON.pause;
    pp.classList.toggle("go", paused); // en pausa, el botón de seguir destaca
    spEl.querySelectorAll<HTMLButtonElement>(".sv").forEach((b) => b.classList.toggle("on", !ff && Number(b.dataset.v) === speed));
    spEl.querySelector<HTMLButtonElement>(".ffb")!.classList.toggle("on", ff);
    // con la sesión corriendo, que el móvil no apague la pantalla
    keepAwake(!paused && !ended && !skipping);
  }
  // ----------------------------------------------------------------- teclado (escritorio)
  // espacio: pausa · 1-6: velocidad · P/M/R/D: pilotos, muro, radar, radio · Esc: cierra la hoja
  const onKey = (e: KeyboardEvent) => {
    if (ended || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Escape") { if (closeTopSheet()) e.preventDefault(); else if (selId !== null) select(null); return; }
    if (anySheetOpen()) return;
    const k = e.key.toLowerCase();
    if (k === " ") {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.(); // que el espacio no pulse además el botón con el foco
      if (pend.left || pend.right) resume(); else setSpeed(0);
    }
    else if (k >= "1" && k <= String(SPEEDS.length)) setSpeed(SPEEDS[Number(k) - 1]);
    else if (k === "f") fastForward();
    else if (k === "+" || k === "-") stepSpeed(k === "+" ? 1 : -1);
    else if (k === "p") pilotsSheet();
    else if (k === "m" && race) muroSheet();
    else if (k === "r") weatherSheet();
    else if (k === "d") radioSheet();
    else if (k === "t") { mode = (["int", "gap", "last", "tyre"] as TowerMode[])[((["int", "gap", "last", "tyre"] as TowerMode[]).indexOf(mode) + 1) % 4]; renderTower(); }
  };
  document.addEventListener("keydown", onKey);
  // Avisos. Izquierda: dirección de carrera y meteo. Derecha: lo de tus pilotos.
  // Un aviso «pendiente» ha parado la sesión y se reanuda al tocarlo; uno «temporal» se va solo.
  type Note = { html: string; tab: string; cls: string; until: number };
  const pend: { left: Note | null; right: Note | null } = { left: null, right: null };
  const temp: { left: Note | null; right: Note | null } = { left: null, right: null };
  const clsFor = (text: string, kind?: RaceEvent["kind"]) => (/BANDERA ROJA/.test(text) ? "red" : kind === "control" || kind === "weather" || /SEGURIDAD/.test(text) ? "ctl" : "");
  function showToast(html: string, ms = 0, tab = "Muro", hint = false, side: "left" | "right" = "right") {
    const n: Note = { html, tab, cls: clsFor(html), until: ms ? performance.now() + ms : Infinity };
    if (hint && !ms) pend[side] = n; else temp[side] = n;
    renderMessages();
  }
  function hideToast() { pend.left = pend.right = null; temp.left = temp.right = null; }
  const isMineEv = (e: RaceEvent) => {
    if (e.carId !== undefined && sess.carById(e.carId).player) return true;
    return mine().some((c) => new RegExp(`\\b${c.d.abrev}\\b`).test(e.text));
  };
  const noteHtml = (n: Note, hint: boolean) => `<div class="rm ${n.cls}${hint ? " pend" : ""}"><div class="row" style="gap:0"><span class="tab">${n.tab}</span>${hint ? `<span class="hint">▶ Seguir</span>` : ""}</div><div class="bar">${clean(n.html)}</div></div>`;
  let lastLeft = "", lastRight = "";
  function renderMessages() {
    const now = performance.now();
    for (const k of ["left", "right"] as const) if (temp[k] && temp[k]!.until < now) temp[k] = null;
    // izquierda
    const L = $("#toast");
    let lh = "";
    if (pend.left) lh = noteHtml(pend.left, true);
    else if (temp.left) lh = noteHtml(temp.left, false);
    else {
      const e = [...sess.events].reverse().find((x) => x.kind === "control" || x.kind === "weather");
      if (e) lh = rmHtml(TAB[e.kind], e.text, clsFor(e.text, e.kind));
    }
    L.classList.toggle("show", !!pend.left);
    if (lh !== lastLeft) { lastLeft = lh; L.innerHTML = lh; }
    // derecha: lo de tus pilotos
    const tk = $("#ticker");
    const items: string[] = [];
    if (pend.right) items.push(noteHtml(pend.right, true));
    else if (temp.right) items.push(noteHtml(temp.right, false));
    const evs = sess.events.filter((e) => e.kind !== "control" && e.kind !== "weather" && isMineEv(e) && !staleAdvice(e)).slice(-6).reverse();
    for (const e of evs) {
      if (pend.right && e.text === pend.right.html) continue;
      const age = race ? Math.max(0, sess.leaderLap + 1 - e.lap) : 0;
      items.push(rmHtml(TAB[e.kind], e.text + (age >= 1 ? ` <span class="dim small">· hace ${age} v</span>` : ""), clsFor(e.text, e.kind)));
    }
    const rh = items.join("") || `<div class="rm"><span class="tab">Tus pilotos</span><div class="bar dim">Sin novedades.</div></div>`;
    tk.classList.toggle("show", !!pend.right);
    if (rh !== lastRight) {
      lastRight = rh;
      tk.innerHTML = rh;
      while (tk.children.length > 1 && tk.scrollHeight > tk.clientHeight + 1) tk.lastElementChild!.remove();
    }
  }

  /** Un consejo del estratega ya no vale si el piloto ha parado desde entonces, hay otro más nuevo o han pasado 2 vueltas. */
  function staleAdvice(e: RaceEvent) {
    if (!/Estratega/.test(e.text) || e.carId === undefined) return false;
    const c = sess.carById(e.carId);
    const newer = sess.events.some((x) => x !== e && x.carId === e.carId && x.t > e.t && (/Estratega/.test(x.text) || /entra a boxes/.test(x.text)));
    return newer || !c.advice || sess.leaderLap + 1 - e.lap >= 2 || c.loc === "out";
  }

  // ----------------------------------------------------- avisos grandes (como en la tele)
  // Una franja a todo el ancho que entra y sale: banderas, relanzada, pole, vuelta rápida y la
  // parada de tu piloto. De una en una; si se amontonan (a mucha velocidad), solo las últimas.
  type Ban = { cls: string; title: string; sub?: string; ms: number };
  const banQ: Ban[] = [];
  let banBusy = false;
  function banner(b: Ban) {
    if (skipping || ended) return;
    banQ.push(b);
    while (banQ.length > 2) banQ.shift();
    if (!banBusy) nextBanner();
  }
  function nextBanner() {
    const b = banQ.shift();
    const box = document.getElementById("bigban");
    if (!b || !box) { banBusy = false; return; }
    banBusy = true;
    const el = document.createElement("div");
    el.className = `bb ${b.cls}`;
    el.style.animationDuration = `${b.ms}ms`;
    el.innerHTML = `<b>${esc(b.title)}</b>${b.sub ? `<span>${esc(b.sub)}</span>` : ""}`;
    box.appendChild(el);
    setTimeout(() => { el.remove(); nextBanner(); }, b.ms);
  }
  const plain = (t: string) => clean(t).replace(/<[^>]*>/g, "");
  function bannerFor(e: RaceEvent) {
    const t = e.text;
    let m: RegExpMatchArray | null;
    if (e.kind === "control") {
      if ((m = t.match(/COCHE DE SEGURIDAD VIRTUAL — (.*)/))) return banner({ cls: "vsc", title: "Coche de seguridad virtual", sub: m[1], ms: 2800 });
      if ((m = t.match(/COCHE DE SEGURIDAD — (.*)/))) return banner({ cls: "sc", title: "Coche de seguridad", sub: m[1], ms: 3000 });
      if (/Salida detrás del coche de seguridad/.test(t)) return banner({ cls: "sc", title: "Salida tras el coche de seguridad", sub: "demasiada agua en pista", ms: 3000 });
      if ((m = t.match(/BANDERA ROJA — ([^.]*)/))) return banner({ cls: "red", title: "Bandera roja", sub: m[1], ms: 3200 });
      if (/Relanzada|Fin del coche de seguridad virtual|Se reanuda la sesión/.test(t)) return banner({ cls: "green", title: "Bandera verde", ms: 2200 });
      if (/Se reanuda la carrera/.test(t)) return banner({ cls: "sc", title: "Se reanuda", sub: "detrás del coche de seguridad", ms: 2600 });
      if ((m = t.match(/Empieza la (\S+)/))) return banner({ cls: "green", title: `Empieza la ${m[1]}`, ms: 2000 });
      if (/^🏁 Bandera a cuadros/.test(t)) return banner({ cls: "chk", title: "Bandera a cuadros", sub: plain(t).replace(/^Bandera a cuadros ?/, ""), ms: 2600 });
      if ((m = t.match(/POLE para (.+?) \((.+?)\) (\S+)/))) return banner({ cls: "pole", title: "Pole position", sub: `${m[1]} · ${m[3]}`, ms: 3400 });
      if ((m = t.match(/(\w+) descalificado/))) return banner({ cls: "red", title: `${m[1]} descalificado`, sub: "no ha usado dos compuestos", ms: 3000 });
    }
    if (e.kind === "pit" && (m = t.match(/Parada de (\w+): ([\d.]+) s/)) && e.carId !== undefined && sess.carById(e.carId).player) {
      const secs = Number(m[2]);
      banner({ cls: secs > 4 ? "pit slow" : "pit", title: `Parada · ${m[1]}`, sub: `${m[2].replace(".", ",")} s${secs > 4 ? " · problema en la parada" : ""}`, ms: 2200 });
    }
  }
  // vuelta rápida de la carrera: franja morada (como mucho una cada 40 s reales, salvo si es tuya)
  let lastBest = Infinity, lastFlBanner = -1e9;
  function fastestLapCheck() {
    if (!race || !started || sess.bestLap >= lastBest - 1e-6) return;
    const first = !isFinite(lastBest);
    lastBest = sess.bestLap;
    const c = sess.cars.find((x) => Math.abs(x.best - sess.bestLap) < 1e-9);
    if (!c || first || sess.leaderLap < 3) return;
    const now = performance.now();
    if (!c.player && now - lastFlBanner < 40000) return;
    lastFlBanner = now;
    banner({ cls: "fl", title: "Vuelta rápida", sub: `${c.d.abrev} · ${fmtLap(sess.bestLap)}`, ms: 2000 });
  }

  // ------------------------------------------------------------- semáforo
  /** Cinco luces rojas que se encienden una a una y se apagan de golpe; luego, carrera. */
  function lightsOut(done: () => void) {
    const ov = document.createElement("div");
    ov.className = "lights";
    ov.innerHTML = `<div class="lbox"><div class="lrow">${Array.from({ length: 5 }, () => `<span class="lamp"><i></i><i></i></span>`).join("")}</div><div class="lmsg">Atentos al semáforo</div></div>`;
    document.getElementById("sess")!.appendChild(ov);
    const lamps = ov.querySelectorAll<HTMLElement>(".lamp");
    const step = reducedMotion() ? 350 : 900;
    let k = 0;
    const on = () => {
      if (ended) return ov.remove();
      if (k < 5) { lamps[k++].classList.add("on"); setTimeout(on, step); return; }
      // espera variable antes de apagarse, como en la realidad
      setTimeout(() => {
        if (ended) return ov.remove();
        lamps.forEach((l) => l.classList.remove("on"));
        ov.classList.add("go");
        ov.querySelector(".lmsg")!.textContent = "¡Salida!";
        setTimeout(() => { ov.remove(); done(); }, 650);
      }, reducedMotion() ? 300 : 400 + Math.random() * 1800);
    };
    setTimeout(on, 400);
  }

  sess.onEvent = (e: RaceEvent) => {
    if (skipping) return;
    bannerFor(e);
    const mineEv = isMineEv(e) && e.kind !== "control" && e.kind !== "weather";
    // la meteo informa pero no para; dirección de carrera y lo de tus pilotos, sí, según lo que
    // el jugador haya dejado activado en Ajustes (cada tipo de aviso por separado)
    const cat: keyof PausePrefs = e.kind === "control" ? (/Empieza la|Eliminados en|POLE para/.test(e.text) ? "partes" : "control") : /Estratega/.test(e.text) ? "estratega" : "radio";
    const always = e.kind === "control" && /terminada|no se reanudará/.test(e.text); // el final siempre se enseña
    // avanzando a toda velocidad: se para con lo tuyo y con lo importante de dirección de carrera y meteo
    if (ff && (mineEv || (e.important && (e.kind === "control" || e.kind === "weather")))) stopFF(e.kind === "control" || e.kind === "weather" ? "" : e.text);
    if (e.pause && (always || prefs.pausas[cat]) && e.kind !== "weather" && (mineEv || e.kind === "control")) {
      paused = true;
      leftover = 0;
      const n: Note = { html: e.text, tab: TAB[e.kind], cls: clsFor(e.text, e.kind), until: Infinity };
      if (e.kind === "control") pend.left = n; else pend.right = n;
      updSpeed();
    }
    renderMessages();
  };


  // ------------------------------------------------------------- mapa 3D
  // El 2D es el mapa de siempre. El 3D (map3d.ts, con three.js) se descarga la primera vez que se
  // pulsa «3D» y ocupa el mismo recuadro; lo elegido se recuerda para la próxima sesión.
  type Map3d = ReturnType<typeof import("./map3d").createMap3d>;
  let view3d = false, m3: Map3d | null = null, m3busy = false;
  function cam3d(name: string) {
    $("#camn").textContent = view3d ? name : "";
    $("#camb").classList.toggle("on", view3d ? name !== "Circuito" : camOn);
  }
  async function set3d(on: boolean, save = true) {
    if (m3busy) return;
    if (on && !m3) {
      m3busy = true;
      $("#m3b").classList.add("busy");
      try {
        const mod = await import("./map3d");
        if (ended) return;
        // el recuadro tiene que estar visible para que el lienzo coja su tamaño
        $("#map3d").hidden = false;
        m3 = mod.createMap3d({
          canvas: $<HTMLCanvasElement>("#map3d"), labels: $("#lbl3d"), box: document.querySelector<HTMLElement>(".mapbox")!, sess,
          mine, selId: () => selId,
          alpha: () => (paused ? 1 : Math.min(1, leftover / sess.dt)),
          paused: () => paused, speed: () => (ff ? FF_SPEED : speed),
          ghosts: () => mine().flatMap((c) => { const gh = ghosts.get(c.id); const sNow = c.s + (paused ? 0 : c.v * leftover); return gh ? [{ s: sNow - metersBack(sNow, gh.loss), text: `${c.d.abrev} P${gh.pos}`, color: c.team.color }] : []; }),
        });
      } catch (err) {
        console.error(err);
        $("#map3d").hidden = true;
        showToast("Este dispositivo no puede abrir el mapa 3D: sigues con el 2D.", 4500, "Mapa");
        on = false;
      } finally {
        m3busy = false;
        document.getElementById("m3b")?.classList.remove("busy");
      }
    }
    if (ended) return;
    view3d = on && !!m3;
    $("#map").hidden = view3d; $("#map3d").hidden = !view3d; $("#lbl3d").hidden = !view3d;
    $("#m3b").classList.toggle("on", view3d); $("#m3b").setAttribute("aria-pressed", String(view3d));
    cam3d(view3d ? "Circuito" : "");
    if (view3d) { while (m3!.cam() !== "circuito") m3!.cycleCam(); m3!.resize(); m3!.idle(); } else drawMap();
    if (save) { prefs.mapa3d = view3d; savePrefs(prefs); }
  }
  $("#m3b").onclick = (e) => { e.stopPropagation(); void set3d(!view3d); };
  $("#bigb").onclick = (e) => {
    e.stopPropagation();
    const on = document.querySelector(".main")!.classList.toggle("mapbig");
    $("#bigb").classList.toggle("on", on); $("#bigb").setAttribute("aria-pressed", String(on));
  };
  $<HTMLCanvasElement>("#map3d").addEventListener("click", (e) => {
    if (!m3) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const best = m3.pick(e.clientX - r.left, e.clientY - r.top) as number | null;
    if (best === null) { if (selId !== null) select(null); } else select(best);
  });

  // ---------------------------------------------------------------- mapa
  // vista base (todo el circuito) y vista actual (con la cámara puede ir más cerca)
  let mapScale = 1, mapOx = 0, mapOy = 0;
  let bScale = 1, bOx = 0, bOy = 0;
  function sizeMap() {
    const cv = $<HTMLCanvasElement>("#map");
    if (!cv) return;
    const box = cv.parentElement!;
    if (box.clientWidth < 20 || box.clientHeight < 20) return; // oculto: se mantiene el tamaño anterior
    const w = box.clientWidth, h = Math.max(80, box.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + "px";
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < track.xs.length; i++) { minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]); miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]); }
    const pad = 10 * dpr;
    bScale = Math.min((cv.width - 2 * pad) / (maxx - minx), (cv.height - 2 * pad) / (maxy - miny));
    bOx = (cv.width - (maxx - minx) * bScale) / 2 - minx * bScale;
    bOy = (cv.height - (maxy - miny) * bScale) / 2 + maxy * bScale;
    mapScale = bScale; mapOx = bOx; mapOy = bOy;
    camK = 1; camX = NaN;
    rainLayerT = -1;
  }
  const mx = (x: number) => mapOx + x * mapScale;
  const my = (y: number) => mapOy - y * mapScale;
  // capa de lluvia del mapa (mismo campo que el radar), se recalcula cada pocos segundos de sesión
  const rainLayer = document.createElement("canvas");
  let rainLayerT = -1, rainLayerOn = false, rainNow = 0;
  function updateRainLayer(cv: HTMLCanvasElement) {
    if (cv.width < 20 || cv.height < 20) { rainLayerOn = false; return; }
    if (rainLayerT >= 0 && Math.abs(sess.wall - rainLayerT) < 4) return;
    rainLayerT = sess.wall;
    const S = 110, H = Math.max(8, Math.round((S * cv.height) / cv.width));
    // siempre en la vista base: con la cámara se dibuja ampliada
    const R = cv.width / 2 / bScale / 1000; // km
    const cx = (cv.width / 2 - bOx) / bScale / 1000, cy = (bOy - cv.height / 2) / bScale / 1000;
    rainNow = sess.rainOnTrack();
    const field = renderField(sess.weather as unknown as RadarFrame, cx, cy, R, S, H);
    rainLayerOn = field.some((v) => v >= 0.1);
    if (!rainLayerOn) return;
    rainLayer.width = S; rainLayer.height = H;
    rainLayer.getContext("2d")!.putImageData(colorize(field, S, H, null, 105), 0, 0);
  }
  const themeVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const MAP = { track: themeVar("--map-track", "#6a6d74"), label: themeVar("--map-label", "#ffffff") };
  // ------------------------------------------- selección, fantasma de parada y tráfico
  /** Coche que el jugador sigue (tocándolo en el mapa, la franja o la torre). */
  let selId: number | null = null;
  const selCar = () => (selId === null ? null : sess.cars.find((c) => c.id === selId) ?? null);
  /** Tocar el mismo coche (o un sitio vacío) deja de seguirlo. */
  function select(id: number | null) {
    selId = id !== null && id === selId ? null : id;
    m3?.selChanged();
    renderSel(); renderTower(); drawMap(); drawStrip();
  }
  const L = track.length;
  const modL = (s: number) => ((s % L) + L) % L;
  // tiempo de referencia acumulado a lo largo de la vuelta: para pasar segundos de pérdida a metros de pista
  const NP = Math.min(track.xs.length, track.vref.length);
  const tCum = new Float64Array(NP + 1);
  for (let i = 0; i < NP; i++) tCum[i + 1] = tCum[i] + track.ds / Math.max(8, track.vref[i]);
  /** Metros por detrás de s que se recorren en `sec` segundos a ritmo de carrera. */
  function metersBack(s: number, sec: number): number {
    const Tl = tCum[NP];
    let tt = sec * (Tl / (sess.lapRefRace || Tl));
    const laps = Math.floor(tt / Tl);
    tt -= laps * Tl;
    const p = modL(s);
    const i = Math.min(NP - 1, Math.floor(p / track.ds));
    let target = tCum[i] - tt;
    if (target < 0) target += Tl;
    let lo = 0, hi = NP;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tCum[m] <= target) lo = m; else hi = m; }
    const sT = (lo + (target - tCum[lo]) / Math.max(1e-9, tCum[lo + 1] - tCum[lo])) * track.ds;
    return modL(p - sT) + laps * L;
  }
  /**
   * Fantasma de parada (carrera): dónde estaría ahora tu piloto si hubiera parado, es decir, la
   * pérdida en boxes convertida en metros por detrás de él, y la posición en la que saldría (la
   * misma cuenta que «Si para ahora» en el Muro).
   */
  type Ghost = { loss: number; pos: number; at: number };
  const ghosts = new Map<number, Ghost>();
  function updateGhosts() {
    ghosts.clear();
    if (!race || !started || sess.flag === "red" || sess.chequered) return;
    const rows = sess.intervals().filter((r) => r.car.loc !== "out" && r.car.loc !== "fin");
    for (const c of mine()) {
      if (c.loc !== "track" || !c.tyres) continue;
      const me = rows.find((r) => r.car === c);
      if (!me) continue;
      const loss = pitLoss(sess, c);
      const at = me.gap + loss;
      const pos = rows.filter((r) => r.car !== c && r.gap < at).length + 1;
      ghosts.set(c.id, { loss, pos, at });
    }
  }
  /** Libres y clasificación: va en vuelta rápida (lanzada o tanda larga), no de salida ni enfriando. */
  const hot = (c: Car) => c.loc === "track" && (c.run?.phase === "push" || c.run?.phase === "long");
  /** Coches lentos (no lanzados) a menos de 350 m por delante de uno de tus pilotos en vuelta lanzada. */
  function trafficIds(): Set<number> {
    const out = new Set<number>();
    if (race) return out;
    for (const c of mine()) {
      if (c.run?.phase !== "push" || c.loc !== "track") continue;
      for (const o of sess.cars) {
        if (o === c || o.loc !== "track" || hot(o)) continue;
        const d = modL(o.s - c.s);
        if (d > 0 && d < 350) out.add(o.id);
      }
    }
    return out;
  }
  /** Coche cuyos sectores se pintan en el mapa: el que sigues o, si no, tu piloto que lleva la vuelta más reciente. */
  function sectorCar(): Car | null {
    const s = selCar();
    if (s && s.loc !== "out") return s;
    return mine().filter((c) => c.loc === "track").sort((a, b) => (b.lapStart || 0) - (a.lapStart || 0))[0] ?? null;
  }
  const SEC_COL: Record<string, string> = { purple: "#b25cff", green: "#33e05f", yellow: "#ffd84a" };
  const sectorColor = (c: Car, j: number) => {
    const cur = c.secCur[j];
    const v = !isNaN(cur) ? cur : c.secLast[j];
    if (isNaN(v) || !isFinite(v)) return null;
    return { col: SEC_COL[tcls(v, c.secBest[j], sess.secBest[j])] ?? null, live: !isNaN(cur) };
  };
  /** Posiciones de los coches en el último dibujo del mapa (px del lienzo), para tocarlos. */
  let mapPts: { id: number; x: number; y: number }[] = [];
  /** Punto del trazado a la distancia s, con la dirección de marcha (px del lienzo); `side` lo aparta hacia el pit-lane. */
  const trackAt = (s: number, side = 0) => {
    const n = track.xs.length;
    const f = modL(s) / track.ds;
    const i = Math.min(n - 1, Math.floor(f)), j = (i + 1) % n, w = f - Math.floor(f);
    const k2 = (i + 3) % n;
    const x = mx(track.xs[i] + (track.xs[j] - track.xs[i]) * w), y = my(track.ys[i] + (track.ys[j] - track.ys[i]) * w);
    let dx = mx(track.xs[k2]) - mx(track.xs[i]), dy = my(track.ys[k2]) - my(track.ys[i]);
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    return { x: x - dy * side, y: y + dx * side, dx, dy };
  };
  /** Cuánto se engordan las líneas al acercar la cámara. */
  const zoomW = () => 1 + (camK - 1) * 0.4;
  const carXY = (s: number, pit: boolean, dpr: number) => {
    const p = trackAt(s, pit ? 8 * dpr * zoomW() : 0);
    return { x: p.x, y: p.y };
  };
  /** Recorre el trazado de un minisector (con el cierre de la vuelta en el último). */
  const msPath = (g: CanvasRenderingContext2D, m: (typeof track.ms)[number]) => {
    const i0 = Math.floor(m.s0 / track.ds), i1 = Math.min(track.xs.length - 1, Math.floor(m.s1 / track.ds));
    g.moveTo(mx(track.xs[i0]), my(track.ys[i0]));
    for (let i = i0 + 1; i <= i1 + 1 && i < track.xs.length; i++) g.lineTo(mx(track.xs[i]), my(track.ys[i]));
    if (m.i === track.ms.length - 1) g.lineTo(mx(track.xs[0]), my(track.ys[0]));
  };
  /** Raya corta perpendicular al trazado en la distancia s (salida, sectores). */
  const tick = (g: CanvasRenderingContext2D, s: number, len: number) => {
    const i = Math.min(track.xs.length - 2, Math.floor(modL(s) / track.ds));
    const x = mx(track.xs[i]), y = my(track.ys[i]);
    const dx = mx(track.xs[i + 1]) - x, dy = my(track.ys[i + 1]) - y, n = Math.hypot(dx, dy) || 1;
    g.beginPath(); g.moveTo(x - (dy / n) * len, y + (dx / n) * len); g.lineTo(x + (dy / n) * len, y - (dx / n) * len); g.stroke();
  };
  // --------------------------------------------- cámara que sigue
  // Acerca el mapa al coche que sigues (o a tu piloto en pista) y lo acompaña con suavidad.
  let camOn = false, camK = 1, camX = NaN, camY = NaN;
  const CAM_ZOOM = 3.4;
  function camTarget(): Car | null {
    const sel = selCar();
    const ok = (c: Car | null | undefined) => !!c && (c.loc === "track" || c.loc === "pit" || c.loc === "lane_out" || c.loc === "lane_in");
    if (ok(sel)) return sel;
    return mine().find((c) => ok(c)) ?? null;
  }
  function updateView(cv: HTMLCanvasElement) {
    const tgt = camOn ? camTarget() : null;
    const baseX = (cv.width / 2 - bOx) / bScale, baseY = (bOy - cv.height / 2) / bScale;
    let tx = baseX, ty = baseY, tk = 1;
    if (tgt) {
      const f = modL(tgt.s + (paused ? 0 : tgt.v * leftover)) / track.ds;
      const i = Math.min(track.xs.length - 1, Math.floor(f));
      tx = track.xs[i]; ty = track.ys[i]; tk = CAM_ZOOM;
    }
    if (isNaN(camX)) { camX = baseX; camY = baseY; }
    const a = reducedMotion() ? 1 : 0.18;
    camK += (tk - camK) * a;
    camX += (tx - camX) * a; camY += (ty - camY) * a;
    if (!tgt && Math.abs(camK - 1) < 0.01) { camK = 1; camX = baseX; camY = baseY; }
    mapScale = bScale * camK;
    mapOx = cv.width / 2 - camX * mapScale;
    mapOy = cv.height / 2 + camY * mapScale;
  }
  $("#camb").onclick = (e) => {
    e.stopPropagation();
    if (view3d && m3) { cam3d(m3.cycleCam()); return; }
    camOn = !camOn;
    $("#camb").classList.toggle("on", camOn);
    if (camOn && !camTarget()) showToast("La cámara sigue a tu piloto cuando está en pista (o al coche que toques).", 3500, "Mapa");
    drawMap();
  };
  // gotas de lluvia sobre el mapa: posiciones relativas que caen con el tiempo real
  const drops = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 }));
  let dropT = performance.now();
  function drawRain(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, dpr: number) {
    const now = performance.now(), dtR = Math.min(0.1, (now - dropT) / 1000);
    dropT = now;
    if (rainNow < 0.3 || reducedMotion()) return;
    const n = Math.min(drops.length, Math.round(18 + rainNow * 10));
    const wn = windNow(sess.weather);
    const tilt = Math.max(-0.6, Math.min(0.6, (Math.cos(wn.dir) * wn.speed) / 60));
    g.save();
    g.strokeStyle = "rgba(185, 210, 255, .42)"; g.lineWidth = 1.1 * dpr; g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      if (!paused) { d.y += d.v * dtR * 1.4; d.x += tilt * dtR * 0.5; }
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
      d.x = ((d.x % 1) + 1) % 1;
      const x = d.x * cv.width, y = d.y * cv.height, l = 9 * dpr;
      g.moveTo(x, y); g.lineTo(x + tilt * l, y + l);
    }
    g.stroke();
    g.restore();
  }
  /** Pit-lane: línea paralela al trazado desde la entrada hasta la salida. */
  function drawPitLane(g: CanvasRenderingContext2D, dpr: number) {
    const ent = track.pit.entry, ex = track.pit.exit + track.length;
    const side = 8 * dpr * zoomW();
    g.save();
    g.strokeStyle = "rgba(160, 166, 178, .55)"; g.lineWidth = 2.2 * dpr * zoomW();
    g.beginPath();
    for (let s = ent, k = 0; s <= ex; s += track.ds * 2, k++) { const p = trackAt(s, side); if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    g.stroke();
    g.restore();
  }
  /** Coche: flecha con el color del equipo hacia donde va y, si va rápido, una estela corta detrás. */
  function drawCar(g: CanvasRenderingContext2D, c: Car, s: number, pit: boolean, r: number, dpr: number) {
    const side = pit ? 8 * dpr * zoomW() : 0;
    const p = trackAt(s, side);
    if (!pit && c.v > 35 && !reducedMotion()) {
      const len = Math.min(140, c.v * 0.9) * (camK > 1.5 ? 0.6 : 1.4);
      const t = trackAt(s - len, side);
      const grad = g.createLinearGradient(t.x, t.y, p.x, p.y);
      grad.addColorStop(0, c.team.color + "00"); grad.addColorStop(1, c.team.color + "aa");
      g.strokeStyle = grad; g.lineWidth = r * 0.95; g.lineCap = "round";
      g.beginPath();
      for (let d = len, k = 0; d >= 0; d -= track.ds * 2, k++) { const q = trackAt(s - d, side); if (k) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
      g.lineTo(p.x, p.y);
      g.stroke();
    }
    const { dx, dy } = p;
    g.beginPath();
    g.moveTo(p.x + dx * r * 1.55, p.y + dy * r * 1.55);
    g.lineTo(p.x - dx * r * 0.9 - dy * r * 1.05, p.y - dy * r * 0.9 + dx * r * 1.05);
    g.lineTo(p.x - dx * r * 0.45, p.y - dy * r * 0.45);
    g.lineTo(p.x - dx * r * 0.9 + dy * r * 1.05, p.y - dy * r * 0.9 - dx * r * 1.05);
    g.closePath();
    g.fillStyle = c.team.color; g.fill();
    g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 0.9 * dpr; g.stroke();
    return p;
  }

  function drawMap() {
    const cv = $<HTMLCanvasElement>("#map");
    if (!cv || wide || cv.width < 20 || cv.height < 20) return;
    const g = cv.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    g.clearRect(0, 0, cv.width, cv.height);
    updateRainLayer(cv);
    updateView(cv);
    const zw = zoomW();
    const night = lightAt(sess.weather.clock) === "noche";
    if (rainLayerOn) {
      // la capa está calculada para la vista base: se amplía con la misma cámara que el trazado
      const k = mapScale / bScale;
      g.save();
      g.setTransform(k, 0, 0, k, mapOx - bOx * k, mapOy - bOy * k);
      g.imageSmoothingEnabled = true; g.drawImage(rainLayer, 0, 0, cv.width, cv.height);
      g.restore();
    }
    g.lineCap = "round"; g.lineJoin = "round";
    drawPitLane(g, dpr);
    // zonas de modo adelantamiento: línea discontinua por fuera del trazado
    g.save();
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 1.3 * dpr; g.setLineDash([3 * dpr, 3 * dpr]);
    for (const m of track.ms) {
      if (!m.drs) continue;
      const i0 = Math.floor(m.s0 / track.ds), i1 = Math.min(track.xs.length - 2, Math.floor(m.s1 / track.ds));
      g.beginPath();
      for (let i = i0; i <= i1; i++) {
        const x = mx(track.xs[i]), y = my(track.ys[i]);
        const dx = mx(track.xs[i + 1]) - x, dy = my(track.ys[i + 1]) - y, n = Math.hypot(dx, dy) || 1;
        const ox = x - (dy / n) * 6 * dpr, oy = y + (dx / n) * 6 * dpr;
        if (i === i0) g.moveTo(ox, oy); else g.lineTo(ox, oy);
      }
      g.stroke();
    }
    g.restore();
    // de noche, el circuito iluminado por los focos: un halo cálido alrededor del asfalto
    if (night) {
      g.save();
      g.strokeStyle = "rgba(255, 236, 190, .16)"; g.lineWidth = 13 * dpr * zw;
      g.shadowColor = "rgba(255, 230, 170, .55)"; g.shadowBlur = 14 * dpr;
      g.beginPath(); for (const m of track.ms) msPath(g, m); g.stroke();
      g.restore();
    }
    for (const m of track.ms) {
      const w = sess.water[m.i];
      g.strokeStyle = w > 0.05 ? `rgba(70,150,240,${Math.min(1, 0.55 + w * 0.45)})` : night ? "#8c919b" : MAP.track;
      g.lineWidth = 5 * dpr * zw;
      g.beginPath(); msPath(g, m); g.stroke();
      // asfalto mojado: un brillo fino encima
      if (w > 0.2) { g.strokeStyle = `rgba(220,235,255,${Math.min(0.45, 0.12 + w * 0.15)})`; g.lineWidth = 1.3 * dpr * zw; g.beginPath(); msPath(g, m); g.stroke(); }
    }
    // frenadas donde se adelanta (cuanto más fácil, más intenso)
    for (const m of track.ms) {
      if (m.overtake < 0.15) continue;
      g.strokeStyle = `rgba(255,150,40,${Math.min(1, 0.45 + m.overtake)})`; g.lineWidth = 5 * dpr * zw;
      g.beginPath(); msPath(g, m); g.stroke();
    }
    // sectores del coche que sigues (o de tu piloto): morado, verde o amarillo, como los parciales
    const sc = sectorCar();
    if (sc) {
      for (const m of track.ms) {
        const col = sectorColor(sc, m.sector);
        if (!col?.col) continue;
        g.globalAlpha = col.live ? 1 : 0.55;
        g.strokeStyle = col.col; g.lineWidth = 1.8 * dpr * zw;
        g.beginPath(); msPath(g, m); g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = MAP.label; g.lineWidth = 2 * dpr;
    tick(g, 0, 6 * dpr);
    g.lineWidth = 1.2 * dpr;
    for (const j of [1, 2]) tick(g, track.ms[sess.secStart[j]]?.s0 ?? 0, 5 * dpr);
    const traffic = trafficIds();
    const sel = selCar();
    // orden de dibujo: los que no van lanzados debajo, luego el resto, tus pilotos y el seguido encima
    const rank = (c: Car) => (c === sel ? 3 : c.player ? 2 : race || hot(c) ? 1 : 0);
    const cars = sess.cars.filter((c) => c.loc === "track" || c.loc === "pit").sort((a, b) => rank(a) - rank(b));
    const pts: typeof mapPts = [];
    g.font = `900 ${9 * dpr}px "Titillium Web", sans-serif`;
    for (const c of cars) {
      const s = c.s + (paused ? 0 : c.v * leftover);
      const slow = !race && !c.player && c !== sel && !hot(c);
      const r = (c.player || c === sel ? 5 : slow ? 2.8 : 3.6) * dpr * (camK > 1.5 ? 1.35 : 1);
      g.globalAlpha = slow ? 0.45 : 1;
      const { x, y } = drawCar(g, c, s, c.loc === "pit", r, dpr);
      g.globalAlpha = 1;
      pts.push({ id: c.id, x, y });
      if (traffic.has(c.id)) { g.strokeStyle = "#ffd84a"; g.lineWidth = 1.6 * dpr; g.beginPath(); g.arc(x, y, r + 2.5 * dpr, 0, 7); g.stroke(); }
      if (c.player || c === sel) {
        g.strokeStyle = c === sel ? "#ffd84a" : MAP.label; g.lineWidth = (c === sel ? 2 : 1.5) * dpr;
        g.beginPath(); g.arc(x, y, r + 2.2 * dpr, 0, 7); g.stroke();
        g.fillStyle = c === sel ? "#ffd84a" : MAP.label;
        g.fillText(c.d.abrev, x + 7 * dpr, y - 6 * dpr);
      } else if (camK > 1.8) {
        // con la cámara cerca se lee quién es cada uno
        g.fillStyle = "rgba(255,255,255,.85)";
        g.fillText(c.d.abrev, x + 6 * dpr, y - 5 * dpr);
      }
    }
    mapPts = pts;
    // fantasmas de parada: círculo discontinuo con la posición de salida (si los dos caen juntos,
    // la etiqueta del segundo va encima para que no se pisen)
    const labels: { x: number; y: number }[] = [];
    for (const c of mine()) {
      const gh = ghosts.get(c.id);
      if (!gh) continue;
      const sNow = c.s + (paused ? 0 : c.v * leftover);
      const { x, y } = carXY(sNow - metersBack(sNow, gh.loss), false, dpr);
      g.save();
      g.setLineDash([2.5 * dpr, 2 * dpr]);
      g.strokeStyle = c.team.color; g.lineWidth = 2 * dpr;
      g.fillStyle = "rgba(0,0,0,.55)";
      g.beginPath(); g.arc(x, y, 5.5 * dpr, 0, 7); g.fill(); g.stroke();
      g.restore();
      const t = `${c.d.abrev} P${gh.pos}`;
      g.font = `900 ${8.5 * dpr}px "Titillium Web", sans-serif`;
      const tw = g.measureText(t).width;
      let ly = y + 2 * dpr;
      while (labels.some((l) => Math.abs(l.x - x) < tw + 8 * dpr && Math.abs(l.y - ly) < 11 * dpr)) ly -= 12 * dpr;
      labels.push({ x, y: ly });
      g.fillStyle = "rgba(0,0,0,.75)"; g.fillRect(x + 6 * dpr, ly, tw + 4 * dpr, 10 * dpr);
      g.fillStyle = "#fff"; g.fillText(t, x + 8 * dpr, ly + 8 * dpr);
    }
    drawRain(g, cv, dpr);
  }
  $<HTMLCanvasElement>("#map").addEventListener("click", (e) => {
    const cv = e.currentTarget as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
    const dpr = window.devicePixelRatio || 1;
    let best: number | null = null, bd = (20 * dpr) ** 2;
    for (const p of mapPts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.id; } }
    if (best === null) { if (selId !== null) select(null); } else select(best);
  });

  // ---------------------------------------------------- franja de huecos (carrera)
  // Toda la parrilla en una vuelta, el líder a la izquierda: se ven los huecos libres y dónde
  // caería tu piloto si parase ahora (círculo discontinuo con la posición de salida).
  let stripPts: { id: number; x: number }[] = [];
  function drawStrip() {
    const cv = document.getElementById("gapstrip") as HTMLCanvasElement | null;
    if (!cv || wide) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = 34;
    if (W < 20) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const rows = sess.intervals().filter((r) => r.car.loc !== "out" && r.car.loc !== "fin");
    const lead = rows[0]?.car;
    const lap = (lead && lead.lapTimes.length ? lead.lapTimes[lead.lapTimes.length - 1] : 0) || sess.lapRefRace || 90;
    const pad = 6, y0 = 11, y1 = 23;
    const X = (t: number) => pad + ((((t % lap) + lap) % lap) / lap) * (W - 2 * pad);
    g.fillStyle = "#15171b"; g.fillRect(0, y0 - 2, W, y1 - y0 + 4);
    g.strokeStyle = "#2c3038"; g.lineWidth = 1;
    for (let t = 10; t < lap; t += 10) { const x = Math.round(X(t)) + 0.5; g.beginPath(); g.moveTo(x, y0 - 2); g.lineTo(x, y1 + 2); g.stroke(); }
    const sel = selCar();
    const pts: typeof stripPts = [];
    const ordered = [...rows].sort((a, b) => Number(a.car.player || a.car === sel) - Number(b.car.player || b.car === sel));
    // etiquetas sin pisarse: si caen juntas, la siguiente se corre a la derecha
    const place = (used: number[], x: number, w: number) => {
      let lx = Math.max(w / 2, Math.min(W - w / 2, x));
      while (used.some((u) => Math.abs(u - lx) < w)) lx += w;
      if (lx > W - w / 2) { lx = Math.max(w / 2, Math.min(W - w / 2, x)); while (used.some((u) => Math.abs(u - lx) < w)) lx -= w; }
      used.push(lx);
      return lx;
    };
    const bottom: number[] = [], top: number[] = [];
    g.font = `900 9px "Titillium Web", sans-serif`; g.textAlign = "center"; g.textBaseline = "alphabetic";
    for (const { car: c, gap } of ordered) {
      if (!isFinite(gap)) continue;
      const x = X(c === lead ? 0 : gap);
      pts.push({ id: c.id, x });
      const big = c.player || c === sel;
      g.globalAlpha = c.loc === "track" || big ? 1 : 0.45;
      g.fillStyle = c.team.color;
      g.fillRect(x - (big ? 2 : 1), big ? y0 - 3 : y0, big ? 4 : 2.5, big ? y1 - y0 + 6 : y1 - y0);
      g.globalAlpha = 1;
      if (big) { g.fillStyle = c === sel ? "#ffd84a" : "#fff"; g.fillText(c.d.abrev, place(bottom, x, 22), H - 1); }
    }
    stripPts = pts;
    for (const c of mine()) {
      const gh = ghosts.get(c.id);
      if (!gh) continue;
      const x = X(gh.at);
      g.save(); g.setLineDash([2, 2]); g.strokeStyle = c.team.color; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, (y0 + y1) / 2, 4.5, 0, 7); g.stroke(); g.restore();
      g.fillStyle = "#fff"; g.font = `900 8.5px "Titillium Web", sans-serif`;
      g.fillText(`${c.d.abrev} P${gh.pos}`, place(top, x, 40), 8);
    }
  }
  document.getElementById("gapstrip")?.addEventListener("click", (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    let best: number | null = null, bd = 10;
    for (const p of stripPts) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p.id; } }
    if (best !== null) select(best);
  });

  // ------------------------------------------------- rótulo del coche que sigues
  function renderSel() {
    const el = document.getElementById("selchip");
    if (!el) return;
    const c = selCar();
    if (!c) { if (el.innerHTML) { el.innerHTML = ""; el.classList.remove("on"); } return; }
    const ord = sess.order();
    const pos = ord.indexOf(c) + 1;
    const tyre = c.tyres && (race || c.loc !== "garage") ? `${tyreHtml(c.tyres.c)}<span class="mono">${c.tyres.laps}v</span>` : "";
    let info = "";
    if (c.loc === "out") info = `<span class="dim">Fuera</span>`;
    else if (race) {
      if (c.player) {
        const a = ord[pos - 2], b = ord[pos];
        const f = (x: number) => (isFinite(x) && x > 0 ? x.toFixed(1) : "—");
        info = `${a ? `▲${a.d.abrev} ${f(sess.gapBetween(a, c))}` : "Líder"}${b && b.loc !== "out" ? ` · ▼${b.d.abrev} ${f(sess.gapBetween(c, b))}` : ""}`;
      } else {
        // hueco con el más cercano de tus pilotos
        let best = "";
        let bv = Infinity;
        for (const m of mine()) {
          if (m.loc === "out") continue;
          const ahead = ord.indexOf(c) < ord.indexOf(m);
          const gp = ahead ? sess.gapBetween(c, m) : sess.gapBetween(m, c);
          if (isFinite(gp) && gp < bv) { bv = gp; best = `${gp.toFixed(1)} s ${ahead ? "delante de" : "detrás de"} ${m.d.abrev}`; }
        }
        info = best;
      }
    } else {
      const b = bestOf(c);
      info = `${b !== undefined && isFinite(b) ? fmtLap(b) : "Sin tiempo"} · ${phaseName(c)}`;
    }
    const html = `<span class="posbox mono">${pos}</span><span class="nm"><span class="teamdot" style="background:${c.team.color}"></span>${c.d.abrev}</span><span class="in">${tyre}<span>${info}</span></span><span class="x" title="Dejar de seguir">✕</span>`;
    el.classList.add("on");
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  $("#selchip").onclick = () => select(null);

  // --------------------------------------------------------------- torre
  const towerEl = $("#tower");
  towerEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".th button") as HTMLButtonElement | null;
    if (!b) {
      // tocar una fila: seguir a ese coche en el mapa
      const row = (e.target as HTMLElement).closest(".tr[data-id]") as HTMLElement | null;
      if (row) select(Number(row.dataset.id));
      return;
    }
    if (b.dataset.w) { towerTops = new Map(); wide = !wide; document.querySelector(".main")!.classList.toggle("wide", wide); if (!wide) requestAnimationFrame(() => sizeMap()); }
    else { const order: TowerMode[] = ["int", "gap", "last", "tyre"]; mode = order[(order.indexOf(mode) + 1) % order.length]; }
    renderTower();
  });
  /** Al final de la fila: «P» si el coche está en boxes (garaje o pit-lane), una marca verde si está en pista. */
  function whereCell(c: Car): string {
    if (c.loc === "out" || c.loc === "fin") return `<span class="lc"></span>`;
    return c.loc === "track" ? `<span class="lc trk" title="En pista"></span>` : `<span class="lc pit" title="En boxes">P</span>`;
  }
  function statusFlag(c: Car): string {
    if (c.loc === "out") return `<span class="flag outl">OUT</span>`;
    if (c.loc === "pit" || c.loc === "lane_in" || c.loc === "lane_out") return `<span class="flag pit">PIT</span>`;
    if (!race && c.loc === "garage") return "";
    if (!race && c.run?.phase === "out") return `<span class="flag outl">OUT LAP</span>`;
    if (!race && c.run?.phase === "push" && c.loc === "track" && c.lapStart > 0) {
      // en vuelta lanzada: el color es el de su último parcial (morado, verde o amarillo)
      let k = "";
      for (let j = 0; j < 3; j++) if (!isNaN(c.secCur[j])) k = tcls(c.secCur[j], c.secBest[j], sess.secBest[j]);
      return `<span class="flag vl ${c.lapValid ? k : "bad"}" title="En vuelta lanzada: tócalo para ver su vuelta en el mapa">▶</span>`;
    }
    if (c.drs) return `<span class="flag mo">MO</span>`;
    return "";
  }
  /** Color de un tiempo como en la tele: morado = mejor de la sesión, verde = mejor personal, amarillo = más lento. */
  const tcls = (t: number, own: number, all: number) => (!isFinite(t) ? "" : t <= all + 1e-6 ? "purple" : t <= own + 1e-6 ? "green" : "yellow");
  function sectorCells(c: Car) {
    if (c.loc === "out") return [0, 1, 2].map(() => `<span class="s mono dim"></span>`).join("");
    return [0, 1, 2].map((j) => {
      const cur = c.secCur[j];
      if (!isNaN(cur)) return `<span class="s mono ${tcls(cur, c.secBest[j], sess.secBest[j])}">${cur.toFixed(1)}</span>`;
      const last = c.secLast[j];
      return `<span class="s mono ${tcls(last, c.secBest[j], sess.secBest[j])}" style="opacity:.75">${isNaN(last) ? "" : last.toFixed(1)}</span>`;
    }).join("");
  }
  function lastLap(c: Car) {
    const t = c.lapTimes[c.lapTimes.length - 1];
    if (!t) return `<span class="dim">—</span>`;
    if (c.loc === "out") return `<span class="dim">${fmtLap(t)}</span>`;
    if (!race && !c.lastLapValid) return `<span class="dim" style="text-decoration:line-through">${fmtLap(t)}</span>`;
    return `<span class="${t <= sess.bestLap + 1e-6 ? "purple" : t <= c.best + 1e-6 ? "green" : ""}">${fmtLap(t)}</span>`;
  }
  /**
   * Tendencia de un hueco: se compara con el de hace unos segundos de carrera. `good` es el signo del
   * cambio que te conviene (-1: que baje, con el de delante; +1: que suba, con el de atrás). El color se
   * mantiene hasta que la tendencia cambia de verdad, para que no parpadee.
   */
  const trends = new Map<number, { rival: number | undefined; ref: number; t: number; cls: string }>();
  function gapTrend(key: number, rival: number | undefined, gap: number, good: number): string {
    let st = trends.get(key);
    if (!st || st.rival !== rival || !isFinite(gap) || !isFinite(st.ref)) { st = { rival, ref: gap, t: sess.t, cls: "" }; trends.set(key, st); return "flat"; }
    if (sess.t - st.t >= 4) {
      const d = (gap - st.ref) * good;
      if (d > 0.04) st.cls = "gain"; else if (d < -0.04) st.cls = "gold";
      st.ref = gap; st.t = sess.t;
    }
    return st.cls || "flat";
  }
  function renderTower() {
    const rows = sess.intervals();
    const part = sess.parts[sess.part];
    const sessBest = Math.min(...sess.cars.map((c) => (quali ? c.bestByPart[sess.part] ?? Infinity : c.best)));
    const names = race ? { int: "Intervalo", gap: "Líder", last: "Última", tyre: "Neumático" } : { int: "Tiempo", gap: "Dif.", last: "Última", tyre: "Neumático" };
    let head = "";
    if (race) head = `V${Math.min(sess.laps, sess.leaderLap + 1)}/${sess.laps}`; // corto: el contador grande ya está arriba
    else if (quali) head = `${part?.name ?? ""}`;
    else head = SESSION_NAMES[kind];
    let html = `<div class="th"><span class="tab">${head}</span><span class="grow"></span>${wide ? "" : `<button>${names[mode]}</button>`}<button data-w="1">${wide ? "⤡ Mapa" : "⤢"}</button></div>`;
    if (wide) html += race
      ? `<div class="trh"><span class="p"></span><span class="n">Piloto</span><span class="w">Int.</span><span class="w">Líder</span><span class="l">Última</span><span class="s">S1</span><span class="s">S2</span><span class="s">S3</span><span class="t">Neu</span><span class="k">P</span></div>`
      : `<div class="trh"><span class="p"></span><span class="n">Piloto</span><span class="l">Mejor</span><span class="w">Dif.</span><span class="l">Última</span><span class="s">S1</span><span class="s">S2</span><span class="s">S3</span><span class="t">Neu</span><span class="k">V</span></div>`;
    const cutAt = quali && part?.advance ? part.advance : -1;
    // carrera: posiciones ganadas o perdidas desde la parrilla
    const gridPos = new Map<number, number>(race && started ? (sess.lapOrder[0] ?? []).map((id, k) => [id, k + 1] as [number, number]) : []);
    rows.forEach(({ car: c, gap, interval, lapsDown }, i) => {
      if (i === cutAt) html += `<div class="cut"></div>`;
      const tyre = c.tyres && (race || c.loc !== "garage") ? tyreHtml(c.tyres.c) : "";
      // pelea: a menos de un segundo del de delante, los dos en pista y en la misma vuelta
      const prev = rows[i - 1];
      const fight = race && started && prev && c.loc === "track" && prev.car.loc === "track" && prev.lapsDown === lapsDown && interval > 0 && interval < 1;
      const cls = `tr${i === 0 ? " lead" : ""}${c.player ? " me" : ""}${c.loc === "out" || c.eliminated ? " out" : ""}${wide ? " wide" : ""}${fight ? " fight" : ""}${c.id === selId ? " sel" : ""}`;
      const gp = gridPos.get(c.id);
      const dl = gp && c.loc !== "out" && gp !== i + 1 ? `<span class="dl ${gp > i + 1 ? "upp" : "dn"}" title="Desde la parrilla (P${gp})">${gp > i + 1 ? "▲" : "▼"}${Math.abs(gp - i - 1)}</span>` : "";
      const pre = `<span class="p">${i + 1}</span><span class="c" style="background:${c.team.color}"></span><span class="body"><span class="n">${c.d.abrev}</span>${dl}${statusFlag(c)}`;
      if (wide) {
        let cells = "";
        if (race) {
          const iv = c.loc === "out" ? "OUT" : i === 0 ? "—" : lapsDown > 0 ? `+${lapsDown}V` : `+${Math.max(0, interval).toFixed(1)}`;
          const gp = c.loc === "out" || i === 0 ? "" : lapsDown > 0 ? `+${lapsDown}V` : `+${Math.max(0, gap).toFixed(1)}`;
          cells = `<span class="w mono">${iv}</span><span class="w mono">${gp}</span><span class="l mono">${lastLap(c)}</span>${sectorCells(c)}<span class="t">${tyre}<span class="small mono">${c.tyres ? c.tyres.laps : ""}</span></span><span class="k mono">${c.stops}</span>`;
        } else {
          const b = quali ? c.bestByPart[c.eliminated ? c.elimPart! : sess.part] : c.best;
          const has = b !== undefined && isFinite(b);
          cells = `<span class="l mono ${has && b === sessBest ? "purple" : ""}">${has ? fmtLap(b) : "—"}</span><span class="w mono">${has && i > 0 && isFinite(gap) ? `+${gap.toFixed(3)}` : ""}</span><span class="l mono">${lastLap(c)}</span>${sectorCells(c)}<span class="t">${tyre}<span class="small mono">${c.tyres ? c.tyres.laps : ""}</span></span><span class="k mono">${c.sessionLaps}</span>`;
        }
        html += `<div class="${cls}" data-id="${c.id}">${pre}${cells}</span>${whereCell(c)}</div>`;
        return;
      }
      let g = "";
      if (mode === "last") g = lastLap(c);
      else if (race) {
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
      const bt = race ? null : quali ? c.bestTyreByPart[c.eliminated ? c.elimPart! : sess.part] : c.bestTyre;
      const tyreCell = race || mode === "tyre" ? tyre : bt ? tyreHtml(bt) : "";
      html += `<div class="${cls}" data-id="${c.id}">${pre}<span class="g mono">${g}</span><span class="t">${tyreCell}</span></span>${whereCell(c)}</div>`;
    });
    towerEl.innerHTML = html;
    animateTower();
  }
  // Torre animada (técnica FLIP): se mide dónde estaba cada fila antes de redibujar y, si ha
  // cambiado de puesto, se coloca donde estaba y se desliza a su sitio, con un destello verde si
  // gana posiciones y rojo si las pierde. Mientras se desliza no se redibuja (medio segundo).
  let towerTops = new Map<number, number>();
  let towerAnimUntil = 0;
  function animateTower() {
    const rows = towerEl.querySelectorAll<HTMLElement>(".tr[data-id]");
    const tops = new Map<number, number>();
    rows.forEach((el) => tops.set(Number(el.dataset.id), el.offsetTop));
    const prev = towerTops;
    towerTops = tops;
    if (!started || reducedMotion() || !prev.size) return;
    let moved = false;
    rows.forEach((el) => {
      const id = Number(el.dataset.id), was = prev.get(id), now = tops.get(id)!;
      if (was === undefined || Math.abs(was - now) < 2) return;
      el.style.transform = `translateY(${was - now}px)`;
      el.classList.add(was > now ? "gain" : "loss");
      moved = true;
    });
    if (!moved) return;
    void towerEl.offsetHeight; // aplica la posición de partida antes de animar
    rows.forEach((el) => { if (el.style.transform) { el.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)"; el.style.transform = ""; } });
    towerAnimUntil = performance.now() + 480;
  }

  // ------------------------------------------------- aviso de lluvia por sectores
  // La previsión de tu meteorólogo (con su error, la misma que en «Radar») para cada sector: cuándo
  // empezará a llover en uno que está seco o cuándo escampará. Se rehace cada 20 s de sesión y
  // como mucho cada 2 s reales (a 64× no se recalcula en cada refresco).
  const RAIN_H = [0, 2, 4, 6, 8, 10, 12, 15, 20, 25, 30];
  const secPts = [0, 1, 2].map((j) => track.ms.filter((m) => m.sector === j).filter((_, k) => k % 3 === 0).map((m) => [m.x / 1000, m.y / 1000] as [number, number]));
  const rainAlert: { kind: "" | "start" | "stop"; text: string; wall: number; real: number; toastWall: number } = { kind: "", text: "", wall: -1e9, real: 0, toastWall: -1e9 };
  function updateRainAlert() {
    const w = sess.weather;
    const now = performance.now();
    if (Math.abs(sess.wall - rainAlert.wall) < 20 || now - rainAlert.real < 2000) return;
    rainAlert.wall = sess.wall; rainAlert.real = now;
    const before = rainAlert.kind;
    rainAlert.kind = ""; rainAlert.text = "";
    if (!w.cells.length && w.drizzle <= 0) return;
    const team = wk.teams.find((t) => t.id === wk.playerTeam)!;
    const starts: { j: number; h: number }[] = [], stops: { j: number; h: number }[] = [];
    let wetSecs = 0;
    secPts.forEach((pts, j) => {
      if (!pts.length) return;
      const wetNow = Math.max(...pts.map(([x, y]) => rainAt(w, x, y))) > 0.3;
      // semilla propia: mirar la previsión no toca el azar de la simulación
      const f = forecast(w, team.meteo, new Rng(Math.floor(sess.wall) * 3 + j + 11), 16, RAIN_H, pts);
      if (wetNow) {
        wetSecs++;
        const k = f.horizons.findIndex((h, i) => h > 0 && f.prob[i] < 0.3);
        if (k >= 0) stops.push({ j, h: f.horizons[k] });
      } else {
        const k = f.horizons.findIndex((h, i) => h > 0 && f.prob[i] >= 0.5);
        if (k >= 0) starts.push({ j, h: f.horizons[k] });
      }
    });
    if (starts.length) {
      const h = Math.min(...starts.map((x) => x.h));
      const secs = starts.filter((x) => x.h <= h + 2).map((x) => `S${x.j + 1}`).join("·");
      rainAlert.kind = "start"; rainAlert.text = `Lluvia en ${secs} en ~${h}′`;
      // aviso a la izquierda solo cuando aparece (no cada vez que la previsión baila)
      if (before !== "start" && sess.wall - rainAlert.toastWall > 300) {
        rainAlert.toastWall = sess.wall;
        showToast(`🌦️ Tu meteorólogo: lluvia en ${secs.replace(/·/g, ", ")} en unos ${h} min.`, 6000, "Meteo", false, "left");
      }
    } else if (wetSecs && stops.length === wetSecs) {
      rainAlert.kind = "stop"; rainAlert.text = `escampa ~${Math.max(...stops.map((x) => x.h))}′`;
    }
  }

  // ------------------------------------------------------------ cabecera
  /** Siglas de la sesión para la barra de arriba: FP1, Q2 (la parte en curso), S o R. */
  const sessTag = () => (kind === "RACE" ? "R" : kind === "SPRINT" ? "S" : quali ? sess.parts[sess.part]?.name ?? kind : kind);
  function renderTop() {
    const tag = sessTag(), gpk = $("#gpk");
    if (gpk.textContent !== tag) gpk.textContent = tag;
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
    // noche, tarde o día según la hora local de la sesión (Singapur y Baréin, de noche)
    const luz = lightAt(w.clock), sessEl = document.getElementById("sess");
    if (sessEl && sessEl.dataset.luz !== luz) sessEl.dataset.luz = luz;
    const rMax = sess.maxRainOnTrack();
    const rAvg = sess.rainOnTrack();
    const sw = sess.sectorWater();
    const f1 = (x: number) => x.toFixed(x < 10 ? 1 : 0);
    const wn = windNow(w);
    // flecha: hacia dónde sopla, en el mismo sentido que el mapa (norte arriba)
    const arrow = `<svg class="wind" viewBox="0 0 16 16" style="transform:rotate(${(-wn.dir * 180) / Math.PI}deg)"><path d="M2 8h10M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    $("#wx").innerHTML = `<span class="tab">Hora</span><span class="bar mono"><span class="sky">${fmtHour(w.clock)}${skyIcon(w.cloud, rAvg, w.clock)}</span><span class="grow"></span><span class="sky" title="Viento">${arrow}${Math.round(wn.speed)}<span class="small" style="text-transform:none">&nbsp;km/h</span></span></span>
      <span class="tab">Aire</span><span class="bar mono">${w.airT.toFixed(0)}° <span class="dim">pista</span> ${w.trackT.toFixed(0)}°</span>
      <span class="tab">Cielo</span><span class="bar" style="white-space:nowrap;overflow:hidden">${rMax > 0.15
        ? rainAlert.kind === "stop" ? `Lluvia ${f1(rAvg)}<span class="small" style="text-transform:none">&nbsp;mm/h</span>&nbsp;<span class="yellow" title="Previsión de tu meteorólogo">· ${rainAlert.text}</span>` : `Lluvia ${f1(rAvg)}<span class="small dim">&nbsp;máx</span>&nbsp;${f1(rMax)}<span class="small" style="text-transform:none">&nbsp;mm/h</span>`
        : rainAlert.kind === "start" ? `<span class="yellow" title="Previsión de tu meteorólogo">${rainAlert.text}</span>` : w.cloud > 0.6 ? "Cubierto" : w.cloud > 0.3 ? "Nubes" : "Sol"}</span>
      <span class="tab">Agua</span><span class="bar"><span class="wxsec grow">${sw.map((x) => `<div title="${x.toFixed(2)} mm" style="background:${x > 0.05 ? `rgba(58,139,232,${Math.min(1, 0.35 + x)})` : "#26282d"}"></div>`).join("")}</span><span class="mono small">${Math.max(...sw).toFixed(2)}</span></span>`;
    // última vuelta de tu piloto (libres/clasificación): [P][NOMBRE][TIEMPO][+DIF]
    const lb = $("#lapban");
    if (!race) {
      const c = [...mine()].sort((a, b) => (b.lapStart || 0) - (a.lapStart || 0))[0];
      const last = c.lapTimes[c.lapTimes.length - 1];
      const ord = sess.timingOrder();
      const pos = ord.indexOf(c) + 1;
      const ref = quali ? ord[0].bestByPart[sess.part] : ord[0].best;
      const mineBest = quali ? c.bestByPart[sess.part] : c.best;
      const has = mineBest !== undefined && isFinite(mineBest);
      // en Q1 y Q2 lo que importa no es el primero sino el corte: margen sobre el primer eliminado
      // (verde) o lo que falta para alcanzar al último que se salva (rojo)
      const adv = quali ? sess.parts[sess.part]?.advance ?? null : null;
      const alive = ord.filter((x) => !x.eliminated);
      let box = "", short = false;
      if (has && adv && !c.eliminated && alive.length > adv) {
        const inside = alive.indexOf(c) < adv;
        const ot = (inside ? alive[adv] : alive[adv - 1])?.bestByPart[sess.part];
        short = true;
        if (ot !== undefined && isFinite(ot)) box = `<span class="cutbox mono ${inside ? "in" : "out"}" title="${inside ? "Margen sobre el primer eliminado" : `Lo que falta para el P${adv}, el último que pasa`}"><i>corte</i>${inside ? "−" : "+"}${Math.abs(mineBest - ot).toFixed(3)}</span>`;
        else box = `<span class="cutbox in"><i>corte</i>dentro</span>`;
      } else if (ref && has && ord[0] !== c) box = `<span class="gold mono">+${(mineBest - ref).toFixed(3)}</span>`;
      lb.innerHTML = last ? `<div class="lapbanner"><span class="posbox">${pos}</span><span class="bar grow">${short ? c.d.abrev : nameFlag(c)}</span><span class="bar mono">${has ? fmtLap(mineBest) : "Sin tiempo"}</span>${box}</div>` : "";
    } else lb.innerHTML = "";
  }

  // --------------------------------------------------------- tarjetas
  const drvEl = $("#drivers");
  /** Carrera: lo que toca según el plan, a la vista en la tarjeta (antes solo estaba en «Pilotos»). */
  function planLine(c: Car): string {
    if (c.loc === "out") return `<span class="dim">Fuera de carrera</span>`;
    if (c.loc === "fin") return `<span class="dim">En meta</span>`;
    if (c.pitRequest) { const set = c.e.sets.find((x) => x.id === c.pitRequest); return set ? `<span class="yellow">Box esta vuelta →</span> ${tyreHtml(set.c)}` : ""; }
    if (c.tyres && !DRY.includes(c.tyres.c)) return `<span class="dim">Con ${COMPOUNDS[c.tyres.c].name.toLowerCase()}: parada según la pista</span>`;
    const rest = c.plan.stints.slice(c.stops);
    if (rest.length < 2) return `<span class="dim">Plan: hasta el final sin parar</span>`;
    const inLaps = rest[0].endLap - sess.lapsDone(c) - 1;
    return `<span title="Próxima parada según el plan">v${rest[0].endLap}</span> <span class="${inLaps <= 2 ? "yellow" : "dim"}">(${inLaps > 0 ? `en ${inLaps}` : "ya"})</span> → ${tyreHtml(rest[1].c)}${rest[2] ? ` <span class="dim">· v${rest[1].endLap} →</span> ${tyreHtml(rest[2].c)}` : ""}`;
  }
  function phaseName(c: Car) {
    if (c.loc === "garage") return c.eliminated ? "Eliminado" : !quali && !c.auto && c.queue.length ? `Garaje · sale ya` : "Garaje";
    if (c.loc === "lane_out") return "Saliendo";
    if (c.loc === "lane_in") return "Entrando";
    if (c.loc === "out") return "Fuera";
    if (c.loc === "fin") return "Meta";
    if (c.loc === "pit") return "En boxes";
    const ph = c.run?.phase;
    return ph === "out" ? "V. de salida" : ph === "push" ? "V. lanzada" : ph === "cool" ? "Enfriando" : ph === "in" ? "Entrando" : ph === "long" ? `Tanda ${c.run!.done}/${c.run!.pushLaps}` : PUSH_NAMES[c.push];
  }
  /** Color de la temperatura del neumático frente a su ventana: azul frío, verde bien, amarillo al borde, rojo caliente. */
  const tyreTempCol = (comp: Compound, v: number) => { const sp = COMPOUNDS[comp]; const d = v - sp.opt; return Math.abs(d) < sp.window * 0.5 ? "#33e05f" : d < -sp.window ? "#3a8be8" : d > sp.window ? "#ff5a50" : "#ffd84a"; };
  /**
   * Coche visto desde arriba (morro a la derecha) con sus cuatro ruedas: el color es la temperatura
   * frente a la ventana del compuesto y el relleno, la banda de rodadura que queda. La simulación
   * lleva delanteros y traseros por eje, así que las dos de cada eje van iguales.
   */
  function tyreCar(t: TyreSet) {
    const wheel = (x: number, y: number, w: number, a: TyreSet["F"]) => {
      const col = tyreTempCol(t.c, a.tBulk), left = Math.max(0, Math.min(1, 1 - a.wear));
      return `<rect x="${x}" y="${y}" width="${w}" height="5" rx="1" fill="#111" stroke="${col}" stroke-width="1"/><rect x="${x + 1}" y="${y + 1}" width="${((w - 2) * left).toFixed(1)}" height="3" fill="${col}"/>`;
    };
    const tip = `Delanteros ${t.F.tBulk.toFixed(0)}° · ${Math.round((1 - t.F.wear) * 100)} % de banda — Traseros ${t.R.tBulk.toFixed(0)}° · ${Math.round((1 - t.R.wear) * 100)} %`;
    return `<svg class="tcar" viewBox="0 0 42 16" role="img" aria-label="${tip}"><title>${tip}</title><path d="M8 6.2h20l10 1.3v1l-10 1.3H8z" fill="#5b6070"/><rect x="2" y="5" width="4" height="6" rx="1" fill="#5b6070"/>${wheel(5, 0, 9, t.R)}${wheel(5, 11, 9, t.R)}${wheel(27, 0, 8, t.F)}${wheel(27, 11, 8, t.F)}</svg>`;
  }
  function statsHtml(c: Car) {
    const t = c.tyres;
    const cell = (k: string, v: string, cls = "") => `<div class="cl ${cls}"><i>${k}</i><b>${v}</b></div>`;
    const lap1 = (x: number | undefined) => (x && isFinite(x) ? fmtMinSec(x, 1) : "—");
    const lt = c.lapTimes[c.lapTimes.length - 1];
    const ltCls = !lt ? "dim" : !race && !c.lastLapValid ? "dim" : lt <= sess.bestLap + 1e-6 ? "purple" : lt <= c.best + 1e-6 ? "green" : "";
    const temps = t ? tyreCar(t) : "—";
    if (race) {
      const ord = sess.order();
      const pos = ord.indexOf(c) + 1;
      const ahead = ord[pos - 2], behind = ord[pos];
      const ga = ahead && c.loc === "track" ? sess.gapBetween(ahead, c) : NaN;
      const gb = behind && behind.loc === "track" ? sess.gapBetween(c, behind) : NaN;
      const f = (g: number) => (!isFinite(g) ? "—" : g > sess.lapRefRace * 0.95 ? "1V+" : g.toFixed(1));
      const d = c.fuel / sess.fuelPerLap - (sess.laps - sess.lapsDone(c));
      const soc = Math.round((c.soc / SOC_MAX) * 100);
      // verde si el hueco mejora (te acercas al de delante o te alejas del de atrás), amarillo si empeora
      return cell(`▲ ${ahead ? ahead.d.abrev : ""}`, f(ga), gapTrend(c.id * 2, ahead?.id, ga, -1)) + cell(`▼ ${behind ? behind.d.abrev : ""}`, f(gb), gapTrend(c.id * 2 + 1, behind?.id, gb, 1))
        + cell("Última", lap1(lt), ltCls)
        + cell("Ruedas", temps, "tc") + cell("Gasolina", `${d >= 0 ? "+" : ""}${d.toFixed(1)} v`, d < 0 ? "redt" : d < 0.4 ? "yellow" : "")
        + cell(c.drs ? "Batería · MO" : "Batería", `${soc} %`, c.drs ? "green" : soc < 20 ? "yellow" : "");
    }
    const best = quali ? c.bestByPart[c.eliminated ? c.elimPart! : sess.part] : c.best;
    const secs = [0, 1, 2].map((j) => { const cur = !isNaN(c.secCur[j]); const v = cur ? c.secCur[j] : c.secLast[j]; return `<span class="${tcls(v, c.secBest[j], sess.secBest[j])}" style="${cur ? "" : "opacity:.6"}">●</span>`; }).join("");
    return cell("Mejor", best && isFinite(best) ? fmtLap(best) : "—", "gold") + cell("Última", lap1(lt), ltCls)
      + cell("Sectores", secs) + cell("Ruedas", temps, "tc")
      + cell("Vueltas", String(c.sessionLaps)) + cell("Gasolina", `${c.fuel.toFixed(0)} kg`);
  }
  function renderDrivers() {
    const ord = sess.order();
    const redRace = race && sess.flag === "red";
    const cars = mine();
    if (!drvEl.dataset.built) {
      drvEl.dataset.built = "1";
      drvEl.innerHTML = cars.map((c) => `<div class="dcard" data-card="${c.id}"><div class="h"></div><div class="wear"><i></i></div>${race ? `<div class="planl"></div>` : ""}
        <div class="mid"><div class="stats"></div></div><div class="b"></div></div>`).join("");
    }
    cars.forEach((c, i) => {
      const card = drvEl.querySelector<HTMLElement>(`[data-card="${c.id}"]`)!;
      const pos = ord.indexOf(c) + 1;
      const t = c.tyres;
      const wear = t ? setWear(t) : 0;
      const col = t ? wearColor(t) : "#444";
      const tyreInfo = t ? `${tyreHtml(t.c)}<span class="small mono">${t.laps}v ${lifeLeft(t)}%</span>` : `<span class="small dim">${phaseName(c)}</span>`;
      card.querySelector(".h")!.innerHTML = `<span class="posbox mono">${pos}</span><span class="hm">${helmetSvg(c.team.color, c.d.numero, c.d.abrev, 21)}</span><span class="nm">${nameFlag(c)}<span class="ti">${tyreInfo}</span></span>`;
      const wi = card.querySelector<HTMLElement>(".wear i")!;
      wi.style.width = `${(1 - wear) * 100}%`; wi.style.background = col;
      const pl = card.querySelector<HTMLElement>(".planl");
      if (pl) { const h = planLine(c); if (pl.innerHTML !== h) pl.innerHTML = h; }
      card.querySelector(".stats")!.innerHTML = statsHtml(c);
      let btns = "";
      if (redRace) btns = `<button class="yellow" data-a="red" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>Cambiar neumáticos</button>`;
      else if (race) btns = `<button data-a="minus" data-i="${i}" class="sq">−</button><span class="mode">${c.loc === "track" ? PUSH_NAMES[c.push] : phaseName(c)}</span><button data-a="plus" data-i="${i}" class="sq">+</button><button class="${c.pitRequest ? "yellow" : ""}" data-a="box" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>${c.pitRequest ? "BOX ✓" : "BOX"}</button>`;
      else {
        // en libres se puede dejar programada la siguiente tanda con el coche en pista
        const canGo = !c.eliminated && sess.remaining() > 0 && sess.flag !== "red" && (c.loc === "garage" || (!quali && c.loc !== "out"));
        const queued = !quali && !c.auto ? c.queue.length : 0;
        const goLabel = quali ? "Salir" : c.loc === "garage" ? "Tanda" : queued ? `Después ✓` : "Después";
        btns = `<button data-a="go" data-i="${i}" class="${queued && c.loc !== "garage" ? "yellow" : ""}" ${canGo ? "" : "disabled"}>${goLabel}</button><button data-a="in" data-i="${i}" ${c.loc !== "track" ? "disabled" : ""}>Boxes</button><button class="${c.auto ? "on" : ""}" data-a="auto" data-i="${i}">Auto</button>`;
      }
      const b = card.querySelector(".b")!;
      if (b.innerHTML !== btns) b.innerHTML = btns;
    });
  }
  drvEl.addEventListener("click", (e) => {
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
    if (a === "auto") {
      // al devolverle el programa al equipo, este lo rehace con lo que aún cabe en la sesión
      if (c.auto) { c.auto = false; c.queue = []; } else teamTakesOver(sess, c);
      showToast(c.auto ? `🤖 El equipo lleva el programa de ${c.d.abrev}` : `🎮 Tú llevas a ${c.d.abrev}`, 2500);
    }
    renderDrivers();
  });

  // --------------------------------------------------------------- hojas
  /** ¿Tiene sentido ahora un neumático de agua? Si no, intermedios y lluvia van plegados. */
  const wetNow = () => sess.avgWater() > WET.si * 0.4 || sess.maxRainOnTrack() > 0.3;
  /**
   * Juegos para elegir, agrupados: los iguales son un solo botón con su número (ocho blandos
   * nuevos no son ocho botones). Debajo de cada uno, la barra de goma que le queda, como en la
   * tarjeta del piloto. Con pista seca, los de agua quedan plegados al final.
   */
  function setButtons(c: Car, filter: (s: TyreSet) => boolean, selected?: string) {
    const sets = c.e.sets.filter((s) => !s.returned && filter(s)).sort((a, b) => ALL.indexOf(a.c) - ALL.indexOf(b.c) || setWear(a) - setWear(b));
    if (!sets.length) return `<div class="dim small" style="margin:8px 0">No quedan juegos.</div>`;
    const groups = groupSets(sets);
    const btn = (g: (typeof groups)[number]) => {
      const sel = g.sets.find((s) => s.id === selected);
      const s = sel ?? g.sets[0];
      return `<button data-set="${s.id}" class="${sel ? "on" : ""}">${tyreHtml(g.c, true)}<span>${COMPOUNDS[g.c].name}</span><span class="dim">${setLabel(s)}</span>${g.sets.length > 1 ? `<span class="cnt">×${g.sets.length}</span>` : ""}<i class="lifebar"><i style="width:${lifeLeft(s)}%;background:${wearColor(s)}"></i></i></button>`;
    };
    const fold = !wetNow();
    const main = groups.filter((g) => !fold || DRY.includes(g.c) || g.sets.some((s) => s.id === selected));
    const rest = groups.filter((g) => !main.includes(g));
    const nRest = rest.reduce((a, g) => a + g.sets.length, 0);
    return `<div class="opts">${main.map(btn).join("")}</div>${rest.length ? `<details class="fold"><summary>Intermedios y lluvia · ${nRest} juegos (la pista está seca)</summary><div class="opts">${rest.map(btn).join("")}</div></details>` : ""}`;
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
      <div class="small dim">Para al final de esta vuelta. Usados: ${used}.${kind === "RACE" ? " En seco hay que usar dos compuestos." : ""} El % es la goma que queda.</div>
      ${setButtons(c, (s) => s !== c.tyres && !s.punctured, c.pitRequest ?? undefined)}
      ${race ? (() => { const os = stopOptions(sess, c).filter((o) => fitsWater(o.c)); if (!os.length) return ""; const catches = os.filter((o) => o.catchLaps !== null); return `<div style="margin:-2px 0 8px">${exitLine(os[0])}${catches.length ? `<div class="small">${catches.map((o) => `${tyreHtml(o.c)} alcanza a ${o.ahead!.car.d.abrev} en ${o.catchLaps} v`).join(" · ")}</div>` : ""}<div class="small dim">Más detalle en «Muro».</div></div>`; })() : ""}
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
      ${setButtons(c, (s) => !s.punctured, c.tyres?.id)}
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
      ${setButtons(c, (s) => !part.compound || water > WET.si || s.c === part.compound)}
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
    const inGarage = c.loc === "garage";
    const draw = (el: HTMLElement) => {
      el.querySelector("#types")!.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.getAttribute("data-t") === type));
      el.querySelector<HTMLElement>("#lapsbox")!.style.display = type === "long" ? "" : "none";
    };
    const runName = (r: { kind: string; pushLaps: number }) => (r.kind === "long" ? `tanda de ${r.pushLaps} v` : r.kind === "qsim" ? "sim. de clasificación" : "instalación");
    // lo que ya está programado para después (solo si el programa lo llevas tú)
    const queueHtml = () => (!c.auto && c.queue.length ? `<div class="small" style="margin:6px 0">Programado para después: ${c.queue.map((r, j) => { const st = c.e.sets.find((x) => x.id === r.setId); return `<span class="pill">${st ? tyreHtml(st.c) : ""} ${runName(r)} <button data-unq="${j}" class="x" title="Quitar">✕</button></span>`; }).join(" ")}</div>` : "");
    open(`<b class="up">Tanda de ${esc(c.d.nombre)}</b>
      <div class="small dim">Una tanda larga mide el desgaste real del compuesto y reduce el error de tus ingenieros. Gasta neumáticos: los juegos usados se pueden devolver tras la sesión.${inGarage ? "" : ` <span class="yellow">${esc(c.d.abrev)} está en pista: lo que elijas saldrá en cuanto vuelva al garaje.</span>`}${c.auto ? " Al programarla, el programa pasa a llevarlo tú." : ""}</div>
      <div id="qbox">${queueHtml()}</div>
      <div class="seg" id="types"><button data-t="inst">Instalación</button><button data-t="qsim">Simulación de clasificación</button><button data-t="long">Tanda larga</button></div>
      <div id="lapsbox"><h2>Vueltas</h2><div class="seg" id="laps">${[5, 8, 12, 16].map((n) => `<button data-n="${n}" class="${n === laps ? "on" : ""}">${n}</button>`).join("")}</div></div>
      <h2>Juego <span class="dim small" style="text-transform:none">· el % es la goma que queda</span></h2>${setButtons(c, () => true)}
      <div class="btnrow" style="padding:0"><button data-close>Cancelar</button><button class="red" id="go" disabled>${inGarage ? "Salir" : "Programar"}</button></div>`, (el, close) => {
      draw(el);
      const wireQueue = () => el.querySelectorAll<HTMLButtonElement>("[data-unq]").forEach((b) => (b.onclick = () => { c.queue.splice(Number(b.dataset.unq), 1); el.querySelector("#qbox")!.innerHTML = queueHtml(); wireQueue(); }));
      wireQueue();
      el.querySelectorAll<HTMLButtonElement>("#types button").forEach((b) => (b.onclick = () => { type = b.dataset.t as typeof type; draw(el); }));
      el.querySelectorAll<HTMLButtonElement>("#laps button").forEach((b) => (b.onclick = () => { laps = Number(b.dataset.n); el.querySelectorAll("#laps button").forEach((x) => x.classList.toggle("on", x === b)); }));
      el.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        setId = b.dataset.set; el.querySelectorAll("[data-set]").forEach((x) => x.classList.toggle("on", x === b));
        el.querySelector<HTMLButtonElement>("#go")!.disabled = false;
      }));
      el.querySelector<HTMLButtonElement>("#go")!.onclick = () => {
        const set = c.e.sets.find((s) => s.id === setId)!;
        const run = makeRun(sess, c, type, set.c, type === "long" ? laps : type === "qsim" ? 2 : 1, 0, setId);
        // al coger tú el programa se descarta el que tenía preparado el equipo
        if (c.auto) { c.auto = false; c.queue = []; }
        if (!run) showToast("No puede salir ahora.", 2500);
        else if (c.loc === "garage" && !c.queue.length) showToast(sess.startRun(c, run) ? `📻 ${c.d.abrev} sale a pista.` : "No puede salir ahora.", 2500);
        else { c.queue.push(run); showToast(`📋 ${c.d.abrev}: ${runName(run)} programada para cuando vuelva.`, 3000); }
        close();
      };
    });
  }
  /**
   * Graining y ampollas tal como los conoce el equipo: lo que dice el piloto y lo que ve la telemetría,
   * no el valor real (eso solo se sabe al quitar el juego y mirarlo).
   */
  function feelHtml(c: Car, k: number) {
    const f = c.tyreFeel;
    if (!f || f.set !== c.tyres?.id) return "";
    let out = "";
    if (f.grain[k] > 0) out += `<div class="small yellow">graining ${GRAIN_WORDS[f.grain[k]]}</div>`;
    if (f.blister[k] === 2) out += `<div class="small redt">ampollas</div>`;
    else if (f.blister[k] === 1) out += `<div class="small redt">vibraciones: ¿ampollas?</div>`;
    else if (f.risk[k]) out += `<div class="small" style="color:#ff9a3c">banda muy caliente</div>`;
    return out;
  }
  function pilotsSheet() {
    const tempColor = (c: Compound, t: number) => { const sp = COMPOUNDS[c]; const d = t - sp.opt; return Math.abs(d) < sp.window * 0.5 ? "var(--green)" : d < -sp.window ? "var(--blue)" : d > sp.window ? "var(--red1)" : "var(--gold1)"; };
    const body = () => mine().map((c, idx) => {
      const t = c.tyres;
      const axle = (name: string, a: TyreSet["F"], k: number) => !t ? "" : `<div style="border-color:${tempColor(t.c, a.tBulk)}"><div class="small dim up">${name}</div><div class="t mono" style="color:${tempColor(t.c, a.tBulk)}">${a.tBulk.toFixed(0)}°</div><div class="small dim mono">sup. ${a.tSurf.toFixed(0)}°</div><div class="small mono">${Math.round((1 - a.wear) * 100)} % banda</div>${feelHtml(c, k)}</div>`;
      const seg = (key: string, names: string[], cur: number, auto?: boolean) => `<div class="seg" data-k="${key}" data-i="${idx}">${auto !== undefined ? `<button data-v="auto" class="${auto ? "on" : ""}">Auto</button>` : ""}${names.map((n, i) => `<button data-v="${i}" class="${!auto && cur === i ? "on" : ""}">${n}</button>`).join("")}</div>`;
      const fuelDelta = race ? c.fuel / sess.fuelPerLap - (sess.laps - sess.lapsDone(c)) : 0;
      const plan = race ? c.plan.stints.slice(c.stops).map((s, i, arr) => `${tyreHtml(s.c)}${i < arr.length - 1 ? ` v${s.endLap}` : ""}`).join(" → ") : "";
      return `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t"><span class="teamdot" style="background:${c.team.color}"></span>${esc(c.d.nombre)}</span>${t ? tyreHtml(t.c, true) : ""}</div><div class="bd">
        ${t ? `<div class="small dim">${COMPOUNDS[t.c].name} · ${t.laps} v · ventana ${COMPOUNDS[t.c].opt - COMPOUNDS[t.c].window}–${COMPOUNDS[t.c].opt + COMPOUNDS[t.c].window} °C${c.wing > 0 ? ` · <span class="yellow">alerón dañado</span>` : ""}</div><div class="temp">${axle("Delanteros", t.F, 0)}${axle("Traseros", t.R, 1)}</div>` : `<div class="dim">En el garaje.</div>`}
        <div class="kv"><span>Última / mejor</span><b class="mono">${fmtLap(c.lapTimes[c.lapTimes.length - 1])} / ${fmtLap(c.best)}</b>
        ${t ? `<span>Ritmo posible ahora</span><b class="mono">${fmtLap(sess.estLap(c))}</b>` : ""}
        <span>Combustible</span><b class="mono">${c.fuel.toFixed(1)} kg${race ? ` (${fuelDelta >= 0 ? "+" : ""}${fuelDelta.toFixed(1)} v)` : ""}</b>
        <span>Batería</span><b class="mono">${Math.round((c.soc / SOC_MAX) * 100)} %</b>
        ${c.e.pu ? `<span>Unidad de potencia</span><b class="mono">${Math.round(puLife(c.e.pu.km0 + c.puKm) * 100)} % de vida</b>` : ""}
        ${race ? `<span>Plan</span><b>${plan}</b>` : ""}</div>
        ${race ? `<h2>Ritmo</h2>${seg("push", PUSH_NAMES, c.push)}<h2>Motor</h2>${seg("engine", ENGINE_NAMES, c.engine)}<h2>Batería</h2>${seg("ers", ERS_NAMES, c.ers, c.autoErs)}<button data-let="${idx}" style="width:100%">Dejar pasar al compañero</button>` : ""}
      </div></div>`;
    }).join("") + `<button data-close style="width:100%">Cerrar</button>`;
    open(`<div id="pbody">${body()}</div>`, (el, close) => {
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
        el.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = () => close()));
      };
      wire();
    });
  }
  // ----------------------------------------- vuelta lanzada (como en la tele)
  // Tiempo corriendo, parciales por sector comparados con una referencia y resultado al cruzar la
  // meta. La referencia es el primero; si tu piloto está fuera del corte, el último que se salva.
  type FlyRef = { car: Car; pos: number; time: number; splits: number[] } | null;
  type FlyState = { lapStart: number; laps: number; active: boolean; ref: FlyRef; splitN: number; splitReal: number; splitT: number; result?: { time: number; pos: number; ref: FlyRef; valid: boolean; real: number; t: number } };
  const fly = new Map<number, FlyState>();
  const bestOf = (c: Car) => (sess.parts.length ? c.bestByPart[sess.part] : c.best);
  const splitsOf = (c: Car) => (sess.parts.length ? c.bestSecsByPart[sess.part] : c.bestSecs) ?? [];
  const cum = (a: number[], j: number) => { let x = 0; for (let i = 0; i <= j; i++) x += a[i]; return x; };
  const fmtRun = (t: number) => fmtMinSec(t, 1);
  const fmtSplit = (t: number) => (Math.round(t * 1000) >= 60000 ? fmtMinSec(t) : t.toFixed(3));
  function flyRef(c: Car): FlyRef {
    const ord = sess.timingOrder().filter((x) => !x.eliminated && Number.isFinite(bestOf(x) ?? Infinity));
    const others = ord.filter((x) => x !== c);
    const cut = sess.parts.length ? sess.parts[sess.part]?.advance ?? null : null;
    const myPos = ord.indexOf(c);
    let ref: Car | undefined, pos = 1;
    if (cut && (myPos < 0 || myPos >= cut) && others.length >= cut) { ref = others[cut - 1]; pos = cut; }
    else ref = ord[0];
    if (!ref) return null;
    return { car: ref, pos, time: bestOf(ref)!, splits: splitsOf(ref).slice() };
  }
  const refBox = (r: FlyRef) => (r ? `<span class="fp ${r.pos === 1 ? "p1" : ""}">${r.pos}</span>` : "");
  const deltaBox = (d: number) => `<span class="fd mono ${d <= 0 ? "fast" : "slow"}">${d <= 0 ? "−" : "+"}${Math.abs(d).toFixed(3)}</span>`;
  function renderFly() {
    const box = document.getElementById("flyov");
    if (!box) return;
    if (race) { if (box.innerHTML) box.innerHTML = ""; return; }
    const now = performance.now();
    const out: string[] = [];
    // el piloto que sigues va encima de los tuyos
    const sc = selCar();
    for (const c of sc && !sc.player ? [sc, ...mine()] : mine()) {
      let st = fly.get(c.id);
      if (!st) { st = { lapStart: -1, laps: c.lapTimes.length, active: false, ref: null, splitN: 0, splitReal: 0, splitT: 0 }; fly.set(c.id, st); }
      // vuelta terminada: tiempo, posición que logra y diferencia con la referencia
      if (c.lapTimes.length > st.laps) {
        if (st.active) {
          const ord = sess.timingOrder().filter((x) => !x.eliminated);
          // sin referencia al empezar (nadie tenía tiempo): se compara con el primero de ahora
          // la referencia es la de ahora, no la de cuando empezó la vuelta: otro puede haber mejorado mientras tanto
          st.result = { time: c.lapTimes[c.lapTimes.length - 1], pos: ord.indexOf(c) + 1, ref: flyRef(c) ?? st.ref, valid: c.lastLapValid, real: now, t: sess.t };
        }
        st.laps = c.lapTimes.length;
        st.active = false;
      }
      const pushing = c.run?.phase === "push" && c.loc === "track" && c.lapStart > 0;
      if (pushing && st.lapStart !== c.lapStart) { st.lapStart = c.lapStart; st.active = true; st.ref = flyRef(c); st.splitN = 0; }
      if (!pushing) st.active = false;
      if (st.active) st.ref = flyRef(c) ?? st.ref; // siempre contra la referencia del momento: alguien puede marcar tiempo durante la vuelta
      const r = st.result;
      const showResult = r && (now - r.real < 4000 || sess.t - r.t < 10);
      const name = `<div class="fn">${nameFlag(c)}</div>`;
      if (showResult && r) {
        const d = r.valid && r.ref ? r.time - r.ref.time : null;
        out.push(`<div class="fly">${name}<div class="ft"><span class="mono">${fmtLap(r.time)}</span>${r.valid ? `<span class="fpos">${r.pos}</span>` : ""}</div>
          <div class="fr">${!r.valid ? `<span class="fd bad">Vuelta anulada</span>` : r.pos === 1 ? `<span class="fd fast">Mejor tiempo</span>` : r.ref && r.ref.car !== c ? `${refBox(r.ref)}${deltaBox(d!)}` : ""}</div></div>`);
        continue;
      }
      if (!st.active) continue;
      const done = c.secCur.filter((x) => !Number.isNaN(x)).length;
      if (done > st.splitN) { st.splitN = done; st.splitReal = now; st.splitT = sess.t; }
      const showSplit = st.splitN > 0 && st.splitN < 3 && (now - st.splitReal < 1200 || sess.t - st.splitT < 7);
      const ref = st.ref;
      let time: string, row: string;
      if (!c.lapValid) { time = fmtRun(Math.max(0, sess.t - c.lapStart)); row = `<span class="fd bad">Vuelta anulada</span>`; }
      else if (showSplit) {
        const j = st.splitN - 1;
        const mine = cum(c.secCur, j);
        time = fmtSplit(mine);
        const rs = ref && ref.splits.length === 3 && ref.splits.every((x) => Number.isFinite(x)) ? cum(ref.splits, j) : null;
        row = ref && rs !== null ? `${refBox(ref)}${deltaBox(mine - rs)}` : ref ? `${refBox(ref)}<span class="fd mono">${fmtLap(ref.time)}</span>` : "";
      } else {
        time = fmtRun(Math.max(0, sess.t - c.lapStart));
        // la referencia del próximo punto: su parcial del sector 1, luego hasta el 2 y al final la vuelta
        const okSplits = !!ref && ref.splits.length === 3 && ref.splits.every((x) => Number.isFinite(x));
        const target = ref ? (okSplits && st.splitN < 2 ? fmtSplit(cum(ref.splits, st.splitN)) : fmtLap(ref.time)) : "";
        row = ref ? `${refBox(ref)}<span class="fd mono">${target}</span>` : "";
      }
      out.push(`<div class="fly">${name}<div class="ft"><span class="mono">${time}</span></div><div class="fr">${row}</div></div>`);
    }
    const html = out.join("");
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ------------------------------------------------------- muro de boxes
  const SERIES = { ahead: "#bd860e", behind: "#3a8be8", mate: "#e94f8a" }; // validados para fondo oscuro y daltonismo
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
  /** Compuestos que tiene sentido ofrecer con el agua que hay. */
  const fitsWater = (c: Compound) => { const w = sess.avgWater(); return w < WET.si * 0.6 ? DRY.includes(c) : w > WET.si * 1.5 ? !DRY.includes(c) : true; };
  function exitLine(o: StopOption) {
    const who = o.ahead ? `detrás de <b>${o.ahead.car.d.abrev}</b>${o.ahead.tyre ? ` ${tyreHtml(o.ahead.tyre)}<span class="dim">${o.ahead.age} v</span>` : ""} a <b>${o.ahead.gap.toFixed(1)} s</b>` : "en cabeza";
    const back = o.behind ? ` · <b>${o.behind.car.d.abrev}</b> a ${o.behind.gap.toFixed(1)} s detrás` : "";
    return `<div class="mw-exit">Sale <b class="mw-p">P${o.pos}</b> ${who}${back}</div>`;
  }
  function optionLine(o: StopOption) {
    const gain = Number.isFinite(o.lapGain) ? `<span class="${o.lapGain > 0 ? "green" : "redt"}">${signed(o.lapGain)} s/v</span>` : `<span class="dim">—</span>`;
    const cat = !o.ahead ? "" : o.catchLaps !== null ? `<span class="green">alcanza a ${o.ahead.car.d.abrev} en ${o.catchLaps} v</span>` : Number.isFinite(o.lapGain) ? `<span class="dim">no le alcanza en 15 v</span>` : "";
    const pace = Number.isFinite(o.lapGain) ? `ritmo ${gain} <span class="dim small">frente a seguir</span>` : `<span class="dim small">sin estimación de ritmo con la pista mojada</span>`;
    return `<div class="mw-row"><span class="mw-t">${tyreHtml(o.c)}<span class="dim small">${o.setLaps ? `usado ${o.setLaps} v` : "nuevo"}</span></span><span class="mw-w">${pace}${cat ? `<br>${cat}` : ""}</span><button data-stop="${o.setId}">Parar</button></div>`;
  }
  function muroBody() {
    return mine().map((c, idx) => {
      if (c.loc === "out" || c.loc === "fin") return `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t">${esc(c.d.nombre)}</span></div><div class="bd dim">${c.loc === "fin" ? "Ha terminado." : "Fuera de carrera."}</div></div>`;
      const opts = stopOptions(sess, c);
      const uc = undercut(sess, c);
      const ucLine = (k: "defend" | "attack") => {
        const u = uc[k];
        if (!u) return "";
        const r = u.rival.d.abrev;
        const gapNow = Math.max(0, u.gapNow);
        if ((u.rival.tyres?.laps ?? 99) <= 2 || u.rival.loc === "pit") return `<div class="mw-uc"><span class="tab">${k === "defend" ? "Defensa" : "Ataque"}</span> <b>${r}</b> acaba de parar${u.rival.tyres ? ` (${tyreHtml(u.rival.tyres.c)})` : ""}: no hay undercut posible.</div>`;
        if (gapNow > 30) return "";
        void gapNow;
        if (k === "defend") return `<div class="mw-uc"><span class="tab">Defensa</span> Si <b>${r}</b> (a ${Math.max(0, u.gapNow).toFixed(1)} s, para a ${tyreHtml(u.rivalTyre)}) para ya y tú en la siguiente: ${u.after > 0 ? `<span class="green">sigues delante por ${u.after.toFixed(1)} s</span>` : `<span class="redt">te pasa por ${(-u.after).toFixed(1)} s</span>`}.</div>`;
        return `<div class="mw-uc"><span class="tab">Ataque</span> Si paras ya con ${tyreHtml(u.myTyre)} y <b>${r}</b> (a ${Math.max(0, u.gapNow).toFixed(1)} s) en la siguiente: ${u.after < 0 ? `<span class="green">le pasas por ${(-u.after).toFixed(1)} s</span>` : `<span class="redt">sigue delante por ${u.after.toFixed(1)} s</span>`}.</div>`;
      };
      const req = c.pitRequest ? c.e.sets.find((x) => x.id === c.pitRequest) : null;
      return `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t"><span class="teamdot" style="background:${c.team.color}"></span>${esc(c.d.nombre)} · P${sess.order().indexOf(c) + 1}</span>${c.tyres ? `${tyreHtml(c.tyres.c)}<span class="small dim">${c.tyres.laps} v</span>` : ""}</div><div class="bd">
        <h2>Si para ahora <span class="dim small" style="text-transform:none">· pierde ${pitLoss(sess, c).toFixed(1)} s en boxes${sess.flag === "sc" || sess.flag === "sc_in" ? " (coche de seguridad)" : sess.flag === "vsc" ? " (VSC)" : ""}</span></h2>
        ${req ? `<div class="small yellow">Parada pedida: ${COMPOUNDS[req.c].name.toLowerCase()} ${req.laps ? "usado" : "nuevo"}. <button data-cancel="${idx}" style="padding:2px 8px">Anular</button></div>` : ""}
        ${opts[0] ? exitLine(opts[0]) : ""}
        <div data-car="${idx}">${opts.filter((o) => fitsWater(o.c)).map(optionLine).join("") || `<div class="dim small">Sin juegos para cambiar.</div>`}</div>
        ${ucLine("defend")}${ucLine("attack")}
        ${gapHistory(sess, c, [], 15).length >= 2 ? `<h2>Huecos en meta <span class="dim small" style="text-transform:none">· últimas 15 vueltas, ${esc(c.d.abrev)} en el 0</span></h2>
        <div class="mw-leg" id="leg${idx}"></div>
        <canvas class="gapchart" id="gc${idx}"></canvas>
        <div class="small dim mono" id="gt${idx}">Toca la gráfica para ver los huecos de una vuelta.</div>` : `<div class="small dim" style="margin-top:8px">La gráfica de huecos con los de alrededor sale a partir de la segunda vuelta.</div>`}
      </div></div>`;
    }).join("") + `<div class="small dim" style="margin:4px 0 8px">Estimación del equipo: ritmo de las últimas vueltas, su modelo de neumáticos (con su error) y la pérdida en boxes del circuito. No sabe qué harán los rivales ni si saldrá el coche de seguridad.</div><button data-close style="width:100%">Cerrar</button>`;
  }
  /** Gráfica de huecos: una línea por coche (delante, detrás, compañero), tu piloto en el 0. */
  function drawGapChart(idx: number, me: Car) {
    const cv = document.getElementById(`gc${idx}`) as HTMLCanvasElement | null;
    if (!cv) return;
    const ord = sess.order().filter((x) => x.loc !== "out");
    const i = ord.indexOf(me);
    const series: { car: Car; color: string; role: string }[] = [];
    if (ord[i - 1]) series.push({ car: ord[i - 1], color: SERIES.ahead, role: "Delante" });
    if (ord[i + 1]) series.push({ car: ord[i + 1], color: SERIES.behind, role: "Detrás" });
    const mate = sess.cars.find((x) => x.player && x !== me && x.loc !== "out");
    if (mate && !series.some((sr) => sr.car === mate)) series.push({ car: mate, color: SERIES.mate, role: "Compañero" });
    const hist = gapHistory(sess, me, series.map((sr) => sr.car), 15);
    const leg = document.getElementById(`leg${idx}`);
    if (leg) leg.innerHTML = series.map((sr) => `<span><i style="background:${sr.color}"></i>${sr.role}: <b>${sr.car.d.abrev}</b></span>`).join("");
    const W = cv.clientWidth || 300, H = 150, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "#161b22"; g.fillRect(0, 0, W, H);
    if (hist.length < 2) { g.fillStyle = "#9da3ad"; g.font = '600 12px "Titillium Web", sans-serif'; g.fillText("Hacen falta al menos dos vueltas.", 10, H / 2); return; }
    const vals = hist.flatMap((h) => h.gaps.filter((x): x is number => x !== null && Math.abs(x) < 120));
    let lim = Math.max(2, ...vals.map(Math.abs)) * 1.15;
    lim = Math.ceil(lim / 2) * 2;
    const padL = 32, padR = 66, padT = 8, padB = 18;
    const FONT = (w: number, px: number) => `${w} ${px}px "Titillium Web", "Arial Narrow", sans-serif`;
    const x = (k: number) => padL + ((W - padL - padR) * k) / (hist.length - 1);
    const y = (v: number) => padT + ((H - padT - padB) * (lim - v)) / (2 * lim);
    // rejilla discreta: el 0 (tu piloto) y dos marcas por lado
    g.font = FONT(600, 11); g.textAlign = "right"; g.textBaseline = "middle";
    for (const v of [-lim, -lim / 2, 0, lim / 2, lim]) {
      g.strokeStyle = v === 0 ? "#6b7583" : "#252c36"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(W - padR, y(v)); g.stroke();
      g.fillStyle = "#9da3ad"; g.fillText(v === 0 ? me.d.abrev : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}`, padL - 4, y(v));
    }
    g.textAlign = "center"; g.textBaseline = "top";
    for (let k = 0; k < hist.length; k += Math.max(1, Math.ceil(hist.length / 6))) g.fillText(`V${hist[k].lap}`, x(k), H - padB + 4);
    const ends: { j: number; k: number; y: number }[] = [];
    series.forEach((sr, j) => {
      g.strokeStyle = sr.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let started = false, lastK = -1;
      hist.forEach((h, k) => {
        const v = h.gaps[j];
        if (v === null || Math.abs(v) > 120) { started = false; return; }
        const vv = Math.max(-lim, Math.min(lim, v));
        if (!started) { g.moveTo(x(k), y(vv)); started = true; } else g.lineTo(x(k), y(vv));
        lastK = k;
      });
      g.stroke();
      if (lastK >= 0) {
        const v = Math.max(-lim, Math.min(lim, hist[lastK].gaps[j]!));
        g.fillStyle = sr.color; g.beginPath(); g.arc(x(lastK), y(v), 4, 0, Math.PI * 2); g.fill();
        ends.push({ j, k: lastK, y: y(v) });
      }
    });
    // etiquetas al final de cada línea, separadas para que no se pisen
    ends.sort((a, b) => a.y - b.y);
    for (let n = 1; n < ends.length; n++) ends[n].y = Math.max(ends[n].y, ends[n - 1].y + 13);
    g.font = FONT(700, 11); g.fillStyle = "#ffffff"; g.textAlign = "left"; g.textBaseline = "middle";
    for (const e of ends) g.fillText(`${series[e.j].car.d.abrev} ${signed(hist[e.k].gaps[e.j]!)}`, W - padR + 8, Math.min(H - padB, e.y));
    // tocar: huecos de esa vuelta
    cv.onclick = (ev) => {
      const r = cv.getBoundingClientRect();
      const k = Math.max(0, Math.min(hist.length - 1, Math.round(((ev.clientX - r.left - padL) / (W - padL - padR)) * (hist.length - 1))));
      const t = document.getElementById(`gt${idx}`);
      if (t) t.innerHTML = `V${hist[k].lap}: ` + series.map((sr, j) => `${sr.car.d.abrev} ${hist[k].gaps[j] === null ? "—" : `${signed(hist[k].gaps[j]!)} s`}`).join(" · ") + ` <span class="dim">(+ va delante de ${me.d.abrev})</span>`;
    };
  }
  function muroSheet() {
    open(`<span class="tab">Muro de boxes</span><div id="mbody">${muroBody()}</div>`, (el, close) => {
      const draw = () => {
        el.querySelector("#mbody")!.innerHTML = muroBody();
        mine().forEach((c, i) => drawGapChart(i, c));
        el.querySelectorAll<HTMLButtonElement>("[data-stop]").forEach((b) => (b.onclick = () => {
          const c = mine()[Number(b.closest<HTMLElement>("[data-car]")!.dataset.car)];
          if (c.loc !== "track") return;
          c.pitRequest = b.dataset.stop!;
          const set = c.e.sets.find((x) => x.id === c.pitRequest)!;
          showToast(`📻 "${c.d.abrev}, box, box. ${COMPOUNDS[set.c].name}${set.laps ? " usados" : ""}."`, 3000);
          close();
        }));
        el.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((b) => (b.onclick = () => { mine()[Number(b.dataset.cancel)].pitRequest = null; draw(); }));
        el.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = () => close()));
      };
      draw();
      // se refresca sola mientras está abierta (la carrera sigue)
      const timer = window.setInterval(() => { if (!el.isConnected) return window.clearInterval(timer); if (!paused) draw(); }, 2000);
    });
  }

  function weatherSheet() {
    const team = wk.teams.find((t) => t.id === wk.playerTeam)!;
    const w = sess.weather;
    const pts = track.ms.filter((_, i) => i % 3 === 0).map((m) => [m.x / 1000, m.y / 1000] as [number, number]);
    const f = forecast(w, team.meteo, new Rng(Math.floor(sess.wall) + 7), 30, [0, 5, 10, 15, 20, 25, 30, 40, 50, 60], pts);
    // fotogramas: los últimos 30 min (cada 3) + ahora
    const now: RadarFrame = { clock: w.clock, cells: w.cells.map((c) => ({ ...c })), drizzle: w.drizzle };
    const frames = [...w.history.filter((h) => w.clock - h.clock <= 30.5 && w.clock - h.clock > 0.5), now];
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < track.xs.length; i++) { minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]); miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]); }
    const tcx = (minx + maxx) / 2000, tcy = (miny + maxy) / 2000;
    const views = {
      reg: { cx: 0, cy: 0, R: 40, rings: [10, 20, 30, 40], scale: 10 },
      cir: { cx: tcx, cy: tcy, R: (Math.max(maxx - minx, maxy - miny) / 2000) * 1.7, rings: [] as number[], scale: 1 },
    };
    let view: keyof typeof views = "reg";
    const cache: Record<string, HTMLCanvasElement> = {};
    const frameCanvas = (k: number) => {
      const key = `${view}-${k}`;
      if (cache[key]) return cache[key];
      const v = views[view];
      const S = view === "reg" ? 240 : 160;
      const field = renderField(frames[k], v.cx, v.cy, v.R, S);
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      c.getContext("2d")!.putImageData(colorize(field, S, S, terrain(v.cx, v.cy, v.R, S)), 0, 0);
      return (cache[key] = c);
    };
    let idx = frames.length - 1;
    let playing = frames.length > 1;
    let hold = 0;
    const legend = RADAR_STEPS.map(([v, col]) => `<div style="background:${col}"><span>${v}</span></div>`).join("");
    open(`<div class="row"><span class="tab">Radar meteorológico</span><span class="grow"></span><div class="seg" id="rv" style="margin:0"><button data-v="reg" class="on">40 km</button><button data-v="cir">Circuito</button></div></div>
      <canvas id="radar" class="radar" style="margin-top:6px"></canvas>
      <div class="row" style="margin-top:4px"><button id="rplay" style="min-width:44px">${playing ? "⏸" : "▶"}</button><input type="range" id="rslide" class="grow" min="0" max="${frames.length - 1}" value="${idx}"><span class="mono small" id="rlab"></span></div>
      <div class="rlegend">${legend}<em>mm/h</em></div>
      <div class="small dim" style="margin:4px 0">Últimos ${Math.round(w.clock - frames[0].clock)} min, un fotograma cada 3 min. Viento en altura ${w.windSpeed.toFixed(0)} km/h hacia ${dirName(w.windDir)}.</div>
      <h2>Previsión de tu meteorólogo (lluvia en algún punto del circuito)</h2>
      <div class="fc">${f.horizons.map((h, i) => `<div><span>${Math.round(f.prob[i] * 100)}%</span><i style="height:${Math.max(2, f.prob[i] * 46)}px;opacity:${0.4 + Math.min(0.6, f.p50[i] / 8)}"></i><span>${h === 0 ? "ya" : "+" + h}</span></div>`).join("")}</div>
      <div class="small dim" style="margin:6px 0">Extrapola lo que ve el radar; no sabe qué chubascos nacerán ni cuándo se desharán. Lisos hasta ~0,15 mm de agua en pista, intermedios ~0,15–1 mm, lluvia por encima.</div>
      <button data-close style="width:100%">Cerrar</button>`, (el) => {
      const cv = el.querySelector<HTMLCanvasElement>("#radar")!;
      const slide = el.querySelector<HTMLInputElement>("#rslide")!;
      const lab = el.querySelector<HTMLElement>("#rlab")!;
      const playBtn = el.querySelector<HTMLButtonElement>("#rplay")!;
      const draw = () => {
        const dpr = window.devicePixelRatio || 1;
        const W = cv.clientWidth * dpr;
        if (cv.width !== W) { cv.width = W; cv.height = W; }
        const g = cv.getContext("2d")!;
        g.imageSmoothingEnabled = true;
        g.drawImage(frameCanvas(idx), 0, 0, W, W);
        const v = views[view];
        const k = W / (2 * v.R); // px por km
        const px = (x: number) => W / 2 + (x - v.cx) * k, py = (y: number) => W / 2 - (y - v.cy) * k;
        // anillos de distancia
        g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 1 * dpr;
        g.fillStyle = "rgba(255,255,255,.55)"; g.font = `600 ${10 * dpr}px "Titillium Web", sans-serif`;
        for (const r of v.rings) { g.beginPath(); g.arc(px(0), py(0), r * k, 0, 7); g.stroke(); g.fillText(`${r} km`, px(0) + 3 * dpr, py(0) - r * k + 11 * dpr); }
        // circuito
        if (view === "cir") {
          g.lineJoin = "round"; g.lineCap = "round";
          for (const [col, lw] of [["rgba(0,0,0,.7)", 5], ["#fff", 2.2]] as const) {
            g.strokeStyle = col; g.lineWidth = lw * dpr; g.beginPath();
            for (let i = 0; i < track.xs.length; i += 3) { const x = px(track.xs[i] / 1000), y = py(track.ys[i] / 1000); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
            g.closePath(); g.stroke();
          }
        } else { g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(px(0), py(0), 4 * dpr, 0, 7); g.fill(); g.stroke(); }
        // norte y escala
        g.fillStyle = "#fff"; g.font = `900 ${11 * dpr}px "Titillium Web", sans-serif`; g.textAlign = "center";
        g.beginPath(); g.moveTo(W - 18 * dpr, 10 * dpr); g.lineTo(W - 23 * dpr, 24 * dpr); g.lineTo(W - 13 * dpr, 24 * dpr); g.closePath(); g.fill();
        g.fillText("N", W - 18 * dpr, 36 * dpr); g.textAlign = "left";
        const sl = v.scale * k;
        g.fillRect(10 * dpr, W - 14 * dpr, sl, 3 * dpr);
        g.font = `700 ${10 * dpr}px "Titillium Web", sans-serif`; g.fillText(`${v.scale} km`, 10 * dpr, W - 19 * dpr);
        // hora del fotograma (rótulo de tele)
        const fr = frames[idx];
        const live = idx === frames.length - 1;
        const ago = Math.round(w.clock - fr.clock);
        const tag = live ? "AHORA" : `−${ago} MIN`;
        g.font = `900 ${13 * dpr}px "Titillium Web", sans-serif`;
        const t1 = fmtHour(fr.clock), w1 = g.measureText(t1).width + 14 * dpr, w2 = g.measureText(tag).width + 14 * dpr;
        g.fillStyle = "rgba(0,0,0,.85)"; g.fillRect(8 * dpr, 8 * dpr, w1, 22 * dpr);
        g.fillStyle = live ? "#e3261c" : "#ffd84a"; g.fillRect(8 * dpr + w1, 8 * dpr, w2, 22 * dpr);
        g.fillStyle = "#fff"; g.fillText(t1, 15 * dpr, 24 * dpr);
        g.fillStyle = live ? "#fff" : "#000"; g.fillText(tag, 15 * dpr + w1, 24 * dpr);
        slide.value = String(idx);
        lab.textContent = fmtHour(fr.clock);
      };
      draw();
      const timer = window.setInterval(() => {
        if (!document.body.contains(cv)) { clearInterval(timer); return; }
        if (!playing) return;
        if (idx === frames.length - 1 && hold < 3) { hold++; return; }
        hold = 0;
        idx = (idx + 1) % frames.length;
        draw();
      }, 420);
      playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? "⏸" : "▶"; };
      slide.oninput = () => { idx = Number(slide.value); playing = false; playBtn.textContent = "▶"; draw(); };
      el.querySelectorAll<HTMLButtonElement>("#rv button").forEach((b) => (b.onclick = () => {
        view = b.dataset.v as keyof typeof views;
        el.querySelectorAll("#rv button").forEach((x) => x.classList.toggle("on", x === b));
        draw();
      }));
    });
  }
  function radioSheet() {
    const evs = sess.events.slice(-150).reverse();
    open(`<span class="tab">Radio y dirección de carrera</span><div style="margin:6px 0;display:flex;flex-direction:column;gap:3px">${evs.map((e) => rmHtml(`${race ? "V" + e.lap : fmtClock(e.t)} · ${TAB[e.kind]}`, e.text, e.kind === "control" && /ROJA/.test(e.text) ? "red" : e.kind === "control" || e.kind === "weather" ? "ctl" : "")).join("") || "<div class='dim'>Sin mensajes.</div>"}</div><button data-close style="width:100%">Cerrar</button>`, () => {});
  }

  // ------------------------------------------------- menú, datos y ajustes
  /** Datos del fin de semana, a mano dentro de la sesión (y en la parrilla, que es cuando hacen falta). */
  function dataSheet() {
    const team = wk.teams.find((t) => t.id === wk.playerTeam)!;
    const me = mine();
    const runs = weekendLongRuns(wk.st).concat(sess.longRuns.map((r) => ({ kind, r })));
    open(`<div class="row"><span class="tab">Datos del fin de semana</span><span class="grow"></span><button data-close>Cerrar</button></div>
      <h2>Lo que saben tus ingenieros</h2>
      ${knowledgeTable(wk.st, track, team, me[0].d, sess.weather.trackT, sess.weather.airT)}
      <div class="insheet">${longRunsPanel(runs, wk.playerTeam) || `<h2>Tandas largas</h2><div class="dim small">Todavía no hay tandas largas en seco.</div>`}</div>
      <h2>Juegos de neumáticos</h2>
      ${me.map((c) => `<div style="margin-bottom:6px"><b>${esc(c.d.nombre)}</b><div class="row wrap small" style="gap:4px;margin-top:3px">${setPills(c.e.sets)}</div></div>`).join("")}
      <div class="small dim">El porcentaje es la goma que le queda a cada juego; tachados, los devueltos.</div>
      <button data-close style="width:100%;margin-top:8px">Cerrar</button>`, () => {});
  }
  /** Qué momentos paran la sesión sola, cada uno por separado. */
  function settingsSheet() {
    const items: [keyof PausePrefs, string, string][] = [
      ["control", "Dirección de carrera", "Coche de seguridad, VSC, banderas rojas y relanzadas."],
      ["estratega", "Consejos del estratega", "Cuando recomienda parar esta vuelta."],
      ["radio", "Radio de tus pilotos", "Neumáticos que se acaban, pista que se moja o se seca."],
      ["partes", "Partes de la clasificación", "Final y principio de cada parte (Q1, Q2, Q3)."],
      ["garaje", "Piloto sin programa", "En libres y clasificación, cuando uno que llevas tú vuelve al garaje sin nada programado."],
    ];
    open(`<div class="row"><span class="tab">Ajustes</span><span class="grow"></span><button data-close>Cerrar</button></div>
      <h2>La sesión se para sola con…</h2>
      ${items.map(([k, n, d]) => `<label class="optrow"><input type="checkbox" data-p="${k}" ${prefs.pausas[k] ? "checked" : ""}><span><b>${n}</b><br><span class="small dim">${d}</span></span></label>`).join("")}
      <div class="row" style="gap:4px;margin:8px 0"><button id="pall" class="grow">Todas</button><button id="pnone" class="grow">Ninguna</button></div>
      <div class="small dim">Un aviso que para la sesión se reanuda tocándolo o con ▶. La velocidad que elijas se recuerda para la próxima sesión. ⏩ avanza a toda velocidad hasta que pasa algo de tus pilotos (sale o vuelve, marca tiempo, para, un aviso del ingeniero) o de dirección de carrera.<br>Teclado: espacio pausa, 1-6 o −/+ velocidad, F hasta lo siguiente, P pilotos, M muro, R radar, D radio, T columna de la torre, Esc cierra.</div>
      <button data-close style="width:100%;margin-top:8px">Cerrar</button>`, (el) => {
      const boxes = el.querySelectorAll<HTMLInputElement>("[data-p]");
      boxes.forEach((b) => (b.onchange = () => { prefs.pausas[b.dataset.p as keyof PausePrefs] = b.checked; savePrefs(prefs); }));
      const all = (v: boolean) => { boxes.forEach((b) => { b.checked = v; prefs.pausas[b.dataset.p as keyof PausePrefs] = v; }); savePrefs(prefs); };
      el.querySelector<HTMLButtonElement>("#pall")!.onclick = () => all(true);
      el.querySelector<HTMLButtonElement>("#pnone")!.onclick = () => all(false);
    });
  }
  function menuSheet() {
    if (ended || skipping) return;
    open(`<div class="row"><span class="tab">${esc(SESSION_NAMES[kind])}</span><span class="grow"></span><button data-close>Cerrar</button></div>
      <div class="menulist">
        <button data-m="data"><b>Datos del fin de semana</b><span>Lo que saben tus ingenieros, tandas largas y juegos de neumáticos</span></button>
        <button data-m="skip"><b>⏭ Simular hasta el final</b><span>El equipo lleva a tus pilotos y se calcula lo que queda</span></button>
        <button data-m="settings"><b>Ajustes</b><span>Qué momentos paran la sesión sola · atajos de teclado</span></button>
        ${onExit ? `<button data-m="exit"><b>Salir al fin de semana</b><span>${started ? "La sesión se guarda tal cual y se retoma con «Reanudar»" : "Aún no ha empezado: al volver se empieza de cero"}</span></button>` : ""}
      </div>`, (el, close) => {
      el.querySelectorAll<HTMLButtonElement>("[data-m]").forEach((b) => (b.onclick = () => {
        const m = b.dataset.m;
        close();
        if (m === "data") dataSheet();
        else if (m === "skip") skipToEnd();
        else if (m === "settings") settingsSheet();
        else if (m === "exit") exitSession();
      }));
    });
  }

  // -------------------------------------------------- previa de carrera
  function preRace(start: () => void) {
    const me = mine();
    // estrategias para elegir: las mejores distintas según lo que sabe el equipo
    const plansOf = new Map(me.map((c) => [c.id, planOptions(sess, c, c.e.knowledge, 3)]));
    const sigOf = (p: { stints: { c: string; endLap: number }[] }) => p.stints.map((x) => `${x.c}${x.endLap}`).join("-");
    const grid = sess.order();
    const html = () => `<div class="row"><b class="up grow">Parrilla · ${SESSION_NAMES[kind]}</b><button id="predata" title="Lo que saben tus ingenieros, tandas largas y juegos">Datos</button></div>
      <div class="small dim">${kind === "RACE" ? "En seco hay que usar dos compuestos distintos. " : "Sin parada obligatoria. "}Sin repostaje: el combustible que cargues es el que hay.</div>
      ${sess.flag === "sc" ? `<div class="small yellow" style="margin-top:4px">🟨 Salida detrás del coche de seguridad: hay demasiada agua (${sess.avgWater().toFixed(1)} mm). Sigue en pista hasta que se pueda correr.</div>` : ""}
      ${me.map((c, i) => `<div class="panel" style="margin:6px 0"><div class="hd"><span class="t">P${grid.indexOf(c) + 1} · ${esc(c.d.nombre)}</span></div><div class="bd">
        ${(() => { const w = sess.startWater(c);
          return w > WET.si ? `<div class="small">Con agua (${w.toFixed(2)} mm previstos al empezar): el equipo recomienda salir con ${tyreHtml(w > WET.iw * 1.05 ? "W" : "I")}. <span class="dim">Las estrategias de abajo son para cuando se seque.</span></div>` : ""; })()}
        <h2>Estrategia</h2>
        <div class="plans" data-plans="${i}">${(plansOf.get(c.id) ?? []).map((o, j) => {
          const seq = o.plan.stints.map((x) => `${tyreHtml(x.c)}${x.endLap < sess.laps ? `<span class="dim small"> v${x.endLap} </span>` : ""}`).join(`<span class="dim">›</span>`);
          const on = sigOf(c.plan) === sigOf(o.plan);
          return `<button data-plan="${j}" class="plan${on ? " on" : ""}"><span class="pl-s">${seq}</span><span class="pl-d">${o.stops} ${o.stops === 1 ? "parada" : "paradas"} · ${o.delta < 0.05 ? "la más rápida" : `+${o.delta.toFixed(1)} s`}</span><span class="pl-r">si se gastan un 15 % más: +${o.ifWorse.toFixed(1)} s</span></button>`;
        }).join("")}</div>
        <h2>Neumático de salida <span class="dim small" style="text-transform:none">· el % es la goma que queda</span></h2><div data-start="${i}">${setButtons(c, () => true, c.tyres?.id)}</div>
        <h2>Combustible</h2><div class="seg" data-fuel="${i}">${[[-1.2, "Muy justo"], [-0.5, "Justo"], [0, "Exacto"], [0.6, "Con margen"]].map(([v, n]) => `<button data-v="${v}" class="${Math.abs(sess.fuelMargin(c) - (v as number)) < 0.05 ? "on" : ""}">${n}</button>`).join("")}</div>
      </div></div>`).join("")}
      <details class="fold"><summary>Parrilla completa · ${grid.length} coches y su neumático de salida</summary>
        <table class="tv">${grid.map((c, i) => `<tr class="${c.player ? "me" : ""}"><td><span class="pos">${i + 1}</span></td><td><span class="teamdot" style="background:${c.team.color}"></span>${esc(c.d.nombre)}</td><td>${c.tyres ? tyreHtml(c.tyres.c) : ""}</td></tr>`).join("")}</table>
      </details>`;
    sheetOpen = true;
    // obligatoria: no se cierra tocando fuera ni con «atrás» (antes se podía cerrar sin dar la salida
    // y la carrera se quedaba muerta). La salida está siempre a la vista, en el pie.
    const { el, close } = sheet(`<div id="pre">${html()}</div>
      <div class="sheet-foot">${onExit ? `<button id="preexit">Volver</button>` : ""}<button class="red big-cta" id="lights">🚦 Salida</button></div>`, () => { sheetOpen = false; }, { modal: true });
    const rerender = () => {
      // al elegir algo se repinta la hoja: los plegables se quedan como estaban
      const opened = Array.from(el.querySelectorAll<HTMLDetailsElement>("#pre details"), (d) => d.open);
      el.querySelector("#pre")!.innerHTML = html();
      el.querySelectorAll<HTMLDetailsElement>("#pre details").forEach((d, i) => { d.open = !!opened[i]; });
      wire();
    };
    const wire = () => {
      el.querySelectorAll<HTMLElement>("[data-plans]").forEach((box) => box.querySelectorAll<HTMLButtonElement>("[data-plan]").forEach((b) => (b.onclick = () => {
        const c = me[Number(box.dataset.plans)];
        const o = plansOf.get(c.id)![Number(b.dataset.plan)];
        // en seco, se sale con el neumático del plan elegido (montarlo recalcula el plan: va antes)
        const first = o.plan.stints[0];
        if (sess.startWater(c) <= WET.si && first.setId && c.tyres?.c !== first.c) sess.setStartTyre(c, first.setId);
        c.plan = { stints: o.plan.stints.map((x) => ({ ...x })), total: o.plan.total };
        rerender();
      })));
      el.querySelectorAll<HTMLElement>("[data-start]").forEach((box) => box.querySelectorAll<HTMLButtonElement>("[data-set]").forEach((b) => (b.onclick = () => {
        sess.setStartTyre(me[Number(box.dataset.start)], b.dataset.set!);
        rerender();
      })));
      el.querySelectorAll<HTMLElement>("[data-fuel]").forEach((sg) => sg.querySelectorAll<HTMLButtonElement>("button").forEach((b) => (b.onclick = () => {
        sess.setFuel(me[Number(sg.dataset.fuel)], Number(b.dataset.v));
        rerender();
      })));
      el.querySelector<HTMLButtonElement>("#predata")!.onclick = () => dataSheet();
    };
    wire();
    el.querySelector<HTMLButtonElement>("#lights")!.onclick = () => { close(); lightsOut(start); };
    const ex = el.querySelector<HTMLButtonElement>("#preexit");
    if (ex) ex.onclick = () => { close(); exitSession(); };
  }

  // ---------------------------------------------------------- bucle
  /** Suelta todo lo que la pantalla tiene enganchado (al terminar o al salir). */
  function cleanup() {
    ended = true;
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", persist);
    document.removeEventListener("keydown", onKey);
    cancelAnimationFrame(raf);
    window.onresize = null;
    mapObs.disconnect();
    m3?.dispose(); m3 = null;
    keepAwake(false);
  }
  function finish() {
    if (ended) return;
    cleanup();
    setTimeout(() => { closeAllSheets(); onFinish(sess); }, skipping ? 0 : 1200);
  }
  /** Salir a medias: la sesión queda guardada (si ya había empezado) y se retoma desde el fin de semana. */
  function exitSession() {
    if (ended || skipping || !onExit) return;
    paused = true;
    persist();
    if (started) setParked(true);
    cleanup();
    closeAllSheets();
    onExit();
  }
  function skipToEnd() {
    if (skipping || ended) return;
    if (!confirm(race ? "¿Simular hasta el final? El equipo llevará a tus pilotos con la estrategia elegida (paradas, neumáticos y lluvia)." : "¿Simular hasta el final de la sesión? El equipo se hace cargo del programa de tus dos pilotos (la tanda que estén haciendo sigue).")) return;
    skipping = true;
    paused = true;
    updSpeed();
    // antes, un piloto mandado a mano se quedaba en el garaje el resto de la sesión
    if (race) sess.autoPlayers = true; else for (const c of mine()) teamTakesOver(sess, c);
    runToEnd(sess, wk, (p) => {
      showToast(`Simulando… ${Math.round(Math.min(1, p) * 100)} %<div class="progress"><i style="width:${Math.min(100, p * 100)}%"></i></div>`, 60000, "Muro", false, "left");
      renderTower(); renderTop();
    }, () => { hideToast(); renderTower(); renderTop(); finish(); });
  }

  // Un piloto que llevas tú vuelve al garaje y no tiene nada programado: se avisa (y, si está
  // activado en Ajustes, se para la sesión) en vez de dejar correr el reloj sin decir nada.
  const lastLoc = new Map<number, Car["loc"]>();
  function idleCheck() {
    for (const c of mine()) {
      const prev = lastLoc.get(c.id);
      lastLoc.set(c.id, c.loc);
      if (!prev || prev === "garage" || c.loc !== "garage") continue;
      if (c.auto || c.queue.length || c.eliminated || sess.flag === "red" || sess.remaining() < 150) continue;
      let text: string;
      if (quali) {
        const part = sess.parts[sess.part];
        const alive = sess.timingOrder().filter((x) => !x.eliminated);
        const pos = alive.indexOf(c) + 1;
        const cut = part?.advance ?? null;
        text = `${c.d.abrev} está en el garaje: P${pos}${cut ? (pos > cut ? `, fuera del corte` : pos > cut - 3 ? `, al borde del corte` : `, dentro`) : ""}. Quedan ${fmtClock(sess.remaining())} de ${part?.name ?? "sesión"}.`;
      } else text = `${c.d.abrev} está en el garaje sin nada programado. Quedan ${fmtClock(sess.remaining())}: «Tanda» o «Auto».`;
      if (prefs.pausas.garaje) {
        paused = true;
        leftover = 0;
        pend.right = { html: text, tab: "Garaje", cls: "", until: Infinity };
        updSpeed();
      } else showToast(text, 6000, "Garaje");
      renderMessages();
      renderDrivers();
    }
  }

  sizeMap();
  window.onresize = sizeMap;
  renderTower(); renderTop(); renderDrivers();
  const mapObs = new ResizeObserver(() => { sizeMap(); m3?.resize(); });
  mapObs.observe(document.querySelector(".mapbox")!);
  updSpeed();
  // «atrás» (móvil o navegador) abre el menú de la sesión en vez de sacarte de la app
  setBack(() => menuSheet());
  if (prefs.mapa3d) void set3d(true, false);
  let last = performance.now(), last3d = last;
  const loop = (now: number) => {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused) ff = false;
    if (!paused && !sess.finished && !skipping) {
      leftover += real * (ff ? FF_SPEED : speed);
      let n = 0;
      // como mucho ~10 ms de simulación por fotograma: si el móvil no da para tanto, la sesión
      // va algo más lenta en vez de dar tirones (y no se acumula retraso)
      const budget = performance.now() + (ff ? 28 : 10);
      while (leftover >= sess.dt && n < 6000) {
        if (view3d && m3) m3.beforeStep();
        sess.step();
        leftover -= sess.dt;
        n++;
        if (ff) { const why = ffLocChange(); if (why) stopFF(why); }
        if (paused) { leftover = 0; break; }
        if ((n & 15) === 0 && performance.now() > budget) { leftover = Math.min(leftover, sess.dt * 4); break; }
      }
    }
    try {
      if (!race && !skipping) idleCheck();
      // en pausa no cambia casi nada: se redibuja 4 veces por segundo en vez de 60 (batería)
      const busy = !paused;
      const in3d = view3d && !!m3 && !wide;
      // en pausa, el 3D se redibuja 4 veces por segundo como el 2D, salvo mientras la cámara cambia de sitio
      const due = busy || now - lastDraw > 250;
      if (in3d && !skipping && (due || m3!.moving())) { m3!.draw(Math.min(0.1, (now - last3d) / 1000), now); last3d = now; }
      if (!skipping && due) { lastDraw = now; if (!in3d) drawMap(); drawStrip(); renderFly(); }
      if (now - lastUi > (busy ? 250 : 500) && !skipping) {
        lastUi = now;
        updateGhosts(); updateRainAlert(); fastestLapCheck();
        if (now >= towerAnimUntil) renderTower();
        renderTop(); renderMessages(); renderSel();
        if (!sheetOpen) renderDrivers();
      }
    } catch (err) {
      console.error(err); // un fallo de dibujo no puede parar la sesión
    }
    if (!paused && now - lastSave > 8000) persist();
    if (sess.finished) return finish();
    raf = requestAnimationFrame(loop);
  };
  const begin = () => {
    if (snap) {
      const at = new Date(snap.savedAt);
      showToast(`Sesión recuperada tal como estaba a las ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}. Pulsa ▶ para seguir.`, 0, "Muro", true, "left");
      raf = requestAnimationFrame(loop);
      return;
    }
    // textos cortos: tienen que caber enteros en la caja de avisos de un móvil estrecho
    if (race) showToast("Pulsa ▶ para dar la salida.", 0, "Muro", true, "left");
    else showToast(quali ? "Pulsa ▶ para empezar. «Salir» manda a tu piloto a pista; con «Auto» decide el equipo." : "Pulsa ▶ para empezar. «Tanda» programa una salida; con «Auto» decide el equipo.", 0, "Muro", true, "left");
    raf = requestAnimationFrame(loop);
  };
  // tras el semáforo la carrera arranca sola, a la velocidad de siempre
  if (race && !snap) preRace(() => { begin(); setSpeed(speed); }); else begin();
}
