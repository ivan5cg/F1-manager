# Plan Paddock 3D · El paddock como centro de la temporada · Muro de Boxes

La idea es sustituir los menús de la temporada y del fin de semana (las listas de paneles de `seasonScreen` y `weekendScreen` en `src/ui/hubs.ts`) por un **paddock 3D por el que se camina**. Sería una mezcla entre *GTA* (un mundo abierto con tu personaje, por el que te mueves libremente) y *Los Sims* (cámara desde arriba, tocar a alguien para hablar con él, gente con su propia rutina). El paddock sería el centro del juego: sala de prensa, garajes, hospitality, oficina técnica y una **zona abierta central** donde se cruzan pilotos, jefes, periodistas e ingenieros.

No hace falta que sigan funcionando las partidas guardadas con versiones anteriores.

Tamaño estimado: **P** pequeño (1 PR corto), **M** medio, **G** grande (varios PR).

---

## ¿Es factible?

**Sí, siempre que el alcance sea el de «un paddock vivo», no el de un GTA.** Hay que entender el GTA y Los Sims como referencia de cómo se siente jugar, no como meta de tamaño:

| Lo que sí | Lo que no |
|---|---|
| Un recinto cerrado de unos 250 × 120 m: una fila de garajes, el pit lane al fondo, hospitalities, sala de prensa y una plaza central | Una ciudad abierta, vehículos que se conducen o físicas complejas |
| Un avatar propio (el jefe de equipo) y de 20 a 40 personajes a la vez, con animaciones sencillas (andar, estar de pie, hablar, gesticular, sentarse) | Cientos de personajes o animación facial |
| Estilo *low-poly* estilizado, en la línea del plan `PLAN-3D-V2.md` | Fotorrealismo |
| Interiores de las salas como escenas pequeñas, o hojas de interfaz encima del 3D | Edificios enteros con varias plantas que se puedan recorrer |

Puntos a favor que ya están en el proyecto:
- **Three.js 0.187** con cargador GLTF y Draco (`car3d.ts`), mapas de entorno HDR (`public/assets/env/*.hdr`), un sistema de calidades q0/q1/q2 y ya se carga bajo demanda (`import("./map3d")`).
- Ya hay **personajes de Sketchfab con licencia CC-BY** (los mecánicos `crew_stand.glb` y `crew_crouch.glb`) y una cadena de preparación de modelos con Blender y Python (`scripts/blender_prepara_coche.py`, `prepara_entorno_glb.py`).
- **El contenido de los encuentros ya existe**: el carácter de los pilotos (`sim/caracter.ts`, `ui/voces.ts`), la moral y las rivalidades (`sim/morale.ts`), las preguntas de prensa (`ui/vestuario.ts`), el mercado y los cambios de piloto (`sim/market.ts`, `nextSeason.ts`), los titulares (`ui/prensa.ts`), los hitos (`sim/hitos.ts`) y los cascos propios (`helmetSvg`).
- La **simulación determinista** (`src/sim/`) es aparte: el paddock solo la lee, salvo las decisiones de los encuentros, que pasarían por funciones puras con sus tests.

Los riesgos de verdad son tres, y todos se pueden controlar:
1. **Rendimiento en el móvil.** Los personajes animados con esqueleto son lo más caro. Hace falta limitar el número, bajar la calidad de la animación con la distancia y repetir instancias de lo estático.
2. **Personajes y animaciones.** Es el mayor hueco de recursos que hay ahora mismo (ver «Qué hace falta»).
3. **Que no se haga pesado.** Es el error del F1 2010: andar para todo. El paddock tiene que ser opcional en la práctica: atajos que llevan a cada sitio al momento, y que se pueda omitir.

---

## Decisiones de diseño propuestas (para confirmar)

