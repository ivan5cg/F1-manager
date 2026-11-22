// La radio de los pilotos con personalidad: cada piloto tiene un carácter y habla a su manera cuando pasa algo
// (adelanta, le adelantan, se toca, trompea, la parada sale mal, gana...). Y, de vez en cuando, una radio mítica de
// verdad, si se da una situación parecida y el que la dijo está en pista. También contestan a las órdenes del muro
// (`responde`): parar, apretar, ahorrar, dejar pasar, defender o no pelear, pelear en duro o en limpio. Solo interfaz, como Lobato: usa Math.random,
// no el generador de la sesión, así que no cambia ningún resultado.
//
// Reacciona al código de cada suceso (RaceEvent.code), no al texto. Los mensajes en los que la simulación ya hace
// hablar al piloto (gomas acabadas, plano) se reescriben con su voz; el resto son mensajes nuevos.
import { Session, Car, RaceEvent, isRaceKind, isQualiKind } from "../sim/session";

import { Caracter, caracterOf, hash } from "../sim/caracter";
export { caracterOf };
export type { Caracter };

/** Cómo suena cada carácter en la voz sintetizada (y un poco distinto cada piloto, para reconocerlo). */
const VOZ: Record<Caracter, { pitch: number; rate: number }> = {
  calmado: { pitch: 0.95, rate: 0.98 }, quejica: { pitch: 1.05, rate: 1.1 }, volcanico: { pitch: 1.1, rate: 1.2 },
  cerebral: { pitch: 1, rate: 1.02 }, socarron: { pitch: 0.88, rate: 1 }, novato: { pitch: 1.15, rate: 1.12 }, autocritico: { pitch: 1.05, rate: 1.08 },
};
export interface VoiceTone { pitch: number; rate: number }
export function voiceOf(nombre: string, engineer = false): VoiceTone {
  if (engineer) return { pitch: 0.8, rate: 1 };
  const v = VOZ[caracterOf(nombre)], j = ((hash(nombre) % 11) - 5) / 100;
  return { pitch: v.pitch + j, rate: v.rate - j / 2 };
}

type Situ = "gomas" | "plano" | "adelanta" | "adelantado" | "toque" | "trompo" | "dano" | "trafico" | "vueltaP1" | "eliminado" | "pole"
  | "paradaLenta" | "paradaBuena" | "salePeor" | "estratega" | "aguaSi" | "aguaNo" | "abandono" | "gana" | "podio" | "puntos" | "sinPuntos"
  | "limites" | "pinchazo" | "companero" | "rivalGana" | "noDejo" | "unaMas" | "rivalPasa" | "rivalMePasa";

