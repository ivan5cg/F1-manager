# Plan de mejoras 3D, UX y PWA · Muro de Boxes

Plan sucesor de `PLAN-MEJORAS.md` centrado en llevar el mapa 3D, la experiencia táctil en móvil vertical y la robustez como PWA sin conexión al siguiente nivel, respetando el presupuesto de memoria, batería y tamaño inicial.

Tamaño: **P** pequeño (un PR corto), **M** medio, **G** grande (varios PR).

## Reglas para quien lo haga

- **Móvil en vertical (`portrait`) primero:** toda la interfaz de sesión, hojas y controles del 3D se diseñan para usarse cómodamente a una mano o dos pulgares en pantalla estrecha vertical. No mantener un segundo diseño horizontal/escritorio.
- **Todo en español:** textos, comentarios, etiquetas y mensajes de commit con el estilo claro del proyecto (sin jerga técnica innecesaria).
- **La simulación no puede cambiar de resultados.** Comprobar antes y después con `npx tsx scripts/finde.ts silverstone 42 --resumen` y `npx tsx scripts/finde.ts monaco 42 --resumen`.
- **Presupuesto PWA y rendimiento 3D:** mantener el shell mínimo precacheado en `sw.js` y cargar bajo demanda todo recurso específico de circuito (`env-tracks/<id>.json` ~15 KB y hitos `landmarks/<id>/*.glb` optimizados con Draco + WebP 512px, <300 KB por hito y ~3–6k triángulos), sin subir llamadas de dibujo ni triángulos en las calidades 0 y 1 respecto a `PLAN-MEJORAS.md`.
- **Verificación en cada bloque:** `npm run check`, `npx vite build`, `poc3d/prueba.html` con Playwright (`shot.cjs`) y actualización del `README.md` y de la tabla de estado de este archivo.

## Estado

| Bloque | Estado | Dónde está |
|---|---|---|
| 1. Cimientos PWA, peso y robustez 3D móvil | ✅ Hecho | `sw.js`, `manifest.webmanifest`, `src/ui/pwa.ts`, `map3d.ts`, `car3d.ts`, `store.ts`, `sessionView.ts`, `hubs.ts` |
| 2. Control 3D interactivo, realización TV y HUD móvil vertical | ✅ Hecho | `map3d.ts`, `sessionView.ts`, `store.ts`, `style.css` |
| 3. Ergonomía táctil y sensación de app móvil | ✅ Hecho | `common.ts`, `sessionView.ts`, `store.ts`, `style.css` |
| 4. Realismo 3D dinámico y capas tácticas | ✅ Hecho | `map3d.ts`, `car3d.ts`, `sessionView.ts`, `store.ts`, `style.css` |
| 5. Identidad visual de los 24 circuitos en 3D | ✅ Hecho | `src/ui/trackVisuals.ts`, `src/ui/landmarks.ts`, `map3d.ts`, `scripts/entorno.py`, `scripts/optimiza_hito_glb.py`, `scripts/colab_genera_hitos.ipynb`, `public/assets/env-tracks/`, `public/assets/landmarks/` |

---

## Bloque 1 · Cimientos PWA, peso y robustez 3D móvil

### 1.1 Entornos 3D bajo demanda sin alterar la simulación (M) · ✅ Hecho
- Extraída la rejilla `"entorno"` de `data/circuitos/{monaco,singapur,baku,lasvegas}.json` (reducidos a `4865`, `4199`, `3628` y `3919` B) a `public/assets/env-tracks/<id>.json` (`14 701`, `13 912`, `13 840` y `20 908` B, con `"tipo": "urbano"`), dejando `"urbano": true` para la simulación (`src/sim/session.ts`, `src/sim/setup.ts`) y la previa (`src/ui/ritual.ts`).
- `loadTrackEnv(id)` en `src/ui/map3d.ts` descarga bajo demanda y cachea en memoria el entorno solo al abrir el 3D de esos circuitos (`sessionView.ts` y `poc3d/prueba.ts`). Bundle inicial `index`: `911,51 → 851,74 kB` (`312,89 kB` gzip) y `simWorker`: `487,30 → 424,10 kB`.
- Actualizado `scripts/entorno.py` para escribir en `public/assets/env-tracks/<id>.json` (con opción `--semiurbano`).
- Verificado determinismo idéntico con `npx tsx scripts/finde.ts silverstone 42 --resumen` y `monaco 42 --resumen`.

