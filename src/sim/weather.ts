// Tiempo dinámico. La lluvia son células (gaussianas) que nacen, crecen, se mueven con el
// viento en altura y se disipan. El radar ve el campo real de ahora; la previsión del equipo
// extrapola lo que ve (conjunto de 30 miembros con errores de viento e intensidad) pero no
// sabe qué células nacerán ni cuándo morirán las que hay: de ahí la incertidumbre real.
import { Rng, clamp } from "./rng";

export type Scenario = "seco" | "chubascos" | "frente" | "llovizna";
export const SCENARIO_NAMES: Record<Scenario, string> = {
  seco: "Estable y seco",
  chubascos: "Chubascos dispersos",
  frente: "Frente de lluvia",
  llovizna: "Cielo cubierto, llovizna",
};

export interface Cell {
  x: number; y: number; // km respecto al circuito
  vx: number; vy: number; // km/min
  sigma: number; // km
  peak: number; // mm/h
  age: number; life: number; // min
}

export interface WeatherState {
  scenario: Scenario;
  t: number; // min desde el inicio
  cells: Cell[];
  windDir: number; // rad, hacia dónde va el viento
  windSpeed: number; // km/h en altura (mueve las células)
  surfaceWind: number; // km/h en superficie
  airT: number;
  trackT: number;
  baseAirT: number;
  solar: number; // calentamiento máximo del asfalto por sol (°C)
  baseCloud: number;
  cloud: number;
  drizzle: number; // mm/h de fondo (llovizna)
  frontAt: number; // min a la que llega el frente (escenario frente)
  frontDist: number; // km a barlovento a los que se forma
  rng: Rng;
}

const envelope = (c: Cell) => {
  const p = c.age / c.life;
  if (p < 0 || p > 1) return 0;
  if (p < 0.25) return p / 0.25;
  if (p > 0.6) return (1 - p) / 0.4;
  return 1;
};

export function rainAt(w: WeatherState, x: number, y: number): number {
  let r = w.drizzle;
  for (const c of w.cells) {
    const dx = x - c.x, dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 16 * c.sigma * c.sigma) continue;
    r += c.peak * envelope(c) * Math.exp(-d2 / (2 * c.sigma * c.sigma));
  }
  return r;
}

function cloudAt(w: WeatherState, x: number, y: number): number {
  let c = w.baseCloud;
  for (const cell of w.cells) {
    const s = cell.sigma * 2.5;
    const dx = x - cell.x, dy = y - cell.y;
    c += 0.85 * Math.min(1, envelope(cell) * 1.5) * Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
  }
  return clamp(c, 0, 1);
}

function spawnCell(w: WeatherState, mode: "upwind" | "inplace" | "front", along = 0): Cell {
  const r = w.rng;
  const sp = w.windSpeed / 60; // km/min
  const ux = Math.cos(w.windDir), uy = Math.sin(w.windDir);
  // perpendicular
  const px = -uy, py = ux;
  let dist: number, lat: number;
  if (mode === "upwind") { dist = r.range(25, 55); lat = r.range(-30, 30); }
  else if (mode === "front") { dist = w.frontDist + r.range(-4, 4); lat = along; }
  else { dist = r.range(-25, 25); lat = r.range(-25, 25); }
  const dir = w.windDir + r.gauss(0, 0.12);
  const spd = sp * r.logn(0.12);
  const strong = w.scenario === "chubascos" ? r.logn(0.6) * 7 : w.scenario === "frente" ? r.logn(0.5) * 6 : r.logn(0.4) * 2;
  return {
    x: -ux * dist + px * lat,
    y: -uy * dist + py * lat,
    vx: Math.cos(dir) * spd,
    vy: Math.sin(dir) * spd,
    sigma: mode === "front" ? r.range(3, 6) : r.range(1.6, 4.5),
    peak: clamp(strong, 0.5, 40),
    age: mode === "inplace" ? 0 : r.range(0.1, 0.5) * 60,
    life: r.range(40, 120),
  };
}

