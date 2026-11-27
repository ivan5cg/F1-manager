// La prensa tras cada gran premio (9.2): una portada de un periódico inventado, sacada del resumen y del resultado de
// la carrera. Sale siempre la misma para la misma carrera (el azar sale de un hash del resultado), así que se puede
// volver a ver en el calendario. (El mensaje de la directiva y sus objetivos se quitaron en noviembre de 2026.)
// Solo interfaz: no toca la simulación.
import type { RaceSummary, SeasonState } from "../sim/season";
import { pointsFor, RACE_POINTS } from "../sim/season";
import type { TeamDef, ResultRow } from "../sim/session";
import { DRIVERS } from "./data";
import { esc } from "./common";

const PAPERS = ["El Heraldo del Paddock", "Diario de Boxes", "La Gaceta del Muro"];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Azar fijo para una carrera: la misma portada cada vez que se abre. */
function chooser(seed: string) {
  let h = hashStr(seed);
  return <T>(a: T[]): T => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return a[h % a.length]; };
}

const who = (id: number) => DRIVERS[id];
/** «Fernando Alonso» → «Alonso». */
const sur = (id: number) => { const n = who(id)?.d.nombre ?? "?"; return n.split(" ").slice(1).join(" ") || n; };
const teamOf = (id: number) => who(id)?.team;
/** «Gran Premio de Gran Bretaña» → «Gran Bretaña». */
const place = (gp: string) => gp.replace(/^Gran Premio (de |del |de la |de los )?/i, "");
const ord = (n: number) => `${n}.º`;

export interface Portada { paper: string; title: string; sub: string; side: string[] }