### 1.2 Limpieza Draco, `safety.glb` y banderas SVG pesadas (P/M) · ✅ Hecho
- Exportado `createDracoGltfLoader()` en `src/ui/car3d.ts` (reutilizado en `src/ui/map3d.ts`) usando imports `?url` de Vite sobre `draco_wasm_wrapper.js` y `draco_decoder.wasm` de `three/addons` —en lugar de `DRACO_GLTF_CONFIG`, que fallaba en `vite dev` por `.vite/deps/`— y eliminado `public/draco/` redundante (`763 KB` menos).
- Comprimidos `public/assets/models/safety.glb` (`323 420 → 107 764` B) y `safety_lo.glb` (`73 684 → 32 008` B) con Draco manteniendo intactos los 11 nombres de malla y la escala (`29 759` triángulos verificados en Singapur `q=2`).
- Simplificados `public/assets/flags/es.svg` (`81 502 → 942` B) y `mx.svg` (`85 135 → 1069` B). Peso total final medido: `public/assets/` en `3,25 MB` (`3 405 471` B) y `public/` en `3,30 MB` (`3 455 717` B), frente a `3,59 MB` y `4,32 MB` iniciales.

### 1.3 Caché de modelos `.glb`, texturas WebP y HDRI entre sesiones (M) · ✅ Hecho
- Elevadas a nivel de módulo en `src/ui/map3d.ts` las cachés de plantillas GLB (`modScCache`, `modEnvTreeCache`, `modCrewCache`, `modYachtCache`), imágenes PBR WebP (`modTexImgCache`) y datos crudos HDRI (`modHdriRawCache`), creando por sesión solo sus envoltorios GPU para el `WebGLRenderer` activo y liberándolos en `dispose()` sin destruir las plantillas compartidas (`sharedGeo`/`sharedMat`).
- Verificada la 1.ª y 2.ª apertura del 3D en una misma sesión del navegador (Singapur Libres 1 → salir → volver a entrar) con `getError() === 0` y 0 errores de consola o red.

### 1.4 Recuperación ante `webglcontextlost` y modo ahorro de batería a 30 fps (M) · ✅ Hecho
- Listeners `webglcontextlost` y `webglcontextrestored` sobre el lienzo en `src/ui/map3d.ts` y temporizador de respaldo (`scheduleCtxFallback()`, 1,5 s visible) en `src/ui/sessionView.ts`: si el contexto sigue perdido, cambia limpiamente a 2D conservando `prefs.mapa3d`, muestra el aviso y sustituye `<canvas id="map3d">` tras `dispose()` para permitir reabrir el 3D con un contexto WebGL nuevo (`isContextLost() === false`, `getError() === 0` verificado vía `WEBGL_lose_context`).
- Añadido **«Ahorro de batería (30 fps)»** en Ajustes (`Prefs.ahorro3d` en `store.ts`, `#pahorro` en `sessionView.ts`, `gap3d = 32` ms y `minFps = 22` en `map3d.ts`), verificando persistencia en `localStorage` e indicador `(30)` en `#perf3`.

### 1.5 PWA nativa completa (M) · ✅ Hecho
- Generados iconos PNG nítidos (`icono-192.png` `8621` B, `icono-512.png` `23 654` B, `icono-maskable.png` `10 108` B y `apple-touch-icon.png` `4885` B) enlazados en `public/manifest.webmanifest` (`"orientation": "portrait"`) e `index.html`.
- Mejorado `public/sw.js`: *network-first* para navegación/HTML/manifest (con respaldo offline `./index.html` dentro de la caché de su versión `CACHE`) y *cache-first* acotado a `CACHE` para `/assets/` y recursos estáticos, activación por `"SKIP_WAITING"` y limpieza de cachés antiguas.
- Añadido `src/ui/pwa.ts` (`initPwa`, aviso `.updban` de nueva versión y botón descartable `#instgo` en `#instslot` de `src/ui/hubs.ts`). Verificados HTTP 200 en `vite preview` para manifest, los 4 PNG y `sw.js`.