function spawnFront(w: WeatherState) {
  const r = w.rng;
  for (let lat = -40; lat <= 40; lat += r.range(4, 8)) {
    const c = spawnCell(w, "front", lat);
    c.peak = clamp(r.logn(0.55) * 5, 0.8, 25);
    c.life = r.range(100, 170);
    c.age = r.range(15, 30);
    w.cells.push(c);
  }
}

export function createWeather(rng: Rng, forced?: Scenario): WeatherState {
  const scenario: Scenario = forced ?? rng.weighted<Scenario>([["seco", 45], ["chubascos", 28], ["frente", 17], ["llovizna", 10]]);
  const baseAirT = scenario === "seco" ? rng.range(18, 34) : scenario === "llovizna" ? rng.range(10, 18) : rng.range(13, 26);
  const w: WeatherState = {
    scenario,
    t: 0,
    cells: [],
    windDir: rng.range(0, 2 * Math.PI),
    windSpeed: rng.range(20, 55),
    surfaceWind: rng.range(5, 25),
    airT: baseAirT,
    trackT: 0,
    baseAirT,
    solar: scenario === "llovizna" ? rng.range(4, 10) : rng.range(10, 24),
    baseCloud: scenario === "seco" ? rng.range(0, 0.35) : scenario === "llovizna" ? rng.range(0.75, 0.95) : rng.range(0.25, 0.6),
    cloud: 0,
    drizzle: 0,
    frontAt: rng.range(10, 100),
    frontDist: 43,
    rng,
  };
  if (scenario === "frente") {
    const travel = 43 / (w.windSpeed / 60);
    if (w.frontAt < travel) { w.frontDist = (w.windSpeed / 60) * w.frontAt; spawnFront(w); }
  }
  // células iniciales
  const n = scenario === "chubascos" ? rng.int(4, 10) : scenario === "seco" ? rng.int(0, 2) : scenario === "frente" ? rng.int(1, 4) : rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const c = spawnCell(w, rng.chance(0.5) ? "upwind" : "inplace");
    if (scenario === "seco") { c.peak *= 0.4; c.x *= 1.8; c.y *= 1.8; }
    c.age = rng.range(0, c.life * 0.7);
    w.cells.push(c);
  }
  w.cloud = cloudAt(w, 0, 0);
  w.trackT = w.airT + w.solar * (1 - w.cloud) + 2;
  return w;
}

/** Avanza el tiempo dtMin minutos. */
export function stepWeather(w: WeatherState, dtMin: number): void {
  const r = w.rng;
  w.t += dtMin;
  for (const c of w.cells) {
    c.x += c.vx * dtMin;
    c.y += c.vy * dtMin;
    c.age += dtMin;
    // las células evolucionan: intensidad con deriva aleatoria
    c.peak = clamp(c.peak * Math.exp(r.gauss(0, 0.05) * Math.sqrt(dtMin)), 0.3, 50);
  }
  w.cells = w.cells.filter((c) => c.age < c.life && Math.hypot(c.x, c.y) < 90);
  // nacimientos (proceso de Poisson)
  const rate = { seco: 0.012, chubascos: 0.12, frente: 0.04, llovizna: 0.05 }[w.scenario];
  if (r.chance(rate * dtMin)) w.cells.push(spawnCell(w, r.chance(0.55) ? "upwind" : "inplace"));
  if (w.scenario === "frente") {
    // banda de células que se forma a barlovento para llegar hacia frontAt
    const travel = 43 / (w.windSpeed / 60);
    const spawnAt = w.frontAt - travel;
    if (spawnAt > 0 && w.t >= spawnAt && w.t - dtMin < spawnAt) spawnFront(w);
  }
  if (w.scenario === "llovizna") {
    w.drizzle = clamp(w.drizzle + r.gauss(0, 0.08) * Math.sqrt(dtMin) - 0.01 * (w.drizzle - 0.4) * dtMin, 0, 1.5);
  }
  // viento: deriva lenta
  w.windDir += r.gauss(0, 0.01) * Math.sqrt(dtMin);
  w.surfaceWind = clamp(w.surfaceWind + r.gauss(0, 0.6) * Math.sqrt(dtMin), 2, 40);

  w.cloud = cloudAt(w, 0, 0);
  const rainHere = rainAt(w, 0, 0);
  // el sol va bajando durante la carrera (salida a las 15:00)
  const sun = clamp(1 - Math.max(0, w.t - 60) / 180, 0.4, 1);
  const airEq = w.baseAirT - 3.5 * Math.min(1, rainHere / 4) - 1.5 * w.cloud + 0.8 * sun;
  w.airT += ((airEq - w.airT) * dtMin) / 15;
  const trackEq = w.airT + w.solar * (1 - w.cloud) * sun + 2 - (rainHere > 0.2 ? 4 + 4 * Math.min(1, rainHere / 5) : 0);
  w.trackT += ((trackEq - w.trackT) * dtMin) / 10;
}

