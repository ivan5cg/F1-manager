// Geometría del circuito + simulación cuasiestática de vuelta (masa puntual con aerodinámica).
// De la curvatura sale la velocidad límite en cada punto; con pasadas de aceleración y frenada
// se obtiene el perfil de velocidad. De ahí salen las sensibilidades de cada minisector a la
// adherencia, la potencia, la resistencia y la masa, que usa el simulador de carrera.

export interface CarParams {
  mass: number; // kg (coche + piloto + combustible)
  power: number; // W
  cdA: number; // m²
  clA: number; // m²
  mu: number; // coeficiente de adherencia neumático-asfalto
  rho: number; // densidad del aire
}

export const REF_CAR: CarParams = { mass: 850, power: 760000, cdA: 1.45, clA: 3.7, mu: 1.75, rho: 1.18 };

export interface Minisector {
  i: number;
  s0: number; // inicio (m)
  s1: number;
  sector: number; // 0,1,2
  /** tiempo de referencia con la adherencia relativa de la tabla GRIP_GRID */
  tByGrip: number[];
  dPower: number; // s por +1 % de potencia
  dDrag: number; // s por -1 % de resistencia
  dMass: number; // s por +1 kg
  throttle: number; // fracción de tiempo a fondo
  energyF: number; // energía de neumáticos delanteros (fracción de la vuelta)
  energyR: number;
  cornerSens: number; // cuánto depende de la adherencia (0..1, relativo)
  overtake: number; // 0 = no se adelanta; >0 dificultad inversa (zona de frenada)
  drs: boolean;
  drsDetect: boolean;
  x: number; y: number; // punto medio para el tiempo/radar
}

export interface Track {
  name: string;
  laps: number;
  length: number;
  ds: number;
  xs: Float64Array; ys: Float64Array; // trazado remuestreado
  vref: Float64Array; // velocidad de referencia (m/s)
  curv: Float64Array;
  ms: Minisector[];
  msOfPoint: Int32Array;
  pit: { entry: number; exit: number; laneLength: number; limit: number };
  abrasiveness: number;
  refLap: number;
}

export const GRIP_GRID = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1];

function catmullRom(pts: number[][], samplesPerSeg: number): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    // centrípeta (alpha = 0.5) para evitar bucles
    const d = (a: number[], b: number[]) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-6;
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / samplesPerSeg;
      const L = (a: number[], b: number[], ta: number, tb: number) => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
      };
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}

function resample(pts: number[][], ds: number) {
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const n = Math.round(total / ds);
  const step = total / n;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * step;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % pts.length];
    const w = (s - cum[j]) / (cum[j + 1] - cum[j]);
    xs[k] = a[0] + (b[0] - a[0]) * w;
    ys[k] = a[1] + (b[1] - a[1]) * w;
  }
  return { xs, ys, length: total, ds: step };
}

function curvature(xs: Float64Array, ys: Float64Array, ds: number): Float64Array {
  const n = xs.length;
  const k = new Float64Array(n);
  const w = 3; // puntos a cada lado
  for (let i = 0; i < n; i++) {
    const a = (i - w + n) % n, b = (i + w) % n;
    const h1 = Math.atan2(ys[i] - ys[a], xs[i] - xs[a]);
    const h2 = Math.atan2(ys[b] - ys[i], xs[b] - xs[i]);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    k[i] = dh / (w * ds);
  }
  // suavizado
  const out = new Float64Array(n);
  const sw = 4;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -sw; j <= sw; j++) s += k[(i + j + n) % n];
    out[i] = s / (2 * sw + 1);
  }
  return out;
}

export interface LapSimResult {
  v: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  time: number;
  dt: Float64Array; // tiempo en cada tramo ds
}

