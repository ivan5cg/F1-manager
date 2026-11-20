# Plan de mejoras · Muro de Boxes (sin online)

Un solo fichero con todo: lo que queda por hacer (bloques 8 a 13, primero) y lo ya hecho (bloques 1 a 7, después, con
sus notas para quien siga). Cada tarea, un commit (o varios si es grande).
Tamaño: **P** pequeño (un PR corto), **M** medio, **G** grande (varios PR).

## Lo que queda

Ya hecho de lo que viene ahora (noviembre de 2026):
- **Radio con personalidad y radios míticas** (fase 1 de la radio, `src/ui/voces.ts`).
- **8.1 Los pilotos responden a tus órdenes** (`responde` en `voces.ts`, `ordenRadio`/`ritmoOrden` en `sessionView.ts`):
  box, anular, apretar/ahorrar (ritmo y motor, contesta al cambio que queda 1 s después de tocar), dejar pasar,
  defender y no pelear; a disgusto según las gomas, el rival a tiro o los tiempos del compañero.
- **10.1 Lobato por códigos:** `lobato.ts` solo mira `RaceEvent.code` (19 códigos nuevos de dirección de carrera,
  meteo y boxes, y `motivo` en las sanciones). `npx tsx scripts/lobato.ts [circuito] [equipo] [semilla]` vuelca sus
  comentarios por código, las respuestas a órdenes al azar y los mensajes que siguen sin código.
- **12.1 Cascos con diseño propio:** `helmetDesign(nombre)` en `visual.ts` (colores de su bandera en `FLAG_COLORS` o de
  `HELMET_PALETTE`, nueve motivos) y `helmetSvg(..., nombre)` en todas las pantallas, con el equipo en la franja de
  abajo. En el 3D, el casco se marca en el color de vértice (g = 2 base, g = 3 franja) y cada coche lleva `aHelm` y
  `aHelm2` (`CAR_INST` en `map3d.ts`); mismas llamadas y triángulos.
- **9.2 Titulares y 9.3 La directiva te escribe** (`src/ui/prensa.ts`): `headlines` saca la portada del `RaceSummary` y
  del resultado (la misma cada vez que se abre: el azar sale de un hash); `boardMessage`, de los objetivos antes y
  después de la carrera, y se guarda en `RoundResult.board`. Se ven en los resultados, en el calendario y en el gran
  premio suelto (sin directiva). `npx tsx scripts/prensa.ts [equipo] [carreras] [semilla]` vuelca las dos cosas.
  De paso: el panel «Cambios de pilotos» tras una carrera se perdía al pintar el mundial (`main.ts`).
- **11.1 Safety Car `.glb`:** modelo CC-BY de Sketchfab (101 MB, 1,4 M de triángulos) preparado con
  `scripts/prepara_safety_glb.py` (solo numpy: clasifica por nombre de nodo, quita interior, matrículas e insignias,
  simplifica agrupando vértices y cuantiza; sin Draco) en `safety.glb` (30 000 tri., 315 KB) y `safety_lo.glb` (6000,
  71 KB). En `map3d.ts`, `loadSafetyCar` y `SC_COLORS`: una malla con color por vértice, el fino de cerca (< 90 m) y
  la ligera de lejos; las luces del techo (más una barra que las envuelve) parpadean con `scBar`. `SC_GEO` de
  respaldo. Página de prueba: `sc=1`. Se podría mejorar con un simplificador de verdad (meshoptimizer) si se
  permite instalarlo.
- **8.2 Moral y desobediencia, 8.3 Rivalidades y 9.1 Rueda de prensa** (cambian la simulación, solo en temporada):
  `src/sim/morale.ts` (moral por nombre en `SeasonState.moral`, rivalidades en `rivals`, `boardMood`),
  `src/sim/caracter.ts` (el carácter, que ahora usa también la sesión), `session.ts` (`MORAL_PACE`, `disobeys` con su
  propio azar `moodS`, `refusesStop`, `rivalOf`, `RIVAL_DEF`, `RIVAL_CONTACT`, `duels`, `orders`; código
  `desobedece`), `WeekendState.moral/rivals/prensaQs/prensa`, `src/ui/vestuario.ts` (paneles y preguntas). Sin moral
  (`finde.ts`, gran premio suelto) los resultados no cambian. Medido con `scripts/moral.ts`.
- **9.4 Récords e hitos, 9.5 Previa, 9.6 Gala y sala de trofeos y 10.2 Lobato con memoria** (sin tocar la
  simulación): `src/sim/hitos.ts` (`hitosAfterRace`, `allTrofeos`, `lobatoMemo`, `gala`, `recordExtras`) y
  `src/ui/ritual.ts` (previa, rótulos, gala, sala de trofeos, `seatAt` con `whoAt` para los cambios de asiento).
  Se guardan `SeasonState.hitos` y `records` (pasan de año) y, en cada `SeasonRecord`, `trofeos`, `ganadores` y `gala`.
  Lobato recibe `WeekendState.memo`. Probar con `scripts/hitos.ts`.
  De paso: en carrera, una vuelta cortada por una bandera roja o una salida parada (de unos segundos) contaba como
  la mejor (`raceLine`, ahora con un mínimo del 85 % de `lapRefRace`); salía en la vuelta rápida del resumen.
- **10.3 Segundo comentarista, 10.4 Público y sonido según el circuito y 12.2 Planos técnicos** (sin tocar la
  simulación): `src/ui/experta.ts` (Begoña Arrieta, `Prefs.experta`, voz «experta» en `audio.ts`), el público de casa
  (`isLocal` y el himno en `sessionView.ts`, `audio.anthem`, `FAN_U`/`loadFanFlag` en `map3d.ts`) y
  `src/ui/planos.ts` (`devPlanoHtml`, `setupPlanoHtml`).
