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
import type { SeatSwap } from "./season";

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

/** Salario (M por temporada) que pide un piloto según lo bueno que es: de ~0,5 M un novato a ~55 M el mejor. */
export function salaryFor(d: DriverDef): number {
  const r = rating(d);
  return r <= 78 ? 0.5 : Math.round((0.5 + 55 * Math.pow((r - 78) / 17, 2.4)) * 10) / 10;
}

/** Lo que cuesta romper un contrato en vigor: la mitad de lo que le queda por cobrar (como mínimo, 1 M). */
export function clauseFor(salary: number, until: number, year: number): number {
  const left = until - year + 1; // temporadas que le quedan contando la que empieza
  return left <= 0 ? 0 : Math.max(1, Math.round(left * salary * 0.5 * 10) / 10);
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

/** Un joven que llega a la F2 desde la F3 (inventado): aún le falta para la F1, pero con los años puede llegar. */
export function f2Newcomer(year: number, rng: Rng, used: Set<string>, numbers: Set<number>): DriverDef {
  const d = rookie(year, rng, used, numbers);
  const k = rng.range(2.5, 5.5);
  const r = (x: number) => Math.round(clamp(x - k, 66, 86));
  return { ...d, ritmo: r(d.ritmo), regularidad: r(d.regularidad), neumaticos: r(d.neumaticos), lluvia: r(d.lluvia), ataque: r(d.ataque), defensa: r(d.defensa), salida: r(d.salida), nacimiento: year - rng.int(18, 19), debut: undefined, serie: "F2" };
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
  /** Salario de cada piloto con contrato (M por temporada). */
  salaries: Record<string, number>;
  /** Tus pilotos y lo que decides con cada uno: seguir (renovar si acaba) o cambiarlo por otro: uno libre o de otro
   *  equipo (si tiene contrato, pagando su cláusula). Romper el contrato del tuyo también se paga. */
  mine: { d: DriverDef; keep: boolean; sign?: string }[];
}

export interface OffSeasonOutput {
  base: TeamDef[]; // equipos de la IA para la temporada nueva
  mine: DriverDef[]; // tus pilotos para la temporada nueva
  pool: DriverDef[];
  contracts: Record<string, number>;
  salaries: Record<string, number>;
  news: string[];
  /** Lo que has pagado en cláusulas (M), que sale del presupuesto de desarrollo. */
  cost: number;
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
  const salaries = { ...inp.salaries };
  let cost = 0;
  const sign = (d: DriverDef) => { contracts[d.abrev] = y + contractYears(d, y, rng) - 1; salaries[d.abrev] = salaryFor(d); };
  const used = new Set<string>([...inp.base.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...inp.pool.map((d) => d.abrev), ...inp.mine.map((m) => m.d.abrev)]);
  const numbers = new Set<number>([...inp.base.flatMap((t) => t.pilotos.map((d) => d.numero)), ...inp.mine.map((m) => m.d.numero)]);
  const age = (d: DriverDef) => ageDriver(d, y, rng);

  // 1. un año más para todos
  const teams = inp.base.map((t) => ({ t, seats: t.pilotos.map(age) as (DriverDef | null)[] }));
  let pool = inp.pool.map(age);
  const mineAged = inp.mine.map((m) => ({ ...m, d: age(m.d) }));

  // 1b. tus fichajes van primero: de los libres, o de otro equipo pagando la cláusula si tiene contrato
  const mine: DriverDef[] = [];
  for (const m of mineAged) {
    if (m.keep) {
      if ((contracts[m.d.abrev] ?? y) < y) sign(m.d);
      mine.push(m.d);
      continue;
    }
    const out = clauseFor(salaries[m.d.abrev] ?? salaryFor(m.d), contracts[m.d.abrev] ?? y - 1, y);
    cost += out;
    pool.push(m.d);
    let pick = pool.find((d) => d.abrev === m.sign && d !== m.d);
    let from = "";
    if (!pick) {
      for (const x of teams) x.seats.forEach((d, j) => {
        if (pick || !d || d.abrev !== m.sign) return;
        pick = d;
        x.seats[j] = null;
        from = x.t.nombre;
        const c = clauseFor(salaries[d.abrev] ?? salaryFor(d), contracts[d.abrev] ?? y - 1, y);
        cost += c;
        if (c) from += ` (cláusula de ${c} M)`;
      });
    }
    pick ??= pool.slice().sort((a, b) => rating(b) - rating(a)).find((d) => d !== m.d)!;
    pool = pool.filter((d) => d !== pick);
    sign(pick);
    news.push(`✍️ Fichas a ${pick.nombre}${from ? ` de ${from}` : ""} en lugar de ${m.d.nombre}${out ? ` (romper su contrato cuesta ${out} M)` : ""}.`);
    mine.push(pick);
  }
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
      sign(d);
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
      sign(c.d!);
      news.push(`🔁 ${c.d!.nombre} deja ${c.o.t.nombre} y se va a ${x.t.nombre}.`);
    }
  }

  // 5. asientos libres: los mejores equipos eligen primero entre los mejores que queden (libres, reservas y los de la
  // F2, que con los años van llegando); solo si no queda nadie sube un novato inventado. Cada año llegan a la F2
  // unos cuantos jóvenes nuevos (inventados) que irán madurando.
  for (let k = 0; k < 4; k++) pool.push(f2Newcomer(y, rng, used, numbers));
  for (const x of order) {
    x.seats = x.seats.map((d) => {
      if (d) return d;
      pool.sort((a, b) => rating(b) - rating(a) + rng.gauss(0, 0.6));
      let pick = pool.find((p) => released.get(p.abrev) !== x.t.id);
      if (!pick) {
        const r = rookie(y, rng, used, numbers);
        pool.push(r);
        pick = r;
      }
      pool = pool.filter((p) => p !== pick);
      sign(pick);
      news.push(pick.debut === y ? `🆕 ${x.t.nombre} sube a ${pick.nombre}, novato de ${ageOf(pick, y)} años.` : `✍️ ${x.t.nombre} ficha a ${pick.nombre}.`);
      return pick;
    });
  }
  // el grupo de libres no crece sin fin: se quedan los 24 mejores
  // (los mejores, y los jóvenes de la F2 que pueden llegar)
  pool = pool.sort((a, b) => rating(b) + (ageOf(b, y) <= 21 ? 3 : 0) - rating(a) - (ageOf(a, y) <= 21 ? 3 : 0)).slice(0, 40);

  // 6. coches: regresión a la media desde como acabó cada uno
  const finals = new Map(inp.final.map((t) => [t.id, t]));
  const endMean = inp.final.reduce((a, t) => a + t.agarre, 0) / Math.max(1, inp.final.length);
  const base = teams.map(({ t, seats }) => {
    const f = finals.get(t.id) ?? t;
    return { ...t, pilotos: seats as DriverDef[], agarre: Math.round((inp.meanAgarre + CAR_CARRY * (f.agarre - endMean) + rng.gauss(0, 0.3)) * 100) / 100 };
  });
  // salarios solo de los que tienen equipo
  for (const k of Object.keys(salaries)) if (!base.some((t) => t.pilotos.some((d) => d.abrev === k)) && !mine.some((d) => d.abrev === k)) delete salaries[k];
  return { base, mine, pool, contracts, salaries, news, cost: Math.round(cost * 10) / 10 };
}

