// Modelo de neumáticos por eje (delantero / trasero).
// Cada eje tiene temperatura de carcasa (lenta) y de superficie (rápida), desgaste de banda,
// graining (reversible) y ampollas (permanentes). La adherencia sale de la ventana de
// temperatura, el desgaste (con "precipicio"), el agua en pista y esos daños.
//
// Graining: la goma de la superficie, demasiado fría (rígida) para lo que se le pide, desliza en vez
// de agarrar y se rasga en rollitos que se quedan pegados encima de la banda. Hace falta frío Y
// deslizamiento: pista verde (sin goma), aire sucio que hace deslizar el tren delantero, apretar con
// el neumático aún frío. Se limpia sola cuando la banda trabaja caliente y con carga (el asfalto se
// lleva los rollitos), pero esa goma ya no vuelve: cuesta banda.
// Ampollas: la banda se calienta por dentro más deprisa de lo que puede soltar el calor (la goma
// aísla) y los volátiles del compuesto forman bolsas de gas que revientan y arrancan trozos. Mandan la
// temperatura de la banda (superficie más carcasa) en los picos de energía, y una carcasa ya caliente
// que no deja escapar ese calor. Son permanentes y aceleran el desgaste.
import { clamp, interp } from "./rng";

export type Compound = "S" | "M" | "H" | "I" | "W";
export const DRY: Compound[] = ["S", "M", "H"];
export const ALL: Compound[] = ["S", "M", "H", "I", "W"];

export interface CompoundSpec {
  name: string;
  short: string;
  color: string;
  base: number; // adherencia relativa en seco y a temperatura óptima
  opt: number; // temperatura de carcasa óptima (°C)
  window: number; // semiancho de la ventana "buena" (°C)
  slope: number; // pérdida de adherencia por unidad de desgaste antes del precipicio
  wear: number; // desgaste por vuelta a energía media y ritmo normal
  cliff: number; // desgaste a partir del cual cae la adherencia rápido
  water: readonly (readonly [number, number])[]; // agua (mm) -> factor
  cooling: number; // cuánto le enfría el agua
  grainK: number; // tendencia de la goma a rasgarse en frío (los compuestos blandos, más)
  blisterK: number; // tendencia a las ampollas (banda gruesa y de compuesto duro: retiene más el calor)
}

// Agarre según el agua en la trazada (mm). Calibrado con las referencias de Pirelli: el
// intermedio pasa a ser mejor cuando la vuelta con slicks llega al 110-112 % de la de seco, y un
// intermedio en pista seca pierde ~6 %; con mucha agua el intermedio va un ~20 % más lento
// (pole en mojado de Interlagos 2024, 1:23.405, frente a 1:08.899 en seco el mismo fin de semana).
const SLICK_WATER = [[0, 1], [0.05, 0.945], [0.1, 0.895], [0.2, 0.825], [0.3, 0.765], [0.5, 0.665], [0.8, 0.565], [1.2, 0.48], [2, 0.39], [3, 0.33]] as const;

// ~2,5 % de agarre entre compuestos = ~1 s por vuelta en un circuito como Silverstone
export const COMPOUNDS: Record<Compound, CompoundSpec> = {
  S: { name: "Blando", short: "S", color: "#E8452C", base: 1.0, opt: 95, window: 12, slope: 0.06, wear: 0.036, cliff: 0.72, water: SLICK_WATER, cooling: 1, grainK: 1.35, blisterK: 0.8 },
  M: { name: "Medio", short: "M", color: "#F2D23C", base: 0.973, opt: 103, window: 13, slope: 0.036, wear: 0.0175, cliff: 0.74, water: SLICK_WATER, cooling: 1, grainK: 1.0, blisterK: 1.0 },
  H: { name: "Duro", short: "H", color: "#F2F2F2", base: 0.955, opt: 111, window: 14, slope: 0.026, wear: 0.0118, cliff: 0.76, water: SLICK_WATER, cooling: 1, grainK: 0.75, blisterK: 1.25 },
  I: { name: "Intermedio", short: "I", color: "#3CC35A", base: 1.0, opt: 88, window: 16, slope: 0.035, wear: 0.03, cliff: 0.75,
    water: [[0, 0.875], [0.1, 0.835], [0.2, 0.8], [0.35, 0.77], [0.5, 0.748], [0.8, 0.718], [1.2, 0.675], [1.8, 0.605], [2.5, 0.535], [3, 0.485]], cooling: 0.55, grainK: 1.1, blisterK: 1.1 },
  W: { name: "Lluvia", short: "W", color: "#3A7BE8", base: 1.0, opt: 80, window: 18, slope: 0.03, wear: 0.026, cliff: 0.78,
    water: [[0, 0.79], [0.3, 0.755], [0.6, 0.725], [1, 0.695], [1.5, 0.667], [2, 0.638], [2.5, 0.605], [3, 0.575]], cooling: 0.35, grainK: 0.7, blisterK: 1.2 },
};

