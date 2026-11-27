// Moral de tus pilotos y rivalidades entre pilotos, de carrera en carrera (8.2 y 8.3). Se guardan en la temporada
// por nombre (así siguen aunque cambie el asiento o el año) y llegan a cada sesión por WeekendState (moral y rivals).
// - Moral (0 a 100, 60 lo normal): sube con buenos resultados, ganando al compañero y con órdenes a su favor; baja con
//   órdenes en contra, malos resultados y abandonos. Con ella cambia un poco su ritmo (session.ts, MORAL_PACE), si
//   obedece (disobeys) y si quiere renovar (wantsRenew). La rueda de prensa también la toca (applyPress).
// - Rivalidades (0 a 1): nacen de los toques y de los adelantamientos de ida y vuelta, y se apagan poco a poco. Se
//   defienden más y se tocan más entre ellos (session.ts, rivalOf); Lobato y la radio lo dicen.
import type { SeasonState } from "./season";
import type { ResultRow, TeamDef } from "./session";
import { carLevel } from "./development";
import { clamp } from "./rng";
import { hash } from "./caracter";

export const MORAL0 = 60;
export interface Rivalry { a: string; b: string; k: number }

export const moralOf = (s: Pick<SeasonState, "moral">, nombre: string) => s.moral?.[nombre] ?? MORAL0;

/** Cómo se dice la moral. */
export function moralLabel(m: number): { text: string; icon: string; cls: string } {
  if (m >= 78) return { text: "Muy motivado", icon: "😄", cls: "green" };
  if (m >= 58) return { text: "Contento", icon: "🙂", cls: "green" };
  if (m >= 42) return { text: "Normal", icon: "😐", cls: "" };
  if (m >= 25) return { text: "Molesto", icon: "😠", cls: "yellow" };
  return { text: "Enfadado", icon: "🤬", cls: "redt" };
}

export interface RaceOrder { carId: number; kind: "dejarPasar" | "box"; mate?: number; obeyed: boolean }
export interface MoraleChange { nombre: string; before: number; after: number; why: string[] }

/**
 * La moral de tus pilotos tras una carrera. mine: tus coches (id y nombre); expect: el puesto que se espera de este
 * coche (1 si es para ganar, 3 para el podio, 8 o 10 para puntuar). Vuelve poco a poco hacia lo normal.
 */
export function moraleAfterRace(s: SeasonState, rows: ResultRow[], mine: { id: number; nombre: string }[], orders: RaceOrder[], expect: number): MoraleChange[] {
  const moral = (s.moral ??= {});
  const pos = (id: number) => rows.findIndex((r) => r.id === id) + 1;
  const fin = (id: number) => rows.find((r) => r.id === id)?.status === "fin";
  const out: MoraleChange[] = [];
  for (const d of mine) {
    const before = moralOf(s, d.nombre), why: string[] = [];
    let delta = 0;
    const p = pos(d.id);
    if (!fin(d.id)) { delta -= 3; why.push("abandono"); }
    else if (p === 1) { delta += expect > 1 ? 14 : 8; why.push("victoria"); }
    else if (p <= 3) { delta += expect > 3 ? 9 : 5; why.push("podio"); }
    else if (p <= expect) { delta += 4; why.push("buen resultado"); }
    else if (p <= 10) { delta += 1; }
    else { delta -= 3; why.push("sin puntos"); }
    const mate = mine.find((x) => x.id !== d.id);
    if (mate && (fin(d.id) || fin(mate.id))) {
      const beat = fin(d.id) && (!fin(mate.id) || p < pos(mate.id));
      delta += beat ? 2 : -2;
      why.push(beat ? "por delante del compañero" : "por detrás del compañero");
    }
    for (const o of orders.filter((x) => x.kind === "dejarPasar")) {
      if (o.carId === d.id && o.obeyed) { delta -= 7; why.push("le hicieron dejar pasar al compañero"); }
      if (o.mate === d.id && o.obeyed) { delta += 3; why.push("el equipo le dio paso"); }
      if (o.mate === d.id && !o.obeyed) { delta -= 3; why.push("su compañero no le dejó pasar"); }
    }
    const after = clamp(before + (MORAL0 - before) * 0.08 + delta, 5, 100);
    moral[d.nombre] = Math.round(after * 10) / 10;
    out.push({ nombre: d.nombre, before, after: moral[d.nombre], why });
  }
  return out;
}

/** Lo que ha pasado entre cada pareja en una carrera (de Session.duels), ya con los nombres. */
export interface Duel { a: string; b: string; touch: number; passes: number }

