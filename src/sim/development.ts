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
export interface DevState {
  budget: number;
  parts: DevPart[];
  /** Sistema de túnel de viento (temporadas desde noviembre de 2026): sin él, la aerodinámica va por piezas. */
  aero?: AeroPlan;
}

// ------------------------------------------------------------------ túnel de viento y CFD (aerodinámica)
//
// La aerodinámica no se compra: cada periodo (3 rondas en el calendario corto, 4 en el completo) el equipo tiene las
// horas de túnel y CFD que le da su cuota ATR, y las reparte entre cuatro proyectos (curva lenta, media y rápida y
// eficiencia en recta). Al acabar el periodo sale un paquete que llega a la carrera siguiente. Lo que rinde de verdad
// no se sabe: en los libres se mide (mejor cuantas más vueltas de prueba de piezas) y antes de la primera
// clasificación se decide si se monta. La fabricación se lleva una parte fija del presupuesto (AERO_RESERVE).

export type AeroBand = 0 | 1 | 2 | 3;
export const AERO_BANDS = [
  { name: "Curva lenta", short: "lenta", what: "tracción y frenada: Mónaco, Singapur, Hungría" },
  { name: "Curva media", short: "media", what: "la mayoría de circuitos" },
  { name: "Curva rápida", short: "rápida", what: "carga a alta velocidad: Silverstone, Suzuka, Spa" },
  { name: "Eficiencia en recta", short: "recta", what: "menos resistencia: Monza, Las Vegas, Bakú" },
];
/** Lo que ganan en una temporada entera los paquetes de un equipo medio con ATR medio (agarre en un circuito medio;
 *  lo mismo que DEV_RIVAL · 8, lo que da a los rivales). */
export const AERO_SEASON = 0.48;
/** Parte del presupuesto que se lleva fabricar los paquetes aerodinámicos. */
export const AERO_RESERVE = 0.4;
/** Paquetes que salen mal: rinden poco o incluso hacen el coche más lento. */
export const AERO_BAD = 0.12;
/** Eficiencia en recta: unidades de resistencia por unidad de agarre (iguales en un circuito medio; ver rendimiento.ts). */
export const DRAG_PER_GRIP = 2.8;

export type TestProgram = "validar" | "equilibrado" | "neumaticos";
export const TEST_PROGRAMS: Record<TestProgram, { name: string; what: string }> = {
  validar: { name: "Validar el paquete", what: "Las tandas largas del viernes se dedican a comparar piezas: sabrás bien lo que da, pero llegarás con menos datos de neumáticos." },
  equilibrado: { name: "Equilibrado", what: "Una tanda larga para el paquete y el resto, como siempre." },
  neumaticos: { name: "Priorizar neumáticos", what: "Casi no se prueba: lo que da el paquete se sabrá con mucho error." },
};

export interface AeroPkg {
  period: number;
  ready: number; // ronda (índice) en la que llega
  split: number[]; // reparto de las horas (4, suma 1)
  atr: number; // cuota ATR con la que se hizo
  expect: number; // lo que esperan tus ingenieros (agarre en un circuito medio)
  real: number; // lo que da de verdad (puede ser negativo)
  /** Libres: programa elegido, vueltas de prueba de piezas (y el resto de vueltas de libres), lo medido y su error. */
  programa?: TestProgram;
  laps?: number;
  otherLaps?: number;
  medido?: number;
  sigma?: number;
  /** ¿Se monta? Sin decidir, va en el coche (en los libres se prueba). */
  montar?: boolean;
}
export interface AeroPlan {
  /** Fabricación de los paquetes del año (M, fijo al empezar). */
  reserva: number;
  /** Reparto de las horas de cada periodo (el último que se tocó vale para los siguientes). */
  reparto: Record<number, number[]>;
  pkgs: AeroPkg[];
}

