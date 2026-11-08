// Herramientas del muro de boxes: dónde sale tu piloto si para ahora, quién puede hacerte el
// undercut (o a quién se lo puedes hacer tú) y la evolución de los huecos con los de alrededor.
// Son estimaciones del equipo: usan su modelo de neumáticos (con su error), el ritmo reciente de
// cada coche y la pérdida en boxes del circuito; no saben qué harán los rivales.
import type { Session, Car } from "./session";
import { Compound, DRY, WET } from "./tyres";
import { stintProfile, availableSets } from "./strategy";

/** Calentar el juego nuevo en la vuelta de salida (s): los duros tardan más. */
const OUT_LAP: Record<Compound, number> = { S: 0.6, M: 0.9, H: 1.3, I: 0.5, W: 0.4 };

/** Pérdida total de una parada ahora mismo (calle de boxes + parada), según la bandera. */
export function pitLoss(sess: Session, c: Car): number {
  const def = sess.track.def;
  // la calle de boxes está medida para que la pérdida sea la del circuito con una parada de 2,4 s
  // (menos ~1 s que el circuito ya cuenta en la entrada y la salida); se corrige con la del equipo
  let loss = def.boxes.perdida - 1.0 + (c.team.boxes - 2.4) + (c.wing > 0.012 ? 7.5 : 0);
  if (sess.flag === "sc" || sess.flag === "sc_in") loss *= 0.45;
  else if (sess.flag === "vsc") loss *= 0.6;
  return loss;
}

/** Ritmo reciente: mediana de las últimas vueltas limpias (sin la de boxes ni las lentas). */
function recentLap(sess: Session, c: Car): number {
  const last = c.lapTimes.slice(-5);
  if (last.length >= 2) {
    const min = Math.min(...last);
    const clean = last.filter((x) => x < min * 1.035).slice(-3).sort((a, b) => a - b);
    if (clean.length) return clean[Math.floor(clean.length / 2)];
  }
  return sess.estLap(c);
}

// perfiles de neumático calculados para el muro: caché propia, para que mirar el muro no cambie
// nada de lo que usa la simulación (la caché del equipo es por compuesto, no por coche)
const cache = new WeakMap<Session, Map<string, number[]>>();

/** Estimador de vueltas de un coche con un compuesto y una edad, según lo que sabe tu equipo. */
function lapModel(sess: Session, me: Car) {
  const k = me.e.knowledge;
  let mine = cache.get(sess);
  if (!mine) { mine = new Map(); cache.set(sess, mine); }
  const store = mine;
  const age = (c: Car) => Math.max(0, (c.tyres?.laps ?? 1) - 1);
  const dt = (c: Car, comp: Compound, a: number) => {
    if (!DRY.includes(comp)) return 0;
    const key = `${c.id}${comp}${Math.round(sess.weather.trackT / 3)}`;
    let p = store.get(key);
    if (!p) { p = stintProfile(sess, c, { ...k, profile: {} }, comp).dt; store.set(key, p); }
    return p[Math.min(p.length - 1, Math.max(0, a))];
  };
  const base = (c: Car) => recentLap(sess, c) - (c.tyres ? dt(c, c.tyres.c, age(c)) : 0);
  return {
    age,
    /** vuelta de c con el compuesto comp y edad a */
    lap: (c: Car, comp: Compound, a: number) => base(c) + dt(c, comp, a),
    /** su próxima vuelta con lo que lleva puesto */
    next: (c: Car) => base(c) + (c.tyres ? dt(c, c.tyres.c, age(c) + 1) : 0),
  };
}

export interface Neighbor { car: Car; gap: number; tyre: Compound | null; age: number }

export interface StopOption {
  setId: string;
  c: Compound;
  setLaps: number; // vueltas que ya lleva el juego (0 = nuevo)
  pos: number; // posición al salir
  ahead?: Neighbor; // con quién sale detrás (hueco positivo)
  behind?: Neighbor; // quién sale detrás (hueco positivo)
  catchLaps: number | null; // vueltas para alcanzar al de delante (null: no le alcanza en 15)
  lapGain: number; // s por vuelta que gana con ese juego frente a seguir
}

/** Coches en carrera con su tiempo respecto al líder (s), sin los que han abandonado. */
function field(sess: Session) {
  return sess.intervals().filter((r) => r.car.loc !== "out" && r.car.loc !== "fin");
}

const neighbor = (sess: Session, c: Car, gap: number): Neighbor => ({ car: c, gap, tyre: c.tyres?.c ?? null, age: Math.max(0, (c.tyres?.laps ?? 1) - 1) });

