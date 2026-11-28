# Plan de Realismo 3D · Cámara a bordo y circuitos reconocibles · Muro de Boxes

Plan sucesor de `PLAN-3D-V2.md` enfocado en llevar la cámara **A bordo (`abordo`)** y la lectura a ras de pista a un nivel inmersivo, rápido y reconocible circuito a circuito, manteniendo la arquitectura **PWA + Three.js**, el presupuesto móvil y la simulación determinista intacta.

Tamaño estimado: **P** pequeño (1 PR corto), **M** medio, **G** grande (varios PR).

---

## Diagnóstico de partida

El motor 3D (`src/ui/map3d.ts`) se diseñó priorizando las vistas aéreas y de realización (`Circuito`, `Tele`, `Helicóptero`). Al bajar la cámara a `y ≈ 1,38 m`:
- **Vacío cercano:** los árboles se colocan a `minDist` ≈ `T.Wov * 2.7 + 34` (~90–130 m del eje en circuitos permanentes), dejando una pradera vacía alrededor del coche y quitando sensación de velocidad y sombras sobre la pista.
- **Curvas sin referencias:** la publicidad de valla (`adH`) se apaga cuando `kAbs >= 0.0022`; justo en las curvas clave no hay vallas, carteles ni mobiliario visual.
- **Relieve lavado:** `scripts/relieve.py` suaviza a 150 m por defecto y `buildTrackData()` aplica otro `blur` de 25 m, aplanando compresiones y rasantes icónicos (Eau Rouge, Turn 1 de Austin, subida de Interlagos).
- **Cámara sobre raíles y FOV extremo:** `abordo` usa `fov = 72°` (+ hasta `5.5°` de `fovBoost`, y hasta `92°` en vertical móvil con `onboardFov()`), encogiendo el horizonte y los hitos, con `look` rígido y micro-vibración muy tímida que además se desactiva si `speed > 2`.
- **Hitos lejanos y estética uniforme:** `src/ui/landmarks.ts` define 2 hitos por circuito a `64–215 m` (pensados para vista aérea), y los 24 circuitos comparten las mismas 8 marcas en vallas y el mismo tono base de asfalto.

---

## Reglas para cada bloque

- **Móvil vertical (`portrait`) primero** y **todo en español** (textos, comentarios y etiquetas).
- **Simulación inmutable:** prohibido alterar resultados de carrera/sesión. Verificar determinismo antes y después con:
  - `npx tsx scripts/finde.ts silverstone 42 --resumen`
  - `npx tsx scripts/finde.ts monaco 42 --resumen`
- **Presupuesto PWA y rendimiento:** mantener el shell precacheado ligero (`public/sw.js`), no superar ~1–2 MB de carga bajo demanda por GP, y conservar 60 fps en `q=2` en móvil moderno (y sin regresiones en `q=0/1`). Priorizar técnicas procedurales, GLSL e `InstancedMesh` frente a assets pesados.
- **Verificación en cada bloque:** `npm run check`, `npx vite build`, `npm run test:rapido`, 0 errores WebGL/consola y comprobación visual en `poc3d/prueba.html` en cámara `abordo` (móvil vertical `390×844` y apaisado) además de vista `circuito`.

---

## Estado

| Bloque | Estado | Alcance |
|---|---|---|
| 1. Borde cercano, vegetación junto a valla y shader de asfalto a ras de suelo | ✅ Completado | `src/ui/map3d.ts`, `src/ui/trackKit.ts` |
| 2. Dinámica, encuadre T-Cam y primer plano de cabina en `abordo` | ✅ Completado | `src/ui/map3d.ts`, `src/ui/car3d.ts`, `src/ui/sessionView.ts`, `public/assets/models/manifest.json` |
| 3. Piloto de relieve real y referencias icónicas a pie de pista (Spa y Mónaco) | ✅ Completado | `scripts/relieve.py`, `data/circuitos/spa.json`, `data/circuitos/monaco.json`, `src/ui/map3d.ts`, `src/ui/trackVisuals.ts`, `src/ui/landmarks.ts` |
| 4. Sensación de velocidad por postproceso, sombras y audio `onboard` | ✅ Completado | `src/ui/map3d.ts`, `src/ui/audio.ts`, `src/ui/sessionView.ts` |
| 5. Despliegue a los 24 circuitos por arquetipos y auditoría PWA móvil | ✅ Completado | `data/circuitos/*.json`, `src/ui/trackVisuals.ts`, `src/ui/landmarks.ts`, `src/ui/map3d.ts` |

---

## Bloque 1 · Borde cercano, vegetación junto a valla y asfalto a ras de suelo (M)

Objetivo: eliminar la sensación de «cinta gris en medio de un descampado» poblando la franja de `4–30 m` alrededor del trazado con elementos ligeros que den flujo óptico y lectura de curva sin añadir assets.