---

## Bloque 2 · Control 3D interactivo, realización TV y HUD móvil vertical

### 2.1 Cámara 3D táctil: órbita, pellizco y doble toque (M) · ✅ Hecho
- Gestos táctiles y de ratón sobre `#map3d` (`bindMap3dInput()` en `src/ui/sessionView.ts` y `orbit`/`zoomBy`/`resetOrbit` en `src/ui/map3d.ts`) en *Circuito* y *Seguir*, con umbral de arrastre de 8 px para no interferir con la selección al tocar.
- El ángulo/zoom manual se mantiene tras soltar el dedo y se resetea suavemente con **doble toque** (o `dblclick`) y al cambiar de cámara.

### 2.2 Realización inteligente integrada en *Tele* (M) · ✅ Hecho
- Interruptor **«Auto-TV»** (`#cautotv`, `Prefs.autoTv`, activo por defecto en *Tele*) dentro del menú rápido `#campop`.
- Director automático con histéresis (`resolveTvShot()` en `src/ui/map3d.ts`, ~6,5–7,5 s por plano): grúa en la salida hasta curva 1, corte a *Pit-lane* en las paradas de tus pilotos y preferencia por incidentes y batallas rueda a rueda (< 0,4 s).

### 2.3 Controles compactos, menú rápido de cámaras y chips de pilotos (P/M) · ✅ Hecho
- Botones compactos arriba a la derecha: tocar **Cámara** (`#camb`) abre el menú rápido flotante `#campop` con las **8 cámaras** y el interruptor **Auto-TV** (donde se añadirán los interruptores de capas tácticas en el Bloque 4.4).
- Añadidos arriba a la izquierda los **chips rápidos** `#drvchips` para alternar el seguimiento entre tus dos pilotos a un toque sin solapes en móvil vertical (`390×844`).

### 2.4 Modo ampliado (`mapbig`) jugable con mini-torre (M) · ✅ Hecho
- Sobre el 3D ampliado (`#bighud`), mini-torre flotante `#minitower` (Top 3 + tus pilotos) tocable, y barra rápida `#bigbar` con acceso a pausa/seguir (`#bigpp`) y box/pilotos (`#bigbox`).
- Un toque en el fondo vacío del mapa oculta/muestra suavemente todo el HUD (`.hudclean`) para disfrutar del 3D limpio.

### 2.5 Etiquetas 3D tocables con posición y compuesto (P) · ✅ Hecho
- Etiquetas `.lbl3` tocables directamente (`pointer-events: auto`) y enriquecidas de cerca con posición (`P<n>`) y pastilla de compuesto (`S`/`M`/`H`/`I`/`W`), con límite superior (`y >= 30`) y recolocación anti-solape para no tapar chips ni solaparse.

---

## Bloque 3 · Ergonomía táctil y sensación de app móvil

### 3.1 Hojas inferiores animadas con cierre *swipe down* (P/M) · ✅ Hecho
- Animación fluida de entrada y salida en `sheet()` (`src/ui/common.ts`, clases `.open`/`.closing` en `src/ui/style.css`, respetando `prefers-reduced-motion: reduce`), tirador visual `.sheet-grip` en hojas no modales y gesto táctil de deslizar hacia abajo desde el tirador o la cabecera (con `scrollTop <= 2`) con umbral por distancia/velocidad y rebote elástico al cancelar.

### 3.2 Badges de alerta en los botones inferiores (P) · ✅ Hecho
- Badges discretos `.sbadge` en `.sidebtns` (`src/ui/sessionView.ts` y `src/ui/style.css`): `#bdg-wx` azul en **Radar** cuando la lluvia llega en menos de 10 min (`rainAlert.minH < 10`), `#bdg-muro` dorado en **Muro** cuando el estratega recomienda parar y no hay parada pedida, y `#bdg-rad` rojo con contador en **Radio** al recibir avisos importantes/míticos con la hoja cerrada (se limpia al abrir `radioSheet()`).

