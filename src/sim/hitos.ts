// El ritual de la temporada (9.4 y 9.6): hitos de tu equipo, récords de cada circuito, trofeos y la gala de fin de año.
// Todo sale de lo que ya guarda la temporada (rondas con sus resultados y resúmenes) y de las temporadas anteriores
// (SeasonRecord.trofeos, ganadores y gala). Sin azar y sin tocar la simulación.
import type { SeasonState, RoundResult } from "./season";
import type { SeasonRecord } from "./career";
import { fmt } from "./session";

/** Quién iba en un asiento en una ronda (índice desde 0) y si es tuyo. */
export type SeatAt = (round: number, seat: number) => { nombre: string; equipo: string; mine: boolean; debut?: number };

export interface Hito { year: number; round: number; circuitId: string; gp: string; icon: string; text: string }
export interface Trofeo { year: number; round: number; circuitId: string; gp: string; nombre: string; pos: number }
export interface Award { icon: string; title: string; who: string; detail: string }
export interface CircuitRecord { t: number; nombre: string; year: number }

const yearOf = (s: SeasonState) => s.year ?? 2026;
const short = (gp: string) => gp.replace(/^Gran Premio (de |del |de la |de los )?/i, "");
const ordinal = (n: number) => ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"][n] ?? `${n}.ª`;
const fin = (r: RoundResult, i: number) => r.race?.[i]?.status === "fin";

/** Tus podios de la temporada en curso (para la sala de trofeos y para contar). */
export function seasonTrofeos(s: SeasonState, at: SeatAt, gpOf: (id: string) => string): Trofeo[] {
  const out: Trofeo[] = [];
  s.rounds.forEach((r, ri) => (r.race ?? []).slice(0, 3).forEach((row, i) => {
    const w = at(ri, row.id);
    if (w.mine && row.status === "fin") out.push({ year: yearOf(s), round: r.round, circuitId: r.circuitId, gp: gpOf(r.circuitId), nombre: w.nombre, pos: i + 1 });
  }));
  return out;
}

/** Todos tus trofeos en la partida: los de las temporadas anteriores y los de esta. */
export const allTrofeos = (s: SeasonState, at: SeatAt, gpOf: (id: string) => string): Trofeo[] =>
  [...(s.history ?? []).flatMap((h) => h.trofeos ?? []), ...seasonTrofeos(s, at, gpOf)];

/** Quién ganó en cada circuito esta temporada (para la previa de las siguientes). */
export function seasonWinners(s: SeasonState, at: SeatAt): Record<string, { nombre: string; equipo: string }> {
  const out: Record<string, { nombre: string; equipo: string }> = {};
  s.rounds.forEach((r, ri) => { if (r.race?.[0]) { const w = at(ri, r.race[0].id); out[r.circuitId] = { nombre: w.nombre, equipo: w.equipo }; } });
  return out;
}

/**
 * Hitos tras la carrera recién corrida (la última de s.rounds): primeras victorias y podios, dobletes, rachas,
 * victorias y carreras redondas, primeros puntos y récords del circuito. También pone al día los récords.
 */
