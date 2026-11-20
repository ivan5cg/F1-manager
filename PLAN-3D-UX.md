# Plan de mejoras 3D, UX y PWA · Muro de Boxes

Plan sucesor de `PLAN-MEJORAS.md` centrado en llevar el mapa 3D, la experiencia táctil en móvil vertical y la robustez como PWA sin conexión al siguiente nivel, respetando el presupuesto de memoria, batería y tamaño inicial.

Tamaño: **P** pequeño (un PR corto), **M** medio, **G** grande (varios PR).

## Reglas para quien lo haga

- **Móvil en vertical (`portrait`) primero:** toda la interfaz de sesión, hojas y controles del 3D se diseñan para usarse cómodamente a una mano o dos pulgares en pantalla estrecha vertical. No mantener un segundo diseño horizontal/escritorio.
- **Todo en español:** textos, comentarios, etiquetas y mensajes de commit con el estilo claro del proyecto (sin jerga técnica innecesaria).
- **La simulación no puede cambiar de resultados.** Comprobar antes y después con `npx tsx scripts/finde.ts silverstone 42 --resumen` y `npx tsx scripts/finde.ts monaco 42 --resumen`.
- **Presupuesto PWA y rendimiento 3D:** tope de **8 MB** en `public/assets/`, sin subir llamadas de dibujo ni triángulos en las calidades 0 y 1 respecto a `PLAN-MEJORAS.md`. Los recursos específicos de algunos circuitos (entornos, árboles por bioma) se cargan bajo demanda.
- **Verificación en cada bloque:** `npm run check`, `npx vite build`, `poc3d/prueba.html` con Playwright (`shot.cjs`) y actualización del `README.md` y de la tabla de estado de este archivo.

## Estado

| Bloque | Estado | Dónde está |
|---|---|---|
| 1. Cimientos PWA, peso y robustez 3D móvil | ✅ Hecho | `sw.js`, `manifest.webmanifest`, `src/ui/pwa.ts`, `map3d.ts`, `car3d.ts`, `store.ts`, `sessionView.ts`, `hubs.ts` |
| 2. Control 3D interactivo, realización TV y HUD móvil vertical | ✅ Hecho | `map3d.ts`, `sessionView.ts`, `store.ts`, `style.css` |
| 3. Ergonomía táctil y sensación de app móvil | ⬜ Pendiente | `common.ts`, `sessionView.ts`, `store.ts`, `style.css` |
| 4. Realismo 3D dinámico y capas tácticas | ⬜ Pendiente | `map3d.ts`, `car3d.ts`, `sessionView.ts` |
| 5. Circuitos semiurbanos y costeros en 3D | ⬜ Pendiente | `map3d.ts`, `scripts/entorno.py`, `public/assets/env-tracks/` |

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

### 3.1 Hojas inferiores animadas con cierre *swipe down* (P/M)
- Animación fluida de entrada/salida en `sheet()` (`src/ui/common.ts`) y gesto natural de deslizar hacia abajo desde la cabecera para cerrar hojas no modales.

### 3.2 Badges de alerta en los botones inferiores (P)
- Avisos visuales discretos en los botones `Radar` (lluvia prevista < 10 min), `Muro` (el estratega recomienda parar) y `Radio` (mensajes importantes sin leer).

### 3.3 Vibración háptica discreta en Android (P)
- Feedback táctil suave vía `navigator.vibrate` (semáforos de salida, coche de seguridad, confirmación de parada y toques clave), activable/desactivable en Ajustes (`Prefs.haptica`).

---

## Bloque 4 · Realismo 3D dinámico y capas tácticas

### 4.1 Alerón trasero móvil (DRS/MO) y luz trasera ERS vs lluvia (M)
- Animar la apertura del flap del alerón trasero cuando `c.drs` esté activo y distinguir el parpadeo rápido de recarga ERS de la luz fija/intermitente de lluvia.

### 4.2 Micro-vibración de cámara a bordo (P)
- Ligera vibración en *A bordo* y *Alerón trasero* proporcional a velocidad, frenada fuerte y paso por pianos (desactivada con `prefers-reduced-motion`).

### 4.3 Colores de pianos por circuito, sombras de vallas y charcos (M)
- Paleta de pianos propia por circuito (rojo/blanco, azul/blanco, verde/blanco, amarillo/negro, etc.).
- Sombras con recorte alfa (`customDepthMaterial` / `alphaTest`) en barandillas y celosías, y reflejo real del cielo en los charcos del asfalto mojado.

### 4.4 Capas tácticas opcionales sobre el 3D (M)
- Interruptores en el menú rápido del 3D para resaltar zonas de DRS/Modo Adelantamiento, contraste de línea seca vs mojada y fantasma de parada en pista.

---

## Bloque 5 · Circuitos semiurbanos y costeros en 3D

### 5.1 Modo semiurbano/costero en `map3d.ts` (M)
- Separar completamente el concepto de trazado urbano de competición (`urbano: true`, muros pegados y más SC) del entorno visual (`tipo: "semiurbano"`), manteniendo escapatorias de grava/hierba y vegetación abierta junto al agua, puertos o skyline real.

### 5.2 Entornos generados para Melbourne, Montreal, Miami, Yas Marina y Madrid (M)
- Generar con `scripts/entorno.py` los archivos `public/assets/env-tracks/{melbourne,montreal,miami,yasmarina,madrid}.json` con `tipo: "semiurbano"`, descargados solo bajo demanda al abrir el 3D de cada circuito.
