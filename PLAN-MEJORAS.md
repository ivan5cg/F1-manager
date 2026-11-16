# Plan de mejoras · Muro de Boxes (sin online)

Plan para ejecutar en otra sesión. Bloques 1 a 5, en este orden; cada bloque, un PR (o varios si es grande).
Tamaño: **P** pequeño (un PR corto), **M** medio, **G** grande (varios PR).

## Reglas para quien lo haga

- Todo en español: textos, comentarios y mensajes de commit, con el estilo de los que ya hay (frases, sin jerga).
- **La simulación no puede cambiar de resultados** salvo que la tarea lo pida a propósito (reglajes, desarrollo,
  temporadas). Comprobarlo antes y después con `npx tsx scripts/finde.ts silverstone 42 --resumen` (diff ignorando
  la línea «s de cálculo»). Si una tarea cambia resultados a propósito, decirlo en el PR.
- Nada de azar nuevo en la simulación sin `this.rng`/`fork()`; el dibujo (map3d) puede usar `Math.random()`.
- `npm run check` y `npx vite build` sin errores en cada PR. El README se pone al día con cada cosa nueva.
- **Móvil primero.** Medir lo que pese en 3D con `renderer.info` (llamadas y triángulos) por escalón de calidad
  (0 a 3, ver `applyQuality`/`lowerQuality` en `src/ui/map3d.ts`) y no subir los números del escalón 0 y 1.
- Para probar el 3D sin jugar una carrera: una página suelta (no se sube) que construya una sesión como
  `poc3d/entry.ts` y llame a `createMap3d` con `quality` fija y `debug: { view }` (cámara a mano; ver el comentario
  de `createMap3d`). Capturas con Playwright (ya instalado; `chromium.launch({ args: ['--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`).
- Ficheros clave: simulación en `src/sim/` (`session.ts`, `weekend.ts`, `season.ts`, `market.ts`, `track.ts`),
  interfaz en `src/ui/` (`main.ts` navegación, `sessionView.ts` la sesión, `hubs.ts` pantallas de temporada,
  `store.ts` guardado y ajustes, `map3d.ts` el 3D, `car3d.ts` coche y libreas, `summary.ts` resumen), datos en
  `data/` (circuitos en `data/circuitos/*.json`, calendario en `data/calendario.json`).

---

## Bloque 1 · Cimientos

### 1.1 Guardado en IndexedDB (M)
Hoy todo va en `localStorage` (`src/ui/store.ts`: temporada, sesión a medias, «aparcada», ajustes, ranura activa),
con un límite de ~5 MB.
- Crear `src/ui/db.ts`: un envoltorio mínimo de IndexedDB (una base `muro`, un almacén `datos` clave → valor) con
  `get/set/del/keys` asíncronas. Sin librerías.
- `store.ts` pasa a usarlo para temporadas y sesiones (lo grande). Los ajustes (`Prefs`) y la ranura activa pueden
  seguir en `localStorage` (son pequeños y se leen al arrancar de forma síncrona).
- **Arranque asíncrono:** hoy `loadSeason()` es síncrona y la usan `main.ts`/`hubs.ts`. Opción recomendada: al
  arrancar, cargar a memoria las 3 ranuras desde IndexedDB (una caché en `store.ts`) antes de pintar la primera
  pantalla; después, lecturas síncronas de la caché y escrituras que actualizan caché + IndexedDB (sin esperar).
- **Migración:** si IndexedDB está vacía y hay claves en `localStorage` (`muro-temporada-2026…`,
  `muro-sesion-2026…`, `muro-sesion-aparcada…`), copiarlas y, solo cuando la copia esté confirmada, borrarlas.
- **Sin IndexedDB** (modo privado de algunos navegadores): seguir con `localStorage` como hoy.
- Pedir almacenamiento persistente (`navigator.storage.persist()`) al crear la primera partida.
- Exportar/importar (`store.ts`, archivo) sigue igual.
- Con esto, las fotos de la carrera (`src/ui/photos.ts`, hoy solo en memoria) se pueden guardar en el
  `RaceSummary` (`photos?: {src,text,lap}[]`) y verse al reabrir la carrera desde el calendario (`hubs.ts`,
  `block()` de resultados). Limitar a 10 fotos por carrera.
- Aceptación: partida antigua en `localStorage` → tras actualizar se abre igual y ya está en IndexedDB; el uso
  total (`navigator.storage.estimate()`) se ve en el inicio, junto a las partidas.

