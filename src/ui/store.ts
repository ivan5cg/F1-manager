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
  try { localStorage.removeItem(SKEY); } catch { /* nada */ }
}