export interface Axle {
  tSurf: number;
  tBulk: number;
  wear: number; // 0 nuevo .. 1 lona
  grain: number;
  blister: number;
}

export interface TyreSet {
  id: string; // p. ej. "S3"
  c: Compound;
  F: Axle;
  R: Axle;
  laps: number; // vueltas de uso acumuladas en el fin de semana
  flatSpot: number;
  punctured: boolean;
  returned?: boolean; // devuelto a Pirelli (ya no se puede usar)
  /** Lo que vieron los mecánicos la última vez que se quitó (delantero, trasero). */
  insp?: { grain: [number, number]; blister: [number, number] };
}

/** Lo que el fin de semana esconde y nadie sabe con exactitud. */
export interface HiddenTyre {
  wearMult: Record<Compound, number>;
  thermalOffset: number;
  grainProne: number;
}

export function newSet(c: Compound, id: string = c, blanket = 70): TyreSet {
  const ax = (): Axle => ({ tSurf: blanket, tBulk: blanket, wear: 0, grain: 0, blister: 0 });
  return { id, c, F: ax(), R: ax(), laps: 0, flatSpot: 0, punctured: false };
}

/** Juegos de un piloto para el fin de semana. */
export function allocation(sprint: boolean): TyreSet[] {
  const n: Record<Compound, number> = sprint ? { S: 6, M: 4, H: 2, I: 6, W: 3 } : { S: 8, M: 3, H: 2, I: 4, W: 3 };
  const sets: TyreSet[] = [];
  for (const c of ALL) for (let i = 1; i <= n[c]; i++) sets.push(newSet(c, `${c}${i}`));
  return sets;
}

export const setWear = (t: TyreSet) => Math.max(t.F.wear, t.R.wear);
export const isNew = (t: TyreSet) => t.laps === 0;

/** Mantas: al montar un juego (nuevo o usado) sale a 70 °C. La goma rasgada de un juego usado sigue
 * ahí, aunque al enfriarse y volver a calentarse parte de los rollitos se suelta. */
export function warmBlankets(t: TyreSet) {
  for (const a of [t.F, t.R]) { a.tBulk = 70; a.tSurf = 70; a.grain *= 0.6; }
}

