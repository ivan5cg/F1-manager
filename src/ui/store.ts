import type { SeasonState } from "../sim/season";
import { stripForSave } from "../sim/weekend";

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
