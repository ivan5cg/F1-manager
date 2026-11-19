# Guía: preparar un monoplaza 3D gratuito en Blender

El juego ya incluye un cargador automático de `.glb` comprimidos con **Draco** en `public/assets/models/` (usando el decodificador local de `public/draco/`, compatible con el modo sin conexión). Mientras no pongas un modelo propio, usa la geometría integrada con ruedas detalladas, discos incandescentes y volante a bordo.

## 1. Dónde conseguir un modelo gratuito (0 €)

1. Entra en [Sketchfab](https://sketchfab.com/search?q=formula+1+2026&type=models) y activa los filtros **Downloadable** y licencia **CC Attribution** (`CC-BY`) o **CC0**.
2. Descarga en formato **`.glb`**, **`.gltf`** o **`.fbx`**.
3. Si la licencia es `CC-BY`, añade el nombre del autor y el enlace en la sección `## Fuentes` de `README.md`.

## 2. Cómo nombrar las piezas en Blender para mantener tus libreas

El cargador (`extractCarFromGltf` en `src/ui/car3d.ts`) lee el nombre de cada malla (o de su material) e inyecta automáticamente la librea, los patrocinadores de los 11 equipos (y *Crea tu equipo*), la fibra de carbono y el daño del alerón delantero:

| Qué es la pieza | Palabras clave en el nombre (en español o inglés) | Cómo la pinta el juego |
|---|---|---|
| **Carrocería principal** | cualquier otro nombre (p. ej. `pintura_chasis`, `pontones`, `tapa_motor`) | Librea dinámica del equipo + barniz + gotas de lluvia |
| **Segundo color** | `acento`, `accent`, `secundario`, `stripe`, `franja` | Segundo color del equipo |
| **Alerón delantero** | `aleron_del`, `front_wing`, `frontwing`, `ala_del` | Librea + se descuelga al romperse y desaparece al cambiar el morro |
| **Fibra de carbono** | `carbono`, `carbon`, `suelo`, `floor`, `difusor`, `halo`, `susp`, `cockpit`, `escape` | Tejido de fibra de carbono 2×2 satinado |
| **Casco del piloto** | `casco`, `helmet`, `driver`, `piloto` | Blanco mate |
| **Luz de lluvia trasera** | `luz`, `rain_light`, `taillight`, `brake_light` | Luz roja parpadeante en lluvia (y reflejo en asfalto mojado) |
| **Rueda** | `rueda`, `wheel`, `tyre`, `tire`, `rim`, `llanta` | Se separa como malla de rueda (pon `rueda_base` en una para exportar `wheel.glb`) |

## 3. Exportar automáticamente sin Blender (opción rápida)

Si no tienes Blender instalado y el `.glb` descargado viene en una sola malla o con cientos de miles de triángulos, puedes prepararlo directamente desde la raíz del proyecto con Node + Python:

```bash
python scripts/prepara_coche_glb.py ruta/al/coche.glb
```

Este script detecta las ruedas y las descarta (para mantener los compuestos, radios y discos incandescentes del juego), alinea la batalla, simplifica por debajo de 14.000 triángulos, separa carrocería/carbono/alerón delantero/casco/luz trasera, comprime con **Draco** en `public/assets/models/f1.glb` (fina, para los coches cerca de la cámara) y `f1_lo.glb` (ligera, ≤ 3.800 triángulos, para el resto de la parrilla y la calidad baja) y actualiza `public/assets/models/manifest.json` (añade `--voltear` si quedara al revés).

## 4. Exportar automáticamente con Blender

1. Instala [Blender 4.x](https://www.blender.org/download/) (gratuito).
2. Renombra tus piezas según la tabla anterior (si el coche venía en una sola malla, en Modo Edición selecciona los triángulos del suelo/halo/ruedas y pulsa `P → Selection` para separarlos).
3. Ejecuta desde la raíz del proyecto:
   ```bash
   blender -b tu_coche.blend --python scripts/blender_prepara_coche.py
   ```
   O directamente desde un `.glb` o `.fbx` descargado (añade `--voltear` si el morro queda mirando hacia atrás):
   ```bash
   blender -b --python scripts/blender_prepara_coche.py -- descarga/coche.glb
   ```
4. El script escala el coche a **5,60 m**, lo orienta hacia **`+X`**, reduce triángulos a ≤ 14.000 si hace falta para que siga yendo fluido en móvil, exporta `public/assets/models/f1.glb` (y `wheel.glb` si hay rueda) con **Draco** y actualiza `public/assets/models/manifest.json`.

## 5. Comprobar el resultado

1. Ejecuta `npm run dev` y abre:
   - `http://localhost:5173/poc3d/prueba.html?c=monza&q=3&v=cerca` para verlo de cerca en pista.
   - **Crea tu equipo** en la pantalla inicial para probar la vista previa girando con tus colores y patrocinadores.
2. Si quieres volver al coche integrado en cualquier momento, deja `"car": null` y `"wheel": null` en `public/assets/models/manifest.json`.
