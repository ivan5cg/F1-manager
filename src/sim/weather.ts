// Tiempo dinámico y localizado.
// La lluvia son células gaussianas que nacen, crecen, se desplazan con el viento en altura y se
// disipan. Hay células grandes (frentes, bandas) y pequeñas (chubascos de 0,3-1,2 km) que mojan
// solo una parte del circuito. La temperatura sigue el ciclo del día según el clima del lugar y
// la época, con sol y nubes. El radar ve el campo real; la previsión del equipo extrapola lo que
// ve con errores y no sabe qué células nacerán: de ahí la incertidumbre.
import { Rng, clamp } from "./rng";

export type Scenario = "seco" | "chubascos" | "frente" | "llovizna";
export const SCENARIO_NAMES: Record<Scenario, string> = {
  seco: "Estable",
  chubascos: "Chubascos",
  frente: "Frente de lluvia",
  llovizna: "Cubierto con llovizna",
};

export interface Climate {
  latitud: number;
  maxima: number; // °C media de máximas en esa época
  minima: number;
  dispersion: number; // desviación día a día
  sol: number; // calentamiento máximo del asfalto con sol (°C)
  viento: number; // km/h medio en superficie
  pequenas: number; // fracción de chubascos pequeños (muy localizados)
  pesos: Record<Scenario, number>;
  tardeConvectiva: number; // 0..1: cuánto se concentran las tormentas por la tarde
}

export interface Cell {
  x: number; y: number; // km respecto al circuito
  vx: number; vy: number; // km/min
  sigma: number; // km
  peak: number; // mm/h
  age: number; life: number; // min
}

export interface WeatherState {
  scenario: Scenario;
  clock: number; // minutos desde medianoche (hora local)
  cells: Cell[];
  windDir: number; // rad, hacia dónde sopla en altura
  windSpeed: number; // km/h en altura (mueve las células)
  surfaceWind: number;
  airT: number;
  trackT: number;
  high: number; // máxima del día
  low: number;
  cloud: number;
  baseCloud: number;
  drizzle: number;
  frontAt: number; // minuto del día en que llega el frente
  frontDist: number;
  climate: Climate;
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
    const s2 = c.sigma * c.sigma;
    if (d2 > 16 * s2) continue;
    r += c.peak * envelope(c) * Math.exp(-d2 / (2 * s2));
  }
  return r;
}

function cloudAt(w: WeatherState, x: number, y: number): number {
  let c = w.baseCloud;
  for (const cell of w.cells) {
    const s = Math.max(2, cell.sigma * 2.5);
    const dx = x - cell.x, dy = y - cell.y;
    c += 0.8 * Math.min(1, envelope(cell) * 1.5) * Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
  }
  return clamp(c, 0, 1);
}

/** Factor 0..1 de la convección según la hora (máximo a media tarde). */
function convection(clockMin: number) {
  const h = clockMin / 60;
  return Math.exp(-Math.pow((h - 16) / 2.6, 2));
}

/** Elevación solar relativa (0..1) según la hora. */
function sunFactor(clockMin: number) {
  const h = clockMin / 60;
  return clamp(Math.sin((Math.PI * (h - 6.5)) / 13), 0, 1);
}

/** Temperatura del aire "de cielo despejado" según la hora: mínima al alba, máxima a las 15:00. */
function diurnal(w: WeatherState) {
  const h = w.clock / 60;
  const f = h < 6 ? 0 : clamp(Math.sin((Math.PI * (h - 6)) / 18), 0, 1);
  return w.low + (w.high - w.low) * f;
}

