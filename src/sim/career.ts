// Varias temporadas seguidas: lo que pasa entre una y la siguiente.
//
//  · Los pilotos cumplen años: mejoran hasta los ~28, se mantienen y empeoran desde los ~33; algunos se retiran.
//  · Contratos: cada piloto tiene contrato hasta un año. Al acabar, su equipo lo renueva si le sirve (según lo bueno que
//    es el coche, quiere un piloto mejor o peor) o lo deja libre. Los asientos libres se llenan de mejor a peor equipo
//    con los mejores pilotos que queden (libres, reservas y novatos que suben, algunos inventados).
//  · Coches: el del año siguiente sale de cómo acabó cada uno (con su desarrollo) con una regresión a la media: el que
//    acabó muy por delante conserva parte de la ventaja, no toda.
//  · Objetivos de la directiva: cumplirlos sube el presupuesto de desarrollo del año siguiente y fallarlos lo baja.
// Todo sale de la semilla de la temporada: la misma partida da el mismo mercado.
import { Rng, clamp } from "./rng";
import type { TeamDef, DriverDef } from "./session";

export const FIRST_YEAR = 2026;
/** Cuánto de la ventaja (o desventaja) del coche al acabar la temporada se conserva al año siguiente. */
export const CAR_CARRY = 0.65;
/** Presupuesto de desarrollo de más (o de menos) por cada objetivo cumplido (o fallado), en M. */
export const OBJ_BONUS = 6, OBJ_MALUS = 5;

/** Lo que se guarda de cada temporada terminada. */
export interface SeasonRecord {
  year: number;
  champion: { nombre: string; equipo: string; puntos: number };
  constructores: { equipo: string; puntos: number };
  /** Tu equipo: puesto en constructores y tus pilotos (puesto en el mundial). */
  mine: { equipo: string; pos: number; puntos: number; pilotos: { nombre: string; pos: number; puntos: number }[] };
  objetivos: { text: string; done: boolean }[];
  carreras: number;
}

/** Lo bueno que es un piloto (para renovar y fichar). */
export const rating = (d: DriverDef) => 0.55 * d.ritmo + 0.15 * d.regularidad + 0.1 * d.neumaticos + 0.1 * d.lluvia + 0.05 * d.ataque + 0.05 * d.defensa;
export const ageOf = (d: DriverDef, year: number) => year - (d.nacimiento ?? year - 28);

/** Cuánto cambia un piloto en un año según la edad que cumple (puntos de ritmo). */
export function ageStep(age: number): number {
  if (age <= 21) return 2.2;
  if (age <= 24) return 1.3;
  if (age <= 27) return 0.6;
  if (age <= 30) return 0.1;
  if (age <= 32) return -0.3;
  if (age <= 34) return -0.7;
  if (age <= 36) return -1.2;
  return -1.8;
}

/** Un año más: los jóvenes ganan ritmo y oficio; los mayores pierden ritmo pero no la cabeza. */
export function ageDriver(d: DriverDef, year: number, rng: Rng): DriverDef {
  const age = ageOf(d, year);
  const g = ageStep(age) + rng.gauss(0, 0.9);
  const exp = age <= 30 ? 0.4 : 0.1; // los años en la F1 enseñan a cuidar gomas y a ser regular
  const r = (x: number) => Math.round(clamp(x, 55, 99));
  return {
    ...d,
    ritmo: r(d.ritmo + g),
    regularidad: r(d.regularidad + 0.6 * g + exp),
    neumaticos: r(d.neumaticos + 0.5 * g + exp),
    lluvia: r(d.lluvia + 0.6 * g + 0.2),
    ataque: r(d.ataque + 0.7 * g),
    defensa: r(d.defensa + 0.5 * g + 0.2),
    salida: r(d.salida + 0.4 * g),
    agresividad: r(d.agresividad - 0.4 + rng.gauss(0, 0.6)),
  };
}

/** Probabilidad de que un piloto lo deje este año. */
export function retireChance(d: DriverDef, year: number): number {
  const age = ageOf(d, year);
  let p = age < 33 ? 0 : age < 35 ? 0.08 : age < 37 ? 0.2 : age < 39 ? 0.4 : age < 41 ? 0.6 : 0.85;
  if (age > 30 && rating(d) < 80) p += 0.15;
  // los que siguen arriba aguantan más
  if (age < 37 && rating(d) > 88) p *= 0.4;
  return Math.min(0.95, p);
}

/** Años de contrato que se firman: los novatos y los mayores, cortos; los buenos en su mejor edad, largos. */
function contractYears(d: DriverDef, year: number, rng: Rng): number {
  const age = ageOf(d, year);
  if (age >= 35) return 1;
  if (d.debut === undefined || year - d.debut <= 1) return rng.int(1, 2);
  return clamp(Math.round(1 + (rating(d) - 82) / 6 + rng.range(0, 1)), 1, 3);
}