### 3.3 Vibración háptica discreta en Android (P) · ✅ Hecho
- Helper `haptic()` y patrones `HAPTIC` (`tap`, `light`, `start`, `pit`, `alert`) en `src/ui/common.ts`, controlados por `Prefs.haptica` (activo por defecto en `src/ui/store.ts`, interruptor `#phap` **«Vibración háptica»** en Ajustes).
- Conectado en `src/ui/sessionView.ts` a los semáforos de salida (independiente del silencio de audio), SC/VSC/bandera roja, confirmaciones de parada (Box, Muro y bandera roja) y toques clave de control.

---

## Bloque 4 · Realismo 3D dinámico y capas tácticas

### 4.1 Alerón trasero móvil (DRS/MO) y luz trasera ERS vs lluvia (M) · ✅ Hecho
- Marcado el flap superior del alerón trasero como `aPart = 2` tanto en el monoplaza procedural como en `extractCarFromGltf()` para `f1.glb`/`f1_lo.glb` (`src/ui/car3d.ts`).
- Empaquetados los 4 escalares por coche `(liv, dmg, drs, tail)` en un único atributo `vec4 aCarData` (`src/ui/car3d.ts` y `src/ui/map3d.ts`) para mantenerse bajo el límite WebGL de 16 atributos de vértice (13 en total).
- Apertura suave del flap (`+0,50 rad` alrededor de `(-2.60, 0.99)`) cuando `c.drs` está activo, y luz trasera (más su reflejo en asfalto mojado) diferenciando el parpadeo rápido de recarga ERS (~4,5 Hz, desfasado por coche) de la luz de lluvia (~1,5 Hz con base fija).

### 4.2 Micro-vibración de cámara a bordo (P) · ✅ Hecho
- Micro-vibración sutil en *A bordo* y *Alerón trasero* (`updateCamera()` en `src/ui/map3d.ts`) proporcional a velocidad, frenada fuerte, paso por pianos y salidas de pista; desactivada automáticamente en pausa, repetición, foto o con `prefers-reduced-motion: reduce`.

### 4.3 Sombras de vallas y reflejos en charcos (M) · ✅ Hecho
- Recorte alfa (`discard`) en el shader `PROP_DEPTH` (`DoubleSide`) para celosías y barandillas (`P == 7` y `P == 13`), proyectando sombras caladas en lugar de bloques opacos.
- Reflejo analítico de cielo, sol, nubes y resplandor nocturno (Fresnel de Schlick usando `skyU`) en los charcos y película de agua del asfalto mojado (`RMODE == 1`), sin coste cuando la pista está seca. *(La paleta de pianos por circuito pasa al Bloque 5.1.)*

### 4.4 Capas tácticas opcionales sobre el 3D (M) · ✅ Hecho
- Nueva sección **«Capas tácticas»** en el menú rápido `#campop` (`#cldrs`, `#clagua`, `#clghost` en `src/ui/sessionView.ts`, persistida en `Prefs.capas3d` de `src/ui/store.ts` y aplicada con `setLayers()` en `src/ui/map3d.ts`):
  - **Zonas DRS / Modo Adelantamiento:** cheurones verdes sobre las zonas activas de la era y resaltado ámbar en los puntos de frenada fuerte.
  - **Contraste de agua:** refuerza visualmente el carril seco frente al asfalto mojado.
  - **Fantasma de parada:** anillos 3D pulsantes sobre la pista sincronizados con el punto de reincorporación proyectado en carrera.
- Verificados `npm run check`, `npx vite build`, determinismo idéntico en `scripts/finde.ts` (Silverstone 42 y Mónaco 42) y 0 errores de consola/WebGL en Singapur (`q=2`, lluvia), Silverstone (`q=1`) y Mónaco (`q=2`).

---

## Bloque 5 · Identidad visual de los 24 circuitos en 3D

Objetivo: que cada uno de los 24 circuitos del calendario sea reconocible al primer vistazo (sin buscar fotorrealismo), combinando identidad a pie de pista, geografía real, estructuras singulares del trazado y 1–2 hitos icónicos bajo demanda por circuito.