- **Cámara y control al estilo de Los Sims, adaptados al móvil en vertical.** Cámara orbital elevada, a unos 45°, con zoom con dos dedos y desplazamiento arrastrando. **Tocas el suelo y tu avatar va andando hasta allí**, buscando el camino. Tocas a alguien y sale un **menú radial** (Hablar, Preguntar por…, Provocar, Ignorar). Habría además un modo «a pie» opcional al estilo GTA: cámara detrás del avatar y joystick virtual. En vertical el joystick tapa media pantalla, así que no sería el control por defecto.
- **Tú eres el jefe de equipo**, con un avatar que se puede personalizar a lo Sims: cuerpo, cabeza, peinado y ropa del equipo con su color.
- **Un paddock genérico, con el carácter de cada circuito**: el mismo trazado de recinto, y por circuito cambian el cielo, la hora (`skyGradient`/`lightAt`), el tiempo, la bandera, el monumento al fondo (`public/assets/landmarks`) y el suelo (asfalto, arena o hierba según el bioma de `trackVisuals.ts`). Mónaco y Las Vegas pueden tener variantes sencillas más adelante.
- **El paddock está vivo según el momento del fin de semana**: jueves de prensa, viernes de libres, sábado de clasificación y domingo de carrera, y entre carreras la fábrica o el paddock vacío. La gente que hay y lo que hace dependen de ese momento.
- **Todo menú tiene su sitio físico**, y además está en la barra rápida (ver la tabla de abajo).
- **Respaldo en 2D**: en móviles sin WebGL2 o con poca memoria, o si el jugador lo elige en Ajustes, se usa la pantalla actual de paneles, ya reorganizada por sitios. Así nunca se queda nadie sin poder jugar.

### De cada sitio a lo que ya existe

| Sitio del paddock | Qué se abre (código actual) |
|---|---|
| **Tu garaje y pit lane** | Empezar o simular sesión (`weekendScreen`), reglajes (`setupPanel`, `setupPlanoHtml`), juegos de neumáticos, unidades de potencia (`puPanel`, `puSummary`), tandas largas, «Lo que saben tus ingenieros» |
| **Oficina técnica** (en el camión o la caravana del equipo) | Desarrollo por piezas (`devPanel`, `devPlanoHtml`), túnel de viento (`tunnelHtml`), paquete del fin de semana (`pkgWeekendHtml`), test de pretemporada |
| **Hospitality del equipo** | Moral del vestuario (`moodPanel`), tus pilotos y tu equipo (`myTeamPanel`), cambiar un piloto (`swapSheet`), sala de trofeos (`trophyRoomHtml`), hitos |
| **Sala de prensa (FIA)** | Rueda de prensa (`prensaHtml`/`wirePrensa`), portadas (`portadaHtml`), noticias (`newsPanel`) |
| **Tablón o pantallas de cronometraje** en la plaza | Calendario, mundiales de pilotos y de constructores, gráfica de rendimiento (`perfPanel`), historial (`historyPanel`) |
| **Dirección de carrera** | Parrilla con los cambios, sanciones pendientes de parrilla |
| **Plaza central** | Encuentros: no hay menú, hay gente |
| **Salida del paddock** | Inicio, guardar o exportar, ajustes, empezar la temporada siguiente |

---

## Qué hace falta

### 1. Recursos 3D (lo más importante)

| Recurso | Qué se necesita | De dónde sacarlo |
|---|---|---|
| **Personajes humanos con esqueleto** | 1 o 2 cuerpos base (hombre y mujer) con piezas intercambiables: cabeza, pelo, gorra, auriculares, polo del equipo, mono de piloto, chaleco de periodista. Unos 3 a 6 mil triángulos por persona | Paquetes **CC0** ya con esqueleto (Quaternius «Ultimate Modular Characters», KayKit, Kenney), o la cadena actual con Blender. Mejor CC0 que CC-BY para no acumular créditos |
| **Animaciones** | Parado, andar, correr suave, hablar gesticulando, brazos cruzados, móvil en la oreja, sentarse, aplaudir, foto o entrevista, mecánicos trabajando. Unas 12 a 15 | Las de los mismos paquetes CC0, o Mixamo (se puede usar en juegos; habría que pasarlas a nuestro esqueleto). Todo se agrupa en un único `.glb` de animaciones compartidas |
| **Kit del paddock** | Fachada de garaje modular, motorhome o hospitality de dos plantas, carpa, camión, sala de prensa, vallas, maceteros, bancos, pantallas, banderolas, scooters y bicis aparcados, carritos de neumáticos, focos | **Por script**, como el kit modular de `PLAN-3D-V2.md` (geometría limpia y texturas planas), más 3 o 4 piezas `.glb` |
| **Decoración por equipo** | El color del equipo y su escudo en garajes, hospitalities y ropa | Materiales teñidos por código, sin texturas por equipo. Así funciona con los equipos que crea el jugador |
| **Coches en el garaje** | Ya están (`car3d.ts`) | Se reutilizan |