/**
 * Rivalidades tras una carrera: las de antes se apagan un poco; un toque o pasarse y volver a pasarse las encienden.
 * Devuelve las que nacen ahora (para las noticias y la radio).
 */
export function rivalsAfterRace(s: SeasonState, duels: Duel[]): Rivalry[] {
  const list = (s.rivals ??= []).map((r) => ({ ...r, k: r.k * 0.8 }));
  const born: Rivalry[] = [];
  for (const d of duels) {
    // un toque basta; adelantarse hace falta muchas veces (en un tren o con el modo adelantamiento se pasan a menudo)
    const add = 0.4 * d.touch + 0.06 * Math.max(0, d.passes - 3);
    if (add <= 0) continue;
    let r = list.find((x) => (x.a === d.a && x.b === d.b) || (x.a === d.b && x.b === d.a));
    const was = r?.k ?? 0;
    if (!r) list.push((r = { a: d.a, b: d.b, k: 0 }));
    r.k = Math.min(1, r.k + add);
    if (was < 0.3 && r.k >= 0.3) born.push(r);
  }
  s.rivals = list.filter((r) => r.k >= 0.15).sort((x, y) => y.k - x.k).slice(0, 8).map((r) => ({ ...r, k: Math.round(r.k * 100) / 100 }));
  return born.filter((b) => s.rivals!.some((r) => r.a === b.a && r.b === b.b));
}

/** La rivalidad entre dos pilotos (0 a 1). */
export const rivalryOf = (s: Pick<SeasonState, "rivals">, a: string, b: string) =>
  s.rivals?.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))?.k ?? 0;

/** Para la sesión: moral de tus coches y rivalidades, con los ids de coche de este fin de semana. */
export function moodForWeekend(s: SeasonState, cars: { id: number; nombre: string; mine: boolean }[]): { moral: Record<number, number>; rivals: [number, number, number][] } {
  const moral: Record<number, number> = {};
  for (const c of cars) if (c.mine) moral[c.id] = moralOf(s, c.nombre);
  const id = new Map(cars.map((c) => [c.nombre, c.id]));
  const rivals: [number, number, number][] = [];
  for (const r of s.rivals ?? []) {
    const a = id.get(r.a), b = id.get(r.b);
    if (a !== undefined && b !== undefined) rivals.push([a, b, r.k]);
  }
  return { moral, rivals };
}

/** ¿Quiere renovar contigo? Con la moral muy baja (menos de 30), puede que no: cuanto más baja, más difícil. */
export function wantsRenew(s: SeasonState, nombre: string): boolean {
  const m = moralOf(s, nombre);
  if (m >= 30) return true;
  return (hash(`${nombre}|${s.year ?? 2026}|${s.seed}`) % 1000) / 1000 >= (30 - m) / 30;
}

/** Lo que cambia una respuesta en la rueda de prensa: moral de tus pilotos (por nombre) y rivalidad. */
export interface PressEffect { moral?: Record<string, number>; rival?: { a: string; b: string; k: number } }

export function applyPress(s: SeasonState, e: PressEffect) {
  for (const [n, d] of Object.entries(e.moral ?? {})) (s.moral ??= {})[n] = clamp(moralOf(s, n) + d, 5, 100);
  if (e.rival) {
    const list = (s.rivals ??= []);
    let r = list.find((x) => (x.a === e.rival!.a && x.b === e.rival!.b) || (x.a === e.rival!.b && x.b === e.rival!.a));
    if (!r && e.rival.k > 0) list.push((r = { a: e.rival.a, b: e.rival.b, k: 0 }));
    if (r) r.k = clamp(r.k + e.rival.k, 0, 1);
    s.rivals = list.filter((x) => x.k >= 0.15);
  }
}

/** El puesto de tu coche en la parrilla (1 el mejor), por su nivel (carLevel) al empezar la temporada. */
export function carRank(teams: TeamDef[], teamId: string): number {
  return teams.slice().sort((a, b) => carLevel(b) - carLevel(a)).findIndex((t) => t.id === teamId) + 1;
}

/** El puesto que se espera de tu coche en una carrera según lo bueno que es frente a la parrilla: los dos mejores,
 *  ganar; 3.º y 4.º, el podio; el 5.º, puntos holgados; el resto, puntuar. Para la moral (moraleAfterRace). */
export function expectedPos(rank: number): number {
  return rank <= 2 ? 1 : rank <= 4 ? 3 : rank <= 5 ? 8 : 10;
}
