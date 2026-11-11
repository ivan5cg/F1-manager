import type { SeasonState } from "../sim/season";
import { stripForSave } from "../sim/weekend";
import { parseSnapshot, SessionSnapshot, replacer, reviver } from "../sim/snapshot";

// ---------------------------------------------------------------- partidas
// Hay SLOTS partidas guardadas, cada una con su temporada, su sesión a medias y su marca de
// «aparcada». La 1 usa las claves de siempre (así siguen las partidas de antes); la activa se
// recuerda entre visitas. Todo vive en este navegador: para llevarla a otro sitio, exportar.
export const SLOTS = 3;
const ACTIVE = "muro-ranura";
const suffix = (n: number) => (n === 1 ? "" : `-${n}`);
const seasonKey = (n: number) => `muro-temporada-2026${suffix(n)}`;
const sessionKey = (n: number) => `muro-sesion-2026${suffix(n)}`;
const parkedKey = (n: number) => `muro-sesion-aparcada${suffix(n)}`;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* nada */ } };

export function getActiveSlot(): number {
  const n = Number(get(ACTIVE));
  return n >= 1 && n <= SLOTS ? n : 1;
}
export function setActiveSlot(n: number) {
  try { localStorage.setItem(ACTIVE, String(n)); } catch { /* nada */ }
}

function parseSeason(raw: string | null): SeasonState | null {
  if (!raw) return null;
  try {
    // Infinity (un piloto sin vuelta) se guarda como "__Inf": JSON normal lo convertiría en null
    const s = JSON.parse(raw, reviver) as SeasonState;
    return s && s.v === 1 && typeof s.playerTeam === "string" && Array.isArray(s.rounds) ? s : null;
  } catch {
    return null;
  }
}

/** Temporada de una partida (por defecto, la activa). */
export function loadSeason(slot = getActiveSlot()): SeasonState | null {
  return parseSeason(get(seasonKey(slot)));
}

export function saveSeason(s: SeasonState) {
  try {
    localStorage.setItem(seasonKey(getActiveSlot()), JSON.stringify({ ...s, weekend: s.weekend ? stripForSave(s.weekend) : null }, replacer));
  } catch {
    /* sin almacenamiento: la partida dura lo que la pestaña */
  }
}

export function clearSeason() {
  del(seasonKey(getActiveSlot()));
}

/** Borra una partida entera: temporada, sesión a medias y marca de aparcada. */
export function deleteSlot(n: number) {
  del(seasonKey(n)); del(sessionKey(n)); del(parkedKey(n));
}

/** Resumen de cada partida para la pantalla de inicio. */
export function slotList(): { slot: number; season: SeasonState | null; midSession: boolean }[] {
  return Array.from({ length: SLOTS }, (_, i) => {
    const slot = i + 1;
    return { slot, season: loadSeason(slot), midSession: !!get(sessionKey(slot)) };
  });
}

// ---------------------------------------------------------------- exportar / importar
const APP = "muro-de-boxes";
interface ExportFile { app: string; formato: number; exportado: string; temporada: string; sesion: string | null; aparcada: boolean }

/** La partida como texto (JSON) para guardarla en un archivo. null si está vacía. */
export function exportSlot(n: number): string | null {
  const temporada = get(seasonKey(n));
  if (!temporada) return null;
  const f: ExportFile = { app: APP, formato: 1, exportado: new Date().toISOString(), temporada, sesion: get(sessionKey(n)), aparcada: get(parkedKey(n)) === "1" };
  return JSON.stringify(f);
}

/** Comprueba un archivo exportado. Devuelve la temporada que trae o el motivo por el que no vale. */
export function checkImport(text: string): { ok: true; season: SeasonState; file: ExportFile } | { ok: false; why: string } {
  let f: ExportFile;
  try { f = JSON.parse(text); } catch { return { ok: false, why: "El archivo no es una partida exportada (no se puede leer)." }; }
  if (!f || f.app !== APP || typeof f.temporada !== "string") return { ok: false, why: "El archivo no es una partida de Muro de Boxes." };
  if (f.formato !== 1) return { ok: false, why: "La partida es de una versión más nueva del juego: actualiza la app." };
  const season = parseSeason(f.temporada);
  if (!season) return { ok: false, why: "La partida del archivo está dañada." };
  return { ok: true, season, file: f };
}

/** Escribe en una partida lo que trae un archivo ya comprobado (sustituye lo que hubiera). */
export function importInto(n: number, file: ExportFile) {
  deleteSlot(n);
  try {
    localStorage.setItem(seasonKey(n), file.temporada);
    if (file.sesion && parseSnapshot(file.sesion)) localStorage.setItem(sessionKey(n), file.sesion);
    if (file.sesion && file.aparcada) localStorage.setItem(parkedKey(n), "1");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- sesión a medias
/** Guarda la instantánea de la sesión en curso. Devuelve false si no cabe o no hay almacenamiento. */
export function saveSession(raw: string): boolean {
  try { localStorage.setItem(sessionKey(getActiveSlot()), raw); return true; } catch { return false; }
}

export function loadSession(): SessionSnapshot | null {
  const raw = get(sessionKey(getActiveSlot()));
  return raw ? parseSnapshot(raw) : null;
}

export function clearSession() {
  const n = getActiveSlot();
  del(sessionKey(n)); del(parkedKey(n));
}

// El jugador salió de la sesión a propósito («Salir al fin de semana»): al abrir la app no se
// vuelve a meter en ella sola; espera en el fin de semana con «Reanudar».
export function setParked(on: boolean) {
  try { if (on) localStorage.setItem(parkedKey(getActiveSlot()), "1"); else del(parkedKey(getActiveSlot())); } catch { /* nada */ }
}
export function isParked(): boolean {
  return get(parkedKey(getActiveSlot())) === "1";
}

// ---------------------------------------------------------------- preferencias
/** Qué momentos paran la sesión sola. */
export interface PausePrefs {
  control: boolean; // dirección de carrera: coche de seguridad, banderas
  partes: boolean; // clasificación: fin y principio de cada parte
  estratega: boolean; // el estratega recomienda parar
  radio: boolean; // tus pilotos: neumáticos acabados, lluvia
  garaje: boolean; // un piloto que llevas tú se queda sin programa
}
export interface Prefs {
  pausas: PausePrefs;
  velCarrera: number;
  velSesion: number;
}
/** Velocidades de la sesión (× tiempo real). */
export const SPEEDS = [1, 2, 4, 8, 16, 64];
const PKEY = "muro-preferencias";
const DEFAULT_PREFS: Prefs = { pausas: { control: true, partes: true, estratega: true, radio: true, garaje: true }, velCarrera: 4, velSesion: 16 };

export function loadPrefs(): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS, pausas: { ...DEFAULT_PREFS.pausas } };
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Prefs>;
      Object.assign(p.pausas, o.pausas ?? {});
      if (SPEEDS.includes(o.velCarrera as number)) p.velCarrera = o.velCarrera as number;
      if (SPEEDS.includes(o.velSesion as number)) p.velSesion = o.velSesion as number;
    } else if (localStorage.getItem("autopausa") === "0") {
      // ajuste antiguo (todo o nada)
      for (const k of Object.keys(p.pausas) as (keyof PausePrefs)[]) p.pausas[k] = false;
    }
  } catch { /* por defecto */ }
  return p;
}
export function savePrefs(p: Prefs) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* nada */ }
}
