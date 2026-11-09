// Modo «crear equipo»: mercado de pilotos, jefes de equipo, directores técnicos y motoristas, y la
// parrilla que sale de lo que ficha el jugador.
//
// Cada elemento tiene un valor publicado (el informe del ojeador) y uno real que cada temporada se
// aparta de él según lo desconocido que sea (inc). El precio sale de la fama y del contrato, no del
// valor real: hay gangas y fichajes que decepcionan. El valor real es el mismo para todo el mundo:
// si un motor rinde menos de lo publicado, rinde menos para todos sus clientes.
import { Rng, clamp } from "./rng";
import type { TeamDef, DriverDef } from "./session";

export type Role = "titular" | "reserva" | "libre";
const ATTRS = ["ritmo", "regularidad", "neumaticos", "lluvia", "ataque", "defensa", "agresividad", "salida"] as const;
type Attr = (typeof ATTRS)[number];

export interface MarketDriver extends Partial<Record<Attr, number>> {
  abrev: string; nombre?: string; numero?: number;
  equipo: string | null; rol: Role; salario: number; inc: number; nota?: string;
}
export interface MarketBoss { nombre: string; equipo: string | null; estrategia: number; meteo: number; boxes: number; salario: number; inc: number; nota?: string }
export interface MarketTech { nombre: string; equipo: string | null; diseno: number; resistencia: number; desgaste: number; desarrollo: number; fiabilidad: number; salario: number; inc: number; nota?: string }
export interface MarketEngine { id: string; nombre: string; potencia: number; fiabilidad: number; precio: number; inc: number }
export interface Market { techo: number; pilotos: MarketDriver[]; jefes: MarketBoss[]; tecnicos: MarketTech[]; motores: MarketEngine[] }

/** Lo que ficha el jugador. */
export interface CustomTeam { nombre: string; color: string; pilotos: string[]; jefe: string; tecnico: string; motor: string }

export const PLAYER_TEAM_ID = "propio";
/** Un equipo nuevo empieza con menos infraestructura: coche, mecánicos y fiabilidad. */
export const NEW_TEAM = { agarre: -0.6, boxes: 0.1, fiabilidad: 1.1 };
/** Sustituto interino de un jefe o director técnico que se ha ido. */
const INTERIM_BOSS = { estrategia: -6, meteo: -4, boxes: 0.08 };
const INTERIM_DEV = 0.03;

const ENGINE_OF: Record<string, string> = { Mercedes: "mercedes", Ferrari: "ferrari", "Red Bull Ford": "redbullford", Honda: "honda", Audi: "audi" };
export const engineIdOf = (t: TeamDef) => ENGINE_OF[t.motor] ?? "mercedes";

// ------------------------------------------------------------------ precios
/** Salario más lo que cuesta romper su contrato (titular: medio salario; reserva: 1 M; libre: nada). */
export function clauseOf(x: { equipo: string | null; salario: number; rol?: Role }): number {
  if (!x.equipo) return 0;
  return x.rol === "reserva" ? 1 : Math.round(x.salario * 0.5 * 10) / 10;
}
export const priceOf = (x: { equipo: string | null; salario: number; rol?: Role }) => x.salario + clauseOf(x);

export function costOf(m: Market, spec: Partial<CustomTeam>): number {
  let c = 0;
  for (const a of spec.pilotos ?? []) { const d = m.pilotos.find((p) => p.abrev === a); if (d) c += priceOf(d); }
  const j = m.jefes.find((x) => x.nombre === spec.jefe); if (j) c += priceOf(j);
  const t = m.tecnicos.find((x) => x.nombre === spec.tecnico); if (t) c += priceOf(t);
  const e = m.motores.find((x) => x.id === spec.motor); if (e) c += e.precio;
  return Math.round(c * 10) / 10;
}

/** Ritmo de desarrollo según lo que queda del techo de gasto para evoluciones (×0,7 sin nada; ×1,3 con 50 M o más). */
export function devBudgetMult(m: Market, spec: CustomTeam): number {
  const left = Math.max(0, m.techo - costOf(m, spec));
  return 0.7 + 0.6 * Math.min(1, left / 50);
}