// {r}: el rival (apellido); {p}: la posición; {s}: los segundos.
const FRASES: Record<Situ, Partial<Record<Caracter, string[]>> & { _: string[] }> = {
  gomas: {
    _: ["Las gomas se están acabando, noto cómo caen."],
    calmado: ["Las traseras empiezan a irse. Ya no hay mucho más ahí.", "Noto la caída de las gomas. Pensad en la parada."],
    quejica: ["¡No tengo gomas! ¡Esto es imposible de conducir!", "¡Las ruedas están muertas! ¿A qué estamos esperando?"],
    volcanico: ["¡Se acabaron las gomas! ¡Metedme dentro ya!", "¡Esto patina por todas partes! ¡Sin gomas, sin nada!"],
    cerebral: ["Degradación alta, sobre todo atrás. Yo pararía en dos o tres vueltas.", "La delantera izquierda está en las lonas. Mirad la ventana de parada."],
    socarron: ["Bueno, chicos, estas gomas ya han dado todo lo que tenían. Y un poco más.", "Si queréis seguir fuera, seguimos. Pero esto ya es un milagro."],
    novato: ["Eh... las gomas están cayendo mucho, ¿es normal?", "Pierdo agarre en cada curva. ¿Qué hago?"],
    autocritico: ["Las he gastado demasiado, lo siento. No queda nada.", "He sido muy agresivo con las gomas. Ya no van."],
  },
  plano: {
    _: ["He bloqueado, tengo un plano en el delantero."],
    quejica: ["¡Plano! ¡Vibra todo el coche, no veo nada!"],
    volcanico: ["¡Mierda! ¡He bloqueado! ¡Plano en la delantera!"],
    socarron: ["Un plano. Ahora el coche hace de masajeador."],
    autocritico: ["He bloqueado como un idiota. Plano en la delantera."],
    novato: ["He bloqueado... ahora vibra mucho, ¿aguanta?"],
  },
  adelanta: {
    _: ["¡Hecho! Pasado {r}."],
    calmado: ["Pasado {r}. Seguimos.", "Vale, {r} detrás. A por el siguiente."],
    quejica: ["¡Por fin! Llevaba vueltas ahí atascado."],
    volcanico: ["¡VAMOS! ¡Toma ya! ¡Fuera {r}!", "¡Siiií! ¡Por dentro y hasta luego!"],
    cerebral: ["Pasado {r}. Ahora a cuidar las gomas un par de vueltas.", "Hecho. Dadme el hueco con el de delante."],
    socarron: ["{r} se ha quedado mirando. Siguiente.", "Ha sido fácil. Demasiado fácil."],
    novato: ["¡Le he pasado! ¡He pasado a {r}!", "¡Vamos! ¿Habéis visto eso?"],
    autocritico: ["Pasado. Por fin hago algo bien hoy."],
  },
  adelantado: {
    _: ["Me ha pasado {r}."],
    calmado: ["{r} tenía más ritmo. No he podido hacer nada.", "Me pasa {r}. Seguimos en lo nuestro."],
    quejica: ["¡Es que no tengo velocidad punta! ¡Me pasan como si nada!", "¿Qué le pasa a este coche? ¡Me pasa {r} en la recta!"],
    volcanico: ["¡Me ha echado fuera! ¡Eso no es legal!", "¡Pero qué hace {r}! ¡Me ha cerrado la puerta en la cara!"],
    cerebral: ["Pasa {r} con más goma. No vale la pena pelearlo, lo recuperamos luego.", "Le dejo ir. Si me defiendo, me como las gomas."],
    socarron: ["Que pase, que pase. Ya nos veremos más adelante.", "Bueno, {r} tiene prisa. Ya se le acabarán las gomas."],
    novato: ["Uf, me ha pasado {r}... lo siento, chicos.", "No he podido aguantarle, iba muy rápido."],
    autocritico: ["He salido fatal de la curva. Culpa mía.", "Le he dejado la puerta abierta. Qué tonto."],
  },
  toque: {
    _: ["¡Nos hemos tocado con {r}!"],
    calmado: ["Contacto con {r}. Revisad los datos, creo que el coche está bien.", "Toque con {r}. Ha sido un incidente de carrera."],
    quejica: ["¡Me ha dado {r}! ¡Que lo investiguen!", "¡Me ha sacado! ¡Mirad los daños!"],
    volcanico: ["¡¿Pero qué hace?! ¡{r} es un idiota!", "¡Me ha tocado! ¡Me ha tocado! ¡Sanción, ya!"],
    cerebral: ["Contacto con {r}. Mirad la presión de las ruedas y la carga del alerón.", "Toque. Decidme si hay daños antes de forzar."],
    socarron: ["{r} ha decidido que la pista era suya. Interesante.", "Bueno, {r} y yo nos hemos saludado. Un poco fuerte."],
    novato: ["¡Perdón, perdón! No le he visto.", "¿Estoy bien? ¿El coche está bien?"],
    autocritico: ["Ha sido culpa mía. Lo siento, chicos.", "He frenado tarde. Mi error."],
  },
  trompo: {
    _: ["Me he ido. Sigo."],
    calmado: ["Me he ido. Sigo, todo bien.", "Se me ha ido la trasera. Seguimos."],
    quejica: ["¡El coche es inconducible! ¡Se me ha ido sin avisar!", "¡No hay agarre! ¡Así no se puede!"],
    volcanico: ["¡NOOO! ¡Mierda, mierda!", "¡Se me ha ido! ¡Qué rabia!"],
    cerebral: ["Trompo. Creo que he pisado agua o goma. Seguimos.", "He perdido la trasera en la entrada. Ajusto el freno motor."],
    socarron: ["He dado una vuelta para ver el paisaje. Ya sigo.", "Bonita vista desde la escapatoria."],
    novato: ["¡Lo siento! ¡Lo siento mucho!", "Se me ha ido... ¿está bien el coche?"],
    autocritico: ["Soy un desastre. Perdón, chicos.", "Error mío. Totalmente mío."],
  },
  dano: {
    _: ["Noto el coche raro desde el golpe."],
    quejica: ["¡El coche está destrozado! ¡No gira!"],
    volcanico: ["¡Está roto! ¡Lo noto en cada curva!"],
    cerebral: ["Pierdo carga en las rápidas. Dadme datos para compensar con el diferencial."],
    socarron: ["El coche ha perdido algo de elegancia. Y de carga."],
    novato: ["¿Puedo seguir así? Se nota mucho."],
  },
  trafico: {
    _: ["¡Me ha estorbado {r}!"],
    calmado: ["{r} estaba en medio. Vuelta perdida.", "Tráfico. Hay que buscar otro hueco."],
    quejica: ["¡{r} en medio de la trazada! ¡Avisadle!", "¡Siempre me toca el tráfico! ¡Siempre!"],
    volcanico: ["¡¿PERO QUÉ HACE?! ¡{r} me ha destrozado la vuelta!", "¡Que lo sancionen! ¡Me ha bloqueado!"],
    cerebral: ["Tráfico de {r} en el último sector. Para la próxima, sacadme con más hueco.", "Vuelta comprometida. Os pido mejor sitio en la salida de boxes."],
    socarron: ["{r} se ha parado a hacer turismo justo delante. Muy amable.", "Me encanta encontrarme a {r} de paseo en vuelta rápida."],
    novato: ["Había un coche lento... ¿lo denuncio?"],
    autocritico: ["Debería haber dejado más hueco. Error de los dos."],
  },
  vueltaP1: {
    _: ["¡Buena vuelta!"],
    calmado: ["Buena vuelta. Hay algo más en el sector 2."],
    quejica: ["Primero, pero el coche sigue sin girar en lento."],
    volcanico: ["¡VAMOS! ¡Qué vuelta, qué vuelta!"],
    cerebral: ["Bien. Dejaría la carga como está para la siguiente."],
    socarron: ["¿Primero? Pues no iba al límite."],
    novato: ["¿Primero? ¿De verdad? ¡Increíble!"],
    autocritico: ["Primero, pero he fallado en la última curva. Había más."],
  },
  eliminado: {
    _: ["Fuera. No había más."],
    calmado: ["No había más en el coche. Mañana remontamos.", "Fuera. Hemos sacado lo que había."],
    quejica: ["¡Es que el coche no anda! ¡Así no se puede!", "Fuera otra vez. Tenemos que hablar del coche."],
    volcanico: ["¡No! ¡Por nada! ¡Por nada!", "¡Qué rabia! ¡Fuera por milésimas!"],
    cerebral: ["Fuera. Mañana con gomas nuevas a elegir, eso lo podemos aprovechar.", "Nos ha faltado en el sector 1. Revisemos el reglaje."],
    socarron: ["Mañana hay que adelantar a mucha gente. Mejor, más diversión.", "Bueno, mañana saldremos con la cara lavada."],
    novato: ["Lo siento mucho, chicos. No he hecho la vuelta.", "No he estado bien. Lo siento."],
    autocritico: ["La culpa es mía, he fallado la vuelta. Lo siento.", "He sido muy lento. Pido perdón al equipo."],
  },
  pole: {
    _: ["¡Pole! ¡Bien hecho, chicos!"],
    calmado: ["Pole position. Gran trabajo de todo el equipo. Gracias."],
    quejica: ["¡Pole! ¡Por fin el coche hace lo que le pido!"],
    volcanico: ["¡POLE! ¡POLE! ¡VAMOS, VAMOS, VAMOS!"],
    cerebral: ["Pole. Ahora a pensar en la salida y en la primera tanda."],
    socarron: ["Pole. Ya os dije que había vuelta."],
    novato: ["¿Pole? ¡No me lo creo! ¡Gracias, gracias!"],
    autocritico: ["¡Pole! ¡No sé ni cómo! ¡Gracias, equipo!"],
  },
  paradaLenta: {
    _: ["¿Qué ha pasado en la parada?"],
    calmado: ["Parada lenta. Pasa. Lo recuperamos en pista."],
    quejica: ["¡{s} segundos! ¿¡Qué ha pasado ahí!?", "¡Otra parada lenta! ¡Siempre igual!"],
    volcanico: ["¡¿{s} segundos?! ¡Me habéis arruinado la carrera!", "¡NO! ¡¿Pero qué hacéis?!"],
    cerebral: ["Parada lenta. Decidme dónde salgo y a quién tengo delante.", "Tranquilos, chicos. Dadme los huecos."],
    socarron: ["¿Habéis parado a tomar un café?", "{s} segundos. He tenido tiempo de leer el periódico."],
    novato: ["¿Ha ido algo mal? ¿Sigo?"],
    autocritico: ["¿Me he pasado de la marca? Perdón si ha sido culpa mía."],
  },
  paradaBuena: {
    _: ["¡Buena parada, chicos!"],
    volcanico: ["¡Parada de lujo! ¡Sois los mejores!"],
    socarron: ["Así me gusta. Ni me ha dado tiempo a saludar."],
    cerebral: ["Gran parada. Ahora, dadme el objetivo de tiempo."],
  },
  salePeor: {
    _: ["He salido en tráfico."],
    quejica: ["¡He salido detrás de todo el mundo! ¿Para qué hemos parado?"],
    volcanico: ["¡¿Qué estrategia es esta?! ¡He perdido posiciones!"],
    cerebral: ["Salgo en tráfico. Necesito que el de delante pare pronto."],
    socarron: ["Interesante estrategia. Muy interesante."],
    novato: ["Hay mucha gente delante... ¿era así el plan?"],
  },
  estratega: {
    _: ["Recibido."],
    calmado: ["Recibido. Cuando digáis."],
    quejica: ["¿Ahora? Las gomas aún aguantan... bueno, vosotros sabréis."],
    volcanico: ["¡Decidíos ya! ¿Entro o no entro?"],
    cerebral: ["De acuerdo, pero mirad el tráfico en la salida antes de llamarme."],
    socarron: ["¿Seguro? Vale, vale. Vosotros sois los listos."],
    novato: ["Vale, lo que digáis."],
    autocritico: ["Ok. Siento haberme comido las gomas tan rápido."],
  },
  aguaSi: {
    _: ["Sí, entro. Esto ya no va."],
    calmado: ["Sí, entro. Ya no hay agarre."],
    quejica: ["¡Sí! ¡Metedme ya! ¡Esto es una pista de hielo!"],
    volcanico: ["¡Box, box, box! ¡Ya!"],
    socarron: ["Me apetece cambiar de zapatos, sí."],
    novato: ["Sí, sí, entro. Casi me voy fuera."],
  },
  aguaNo: {
    _: ["Una vuelta más, aguanto."],
    cerebral: ["Espera. En el sector 3 está casi seco. Una vuelta más.", "Aún no. Si para en dos minutos, ganamos mucho."],
    socarron: ["Tranquilos, que he corrido con más agua que esto."],
    calmado: ["Aguanto una vuelta. Os digo."],
  },
  abandono: {
    _: ["Se acabó. Lo siento, chicos."],
    calmado: ["Se acabó. Una pena. Gracias igualmente, chicos."],
    quejica: ["¡No! ¡Otra vez! ¿Cuántas van ya?", "¡Siempre me pasa a mí!"],
    volcanico: ["¡NOOOO! ¡No puede ser! ¡NO!", "¡Mierda! ¡Todo para nada!"],
    cerebral: ["Fuera. Guardad todos los datos, quiero entender qué ha pasado."],
    socarron: ["Bueno, hoy tocaba volver pronto al hotel.", "Se ha acabado la fiesta. Otra vez será."],
    novato: ["¿Ya está? ¿No puedo seguir? Lo siento...", "Lo siento mucho, chicos..."],
    autocritico: ["Lo siento, he fallado al equipo. De verdad.", "Os he dejado tirados. Perdón."],
  },
  gana: {
    _: ["¡SÍIII! ¡GANAMOS! ¡GRACIAS, CHICOS!"],
    calmado: ["¡Sí! Gracias, chicos. Victoria de todo el equipo. Enorme.", "¡Lo hemos hecho! Gracias a todos en la fábrica."],
    quejica: ["¡SÍ! ¡Y eso que el coche no giraba! ¡VAMOS!"],
    volcanico: ["¡SÍIIIII! ¡VAMOOOS! ¡QUÉ CARRERA, QUÉ CARRERA!", "¡AAAAAH! ¡GANAMOS! ¡GANAMOS!"],
    cerebral: ["¡Victoria! Estrategia perfecta, chicos. Perfecta.", "¡Sí! Gran trabajo en el muro. Lo teníais todo calculado."],
    socarron: ["¡Victoria! Os lo dije: paciencia.", "¡Vamos! Ya me estaba aburriendo de no ganar."],
    novato: ["¡¿Hemos ganado?! ¡NO ME LO CREO! ¡GRACIAS!", "¡Es un sueño! ¡Es un sueño, chicos!"],
    autocritico: ["¡GANAMOS! ¡No sé ni cómo! ¡Gracias, gracias!"],
  },
  podio: {
    _: ["¡Podio! ¡Bien hecho, chicos!"],
    calmado: ["Podio. Gran trabajo de todos.", "P{p}. Un buen resultado, chicos."],
    quejica: ["Podio, pero con otra estrategia ganábamos."],
    volcanico: ["¡PODIO! ¡VAMOS!"],
    cerebral: ["P{p}. Buen resultado. Hablamos de la segunda tanda."],
    socarron: ["Podio. No está mal para empezar."],
    novato: ["¡Podio! ¡Mi primer podio contigo, equipo!", "¡Estamos en el podio! ¡Increíble!"],
    autocritico: ["Podio, pero había más. Mis errores nos han costado."],
  },
  puntos: {
    _: ["P{p}. Puntos."],
    calmado: ["P{p}. Puntos importantes, chicos.", "Puntos. Seguimos sumando."],
    quejica: ["P{p}. Con este coche no se puede más."],
    volcanico: ["P{p}... quería más. Mucho más."],
    cerebral: ["P{p}. Buena gestión. Aprendemos para la próxima."],
    socarron: ["P{p}. Algo es algo."],
    novato: ["¡Puntos! ¡Gracias, chicos!"],
    autocritico: ["P{p}. Tengo que mejorar en la salida."],
  },
  sinPuntos: {
    _: ["P{p}. No había más."],
    calmado: ["P{p}. Un día difícil. Seguimos trabajando.", "No ha sido nuestro día."],
    quejica: ["P{p}. ¿Qué queréis que haga con este coche?"],
    volcanico: ["P{p}. Un desastre. Un desastre total."],
    cerebral: ["P{p}. Tenemos que entender por qué nos faltaba ritmo."],
    socarron: ["P{p}. Mañana nadie se acordará de esto."],
    novato: ["P{p}... lo siento, chicos. Aprenderé."],
    autocritico: ["P{p}. He estado mal. Lo siento."],
  },
  limites: {
    _: ["¿Límites? Si no me he pasado."],
    quejica: ["¡¿Límites?! ¡Si estaba dentro!"],
    volcanico: ["¡Pero si no me he pasado! ¡Que lo miren otra vez!"],
    socarron: ["Esa línea blanca se mueve, os lo juro."],
    autocritico: ["Vale, vale. Lo tengo."],
  },
  pinchazo: {
    _: ["¡Pinchazo! ¡Entro!"],
    quejica: ["¡Pinchazo! ¡No me lo puedo creer!"],
    volcanico: ["¡PINCHAZO! ¡NO, NO, NO!"],
    calmado: ["Pinchazo. Entro, preparad las gomas."],
    socarron: ["Tengo una rueda menos de las que me gustaría. Entro."],
  },
  companero: {
    _: ["Soy más rápido que {r}. ¿Me dejáis pasar?"],
    quejica: ["¡Estoy perdiendo el tiempo detrás de {r}! ¡Haced algo!"],
    volcanico: ["¡Soy más rápido! ¡Que se aparte {r}!"],
    cerebral: ["Tengo un segundo más de ritmo que {r}. Pensad en el equipo."],
    socarron: ["{r} es muy simpático, pero me está haciendo perder la mañana."],
    novato: ["Creo que soy un poco más rápido que {r}... ¿puedo intentarlo?"],
    autocritico: ["Tengo ritmo, pero no quiero arriesgar con {r}. Decidme."],
  },
  rivalGana: {
    _: ["¡Vamos! ¡Victoria, chicos!"],
    volcanico: ["¡SÍIII! ¡VAMOOOS!"],
    calmado: ["Gran trabajo, chicos. Gracias."],
  },
  // con la moral baja: no obedece al muro (8.2)
  noDejo: {
    _: ["No. No le dejo pasar."],
    volcanico: ["¡NO! ¡Ni hablar! ¡Que me pase en la pista si puede!", "¡No pienso apartarme! ¡Soy más rápido que {r}!"],
    quejica: ["¿Otra vez yo? No. Esta vez no me aparto.", "Siempre me toca a mí. No le dejo."],
    socarron: ["Qué gracioso. No, gracias.", "Si {r} quiere pasar, que lo intente. Así nos divertimos."],
    cerebral: ["No tiene sentido: voy más rápido que {r}. Me quedo delante.", "Negativo. Con los números en la mano, no le dejo."],
    novato: ["Eh... prefiero no dejarle pasar, voy bien.", "¿Seguro? Es que voy rápido... me quedo delante."],
    autocritico: ["Lo siento, pero hoy no. Voy mejor que él."],
    calmado: ["Prefiero seguir así. Lo hablamos después."],
  },
  unaMas: {
    _: ["Una vuelta más, las gomas aguantan."],
    volcanico: ["¡No entro! ¡Las gomas van perfectas! ¡Una vuelta más!", "¡Que no! ¡Todavía no! ¡Paro la que viene!"],
    quejica: ["¿Ahora? No, no, las gomas van bien. Una más.", "Siempre me paráis cuando voy bien. Una vuelta más."],
    socarron: ["Me quedo fuera una vuelta. Tomaos un café.", "Las gomas y yo nos llevamos bien. Una vuelta más."],
    cerebral: ["Me quedo una vuelta más: tengo goma y aire limpio.", "Alargo una vuelta. Confiad en mí."],
    novato: ["Eh... ¿puedo una vuelta más? Van bien...", "Me he pasado la entrada... bueno, a propósito. Una más."],
    autocritico: ["Una vuelta más, por favor. Quiero recuperar lo que perdí."],
    calmado: ["Una más. Las gomas aguantan, tranquilos."],
  },
  // rivalidades (8.3)
  rivalPasa: {
    _: ["¡Pasado {r}! ¡Otra vez!"],
    volcanico: ["¡TOMA, {r}! ¡Que se acuerde de esta!", "¡Fuera {r}! ¡Esto es personal!"],
    quejica: ["Por fin me quito a {r} de encima. Qué pesado.", "{r} siempre igual. Ya está detrás."],
    socarron: ["Saludad a {r} de mi parte. Por el retrovisor.", "{r} se ha quedado otra vez mirando."],
    cerebral: ["{r} detrás. Ahora a abrir hueco antes de que me ataque.", "Pasado {r}. Ojo, que va a volver."],
    novato: ["¡He pasado a {r}! ¡Esta vez sí!", "¡Toma! ¡{r} detrás!"],
    autocritico: ["Bien. A {r} había que ganarle hoy.", "Le debía una a {r}. Hecho."],
    calmado: ["{r} detrás. Seguimos.", "Bien. {r} ya está detrás."],
  },
  rivalMePasa: {
    _: ["{r} otra vez... ¡no!"],
    volcanico: ["¡Otra vez {r}! ¡Me ha sacado de la pista! ¡Mirad la repetición!", "¡NO! ¡{r} no! ¡Cualquiera menos él!"],
    quejica: ["{r}, siempre {r}. Me ha cerrado, que lo miren.", "¿Cómo puede ser que siempre me pase {r}?"],
    socarron: ["{r} vuelve a tener un buen día. Qué suerte la suya.", "Disfruta, {r}. Te veo en la siguiente frenada."],
    cerebral: ["{r} me pasa. Ritmo, ritmo: lo recupero en la parada.", "Le he dejado hueco a {r}. Error mío."],
    novato: ["Me ha pasado {r}... ¡lo vuelvo a intentar!"],
    autocritico: ["Me he dejado pasar por {r} como un novato.", "Qué mal. Justo {r}."],
    calmado: ["{r} me ha pasado. Ya habrá oportunidades.", "Bien hecho por {r}. Vamos a por él."],
  },
};

