/// <reference types="vite/client" />
import { COMPOUNDS, Compound, TyreSet, setWear } from "../sim/tyres";
import { fmtMinSec } from "../sim/session";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const fmtLap = (t: number | null | undefined) => (t && isFinite(t) && t > 0 ? fmtMinSec(t) : "—");
export const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export const fmtRace = (t: number) => { const u = Math.round(t * 1000) / 1000; const h = Math.floor(u / 3600); const ms = fmtMinSec(u - h * 3600); return h ? `${h}:${ms.padStart(9, "0")}` : ms; };
export const tyreHtml = (c: Compound, big = false) => `<span class="tyre${big ? " big" : ""}" style="border-color:${COMPOUNDS[c].color}">${c}</span>`;

// ------------------------------------------------------------------ neumáticos
// En toda la interfaz el porcentaje de un juego es la GOMA QUE LE QUEDA (100 % = nuevo), igual
// que la barra de la tarjeta del piloto.
/** Goma que le queda a un juego, en % (100 = nuevo). */
export const lifeLeft = (s: TyreSet) => Math.round((1 - setWear(s)) * 100);
/** Un juego usado con ampollas (lo vieron los mecánicos al quitarlo) se marca: se gasta antes y agarra menos. */
const blistered = (s: TyreSet) => !!s.insp && Math.max(...s.insp.blister) >= 0.1;
export const setLabel = (s: TyreSet) => (s.laps === 0 ? "nuevo" : `${s.laps} v · ${lifeLeft(s)} %${blistered(s) ? " · ampollas" : ""}`);
/** Color de la barra de goma: verde, ámbar cerca del precipicio y rojo pasado. */
export function wearColor(s: TyreSet): string {
  const w = setWear(s), sp = COMPOUNDS[s.c];
  return w > sp.cliff ? "var(--red1)" : w > sp.cliff - 0.12 ? "var(--gold1)" : "var(--green)";
}
/** Juegos iguales (mismo compuesto, vueltas y goma) agrupados: ocho blandos nuevos son un botón, no ocho. */
export function groupSets(sets: TyreSet[]): { sets: TyreSet[]; c: Compound }[] {
  const out: { key: string; sets: TyreSet[]; c: Compound }[] = [];
  for (const s of sets) {
    const key = `${s.c}:${s.laps}:${lifeLeft(s)}:${s.returned ? 1 : 0}:${blistered(s) ? 1 : 0}`;
    const g = out.find((x) => x.key === key);
    if (g) g.sets.push(s); else out.push({ key, sets: [s], c: s.c });
  }
  return out;
}

// ------------------------------------------------------------------ banderas
// Banderas SVG 4×3 (flag-icons, MIT) para que se vean iguales en todos los dispositivos; si falta
// alguna, en Windows sale el código en etiqueta y en el resto el emoji.
const FLAG_CODES = new Set([
  "ae", "ar", "at", "au", "az", "be", "bh", "br", "ca", "ch", "cn", "co", "de",
  "dk", "ee", "es", "fi", "fr", "gb", "hu", "id", "ie", "in", "it", "jp", "mc",
  "mx", "my", "nl", "nz", "pl", "qa", "ru", "se", "sg", "th", "us", "ve",
]);
const NO_FLAG_EMOJI = typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);
export function flagHtml(flag: string): string {
  const code = [...flag].map((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1f1e6 && cp <= 0x1f1ff ? String.fromCharCode(65 + cp - 0x1f1e6) : ""; }).join("");
  const lc = code.toLowerCase();
  if (FLAG_CODES.has(lc)) return `<img class="fl" src="${import.meta.env.BASE_URL}assets/flags/${lc}.svg" alt="${code}" width="18" height="12" decoding="async">`;
  if (!NO_FLAG_EMOJI) return flag;
  return code ? `<span class="cc">${code}</span>` : flag;
}

