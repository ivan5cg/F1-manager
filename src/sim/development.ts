// Desarrollo del coche del jugador (los dos modos): un presupuesto por temporada que se gasta en piezas de
// aerodinámica (agarre), motor y eficiencia (potencia y consumo, hasta donde deje el motor: el de un cliente da
// menos margen) y fiabilidad (menos averías). Cada pieza tarda 2 o 3 rondas en llegar y puede no rendir lo que se
// esperaba: se decide con su propio generador a partir de la semilla de la temporada (siempre igual para la misma).
//
// Los rivales: en el modo «crear equipo» siguen como siempre (su director técnico, en market.ts); con un equipo
// real todos mejoran a un ritmo fijo (DEV_RIVAL por ronda), el mismo que da de media el presupuesto del jugador si
// lo gasta todo en aerodinámica.
import { Rng, clamp } from "./rng";
import type { TeamDef } from "./session";

export type DevArea = "aero" | "motor" | "fiab";
export type DevSize = 1 | 2 | 3;
export interface DevPart {
  id: number;
  area: DevArea;
  size: DevSize;
  cost: number; // M
  ordered: number; // ronda (índice) en la que se pidió
  ready: number; // primera ronda (índice) en la que va en el coche
  expect: number; // lo que se espera (unidades del área)
  real: number; // lo que rinde de verdad (no se ve hasta que llega)
}
export interface DevState { budget: number; parts: DevPart[] }

export const DEV_AREAS: Record<DevArea, { name: string; what: string; unit: string }> = {
  aero: { name: "Aerodinámica", what: "más agarre en curva", unit: "agarre" },
  motor: { name: "Motor y eficiencia", what: "más potencia y menos consumo", unit: "potencia" },
  fiab: { name: "Fiabilidad", what: "menos averías", unit: "averías" },
};
/** Tamaño: coste (M), rondas que tarda y nombre. */
export const DEV_SIZES: Record<DevSize, { cost: number; delay: number; name: string }> = {
  1: { cost: 4, delay: 2, name: "Pequeña" },
  2: { cost: 8, delay: 2, name: "Mediana" },
  3: { cost: 14, delay: 3, name: "Grande" },
};
/** Lo que da cada M gastado con un director técnico medio (0,06 de desarrollo). */
export const DEV_RATE: Record<DevArea, number> = { aero: 0.012, motor: 0.02, fiab: 0.008 };
/** Rivales con equipo real: agarre que ganan por ronda. */
export const DEV_RIVAL = 0.06;
/** Tope de mejora del motor en la temporada: un fabricante puede más que un cliente. */
export const MOTOR_CAP = { works: 0.8, client: 0.3 };
/** Consumo: lo que baja por cada punto de potencia ganado (fracción), con su tope. */
const FUEL_PER_POWER = 0.06, FUEL_CAP = 0.05;
/** Fiabilidad: como mucho, las averías bajan a la mitad. */
const FIAB_CAP = 0.5;

const WORKS: Record<string, string> = { mercedes: "Mercedes", ferrari: "Ferrari", redbull: "Red Bull Ford", audi: "Audi", astonmartin: "Honda" };
/** ¿Hace su propio motor? (los clientes tienen menos margen para mejorarlo) */
export const isWorks = (t: TeamDef) => WORKS[t.id] === t.motor;

/** Presupuesto de la temporada (M): fijo con un equipo real; en «crear equipo», según lo que quedó del techo. */
export function devBudget(leftOfCap: number | null): number {
  return leftOfCap === null ? 40 : Math.round(25 + 0.5 * clamp(leftOfCap, 0, 50));
}
export const newDev = (leftOfCap: number | null): DevState => ({ budget: devBudget(leftOfCap), parts: [] });
export const devSpent = (d: DevState) => d.parts.reduce((a, p) => a + p.cost, 0);
export const devLeft = (d: DevState) => Math.round((d.budget - devSpent(d)) * 10) / 10;

/** Lo que se espera de una pieza (con el ritmo de desarrollo del equipo, 1 = medio). */
export const devExpect = (area: DevArea, size: DevSize, devK: number) => DEV_RATE[area] * DEV_SIZES[size].cost * devK;

/** Pide una pieza en la ronda `round`. Lo que rinde de verdad sale de la semilla (una de cada cuatro decepciona).
 *  devK: ritmo de desarrollo del equipo según el informe (1 = medio); realK: el de verdad. */
export function orderPart(d: DevState, area: DevArea, size: DevSize, round: number, seed: number, devK = 1, realK = devK): DevPart | null {
  const sz = DEV_SIZES[size];
  if (devLeft(d) < sz.cost - 1e-9) return null;
  const id = d.parts.length ? Math.max(...d.parts.map((p) => p.id)) + 1 : 1;
  const r = new Rng(((seed * 2654435761) ^ (id * 40503 + 0x9e37)) >>> 0);
  const expect = devExpect(area, size, devK);
  const f = r.chance(0.25) ? r.range(0.2, 0.7) : clamp(r.gauss(1.02, 0.15), 0.75, 1.35);
  // el director técnico puede ser mejor o peor de lo que decía su informe (realK frente a devK)
  const p: DevPart = { id, area, size, cost: sz.cost, ordered: round, ready: round + sz.delay, expect, real: expect * f * (realK / Math.max(0.01, devK)) };
  d.parts.push(p);
  return p;
}

/** Lo que llevan las piezas que ya han llegado en la ronda `round`, por área (con los topes). */
export function devGains(d: DevState | undefined, round: number, works: boolean): { aero: number; motor: number; fuel: number; fiab: number } {
  const sum = (a: DevArea) => (d?.parts ?? []).filter((p) => p.area === a && p.ready <= round).reduce((x, p) => x + p.real, 0);
  const motor = Math.min(sum("motor"), works ? MOTOR_CAP.works : MOTOR_CAP.client);
  return { aero: sum("aero"), motor, fuel: Math.min(FUEL_CAP, motor * FUEL_PER_POWER), fiab: Math.min(FIAB_CAP, sum("fiab")) };
}

/** El equipo del jugador con sus piezas montadas. */
export function applyDev(t: TeamDef, d: DevState | undefined, round: number): TeamDef {
  const g = devGains(d, round, isWorks(t));
  if (!g.aero && !g.motor && !g.fiab) return t;
  return { ...t, agarre: t.agarre + g.aero, potencia: t.potencia + g.motor, consumo: (t.consumo ?? 1) * (1 - g.fuel), fiabilidad: t.fiabilidad * (1 - g.fiab) };
}