// ------------------------------------------------------------------ valores
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Normales estándar fijas para una temporada y un elemento. */
function z(seed: number, key: string, n: number): number[] {
  const r = new Rng((seed * 2654435761 ^ hash(key)) >>> 0);
  return Array.from({ length: n }, () => clamp(r.gauss(), -2.5, 2.5));
}

/** Dispersión del valor real de cada atributo de un piloto con incertidumbre 1. */
const DRIVER_SD: Record<Attr, number> = { ritmo: 1.3, regularidad: 1.2, neumaticos: 1.2, lluvia: 1.5, ataque: 1.0, defensa: 1.0, agresividad: 2, salida: 1.2 };

export function publicDriver(m: Market, base: TeamDef[], abrev: string): DriverDef {
  for (const t of base) { const d = t.pilotos.find((p) => p.abrev === abrev); if (d) return { ...d }; }
  const x = m.pilotos.find((p) => p.abrev === abrev)!;
  const d: Record<string, unknown> = { nombre: x.nombre, abrev: x.abrev, numero: x.numero };
  for (const a of ATTRS) d[a] = x[a] ?? 75;
  return d as unknown as DriverDef;
}

export function trueDriver(m: Market, base: TeamDef[], abrev: string, seed: number): DriverDef {
  const d = publicDriver(m, base, abrev);
  const inc = m.pilotos.find((p) => p.abrev === abrev)?.inc ?? 1;
  const g = z(seed, "p:" + abrev, ATTRS.length);
  ATTRS.forEach((a, i) => {
    // el ritmo arrastra un poco la regularidad y el ataque (un piloto mejor de lo que se creía lo es en todo)
    const k = a === "regularidad" || a === "ataque" ? 0.5 * g[0] + 0.87 * g[i] : g[i];
    (d as unknown as Record<string, number>)[a] = Math.round(clamp(d[a] + k * DRIVER_SD[a] * inc, 55, 99));
  });
  return d;
}

export function trueBoss(b: MarketBoss, seed: number): MarketBoss {
  const g = z(seed, "j:" + b.nombre, 3);
  return { ...b, estrategia: clamp(b.estrategia + g[0] * 3 * b.inc, 50, 99), meteo: clamp(b.meteo + g[1] * 3 * b.inc, 50, 99), boxes: clamp(b.boxes + g[2] * 0.04 * b.inc, 2.0, 3.0) };
}

export function trueTech(t: MarketTech, seed: number): MarketTech {
  const g = z(seed, "t:" + t.nombre, 5);
  return {
    ...t,
    diseno: t.diseno + g[0] * 0.25 * t.inc,
    resistencia: t.resistencia + g[1] * 0.08 * t.inc,
    desgaste: t.desgaste * Math.exp(g[2] * 0.01 * t.inc),
    desarrollo: Math.max(0, t.desarrollo * Math.exp(g[3] * 0.15 * t.inc)),
    fiabilidad: t.fiabilidad * Math.exp(g[4] * 0.05 * t.inc),
  };
}

export function trueEngine(e: MarketEngine, seed: number): MarketEngine {
  const g = z(seed, "m:" + e.id, 2);
  return { ...e, potencia: e.potencia + g[0] * 0.2 * e.inc, fiabilidad: e.fiabilidad * Math.exp(g[1] * 0.06 * e.inc) };
}

/** Desarrollo medio de los directores técnicos de la parrilla: la parrilla en conjunto no se acelera. */
export function devMean(m: Market): number {
  const t = m.tecnicos.filter((x) => x.equipo);
  return t.reduce((a, x) => a + x.desarrollo, 0) / t.length;
}

// ------------------------------------------------------------------ parrilla
export interface GridChange { team: string; out: string; in: string; what: "piloto" | "jefe" | "tecnico" }

/**
 * Parrilla de una temporada del modo «crear equipo» tras `round` carreras: los 11 equipos con sus
 * sustitutos y sus valores reales, y el tuyo al final. `changes` cuenta quién ha tenido que cubrir a quién.
 */