### 1.2 Aviso de copia de seguridad (P)
- Si no está instalada (`matchMedia('(display-mode: standalone)')` falso) y es Safari/iOS, en el inicio un aviso
  discreto: «Instala el juego en la pantalla de inicio o exporta la partida: Safari borra los datos de las webs que
  no se usan en 7 días».
- Recordatorio de exportar cada 2 carreras si no está instalada (guardar la fecha de la última exportación en
  `Prefs`). Se puede cerrar y no volver a mostrar.

### 1.3 Medidor de rendimiento (P)
- En Ajustes (`sessionView.ts`, hoja «Ajustes», y en `Prefs`): «Mostrar rendimiento del 3D».
- En el mapa 3D, una etiqueta pequeña: fotogramas por segundo (media de 1 s), calidad (0-3), escala de resolución y
  triángulos por fotograma (`renderer.info.render.triangles`). El cálculo de fps ya existe en `draw()` de
  `createMap3d` (variables `fN`, `fT`); exponer `stats()`.
- Un botón para fijar la calidad a mano (0-3, o «automática»), guardado en `Prefs` y pasado como `quality`.

---

## Bloque 2 · Sonido

Todo con Web Audio, generado al vuelo (sin archivos de audio salvo, si acaso, ruido grabado muy corto). Nuevo
módulo `src/ui/audio.ts`; ajustes en `Prefs`: sonido sí/no, volumen general, motores, ambiente, radio.
El `AudioContext` solo se puede crear tras tocar la pantalla: crearlo en el primer toque (botón de velocidad o de
3D) y suspenderlo en pausa, al salir de la sesión y con la página oculta (`visibilitychange`).

### 2.1 Motores (M)
- Una voz por coche audible (máx. ~6, los más cercanos a la cámara en 3D; en 2D, el coche seguido y los que tenga
  cerca en pista). Cada voz: 2-3 osciladores (diente de sierra + cuadrada) en armónicos de la frecuencia de giro,
  un filtro paso bajo y algo de ruido para el escape; ganancia por distancia a la cámara y efecto Doppler simple
  (variar la frecuencia con la velocidad relativa).
- Régimen a partir de la velocidad del coche (`car.v`) y una caja de 8 marchas simulada (la «marcha» ya se calcula
  para el velocímetro en `sessionView.ts`: reutilizar esa función): rpm = f(v, marcha); al cambiar de marcha, caída
  de rpm corta. Acelerador/freno del velocímetro: más volumen y brillo con acelerador, «petardeo» al soltar.
- A bordo (cámara «A bordo»): solo el propio coche, más fuerte y con más graves.
- Velocidad de simulación ×4 o más: bajar volumen/densidad (o silenciar motores por encima de ×8).
- Aceptación: en el móvil no baja de los fps de antes (medirlo con 1.3).

### 2.2 Ambiente (P)
- Público: ruido rosa filtrado de fondo según cuántas gradas cerca (en 3D) o fijo bajo (2D); subida breve en
  adelantamientos (eventos `⚔️` de `sess.events`), en la salida y en la bandera a cuadros.
- Lluvia: ruido filtrado con volumen según `rainHere`/agua en pista. Viento con `windSpeed`.
- Parada: ráfagas de la pistola (ruido en golpes de 0,15 s) mientras están las ruedas fuera (fase `u` del
  dibujo de la parada en `map3d.ts`, de 0,12 a 0,62); en 2D, al entrar a boxes un efecto corto.
- Salida: un pitido por cada semáforo que se enciende (`sess.startLights()`), silencio y rugido al apagarse.
- Choques: golpe seco y crujido con los percances `crash` (de `car.fx`).

### 2.3 Radio del equipo (M)
- Antes de cada mensaje de radio (`kind: "radio"` en `sess.events`), el «clic» y el ruido de radio.
- Voz opcional con `speechSynthesis` (voz del sistema en español si existe; si no, sin voz): solo para mensajes
  importantes de tus pilotos y del ingeniero, con un límite (no más de uno cada 8 s). Los comentarios de Lobato
  pueden ir con otra voz (opcional y desactivable por separado).
- Mientras habla la radio, bajar el resto (ducking).

---

## Bloque 3 · Profundidad de juego (gestión)

### 3.1 Calendario más largo (G)
- Añadir circuitos con la misma calidad que los actuales: trazado (TUMFTM tiene, entre otros, Budapest, Montreal,
  Melbourne, Catalunya, Austin, MexicoCity, Shanghai, Spielberg, YasMarina, Zandvoort; bacinger tiene además Imola,
  Bakú, Yeda, Miami, Las Vegas, Catar…), relieve y anchura (`scripts/relieve.py`, añadir a `CIRCUITS`), clima
  (normales del mes), boxes, horario, adelantamientos y pole de referencia **con fuentes** en el README, como los
  actuales. Urbanos nuevos (Bakú, Yeda, Las Vegas, Miami): su `entorno` con `scripts/entorno.py`.