/** Presupuesto de desarrollo del año siguiente según los objetivos: más por cada uno cumplido, menos por cada fallado. */
export function objectivesBonus(done: number, total: number): number {
  return done * OBJ_BONUS - (total - done) * OBJ_MALUS;
}

// ------------------------------------------------------------------ a mitad de temporada
/** Un asiento en la carrera que acaba de terminar. */
export interface SeatNow { seat: number; d: DriverDef; teamId: string; team: string; player: boolean; mate: number }

export interface MidSeasonInput {
  next: number; // índice de la próxima ronda (los cambios valen desde ella)
  rounds: number; // carreras de la temporada
  year: number;
  seed: number;
  seats: SeatNow[];
  /** Resultado de la carrera que acaba de terminar (por asiento) y puntos de cada asiento en la temporada. */
  race: { seat: number; status: string; reason?: string }[];
  points: Map<number, number>;
  /** Pilotos sin equipo; los reservas de cada equipo (por id de equipo), que son los primeros en sustituir. */
  pool: DriverDef[];
  reserves: Record<string, string[]>;
  /** Cambios que ya ha habido esta temporada. */
  swaps: SeatSwap[];
}

/**
 * Cambios de piloto tras una carrera: un accidente fuerte puede dejar a un piloto lesionado unas carreras (le sustituye
 * el reserva del equipo o el mejor libre, y vuelve después); y pasado un tercio de la temporada, un equipo de la IA
 * puede destituir al piloto que no rinde (muy por detrás de su compañero) por uno mejor de los libres o de la F2.
 */