export function buildGrid(base: TeamDef[], m: Market, spec: CustomTeam, seed: number, round: number): { teams: TeamDef[]; changes: GridChange[] } {
  const signed = new Set(spec.pilotos);
  const used = new Set(spec.pilotos);
  for (const t of base) for (const p of t.pilotos) if (!signed.has(p.abrev)) used.add(p.abrev);
  const free = m.pilotos.filter((p) => p.rol === "libre").sort((a, b) => (b.ritmo ?? 0) - (a.ritmo ?? 0));
  const dm = devMean(m);
  const changes: GridChange[] = [];
  const engines = new Map(m.motores.map((e) => [e.id, { pub: e, real: trueEngine(e, seed) }]));
  const teams: TeamDef[] = base.map((t) => {
    const pilotos = t.pilotos.map((p) => {
      if (!signed.has(p.abrev)) return trueDriver(m, base, p.abrev, seed);
      // su reserva; si no tiene o también lo has fichado, el mejor piloto libre que quede
      const sub = m.pilotos.find((x) => x.equipo === t.id && x.rol === "reserva" && !used.has(x.abrev)) ?? free.find((x) => !used.has(x.abrev));
      if (!sub) return trueDriver(m, base, p.abrev, seed);
      used.add(sub.abrev);
      changes.push({ team: t.nombre, out: p.nombre, in: sub.nombre ?? sub.abrev, what: "piloto" });
      return trueDriver(m, base, sub.abrev, seed);
    });
    const boss = m.jefes.find((x) => x.equipo === t.id);
    const tech = m.tecnicos.find((x) => x.equipo === t.id);
    const bossGone = !!boss && boss.nombre === spec.jefe;
    const techGone = !!tech && tech.nombre === spec.tecnico;
    if (bossGone) changes.push({ team: t.nombre, out: boss!.nombre, in: "un interino", what: "jefe" });
    if (techGone) changes.push({ team: t.nombre, out: tech!.nombre, in: "un interino", what: "tecnico" });
    const dev = techGone || !tech ? INTERIM_DEV : trueTech(tech, seed).desarrollo;
    const eng = engines.get(engineIdOf(t))!;
    return {
      ...t,
      pilotos,
      // el coche ya estaba hecho: perder al director técnico frena el desarrollo, no el coche de salida
      agarre: t.agarre + (dev - dm) * round,
      potencia: t.potencia + (eng.real.potencia - eng.pub.potencia),
      fiabilidad: t.fiabilidad * (eng.real.fiabilidad / eng.pub.fiabilidad),
      estrategia: t.estrategia + (bossGone ? INTERIM_BOSS.estrategia : 0),
      meteo: t.meteo + (bossGone ? INTERIM_BOSS.meteo : 0),
      boxes: t.boxes + (bossGone ? INTERIM_BOSS.boxes : 0),
    };
  });
  const jm = m.jefes.find((x) => x.nombre === spec.jefe), tm = m.tecnicos.find((x) => x.nombre === spec.tecnico), em = engines.get(spec.motor);
  // equipo a medio fichar (pantalla de fichajes): solo interesan los cambios en los demás
  if (!jm || !tm || !em) return { teams, changes };
  const j = trueBoss(jm, seed);
  const td = trueTech(tm, seed);
  const e = em.real;
  teams.push({
    id: PLAYER_TEAM_ID, nombre: spec.nombre, motor: e.nombre, color: spec.color,
    agarre: td.diseno + NEW_TEAM.agarre + (td.desarrollo * devBudgetMult(m, spec) - dm) * round,
    potencia: e.potencia,
    resistencia: td.resistencia,
    desgaste: td.desgaste,
    boxes: j.boxes + NEW_TEAM.boxes,
    fiabilidad: e.fiabilidad * td.fiabilidad * NEW_TEAM.fiabilidad,
    estrategia: Math.round(j.estrategia),
    meteo: Math.round(j.meteo),
    pilotos: spec.pilotos.map((a) => trueDriver(m, base, a, seed)),
  });
  return { teams, changes };
}

// ------------------------------------------------------------------ informes
/** Horquilla [mín, máx] del informe: lo publicado ± 1,5 desviaciones; con lo que se ha visto, se estrecha hacia lo real. */
export function band(pub: number, real: number, sd: number, seen: number): [number, number] {
  const k = 1 / (1 + 0.4 * seen);
  const c = real + (pub - real) * k;
  return [c - 1.5 * sd * k, c + 1.5 * sd * k];
}
export const DRIVER_BAND_SD = DRIVER_SD;
