// Comentarios de la retransmisión al estilo de Antonio Lobato. Solo interfaz: no toca la
// simulación (usa Math.random, no el generador de la sesión), así que no cambia ningún resultado.
// Reacciona a los mensajes de la sesión (adelantamientos, banderas, paradas, pole...) y, en carrera,
// comenta de vez en cuando cómo va la cosa: el líder, las peleas, tus pilotos, las vueltas que quedan.
import { Session, Car, RaceEvent, isRaceKind, isQualiKind } from "../sim/session";
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
  const byAbrev = (a: string) => sess.cars.find((c) => c.d.abrev === a);

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

  /** Reacciona a un mensaje de la sesión. Devuelve el comentario si lo hay. */
  function onEvent(e: RaceEvent): Comment | null {
    const t = e.text;
    let m: RegExpMatchArray | null;
    if (e.kind === "control") {
      if (/COCHE DE SEGURIDAD VIRTUAL/.test(t)) return say(pick([
        "¡Coche de seguridad virtual! Todos a levantar el pie... y en el muro, a echar cuentas: ¿paramos o no paramos?",
        "Virtual safety car. Atención, que esto es media parada gratis para el que esté atento.",
        "¡VSC! Se congela la carrera, los huecos se mantienen. Ojo a los boxes ahora.",
      ]), true);
      if (/COCHE DE SEGURIDAD —|Salida detrás del coche de seguridad/.test(t)) return say(pick([
        "¡Sale el coche de seguridad! Se agrupa todo el pelotón, ¡se acabaron las ventajas!",
        "¡Safety car! Madre mía, esto le da la vuelta a la carrera. ¡A boxes, a boxes, el que pueda!",
        "Coche de seguridad en pista. El que tenía la carrera controlada ya no la tiene, amigos.",
      ]), true);
      if (/BANDERA ROJA/.test(t)) return say(pick([
        "¡Bandera roja! ¡Se para la carrera! Todos al pit-lane, esto es muy serio.",
        "¡Roja, roja! Carrera suspendida. Ahora a esperar y a cambiar neumáticos gratis.",
      ]), true);
      if (/Relanzada|Fin del coche de seguridad virtual/.test(t)) return say(pick([
        "¡Bandera verde! ¡Vamos! ¡A pelear otra vez!",
        "¡Se relanza la carrera! El líder marca el ritmo... ¡y ya están todos con el cuchillo entre los dientes!",
        "¡Verde! Ojo a la primera curva, que aquí se pierde y se gana mucho.",
      ]), true);
      if ((m = t.match(/POLE para (.+?) \((.+?)\)/))) {
        const c = sess.cars.find((x) => x.d.nombre === m![1]);
        const who = c ? nm(c) : m[1];
        return say(c && spanish(c)
          ? pick([`¡POLE! ¡POLE PARA ${who.toUpperCase()}! ¡Qué vuelta, qué vuelta! ¡Se me ponen los pelos de punta!`, `¡${who} se lleva la pole! ¡Qué barbaridad! ¡Esto es España, señores!`])
          : pick([`¡Pole position para ${who}! Vuelta perfecta con el ${m[2]}.`, `¡${who}! ¡Qué vuelta! Mañana sale desde la primera posición.`, `${who} se lleva la pole. Una vuelta de esas que no se olvidan.`]), true);
      }
      if ((m = t.match(/Eliminados en (\S+): (.*)/))) {
        const out = m[2].split(/[,\s]+/).filter(Boolean).map((x) => { const c = byAbrev(x); return c ? sur(c) : x; });
        const txt = out.length > 1 ? `${out.slice(0, -1).join(", ")} y ${out[out.length - 1]}` : out.join("");
        const sp = out.length ? sess.cars.filter((c) => spanish(c) && out.includes(sur(c))) : [];
        if (sp.length) return say(`Se acaba la ${m[1]}... y ${sp.map(nm).join(" y ")} se queda${sp.length > 1 ? "n" : ""} fuera. Qué pena, de verdad. Eliminados: ${txt}.`);
        return say(pick([`Se acaba la ${m[1]} y se quedan fuera ${txt}. Duro, muy duro.`, `Final de la ${m[1]}. Fuera: ${txt}. Así de cruel es la clasificación.`]));
      }
      if ((m = t.match(/Empieza la (\S+)/))) return say(pick([
        `¡Arranca la ${m[1]}! Semáforo verde al final del pit-lane.`,
        `Empieza la ${m[1]}. Ahora sí, aquí no hay margen para el error.`,
      ]));
      if (/^🏁 Bandera a cuadros/.test(t) && race) {
        const w = sess.order()[0];
        if (!w) return null;
        return say(spanish(w)
          ? pick([`¡¡${nm(w).toUpperCase()} GANA!! ¡¡GANA EN ${gp.replace(/^Gran Premio de /i, "").toUpperCase()}!! ¡No me lo puedo creer, señores!`, `¡Victoria de ${nm(w)}! ¡Qué carrera! ¡Esto es historia!`])
          : pick([`¡Bandera a cuadros! ¡${sur(w)} gana el ${gp}!`, `¡${sur(w)} cruza la meta y se lleva la victoria! Qué carrera nos ha dado ${gp.replace(/^Gran Premio de /i, "")}.`, `Victoria para ${sur(w)} con el ${w.team.nombre}. Impecable.`]), true);
      }
      if ((m = t.match(/(\d+) s de sanción para (\w+): (.*)/))) {
        const c = byAbrev(m[2]);
        if (c) return say(/toque/.test(m[3])
          ? pick([`¡Sanción para ${sur(c)}! ${m[1]} segundos por el toque. Los comisarios no perdonan.`, `${m[1]} segundos a ${sur(c)}. Lo han visto culpable, y con razón.`])
          : /límites/.test(m[3]) ? pick([`¡${m[1]} segundos a ${sur(c)} por los límites de pista! Ya se lo habían avisado con la blanca y negra.`, `Sanción para ${sur(c)}: los límites de pista. Se veía venir.`])
          : `Sanción para ${sur(c)}: ${m[1]} segundos. Eso le cuesta caro.`, true);
      }
      if (/sin sanción, incidente de carrera/.test(t)) return say(pick(["Incidente de carrera, dicen los comisarios. Para mí también, sinceramente.", "Sin sanción. Son cosas de las carreras."]));
      if ((m = t.match(/Bandera blanca y negra para (\w+)/))) { const c = byAbrev(m[1]); if (c) return say(`Bandera blanca y negra para ${sur(c)}. Una más y le cae sanción.`); }
      if (/Los doblados pueden desdoblarse/.test(t)) return say("Los doblados pueden desdoblarse. Eso quiere decir que el coche de seguridad está a punto de irse.");
      if (/El líder acelera: relanzada/.test(t)) return say(pick(["¡Acelera el líder! ¡Relanzada! ¡Agárrense!", "¡Y ahí va! ¡Ha elegido el momento! ¡Relanzada!"]), true);
      if (/salida parada/.test(t)) return say("Se reanuda con salida parada desde la parrilla. ¡Otra salida! Esto es como empezar de cero.", true);
      if (/Bandera amarilla/.test(t)) return say(pick(["Bandera amarilla. Algo ha pasado ahí, cuidado.", "Amarilla en ese sector. A levantar, que no se juegan la sanción."]));
      if ((m = t.match(/(\w+) descalificado/))) { const c = byAbrev(m[1]); return say(`¡Descalificado ${c ? sur(c) : m[1]}! Error de libro: no ha usado los dos compuestos.`, true); }
      if (/Vuelta anulada/.test(t) && (m = t.match(/a (\w+):/))) { const c = byAbrev(m[1]); if (c) return say(pick([`Le borran la vuelta a ${sur(c)}. Los límites de pista, ¡siempre los límites de pista!`, `¡Ay! Vuelta anulada a ${sur(c)}. Se ha pasado de la línea blanca.`])); }
      return null;
    }
    if (e.kind === "weather") {
      if (/Deja de llover/.test(t)) return say("Deja de llover. Ahora la gran pregunta: ¿cuándo se pasa a slicks? El que acierte, gana.");
      if (/lluv|Lluv|llov|llueve/.test(t)) return say(pick([
        "¡Atención, que llega la lluvia! Esto puede ser una lotería, amigos.",
        "Lluvia en el radar. Aquí los grandes pilotos marcan la diferencia.",
        "¡Llueve! Y cuando llueve en la Fórmula 1, cualquier cosa puede pasar.",
      ]));
      return null;
    }
    if (e.kind === "info" && (m = t.match(/(\w+) adelanta a (\w+) por la P(\d+)/))) {
      const a = byAbrev(m[1]), b = byAbrev(m[2]), pos = Number(m[3]);
      if (!a || !b) return null;
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
    if (e.kind === "incident") {
      if ((m = t.match(/(\w+) (abandona|se queda fuera)/))) {
        const c = byAbrev(m[1]);
        if (!c) return null;
        return say(spanish(c)
          ? pick([`¡No, no, no! ¡${nm(c)} se retira! Qué mala suerte, de verdad.`, `Mal día para ${nm(c)}. Se acabó su carrera. Qué rabia.`])
          : pick([`¡Abandono de ${sur(c)}! Se acaba su carrera.`, `Fin de la carrera para ${sur(c)}. Hoy no era su día.`, `${sur(c)} para el coche. Malas noticias para el ${c.team.nombre}.`]), true);
      }
      if ((m = t.match(/Toque (?:entre )?(\w+)(?: y |–)(\w+)/))) {
        const a = byAbrev(m[1]), b = byAbrev(m[2]);
        if (a && b) return say(pick([`¡Contacto entre ${sur(a)} y ${sur(b)}! ¡Uy, uy, uy!`, `¡Se tocan ${sur(a)} y ${sur(b)}! A ver qué dicen los comisarios.`, `¡Toque! ${sur(a)} y ${sur(b)} se han rozado. Esto ha dolido.`]), true);
      }
      if ((m = t.match(/(\w+) y (\w+) se tocan/))) {
        const a = byAbrev(m[1]), b = byAbrev(m[2]);
        if (a && b) return say(`¡${sur(a)} y ${sur(b)} se tocan y se van largos! Por poco no acaban los dos fuera.`, true);
      }
      if ((m = t.match(/Pinchazo de (\w+)/))) { const c = byAbrev(m[1]); if (c) return say(`¡Pinchazo para ${sur(c)}! Vuelta entera con la goma destrozada. ¡Qué drama!`, true); }
      if ((m = t.match(/(\w+) hace un trompo/))) { const c = byAbrev(m[1]); if (c && (c.player || spanish(c) || Math.random() < 0.4)) return say(pick([`¡Trompo de ${sur(c)}! Ha hecho un trescientos sesenta... y sigue, pero cuánto tiempo ha perdido.`, `¡Se le ha ido el coche a ${sur(c)}! Vuelta completa, ¡qué susto!`])); }
      if ((m = t.match(/(\w+) se sale de pista/))) { const c = byAbrev(m[1]); if (c && (c.player || spanish(c) || Math.random() < 0.4)) return say(pick([`¡Se va largo ${sur(c)}! Por la escapatoria... ha perdido mucho tiempo.`, `¡Uy! ¡${sur(c)} fuera de pista! Ese error le cuesta caro.`])); }
      return null;
    }
    if (e.kind === "pit" && race && e.carId !== undefined) {
      const c = sess.carById(e.carId);
      if ((m = t.match(/Parada de \w+: ([\d.]+) s/)) && Number(m[1]) > 5) return say(`¡Problemas en la parada de ${sur(c)}! ${m[1].replace(".", ",")} segundos parado... ¡eso es una eternidad!`, true);
      if (/entra a boxes/.test(t)) {
        const pos = sess.order().indexOf(c) + 1;
        if (pos <= 3 || spanish(c) || (c.player && Math.random() < 0.5)) return say(pick([
          `Entra a boxes ${sur(c)}, que iba ${pos}º. ¿Undercut? Atentos a cómo sale.`,
          `¡Para ${sur(c)}! Movimiento de estrategia, a ver si le sale bien al ${c.team.nombre}.`,
          `${sur(c)} al pit-lane. Ahora hay que hacer una vuelta de salida perfecta.`,
        ]));
      }
      return null;
    }
    if (e.kind === "info" && quali && (m = t.match(/(\w+) ([\d:.]+) — P1(?!\d)/)) && e.carId !== undefined) {
      const c = sess.carById(e.carId);
      return say(spanish(c) ? `¡${nm(c)} se pone primero! ¡Vamos! ${m[2]}.` : pick([`${sur(c)} se pone primero con un ${m[2]}.`, `¡Mejor tiempo para ${sur(c)}! ${m[2]}, la referencia.`]));
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