export interface Forecast {
  horizons: number[]; // min
  prob: number[]; // prob. de lluvia > 0,3 mm/h en el circuito
  p50: number[]; // intensidad mediana
  p90: number[];
}

/** Previsión por conjunto: extrapola las células visibles con errores. */
export function forecast(w: WeatherState, quality: number, rng: Rng, members = 30, horizons = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60]): Forecast {
  const res: number[][] = horizons.map(() => []);
  const err = 1.4 - quality / 100; // peor meteorólogo, más dispersión
  for (let m = 0; m < members; m++) {
    const dDir = rng.gauss(0, 0.2 * err);
    const dSpd = rng.logn(0.18 * err);
    const cells = w.cells.map((c) => {
      const ang = Math.atan2(c.vy, c.vx) + dDir;
      const sp = Math.hypot(c.vx, c.vy) * dSpd;
      // no conoce el ciclo de vida: asume que dura lo que le queda con mucha incertidumbre
      return { ...c, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, peak: c.peak * envelope(c) * rng.logn(0.45 * err), remain: (c.life - c.age) * rng.logn(0.6) };
    });
    horizons.forEach((h, k) => {
      let r = w.drizzle * rng.logn(0.3);
      for (const c of cells) {
        if (h > c.remain + 10) continue;
        const fade = h > c.remain ? 1 - (h - c.remain) / 10 : 1;
        const x = c.x + c.vx * h, y = c.y + c.vy * h;
        const d2 = x * x + y * y;
        r += c.peak * fade * Math.exp(-d2 / (2 * c.sigma * c.sigma));
      }
      // clima de fondo: chubascos que aún no existen (el meteorólogo sabe el escenario general)
      res[k].push(r);
    });
  }
  const bg = { seco: 0.01, chubascos: 0.18, frente: 0.06, llovizna: 0.25 }[w.scenario];
  return {
    horizons,
    prob: res.map((arr, k) => clamp(arr.filter((x) => x > 0.3).length / members * (1 - bg * Math.min(1, horizons[k] / 40)) + bg * Math.min(1, horizons[k] / 40), 0, 1)),
    p50: res.map((arr) => [...arr].sort((a, b) => a - b)[Math.floor(members / 2)]),
    p90: res.map((arr) => [...arr].sort((a, b) => a - b)[Math.floor(members * 0.9)]),
  };
}

/** Previsión previa a la carrera: simula muchos futuros posibles del día. */
export function preRaceOutlook(seed: number, trueScenario: Scenario, quality: number, durationMin: number) {
  const rng = new Rng(seed ^ 0x5eed);
  // el meteorólogo puede equivocarse de escenario
  const miss = (1 - quality / 100) * 0.6;
  let rainy = 0, temps: number[] = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const sc: Scenario = rng.chance(miss) ? rng.pick(["seco", "chubascos", "frente", "llovizna"] as const) : trueScenario;
    const w = createWeather(new Rng(rng.int(1, 1e9)), sc);
    temps.push(w.airT);
    let wet = false;
    for (let t = 0; t < durationMin; t += 2) {
      stepWeather(w, 2);
      if (rainAt(w, 0, 0) > 0.5) { wet = true; break; }
    }
    if (wet) rainy++;
  }
  temps.sort((a, b) => a - b);
  return { rainProb: rainy / N, airLow: temps[Math.floor(N * 0.1)], airHigh: temps[Math.floor(N * 0.9)] };
}