- **13 Gestión** (cambia la simulación en lo que toca a sanciones): despido de verdad (`firedNow`, `firingOffers`,
  `SeasonState.despedido` en `nextSeason.ts`/`hubs.ts`), cambio de jefe, técnico y motor en «crear equipo»
  (`StaffChoice`, `staffCost`), sanciones sin cumplir a la parrilla siguiente (`Session.gridPenaltiesNext`,
  `SeasonState.gridPens`, `WeekendState.gridPens`), banderas azules ignoradas (`BLUE_IGNORE_P` con su azar `blueS`:
  sin ninguna, la carrera es la misma) y salida parada tras la bandera roja por lluvia (`standAfterSc`). Banco de
  realismo (6 circuitos × 6 carreras) igual que en main salvo las sanciones (1,2 → 1,4); `finde.ts` igual.
- **11.4 Mecánicos con los colores del equipo** (`CREW_STAND`/`CREW_CROUCH`, `aCrew2` y `crewAttr` en `map3d.ts`):
  mono del color del equipo y casco, hombros y franjas de las piernas del segundo (`SECOND`); los comisarios, con su
  casco blanco. Mismas llamadas. Página de prueba: `pit=1` (la cámara va con un coche parado en boxes).
- **Asfalto sin baldosas:** la textura de 2,7 m se repetía y se veía una cuadrícula. `asfalto.webp` aplanada (paso
  alto sin costuras, `python3 scripts/assets.py --aplanar`) y el árido leído dos veces en el sombreador (la segunda
  girada 37° y a otra escala) mezcladas con ruido (`ASF_R` en `map3d.ts`). Una lectura de textura más en la pista.
- **Inmersión visual:** monoplaza `.glb` propio con Draco (`public/assets/models`, guía en `docs/GUIA-BLENDER-COCHE.md`),
  entornos HDRI (`public/assets/env`), texturas PBR de Poly Haven (`public/assets/tex`: asfalto, hierba, grava,
  hormigón, fachada), banderas SVG (`public/assets/flags`) y brazos del piloto a bordo (`car3d.ts`).
- **Realismo 3D — Oleadas 1 y 2 (`src/ui/map3d.ts`, `src/ui/car3d.ts`):**
  - *Oleada 1 (iluminación, sombras y materiales):* sombra de contacto suave siempre activa bajo los coches en todas las calidades; relieve normal procedural + AO de contacto en el suelo para `propMat` y `cityMat`; profundidad `FloatType` + `near`/`far` dinámicos + `GTAOPass` calibrado; `UnrealBloomPass` saneado contra `NaN` y emisivos nocturnos equilibrados; reflejo del agua y anti-aliasing en chapas corrugadas del techo de boxes.
  - *Oleada 2 (terreno, pista y atmósfera):* 6 biomas completos (`bosque`, `tropical`, `seco`, `mediterraneo`, `dunas`, `desierto`) cubriendo los 25 circuitos; estratos rocosos triplanares sin estiramiento en taludes y laderas; líneas blancas de anchura FIA, pianos serrados 3D y escapatorias de grava rastrillada; vallas protectoras traslúcidas con anti-aliasing, guardarraíl Armco en W y pilas de neumáticos con relieve; neblina atmosférica exponencial (`THREE.FogExp2`).
- **11.3 Fachadas y arquitectura (Oleada 3) y 11.5 Boxes y lluvia (Oleada 4)** (sin tocar la simulación; todo en
  `src/ui/map3d.ts`, sin assets nuevos):
  - *Tercer nivel de detalle en el decorado:* `B.fine(fn)` en `propBuilder` (además de `near`) apunta lo que solo se
    dibuja de cerca **y con calidad 2 o 3**; cada tramo guarda `n0`, `n1` y `n2` y `propLod` rehace los índices
    también al cambiar de calidad. Así los escalones 0 y 1 dibujan exactamente el mismo decorado que antes. El detalle
    fino tira de su propio azar (`rnd3`) para que lo de siempre salga igual. `B.beam(a, b, r…)` hace vigas y tirantes.
  - *Interiores falsos* (`roomAt` en `PROP_FH`): el rayo de la vista se pasa al plano de la cara con las derivadas de
    la posición y de uv (sin atributos nuevos) y choca con una caja (fondo, paredes, suelo, techo, mueble, cuadro,
    cortina). En la fachada clásica (5), el muro cortina (6) y el cristal de los boxes (2), con `uHiQ` (calidad ≥ 2) y
    de cerca (`inK`); de día lo alumbra `uDay` y de noche la lámpara (`winOn` de siempre). El cristal pasa a casi negro
    con rugosidad baja: el reflejo lo pone el entorno con su Fresnel.
  - Vestíbulos de doble altura en las torres (`uv.y < 5,6`), soportales en Mónaco (`h21(sd, 17) < 0,3`), pasillos de
    escalones en las gradas cada 14 m, paños y churretes en el hormigón (9) y dibujos nuevos: 12 teja árabe,
    13 barandilla (con `discard`; de lejos, tramada) y 14 helipuerto.
  - Remates de los edificios de calle (`roofTop`), mástiles y tirantes de las gradas, cristalera inclinada de los palcos,
    cabina de la torre de control y barandillas de los puentes, todo en `B.fine`.
  - Manzanas lejanas: dos mallas más con los tejados (`CITY_GABLE`, `CITY_TOP`, hechas con `facesGeo`) sobre las mismas
    matrices, `cityMat(style, part)`; `world.cityRoofs` solo se ve con calidad ≥ 2 (`applyQuality`). La normal de las
    instancias se corrige con la escala (antes daba igual: solo había cajas).
  - Hormigón de la zona de trabajo y del paddock: cinta nueva `RMODE 8` (losas de 5 m con juntas, aceite y agua en las
    juntas con lluvia); el muro del pit-lane (`RMODE 0`), piezas de 6 m.
  - Pórtico de la parada: `GANTRY_GEO` con pértiga sobre el coche, mangueras (`TubeGeometry`) hasta las cuatro pistolas
    y carcasa con viseras; las luces, `GLIT_GEO`/`GLIT_MAT` (cuadros con halo que se suman, el color de la instancia
    dice cuál se enciende: rojo, ámbar entre 0,84 y 0,92 de la parada, verde).
  - Estela (`SPRAY_MAT`): jirones que giran y se estiran, ruido deformado que se deshilacha con la edad, un 30 % son
    chorros de las ruedas traseras; color tope 0,78.
  - Lluvia de noche: `shafts` (16 conos con gotas bajo los focos que ya se reflejan; sale de `updateLampRefl`), halos de
    las farolas mayores y gotas en el objetivo de las cámaras de tele (`TV_CAMS`), las dos cosas con calidad ≥ 2.
  - Página de prueba: `lluvia=<mm/h>` moja la pista entera.
  - Medido con la página de prueba (Mónaco y Singapur, calidad 0 y 1): mismas llamadas, triángulos y vértices dibujados
    del decorado que antes. El detalle fino que pisaría la pista de cerca se quita solo (`B.dropFine`) sin tocar el
    edificio. Lo único que sube en todos los escalones es el pórtico de la parada (unos 640 triángulos por coche
    parado, la misma llamada).
  - Ideas sin hacer: la barandilla y la celosía dan sombra entera (la sombra no hace `discard`); interiores en las
    manzanas lejanas (de lejos no se ven); reflejo del cielo propio en los charcos.