/** Una radio mítica: quién la dijo (o su ingeniero), en qué situación y lo que dijo (traducido y en el original). */
interface Mitica { id: string; quien: string; ing?: boolean; texto: string; orig: string; donde: string }
const M: Record<string, Mitica> = {
  gp2: { id: "gp2", quien: "Fernando Alonso", texto: "¡Motor de GP2! ¡GP2! ¡Aaagh!", orig: "GP2 engine! GP2! Argh!", donde: "Suzuka 2015" },
  idiota: { id: "idiota", quien: "Fernando Alonso", texto: "¡Qué idiota! Cerrando la puerta por fuera. Este solo sabe pilotar y salir primero.", orig: "What an idiot, closing the door from the outside. We only know how to drive and start in first.", donde: "Spa 2022" },
  dejame: { id: "dejame", quien: "Kimi Räikkönen", texto: "Déjame en paz. Sé lo que hago.", orig: "Just leave me alone, I know what I'm doing.", donde: "Abu Dabi 2012" },
  todoElRato: { id: "todoElRato", quien: "Kimi Räikkönen", texto: "¡Sí, sí, sí, sí! ¡Lo estoy haciendo todo el rato!", orig: "Yes, yes, yes, yes! I'm doing that all the time!", donde: "Abu Dabi 2012" },
  masRapido: { id: "masRapido", quien: "Felipe Massa", ing: true, texto: "Felipe, Fernando es más rápido que tú. ¿Lo has entendido?", orig: "Fernando is faster than you. Can you confirm you understood that message?", donde: "Hockenheim 2010" },
  buenChico: { id: "buenChico", quien: "Felipe Massa", ing: true, texto: "Buen chico. Aguanta ahí. Lo siento.", orig: "Good lad. Just stick with it now. Sorry.", donde: "Hockenheim 2010" },
  bono: { id: "bono", quien: "Lewis Hamilton", texto: "¡Bono, mis neumáticos están acabados!", orig: "Bono, my tyres are gone!", donde: "un clásico de Hamilton" },
  vamosLewis: { id: "vamosLewis", quien: "Lewis Hamilton", ing: true, texto: "¡Vamos, Lewis! ¡Vamos!", orig: "Get in there, Lewis!", donde: "un clásico de Bono" },
  manipulado: { id: "manipulado", quien: "Lewis Hamilton", texto: "Esto ha sido manipulado, tío.", orig: "This has been manipulated, man.", donde: "Abu Dabi 2021" },
  tututu: { id: "tututu", quien: "Max Verstappen", ing: true, texto: "♪ Tu-tu-tu-du, Max Verstappen ♪", orig: "Tu-tu-tu-du, Max Verstappen!", donde: "Gianpiero Lambiase" },
  precioso: { id: "precioso", quien: "Max Verstappen", texto: "Simplemente precioso.", orig: "Simply lovely.", donde: "un clásico de Verstappen" },
  estupido: { id: "estupido", quien: "Charles Leclerc", texto: "¡Soy estúpido! ¡Soy estúpido!", orig: "I am stupid. I am stupid.", donde: "Bakú 2019" },
  porQue: { id: "porQue", quien: "Charles Leclerc", texto: "¿Por qué? ¿¡POR QUÉ!?", orig: "Whyyy?!", donde: "Mónaco 2022" },
  noNo: { id: "noNo", quien: "Lando Norris", texto: "¡No! ¡No, no, no! ¡Me quedo fuera!", orig: "No! No, no!", donde: "Sochi 2021" },
  smooth: { id: "smooth", quien: "Carlos Sainz", texto: "♪ Smooth operatoooor... ♪", orig: "Smooth operator", donde: "su canción" },
  quienCorresponda: { id: "quienCorresponda", quien: "Valtteri Bottas", texto: "A quien corresponda: que os den.", orig: "To whom it may concern: f*** you.", donde: "Australia 2019" },
  numeroDos: { id: "numeroDos", quien: "Mark Webber", texto: "No está mal para un piloto número dos.", orig: "Not bad for a number two driver.", donde: "Silverstone 2010" },
};