export function hitosAfterRace(s: SeasonState, at: SeatAt, gpOf: (id: string) => string): Hito[] {
  const ri = s.rounds.length - 1, r = s.rounds[ri];
  if (!r?.race) return [];
  const gp = gpOf(r.circuitId), base = { year: yearOf(s), round: r.round, circuitId: r.circuitId, gp };
  const out: Hito[] = [];
  const add = (icon: string, text: string) => out.push({ ...base, icon, text });
  const now = allTrofeos(s, at, gpOf), before = now.filter((t) => !(t.year === base.year && t.round === r.round));
  const mine = (i: number) => r.race![i] && at(ri, r.race![i].id).mine && fin(r, i);
  const name = (i: number) => at(ri, r.race![i].id).nombre;
  const team = at(ri, r.race[0].id).mine ? at(ri, r.race[0].id).equipo : r.race.map((x) => at(ri, x.id)).find((w) => w.mine)?.equipo ?? "Tu equipo";
  const wins = (list: Trofeo[], who?: string) => list.filter((t) => t.pos === 1 && (!who || t.nombre === who)).length;
  if (mine(0)) {
    const w = name(0), teamWins = wins(now);
    if (wins(before) === 0) add("🏆", `¡Primera victoria de ${team}!`);
    else if (!before.some((t) => t.pos === 1 && t.year === base.year)) add("🏆", `Primera victoria de ${team} en ${base.year}`);
    if (wins(before, w) === 0 && wins(before) > 0) add("🥇", `Primera victoria de ${w} con ${team}`);
    if ([5, 10, 25, 50, 100].includes(teamWins)) add("🎖️", `Victoria número ${teamWins} de ${team}`);
    // racha: carreras seguidas ganadas por tu equipo
    let k = 0;
    for (let j = ri; j >= 0 && s.rounds[j].race?.[0] && at(j, s.rounds[j].race![0].id).mine; j--) k++;
    if (k >= 3) add("🔥", `${k} victorias seguidas`);
    if (mine(1)) add("🥇🥈", `Doblete de ${team}`);
  }
  const podium = [0, 1, 2].filter(mine);
  if (podium.length && !before.length) add("🍾", `Primer podio de ${team}`);
  // el primer podio de un piloto, solo si el equipo ya tenía (si no, ya lo dice el del equipo)
  if (before.length) podium.filter((i) => i > 0).forEach((i) => { const w = name(i); if (!before.some((t) => t.nombre === w)) add("🥂", `Primer podio de ${w} con ${team}`); });
  // primeros puntos (partida entera)
  const prevPts = (s.history ?? []).reduce((a, h) => a + h.mine.puntos, 0) + s.rounds.slice(0, ri).reduce((a, x) => a + (x.race ?? []).slice(0, 10).filter((row, i) => row.status === "fin" && at(s.rounds.indexOf(x), row.id).mine && i < 10).length, 0);
  if (prevPts === 0 && !podium.length && r.race.slice(0, 10).some((row, i) => fin(r, i) && at(ri, row.id).mine)) add("✨", `Primeros puntos de ${team}`);
  // carreras redondas
  const races = (s.history ?? []).reduce((a, h) => a + h.carreras, 0) + s.rounds.length;
  if ([25, 50, 100, 150, 200, 250].includes(races)) add("🎉", `Carrera número ${races} al frente de ${team}`);
  // rachas de poles de tus pilotos
  const pole = r.q?.[0] ? at(ri, r.q[0].id) : undefined;
  if (pole?.mine) {
    const streak = poleStreak(s, at, pole.nombre);
    if (streak >= 2) add("⏱️", `${streak > 10 ? `${streak}.ª` : ordinal(streak).replace(/^./, (c) => c.toUpperCase())} pole seguida de ${pole.nombre}`);
  }
  // récord del circuito: la mejor vuelta de la partida. La primera visita lo pone sin anunciarlo; batirlo es un hito
  const recs = (s.records ??= {});
  const old: CircuitRecord | undefined = recs[r.circuitId];
  let best: { t: number; nombre: string; mine: boolean } | null = null;
  for (const rows of [r.q ?? [], r.race]) {
    // fuera las vueltas raras (una interrumpida, por ejemplo): menos del 90 % de la mediana de la sesión
    const ts = rows.map((x) => x.best).filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
    const med = ts[Math.floor(ts.length / 2)] ?? 0;
    for (const row of rows) {
      if (Number.isFinite(row.best) && row.best > 0.9 * med && (!best || row.best < best.t)) { const w = at(ri, row.id); best = { t: row.best, nombre: w.nombre, mine: w.mine }; }
    }
  }
  if (best && (!old || best.t < old.t)) {
    recs[r.circuitId] = { t: best.t, nombre: best.nombre, year: base.year };
    if (old && best.mine) add("📈", `Récord del circuito para ${best.nombre}: ${fmt(best.t)} (antes ${fmt(old.t)}, ${old.nombre})`);
  }
  return out;
}

/** Poles seguidas de un piloto hasta la última ronda. */
export function poleStreak(s: SeasonState, at: SeatAt, nombre: string): number {
  let k = 0;
  for (let j = s.rounds.length - 1; j >= 0; j--) {
    const q = s.rounds[j].q?.[0];
    if (!q || at(j, q.id).nombre !== nombre) break;
    k++;
  }
  return k;
}

/** Para Lobato: victorias de cada piloto en la temporada (y las tuyas, en toda la partida) y rachas de poles. */
export interface LobatoMemo { wins: Record<string, number>; myCareerWins: Record<string, number>; poles: Record<string, number>; winStreak: Record<string, number> }
export function lobatoMemo(s: SeasonState, at: SeatAt, gpOf: (id: string) => string): LobatoMemo {
  const wins: Record<string, number> = {}, poles: Record<string, number> = {}, winStreak: Record<string, number> = {};
  s.rounds.forEach((r, ri) => { if (r.race?.[0]) { const n = at(ri, r.race[0].id).nombre; wins[n] = (wins[n] ?? 0) + 1; } });
  const myCareerWins: Record<string, number> = {};
  for (const t of allTrofeos(s, at, gpOf)) if (t.pos === 1) myCareerWins[t.nombre] = (myCareerWins[t.nombre] ?? 0) + 1;
  const last = s.rounds.length - 1;
  const qp = s.rounds[last]?.q?.[0];
  if (qp) { const n = at(last, qp.id).nombre; poles[n] = poleStreak(s, at, n); }
  const w0 = s.rounds[last]?.race?.[0];
  if (w0) {
    const n = at(last, w0.id).nombre;
    let k = 0;
    for (let j = last; j >= 0 && s.rounds[j].race?.[0] && at(j, s.rounds[j].race![0].id).nombre === n; j--) k++;
    winStreak[n] = k;
  }
  return { wins, myCareerWins, poles, winStreak };
}