- **1.1 Franja de vegetación cercana en pistas arboladas (`src/ui/map3d.ts`)**
  - Mantener la lógica actual de masas lejanas y añadir una **segunda pasada de árboles/arbustos próximos** detrás de la valla exterior/interior (`SH * W_REAL + runoff + 6..28 m`) en circuitos no urbanos ni áridos (y parques en semiurbanos).
  - Respetar la máscara real `T.env.forest(x, z)` donde exista, evitar `gradaClear`, `lmClear`, cruces de pista (`trackDist`) y zonas de agua (`t.wet`).
  - Reutilizar las mismas instancias/mallas `.glb` ya cargadas (`InstancedMesh` existente), sin draw calls extra, ajustando su visibilidad/escala si hiciera falta en vista aérea `circuito` para no tapar el trazado.

- **1.2 Cartelería en curvas, bolardos y señalética FIA (`src/ui/map3d.ts`, `src/ui/trackKit.ts`)**
  - Relajar o eliminar el filtro `kAbs < 0.0022` en `adH` para que las curvas y salidas muestren vallas con publicidad/paneles de protección continuos (clave para leer el radio de giro en `abordo`).
  - Añadir señalética ligera instanciada pegada al borde: **carteles de zona DRS / Modo X** antes de la activación, **bolardos flexibles de vértice** en chicanes/curvas lentas y balizas en entrada/salida de `pit-lane`.
  - Mejorar legibilidad y contraste de los carteles de frenada (`150 / 100 / 50`) para que destaquen claramente en el ángulo bajo de la T-Cam.

- **1.3 Detalle cercano del asfalto y escapatorias (`RMODE == 1` en `src/ui/map3d.ts`)**
  - Añadir **marbles de goma** (gránulo oscuro moteado) en el exterior de la trazada ideal (`|vU - vLine| > 0.35`) para dar contexto de trazada real.
  - Reforzar las **marcas de frenada** en `brkZone` con doble huella más contrastada y ligera variación de tono de reasfaltado por tramos a lo largo de `vV`.
  - Afinar la transición entre línea blanca, piano serrado y grava/asfalto pintado para evitar bordes excesivamente limpios en primer plano.

---

## Bloque 2 · Encuadre, física visual y cabina en `abordo` (M)

Objetivo: sustituir la cámara rígida de gran angular por una T-Cam viva que transmita peso, velocidad, baches y cercanía al monoplaza.

- **2.1 Encuadre T-Cam realista (`src/ui/map3d.ts`, `public/assets/models/manifest.json`)**
  - Calibrar `camPos` y reducir el FOV base de `abordo` (de `72°` / hasta `92°` en vertical a un equivalente horizontal más natural tipo retransmisión TV, ~`58°–64°` en 16:9 con techo más contenido en `onboardFov()`), evitando que las montañas, vallas y curvas lejanas parezcan diminutas.
  - Valorar un toggle sencillo en menú de cámara (o doble toque en `Bordo`) entre **T-Cam** (encima de la toma de aire) y **Piloto / Halo** (a la altura del casco).

- **2.2 Inercia por fuerzas G, *apex look-ahead* y *kerb rumble* (`src/ui/map3d.ts`)**
  - **Mirada anticipada al vértice:** orientar `want.look` ligeramente hacia el interior de la curva siguiente combinando `track.curv` a `s + 22..45 m` en lugar de usar solo un `0.15` fijo hacia `s + 16 m`.
  - **Cabeceo y compresión reales:** sumar desplazamiento vertical y de pitch proporcional a la frenada (`p.acc`), la aceleración y las compresiones del trazado (`T.dip` en badenes como Eau Rouge), más un ligero balanceo lateral de cámara en curva rápida.
  - **Vibración por pianos y asfalto:** reforzar el *rumble* al morder pianos (`onKerb`) y salirse a grava/hierba (`offTrk`), con ruido multi-frecuencia que afecte tanto a la cámara como levemente al conjunto volante/casco, manteniéndolo activo hasta `opt.speed() <= 4` (escalado con seguridad).

- **2.3 Primer plano del coche seguido (`src/ui/map3d.ts`, `src/ui/car3d.ts`)**
  - Aplicar detalle cercano exclusivo al coche seguido en `abordo` (un solo coche en escena = coste despreciable): trama de fibra de carbono en halo y pontones visibles, y ligero giro del casco hacia el ápice en curva.
  - Enriquecer `drawDash()` en el volante (`dashMesh`): arco de RPM más nítido, indicador de delta/vuelta o bandera activa en LEDs laterales, barra de despliegue ERS y modo aero (`MO` / `X` / `Z`).
  - Añadir reflejo dinámico simple en los retrovisores (cielo + destello rojo/silueta cuando otro coche rueda a menos de 18 m detrás).

---

## Bloque 3 · Piloto de relieve real e identidad a ras de suelo (Spa y Mónaco) (M/G)

Objetivo: validar en dos circuitos emblemáticos opuestos (**Spa-Francorchamps** y **Mónaco**) que al poner `abordo` se reconozca el circuito en 2 segundos sin necesidad de ver el minimapa.