/** Rondas por periodo de túnel. */
export const aeroPeriodLen = (cal: number) => (cal <= 9 ? 3 : 4);
export const aeroPeriodOf = (round: number, cal: number) => Math.floor(round / aeroPeriodLen(cal));
/** Ronda (índice) en la que llega el paquete de un periodo (o null si cae fuera del calendario). */
export function aeroPkgRound(period: number, cal: number): number | null {
  const r = (period + 1) * aeroPeriodLen(cal);
  return r < cal ? r : null;
}
/** Paquetes que caben en la temporada. */
export const aeroPkgCount = (cal: number) => Math.max(0, Math.ceil(cal / aeroPeriodLen(cal)) - 1);
export const DEFAULT_SPLIT = [0.25, 0.25, 0.25, 0.25];
/** Reparto vigente en un periodo: el suyo o el último anterior. */
export function splitAt(a: AeroPlan, period: number): number[] {
  for (let p = period; p >= 0; p--) if (a.reparto[p]) return a.reparto[p];
  return DEFAULT_SPLIT;
}
export function newAeroPlan(budget: number): AeroPlan {
  return { reserva: Math.round(budget * AERO_RESERVE), reparto: {}, pkgs: [] };
}
/** Lo que se espera del paquete de un periodo (agarre en un circuito medio). devK: ritmo del director técnico (1 medio). */
export function aeroExpect(cal: number, atr: number, devK: number): number {
  const n = aeroPkgCount(cal);
  if (!n) return 0;
  const seasonScale = cal > 9 ? 1 : (cal - 1) / 8;
  return (AERO_SEASON * seasonScale * devK * atrMult(atr)) / n;
}
/** Hace el paquete de un periodo ya terminado (siempre el mismo para la misma semilla). */
export function makeAeroPkg(a: AeroPlan, period: number, cal: number, seed: number, atr: number, devK = 1, realK = devK): AeroPkg | null {
  const ready = aeroPkgRound(period, cal);
  if (ready === null) return null;
  const r = new Rng(((seed * 2654435761) ^ (period * 7919 + 0xa3c5)) >>> 0);
  const expect = aeroExpect(cal, atr, devK);
  const f = r.chance(AERO_BAD) ? r.range(-0.5, 0.4) : clamp(r.gauss(1.02, 0.15), 0.75, 1.35);
  return { period, ready, split: [...splitAt(a, period)], atr, expect, real: expect * f * (realK / Math.max(0.01, devK)) };
}
/** Error de la medida en libres (agarre): sin vueltas de prueba de piezas, ±0,11 s (lo que se intuye del resto de
 *  vueltas); con unas 16 (programa equilibrado), ±0,05 s; con ~40 (validar), ±0,035 s. */
export function aeroSigma(laps: number, otherLaps = 0): number {
  return 0.16 / Math.sqrt(1 + (laps + 0.02 * otherLaps) / 2) / 0.98;
}
/** Lo medido en libres (siempre lo mismo para el mismo paquete y las mismas vueltas). */
export function measurePkg(p: AeroPkg, seed: number): void {
  const sigma = aeroSigma(p.laps ?? 0, p.otherLaps ?? 0);
  const r = new Rng(((seed * 40503) ^ (p.period * 9973 + 0x51ed)) >>> 0);
  p.sigma = sigma;
  p.medido = p.real + r.gauss(0, sigma);
}
/**
 * Las horas del último periodo (que ya no dan paquete en la temporada) van al coche del año siguiente: lo que se
 * espera de un paquete con la cuota ATR de ese periodo y el ritmo del director técnico (agarre en un circuito medio).
 * Vale para todos los equipos; al pasar de año se compara con la media, así que lo que cuenta es la diferencia de
 * ATR (el que acabó peor trabaja más horas para el coche nuevo).
 */
export function nextYearAero(cal: number, atr: number, devK = 1): number {
  return aeroExpect(cal, atr, devK);
}
/** Ronda (índice) con la que empieza el último periodo de túnel (el que trabaja para el año siguiente). */
export const lastAeroPeriodRound = (cal: number) => (Math.ceil(cal / aeroPeriodLen(cal)) - 1) * aeroPeriodLen(cal);

