// Tiempo dinámico y localizado.
// La lluvia son células que nacen, crecen, se desplazan con el viento en altura y se disipan.
// Cada célula tiene forma elíptica (alargada por el viento o, en un frente, en banda), bordes
// irregulares y núcleos internos (ruido fractal que se mueve con ella y cambia con la edad): lo
// que ve el radar es exactamente lo que cae en cada punto del circuito. Hay células grandes (frentes, bandas) y pequeñas (chubascos de 0,3-1,2 km) que mojan
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
  sigma: number; // km (eje corto)
  ax: number; // alargamiento (eje largo / eje corto)
  ang: number; // orientación del eje largo (rad)
  peak: number; // mm/h
  age: number; life: number; // min
  seed: number; // textura propia
}

/** Fotograma del radar: las células en un momento dado. */
export interface RadarFrame { clock: number; cells: Cell[]; drizzle: number }

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
  history: RadarFrame[]; // últimos 30 min, un fotograma cada 3 min
}

const envelope = (c: Cell) => {
  const p = c.age / c.life;
  if (p < 0 || p > 1) return 0;
  if (p < 0.25) return p / 0.25;
  if (p > 0.6) return (1 - p) / 0.4;
  return 1;
};

// ruido de valores 2D con varias octavas (determinista)
function hash(ix: number, iy: number, s: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x: number, y: number, s: number) {
  return 0.5 * vnoise(x, y, s) + 0.3 * vnoise(x * 2.07 + 5.3, y * 2.07 + 1.7, s + 17) + 0.2 * vnoise(x * 4.3 + 9.1, y * 4.3 + 3.3, s + 31);
}

/** Lluvia (mm/h) que deja una célula en el punto (x, y). */
export function cellRain(c: Cell, x: number, y: number): number {
  const e = envelope(c);
  if (e <= 0) return 0;
  const dx = x - c.x, dy = y - c.y;
  const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
  const u = (dx * ca + dy * sa) / (c.sigma * c.ax);
  const v = (-dx * sa + dy * ca) / c.sigma;
  const r2 = u * u + v * v;
  if (r2 > 12) return 0;
  // la textura va con la célula y cambia despacio con la edad
  const n = fbm(u * 1.6 + c.seed, v * 1.6 + c.age * 0.025, (c.seed * 1000) | 0);
  const rr = r2 * (0.5 + 0.95 * n); // bordes irregulares
  // detalle de ~1 km que viaja con la célula: la lluvia cambia de una curva a otra
  const n2 = fbm(dx * 0.9 + c.seed * 3.1, dy * 0.9 + c.age * 0.04, ((c.seed * 777) | 0) + 3);
  return c.peak * e * Math.exp(-rr / 2) * (0.4 + 1.7 * n * n) * (0.45 + 1.1 * n2); // núcleos
}

export function rainAt(w: WeatherState, x: number, y: number): number {
  let r = w.drizzle > 0 ? w.drizzle * (0.4 + 1.2 * fbm(x * 0.15, y * 0.15 + w.clock * 0.01, 7)) : 0;
  for (const c of w.cells) r += cellRain(c, x, y);
  return r;
}

/** Lluvia en un fotograma guardado del radar. */
export function frameRainAt(f: RadarFrame, x: number, y: number): number {
  let r = f.drizzle > 0 ? f.drizzle * (0.4 + 1.2 * fbm(x * 0.15, y * 0.15 + f.clock * 0.01, 7)) : 0;
  for (const c of f.cells) r += cellRain(c, x, y);
  return r;
}

function snapshot(w: WeatherState): RadarFrame {
  return { clock: w.clock, cells: w.cells.map((c) => ({ ...c })), drizzle: w.drizzle };
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
  // forma: los chubascos se alargan un poco con el viento; los frentes forman bandas
  let ax = mode === "front" ? r.range(1.8, 3.2) : small ? r.range(1, 1.5) : r.range(1.1, 1.9);
  let ang = mode === "front" ? w.windDir + Math.PI / 2 + r.gauss(0, 0.15) : w.windDir + r.gauss(0, 0.4);
  if (w.scenario === "llovizna" && !small) { ax = r.range(1.5, 3); ang = r.range(0, Math.PI); }
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
    sigma, ax, ang, peak: clamp(peak, 0.4, 50),
    age: mode === "inplace" ? 0 : r.range(0.1, 0.4) * life,
    life,
    seed: r.range(0, 1000),
  };
}

function spawnFront(w: WeatherState) {
  const r = w.rng;
  const ux = Math.cos(w.windDir), uy = Math.sin(w.windDir);
  for (let lat = -40; lat <= 40; lat += r.range(4, 8)) {
    const c = spawnCell(w, "front", lat);
    c.peak = clamp(r.logn(0.55) * 5, 0.8, 25);
    c.life = r.range(100, 170);
    c.age = r.range(15, 30);
    w.cells.push(c);
    // detrás de la línea activa, lluvia estratiforme más débil y extensa
    if (r.chance(0.6)) {
      const b = spawnCell(w, "front", lat + r.range(-3, 3));
      const back = r.range(8, 16);
      b.x -= ux * back; b.y -= uy * back;
      b.sigma = r.range(5, 9); b.ax = r.range(1.5, 2.5);
      b.peak = clamp(r.logn(0.4) * 1.5, 0.3, 4);
      b.life = r.range(120, 200); b.age = r.range(15, 40);
      w.cells.push(b);
    }
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
    history: [],
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
  w.history = [snapshot(w)];
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
  // radar: un fotograma cada 3 minutos, los últimos 30
  if (Math.floor(prevClock / 3) !== Math.floor(w.clock / 3)) {
    w.history.push(snapshot(w));
    if (w.history.length > 11) w.history.shift();
  }
}

/** Copia profunda (para previsiones que no alteran el estado real). */
export function cloneWeather(w: WeatherState, rng: Rng): WeatherState {
  return { ...w, cells: w.cells.map((c) => ({ ...c })), rng, history: [...w.history] };
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
      return { ...c, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, peak: c.peak * rng.logn(0.45 * err), remain: (c.life - c.age) * rng.logn(0.6) };
    });
    horizons.forEach((h, k) => {
      let rmax = 0;
      for (const [px, py] of pts) {
        let r = w.drizzle * rng.logn(0.3);
        for (const c of cells) {
          if (h > c.remain + 10) continue;
          const fade = h > c.remain ? 1 - (h - c.remain) / 10 : 1;
          r += fade * cellRain({ ...c, x: c.x + c.vx * h, y: c.y + c.vy * h }, px, py);
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