### 5.1 Identidad a pie de pista: pianos, escapatorias pintadas y estilos urbanos (M) · ✅ Hecho
- Creado `src/ui/trackVisuals.ts` con perfiles visuales tipados para los 24 circuitos del calendario (`biome`, `kerbs`, `runoff`, `barrier`, `urban`, `floodlights`), conectado a `src/ui/map3d.ts` sin tocar la simulación ni añadir llamadas de dibujo ni triángulos en `q=0`/`q=1`.
- **Paleta de pianos propia** (2 o 3 colores vía `uKerbA/B/C` y `uKerbN`, además de `uBarA/B` en barreras): rojo/amarillo en Spa y Spielberg, verde/blanco/rojo en Monza y México, azul/blanco en Miami, Bakú y Yas Marina, azul/amarillo en Zandvoort, verde/amarillo/blanco en Interlagos, negro/blanco en Silverstone, granate/blanco en Lusail, rojo/blanco/azul en Austin, verde/blanco en Melbourne y rojo/blanco/verde en Hungaroring.
- **Escapatorias de asfalto pintado** (`RMODE == 9` con franjas paralelas o diagonales anti-aliasing y respuesta al agua) en circuitos modernos (Yas Marina azul, Austin azul/rojo, Miami turquesa, México verde, Baréin, Lusail granate, Barcelona ocre, Madrid, Spielberg, Shanghái, Hungaroring y Montreal), manteniendo grava clásica rastrillada en los tradicionales.
- **Estilos urbanos diferenciados** (`urban: "mediterraneo" | "bahia" | "neones" | "piedra"`): Las Vegas con fachadas oscuras de hotel-casino, molduras de neón, marquesinas doradas y pantallas LED animadas (`P = 15`); Bakú con fachadas de piedra caliza tallada y arcos (`P = 16`) combinadas en una sola llamada de dibujo (`cityMat(16)`) con torres modernas de cristal (`P = 6`); Mónaco mediterráneo en ladera y Singapur bahía de rascacielos.
- Verificados `npm run check`, `npx vite build`, determinismo en `scripts/finde.ts` y 0 errores de consola/WebGL en Yas Marina, Austin, Monza, Spa, Las Vegas y Bakú.

### 5.2 Entornos geográficos reales en los 24 circuitos (M) · ✅ Hecho
- Separado el trazado urbano de competición (`tr.def.urbano`, muros pegados y calles) del entorno visual (`tipo: "urbano" | "semiurbano" | "circuito"`) en `src/ui/map3d.ts`, y habilitado `loadTrackEnv(id)` bajo demanda para los 24 circuitos (`ENV_TRACK_IDS` en `src/ui/trackVisuals.ts`).
- Ampliados `scripts/entorno.py` y `src/ui/map3d.ts` con soporte para máscaras de agua interior y costera (`"agua"` en base64 de ~0,9 KB + `"aguaNivel"` en metros, con limpieza de ruido DEM y margen de seguridad alrededor del asfalto): lago de Albert Park y bahía en **Melbourne**, río San Lorenzo y Bassin Olympique rodeando Île Notre-Dame en **Montreal**, embalse Guarapiranga en **Interlagos**, puerto y canales de **Yas Marina** (con yates amarrados vía `vis.yachts`) y costa del Mar del Norte en **Zandvoort** (sin inundar los pólderes interiores), omitiendo la malla de agua cuando no hay lámina en el entorno.
- Generados los 20 `public/assets/env-tracks/<id>.json` restantes, completando los **24 circuitos** (`401,1 KB` en total, ~10–25 KB cada uno cargados solo al abrir ese GP), con montañas y valles reales (Spielberg hasta 1066 m, Spa 544 m, Hungaroring 317 m, Madrid, México, Barcelona, Austin, Suzuka, etc.).
- Verificados `npm run check`, `npx vite build`, determinismo idéntico en `scripts/finde.ts` (Silverstone 42 y Mónaco 42) y 0 errores de consola/WebGL/red en Melbourne, Montreal, Spielberg, Zandvoort y Yas Marina.