Presupuesto de descarga: unos **3 a 5 MB** del paddock, que se cargan la primera vez que entras y luego quedan en caché del service worker. Se reparten en personajes (unos 1,5 MB con Draco y texturas WebP), animaciones (unos 0,5 MB) y kit (unos 1 a 2 MB).

### 2. Tecnología (código nuevo)

- **`src/paddock/escena.ts`**: el renderizador, la cámara orbital de estilo Sims, la luz del cielo y la hora (reutilizando lo de `map3d.ts`), las calidades q0/q1/q2 y la carga perezosa.
- **`src/paddock/mundo.ts`**: el trazado del recinto en datos (un JSON con zonas, puertas, puntos de interés y bancos), para poder cambiarlo sin tocar código.
- **`src/paddock/navegacion.ts`**: búsqueda de caminos A* sobre una **cuadrícula de 1 m** que sale del trazado, con suavizado del camino y una forma simple de que la gente se esquive. Con un recinto plano y pequeño no hace falta una malla de navegación completa.
- **`src/paddock/personajes.ts`**: el montaje de cada personaje a partir de sus piezas, con un `AnimationMixer` por personaje. Los lejanos se actualizan a menos fotogramas (a 15 o 10 fps según la distancia) y los que están fuera de cámara se congelan. Límite de unos 12 personajes animados en q0, 25 en q1 y 40 en q2.
- **`src/paddock/agenda.ts`**: la **rutina de cada personaje según el momento del fin de semana**, al estilo de Los Sims. Ejemplos: el piloto va de la hospitality al garaje antes de los libres, el periodista ronda la sala de prensa y la plaza, el jefe rival charla en la plaza. Una máquina de estados sencilla por personaje: ir a, quedarse, hablar con, ocupado.
- **`src/paddock/interaccion.ts`**: tocar con `Raycaster` (suelo, personaje o puerta), el menú radial, las conversaciones en un **globo o hoja con opciones de respuesta** y la barra rápida.
- **`src/sim/encuentros.ts`**, la parte jugable y **pura y determinista**: dado el estado de la temporada, el momento del fin de semana y la semilla, decide quién está en el paddock, qué temas tiene cada uno y qué pasa según lo que contestes. Ejemplos:
  - el **piloto rival** con quien hay rivalidad (`morale.ts`) te pica según su carácter (`caracter.ts`),
  - el **periodista** te para con una pregunta (los temas de `vestuario.ts`); según tu respuesta cambia la moral o sale un titular,
  - el **jefe de otro equipo** suelta un rumor de mercado o tantea a uno de tus pilotos (`market.ts`),
  - **tu piloto** contento, enfadado o pidiendo cosas, según su moral,
  - **tu director técnico** te avisa de que hay una pieza lista o de que el túnel ha dado un resultado,
  - **personajes de ambiente**: mecánicos, invitados VIP, fotógrafos, comisarios.

  Sus tests irían en `tests/` y comprobarían que con la misma semilla salen los mismos encuentros y que los efectos están dentro de sus límites.
- **`src/paddock/dialogos.ts`**: los textos de los encuentros, originales y en español, siguiendo la línea de `voces.ts` (sin repetir frases y con la personalidad de cada uno).
- **Estado**: añadir `SeasonState.paddock` con lo que ya se ha hablado en este fin de semana, la reputación con la prensa y con cada jefe rival y la ropa de tu avatar. Como no importa la compatibilidad, se añade sin migración.
- **Sonido**: ambiente del paddock (murmullo, generadores, motores a lo lejos en libres, el altavoz del circuito) con `audio.ts`.

