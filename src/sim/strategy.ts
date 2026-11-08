// Estrategia. Cada equipo tiene un conocimiento IMPERFECTO del desgaste real (lo que sacó de
// los libres), con más o menos error según su calidad. Con eso simula stints con el mismo
// modelo de neumáticos que la carrera y busca la mejor combinación de paradas.
import { Rng, clamp } from "./rng";
import { Compound, COMPOUNDS, DRY, HiddenTyre, newSet, updateSet, setGrip } from "./tyres";
import { msTimeAtGrip } from "./track";
import type { Race, Car, TeamDef } from "./race";
import { forecast, Forecast } from "./weather";

/** Previsión del equipo (se refresca cada minuto de carrera). */
export function teamForecast(race: Race, car: Car): Forecast {
  const k = car.knowledge;
  if (!k.fc || race.t - k.fcT > 60) {
    k.fc = forecast(race.weather, k.quality, race.rng.fork(), 16, [0, 5, 10, 15, 20, 30]);
    k.fcT = race.t;
    // los compañeros comparten meteorólogo
    for (const o of race.cars) if (o.team === car.team) { o.knowledge.fc = k.fc; o.knowledge.fcT = k.fcT; }
  }
  return k.fc;
}

export interface Stint { c: Compound; endLap: number }
export interface Plan { stints: Stint[]; total?: number }

export interface TeamKnowledge {
  hidden: HiddenTyre; // su estimación de lo oculto
  profile: Partial<Record<Compound, { dt: number[]; wear: number[] }>>; // por edad del neumático
  wetIn: number; // agua (mm) a la que creen que toca poner intermedios
  wetOut: number;
  noise: number;
  quality: number; // calidad del meteorólogo
  fc: Forecast | null; // última previsión del equipo
  fcT: number;
}

const MAX_AGE = 70;

export function buildKnowledge(race: Race, team: TeamDef, rng: Rng): TeamKnowledge {
  const noise = 0.05 + ((100 - team.estrategia) / 100) * 0.3;
  const h = race.hidden;
  const hidden: HiddenTyre = {
    wearMult: { S: h.wearMult.S * rng.logn(noise), M: h.wearMult.M * rng.logn(noise), H: h.wearMult.H * rng.logn(noise), I: h.wearMult.I * rng.logn(noise), W: h.wearMult.W * rng.logn(noise) },
    thermalOffset: h.thermalOffset + rng.gauss(0, 1 + noise * 12),
    grainProne: h.grainProne * rng.logn(noise * 2),
  };
  return { hidden, profile: {}, wetIn: rng.range(0.14, 0.3), wetOut: rng.range(0.1, 0.2), noise, quality: team.meteo, fc: null, fcT: -999 };
}

/** Simula un stint en seco con el modelo de neumáticos y devuelve pérdida por edad. */
export function stintProfile(race: Race, car: Car, k: TeamKnowledge, c: Compound) {
  const cached = k.profile[c];
  if (cached) return cached;
  const tr = race.track;
  const set = newSet(c);
  const dt: number[] = [], wear: number[] = [];
  const lapRef = race.lapRefRace;
  const spg = race.secPerGrip;
  for (let age = 0; age < MAX_AGE; age++) {
    let gripSum = 0, tSum = 0;
    for (const m of tr.ms) {
      const tm = msTimeAtGrip(m, 1);
      const steps = Math.max(1, Math.round(tm / 1.0));
      const h = tm / steps;
      for (let s = 0; s < steps; s++) {
        updateSet(set, {
          trackT: race.weather.trackT, airT: race.weather.airT, water: 0,
          eF: (m.energyF / tm) * lapRef, eR: (m.energyR / tm) * lapRef,
          push: 1, carWear: car.wearMult, abrasiveness: tr.abrasiveness, speed: 60,
        }, h, lapRef, k.hidden);
      }
      gripSum += setGrip(set, 0) * tm;
      tSum += tm;
    }
    const g = gripSum / tSum;
    dt.push(-(g - 1) * 100 * spg);
    wear.push(Math.max(set.F.wear, set.R.wear));
  }
  const p = { dt, wear };
  k.profile[c] = p;
  return p;
}