// ------------------------------------------------------------------ hojas y botón atrás
// Cada hoja abierta añade una entrada al historial: el botón atrás del móvil (o del navegador)
// cierra la hoja de arriba en vez de salir de la app. Sin hojas, atrás llama al manejador de la
// pantalla actual (volver al fin de semana, abrir el menú de la sesión...).
interface OpenSheet { close: () => void; modal: boolean }
const sheets: OpenSheet[] = [];
let ignorePops = 0;
let backHandler: (() => void) | null = null;
let guard = false;

function pushGuard() {
  try { history.pushState({ muro: "base" }, ""); guard = true; } catch { /* sin historial */ }
}
/** Qué hace el botón atrás en la pantalla actual cuando no hay hojas abiertas (null = salir). */
export function setBack(fn: (() => void) | null) {
  backHandler = fn;
  if (fn && !guard) pushGuard();
}
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = sheets[sheets.length - 1];
    if (top) {
      // una hoja obligatoria (la parrilla) no se cierra con atrás: se repone su entrada
      if (top.modal) { try { history.pushState({ muro: "hoja" }, ""); } catch { /* nada */ } return; }
      sheets.pop();
      top.close();
      return;
    }
    guard = false;
    if (backHandler) { pushGuard(); backHandler(); }
  });
}
/** Cierra la hoja de arriba (tecla Escape). Devuelve si había alguna que cerrar. */
export function closeTopSheet(): boolean {
  const top = sheets[sheets.length - 1];
  if (!top || top.modal) return false;
  ignorePops++;
  sheets.pop();
  try { history.back(); } catch { ignorePops--; }
  top.close();
  return true;
}
export const anySheetOpen = () => sheets.length > 0;
/** Cierra todas las hojas, también las obligatorias (al cambiar de pantalla). */
export function closeAllSheets() {
  while (sheets.length) {
    const top = sheets.pop()!;
    ignorePops++;
    try { history.back(); } catch { ignorePops--; }
    top.close();
  }
}

/**
 * Hoja inferior animada con cierre deslizando hacia abajo (*swipe down*) en hojas no modales.
 * Devuelve el elemento y una función para cerrarla.
 * Con `modal`, no se cierra tocando fuera, deslizando ni con atrás: solo con sus propios botones.
 */