### 3. Reorganizar la interfaz (antes de nada del 3D)

Sacar cada panel de `hubs.ts`, que ahora tiene 919 líneas y mezcla pantallas, a **«salas»** independientes que se abren como hoja con `sheet()` desde cualquier sitio. Es lo que permite que el 3D, la barra rápida y el respaldo en 2D usen el mismo código.

### 4. Lo que necesito de ti

1. **Cámara y control**: ¿te vale el planteamiento «Sims de base y GTA opcional» (tocar para andar en vertical y joystick como extra), o quieres sobre todo el control a lo GTA?
2. **Personajes**: ¿te parecen bien los paquetes **CC0 estilizados** (aspecto de muñeco, sin parecido con los pilotos reales), o tienes modelos propios o quieres hacerlos en Blender?
3. **¿Encuentros con consecuencias?** Que cambien la moral, la reputación, los titulares, el mercado o la confianza de los patrocinadores. Recomiendo que sí, con efectos pequeños.
4. **¿Hasta dónde llega el paddock?** ¿Solo los fines de semana o también entre carreras? Por ejemplo, la fábrica como segundo escenario en una fase posterior.
5. **El móvil de referencia** para fijar el límite de rendimiento (modelo concreto o gama).

---

## Reglas para cada bloque

- **Primero el móvil en vertical**, y **todo en español**.
- **La simulación no cambia** salvo `sim/encuentros.ts` y el estado nuevo. Antes y después de cada bloque hay que comprobar que sigue saliendo lo mismo (`npx tsx scripts/finde.ts silverstone 42 --resumen`, `npx tsx scripts/finde.ts monaco 42 --resumen`) y pasar `npm test`.
- **Comprobación técnica**: `npm run check`, `npx vite build` sin errores en consola ni de WebGL, y **60 fps en q2 y 30 fps estables en q0** en el móvil de referencia, con 20 personajes en pantalla.
- **Siempre se puede omitir**: cualquier menú está como mucho a 2 toques de la barra rápida, y el respaldo 2D funciona en todo momento.

---

## Estado

| Bloque | Estado | Tamaño | Alcance |
|---|---|---|---|
| 0. Salas: reorganizar la interfaz por sitios | ⏳ Pendiente | M | `src/ui/hubs.ts` → `src/ui/salas/*.ts`, barra rápida, respaldo 2D |
| 1. Prueba técnica: escena, un avatar, ir donde tocas y cámara | ⏳ Pendiente | M | `src/paddock/escena.ts`, `navegacion.ts`, `personajes.ts` |
| 2. Recursos: personajes por piezas, animaciones y kit del paddock | ⏳ Pendiente | G | `scripts/prepara_personajes.py`, `public/assets/paddock/*`, licencias |
| 3. El recinto: garajes, hospitalities, prensa, plaza y puertas a las salas | ⏳ Pendiente | G | `src/paddock/mundo.ts`, `data/paddock.json`, `interaccion.ts` |
| 4. Vida: rutinas según el momento del fin de semana y gente de ambiente | ⏳ Pendiente | M | `src/paddock/agenda.ts` |
| 5. Encuentros: reglas puras, diálogos y consecuencias | ⏳ Pendiente | G | `src/sim/encuentros.ts`, `src/paddock/dialogos.ts`, tests |
| 6. Carácter por circuito, hora, tiempo y sonido | ⏳ Pendiente | M | luz y cielo, monumentos, biomas, `audio.ts` |
| 7. Tu avatar: personalización, modo a pie y pulido | ⏳ Pendiente | M | editor de avatar, joystick opcional, transiciones |
| 8. (Opcional) La fábrica entre carreras y variantes de Mónaco y Las Vegas | 💤 Más adelante | G | — |

---

## Bloque 0 · Salas: reorganizar la interfaz por sitios (M)

