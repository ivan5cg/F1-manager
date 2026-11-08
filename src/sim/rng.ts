// Generador pseudoaleatorio con semilla: la misma semilla reproduce la misma carrera.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  /** Uniforme en [0, 1). mulberry32 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Normal estándar (Box-Muller) */
  gauss(mu = 0, sigma = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Lognormal con mediana 1 y dispersión sigma */
  logn(sigma: number): number {
    return Math.exp(this.gauss(0, sigma));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: readonly [T, number][]): T {
    const tot = items.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * tot;
    for (const [it, w] of items) {
      r -= w;
      if (r <= 0) return it;
    }
    return items[items.length - 1][0];
  }
  /** Rng hijo independiente (para que sistemas distintos no se acoplen) */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolación lineal en una tabla [[x, y], ...] ordenada por x */
export function interp(table: readonly (readonly [number, number])[], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}