- Calibrar cada uno con `npx tsx scripts/pista.ts <id>` y un fin de semana con `finde.ts` (pole y adelantamientos
  cerca del objetivo).
- `data/calendario.json`: una temporada «completa» (orden real 2026) y la corta actual como opción al crear partida
  (corta 9 / completa). Las temporadas guardadas mantienen su `calendar`.
- Hacerlo en tandas de 3-4 circuitos por PR.

### 3.2 Reglajes antes de la carrera (M)
- Dos ajustes por coche antes de la clasificación: **carga aerodinámica** (menos ↔ más) y **altura** (baja ↔ alta),
  5 pasos cada uno.
- Efecto en la simulación (`track.ts`/`session.ts`): la carga cambia `clA`/`cdA` del coche (`CarParams`, hoy por
  circuito con `aero.cl/cd`) → más paso por curva y menos punta, con su efecto en el aire sucio y en el desgaste;
  la altura: baja da agarre pero más desgaste del patín y riesgo de tocar en baches (más chispas en el 3D: ya hay
  `T.dip`), alta lo contrario.
- Hay un óptimo por circuito (y por lluvia) que el equipo no conoce: lo estima con error, y **las tandas de libres
  lo afinan** (como ya pasa con los neumáticos: `knowledge` en `weekend.ts`). Pantalla de libres: «el ingeniero
  cree que el óptimo está en …» con su horquilla.
- La IA de los rivales elige con su propio error según `estrategia` del equipo.
- Esta tarea cambia resultados a propósito: dejar los valores medios de forma que, sin tocar nada, el resultado
  medio de la parrilla no cambie (comprobar con varias semillas).

### 3.3 Desarrollo del coche (M)
- Hoy el coche mejora solo por ronda (`market.ts`, `buildGrid`, `desarrollo × devBudgetMult × ronda`). Cambiarlo
  para el equipo del jugador (los dos modos): un presupuesto de desarrollo por temporada que se reparte entre
  **aerodinámica** (agarre), **motor/eficiencia** (potencia y consumo, dentro de lo que permita el motor del
  cliente) y **fiabilidad**.
- Cada pieza tarda 2-3 rondas en llegar y tiene una probabilidad de no rendir lo esperado (con `rng` de la
  temporada, determinista con la semilla). Pantalla en `hubs.ts`: piezas en desarrollo, cuándo llegan y lo que se
  espera de ellas.
- Los rivales siguen como hoy (o con un reparto fijo por equipo).

### 3.4 Varias temporadas seguidas (G)
- Al acabar la temporada: pantalla de cierre (campeones, objetivos) y **«Empezar la temporada 2027»**.
- Pilotos: la edad (añadir `nacimiento` a los pilotos en `data/equipos-2026.json` y `mercado-2026.json`) hace que
  mejoren hasta ~28 años y empeoren desde ~34; retiradas por edad; novatos que suben (inventados, del mercado de
  reservas).
- Contratos: duración en años; en el modo «crea tu equipo», renovar o fichar entre temporadas con el techo de gasto
  (reutilizar la pantalla de fichajes de `teamBuilder.ts`). En «equipo real», los contratos de los demás cambian
  solos (algún traspaso entre equipos al año).
- Coches: el rendimiento de partida del año siguiente sale del desarrollo del año anterior más una regresión a la
  media.
- `SeasonState`: añadir `year` e historial de campeones; mantener compatibilidad con `v: 1` (las partidas viejas
  son el año 2026).

### 3.5 Objetivos de la directiva (P)
- Al empezar la temporada, 1-2 objetivos según el nivel del equipo (p. ej. «acabar entre los 5 primeros en
  constructores», «un podio», «puntuar en 4 carreras»). Se ven en el hub de temporada con su progreso.
- Con 3.4: cumplirlos da más presupuesto la temporada siguiente; fallarlos lo reduce (y en el peor caso, un aviso
  de que el jefe de equipo peligra).

---

## Bloque 4 · Retransmisión (sin resumen en vídeo ni repeticiones guardadas)

### 4.1 Más cámaras (P)
En `map3d.ts` (`CAMS`, `CAM_NAME`, `updateCamera`), añadir a la rotación del botón de cámara:
- **Helicóptero:** alta (120-200 m), detrás y a un lado del coche seguido, con zoom suave y deriva lenta.
- **Pit-lane:** cuando el coche seguido está en boxes, una cámara fija en el muro frente a su garaje; si no, saltar
  a la siguiente.