/** Lo que aportan los paquetes montados hasta una ronda: agarre por tipo de curva y resistencia (negativa: menos). */
export function aeroGains(a: AeroPlan | undefined, round: number): { curvas: [number, number, number]; drag: number; total: number } {
  const curvas: [number, number, number] = [0, 0, 0];
  let drag = 0, total = 0;
  for (const p of a?.pkgs ?? []) {
    if (p.ready > round || p.montar === false) continue;
    // repartido entre los tipos de curva: concentrar da más donde se concentra (en un circuito medio, lo mismo)
    for (let i = 0; i < 3; i++) curvas[i] += 3 * p.real * p.split[i];
    drag -= p.real * p.split[3] * DRAG_PER_GRIP;
    total += p.real;
  }
  return { curvas, drag, total };
}

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
export const devLeft = (d: DevState) => Math.round((d.budget - devSpent(d) - (d.aero?.reserva ?? 0)) * 10) / 10;

/** Lo que se espera de una pieza (con el ritmo de desarrollo del equipo, 1 = medio). aeroK: el multiplicador ATR de
 *  túnel de viento y CFD del equipo cuando se pide (solo cuenta en aerodinámica). */
export const devExpect = (area: DevArea, size: DevSize, devK: number, aeroK = 1) => DEV_RATE[area] * DEV_SIZES[size].cost * devK * (area === "aero" ? aeroK : 1);

/** Pide una pieza en la ronda `round`. Lo que rinde de verdad sale de la semilla (una de cada cuatro decepciona).
 *  devK: ritmo de desarrollo del equipo según el informe (1 = medio); realK: el de verdad; aeroK: multiplicador ATR
 *  del equipo en esa ronda (las piezas aerodinámicas se diseñan con las horas de túnel y CFD que le tocan). */
export function orderPart(d: DevState, area: DevArea, size: DevSize, round: number, seed: number, devK = 1, realK = devK, aeroK = 1): DevPart | null {
  const sz = DEV_SIZES[size];
  if (devLeft(d) < sz.cost - 1e-9) return null;
  const id = d.parts.length ? Math.max(...d.parts.map((p) => p.id)) + 1 : 1;
  const r = new Rng(((seed * 2654435761) ^ (id * 40503 + 0x9e37)) >>> 0);
  const expect = devExpect(area, size, devK, aeroK);
  // con el sistema de túnel, las piezas salen mal tan a menudo como los paquetes (AERO_BAD); antes, una de cada cuatro
  const f = r.chance(d.aero ? AERO_BAD : 0.25) ? r.range(0.2, 0.7) : clamp(r.gauss(1.02, 0.15), 0.75, 1.35);
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
  const a = aeroGains(d?.aero, round);
  if (!g.aero && !g.motor && !g.fiab && !a.total) return t;
  const cv = t.curvas ?? [0, 0, 0];
  return {
    ...t, agarre: t.agarre + g.aero, potencia: t.potencia + g.motor, consumo: (t.consumo ?? 1) * (1 - g.fuel), fiabilidad: t.fiabilidad * (1 - g.fiab),
    ...(a.total ? { curvas: [cv[0] + a.curvas[0], cv[1] + a.curvas[1], cv[2] + a.curvas[2]] as [number, number, number], resistencia: t.resistencia + a.drag } : {}),
  };
}

// ------------------------------------------------------------------ desarrollo asimétrico de rivales (equipo real / ATR)