/** La gala de fin de temporada: piloto del año, remontada, golpe de estrategia, líder de más vueltas, novato y tu MVP. */
export function gala(s: SeasonState, at: SeatAt, gpOf: (id: string) => string, standings: { nombre: string; equipo: string; points: number; mine: boolean; debut?: number }[]): Award[] {
  const out: Award[] = [];
  const y = yearOf(s);
  if (standings[0]) out.push({ icon: "👑", title: "Piloto del año", who: standings[0].nombre, detail: `campeón con ${standings[0].points} puntos (${standings[0].equipo})` });
  // remontada: más puestos ganados de la salida a la meta en una carrera
  let comeback: { nombre: string; g: number; p: number; gp: string } | null = null;
  let strat: { nombre: string; g: number; p: number; gp: string; stops: number } | null = null;
  const led: Record<string, number> = {};
  s.rounds.forEach((r, ri) => {
    const rows = r.race ?? [];
    const stops = (id: number) => Math.max(0, (r.summary?.stints[id]?.length ?? 1) - 1);
    const counts = new Map<number, number>();
    rows.forEach((row) => counts.set(stops(row.id), (counts.get(stops(row.id)) ?? 0) + 1));
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    rows.forEach((row, i) => {
      if (row.status !== "fin" || row.grid === undefined) return;
      const gain = row.grid - (i + 1), w = at(ri, row.id);
      if (!comeback || gain > comeback.g - comeback.p) comeback = { nombre: w.nombre, g: row.grid, p: i + 1, gp: gpOf(r.circuitId) };
      if (r.summary && stops(row.id) !== usual && i < 6 && gain >= 3 && (!strat || gain > strat.g - strat.p)) strat = { nombre: w.nombre, g: row.grid, p: i + 1, gp: gpOf(r.circuitId), stops: stops(row.id) };
    });
    r.summary?.lapOrder.slice(1).forEach((o) => { if (o?.[0] !== undefined) { const n = at(ri, o[0]).nombre; led[n] = (led[n] ?? 0) + 1; } });
  });
  const cb = comeback as { nombre: string; g: number; p: number; gp: string } | null;
  if (cb && cb.g > cb.p) out.push({ icon: "🚀", title: "Remontada del año", who: cb.nombre, detail: `de ${cb.g}.º a ${cb.p}.º en ${short(cb.gp)}` });
  const st = strat as { nombre: string; g: number; p: number; gp: string; stops: number } | null;
  if (st) out.push({ icon: "🧠", title: "Golpe de estrategia", who: st.nombre, detail: `a ${st.stops} ${st.stops === 1 ? "parada" : "paradas"}, distinto al resto: de ${st.g}.º a ${st.p}.º en ${short(st.gp)}` });
  const leader = Object.entries(led).sort((a, b) => b[1] - a[1])[0];
  if (leader) out.push({ icon: "🏁", title: "Más vueltas en cabeza", who: leader[0], detail: `${leader[1]} vueltas líder` });
  const rookie = standings.find((d) => d.debut === y && d.points > 0);
  if (rookie) out.push({ icon: "🌱", title: "Novato del año", who: rookie.nombre, detail: `${rookie.points} puntos con ${rookie.equipo}` });
  const mvp = standings.find((d) => d.mine);
  if (mvp) out.push({ icon: "⭐", title: "El mejor de tu equipo", who: mvp.nombre, detail: `${standings.indexOf(mvp) + 1}.º del mundial con ${mvp.points} puntos` });
  return out;
}

/** Lo que se guarda de la temporada para la sala de trofeos y la previa de los años siguientes. */
export function recordExtras(s: SeasonState, at: SeatAt, gpOf: (id: string) => string): Pick<SeasonRecord, "trofeos" | "ganadores"> {
  return { trofeos: seasonTrofeos(s, at, gpOf), ganadores: seasonWinners(s, at) };
}