function stintCost(race: Race, car: Car, k: TeamKnowledge, c: Compound, laps: number): number {
  if (laps <= 0) return 0;
  const p = stintProfile(race, car, k, c);
  if (laps > MAX_AGE) return 1e9;
  let t = 0;
  for (let a = 0; a < laps; a++) t += p.dt[a];
  const w = p.wear[laps - 1];
  if (w > 0.93) t += (w - 0.93) * 400; // riesgo de pinchazo
  return t;
}

export function pitLoss(race: Race): number {
  const tr = race.track;
  let tPortion = 0;
  for (let i = 0; i < tr.vref.length; i++) {
    const s = i * tr.ds;
    if (s >= tr.pit.entry || s < tr.pit.exit) tPortion += tr.ds / tr.vref[i];
  }
  // + ~2 s de vuelta de salida con neumático frío
  return tr.pit.laneLength / tr.pit.limit - tPortion * 1.05 + 2;
}

/**
 * Mejor estrategia en seco desde fromLap (vueltas completadas) con el neumático actual de edad curAge.
 * Si curC es null, se elige también el de salida.
 */
export function planStrategy(race: Race, car: Car, k: TeamKnowledge, fromLap = 0, curC: Compound | null = null, curAge = 0, used: Set<Compound> = new Set(), rng?: Rng): Plan {
  const total = race.track.laps;
  const remain = total - fromLap;
  const loss = pitLoss(race) + car.team.boxes + 1.0;
  const options: Plan[] = [];
  const startSet: Compound[] = curC ? [curC] : DRY;
  const ruleOk = (cs: Compound[]) => {
    const all = new Set([...used, ...cs]);
    if ([...all].some((c) => c === "I" || c === "W")) return true;
    return all.size >= 2;
  };
  const cost0 = (c: Compound, laps: number) => (curC && c === curC ? stintCost(race, car, k, c, curAge + laps) - stintCost(race, car, k, c, curAge) : stintCost(race, car, k, c, laps));
  // sin parada (si viene de usar dos compuestos)
  for (const c1 of startSet) {
    if (ruleOk([c1])) options.push({ stints: [{ c: c1, endLap: total }], total: cost0(c1, remain) });
  }
  // una parada
  for (const c1 of startSet) for (const c2 of DRY) {
    if (!ruleOk([c1, c2])) continue;
    for (let l1 = 4; l1 <= remain - 4; l1++) {
      const t = cost0(c1, l1) + stintCost(race, car, k, c2, remain - l1) + loss;
      options.push({ stints: [{ c: c1, endLap: fromLap + l1 }, { c: c2, endLap: total }], total: t });
    }
  }
  // dos paradas
  for (const c1 of startSet) for (const c2 of DRY) for (const c3 of DRY) {
    if (!ruleOk([c1, c2, c3])) continue;
    for (let l1 = 4; l1 <= remain - 8; l1 += 1) for (let l2 = 4; l1 + l2 <= remain - 4; l2 += 1) {
      const t = cost0(c1, l1) + stintCost(race, car, k, c2, l2) + stintCost(race, car, k, c3, remain - l1 - l2) + 2 * loss;
      options.push({ stints: [{ c: c1, endLap: fromLap + l1 }, { c: c2, endLap: fromLap + l1 + l2 }, { c: c3, endLap: total }], total: t });
    }
  }
  options.sort((a, b) => a.total! - b.total!);
  if (!options.length) return { stints: [{ c: curC ?? "M", endLap: total }] };
  // los equipos no siempre eligen el óptimo: variedad entre los mejores
  if (rng) {
    const best = options[0].total!;
    const temp = 1 + k.noise * 20;
    const pool = options.filter((o) => o.total! - best < temp * 3).slice(0, 400);
    const w = pool.map((o) => Math.exp(-(o.total! - best) / temp));
    let r = rng.next() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  }
  return options[0];
}