- **3.1 Relieve fiel en compresiones y rampas (`scripts/relieve.py`, `src/ui/map3d.ts`)**
  - Ajustar `scripts/relieve.py` para reducir el suavizado por defecto de `150 m` a ~`45–55 m` (conservando `600 m` en urbanos llanos como Singapur y filtrando artefactos puntuales de árboles/puentes).
  - Reducir el `blur(H, ...)` en `buildTrackData()` de `25 m` a `10–12 m` y revisar que la transición del terreno (`terr`) abrace bien los cambios de pendiente fuertes sin enterrar ni dejar flotando la pista.
  - Re-generar y validar el perfil en `data/circuitos/spa.json` (subida de Eau Rouge–Raidillon, bajada de Pouhon, subida hacia Blanchimont) y `data/circuitos/monaco.json` (rampa Ste Devote–Casino, bajada Mirabeau–Portier).

- **3.2 Mobiliario e hitos cercanos al trazado (`src/ui/map3d.ts`, `src/ui/trackVisuals.ts`, `src/ui/landmarks.ts`)**
  - **Mónaco:** mejorar el túnel (`vis.tunnel`) con bocas arquitectónicas más marcadas, pilares hacia el mar mejor definidos, iluminación cálida interior y contraste al salir hacia la chicane del puerto; ajustar muros bicolor/vallas pegadas al vértice en Piscina, Tabac y Rascasse.
  - **Spa:** reforzar la presencia de la Torre de Eau Rouge y el Pabellón del Raidillon en la visual directa al subir la colina, añadir pórtico/pasarela icónica en recta y cerrar el corredor de árboles en Kemmel, Les Combes y Blanchimont.

- **3.3 Paleta propia de asfalto y cartelería por circuito (`src/ui/trackVisuals.ts`, `src/ui/map3d.ts`)**
  - Añadir en `TrackVisualProfile` propiedades ligeras sin assets extra: tono/luminancia del asfalto (`asphaltColor`, más oscuro y gastado en circuitos clásicos; más gris azulado en urbanos/modernos) y paleta de cartelería/arcos de pista (`adPalette` o temática cromática del GP) en lugar de repetir siempre las mismas 8 marcas idénticas.

---

## Bloque 4 · Sensación de velocidad por postproceso, luz y audio (M)

Objetivo: multiplicar el impacto sensorial de ir a > 250 km/h usando únicamente shaders ligeros y el motor Web Audio existente.

- **4.1 Postproceso y flujo óptico (`src/ui/map3d.ts`)**
  - En el shader de postproceso (`post.grade`, activo en `q >= 2`), añadir un **desenfoque direccional radial muy suave en los bordes laterales** de la pantalla cuando `camMode === "abordo"`, proporcional a `(v - 180 km/h)`.
  - Emitir unas pocas motas/partículas rápidas de aire o polvo rasante junto a la cámara a alta velocidad (desactivables con `reduced` o `q === 0`).
  - Aprovechar el frustum de sombra cercano (`S0 = 42 m` en `abordo`) para que árboles cercanos, puentes y pórticos proyecten sombras nítidas cruzando sobre el morro y el asfalto.

- **4.2 Audio `onboard` inmersivo (`src/ui/audio.ts`)**
  - Añadir **retumbo táctil al pisar pianos** (`onKerb`) y baches al salir de pista.
  - Añadir capa sutil de **viento aerodinámico** filtrada en paso-alto/paso-banda proporcional a `v²` por encima de ~180 km/h.
  - Dar más carácter a los cortes de cambio de marcha y añadir reverberación/eco corto cuando el coche atraviesa un túnel (`vis.tunnel`) o un cañón urbano estrecho.

---

## Bloque 5 · Despliegue a los 24 circuitos y auditoría PWA (G)

Objetivo: extender el estándar validado en Spa y Mónaco al resto del calendario manteniendo intactos el peso y la fluidez en móvil.

- **5.1 Despliegue del relieve y perfiles de circuito (`scripts/relieve.py`, `src/ui/trackVisuals.ts`, `src/ui/landmarks.ts`)**
  - Reprocesar `relieve` con el nuevo suavizado en los circuitos permanentes y semiurbanos con desnivel real (Austria, Interlagos, Austin, Suzuka, Silverstone, Zandvoort, Hungaroring, Barcelona, Madrid, etc.), comprobando que no aparezcan escalones en `env-tracks/*.json`.
  - Definir para los 24 circuitos su tono de asfalto, paleta de cartelería, y ajustar/añadir pórticos o micro-hitos visibles desde pista en lugares clave (p. ej. muralla estrecha del castillo en Bakú, puente en «8» y noria visibles desde pista en Suzuka, arco del Hotel W cruzando sobre el trazado en Yas Marina, puente/cartel de recta en Monza, curva 1 de Austin, Foro Sol en México).

- **5.2 Auditoría técnica y visual final**
  - Verificar determinismo completo (`finde.ts` y `npm test`), `npm run check` y `npx vite build`.
  - Medir peso total de `dist/` y `public/assets/`, comportamiento offline del Service Worker (`public/sw.js`) y FPS reales en `q=1/2` (incluyendo modo ahorro 30 fps) en `390×844`.
  - Capturas comparativas en `poc3d/prueba.html` en cámara `abordo` de al menos 6 circuitos representativos (Spa, Mónaco, Suzuka, Bakú, Monza, Austin) comprobando 0 errores WebGL (`getError() === 0`).
