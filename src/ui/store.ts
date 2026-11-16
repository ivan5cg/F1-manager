import type { SeasonState } from "../sim/season";
import { stripForSave } from "../sim/weekend";
import { parseSnapshot, SessionSnapshot, replacer, reviver } from "../sim/snapshot";
import * as db from "./db";
import { DEFAULT_SOUND, type SoundPrefs } from "./audio";

// ---------------------------------------------------------------- partidas
// Hay SLOTS partidas guardadas, cada una con su temporada, su sesión a medias y su marca de
// «aparcada». La 1 usa las claves de siempre (así siguen las partidas de antes); la activa se
// recuerda entre visitas. Todo vive en este navegador: para llevarla a otro sitio, exportar.
//
// Las partidas van en IndexedDB (localStorage se queda en unos 5 MB). Al arrancar, initStore()
// las carga todas a memoria; desde ahí se leen sin esperar, y cada escritura cambia la memoria y
// se manda a IndexedDB sin esperar. Sin IndexedDB (algunos modos privados), todo sigue en
// localStorage como antes. Los ajustes y la partida activa siguen siempre en localStorage: son
// pequeños y se leen al arrancar.
export const SLOTS = 3;
const ACTIVE = "muro-ranura";
const suffix = (n: number) => (n === 1 ? "" : `-${n}`);
const seasonKey = (n: number) => `muro-temporada-2026${suffix(n)}`;
const sessionKey = (n: number) => `muro-sesion-2026${suffix(n)}`;
const parkedKey = (n: number) => `muro-sesion-aparcada${suffix(n)}`;
const SLOT_KEYS = Array.from({ length: SLOTS }, (_, i) => [seasonKey(i + 1), sessionKey(i + 1), parkedKey(i + 1)]).flat();

/** Lo que hay en IndexedDB, en memoria. null: sin IndexedDB (todo en localStorage). */
let cache: Map<string, string> | null = null;

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* nada */ } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

const get = (k: string) => (cache ? cache.get(k) ?? null : lsGet(k));
const del = (k: string) => {
  if (!cache) return lsDel(k);
  cache.delete(k);
  db.del(k).catch(() => { /* se queda en memoria hasta cerrar */ });
};
/** Guarda una clave. false solo si no hay sitio en localStorage (con IndexedDB no se espera a saberlo). */
const put = (k: string, v: string) => {
  if (!cache) return lsSet(k, v);
  cache.set(k, v);
  db.set(k, v).catch(() => { /* sin sitio: dura lo que la pestaña */ });
  return true;
};

/** Carga las partidas a memoria (y pasa a IndexedDB las de antes, si las hay). Antes de pintar nada. */
export async function initStore(): Promise<void> {
  const ok = await db.openDb();
  if (!ok) return;
  let mem: Map<string, string>;
  try { mem = await db.all(); } catch { return; }
  if (!mem.size) {
    // partidas de versiones anteriores, en localStorage: se copian y, solo con la copia hecha, se borran
    const old = SLOT_KEYS.map((k) => [k, lsGet(k)] as [string, string | null]).filter((e): e is [string, string] => e[1] !== null);
    if (old.length) {
      try {
        await db.setMany(old);
        // se comprueba leyendo de vuelta antes de borrar nada
        const back = await db.all();
        if (old.some(([k, v]) => back.get(k) !== v)) return;
      } catch { return; } // si no se puede copiar, todo sigue en localStorage
      for (const [k, v] of old) { mem.set(k, v); lsDel(k); }
    }
  }
  cache = mem;
}

/** ¿Las partidas van en IndexedDB? (sin ella, no caben cosas grandes como las fotos) */
export const roomyStorage = () => !!cache;

/** Pide al navegador que no borre los datos por su cuenta (al crear la primera partida). */
export function askPersist() {
  try { void navigator.storage?.persist?.(); } catch { /* nada */ }
}

/** Espacio que usa el juego en este navegador (null si no se puede saber). */
export async function storageUse(): Promise<{ used: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || e.usage === undefined) return null;
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return { used: e.usage, persisted };
  } catch {
    return null;
  }
}

export function getActiveSlot(): number {
  const n = Number(lsGet(ACTIVE));
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
  // sin almacenamiento: la partida dura lo que la pestaña
  put(seasonKey(getActiveSlot()), JSON.stringify({ ...s, weekend: s.weekend ? stripForSave(s.weekend) : null }, replacer));
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
  if (!put(seasonKey(n), file.temporada)) return false;
  if (file.sesion && parseSnapshot(file.sesion)) put(sessionKey(n), file.sesion);
  if (file.sesion && file.aparcada) put(parkedKey(n), "1");
  return true;
}

// ---------------------------------------------------------------- sesión a medias
/** Guarda la instantánea de la sesión en curso. Devuelve false si no cabe o no hay almacenamiento. */
export function saveSession(raw: string): boolean {
  return put(sessionKey(getActiveSlot()), raw);
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
  if (on) put(parkedKey(getActiveSlot()), "1"); else del(parkedKey(getActiveSlot()));
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
  /** El mapa de la sesión se abre en 3D (lo último que eligió el jugador). */
  mapa3d?: boolean;
  /** Comentarios de Antonio Lobato en la sesión (por defecto, sí). */
  lobato?: boolean;
  /** Medidor de rendimiento del mapa 3D (fps, calidad, triángulos). */
  rendimiento3d?: boolean;
  /** Calidad del mapa 3D fijada a mano (0 a 3); sin ella, automática. */
  calidad3d?: number;
  /** Sonido de la sesión: sí/no y volúmenes (0 a 1). */
  sonido: SoundPrefs;
}
/** Velocidades de la sesión (× tiempo real). */
export const SPEEDS = [1, 2, 4, 8, 16, 64];
const PKEY = "muro-preferencias";
const DEFAULT_PREFS: Prefs = { pausas: { control: true, partes: true, estratega: true, radio: true, garaje: true }, velCarrera: 4, velSesion: 16, sonido: DEFAULT_SOUND };

export function loadPrefs(): Prefs {
  const p: Prefs = { ...DEFAULT_PREFS, pausas: { ...DEFAULT_PREFS.pausas }, sonido: { ...DEFAULT_SOUND } };
  try {
    const raw = localStorage.getItem(PKEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Prefs>;
      Object.assign(p.pausas, o.pausas ?? {});
      if (SPEEDS.includes(o.velCarrera as number)) p.velCarrera = o.velCarrera as number;
      if (SPEEDS.includes(o.velSesion as number)) p.velSesion = o.velSesion as number;
      if (o.mapa3d === true) p.mapa3d = true;
      if (o.lobato === false) p.lobato = false;
      if (o.rendimiento3d === true) p.rendimiento3d = true;
      if ([0, 1, 2, 3].includes(o.calidad3d as number)) p.calidad3d = o.calidad3d;
      if (o.sonido && typeof o.sonido === "object") {
        const so = o.sonido as Partial<SoundPrefs>;
        if (typeof so.sonido === "boolean") p.sonido.sonido = so.sonido;
        for (const k of ["volumen", "motores", "ambiente", "radio"] as const) if (typeof so[k] === "number") p.sonido[k] = Math.max(0, Math.min(1, so[k]!));
      }
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
