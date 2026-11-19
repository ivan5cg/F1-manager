// El segundo comentarista (10.3): Begoña Arrieta, ingeniera de pista retirada (personaje inventado), en el box de la
// retransmisión junto a Lobato. Donde él se emociona, ella explica el porqué: el undercut, la parada barata con el
// coche de seguridad, el compuesto que monta cada uno y si le llega, las estrategias distintas de los de delante y el
// cruce entre lluvia y slicks. Solo interfaz: Math.random y lo que ya hay en la sesión; no cambia ningún resultado.
import { Session, Car, RaceEvent, isRaceKind, isQualiKind } from "../sim/session";
import { COMPOUNDS, DRY, WET } from "../sim/tyres";
import type { Comment } from "./lobato";

export const EXPERTA = "Begoña Arrieta";

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const sur = (c: Car) => c.d.nombre.split(" ").slice(1).join(" ") || c.d.nombre;
const nm = (c: { c: keyof typeof COMPOUNDS }) => COMPOUNDS[c.c].name.toLowerCase();
const s1 = (x: number) => x.toFixed(1).replace(".", ",");

export function createExperta(sess: Session) {
  const race = isRaceKind(sess.kind), quali = isQualiKind(sess.kind);
  const list: Comment[] = [];
  let lastReal = -1e9, lastLapTalk = -9, lastText = "";
  const stops = new Map<number, number>(); // paradas de cada coche ya comentadas
  const loss = (sess.track.def.boxes?.perdida as number | undefined) ?? 21;

  function say(text: string, big = false) {
    const now = performance.now();
    // habla menos que Lobato: como mucho una cosa cada 9 s reales (lo importante, cada 3)
    if (now - lastReal < (big ? 3000 : 9000) || text === lastText) return null;
    lastReal = now; lastText = text;
    const lap = race ? Math.min(sess.laps, Math.max(1, sess.leaderLap + 1)) : Math.max(1, sess.leaderLap + 1);
    const c = { t: sess.t, lap, text };
    list.push(c);
    if (list.length > 200) list.shift();
    lastLapTalk = sess.leaderLap;
    return c;
  }
  const pos = (c: Car) => sess.order().indexOf(c) + 1;
  const lapsLeft = (c: Car) => sess.laps - sess.lapsDone(c);

  function onEvent(e: RaceEvent): Comment | null {
    if (e.voz || !e.code) return null;
    const c = e.carId !== undefined ? sess.carById(e.carId) : undefined;
    switch (e.code) {
      case "sc": return race ? say(`Con el coche de seguridad, parar cuesta unos ${Math.round(loss * 0.45)} segundos en vez de ${Math.round(loss)}. El que tenga la ventana abierta tiene que entrar ya.`, true) : null;
      case "vsc": return race ? say(`Con el virtual, la parada sale a mitad de precio: unos ${Math.round(loss * 0.6)} segundos. Pero dura poco: hay que decidir en esta vuelta.`, true) : null;
      case "lluvia": return say(pick([
        `Ojo al cruce: con menos de ${s1(WET.si)} milímetros de agua el slick todavía va mejor; por encima, intermedios. Y el que se equivoque de vuelta lo paga caro.`,
        "Lluvia: ahora mandan los datos del radar. Parar una vuelta pronto cuesta menos que parar una vuelta tarde.",
      ]), true);
      case "seca": return say("Se está secando: la trazada va antes que el resto. El primero que monte slicks puede ganar tres o cuatro segundos por vuelta... o irse fuera en la primera curva.", true);
      case "boxes": {
        if (!race || !c) return null;
        const p = pos(c);
        if (p > 8 && !c.player) return null;
        // undercut: entra con alguien a tiro delante que aún no ha parado
        const ahead = c.aheadId >= 0 ? sess.carById(c.aheadId) : undefined;
        if (ahead && c.followGap > 0 && c.followGap < 2.5 && ahead.stops <= c.stops && sess.flag === "green")
          return say(pick([
            `Esto es un undercut de libro: ${sur(c)} para con ${sur(ahead)} a ${s1(c.followGap)} segundos. Con gomas nuevas gana un segundo y pico en la vuelta de salida.`,
            `${sur(c)} intenta el undercut sobre ${sur(ahead)}. Ahora el muro de ${ahead.team.nombre} tiene que decidir si le cubre la vuelta que viene.`,
          ]));
        // se cubre: responde a la parada de uno que iba justo detrás (como mucho dos puestos) y paró hace poco
        const ord = sess.order(), me = ord.indexOf(c);
        const rival = ord.slice(me + 1, me + 3).find((x) => x.stops > c.stops && x.lastPitLap >= sess.lapsDone(c) - 2);
        if (rival && sess.flag === "green") return say(`${sur(c)} responde a la parada de ${sur(rival)}: si se queda fuera una vuelta más, le hace el undercut.`);
        return null;
      }
      case "empieza":
        if (!quali) return null;
        return say(pick([
          "Pista cada vez más rápida: la goma se va pegando y cada vuelta vale más que la anterior. Por eso todos quieren salir al final.",
          "Ahora el juego es el tráfico: buscar hueco en la vuelta de salida sin perder temperatura en las gomas.",
        ]));
    }
    return null;
  }

  /** Cada fotograma: los cambios de goma de los de delante y, de vez en cuando, cómo van las estrategias. */
  function tick(): Comment | null {
    if (!race || sess.finished || sess.leaderLap < 1) return null;
    // cada coche de los diez primeros (o tuyo) que acaba de salir de boxes: qué monta y si le llega
    for (const c of sess.cars) {
      const n = c.stops, seen = stops.get(c.id) ?? 0;
      if (n === seen || c.loc !== "track" || !c.tyres) continue;
      stops.set(c.id, n);
      const p = pos(c), left = lapsLeft(c);
      if (p > 8 && !c.player) continue;
      const t = c.tyres, life = DRY.includes(t.c) ? Math.round(0.72 / (COMPOUNDS[t.c].wear * sess.track.abrasiveness * 0.9)) : 0;
      const txt = !DRY.includes(t.c) ? `${sur(c)} monta ${nm(t)}: apuesta a que el agua se queda.`
        : life >= left + 3 ? `${sur(c)} sale con ${nm(t)}${t.laps ? " usados" : ""} y le quedan ${left} vueltas: le llega de sobra, ya no vuelve a parar.`
          : life >= left - 3 ? `${sur(c)} con ${nm(t)} para ${left} vueltas: justo, justo. Tendrá que cuidar las gomas al final.`
            : `${sur(c)} monta ${nm(t)} con ${left} vueltas por delante: no le llega, así que va a otra parada más.`;
      const r = say(txt);
      if (r) return r;
    }
    // cada ~8 vueltas: lo que hacen los de delante (paradas distintas, gomas gastadas)
    if (sess.leaderLap - lastLapTalk < 8 || sess.flag !== "green") return null;
    const top = sess.order().filter((c) => c.loc === "track").slice(0, 5);
    if (top.length < 2) return null;
    const [a, b] = top;
    if (a.stops !== b.stops && Math.abs(a.stops - b.stops) === 1) {
      const fresh = a.stops > b.stops ? a : b, old = fresh === a ? b : a;
      return say(`Estrategias cruzadas arriba: ${sur(fresh)} ya ha parado ${fresh.stops === 1 ? "una vez" : `${fresh.stops} veces`} y ${sur(old)} aún no. ${sur(old)} tiene que abrir unos ${Math.round(loss)} segundos de hueco antes de entrar, o lo pierde en boxes.`);
    }
    const worn = top.find((c) => c.tyres && c.tyres.laps >= 18 && DRY.includes(c.tyres.c) && lapsLeft(c) > 8);
    if (worn) return say(`Las gomas de ${sur(worn)} llevan ${worn.tyres!.laps} vueltas. Mirad sus tiempos: en cuanto caigan medio segundo, está en la ventana de parada.`);
    const gap = b.aheadId === a.id ? b.followGap : 0;
    if (gap > 0 && gap < 1.2) return say(`${sur(b)} está a ${s1(gap)} de ${sur(a)}: en aire sucio pierde carga delante y se le calientan las gomas. Le conviene atacar pronto o esperar al undercut.`);
    return null;
  }

  return { onEvent, tick, list };
}