function spawnCell(w: WeatherState, mode: "upwind" | "inplace" | "front", along = 0, small = false): Cell {
  const r = w.rng;
  const sp = w.windSpeed / 60;
  const ux = Math.cos(w.windDir), uy = Math.sin(w.windDir);
  const px = -uy, py = ux;
  let dist: number, lat: number;
  if (mode === "upwind") { dist = r.range(20, 50); lat = r.range(-28, 28); }
  else if (mode === "front") { dist = w.frontDist + r.range(-4, 4); lat = along; }
  else if (small) { dist = r.range(-9, 9); lat = r.range(-9, 9); } // la convección local nace cerca
  else { dist = r.range(-18, 18); lat = r.range(-18, 18); }
  const dir = w.windDir + r.gauss(0, 0.15);
  const spd = sp * r.logn(0.15);
  let peak: number, sigma: number, life: number;
  if (small) {
    peak = clamp(r.logn(0.7) * 12, 1, 70);
    sigma = r.range(0.5, 1.6);
    life = r.range(20, 55);
  } else {
    peak = w.scenario === "chubascos" ? r.logn(0.7) * 9 : w.scenario === "frente" ? r.logn(0.5) * 7 : r.logn(0.4) * 2;
    sigma = mode === "front" ? r.range(3, 6) : r.range(1.5, 4.5);
    life = r.range(40, 120);
  }
  return {
    x: -ux * dist + px * lat, y: -uy * dist + py * lat,
    vx: Math.cos(dir) * spd, vy: Math.sin(dir) * spd,
    sigma, peak: clamp(peak, 0.4, 50),
    age: mode === "inplace" ? 0 : r.range(0.1, 0.4) * life,
    life,
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

export function pickScenario(rng: Rng, climate: Climate, prev?: Scenario): Scenario {
  // persistencia: el tiempo de un día se parece al del anterior
  if (prev && rng.chance(0.45)) return prev;
  return rng.weighted<Scenario>(Object.entries(climate.pesos) as [Scenario, number][]);
}

/** Crea el tiempo de un día a la hora startMin (minutos locales). */
export function createDayWeather(rng: Rng, climate: Climate, scenario: Scenario, anomaly: number, startMin = 9 * 60): WeatherState {
  const wetDay = scenario !== "seco";
  const high = climate.maxima + anomaly - (wetDay ? 1.5 : 0) + rng.gauss(0, 0.8);
  const low = climate.minima + anomaly * 0.6 + rng.gauss(0, 0.8);
  const w: WeatherState = {
    scenario,
    clock: startMin,
    cells: [],
    windDir: rng.range(0, 2 * Math.PI),
    windSpeed: rng.range(18, 50),
    surfaceWind: clamp(climate.viento * rng.logn(0.35), 2, 45),
    airT: 0, trackT: 0, high, low,
    cloud: 0,
    baseCloud: scenario === "seco" ? rng.range(0, 0.35) : scenario === "llovizna" ? rng.range(0.75, 0.95) : rng.range(0.25, 0.6),
    drizzle: scenario === "llovizna" ? rng.range(0, 0.3) : 0,
    frontAt: rng.range(10 * 60, 18 * 60),
    frontDist: 43,
    climate,
    rng,
  };
  const n = scenario === "chubascos" ? rng.int(2, 6) : scenario === "seco" ? rng.int(0, 2) : scenario === "frente" ? rng.int(1, 3) : rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const c = spawnCell(w, rng.chance(0.5) ? "upwind" : "inplace", 0, rng.chance(climate.pequenas * 0.5));
    if (scenario === "seco") { c.peak *= 0.4; c.x *= 1.8; c.y *= 1.8; }
    c.age = rng.range(0, c.life * 0.7);
    w.cells.push(c);
  }
  if (scenario === "frente") {
    const travel = 43 / (w.windSpeed / 60);
    if (w.frontAt - startMin < travel) { w.frontDist = Math.max(5, (w.windSpeed / 60) * (w.frontAt - startMin)); spawnFront(w); }
  }
  w.cloud = cloudAt(w, 0, 0);
  w.airT = diurnal(w);
  w.trackT = w.airT + climate.sol * (1 - w.cloud) * sunFactor(w.clock) + 1;
  return w;
}

/** Avanza el tiempo dtMin minutos. */
export function stepWeather(w: WeatherState, dtMin: number): void {
  const r = w.rng;
  const cl = w.climate;
  const prevClock = w.clock;
  w.clock += dtMin;
  for (const c of w.cells) {
    c.x += c.vx * dtMin;
    c.y += c.vy * dtMin;
    c.age += dtMin;
    c.peak = clamp(c.peak * Math.exp(r.gauss(0, 0.05) * Math.sqrt(dtMin)), 0.3, 50);
  }
  w.cells = w.cells.filter((c) => c.age < c.life && Math.hypot(c.x, c.y) < 90);
  // nacimientos: los chubascos dependen de la hora (convección de tarde)
  const conv = 1 - cl.tardeConvectiva + cl.tardeConvectiva * 1.8 * convection(w.clock);
  const base = { seco: 0.01, chubascos: 0.2, frente: 0.04, llovizna: 0.05 }[w.scenario];
  if (r.chance(base * conv * dtMin)) {
    const small = r.chance(cl.pequenas);
    w.cells.push(spawnCell(w, small || r.chance(0.5) ? "inplace" : "upwind", 0, small));
  }
  // incluso en días estables puede saltar un chubasco aislado por la tarde
  if (w.scenario === "seco" && r.chance(0.004 * cl.pequenas * convection(w.clock) * cl.tardeConvectiva * dtMin * 3)) {
    w.cells.push(spawnCell(w, "inplace", 0, true));
  }
  if (w.scenario === "frente") {
    const travel = 43 / (w.windSpeed / 60);
    const spawnAt = w.frontAt - travel;
    if (prevClock < spawnAt && w.clock >= spawnAt) spawnFront(w);
  }
  if (w.scenario === "llovizna") {
    w.drizzle = clamp(w.drizzle + r.gauss(0, 0.07) * Math.sqrt(dtMin) - 0.01 * (w.drizzle - 0.35) * dtMin, 0, 1.4);
  }
  w.windDir += r.gauss(0, 0.01) * Math.sqrt(dtMin);
  w.surfaceWind = clamp(w.surfaceWind + r.gauss(0, 0.5) * Math.sqrt(dtMin) - 0.02 * (w.surfaceWind - cl.viento) * dtMin, 2, 45);
  w.baseCloud = clamp(w.baseCloud + r.gauss(0, 0.02) * Math.sqrt(dtMin), 0, 1);

  w.cloud = cloudAt(w, 0, 0);
  const rainHere = rainAt(w, 0, 0);
  const airEq = diurnal(w) - 3.5 * Math.min(1, rainHere / 4) - 2 * w.cloud * sunFactor(w.clock);
  w.airT += ((airEq - w.airT) * dtMin) / 12;
  const trackEq = w.airT + cl.sol * (1 - w.cloud) * sunFactor(w.clock) + 1 - (rainHere > 0.2 ? 3 + 4 * Math.min(1, rainHere / 5) : 0);
  w.trackT += ((trackEq - w.trackT) * dtMin) / 9;
}

/** Copia profunda (para previsiones que no alteran el estado real). */
export function cloneWeather(w: WeatherState, rng: Rng): WeatherState {
  return { ...w, cells: w.cells.map((c) => ({ ...c })), rng };
}

export interface Forecast {
  horizons: number[];
  prob: number[]; // prob. de lluvia > 0,3 mm/h en algún punto del circuito
  p50: number[];
  p90: number[];
}

/** Previsión por conjunto: extrapola las células visibles con errores. pts: puntos del circuito (km). */
export function forecast(w: WeatherState, quality: number, rng: Rng, members = 30, horizons = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60], pts: [number, number][] = [[0, 0]]): Forecast {
  const res: number[][] = horizons.map(() => []);
  const err = 1.4 - quality / 100;
  for (let m = 0; m < members; m++) {
    const dDir = rng.gauss(0, 0.2 * err);
    const dSpd = rng.logn(0.18 * err);
    const cells = w.cells.map((c) => {
      const ang = Math.atan2(c.vy, c.vx) + dDir;
      const sp = Math.hypot(c.vx, c.vy) * dSpd;
      return { ...c, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, peak: c.peak * envelope(c) * rng.logn(0.45 * err), remain: (c.life - c.age) * rng.logn(0.6) };
    });
    horizons.forEach((h, k) => {
      let rmax = 0;
      for (const [px, py] of pts) {
        let r = w.drizzle * rng.logn(0.3);
        for (const c of cells) {
          if (h > c.remain + 10) continue;
          const fade = h > c.remain ? 1 - (h - c.remain) / 10 : 1;
          const x = c.x + c.vx * h - px, y = c.y + c.vy * h - py;
          r += c.peak * fade * Math.exp(-(x * x + y * y) / (2 * c.sigma * c.sigma));
        }
        rmax = Math.max(rmax, r);
      }
      res[k].push(rmax);
    });
  }
  // lo que aún no existe: el meteorólogo conoce el patrón del día y la hora
  const conv = 1 - w.climate.tardeConvectiva + w.climate.tardeConvectiva * 1.8 * convection(w.clock + 20);
  const bg = { seco: 0.02, chubascos: 0.16, frente: 0.05, llovizna: 0.22 }[w.scenario] * conv;
  return {
    horizons,
    prob: res.map((arr, k) => {
      const f = Math.min(1, horizons[k] / 40);
      return clamp((arr.filter((x) => x > 0.3).length / members) * (1 - bg * f) + bg * f, 0, 1);
    }),
    p50: res.map((arr) => [...arr].sort((a, b) => a - b)[Math.floor(members / 2)]),
    p90: res.map((arr) => [...arr].sort((a, b) => a - b)[Math.floor(members * 0.9)]),
  };
}
