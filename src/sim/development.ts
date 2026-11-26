// Desarrollo del coche del jugador (los dos modos): un presupuesto por temporada que se gasta en piezas de
// aerodinámica (agarre), motor y eficiencia (potencia y consumo, hasta donde deje el motor: el de un cliente da
// menos margen) y fiabilidad (menos averías). Cada pieza tarda 2 o 3 rondas en llegar y puede no rendir lo que se
// esperaba: se decide con su propio generador a partir de la semilla de la temporada (siempre igual para la misma).
//
// Los rivales: en el modo «crear equipo» siguen como siempre (su director técnico, en market.ts); con un equipo
// real cada rival sigue una curva asimétrica determinista (escala FIA ATR de túnel/CFD según su nivel inicial,
// paquetes discretos con aciertos y fallos, evolución de unidad de potencia por motorista y mejora de fiabilidad).
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

// ------------------------------------------------------------------ desarrollo asimétrico de rivales (equipo real / ATR)

export interface RivalPackage {
  teamId: string;
  team: string;
  round: number; // ronda (índice >= 1) en la que se estrena
  area: "aero" | "motor";
  expect: number;
  real: number;
  verdict: "salto" | "ok" | "fallo";
}

export interface RivalDevAt {
  teamId: string;
  team: string;
  atr: number; // % de túnel de viento / CFD FIA (70..120)
  aero: number; // agarre ganado hasta la ronda
  motor: number; // potencia ganada hasta la ronda
  fuel: number; // reducción fraccional de consumo
  fiab: number; // reducción fraccional de averías
  arrivals: RivalPackage[]; // paquetes que llegan exactamente en esta ronda
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Escala FIA ATR (túnel de viento y CFD): 70 % para el 1.º hasta 120 % para el último. */
export function atrPercent(rank: number, total: number): number {
  return Math.round(70 + (50 * clamp(rank, 0, Math.max(0, total - 1))) / Math.max(1, total - 1));
}

/** Multiplicador aerodinámico derivado del ATR (P1 ≈ 0,84×, media ≈ 1,01×, último ≈ 1,18×). */
export const atrMult = (atr: number) => 0.84 + 0.34 * clamp((atr - 70) / 50, 0, 1);

const rivalCarLevel = (t: TeamDef) => t.agarre + 0.4 * t.potencia - 0.3 * t.resistencia;

/**
 * Evolución asimétrica determinista de cada rival hasta la ronda `round` (de un calendario de `totalRounds` carreras):
 *  - Escala ATR según el nivel de partida del coche (los de atrás recuperan algo más de terreno).
 *  - Factor de temporada propio de cada equipo (varianza entre temporadas) + 2–4 paquetes aerodinámicos discretos
 *    (con ~22 % de probabilidad de fallo de correlación y ~18 % de gran salto, igual que las piezas del jugador).
 *  - Evolución de unidad de potencia compartida por motorista (100 % para equipo oficial, 55 % para clientes) y
 *    ganancia gradual de fiabilidad (mayor en coches que arrancan más frágiles).
 * La media de la parrilla sigue rondando DEV_RIVAL · 8 (~0,48 de agarre en una temporada completa) para mantener
 * equilibrado el presupuesto de 40 M del jugador.
 */
export function rivalDevAt(base: TeamDef[], seed: number, round: number, totalRounds: number, techMult?: Map<string, number>): Map<string, RivalDevAt> {
  const out = new Map<string, RivalDevAt>();
  const n = base.length;
  const maxR = Math.max(0, totalRounds - 1);
  const rNow = clamp(Math.floor(round), 0, maxR);
  // Orden inicial por nivel del coche para asignar el ATR de la temporada
  const ranked = base.slice().sort((a, b) => rivalCarLevel(b) - rivalCarLevel(a));
  const rankOf = new Map(ranked.map((t, i) => [t.id, i]));

  if (maxR <= 0) {
    for (const t of base) out.set(t.id, { teamId: t.id, team: t.nombre, atr: atrPercent(rankOf.get(t.id) ?? 0, n), aero: 0, motor: 0, fuel: 0, fiab: 0, arrivals: [] });
    return out;
  }

  const seasonScale = totalRounds > 9 ? 1 : maxR / 8;
  const prog = rNow / maxR;

  // Evoluciones de unidad de potencia por motorista (2 olas en calendarios de >= 6 carreras, 1 en cortos)
  const puWaves = new Map<string, { round: number; gain: number; expect: number; verdict: "salto" | "ok" | "fallo" }[]>();
  const motors = [...new Set(base.map((t) => t.motor))];
  for (const m of motors) {
    const rng = new Rng(((seed * 2654435761) ^ hashId("pu:" + m)) >>> 0);
    const waves: { round: number; gain: number; expect: number; verdict: "salto" | "ok" | "fallo" }[] = [];
    const anchors = maxR >= 6 ? [0.35, 0.72] : [0.5];
    for (const a of anchors) {
      const wr = clamp(Math.round(a * maxR + rng.range(-0.08, 0.08) * maxR), 1, maxR);
      const expect = (0.075 * seasonScale) / (anchors.length === 1 ? 1 : 1);
      const f = rng.chance(0.2) ? rng.range(0.35, 0.65) : clamp(rng.gauss(1.0, 0.2), 0.7, 1.4);
      const gain = expect * f;
      waves.push({ round: wr, gain, expect, verdict: f < 0.7 ? "fallo" : f > 1.2 ? "salto" : "ok" });
    }
    puWaves.set(m, waves);
  }

  for (const t of base) {
    const rank = rankOf.get(t.id) ?? Math.floor(n / 2);
    const atr = atrPercent(rank, n);
    const rng = new Rng(((seed * 2654435761) ^ hashId("dev:" + t.id)) >>> 0);
    const orgK = (t.estrategia - 80) * 0.002; // ligera ventaja organizativa (±3 %)
    const techK = clamp(techMult?.get(t.id) ?? 1, 0.35, 1.85); // en «crear equipo», peso del director técnico real
    const teamK = clamp(rng.gauss(1.0, 0.15) + orgK, 0.68, 1.35);
    const totalAeroExp = DEV_RIVAL * 8 * seasonScale * atrMult(atr) * teamK * techK;

    // 20 % refinamiento continuo (puesta a punto, pequeños apéndices) + 80 % en paquetes discretos
    let aero = rNow > 0 ? totalAeroExp * 0.2 * prog : 0;
    const nPkg = maxR >= 12 ? 4 : maxR >= 6 ? 3 : 2;
    const weights = nPkg === 4 ? [0.24, 0.30, 0.28, 0.18] : nPkg === 3 ? [0.32, 0.40, 0.28] : [0.52, 0.48];
    const arrivals: RivalPackage[] = [];
    let prevR = 0;

    for (let i = 0; i < nPkg; i++) {
      const lo = Math.max(prevR + 1, Math.round(((i + 0.55) / (nPkg + 0.35)) * maxR));
      const hi = Math.max(lo, Math.min(maxR, Math.round(((i + 1.1) / (nPkg + 0.35)) * maxR)));
      const pkgR = rng.int(lo, hi);
      prevR = pkgR;
      const expect = totalAeroExp * 0.8 * weights[i];
      const f = rng.chance(0.22) ? rng.range(0.25, 0.65) : clamp(rng.gauss(1.03, 0.18), 0.72, 1.42);
      const real = expect * f;
      const verdict: RivalPackage["verdict"] = f < 0.7 ? "fallo" : f > 1.2 ? "salto" : "ok";
      if (pkgR <= rNow) aero += real;
      if (pkgR === rNow) arrivals.push({ teamId: t.id, team: t.nombre, round: pkgR, area: "aero", expect, real, verdict });
    }

    // Unidad de potencia del motorista (oficial 100 %, cliente 55 %)
    const works = isWorks(t);
    const puMult = works ? 1 : 0.55;
    let motor = 0;
    for (const w of puWaves.get(t.motor) ?? []) {
      const gain = w.gain * puMult;
      if (w.round <= rNow) motor += gain;
      if (w.round === rNow && works) {
        arrivals.push({ teamId: t.id, team: t.nombre, round: w.round, area: "motor", expect: w.expect, real: gain, verdict: w.verdict });
      }
    }
    motor = Math.min(motor, works ? MOTOR_CAP.works : MOTOR_CAP.client);
    const fuel = Math.min(FUEL_CAP, motor * FUEL_PER_POWER);

    // Maduración de fiabilidad a lo largo del año (más margen si el coche empezó frágil)
    const fiabMax = clamp(0.06 + Math.max(0, t.fiabilidad - 0.95) * 0.25 + rng.range(-0.02, 0.04), 0.04, 0.22) * seasonScale;
    const fiab = Math.min(FIAB_CAP, fiabMax * prog);

    out.set(t.id, { teamId: t.id, team: t.nombre, atr, aero, motor, fuel, fiab, arrivals });
  }
  return out;
}

/** Aplica el desarrollo del jugador (`applyDev`) y las curvas asimétricas ATR de los rivales para una ronda. */
export function applyGridDev(base: TeamDef[], seed: number, round: number, totalRounds: number, playerTeamId: string, playerDev?: DevState): TeamDef[] {
  const rivals = rivalDevAt(base, seed, round, totalRounds);
  return base.map((t) => {
    if (t.id === playerTeamId) return applyDev(t, playerDev, round);
    const g = rivals.get(t.id);
    if (!g || (!g.aero && !g.motor && !g.fiab)) return t;
    return {
      ...t,
      agarre: t.agarre + g.aero,
      potencia: t.potencia + g.motor,
      consumo: (t.consumo ?? 1) * (1 - g.fuel),
      fiabilidad: t.fiabilidad * (1 - g.fiab),
    };
  });
}
