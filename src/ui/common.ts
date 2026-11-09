import { COMPOUNDS, Compound, TyreSet, setWear } from "../sim/tyres";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const fmtLap = (t: number | null | undefined) => (t && isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}` : "—");
export const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export const fmtRace = (t: number) => { const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = (t % 60).toFixed(3).padStart(6, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };
export const tyreHtml = (c: Compound, big = false) => `<span class="tyre${big ? " big" : ""}" style="border-color:${COMPOUNDS[c].color}">${c}</span>`;

// ------------------------------------------------------------------ neumáticos
// En toda la interfaz el porcentaje de un juego es la GOMA QUE LE QUEDA (100 % = nuevo), igual
// que la barra de la tarjeta del piloto.
/** Goma que le queda a un juego, en % (100 = nuevo). */
export const lifeLeft = (s: TyreSet) => Math.round((1 - setWear(s)) * 100);
export const setLabel = (s: TyreSet) => (s.laps === 0 ? "nuevo" : `${s.laps} v · ${lifeLeft(s)} %`);
/** Color de la barra de goma: verde, ámbar cerca del precipicio y rojo pasado. */
export function wearColor(s: TyreSet): string {
  const w = setWear(s), sp = COMPOUNDS[s.c];
  return w > sp.cliff ? "var(--red1)" : w > sp.cliff - 0.12 ? "var(--gold1)" : "var(--green)";
}
/** Juegos iguales (mismo compuesto, vueltas y goma) agrupados: ocho blandos nuevos son un botón, no ocho. */
export function groupSets(sets: TyreSet[]): { sets: TyreSet[]; c: Compound }[] {
  const out: { key: string; sets: TyreSet[]; c: Compound }[] = [];
  for (const s of sets) {
    const key = `${s.c}:${s.laps}:${lifeLeft(s)}:${s.returned ? 1 : 0}`;
    const g = out.find((x) => x.key === key);
    if (g) g.sets.push(s); else out.push({ key, sets: [s], c: s.c });
  }
  return out;
}

// ------------------------------------------------------------------ banderas
// Windows no dibuja las banderas emoji (salen dos letras sueltas): ahí se pinta el código en una
// etiqueta, que al menos parece hecho a propósito.
const NO_FLAG_EMOJI = typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);
export function flagHtml(flag: string): string {
  if (!NO_FLAG_EMOJI) return flag;
  const code = [...flag].map((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1f1e6 && cp <= 0x1f1ff ? String.fromCharCode(65 + cp - 0x1f1e6) : ""; }).join("");
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
 * Hoja inferior. Devuelve el elemento y una función para cerrarla.
 * Con `modal`, no se cierra tocando fuera ni con atrás: solo con sus propios botones.
 */
export function sheet(html: string, onClose?: () => void, opts: { modal?: boolean } = {}): { el: HTMLElement; close: () => void } {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(bg);
  let closed = false;
  const doClose = () => { if (closed) return; closed = true; bg.remove(); onClose?.(); };
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
  if (!opts.modal) bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = close));
  return { el: bg, close };
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
