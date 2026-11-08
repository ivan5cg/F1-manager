// Modelo de neumáticos por eje (delantero / trasero).
// Cada eje tiene temperatura de carcasa (lenta) y de superficie (rápida), desgaste de banda,
// graining (reversible) y ampollas (permanentes). La adherencia sale de la ventana de
// temperatura, el desgaste (con "precipicio"), el agua en pista y esos daños.
import { clamp, interp } from "./rng";

export type Compound = "S" | "M" | "H" | "I" | "W";
export const DRY: Compound[] = ["S", "M", "H"];

export interface CompoundSpec {
  name: string;
  color: string;
  base: number; // adherencia relativa en seco y a temperatura óptima
  opt: number; // temperatura de carcasa óptima (°C)
  window: number; // semiancho de la ventana "buena" (°C)
  slope: number; // pérdida de adherencia por unidad de desgaste antes del precipicio
  wear: number; // desgaste por vuelta a energía media y ritmo normal
  cliff: number; // desgaste a partir del cual cae la adherencia rápido
  water: readonly (readonly [number, number])[]; // agua (mm) -> factor
  cooling: number; // cuánto le enfría el agua (los de lluvia están hechos para ello)
}

const SLICK_WATER = [[0, 1], [0.08, 0.955], [0.2, 0.875], [0.4, 0.77], [0.7, 0.66], [1.2, 0.54], [2, 0.42], [3, 0.35]] as const;

export const COMPOUNDS: Record<Compound, CompoundSpec> = {
  S: { name: "Blando", color: "#e8452c", base: 1.0, opt: 95, window: 12, slope: 0.03, wear: 0.034, cliff: 0.72, water: SLICK_WATER, cooling: 1 },
  M: { name: "Medio", color: "#f2d23c", base: 0.9955, opt: 103, window: 13, slope: 0.025, wear: 0.022, cliff: 0.74, water: SLICK_WATER, cooling: 1 },
  H: { name: "Duro", color: "#eeeeee", base: 0.9915, opt: 111, window: 14, slope: 0.021, wear: 0.015, cliff: 0.76, water: SLICK_WATER, cooling: 1 },
  I: { name: "Intermedio", color: "#3cc35a", base: 1.0, opt: 88, window: 16, slope: 0.035, wear: 0.03, cliff: 0.75,
    water: [[0, 0.925], [0.1, 0.92], [0.25, 0.9], [0.5, 0.855], [1, 0.765], [2, 0.61], [3, 0.5]], cooling: 0.55 },
  W: { name: "Lluvia", color: "#3a7be8", base: 1.0, opt: 80, window: 18, slope: 0.03, wear: 0.026, cliff: 0.78,
    water: [[0, 0.865], [0.25, 0.845], [0.5, 0.82], [1, 0.785], [2, 0.72], [3, 0.66]], cooling: 0.35 },
};

export interface Axle {
  tSurf: number;
  tBulk: number;
  wear: number; // 0 nuevo .. 1 lona
  grain: number; // 0..1
  blister: number; // 0..1
}

export interface TyreSet {
  c: Compound;
  F: Axle;
  R: Axle;
  laps: number; // vueltas de uso
  flatSpot: number; // 0..1 vibraciones por bloqueo
  punctured: boolean;
}

/** Lo que el fin de semana esconde y nadie sabe con exactitud. */
export interface HiddenTyre {
  wearMult: Record<Compound, number>; // desgaste real / esperado por compuesto
  thermalOffset: number; // °C: el asfalto calienta más o menos de lo previsto
  grainProne: number; // propensión al graining
}

export function newSet(c: Compound, laps = 0, blanket = 70): TyreSet {
  const ax = (): Axle => ({ tSurf: blanket, tBulk: blanket, wear: 0, grain: 0, blister: 0 });
  return { c, F: ax(), R: ax(), laps, flatSpot: 0, punctured: false };
}

/** Factor de adherencia de un eje (sin agua). */
export function axleGrip(c: Compound, a: Axle): number {
  const sp = COMPOUNDS[c];
  const d = a.tBulk - sp.opt;
  // fuera de la ventana cae de forma cuadrática; frío penaliza más que caliente
  const fT = d < 0 ? 1 - 0.075 * Math.min(2.2, Math.pow(-d / 30, 2)) : 1 - 0.05 * Math.min(2.5, Math.pow(d / 30, 2));
  // superficie demasiado caliente: el neumático desliza
  const ds = a.tSurf - (sp.opt + 25);
  const fS = ds > 0 ? 1 - Math.min(0.03, ds * 0.0012) : 1;
  let fW = 1 - sp.slope * a.wear;
  if (a.wear > sp.cliff) fW -= 0.2 * Math.pow((a.wear - sp.cliff) / (1 - sp.cliff), 1.8);
  return sp.base * fT * fS * Math.max(0.6, fW) * (1 - 0.03 * a.grain) * (1 - 0.045 * a.blister);
}