/** Contratos de la primera temporada (no se conocen todos: estimación del juego), hasta qué año. */
export function initialContracts(teams: TeamDef[], year: number, seed: number): Record<string, number> {
  const rng = new Rng(seed * 7 + 2027);
  const out: Record<string, number> = {};
  for (const t of teams) for (const d of t.pilotos) out[d.abrev] = year + contractYears(d, year, rng) - 1;
  return out;
}

const FIRST = ["Mateo", "Lucas", "Noah", "Leo", "Hugo", "Oliver", "Theo", "Elias", "Marco", "Pablo", "Luca", "Tomás", "Rafael", "Kai", "Jonas", "Felix", "Nico", "Adrián", "Bruno", "Diego", "Emil", "Ivan", "Jules", "Rui"];
const LAST = ["Moreau", "Kowalski", "Lindqvist", "Ferreira", "Okafor", "Brandt", "Vidal", "Hartmann", "Sato", "Romano", "Novak", "Larsen", "Castillo", "Dubois", "Keller", "Marín", "Petrov", "Nakamura", "Ortega", "Fontaine", "Becker", "Rossi", "Haas", "Silva"];

/** Un novato inventado que sube de la F2 (nombre, número y valoración propios del juego). */
export function rookie(year: number, rng: Rng, used: Set<string>, numbers: Set<number>): DriverDef {
  let nombre = "", abrev = "";
  for (let k = 0; k < 50; k++) {
    nombre = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    abrev = nombre.split(" ")[1].normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    if (!used.has(abrev)) break;
  }
  used.add(abrev);
  let numero = rng.int(2, 99);
  while (numbers.has(numero)) numero = numero >= 99 ? 2 : numero + 1;
  numbers.add(numero);
  const base = rng.gauss(80.5, 1.6);
  const a = (k: number, sd = 1.5) => Math.round(clamp(base + k + rng.gauss(0, sd), 70, 90));
  return {
    nombre, abrev, numero,
    ritmo: a(0.5, 1), regularidad: a(-2), neumaticos: a(-2), lluvia: a(-2), ataque: a(0), defensa: a(-2), agresividad: a(-8, 4), salida: a(-1),
    nacimiento: year - rng.int(19, 21), debut: year,
  };
}

/** Lo bueno que es un coche (para ordenar la parrilla). */
export const carLevel = (t: TeamDef) => t.agarre + 0.4 * t.potencia - 0.3 * t.resistencia;

export interface OffSeasonInput {
  year: number; // la temporada que empieza
  seed: number;
  /** Los equipos de la IA tal como acabaron la temporada (con su desarrollo) y su base de la temporada que acaba. */
  final: TeamDef[];
  base: TeamDef[];
  /** Media de agarre a la que vuelven los coches (la de la primera temporada). */
  meanAgarre: number;
  /** Pilotos sin equipo (libres, reservas, novatos). */
  pool: DriverDef[];
  contracts: Record<string, number>;
  /** Tus pilotos y lo que decides con cada uno: seguir (renovar si acaba) o cambiarlo por uno del grupo de libres. */
  mine: { d: DriverDef; keep: boolean; sign?: string }[];
}

export interface OffSeasonOutput {
  base: TeamDef[]; // equipos de la IA para la temporada nueva
  mine: DriverDef[]; // tus pilotos para la temporada nueva
  pool: DriverDef[];
  contracts: Record<string, number>;
  news: string[];
}

/**
 * Lo que pasa entre una temporada y la siguiente en los equipos de la IA (y con tus decisiones sobre tus pilotos):
 * edad, retiradas, renovaciones, fichajes y novatos, y los coches del año siguiente.
 */