/** Simulación cuasiestática de vuelta. gripScale: array opcional de multiplicadores locales de mu. */
export function lapSim(curv: Float64Array, ds: number, car: CarParams, gripScale?: (i: number) => number, dragScale?: (i: number) => number): LapSimResult {
  const n = curv.length;
  const g = 9.81;
  const vmaxLat = new Float64Array(n);
  const mu = (i: number) => car.mu * (gripScale ? gripScale(i) : 1);
  const cd = (i: number) => car.cdA * (dragScale ? dragScale(i) : 1);
  for (let i = 0; i < n; i++) {
    const R = 1 / Math.max(Math.abs(curv[i]), 1e-5);
    const m = mu(i);
    const den = 1 - (m * car.rho * car.clA * R) / (2 * car.mass);
    vmaxLat[i] = den <= 0.02 ? 110 : Math.min(110, Math.sqrt((m * g * R) / den));
  }
  const latUse = (i: number, v: number) => {
    const ayMax = (mu(i) * (car.mass * g + 0.5 * car.rho * car.clA * v * v)) / car.mass;
    const ay = v * v * Math.abs(curv[i]);
    return { ayMax, ay, r: Math.min(1, ay / ayMax) };
  };
  // pasada hacia delante (aceleración), dos vueltas para cerrar el ciclo
  const vf = new Float64Array(n);
  let v = 30;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < n; i++) {
      v = Math.min(v, vmaxLat[i]);
      vf[i] = v;
      const { ayMax, r } = latUse(i, v);
      const fric = Math.sqrt(Math.max(0, 1 - r * r));
      const df = 0.5 * car.rho * car.clA * v * v;
      const traction = mu(i) * 0.6 * (car.mass * g + df) * fric; // eje trasero ~ 60 % de la carga tracción
      const drive = Math.min(car.power / Math.max(v, 5), traction);
      const drag = 0.5 * car.rho * cd(i) * v * v + 0.012 * car.mass * g;
      const a = (drive - drag) / car.mass;
      void ayMax;
      v = Math.sqrt(Math.max(1, v * v + 2 * a * ds));
    }
  }
  // pasada hacia atrás (frenada)
  const vb = new Float64Array(n);
  v = vf[0];
  for (let lap = 0; lap < 2; lap++) {
    for (let i = n - 1; i >= 0; i--) {
      v = Math.min(v, vf[i]);
      vb[i] = v;
      const { r } = latUse(i, v);
      const fric = Math.sqrt(Math.max(0, 1 - r * r));
      const df = 0.5 * car.rho * car.clA * v * v;
      const brake = mu(i) * (car.mass * g + df) * fric * 0.97;
      const drag = 0.5 * car.rho * cd(i) * v * v;
      const a = (brake + drag) / car.mass;
      v = Math.sqrt(v * v + 2 * a * ds);
    }
  }
  const ax = new Float64Array(n), ay = new Float64Array(n), dt = new Float64Array(n);
  let time = 0;
  for (let i = 0; i < n; i++) {
    const v0 = vb[i], v1 = vb[(i + 1) % n];
    const vm = Math.max(1, (v0 + v1) / 2);
    dt[i] = ds / vm;
    time += dt[i];
    ax[i] = (v1 * v1 - v0 * v0) / (2 * ds);
    ay[i] = v0 * v0 * curv[i];
  }
  return { v: vb, ax, ay, time, dt };
}