Objetivo: que cada menú sea una pieza independiente que se puede abrir desde cualquier sitio, sin ningún 3D todavía. Este bloque es útil aunque al final no se hiciera el paddock.

- Crear `src/ui/salas/` con `garaje.ts`, `oficina.ts`, `hospitality.ts`, `prensa.ts`, `tablon.ts`, `direccion.ts` y `salida.ts`. Cada una exporta `abrir(nav, s)` y devuelve una hoja con los paneles que le tocan (ver la tabla de sitios).
- La lógica que ahora conecta cada panel (`wireDev`, `wireTunnel`, `wirePreseason`, `wirePrensa`…) pasa a su sala, que se vuelve a dibujar ella sola, sin redibujar toda la pantalla.
- **Barra rápida** fija abajo: «Ir al GP o a la sesión», Garaje, Oficina, Prensa, Tablón y «⋯».
- **Respaldo 2D**: la pantalla de temporada y la del fin de semana pasan a ser una cuadrícula de tarjetas, una por sala. Es la versión plana del paddock.
- Como no importa la compatibilidad, se pueden quitar los parches para partidas antiguas que hay en `seasonScreen` (por ejemplo, el `if (!s.dev && s.round === 0…)`).

**Hecho cuando** se puede jugar una temporada entera desde las salas y la barra rápida, y `npm test` pasa sin cambios en la simulación.

## Bloque 1 · Prueba técnica: escena, avatar, ir donde tocas y cámara (M)

Objetivo: comprobar en el móvil de referencia que se puede jugar y cuánto cuesta, antes de invertir en recursos.

- Suelo de prueba de 250 × 120 m con cajas en lugar de edificios.
- Un avatar provisional (el `crew_stand.glb` que ya existe, o un personaje CC0 de prueba) con dos animaciones: parado y andar.
- Cámara orbital de estilo Sims: arrastrar para mover, pellizcar para el zoom, límites del recinto y seguimiento suave del avatar.
- Tocar el suelo hace que el avatar vaya allí por A*, con un indicador en el punto de destino.
- **Prueba de carga**: 40 personajes con animación andando por puntos al azar. Medir fps, memoria y llamadas de dibujo en q0, q1 y q2.

**Hecho cuando** hay medidas en el móvil de referencia y se decide el límite de personajes de cada calidad. Si no llega, se aplica el plan B (ver «Riesgos»).

## Bloque 2 · Recursos: personajes por piezas, animaciones y kit (G)

- Elegir paquete o paquetes CC0 y apuntar la licencia en `public/assets/LICENCIA-*.txt`.
- `scripts/prepara_personajes.py` (Blender sin ventana): esqueleto único, piezas separadas por zona del cuerpo, materiales con una zona de color del equipo que se tiñe por código, compresión Draco y WebP, y un `.glb` aparte con las animaciones compartidas.
- Roles con su ropa: jefe de equipo, piloto (mono y gorra), ingeniero (auriculares y polo), mecánico, periodista (acreditación, grabadora o cámara), fotógrafo, invitado VIP, comisario y personal FIA.
- Kit del paddock por script: garaje modular de N boxes, hospitality de dos plantas con terraza, carpa, sala de prensa con atril y fondo de patrocinadores, pantallas de cronometraje, vallas, bancos y vehículos aparcados.

**Hecho cuando** todo el paddock pesa 5 MB o menos y hay una escena de muestra con los personajes de cada rol y sus animaciones.

## Bloque 3 · El recinto y las puertas a las salas (G)

- `data/paddock.json`: zonas, edificios, puertas, puntos de interés, bancos y puntos de charla, y en qué sitio va cada equipo. Los garajes van en el orden del mundial de constructores del año anterior, como en la F1 real.
- Puertas: tocarlas, o llegar andando hasta ellas, abre la sala (hoja) del bloque 0, con una transición corta (la cámara se acerca y la escena se difumina).
- Los garajes de los rivales también se ven, con su coche y sus colores. Se puede entrar al tuyo.
- Rótulos flotantes encima de cada sitio (por ejemplo, «Sala de prensa · 1 pregunta pendiente») con su aviso.

