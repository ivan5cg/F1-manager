# Plan 3D v2 · Circuitos vivos y reconocibles (PWA + Three.js) · Muro de Boxes

Plan sucesor de `PLAN-3D-UX.md` enfocado en eliminar el aspecto de «cartón piedra» y llevar los circuitos 3D a un estilo **mánager moderno limpio y estilizado** (referencia: *Motorsport Manager* / *F1 Clash*), manteniendo la arquitectura actual en **PWA + Three.js** y sin alterar la simulación.

Tamaño estimado: **P** pequeño (1 PR corto), **M** medio, **G** grande (varios PR).

---

## Decisiones de diseño acordadas

- **Estilo visual objetivo:** Mánager moderno estilizado — colores ricos, terreno bien fundido en colinas/entornos reales, bosques densos, gradas y edificios con volumen arquitectónico reconocible e hitos claros, sin buscar fotorrealismo pesado.
- **Plataforma:** Seguir en **PWA + Three.js** (mismo código, simulación determinista intacta; empaquetado opcional con Capacitor/TWA en el futuro si se desea APK/Google Play).
- **Equilibrio de cámaras:** Calidad consistente tanto en vista aérea/media (`Circuito`, `Helicóptero`, `Seguir`) como en planos cercanos de realización (`Tele`, `A bordo`, `Pit-lane`, `Grúa de meta`).
- **Producción 3D:** **Kit modular reutilizable (~15–20 piezas)** generado por script (geometría arquitectónica nítida + texturas PBR limpias) combinado con los **hitos `.glb` generados por IA** (Hunyuan3D-2 en Colab) correctamente escalados, orientados e iluminados.
- **Presupuesto móvil escalable:** Descarga inicial ligera (`< 5 MB`), carga bajo demanda por GP (`~1–2 MB` combinando entorno, hitos y piezas modulares), manteniendo ligereza en `q=0/1` y priorizando aspecto espectacular a 60 fps en `q=2` en móviles Android modernos.
- **Estrategia de despliegue:** **Circuito piloto en Austria (`spielberg`, Red Bull Ring)** primero hasta validar el salto visual en el navegador/móvil; después, despliegue progresivo del mismo sistema y kit modular al resto de los 23 circuitos.

## Reglas para cada bloque

- **Móvil vertical (`portrait`) primero** y **todo en español**.
- **Simulación inmutable:** verificar determinismo antes/después cuando se toque cualquier archivo compartido (`npx tsx scripts/finde.ts silverstone 42 --resumen` y `npx tsx scripts/finde.ts monaco 42 --resumen`).
- **Verificación visual y técnica:** `npm run check`, `npx vite build`, 0 errores de consola/WebGL y comprobación visual en vista aérea (`Circuito`) y cámaras cercanas (`Tele`, `Seguir`, `Grúa de meta`).

---

## Estado

| Bloque | Estado | Alcance |
|---|---|---|
| 1. Piloto Austria · Terreno sin muros, bosques densos e hitos protagonistas | ✅ Hecho | `src/ui/map3d.ts`, `src/ui/landmarks.ts`, `src/ui/trackVisuals.ts` |
| 2. Piloto Austria · Kit modular arquitectónico + geometría real OSM (pit-lane, 9 gradas, bosques y grava) | ✅ Hecho | `scripts/entorno.py`, `public/assets/env-tracks/spielberg.json`, `src/ui/map3d.ts`, `src/ui/landmarks.ts`, `src/ui/trackVisuals.ts` |
| 3. Piloto Austria · Iluminación, atmósfera, materiales y cámaras TV (`Grúa de meta`, `Tele`) | ✅ Hecho | `src/ui/map3d.ts`, `src/ui/landmarks.ts` |
| 4. Despliegue a los 23 circuitos restantes por biomas y arquetipos | ✅ Hecho | `scripts/entorno.py`, `public/assets/env-tracks/*.json` (24 circuitos), `src/ui/trackVisuals.ts`, `src/ui/map3d.ts` |

---

## Bloque 1 · Piloto Austria: terreno, bosques densos e hitos protagonistas (M)

Objetivo: eliminar el efecto de «pista sobre muro/acantilado» en el Red Bull Ring, poblar las colinas de Estiria con bosques de coníferas densos y creíbles, y hacer que el **Toro de Spielberg** y el **Voestalpine Wing** se vean nítidos, bien posicionados y reconocibles desde cualquier cámara.

