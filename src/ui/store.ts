import type { SeasonState } from "../sim/season";
import { stripForSave } from "../sim/weekend";
import { parseSnapshot, SessionSnapshot } from "../sim/snapshot";

const KEY = "muro-temporada-2026";

export function loadSeason(): SeasonState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SeasonState;
    return s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveSeason(s: SeasonState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, weekend: s.weekend ? stripForSave(s.weekend) : null }));
  } catch {
    /* sin almacenamiento: la partida dura lo que la pestaña */
  }
}

export function clearSeason() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

// ---------------------------------------------------------------- sesión a medias
const SKEY = "muro-sesion-2026";

/** Guarda la instantánea de la sesión en curso. Devuelve false si no cabe o no hay almacenamiento. */
export function saveSession(raw: string): boolean {
  try { localStorage.setItem(SKEY, raw); return true; } catch { return false; }
}

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SKEY);
    return raw ? parseSnapshot(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try { localStorage.removeItem(SKEY); localStorage.removeItem(PARKED); } catch { /* nada */ }
}

// El jugador salió de la sesión a propósito («Salir al fin de semana»): al abrir la app no se
// vuelve a meter en ella sola; espera en el fin de semana con «Reanudar».
const PARKED = "muro-sesion-aparcada";
export function setParked(on: boolean) {
  try { if (on) localStorage.setItem(PARKED, "1"); else localStorage.removeItem(PARKED); } catch { /* nada */ }
}
export function isParked(): boolean {
  try { return localStorage.getItem(PARKED) === "1"; } catch { return false; }
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