- **11.2 Árboles por bioma, 11.4 Mecánicos `.glb` y yates `.glb` (`scripts/prepara_entorno_glb.py`, `src/ui/map3d.ts`):**
  - 5 modelos CC-BY-4.0 de Sketchfab optimizados a ~712 KB en total (`tree_leaf.glb`, `tree_leaf_lo.glb`, `tree_pine.glb`, `tree_palm.glb`, `crew_stand.glb`, `crew_crouch.glb`, `yacht.glb`), con texturas WebP (`EXT_texture_webp`), recorte alfa `MASK` con sangrado anti-halos y respaldo procedural instantáneo.
  - Carga bajo demanda por bioma y circuito (Baréin solo descarga palmeras; Mónaco/Singapur descargan yates), rotación Y aleatoria, tintado sutil de copa por bioma, LOD `tree_leaf_lo` en vista general y atribución en `public/assets/LICENCIA-MODELOS-SKETCHFAB.txt` y `README.md`.

### Orden recomendado

Primero lo que se nota en cada carrera; los gráficos se ven una vez y se olvidan antes.

1. ~~8.1 Los pilotos responden a tus órdenes~~ ✅ y ~~10.1 Lobato por códigos~~ ✅.
2. ~~11.1 Safety Car `.glb`~~ ✅ y ~~12.1 Cascos~~ ✅.
3. ~~9.2 Titulares~~ ✅ y ~~9.3 La directiva te escribe~~ ✅.
4. ~~12.2 Planos técnicos en Desarrollo~~ ✅.
5. ~~9.1 Rueda de prensa, 8.2 Moral y desobediencia y 8.3 Rivalidades~~ ✅.
6. ~~9.4 a 9.6 Ritual de la temporada~~ ✅, ~~10.2 a 10.4~~ ✅ y ~~13 Gestión~~ ✅.
7. ~~11.2 Árboles por bioma y 11.4 Mecánicos `.glb` (+ yates `.glb` y Oleadas 1–2)~~ ✅.
8. ~~11.3 Fachadas urbanas y arquitectura (Oleada 3)~~ ✅ y ~~11.5 Detalle de boxes y lluvia (Oleada 4)~~ ✅.
9. **12.3 Escudos de equipo**: lo último que queda.

### Presupuesto de assets (vale para los bloques 11 y 12)

El juego es una PWA (`public/sw.js`) y se juega en el móvil: cada `.glb` y cada textura alarga la primera carga.
- Hoy `public/assets` pesa **3,59 MB** (texturas 1,8 MB, HDRI 0,5 MB, modelos `.glb` 1,1 MB, banderas 0,2 MB). **Tope: 8 MB en total.**
- Lo que solo sale en algunos circuitos (fachadas de urbanos, árboles de un bioma) se carga al abrir ese circuito, no
  al arrancar, y el service worker lo guarda después de la primera vez.
- Todo `.glb` con Draco y con lo hecho por código como respaldo si no carga (como el coche).
- Medir con el medidor de rendimiento (1.3) y no subir llamadas ni triángulos de los escalones 0 y 1.
- Solo assets con licencia libre (CC0, MIT) y apuntados en el README y en `public/assets/LICENCIA-*`. Nada de logos ni
  marcas reales.

---

## Bloque 8 · Radio y vestuario

### 8.1 Los pilotos responden a tus órdenes (P) · ✅ Hecho
- Al pedir que pare, que apriete, que ahorre o que deje pasar al compañero, contesta según su carácter: «Recibido»,
  «¿Ahora? Las gomas van bien...», «¿En serio? Soy más rápido».
- Solo texto: siempre obedece. Se engancha a las acciones del muro de `sessionView.ts`, igual que la fase 1 a los
  sucesos con código.

### 8.2 Moral y desobediencia (M/G) · cambia la simulación · ✅ Hecho
- **Moral** por piloto que dura toda la temporada: sube con buenos resultados y estrategias que le favorecen, y baja
  con órdenes en contra o paradas que le hunden.
- Con la moral baja y un carácter volcánico, **a veces no obedece**: no deja pasar o retrasa la parada una vuelta.
- Afecta un poco a su ritmo y a si quiere renovar en el mercado.
- Medir con un script (como `scripts/radio.ts`) cuántas veces desobedecen en muchas carreras. Azar con su propio `Rng`.