export function midSeason(inp: MidSeasonInput): { swaps: SeatSwap[]; pool: DriverDef[]; news: string[] } {
  const rng = new Rng((inp.seed * 131 + inp.next * 7919 + inp.year) >>> 0);
  const swaps: SeatSwap[] = [];
  const news: string[] = [];
  let pool = [...inp.pool];
  if (inp.next >= inp.rounds) return { swaps, pool, news };
  const busy = new Set(inp.swaps.filter((x) => x.round >= inp.next).map((x) => x.seat)); // ya con un cambio pendiente
  const take = (teamId: string, better = 0): DriverDef | undefined => {
    const res = inp.reserves[teamId]?.map((a) => pool.find((d) => d.abrev === a)).find((d) => d);
    const pick = better ? pool.filter((d) => rating(d) > better).sort((a, b) => rating(b) - rating(a))[0] : res ?? pool.slice().sort((a, b) => rating(b) - rating(a))[0];
    if (pick) pool = pool.filter((d) => d !== pick);
    return pick;
  };
  // lesiones
  for (const r of inp.race) {
    const st = inp.seats.find((x) => x.seat === r.seat);
    if (!st || busy.has(r.seat) || r.status !== "out" || !/^accidente/.test(r.reason ?? "") || !rng.chance(0.15)) continue;
    const sub = take(st.teamId);
    if (!sub) continue;
    const n = rng.int(1, 3);
    swaps.push({ round: inp.next, seat: r.seat, in: sub, out: st.d, why: `lesión de ${st.d.nombre}` });
    if (inp.next + n < inp.rounds) swaps.push({ round: inp.next + n, seat: r.seat, in: st.d, out: sub, why: `vuelve ${st.d.nombre}` });
    busy.add(r.seat);
    news.push(`🚑 ${st.d.nombre} (${st.team}) se ha lesionado en el accidente: se pierde ${n === 1 ? "la próxima carrera" : `las ${n} próximas carreras`}. Le sustituye ${sub.nombre}.`);
  }
  // destituciones (solo equipos de la IA, una por equipo y temporada)
  if (inp.next >= inp.rounds / 3) {
    for (const st of inp.seats) {
      if (st.player || busy.has(st.seat) || busy.has(st.mate)) continue;
      if (inp.swaps.some((x) => x.why.startsWith("destitu") && inp.seats.find((y) => y.seat === x.seat)?.teamId === st.teamId)) continue;
      const mine = inp.points.get(st.seat) ?? 0, mate = inp.points.get(st.mate) ?? 0;
      const mateD = inp.seats.find((x) => x.seat === st.mate)?.d;
      if (!mateD || mate < 10 || mine > mate * 0.25 || rating(st.d) > rating(mateD) - 3 || !rng.chance(0.1)) continue;
      const sub = take(st.teamId, rating(st.d));
      if (!sub) continue;
      swaps.push({ round: inp.next, seat: st.seat, in: sub, out: st.d, why: "destituido" });
      pool.push(st.d);
      busy.add(st.seat);
      news.push(`🔄 ${st.team} destituye a ${st.d.nombre} (${mine} puntos frente a ${mate} de su compañero) y sube a ${sub.nombre}${sub.serie ? ` desde la ${sub.serie}` : ""}.`);
    }
  }
  return { swaps, pool, news };
}
