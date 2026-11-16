# Plan de mejoras · Muro de Boxes (sin online)

Bloques 1 a 5. Cada tarea, un commit (o varios si es grande).
Tamaño: **P** pequeño (un PR corto), **M** medio, **G** grande (varios PR).

## Estado (noviembre de 2026)

| Tarea | Estado | Dónde está |
|---|---|---|
| 1.1 Guardado en IndexedDB | ✅ Hecho | `src/ui/db.ts`, `src/ui/store.ts`, `src/ui/main.ts` |
| 1.2 Aviso de copia de seguridad | ✅ Hecho | `src/ui/store.ts`, `src/ui/hubs.ts` |
| 1.3 Medidor de rendimiento | ✅ Hecho | `src/ui/map3d.ts` (`stats`, `setQuality`), `src/ui/sessionView.ts` |
| 2.1 Motores | ✅ Hecho | `src/ui/audio.ts`, `map3d.ts` (`audioView`), `sessionView.ts` |
| 2.2 Ambiente | ✅ Hecho | ídem |
| 2.3 Radio del equipo | ✅ Hecho | ídem |
| 3.1 Calendario más largo | ⏳ Pendiente | — |
| 3.2 Reglajes | ✅ Hecho (cambia resultados) | `src/sim/setup.ts`, `session.ts`, `weekend.ts`, `hubs.ts`, `scripts/reglajes.ts` |
| 3.3 Desarrollo del coche | ✅ Hecho (cambia resultados en temporadas nuevas) | `src/sim/development.ts`, `market.ts`, `src/ui/data.ts`, `hubs.ts` |
| 3.4 Varias temporadas | ⏳ Pendiente | — |
| 3.5 Objetivos de la directiva | 🟡 Hecho a medias (falta lo que depende de 3.4) | `src/sim/objectives.ts`, `hubs.ts` |
| 4.1 Más cámaras | ✅ Hecho | `map3d.ts` (`MORE_CAMS`, `camList`, `setCamera`), `sessionView.ts` |
| 4.2 Rótulos de tele | ✅ Hecho | `sessionView.ts` (`tvTick`, `tvShow`), `style.css` |
| 5.1 Niveles de detalle | ⏳ Pendiente | — |
| 5.2 Nubes y lluvia | 🟡 A medias (cortinas, relámpagos y trueno) | `map3d.ts` (cielo, `updateStorm`), `audio.ts` (`thunder`) |
| 5.3 Hora del día | ✅ Hecho | `map3d.ts` (`winOn`, `uCity`, `townLights`, caja de sombras) |

**Lo que queda, en este orden:** 5.1 → resto de 5.2 → 3.1 (en tandas) → 3.4 (y con ella, el resto de 3.5).

## Reglas para quien lo haga

- Todo en español: textos, comentarios y mensajes de commit, con el estilo de los que ya hay (frases, sin jerga).
- **La simulación no puede cambiar de resultados** salvo que la tarea lo pida a propósito (reglajes, desarrollo,
  temporadas). Comprobarlo antes y después con `npx tsx scripts/finde.ts silverstone 42 --resumen` (diff ignorando
  la línea «s de cálculo»). Si una tarea cambia resultados a propósito, decirlo en el PR.
  Ojo: desde la 3.2 la salida de `finde.ts` es otra (lleva reglajes); la referencia buena es la de ahora.
- Nada de azar nuevo en la simulación sin `this.rng`/`fork()` (o un `Rng` propio con su semilla, como hacen
  `setup.ts` y `development.ts` para no mover el azar del resto); el dibujo (map3d) y el sonido pueden usar
  `Math.random()`.
- `npm run check` y `npx vite build` sin errores en cada PR. El README se pone al día con cada cosa nueva.
- **Móvil primero.** Medir lo que pese en 3D con `renderer.info` (llamadas y triángulos) por escalón de calidad
  (0 a 3, ver `applyQuality`/`lowerQuality` en `src/ui/map3d.ts`) y no subir los números del escalón 0 y 1.
  Ahora también se ve en el juego: Ajustes → «Mostrar rendimiento del 3D».