### 8.3 Rivalidades que se recuerden (M) · cambia la simulación · ✅ Hecho
- Si dos se tocan o se adelantan mucho, nace una rivalidad que se arrastra de carrera a carrera (hoy `RIVALS` en
  `session.ts` solo vive en una carrera). Se nota en lo agresivos que defienden.
- Lobato la menciona («¡Otra vez estos dos!») y la radio también.

## Bloque 9 · El fin de semana fuera de la pista

### 9.1 Rueda de prensa (M) · ✅ Hecho
- Entre sesiones, una o dos preguntas con respuestas a elegir («¿Hay favoritismo hacia tu primer piloto?»). Cada
  respuesta toca la moral de los pilotos (8.2) o la paciencia de la directiva. Mejor después de 8.2.

### 9.2 Titulares tras la carrera (P) · ✅ Hecho
- Una portada de prensa ficticia («Golpe de estrategia en Silverstone», «El muro, otra vez en entredicho»), generada
  desde el resumen de carrera que ya existe (`summary.ts`). Periódico inventado, sin cabeceras reales.

### 9.3 La directiva te escribe (P) · ✅ Hecho
- Mensajes cortos del jefe tras cada gran premio, a partir de los objetivos (`objectives.ts`: «Esperaba el podio con
  este coche»).

### 9.4 Récords e hitos (P) · ✅ Hecho
- Primera victoria, primer podio del equipo, cien carreras, récord del circuito. Lobato y un rótulo lo celebran, y
  queda en un historial.

### 9.5 Previa de cada gran premio (P) · ✅ Hecho
- Una tarjeta con la historia del circuito, la clave estratégica («Mónaco: la clasificación lo es todo») y la
  previsión, como el arranque de una retransmisión. Con la bandera del país (ya están en `public/assets/flags`).

### 9.6 Gala de fin de temporada y sala de trofeos (M) · ✅ Hecho
- Gala: mejor adelantamiento, mejor estrategia, piloto del año, sacados de los datos de las carreras.
- Sala de trofeos del equipo: las copas de cada victoria y los resultados de los escenarios y grandes premios sueltos.

## Bloque 10 · Lobato y el ambiente

### 10.1 Lobato por códigos (P) · ✅ Hecho
- Que reaccione al código de cada suceso (`RaceEvent.code`, como la radio) en vez de leer el texto con expresiones
  regulares. Así se evitan fallos como el de «P15» tomado por «P1». Va antes que 10.2 y 10.3.

### 10.2 Lobato con memoria (P/M) · ✅ Hecho
- Que recuerde lo que pasó antes («Recordemos que en Mónaco se le escapó por la estrategia», «es su tercera pole
  seguida»). Usa el historial de 9.4.

### 10.3 Un segundo comentarista (M) · ✅ Hecho
- Un experto técnico en el box que explique la estrategia («Están pensando en el undercut»). Personaje inventado, no
  una persona real.

### 10.4 Público y sonido según el circuito (P/M) · ✅ Hecho
- Más ruido cuando adelanta el piloto local, banderas en las gradas del 3D (texturas de `public/assets/flags`) y un
  himno inventado en el podio (`audio.ts`, sin archivos).

## Bloque 11 · Entorno y boxes en 3D

Ojo: el Safety Car (`SC_GEO`, `scCar` en `map3d.ts`), los árboles (con LOD de 124/26 triángulos), las fachadas
(`fachada.webp`) y los mecánicos con gatos y pistolas ya existen hechos por código. Aquí se trata de mejorarlos,
no de crearlos. Respetar el presupuesto de assets.

### 11.1 Safety Car `.glb` (P/M) · ✅ Hecho
- Sale en la mitad de las carreras y la cámara lo sigue: ahora es lo que más desentona al lado del monoplaza nuevo.
- Mismo camino que el coche: `.glb` con Draco en `public/assets/models` (en `manifest.json`), una versión ligera, y
  `SC_GEO` de respaldo. Luces del techo que parpadeen (material emisivo) y el `scBar` de siempre. Coche genérico, sin
  marca.

### 11.2 Árboles por bioma (M) · ✅ Hecho
- 6 biomas (`bosque`, `tropical`, `seco`, `mediterraneo`, `dunas`, `desierto`) en `src/ui/map3d.ts` con mezcla de especies
  según circuito (`tree_leaf.glb` + `tree_leaf_lo.glb`, `tree_pine.glb`, `tree_palm.glb`), carga bajo demanda solo del
  bioma activo, rotación Y aleatoria, tintado suave por bioma, sombras con recorte alfa en `q >= 3` y respaldo procedural.
- Incluye además `yacht.glb` para los puertos de circuitos urbanos con mar (Mónaco, Singapur…).

### 11.3 Fachadas urbanas y arquitectura de circuito · Oleada 3 (M) · ✅ Hecho
Todo en código/shaders (`src/ui/map3d.ts`), sin añadir más `.glb`:
- **Edificios urbanos (`cityMat` en Mónaco, Singapur, Bakú, Las Vegas):**
  - Interiores con profundidad falsa (parallax sencillo o degradado de techo/suelo detrás del cristal) y reflejo de cielo/entorno más realista en las ventanas en lugar de rectángulos planos.
  - Remates de azotea y variación arquitectónica: cornisas, pretiles, tejados inclinados mediterráneos (Mónaco), unidades de climatización / helipuertos / antenas en torres (Singapur, Las Vegas) y plantas bajas porticadas o acristaladas distintas del resto de pisos.
  - Cuidado con el aliasing lejano ya controlado en 5.1 (ventanas en Mónaco y Singapur).