/** Si para ahora: posición y huecos al salir con cada compuesto disponible (el mejor juego de cada uno). */
export function stopOptions(sess: Session, me: Car): StopOption[] {
  const rows = field(sess);
  const mine = rows.find((r) => r.car === me);
  if (!mine || !me.tyres) return [];
  const loss = pitLoss(sess, me);
  const at = mine.gap + loss;
  const others = rows.filter((r) => r.car !== me).sort((a, b) => a.gap - b.gap);
  const m = lapModel(sess, me);
  const wet = sess.avgWater() > WET.si * 0.6;
  const keep = m.next(me);
  const avail = availableSets(me);
  const out: StopOption[] = [];
  for (const comp of ["S", "M", "H", "I", "W"] as Compound[]) {
    const set = avail[comp][0];
    if (!set) continue;
    const ahead = [...others].reverse().find((r) => r.gap < at);
    const behind = others.find((r) => r.gap >= at);
    const pos = others.filter((r) => r.gap < at).length + 1;
    const a0 = Math.max(0, set.laps - 1);
    const myLap = m.lap(me, comp, a0);
    let catchLaps: number | null = null;
    if (ahead && !wet) {
      // hueco al salir + calentar el neumático; luego se recorta lo que va más rápido
      let gap = at - ahead.gap + OUT_LAP[comp];
      const rival = ahead.car;
      for (let l = 1; l <= 15; l++) {
        gap -= m.lap(rival, rival.tyres?.c ?? "M", m.age(rival) + l) - m.lap(me, comp, a0 + l);
        if (gap <= 0.3) { catchLaps = l; break; }
      }
    }
    out.push({
      setId: set.id, c: comp, setLaps: set.laps, pos,
      ahead: ahead ? neighbor(sess, ahead.car, at - ahead.gap) : undefined,
      behind: behind ? neighbor(sess, behind.car, behind.gap - at) : undefined,
      catchLaps,
      lapGain: wet ? NaN : keep - myLap,
    });
  }
  return out;
}

export interface UndercutCase {
  rival: Car;
  gapNow: number; // hueco actual (s)
  /** Hueco tras las dos paradas: >0 sigues delante (o el rival sigue delante en "attack"). */
  after: number;
  rivalTyre: Compound;
  myTyre: Compound;
}

/** El de detrás para ahora y tú respondes en la vuelta siguiente: ¿te pasa? (y lo mismo al revés con el de delante). */
export function undercut(sess: Session, me: Car): { defend?: UndercutCase; attack?: UndercutCase } {
  if (sess.avgWater() > WET.si * 0.6 || !me.tyres) return {};
  const ord = field(sess).filter((r) => r.car.loc === "track" || r.car === me);
  const i = ord.findIndex((r) => r.car === me);
  if (i < 0) return {};
  const m = lapModel(sess, me);
  const nextComp = (c: Car): Compound => {
    const planned = c.plan.stints[c.stops + 1]?.c;
    const avail = availableSets(c);
    if (planned && avail[planned].length) return planned;
    return (["M", "H", "S"] as Compound[]).find((x) => avail[x].length && x !== c.tyres?.c) ?? "M";
  };
  const res: { defend?: UndercutCase; attack?: UndercutCase } = {};
  const behind = ord[i + 1];
  if (behind && behind.lapsDown === ord[i].lapsDown && behind.car.tyres) {
    const b = behind.car, gapNow = behind.gap - ord[i].gap;
    const xb = nextComp(b), xm = nextComp(me);
    // vuelta n+1: él sale de boxes con nuevos (calentándolos) y tú das otra con los viejos;
    // vuelta n+2: tú sales con los tuyos fríos y él ya los lleva a temperatura
    const after = gapNow + pitLoss(sess, b) - pitLoss(sess, me)
      + (m.lap(b, xb, 0) + OUT_LAP[xb]) - m.next(me)
      + m.lap(b, xb, 1) - (m.lap(me, xm, 0) + OUT_LAP[xm]);
    res.defend = { rival: b, gapNow, after, rivalTyre: xb, myTyre: xm };
  }
  const ahead = ord[i - 1];
  if (ahead && ahead.lapsDown === ord[i].lapsDown && ahead.car.tyres) {
    const a = ahead.car, gapNow = ord[i].gap - ahead.gap;
    const xa = nextComp(a), xm = nextComp(me);
    const after = gapNow + pitLoss(sess, me) - pitLoss(sess, a)
      + (m.lap(me, xm, 0) + OUT_LAP[xm]) - m.next(a)
      + m.lap(me, xm, 1) - (m.lap(a, xa, 0) + OUT_LAP[xa]);
    res.attack = { rival: a, gapNow, after, rivalTyre: xa, myTyre: xm };
  }
  return res;
}

/** Huecos (s) de tu piloto con otros coches al pasar por meta en sus últimas vueltas. >0: el otro va delante. */
export function gapHistory(sess: Session, me: Car, others: Car[], laps = 15): { lap: number; gaps: (number | null)[] }[] {
  const N = sess.N;
  const done = Math.floor(Math.max(0, me.msK) / N);
  const out: { lap: number; gaps: (number | null)[] }[] = [];
  for (let L = Math.max(1, done - laps + 1); L <= done; L++) {
    const k = L * N;
    const tm = me.cross[k];
    if (tm === undefined) continue;
    out.push({ lap: L, gaps: others.map((o) => (o.cross[k] === undefined ? null : tm - o.cross[k])) });
  }
  return out;
}