- Para probar el 3D sin jugar una carrera: una página suelta (no se sube) que construya una sesión como
  `poc3d/entry.ts` y llame a `createMap3d` con `quality` fija y `debug: { view }` (cámara a mano; ver el comentario
  de `createMap3d`). Capturas con Playwright (ya instalado; `chromium.launch({ args: ['--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`). Ver «Cómo se ha probado» al final.
- Ficheros clave: simulación en `src/sim/` (`session.ts`, `weekend.ts`, `season.ts`, `market.ts`, `track.ts`,
  `setup.ts`, `development.ts`, `objectives.ts`), interfaz en `src/ui/` (`main.ts` navegación, `sessionView.ts` la
  sesión, `hubs.ts` pantallas de temporada, `store.ts` guardado y ajustes, `db.ts` IndexedDB, `map3d.ts` el 3D,
  `car3d.ts` coche y libreas, `audio.ts` sonido, `summary.ts` resumen), datos en `data/` (circuitos en
  `data/circuitos/*.json`, calendario en `data/calendario.json`).

---

## Bloque 1 · Cimientos

### 1.1 Guardado en IndexedDB (M) · ✅ Hecho
- `src/ui/db.ts`: envoltorio mínimo (base `muro`, almacén `datos`, `get/set/setMany/del/keys/all`), sin librerías.
- `store.ts`: `initStore()` carga las partidas a memoria antes de pintar nada (`main.ts` arranca en su `then`);
  lecturas síncronas de la memoria y escrituras que cambian la memoria y se mandan a IndexedDB sin esperar.
  Ajustes (`Prefs`) y ranura activa siguen en `localStorage`.
- Migración: si IndexedDB está vacía, copia las claves `muro-temporada-2026…`, `muro-sesion-2026…` y
  `muro-sesion-aparcada…`, **lee la copia de vuelta** y solo si coincide las borra de `localStorage`.
- Sin IndexedDB, todo en `localStorage` como antes (`roomyStorage()` dice cuál se usa).
- `askPersist()` al crear la primera partida; `storageUse()` enseña en el inicio lo que ocupan.
- Fotos: `RaceSummary.photos` (máx. 10), solo si `roomyStorage()`; se ven en `roundSheet` del calendario.
- Pendiente de verdad: varias pestañas abiertas a la vez trabajan cada una con su copia en memoria (antes
  `localStorage` era «en vivo»). No se ha tocado; avisar si da guerra.

### 1.2 Aviso de copia de seguridad (P) · ✅ Hecho
- Inicio: si `isSafariLike()` (Safari o cualquier navegador de iPhone/iPad) y no está instalada (`installed()`),
  aviso discreto con ✕ para no volver a verlo (`Prefs.sinAvisoSafari`).
- Temporada: si no está instalada, recordatorio de exportar cada 2 carreras desde la última copia
  (`Prefs.exportadas[ranura]`, `Prefs.ultimaExportacion`), con «Exportar» y ✕ (`Prefs.sinRecordatorio`).

### 1.3 Medidor de rendimiento (P) · ✅ Hecho
- Ajustes → «Mostrar rendimiento del 3D» (`Prefs.rendimiento3d`): fps (media de 1 s; «pausa» en pausa), calidad,
  escala de resolución, triángulos y llamadas por fotograma.
- Calidad a mano en Ajustes (Auto/0-3, `Prefs.calidad3d`) o tocando el medidor. Fijada a mano no baja sola.
- `createMap3d` devuelve `stats()` y `setQuality(v)`; `opt.quality` sigue sirviendo para las pruebas.

---

## Bloque 2 · Sonido · ✅ Hecho