/** Titulares de una carrera terminada. rows: resultado (con el estado de cada coche). */
export function headlines(sum: RaceSummary, rows: ResultRow[] | undefined, gp: string, playerTeam: string): Portada {
  const pick = chooser(gp + sum.order.join(",") + sum.laps);
  const P = place(gp);
  const grid = sum.lapOrder[0] ?? [];
  const startOf = (id: number) => grid.indexOf(id) + 1 || sum.order.length;
  const finOf = (id: number) => sum.order.indexOf(id) + 1;
  const status = (id: number) => rows?.find((r) => r.id === id)?.status ?? "fin";
  const reason = (id: number) => rows?.find((r) => r.id === id)?.reason;
  const w = sum.order[0], wT = teamOf(w);
  const wStart = startOf(w);
  const leaders = new Set(sum.lapOrder.slice(1).map((o) => o?.[0]).filter((x) => x !== undefined));
  const sc = sum.key.filter((k) => /^COCHE DE SEGURIDAD —/.test(k.text)).length;
  const vsc = sum.key.filter((k) => /VIRTUAL —/.test(k.text)).length;
  const red = sum.key.some((k) => /BANDERA ROJA/.test(k.text));
  const outs = sum.order.filter((id) => status(id) === "out").length;
  const mine = sum.mine.slice().sort((a, b) => finOf(a) - finOf(b));
  const best = mine[0];
  const myTeam = best !== undefined ? teamOf(best) : undefined;
  const myPts = (() => { const pts = pointsFor(rows, RACE_POINTS); return mine.reduce((a, id) => a + (pts.get(id) ?? 0), 0); })();
  const gained = (id: number) => (status(id) === "fin" ? startOf(id) - finOf(id) : 0);
  // la remontada de la carrera (sin contar al ganador, que tiene su propio titular)
  const climber = sum.order.filter((id) => id !== w && status(id) === "fin").sort((a, b) => gained(b) - gained(a))[0];
  // estrategia: paradas de cada uno y lo más común
  const stops = (id: number) => Math.max(0, (sum.stints[id]?.length ?? 1) - 1);
  const usual = (() => { const c = new Map<number, number>(); for (const id of sum.order) c.set(stops(id), (c.get(stops(id)) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1; })();

  let title: string, sub: string;
  const mineWon = best !== undefined && finOf(best) === 1;
  if (mineWon) {
    title = pick([`¡${sur(best)} conquista ${P}!`, `${myTeam?.nombre ?? "El equipo"} celebra en ${P}`, `Victoria de ${sur(best)}: ${P} es suyo`]);
    sub = wStart > 3 ? `Salía ${ord(wStart)} y acabó arriba del todo. El muro acertó de lleno.` : stops(best) !== usual ? `Una estrategia distinta a la del resto (${stops(best)} ${stops(best) === 1 ? "parada" : "paradas"}) y una carrera sin fallos.` : "Carrera redonda de principio a fin, sin dar opción a los rivales.";
  } else if (best !== undefined && finOf(best) <= 3 && status(best) === "fin") {
    title = pick([`Podio para ${sur(best)} en ${P}`, `${myTeam?.nombre ?? "El equipo"} sube al cajón en ${P}`, `${sur(best)}, ${ord(finOf(best))}: alegría en el box`]);
    sub = `${sur(w)} gana con el ${wT?.nombre ?? "?"}, pero el ${myTeam?.nombre ?? "equipo"} se lleva ${myPts} puntos de oro.`;
  } else if (red || sc + vsc >= 3) {
    title = pick([`Caos en ${P}`, `${P}, una carrera de locos`, `Banderas, coches de seguridad y ${sur(w)}`]);
    sub = `${red ? "Bandera roja" : `${sc + vsc} neutralizaciones`}${outs ? ` y ${outs} abandonos` : ""}. Al final, ${sur(w)} gana con el ${wT?.nombre ?? "?"}.`;
  } else if (wStart >= 5) {
    title = pick([`${sur(w)} gana desde la ${wStart}.ª posición`, `Remontada de campeón: ${sur(w)} gana en ${P}`]);
    sub = `Salía ${ord(wStart)} y nadie pudo con su ritmo en ${P}.`;
  } else if (wStart === 1 && leaders.size <= 1) {
    title = pick([`${sur(w)}, de principio a fin`, `Paseo de ${sur(w)} en ${P}`, `${sur(w)} no da opción en ${P}`]);
    sub = `Pole, todas las vueltas al frente y victoria para el ${wT?.nombre ?? "?"}.`;
  } else if (leaders.size >= 3) {
    title = pick([`${sur(w)} gana una batalla a ${leaders.size} bandas`, `${P} cambia de manos y acaba en las de ${sur(w)}`]);
    sub = `${leaders.size} líderes distintos en carrera. El último en reír, ${sur(w)} (${wT?.nombre ?? "?"}).`;
  } else {
    title = pick([`${sur(w)} se impone en ${P}`, `${sur(w)} gana en ${P}`, `${wT?.nombre ?? "?"} manda en ${P}`]);
    sub = `${sur(w)} gana por delante de ${sur(sum.order[1])} y ${sur(sum.order[2])}.`;
  }

  // breves: lo del equipo del jugador primero
  const side: string[] = [];
  if (best !== undefined && !mineWon) {
    const allOut = mine.every((id) => status(id) !== "fin");
    const myGrid = Math.min(...mine.map(startOf)), myFin = finOf(best);
    const strat = mine.find((id) => status(id) === "fin" && gained(id) >= 5 && stops(id) !== usual);
    if (allOut) side.push(pick([`Día negro para ${myTeam?.nombre ?? "el equipo"}: ninguno de sus coches ve la bandera a cuadros`, `Doble abandono en ${myTeam?.nombre ?? "el equipo"}${reason(best) ? `: ${reason(best)}` : ""}`]));
    else if (strat) side.push(pick([`Golpe de estrategia: ${sur(strat)} gana ${gained(strat)} puestos con ${stops(strat)} ${stops(strat) === 1 ? "parada" : "paradas"}`, `El muro de ${myTeam?.nombre ?? "su equipo"} acierta con ${sur(strat)}: de ${ord(startOf(strat))} a ${ord(finOf(strat))}`]));
    else if (myPts === 0 && myGrid <= 8) side.push(pick(["El muro, otra vez en entredicho", `${myTeam?.nombre ?? "El equipo"} sale entre los ocho primeros y se va sin puntos`]));
    else if (myFin > startOf(best) + 3 && myFin > 3) side.push(pick([`${sur(best)} se hunde: de ${ord(startOf(best))} a ${ord(myFin)}`, `Tarde para olvidar de ${sur(best)}`]));
    else if (myPts > 0) side.push(`${myTeam?.nombre ?? "El equipo"} suma ${myPts} ${myPts === 1 ? "punto" : "puntos"}: ${mine.filter((id) => status(id) === "fin" && finOf(id) <= 10).map((id) => `${sur(id)} ${ord(finOf(id))}`).join(", ")}`);
    else side.push(`Sin puntos para ${myTeam?.nombre ?? "el equipo"} en ${P}`);
  }
  if (climber !== undefined && gained(climber) >= 6) side.push(`La remontada del día: ${sur(climber)}, de ${ord(startOf(climber))} a ${ord(finOf(climber))}`);
  if (sum.fl && sum.fl.id !== w) side.push(`Vuelta rápida para ${sur(sum.fl.id)}`);
  const leftOut = sum.order.filter((id) => status(id) === "out" && !sum.mine.includes(id) && startOf(id) <= 6)[0];
  if (leftOut !== undefined) side.push(`Abandono de ${sur(leftOut)}${reason(leftOut) ? `: ${reason(leftOut)}` : ""}`);
  if (!red && sc + vsc > 0 && sc + vsc < 3 && side.length < 3) side.push(sc ? `${sc === 1 ? "Un coche" : `${sc} coches`} de seguridad agitan la carrera` : "Un virtual que lo cambia todo en boxes");
  // el periódico, con su propio azar (que no dependa de cuántos titulares se han sorteado antes)
  return { paper: PAPERS[(hashStr(sum.order.join("-") + gp) >>> 11) % PAPERS.length], title, sub, side: side.slice(0, 3) };
}

/** La portada, en HTML. */
export function portadaHtml(p: Portada, kicker = ""): string {
  return `<div class="paper"><div class="paper-mast"><span>${esc(p.paper)}</span>${kicker ? `<span class="paper-k">${esc(kicker)}</span>` : ""}</div>
    <h2 class="paper-t">${esc(p.title)}</h2><div class="paper-s">${esc(p.sub)}</div>
    ${p.side.length ? `<ul class="paper-b">${p.side.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="paper-f">Periódico inventado del juego</div></div>`;
}