/** Compuesto que toca según el agua y la previsión. null = el actual vale. */
function weatherCall(race: Race, car: Car): Compound | null {
  const k = car.knowledge;
  // cada piloto percibe la pista a su manera
  const water = race.avgWater() * race.rng.logn(0.15);
  const cur = car.tyres.c;
  const rainNow = race.rainOnTrack();
  const isDry = DRY.includes(cur);
  const fc = teamForecast(race, car);
  const soonDry = fc.prob[2] < 0.3 && fc.prob[3] < 0.25; // en 10-15 min
  const soonWet = fc.prob[1] > 0.6 && fc.p50[1] > 2; // en 5 min llueve fuerte
  const left = race.track.laps - race.lapsDone(car);
  if (isDry) {
    // con poca agua y previsión de que para, algunos se la juegan
    if (water > k.wetIn && water < 0.5 && soonDry && left > 5 && race.rng.chance(0.6)) return null;
    if (water > k.wetIn || (soonWet && water > k.wetIn * 0.5)) return water > 1.1 ? "W" : "I";
    return null;
  }
  if (cur === "I" && water > 1.25) return "W";
  if (cur === "W" && water < 0.75 && rainNow < 4) return "I";
  if (cur === "I" && water < k.wetOut && rainNow < 0.4 && fc.prob[2] < 0.5) {
    return left < 18 ? "S" : left < 32 ? "M" : "H";
  }
  return null;
}

/** Decisión de la IA al final de la vuelta. Devuelve el compuesto si para. */
export function aiDecide(race: Race, car: Car, adviceOnly = false): Compound | null {
  if (car.status !== "run" || race.chequered) return null;
  const done = race.lapsDone(car) + 1; // vueltas completadas al cruzar la meta
  const total = race.track.laps;
  const left = total - done;
  if (!adviceOnly) aiModes(race, car, left);
  if (left < 1 || car.pitRequest) return null;
  const decide = (c: Compound, why: string) => {
    if (!adviceOnly) {
      car.pitRequest = c;
      void why;
    }
    return c;
  };
  const wc = weatherCall(race, car);
  if (wc && wc !== car.tyres.c) {
    if (!adviceOnly && DRY.includes(wc)) car.plan = { stints: [{ c: wc, endLap: total }] };
    return decide(wc, "tiempo");
  }
  if (!DRY.includes(car.tyres.c)) return null;
  if (left < 2) return null;

  const k = car.knowledge;
  const cur = car.tyres.c;
  const age = car.tyres.laps + 1;
  const wear = Math.max(car.tyres.F.wear, car.tyres.R.wear) + race.rng.gauss(0, 0.012);
  const stopsLeft = car.plan.stints.length - 1 - car.stops;
  const needRule = !ruleSatisfied(car);
  const fresh = car.tyres.laps < 6 || car.lastPitLap >= done - 4;

  // Aprende: compara el desgaste real con el que esperaba y corrige su modelo.
  if (age >= 4 && !adviceOnly) {
    const pred = stintProfile(race, car, k, cur).wear[Math.min(age - 1, 69)];
    const ratio = wear / Math.max(0.02, pred);
    if (Math.abs(ratio - 1) > 0.1) {
      const f = Math.pow(ratio, 0.6);
      for (const c of DRY) k.hidden.wearMult[c] *= c === cur ? f : Math.pow(f, 0.6);
      k.profile = {};
      const used = new Set(car.usedCompounds);
      const re = planStrategy(race, car, k, done - 1, cur, age - 1, used);
      const past = car.plan.stints.slice(0, car.stops);
      car.plan = { stints: [...past, ...re.stints] };
    }
  }
  const stint = car.plan.stints[car.stops] ?? car.plan.stints[car.plan.stints.length - 1];
  const plannedEnd = stint?.endLap ?? total;

  let box = false;
  if (wear > 0.9 && left > 2) box = true; // al límite: pinchazo
  if (stopsLeft > 0 && done >= plannedEnd) box = true;
  // coche de seguridad: parada barata
  if ((race.flag === "sc" || race.flag === "vsc") && left > 5 && !fresh) {
    if (stopsLeft > 0 && plannedEnd - done <= 14) box = true;
    else if (needRule) box = true;
    else if (car.tyres.laps > 14 && left > 12 && race.rng.chance(0.5)) box = true;
  }
  // defensa del undercut
  const ord = race.order();
  const i = ord.indexOf(car);
  const behind = ord[i + 1];
  if (behind && behind.lastPitLap === done - 1 && race.gapBetween(car, behind) < 3 && stopsLeft > 0 && plannedEnd - done <= 6) box = true;
  // undercut: atascado detrás
  if (car.followGap < 1.0 && stopsLeft > 0 && plannedEnd - done <= 3 && race.rng.chance(0.4)) box = true;
  // la regla de los dos compuestos al final
  if (needRule && left <= 6 && !fresh) box = true;
  if (!box) return null;
  // ¿viene lluvia? no tiene sentido montar lisos nuevos
  const fc = teamForecast(race, car);
  if (Math.max(fc.prob[1], fc.prob[2], fc.prob[3]) > 0.55) {
    if (race.avgWater() > 0.06) return decide("I", "lluvia inminente");
    if (wear < 0.86) return null;
  }

  // replanifica desde aquí con neumático nuevo
  const used = new Set(car.usedCompounds);
  const plan = planStrategy(race, car, k, done, null, 0, used);
  const next = plan.stints[0].c;
  if (!adviceOnly) {
    // mantiene el formato: stints ya hechos + nuevo plan
    const past = car.plan.stints.slice(0, car.stops + 1).map((s, j) => (j === car.stops ? { c: s.c, endLap: done } : s));
    car.plan = { stints: [...past, ...plan.stints] };
  }
  return decide(next, "plan");
}