Todo en `src/ui/audio.ts` con Web Audio, sin archivos. Ajustes en `Prefs.sonido` (sí/no, volumen general,
motores, ambiente, radio, `voz`, `vozLobato`). El `AudioContext` se crea con el primer toque en la velocidad, el
3D, la salida o el teclado; se suspende en pausa, al salir de la sesión y con la página oculta.
De dónde se oye: en 3D, `map3d.audioView()` (cámara; en la vista general, desde el coche seguido); en 2D, el
coche seguido (o tu primer piloto en pista, o el primero que esté rodando) y los que tenga a menos de 250 m.

### 2.1 Motores (M) · ✅ Hecho
- Hasta 6 voces (3 osciladores en armónicos de las explosiones del V6, paso bajo que abre con el acelerador, ruido
  de escape), volumen por distancia, panorama, Doppler simple y petardeo al soltar el acelerador.
- Caja de 8 marchas propia (`gearFor`, `rpmFor` en `audio.ts`): el velocímetro que citaba el plan no existía.
- A bordo, solo el propio coche y con más graves. A ×4 y ×8, 3 voces y más bajas; por encima de ×8, sin motores.
- Niveles medidos con un analizador: unos −27 dBFS de media y picos de 0,15; compresor a la salida.
- **Sin comprobar:** los fps en un móvil real con sonido (medirlo con 1.3) y cómo suena de verdad.

### 2.2 Ambiente (P) · ✅ Hecho
- Público según las gradas cerca (en 2D, fijo), con subidas en adelantamientos, salida y bandera a cuadros.
- Lluvia según la que cae; viento según `windNow`. Pistolas al quitar (u = 0,12) y apretar (u ≈ 0,55) las ruedas;
  en 2D, al entrar a boxes uno de tus pilotos. Pitido por semáforo, silencio y rugido al apagarse. Choques.

### 2.3 Radio del equipo (M) · ✅ Hecho
- Clic y ruido antes de cada mensaje de radio de tus pilotos y del ingeniero, también con la sesión en pausa (va
  por su propio bus, `radioOut`). Baja el resto mientras suena (`duck`).
- Voz con `speechSynthesis` (voz del sistema en español; si no hay, sin voz): solo mensajes importantes
  (`important` o `pause`), como mucho uno cada 8 s. Lobato con otra voz, aparte.
- **Sin comprobar:** las voces (Chromium sin pantalla no trae voces en español).

---

## Bloque 3 · Profundidad de juego (gestión)

### 3.1 Calendario más largo (G) · ⏳ Pendiente
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
- Notas nuevas:
  - Los reglajes (3.2) sacan el óptimo de cada circuito de un hash de su `id`. No hay que añadir nada a los datos,
    pero conviene mirar `npx tsx scripts/reglajes.ts <id> 1 --vuelta` para ver que la tabla tiene sentido.
  - Los circuitos se registran también en `src/ui/data.ts` (`CIRCUITS`) y, si se quieren en la página de
    pruebas, en `poc3d/entry.ts`.

### 3.2 Reglajes antes de la carrera (M) · ✅ Hecho (cambia resultados a propósito)
- Carga (`a`) y altura (`r`), de −2 a +2, en `WeekendState.setup` (`SetupState`: óptimo oculto, error de cada
  equipo, vueltas de libres, lo que elige el jugador y el parque cerrado).
- Óptimo por circuito: hash del `id` más algo de variación por fin de semana; los urbanos (con `entorno`), más
  altos. Con agua se mueve `WET_SHIFT` (+1 carga, +1,2 altura), por minisector según su agua.
- Efecto (`Session.setupAt`, `msTime`): carga → agarre en curva según `m.aero` y resistencia equilibradas para
  que en la vuelta se compensen (`dragPerA` se calcula por circuito); altura → el fondo ayuda donde pesa la carga y
  estorba en las curvas lentas; coste cuadrático fuera del óptimo (`SETUP_Q`: 0,09 y 0,06 s por paso², algo más
  quedándose bajo); más carga = menos desgaste y más pérdida en aire sucio; más bajo = más desgaste. En el 3D,
  más chispas con el coche bajo.