- **Gradas y edificios de boxes/paddock (`propMat`):**
  - Romper el aspecto de «caja»: viseras inclinadas con cerchas/tirantes visibles, peldaños y pasillos de acceso más marcados en gradas, cristaleras de los palcos VIP sobre los garajes, petos metálicos y detalle en las torres de control y pasarelas/puentes sobre pista.
  - Variación de material/desgaste y juntas de dilatación en el hormigón del pit-lane y muros de boxes.

### 11.4 Mecánicos `.glb` (M) · ✅ Hecho
- `crew_stand.glb` (1.343 tri., 49,7 KB) y `crew_crouch.glb` (1.379 tri., 52,5 KB) generados desde Sketchfab con
  `scripts/prepara_entorno_glb.py`, sin texturas y compatibles con `CREW_MAT` (`R` mono del equipo, `B` casco/segundo
  color o blanco en comisarios, `G` visera/guantes/botas/pistola). Sustituyen a `CREW_STAND`/`CREW_CROUCH` en
  `crewS`, `crewC`, `marsh` y el comisario de bandera a cuadros manteniendo el respaldo procedural.

### 11.5 Detalle de boxes y lluvia · Oleada 4 (P/M) · ✅ Hecho
Todo en código/shaders (`src/ui/map3d.ts` y `src/ui/car3d.ts`):
- **Pórtico de parada en boxes (`gant` / `glit`):** carcasa de semáforo más detallada con visera/parasol, tres ópticas diferenciadas (rojo/ámbar/verde con halo suave) y mangueras neumáticas colgando del brazo aéreo hacia las pistolas.
- **Lluvia y estela (`spray` / `puffs` / `rain`):**
  - Estela de agua (`spray`) más orgánica y volumétrica: textura de nube/bruma suave con ruido rotado en vez de discos uniformes, con densidad ligada a la velocidad, al agua del minisector y al paso por charcos (`aSpl`), sin saturar el bloom.
  - Mejora sutil de reflejos en pista mojada y gotas en cámara / halo húmedo bajo los focos en carreras nocturnas con lluvia.

## Bloque 12 · Pantallas e identidad 2D

### 12.1 Cascos con diseño propio (P/M) · ✅ Hecho
- `helmetSvg` (`src/ui/visual.ts`) ya pinta un casco de lado con el color del equipo y el número. Darle a cada piloto
  un diseño propio (franjas, estrella, degradado, colores de su bandera) sacado de un hash de su id, para que no haga
  falta dibujar ninguno a mano. Que el casco del 3D (`car3d.ts`) use los mismos colores.
- Sale en muchas pantallas (`hubs.ts`, `podium.ts`, `sessionView.ts`, `grandPrix.ts`, `scenarios.ts`).

### 12.2 Planos técnicos en Desarrollo y Reglajes (M) · ✅ Hecho
- Un SVG del coche visto desde arriba y de lado, como un plano, en el panel «Desarrollo del coche» (`hubs.ts`): se
  ilumina la pieza que mejoras (alerón, suelo, motor, fiabilidad) y cuándo llega.
- En «Reglajes», el mismo plano de lado con la altura y el ángulo del alerón que cambian con los valores.
- `dev.png` (en la raíz) es la referencia de cómo se ve ahora esa pantalla.

### 12.3 Escudos de equipo (P)
- Escudos vectoriales **inventados** para los equipos creados en «crear equipo» (forma, colores e iniciales). Para los
  equipos reales, nada de logos: sus colores y su nombre, como ahora.

## Bloque 13 · Gestión · ✅ Hecho

- Cambiar de jefe de equipo, director técnico o motor entre temporadas en «crear equipo».
- Que te despidan de verdad (hoy solo hay un aviso, `aviso` en 3.5).
- Penalización en la parrilla de la carrera siguiente para el que provoca un toque y abandona; banderas azules
  ignoradas; salida parada tras bandera roja con lluvia (ideas sin hacer del Bloque 7).

---

# Lo ya hecho

## Estado (noviembre de 2026)

| Tarea | Estado | Dónde está |
|---|---|---|
| 1.1 Guardado en IndexedDB | ✅ Hecho | `src/ui/db.ts`, `src/ui/store.ts`, `src/ui/main.ts` |
| 1.2 Aviso de copia de seguridad | ✅ Hecho | `src/ui/store.ts`, `src/ui/hubs.ts` |
| 1.3 Medidor de rendimiento | ✅ Hecho | `src/ui/map3d.ts` (`stats`, `setQuality`), `src/ui/sessionView.ts` |
| 2.1 Motores | ✅ Hecho | `src/ui/audio.ts`, `map3d.ts` (`audioView`), `sessionView.ts` |
| 2.2 Ambiente | ✅ Hecho | ídem |
| 2.3 Radio del equipo | ✅ Hecho | ídem |
| 3.1 Calendario más largo | ✅ Hecho | `data/calendario.json` (`completa`), `data/circuitos/*.json`, `scripts/nuevos.py`, `src/ui/data.ts` (`CALENDARS`, `circuitOf`, `devRounds`), `weekend.ts` (`horarioFor`, `dayName`) |
| 3.2 Reglajes | ✅ Hecho (cambia resultados) | `src/sim/setup.ts`, `session.ts`, `weekend.ts`, `hubs.ts`, `scripts/reglajes.ts` |
| 3.3 Desarrollo del coche | ✅ Hecho (cambia resultados en temporadas nuevas) | `src/sim/development.ts`, `market.ts`, `src/ui/data.ts`, `hubs.ts` |
| 3.4 Varias temporadas | ✅ Hecho (cambia resultados desde la 2.ª temporada) | `src/sim/career.ts`, `src/ui/nextSeason.ts`, `season.ts`, `data.ts` (`gridOf`), `market.ts` (`buildGrid`), `scripts/temporadas.ts` |
| 3.5 Objetivos de la directiva | ✅ Hecho | `src/sim/objectives.ts`, `career.ts` (`objectivesBonus`), `nextSeason.ts`, `hubs.ts` |
| 4.1 Más cámaras | ✅ Hecho | `map3d.ts` (`MORE_CAMS`, `camList`, `setCamera`), `sessionView.ts` |
| 4.2 Rótulos de tele | ✅ Hecho | `sessionView.ts` (`tvTick`, `tvShow`), `style.css` |
| 5.1 Niveles de detalle | ✅ Hecho | `map3d.ts` (`propBuilder`, `propLod`, manzanas, árboles), `car3d.ts` (`carMinGeometry`) |
| 5.2 Nubes y lluvia | ✅ Hecho | `map3d.ts` (cielo: `cloudSides`, `updateStorm`; `uDrops`; spray `aSpl`), `car3d.ts` (`DROPS_GLSL`), `audio.ts` (`thunder`) |
| 5.3 Hora del día | ✅ Hecho | `map3d.ts` (`winOn`, `uCity`, `townLights`, caja de sombras) |
| 11.3 Fachadas y arquitectura | ✅ Hecho | `map3d.ts` (`roomAt`, `B.fine`, `roofTop`, `CITY_GABLE`/`CITY_TOP`, `RMODE 8`) |
| 11.5 Boxes y lluvia | ✅ Hecho | `map3d.ts` (`GANTRY_GEO`, `GLIT_MAT`, `SPRAY_MAT`, `shafts`, `TV_CAMS`) |