- **Alerón trasero:** a bordo mirando hacia atrás desde la deriva (se ve el que viene detrás).
- **Grúa de meta:** en la recta de meta, de lado y en alto, que barre al pasar el coche.
- Que el botón no se haga eterno: dejar «Circuito», «Seguir», «Tele», «A bordo» y un submenú «Más cámaras»
  (mantener pulsado, o una hoja).

### 4.2 Rótulos de tele (P)
En la capa de rótulos del 3D (`opt.labels`, como «Repetición»), con el estilo de la tele que ya usa la sesión:
- **Comparativa de vuelta** al cruzar la meta en clasificación: tiempo, posición y diferencia con la pole por
  sectores (ya existe la lógica de parciales en `sessionView.ts`; reutilizarla).
- **Récords:** «vuelta rápida» (morado) al batirla, «récord del circuito» si supera la referencia del circuito.
- **Batalla:** cuando dos coches van a menos de 0,5 s 3 vueltas seguidas, un rótulo con los dos y la diferencia
  vuelta a vuelta.
- **Neumáticos de los primeros:** cada ~10 vueltas, los 5 primeros con su compuesto y vueltas del juego.
- **Radio en pantalla:** los mensajes de radio de tus pilotos, en el estilo de la tele, unos segundos.
- Todo desactivable en Ajustes («Rótulos de tele en 3D»).

---

## Bloque 5 · Gráficos (sin WebGPU)

Medir cada cambio por calidad (ver reglas). Si algo sube el coste, que solo esté en calidad 2-3.

### 5.1 Niveles de detalle en el decorado (M)
- El decorado anclado a la pista (`propBuilder` en `map3d.ts`) es una sola malla con todo. Partirlo por tramos de
  pista (~400 m) para que se pueda recortar (`frustumCulled` con su caja calculada para la anchura de pista máxima)
  y, de lejos, cambiar a una versión simple (cajas sin balcones, gradas sin banderas ni pilares, sin rótulos).
- Manzanas de ciudad (`cityMat`): de lejos, sin ventanas (color medio), y no proyectan sombra salvo las cercanas.
- Coches: hoy hay malla fina para los 8 más cercanos y ligera para el resto. Añadir un tercer nivel muy simple
  (~300 triángulos) para la vista general.
- Lo ahorrado se puede gastar en detalle de cerca: alerones con más perfil, suspensión, el piloto girando la cabeza.

### 5.2 Nubes y lluvia (M)
- Nubes con volumen aparente en el cielo (`skyMat` en `map3d.ts`): unos pasos de *ray marching* barato sobre el
  mismo mapa de nubes del juego (`uWx`), solo en calidad 2-3; en 0-1, como ahora.
- Cortinas de lluvia lejanas que se mueven con el viento y la célula (ya hay un esbozo en el cielo: «cortinas de
  lluvia bajo los chubascos lejanos»): hacerlas visibles como franjas verticales semitransparentes en el horizonte.
- Relámpagos en tormentas fuertes (células con lluvia > umbral): destello del cielo y de la luz ambiente durante
  ~0,2 s, y el trueno (bloque 2) unos segundos después según la distancia de la célula.
- Gotas en el coche y charcos que salpican al pasar (spray más alto en `pud`).

### 5.3 Hora del día (P)
- Atardecer: sombras largas (el sol ya baja; revisar que el `shadow.camera` cubra lo bastante cuando el sol está
  bajo), luz más cálida en las fachadas.
- Los focos de las carreras de noche y las ventanas de la ciudad se encienden poco a poco al anochecer
  (ahora `uFlood` sube con la hora, pero las ventanas se encienden todas a la vez: escalonarlas por un umbral por
  ventana).
- Noche: luces de la ciudad en el horizonte lejano (un anillo de puntos de luz en el borde del terreno) y un leve
  resplandor anaranjado en el cielo sobre las ciudades (Singapur, Mónaco).

---

## Orden recomendado

1.1 → 1.3 → 2.1 + 2.2 → 3.2 → 3.3 → 3.5 → 1.2 → 4.1 → 4.2 → 2.3 → 5.1 → 5.3 → 5.2 → 3.1 (en tandas) → 3.4.
3.4 al final porque toca casi todo (temporada, mercado, guardado); 3.1 en paralelo cuando haya tiempo, porque es
sobre todo trabajo de datos.