### 5.3 Estructuras especiales del trazado (M/G) · ✅ Hecho
- **Túnel de Mónaco (`vis.tunnel`):** galería curva de 340 m tras Portier (`s = 1560..1900 m`) construida en `propBuilder()` (`src/ui/map3d.ts`) sin llamadas de dibujo extra, con pared maciza del lado de la ladera, columnata abierta con pilares hacia el mar, doble fila de luces de techo (`P = 10`), paseo superior, embocaduras en entrada/salida, ensanchado automático con `uW` en la vista general y cámara *Seguir* que se agacha suavemente dentro del túnel.
- **Puente del cruce en «8» de Suzuka (`vis.overpass`):** separación vertical real entre el paso superior (`s = 4919 m`, `+4,4 m`) y el inferior (`s = 2549 m`, `-2,6 m`), recogida del talud de hierba en el vano para dejar libre el paso inferior, tablero cajón de hormigón con vigas laterales, pretiles, barandillas caladas (`P = 13`), estribos y pilares anclados en `sUnder` que se abren con `uW` para no invadir la pista de abajo.
- **Peraltes visibles (`vis.bankings`):** inclinación transversal (*banking*) sin triángulos ni llamadas de dibujo extra (empaquetada en `vec4 aGeo` en `RIB_VB` para mantener las cintas en 13 atributos WebGL) en **Zandvoort** (Hugenholtzbocht T3 ~19° y Arie Luyendykbocht T14 ~18°) y **Madrid** (*La Monumental* T12 ~22°), inclinando asfalto, pianos, escapatorias, barreras, altura/balanceo rígido de los monoplazas y horizonte de las cámaras *A bordo* y *Alerón trasero*.
- Verificados `npm run check`, `npx vite build`, determinismo idéntico en `scripts/finde.ts` (Silverstone 42 y Mónaco 42) y 0 errores de consola/WebGL/red en las 6 vistas de Mónaco, Suzuka, Zandvoort y Madrid.

### 5.4 Hitos icónicos `.glb` bajo demanda, placeholders y pipeline de Google Colab (G) · ✅ Hecho
- **Manifiesto de hitos de los 24 circuitos (`src/ui/landmarks.ts` + `public/assets/landmarks/manifest.json`):** 48 hitos emblemáticos (2 por GP: Noria de Suzuka, Torre COTA, The Sphere y Torre París, Marina Bay Sands y Singapore Flyer, Flame Towers y Torre de la Doncella, Hotel W Abu Dhabi, Hard Rock Stadium, Foro Sol, Biosphère, Toro de Spielberg, Casino de Montecarlo, Cubierta Hibisco de Sepang, etc.) con `(sFrac, side, dist, height, shape, color, accent, glow, prompt)` y recolocación segura fuera de la pista ensanchada y de las manzanas urbanas.
- **Cargador híbrido bajo demanda en `src/ui/map3d.ts`:** dibuja al instante siluetas procedurales ligeras (17 arquetipos en `buildLandmarkPlaceholder`, zócalo enterrado y brillo nocturno), consulta `public/assets/landmarks/manifest.json` sin generar peticiones 404 y, cuando un hito dispone de `.glb` (Draco), lo descarga bajo demanda, lo cachea entre sesiones (`modLandmarkCache`), normaliza su pivote al suelo (`y = 0`) y escala a `spec.height` sustituyendo el placeholder.
- **Pipeline para Google Colab y local:** notebook `scripts/colab_genera_hitos.ipynb` (GPU T4) y script CLI `scripts/optimiza_hito_glb.py` que deciman a ~3–6k triángulos, reducen texturas a WebP 512px, comprimen con Draco (<300 KB), normalizan `y = 0` y actualizan `public/assets/landmarks/manifest.json`.
- Verificados `npm run check`, `npx vite build`, sintaxis Python/JSON del pipeline, determinismo idéntico en `scripts/finde.ts` y 0 errores de consola/WebGL/404 en Suzuka, Austin, Las Vegas, Singapur, Bakú y Miami.

---

## Cómo usar Google Colab para añadir hitos `.glb` reales (qué hacer ahora)

Todos los circuitos ya se ven completos hoy gracias a las **48 siluetas procedurales ligeras** (`src/ui/landmarks.ts`). A partir de aquí puedes ir sustituyendo poco a poco los hitos que más te interesen por modelos `.glb` reales sin tocar una sola línea de código del juego:

### Paso 1 · Abrir el notebook en Google Colab con GPU
1. Entra en [Google Colab](https://colab.research.google.com/) y sube el archivo `scripts/colab_genera_hitos.ipynb` (*Archivo → Subir cuaderno*).
2. Activa la GPU gratuita: menú **Entorno de ejecución → Cambiar tipo de entorno de ejecución → GPU T4**.
3. Ejecuta la **celda 1** (instala `trimesh`, `fast-simplification`, `pillow` y `@gltf-transform/cli` para WebP + Draco).

### Paso 2 · Elegir hitos y generar o subir modelos brutos
1. En la **celda 2** revisa la lista `HITOS` (o añade cualquiera de los 48 hitos y *prompts* que están en `src/ui/landmarks.ts`).
2. En la **celda 3** tienes dos caminos:
   - **Opción A · Subir modelos ya creados (`MODO = "subir"`):** si generas los modelos en otra web (Meshy, Tripo3D, Hunyuan3D web, Blender, Sketchfab CC0…), nómbralos `<circuito>__<hito>.glb` (doble guion bajo, por ejemplo `suzuka__noria.glb`, `austin__torre_cota.glb`, `lasvegas__esfera.glb`) y súbelos cuando la celda te lo pida.
   - **Opción B · Generar en GPU dentro de Colab (`MODO = "hunyuan"`):** cambia `MODO = "hunyuan"` para instalar Tencent Hunyuan3D-2 en la GPU T4 y generar las mallas directamente desde una imagen de referencia o *prompt*.

### Paso 3 · Optimizar y descargar el paquete listo para la PWA
1. Ejecuta la **celda 4**: normaliza cada modelo (base apoyada en `y = 0`, centrado en `X/Z`, altura = `1 m`), decima a `~4 500` triángulos, reduce texturas a **WebP 512 px**, comprime con **Draco** (avisando si alguno pasa de `300 KB`) y crea `out_landmarks/manifest.json` y `landmarks.zip`.
2. Ejecuta la **celda 5** para descargar `landmarks.zip` a tu PC.

### Paso 4 · Colocar los `.glb` en el repositorio y probar
1. Descomprime `landmarks.zip` dentro de `public/assets/landmarks/` de modo que cada archivo quede en `public/assets/landmarks/<circuito>/<hito>.glb` (por ejemplo `public/assets/landmarks/suzuka/noria.glb`).
2. Asegúrate de que en `public/assets/landmarks/manifest.json` figure `"<circuito>/<hito>": true` dentro de `"glb"` (si vas añadiendo hitos en varias tandas, conserva las entradas anteriores en `manifest.json` en lugar de sobreescribirlo).
   - **Alternativa rápida en tu PC para un solo modelo:** si ya tienes un `.glb` o `.obj` en local, puedes ejecutar directamente:
     ```bash
     python scripts/optimiza_hito_glb.py ruta/al/modelo.glb suzuka noria
     ```
     Eso lo optimiza, lo guarda en `public/assets/landmarks/suzuka/noria.glb` y añade `"suzuka/noria": true` a `manifest.json` automáticamente.
3. Arranca `npm run dev` y compruébalo en `http://localhost:5173/poc3d/prueba.html?c=suzuka&q=2&v=general` (o entrando al GP en el juego): el juego descargará el `.glb` bajo demanda, lo escalará a `spec.height` y ocultará el placeholder automáticamente.
4. Si un hito queda ligeramente girado o desplazado, solo ajusta `rot`, `sFrac` o `dist` en `src/ui/landmarks.ts`, verifica con `npm run check && npx vite build` y haz commit + push a `main`.

### Orden recomendado para empezar (mayor impacto visual)
1. `suzuka/noria` (Noria de Suzuka) y `austin/torre_cota` (Torre COTA).
2. `lasvegas/esfera` (*The Sphere*) y `singapur/marina_sands` (Marina Bay Sands).
3. `baku/flame_towers` (Flame Towers) y `yasmarina/hotel_w` (Hotel W Abu Dhabi).
4. `spielberg/toro_acero` (Toro de Spielberg) y `miami/hard_rock_stadium` (Hard Rock Stadium).