export function offSeason(inp: OffSeasonInput): OffSeasonOutput {
  const rng = new Rng((inp.seed * 31 + inp.year * 977) >>> 0);
  const y = inp.year;
  const news: string[] = [];
  const contracts = { ...inp.contracts };
  const used = new Set<string>([...inp.base.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...inp.pool.map((d) => d.abrev), ...inp.mine.map((m) => m.d.abrev)]);
  const numbers = new Set<number>([...inp.base.flatMap((t) => t.pilotos.map((d) => d.numero)), ...inp.mine.map((m) => m.d.numero)]);
  const age = (d: DriverDef) => ageDriver(d, y, rng);

  // 1. un año más para todos
  const teams = inp.base.map((t) => ({ t, seats: t.pilotos.map(age) as (DriverDef | null)[] }));
  let pool = inp.pool.map(age);
  const mineAged = inp.mine.map((m) => ({ ...m, d: age(m.d) }));

  // 2. retiradas (los de la IA; los tuyos, si se retiran, también: lo dice la noticia)
  for (const x of teams) x.seats = x.seats.map((d) => {
    if (d && rng.chance(retireChance(d, y))) { news.push(`🏁 ${d.nombre} se retira a los ${ageOf(d, y)} años (${x.t.nombre}).`); return null; }
    return d;
  });
  pool = pool.filter((d) => !(ageOf(d, y) > 36 || rng.chance(retireChance(d, y) * 0.8)));

  // 3. contratos que acaban: el equipo renueva si le sirve; si no, queda libre
  const order = teams.slice().sort((a, b) => carLevel(b.t) - carLevel(a.t));
  const want = (x: (typeof teams)[number]) => 88 - (order.indexOf(x) / Math.max(1, order.length - 1)) * 8;
  const released = new Map<string, string>(); // a quién ha soltado cada equipo (no lo vuelve a fichar)
  const free = new Set<string>(); // los que acababan contrato este año (pueden irse a un equipo mejor)
  for (const x of teams) x.seats = x.seats.map((d) => {
    if (!d || (contracts[d.abrev] ?? y) >= y) return d;
    free.add(d.abrev);
    if (rating(d) >= want(x) - 1.5 - rng.range(0, 2)) {
      contracts[d.abrev] = y + contractYears(d, y, rng) - 1;
      return d;
    }
    news.push(`🔚 ${x.t.nombre} no renueva a ${d.nombre}.`);
    released.set(d.abrev, x.t.id);
    pool.push(d);
    return null;
  });
  // traspasos: un equipo mejor con un asiento libre se lleva al mejor de los que acababan contrato en uno peor
  for (let i = 0; i < order.length; i++) {
    const x = order[i];
    for (let k = 0; k < x.seats.length; k++) {
      if (x.seats[k]) continue;
      const cands = order.slice(i + 1).flatMap((o) => o.seats.map((d, j) => ({ o, d, j }))).filter((c) => c.d && free.has(c.d.abrev) && rating(c.d) >= want(x) - 1);
      cands.sort((a, b) => rating(b.d!) - rating(a.d!));
      const c = cands[0];
      if (!c || !rng.chance(0.6)) continue;
      x.seats[k] = c.d;
      c.o.seats[c.j] = null;
      free.delete(c.d!.abrev);
      contracts[c.d!.abrev] = y + contractYears(c.d!, y, rng) - 1;
      news.push(`🔁 ${c.d!.nombre} deja ${c.o.t.nombre} y se va a ${x.t.nombre}.`);
    }
  }

  // 4. tus pilotos: los que sigues (con contrato renovado si acababa) y los que cambias por uno del grupo de libres
  const mine: DriverDef[] = [];
  for (const m of mineAged) {
    if (m.keep) {
      if ((contracts[m.d.abrev] ?? y) < y) contracts[m.d.abrev] = y + contractYears(m.d, y, rng) - 1;
      mine.push(m.d);
      continue;
    }
    pool.push(m.d);
    const pick = pool.find((d) => d.abrev === m.sign) ?? pool.slice().sort((a, b) => rating(b) - rating(a)).find((d) => d.abrev !== m.d.abrev)!;
    pool = pool.filter((d) => d !== pick);
    contracts[pick.abrev] = y + contractYears(pick, y, rng) - 1;
    news.push(`✍️ Fichas a ${pick.nombre} en lugar de ${m.d.nombre}.`);
    mine.push(pick);
  }

  // 5. asientos libres: los mejores equipos eligen primero entre los mejores que queden; si no hay nadie que valga,
  // sube un novato (de los reservas o uno nuevo de la F2)
  for (let k = 0; k < 2; k++) pool.push(rookie(y, rng, used, numbers));
  for (const x of order) {
    x.seats = x.seats.map((d) => {
      if (d) return d;
      pool.sort((a, b) => rating(b) - rating(a) + rng.gauss(0, 0.6));
      let pick = pool.find((p) => released.get(p.abrev) !== x.t.id);
      if (!pick || (rating(pick) < 79 && rng.chance(0.6))) {
        const r = rookie(y, rng, used, numbers);
        pool.push(r);
        pick = r;
      }
      pool = pool.filter((p) => p !== pick);
      contracts[pick.abrev] = y + contractYears(pick, y, rng) - 1;
      news.push(pick.debut === y ? `🆕 ${x.t.nombre} sube a ${pick.nombre}, novato de ${ageOf(pick, y)} años.` : `✍️ ${x.t.nombre} ficha a ${pick.nombre}.`);
      return pick;
    });
  }
  // el grupo de libres no crece sin fin: se quedan los 24 mejores
  pool = pool.sort((a, b) => rating(b) - rating(a)).slice(0, 24);

  // 6. coches: regresión a la media desde como acabó cada uno
  const finals = new Map(inp.final.map((t) => [t.id, t]));
  const endMean = inp.final.reduce((a, t) => a + t.agarre, 0) / Math.max(1, inp.final.length);
  const base = teams.map(({ t, seats }) => {
    const f = finals.get(t.id) ?? t;
    return { ...t, pilotos: seats as DriverDef[], agarre: Math.round((inp.meanAgarre + CAR_CARRY * (f.agarre - endMean) + rng.gauss(0, 0.3)) * 100) / 100 };
  });
  return { base, mine, pool, contracts, news };
}

/** Presupuesto de desarrollo del año siguiente según los objetivos: más por cada uno cumplido, menos por cada fallado. */
export function objectivesBonus(done: number, total: number): number {
  return done * OBJ_BONUS - (total - done) * OBJ_MALUS;
}