- La parrilla se mide contra su propia media (`K.mean`), así que sin tocar nada el ritmo medio no cambia.
- Lo que sabe cada equipo: error típico `setupSigma` (según `estrategia`, se divide por √(1 + vueltas/15)); las
  vueltas de libres de los dos coches suman en `Weekend.finish`. La IA y el jugador sin tocar nada montan lo que
  propone el ingeniero (`proposedSetup`).
- Parque cerrado al construir la primera clasificación (Q o SQ). Panel «Reglajes» en la pantalla del fin de semana.
- Comprobado:
  - En seco, la vuelta media de la parrilla es idéntica con y sin reglajes.
  - Por equipo, el efecto sistemático es de ±0,03 s (40 semillas).
  - En mojado la parrilla va algo más lenta (~0,1 s/vuelta) porque todos llevan reglaje de seco.
  - Fallar dos pasos en las dos cosas cuesta casi un segundo.
  - `scripts/reglajes.ts <id> [semillas]` compara fines de semana con y sin reglajes; con `--vuelta`, la tabla de
    vuelta por reglaje.
- Ideas sin hacer: la pantalla de libres no enseña la horquilla (solo la del fin de semana); el riesgo de tocar
  en baches es tiempo, no un percance con azar.

### 3.3 Desarrollo del coche (M) · ✅ Hecho (cambia resultados en temporadas nuevas)
- `SeasonState.dev` (`DevState`): presupuesto (40 M con equipo real; en «crear equipo», 25 + la mitad de lo que
  quedó del techo, hasta 50 M) y piezas pedidas.
- Piezas de aerodinámica (agarre), motor y eficiencia (potencia con tope: 0,8 si hace su motor, 0,3 si es
  cliente; el consumo baja con ella, `TeamDef.consumo`, hasta un 5 %) y fiabilidad (averías, hasta la mitad).
  Pequeña 4 M y mediana 8 M (2 rondas), grande 14 M (3 rondas).
- Lo que rinde cada pieza sale de un `Rng` con la semilla de la temporada y el id de la pieza: una de cada cuatro
  da entre el 20 y el 70 %, el resto ~N(1,02; 0,15). En «crear equipo», el director técnico real (frente al de su
  informe) multiplica lo que rinde.
- Rivales: con equipo real, +0,06 de agarre por ronda todos (`DEV_RIVAL`, lo mismo que da de media gastar los 40 M en
  aerodinámica); en «crear equipo», como siempre (su director técnico). El tuyo ya no mejora solo (`buildGrid(...,
  ownDev)`).
- `gridOf` (data.ts) aplica todo por ronda. Temporadas sin `dev` (de antes): exactamente como antes; si aún no se
  ha corrido nada, se les pone al abrir la pantalla de temporada.
- Panel «Desarrollo del coche» en la pantalla de temporada (pedir piezas, cuándo llegan, qué se espera y qué rinden).
- Consumo por equipo: `Session.fuelLap(c)` sustituye a `fuelPerLap` donde importa el coche (por defecto 1: no
  cambia nada).

### 3.4 Varias temporadas seguidas (G) · ⏳ Pendiente
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
- Notas nuevas, de lo ya hecho:
  - El desarrollo (3.3) ya guarda por temporada lo que ganó el coche (`devGains(s.dev, ronda)`): es la base para
    el coche del año siguiente. Habrá que crear un `DevState` nuevo cada año.
  - Los objetivos (3.5) se guardan en `SeasonState.objetivos` y `objectiveStatus` dice si se cumplieron: cumplirlos
    debería subir el presupuesto (`devBudget`) del año siguiente y fallarlos, bajarlo.
  - Muchas cosas dicen «2026» a fuego: las claves de guardado (`muro-temporada-2026`), los títulos de `hubs.ts` y los
    datos. Las claves pueden seguir igual (son por ranura, no por año).

