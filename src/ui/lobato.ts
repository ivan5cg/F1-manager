// Comentarios de la retransmisión al estilo de Antonio Lobato. Solo interfaz: no toca la
// simulación (usa Math.random, no el generador de la sesión), así que no cambia ningún resultado.
// Reacciona al código de los mensajes de la sesión (adelantamientos, banderas, paradas, pole...) y, en carrera,
// comenta de vez en cuando cómo va la cosa: el líder, las peleas, tus pilotos, las vueltas que quedan.
import { Session, Car, RaceEvent, isRaceKind, isQualiKind, fmt } from "../sim/session";
import { driverFlag } from "./visual";

export interface Comment { t: number; lap: number; text: string }

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
/** «Fernando Alonso» → «Alonso». */
const sur = (c: Car) => c.d.nombre.split(" ").slice(1).join(" ") || c.d.nombre;
const first = (c: Car) => c.d.nombre.split(" ")[0];
const spanish = (c: Car) => driverFlag(c.d.nombre) === "🇪🇸";
/** A los españoles, Lobato los llama a menudo por el nombre de pila. */
const nm = (c: Car) => (spanish(c) && Math.random() < 0.6 ? first(c) : sur(c));

export function createLobato(sess: Session, gp: string) {
  const race = isRaceKind(sess.kind);
  const quali = isQualiKind(sess.kind);
  const list: Comment[] = [];
  let lastReal = -1e9; // ms reales del último comentario
  let lastSim = -1e9; // segundos de sesión del último comentario
  let lastText = "";
  let lastLapTick = 0;
  let saidStart = false, saidHalf = false, saidFive = false, saidLast = false;
  const p1Said = new Map<number, number>(); // el mejor tiempo con el que ya se dijo que cada uno se ponía primero

  function say(text: string, big = false) {
    const now = performance.now();
    // a mucha velocidad no puede hablar de todo: lo gordo pasa siempre (con un respiro mínimo)
    if (now - lastReal < (big ? 1200 : 6000)) return null;
    if (text === lastText) return null;
    lastReal = now; lastSim = sess.t; lastText = text;
    const lap = race ? Math.min(sess.laps, Math.max(1, sess.leaderLap + 1)) : Math.max(1, sess.leaderLap + 1);
    const c = { t: sess.t, lap, text };
    list.push(c);
    if (list.length > 200) list.shift();
    return c;
  }

  /**
   * Reacciona a un mensaje de la sesión por su código (RaceEvent.code), sin leer el texto: así un «P15» no se toma
   * por un «P1» ni un cambio de redacción en la simulación le deja mudo. Devuelve el comentario si lo hay.
   */
  function onEvent(e: RaceEvent): Comment | null {
    if (e.voz || !e.code) return null;
    const c = e.carId !== undefined ? sess.carById(e.carId) : undefined;
    const o = e.other !== undefined ? sess.carById(e.other) : undefined;
    const partName = sess.parts[sess.part]?.name ?? "";
    switch (e.code) {
      case "vsc": return say(pick([
        "¡Coche de seguridad virtual! Todos a levantar el pie... y en el muro, a echar cuentas: ¿paramos o no paramos?",
        "Virtual safety car. Atención, que esto es media parada gratis para el que esté atento.",
        "¡VSC! Se congela la carrera, los huecos se mantienen. Ojo a los boxes ahora.",
      ]), true);
      case "sc": return say(pick([
        "¡Sale el coche de seguridad! Se agrupa todo el pelotón, ¡se acabaron las ventajas!",
        "¡Safety car! Madre mía, esto le da la vuelta a la carrera. ¡A boxes, a boxes, el que pueda!",
        "Coche de seguridad en pista. El que tenía la carrera controlada ya no la tiene, amigos.",
      ]), true);
      case "roja": return say(pick([
        "¡Bandera roja! ¡Se para la carrera! Todos al pit-lane, esto es muy serio.",
        "¡Roja, roja! Carrera suspendida. Ahora a esperar y a cambiar neumáticos gratis.",
      ]), true);
      case "verde": return say(pick([
        "¡Bandera verde! ¡Vamos! ¡A pelear otra vez!",
        "¡Se relanza la carrera! El líder marca el ritmo... ¡y ya están todos con el cuchillo entre los dientes!",
        "¡Verde! Ojo a la primera curva, que aquí se pierde y se gana mucho.",
      ]), true);
      case "pole": {
        if (!c) return null;
        const who = nm(c);
        return say(spanish(c)
          ? pick([`¡POLE! ¡POLE PARA ${who.toUpperCase()}! ¡Qué vuelta, qué vuelta! ¡Se me ponen los pelos de punta!`, `¡${who} se lleva la pole! ¡Qué barbaridad! ¡Esto es España, señores!`])
          : pick([`¡Pole position para ${who}! Vuelta perfecta con el ${c.team.nombre}.`, `¡${who}! ¡Qué vuelta! Mañana sale desde la primera posición.`, `${who} se lleva la pole. Una vuelta de esas que no se olvidan.`]), true);
      }
      case "eliminados": {
        const outCars = sess.cars.filter((x) => x.eliminated && x.elimPart === sess.part);
        const out = outCars.map(sur);
        const txt = out.length > 1 ? `${out.slice(0, -1).join(", ")} y ${out[out.length - 1]}` : out.join("");
        const sp = outCars.filter(spanish);
        if (sp.length) return say(`Se acaba la ${partName}... y ${sp.map(nm).join(" y ")} se queda${sp.length > 1 ? "n" : ""} fuera. Qué pena, de verdad. Eliminados: ${txt}.`);
        if (!out.length) return null;
        return say(pick([`Se acaba la ${partName} y se quedan fuera ${txt}. Duro, muy duro.`, `Final de la ${partName}. Fuera: ${txt}. Así de cruel es la clasificación.`]));
      }
      case "empieza": return say(pick([
        `¡Arranca la ${partName}! Semáforo verde al final del pit-lane.`,
        `Empieza la ${partName}. Ahora sí, aquí no hay margen para el error.`,
      ]));
      case "cuadros": {
        if (!race) return null;
        const w = sess.order()[0];
        if (!w) return null;
        return say(spanish(w)
          ? pick([`¡¡${nm(w).toUpperCase()} GANA!! ¡¡GANA EN ${gp.replace(/^Gran Premio de /i, "").toUpperCase()}!! ¡No me lo puedo creer, señores!`, `¡Victoria de ${nm(w)}! ¡Qué carrera! ¡Esto es historia!`])
          : pick([`¡Bandera a cuadros! ¡${sur(w)} gana el ${gp}!`, `¡${sur(w)} cruza la meta y se lleva la victoria! Qué carrera nos ha dado ${gp.replace(/^Gran Premio de /i, "")}.`, `Victoria para ${sur(w)} con el ${w.team.nombre}. Impecable.`]), true);
      }
      case "sancion": {
        if (!c) return null;
        const s = e.n ?? 5;
        return say(e.motivo === "toque"
          ? pick([`¡Sanción para ${sur(c)}! ${s} segundos por el toque. Los comisarios no perdonan.`, `${s} segundos a ${sur(c)}. Lo han visto culpable, y con razón.`])
          : e.motivo === "limites" ? pick([`¡${s} segundos a ${sur(c)} por los límites de pista! Ya se lo habían avisado con la blanca y negra.`, `Sanción para ${sur(c)}: los límites de pista. Se veía venir.`])
          : e.motivo === "insegura" ? `¡${s} segundos a ${sur(c)} por salida insegura! Le han soltado encima de otro coche.`
          : `Sanción para ${sur(c)}: ${s} segundos. Eso le cuesta caro.`, true);
      }
      case "desobedece":
        if (!c) return null;
        return say(e.n === 0
          ? pick([`¡Ojo a esto! ¡${sur(c)} no deja pasar a su compañero! ¡Desobedece al muro!`, `¡${sur(c)} se niega a cumplir la orden de equipo! Esto va a traer cola en el box.`])
          : pick([`¡${sur(c)} no entra! Le pedían parar y se queda fuera. ¡Eso es tener carácter... o desobedecer!`, `El equipo le llama a boxes y ${sur(c)} pasa de largo. ¡Una vuelta más, dice!`]), true);
      case "sinSancion": return say(pick(["Incidente de carrera, dicen los comisarios. Para mí también, sinceramente.", "Sin sanción. Son cosas de las carreras."]));
      case "blancaNegra": return c ? say(`Bandera blanca y negra para ${sur(c)}. Una más y le cae sanción.`) : null;
      case "desdoblar": return say("Los doblados pueden desdoblarse. Eso quiere decir que el coche de seguridad está a punto de irse.");
      case "liderAcelera": return say(pick(["¡Acelera el líder! ¡Relanzada! ¡Agárrense!", "¡Y ahí va! ¡Ha elegido el momento! ¡Relanzada!"]), true);
      case "salidaParada": return say("Se reanuda con salida parada desde la parrilla. ¡Otra salida! Esto es como empezar de cero.", true);
      case "banderaAmarilla": return say(pick(["Bandera amarilla. Algo ha pasado ahí, cuidado.", "Amarilla en ese sector. A levantar, que no se juegan la sanción."]));
      case "descalificado": return c ? say(`¡Descalificado ${sur(c)}! Error de libro: no ha usado los dos compuestos.`, true) : null;
      case "anulada": return c ? say(pick([`Le borran la vuelta a ${sur(c)}. Los límites de pista, ¡siempre los límites de pista!`, `¡Ay! Vuelta anulada a ${sur(c)}. Se ha pasado de la línea blanca.`])) : null;
      case "seca": return say("Deja de llover. Ahora la gran pregunta: ¿cuándo se pasa a slicks? El que acierte, gana.");
      case "lluvia": return say(pick([
        "¡Atención, que llega la lluvia! Esto puede ser una lotería, amigos.",
        "Lluvia en el radar. Aquí los grandes pilotos marcan la diferencia.",
        "¡Llueve! Y cuando llueve en la Fórmula 1, cualquier cosa puede pasar.",
      ]));
      case "adelanta": {
        const a = c, b = o, pos = e.n;
        if (!a || !b || pos === undefined) return null;
        // rivalidad de la temporada: cuentas pendientes
        if (sess.rivalOf(a, b) >= 0.3 && pos !== 1) return say(pick([
          `¡Otra vez estos dos! ${sur(a)} le pasa a ${sur(b)}. Aquí hay cuentas pendientes, amigos.`,
          `¡${sur(a)} y ${sur(b)}, el duelo de la temporada! Esta vez gana ${sur(a)}: ${pos}º.`,
          `Entre ${sur(a)} y ${sur(b)} no hay amistad ninguna... ¡y ${sur(a)} se lleva la posición!`,
        ]), true);
        if (pos === 1 && race) return say(spanish(a)
          ? pick([`¡¡${nm(a).toUpperCase()} AL FRENTE!! ¡Pasa a ${sur(b)} y es el nuevo líder! ¡Vamos, vamos!`, `¡Lo ha hecho! ¡${nm(a)} adelanta a ${sur(b)} y lidera el Gran Premio!`])
          : pick([`¡Cambio de líder! ¡${sur(a)} pasa a ${sur(b)} y se pone primero!`, `¡Atención, atención! ¡${sur(a)} es el nuevo líder de la carrera!`, `¡Adelantamiento por el liderato! ${sur(a)} se va por delante de ${sur(b)}.`]), true);
        if (spanish(a)) return say(pick([`¡Vamos, ${nm(a)}! ¡Se merienda a ${sur(b)}! Ya es ${pos}º.`, `¡Qué maniobra de ${nm(a)}! Pasa a ${sur(b)} y sube a la ${pos}ª posición.`]));
        if (spanish(b)) return say(pick([`¡Ay, no! ${sur(a)} le pasa a ${nm(b)}. Pierde la ${pos}ª posición.`, `${nm(b)} no ha podido defenderse de ${sur(a)}. Qué pena.`]));
        if (pos <= 3 || a.player || b.player) return say(pick([
          `¡Adelantamiento! ${sur(a)} se mete por dentro y pasa a ${sur(b)}. Ya es ${pos}º.`,
          `¡Qué valiente ${sur(a)}! Frena tardísimo y le quita la posición a ${sur(b)}.`,
          `${sur(a)} se lleva por delante... ¡la posición, eh!, a ${sur(b)}. ${pos}º ahora.`,
          sess.aidShort ? `¡Lo pasa! ${sur(a)} supera a ${sur(b)} con ${sess.aidShort === "DRS" ? "el DRS abierto" : "el modo adelantamiento"}.` : `¡Lo pasa! ${sur(a)} se tira por dentro y supera a ${sur(b)}.`,
        ]));
        return null;
      }
      case "abandono":
        if (!c) return null;
        return say(spanish(c)
          ? pick([`¡No, no, no! ¡${nm(c)} se retira! Qué mala suerte, de verdad.`, `Mal día para ${nm(c)}. Se acabó su carrera. Qué rabia.`])
          : pick([`¡Abandono de ${sur(c)}! Se acaba su carrera.`, `Fin de la carrera para ${sur(c)}. Hoy no era su día.`, `${sur(c)} para el coche. Malas noticias para el ${c.team.nombre}.`]), true);
      case "toque":
        if (!c || !o) return null;
        if (sess.rivalOf(c, o) >= 0.3) return say(pick([
          `¡Otra vez estos dos! ¡${sur(c)} y ${sur(o)} se tocan de nuevo! Esto ya es personal.`,
          `¡No me lo puedo creer! ¡${sur(c)} y ${sur(o)}, otra vez juntos y otra vez contacto!`,
        ]), true);
        return say(pick([`¡Contacto entre ${sur(c)} y ${sur(o)}! ¡Uy, uy, uy!`, `¡Se tocan ${sur(c)} y ${sur(o)}! A ver qué dicen los comisarios.`, `¡Toque! ${sur(c)} y ${sur(o)} se han rozado. Esto ha dolido.`]), true);
      case "pinchazo": return c ? say(`¡Pinchazo para ${sur(c)}! Vuelta entera con la goma destrozada. ¡Qué drama!`, true) : null;
      case "trompo":
        if (c && (c.player || spanish(c) || Math.random() < 0.4)) return say(pick([`¡Trompo de ${sur(c)}! Ha hecho un trescientos sesenta... y sigue, pero cuánto tiempo ha perdido.`, `¡Se le ha ido el coche a ${sur(c)}! Vuelta completa, ¡qué susto!`]));
        return null;
      case "salida":
        if (c && (c.player || spanish(c) || Math.random() < 0.4)) return say(pick([`¡Se va largo ${sur(c)}! Por la escapatoria... ha perdido mucho tiempo.`, `¡Uy! ¡${sur(c)} fuera de pista! Ese error le cuesta caro.`]));
        return null;
      case "parada":
        if (race && c && e.n !== undefined && e.n > 5) return say(`¡Problemas en la parada de ${sur(c)}! ${e.n.toFixed(1).replace(".", ",")} segundos parado... ¡eso es una eternidad!`, true);
        return null;
      case "boxes": {
        if (!race || !c) return null;
        const pos = sess.order().indexOf(c) + 1;
        if (pos <= 3 || spanish(c) || (c.player && Math.random() < 0.5)) return say(pick([
          `Entra a boxes ${sur(c)}, que iba ${pos}º. ¿Undercut? Atentos a cómo sale.`,
          `¡Para ${sur(c)}! Movimiento de estrategia, a ver si le sale bien al ${c.team.nombre}.`,
          `${sur(c)} al pit-lane. Ahora hay que hacer una vuelta de salida perfecta.`,
        ]));
        return null;
      }
      case "vuelta": {
        // mejor tiempo de verdad: P1 exacto (n === 1, no «P15») y solo en clasificación
        if (!quali || !c || e.n !== 1) return null;
        const best = sess.parts.length ? c.bestByPart[sess.part] : c.best;
        // solo con un tiempo nuevo: el que ya iba primero y da otra vuelta sin mejorar no «se pone» primero
        if (best === undefined || !Number.isFinite(best) || p1Said.get(c.id) === best) return null;
        p1Said.set(c.id, best);
        const t = fmt(best);
        return say(spanish(c) ? `¡${nm(c)} se pone primero! ¡Vamos! ${t}.` : pick([`${sur(c)} se pone primero con un ${t}.`, `¡Mejor tiempo para ${sur(c)}! ${t}, la referencia.`]));
      }
    }
    return null;
  }

  /** En carrera, cada pocas vueltas: cómo va la cosa si no ha comentado nada hace rato. */
  function tick(): Comment | null {
    if (!race || sess.finished) return null;
    const lap = sess.leaderLap + 1;
    const ord = sess.order().filter((c) => c.loc !== "out");
    const lead = ord[0];
    if (!lead) return null;
    if (!saidStart && sess.t > 3) {
      if (lap > 1) saidStart = true; else {
      saidStart = true;
      return say(spanish(lead)
        ? `¡Se apagan los semáforos! ¡Arranca el ${gp}! ¡Y ${nm(lead)} manda en la primera curva!`
        : pick([`¡Se apagan los semáforos y arranca el ${gp}! ${sur(lead)} toma el mando.`, `¡Salida! ¡Arranca el ${gp}! Primera curva... ¡y ${sur(lead)} delante!`]), true);
      }
    }
    if (lap === lastLapTick) return null;
    lastLapTick = lap;
    const left = sess.laps - lap + 1;
    if (!saidLast && lap === sess.laps) { saidLast = true; return say(pick([`¡Última vuelta! ¡${sur(lead)} a una vuelta de la victoria!`, `¡Campana, última vuelta! ${sur(lead)} lo tiene en la mano... ¡que no se le escape!`]), true); }
    if (!saidFive && left === 5 && sess.laps > 12) { saidFive = true; return say(`Quedan cinco vueltas. ${sur(lead)} lidera. ¡Esto está que arde!`, true); }
    if (!saidHalf && lap === Math.ceil(sess.laps / 2) && sess.laps > 12) { saidHalf = true; return say(`Mitad de carrera. ${sur(lead)} manda, ${ord[1] ? `${sur(ord[1])} segundo` : ""}${ord[2] ? ` y ${sur(ord[2])} tercero` : ""}.`); }
    // relleno: como mucho cada ~3 vueltas de carrera (y si no ha hablado hace rato)
    if (sess.t - lastSim < 3 * (sess.t / Math.max(1, lap - 1) || 90) || lap < 3) return null;
    const opts: (() => string)[] = [];
    // peleas: dos coches a menos de 0,8 s en el top 10
    for (let i = 1; i < Math.min(10, ord.length); i++) {
      const a = ord[i], b = ord[i - 1];
      if (a.aheadId === b.id && a.followGap > 0 && a.followGap < 0.8) {
        opts.push(() => pick([
          `¡Qué pelea por la ${i + 1}ª posición! ${sur(a)} está pegadísimo a ${sur(b)}.`,
          `${sur(a)} a menos de un segundo de ${sur(b)}. Lo va a intentar, ¡lo va a intentar!`,
          `Ojo a ${sur(a)}, que tiene a tiro a ${sur(b)}. Ya le mete el morro en las frenadas.`,
        ]));
        break;
      }
    }
    const sp = ord.filter(spanish);
    if (sp.length) { const c = pick(sp); const p = ord.indexOf(c) + 1; opts.push(() => p <= 3 ? `¡${nm(c)} va ${p}º! ¡Vamos, que estamos ahí!` : pick([`${nm(c)} rueda ${p}º. Sacándole todo al coche, como siempre.`, `Mirad a ${nm(c)}: ${p}º y buscando cazar al de delante.`])); }
    const mine = ord.filter((c) => c.player);
    if (mine.length) { const c = pick(mine); const p = ord.indexOf(c) + 1; opts.push(() => pick([`${sur(c)} va ${p}º con el ${c.team.nombre}. Desde el muro tienen trabajo.`, `Atentos al ${c.team.nombre}: ${sur(c)} rueda ${p}º. La estrategia aquí va a ser clave.`])); }
    opts.push(() => pick([
      `Vuelta ${lap} de ${sess.laps}. ${sur(lead)} lidera con autoridad.`,
      `${sur(lead)} sigue al frente. Quedan ${left} vueltas y aquí no hay nada decidido.`,
      `¡Qué ritmo el de ${sur(lead)}! Va como un reloj.`,
      `Los neumáticos empiezan a decir cosas. El que los cuide ahora, lo agradecerá al final.`,
      `Esto es la Fórmula 1, amigos: cada décima cuenta.`,
    ]));
    return say(pick(opts)());
  }

  return { onEvent, tick, list };
}