/** Factor de adherencia de un eje (sin agua). */
export function axleGrip(c: Compound, a: Axle): number {
  const sp = COMPOUNDS[c];
  const d = a.tBulk - sp.opt;
  // por encima de la óptima, la mitad de la ventana no cuesta agarre: si no, en un asfalto exigente
  // apretar con blandos los calentaba tanto que iban más lentos que a ritmo normal
  const dh = Math.max(0, d - sp.window * 0.5);
  const fT = d < 0 ? 1 - 0.075 * Math.min(2.2, Math.pow(-d / 30, 2)) : 1 - 0.05 * Math.min(2.5, Math.pow(dh / 30, 2));
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

/** Mejor agarre posible con esa agua (el del compuesto adecuado), para medir si se va con el neumático equivocado. */
export function bestWaterGrip(water: number): number {
  return Math.max(waterGrip("S", water), waterGrip("I", water), waterGrip("W", water));
}

/** Agarre estimado de un juego nuevo a su temperatura de equilibrio con esa agua y ese asfalto. */
export function steadyGrip(c: Compound, water: number, trackT = 22): number {
  const sp = COMPOUNDS[c];
  const wet = Math.min(1, water / 0.8);
  const t = newSet(c);
  // energía media por eje en una vuelta típica: delante 0,9, detrás 1,1
  for (const [a, side, e] of [[t.F, 11, 0.9], [t.R, -2, 1.1]] as const) {
    a.tBulk = 0.45 * trackT + 0.15 * (trackT - 5) + 79 * e + side - 34 * wet * sp.cooling;
    a.tSurf = a.tBulk - 12 * wet * sp.cooling;
  }
  return setGrip(t, water);
}

function crossover(a: Compound, b: Compound): number {
  let lo = 0, hi = 3;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (steadyGrip(a, m) > steadyGrip(b, m)) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** Agua (mm) a partir de la cual compensa el intermedio frente al slick (si) y el de lluvia frente al intermedio (iw). */
export const WET = { si: crossover("M", "I"), iw: crossover("I", "W") };

export interface TyreEnv {
  trackT: number;
  airT: number;
  water: number;
  eF: number; // energía instantánea relativa (1 = media de la vuelta)
  eR: number;
  push: number;
  carWear: number;
  abrasiveness: number;
  /** Goma depositada en la trazada: 0 = pista verde (viernes, tras la lluvia), 1 = muy engomada. */
  rubber?: number;
  /** Deslizamiento extra por eje que no sale de la energía de la curva (aire sucio, sobre todo delante). */
  slideF?: number;
  slideR?: number;
  /** Cómo trata el piloto los neumáticos: 1 = media; menos, más fino; más, más brusco. */
  rough?: number;
}

/** Cómo trata los neumáticos un piloto (atributo «neumáticos»): 1 = media; uno fino (95) desliza un ~20 % menos. */
export const driverRough = (skill: number) => clamp(1 + (85 - skill) / 50, 0.7, 1.5);

/** Temperatura de la banda: la goma que toca el suelo, a medio camino entre la carcasa y la superficie. */
export const treadT = (a: Axle) => a.tBulk + 0.5 * (a.tSurf - a.tBulk);
/** Temperatura de banda a partir de la cual empiezan a formarse ampollas. */
export const blisterT = (c: Compound) => COMPOUNDS[c].opt + COMPOUNDS[c].window + 22;
/** Por debajo de esta temperatura de banda la goma está rígida y, si desliza, se rasga (graining). */
export const grainT = (c: Compound) => COMPOUNDS[c].opt - 12;

// constantes del daño (por segundo): calibradas para que con el neumático claramente frío y en
// pista verde el graining se vea en 2-4 vueltas, y que las ampollas pidan varias vueltas de abuso
const GRAIN_GEN = 0.0026;
const GRAIN_CLEAN = 1 / 190; // con la banda caliente y carga media, se limpia en ~3 min
const GRAIN_TEAR = 0.05; // banda que se pierde por cada unidad de graining que se forma
const BLISTER_GEN = 0.0009;

/** Avanza el estado de un juego dt segundos. lapRef: duración de vuelta de referencia. */
export function updateSet(t: TyreSet, env: TyreEnv, dt: number, lapRef: number, hidden: HiddenTyre): void {
  const sp = COMPOUNDS[t.c];
  const wet = Math.min(1, env.water / 0.8);
  // en pista verde la goma no "engancha" en el asfalto: el neumático desliza más y se rasga más
  const green = 1 + 1.6 * (1 - clamp(env.rubber ?? 1, 0, 1));
  // con agua la banda desliza sobre una película que la lubrica: no se rasga
  const dry = Math.max(0, 1 - env.water / 0.25);
  const rough = env.rough ?? 1;
  for (let k = 0; k < 2; k++) {
    const front = k === 0;
    const a = front ? t.F : t.R;
    const eLoc = front ? env.eF : env.eR;
    const slideX = (front ? env.slideF : env.slideR) ?? 0;
    // apretar calienta, pero menos que proporcional (el piloto gestiona la temperatura)
    const e = eLoc * (1 + 0.45 * (env.push - 1));
    const eq = 0.45 * env.trackT + 0.15 * env.airT + 79 * Math.min(e, 2.2) + hidden.thermalOffset - 34 * wet * sp.cooling + (front ? 11 : -2);
    a.tBulk += ((eq - a.tBulk) * dt) / 32;
    // deslizar calienta la superficie (el aire sucio hace patinar el delantero y lo recalienta)
    const surfEq = a.tBulk + 30 * (eLoc - 1) + 35 * (env.push - 1) + 12 * slideX - 12 * wet * sp.cooling;
    a.tSurf += ((surfEq - a.tSurf) * dt) / 2.5;
    const tTread = treadT(a);

    const over = a.tBulk - (sp.opt + sp.window * 0.5);
    // el calor gasta más goma, pero sin dispararse: con /22 un blando no aguantaba 6 vueltas en un asfalto exigente
    let wMult = over > 0 ? Math.exp(over / 30) : 1;
    if (a.tBulk < sp.opt - sp.window) wMult *= 1.15;
    let waterW = 1 - 0.65 * wet;
    if (t.c === "I") waterW *= 1 + (2.8 * Math.max(0, 0.3 - env.water)) / 0.3;
    if (t.c === "W") waterW *= 1 + (4.5 * Math.max(0, 0.7 - env.water)) / 0.7;
    const axleShare = front ? env.eF : env.eR;
    const rate = (sp.wear * hidden.wearMult[t.c] * env.abrasiveness * env.carWear * axleShare * Math.pow(env.push, 1.6) * wMult * waterW) / lapRef;
    // con ampollas se arrancan trozos; con graining la banda patina sobre los rollitos y se gasta más
    a.wear = clamp(a.wear + rate * dt * (1 + 0.8 * a.blister + 0.3 * a.grain), 0, 1);

    // --- graining: frío × deslizamiento. El deslizamiento crece con la energía de la curva y, mucho,
    // con apretar (al cuadrado: atacar con el neumático frío es lo que más lo rasga)
    // por debajo de ~15 °C del umbral ya no rasga más: lo que limita entonces es cuánto desliza
    const cold = Math.min(1.5, (grainT(t.c) - tTread) / 10);
    let gen = 0;
    if (cold > 0 && dry > 0) {
      const slip = Math.max(0, eLoc - 0.7) * env.push * env.push + 1.5 * slideX;
      gen = GRAIN_GEN * sp.grainK * hidden.grainProne * green * rough * dry * Math.pow(cold, 1.4) * slip * (front ? 1.15 : 0.9);
      a.wear = Math.min(1, a.wear + gen * dt * GRAIN_TEAR);
    }
    // limpieza: hace falta banda caliente (goma blanda que se deja arrastrar) y carga; el asfalto
    // abrasivo la limpia antes. Es proporcional a lo que hay (los rollitos se van arrancando)
    const warm = clamp((tTread - (sp.opt - 18)) / 15, 0, 1.5);
    const clean = a.grain * GRAIN_CLEAN * warm * env.abrasiveness * Math.min(1.6, Math.max(0.2, eLoc));
    a.grain = clamp(a.grain + (gen - clean) * dt, 0, 1);

    // --- ampollas: banda por encima de su temperatura crítica (pico de energía en curva, bloqueos)
    // con la carcasa ya caliente, que no deja salir ese calor hacia dentro
    const hot = tTread - blisterT(t.c);
    const soak = clamp((a.tBulk - (sp.opt + sp.window * 0.5)) / sp.window, 0, 2);
    if (hot > 0 && soak > 0)
      a.blister = Math.min(1, a.blister + dt * BLISTER_GEN * sp.blisterK * Math.pow(hot / 8, 1.5) * soak * Math.sqrt(rough));
  }
}
