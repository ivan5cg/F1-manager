# Mejoras de inmersión

Ideas para darle al juego más personalidad e inmersión. Ya hecho: la **radio con personalidad y las radios míticas**
(fase 1 de la radio, `src/ui/voces.ts`). Lo demás queda apuntado aquí, más o menos en el orden en que lo haría.

## 1. Radio: siguientes fases

### Fase 2 · Los pilotos responden a tus órdenes
- Al pedir que pare, que apriete, que ahorre o que deje pasar al compañero, contesta según su carácter: «Recibido»,
  «¿Ahora? Las gomas van bien...», «¿En serio? Soy más rápido».
- Solo texto: siempre obedece. Se engancha a las acciones del muro de `sessionView.ts`, igual que la fase 1 a los
  sucesos con código.

### Fase 3 · Moral y desobediencia (cambia la simulación)
- **Moral** por piloto que dura toda la temporada: sube con buenos resultados y estrategias que le favorecen, y baja
  con órdenes en contra o paradas que le hunden.
- Con la moral baja y un carácter volcánico, **a veces no obedece**: no deja pasar o retrasa la parada una vuelta.
- Afecta un poco a su ritmo y a si quiere renovar en el mercado.
- Es la que más cambia el juego: hacer la última y medir con un script (como `scripts/radio.ts`) cuántas veces
  desobedecen en muchas carreras.

## 2. El fin de semana fuera de la pista
- **Rueda de prensa:** entre sesiones, una o dos preguntas con respuestas a elegir («¿Hay favoritismo hacia tu
  primer piloto?»). Cada respuesta toca la moral de los pilotos o la paciencia de la directiva.
- **Titulares tras la carrera:** una portada de prensa ficticia («Golpe de estrategia en Silverstone», «El muro de
  Ferrari, otra vez en entredicho»), generada desde el resumen de carrera que ya existe (`summary.ts`).
- **La directiva te escribe:** mensajes cortos del jefe tras cada gran premio, a partir de los objetivos que ya hay
  («Esperaba el podio con este coche»).

## 3. Rivalidades que se recuerden
- **Piques entre pilotos:** si dos se tocan o se adelantan mucho, nace una rivalidad que se arrastra de carrera a
  carrera. Lobato la menciona («¡Otra vez estos dos!») y la radio también; se nota en lo agresivos que defienden.
- **Récords e hitos:** primera victoria, primer podio del equipo, cien carreras, récord del circuito. Lobato y un
  rótulo lo celebran, y queda en un historial.

## 4. Lobato y el ambiente
- **Lobato con memoria:** que recuerde lo que pasó antes («Recordemos que en Mónaco se le escapó por la
  estrategia», «es su tercera pole seguida»).
- **Lobato por códigos:** que reaccione al código de cada suceso (`RaceEvent.code`, como la radio) en vez de leer el
  texto con expresiones regulares. Así se evitan fallos como el de «P15» tomado por «P1».
- **Un segundo comentarista:** un experto técnico en el box, al estilo de Pedro de la Rosa, que explique la
  estrategia («Están pensando en el undercut»).
- **Público y sonido según el circuito:** más ruido cuando adelanta el piloto local, banderas en las gradas del 3D y
  el himno en el podio.

## 5. Ritual y memoria de la temporada
- **Previa de cada gran premio:** una tarjeta con la historia del circuito, la clave estratégica («Mónaco: la
  clasificación lo es todo») y la previsión, como el arranque de una retransmisión.
- **Gala de fin de temporada:** mejor adelantamiento, mejor estrategia, piloto del año, sacados de los datos de las
  carreras.
- **Sala de trofeos** del equipo: las copas de cada victoria y los resultados de los escenarios y grandes premios
  sueltos.
