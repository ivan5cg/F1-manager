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
| 5.1 Niveles de detalle | ✅ Hecho | `map3d.ts` (`propBuilder`, `propLod`, manzanas, árboles), `car3d.ts` (`carMinGeometry`) |
| 5.2 Nubes y lluvia | ✅ Hecho | `map3d.ts` (cielo: `cloudSides`, `updateStorm`; `uDrops`; spray `aSpl`), `car3d.ts` (`DROPS_GLSL`), `audio.ts` (`thunder`) |
| 5.3 Hora del día | ✅ Hecho | `map3d.ts` (`winOn`, `uCity`, `townLights`, caja de sombras) |

**Lo que queda, en este orden:** 3.1 (en tandas) → 3.4 (y con ella, el resto de 3.5).

Además, fuera de los bloques 1 a 5, está hecho el **Bloque 6 · Competición** (adelantamientos, salida e IA de carrera y
clasificación): ver al final.

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
- Para probar el 3D sin jugar una carrera: `poc3d/prueba.html` (ver «Cómo se ha probado»), que construye una sesión como
  `poc3d/entry.ts` y llama a `createMap3d` con `quality` fija y `debug: { view }` (cámara a mano; ver el comentario
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

### 5.1 Niveles de detalle en el decorado (M) · ✅ Hecho
- Decorado por tramos: `propBuilder` apunta cada vértice en su tramo de pista (`PROP_CHUNK`, ~400 m) y lo que se añade
  dentro de `B.near(fn)` solo se ve de cerca (rótulos, balcones, pilares, luces del garaje, puestos del muro, banderas,
  bajos y pilares de las cubiertas, remate de las torres de tele, brazo de los focos). `mesh()` ordena los vértices por
  tramo (primero lo de siempre, luego lo de cerca) y calcula la caja de cada tramo en los dos extremos de la escala
  (`W_REAL` y `T.Wov`: la posición va en línea recta con la anchura).
- `propLod` (cada fotograma, tras la cámara): tramo fuera de la vista **y** de la caja de sombras → fuera; lejos
  (`PROP_FAR` por calidad: 170/220/300/380 m, divididos por lo que crece la maqueta) → sin lo de cerca. Sigue siendo
  **una sola llamada** (y otra en la sombra): se rehacen los índices solo cuando cambia algún tramo.
- Manzanas (`cityMat`): solo las que están a menos de 140 m de lo que deben dejar libre dan sombra, con una copia que
  comparte las matrices y solo se dibuja en la sombra (capa 1; `sun.shadow.camera.layers.enable(1)`). Las fachadas de
  Mónaco, cuando cada ventana ocupa menos de medio píxel (`px` de 2 a 3), cambian sus ventanas encendidas por un brillo
  uniforme (un tercio del medio: el medio de verdad se veía como una mancha naranja). En las torres de Singapur se probó
  lo mismo y quedaba peor: no se ha tocado.
- Coches: tercer nivel `carMinGeometry()` (296 triángulos con las ruedas dentro) para la vista general (`far` > 0,7;
  vuelve con < 0,6): se cambia la geometría de la misma malla (`cars`) y se ocultan las ruedas, sin llamadas nuevas.
  Comparte con la ligera los datos de cada coche (`aCol2`, `aLiv`, `aDmg`). Los árboles hacen lo mismo (una copa y
  tronco de tres caras: 26 triángulos en vez de 124).
- Arreglado de paso el error de sombreador de `instanceColor` (`INST_COL` en `car3d.ts`).
- Lo que más pesa ahora son los árboles (~99 000 triángulos de cerca), el terreno y los coches ligeros. Lo ahorrado no
  se ha gastado en detalle de cerca (alerones, suspensión, cabeza del piloto): queda como idea.
- Medido (página de prueba, 800 × 450, SwiftShader; llamadas / triángulos):

| Vista | Antes | Después |
|---|---|---|
| Singapur, horizonte, 21 h, C0 | 30 / 312 244 | 30 / 307 876 |
| Singapur, horizonte, 21 h, C1 | 35 / 496 266 | 35 / 462 442 |
| Singapur, horizonte, 21 h, C2 | 55 / 1 051 545 | 55 / 1 017 721 |
| Singapur, horizonte, 21 h, C3 | 60 / 1 107 349 | 60 / 1 073 525 |
| Spa, general, C0 | 32 / 337 074 | 31 / 130 766 |
| Spa, general, C1 | 37 / 479 580 | 35 / 145 440 |
| Spa, medio, C1 | 34 / 478 948 | 34 / 455 860 |
| Mónaco, general, C1 | 39 / 461 614 | 37 / 152 666 |
| Mónaco, horizonte, C1 | 36 / 460 982 | 36 / 446 070 |
| Silverstone, cerca, C1 | 32 / 470 624 | 32 / 464 308 |
| Monza, horizonte, C0 | 29 / 326 500 | 29 / 324 434 |

### 5.2 Nubes y lluvia (M) · ✅ Hecho
- ✅ Cortinas de lluvia lejanas: franjas verticales en el cielo bajo los chubascos, que se mueven con el viento
  (sombreador del cielo, sin coste de geometría).
- ✅ Relámpagos: con una célula de más de 15 mm/h a menos de 30 km (`updateStorm`), destello del cielo (`uFlash`) y
  de la luz ambiente (~0,2 s, a veces doble) y trueno con el retraso de la distancia (`audio.thunder`).
- ✅ Nubes con volumen (`cloudSides` en el sombreador del cielo, `skyU.uVol` = calidad 2-3; el entorno de los reflejos y
  la calidad 0-1, como antes). La capa plana de siempre sigue dando la forma y la base; por encima, cuatro pasos de
  1,6 a 3,0 km con un ruido de tres octavas (`cloudDen3`) y un umbral que sube con la altura (cimas redondas). Solo
  añade los costados que se ven entre los huecos de las bases, con su sombra propia (una muestra 400 m hacia el sol) y
  más claros si miran al sol. Se probó a pintar todo el volumen (coger también la base de ahí) y salía plano y
  desvaído: la forma fina de la capa plana es lo que hace que se vean bien. Con cielo despejado apenas cambia.
- ✅ Gotas en el coche: `DROPS_GLSL` en `car3d.ts`, casillas de 5 cm en el plano al que mira cada punto, con gota y
  reflejo (el reflejo solo si la gota ocupa varios píxeles: si no, parece ruido). `U.uDrops` sigue a la lluvia que
  cae cerca (`rainHere`): sube en ~8 s y baja en ~2 min, al ritmo de la sesión.
- ✅ Charcos: no se lee lo que pinta el asfalto (con mucha agua casi todo es charco y no se notaría al cruzarlos);
  hay charco en los badenes (`T.dip`) y a trozos sueltos a lo largo de la pista (`vnoise(s / 22)`), con agua de sobra.
  Al cruzarlos, `p.spl` sube en 0,08 s y baja en 0,35 s, y el spray (`aSpl`) salta más alto, más abierto y más denso.
- Sin medir el coste de las nubes en un móvil: son 4 pasos con 2 muestras de ruido por píxel de cielo, solo en
  calidad 2-3. Si pesa, que `lowerQuality` lo quite antes que la resolución.
- La página de prueba tiene vistas nuevas (`cielo`, `gotas`, `morro`, `estela`) y `charco=0..1` para forzar el charco.

### 5.3 Hora del día (P) · ✅ Hecho
- Con el sol bajo, la caja de sombras crece (hasta ×1,9) para que las sombras largas no se corten.
- Ventanas de edificios y ciudad: cada una se enciende con su propio umbral (`winOn` en `PROP_FH`).
- Noche: resplandor anaranjado sobre el horizonte (`uCity`, más en los urbanos) y, en calidad 2-3, luces de pueblos en
  el borde del terreno (`townLights`, una llamada de dibujo; calidad 0 y 1 sin cambios).
- Los focos de las carreras de noche ya se encendían poco a poco con `uFlood`; no se ha tocado.

---

## Cómo se ha probado (para la próxima sesión)

- **Página de prueba del 3D** (`poc3d/prueba.html` + `prueba.ts`, y `poc3d/shot.cjs` para las capturas; no entra en la compilación del juego): construye una carrera con
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
- El error de sombreador de `instanceColor` (mallas de coche o ruedas sin color por instancia) ya está arreglado.
- La página de prueba admite además `nolod=1`, `nocull=1` y `far=<m>` (pasan a `debug.noLod`, `debug.noCull` y
  `debug.propFar`) y deja en `debug.props` cuántos vértices del decorado se dibujan y el estado de cada tramo
  (0 fuera, 1 lejos, 2 cerca). **No editar el código mientras se mide:** Vite recarga la página a mitad y salen
  capturas raras (edificios claros, sin ventanas) que no son un fallo.

## Bloque 6 · Competición (clasificación y carrera) · ✅ Hecho (cambia resultados a propósito)

Todo en `src/sim/session.ts` y `src/sim/strategy.ts`; el detalle, en el README («Salida», «Adelantamientos» y «La IA
de los equipos»).

- **Adelantamientos:** ventaja en s/vuelta (agarre en aire limpio + recta anterior + ataque/defensa) contra el umbral
  del circuito (`adelantamientos.umbral`, antes `factor`). Constantes `PASS_*` arriba de `session.ts`.
- **Salida** con la nota `salida` de cada piloto (antes no se usaba), intentos fallidos, errores bajo presión.
- **IA de carrera:** undercut, cubrirlo o alargar, tráfico al volver, doble parada, cuenta de parar con coche de
  seguridad, gomas hundidas, modos de ritmo/motor/batería con presupuesto de gomas, órdenes de equipo y la decisión de
  neumáticos con lluvia hecha con cuentas (`weatherCall`).
- **IA de clasificación:** margen en tiempo, reserva de juegos nuevos (`qualiSet`), mojado, repetir tras un error.
- **Para medir:** `npx tsx scripts/carrera.ts <circuito> [carreras] [semilla] [--detalle] [--umbral=x] [--w=x]` y
  `npx tsx scripts/calibra.ts [circuitos] [--escribe]`. **Si se toca algo que cambie el ritmo o los adelantamientos,
  volver a calibrar** (tarda ~5 min por circuito) y mirar la curva: coches iguales ~5 % por vuelta, 1–1,5 s ~35 %,
  más de 2 s casi siempre.
- Referencia nueva para comprobar que una tarea NO cambia resultados: la salida de `finde.ts` de ahora.

### Lo que mejoraría después (por orden de lo que más se notaría)

1. **Sanciones de carrera:** 5 y 10 s por causar un toque, por límites de pista repetidos o por pasarse en el
   pit-lane; se cumplen en la parada o se suman al final. Ahora un toque no tiene culpable.
2. **Relanzadas:** el líder marca el ritmo y elige cuándo acelerar; coches doblados que se desdoblan; salida parada
   tras bandera roja. Ahora la relanzada es un semáforo verde sin más.
3. **Banderas amarillas por sector** en clasificación (vuelta arruinada para quien pasa por ahí) y doble amarilla en
   carrera en vez de solo VSC/SC.
4. **Vuelta de formación y calentamiento:** gomas y frenos fríos en la salida según el compuesto y el asfalto; hoy
   las mantas lo igualan casi todo.
5. **Defensa activa del jugador:** una orden «defender» / «no pelear» por piloto (cuesta gomas y tiempo, sube el
   umbral del que ataca) y que el muro vea la ventaja del perseguidor y la probabilidad de que le pase.
6. **Pilotos con carácter en carrera:** rachas de confianza, quien se viene abajo tras un error, novatos que fallan
   más en mojado, y rivalidades que suben la agresividad.
7. **Fiabilidad con aviso:** averías que se anuncian (temperaturas, presión) y que se pueden llevar hasta la meta
   bajando el motor, en vez de solo el abandono repentino.
8. **Paradas con más juego:** tiempo de reacción del equipo (pedir la parada tarde y no llegar), salida insegura,
   y elegir entre parada rápida con riesgo o segura.

## Orden recomendado (lo que queda)

3.1 (en tandas, cuando haya tiempo: es sobre todo trabajo de datos) → 3.4 (toca casi todo:
temporada, mercado, guardado) y, con ella, el resto de 3.5.