**Los bloques 1 a 7 están hechos.** Ideas sin hacer, al final de cada tarea.

Además, fuera de los bloques 1 a 5, están hechos el **Bloque 6 · Competición** (adelantamientos, salida e IA de
carrera y clasificación) y el **Bloque 7 · Motor de simulación** (banco de realismo, neutralizaciones, sanciones,
daños, defender, averías con aviso, paradas, carácter de los pilotos y vuelta de formación): ver al final.

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

### 3.1 Calendario más largo (G) · ✅ Hecho

Hecho (noviembre de 2026):
- Calendario **completo** de 2026 tal como es (23 carreras: Baréin y Arabia Saudí se cancelaron y el GP de Baréin se
  corrió en Sepang) junto al **corto** de siempre: se elige en el inicio (`Prefs.calendario`) y la temporada guarda el
  suyo (`calendar`) y el formato de los fines de semana que no corren con el de su circuito (`formatos`: Silverstone
  sprint, Interlagos normal). `circuitOf(s, id)` da los datos del circuito para esa temporada; el horario del otro
  formato va en `horarioOtro` y los fines de semana de jueves a sábado (Bakú, Las Vegas), en `dias: "JVS"`.
- 15 circuitos nuevos con `python3 scripts/nuevos.py <caché>`: TUM donde está y es el trazado actual (Shanghái,
  Montreal, Barcelona, Spielberg, Hungaroring, Zandvoort, Austin, México); bacinger en el resto (Melbourne y Yas
  Marina porque los de TUM son de antes de sus reformas; Miami, Madrid, Bakú, Las Vegas y Lusail). Después,
  `relieve.py <caché> <ids>` y, en los urbanos (Bakú y Las Vegas), `entorno.py <caché> <ids>` (`SEA`: el Caspio está a
  −27 m). Poles reales de 2026 (las de Las Vegas, Catar y Abu Dabi, estimadas) y umbral calibrado con `calibra.ts`.
- En una temporada larga el desarrollo se reparte (`devRounds`: rivales y presupuesto dan lo mismo en la temporada) y
  el cupo de unidades de potencia sube (`quotaFor`: 5 para 23 carreras; `PuState.quota`).
- Sin hacer: el clima, la pérdida en boxes, la carga, la abrasividad y los adelantamientos de los nuevos son
  estimaciones propias (lo dice cada «fuente»); faltan Yeda y Sakhir en el completo (cancelados en 2026); Imola,
  Portimão y otros no están.

Lo que decía la tarea:
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

### 3.4 Varias temporadas seguidas (G) · ✅ Hecho

Hecho (noviembre de 2026):
- Al acabar: «Empezar la temporada 2027» → `offSeasonScreen` (resumen, objetivos y presupuesto, tus pilotos con
  contrato que acaba: renovar o cambiar por uno libre) → `buildNextSeason` → `nav.nextSeason` (misma partida).
- `career.ts` (`offSeason`): edad (`ageStep`), retiradas (`retireChance`), renovaciones según el coche, traspasos a
  equipos mejores, novatos inventados (`rookie`) y regresión del coche (`CAR_CARRY` = 0,65). Noticias del mercado
  al empezar (`newsPanel`) y temporadas anteriores (`historyPanel`).
- `SeasonState`: `year`, `grid` (equipos del año), `misPilotos` y `carry` («crear equipo»), `pool`, `contracts`,
  `history`, `news`, `devBonus`, `aviso`, `trueSeed` (los valores ocultos no cambian de un año a otro). Las de antes
  son 2026 y siguen igual.
- `npx tsx scripts/temporadas.ts [n] [semilla] [equipo|propio] [--completo]`: varias temporadas sin correr carreras.
- Después: fichajes con contrato en vigor pagando la cláusula (`clauseFor`: la mitad de lo que le queda por cobrar),
  tuyos y de otros equipos; salarios (`salaryFor`, `SeasonState.salaries`), que en «crear equipo» ocupan el techo
  desde la segunda temporada (`devContext`); la parrilla real de F2 de 2026 en el mercado (`serie: "F2"`) y una
  cantera que se renueva (`f2Newcomer`, cuatro jóvenes inventados al año).
