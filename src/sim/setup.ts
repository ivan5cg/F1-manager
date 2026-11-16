// Reglajes: carga aerodinámica y altura, en 5 pasos cada uno (-2 … 2), alrededor del coche de referencia de
// cada circuito (el que ya trae su `aero` en los datos). Hay un óptimo por circuito que nadie conoce: cada equipo
// lo estima con un error que depende de su gente (`estrategia`) y que las vueltas de libres van cerrando. Bajo la
// lluvia el óptimo se mueve: más carga y más altura.
//
// Efecto en la simulación (Session.msTime):
//  · carga por encima del óptimo: más agarre en curva (según lo que pese la carga en cada minisector) y más
//    resistencia en recta, equilibrados para que en la vuelta se compensen; además el coche desliza menos (menos
//    desgaste) y sufre más en aire sucio. Por debajo, lo contrario.
//  · altura por debajo del óptimo: el fondo da más agarre en las curvas rápidas y el coche toca el suelo en las
//    lentas y bacheadas (chispas en el 3D), con más desgaste. Por encima, lo contrario.
//  · alejarse del óptimo cuesta tiempo (cuadrático, el coche sale de su ventana), algo más al quedarse bajo.
// La parrilla entera se mide contra su propia media: sin tocar nada, el ritmo medio de la parrilla es el de antes.
import { Rng, clamp } from "./rng";
import type { Track } from "./track";
import type { TeamDef } from "./session";

export interface Setup { a: number; r: number }
export const SETUP_MIN = -2, SETUP_MAX = 2;

/** Cuánto se mueve el óptimo con la pista empapada (en pasos). */
export const WET_SHIFT: Setup = { a: 1.0, r: 1.2 };
/** Segundos por vuelta (de referencia) por paso² fuera del óptimo. */
export const SETUP_Q: Setup = { a: 0.09, r: 0.06 };
/** Agarre en curva por paso de carga (por la parte que viene de la carga) y por paso de altura (curvas rápidas). */
export const SETUP_GRIP: Setup = { a: 0.008, r: 0.004 };

export interface SetupState {
  /** Óptimo en seco (oculto): continuo, entre -1,9 y 1,9. */
  opt: Setup;
  /** Error de partida de cada equipo (en desviaciones) y vueltas de libres que lleva dadas. */
  teams: Record<string, { za: number; zr: number; laps: number }>;
  /** Reglaje elegido por el jugador para cada uno de sus coches (si no, el que propone el ingeniero). */
  cars: Record<number, Setup>;
  /** Parque cerrado: el reglaje de cada coche queda fijo desde la primera clasificación. */
  locked?: Record<number, Setup>;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/** Reglajes del fin de semana. Con su propio generador (no toca el azar del resto del fin de semana). */
export function newSetupState(track: Track, teams: TeamDef[], seed: number): SetupState {
  const rng = new Rng((seed ^ 0x5e7a9) >>> 0);
  const id = String(track.def.id ?? track.id);
  // cada circuito tiene el suyo (casi el mismo cada año) y algo cambia de un fin de semana a otro (asfalto, viento)
  const urban = !!track.def.entorno;
  const opt = {
    a: clamp((hash(id + "a") * 2 - 1) * 1.5 + rng.gauss(0, 0.3), -1.9, 1.9),
    r: clamp((hash(id + "r") * 2 - 1) * 1.2 + (urban ? 0.6 : -0.1) + rng.gauss(0, 0.3), -1.9, 1.9),
  };
  const t: SetupState["teams"] = {};
  for (const tm of teams) t[tm.id] = { za: rng.gauss(0, 1), zr: rng.gauss(0, 1), laps: 0 };
  return { opt, teams: t, cars: {} };
}

/** Error típico (en pasos) de lo que cree un equipo: menos con mejor gente y con más vueltas de libres. */
export function setupSigma(team: TeamDef, laps: number): number {
  const s0 = 0.75 + 0.9 * (100 - team.estrategia) / 100;
  return s0 / Math.sqrt(1 + laps / 15);
}

/** Dónde cree el equipo que está el óptimo en seco, y su error típico. */
export function setupEstimate(ss: SetupState, team: TeamDef): { a: number; r: number; sigma: number } {
  const k = ss.teams[team.id] ?? { za: 0, zr: 0, laps: 0 };
  const sigma = setupSigma(team, k.laps);
  return { a: ss.opt.a + k.za * sigma, r: ss.opt.r + k.zr * sigma, sigma };
}

const step = (x: number) => clamp(Math.round(x), SETUP_MIN, SETUP_MAX);

/** Lo que monta el equipo si nadie dice otra cosa: lo más cerca de lo que cree. */
export function proposedSetup(ss: SetupState, team: TeamDef): Setup {
  const e = setupEstimate(ss, team);
  return { a: step(e.a), r: step(e.r) };
}

/** Reglaje de cada coche en una sesión: el del parque cerrado, el que eligió el jugador o el que propone el equipo. */
export function carSetup(ss: SetupState, id: number, team: TeamDef, player: boolean): Setup {
  return ss.locked?.[id] ?? (player ? ss.cars[id] : undefined) ?? proposedSetup(ss, team);
}

/** Lo que necesita la sesión: el óptimo y el reglaje de cada coche. */
export interface SessionSetup { opt: Setup; cars: Record<number, Setup> }