- **1.1 Taludes y fusión de terreno suave (`src/ui/map3d.ts`)**
  - Revisar cómo se funde la altura de la pista (`z(s)`) con la malla del terreno DEM (`env-tracks/spielberg.json`) en las zonas con mayor desnivel (subida curva 1→3 y bajada curva 3→5).
  - Ampliar y suavizar la banda de transición (falda/rampa con curva suave *smoothstep* en lugar de caída brusca) para que el terreno abrace la pista como una ladera natural verde y no como un muro gris/marrón vertical.
- **1.2 Bosques densos en masas de coníferas (`src/ui/map3d.ts`)**
  - Sustituir la dispersión de árboles diminutos aislados por **masas forestales agrupadas** alrededor del perímetro y colinas de Spielberg (en `q=2`, manteniendo presupuesto reducido en `q=0/1`), con variación natural de escala, altura y tono verde alpino para leer volumen de bosque tanto en vista `Circuito` como en `Tele`/`Helicóptero`.
- **1.3 Integración y presencia de los hitos de Austria (`src/ui/landmarks.ts`, `src/ui/map3d.ts`)**
  - Corregir posición, escala, rotación, apoyo sobre el terreno e iluminación de `spielberg/toro_acero.glb` (actualmente muy pequeño/oscuro en la ladera bajo curva 4) y `spielberg/voestalpine_wing.glb` (actualmente pegado/solapado con el extremo del edificio de boxes).
  - Asegurar que los materiales PBR de los `.glb` de hitos respondan bien al mapa de entorno/sol para que no queden negros o planos desde vista aérea.

---

## Bloque 2 · Piloto Austria: kit modular arquitectónico (G)

Objetivo: reemplazar los bloques grises planos por piezas modulares limpias con identidad de circuito de F1.

- **2.1 Generador por script de piezas modulares (`.glb` Draco + texturas PBR WebP)**
  - Crear script generador (Blender Python / Node+Three GLTFExporter) para producir un primer lote de piezas reutilizables:
    - Gradas estilizadas (recta y curva) con pilares, cubierta inclinada, graderío escalonado y textura/color de público.
    - Edificio de boxes modular con techo detallado, voladizo, persianas/garajes con volumen y torre de dirección de carrera.
    - Zona de paddock detrás de boxes: camiones/trailers de escudería, motorhomes, carpas de hospitalidad y vallado.
    - Pórtico de salida/meta, puentes peatonales/publicitarios sobre pista y puestos de comisarios.
- **2.2 Integración del kit modular en `src/ui/map3d.ts`**
  - Instanciar el kit modular en `q=1/2` (con *fallback* ligero en `q=0`) adaptado a la paleta y bioma de cada circuito en `trackVisuals.ts`.
  - Corregir orientación de caras/UVs en cartelería de vallas para evitar textos en espejo desde la cámara `Tele`.

---

## Bloque 3 · Piloto Austria: iluminación, atmósfera y pulido de cámaras (M)

Objetivo: dar cohesión visual tipo *Motorsport Manager / F1 Clash* y pulir el encuadre de todas las cámaras.

- **3.1 Iluminación, contraste y profundidad atmosférica**
  - Ajustar balance sol/luz hemisférica, intensidad de sombras y neblina atmosférica suave en el horizonte alpino para separar pista, bosque y montañas lejanas.
  - Añadir sombreado de contacto / oclusión sutil en la base de gradas, edificios y bordes de escapatoria.
- **3.2 Arreglo de cámaras en Austria**
  - Corregir la posición/altura de **`Grúa de meta`** para que no quede tapada por el edificio de boxes o la grada principal.
  - Afinar el encuadre de **`Tele`** para evitar que el coche seguido quede pegado al borde del encuadre en curvas rápidas.

---

## Bloque 4 · Despliegue a los 23 circuitos restantes (G)

Una vez validado Austria como estándar de referencia:
- Aplicar el suavizado de taludes y mejora de vegetación por bioma (alpino, bosque europeo, mediterráneo, desierto, costero, urbano) a los 24 circuitos.
- Colocar el kit modular (gradas, boxes, paddock, puentes) adaptado a cada trazado (`trackVisuals.ts`).
- Auditar y ajustar escala, posición e iluminación de los hitos `.glb` restantes en `src/ui/landmarks.ts`.