### 3.5 Objetivos de la directiva (P) · 🟡 Hecho a medias
- Hecho: `objectivesFor` pone dos al abrir la temporada según el puesto del coche en la parrilla de salida (agarre,
  potencia y resistencia): constructores (top 2: su puesto; resto: uno más) y, según el nivel, 2 victorias,
  2 podios, puntuar en 5 carreras o puntuar en 2. Panel en la pantalla de temporada con su progreso (cumplido, ya
  no se puede, vas bien o por ahora no llegas) y un mensaje de la directiva al acabar.
- Falta (necesita 3.4): cumplirlos da más presupuesto la temporada siguiente; fallarlos lo reduce (y en el peor
  caso, un aviso de que el jefe de equipo peligra).

---

## Bloque 4 · Retransmisión (sin resumen en vídeo ni repeticiones guardadas) · ✅ Hecho

### 4.1 Más cámaras (P) · ✅ Hecho
- `MORE_CAMS` en `map3d.ts`: *Helicóptero* (120-170 m, detrás y a un lado, deriva lenta y zoom suave), *Pit-lane*
  (fija en el muro frente a su garaje mientras está en boxes; si no, se comporta como «Seguir»), *Alerón trasero*
  (a bordo mirando atrás) y *Grúa de meta* (de lado y en alto sobre la recta de meta, barre siguiendo al coche).
- El botón sigue rotando entre las cuatro de siempre; manteniéndolo pulsado (o con clic derecho) sale una hoja con
  todas (`camList`, `setCamera`).

### 4.2 Rótulos de tele (P) · ✅ Hecho
- En `sessionView.ts` (no en `opt.labels` del 3D, para usar los datos y estilos de la sesión), capa `#tvg` sobre el
  mapa, solo en 3D y con `Prefs.rotulos` (Ajustes → «Rótulos de tele en 3D»).
- Clasificación: al acabar la vuelta, sus sectores frente a los de la pole, dentro del rótulo de vuelta lanzada que
  ya existía (`sectorsVsPole`).
- Récord del circuito (mejor que `poleObjetivo`). La «Vuelta rápida» morada ya existía como franja (`fastestLapCheck`).
- Batallas (menos de 0,5 s en meta tres vueltas seguidas; una cada 4 vueltas como mucho, salvo las de tus pilotos),
  neumáticos de los cinco primeros cada 10 vueltas y la radio de tus pilotos.

---

## Bloque 5 · Gráficos (sin WebGPU)

Medir cada cambio por calidad (ver reglas). Si algo sube el coste, que solo esté en calidad 2-3.

Referencia medida (página de prueba, Singapur de noche, vista «horizonte», 800 × 450, SwiftShader):

| Calidad | Llamadas | Triángulos |
|---|---|---|
| 0 | 30 | 312 244 |
| 1 | 35 | 496 266 |
| 2 | 55 | 1 051 545 |
| 3 | 60 | 1 107 349 |

### 5.1 Niveles de detalle en el decorado (M) · ⏳ Pendiente
- El decorado anclado a la pista (`propBuilder` en `map3d.ts`) es una sola malla con todo. Partirlo por tramos de
  pista (~400 m) para que se pueda recortar (`frustumCulled` con su caja calculada para la anchura de pista máxima)
  y, de lejos, cambiar a una versión simple (cajas sin balcones, gradas sin banderas ni pilares, sin rótulos).
- Manzanas de ciudad (`cityMat`): de lejos, sin ventanas (color medio), y no proyectan sombra salvo las cercanas.
- Coches: hoy hay malla fina para los 8 más cercanos y ligera para el resto. Añadir un tercer nivel muy simple
  (~300 triángulos) para la vista general.
