// Unidades de potencia a lo largo de la temporada (modo «crear equipo»).
//
// Cada piloto tiene un cupo de unidades para el año. Cada una acumula kilómetros (más en el modo de
// motor alto, menos en el bajo) y con el uso pierde algo de potencia y tiene más probabilidad de
// romperse. Montar una nueva fuera del cupo cuesta puestos en la parrilla de la carrera; una que se
// rompe no se puede volver a usar. Escalado de la realidad: 4 unidades para 24 carreras → 2 para 9.
export const PU_LIFE_KM = 2800; // vida nominal (km a modo normal)
export const PU_QUOTA = 2;
export const PU_PENALTY = 10; // puestos por cada unidad fuera del cupo
/** Desgaste por kilómetro según el modo de motor (ahorro, normal, máximo). */
export const PU_WEAR = [0.75, 1, 1.6];

export interface PuUnit { km: number; broken?: boolean }
export interface PuState {
  units: PuUnit[];
  cur: number;
  base?: number; // unidades que tenía al empezar el fin de semana (las de después se han estrenado en él)
}

export const puLife = (km: number) => km / PU_LIFE_KM;
/** Potencia que se pierde (en las mismas unidades que `potencia`, %) según la vida gastada. */
export function puPowerLoss(u: number): number {
  return u <= 1 ? 1.5 * Math.pow(u, 1.5) : 1.5 + 2.5 * (u - 1);
}
/** Multiplicador de la probabilidad de avería de la unidad de potencia según la vida gastada (media ~1). */
export function puHazard(u: number): number {
  return 0.6 + 1.4 * Math.pow(Math.max(0, u), 3);
}
/** Probabilidad de avería de la unidad en una carrera de `laps` vueltas de `lapKm` km, a modo normal. */
export function puRaceRisk(km0: number, fiab: number, laps: number, lapKm: number): number {
  let p = 0;
  for (let l = 0; l < laps; l++) p += (fiab / 2600) * 0.5 * puHazard(puLife(km0 + l * lapKm));
  return 1 - Math.exp(-p);
}

export const newPu = (): PuState => ({ units: [{ km: 0 }], cur: 0 });
export const clonePu = (p: Record<number, PuState>): Record<number, PuState> => JSON.parse(JSON.stringify(p));

/** Puestos de sanción del fin de semana: unidades estrenadas en él más allá del cupo. */
export function puPenalty(p: PuState): number {
  let n = 0;
  for (let i = Math.max(PU_QUOTA, p.base ?? p.units.length); i < p.units.length; i++) n++;
  return n * PU_PENALTY;
}

/** La mejor unidad usada que sigue sana (la de menos kilómetros), o -1. */
export function bestSpare(p: PuState, maxLife = Infinity): number {
  let best = -1;
  p.units.forEach((u, i) => { if (!u.broken && puLife(u.km) < maxLife && (best < 0 || u.km < p.units[best].km)) best = i; });
  return best;
}

/** Monta una unidad: una existente (índice) o una nueva. Se puede deshacer mientras no haya rodado. */
export function fitUnit(p: PuState, choice: number | "new") {
  const base = p.base ?? p.units.length;
  // las nuevas de este fin de semana que aún no han rodado se devuelven
  const keep = (i: number) => i < base || p.units[i].km > 0 || p.units[i].broken;
  if (choice === "new") {
    const fresh = p.units.findIndex((u, i) => i >= base && u.km === 0 && !u.broken);
    if (fresh >= 0) { p.cur = fresh; return; }
    p.units.push({ km: 0 });
    p.cur = p.units.length - 1;
    return;
  }
  p.cur = choice;
  p.units = p.units.filter((_, i) => keep(i) || i === choice);
  if (p.cur >= p.units.length) p.cur = p.units.length - 1;
}

/**
 * Lo que monta el equipo al empezar el fin de semana (la IA, y la propuesta para los tuyos, que
 * puedes cambiar antes de Libres 1): sigue con la que lleva mientras aguante; si está gastada,
 * otra usada en buen estado; si no hay, una nueva dentro del cupo; fuera del cupo, solo si está
 * rota o pasada de vida.
 */
export function autoFit(p: PuState) {
  const cur = p.units[p.cur];
  const u = puLife(cur.km);
  if (!cur.broken && u < 0.82) return;
  const spare = bestSpare(p, 0.7);
  if (spare >= 0 && spare !== p.cur) { fitUnit(p, spare); return; }
  if (p.units.length < PU_QUOTA || cur.broken || u > 1.0) fitUnit(p, "new");
}