export function waterGrip(c: Compound, water: number): number {
  return interp(COMPOUNDS[c].water, water);
}

/** Adherencia del coche: manda el eje peor, pero no del todo. */
export function setGrip(t: TyreSet, water: number): number {
  const f = axleGrip(t.c, t.F), r = axleGrip(t.c, t.R);
  const g = 0.5 * Math.min(f, r) + 0.25 * (f + r);
  const punct = t.punctured ? 0.55 : 1;
  return g * waterGrip(t.c, water) * (1 - 0.006 * t.flatSpot) * punct;
}

export interface TyreEnv {
  trackT: number;
  airT: number;
  water: number; // mm en el minisector
  eF: number; // energía instantánea relativa (1 = media de la vuelta)
  eR: number;
  push: number; // multiplicador de energía por ritmo
  carWear: number; // multiplicador del coche/piloto
  abrasiveness: number;
  speed: number; // m/s
}

/** Avanza el estado de un juego de neumáticos dt segundos. lapRef: duración de vuelta de referencia. */
export function updateSet(t: TyreSet, env: TyreEnv, dt: number, lapRef: number, hidden: HiddenTyre): void {
  const sp = COMPOUNDS[t.c];
  const wet = Math.min(1, env.water / 0.8);
  for (const axle of ["F", "R"] as const) {
    const a = t[axle];
    const e = (axle === "F" ? env.eF : env.eR) * env.push;
    // carcasa: equilibrio entre asfalto, aire y energía disipada
    const eq = 0.45 * env.trackT + 0.15 * env.airT + 79 * Math.min(e, 2.2) + hidden.thermalOffset - 34 * wet * sp.cooling + (axle === "F" ? 11 : -2); // los frenos calientan la llanta delantera
    a.tBulk += ((eq - a.tBulk) * dt) / 32;
    const surfEq = a.tBulk + 30 * (e - 1) + 6 * (env.push - 1) * 10 - 12 * wet * sp.cooling;
    a.tSurf += ((surfEq - a.tSurf) * dt) / 2.5;

    // desgaste
    const over = a.tBulk - (sp.opt + sp.window * 0.5);
    let wMult = over > 0 ? Math.exp(over / 22) : 1;
    if (a.tBulk < sp.opt - sp.window) wMult *= 1.15; // frío: desliza y se come la banda
    let waterW = 1 - 0.65 * wet;
    if (t.c === "I") waterW *= 1 + 2.8 * Math.max(0, 0.3 - env.water) / 0.3;
    if (t.c === "W") waterW *= 1 + 4.5 * Math.max(0, 0.7 - env.water) / 0.7;
    const axleShare = axle === "F" ? env.eF : env.eR;
    const rate = (sp.wear * hidden.wearMult[t.c] * env.abrasiveness * env.carWear * axleShare * Math.pow(env.push, 1.6) * wMult * waterW) / lapRef;
    a.wear = clamp(a.wear + rate * dt * (1 + a.blister * 0.8), 0, 1);

    // graining: carcasa fría + superficie castigada; se limpia al entrar en ventana
    const coldness = sp.opt - 8 - a.tBulk;
    if (coldness > 0 && e > 0.9 && wet < 0.3) a.grain = Math.min(1, a.grain + dt * 0.0014 * hidden.grainProne * (coldness / 10) * e * (axle === "F" ? 1.2 : 0.9));
    else if (a.tBulk > sp.opt - 4) a.grain = Math.max(0, a.grain - dt * 0.004);
    // ampollas: carcasa muy por encima de la ventana
    const hot = a.tBulk - (sp.opt + sp.window + 6);
    if (hot > 0) a.blister = Math.min(1, a.blister + dt * 0.0012 * (hot / 5));
  }
}

/** Desgaste esperado por vuelta (lo que estimaría un equipo sin factores ocultos). */
export function expectedWearPerLap(c: Compound, abrasiveness: number, eAxleMax: number, carWear: number): number {
  return COMPOUNDS[c].wear * abrasiveness * eAxleMax * carWear;
}