function ruleSatisfied(car: Car): boolean {
  const u = car.usedCompounds;
  if (u.has("I") || u.has("W")) return true;
  return u.size >= 2;
}

/** Modos de ritmo y batería de la IA (y del jugador si lo deja en automático). */
export function aiModes(race: Race, car: Car, left: number) {
  const fuelLaps = car.fuel / race.fuelPerLap;
  const sp = COMPOUNDS[car.tyres.c];
  const wear = Math.max(car.tyres.F.wear, car.tyres.R.wear);
  const stint = car.plan.stints[car.stops];
  const toEnd = (stint?.endLap ?? race.track.laps) - race.lapsDone(car);
  let push = 2;
  if (fuelLaps < left + 0.3) push = 1;
  if (fuelLaps < left - 0.5) push = 0;
  if (wear > sp.cliff - 0.15 && toEnd > 6 && push > 1) push = 1;
  if (left <= 4 && wear < sp.cliff - 0.1 && fuelLaps > left + 0.5) push = 3;
  if (!car.player || car.autoPush) car.push = push;
  car.engine = fuelLaps < left - 0.3 ? 0 : 1;
  void clamp;
}

/** Batería: se decide en cada minisector. */
export function aiErs(race: Race, car: Car) {
  if (car.player && !car.autoErs) return;
  const attacking = car.followGap < 0.9 && car.aheadId >= 0;
  if (car.soc < 0.6) car.ers = 0;
  else if (attacking && car.soc > 1.2) car.ers = car.followGap < 0.5 ? 3 : 2;
  else if (car.soc < 2.2) car.ers = 0;
  else if (car.soc > 3.6) car.ers = 2;
  else car.ers = 1;
}