export interface RivalPackage {
  /** Lo midieron mal en libres y no lo montan. */
  pulled?: boolean;
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
 * Reparto ATR de una temporada, como el de la FIA: el orden (ids de equipo, del 1.º al último) con el que empieza,
 * que es la clasificación de constructores del año anterior (en la primera temporada, el nivel de los coches), y el
 * de la revisión de mitad de año (a 30 de junio en la real): la clasificación tras `mid.round` carreras, que vale
 * desde esa ronda (índice) hasta el final. Un equipo que no está en el orden cuenta como el último.
 */
export interface AtrPlan {
  start: string[];
  mid?: { round: number; order: string[] };
  /** Temporadas con el túnel de viento del jugador: los rivales también miden sus paquetes y no montan los malos
   *  (y salen mal menos a menudo: AERO_BAD). */
  v2?: boolean;
}

/** Ronda (índice) de la revisión de mitad de año: tras ~el 45 % del calendario (Austria, la 11.ª de 24); sin ella en
 *  calendarios de menos de 4 carreras. */
export const atrMidRound = (totalRounds: number) => (totalRounds >= 4 ? Math.round(totalRounds * 0.45) : null);

/** Orden de partida si no hay clasificación del año anterior: por nivel del coche (y los `last`, equipos nuevos, al final). */
export function atrCarOrder(base: TeamDef[], last: string[] = []): string[] {
  return [...base.slice().sort((a, b) => rivalCarLevel(b) - rivalCarLevel(a)).map((t) => t.id).filter((id) => !last.includes(id)), ...last];
}

/** Orden por puntos (los empates, como en el orden `prev`). */
export function atrOrderByPoints(points: Map<string, number>, prev: string[]): string[] {
  const ids = [...new Set([...prev, ...points.keys()])];
  const at = (id: string) => { const i = prev.indexOf(id); return i < 0 ? ids.length : i; };
  return ids.sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || at(a) - at(b));
}

/** Cuota ATR (%) de un equipo en una ronda (índice). */
export function atrAt(plan: AtrPlan, teamId: string, round: number): number {
  const order = plan.mid && round >= plan.mid.round ? plan.mid.order : plan.start;
  const i = order.indexOf(teamId);
  return atrPercent(i < 0 ? order.length - 1 : i, order.length);
}

/** Las piezas y paquetes aerodinámicos se diseñan con el túnel de unas rondas antes de llegar. */
const ATR_LAG = 2;

/**
 * Evolución asimétrica determinista de cada rival hasta la ronda `round` (de un calendario de `totalRounds` carreras):
 *  - Escala ATR según el reparto `plan` (clasificación del año anterior y revisión de mitad de año; sin él, el nivel
 *    de partida del coche): los de atrás recuperan algo más de terreno.
 *  - Factor de temporada propio de cada equipo (varianza entre temporadas) + 2–4 paquetes aerodinámicos discretos
 *    (con ~22 % de probabilidad de fallo de correlación y ~18 % de gran salto, igual que las piezas del jugador).
 *  - Evolución de unidad de potencia compartida por motorista (100 % para equipo oficial, 55 % para clientes) y
 *    ganancia gradual de fiabilidad (mayor en coches que arrancan más frágiles).
 * La media de la parrilla sigue rondando DEV_RIVAL · 8 (~0,48 de agarre en una temporada completa) para mantener
 * equilibrado el presupuesto de 40 M del jugador.
 */