- Cambios de piloto a mitad de temporada (`SeasonState.swaps`, `SeatSwap`): lesiones tras un accidente, destituciones
  de la IA (`midSeason` en career.ts, `applyMidSeason` al acabar cada carrera) y los tuyos entre carreras (`swapSheet`).
  `gridOf` aplica los cambios por ronda y el mundial cuenta por persona (`personId`: el asiento si lo lleva ahora, o
  1000 + el cambio en el que salió; `who`, `person`, `whoAt` en data.ts); constructores, por asiento.
- Sin hacer: los contratos reales de 2026 (son una estimación). Cambiar de jefe, técnico o motor y el despido, hechos
  en el Bloque 13.

Lo que decía la tarea:
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

### 3.5 Objetivos de la directiva (P) · ✅ Hecho

Hecho: los objetivos escalan con la longitud del calendario, y al acabar suben (6 M por objetivo cumplido) o bajan
(5 M por fallado) el presupuesto de desarrollo del año siguiente (`objectivesBonus`, `SeasonState.devBonus`); dos
temporadas seguidas sin cumplir ninguno, aviso de que el jefe de equipo peligra (`aviso`).

Lo que decía la tarea:
- Hecho: `objectivesFor` pone dos al abrir la temporada según el puesto del coche en la parrilla de salida (agarre,
  potencia y resistencia): constructores (top 2: su puesto; resto: uno más) y, según el nivel, 2 victorias,
  2 podios, puntuar en 5 carreras o puntuar en 2. Panel en la pantalla de temporada con su progreso (cumplido, ya
  no se puede, vas bien o por ahora no llegas) y un mensaje de la directiva al acabar.
- Hecho después (con 3.4 y el Bloque 13): cumplirlos da más presupuesto la temporada siguiente y fallarlos lo reduce;
  a la segunda temporada sin cumplir ninguno, aviso, y a la tercera, despido.

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

Esta lista está reordenada, con medidas y con lo que falla, en el **Bloque 7**.

## Bloque 7 · Motor de simulación · ✅ Hecho (cambia resultados a propósito)

Todo en `src/sim/session.ts` (y algo de `strategy.ts`, `pitwall.ts`, `powerunit.ts`); el detalle para el jugador, en el
README («Neutralizaciones», «Sanciones», «Daños», «Pelear o no», «Averías que avisan», «Paradas», «Pilotos con carácter»
y «Vuelta de formación»). Se midió cada paso con `npx tsx scripts/realismo.ts --carreras=8` (o 10) y `--antes`.

| Tarea | Dónde | Cifras para retocar |
|---|---|---|
| 7.0 Banco de realismo | `scripts/realismo.ts`, `scripts/banco.ts`, `Session.stats` | márgenes en `METRICS` |
| 7.1 Neutralizaciones | `incident`, `deploy`, `yellow`/`yellowAt`, `lappedCars`, `restartGo`, `standingRestart`, `jumpTo` | `FAIL_LAPS` (powerunit), `CRASH_P`, probabilidades de `incident` |
| 7.2 Sanciones | `penalize`, `finishCar`, `trackLimits`, `stewards`, `probes` | `TL_P` |
| 7.3 Daños | `damageFloor`, `changeNose`, `wingLoss`; IA en `aiDecide` («alerón») | `KERB_P`, `NOSE_TIME` (strategy) |
| 7.4 Defender / no pelear | `fightMode`, `overtakeCheck`, `passOutlook` | `DEFEND_T` |
| 7.5 Averías con aviso | `fault`, `faultLap`, `faultRadio`; IA en `aiModes` | `FAULT_GROW`, `FAULT_ENGINE`, `FAULT_PUSH`, `FAULT_SIGNS` |
| 7.6 Paradas | `enterPit`, `pitStep`, `moveCar` (entrada) | `PIT_REACT`, `PIT_MODE_T`, `PIT_MODE_P`, `UNSAFE_P` |
| 7.7 Carácter y formación | `greenness`, `shake`, `conf`, `formationLap`, `RIVALS` | `CONF_PACE`, `FORMATION_GAIN` |

Cómo quedó el banco (10 carreras por circuito, en seco y con clasificación): carreras con coche de seguridad 26 → 50 %,
con virtual 18 → 45 %, neutralizadas 41 → 73 %, bandera roja 4 → 9 %, abandonos 0,8 → 1,6 por carrera, sanciones 0 →
1,1, gana el de la pole 34 → 39 %; los adelantamientos siguen en el objetivo (1,00) y no ha hecho falta recalibrar.
Lo único fuera de margen es la dispersión de los adelantamientos (0,36 frente a 0,35), por mezclar estrategias de una
y dos paradas.

Notas para quien siga:
- Las instantáneas a mitad de sesión guardan solas los campos nuevos (`snapshot.ts` copia todo lo que no es una
  referencia); las de antes, al cargarlas, los dejan en su valor por defecto.
- Los pilotos tienen ahora `nacimiento` y `debut` en `data/equipos-2026.json` y `mercado-2026.json`; `Session` recibe
  `year` del fin de semana (`WeekendState.year`) para saber quién es novato.
- Idea sin hacer: la vuelta de formación con frenos fríos. (La penalización en la parrilla siguiente, las banderas
  azules ignoradas y la salida parada tras bandera roja con lluvia, hechas en el Bloque 13.)

### El análisis de partida

Análisis de noviembre de 2026, leyendo `session.ts`, `strategy.ts` y `tyres.ts` y corriendo 16 carreras en seco:
`npx tsx scripts/carrera.ts <circuito> 4 1 --detalle` en Mónaco, Monza, Silverstone y Suzuka.

#### Lo que se midió

| Circuito | Adelantamientos (real) | Pasa en una vuelta con 1–1,5 s de ventaja | Atascado 3+ vueltas tras el mismo | Paradas 1 / 2 / 3 |
|---|---|---|---|---|
| Mónaco | 24,5 (8,8) | 3 % | 63 por carrera | 42 / 37 / 5 |
| Monza | 133 (47) | 40 % | 59 | 77 / 6 |
| Silverstone | 53,5 (34,5) | 23 % | 49 | 63 / 19 |
| Suzuka | 92,5 (40,5) | 34 % | 37 | 47 / 38 |