**Hecho cuando** todos los menús son accesibles desde el 3D y desde la barra rápida.

## Bloque 4 · Vida: rutinas según el momento del fin de semana (M)

- `agenda.ts`: para cada rol y cada momento (jueves, antes o después de cada sesión, domingo después de la carrera), adónde va y qué hace. Las rutinas salen de la semilla del fin de semana.
- Antes de una sesión los pilotos se van a su garaje. Después de la carrera, la prensa rodea al ganador y hay celebración en el hospitality del equipo ganador.
- Si llueve, aparecen paraguas y la gente se queda bajo los toldos.
- Esquivarse sin chocar, parar a saludar y formar corrillos de 2 o 3 personas en la plaza.

## Bloque 5 · Encuentros: reglas, diálogos y consecuencias (G)

- `sim/encuentros.ts` (pura): `encuentrosDe(s, momento, semilla)` devuelve la lista de quién te busca y por qué, con prioridades: siempre se tratan antes las preguntas obligatorias de prensa y los avisos técnicos.
- Cada encuentro tiene unas opciones de respuesta y sus efectos, con límites: moral, reputación con la prensa o con un jefe rival, un titular de la siguiente portada o la posibilidad de un rumor de mercado.
- Los encuentros pendientes se marcan con un icono encima del personaje (al estilo de las burbujas de Los Sims). También se pueden ignorar, y eso también tiene consecuencias.
- Los textos van en `dialogos.ts`: originales, con la personalidad del carácter de cada uno, sin repetirse en el fin de semana y con variantes según tus resultados.
- Tests: que con la misma semilla salga lo mismo, que los efectos no pasen de sus límites y que no se repitan.

## Bloque 6 · Carácter por circuito, hora, tiempo y sonido (M)

- La luz y el cielo según la hora local de cada sesión, y si es de noche (Baréin, Singapur, Las Vegas), focos.
- El monumento del circuito como fondo (con lo que ya hay en `landmarks`) y el suelo y la vegetación según el bioma.
- Lluvia en el paddock: suelo mojado, paraguas y charcos.
- Ambiente sonoro y el altavoz del circuito anunciando las sesiones.

## Bloque 7 · Tu avatar, modo a pie y pulido (M)

- Editor de avatar al empezar la partida: cuerpo, cabeza, peinado, tono de piel y gafas. Se guarda en `s.paddock`.
- Modo a pie opcional, al estilo GTA: cámara detrás del avatar y joystick virtual. Pensado sobre todo para tableta o móvil en horizontal.
- Pulido de transiciones, en Ajustes la opción «Paddock 3D o menús» y respeto de `reducedMotion`.

---

## Riesgos y plan B

| Riesgo | Plan B |
|---|---|
| Con muchos personajes animados el móvil no llega a los fps | Personajes lejanos con animación precalculada en textura o como imágenes que siempre miran a cámara, y menos gente en q0 |
| No aparecen personajes CC0 que encajen con el estilo | Personajes muy estilizados, tipo maniquí, hechos por script en Blender a partir de formas básicas, con el color del equipo. Es menos bonito pero funciona |
| Ir andando a todo se hace pesado | La barra rápida y abrir el sitio con doble toque (se teletransporta) ya forman parte del diseño. Además, el jugador puede quitar el paddock por completo en Ajustes |
| `hubs.ts` está muy acoplado | El bloque 0 va primero precisamente para desacoplarlo |
| Quedarse en un paddock vacío por falta de contenido | Los encuentros (bloque 5) son prioritarios frente al detalle visual. Sin gente que tenga algo que decirte, el paddock no aporta |

## Orden recomendado

**0 → 1 → (decidir si se sigue, según las medidas) → 2 → 3 → 5 → 4 → 6 → 7.**

Los encuentros (5) van antes que las rutinas (4) porque son lo que da sentido a pasear por el paddock. Con el bloque 3 terminado ya se puede jugar el juego entero desde el paddock.