export function buildTrack(def: any): Track {
  const pts: number[][] = def.puntos.map((p: number[]) => [p[0] * def.escala, p[1] * def.escala]);
  const dense = catmullRom(pts, 40);
  const { xs, ys, length, ds } = resample(dense, 4);
  const curv = curvature(xs, ys, ds);
  const n = xs.length;
  const base = lapSim(curv, ds, REF_CAR);

  const N = def.minisectores as number;
  const msOfPoint = new Int32Array(n);
  const bounds: number[] = [];
  for (let k = 0; k <= N; k++) bounds.push(Math.round((k * n) / N));
  for (let k = 0; k < N; k++) for (let i = bounds[k]; i < bounds[k + 1]; i++) msOfPoint[i] = k;

  const sumMs = (dt: Float64Array) => {
    const out = new Array(N).fill(0);
    for (let i = 0; i < n; i++) out[msOfPoint[i]] += dt[i];
    return out;
  };
  const tGrid = GRIP_GRID.map((gs) => sumMs(lapSim(curv, ds, REF_CAR, () => gs).dt));
  const t0 = tGrid[GRIP_GRID.indexOf(1.0)];
  const tPow = sumMs(lapSim(curv, ds, { ...REF_CAR, power: REF_CAR.power * 1.01 }).dt);
  const tDrag = sumMs(lapSim(curv, ds, { ...REF_CAR, cdA: REF_CAR.cdA * 0.99 }).dt);
  const tMass = sumMs(lapSim(curv, ds, { ...REF_CAR, mass: REF_CAR.mass + 10 }).dt);
  const tG = sumMs(lapSim(curv, ds, REF_CAR, () => 1.01).dt);

  // energía de neumáticos: delantero ~ lateral + frenada, trasero ~ lateral + tracción
  const eF = new Array(N).fill(0), eR = new Array(N).fill(0), thr = new Array(N).fill(0);
  for (let i = 0; i < n; i++) {
    const v = base.v[i];
    const lat = Math.abs(base.ay[i]) * v * base.dt[i];
    const lon = base.ax[i] * v * base.dt[i];
    const k = msOfPoint[i];
    eF[k] += lat * 0.55 + Math.max(0, -lon) * 0.6;
    eR[k] += lat * 0.45 + Math.max(0, lon) * 1.0 + Math.max(0, -lon) * 0.4;
    // a fondo: aceleración positiva y casi sin curva
    if (base.ax[i] > -0.5 && Math.abs(base.ay[i]) < 8) thr[k] += base.dt[i];
  }
  const totF = eF.reduce((a, b) => a + b, 0), totR = eR.reduce((a, b) => a + b, 0);
  const totE = (totF + totR) / 2;

  const ms: Minisector[] = [];
  const gSens = t0.map((t, k) => t - tG[k]);
  const maxSens = Math.max(...gSens.map((s, k) => s / t0[k]));
  for (let k = 0; k < N; k++) {
    const mid = Math.floor((bounds[k] + bounds[k + 1]) / 2);
    ms.push({
      i: k,
      s0: bounds[k] * ds,
      s1: bounds[k + 1] * ds,
      sector: Math.min(2, Math.floor((3 * k) / N)),
      tByGrip: tGrid.map((row) => row[k]),
      dPower: t0[k] - tPow[k],
      dDrag: t0[k] - tDrag[k],
      dMass: (tMass[k] - t0[k]) / 10,
      throttle: thr[k] / t0[k],
      energyF: eF[k] / totE,
      energyR: eR[k] / totE,
      cornerSens: gSens[k] / t0[k] / maxSens,
      overtake: 0,
      drs: false,
      drsDetect: false,
      x: xs[mid],
      y: ys[mid],
    });
  }
  // Zonas de adelantamiento: minisector con frenada fuerte desde alta velocidad.
  for (let k = 0; k < N; k++) {
    let vmax = 0, vmin = 999;
    for (let i = bounds[k]; i < bounds[k + 1]; i++) {
      vmax = Math.max(vmax, base.v[i]);
      vmin = Math.min(vmin, base.v[i]);
    }
    // recta previa: tiempo a fondo en los dos minisectores anteriores
    const prev = ms[(k - 1 + N) % N], prev2 = ms[(k - 2 + N) % N];
    const straight = (prev.throttle + prev2.throttle) / 2;
    const drop = (vmax - vmin) * 3.6;
    if (drop > 90 && straight > 0.6) ms[k].overtake = Math.min(1, (drop - 60) / 180) * straight;
  }
  // DRS: los dos tramos más largos a fondo
  const runs: { start: number; len: number }[] = [];
  let k = 0;
  while (k < N) {
    if (ms[k].throttle > 0.85) {
      let j = k;
      while (j < N && ms[j].throttle > 0.85) j++;
      runs.push({ start: k, len: j - k });
      k = j;
    } else k++;
  }
  // une la recta que cruza la meta
  if (runs.length > 1 && runs[0].start === 0 && runs[runs.length - 1].start + runs[runs.length - 1].len === N) {
    const last = runs.pop()!;
    runs[0] = { start: last.start, len: last.len + runs[0].len };
  }
  runs.sort((a, b) => b.len - a.len);
  for (const r of runs.slice(0, 2)) {
    for (let j = 0; j < r.len; j++) ms[(r.start + j) % N].drs = true;
    ms[(r.start - 1 + N) % N].drsDetect = true;
  }

  return {
    name: def.nombre,
    laps: def.vueltas,
    length,
    ds,
    xs, ys,
    vref: base.v,
    curv,
    ms,
    msOfPoint,
    pit: { entry: length - def.boxes.entrada, exit: def.boxes.salida, laneLength: def.boxes.longitudCalle, limit: def.boxes.limite / 3.6 },
    abrasiveness: def.abrasividad,
    refLap: base.time,
  };
}

/** Tiempo del minisector para una adherencia relativa dada (interpolado en la rejilla). */
export function msTimeAtGrip(m: Minisector, grip: number): number {
  const g = GRIP_GRID;
  if (grip <= g[0]) return m.tByGrip[0] * (1 + (g[0] - grip) * 2);
  if (grip >= g[g.length - 1]) {
    const n = g.length - 1;
    const slope = (m.tByGrip[n] - m.tByGrip[n - 1]) / (g[n] - g[n - 1]);
    return m.tByGrip[n] + slope * (grip - g[n]);
  }
  const idx = Math.min(g.length - 2, Math.floor((grip - g[0]) / 0.05));
  const w = (grip - g[idx]) / (g[idx + 1] - g[idx]);
  return m.tByGrip[idx] * (1 - w) + m.tByGrip[idx + 1] * w;
}