/** Órdenes del muro a las que contesta el piloto (8.1). Solo texto: siempre obedece. */
export type Orden = "box" | "anula" | "apretar" | "ahorrar" | "dejarPasar" | "defender" | "noPelear" | "duro" | "limpio";
/** Cada orden, con su variante a disgusto (gomas nuevas, rival a tiro, más rápido que el compañero...). */
type Resp = "box" | "boxPronto" | "anula" | "apretar" | "apretarSinGomas" | "ahorrar" | "ahorrarConRival" | "dejarPasar"
  | "dejarPasarMasRapido" | "defender" | "noPelear" | "noPelearConRival" | "duro" | "limpio" | "limpioConRival";
/** Las variantes a disgusto: si su carácter no tiene frase propia, contesta con la normal. */
const A_DISGUSTO: Partial<Record<Resp, Resp>> = {
  boxPronto: "box", apretarSinGomas: "apretar", ahorrarConRival: "ahorrar", dejarPasarMasRapido: "dejarPasar", noPelearConRival: "noPelear",
  limpioConRival: "limpio",
};
// {r}: el rival o el compañero (apellido).
const RESPUESTAS: Record<Resp, Partial<Record<Caracter, string[]>> & { _?: string[] }> = {
  box: {
    _: ["Recibido, box.", "Entendido, entro esta vuelta."],
    calmado: ["Recibido. Box esta vuelta.", "Ok, entro."],
    quejica: ["Vale, vale, entro. Que sea rápida, por favor.", "Box. Y que no se cale nadie en el garaje."],
    volcanico: ["¡Box! ¡Venga, rápido!", "¡Entro! ¡Preparad las ruedas ya!"],
    cerebral: ["Entendido. ¿Cómo está el tráfico a la salida?", "Recibido. Avisadme del hueco con el de detrás."],
    socarron: ["Box. Que esté el café preparado.", "Venga, vamos a ver a los chicos."],
    novato: ["¡Recibido! Box, box.", "Vale, entro. ¿Dónde estaba la línea del pit-lane?"],
    autocritico: ["Entendido. Esta vez la entrada la hago bien.", "Recibido, box. Perdonad las últimas vueltas."],
  },
  boxPronto: {
    quejica: ["¿Ahora? Las gomas van bien... bueno, vale.", "¿Ya? Si todavía tengo goma. En fin, entro."],
    volcanico: ["¿¡Ahora!? ¡Si las gomas van perfectas! ...Vale, entro.", "¿Por qué? ¡Estoy rápido! Bueno, box."],
    cerebral: ["¿Seguro? Las gomas aún aguantan. Si es por el undercut, adelante.", "Las gomas van bien, pero confío en los números. Box."],
    socarron: ["¿Ya? Si estas gomas están como nuevas. Vosotros sabréis.", "Pues hala, gomas nuevas. Que alguien se las quede de recuerdo."],
  },
  anula: {
    _: ["Recibido, seguimos fuera.", "Entendido, no entro."],
    quejica: ["¿Ahora no? Decidíos, por favor.", "Vale, me quedo fuera... con estas gomas."],
    volcanico: ["¿¡En qué quedamos!? ¡Vale, sigo fuera!"],
    cerebral: ["Entendido, alargamos. Decidme la nueva vuelta objetivo."],
    socarron: ["Ya decía yo que no hacía falta.", "Perfecto, sigo de paseo."],
    novato: ["¡Ah, vale! ¿Entonces no entro? Recibido."],
  },
  apretar: {
    _: ["Recibido, aprieto.", "Vale, a por todas."],
    calmado: ["Recibido. Subo el ritmo.", "Ok, empujo."],
    quejica: ["Lo intento, pero el coche no da para más.", "Aprieto, pero no esperéis milagros."],
    volcanico: ["¡Por fin! ¡Vamos, vamos!", "¡Eso quería oír! ¡A tope!"],
    cerebral: ["Entendido. ¿Cuántas vueltas a este ritmo?", "Recibido. Decidme si las gomas lo aguantan."],
    socarron: ["Ah, ¿que se podía ir más rápido? Haberlo dicho antes.", "Vale, quito el freno de mano."],
    novato: ["¡Vale! ¡Voy a por ello!", "¡Recibido! Doy todo lo que tengo."],
    autocritico: ["Vale. Tengo que ser más limpio en las frenadas, voy.", "Recibido. Puedo hacerlo mejor, voy."],
  },
  apretarSinGomas: {
    _: ["¿Apretar? Las gomas no van a aguantar."],
    quejica: ["¿Apretar? ¡Si no me quedan gomas!", "¿Con estas ruedas? Imposible, pero vale."],
    volcanico: ["¡No tengo gomas! ¡Aprieto, pero esto se va a acabar mal!"],
    cerebral: ["Puedo apretar, pero las gomas caerán rápido. ¿Seguro?", "Si aprieto ahora, en cinco vueltas no queda nada. Vosotros decidís."],
    socarron: ["Aprieto. Las gomas os mandan saludos.", "Vale, pero luego no me digáis que las he gastado."],
    novato: ["Eh... vale, pero ya no tengo mucho agarre."],
  },
  ahorrar: {
    _: ["Recibido, levanto.", "Entendido, gestiono."],
    calmado: ["Recibido. Levanto y freno.", "Ok, bajo el ritmo."],
    quejica: ["Vale, pero luego no me pidáis que vaya rápido.", "¿Ahorrar otra vez? Bueno."],
    volcanico: ["¿Otra vez ahorrar? ¡Vale!", "Levanto... pero no me gusta."],
    cerebral: ["Entendido. ¿Cuánto tiempo puedo perder por vuelta?", "Recibido. Gestiono gomas y combustible."],
    socarron: ["Modo paseo dominical, recibido.", "Vale, admiro un poco el paisaje."],
    novato: ["¡Recibido! ¿Levanto antes en todas las curvas?", "Vale, voy más suave."],
    autocritico: ["Entendido. He forzado demasiado, lo siento.", "Recibido. Llevo vueltas gastando de más."],
  },
  ahorrarConRival: {
    quejica: ["¿Ahora? ¡Si tengo a {r} a tiro!", "¿Levantar con {r} delante? Increíble."],
    volcanico: ["¿¡Ahorrar!? ¡Tengo a {r} delante, venga ya!", "¿En serio? ¡Lo tengo, lo tengo!"],
    cerebral: ["Tengo a {r} a menos de un segundo. ¿Seguro que no es el momento?", "Si levanto ahora, {r} se escapa. ¿Confirmado?"],
    socarron: ["Le aviso a {r} de que ya puede respirar.", "Vale. {r} os lo agradecerá."],
    novato: ["Pero... ¿y {r}? Vale, levanto."],
  },
  dejarPasar: {
    _: ["Entendido, dejo pasar a mi compañero.", "Recibido, que pase {r}."],
    calmado: ["Recibido. Dejo pasar a {r} en la recta.", "Entendido. Por el equipo."],
    quejica: ["Vale... pero que quede claro.", "Lo dejo pasar. Que me lo devuelva si no va más rápido."],
    volcanico: ["¡Vale! Pero que tire, ¿eh?", "¡Lo dejo pasar! Que no se duerma."],
    cerebral: ["Entendido. Le dejo pasar a la salida de la curva para no perder tiempo.", "Recibido. ¿Me lo devuelve si no alcanza al de delante?"],
    socarron: ["Adelante, {r}, que sí, que hay sitio.", "Con mucho gusto. Ahora, que alguien me lo cuente luego."],
    novato: ["Recibido. ¿Le dejo en la recta?", "Vale, dejo pasar a {r}."],
    autocritico: ["Es justo, no estoy yendo rápido. Pasa {r}.", "Entendido. Hoy él va mejor."],
  },
  dejarPasarMasRapido: {
    _: ["¿En serio? Voy más rápido que él."],
    quejica: ["¿En serio? Soy más rápido. Esto es una broma.", "¿Dejar pasar a {r}? ¡Si me estoy acercando yo a él!"],
    volcanico: ["¿¡En serio!? ¡Soy más rápido! ...Vale, vale.", "¡No me lo puedo creer! ¡Que pase, pero esto lo hablamos!"],
    cerebral: ["Mis tiempos son mejores que los de {r}. ¿Estáis seguros?", "Lo hago, pero voy más rápido. Lo hablamos después."],
    socarron: ["Claro, que pase el lento. Tiene lógica.", "Vale. Dadle a {r} un empujoncito, ya que estamos."],
  },
  defender: {
    _: ["Recibido, cierro la puerta.", "Entendido, no paso ni una."],
    calmado: ["Recibido. Defiendo por dentro.", "Ok, cierro el interior."],
    quejica: ["Defiendo, pero en la recta me come.", "Lo intento, pero tiene más velocidad."],
    volcanico: ["¡Por aquí no pasa nadie!", "¡Que lo intente! ¡No pasa!"],
    cerebral: ["Entendido. Cubro la frenada y guardo batería para la recta.", "Recibido. ¿Cuánta ventaja me sacan en la recta?"],
    socarron: ["Tranquilos, conozco todos los trucos.", "Defender es lo mío. Ya veréis."],
    novato: ["¡Vale! Me pongo por dentro, ¿no?", "Recibido. Lo intento sin tocarle."],
    autocritico: ["Recibido. Esta vez no le dejo hueco.", "Vale, no voy a regalar nada más."],
  },
  noPelear: {
    _: ["Recibido, no peleo.", "Entendido, sin riesgos."],
    calmado: ["Recibido. Carrera larga.", "Ok, sin riesgos."],
    quejica: ["Vale, que pasen todos entonces.", "Bueno. Ya veremos dónde acabamos."],
    volcanico: ["¿No pelear? Bueno... vale.", "Me cuesta, pero vale."],
    cerebral: ["Entendido. Las gomas valen más que esta posición.", "Recibido. Pensamos en el final de carrera."],
    socarron: ["Cedo el paso con elegancia.", "Vale, que pase. Ya nos veremos más adelante."],
    novato: ["Recibido. ¿Le dejo pasar si se acerca?", "Vale, sin tocar a nadie."],
    autocritico: ["Entendido. No quiero otro error.", "Recibido. Mejor no arriesgar."],
  },
  duro: {
    _: ["Recibido, sin regalar nada.", "Entendido, a cara de perro."],
    calmado: ["Recibido. Freno más tarde.", "Ok, sin dejar hueco."],
    quejica: ["Vale, pero si nos tocamos no es culpa mía.", "Duro... y luego los comisarios me la cargan a mí."],
    volcanico: ["¡Por fin! ¡Ahora sí!", "¡Eso es lo que quería oír!"],
    cerebral: ["Entendido. Arriesgo en la frenada, no en la salida.", "Recibido. ¿Cuántas sanciones nos podemos permitir?"],
    socarron: ["Me pongo los codos. Ya veréis.", "Vale. Que se aparten, que voy."],
    novato: ["¿Duro? Vale... lo intento sin tocarle.", "¡Recibido! ¿Cuánto de duro?"],
    autocritico: ["Recibido. Pero no quiero otro toque como el de antes.", "Vale. Esta vez sin pasarme."],
  },
  limpio: {
    _: ["Recibido, limpio.", "Entendido, sin riesgos en la pelea."],
    calmado: ["Recibido. Carrera limpia.", "Ok, sin tocar a nadie."],
    quejica: ["Vale, limpio. Ya veremos si los demás también.", "Limpio, limpio... Bueno."],
    volcanico: ["¿Limpio? ...Vale, vale.", "Me cuesta, pero vale."],
    cerebral: ["Entendido. Una sanción ahora nos cuesta más que la posición.", "Recibido. Paciencia."],
    socarron: ["Limpio como una patena.", "Vale. Hoy hago de caballero."],
    novato: ["¡Vale! Mejor así.", "Recibido. Sin tocar a nadie."],
    autocritico: ["Entendido. Mejor no arriesgar.", "Recibido. Nada de errores."],
  },
  limpioConRival: {
    quejica: ["¿Limpio con {r} pegado? Él no va a ir limpio.", "¿Ahora? ¿Con {r} ahí? Increíble."],
    volcanico: ["¿¡Limpio con {r}!? ¡Él no lo hace! ...Vale.", "¡Con {r} no se puede ir limpio!"],
    socarron: ["Limpio con {r}. A ver si se entera él también.", "Vale. Le mando a {r} una tarjeta de visita."],
    cerebral: ["Con {r} a menos de un segundo, limpio es más difícil. Pero vale."],
  },
  noPelearConRival: {
    quejica: ["¿Dejar pasar a {r} así? Increíble.", "¿Me quedo mirando mientras me pasa {r}? Vale."],
    volcanico: ["¿¡Dejar que me pase {r}!? ¡Ni de broma! ...Vale.", "¡Que no peleé con {r}! ¡Increíble!"],
    socarron: ["{r} me va a dar las gracias. Qué detalle el nuestro.", "Vale. Saludaré a {r} cuando pase."],
    cerebral: ["Tengo a {r} a menos de un segundo. Le dejo, pero perdemos una posición."],
  },
};

