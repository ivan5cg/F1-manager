// Lo que comparten los tests del banco: carreras en seco con la parrilla por ritmo (scripts/banco.ts, como
// scripts/auditoria/rapida.ts) y sus números. Deterministas: las mismas semillas dan siempre lo mismo mientras no
// cambie el código.
import { benchRace } from "../scripts/banco";

export interface RaceStats {
  pass: number; // adelantamientos sin la primera vuelta
  stops: number; // paradas por coche que acaba
  /** Cambios de neumáticos por coche que acaba: las paradas y los cambios con bandera roja (que no son parada). */
  changes: number;
  lapped: number; // doblados entre los que acaban
  usedH: number; // fracción de los que acaban que usan el duro
  usedS: number;
  dsq: number;
  finished: number;
  poleWins: boolean;
}

export function runRace(id: string, seed: number): RaceStats {
  const s = benchRace(id, seed, true, false);
  while (!s.finished && s.wall < 4 * 3600) s.step();
  const res = s.results();
  const fin = res.filter((r) => r.status === "fin");
  const lead = fin[0]?.laps ?? 0;
  const used = (c: string) => fin.filter((r) => s.carById(r.id).stintLog.some((x) => x.c === c)).length / Math.max(1, fin.length);
  return {
    pass: s.passCount - s.passLap1,
    stops: fin.reduce((a, r) => a + r.stops, 0) / Math.max(1, fin.length),
    changes: fin.reduce((a, r) => a + s.carById(r.id).stintLog.length - 1, 0) / Math.max(1, fin.length),
    lapped: fin.filter((r) => r.laps < lead).length,
    usedH: used("H"),
    usedS: used("S"),
    dsq: res.filter((r) => r.status === "dsq").length,
    finished: fin.length,
    poleWins: res[0]?.grid === 1,
  };
}

export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

/** Las carreras de un circuito con varias semillas, resumidas. */
export function circuitStats(id: string, seeds: number[]) {
  const r = seeds.map((sd) => runRace(id, sd));
  return {
    races: r,
    pass: mean(r.map((x) => x.pass)),
    stops: mean(r.map((x) => x.stops)),
    changes: mean(r.map((x) => x.changes)),
    lapped: mean(r.map((x) => x.lapped)),
    usedH: mean(r.map((x) => x.usedH)),
    dsq: r.reduce((a, x) => a + x.dsq, 0),
    finished: Math.min(...r.map((x) => x.finished)),
  };
}

/** Margen alrededor de un valor de referencia (el de la calibración de noviembre de 2026). */
export const around = (ref: number, k: number): [number, number] => [ref * (1 - k), ref * (1 + k)];