- Que haya más adelantamientos que en la realidad es a propósito (`calibra.ts` apunta a 2,4 veces la media real).
- **Pocas neutralizaciones:** en 16 carreras, 5 coches de seguridad, 4 virtuales y ninguna bandera roja (en la
  realidad, coche de seguridad más o menos en una de cada dos). Es lo que más decisiones da al muro.
- **Mucha dispersión:** en Suzuka una carrera tuvo 164 adelantamientos y otra 62. En la de 164 se pasan de 3 a 9
  coches por vuelta toda la carrera, sin incidentes, por mezclar estrategias de una y dos paradas.
- **Trenes:** de 37 a 63 veces por carrera un coche pasa 3 vueltas o más detrás del mismo, y el jugador no tiene
  nada para hacer frente a eso.
- Abandonos: unos 1,1 por carrera (18 en 16).

#### Lo que fallaba o estaba a medias

- **El daño en el fondo no existe:** `c.floor` se lee en `msTime` (agarre) y en `onLeaderLap` (averías), pero nunca
  se le da valor; siempre es 0.
- **Los toques no tienen culpable:** en `contact()` el alerón dañado es siempre el del que ataca, y no hay sanciones.
- **En carrera no hay límites de pista:** solo se anulan vueltas en libres y clasificación (`onMsEnter`).
- **Banderas azules:** solo cuestan al doblado (de 0,2 a 0,6 s en `overtakeCheck`); el que dobla no pierde nada.
- **Coche de seguridad:** dura de 3 a 5 vueltas al azar (`deploy`), sea cual sea el accidente o dónde quede el
  coche. Los doblados no se desdoblan y la relanzada es solo una bandera verde.

#### Tareas, por orden (todas hechas)

**7.0 Banco de realismo (P) · primero.** Casi todo lo que sigue cambia resultados y `carrera.ts` solo mide
adelantamientos. Ampliarlo (o un `scripts/realismo.ts`) para que saque por circuito, con márgenes de referencia:
coches de seguridad, virtuales y banderas rojas por carrera, abandonos, reparto de paradas, cuántas gana el de la pole,
diferencia del 1.º al 10.º y dispersión de los adelantamientos. Cada PR del bloque enseña el antes y el después.

**7.1 Neutralizaciones creíbles (M).** Junta los puntos 2 y 3 de la lista del Bloque 6 y la calibración:
- más incidentes, hasta acercarse a un coche de seguridad cada dos carreras;
- duración según lo grave que sea y dónde quede el coche (escapatoria o en la trazada);
- doble amarilla en carrera y banderas amarillas por sector en clasificación (vuelta estropeada al que pasa por ahí);
- doblados que se desdoblan y relanzada que marca el líder.

**7.2 Sanciones con culpable (M), con 7.1 en el mismo PR o justo después** (punto 1 del Bloque 6). En `contact()`
se decide quién tiene la culpa según quién ataca y lo agresivo que es cada uno. Sanciones de 5 o 10 s por causar un
toque, por límites de pista en carrera (con bandera blanca y negra antes) y por salir de boxes de forma insegura. Se
cumplen en la parada o se suman al final: decisión nueva para el muro (cumplirla ahora o aguantar).

**7.3 Daños que se quedan (P/M).** Dar valor a `floor` con bordillos, toques y salidas de pista: el coche pierde
X s/vuelta y avería más. El ingeniero lo dice por radio y el jugador decide si para (hoy el morro se cambia solo,
cuando `wing > 0.012`, en `enterPit`).

**7.4 «Defender» y «no pelear» por piloto (P)** (punto 5 del Bloque 6). `passOutlook` ya da la ventaja y la
probabilidad de pasar: sale barato y responde a los trenes medidos arriba.

**7.5 Averías con aviso (M)** (punto 7). `puHazard` ya existe: faltan síntomas antes de la avería (temperaturas,
presión) y poder llegar a meta bajando el motor.

**7.6 Paradas con más juego (P/M)** (punto 8): pedir la parada tarde y no llegar, paradas que salen mal al parar los
dos coches seguidos, y la salida insegura enlazada con 7.2.

**7.7 Pilotos con carácter y vuelta de formación (M)** (puntos 6 y 4). Se notan menos.

Para cada tarea: azar solo con `this.rng`/`fork()`, volver a calibrar si cambian los adelantamientos (`calibra.ts`)
y decir en el PR que cambia resultados.

## Hecho después de los bloques (noviembre de 2026)

- **Abandonos:** unos 3 por carrera (`FAIL_LAPS` 540 con la fiabilidad del equipo a la 2,5, `CRASH_P` 0,11; tres de
  cada cuatro averías leves acaban en el garaje). El banco pide ahora de 2,8 a 4,5.
- **Umbrales con la clasificación:** todos los circuitos recalibrados con `calibra.ts --clasif` (la parrilla sale de
  correr la clasificación, como en el juego y en `realismo.ts`). Banco final (25 circuitos × 6 carreras): coche de seguridad
  52 %, virtual 50 %, bandera roja 7 %, abandonos 3,0, sanciones 1,0, gana el de la pole 35 %, adelantamientos 0,76
  del objetivo: todo dentro de margen. Mónaco (0,43) y Hungaroring (0,58) siguen algo bajos: `calibra.ts` mide con una
  sola semilla (101) y sin la primera vuelta; con más carreras (`--carreras=10`) afinaría.
- **Mercado:** F2 de 2026, cantera, cláusulas y salarios (ver 3.4).

- **Cambios de piloto a mitad de temporada:** lesiones, destituciones y los tuyos (ver 3.4).

Lo que queda, arriba del todo («Lo que queda»).