export function rivalDevAt(base: TeamDef[], seed: number, round: number, totalRounds: number, techMult?: Map<string, number>, plan?: AtrPlan): Map<string, RivalDevAt> {
  const out = new Map<string, RivalDevAt>();
  const maxR = Math.max(0, totalRounds - 1);
  const rNow = clamp(Math.floor(round), 0, maxR);
  // sin reparto, el de la primera temporada: por nivel del coche y sin revisión
  const atrPlan: AtrPlan = plan ?? { start: atrCarOrder(base) };

  if (maxR <= 0) {
    for (const t of base) out.set(t.id, { teamId: t.id, team: t.nombre, atr: atrAt(atrPlan, t.id, 0), aero: 0, motor: 0, fuel: 0, fiab: 0, arrivals: [] });
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
      // ~0,15 de potencia en la temporada (repartida entre sus olas), menos en calendarios cortos
      const expect = (0.15 * seasonScale) / anchors.length;
      const f = rng.chance(0.2) ? rng.range(0.35, 0.65) : clamp(rng.gauss(1.0, 0.2), 0.7, 1.4);
      const gain = expect * f;
      waves.push({ round: wr, gain, expect, verdict: f < 0.7 ? "fallo" : f > 1.2 ? "salto" : "ok" });
    }
    puWaves.set(m, waves);
  }

  for (const t of base) {
    const atr = atrAt(atrPlan, t.id, rNow);
    // multiplicador ATR con el que se trabajó para lo que llega en la ronda r
    const kAt = (r: number) => atrMult(atrAt(atrPlan, t.id, Math.max(0, r - ATR_LAG)));
    const rng = new Rng(((seed * 2654435761) ^ hashId("dev:" + t.id)) >>> 0);
    const orgK = (t.estrategia - 80) * 0.002; // ligera ventaja organizativa (±3 %)
    const techK = clamp(techMult?.get(t.id) ?? 1, 0.35, 1.85); // en «crear equipo», peso del director técnico real
    const teamK = clamp(rng.gauss(1.0, 0.15) + orgK, 0.68, 1.35);
    // lo que ganaría en la temporada con un ATR medio (×1); cada parte se multiplica por el ATR de cuando se hizo
    const totalAeroExp = DEV_RIVAL * 8 * seasonScale * teamK * techK;

    // 20 % refinamiento continuo (puesta a punto, pequeños apéndices) + 80 % en paquetes discretos
    let aero = 0;
    for (let r = 1; r <= rNow; r++) aero += (totalAeroExp * 0.2 * kAt(r)) / maxR;
    // en un calendario de 2 carreras solo cabe un paquete (los dos acababan en una ronda que no existe)
    const nPkg = maxR >= 12 ? 4 : maxR >= 6 ? 3 : maxR >= 2 ? 2 : 1;
    const weights = nPkg === 4 ? [0.24, 0.30, 0.28, 0.18] : nPkg === 3 ? [0.32, 0.40, 0.28] : nPkg === 2 ? [0.52, 0.48] : [1];
    const arrivals: RivalPackage[] = [];
    let prevR = 0;

    for (let i = 0; i < nPkg; i++) {
      const lo = Math.max(prevR + 1, Math.round(((i + 0.55) / (nPkg + 0.35)) * maxR));
      const hi = Math.max(lo, Math.min(maxR, Math.round(((i + 1.1) / (nPkg + 0.35)) * maxR)));
      const pkgR = rng.int(lo, hi);
      prevR = pkgR;
      const expect = totalAeroExp * 0.8 * weights[i] * kAt(pkgR);
      let f = atrPlan.v2
        ? (rng.chance(AERO_BAD) ? rng.range(-0.5, 0.4) : clamp(rng.gauss(1.03, 0.18), 0.72, 1.42))
        : (rng.chance(0.22) ? rng.range(0.25, 0.65) : clamp(rng.gauss(1.03, 0.18), 0.72, 1.42));
      let pulled = false;
      if (atrPlan.v2) {
        // lo miden en sus libres (con su propio azar, para no mover el resto) y no montan lo que sale negativo
        const mr = new Rng(((seed * 2654435761) ^ hashId(`val:${t.id}:${i}`)) >>> 0);
        const sigma = clamp(0.09 - (t.estrategia - 80) * 0.003, 0.03, 0.12) / 0.98;
        if (expect * f + mr.gauss(0, sigma) <= 0) { f = 0; pulled = true; }
      }
      const real = expect * f;
      const verdict: RivalPackage["verdict"] = pulled || f < 0.7 ? "fallo" : f > 1.2 ? "salto" : "ok";
      if (pkgR <= rNow) aero += real;
      if (pkgR === rNow) arrivals.push({ teamId: t.id, team: t.nombre, round: pkgR, area: "aero", expect, real, verdict, pulled });
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
export function applyGridDev(base: TeamDef[], seed: number, round: number, totalRounds: number, playerTeamId: string, playerDev?: DevState, plan?: AtrPlan): TeamDef[] {
  const rivals = rivalDevAt(base, seed, round, totalRounds, undefined, plan);
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
