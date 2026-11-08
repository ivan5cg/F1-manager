// Radar meteorológico: campo de lluvia pintado con la paleta por bandas de los radares reales.
import { RadarFrame, cellRain, fbm } from "../sim/weather";

/** Bandas de intensidad (mm/h) y su color. */
export const RADAR_STEPS: [number, string][] = [
  [0.1, "#9be1ff"], [0.3, "#4fb3ff"], [0.6, "#1f6fff"], [1, "#16b34a"], [2, "#0a8a32"],
  [4, "#e9e23a"], [7, "#ffb11a"], [12, "#ff6a00"], [20, "#e5121f"], [35, "#a8006e"], [60, "#ff4de1"],
];
const STEPS_RGB = RADAR_STEPS.map(([v, hex]) => [v, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const);

/** Campo de lluvia de un fotograma en una ventana (cx, cy, radio R en km) de S×S píxeles. */
export function renderField(f: RadarFrame, cx: number, cy: number, R: number, S: number, H = S): Float32Array {
  const out = new Float32Array(S * H);
  const kx = (2 * R) / S, ky = (2 * R * H) / S / H;
  const x0 = cx - R, y0 = cy + (R * H) / S;
  for (const c of f.cells) {
    const rad = c.sigma * Math.max(1, c.ax) * 3.5;
    const i0 = Math.max(0, Math.floor((c.x - rad - x0) / kx)), i1 = Math.min(S - 1, Math.ceil((c.x + rad - x0) / kx));
    const j0 = Math.max(0, Math.floor((y0 - (c.y + rad)) / ky)), j1 = Math.min(H - 1, Math.ceil((y0 - (c.y - rad)) / ky));
    for (let j = j0; j <= j1; j++) {
      const y = y0 - (j + 0.5) * ky;
      for (let i = i0; i <= i1; i++) out[j * S + i] += cellRain(c, x0 + (i + 0.5) * kx, y);
    }
  }
  if (f.drizzle > 0) for (let j = 0; j < H; j++) for (let i = 0; i < S; i++) {
    const x = x0 + (i + 0.5) * kx, y = y0 - (j + 0.5) * ky;
    out[j * S + i] += f.drizzle * (0.4 + 1.2 * fbm(x * 0.15, y * 0.15 + f.clock * 0.01, 7));
  }
  return out;
}

/** Colorea el campo sobre un fondo (o transparente si bg es null). */
export function colorize(field: Float32Array, S: number, H: number, bg: ((i: number, j: number) => [number, number, number]) | null, alpha = 235): ImageData {
  const img = new ImageData(S, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < S; i++) {
    const v = field[j * S + i];
    const o = (j * S + i) * 4;
    let k = -1;
    for (let s = STEPS_RGB.length - 1; s >= 0; s--) if (v >= STEPS_RGB[s][0]) { k = s; break; }
    if (k >= 0) {
      const st = STEPS_RGB[k];
      img.data[o] = st[1]; img.data[o + 1] = st[2]; img.data[o + 2] = st[3]; img.data[o + 3] = alpha;
    } else if (bg) {
      const [r, g, b] = bg(i, j);
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  return img;
}

/** Fondo de mapa oscuro con un relieve sutil. */
export function terrain(cx: number, cy: number, R: number, S: number) {
  return (i: number, j: number): [number, number, number] => {
    const x = cx - R + ((i + 0.5) / S) * 2 * R, y = cy + R - ((j + 0.5) / S) * 2 * R;
    const n = fbm(x * 0.12 + 40, y * 0.12 + 40, 99);
    const v = 14 + n * 16;
    return [v * 0.9, v * 1.02, v * 0.95 + 4];
  };
}

export const fmtHour = (clock: number) => `${String(Math.floor(clock / 60) % 24).padStart(2, "0")}:${String(Math.floor(clock % 60)).padStart(2, "0")}`;
