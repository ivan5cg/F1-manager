// Instantánea de una sesión a medias: todo lo necesario para seguirla exactamente donde estaba
// (coches, neumáticos, agua, tiempo, mensajes y el estado de los generadores aleatorios).
import { Rng } from "./rng";
import type { Session, Car, SessionKind } from "./session";
import type { WeekendState } from "./weekend";
import type { WeatherState } from "./weather";
import type { Compound } from "./tyres";

export interface SessionSnapshot {
  v: 1;
  kind: SessionKind;
  savedAt: number; // ms (Date.now)
  weekend: WeekendState;
  sess: Record<string, unknown>;
}

// campos de la sesión que se reconstruyen al crearla (o son referencias)
const SKIP_SESS = new Set(["opt", "track", "onEvent", "cars", "rng", "weather", "water", "waterOff", "hidden", "parts", "breaks", "tRef", "secStart", "windAir"]);
// campos de cada coche que son referencias a otros objetos
const SKIP_CAR = new Set(["e", "d", "team", "tyres", "usedCompounds", "cross"]);
const CROSS_KEEP_LAPS = 6;

const rngState = (r: Rng) => (r as unknown as { s: number }).s;
const setRngState = (r: Rng, s: number) => { (r as unknown as { s: number }).s = s; };

/** JSON que conserva Infinity y NaN (JSON normal los convierte en null). */
const replacer = (_k: string, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? (Number.isNaN(v) ? "__NaN" : v > 0 ? "__Inf" : "__-Inf") : v);
const reviver = (_k: string, v: unknown) => (v === "__NaN" ? NaN : v === "__Inf" ? Infinity : v === "__-Inf" ? -Infinity : v);

// el historial del radar solo se dibuja: se guarda compacto (redondeado y sin lo que cae fuera de la vista)
const CELL_KEYS = ["x", "y", "vx", "vy", "sigma", "ax", "ang", "peak", "age", "life", "seed"] as const;
function weatherOut(w: WeatherState) {
  const { rng, history, ...rest } = w;
  const hist = history.map((f) => ({
    clock: f.clock, drizzle: f.drizzle,
    c: f.cells.filter((c) => Math.hypot(c.x, c.y) < 75).map((c) => CELL_KEYS.map((k) => Math.round(c[k] * 1000) / 1000)),
  }));
  return { ...rest, hist, rngS: rngState(rng) };
}

function carOut(c: Car, N: number) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!SKIP_CAR.has(k)) o[k] = v;
  o.tyresId = c.tyres?.id ?? null;
  o.used = [...c.usedCompounds];
  // de los pasos por minisector solo hacen falta las últimas vueltas (huecos e intervalos)
  const from = Math.max(0, c.cross.length - N * CROSS_KEEP_LAPS);
  o.crossFrom = from;
  o.crossArr = c.cross.slice(from).map((x) => (x === undefined ? null : Math.round(x * 1000) / 1000));
  return o;
}

export function snapshotSession(sess: Session, st: WeekendState): string {
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sess)) if (!SKIP_SESS.has(k) && typeof v !== "function") s[k] = v;
  s.rngS = rngState(sess.rng);
  s.weather = weatherOut(sess.weather);
  s.water = Array.from(sess.water);
  s.waterOff = Array.from(sess.waterOff);
  s.cars = sess.cars.map((c) => carOut(c, sess.N));
  // la caché de perfiles de neumático se recalcula igual al volver (es una función pura): no se guarda
  const knowledge = Object.fromEntries(Object.entries(st.knowledge).map(([id, k]) => [id, { ...k, profile: {} }]));
  const snap: SessionSnapshot = { v: 1, kind: sess.kind, savedAt: Date.now(), weekend: { ...st, knowledge }, sess: s };
  return JSON.stringify(snap, replacer);
}

export function parseSnapshot(raw: string): SessionSnapshot | null {
  try {
    const s = JSON.parse(raw, reviver) as SessionSnapshot;
    return s && s.v === 1 && s.weekend && s.sess ? s : null;
  } catch {
    return null;
  }
}

/** Tiempo y agua guardados, listos para crear la sesión. */
export function snapshotConditions(snap: SessionSnapshot): { weather: WeatherState; water: number[]; waterOff: number[] } {
  const w = snap.sess.weather as WeatherState & { rngS: number; hist?: { clock: number; drizzle: number; c: number[][] }[] };
  const rng = new Rng(1);
  setRngState(rng, w.rngS);
  const { rngS: _drop, hist, ...rest } = w;
  void _drop;
  const history = hist ? hist.map((f) => ({ clock: f.clock, drizzle: f.drizzle, cells: f.c.map((a) => Object.fromEntries(CELL_KEYS.map((k, i) => [k, a[i]])) as unknown as WeatherState["cells"][number]) })) : w.history;
  return { weather: { ...rest, history, rng } as WeatherState, water: snap.sess.water as number[], waterOff: snap.sess.waterOff as number[] };
}

/** Vuelca la instantánea sobre una sesión recién creada (con los mismos inscritos). */
export function applySnapshot(sess: Session, snap: SessionSnapshot) {
  const s = snap.sess;
  for (const [k, v] of Object.entries(s)) {
    if (k === "cars" || k === "weather" || k === "water" || k === "waterOff" || k === "rngS") continue;
    (sess as unknown as Record<string, unknown>)[k] = v;
  }
  setRngState(sess.rng, s.rngS as number);
  for (const o of s.cars as Record<string, unknown>[]) {
    const c = sess.carById(o.id as number);
    for (const [k, v] of Object.entries(o)) {
      if (k === "tyresId" || k === "used" || k === "crossFrom" || k === "crossArr") continue;
      (c as unknown as Record<string, unknown>)[k] = v;
    }
    c.tyres = o.tyresId ? c.e.sets.find((x) => x.id === o.tyresId) ?? null : null;
    c.usedCompounds = new Set(o.used as Compound[]);
    const cross: number[] = [];
    cross.length = o.crossFrom as number;
    for (const x of o.crossArr as (number | null)[]) cross.push(x === null ? (undefined as unknown as number) : x);
    c.cross = cross;
  }
}