- Lo ahorrado se puede gastar en detalle de cerca: alerones con más perfil, suspensión, el piloto girando la cabeza.
- Ojo: la pista y el decorado engordan al alejar la cámara (escala de maqueta, `curW`): las cajas de recorte tienen
  que cubrir la anchura máxima (`T.Wov`).

### 5.2 Nubes y lluvia (M) · 🟡 A medias
- ✅ Cortinas de lluvia lejanas: franjas verticales en el cielo bajo los chubascos, que se mueven con el viento
  (sombreador del cielo, sin coste de geometría).
- ✅ Relámpagos: con una célula de más de 15 mm/h a menos de 30 km (`updateStorm`), destello del cielo (`uFlash`) y
  de la luz ambiente (~0,2 s, a veces doble) y trueno con el retraso de la distancia (`audio.thunder`).
- ⏳ Nubes con volumen aparente en el cielo (`skyMat` en `map3d.ts`): unos pasos de *ray marching* barato sobre el
  mismo mapa de nubes del juego (`uWx`), solo en calidad 2-3; en 0-1, como ahora.
- ⏳ Gotas en el coche y charcos que salpican al pasar (spray más alto en `pud`).

### 5.3 Hora del día (P) · ✅ Hecho
- Con el sol bajo, la caja de sombras crece (hasta ×1,9) para que las sombras largas no se corten.
- Ventanas de edificios y ciudad: cada una se enciende con su propio umbral (`winOn` en `PROP_FH`).
- Noche: resplandor anaranjado sobre el horizonte (`uCity`, más en los urbanos) y, en calidad 2-3, luces de pueblos en
  el borde del terreno (`townLights`, una llamada de dibujo; calidad 0 y 1 sin cambios).
- Los focos de las carreras de noche ya se encendían poco a poco con `uFlood`; no se ha tocado.

---

## Cómo se ha probado (para la próxima sesión)

- **Página de prueba del 3D** (no se sube; había una en `poc3d/prueba.html` + `prueba.ts`): construye una carrera con
  `Weekend.build("RACE")`, da ~1800 pasos, cambia `sess.weather.clock` si se pide una hora y llama a `createMap3d`
  con `quality` fija, `paused: () => true` y `debug: { view }`. Tras ~40 fotogramas deja `debug.info`
  (`{ calls, tris }`) en `window.__done`. Parámetros útiles: circuito, calidad, hora, vista y una «tormenta» que mete
  células en `sess.weather.cells`. Se sirve con `npx vite --port 5199` y se abre con Playwright.
- **El juego con Playwright:** poner la partida y las preferencias en `localStorage` antes de recargar (se migran
  solas a IndexedDB) y navegar con `#go`, `#play`, `#sim`, `#lights`, `#speed [data-v=…]`, `#camb`. Para contar
  sonidos, envolver `AudioContext`/`AudioParam.setValueAtTime` con `addInitScript`.
- Trampas vistas:
  - La primera carga de Vite optimiza dependencias y **recarga la página**: lo que se haga en ella puede perderse
    (parecía que IndexedDB perdía datos y no era eso).
  - Con SwiftShader va a 1-3 fps: las transiciones de cámara (0,9 s, con `dt` tope de 0,1) tardan ~10 s reales y
    la simulación avanza despacio (los semáforos tardan mucho).
  - En libres tu piloto puede seguir en el garaje: muchas cosas (motores en 2D, cámaras que siguen) necesitan un
    coche en pista.
- **Error conocido**, anterior a este trabajo: en el 3D sale un error de sombreador (`instanceColor` sin declarar,
  en `car3d.ts`) en algunos materiales. No rompe nada visible, pero conviene mirarlo.

## Orden recomendado (lo que queda)

5.1 → resto de 5.2 → 3.1 (en tandas, cuando haya tiempo: es sobre todo trabajo de datos) → 3.4 (toca casi todo:
temporada, mercado, guardado) y, con ella, el resto de 3.5.