export function sheet(html: string, onClose?: () => void, opts: { modal?: boolean } = {}): { el: HTMLElement; close: () => void } {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">${opts.modal ? "" : `<div class="sheet-grip" aria-hidden="true"><i></i></div>`}${html}</div>`;
  document.body.appendChild(bg);
  const panel = bg.firstElementChild as HTMLElement;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) bg.classList.add("open");
  else requestAnimationFrame(() => requestAnimationFrame(() => { if (!closed) bg.classList.add("open"); }));
  let closed = false;
  const doClose = () => {
    if (closed) return;
    closed = true;
    onClose?.();
    if (reduce) { bg.remove(); return; }
    panel.classList.remove("dragging");
    panel.style.transform = "";
    bg.style.background = "";
    bg.classList.remove("open");
    bg.classList.add("closing");
    const done = () => { if (bg.isConnected) bg.remove(); };
    panel.addEventListener("transitionend", done, { once: true });
    window.setTimeout(done, 260);
  };
  const entry: OpenSheet = { close: doClose, modal: !!opts.modal };
  sheets.push(entry);
  try { history.pushState({ muro: "hoja" }, ""); } catch { /* sin historial */ }
  const close = () => {
    if (closed) return;
    const i = sheets.indexOf(entry);
    if (i >= 0) {
      sheets.splice(i, 1);
      ignorePops++;
      try { history.back(); } catch { ignorePops--; }
    }
    doClose();
  };
  if (!opts.modal) {
    bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
    // Gesto natural de deslizar hacia abajo desde el tirador o desde la cabecera (con scroll arriba del todo)
    const grip = panel.querySelector<HTMLElement>(".sheet-grip");
    let dragId: number | null = null, startX = 0, startY = 0, lastY = 0, lastT = 0, dy = 0, vy = 0, engaged = false;
    const canDragFrom = (target: EventTarget | null, y: number) => {
      const t = target as HTMLElement | null;
      if (grip && t && grip.contains(t)) return true;
      if (panel.scrollTop > 2) return false;
      if (t?.closest("input, select, textarea, canvas")) return false;
      const r = panel.getBoundingClientRect();
      return y - r.top <= 68;
    };
    const resetDrag = () => {
      panel.classList.remove("dragging");
      panel.style.transform = "";
      bg.style.background = "";
      dragId = null; engaged = false; dy = 0; vy = 0;
    };
    panel.addEventListener("pointerdown", (e) => {
      if (closed || e.button > 0 || dragId !== null) return;
      if (!canDragFrom(e.target, e.clientY)) return;
      dragId = e.pointerId;
      startX = e.clientX; startY = lastY = e.clientY; lastT = performance.now();
      dy = 0; vy = 0; engaged = false;
    });
    panel.addEventListener("pointermove", (e) => {
      if (closed || e.pointerId !== dragId) return;
      const curY = e.clientY, dx = e.clientX - startX, rawDy = curY - startY;
      if (!engaged) {
        if (rawDy < 10) { if (rawDy < -12) dragId = null; return; }
        if (Math.abs(rawDy) < Math.abs(dx) * 1.15 || panel.scrollTop > 2) { dragId = null; return; }
        engaged = true;
        panel.classList.add("dragging");
        try { panel.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }
      const now = performance.now(), dt = Math.max(1, now - lastT);
      vy = (curY - lastY) / dt;
      lastY = curY; lastT = now;
      dy = Math.max(0, rawDy);
      panel.style.transform = `translateY(${dy.toFixed(1)}px)`;
      bg.style.background = `rgba(0, 0, 0, ${(0.65 * Math.max(0.12, 1 - dy / 340)).toFixed(3)})`;
    });
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      const wasEngaged = engaged, curDy = dy, curVy = vy;
      if (!wasEngaged) { dragId = null; return; }
      const thresh = Math.min(115, Math.max(70, panel.offsetHeight * 0.26));
      if (curDy > thresh || (curVy > 0.45 && curDy > 34)) {
        dragId = null; engaged = false;
        close();
      } else {
        resetDrag();
      }
    };
    panel.addEventListener("pointerup", endDrag);
    panel.addEventListener("pointercancel", () => { if (dragId !== null) resetDrag(); });
  }
  bg.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = close));
  return { el: bg, close };
}

// ------------------------------------------------------------------ vibración háptica (Android)
export const HAPTIC = {
  tap: 10,
  light: 16,
  start: [35, 30, 50],
  pit: [18, 35, 28],
  alert: [30, 40, 30],
} as const;

/** Vibración táctil discreta (solo si está activa y el dispositivo la soporta). */
export function haptic(pattern: number | readonly number[], enabled = true) {
  if (!enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try { navigator.vibrate(Array.isArray(pattern) ? [...pattern] : (pattern as number)); } catch { /* sin soporte */ }
}

// ------------------------------------------------------------------ pantalla encendida
// Viendo una carrera sin tocar nada el móvil se bloquea: mientras la sesión corre se pide que no.
let wakeLock: { release: () => Promise<void> } | null = null;
let wakeWanted = false;
async function acquireWake() {
  if (!wakeWanted || wakeLock || document.visibilityState !== "visible") return;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (ev: string, fn: () => void) => void }> } };
    if (!nav.wakeLock) return;
    const l = await nav.wakeLock.request("screen");
    l.addEventListener("release", () => { if (wakeLock === l) wakeLock = null; });
    wakeLock = l;
    if (!wakeWanted) { wakeLock = null; void l.release(); }
  } catch { /* sin permiso o sin soporte: nada */ }
}
export function keepAwake(on: boolean) {
  wakeWanted = on;
  if (on) void acquireWake();
  else if (wakeLock) { const l = wakeLock; wakeLock = null; void l.release().catch(() => {}); }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void acquireWake(); });

export function radarColor(r: number): [number, number, number, number] {
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

export function dirName(a: number) {
  const names = ["el este", "el noreste", "el norte", "el noroeste", "el oeste", "el suroeste", "el sur", "el sureste"];
  return names[Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
}

export const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