export interface Linea { carId: number; text: string; important: boolean; mitica?: string; tone: VoiceTone }

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const sur = (c: Car) => c.d.nombre.split(" ").slice(1).join(" ") || c.d.nombre;
const first = (c: Car) => c.d.nombre.split(" ")[0];

export function createVoces(sess: Session) {
  const race = isRaceKind(sess.kind), quali = isQualiKind(sess.kind);
  const lastBy = new Map<number, number>(); // segundos de sesión de la última frase de cada piloto
  let lastReal = -1e9;
  const used = new Set<string>(); // radios míticas ya dichas en esta sesión
  const lapOrder: number[][] = []; // orden (ids) al empezar cada vuelta del líder
  let lastLap = 0;
  const behindLaps = new Map<number, number>(); // vueltas seguidas pegado a su compañero
  const lastPos = new Map<number, number>(); // última posición en pista de tus pilotos (para la parada)
  const byName = (n: string) => sess.cars.find((c) => c.d.nombre === n);
  const saidBy = new Set<string>(); // frases ya dichas por cada piloto (para no repetirlas) y situaciones de una vez

  /** Una frase de un piloto: no más de una cada ~40 s de sesión por piloto, ni dos casi a la vez (salvo lo gordo). */
  function line(c: Car, situ: Situ, vars: Record<string, string | number> = {}, big = false): Linea | null {
    const now = performance.now();
    if (!big && (sess.t - (lastBy.get(c.id) ?? -1e9) < 40 || now - lastReal < 2500)) return null;
    const bank = FRASES[situ];
    const all = bank[caracterOf(c.d.nombre)] ?? bank._;
    // sin repetir frase en la sesión mientras haya otras; la vuelta buena en clasificación, una vez
    if (situ === "vueltaP1" && saidBy.has(`${c.id}|${situ}`)) return null;
    const fresh = all.filter((t) => !saidBy.has(`${c.id}|${t}`));
    if (!fresh.length && !big) return null;
    const raw = pick(fresh.length ? fresh : all);
    saidBy.add(`${c.id}|${raw}`); saidBy.add(`${c.id}|${situ}`);
    let text = raw;
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    lastBy.set(c.id, sess.t); lastReal = now;
    return { carId: c.id, text: `📻 ${c.d.abrev}: "${text}"`, important: big, tone: voiceOf(c.d.nombre) };
  }
  /** Una radio mítica, si su piloto está en pista, no se ha dicho ya y toca (prob). */
  function mitica(id: string, prob: number): Linea | null {
    const m = M[id];
    const c = byName(m.quien);
    if (!c || used.has(id) || Math.random() > prob) return null;
    used.add(id);
    lastBy.set(c.id, sess.t); lastReal = performance.now();
    const who = m.ing ? `Ingeniero de ${first(c)}` : c.d.abrev;
    return { carId: c.id, text: `⭐ ${who}: "${m.texto}"`, important: true, mitica: `«${m.orig}» · ${m.donde}`, tone: voiceOf(c.d.nombre, m.ing) };
  }
  const is = (c: Car | undefined, nombre: string) => !!c && c.d.nombre === nombre;
  const mine = () => sess.cars.filter((c) => c.player);

  /** Reacciona a un suceso: puede reescribir lo que dice el piloto (replace) y añadir frases. */
  function onEvent(e: RaceEvent): { replace?: Linea; lines: Linea[] } {
    const out: Linea[] = [];
    const push = (l: Linea | null) => { if (l) out.push(l); };
    if (e.voz || !e.code) return { lines: out };
    // la bandera a cuadros de la carrera: el ganador, si es un rival, a veces se oye en la tele
    if (e.code === "cuadros") {
      const w = race ? sess.order()[0] : undefined;
      if (w && !w.player) {
        push(is(w, "Max Verstappen") ? mitica("tututu", 0.6) : is(w, "Lewis Hamilton") ? mitica("vamosLewis", 0.5) : is(w, "Valtteri Bottas") ? mitica("quienCorresponda", 0.6)
          : is(w, "Mark Webber") ? mitica("numeroDos", 0.8) : is(w, "Carlos Sainz") ? mitica("smooth", 0.7) : null);
        if (!out.length && Math.random() < 0.35) push(line(w, "rivalGana", {}, true));
      }
      return { lines: out };
    }
    const c = e.carId !== undefined ? sess.carById(e.carId) : undefined;
    const o = e.other !== undefined ? sess.carById(e.other) : undefined;
    const r = o ? sur(o) : "";
    let replace: Linea | null = null;
    switch (e.code) {
      case "gomas":
        if (c) replace = (is(c, "Lewis Hamilton") && mitica("bono", 0.6)) || line(c, "gomas", {}, true);
        break;
      case "plano":
        if (c) replace = line(c, "plano", {}, true);
        break;
      case "desobedece":
        if (c) replace = line(c, e.n === 0 ? "noDejo" : "unaMas", { r }, true);
        break;
      case "adelanta":
        if (!c || !o || !race) break;
        if (is(o, "Fernando Alonso") && o.team.potencia < c.team.potencia) push(mitica("gp2", o.player ? 0.35 : 0.2));
        if (is(c, "Fernando Alonso") && is(o, "Felipe Massa") && used.has("masRapido")) push(mitica("buenChico", 0.9));
        if (out.length) break;
        if (sess.rivalOf(c, o) >= 0.3 && (c.player || o.player)) {
          if (c.player) push(line(c, "rivalPasa", { r }, true));
          else push(line(o, "rivalMePasa", { r: sur(c) }, true));
          break;
        }
        if (c.player) push(Math.random() < ((e.n ?? 9) <= 3 ? 0.7 : 0.3) ? line(c, "adelanta", { r }) : null);
        else if (o.player) push(Math.random() < 0.35 ? line(o, "adelantado", { r: sur(c) }) : null);
        break;
      case "toque": {
        if (!c || !o) break;
        const pair = [c, o];
        if (pair.some((x) => is(x, "Fernando Alonso")) && pair.some((x) => is(x, "Lewis Hamilton"))) push(mitica("idiota", 0.8));
        if (out.length) break;
        const me = c.player ? c : o.player ? o : null;
        if (me) push(line(me, "toque", { r: sur(me === c ? o : c) }, true));
        break;
      }
      case "trompo": case "salida":
        if (!c) break;
        if (quali && is(c, "Charles Leclerc")) push(mitica("estupido", 0.7));
        if (!out.length && c.player && Math.random() < 0.6) push(line(c, "trompo"));
        break;
      case "fondo": case "alerón":
        if (c?.player && Math.random() < 0.6) push(line(c, "dano"));
        break;
      case "trafico":
        if (c?.player && Math.random() < 0.8) push(line(c, "trafico", { r }));
        break;
      case "vuelta":
        if (c?.player && quali && e.n === 1 && Math.random() < 0.5) push(line(c, "vueltaP1"));
        break;
      case "eliminado":
        if (c?.player && Math.random() < 0.8) push(line(c, "eliminado", {}, true));
        break;
      case "pole":
        if (c?.player) push(line(c, "pole", {}, true));
        break;
      case "parada":
        if (!c?.player || e.n === undefined) break;
        if (e.n > 4) push((is(c, "Max Verstappen") && mitica("precioso", 0.7)) || line(c, "paradaLenta", { s: e.n.toFixed(1).replace(".", ",") }, true));
        else if (e.n < 2.3 && Math.random() < 0.35) push(line(c, "paradaBuena"));
        break;
      case "sale": {
        if (!c?.player || e.n === undefined) break;
        const before = lastPos.get(c.id);
        if (before === undefined) break;
        // perder el liderato en la parada (Mónaco 2022) o salir muy por detrás de lo normal
        if (before === 1 && e.n >= 3 && is(c, "Charles Leclerc")) push(mitica("porQue", 0.7));
        else if (e.n - before >= 6 && Math.random() < 0.5) push(line(c, "salePeor"));
        break;
      }
      case "estratega":
        if (!c) break;
        if (is(c, "Kimi Räikkönen")) push(mitica("dejame", 0.6));
        if (!out.length && Math.random() < 0.3) push(line(c, "estratega"));
        break;
      case "aguaPregunta":
        if (!c) break;
        if (is(c, "Lando Norris") && /mojada/.test(e.text)) push(mitica("noNo", 0.7));
        if (!out.length && Math.random() < 0.6) push(line(c, /mojada/.test(e.text) && Math.random() < 0.7 ? "aguaSi" : "aguaNo"));
        break;
      case "abandono":
        if (c?.player) push(line(c, "abandono", {}, true));
        break;
      case "limites":
        if (!c) break;
        if (is(c, "Kimi Räikkönen")) push(mitica("todoElRato", 0.6));
        if (!out.length && Math.random() < 0.25) push(line(c, "limites"));
        break;
      case "pinchazo":
        if (c?.player && Math.random() < 0.8) push(line(c, "pinchazo", {}, true));
        break;
      case "meta": {
        if (!c?.player || !race || e.n === undefined) break;
        const p = e.n;
        if (p === 1) {
          push(is(c, "Max Verstappen") ? mitica("tututu", 0.6) : is(c, "Lewis Hamilton") ? mitica("vamosLewis", 0.5) : is(c, "Valtteri Bottas") ? mitica("quienCorresponda", 0.6)
            : is(c, "Mark Webber") ? mitica("numeroDos", 0.9) : null);
        }
        if (p <= 3 && is(c, "Carlos Sainz")) push(mitica("smooth", p === 1 ? 0.8 : 0.4));
        // perder la carrera en las últimas vueltas
        const late = lapOrder[Math.max(0, lapOrder.length - 3)];
        if (p === 2 && is(c, "Lewis Hamilton") && late?.[0] === c.id) push(mitica("manipulado", 0.9));
        if (!out.length) push(line(c, p === 1 ? "gana" : p <= 3 ? "podio" : p <= 10 ? "puntos" : "sinPuntos", { p }, true));
        break;
      }
    }
    return { replace: replace ?? undefined, lines: out };
  }

  /** Cada fotograma: posiciones para la parada y, una vez por vuelta, el piloto atascado detrás de su compañero. */
  function tick(): Linea[] {
    if (!race || sess.finished) return [];
    const ord = sess.order();
    for (const c of mine()) if (c.loc === "track") lastPos.set(c.id, ord.indexOf(c) + 1);
    const lap = sess.leaderLap + 1;
    if (lap === lastLap) return [];
    lastLap = lap;
    lapOrder.push(ord.map((c) => c.id));
    const out: Linea[] = [];
    const me = mine();
    if (me.length < 2 || lap < 4) return out;
    for (const a of me) {
      const b = me.find((x) => x !== a && x.id === a.aheadId);
      const stuck = !!b && a.loc === "track" && b.loc === "track" && a.followGap > 0 && a.followGap < 1.0;
      const n = stuck ? (behindLaps.get(a.id) ?? 0) + 1 : 0;
      behindLaps.set(a.id, n);
      if (!b || n < 3) continue;
      if (is(a, "Fernando Alonso") && is(b, "Felipe Massa")) { const l = mitica("masRapido", 0.8); if (l) { out.push(l); continue; } }
      if (n % 6 === 3) { const l = line(a, "companero", { r: sur(b) }); if (l) out.push(l); }
    }
    return out;
  }

  const lastOrder = new Map<number, number>(); // ms reales de la última respuesta a una orden de cada piloto

  /**
   * El piloto contesta a una orden del muro según su carácter y lo que ve en pista: a disgusto si le mandan parar con
   * las gomas nuevas, levantar con un rival a tiro o dejar pasar a un compañero más lento. Solo texto: siempre obedece.
   */
  function responde(c: Car, orden: Orden): Linea | null {
    if (!race || c.loc === "out" || c.loc === "fin") return null;
    const now = performance.now();
    if (now - (lastOrder.get(c.id) ?? -1e9) < 4000) return null;
    const t = c.tyres;
    const wear = t ? Math.max(t.F.wear, t.R.wear) : 0;
    const ahead = c.aheadId >= 0 && c.followGap > 0 && c.followGap < 1.2 ? sess.carById(c.aheadId) : undefined;
    const behind = sess.cars.find((x) => x.aheadId === c.id && x.loc === "track" && x.followGap > 0 && x.followGap < 1.2);
    const mate = sess.cars.find((x) => x !== c && x.team === c.team);
    const last = (x: Car) => x.lapTimes[x.lapTimes.length - 1] ?? Infinity;
    let r: Resp = orden;
    let other: Car | undefined;
    if (orden === "box" && t && wear < 0.3 && t.laps >= 3) r = "boxPronto";
    else if (orden === "apretar" && wear > 0.6) r = "apretarSinGomas";
    else if (orden === "ahorrar" && ahead) { r = "ahorrarConRival"; other = ahead; }
    else if (orden === "dejarPasar") { other = mate; if (mate && last(c) < last(mate) - 0.15) r = "dejarPasarMasRapido"; }
    else if (orden === "noPelear" && behind) { r = "noPelearConRival"; other = behind; }
    else if (orden === "limpio" && (ahead || behind)) { r = "limpioConRival"; other = ahead ?? behind; }
    const car = caracterOf(c.d.nombre);
    const base = A_DISGUSTO[r];
    const bank = RESPUESTAS[r][car] ?? (base ? undefined : RESPUESTAS[r]._) ?? (base && (RESPUESTAS[base][car] ?? RESPUESTAS[base]._));
    if (!bank?.length) return null;
    // la variante a disgusto solo si su carácter la tiene: si no, contesta normal y sin el rival
    const disgusto = !!base && !!RESPUESTAS[r][car];
    const fresh = bank.filter((x) => !saidBy.has(`${c.id}|${x}`));
    const raw = pick(fresh.length ? fresh : bank);
    saidBy.add(`${c.id}|${raw}`);
    const text = raw.split("{r}").join(other ? sur(other) : mate ? sur(mate) : "");
    lastOrder.set(c.id, now);
    return { carId: c.id, text: `📻 ${c.d.abrev}: "${text}"`, important: disgusto, tone: voiceOf(c.d.nombre) };
  }

  return { onEvent, tick, responde };
}
