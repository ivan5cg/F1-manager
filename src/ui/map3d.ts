// @ts-nocheck
// Mapa 3D de la sesión (WebGL, three.js). Se carga solo cuando el jugador pulsa «3D» en el mapa.
// Nació como prueba de concepto (poc3d/) y está portado casi tal cual, por eso va sin comprobación
// de tipos: quien lo use solo necesita createMap3d() y lo que devuelve.
//
// Qué sale de la simulación y qué es solo dibujo:
//  · de la simulación: posiciones, paradas, compuesto, agua en la trazada y fuera de ella, lluvia, nubes, hora y
//    percances (trompos, salidas de pista, bloqueos y accidentes, marcados en car.fx);
//  · de los datos del circuito: altitud («relieve»), anchura («ancho»), lado de los boxes («boxes.lado») y, en los
//    urbanos, el terreno de alrededor («entorno»: mar, puertos, ladera y altura de las torres);
//  · de la simulación también: bandera (amarilla, coche de seguridad, VSC, roja), líder y el estado de cada coche en
//    garaje y calle de boxes;
//  · solo dibujo: la trazada, el cabeceo y el balanceo, la parada (gatos, mecánicos, cambio de ruedas), cómo se ve cada
//    percance (humo, polvo, giro), escapatorias, árboles, edificios, gradas, libreas y patrocinadores (marcas inventadas).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { rainAt } from "../sim/weather";
import { BRANDS, FONT, SECOND, collect, skin, carGeometry, carMinGeometry, wheelGeometry, steerGeometry, liveryTexture, makeCarMaterial, makeWheelMaterial, loadCarAssets, createDracoGltfLoader } from "./car3d";
import { gearFor, rpmFor } from "./audio";
import { helmetDesign } from "./visual";
import { ENV_TRACK_IDS, getTrackVisual } from "./trackVisuals";
import { LANDMARKS, buildLandmarkPlaceholder } from "./landmarks";
import { createTrackKit } from "./trackKit";

const ASSET = (p) => `${import.meta.env.BASE_URL}assets/${p}`;

// Entornos 3D cargados bajo demanda (rejilla real de altitud y agua de cada circuito)
const envTrackCache = new Map();

/** Descarga y cachea el entorno 3D de un circuito si existe (null si no está o falla). */
export async function loadTrackEnv(id) {
  if (!ENV_TRACK_IDS.has(id)) return null;
  if (!envTrackCache.has(id)) {
    envTrackCache.set(
      id,
      fetch(ASSET(`env-tracks/${id}.json`))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return envTrackCache.get(id);
}

// Cachés compartidas entre sesiones (solo datos en CPU/plantillas; cada WebGLRenderer crea y libera sus propios recursos GPU)
const SC_COLORS = {
  pintura: [0.72, 0.74, 0.78], negro: [0.025, 0.025, 0.03], carbono: [0.05, 0.052, 0.058], metal: [0.55, 0.57, 0.6],
  llanta: [0.09, 0.095, 0.1], goma: [0.018, 0.018, 0.018], cristal: [0.02, 0.026, 0.034], rojo: [0.45, 0.015, 0.015],
  ambar: [0.9, 0.35, 0.02], acento: [0.6, 0.03, 0.03],
};
let modManifestCache = null, modLandmarkManCache = null, modGltfLoaderP = null, modScCache = null, modCrewCache = null, modYachtCache = null;
const modEnvTreeCache = new Map();
const modLandmarkCache = new Map();
const modKitCache = new Map();
const modTexImgCache = new Map();
const modHdriRawCache = new Map();
const modHdrLoader = new HDRLoader();

function modLoadManifest() {
  if (!modManifestCache) modManifestCache = fetch(`${ASSET("models/")}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return modManifestCache;
}
function modLoadLandmarkManifest() {
  if (!modLandmarkManCache) modLandmarkManCache = fetch(`${ASSET("landmarks/")}manifest.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return modLandmarkManCache;
}
/** Carga opcional de un vehículo/pieza .glb del kit modular registrado en models/manifest.json bajo "kit". */
function modLoadKitGlb(key) {
  if (!modKitCache.has(key)) modKitCache.set(key, (async () => {
    try {
      const man = await modLoadManifest();
      const file = man?.kit?.[key];
      if (!file) return null;
      const loader = await getSharedGltfLoader();
      const gltf = await loader.loadAsync(`${ASSET("models/")}${file}`);
      gltf.scene.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(gltf.scene);
      if (bb.isEmpty()) return null;
      const sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
      const targetH = key === "crane" ? 6.5 : key === "heli" ? 3.8 : 1.72;
      const sc = targetH / Math.max(0.05, sz.y);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = key !== "heli";
        o.receiveShadow = true;
        const m = o.material;
        if (m) {
          if ("envMapIntensity" in m) m.envMapIntensity = 1.45;
          if ("metalness" in m && typeof m.metalness === "number") m.metalness = Math.min(m.metalness, 0.55);
        }
      });
      const grp = new THREE.Group();
      gltf.scene.scale.setScalar(sc);
      gltf.scene.position.set(-ctr.x * sc, -bb.min.y * sc, -ctr.z * sc);
      grp.add(gltf.scene);
      return grp;
    } catch (e) { console.warn("kit .glb:", key, e); return null; }
  })());
  return modKitCache.get(key);
}
/** Carga bajo demanda y cachea entre sesiones un hito .glb (Draco), normalizado con base en y = 0 y altura = 1 m. */
function modLoadLandmarkGlb(trackId, lmId) {
  const key = `${trackId}/${lmId}`;
  if (!modLandmarkCache.has(key)) modLandmarkCache.set(key, (async () => {
    try {
      const man = await modLoadLandmarkManifest();
      if (!man?.glb?.[key]) return null;
      const loader = await getSharedGltfLoader();
      const gltf = await loader.loadAsync(`${ASSET("landmarks/")}${key}.glb`);
      gltf.scene.updateWorldMatrix(true, true);
      const raw = [], bb = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        g.computeBoundingBox();
        if (g.boundingBox) bb.union(g.boundingBox);
        const m = Array.isArray(o.material) ? o.material[0].clone() : o.material.clone();
        // Mejora de legibilidad PBR en hitos .glb (evita acabados metálicos demasiado oscuros desde vista aérea)
        if ("envMapIntensity" in m) m.envMapIntensity = 1.55;
        if ("metalness" in m && typeof m.metalness === "number") m.metalness = Math.min(m.metalness, 0.45);
        if ("roughness" in m && typeof m.roughness === "number") m.roughness = Math.max(0.32, m.roughness);
        if ("color" in m && m.color?.isColor && !m.map) {
          const lum = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
          if (lum < 0.18) m.color.lerp(new THREE.Color(0xd8dde4), 0.35);
        }
        raw.push({ geo: g, mat: m });
      });
      if (!raw.length || bb.isEmpty()) return null;
      const sz = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
      const invH = 1 / Math.max(0.01, sz.y);
      const norm = new THREE.Matrix4().makeScale(invH, invH, invH).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -bb.min.y, -ctr.z));
      for (const p of raw) { p.geo.applyMatrix4(norm); p.geo.computeBoundingSphere(); }
      return { parts: raw };
    } catch (e) { console.warn("hito .glb:", key, e); return null; }
  })());
  return modLandmarkCache.get(key);
}
function getSharedGltfLoader() {
  if (!modGltfLoaderP) modGltfLoaderP = createDracoGltfLoader().then(({ loader }) => loader);
  return modGltfLoaderP;
}
function modLoadSafetyCar() {
  if (!modScCache) modScCache = (async () => {
    try {
      const base = ASSET("models/");
      const man = await modLoadManifest();
      if (!man?.safety) return null;
      const loader = await getSharedGltfLoader();
      const build = async (file) => {
        const gltf = await loader.loadAsync(base + file);
        const body = collect(), bar = collect();
        let nBar = 0;
        gltf.scene.updateWorldMatrix(true, true);
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          // posiciones cuantizadas (int16) o float tras Draco: a float antes de aplicar la escala del nodo
          const q = o.geometry.attributes.position, f = new Float32Array(q.count * 3);
          for (let i = 0; i < q.count; i++) f.set([q.getX(i), q.getY(i), q.getZ(i)], i * 3);
          let g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(f, 3));
          if (o.geometry.index) g.setIndex(o.geometry.index.clone());
          g.applyMatrix4(o.matrixWorld);
          g = toCreasedNormals(g, 0.6);
          if (o.name === "luz") { bar.keep(g, [1, 1, 1]); nBar++; } else body.keep(g, SC_COLORS[o.name] ?? SC_COLORS.negro);
        });
        if (!nBar) return { car: body.done(), bar: null };
        // la tira de luces de delante es muy fina para verla de lejos: una barra que la envuelve, como las de verdad
        const lb = bar.done(), p = lb.attributes.position, bb = new THREE.Box3(), v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.x > -1.2) bb.expandByPoint(v); }
        if (!bb.isEmpty()) {
          const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
          bar.keep(new THREE.BoxGeometry(Math.max(0.1, sz.x + 0.04), Math.max(0.05, sz.y + 0.03), sz.z + 0.04).translate(c.x, c.y + 0.01, c.z).toNonIndexed(), [1, 1, 1]);
        }
        lb.dispose();
        return { car: body.done(), bar: bar.done() };
      };
      const [hi, lo] = await Promise.all([build(man.safety), man.safetyLo ? build(man.safetyLo) : null]);
      return { hi, lo: lo ?? hi };
    } catch (e) { console.warn("coche de seguridad .glb:", e); return null; }
  })();
  return modScCache;
}
function modLoadEnvTree(key) {
  if (!modEnvTreeCache.has(key)) modEnvTreeCache.set(key, (async () => {
    try {
      const base = ASSET("models/"), man = await modLoadManifest(), file = man?.trees?.[key];
      if (!file) return null;
      const loader = await getSharedGltfLoader();
      const parse = async (f) => {
        const gltf = await loader.loadAsync(base + f);
        const parts = [];
        gltf.scene.updateWorldMatrix(true, true);
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const geo = o.geometry.clone();
          geo.applyMatrix4(o.matrixWorld);
          const m = o.material.clone();
          if (m.alphaTest > 0) { m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide; }
          m.roughness = Math.max(m.roughness ?? 0.85, 0.85);
          m.metalness = 0;
          parts.push({ geo, mat: m, tintable: o.name !== "trunk" });
        });
        return parts.length ? parts : null;
      };
      const hi = await parse(file);
      if (!hi) return null;
      const loFile = key === "leaf" ? man?.trees?.leafLo : null;
      const lo = loFile ? await parse(loFile) : null;
      return { hi, lo };
    } catch (e) { console.warn("árbol .glb:", key, e); return null; }
  })());
  return modEnvTreeCache.get(key);
}
function modLoadCrewModels() {
  if (!modCrewCache) modCrewCache = (async () => {
    try {
      const base = ASSET("models/"), man = await modLoadManifest();
      if (!man?.crew?.stand || !man?.crew?.crouch) return null;
      const loader = await getSharedGltfLoader();
      const parse = async (f) => {
        const gltf = await loader.loadAsync(base + f);
        let geo = null;
        gltf.scene.updateWorldMatrix(true, true);
        gltf.scene.traverse((o) => {
          if (!o.isMesh || geo) return;
          const g = o.geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          // asegurar color de vértice RGB float32 para CREW_MAT
          const cAttr = g.attributes.color;
          if (cAttr && cAttr.itemSize !== 3) {
            const arr = new Float32Array(cAttr.count * 3);
            for (let i = 0; i < cAttr.count; i++) { arr[i * 3] = cAttr.getX(i); arr[i * 3 + 1] = cAttr.getY(i); arr[i * 3 + 2] = cAttr.getZ(i); }
            g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
          }
          geo = g;
        });
        return geo;
      };
      const [stand, crouch] = await Promise.all([parse(man.crew.stand), parse(man.crew.crouch)]);
      return stand && crouch ? { stand, crouch } : null;
    } catch (e) { console.warn("mecánicos .glb:", e); return null; }
  })();
  return modCrewCache;
}
function modLoadYachtModel() {
  if (!modYachtCache) modYachtCache = (async () => {
    try {
      const base = ASSET("models/"), man = await modLoadManifest();
      if (!man?.yacht) return null;
      const loader = await getSharedGltfLoader();
      const gltf = await loader.loadAsync(base + man.yacht);
      let res = null;
      gltf.scene.updateWorldMatrix(true, true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh || res) return;
        const geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        const mat = o.material.clone();
        mat.roughness = 0.40; mat.metalness = 0.08; mat.side = THREE.DoubleSide; mat.vertexColors = false;
        res = { geo, mat };
      });
      return res;
    } catch (e) { console.warn("yate .glb:", e); return null; }
  })();
  return modYachtCache;
}
function modLoadTexImage(kind) {
  if (!modTexImgCache.has(kind)) {
    modTexImgCache.set(kind, new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = ASSET(`tex/${kind}.webp`);
    }));
  }
  return modTexImgCache.get(kind);
}
function modLoadHdriRaw(preset) {
  if (!modHdriRawCache.has(preset)) {
    modHdriRawCache.set(preset, new Promise((resolve) => {
      modHdrLoader.load(ASSET(`env/${preset}.hdr`), (hdr) => resolve(hdr), undefined, () => { modHdriRawCache.delete(preset); resolve(null); });
    }));
  }
  return modHdriRawCache.get(preset);
}
function cloneTemplateTex(srcTex, maxAniso, disposeBag) {
  if (!srcTex?.image) return null;
  const tex = new THREE.Texture(srcTex.image);
  tex.flipY = srcTex.flipY;
  tex.colorSpace = srcTex.colorSpace;
  tex.wrapS = srcTex.wrapS;
  tex.wrapT = srcTex.wrapT;
  tex.magFilter = srcTex.magFilter;
  tex.minFilter = srcTex.minFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  disposeBag.push(tex);
  return tex;
}

// las cuatro del botón (se van rotando) y las de «Más cámaras» (manteniendo pulsado el botón)
const CAMS = ["circuito", "seguir", "tele", "abordo"];
const MORE_CAMS = ["heli", "boxes", "trasera", "grua"];
const CAM_NAME = { circuito: "Circuito", seguir: "Seguir", tele: "Tele", abordo: "A bordo", heli: "Helicóptero", boxes: "Pit-lane", trasera: "Alerón trasero", grua: "Grúa de meta" };
const COMPOUND = { S: "#e8452c", M: "#f2d23c", H: "#f2f2f2", I: "#3cc35a", W: "#3a7be8" };
const PIT_OFF = 2.15;
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * opt: { canvas, labels, box, sess, env?, mine(), selId(), alpha(), paused(), speed(), ghosts(), quality?, targetFps?, autoTv?, onContextLost?, onContextRestored? }
 *  · alpha(): cuánto del paso de simulación en curso ha pasado ya (0..1), para interpolar posiciones;
 *  · ghosts(): [{ s, text, color }] con los fantasmas de parada;
 *  · quality (opcional): calidad fija de 0 a 3, sin memoria y sin bajar sola (pruebas, o fijada a mano en Ajustes);
 *  · autoTv (opcional): realiza la cámara Tele con dirección automática (salida, boxes, incidentes, batallas);
 *  · debug (opcional, solo pruebas): { view: { pos, look, fov, s? } } pone la cámara a mano, relativa al coche seguido
 *    (o al punto s de la pista); en el mismo objeto se dejan algunos datos internos para comprobarlos.
 * Devuelve { beforeStep, draw, idle, audioView, stats, setQuality, moving, lastIncident, replay, stopReplay, replaying,
 *   photos, resize, cycleCam, camList, setCamera, cam, canOrbit, orbit, zoomBy, resetOrbit, orbitState, tvState, resetAutoTv,
 *   pick, selChanged, dispose }.
 */
export function createMap3d(opt) {
const sess = opt.sess, track = sess.track;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hourMode = "sesion", qMode = "auto";
let W_REAL = 6.5; // media anchura media de la pista (m); cada circuito pone la suya
// Calidad: 0 baja … 3 máxima. Baja sola si el dispositivo no puede y lo que aguantó se recuerda una semana, para
// no repetir los tirones en cada sesión. Los táctiles empiezan en 2: la oclusión ambiental a pantalla completa les pesa.
const Q_KEY = "muro-mapa3d-calidad";
let fixedQ = opt.quality; // calidad puesta a mano (undefined: automática)
function startQuality() {
  if (fixedQ !== undefined) return fixedQ;
  let q0 = matchMedia("(pointer: coarse)").matches ? 2 : 3;
  try { const m = JSON.parse(localStorage.getItem(Q_KEY) || "null"); if (m && Date.now() - m.t < 7 * 864e5) q0 = Math.min(q0, m.q); } catch (e) { /* sin memoria */ }
  return q0;
}
let T, camMode = "circuito", q = startQuality(), prScale = 1;
const prevS = new Map(), prevV = new Map(), prevL = new Map(), labels = new Map();

// ------------------------------------------------------------------ escena
const glc = opt.canvas;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: "high-performance" }); }
catch (e) { throw new Error("sin WebGL"); }
// La escena se calcula en luz lineal y con valores por encima de 1 (el sol, los focos); la curva de tonos
// la lleva a pantalla. La «neutra» comprime solo los brillos: los colores de los equipos salen como son.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.94;
const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0xc3d8ea, 0.00042);
scene.fog = fog;
// el sol da la luz directa y la sombra; la luz ambiente sale del propio cielo (scene.environment, más abajo)
const isDesktop = !matchMedia("(pointer: coarse)").matches;
const sun = new THREE.DirectionalLight(0xfff3dd, 3);
scene.add(sun, sun.target);
sun.shadow.bias = -0.00025;
sun.shadow.radius = 1.8;
sun.shadow.camera.layers.enable(1); // la sombra ve también la capa 1: cosas que solo dan sombra (manzanas cercanas)
// segunda cascada de sombra (solo calidad 3 en escritorio, fuera de vista general): cubre planos medios y lejanos
const sunFar = new THREE.DirectionalLight(0xfff3dd, 0);
sunFar.visible = false;
sunFar.castShadow = false;
sunFar.shadow.bias = -0.00035;
sunFar.shadow.radius = 2.6;
sunFar.shadow.camera.layers.enable(1);
scene.add(sunFar, sunFar.target);
let csmActive = false;
const camera = new THREE.PerspectiveCamera(36, 1, 5, 16000);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// color escrito «como se ve» (sRGB) pasado a luz lineal (protegido contra negativos para no generar NaN)
vec3 SR(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
`;
// cielo: degradado del horizonte al cénit, bruma hacia el sol, nubes con volumen que se mueven y el disco del sol.
// El mismo material pinta el entorno que reflejan los coches y el asfalto mojado (uEnv = 1: sin disco, con suelo).
const skyU = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uNight: { value: 0 }, uCity: { value: 0 }, uFlash: { value: 0 },
  uWx: { value: null }, uWxR: { value: 40000 }, uCam: { value: new THREE.Vector2() }, uWind: { value: new THREE.Vector2() },
  uVol: { value: 0 } }; // uVol: nubes con volumen (calidad 2 y 3)
const _dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
_dummyTex.needsUpdate = true;
const envHdriU = { uHdriA: { value: _dummyTex }, uHdriB: { value: _dummyTex }, uHdriMix: { value: 1 }, uHdriHas: { value: 0 } };
const skyMat = (env) => new THREE.ShaderMaterial({
  uniforms: { ...skyU, ...envHdriU, uEnv: { value: env } }, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: env > 0.5,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uZen, uHor, uSun, uSunCol, uCloudCol, uGround; uniform float uEnv, uNight, uWxR, uCity, uFlash, uVol, uHdriMix, uHdriHas; uniform vec2 uCam, uWind; uniform sampler2D uWx, uHdriA, uHdriB; varying vec3 vDir;` + GLSL_NOISE + `
    // ruido de gradiente con transición suave (no deja ver la rejilla) y octavas giradas
    vec2 g2(vec2 p){ float a = h21(p) * 6.2831853; return vec2(cos(a), sin(a)); }
    float gn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(mix(dot(g2(i), f), dot(g2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                 mix(dot(g2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(g2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y); }
    float cloudDen(vec2 q){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * gn(q); q = mat2(1.6, 1.2, -1.2, 1.6) * q + 3.7; a *= 0.5; } return 0.5 + 0.9 * s; }
    // lo mismo con tres octavas (las otras dos apenas mueven la forma grande): para recorrer el volumen
    float cloudDen3(vec2 q){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * gn(q); q = mat2(1.6, 1.2, -1.2, 1.6) * q + 3.7; a *= 0.5; } return 0.5 + 0.9 * s; }
    // dos octavas para la autosombra de los costados (forma general, mucho más ligera en GPU)
    float cloudDen2(vec2 q){ float s = 0.5 * gn(q); q = mat2(1.6, 1.2, -1.2, 1.6) * q + 3.7; s += 0.25 * gn(q); return 0.5 + 0.9 * s; }
    // Nubes con volumen (calidad 2 y 3): la capa plana da la base; por encima, cada nube sube hasta una altura que
    // depende de lo densa que es (cúmulos de cima redonda). Entre los huecos de las bases se ven, sobre todo hacia el
    // horizonte, los costados de las que hay detrás: tres pasos de 1,6 a 3,0 km. Devuelve (cuánto tapan los
    // costados, a qué altura de la nube se ven de media, cuánta nube tienen delante hacia el sol).
    vec3 cloudSides(vec3 d){
      float Tr = 1.0, hs = 0.0, sh = 0.0;
      vec2 toSun = uSun.xz / max(uSun.y, 0.2);
      for (int i = 1; i <= 3; i++) {
        float hf = float(i) / 3.0, h = 1600.0 + 1400.0 * hf;
        vec2 q = uCam + d.xz * (h / (d.y + 0.06));
        vec4 w = texture2D(uWx, q / (2.0 * uWxR) + 0.5);
        float lo = mix(0.66, 0.2, w.g) + 0.02 + hf * 0.3;
        float a = smoothstep(lo, lo + 0.1, cloudDen3(q / 2600.0 + uWind));
        if (a < 0.01) continue;
        // ¿hay nube 400 m más arriba hacia el sol? Entonces este costado está en sombra
        float ls = smoothstep(lo + 0.05, lo + 0.15, cloudDen2((q + toSun * 400.0) / 2600.0 + uWind));
        hs += Tr * a * hf; sh += Tr * a * ls; Tr *= 1.0 - a;
      }
      float cv = 1.0 - Tr;
      return vec3(cv, hs / max(cv, 0.001), sh / max(cv, 0.001));
    }
    void main(){
      vec3 d = normalize(vDir);
      float up = max(d.y, 0.0);
      vec3 col = mix(uHor, uZen, pow(up, 0.5));
      float s = max(dot(d, uSun), 0.0);
      // bruma: el cielo se aclara hacia el sol, sobre todo cerca del horizonte
      col += uSunCol * (pow(s, 6.0) * 0.10 + pow(s, 40.0) * 0.22) * (1.0 - 0.6 * up);
      float disc = smoothstep(0.99955, 0.9998, s) * 30.0 + pow(s, 900.0) * 3.0;
      // relámpago: todo el cielo se ilumina un instante (más hacia el horizonte, bajo la tormenta)
      col += vec3(0.75, 0.8, 1.0) * uFlash * (0.35 + 0.65 * (1.0 - up));
      // de noche, el resplandor anaranjado de la ciudad sobre el horizonte (más en los urbanos)
      col += vec3(1.0, 0.55, 0.25) * uCity * uNight * exp(-up * 9.0) * 0.12;
      // estrellas
      if (uNight > 0.01 && uEnv < 0.5) {
        vec2 sq = d.xz / (d.y + 0.35) * 150.0; float st = h21(floor(sq));
        col += vec3(0.8, 0.86, 1.0) * step(0.9972, st) * smoothstep(0.5, 0.1, length(fract(sq) - 0.5)) * uNight * smoothstep(0.03, 0.3, d.y) * (0.4 + 2.2 * fract(st * 91.7));
      }
      float c = 0.0;
      if (d.y > 0.0) {
        // Las nubes están en un techo a 1,6 km sobre el mapa del tiempo del juego (el mismo del radar): cada mirada
        // cae en un punto de ese mapa, que dice cuánta nube y cuánta lluvia hay allí. El ruido solo pone la forma.
        vec2 pw = uCam + d.xz * (1600.0 / (d.y + 0.06));
        vec4 wx = texture2D(uWx, pw / (2.0 * uWxR) + 0.5);
        float cover = wx.g, rainK = wx.r;
        float n = cloudDen(pw / 2600.0 + uWind), lo = mix(0.66, 0.2, cover);
        c = smoothstep(lo, lo + 0.2, n) * smoothstep(0.0, 0.08, d.y);
        // desde abajo: los bordes finos dejan pasar la luz, el vientre grueso es gris y bajo la lluvia, plomo
        float th = clamp((n - lo) / 0.4, 0.0, 1.0) * (0.45 + 0.55 * cover);
        vec3 cc = uCloudCol * mix(1.18, 0.44, th) * mix(1.0, 0.5, rainK);
        cc += uSunCol * pow(s, 8.0) * 0.35 * (1.0 - th);
        if (uVol > 0.5 && uEnv < 0.5 && c < 0.99) {
          vec3 v = cloudSides(d);
          // el costado que mira a la cámara está al sol si el sol queda detrás de ella; arriba, más claro
          float face = clamp(dot(-normalize(d.xz + 1e-4), normalize(uSun.xz + 1e-4)) * 0.6 + 0.4, 0.0, 1.0) * step(0.0, uSun.y);
          float L = (0.55 + 0.45 * v.y) * mix(1.0, 0.45, v.z) * (0.6 + 0.6 * face);
          vec3 side = uCloudCol * mix(0.5, 1.3, L) * mix(1.0, 0.55, rainK) + uSunCol * pow(s, 6.0) * 0.4 * (1.0 - v.z);
          float cs = v.x * smoothstep(0.0, 0.05, d.y) * (1.0 - c);
          cc = mix(cc, side, cs / max(c + cs, 0.001)); c += cs;
        }
        cc = mix(cc, uHor, smoothstep(0.14, 0.0, d.y) * 0.55); // se pierden en la calima del horizonte
        col = mix(col, cc, c * 0.97);
        // cortinas de lluvia bajo los chubascos lejanos: franjas verticales que se mueven con el viento
        float az = atan(d.z, d.x), fall = smoothstep(0.24, 0.02, d.y);
        float streak = 0.45 + 0.55 * smoothstep(-0.25, 0.35, gn(vec2(az * 160.0 + uWind.x * 6.0, d.y * 5.0 + uWind.y * 2.0)) + 0.3 * gn(vec2(az * 520.0, 1.7)));
        col = mix(col, uCloudCol * 0.36, rainK * fall * 0.8 * (uEnv > 0.5 ? 1.0 : streak));
      }
      col += uSunCol * disc * (1.0 - c) * (1.0 - uEnv);
      // por debajo del horizonte: lo que hay de verdad es suelo (solo importa en los reflejos)
      col = mix(col, mix(uHor, uGround, uEnv), smoothstep(0.0, -0.06, d.y));
      // en el cubemap de entorno (uEnv = 1), mezcla el cielo vivo con el HDRI (y su fundido cruzado entre presets)
      if (uEnv > 0.5 && uHdriHas > 0.5) {
        vec2 eqUv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 hCol = mix(texture2D(uHdriA, eqUv).rgb, texture2D(uHdriB, eqUv).rgb, uHdriMix);
        col = mix(col, hCol, 0.52);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat(0));
sky.scale.setScalar(8000); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
// entorno: el cielo vivo de este momento mezclado con el HDRI en un cubemap ligero (64×64) y filtrado por rugosidad (PMREM).
// Así los reflejos en carrocería y charcos siempre coinciden con el cielo actual y los cambios de HDRI se funden sin cortes.
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.geometry, skyMat(1)));
const envCube = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
const envCam = new THREE.CubeCamera(0.1, 10, envCube);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envT = -1e9, envSig = "", hdriBlendStart = -1e9;
function updateEnv(now, sig) {
  let blending = false;
  if (envHdriU.uHdriMix.value < 1) {
    envHdriU.uHdriMix.value = clamp((now - hdriBlendStart) / 2200, 0, 1);
    blending = true;
  }
  const minGap = blending ? 160 : 2200;
  if (!blending && sig === envSig) return;
  if (envRT && now - envT < minGap) return;
  envSig = sig; envT = now;
  envCam.update(renderer, envScene);
  envRT = pmrem.fromCubemap(envCube.texture, envRT);
  scene.environment = envRT.texture;
}
const hdriCache = new Map();
let alive3d = true, ctxLost = false, hdriPreset = "", hdriEnv = null, hdriSwapAt = -1e9;
function applyHdriRaw(hdr) {
  if (!hdr) return;
  if (envHdriU.uHdriHas.value < 0.5) {
    envHdriU.uHdriA.value = hdr;
    envHdriU.uHdriB.value = hdr;
    envHdriU.uHdriMix.value = 1;
    envHdriU.uHdriHas.value = 1;
  } else if (envHdriU.uHdriB.value !== hdr) {
    envHdriU.uHdriA.value = envHdriU.uHdriB.value;
    envHdriU.uHdriB.value = hdr;
    envHdriU.uHdriMix.value = 0;
    hdriBlendStart = performance.now();
  }
  hdriEnv = hdr;
  envSig = "";
}
function needHdri(preset) {
  if (preset === hdriPreset && hdriEnv) return;
  hdriPreset = preset;
  const hit = hdriCache.get(preset);
  if (hit) { applyHdriRaw(hit); return; }
  if (hit === null) return;
  hdriCache.set(preset, null);
  modLoadHdriRaw(preset).then((hdr) => {
    if (!alive3d || !hdr) { if (!hdr) hdriCache.delete(preset); return; }
    hdriCache.set(preset, hdr);
    if (hdriPreset === preset) applyHdriRaw(hdr);
  });
}

// ------------------------------------------------------------------ texturas de detalle (asfalto, hierba, grava)
// Se calculan al arrancar, sin descargar nada, y se repiten sin costura. Cada una lleva: R = claro/oscuro del color,
// G y B = inclinación de la superficie (relieve fino para la luz) y A = más o menos rugosa.
function detailTex(kind) {
  const N = 256, H = new Float32Array(N * N), A = new Float32Array(N * N), out = new Uint8Array(N * N * 4);
  const lat = (x, y, per, sd) => hash2(mod(x, per) * 1.37 + sd, mod(y, per) * 1.91 - sd);
  const tn = (x, y, per, sd) => {
    const fx = (x / N) * per, fy = (y / N) * per, xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = lat(xi, yi, per, sd), b = lat(xi + 1, yi, per, sd), c = lat(xi, yi + 1, per, sd), d = lat(xi + 1, yi + 1, per, sd);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, sp = hash2(x * 3.1 + 5, y * 2.7 + 9);
    if (kind === "asfalto") {
      // áridos de varios tamaños y alguna piedra más clara o más oscura
      const h = 0.42 * tn(x, y, 128, 1) + 0.3 * tn(x, y, 64, 2) + 0.18 * tn(x, y, 32, 3) + 0.1 * tn(x, y, 8, 4);
      H[i] = h; A[i] = 0.5 + (h - 0.5) * 0.9 + (sp > 0.94 ? 0.3 : sp < 0.05 ? -0.22 : 0);
    } else if (kind === "hierba") {
      const h = 0.34 * tn(x, y, 96, 5) + 0.3 * tn(x, y, 48, 6) + 0.22 * tn(x, y, 20, 7) + 0.14 * tn(x, y, 6, 8);
      H[i] = h; A[i] = 0.5 + (h - 0.5) * 1.5 + (sp - 0.5) * 0.3;
    } else {
      // grava: guijarros (crestas del ruido) de tonos distintos
      const r = 1 - Math.abs(tn(x, y, 72, 9) - 0.5) * 2, r2 = 1 - Math.abs(tn(x, y, 36, 10) - 0.5) * 2;
      H[i] = 0.6 * r + 0.4 * r2; A[i] = 0.5 + (tn(x, y, 72, 11) - 0.5) * 1.1 + (sp - 0.5) * 0.35;
    }
  }
  const K = kind === "asfalto" ? 2.2 : kind === "hierba" ? 3.2 : 4.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, dx = (H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)]) * K, dz = (H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x]) * K;
    const l = Math.hypot(dx, 1, dz);
    out[i * 4] = clamp(A[i], 0, 1) * 255; out[i * 4 + 1] = (0.5 - 0.5 * dx / l) * 255; out[i * 4 + 2] = (0.5 - 0.5 * dz / l) * 255; out[i * 4 + 3] = clamp(0.5 + (H[i] - 0.5) * 0.8, 0, 1) * 255;
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
  return t;
}
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const DET = { asfalto: detailTex("asfalto"), hierba: detailTex("hierba"), grava: detailTex("grava") };
const DET_U = {
  asfalto: { value: DET.asfalto },
  hierba: { value: DET.hierba },
  grava: { value: DET.grava },
  hormigon: { value: DET.asfalto },
  fachada: { value: DET.asfalto },
};
const loadedTexs = [];
{
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const k of ["asfalto", "hierba", "grava", "hormigon", "fachada"]) {
    modLoadTexImage(k).then((img) => {
      if (!alive3d || !img) return;
      const tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = aniso;
      tex.colorSpace = THREE.NoColorSpace;
      tex.needsUpdate = true;
      DET_U[k].value = tex;
      loadedTexs.push(tex);
    });
  }
}

// uniformes que comparten la pista, los coches y la lluvia
const U = {
  uW: { value: 20 }, uDetail: { value: 0 }, uL: { value: 5000 }, uFlood: { value: 0 }, uLight: { value: 0.2 },
  uCloud: { value: null }, uTexR: { value: 3000 }, uTime: { value: 0 },
  uDrops: { value: -1 }, // gotas en los coches: 0 secos … 1 empapados (−1: aún sin calcular)
  uYel: { value: new THREE.Vector3(0, 0, 0) }, // zona en amarillo: centro (s), media longitud y cuánto se ve
  uLamps: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uNL: { value: 0 }, // focos que se reflejan en el agua
  uTails: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uNT: { value: 0 }, // luz trasera en mojado
  uLampK: { value: 0 }, // brillo de farolas y focos en mojado
  uSlopeCol: { value: new THREE.Color(0x575247) }, uDry: { value: 0.35 }, uMow: { value: 1 }, // bioma del circuito
  uHiQ: { value: 0 }, // 1 con calidad 2 o 3: interiores detrás de los cristales
  uDay: { value: 1 }, // luz de día que entra por las ventanas (0 de noche, menos con nubes)
  uCloudShade: { value: 0.32 }, // fuerza de la sombra de nubes en suelo y pista (baja de noche o con nublado cerrado)
  uTacDrs: { value: 0 }, // capa táctica: zonas de DRS / modo adelantamiento y frenadas
  uTacWet: { value: 0 }, // capa táctica: contraste línea seca vs mojada
  uKerbA: { value: new THREE.Color(0xc21f24) }, uKerbB: { value: new THREE.Color(0xdeddd8) }, uKerbC: { value: new THREE.Color(0xc21f24) }, uKerbN: { value: 2 },
  uBarA: { value: new THREE.Color(0xc21f24) }, uBarB: { value: new THREE.Color(0xdeddd8) },
  uRunAcc: { value: new THREE.Color(0x125a8c) }, uRunPat: { value: 0 },
};
// Biomas del terreno y arbolado (seleccionados por circuito desde trackVisuals.ts)
const BIOMES = {
  alpino:       { grass: 0x447439, gravel: 0xc2b28b, cA: 0x2b5b2a, cB: 0x3e7337, cC: 0x528744, slope: 0x5f6354, dry: 0.22, mow: 1.0, treeA: 0x1d4725, treeB: 0x3f7539, tintA: 0x9ac692, tintB: 0xd8ecc4, species: [["pine", 0.78], ["leaf", 0.22]], maxT: 950, arid: false, sea: 0x0b2b36 },
  bosque:       { grass: 0x456e3a, gravel: 0xc2b28b, cA: 0x2f562b, cB: 0x406a37, cC: 0x4e7941, slope: 0x575247, dry: 0.35, mow: 1.0, treeA: 0x28512c, treeB: 0x4e8042, tintA: 0xbad6a8, tintB: 0xe6f2d8, species: [["leaf", 0.58], ["pine", 0.42]], maxT: 800, arid: false, sea: 0x0b2b36 },
  tropical:     { grass: 0x3e6d34, gravel: 0xc2b086, cA: 0x295627, cB: 0x3a6b32, cC: 0x4b7b3e, slope: 0x6b533e, dry: 0.20, mow: 1.0, treeA: 0x225429, treeB: 0x47823f, tintA: 0xaad29c, tintB: 0xdcf4c8, species: [["leaf", 0.55], ["palm", 0.45]], maxT: 800, arid: false, sea: 0x092838 },
  seco:         { grass: 0x697442, gravel: 0xc9b489, cA: 0x566638, cB: 0x747b47, cC: 0x8b8352, slope: 0x867861, dry: 0.65, mow: 0.5, treeA: 0x31522b, treeB: 0x5a703a, tintA: 0xd2c998, tintB: 0xeee2b2, species: [["leaf", 0.65], ["pine", 0.35]], maxT: 560, arid: false, sea: 0x0c3448 },
  mediterraneo: { grass: 0x6b7248, gravel: 0xc8b896, cA: 0x656c54, cB: 0x7d8068, cC: 0x8a8c84, slope: 0x8b8170, dry: 0.50, mow: 0.3, treeA: 0x2f5932, treeB: 0x557a44, tintA: 0xc4d6a8, tintB: 0xeaeec8, species: [["leaf", 0.45], ["pine", 0.30], ["palm", 0.25]], maxT: 450, arid: false, sea: 0x0d425c },
  dunas:        { grass: 0x6b7c4d, gravel: 0xd5c69f, cA: 0x5d6e45, cB: 0x968e68, cC: 0xb9aa82, slope: 0xaa9a76, dry: 0.75, mow: 0.4, treeA: 0x345835, treeB: 0x547444, tintA: 0xc8d0a2, tintB: 0xe8e2bc, species: [["pine", 0.55], ["leaf", 0.45]], maxT: 360, arid: false, sea: 0x0e3446 },
  desierto:     { grass: 0xa68e6d, gravel: 0xc8b28a, cA: 0x998161, cB: 0xb59c78, cC: 0xc3ab87, slope: 0x7e684e, dry: 0.15, mow: 0.0, treeA: 0x3c5930, treeB: 0x577140, tintA: 0xdcd4ac, tintB: 0xf6ecc8, species: [["palm", 1.0]], maxT: 160, arid: true,  sea: 0x0d3d52 },
};
const CN = 48, cloudData = new Uint8Array(CN * CN * 4);
const cloudTex = new THREE.DataTexture(cloudData, CN, CN, THREE.RGBAFormat);
cloudTex.magFilter = cloudTex.minFilter = THREE.LinearFilter; cloudTex.needsUpdate = true;
U.uCloud.value = cloudTex;
// el tiempo a lo grande para el cielo: 40 km a cada lado del circuito, como el radar. R = lluvia, G = cuánta nube
const WN = 72, WX_R = 40000, wxData = new Uint8Array(WN * WN * 4);
const wxTex = new THREE.DataTexture(wxData, WN, WN, THREE.RGBAFormat);
wxTex.magFilter = wxTex.minFilter = THREE.LinearFilter; wxTex.needsUpdate = true;
skyU.uWx.value = wxTex; skyU.uWxR.value = WX_R;
// Marcas inventadas: las de la publicidad de pista, los puentes, las fachadas y los patrocinadores de los coches.
// equipos en el orden de los garajes (el mismo que usa la simulación)
const TEAMS = [...new Map(sess.cars.map((c) => [c.team.id, c.team])).values()];
// publicidad de pista: ocho marcas en una tira
const adsCanvas = document.createElement("canvas"); adsCanvas.width = 2048; adsCanvas.height = 128;
{ const g = adsCanvas.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 78px ${FONT}`;
  BRANDS.slice(0, 8).forEach(([t, bg, fg], k) => { g.fillStyle = bg; g.fillRect(k * 256, 0, 256, 128); g.fillStyle = fg; g.fillText(t, k * 256 + 128, 68, 220); }); }
const adsTex = new THREE.CanvasTexture(adsCanvas); adsTex.colorSpace = THREE.SRGBColorSpace;
// rótulos grandes (puentes, fachadas, gradas): 4 × 8 casillas de 512 × 128; las 16 primeras son marcas y las siguientes,
// el cartel de cada equipo sobre su garaje
const SIGN_TEAM0 = 16;
const signCanvas = document.createElement("canvas"); signCanvas.width = 2048; signCanvas.height = 1024;
{ const g = signCanvas.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle";
  const cellAt = (k) => [(k % 4) * 512, Math.floor(k / 4) * 128];
  BRANDS.forEach(([t, bg, fg], k) => {
    const [x, y] = cellAt(k);
    g.fillStyle = bg; g.fillRect(x, y, 512, 128);
    g.fillStyle = fg; g.fillRect(x + 14, y + 104, 484, 6);
    g.font = `${k % 3 ? "900" : "italic 900"} 92px ${FONT}`; g.fillText(t, x + 256, y + 60, 470);
  });
  TEAMS.slice(0, 16).forEach((tm, k) => {
    const [x, y] = cellAt(SIGN_TEAM0 + k), c = new THREE.Color(tm.color), lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    g.fillStyle = "#15171b"; g.fillRect(x, y, 512, 128);
    g.fillStyle = tm.color; g.fillRect(x + 6, y + 6, 500, 116);
    g.fillStyle = lum > 0.62 ? "#111317" : "#ffffff";
    g.font = `900 64px ${FONT}`; g.fillText(String(tm.nombre || tm.id).toUpperCase(), x + 256, y + 68, 480);
  });
}
if (opt.debug) opt.debug.signCanvas = signCanvas;
const DBG = opt.debug || {}; DBG.scene = scene;
const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
U.uAds = { value: adsTex };

// ------------------------------------------------------------------ material de las cintas (asfalto, hierba, grava, muros)
// aGeo empaqueta (aLat, aLatM, aY, aBank) en un solo vec4 para mantenerse por debajo del límite WebGL de 16 atributos
const RIB_VH = `
attribute vec3 aSide; attribute vec4 aGeo; attribute float aU, aV, aWet, aWetOff, aKerb, aDash, aLine, aWr; attribute vec3 aEdge;
uniform float uW;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine, vWY; varying vec3 vEdge; varying vec2 vXZ, vSide;
`;
const RIB_VB = `
vec3 transformed = position + aSide * (uW * aGeo.x * aWr + aGeo.y);
float bankLat = clamp(aGeo.x * aWr, -1.65, 1.65) * 7.0 + clamp(aGeo.y, -16.0, 16.0) * 0.45;
transformed.y += aGeo.z * (aGeo.z > 0.0 ? uW / 6.5 : 1.0) + bankLat * aGeo.w;
vU = aU; vV = aV; vWet = aWet; vWetOff = aWetOff; vKerb = aKerb; vDash = aDash; vLine = aLine; vEdge = aEdge; vXZ = transformed.xz; vWY = transformed.y; vSide = aSide.xz;
`;
const RIB_FH = `` + GLSL_NOISE + `
uniform float uW, uDetail, uL, uFlood, uTexR, uTime, uNL, uNT, uLampK, uDry, uMow, uTacDrs, uTacWet, uSkyNight, uKerbN, uRunPat, uCloudShade; uniform vec3 uYel, uSlopeCol, uSkyZen, uSkyHor, uSkySun, uSkySunCol, uSkyCloud, uKerbA, uKerbB, uKerbC, uBarA, uBarB, uRunAcc; uniform vec4 uLamps[16], uTails[6]; uniform sampler2D uCloud, uAds, uDet, uRock;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine, vWY; varying vec3 vEdge; varying vec2 vXZ, vSide;
`;
// Cada cinta compila solo su rama (RMODE): 0 muro liso, 1 pista, 2 calle de boxes, 3 hierba, 4 grava, 5 barrera, 6 valla,
// 7 publicidad, 8 hormigón de la zona de trabajo, 9 escapatoria de asfalto pintado.
// Sale de aquí: col (color), alpha, rough (rugosidad), metal y dn/dnY (relieve en coordenadas del mundo).
const RIB_FB = `
float px = fwidth(vXZ.x) + fwidth(vXZ.y); // metros por píxel
vec3 col = diffuse; float rough = 0.9, metal = 0.0, glow = 0.0, dnY = 0.0, alpha = opacity; vec2 dn = vec2(0.0); vec3 refC = vec3(0.0);
vec2 vS = normalize(vSide + vec2(1e-5, 0.0)), vTan = vec2(-vS.y, vS.x);
float cloudS = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).g;
#if RMODE == 1 || RMODE == 2
  float a = abs(vU);
  // asfalto: el árido de cerca, manchas de un par de metros y parches de distinto tono a lo lejos. El árido se lee dos
  // veces (la segunda girada 37° y a otra escala) y se mezcla con un ruido suave: así no se ven las baldosas de 2,7 m.
  // El detalle fino y su relieve se atenúan con la distancia (detFade) para evitar centelleo y ruido al alejar la cámara.
  const mat2 ASF_R = mat2(0.8, 0.6, -0.6, 0.8);
  vec4 d1a = texture2D(uDet, vXZ / 2.7), d1b = texture2D(uDet, ASF_R * vXZ / 3.3 + 0.47), d2 = texture2D(uDet, vXZ / 23.0 + 0.31);
  float dmix = smoothstep(0.25, 0.75, vn(vXZ * 0.13));
  d1b.gb = vec2(0.5) + (d1b.gb - 0.5) * ASF_R; // su relieve, de vuelta a los ejes del mundo
  vec4 d1 = mix(d1a, d1b, dmix);
  d1.r = 0.5 + (d1.r - 0.5) * (1.0 + 0.5 * dmix * (1.0 - dmix)); // la mezcla aplana el contraste: se le devuelve
  float detFade = 1.0 - smoothstep(0.03, 0.28, px);
  float d1r = mix(0.5, d1.r, detFade);
  float big = vn(vXZ * 0.06);
  col *= (0.72 + 0.56 * d1r) * (0.86 + 0.28 * d2.r) * (0.88 + 0.24 * big);
  dn = (d1.gb - 0.5) * (1.15 * detFade) + (d2.gb - 0.5) * (0.35 * (0.35 + 0.65 * detFade));
  rough = 0.85 + (mix(0.5, d1.a, detFade) - 0.5) * 0.18;
  #if RMODE == 1
    // la trazada: goma depositada, más oscura y más lisa; más intensa en zonas de frenada fuerte
    float dl = (vU - vLine) / 0.30;
    float rub = exp(-dl * dl) * (0.35 + 0.65 * uDetail) * (0.8 + 0.4 * vn(vec2(vV * 0.15, vU * 4.0)));
    float brkZone = clamp((vKerb - step(0.5, vKerb)) / 0.45, 0.0, 1.0) * uDetail;
    float t1 = (vU - vLine - 0.12) / 0.075, t2 = (vU - vLine + 0.12) / 0.075;
    float tyreTracks = max(exp(-t1 * t1), exp(-t2 * t2));
    float brkMark = brkZone * tyreTracks * (0.45 + 0.55 * vn(vec2(vV * 0.09, vU * 14.0)));
    col *= (1.0 - 0.42 * rub) * (1.0 - 0.24 * brkMark);
    rough -= 0.2 * rub + 0.08 * brkMark;
    dn *= 1.0 - 0.5 * clamp(rub + 0.4 * brkMark, 0.0, 1.0);
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.7, a);
    // Agua. Las dos rodadas (y algo menos el carril entre ellas) llevan el agua de la trazada; el resto, la de fuera.
    float lineK = max(tyreTracks, 0.6 * exp(-dl * dl * 0.6));
    float wet = mix(vWetOff, vWet, lineK) * uDetail;
    // No se moja ni se seca por igual: cada punto tiene su umbral (poros, parches, badenes), así que el asfalto
    // se seca a corros. Tres fases: húmedo (oscuro y mate), película de agua (brilla) y charco (espejo).
    float low = vn(vXZ * 0.19 + 7.0), thr = 0.5 * d2.r + 0.3 * big + 0.2 * low;
    float damp = smoothstep(0.03 + 0.5 * thr, 0.2 + 0.5 * thr, wet);
    float film = smoothstep(0.36 + 0.4 * thr, 0.66 + 0.4 * thr, wet);
    float pud = smoothstep(0.62, 0.9, wet * 1.1 + (0.5 - low) * 0.7 + (0.5 - d2.r) * 0.35 + 0.22 * smoothstep(0.45, 0.8, a)) * film;
    col *= mix(vec3(1.0), vec3(0.4, 0.44, 0.5), max(damp * 0.85, film));
    rough = mix(rough, 0.6, damp); rough = mix(rough, 0.17, film); rough = mix(rough, 0.03, pud);
    dn *= (1.0 - 0.65 * film) * (1.0 - pud);
    // ondas de las gotas en los charcos y en la película, solo de cerca y mientras llueve
    float rainK = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).r * clamp(1.0 - px * 9.0, 0.0, 1.0) * max(pud, film * 0.4);
    if (rainK > 0.01) {
      vec2 cell = floor(vXZ * 2.6), f = fract(vXZ * 2.6) - 0.5;
      float hh = h21(cell), ph = fract(uTime * (0.9 + hh) + hh * 7.0);
      vec2 o = f - (vec2(h21(cell + 3.1), h21(cell + 8.7)) - 0.5) * 0.4;
      float dist = length(o), ring = dist - ph * 0.3;
      dn += normalize(o + 1e-4) * sin(ring * 70.0) * exp(-ring * ring * 500.0) * (1.0 - ph) * rainK * step(0.45, hh) * 0.8;
    }
    // reflejo real del cielo, el sol y las nubes en la película de agua y los charcos del asfalto mojado
    if (film > 0.02) {
      vec3 Fw = vec3(vXZ.x, vWY, vXZ.y);
      vec3 Vw = normalize(cameraPosition - Fw);
      vec3 Nw = normalize(vec3(dn.x * 0.35, 1.0, dn.y * 0.35));
      vec3 Rw = reflect(-Vw, Nw);
      float rUp = clamp(Rw.y, 0.0, 1.0);
      vec3 skyR = mix(uSkyHor, uSkyZen, pow(rUp, 0.55));
      float rSun = max(dot(Rw, uSkySun), 0.0);
      skyR += uSkySunCol * (pow(rSun, 8.0) * 0.16 + pow(rSun, 48.0) * 0.45 + smoothstep(0.997, 0.9995, rSun) * 4.2);
      skyR = mix(skyR, uSkyCloud * 0.85, clamp(cloudS * 0.72, 0.0, 0.82));
      skyR += vec3(1.0, 0.55, 0.25) * uSkyNight * exp(-rUp * 8.0) * 0.08;
      float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(Nw, Vw), 0.0, 1.0), 4.0);
      float refK = max(pud * (0.48 + 0.52 * fres), film * fres * 0.36) * uDetail;
      refC += skyR * refK * 0.78;
    }
    // de noche o con lluvia en urbanos, cada foco se refleja en el agua como una estela alargada hacia quien mira
    if (uNL > 0.5 && film > 0.02) {
      vec3 F = vec3(vXZ.x, vWY, vXZ.y), d1 = normalize(F - cameraPosition);
      float sgm = mix(0.03, 0.006, pud), acc = 0.0;
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uNL) break;
        vec4 Lp = uLamps[i];
        vec3 d2 = normalize(vec3(Lp.x, 2.0 * vWY - Lp.y, Lp.z) - cameraPosition), dd = d1 - d2, hx = normalize(cross(d2, vec3(0.0, 1.0, 0.0)));
        float h = dot(dd, hx), v = length(dd - hx * h);
        acc += Lp.w * exp(-(h * h) / (sgm * sgm * 0.25) - (v * v) / (sgm * sgm * 14.0));
      }
      refC += vec3(1.0, 0.88, 0.68) * acc * max(film * 0.5, pud) * uLampK * 2.5;
    }
    // pilotos traseros rojos reflejados en el asfalto mojado detrás de cada coche cercano
    if (uNT > 0.5 && film > 0.02) {
      vec3 F = vec3(vXZ.x, vWY, vXZ.y), d1 = normalize(F - cameraPosition);
      float sgm = mix(0.026, 0.009, pud), accT = 0.0;
      for (int i = 0; i < 6; i++) {
        if (float(i) >= uNT) break;
        vec4 Tp = uTails[i];
        vec3 d2 = normalize(vec3(Tp.x, 2.0 * vWY - Tp.y, Tp.z) - cameraPosition), dd = d1 - d2, hx = normalize(cross(d2, vec3(0.0, 1.0, 0.0)));
        float h = dot(dd, hx), v = length(dd - hx * h);
        accT += Tp.w * exp(-(h * h) / (sgm * sgm * 0.35) - (v * v) / (sgm * sgm * 10.0));
      }
      refC += vec3(1.4, 0.10, 0.05) * accT * max(film * 0.65, pud) * 0.65;
    }
    col = mix(col, SR(vec3(0.27, 0.59, 0.94)), vWet * (1.0 - uDetail) * 0.85);
    // capa táctica opcional: contraste claro de línea seca frente a zonas húmedas/encharcadas
    if (uTacWet > 0.5) {
      float wLoc = mix(vWetOff, vWet, lineK);
      float dryDiff = clamp((vWetOff - vWet) * 2.4, 0.0, 1.0) * lineK;
      vec3 wetTint = mix(SR(vec3(0.16, 0.56, 0.98)), SR(vec3(0.05, 0.28, 0.86)), smoothstep(0.25, 0.85, wLoc));
      col = mix(col, wetTint, clamp(wLoc * 0.78, 0.0, 0.78));
      col = mix(col, SR(vec3(0.95, 0.86, 0.42)), dryDiff * 0.42);
      glow = max(glow, wLoc * 0.18 + dryDiff * 0.16);
    }
    // línea de límite de pista fina de cerca (20-25 cm) y ancha de lejos para leerse en la vista general; arcén sucio por fuera
    float jitt = (vn(vec2(vV * 0.9, vU * 3.0)) - 0.5) * 0.014 * uDetail;
    float lineIn = mix(0.80, 0.885, uDetail), lineOut = mix(1.02, 0.922, uDetail);
    float whiteLine = smoothstep(lineIn - 0.012, lineIn, a + jitt) * (1.0 - smoothstep(lineOut, lineOut + 0.015, a + jitt) * uDetail);
    float isDash = step(0.5, vDash) * (1.0 - step(1.5, vDash));
    float isDrs = step(0.5, vDash);
    float dash = isDash > 0.5 ? step(0.45, fract(vV / (uW * 4.0))) : 1.0;
    float k = step(0.5, vKerb) * uDetail;
    // pianos con relieve de dientes de sierra, juntas entre bloques, goma y paleta propia de 2 o 3 colores por circuito
    float kMask = smoothstep(0.895, 0.912, a) * k;
    float kBlk = uW * 0.26, kHalf = fract(vV / kBlk);
    float kIdx = mod(floor(vV / kBlk), uKerbN);
    vec3 kBase = kIdx < 0.5 ? uKerbA : (kIdx < 1.5 ? uKerbB : uKerbC);
    float kJoint = smoothstep(0.0, 0.05, kHalf) * smoothstep(1.0, 0.95, kHalf);
    float kRib = sin(fract(vV / 0.42) * 6.28318) * (1.0 - smoothstep(0.06, 0.22, px));
    float kScuff = smoothstep(0.96, 0.90, a) * (0.4 + 0.6 * vn(vec2(vV * 0.35, a * 12.0)));
    vec3 kerb = kBase * (0.8 + 0.35 * d2.r) * (0.76 + 0.24 * kJoint) * (1.0 - 0.26 * kScuff);
    // borde sucio de asfalto y virutas por fuera de la línea blanca en rectas (sin piano)
    float outerDust = smoothstep(0.92, 0.995, a) * (1.0 - k) * uDetail;
    col = mix(col, mix(col * 0.84, uSlopeCol * 0.65, 0.25), outerDust);
    float wm = whiteLine * dash * (1.0 - kMask * 0.85);
    col = mix(col, SR(vEdge) * (0.86 + 0.14 * d1.r), wm);
    col = mix(col, kerb, kMask);
    float em = max(wm, kMask);
    float sl = step(vV, uW * 0.45) * step(a, 0.8);
    float chk = mod(floor(vU * 4.0) + floor(vV / (uW * 0.225)), 2.0);
    col = mix(col, mix(SR(vec3(0.95)), mix(SR(vec3(0.95)), SR(vec3(0.06)), chk), uDetail), sl);
    float g = (uL - vV - 9.0) / 8.0;
    float sideSel = mod(floor(g), 2.0) < 0.5 ? 1.0 : -1.0;
    float slot = step(0.0, g) * step(g, 22.0) * step(0.12, vU * sideSel) * step(vU * sideSel, 0.72) * step(fract(g), 0.07) * uDetail;
    col = mix(col, SR(vec3(0.93)), slot);
    // la pintura es más lisa que el asfalto (y brilla más mojada); los pianos conservan su relieve escalonado
    float paint = max(em, max(sl, slot));
    rough = mix(rough, min(rough, mix(0.55, 0.12, film)), paint); dn *= 1.0 - 0.7 * paint;
    dn += (vTan * kRib * 0.55 - vS * sign(vU) * 0.65 * smoothstep(0.97, 0.90, a)) * kMask;
    // banderas amarillas: el tramo afectado (o toda la pista con coche de seguridad) se marca en los bordes y, de lejos, entero
    float yd = abs(mod(vV - uYel.x + uL * 0.5, uL) - uL * 0.5), yz = uYel.z * (1.0 - smoothstep(uYel.y, uYel.y + 30.0, yd));
    float yk = yz * max(smoothstep(0.84, 0.90, a) * 0.85, (1.0 - uDetail) * 0.35) * (0.75 + 0.25 * sin(uTime * 6.0));
    col = mix(col, SR(vec3(1.0, 0.8, 0.1)), yk); glow = max(glow, yk * 0.5);
    // capa táctica opcional: zonas de DRS / modo adelantamiento (verde) y frenadas clave (ámbar)
    if (uTacDrs > 0.5) {
      if (isDrs > 0.5) {
        float edgeD = smoothstep(0.68, 0.88, a);
        float chev = smoothstep(0.35, 0.65, sin((vV - abs(vU) * uW * 0.9) * 0.42 - uTime * 3.5)) * (1.0 - smoothstep(0.55, 0.78, a));
        float dm = max(edgeD * 0.68, chev * 0.22);
        col = mix(col, SR(vec3(0.16, 0.92, 0.42)), dm);
        glow = max(glow, dm * 0.45);
      }
      float isOt = step(0.96, vEdge.r) * (1.0 - step(0.3, vEdge.b));
      if (isOt > 0.5) {
        float om = smoothstep(0.66, 0.88, a) * 0.55;
        col = mix(col, SR(vec3(1.0, 0.58, 0.14)), om);
        glow = max(glow, om * 0.35);
      }
    }
  #else
    float pEdge = smoothstep(0.88, 0.92, a) * (1.0 - smoothstep(0.96, 0.99, a) * uDetail);
    col = mix(col, SR(vec3(0.88)), pEdge * (0.3 + 0.55 * uDetail));
  #endif
#elif RMODE == 3
  // hierba: franjas de siega suaves según el bioma, calvas secas y talud de tierra/roca sin estirar en vertical
  vec4 d1 = texture2D(uDet, vXZ / 3.3), d2 = texture2D(uDet, vXZ / 41.0 + 0.31);
  col *= 1.0 + (step(0.5, fract(vV / 16.0)) - 0.5) * 0.14 * uMow * clamp(1.0 - px * 0.13, 0.0, 1.0);
  col *= (0.55 + 0.9 * d1.r) * (0.72 + 0.56 * d2.r) * (0.84 + 0.32 * vn(vXZ * 0.13));
  col = mix(col, col * vec3(1.42, 1.12, 0.58), smoothstep(0.5, 0.88, vn(vXZ * 0.031 + 4.0)) * uDry);
  dn = (d1.gb - 0.5) * 2.0 + (d2.gb - 0.5) * 0.8; rough = 0.93;
  // en el talud (vU > 0) se mantiene hierba en la parte alta y solo aflora tierra/roca suavemente en la base
  float slope = smoothstep(0.42, 0.88, abs(vU) + (vn(vec2(vV * 0.14, vWY * 0.3)) - 0.5) * 0.08);
  if (slope > 0.01) {
    vec4 rk = texture2D(uRock, vec2(vV, vWY) / 3.8);
    float strata = 0.82 + 0.36 * vn(vec2(vV * 0.05, vWY * 0.45));
    vec3 rcol = uSlopeCol * (0.62 + 0.76 * rk.r) * strata;
    col = mix(col, rcol, slope * 0.48);
    dn = mix(dn, vTan * (rk.g - 0.5) * 1.6, slope * 0.55);
    dnY = (rk.b - 0.5) * 1.0 * slope;
    rough = mix(rough, 0.96, slope);
  }
#elif RMODE == 4
  // grava o arena (y taludes en urbanos/desierto): surcos paralelos de rastrillo solo en escapatorias (vDash > 0.5)
  vec4 d1 = texture2D(uDet, vXZ / 1.9), d2 = texture2D(uDet, vXZ / 13.0 + 0.31);
  col *= (0.58 + 0.84 * d1.r) * (0.76 + 0.48 * d2.r) * (0.9 + 0.2 * vn(vXZ * 0.6));
  float rakeK = step(0.5, vDash) * (1.0 - smoothstep(0.05, 0.22, px)) * (1.0 - smoothstep(0.01, 0.12, abs(vU)));
  float rake = sin(dot(vXZ, vS) * 5.2 + vn(vXZ * 0.2) * 1.5);
  col *= 1.0 + 0.06 * rake * rakeK;
  dn = (d1.gb - 0.5) * 2.2 + (d2.gb - 0.5) * 1.0 + vS * cos(dot(vXZ, vS) * 5.2) * 0.42 * rakeK; rough = 0.96;
  float slope = smoothstep(0.008, 0.095, abs(vU));
  if (slope > 0.01) {
    vec4 rk = texture2D(uRock, vec2(vV, vWY) / 3.8);
    vec3 rcol = uSlopeCol * (0.66 + 0.68 * rk.r) * (0.85 + 0.3 * vn(vec2(vV * 0.06, vWY * 0.4)));
    col = mix(col, rcol, slope);
    dn = mix(dn, vTan * (rk.g - 0.5) * 1.8, slope);
    dnY = (rk.b - 0.5) * 1.2 * slope;
  }
#elif RMODE == 5
  float baseAO = 0.62 + 0.38 * smoothstep(0.0, 0.28, vU);
  if (vKerb > 0.5) {
    // protección de neumáticos / Tecpro: bloques bicolores (propios del circuito o rojo y blanco) con volumen cilíndrico
    col = mix(uBarA, uBarB, step(0.5, fract(vV / 2.4)));
    float rowF = fract(vU * 3.0), colF = fract(vV / 0.65);
    col *= (0.68 + 0.32 * sin(rowF * 3.14159)) * (0.82 + 0.18 * sin(colF * 3.14159)) * baseAO;
    dnY = (0.5 - rowF) * 1.1; dn = vTan * (0.5 - colF) * 0.7;
    rough = 0.72;
  } else {
    // guardarraíl: dos bandas de chapa galvanizada acanalada (perfil en W) con relieve y postes
    float r1 = smoothstep(0.14, 0.17, vU) * (1.0 - smoothstep(0.45, 0.48, vU));
    float r2 = smoothstep(0.58, 0.61, vU) * (1.0 - smoothstep(0.89, 0.92, vU));
    float rail = clamp(r1 + r2, 0.0, 1.0);
    float wWave = sin(((vU - 0.16) / 0.30) * 6.28318) * r1 + sin(((vU - 0.60) / 0.30) * 6.28318) * r2;
    col = mix(SR(vec3(0.20, 0.21, 0.24)), SR(vec3(0.70, 0.72, 0.76)) * (0.86 + 0.24 * vn(vec2(vV * 0.7, vU * 6.0)) + 0.08 * wWave), rail);
    col *= (1.0 - 0.38 * step(fract(vV / 3.8), 0.035)) * baseAO;
    dnY = cos(((vU - 0.16) / 0.30) * 6.28318) * 0.65 * r1 + cos(((vU - 0.60) / 0.30) * 6.28318) * 0.65 * r2;
    rough = mix(0.82, 0.38, rail); metal = 0.78 * rail;
  }
#elif RMODE == 6
  // valla metálica de seguridad: postes cilíndricos cada 4,5 m, cables tensores y malla fina translúcida sin parpadeo
  float pf = fract(vV / 4.5);
  float postW = max(0.018, px * 0.35);
  float post = 1.0 - smoothstep(postW * 0.5, postW, min(pf, 1.0 - pf) * 4.5);
  float cable = max(smoothstep(0.955, 0.975, vU), max(1.0 - smoothstep(0.008, 0.018, abs(vU - 0.55)), 1.0 - smoothstep(0.008, 0.018, abs(vU - 0.25)))) * 0.82;
  // malla fina de alambre: suave con la distancia para que no forme barrotes negros ni moiré
  float wireFade = 1.0 - smoothstep(0.04, 0.38, px);
  float gx = abs(fract(vV * 5.0) - 0.5) * 2.0, gy = abs(fract(vU * 14.0) - 0.5) * 2.0;
  float wire = max(1.0 - smoothstep(0.0, 0.14 + px * 0.6, 1.0 - gx), 1.0 - smoothstep(0.0, 0.14 + px * 0.6, 1.0 - gy));
  float meshA = mix(0.055, 0.24 * wire + 0.04, wireFade) * (1.0 - smoothstep(0.6, 1.6, px));
  alpha = clamp(max(post, max(cable, meshA)), 0.0, 1.0);
  if (alpha < 0.02) discard;
  col = mix(SR(vec3(0.52, 0.55, 0.59)), SR(vec3(0.42, 0.45, 0.49)), post);
  dn = vTan * ((pf < 0.5 ? pf : pf - 1.0) * 4.5 / max(postW, 0.01)) * 0.7 * post;
  rough = mix(0.48, 0.38, post); metal = 0.65;
#elif RMODE == 7
  // paneles de publicidad: cada 7 m, una marca al azar; por detrás, trasera metálica con montantes (evita texto en espejo en Tele)
  float pi = floor(vV / 7.0), f = fract(vV / 7.0);
  if (!gl_FrontFacing) {
    float strut = 1.0 - smoothstep(0.03, 0.07, abs(fract(vV / 1.75) - 0.5));
    col = mix(SR(vec3(0.18, 0.20, 0.23)), SR(vec3(0.32, 0.35, 0.39)), strut * 0.7);
    rough = 0.65; metal = 0.45;
  } else {
    col = texture2D(uAds, vec2((floor(h21(vec2(pi, 3.7)) * 8.0) + (vDash > 0.5 ? 1.0 - f : f)) / 8.0, vU)).rgb;
    col *= 1.0 - 0.5 * step(f, 0.012);
    rough = 0.45; glow = 0.08; // los paneles se leen también a contraluz
  }
#elif RMODE == 8
  // hormigón de la zona de trabajo y del paddock: losas de 5 m con su tono, juntas de dilatación, manchas de aceite y
  // goma, y agua que se queda en las juntas
  vec4 d1 = texture2D(uDet, vXZ / 3.0), d2 = texture2D(uDet, vXZ / 17.0 + 0.4);
  float sc = floor(vV / 5.0), sfx = fract(vV / 5.0);
  col *= (0.72 + 0.56 * d1.r) * (0.85 + 0.3 * d2.r) * (0.9 + 0.18 * h21(vec2(sc, 1.0)));
  float jw = max(0.006, px * 0.15), jk = 1.0 - smoothstep(0.15, 0.6, px);
  float jx = 1.0 - smoothstep(jw, jw * 2.5, min(sfx, 1.0 - sfx) * 5.0);
  float joint = jx * jk;
  float oil = smoothstep(0.62, 0.8, vn(vXZ * 0.45 + 11.0)) * (0.5 + 0.5 * vn(vXZ * 2.1));
  col *= (1.0 - 0.55 * joint) * (1.0 - 0.4 * oil);
  dn = (d1.gb - 0.5) * 1.2 + vTan * (step(sfx, 0.5) - 0.5) * jx * 0.8 * jk;
  rough = clamp(0.82 + (d1.a - 0.5) * 0.2 - 0.3 * oil, 0.3, 1.0);
  float wetP = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).r;
  float damp = clamp(wetP * 1.5, 0.0, 1.0);
  col *= 1.0 - 0.35 * damp; rough = mix(rough, 0.2, damp * (0.5 + 0.5 * joint)); dn *= 1.0 - 0.6 * damp;
#elif RMODE == 9
  // escapatoria de asfalto pintado (Yas Marina, Austin, Miami, México, Baréin, Lusail, Barcelona, Spielberg…)
  const mat2 ASF_R = mat2(0.8, 0.6, -0.6, 0.8);
  vec4 d1a = texture2D(uDet, vXZ / 2.7), d1b = texture2D(uDet, ASF_R * vXZ / 3.3 + 0.47), d2 = texture2D(uDet, vXZ / 23.0 + 0.31);
  float dmix = smoothstep(0.25, 0.75, vn(vXZ * 0.13));
  vec4 d1 = mix(d1a, d1b, dmix);
  float wear = (0.86 + 0.28 * d1.r) * (0.92 + 0.16 * d2.r) * (0.94 + 0.12 * vn(vXZ * 0.07));
  float distM = max(0.0, vU);
  float aa = clamp(1.0 - smoothstep(0.55, 2.2, px), 0.0, 1.0);
  vec3 pcol = col;
  if (uRunPat > 0.5 && uRunPat < 1.5) {
    // franjas paralelas de alta adherencia (Yas Marina, Baréin, Lusail, México, Barcelona, Spielberg, Shanghái, Hungaroring)
    float ph = fract(distM / 4.4);
    float band = smoothstep(0.46, 0.54, ph);
    float sep = (1.0 - smoothstep(0.025, 0.08, abs(ph - 0.5))) * aa;
    pcol = mix(col, uRunAcc, mix(0.42, band, aa));
    pcol = mix(pcol, SR(vec3(0.90, 0.91, 0.92)), sep * 0.42 * smoothstep(0.8, 1.8, distM));
  } else if (uRunPat >= 1.5) {
    // bandas diagonales modernas (Austin, Miami, Madrid)
    float ph = fract(vV * 0.11 + distM * 0.20);
    float band = smoothstep(0.46, 0.54, ph);
    float sep = (1.0 - smoothstep(0.02, 0.075, min(ph, 1.0 - ph))) * aa;
    pcol = mix(col, uRunAcc, mix(0.42, band, aa));
    pcol = mix(pcol, SR(vec3(0.91, 0.91, 0.92)), sep * 0.48 * smoothstep(0.6, 1.6, distM));
  } else {
    // asfalto pintado liso con franja de acento en el borde interior
    float verge = 1.0 - smoothstep(1.2, 2.4, distM);
    pcol = mix(col, uRunAcc, verge * 0.65);
  }
  float innerW = smoothstep(0.15, 0.35, distM) * (1.0 - smoothstep(0.65, 0.95, distM)) * aa;
  pcol = mix(pcol, SR(vec3(0.88, 0.89, 0.90)), innerW * 0.58);
  float detFadeR = 1.0 - smoothstep(0.03, 0.28, px);
  col = pcol * wear;
  dn = (d1.gb - 0.5) * (0.85 * detFadeR) + (d2.gb - 0.5) * (0.22 * (0.35 + 0.65 * detFadeR));
  rough = clamp(0.82 + (mix(0.5, d1.a, detFadeR) - 0.5) * 0.14, 0.42, 0.96);
  float wetR = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).r;
  float dampR = clamp(wetR * 1.4, 0.0, 1.0);
  col *= 1.0 - 0.32 * dampR; rough = mix(rough, 0.18, dampR); dn *= 1.0 - 0.55 * dampR;
#else
  vec4 d1 = texture2D(uDet, vec2(vV, vWY) / 3.2);
  col *= (0.72 + 0.56 * d1.r) * (0.68 + 0.32 * smoothstep(0.0, 0.35, vU));
  dn = vTan * (d1.g - 0.5) * 1.4; dnY = (d1.b - 0.5) * 1.4;
  rough = 0.84 + (d1.a - 0.5) * 0.2;
  // muro del pit-lane: piezas prefabricadas de 6 m con su junta, tono propio y suciedad de las salpicaduras abajo
  float pc = fract(vV / 6.0), pj = 1.0 - smoothstep(0.004, 0.012, min(pc, 1.0 - pc) * 6.0 / max(1.0, px * 30.0));
  col *= (0.9 + 0.16 * h21(vec2(floor(vV / 6.0), 3.0))) * (1.0 - 0.45 * pj) * (1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.3, vU)) * vn(vec2(vV * 0.8, 1.0)));
  dn += vTan * (step(pc, 0.5) - 0.5) * pj * 0.9;
#endif
col *= 1.0 - uCloudShade * cloudS;
vec4 diffuseColor = vec4(col, alpha);
`;
const RIB_DET = [DET_U.hormigon, DET_U.asfalto, DET_U.asfalto, DET_U.hierba, DET_U.grava, null, null, null, DET_U.hormigon, DET_U.asfalto];
function ribbonMat(color, mode, po) {
  // Pista y pit-lane (modos 1 y 2) usan normales analíticas suaves (pendiente + peralte) para evitar facetado;
  // el resto de cintas conservan flatShading porque se deforman en el sombreador (muros, taludes, barreras).
  const smoothRoad = mode === 1 || mode === 2;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: !smoothRoad, side: THREE.DoubleSide, transparent: mode === 6, depthWrite: mode !== 6, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po });
  m.defines = { ...m.defines, RMODE: mode };
  const uDet = RIB_DET[mode] || { value: null };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uDet, uRock: DET_U.grava, uSkyZen: skyU.uZen, uSkyHor: skyU.uHor, uSkySun: skyU.uSun, uSkySunCol: skyU.uSunCol, uSkyCloud: skyU.uCloudCol, uSkyNight: skyU.uNight });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + RIB_VH)
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n#if RMODE == 1 || RMODE == 2\nobjectNormal = normalize(objectNormal - aSide * ((7.0 / max(uW, 1.0)) * aGeo.w));\n#endif")
      .replace("#include <begin_vertex>", RIB_VB);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + RIB_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", RIB_FB)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(rough, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(dn.x, dnY, dn.y));")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + col * (uFlood * (RMODE == 1 || RMODE == 2 || RMODE == 8 ? 0.55 : RMODE == 9 ? 0.42 : 0.2) + glow) + refC;");
  };
  m.customProgramCacheKey = () => "cinta" + mode;
  return m;
}

// dos mallas: la fina para verlo de cerca y una ligera para la vista de circuito y los dispositivos justos
const CAR_GEO = carGeometry(true), WHEEL_GEO = wheelGeometry(true), CAR_LO = carGeometry(false), WHEEL_LO = wheelGeometry(false), CAR_MIN = carMinGeometry();
// volante con las manos del piloto (gira con la dirección) y pantalla LED viva a bordo
const STEER_GEO = steerGeometry();
const STEER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
const srgb = (t) => { t.colorSpace = THREE.SRGBColorSpace; return t; };
const dashCv = document.createElement("canvas"); dashCv.width = 256; dashCv.height = 144;
const dashCtx = dashCv.getContext("2d"), dashTex = srgb(new THREE.CanvasTexture(dashCv));
const dashMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.118, 0.068).rotateY(-Math.PI / 2).translate(-0.022, 0.014, 0),
  new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false })
);
dashMesh.matrixAutoUpdate = false; dashMesh.visible = false; dashMesh.renderOrder = 11;
scene.add(dashMesh);
let dashT = -1e9, dashGear = 1, extCarGeo = null, extWheelGeo = null, steerPos = [0.92, 0.76, 0], camPos = [-0.10, 1.44];
// malla ligera en uso (la integrada o la del .glb) y la del .glb, para liberarla al cerrar
let carLoCur = CAR_LO, extCarLoGeo = null;
// a bordo, el volante del coche seguido algo más grande que el real: en móvil la pantalla se lee mejor
const DASH_K = 1.25;
const mTilt = new THREE.Matrix4().makeRotationZ(-0.24);
function drawDash(c) {
  const g = dashCtx, W = 256, H = 144;
  dashGear = c.v < 1 ? 1 : gearFor(c.v, dashGear);
  const rpm = c.v < 1 ? 4200 : rpmFor(c.v, dashGear);
  const leds = Math.round(clamp((rpm - 7600) / 4600, 0, 1) * 15);
  g.fillStyle = "#090b0f"; g.fillRect(0, 0, W, H);
  for (let j = 0; j < 15; j++) {
    g.fillStyle = j < leds ? (j < 5 ? "#33e05f" : j < 10 ? "#ff3b30" : "#56a0ff") : "#1b2029";
    g.fillRect(10 + j * 16, 8, 12, 14);
  }
  g.fillStyle = "#ffffff"; g.font = `900 72px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(c.v < 1 ? "N" : String(dashGear), W * 0.5, 68);
  g.textAlign = "left"; g.font = `700 20px ${FONT}`; g.fillStyle = "#9da3ad";
  g.fillText("KM/H", 14, 101);
  g.fillStyle = "#ffffff"; g.font = `900 34px ${FONT}`;
  g.fillText(String(Math.round((c.v || 0) * 3.6)), 12, 126);
  const soc = Math.round(clamp((c.soc ?? 0) / 4, 0, 1) * 100);
  g.textAlign = "right"; g.font = `900 26px ${FONT}`; g.fillStyle = "#33e05f";
  g.fillText(`${soc}%`, W - 14, 106);
  g.fillStyle = "#1c232e"; g.fillRect(W - 92, 124, 78, 10);
  g.fillStyle = soc < 20 ? "#ffd84a" : "#33e05f"; g.fillRect(W - 92, 124, Math.round((78 * soc) / 100), 10);
  const badge = sess.flag === "red" ? ["ROJA", "#e3261c", "#fff"]
    : sess.flag === "sc" || sess.flag === "sc_in" || sess.flag === "vsc" ? ["SC", "#ffd84a", "#000"]
    : c.loc === "pit" || c.loc === "lane_in" || c.loc === "lane_out" ? ["PIT", "#eef0f2", "#000"]
    : c.drs ? [sess.aidShort || "MO", "#33e05f", "#000"] : null;
  if (badge) {
    g.fillStyle = badge[1]; g.fillRect(W - 68, 34, 54, 24);
    g.fillStyle = badge[2]; g.font = `900 16px ${FONT}`; g.textAlign = "center";
    g.fillText(badge[0], W - 41, 47);
  }
  dashTex.needsUpdate = true;
}
// dorsales: una lámina con todos los números y tres pegatinas por coche (morro y los dos lados de la aleta)
const NUM_COLS = 8, NUM_ROWS = 4;
const DECAL_GEO = (() => {
  const pos = [], uv = [];
  const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
  quad([2.0, 0.45, 0.09], [2.0, 0.45, -0.09], [2.36, 0.335, -0.085], [2.36, 0.335, 0.085]);         // morro, se lee desde delante
  quad([-1.5, 0.75, 0.021], [-1.12, 0.75, 0.021], [-1.12, 0.92, 0.021], [-1.5, 0.92, 0.021]);     // aleta, lado derecho
  quad([-1.12, 0.75, -0.021], [-1.5, 0.75, -0.021], [-1.5, 0.92, -0.021], [-1.12, 0.92, -0.021]); // aleta, lado izquierdo
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
})();
const LIV_TEX = liveryTexture(TEAMS);
const CAR_MAT = makeCarMaterial(LIV_TEX, U), WHEEL_MAT = makeWheelMaterial();
/** Datos de cada coche que comparten sus mallas (la fina, la ligera y la mínima): segundo color, estado empaquetado (librea/daños/DRS/luz) y casco. */
const CAR_INST = ["aCol2", "aCarData", "aHelm", "aHelm2"];
// Sombra de contacto suave bajo el fondo plano y las cuatro ruedas: ancla el coche al asfalto en todas las calidades
// (también con luz nublada, de noche o bajo el voladizo de los boxes, donde la sombra del sol se despega).
const blobTex = (() => {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
  const g = cv.getContext("2d");
  const spot = (cx, cy, rx, ry, a) => {
    g.save(); g.translate(cx, cy); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0.15, 0, 0, 1);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${(a * 0.55).toFixed(3)})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  spot(62, 32, 54, 24, 0.42); // halo suave general
  spot(58, 32, 38, 16, 0.72); // fondo plano
  spot(108, 32, 14, 21, 0.38); // alerón delantero
  for (const [wx, wy] of [[95, 14], [95, 50], [30, 14], [30, 50]]) spot(wx, wy, 10, 8, 0.78); // apoyo de las cuatro ruedas
  const t = new THREE.CanvasTexture(cv); t.needsUpdate = true;
  return t;
})();
const BLOB_GEO = new THREE.PlaneGeometry(6.8, 2.9).rotateX(-Math.PI / 2).translate(0.15, 0, 0);
const BLOB_MAT = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
const RING_GEO = new THREE.RingGeometry(1.0, 1.13, 48).rotateX(-Math.PI / 2);
// Estela de agua: una nube de jirones por coche. Cada jirón es un cuadro que mira a la cámara, nace pegado a las
// ruedas traseras y al difusor, y se va quedando atrás mientras sube, se abre y se deshace. Todo ocurre en el
// sombreador: por jirón solo se guarda dónde está su coche, hacia dónde va y con cuánta agua.
const SPRAY_P = 20;
const SPRAY_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0.7, 0.75, 0.8) } },
  transparent: true, depthWrite: false,
  vertexShader: `attribute vec3 aCar, aDir; attribute vec4 aPar; attribute float aSpl; uniform float uTime; varying vec2 vQ; varying float vA, vSeed, vPh;
    void main(){
      float seed = aPar.z, k = aPar.y, L = aPar.w;
      float ph = fract(seed * 7.31 + uTime * (0.6 + 0.5 * fract(seed * 3.7)));   // vida del jirón: 0 recién levantado, 1 deshecho
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), aDir));
      // unos tres de cada diez son los chorros de las ruedas traseras: estrechos, bajos y pegados a cada rueda; el
      // resto, la nube del difusor que sube y se abre detrás
      float wheel = step(fract(seed * 17.3), 0.3), ws = fract(seed * 29.1) < 0.5 ? -1.0 : 1.0;
      float lat = mix((fract(seed * 13.7) - 0.5) * 2.0, ws * (0.75 + 0.15 * fract(seed * 5.9)), wheel);
      // en un charco (aSpl) el agua sale disparada más alta y más abierta, y cae antes
      float up = (1.0 + 1.6 * fract(seed * 5.3)) * (1.0 + 1.4 * aSpl) * (1.0 - 0.4 * aSpl * ph * ph) * (1.0 - 0.55 * wheel);
      vec3 c = aCar - aDir * (1.7 * k + ph * L * (1.0 - 0.3 * aSpl) * (1.0 - 0.45 * wheel)) + side * lat * k * (0.7 + ph * mix(1.7, 0.5, wheel) * (1.0 + 0.6 * aSpl))
        + vec3(0.0, k * (0.3 + ph * up), 0.0);
      float size = k * (1.3 + ph * 4.8) * (0.75 + 0.5 * fract(seed * 9.1)) * (1.0 + 0.25 * aSpl) * (1.0 - 0.35 * wheel);
      // cada jirón gira despacio y, recién levantado, es más ancho que alto (una lámina de agua pegada al suelo)
      float an = seed * 40.0 + ph * (fract(seed * 3.3) - 0.5) * 3.0;
      vec2 sxy = vec2(1.0 + 0.35 * (1.0 - ph), 0.7 + 0.3 * ph);
      vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * sxy * size;
      gl_Position = projectionMatrix * mv;
      vQ = mat2(cos(an), sin(an), -sin(an), cos(an)) * (position.xy * 2.0); vSeed = seed; vPh = ph;
      vA = min(1.0, aPar.x * (1.0 + 0.4 * aSpl)) * smoothstep(0.0, 0.07, ph) * pow(1.0 - ph, 1.3) * (1.0 + 0.3 * wheel);
    }`,
  fragmentShader: `uniform vec3 uCol; varying vec2 vQ; varying float vA, vSeed, vPh;` + GLSL_NOISE + `
    void main(){
      float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
      // bruma con ruido deformado (no un disco): al envejecer se deshilacha y se queda en jirones sueltos
      vec2 q = vQ * 1.6 + vSeed * 37.0;
      q += vec2(vn(q * 1.3 + 5.1), vn(q * 1.3 - 2.7)) * 1.4;
      float n = vn(q) * 0.55 + vn(q * 2.3 + 1.7) * 0.3 + vn(q * 5.1 - 4.2) * 0.15;
      float soft = (1.0 - r2) * (1.0 - r2);
      float a = vA * soft * smoothstep(0.2 + 0.3 * vPh, 0.78, n + 0.4 * (1.0 - r2)) * 0.75;
      // el agua al sol se ve clara, pero sin pasar del blanco apagado: el resplandor (bloom) no la convierte en luz
      gl_FragColor = vec4(min(uCol * 1.15, vec3(0.78)) * (0.8 + 0.35 * n), a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

// coche de seguridad: un deportivo plateado con la barra de luces en el techo (x hacia delante, metros)
const SC_GEO = (() => {
  const c = collect(), SIL = [0.72, 0.74, 0.78], DARK = [0.06, 0.06, 0.07], GLASS = [0.03, 0.04, 0.05], GRN = [0.1, 0.55, 0.3];
  const ring = (x, yc, hw, hT, hB, e = 3, N = 24) => { const r = []; for (let j = 0; j < N; j++) { const a = (j / N) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a), k = Math.pow(Math.pow(Math.abs(cy), e) + Math.pow(Math.abs(sz), e), -1 / e); r.push([x, yc + (cy >= 0 ? hT : hB) * cy * k, hw * sz * k]); } return r; };
  const body = [[2.35, 0.42, 0.75, 0.1, 0.18], [2.1, 0.47, 0.93, 0.2, 0.28], [1.3, 0.53, 0.98, 0.22, 0.34], [0, 0.56, 0.99, 0.25, 0.37], [-1.3, 0.58, 0.99, 0.27, 0.37], [-2.05, 0.58, 0.95, 0.24, 0.34], [-2.35, 0.58, 0.86, 0.17, 0.28]];
  skin(c, body.map((q) => ring(...q)), (u, r, p) => (p[1] < 0.32 ? DARK : Math.abs(p[2]) > 0.9 && p[1] < 0.55 && p[1] > 0.45 ? GRN : SIL));
  const cab = [[1.0, 0.8, 0.78, 0.02, 0.02], [0.45, 1.08, 0.72, 0.1, 0.1], [-0.55, 1.12, 0.7, 0.1, 0.1], [-1.5, 0.84, 0.74, 0.02, 0.02]];
  skin(c, cab.map((q) => ring(...q)), (u, r, p) => (p[1] > 1.15 ? SIL : GLASS));
  for (const [x, z] of [[1.42, 0.86], [1.42, -0.86], [-1.45, 0.86], [-1.45, -0.86]]) c.keep(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16).rotateX(Math.PI / 2).translate(x, 0.34, z), DARK);
  c.add(new THREE.BoxGeometry(0.22, 0.05, 1.05).translate(-0.35, 1.25, 0), DARK);
  return c.done();
})();
const SC_BAR = new THREE.BoxGeometry(0.2, 0.08, 1.0).translate(-0.35, 1.31, 0);
// Coche de seguridad del .glb (public/assets/models, scripts/prepara_safety_glb.py): fina de cerca y ligera de lejos.
// Mientras carga, o si no está, el de siempre (SC_GEO y SC_BAR). Las plantillas y los .glb se cachean a nivel de módulo;
// aquí solo se guardan los envoltorios GPU (materiales y texturas) propios de este renderer para liberarlos en dispose().
const envResDispose = [];
// bandera de comisario: mástil (oscuro) y paño que ondea (el color lo pone cada puesto)
const FLAG_GEO = (() => {
  const g = new THREE.PlaneGeometry(1.1, 0.75, 8, 2).translate(0.55, 2.05, 0);
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.5, 6).translate(0, 1.25, 0);
  const c = collect(); c.keep(pole, [0.12, 0.12, 0.12]); c.keep(g, [1, 1, 1]);
  return c.done();
})();
const FLAG_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
FLAG_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uTime: U.uTime });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat fw = max(position.x, 0.0); transformed.z += sin(uTime * 9.0 - position.x * 5.0) * 0.16 * fw; transformed.y -= 0.06 * fw * fw;");
};
// yate (eslora 1, se escala): casco en punta, franja oscura, cubierta de madera y dos cubiertas blancas con cristales
/**
 * Geometría de caras planas: cada cara, sus esquinas [x, y, z] (3 o 4) y hacia dónde mira (n); el orden de las esquinas
 * se corrige solo para que la normal salga hacia n.
 */
function facesGeo(faces) {
  const P = [], N = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (const [pts, n] of faces) {
    const tris = pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const t of tris) {
      a.fromArray(pts[t[0]]); b.fromArray(pts[t[1]]); c.fromArray(pts[t[2]]);
      nn.subVectors(b, a).cross(c.clone().sub(a));
      const flip = nn.dot(new THREE.Vector3(...n)) < 0, o = flip ? [a, c, b] : [a, b, c];
      for (const v of o) P.push(v.x, v.y, v.z);
      nn.normalize(); if (flip) nn.negate();
      for (let k = 0; k < 3; k++) N.push(nn.x, nn.y, nn.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  return g;
}
/** Caja abierta por abajo (x0..x1, y0..y1, z0..z1) como caras para facesGeo. */
const boxFaces = (x0, x1, y0, y1, z0, z1) => [
  [[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]], [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
  [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]], [[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]],
  [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]],
];
// Tejados de las manzanas lejanas (sobre la caja de 1 × 1 × 1 que escala cada instancia; arriba en y = 1). Solo con
// calidad 2 o 3: a dos aguas (Mónaco) o azotea con pretil, casetón de la escalera y una máquina de clima.
const CITY_GABLE = facesGeo([
  [[[-0.5, 1, -0.53], [0.5, 1, -0.53], [0.5, 1.1, 0], [-0.5, 1.1, 0]], [0, 1, -0.2]],
  [[[-0.5, 1, 0.53], [0.5, 1, 0.53], [0.5, 1.1, 0], [-0.5, 1.1, 0]], [0, 1, 0.2]],
  [[[-0.5, 1, -0.5], [-0.5, 1, 0.5], [-0.5, 1.1, 0]], [-1, 0, 0]],
  [[[0.5, 1, -0.5], [0.5, 1, 0.5], [0.5, 1.1, 0]], [1, 0, 0]],
]);
const CITY_TOP = (() => {
  const f = [...boxFaces(-0.22, 0.12, 1, 1.075, -0.12, 0.2), ...boxFaces(0.2, 0.34, 1, 1.03, -0.33, -0.18)];
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    // pretil: la cara de fuera (sigue la fachada) y la de dentro, a 2 centésimas
    for (const [r, k] of [[0.5, 1], [0.48, -1]]) {
      const pts = sx ? [[sx * r, 1, -0.5], [sx * r, 1, 0.5], [sx * r, 1.022, 0.5], [sx * r, 1.022, -0.5]] : [[-0.5, 1, sz * r], [0.5, 1, sz * r], [0.5, 1.022, sz * r], [-0.5, 1.022, sz * r]];
      f.push([pts, [sx * k, 0, sz * k]]);
    }
  }
  return facesGeo(f);
})();
const BOAT_GEO = (() => {
  const c = collect();
  const hull = new THREE.Shape([[-0.5, -0.11], [0.22, -0.11], [0.5, 0], [0.22, 0.11], [-0.5, 0.11]].map(([x, y]) => new THREE.Vector2(x, y)));
  const ex = (h, y0) => new THREE.ExtrudeGeometry(hull, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
  c.add(ex(0.04, -0.03), [0.05, 0.08, 0.2]);
  c.add(ex(0.08, 0.01), [0.92, 0.92, 0.94]);
  c.add(ex(0.008, 0.09).scale(0.97, 1, 0.92), [0.55, 0.38, 0.22]);
  c.add(new THREE.BoxGeometry(0.42, 0.07, 0.17).translate(-0.06, 0.13, 0), [0.93, 0.93, 0.95]);
  c.add(new THREE.BoxGeometry(0.4, 0.025, 0.175).translate(-0.06, 0.135, 0), [0.06, 0.08, 0.1]);
  c.add(new THREE.BoxGeometry(0.24, 0.05, 0.13).translate(-0.1, 0.19, 0), [0.93, 0.93, 0.95]);
  return c.done();
})();
// ------------------------------------------------------------------ paradas en boxes: mecánicos, gatos y ruedas
// Figuras sencillas mirando hacia +x: de pie (gatos y los que llevan las ruedas) y agachadas con la pistola.
// color de vértice: r = cuánto del color del equipo (el mono), b = cuánto del segundo color del equipo (casco, franja
// de los hombros y de las piernas: aCrew2, por mecánico), g = gris fijo (visera, guantes, botas)
const CREW_STAND = (() => {
  const c = collect(), T1 = [1, 0, 0], T2 = [0, 0, 1], BLK = [0, 0.05, 0];
  for (const z of [0.11, -0.11]) {
    c.add(new THREE.BoxGeometry(0.16, 0.85, 0.16).translate(0, 0.5, z), T1);
    c.add(new THREE.BoxGeometry(0.17, 0.62, 0.03).translate(0, 0.56, z * 1.73), T2); // franja de la pierna, por fuera
    c.add(new THREE.BoxGeometry(0.27, 0.1, 0.15).translate(0.04, 0.05, z), BLK);
  }
  c.add(new THREE.BoxGeometry(0.27, 0.62, 0.44).translate(0, 1.22, 0), T1);
  c.add(new THREE.BoxGeometry(0.28, 0.1, 0.46).translate(0, 1.48, 0), T2); // hombros
  for (const z of [0.29, -0.29]) { c.add(new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(0.07, 1.16, z), T1); c.add(new THREE.BoxGeometry(0.13, 0.08, 0.13).translate(0.07, 0.86, z), BLK); }
  c.keep(new THREE.SphereGeometry(0.15, 10, 8).translate(0.02, 1.7, 0), T2);
  c.add(new THREE.BoxGeometry(0.06, 0.07, 0.22).translate(0.14, 1.7, 0), BLK);
  return c.done();
})();
const CREW_CROUCH = (() => {
  const c = collect(), T1 = [1, 0, 0], T2 = [0, 0, 1], BLK = [0, 0.05, 0];
  for (const z of [0.12, -0.12]) {
    c.add(new THREE.BoxGeometry(0.14, 0.5, 0.14).translate(-0.22, 0.25, z), T1);
    c.add(new THREE.BoxGeometry(0.52, 0.16, 0.16).translate(0.0, 0.52, z), T1);
    c.add(new THREE.BoxGeometry(0.5, 0.04, 0.17).translate(0.0, 0.61, z), T2); // franja del muslo
  }
  c.add(new THREE.BoxGeometry(0.27, 0.56, 0.42).rotateZ(-0.5).translate(-0.04, 0.9, 0), T1);
  c.add(new THREE.BoxGeometry(0.28, 0.1, 0.44).rotateZ(-0.5).translate(0.08, 1.14, 0), T2); // hombros
  for (const z of [0.2, -0.2]) c.add(new THREE.BoxGeometry(0.46, 0.11, 0.11).translate(0.3, 0.92, z), T1);
  c.add(new THREE.BoxGeometry(0.32, 0.15, 0.15).translate(0.6, 0.88, 0), BLK);
  c.keep(new THREE.SphereGeometry(0.15, 10, 8).translate(0.2, 1.26, 0), T2);
  c.add(new THREE.BoxGeometry(0.05, 0.07, 0.2).translate(0.33, 1.27, 0), BLK); // visera
  return c.done();
})();
/** El segundo color de cada mecánico (casco y franjas): un atributo por instancia, con un color de partida. */
function crewAttr(geo, n, hex) {
  const a = new Float32Array(n * 3), c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("aCrew2", new THREE.InstancedBufferAttribute(a, 3).setUsage(THREE.DynamicDrawUsage));
  return geo;
}
// gato: la barra con sus ruedecillas, desde el coche (x = 0) hasta las manos del mecánico
const JACK_GEO = (() => {
  const c = collect();
  c.add(new THREE.BoxGeometry(1.4, 0.07, 0.08).rotateZ(0.48).translate(0.62, 0.46, 0), [0.75, 0.12, 0.1]);
  c.add(new THREE.BoxGeometry(0.3, 0.12, 0.5).translate(0.05, 0.12, 0), [0.15, 0.15, 0.17]);
  for (const z of [0.2, -0.2]) c.keep(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2).translate(0.05, 0.07, z), [0.05, 0.05, 0.05]);
  return c.done();
})();
// grúa de pista: orugas, cabina y pluma que se estira hacia la pista (z < 0) con el gancho
const CRANE_GEO = (() => {
  const c = collect(), Y = [0.95, 0.75, 0.05], D = [0.1, 0.1, 0.11];
  c.add(new THREE.BoxGeometry(4.2, 0.9, 2.6).translate(0, 0.45, 0), D);
  c.add(new THREE.BoxGeometry(3.4, 1.4, 2.3).translate(0.2, 1.6, 0), Y);
  c.add(new THREE.BoxGeometry(1.4, 1.5, 1.1).translate(1.2, 3.0, 0.5), Y);
  c.add(new THREE.BoxGeometry(1.2, 0.8, 1.0).translate(1.2, 3.1, 0.5).scale(1.02, 1, 1.02), [0.08, 0.1, 0.12]);
  return c.done(); // la pluma y el cable se dibujan aparte: apuntan al coche en cada fotograma
})();
// brazo del piloto con el puño en alto (sale del habitáculo): mono del equipo y guante blanco
const FIST_GEO = (() => {
  const c = collect();
  c.add(new THREE.BoxGeometry(0.09, 0.5, 0.09).rotateZ(0.15).translate(0.62, 1.05, 0.16), [1, 0, 0]);
  c.keep(new THREE.SphereGeometry(0.075, 10, 8).translate(0.585, 1.33, 0.16), [0, 0.85, 0]);
  return c.done();
})();
// manta térmica de una rueda (coches en el garaje): negra con una franja del color del equipo
const BLANKET_GEO = (() => {
  const c = collect();
  c.keep(new THREE.CylinderGeometry(0.385, 0.385, 0.4, 20).rotateX(Math.PI / 2), [0, 0.07, 0]);
  c.keep(new THREE.CylinderGeometry(0.39, 0.39, 0.1, 20, 1, true).rotateX(Math.PI / 2), [1, 0, 0]);
  return c.done();
})();
// Semáforo de salida de la parada (x = 0 delante del morro, el coche hacia x < 0): poste desde el lado del garaje
// (z > 0), brazo sobre el morro y una pértiga hacia atrás sobre el coche de la que cuelgan las mangueras de las
// cuatro pistolas. La carcasa lleva tres ópticas con su visera; las luces van aparte (GLIT_GEO).
const GANTRY_GEO = (() => {
  const c = collect(), D = [0.12, 0.12, 0.13], K = [0.035, 0.035, 0.04], Y = [0.75, 0.6, 0.08];
  c.add(new THREE.BoxGeometry(0.12, 3.3, 0.12).translate(0, 1.65, 1.9), D);
  c.add(new THREE.BoxGeometry(0.12, 0.12, 2.25).translate(0, 3.25, 0.82), D);
  c.add(new THREE.BoxGeometry(0.4, 0.06, 0.4).translate(0, 0.03, 1.9), D);
  c.add(new THREE.BoxGeometry(4.6, 0.09, 0.09).translate(-2.3, 3.25, 0.35), D);
  c.add(new THREE.BoxGeometry(0.3, 0.06, 0.3).translate(0, 3.2, 1.9), Y); // franja de aviso
  // carcasa del semáforo: cuerpo negro, tres viseras inclinadas hacia el piloto y el soporte
  c.add(new THREE.BoxGeometry(0.2, 0.8, 0.32).translate(0, 2.8, 0), K);
  c.add(new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0, 3.22, 0), D);
  for (const y of [3.02, 2.8, 2.58]) c.add(new THREE.BoxGeometry(0.17, 0.025, 0.3).rotateZ(-0.35).translate(-0.17, y + 0.11, 0), K);
  // mangueras: de la pértiga a cada pistola, colgando con su comba
  for (const [gx, ax] of [[-0.9, -0.5], [-4.4, -4.1]]) for (const sz of [1, -1]) {
    const a = new THREE.Vector3(ax, 3.2, 0.35), b = new THREE.Vector3(gx, 0.55, sz * 1.45);
    const m = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0.25, -0.55, sz * 0.15));
    const cv = new THREE.CatmullRomCurve3([a, a.clone().lerp(m, 0.55).add(new THREE.Vector3(0, -0.2, 0)), m, b]);
    c.keep(new THREE.TubeGeometry(cv, 14, 0.028, 5, false), [0.03, 0.03, 0.035]);
  }
  return c.done();
})();
// las tres luces del semáforo (rojo, ámbar, verde), mirando al piloto: cuadros con su halo, que se suman a la escena
const GLIT_GEO = (() => {
  const P = [], UV = [], L = [];
  [3.02, 2.8, 2.58].forEach((y, k) => {
    const r = 0.2;
    for (const [z, yy, u, v] of [[-r, y - r, 0, 0], [r, y - r, 1, 0], [r, y + r, 1, 1], [-r, y - r, 0, 0], [r, y + r, 1, 1], [-r, y + r, 0, 1]]) { P.push(-0.105, yy, z); UV.push(u, v); L.push(k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute("aLens", new THREE.Float32BufferAttribute(L, 1));
  return g;
})();
const GLIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
GLIT_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aLens; varying float vLens; varying vec2 vQ;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLens = aLens; vQ = uv * 2.0 - 1.0;");
  // el color de cada instancia dice qué óptica va encendida: r roja, g ámbar, b verde
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vLens; varying vec2 vQ;")
    .replace("#include <color_fragment>", `
      float d = length(vQ);
      vec3 hue = vLens < 0.5 ? vec3(1.0, 0.05, 0.02) : vLens < 1.5 ? vec3(1.0, 0.5, 0.04) : vec3(0.08, 1.0, 0.25);
      float on = vLens < 0.5 ? vColor.r : vLens < 1.5 ? vColor.g : vColor.b;
      float core = 1.0 - smoothstep(0.3, 0.38, d), ring = smoothstep(0.24, 0.36, d) * core, halo = exp(-d * d * 6.0) * (1.0 - core);
      diffuseColor.rgb = hue * (core * (0.05 + on * (3.2 - 1.4 * ring)) + halo * 0.85 * on) * step(d, 1.0);`);
};
GLIT_MAT.customProgramCacheKey = () => "semaforo-boxes";
const CREW_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
CREW_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aCrew2;")
    .replace("#include <color_vertex>", "vColor = vec4(instanceColor.rgb * pow(color.r, 2.2) + aCrew2 * pow(color.b, 2.2) + vec3(pow(color.g, 2.2)), 1.0);");
};
const JACK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });

// ------------------------------------------------------------------ humo y polvo
// Partículas sueltas (bloqueos, trompos, grava, accidentes): nacen en las ruedas, suben, se abren y se deshacen.
const PN = 1600;
const parts = { n: 0, x: new Float32Array(PN * 3), v: new Float32Array(PN * 3), age: new Float32Array(PN), life: new Float32Array(PN), s0: new Float32Array(PN), s1: new Float32Array(PN), c: new Float32Array(PN * 3), a: new Float32Array(PN), up: new Float32Array(PN) };
function emit(x, y, z, vx, vy, vz, s0, s1, life, r, g, b, a, up) {
  if (parts.n >= PN) return;
  const i = parts.n++;
  parts.x.set([x, y, z], i * 3); parts.v.set([vx, vy, vz], i * 3); parts.c.set([r, g, b], i * 3);
  parts.age[i] = 0; parts.life[i] = life; parts.s0[i] = s0; parts.s1[i] = s1; parts.a[i] = a; parts.up[i] = up;
}
function stepParts(dt) {
  const P = parts, damp = Math.exp(-dt / 0.9);
  for (let i = 0; i < P.n; i++) {
    P.age[i] += dt;
    if (P.age[i] >= P.life[i]) {
      const j = --P.n;
      if (i !== j) {
        P.x.copyWithin(i * 3, j * 3, j * 3 + 3); P.v.copyWithin(i * 3, j * 3, j * 3 + 3); P.c.copyWithin(i * 3, j * 3, j * 3 + 3);
        P.age[i] = P.age[j]; P.life[i] = P.life[j]; P.s0[i] = P.s0[j]; P.s1[i] = P.s1[j]; P.a[i] = P.a[j]; P.up[i] = P.up[j];
      }
      i--; continue;
    }
    const k = i * 3;
    P.v[k] *= damp; P.v[k + 2] *= damp; P.v[k + 1] = P.v[k + 1] * damp + P.up[i] * dt;
    P.x[k] += P.v[k] * dt; P.x[k + 1] += P.v[k + 1] * dt; P.x[k + 2] += P.v[k + 2] * dt;
  }
}
const PUFF_MAT = new THREE.ShaderMaterial({
  uniforms: { uLum: { value: 1 } }, transparent: true, depthWrite: false,
  vertexShader: `attribute vec4 aP, aC; varying vec2 vQ; varying vec4 vC; varying float vSeed;
    void main(){ vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); mv.xy += position.xy * aP.w; gl_Position = projectionMatrix * mv;
      vQ = position.xy * 2.0; vC = aC; vSeed = fract(aP.x * 0.137 + aP.z * 0.291); }`,
  fragmentShader: `uniform float uLum; varying vec2 vQ; varying vec4 vC; varying float vSeed;` + GLSL_NOISE + `
    void main(){ float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
      float n = vn(vQ * 2.1 + vSeed * 41.0) * 0.65 + vn(vQ * 4.7 - vSeed * 17.0) * 0.35;
      float a = vC.a * (1.0 - r2) * smoothstep(0.2, 0.7, n + 0.4 * (1.0 - r2));
      gl_FragColor = vec4(vC.rgb * uLum * (0.8 + 0.35 * n), a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

// ------------------------------------------------------------------ chispas
// Saltan del patín del fondo en las rectas rápidas y donde la pista cambia de rasante (el coche toca abajo): puntos muy
// brillantes (se suman a la luz) que caen y se quedan atrás. De noche se ven mucho más.
const SPN = 700;
const sparks = { n: 0, x: new Float32Array(SPN * 3), v: new Float32Array(SPN * 3), age: new Float32Array(SPN), life: new Float32Array(SPN), sz: new Float32Array(SPN) };
function emitSpark(x, y, z, vx, vy, vz, sz, life) {
  if (sparks.n >= SPN) return;
  const i = sparks.n++;
  sparks.x.set([x, y, z], i * 3); sparks.v.set([vx, vy, vz], i * 3); sparks.age[i] = 0; sparks.life[i] = life; sparks.sz[i] = sz;
}
function stepSparks(dt) {
  const P = sparks;
  for (let i = 0; i < P.n; i++) {
    P.age[i] += dt;
    if (P.age[i] >= P.life[i]) {
      const j = --P.n;
      if (i !== j) { P.x.copyWithin(i * 3, j * 3, j * 3 + 3); P.v.copyWithin(i * 3, j * 3, j * 3 + 3); P.age[i] = P.age[j]; P.life[i] = P.life[j]; P.sz[i] = P.sz[j]; }
      i--; continue;
    }
    const k = i * 3, d = Math.exp(-dt * 2.5);
    P.v[k] *= d; P.v[k + 2] *= d; P.v[k + 1] -= 9.8 * dt;
    P.x[k] += P.v[k] * dt; P.x[k + 1] = Math.max(P.x[k + 1] + P.v[k + 1] * dt, P.x[k + 1] - 5); P.x[k + 2] += P.v[k + 2] * dt;
  }
}
const SPARK_MAT = new THREE.ShaderMaterial({
  uniforms: { uNight: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  // cada chispa es una estela alargada en la dirección en que vuela (en pantalla)
  vertexShader: `attribute vec4 aP, aV; varying vec2 vQ; varying float vA;
    void main(){ vec4 mv = viewMatrix * vec4(aP.xyz, 1.0); vec2 dv = (viewMatrix * vec4(aV.xyz, 0.0)).xy;
      float l = length(dv); vec2 d = l > 1e-4 ? dv / l : vec2(1.0, 0.0), n = vec2(-d.y, d.x);
      float len = clamp(l * 0.03, aP.w, aP.w * 9.0);
      mv.xy += d * position.x * len + n * position.y * aP.w; gl_Position = projectionMatrix * mv; vQ = position.xy * 2.0; vA = aV.w; }`,
  fragmentShader: `uniform float uNight; varying vec2 vQ; varying float vA;
    void main(){ float r = vQ.y * vQ.y + 0.3 * vQ.x * vQ.x; if (r > 1.0) discard; float k = (1.0 - r) * vA * (0.6 + 1.6 * uNight);
      gl_FragColor = vec4(vec3(4.0, 2.2, 0.8) * k, k);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

// ------------------------------------------------------------------ huellas: goma, tierra y grava
// Cada huella es un tramo entre dos puntos guardados en coordenadas de pista (s y lado en anchuras), así siguen en su
// sitio aunque la pista se ensanche al alejar la cámara. Se borran poco a poco con el reloj de la sesión.
const MK = 2400, MK_LIFE = [900, 260, 600]; // goma, grava, tierra (s de sesión)
const MK_COL = [[0.025, 0.025, 0.03, 0.8], [0.6, 0.53, 0.4, 0.75], [0.14, 0.1, 0.06, 0.7]];
const marks = { n: 0, head: 0, s0: new Float32Array(MK), l0: new Float32Array(MK), s1: new Float32Array(MK), l1: new Float32Array(MK), w: new Float32Array(MK), t: new Float32Array(MK), k: new Uint8Array(MK), dirty: true };
function addMark(s0, l0, s1, l1, w, t, kind) {
  const i = marks.head; marks.head = (marks.head + 1) % MK; marks.n = Math.min(MK, marks.n + 1);
  marks.s0[i] = s0; marks.l0[i] = l0; marks.s1[i] = s1; marks.l1[i] = l1; marks.w[i] = w; marks.t[i] = t; marks.k[i] = kind; marks.dirty = true;
}
const MARK_MAT = new THREE.ShaderMaterial({
  uniforms: { uLum: PUFF_MAT.uniforms.uLum }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
  vertexShader: `attribute vec4 aA, aB, aC; varying vec2 vQ; varying vec4 vC;
    void main(){ vec3 d = aB.xyz - aA.xyz; vec3 sd = normalize(cross(vec3(0.0, 1.0, 0.0), d + vec3(1e-4, 0.0, 0.0)));
      vec3 p = mix(aA.xyz, aB.xyz, position.x + 0.5) + sd * position.y * aA.w + vec3(0.0, 0.04, 0.0);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); vQ = position.xy * 2.0; vC = aC; }`,
  fragmentShader: `uniform float uLum; varying vec2 vQ; varying vec4 vC;
    void main(){ float e = 1.0 - smoothstep(0.55, 1.0, abs(vQ.y)); gl_FragColor = vec4(vC.rgb * uLum, vC.a * e);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

// ------------------------------------------------------------------ pista
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function blur(src, win, n) {
  const out = new Float32Array(n);
  let acc = 0; for (let k = -win; k <= win; k++) acc += src[mod(k, n)];
  for (let i = 0; i < n; i++) { out[i] = acc / (2 * win + 1); acc += src[mod(i + win + 1, n)] - src[mod(i - win, n)]; }
  return out;
}
function buildTrackData(tr, id, envData) {
  const n = tr.xs.length, ds = tr.ds, L = tr.length;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < n; i++) { minx = Math.min(minx, tr.xs[i]); maxx = Math.max(maxx, tr.xs[i]); miny = Math.min(miny, tr.ys[i]); maxy = Math.max(maxy, tr.ys[i]); }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, E = Math.max(maxx - minx, maxy - miny);
  const X = new Float32Array(n), Z = new Float32Array(n);
  let H = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = tr.xs[i] - cx; Z[i] = -(tr.ys[i] - cy); }
  // altitud real (data/circuitos/*.json, campo «relieve»): muestras a distancia constante a lo largo de la vuelta
  const vis0 = getTrackVisual(id);
  const rel = tr.def.relieve?.m, lerpLap = (a, f) => { const x = f * a.length, i0 = Math.floor(x); return a[i0 % a.length] + (a[(i0 + 1) % a.length] - a[i0 % a.length]) * (x - i0); };
  if (rel) for (let i = 0; i < n; i++) H[i] = lerpLap(rel, i / n);
  H = blur(H, Math.round(25 / ds), n);
  // cruce en «8» (Suzuka): separación vertical real entre el tablero superior y el paso inferior
  const ovp = vis0.overpass;
  const dCirc = (a, b) => Math.min(mod(a - b, L), mod(b - a, L));
  if (ovp) {
    const lift = ovp.liftOver ?? 4.4, dip = ovp.dipUnder ?? 2.6;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      H[i] += lift * (1 - sstep(35, 165, dCirc(s, ovp.sOver)));
      H[i] -= dip * (1 - sstep(25, 130, dCirc(s, ovp.sUnder)));
    }
  }
  let hmin = 1e9, hmean = 0;
  for (let i = 0; i < n; i++) hmin = Math.min(hmin, H[i]);
  for (let i = 0; i < n; i++) { H[i] -= hmin; hmean += H[i] / n; }
  // peraltes transversales visibles por circuito (Zandvoort, Madrid…)
  const bank = new Float32Array(n);
  if (vis0.bankings) for (const bk of vis0.bankings) {
    const rp = bk.ramp ?? 45;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      if (s >= bk.s0 && s <= bk.s1) bank[i] += bk.angle * sstep(bk.s0, bk.s0 + rp, s) * (1 - sstep(bk.s1 - rp, bk.s1, s));
    }
  }
  // cambios de rasante: donde la pista pasa de bajar a subir el coche se aplasta y toca abajo (chispas)
  const dip = new Float32Array(n);
  for (let i = 0; i < n; i++) dip[i] = Math.max(0, (H[(i + 3) % n] - 2 * H[i] + H[(i - 3 + n) % n]) / (9 * ds * ds));
  // terreno real alrededor (public/assets/env-tracks/<id>.json): altitud absoluta en una rejilla; el mar sale a 0 m o menos.
  // La pista del juego va referida a su punto más bajo: el desfase es la mediana de (terreno − pista) bajo el trazado.
  let env = null;
  const en = envData ?? tr.def.entorno;
  if (en) {
    const N = en.n, eh = en.h;
    const abs = (x, z) => {
      const gx = (x + cx - en.x0) / en.paso, gy = (-z + cy - en.y0) / en.paso;
      const i = clamp(Math.floor(gx), 0, N - 2), j = clamp(Math.floor(gy), 0, N - 2), fx = clamp(gx - i, 0, 1), fy = clamp(gy - j, 0, 1);
      return (eh[j * N + i] * (1 - fx) + eh[j * N + i + 1] * fx) * (1 - fy) + (eh[(j + 1) * N + i] * (1 - fx) + eh[(j + 1) * N + i + 1] * fx) * fy;
    };
    const dif = [];
    for (let i = 0; i < n; i += 4) dif.push(abs(X[i], Z[i]) - H[i]);
    dif.sort((a, b) => a - b);
    const off = dif[dif.length >> 1];
    const wLvl = en.aguaNivel ?? 0;
    let wMask = null, hasWater = false;
    if (en.agua) {
      const raw = atob(en.agua);
      wMask = new Uint8Array(N * N);
      for (let k = 0; k < N * N; k++) {
        const bit = (raw.charCodeAt(k >> 3) >> (k & 7)) & 1;
        wMask[k] = bit;
        if (bit) hasWater = true;
      }
    } else if (en.tipo === "urbano") {
      for (let k = 0; k < N * N; k++) if (eh[k] <= 0) { hasWater = true; break; }
    }
    const wet = (x, z) => {
      if (!hasWater) return false;
      if (!wMask) return abs(x, z) <= 0.6;
      const gx = (x + cx - en.x0) / en.paso, gy = (-z + cy - en.y0) / en.paso;
      const i = clamp(Math.floor(gx), 0, N - 2), j = clamp(Math.floor(gy), 0, N - 2), fx = clamp(gx - i, 0, 1), fy = clamp(gy - j, 0, 1);
      const v = (wMask[j * N + i] * (1 - fx) + wMask[j * N + i + 1] * fx) * (1 - fy) + (wMask[(j + 1) * N + i] * (1 - fx) + wMask[(j + 1) * N + i + 1] * fx) * fy;
      return v >= 0.45;
    };
    let fMask = null, hasForest = false;
    if (en.bosque) {
      const raw = atob(en.bosque);
      fMask = new Uint8Array(N * N);
      let fCount = 0;
      for (let k = 0; k < N * N; k++) {
        const bit = (raw.charCodeAt(k >> 3) >> (k & 7)) & 1;
        fMask[k] = bit;
        if (bit) fCount++;
      }
      // Usar máscara OSM estricta solo cuando cubre >= 6 % del mapa (Spa, Spielberg, Monza, Hungaroring, Silverstone, Suzuka, Barcelona, Montreal)
      hasForest = fCount >= N * N * 0.06;
    }
    const forest = (x, z) => {
      if (!hasForest || !fMask) return -1;
      const gx = (x + cx - en.x0) / en.paso, gy = (-z + cy - en.y0) / en.paso;
      if (gx < 0 || gy < 0 || gx > N - 1 || gy > N - 1) return 0.5;
      const i = clamp(Math.floor(gx), 0, N - 2), j = clamp(Math.floor(gy), 0, N - 2), fx = clamp(gx - i, 0, 1), fy = clamp(gy - j, 0, 1);
      return (fMask[j * N + i] * (1 - fx) + fMask[j * N + i + 1] * fx) * (1 - fy) + (fMask[(j + 1) * N + i] * (1 - fx) + fMask[(j + 1) * N + i + 1] * fx) * fy;
    };
    env = { en, abs, at: (x, z) => abs(x, z) - off, sea: wLvl - off, hasWater, wMask, wet, hasForest, forest, pitPts: en.pit || null, gradas: en.gradas || null };
  }
  let sxx = 0, szz = 0, sxz = 0;
  for (let i = 0; i < n; i++) { sxx += X[i] * X[i]; szz += Z[i] * Z[i]; sxz += X[i] * Z[i]; }
  const axis = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  // trazada: por fuera antes y después de la curva, por dentro en el vértice (curvatura > 0 = a izquierdas)
  const nk = new Float32Array(n);
  for (let i = 0; i < n; i++) nk[i] = Math.tanh(tr.curv[i] / 0.011);
  const wide = blur(blur(nk, Math.round(110 / ds), n), Math.round(110 / ds), n);
  // la trazada y la anchura las calcula la simulación (track.ts): los coches van donde ella dice
  const line = tr.line;
  // trazado urbano de competición (muros pegados y calles) separado del entorno visual ("urbano" | "semiurbano" | "circuito")
  const street = tr.def.urbano !== undefined ? !!tr.def.urbano : en?.tipo === "urbano";
  // anchura real por punto (campo «ancho»), como proporción de la media: también de la simulación
  const wr = tr.wr;
  W_REAL = tr.wReal;
  const PS = tr.def.boxes.lado === "izquierda" ? -1 : 1; // lado de los boxes: +1 derecha
  const absk = new Float32Array(n);
  for (let i = 0; i < n; i++) absk[i] = wide[i];
  const sw = blur(absk, Math.round(40 / ds), n);
  const rL = new Float32Array(n), rR = new Float32Array(n);
  const shBase = street ? 1.22 : 1.7;
  for (let i = 0; i < n; i++) {
    const s = i * ds, p = tr.pit, inPit = s >= p.entry - 60 || s <= p.exit + 60;
    const r = street ? 0 : clamp((Math.abs(sw[i]) - 0.1) * 60, 0, 26);
    if (sw[i] > 0) rR[i] = r; else rL[i] = r; // a izquierdas: el exterior es la derecha
    if (inPit) (PS > 0 ? rR : rL)[i] = 0;
    if (ovp && dCirc(s, ovp.sOver) < (ovp.halfSpan ?? 52) + 14) { rL[i] = 0; rR[i] = 0; }
  }
  // Recorte geométrico de seguridad: ninguna escapatoria ni muro puede invadir un tramo paralelo de pista (ej. Miami T17-T19)
  if (!street) {
    const minArc = Math.round(180 / ds), safeGap = (shBase + 1.0) * W_REAL + 5.5;
    let clampedAny = false;
    for (let i = 0; i < n; i++) {
      if (rL[i] <= 0.5 && rR[i] <= 0.5) continue;
      if (ovp && (dCirc(i * ds, ovp.sOver) < 120 || dCirc(i * ds, ovp.sUnder) < 120)) continue;
      const i0 = (i - 1 + n) % n, i1 = (i + 1) % n;
      const tx = X[i1] - X[i0], tz = Z[i1] - Z[i0], tl = Math.hypot(tx, tz) || 1;
      const rx = -tz / tl, rz = tx / tl;
      for (const sg of [-1, 1]) {
        const arr = sg > 0 ? rR : rL;
        if (arr[i] <= 0.5) continue;
        let maxR = arr[i];
        for (let j = 0; j < n; j += 3) {
          const arc = Math.min(Math.abs(j - i), n - Math.abs(j - i));
          if (arc < minArc) continue;
          const dx = X[j] - X[i], dz = Z[j] - Z[i];
          const lat = dx * rx * sg + dz * rz * sg;
          if (lat <= 0 || lat > maxR + safeGap + 12) continue;
          const lon = Math.abs(dx * (tx / tl) + dz * (tz / tl));
          if (lon > safeGap) continue;
          const allow = Math.max(0, lat - safeGap);
          if (allow < maxR) maxR = allow;
        }
        if (maxR < arr[i]) { arr[i] = maxR; clampedAny = true; }
      }
    }
    if (clampedAny) {
      const bL = blur(rL, Math.round(12 / ds), n), bR = blur(rR, Math.round(12 / ds), n);
      for (let i = 0; i < n; i++) { rL[i] = Math.min(rL[i], bL[i]); rR[i] = Math.min(rR[i], bR[i]); }
    }
  }
  const rP = PS > 0 ? rR : rL, rO = PS > 0 ? rL : rR; // escapatoria del lado de boxes y del otro
  return { dip, env, bank, SH: street ? 1.22 : 1.7, n, ds, L, E, Ex: maxx - minx, Ez: maxy - miny, cx, cy, X, Z, H, hmean, axis, line, rP, rO, PS, wr, street, Wov: Math.max(16, E * 0.0115) };
}
const _cr = { v: 0, d: 0 };
function cr(a, i, t, n) {
  const p0 = a[(i - 1 + n) % n], p1 = a[i], p2 = a[(i + 1) % n], p3 = a[(i + 2) % n];
  const c1 = -p0 + p2, c2 = 2 * p0 - 5 * p1 + 4 * p2 - p3, c3 = -p0 + 3 * p1 - 3 * p2 + p3;
  _cr.v = 0.5 * (2 * p1 + c1 * t + c2 * t * t + c3 * t * t * t);
  _cr.d = 0.5 * (c1 + 2 * c2 * t + 3 * c3 * t * t);
}
/** Punto del eje de la pista a la distancia s: posición, dirección de marcha (3D) y lado derecho. */
function sample(s, o) {
  const f = mod(s, T.L) / T.ds;
  let i = Math.floor(f); const t = f - i; if (i >= T.n) i = T.n - 1;
  cr(T.X, i, t, T.n); o.x = _cr.v; const dx = _cr.d;
  cr(T.Z, i, t, T.n); o.z = _cr.v; const dz = _cr.d;
  cr(T.H, i, t, T.n); o.y = _cr.v; const dy = _cr.d;
  const h = Math.hypot(dx, dz) || 1;
  o.rx = -dz / h; o.rz = dx / h;
  const l = Math.hypot(dx, dy, dz) || 1;
  o.tx = dx / l; o.ty = dy / l; o.tz = dz / l;
  return o;
}
const arrAt = (a, s) => { const f = mod(s, T.L) / T.ds, i = Math.min(T.n - 1, Math.floor(f)), t = f - i; return a[i] + (a[(i + 1) % T.n] - a[i]) * t; };
const mkS = () => ({ x: 0, y: 0, z: 0, tx: 1, ty: 0, tz: 0, rx: 0, rz: 1 });
function pitRamp(s) {
  const p = mod(s, T.L), ent = track.pit.entry, ex = track.pit.exit, R = 90;
  if (p >= ent) return sstep(0, 1, (p - ent) / R);
  if (p <= ex) return sstep(0, 1, (ex - p) / R);
  return 0;
}

// ------------------------------------------------------------------ decorado pegado a la pista
// La pista se ensancha al alejar la cámara (escala de maqueta), así que lo que va junto a ella se ensancha con ella:
// cada vértice guarda su punto de anclaje (aAnc), el lado de la pista (aSd), cuántas medias anchuras de pista le
// separan (aLw) y su forma en metros (position), que también crece de lejos (uS). El dibujo (público, cristal,
// ventanas, garajes, rótulos…) sale del sombreador según aPat = [dibujo, casilla o semilla, u, v].
U.uS = { value: 1 };
const PROP_VH = `attribute vec3 aAnc, aSd; attribute float aLw; attribute vec4 aPat; uniform float uW, uS, uTime; varying vec4 vPat; varying vec2 vWXZ; varying float vGroundY;`;
const PROP_VB = `vec3 transformed = aAnc + aSd * (uW * aLw) + position * uS; vPat = aPat; vWXZ = transformed.xz; vGroundY = position.y;
  if (abs(aPat.x - 11.0) < 0.5) transformed += aSd * sin(uTime * 7.0 - aPat.z * 4.0 + aPat.y) * 0.22 * aPat.z * uS; // banderas del público`;
const PROP_FH = GLSL_NOISE + `uniform float uFlood, uTexR, uFanK, uHiQ, uDay, uTime; uniform sampler2D uCloud, uSigns, uFacDet, uWallDet, uFanFlag; varying vec4 vPat; varying vec2 vWXZ; varying float vGroundY;
// al anochecer las ventanas se encienden poco a poco: cada una a partir de su propio umbral
float winOn(vec2 c){ return smoothstep(0.0, 0.06, uFlood * 1.3 - 0.05 - h21(c + 7.31) * 0.9) * 0.8; }
// lo mismo de media, para cuando las ventanas no se distinguen
float winAvg(){ return 0.8 * clamp((uFlood * 1.3 - 0.05) / 0.9, 0.0, 1.0); }
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
// Habitación detrás del cristal (interiores falsos): el rayo de la vista entra por el punto f (0..1) de una caja de
// cs.x × cs.y metros de frente y dep de fondo y choca con el fondo, una pared, el suelo o el techo. rv es el rayo en
// metros de la fachada (x a lo largo, y arriba, z hacia dentro). Devuelve lo que se ve con la luz de la ventana; en
// lamp, lo mismo con la lámpara del techo (de noche).
vec3 roomAt(vec2 f, vec2 cs, float dep, vec3 rv, vec2 id, out vec3 lamp){
  vec3 p0 = vec3(f * cs, 0.0), r = vec3(rv.xy, max(rv.z, 0.05));
  float tx = ((r.x > 0.0 ? cs.x : 0.0) - p0.x) / (abs(r.x) > 1e-4 ? r.x : 1e-4);
  float ty = ((r.y > 0.0 ? cs.y : 0.0) - p0.y) / (abs(r.y) > 1e-4 ? r.y : 1e-4);
  float tz = dep / r.z, t = min(min(tx, ty), tz);
  vec3 h = p0 + r * t;
  float hb = h21(id), hc = h21(id + 3.7);
  vec3 wall = SR(mix(vec3(0.84, 0.79, 0.70), vec3(0.64, 0.71, 0.78), hc)) * (0.72 + 0.3 * hb), c;
  if (t == tz) {
    float fx = h.x / cs.x;
    c = wall;
    // un mueble contra el fondo (estantería o sofá) en muchas habitaciones, o un cuadro
    if (hb > 0.35 && h.y < cs.y * (hb > 0.7 ? 0.62 : 0.3) && fx > 0.12 + 0.2 * hc && fx < 0.72 + 0.2 * hc) c = SR(vec3(0.26, 0.19, 0.13)) * (0.7 + 0.5 * hc);
    else if (hc > 0.5 && abs(h.y - cs.y * 0.6) < cs.y * 0.11 && abs(fx - 0.5) < 0.13) c = SR(hsv(hb, 0.45, 0.6));
  } else if (t == ty) c = r.y < 0.0 ? SR(vec3(0.32, 0.23, 0.16)) * (0.7 + 0.4 * hb) : SR(vec3(0.86));
  else c = wall * 0.8;
  // la luz de la ventana se apaga hacia el fondo; la de la lámpara, más arriba y en el centro
  lamp = c * (0.5 + 0.5 * smoothstep(0.0, cs.y, h.y)) * (1.0 - 0.4 * clamp(length(h.xz - vec2(cs.x * 0.5, dep * 0.45)) / dep, 0.0, 1.0));
  return c * (1.0 - 0.65 * clamp(h.z / dep, 0.0, 1.0));
}
vec3 signAt(float cell, vec2 uv){
  float cy = floor((cell + 0.5) / 4.0); vec2 c = vec2(floor(cell + 0.5) - 4.0 * cy, cy);
  vec2 t = vec2((c.x + clamp(fract(uv.x), 0.01, 0.99)) / 4.0, 1.0 - (c.y + 1.0 - clamp(uv.y, 0.02, 0.98)) / 8.0);
  vec2 dx = dFdx(uv) * vec2(512.0, 128.0), dy = dFdy(uv) * vec2(512.0, 128.0);
  float lod = clamp(0.5 * log2(max(dot(dx, dx), dot(dy, dy))), 0.0, 5.0); // sin pasar de 5: más allá se mezclan las casillas
  return textureLod(uSigns, t, lod).rgb;
}`;
// 0 liso · 1 público · 2 cristal · 3 garaje · 4 rótulo · 5 fachada clásica · 6 muro cortina · 7 celosía · 8 cubierta · 9 hormigón · 10 foco
const PROP_FB = `
float P = floor(vPat.x + 0.5), sd = floor(vPat.y + 0.5); vec2 uv = vPat.zw; // enteros: la interpolación no los mueve
float px = fwidth(uv.x) + fwidth(uv.y);
vec3 col = vColor.rgb; float rough = 0.85, metal = 0.0; vec3 glowC = vec3(0.0); vec2 pDn = vec2(0.0);
// Para los interiores: el rayo de la vista en el plano de la cara (metros de uv: x a lo largo, y arriba, z hacia
// dentro), sacado de cómo cambian la posición y uv de un píxel al siguiente. Solo con calidad 2 o 3 y de cerca (inK).
vec3 rv = vec3(0.0, 0.0, 1.0); float inK = 0.0;
{
  vec3 q1 = dFdx(-vViewPosition), q2 = dFdy(-vViewPosition); vec2 t1 = dFdx(uv), t2 = dFdy(uv);
  float det = t1.x * t2.y - t1.y * t2.x;
  if (uHiQ > 0.5 && abs(det) > 1e-12) {
    vec3 Pu = (q1 * t2.y - q2 * t1.y) / det, Pv = (q2 * t1.x - q1 * t2.x) / det;
    vec3 Nf = normalize(cross(Pu, Pv)); if (dot(Nf, vViewPosition) < 0.0) Nf = -Nf;
    vec3 rd = normalize(-vViewPosition);
    float lu = max(dot(Pu, Pu), 1e-8);
    rv = vec3(dot(rd, Pu) / lu, dot(rd, Pv) / max(dot(Pv, Pv), 1e-8), -dot(rd, Nf) * inversesqrt(lu));
    inK = 1.0 - smoothstep(0.1, 0.3, px);
  }
}
if (P > 0.5 && P < 1.5) {
  // gradas: filas de asientos (0,55 × 0,8 m) con gente de todos los colores; de lejos, su color medio
  vec2 g = uv / vec2(0.55, 0.8), c = floor(g), f = fract(g);
  float h = h21(c + sd * 13.1);
  vec3 shirt = SR(hsv(h21(c + 7.1), 0.1 + 0.5 * h21(c + 1.7) * h21(c + 5.9), 0.25 + 0.6 * h21(c + 3.3)));
  float body = step(0.15, h) * smoothstep(0.3, 0.22, length((f - vec2(0.5 + 0.12 * (h21(c + 2.2) - 0.5), 0.45)) * vec2(1.0, 0.6)));
  body = max(body, step(0.15, h) * smoothstep(0.16, 0.1, length(f - vec2(0.5, 0.82)))); // la cabeza
  shirt = mix(shirt, SR(vec3(0.85, 0.66, 0.52)) * (0.5 + 0.5 * h21(c + 4.4)), step(0.7, f.y));
  vec3 det = mix(col, shirt, body) * (0.55 + 0.45 * step(0.13, f.y));
  // pasillos de acceso cada 14 m: escalones de hormigón (dos por fila), sin nadie, con un pasamanos en medio
  float ax = fract((uv.x + sd * 3.1) / 14.0) * 14.0, aisle = step(ax, 1.3);
  float stp = fract(uv.y / 0.4);
  det = mix(det, SR(vec3(0.6, 0.61, 0.6)) * (0.72 + 0.28 * step(0.18, stp)) * (1.0 - 0.6 * step(abs(ax - 0.65), 0.03)), aisle);
  float farK = clamp(px * 2.2 - 0.35, 0.0, 1.0);
  // de lejos no se distingue a nadie: un tono apagado, casi el de la ropa media
  col = mix(det, mix(col, SR(vec3(0.36, 0.33, 0.31)), 0.82) * 0.85, farK);
  pDn = vec2(0.0, (step(0.18, mix(f.y, stp, aisle)) - 0.5) * 0.55 * (1.0 - farK)); // relieve de los escalones
  rough = 0.95;
} else if (P < 2.5) {
  // cristal con montantes cada 1,6 m y forjados cada 3,4 m; de noche, luz dentro
  vec2 g = uv / vec2(1.6, 3.4), c = floor(g), f = fract(g);
  float k = step(px, 0.6);
  float fr = max(step(f.x, 0.05), step(f.y, 0.08)) * k;
  col = mix(SR(vec3(0.12, 0.17, 0.22)) * (0.75 + 0.35 * f.y), SR(vec3(0.62, 0.64, 0.67)), fr);
  rough = mix(0.08, 0.5, fr); metal = mix(0.2, 0.6, fr);
  pDn = vec2((step(f.x, 0.07) - step(0.95, f.x)) * 0.35, (step(f.y, 0.1) - step(0.94, f.y)) * 0.4) * k;
  glowC = SR(vec3(1.0, 0.86, 0.62)) * step(0.35, h21(c + sd)) * (1.0 - fr) * winOn(c + sd) * (0.75 + 0.5 * f.y) * 1.35;
  if (inK > 0.0) {
    // salas de hospitalidad de dos módulos de fondo (6 m), con su luz encendida de día y de noche en muchas
    vec2 rid = vec2(floor(c.x / 2.0), c.y) + sd; vec3 lampI;
    vec3 inC = roomAt(vec2(fract(g.x / 2.0), f.y), vec2(3.2, 3.4), 6.0, rv, rid, lampI);
    float on = step(0.35, h21(rid)) * max(0.35, winOn(rid) * 1.25);
    vec3 glass = (inC * uDay * 0.32 + lampI * SR(vec3(1.0, 0.9, 0.74)) * on * 0.9) * (1.0 - fr);
    col = mix(col, mix(SR(vec3(0.02, 0.025, 0.03)), col, fr), inK); metal = mix(metal, metal * fr, inK); rough = mix(rough, mix(0.04, 0.5, fr), inK);
    glowC = mix(glowC, glass, inK);
  }
} else if (P < 3.5) {
  // garaje abierto: en penumbra, con el color del equipo en los paneles del fondo, estanterías de ruedas y luces en el techo
  float lt = step(4.3, uv.y) * step(0.2, fract(uv.x / 2.2)) * step(uv.y, 4.7);
  float band = step(0.9, uv.y) * step(uv.y, 2.6), tyre = step(0.3, uv.y) * step(uv.y, 1.9) * step(0.7, fract(uv.x / 3.0)) * step(0.5, fract(uv.y / 0.4) + 0.2);
  col = mix(vec3(0.012), col * 0.12, band); col = mix(col, vec3(0.01), tyre); rough = 0.9;
  glowC = vColor.rgb * 0.02 * band + vec3(1.0, 0.97, 0.9) * lt * 1.9;
} else if (P < 4.5) {
  col = signAt(sd, uv); rough = 0.5; glowC = col * (0.05 + 0.55 * uFlood);
} else if (P < 5.5) {
  // fachada de ciudad: planta baja de tiendas y pisos de 3,1 m con estuco PBR, relieve, ventanas, contraventanas y balcones
  vec4 fd = texture2D(uFacDet, uv / 5.5);
  col *= (0.76 + 0.48 * fd.r) * (0.9 + 0.1 * vn(uv * 0.35 + sd));
  rough = clamp(0.68 + (fd.a - 0.5) * 0.35, 0.35, 0.95);
  pDn = (fd.gb - 0.5) * 1.45;
  float arcade = step(h21(vec2(sd, 17.0)), 0.3); // soportales en unas tres de cada diez
  if (uv.y < 4.0 && arcade > 0.5) {
    // planta baja porticada: arcos de medio punto cada 4 m sobre pilares, con el portal en sombra y los escaparates al fondo
    float fx = fract(uv.x / 4.0), ax2 = (fx - 0.57) / 0.43;
    float pil = step(fx, 0.14), archY = 2.75 + 0.95 * sqrt(max(0.0, 1.0 - ax2 * ax2));
    float hole = (1.0 - pil) * step(uv.y, archY);
    float edge = (1.0 - pil) * step(archY, uv.y) * step(uv.y, archY + 0.25);
    col *= 1.0 - 0.12 * edge;
    vec3 inner = SR(vec3(0.07, 0.065, 0.06)) + col * 0.16 * smoothstep(0.0, 2.0, uv.y);
    float shop = step(0.5, uv.y) * step(uv.y, 2.6) * step(0.25, fx) * step(fx, 0.9);
    inner = mix(inner, SR(vec3(0.05, 0.06, 0.08)), shop * 0.7);
    col = mix(col, inner, hole); rough = mix(rough, 0.3, hole * shop);
    pDn *= 1.0 - hole;
    pDn.x += (step(0.14, fx) * step(fx, 0.18) - step(0.1, fx) * step(fx, 0.14)) * 0.6 * step(uv.y, archY);
    pDn.y += (step(archY, uv.y) * step(uv.y, archY + 0.1)) * 0.6 * (1.0 - pil);
    glowC = SR(vec3(1.0, 0.85, 0.6)) * hole * shop * (0.05 + uFlood * 0.8);
  } else if (uv.y < 4.0) {
    float sh = step(0.12, fract(uv.x / 5.0)) * step(0.4, uv.y) * step(uv.y, 3.3);
    col = mix(col, SR(vec3(0.06, 0.07, 0.09)), sh); rough = mix(rough, 0.09, sh);
    float aw = step(3.3, uv.y) * step(uv.y, 3.8);
    col = mix(col, SR(hsv(h21(vec2(floor(uv.x / 5.0), sd)), 0.55, 0.55)), aw);
    pDn *= 1.0 - 0.85 * sh;
    pDn.y += (step(3.25, uv.y) * step(uv.y, 3.45) - step(3.72, uv.y) * step(uv.y, 3.92)) * 0.65;
    glowC = SR(vec3(1.0, 0.85, 0.6)) * sh * (0.10 + uFlood * 0.95);
  } else if (px < 3.0) {
    vec2 g = vec2(uv.x / 2.7, (uv.y - 4.0) / 3.1), c = floor(g), f = fract(g);
    float win = step(0.3, f.x) * step(f.x, 0.7) * step(0.2, f.y) * step(f.y, 0.85);
    float shut = (step(0.17, f.x) * step(f.x, 0.3) + step(0.7, f.x) * step(f.x, 0.83)) * step(0.2, f.y) * step(f.y, 0.85) * step(0.4, h21(vec2(sd, 3.0)));
    float balc = step(0.12, f.y) * step(f.y, 0.22) * step(0.2, f.x) * step(f.x, 0.8) * step(0.5, h21(vec2(c.y, sd)));
    float ledge = step(0.92, f.y);
    float k = step(px, 0.9);
    // profundidad de hueco de ventana: sombra bajo el dintel y relieve en el marco y la cornisa
    float wDepth = 0.62 + 0.55 * clamp((0.85 - f.y) / 0.65, 0.0, 1.0);
    col *= 1.0 - 0.18 * ledge * k;
    col = mix(col, SR(vec3(0.28, 0.36, 0.27)) * (0.8 + 0.4 * h21(vec2(sd, 9.0))), shut * k);
    col = mix(col, SR(vec3(0.07, 0.09, 0.12)) * wDepth, win * k);
    col = mix(col, SR(vec3(0.16)), balc * k);
    rough = mix(rough, 0.08, win * k); metal = mix(metal, 0.18, win * k);
    vec3 roomC = vec3(0.0); float roomK = 0.0;
    if (inK > 0.0) {
      // la habitación detrás: la ventana es el hueco central (0,3-0,7 del módulo); a veces con la cortina medio corrida
      vec3 lampI; vec2 rid = c + sd;
      vec3 inC = roomAt(vec2((f.x - 0.3) / 0.4, (f.y - 0.2) / 0.65), vec2(1.1, 2.0), 3.5, rv, rid, lampI);
      float cur = step(0.55, h21(rid + 1.3)) * step((f.x - 0.3) / 0.4, 0.2 + 0.35 * h21(rid + 2.1));
      inC = mix(inC, SR(mix(vec3(0.85, 0.82, 0.74), vec3(0.7, 0.35, 0.3), step(0.8, h21(rid + 4.0)))) * 0.75, cur);
      lampI = mix(lampI, inC * 0.8, cur);
      float on = step(0.55, h21(c + sd)) * winOn(c + sd);
      roomC = (inC * uDay * 0.3 + lampI * SR(vec3(1.0, 0.82, 0.55)) * on * 1.25) * win * k;
      roomK = inK * win * k;
      col = mix(col, SR(vec3(0.02, 0.025, 0.03)), roomK); metal = mix(metal, 0.0, roomK); rough = mix(rough, 0.04, roomK);
    }
    pDn *= 1.0 - 0.9 * win * k;
    float inBox = step(0.18, f.y) * step(f.y, 0.88) * step(0.26, f.x) * step(f.x, 0.74);
    pDn += vec2((step(0.26, f.x) * step(f.x, 0.32) - step(0.68, f.x) * step(f.x, 0.74)) * 0.55,
      (step(0.18, f.y) * step(f.y, 0.24) - step(0.82, f.y) * step(f.y, 0.88)) * 0.55) * inBox * k;
    pDn.y += (step(0.89, f.y) * step(f.y, 0.94) - step(0.94, f.y)) * 0.45 * k;
    // cuando cada ventana ocupa menos de medio píxel, poco a poco un brillo uniforme: sin parpadeos al moverse.
    glowC = SR(vec3(1.0, 0.82, 0.55)) * mix(win * step(0.55, h21(c + sd)) * (0.08 + winOn(c + sd)), 0.03 * winAvg(), smoothstep(2.0, 3.0, px)) * 0.95;
    glowC = mix(glowC, roomC, roomK);
  } else {
    glowC = SR(vec3(1.0, 0.82, 0.55)) * 0.03 * winAvg() * 0.95;
  }
} else if (P < 6.5 && uv.y < 5.6) {
  // vestíbulo de la torre: doble altura acristalada, montantes cada 3 m, travesaño a 4 m y marquesina oscura arriba
  float fx = fract(uv.x / 3.0), mul = step(fx, 0.04) + step(abs(uv.y - 4.0), 0.06), canopy = step(4.95, uv.y);
  vec3 lampI = vec3(0.0); vec2 rid = vec2(floor(uv.x / 3.0), sd + 40.0);
  vec3 inC = inK > 0.0 ? roomAt(vec2(fx, uv.y / 4.95), vec2(3.0, 4.95), 9.0, rv, rid, lampI) : vec3(0.0);
  col = mix(SR(vec3(0.03, 0.035, 0.04)), SR(vec3(0.5, 0.52, 0.55)), clamp(mul, 0.0, 1.0));
  rough = 0.06; metal = 0.0;
  glowC = mix(SR(vec3(1.0, 0.9, 0.75)) * (0.02 + uFlood * 0.6), inC * uDay * 0.16 + lampI * SR(vec3(1.0, 0.92, 0.8)) * (0.03 + uFlood * 0.9), inK) * (1.0 - clamp(mul, 0.0, 1.0));
  col = mix(col, SR(vec3(0.12, 0.13, 0.14)), canopy); rough = mix(rough, 0.5, canopy); metal = mix(metal, 0.6, canopy); glowC *= 1.0 - canopy;
  pDn = vec2((step(fx, 0.06) - step(0.98, fx)) * 0.4, (step(4.95, uv.y) * step(uv.y, 5.1) - step(5.45, uv.y)) * 0.6);
} else if (P < 6.5) {
  // torre de oficinas: muro cortina con su retícula, relieve de montantes y oficinas iluminadas con degradado de techo
  vec2 g = uv / vec2(1.5, 3.6), c = floor(g), f = fract(g);
  float k = step(px, 0.8);
  float sp = step(f.y, 0.22), fr = step(f.x, 0.06);
  col = mix(col * (0.26 + 0.12 * f.y), SR(vec3(0.68)), max(sp * 0.6, fr) * k);
  rough = mix(0.08, 0.6, sp); metal = 0.48;
  pDn = vec2((step(f.x, 0.08) - step(0.94, f.x)) * 0.35, (step(f.y, 0.24) - step(0.96, f.y)) * 0.45) * k;
  float office = step(0.55, h21(vec2(floor(c.x / 3.0), c.y) + sd)) * (1.0 - sp) * (1.0 - fr * 0.85 * k) * winOn(vec2(floor(c.x / 3.0), c.y) + sd);
  float shadeIn = 0.45 + 0.55 * smoothstep(0.22, 0.88, f.y);
  glowC = SR(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.62), step(0.5, h21(vec2(c.y, sd))))) * office * shadeIn * 0.62;
  if (inK > 0.0) {
    // oficinas de tres módulos de ancho y 8 m de fondo detrás del cristal; el antepecho (sp) y los montantes, opacos
    vec2 rid = vec2(floor(c.x / 3.0), c.y) + sd; vec3 lampI;
    vec3 inC = roomAt(vec2(fract(g.x / 3.0), f.y), vec2(4.5, 3.6), 8.0, rv, rid, lampI);
    float open = (1.0 - sp) * (1.0 - fr * k), on = step(0.55, h21(vec2(floor(c.x / 3.0), c.y) + sd)) * winOn(vec2(floor(c.x / 3.0), c.y) + sd);
    vec3 offC = (inC * uDay * 0.26 + lampI * SR(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.62), step(0.5, h21(vec2(c.y, sd))))) * on * 1.1) * open;
    col = mix(col, mix(col, SR(vec3(0.02, 0.025, 0.03)), open), inK); metal = mix(metal, metal * (1.0 - open), inK); rough = mix(rough, mix(rough, 0.04, open), inK);
    glowC = mix(glowC, offC, inK);
  }
} else if (P < 7.5) {
  // celosía de tubos (torres de televisión, puentes): huecos de verdad de cerca
  vec2 f = fract(uv / 1.4);
  float bar = max(max(step(f.x, 0.1), step(f.y, 0.1)), step(abs(f.x - f.y), 0.08));
  if (bar < 0.5 && px < 0.35) discard;
  col = SR(vec3(0.62, 0.64, 0.67)); rough = 0.45; metal = 0.7;
} else if (P < 8.5) {
  // chapa acanalada: se atenúa antes del límite de muestreo (0,45 m) para evitar anillos de moiré en tejados grandes
  float ribK = 1.0 - smoothstep(0.08, 0.22, px);
  float ph = uv.x / 0.45 * 6.28318;
  col *= mix(0.91, 0.82 + 0.18 * (0.5 + 0.5 * sin(ph)), ribK);
  rough = 0.5; metal = 0.4;
  pDn = vec2(cos(ph) * 0.35 * ribK, 0.0);
} else if (P < 9.5) {
  vec4 wd = texture2D(uWallDet, uv / 4.2);
  col *= (0.7 + 0.6 * wd.r) * (1.0 - 0.3 * step(fract(uv.x / 4.0), 0.015));
  // cada paño de 4 m con su tono, y churretes del agua que baja (solo de cerca)
  float pan = floor(uv.x / 4.0);
  col *= (0.93 + 0.14 * h21(vec2(pan, sd + 5.0))) * (1.0 - 0.14 * smoothstep(0.55, 0.85, vn(vec2(uv.x * 2.3, uv.y * 0.07 + pan * 3.0))) * (1.0 - smoothstep(0.2, 0.8, px)));
  rough = clamp(0.72 + (wd.a - 0.5) * 0.3, 0.4, 0.95);
  pDn = (wd.gb - 0.5) * 1.55 + vec2((step(fract(uv.x / 4.0), 0.025) - step(0.975, fract(uv.x / 4.0))) * 0.45 * step(px, 0.5), 0.0);
} else if (P < 10.5) {
  col = vec3(1.0); glowC = vec3(1.0, 0.96, 0.88) * (0.4 + 3.4 * uFlood);
} else if (P < 11.5) {
  // bandera de aficionado: la del país del circuito (más o menos la mitad) o tres franjas de colores al azar
  float band = floor(clamp(uv.x, 0.0, 0.999) * 3.0);
  col = SR(hsv(h21(vec2(sd, band)), 0.75, 0.9)); if (h21(vec2(band, sd + 3.0)) > 0.7) col = SR(vec3(0.95));
  if (h21(vec2(sd, 9.1)) < 0.55 * uFanK) col = SR(texture2D(uFanFlag, vec2(clamp(uv.x, 0.0, 1.0), 1.0 - clamp(uv.y, 0.0, 1.0))).rgb);
  rough = 0.9;
} else if (P < 12.5) {
  // teja árabe: canales de 22 cm pendiente abajo en hileras de 30 cm, cada teja con su tono; de lejos, el color medio
  vec2 g = vec2(uv.x / 0.22, uv.y / 0.3), c = floor(g), f = fract(g);
  float tk = 1.0 - smoothstep(0.06, 0.2, px), cv = sin(f.x * 3.14159);
  vec3 tc = SR(mix(vec3(0.62, 0.3, 0.18), vec3(0.76, 0.46, 0.29), h21(c + sd))) * (0.78 + 0.28 * h21(c * 1.3 + 2.0));
  vec3 avg = SR(vec3(0.66, 0.37, 0.24)) * (0.82 + 0.25 * vn(uv * 0.35 + sd));
  col = mix(avg, tc * (0.68 + 0.38 * cv) * (1.0 - 0.28 * step(0.86, f.y)), tk);
  col *= 1.0 - 0.18 * smoothstep(0.6, 0.9, vn(uv * 0.5 + sd * 2.0)); // verdín y suciedad
  pDn = vec2(cos(f.x * 3.14159) * 0.7, (step(0.86, f.y) - 0.5) * 0.35) * tk;
  rough = 0.82;
} else if (P < 13.5) {
  // barandilla: pasamanos, un travesaño y montantes cada 1,2 m (v de 0 a 1 en altura); lo demás, hueco
  float fx = fract(uv.x / 1.2);
  float bar = max(max(step(0.9, uv.y), step(abs(uv.y - 0.45), 0.035)), step(fx, 0.035));
  if (bar < 0.5 && (px < 0.3 || h21(floor(gl_FragCoord.xy)) > 0.3)) discard;
  col = SR(vec3(0.55, 0.58, 0.62)); rough = 0.4; metal = 0.75;
} else if (P < 14.5) {
  // helipuerto: círculo amarillo y la H blanca sobre gris oscuro (uv en metros desde el centro)
  float r = length(uv);
  col = SR(vec3(0.15, 0.16, 0.17)) * (0.9 + 0.2 * vn(uv * 0.7));
  col = mix(col, SR(vec3(0.95, 0.74, 0.1)), step(abs(r - 6.2), 0.3));
  col = mix(col, SR(vec3(0.95)), step(abs(r - 8.3), 0.12));
  float H = max(step(abs(uv.x), 1.9) * step(abs(uv.y), 0.35), step(abs(abs(uv.x) - 1.7), 0.35) * step(abs(uv.y), 2.6));
  col = mix(col, SR(vec3(0.94)), H); rough = 0.75;
} else if (P < 15.5) {
  // Las Vegas: hoteles-casino oscuros con molduras de neón, marquesinas doradas y pantallas LED nocturnas
  float hNeo = h21(vec2(sd, 3.7));
  vec3 neoA = hNeo < 0.2 ? SR(vec3(1.0, 0.16, 0.62)) : hNeo < 0.4 ? SR(vec3(0.05, 0.88, 1.0)) : hNeo < 0.6 ? SR(vec3(1.0, 0.72, 0.12)) : hNeo < 0.8 ? SR(vec3(0.65, 0.25, 1.0)) : SR(vec3(1.0, 0.22, 0.28));
  vec3 neoB = SR(hsv(fract(hNeo + 0.38), 0.85, 1.0));
  float nLit = 0.35 + 1.45 * uFlood;
  if (uv.y < 5.6) {
    float fx = fract(uv.x / 3.4), colM = step(fx, 0.08);
    float marq = step(4.0, uv.y) * step(uv.y, 5.35);
    float chase = 0.72 + 0.28 * sin(uv.x * 1.4 - uTime * 3.8 + sd);
    col = mix(SR(vec3(0.04, 0.045, 0.06)), SR(vec3(0.68, 0.56, 0.30)), colM);
    col = mix(col, mix(neoA, SR(vec3(1.0, 0.84, 0.42)), 0.45) * 0.4, marq);
    rough = mix(0.08, 0.32, max(colM, marq)); metal = mix(0.25, 0.75, colM);
    glowC = SR(vec3(1.0, 0.86, 0.55)) * (1.0 - colM) * (0.14 + uFlood * 0.95) * (1.0 - marq);
    glowC += mix(neoA, SR(vec3(1.0, 0.88, 0.50)), 0.4) * marq * chase * nLit * 1.1;
  } else {
    vec2 g = uv / vec2(1.7, 3.4), c = floor(g), f = fract(g);
    float k = step(px, 0.9), sp = step(f.y, 0.20), fr = step(f.x, 0.06);
    col = mix(col * (0.28 + 0.14 * f.y), SR(vec3(0.66, 0.56, 0.34)), max(sp * 0.55, fr) * k);
    rough = mix(0.07, 0.52, sp); metal = 0.56;
    pDn = vec2((step(f.x, 0.08) - step(0.94, f.x)) * 0.35, (step(f.y, 0.22) - step(0.96, f.y)) * 0.45) * k;
    float suite = step(0.45, h21(vec2(floor(c.x / 2.0), c.y) + sd)) * (1.0 - sp) * (1.0 - fr * 0.8 * k) * winOn(vec2(floor(c.x / 2.0), c.y) + sd);
    glowC = SR(vec3(1.0, 0.84, 0.55)) * suite * 0.58;
    // tiras arquitectónicas de neón horizontales cada ~13,6 m y pilares luminosos verticales
    float hBand = step(0.90, fract((uv.y - 5.6) / 13.6));
    float vBand = step(0.93, fract((uv.x + sd * 2.1) / 12.0));
    glowC += neoA * hBand * nLit * 0.85 + neoB * vBand * nLit * 0.65;
    // gran pantalla LED animada en las fachadas principales del Strip
    float hasScr = step(0.36, h21(vec2(sd, 19.3)));
    float bx = fract((uv.x + sd * 3.7) / 18.0);
    float scr = hasScr * step(7.2, uv.y) * step(uv.y, 16.4) * step(0.10, bx) * step(bx, 0.90);
    if (scr > 0.5) {
      vec2 suv = vec2((bx - 0.10) / 0.80, (uv.y - 7.2) / 9.2);
      vec3 sImg = signAt(mod(sd * 3.0 + floor((uv.x + sd * 3.7) / 18.0), 16.0), suv);
      float wave = 0.5 + 0.5 * sin(suv.x * 5.0 - uTime * 2.2 + sd);
      vec3 led = mix(sImg, mix(neoA, neoB, wave), 0.35);
      float frame = max(step(suv.x, 0.03) + step(0.97, suv.x), step(suv.y, 0.04) + step(0.96, suv.y));
      col = mix(SR(vec3(0.03)), SR(vec3(0.14)), clamp(frame, 0.0, 1.0));
      rough = 0.18; metal = 0.1;
      glowC = mix(led * (0.55 + 1.25 * uFlood), neoA * nLit * 0.9, clamp(frame, 0.0, 1.0));
    }
  }
} else if (P < 16.5) {
  // Bakú: fachada histórica de piedra caliza tallada, arcos en planta baja y bañadores ámbar al anochecer
  vec4 fd = texture2D(uFacDet, uv / 4.8);
  vec2 st = uv / vec2(1.8, 0.72);
  float rowOff = mod(floor(st.y), 2.0) * 0.5;
  vec2 sb = floor(vec2(st.x + rowOff, st.y)), sf = fract(vec2(st.x + rowOff, st.y));
  float mort = max(step(sf.x, 0.03), step(sf.y, 0.05)) * (1.0 - smoothstep(0.08, 0.32, px));
  col *= (0.82 + 0.36 * fd.r) * (0.93 + 0.14 * h21(sb + sd)) * (1.0 - 0.16 * mort);
  rough = clamp(0.74 + (fd.a - 0.5) * 0.25, 0.45, 0.95);
  pDn = (fd.gb - 0.5) * 1.35;
  if (uv.y < 4.4) {
    float fx = fract(uv.x / 4.2), ax2 = (fx - 0.56) / 0.40;
    float pil = step(fx, 0.16), archY = 2.85 + 1.05 * sqrt(max(0.0, 1.0 - ax2 * ax2));
    float hole = (1.0 - pil) * step(uv.y, archY);
    float keyst = (1.0 - pil) * step(archY, uv.y) * step(uv.y, archY + 0.28);
    col *= 1.0 - 0.12 * keyst;
    col = mix(col, SR(vec3(0.06, 0.06, 0.075)), hole * 0.85);
    rough = mix(rough, 0.14, hole);
    pDn *= 1.0 - 0.85 * hole;
    // iluminación monumental cálida en los pilares de piedra
    float upL = pil * smoothstep(4.2, 0.2, uv.y) * (0.04 + 0.65 * uFlood);
    glowC = SR(vec3(1.0, 0.80, 0.48)) * (upL + hole * (0.06 + 0.72 * uFlood));
  } else if (px < 3.0) {
    vec2 g = vec2(uv.x / 2.8, (uv.y - 4.4) / 3.4), c = floor(g), f = fract(g);
    float ax2 = (f.x - 0.5) / 0.22;
    float archTop = 0.68 + 0.17 * sqrt(max(0.0, 1.0 - ax2 * ax2));
    float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.16, f.y) * step(f.y, archTop);
    float cornice = step(0.90, f.y);
    float bal = step(0.10, f.y) * step(f.y, 0.20) * step(0.22, f.x) * step(f.x, 0.78);
    float k = 1.0 - smoothstep(0.7, 2.3, px);
    col *= 1.0 - 0.18 * cornice * k;
    col = mix(col, col * 1.12, bal * k);
    col = mix(col, SR(vec3(0.07, 0.08, 0.11)), win * k);
    col *= mix(0.86, 1.0, k);
    rough = mix(rough, 0.09, win * k); metal = mix(metal, 0.16, win * k);
    pDn *= 1.0 - 0.85 * win * k;
    pDn.y += (step(0.88, f.y) * step(f.y, 0.94) - step(0.94, f.y)) * 0.55 * k;
    float litW = win * step(0.50, h21(c + sd)) * winOn(c + sd);
    float wash = (1.0 - win) * smoothstep(0.85, 0.05, f.y) * uFlood * 0.24;
    glowC = SR(vec3(1.0, 0.82, 0.52)) * (mix(litW, 0.028 * winAvg(), smoothstep(2.0, 3.0, px)) * 0.9 + wash);
  } else {
    glowC = SR(vec3(1.0, 0.82, 0.52)) * (0.03 * winAvg() + uFlood * 0.14);
  }
}
// oclusión de contacto donde los muros, fachadas y pilares apoyan en el suelo
if (P < 0.5 || (P > 4.5 && P < 6.5) || (P > 8.5 && P < 9.5) || (P > 14.5 && P < 16.5)) {
  col *= mix(0.62, 1.0, smoothstep(-0.1, 1.8, vGroundY));
}
col *= 1.0 - 0.35 * texture2D(uCloud, vWXZ / (2.0 * uTexR) + 0.5).g;
vec4 diffuseColor = vec4(col, opacity);
`;
// Relieve en el plano de cada cara (fachadas, hormigón, gradas, cubiertas) a partir de las derivadas de uv en pantalla
const PROP_NORMAL = `#include <normal_fragment_maps>
if (dot(pDn, pDn) > 1e-5) {
  vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2p = cross(dp2, normal), dp1p = cross(normal, dp1);
  vec3 T = dp2p * duv1.x + dp1p * duv2.x, B = dp2p * duv1.y + dp1p * duv2.y;
  float m2 = max(dot(T, T), dot(B, B));
  if (m2 > 1e-8) normal = normalize(normal + (T * pDn.x + B * pDn.y) * inversesqrt(m2) * 0.72);
}`;
// bandera del país del circuito para el público de las gradas (public/assets/flags, por el emoji de su bandera)
const FAN_U = { tex: { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) }, k: { value: 0 } };
FAN_U.tex.value.needsUpdate = true;
function loadFanFlag(emoji) {
  FAN_U.k.value = 0;
  const code = [...(emoji ?? "")].map((ch) => ch.codePointAt(0) - 0x1f1e6).filter((x) => x >= 0 && x < 26).map((x) => String.fromCharCode(97 + x)).join("");
  if (code.length !== 2) return;
  const img = new Image();
  img.onload = () => {
    if (!alive3d) return;
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 96;
    cv.getContext("2d").drawImage(img, 0, 0, 128, 96);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter;
    const old = FAN_U.tex.value; FAN_U.tex.value = t; old.dispose(); FAN_U.k.value = 1;
  };
  img.src = ASSET(`flags/${code}.svg`);
}
loadFanFlag(track.def.bandera);
function propMat() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uW: U.uW, uS: U.uS, uTime: U.uTime, uFlood: U.uFlood, uHiQ: U.uHiQ, uDay: U.uDay, uCloud: U.uCloud, uTexR: U.uTexR, uSigns: { value: signTex }, uFacDet: DET_U.fachada, uWallDet: DET_U.hormigon, uFanFlag: FAN_U.tex, uFanK: FAN_U.k });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + PROP_VH).replace("#include <begin_vertex>", PROP_VB);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PROP_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PROP_FB)
      .replace("#include <color_fragment>", "")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = rough;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("#include <normal_fragment_maps>", PROP_NORMAL)
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + glowC + col * uFlood * 0.14;");
  };
  m.customProgramCacheKey = () => "decorado";
  return m;
}
// la sombra tiene que salir de la forma ya ensanchada y con recorte alfa en celosías (P = 7) y barandillas (P = 13)
const PROP_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
PROP_DEPTH.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uW: U.uW, uS: U.uS, uTime: U.uTime });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + PROP_VH).replace("#include <begin_vertex>", PROP_VB);
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec4 vPat;")
    .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
      float dP = floor(vPat.x + 0.5);
      if (dP > 6.5 && dP < 7.5) {
        vec2 df = fract(vPat.zw / 1.4);
        float db = max(max(step(df.x, 0.14), step(df.y, 0.14)), step(abs(df.x - df.y), 0.1));
        if (db < 0.5) discard;
      } else if (dP > 12.5 && dP < 13.5) {
        float dfx = fract(vPat.z / 1.2);
        float db = max(max(step(0.88, vPat.w), step(abs(vPat.w - 0.45), 0.045)), step(dfx, 0.055));
        if (db < 0.5) discard;
      }`);
};
PROP_DEPTH.customProgramCacheKey = () => "decorado-sombra";
/**
 * Constructor del decorado. at(s, lado) se sitúa en el punto s de la pista; los vértices van en el sistema de ese punto:
 * x a lo largo de la pista, y arriba, z hacia fuera (metros, crecen de lejos), más lw (medias anchuras de pista) y lm
 * (metros fijos hacia fuera, p. ej. la escapatoria).
 * Niveles de detalle: todo se apunta en el tramo de pista (de unos 400 m) donde está anclado, y lo que se añade dentro
 * de near(fn) (rótulos, balcones, pilares, banderas…) solo se dibuja con el tramo cerca (ver propLod).
 */
const PROP_CHUNK = 400;
function propBuilder() {
  const P = [], AN = [], SD = [], LW = [], CO = [], PA = [], CH = [], LV = [], f = mkS();
  const NCH = Math.max(1, Math.round(T.L / PROP_CHUNK)), CHL = T.L / NCH;
  let tx = 1, tz = 0, wr = 1, sg = 1, ch = 0, lv = 0;
  const col = new THREE.Color();
  const B = {
    at(s, side = 1) {
      sample(s, f); const h = Math.hypot(f.tx, f.tz) || 1; tx = f.tx / h; tz = f.tz / h; wr = arrAt(T.wr, s); sg = side;
      ch = Math.min(NCH - 1, Math.floor(mod(s, T.L) / CHL)); return B;
    },
    /** Sitúa el marco local en coordenadas reales del mundo (para gradas/edificios extraídos de OSM). */
    atWorld(wx, wy, wz, ux, uz, bx, bz, chS = 0) {
      f.x = wx; f.y = wy; f.z = wz; tx = ux; tz = uz; f.rx = bx; f.rz = bz; wr = 1; sg = 1;
      ch = Math.min(NCH - 1, Math.floor(mod(chS, T.L) / CHL)); return B;
    },
    v(x, y, z, lw, lm, c, pat, cell, u, v) {
      const rx = f.rx * sg, rz = f.rz * sg;
      AN.push(f.x + rx * lm, f.y, f.z + rz * lm); SD.push(f.rx, 0, f.rz); LW.push(lw * sg * wr);
      P.push(tx * x + rx * z, y, tz * x + rz * z); CO.push(c.r, c.g, c.b); PA.push(pat, cell, u, v); CH.push(ch); LV.push(lv);
    },
    /** Lo que se añade en fn solo se ve de cerca. */
    near(fn) { const o = lv; lv = Math.max(lv, 1); try { fn(); } finally { lv = o; } },
    /** Lo que se añade en fn solo se ve de cerca y con calidad 2 o 3 (los escalones 0 y 1 no lo dibujan nunca). */
    fine(fn) { const o = lv; lv = 2; try { fn(); } finally { lv = o; } },
    /** Viga de sección cuadrada (r de medio lado) entre a y b, cada uno [x, y, z]. */
    beam(a, b, r, lw, lm, hex, pat = 9) {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-3) return;
      d.divideScalar(L);
      const e1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(r);
      const e2 = new THREE.Vector3().crossVectors(d, e1).normalize().multiplyScalar(r);
      const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => [e1.x * i + e2.x * j, e1.y * i + e2.y * j, e1.z * i + e2.z * j]);
      for (let k = 0; k < 4; k++) {
        const c0 = C[k], c1 = C[(k + 1) % 4], P = (p, c, u) => [p[0] + c[0], p[1] + c[1], p[2] + c[2], lw, lm, u, 0];
        B.quad(P(a, c0, 0), P(a, c1, 0), P(b, c1, L), P(b, c0, L), hex, pat, 0);
      }
    },
    /** Cuadrilátero; cada esquina es [x, y, z, lw, lm, u, v]. */
    quad(a, b, c, d, hex, pat = 0, cell = 0) {
      col.set(hex);
      for (const q of [a, b, c, a, c, d]) B.v(q[0], q[1], q[2], q[3], q[4], col, pat, cell, q[5], q[6]);
    },
    /**
     * Caja x0..x1 × y0..y1 × z0..z1 a lw medias anchuras y lm metros. pats: { front (la cara que mira a la pista),
     * back, side, top } con [dibujo, casilla]; uo = desplazamiento de u (para que los dibujos sigan de una caja a otra).
     */
    box(x0, x1, y0, y1, z0, z1, lw, lm, hex, pats = {}, uo = 0) {
      const pf = pats.front || [0, 0], pb = pats.back || pf, ps = pats.side || pf, pt = pats.top || [0, 0];
      const V = (x, y, z, u, v) => [x, y, z, lw, lm, u, v];
      B.quad(V(x0, y0, z0, uo + x0, y0), V(x1, y0, z0, uo + x1, y0), V(x1, y1, z0, uo + x1, y1), V(x0, y1, z0, uo + x0, y1), hex, pf[0], pf[1]);
      B.quad(V(x1, y0, z1, uo - x1, y0), V(x0, y0, z1, uo - x0, y0), V(x0, y1, z1, uo - x0, y1), V(x1, y1, z1, uo - x1, y1), hex, pb[0], pb[1]);
      B.quad(V(x0, y0, z1, z1, y0), V(x0, y0, z0, z0, y0), V(x0, y1, z0, z0, y1), V(x0, y1, z1, z1, y1), hex, ps[0], ps[1]);
      B.quad(V(x1, y0, z0, z0, y0), V(x1, y0, z1, z1, y0), V(x1, y1, z1, z1, y1), V(x1, y1, z0, z0, y1), hex, ps[0], ps[1]);
      B.quad(V(x0, y1, z0, uo + x0, z0), V(x1, y1, z0, uo + x1, z0), V(x1, y1, z1, uo + x1, z1), V(x0, y1, z1, uo + x0, z1), hex, pt[0], pt[1]);
    },
    /** Rótulo plano (casilla cell de la lámina) en la cara z, con u de u0 a u1 a lo ancho; e0/e1 = [lw, lm] de cada extremo. */
    panel(x0, x1, y0, y1, z, lw, lm, cell, u0 = 0, u1 = 1) {
      if (sg > 0) { u0 = -u0; u1 = -u1; } // visto desde la pista, en el lado derecho el texto corre hacia atrás
      B.quad([x0, y0, z, lw, lm, u0, 0], [x1, y0, z, lw, lm, u1, 0], [x1, y1, z, lw, lm, u1, 1], [x0, y1, z, lw, lm, u0, 1], 0xffffff, 4, cell);
    },
    mark: () => P.length,
    /** Quita el detalle fino añadido desde m (lo demás se queda tal cual). */
    dropFine(m) {
      let w = m / 3;
      for (let k = m / 3; k < LV.length; k++) {
        if (LV[k] === 2) continue;
        for (let a = 0; a < 3; a++) { P[w * 3 + a] = P[k * 3 + a]; AN[w * 3 + a] = AN[k * 3 + a]; SD[w * 3 + a] = SD[k * 3 + a]; CO[w * 3 + a] = CO[k * 3 + a]; }
        for (let a = 0; a < 4; a++) PA[w * 4 + a] = PA[k * 4 + a];
        LW[w] = LW[k]; CH[w] = CH[k]; LV[w] = LV[k]; w++;
      }
      B.undo(w * 3);
    },
    undo(m) { for (const a of [P, AN, SD, CO]) a.length = m; LW.length = CH.length = LV.length = m / 3; PA.length = (m / 3) * 4; },
    /**
     * ¿Lo añadido desde m queda fuera de la pista (de cerca, a media distancia y de lejos)? fine: false no mira el
     * detalle fino, true solo mira el detalle fino.
     */
    clear(m, margin = 1.5, near = false, fine = null) {
      for (const W of near ? [W_REAL, W_REAL * 1.5] : [W_REAL, (W_REAL + T.Wov) / 2, T.Wov]) {
        const us = Math.max(1, W / W_REAL);
        for (let i = m; i < P.length; i += 3) {
          if (fine !== null && (LV[i / 3] === 2) !== fine) continue;
          const k = i / 3, x = AN[i] + SD[i] * W * LW[k] + P[i] * us, z = AN[i + 2] + SD[i + 2] * W * LW[k] + P[i + 2] * us;
          if (trackDist(x, z) < T.SH * W + margin) return false;
        }
      }
      return true;
    },
    /**
     * La malla, con los vértices ordenados por tramo y, dentro de cada tramo, primero lo que se ve siempre y luego lo
     * de cerca. Cada tramo lleva su caja (la que ocupa a cualquier escala: la forma crece de lejos con la pista).
     */
    mesh() {
      const nv = CH.length, nt = nv / 3, cnt = new Uint32Array(NCH * 3);
      for (let t = 0; t < nt; t++) cnt[CH[t * 3] * 3 + LV[t * 3]] += 3;
      const at0 = new Uint32Array(NCH * 3), chunks = [];
      for (let c = 0, o = 0; c < NCH; c++) {
        chunks.push({ start: o, n0: cnt[c * 3], n1: cnt[c * 3 + 1], n2: cnt[c * 3 + 2], box: new THREE.Box3() });
        at0[c * 3] = o; at0[c * 3 + 1] = o + cnt[c * 3]; at0[c * 3 + 2] = o + cnt[c * 3] + cnt[c * 3 + 1]; o += cnt[c * 3] + cnt[c * 3 + 1] + cnt[c * 3 + 2];
      }
      const P2 = new Float32Array(nv * 3), AN2 = new Float32Array(nv * 3), SD2 = new Float32Array(nv * 3), CO2 = new Float32Array(nv * 3), LW2 = new Float32Array(nv), PA2 = new Float32Array(nv * 4);
      const kMax = T.Wov / W_REAL, v3 = new THREE.Vector3();
      for (let t = 0; t < nt; t++) {
        const b = t * 3, slot = CH[b] * 3 + LV[b], box = chunks[CH[b]].box;
        for (let j = 0; j < 3; j++) {
          const i = b + j, d = at0[slot]++;
          for (let a = 0; a < 3; a++) { P2[d * 3 + a] = P[i * 3 + a]; AN2[d * 3 + a] = AN[i * 3 + a]; SD2[d * 3 + a] = SD[i * 3 + a]; CO2[d * 3 + a] = CO[i * 3 + a]; }
          LW2[d] = LW[i]; for (let a = 0; a < 4; a++) PA2[d * 4 + a] = PA[i * 4 + a];
          // la posición va en línea recta con la anchura de la pista: basta con los dos extremos
          for (const [W, k] of [[W_REAL, 1], [T.Wov, kMax]]) box.expandByPoint(v3.set(AN[i * 3] + SD[i * 3] * W * LW[i] + P[i * 3] * k, AN[i * 3 + 1] + P[i * 3 + 1] * k, AN[i * 3 + 2] + SD[i * 3 + 2] * W * LW[i] + P[i * 3 + 2] * k));
        }
      }
      for (const c of chunks) if (!c.box.isEmpty()) c.box.expandByScalar(kMax * 1.5); // las banderas ondean
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(P2, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute("aAnc", new THREE.BufferAttribute(AN2, 3));
      g.setAttribute("aSd", new THREE.BufferAttribute(SD2, 3));
      g.setAttribute("aLw", new THREE.BufferAttribute(LW2, 1));
      g.setAttribute("color", new THREE.BufferAttribute(CO2, 3));
      g.setAttribute("aPat", new THREE.BufferAttribute(PA2, 4));
      // índices que se rehacen cuando cambia qué tramos se ven y a qué nivel (propLod)
      const idx = new THREE.BufferAttribute(new Uint32Array(Math.max(3, nv)), 1).setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < nv; i++) idx.array[i] = i;
      g.setIndex(idx); g.setDrawRange(0, nv);
      const m = new THREE.Mesh(g, propMat());
      m.customDepthMaterial = PROP_DEPTH; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 6;
      m.userData.lod = { chunks, state: new Uint8Array(NCH).fill(255), nv };
      return m;
    },
  };
  return B;
}
/** Distancia (en planta) al eje de la pista, con una rejilla para no recorrer toda la vuelta. */
let tGrid = null, tdNear = 0;
function trackDist(x, z) {
  const CS = 60;
  if (!tGrid || tGrid.T !== T) {
    const m = new Map();
    for (let i = 0; i < T.n; i++) { const k = Math.floor(T.X[i] / CS) + "," + Math.floor(T.Z[i] / CS); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
    tGrid = { T, m };
  }
  const gx = Math.floor(x / CS), gz = Math.floor(z / CS);
  let best = 1e9;
  for (let r = 0; r <= 6; r++) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      const l = tGrid.m.get(gx + a + "," + (gz + b));
      if (l) for (const i of l) { const d = (T.X[i] - x) ** 2 + (T.Z[i] - z) ** 2; if (d < best) { best = d; tdNear = i; } }
    }
    if (best < (r * CS) ** 2) break;
  }
  return Math.sqrt(best);
}
// Manzanas de ciudad lejos de la pista (Mónaco, Singapur, Bakú y Las Vegas): cajas repetidas cuyas fachadas salen del sombreador.
// part: 0 el edificio; 1 tejado a dos aguas de teja (hastiales lisos); 2 azotea (pretil, casetón y máquinas).
function cityMat(style, part = 0) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const pat = part === 1 ? `wn.y > 0.3 ? vec4(12.0, sd, dot(lq.xz, normalize(instanceMatrix[0].xz)), abs(dot(lq.xz, normalize(instanceMatrix[2].xz))) * 1.15) : vec4(0.0, sd, 0.0, 0.0)`
    : part === 2 ? `abs(wn.y) > 0.5 ? vec4(8.0, sd, lq.x, lq.z) : vec4(9.0, sd, dot(lq.xz, tn), lq.y)`
    : style === 16 ? `abs(wn.y) > 0.5 ? vec4(8.0, sd, lq.x, lq.z) : vec4(length(im3[1]) >= 28.0 ? 6.0 : 16.0, sd, dot(lq.xz, tn), lq.y - 3.0)`
    : `abs(wn.y) > 0.5 ? vec4(8.0, sd, lq.x, lq.z) : vec4(${style}.0, sd, dot(lq.xz, tn), lq.y - 3.0)`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uFlood: U.uFlood, uHiQ: U.uHiQ, uDay: U.uDay, uTime: U.uTime, uCloud: U.uCloud, uTexR: U.uTexR, uSigns: { value: signTex }, uFacDet: DET_U.fachada, uWallDet: DET_U.hormigon, uFanFlag: FAN_U.tex, uFanK: FAN_U.k });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec4 vPat; varying vec2 vWXZ; varying float vGroundY;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wq = instanceMatrix * vec4(position, 1.0); vec3 lq = wq.xyz - instanceMatrix[3].xyz; vWXZ = wq.xz; vGroundY = lq.y - 3.0;
        mat3 im3 = mat3(instanceMatrix);
        vec3 wn = normalize(im3 * (normal / vec3(dot(im3[0], im3[0]), dot(im3[1], im3[1]), dot(im3[2], im3[2])))); vec2 tn = normalize(vec2(-wn.z, wn.x) + 1e-6);
        float sd = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 50.0;
        vPat = ${pat};
        vColor = vec4(instanceColor.rgb * (abs(wn.y) > 0.5 ? ${part === 2 ? "0.7" : "0.55"} : ${part === 2 ? "0.85" : "1.0"}), 1.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PROP_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PROP_FB)
      .replace("#include <color_fragment>", "")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = rough;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("#include <normal_fragment_maps>", PROP_NORMAL)
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + glowC;");
  };
  m.customProgramCacheKey = () => "ciudad" + style + "-" + part;
  return m;
}

let world = null, gaV = new Map(), gSlot = 20, startL = null;
let standS = []; // gradas para el sonido del público: [s del centro, lado, largo]
function buildWorld() {
  standS = [];
  if (world) for (const o of world.all) {
    scene.remove(o);
    if (o.geometry && !o.userData?.sharedGeo) o.geometry.dispose();
    if (o.userData?.far) { o.userData.near.dispose(); o.userData.far.dispose(); }
  }
  const all = [], n = T.n, tmp = mkS(), E = T.E, street = T.street, cityRoofs = [];
  const add = (o) => { scene.add(o); all.push(o); return o; };
  const SH = street ? 1.22 : 1.7; // hasta dónde llega el arcén (en medias anchuras)
  /** Cinta a lo largo de la pista. cols(i, s) devuelve, por columna, [lado en anchuras, lado en metros, altura, u]. */
  function ribbon(i0, count, cols, mat, order, road, extra) {
    const N = count + 1, C = cols(0, 0).length, V = N * C;
    const P = new Float32Array(V * 3), NO = new Float32Array(V * 3), S = new Float32Array(V * 3), ED = new Float32Array(V * 3), GEO = new Float32Array(V * 4);
    const f1 = () => new Float32Array(V), UU = f1(), VV = f1(), WET = f1(), WETO = f1(), KE = f1(), DA = f1(), LI = f1(), WR = f1();
    const msIdx = new Int16Array(N);
    for (let k = 0; k < N; k++) {
      const i = mod(i0 + k, n), s = (i0 + k) * T.ds;
      sample(s, tmp);
      const m = track.ms[track.msOfPoint[i]], cs = cols(i, s), bSin = Math.sin(T.bank[i]);
      // normal suave de la superficie sin peralte (perpendicular a la tangente 3D y al eje lateral)
      const snx = -tmp.rz * tmp.ty, sny = tmp.rz * tmp.tx - tmp.rx * tmp.tz, snz = tmp.rx * tmp.ty;
      const snl = Math.hypot(snx, sny, snz) || 1;
      let brkK = 0;
      if (road && track.vref) {
        const dv = (track.vref[i] - track.vref[(i + 2) % n]) / Math.max(1, 2 * T.ds);
        brkK = clamp((dv - 0.18) / 0.55, 0, 1);
      }
      msIdx[k] = m.i;
      for (let j = 0; j < C; j++) {
        const v = k * C + j, c = cs[j];
        P[v * 3] = tmp.x; P[v * 3 + 1] = tmp.y; P[v * 3 + 2] = tmp.z;
        NO[v * 3] = snx / snl; NO[v * 3 + 1] = sny / snl; NO[v * 3 + 2] = snz / snl;
        S[v * 3] = tmp.rx; S[v * 3 + 2] = tmp.rz;
        const ps = road ? 1 : T.PS;
        GEO[v * 4] = c[0] * ps; GEO[v * 4 + 1] = c[1] * ps; GEO[v * 4 + 2] = c[2]; GEO[v * 4 + 3] = bSin;
        UU[v] = c[3]; VV[v] = s; WR[v] = T.wr[i];
        if (road) {
          const ot = m.overtake >= 0.15;
          ED[v * 3] = ot ? 1 : 0.93; ED[v * 3 + 1] = ot ? 0.58 : 0.95; ED[v * 3 + 2] = ot ? 0.16 : 0.97;
          DA[v] = m.drs && sess.aidShort ? (ot ? 2 : 1) : 0; KE[v] = (Math.abs(track.curv[i]) > 0.009 ? 1 : 0) + brkK * 0.45; LI[v] = T.line[i];
        } else if (extra) { const e = extra(i, s, c); KE[v] = e[0]; DA[v] = e[1]; }
      }
    }
    const idx = [];
    for (let k = 0; k < count; k++) for (let j = 0; j < C - 1; j++) { const a = k * C + j, b = a + C; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    const set = (name, arr, size) => g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    set("position", P, 3); set("normal", NO, 3); set("aSide", S, 3); set("aEdge", ED, 3); set("aGeo", GEO, 4);
    set("aU", UU, 1); set("aV", VV, 1);
    set("aWet", WET, 1); set("aWetOff", WETO, 1); set("aWr", WR, 1); set("aKerb", KE, 1); set("aDash", DA, 1); set("aLine", LI, 1);
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = order; mesh.receiveShadow = true;
    mesh.userData = { msIdx, C };
    return add(mesh);
  }
  const vis = getTrackVisual(track.id);
  const bio = BIOMES[vis.biome] || BIOMES.bosque;
  U.uSlopeCol.value.setHex(bio.slope);
  U.uDry.value = bio.dry;
  U.uMow.value = bio.mow;
  U.uKerbA.value.setHex(vis.kerbs[0]);
  U.uKerbB.value.setHex(vis.kerbs[1]);
  U.uKerbC.value.setHex(vis.kerbs[2] ?? vis.kerbs[0]);
  U.uKerbN.value = vis.kerbs.length;
  U.uBarA.value.setHex(vis.barrier ? vis.barrier[0] : 0xc21f24);
  U.uBarB.value.setHex(vis.barrier ? vis.barrier[1] : 0xdeddd8);
  U.uRunAcc.value.setHex(vis.runoff.accent ?? vis.runoff.color);
  U.uRunPat.value = vis.runoff.pattern ?? 0;
  const urbanStyle = vis.urban || "mediterraneo";
  const dsmFlat = urbanStyle === "bahia" || urbanStyle === "neones";
  const ramp = (s) => pitRamp(s);
  const hasRealPit = !street && !!(T.env?.pitPts && T.env.pitPts.length >= 6);
  // Cuando hay polilínea real de pit-lane (OSM), la zona de garajes y paddock queda estrictamente en el tramo recto
  const laneLen0 = T.L - track.pit.entry + track.pit.exit;
  const gM0 = Math.min(100, laneLen0 * 0.25);
  const pitApronRamp = (s) => {
    if (!hasRealPit) return ramp(s);
    const p = mod(s - (track.pit.entry + gM0 - 36), T.L);
    const span = laneLen0 - 2 * gM0 + 84;
    if (p > span) return 0;
    return sstep(0, 26, p) * (1 - sstep(span - 26, span, p));
  };
  const rightEdge = (s) => Math.max(SH, pitApronRamp(s) * (PIT_OFF + 4.2));
  const grassCol = street ? 0x7c8187 : bio.grass;
  // arcén con su talud suave (aU = 1 abajo: pasa a tierra/roca triplanar sin estirar la hierba), escapatoria (grava o asfalto pintado), boxes, asfalto y muros
  // En el puente de Suzuka, el talud se recoge para dejar totalmente libre el paso inferior.
  const ovp = vis.overpass, dCirc = (a, b) => Math.min(mod(a - b, T.L), mod(b - a, T.L));
  const bridgeK = (s) => (ovp ? 1 - sstep((ovp.halfSpan ?? 52) - 8, (ovp.halfSpan ?? 52) + 14, dCirc(s, ovp.sOver)) : 0);
  const bankW = street ? 10 : 36, bankH = street ? -28 : -16;
  ribbon(0, n, (i, s) => {
    const re = rightEdge(s), bk = bridgeK(s);
    const shL = SH * (1 - bk) + 1.12 * bk, shR = re * (1 - bk) + 1.12 * bk;
    const bw = bankW * (1 - bk), bh = bankH * (1 - bk) - 1.3 * bk;
    return [[-(shL + 1.3 * (1 - bk)), -(T.rO[i] + bw), bh, 1 - bk], [-shL, -T.rO[i], 0, 0], [shR, T.rP[i], 0, 0], [shR + 1.3 * (1 - bk), T.rP[i] + bw, bh, 1 - bk]];
  }, ribbonMat(grassCol, street || bio.arid ? 4 : 3, 0), 1);
  if (!street) {
    const painted = vis.runoff.mode === "asfalto";
    const gZones = vis.gravelZones;
    const gravelK = (s) => {
      if (!gZones?.length) return 0;
      const sm = mod(s, T.L);
      let k = 0;
      for (const [a, b] of gZones) k = Math.max(k, sstep(a - 14, a + 10, sm) * (1 - sstep(b - 10, b + 14, sm)));
      return k;
    };
    const gStrips = vis.gravelStrips;
    const stripK = (s) => {
      if (!gStrips?.length) return 0;
      const sm = mod(s, T.L);
      let k = 0;
      for (const [a, b] of gStrips) k = Math.max(k, sstep(a - 10, a + 8, sm) * (1 - sstep(b - 8, b + 10, sm)));
      return k;
    };
    const rMat = ribbonMat(vis.runoff.color || bio.gravel, painted ? 9 : 4, -1);
    if (painted && gZones?.length) {
      // Transición disjunta entre asfalto pintado y grava real (evita solapes / Z-fighting en las juntas)
      const gMat = ribbonMat(bio.gravel, 4, -2);
      const pOf = (gk) => 1 - sstep(0.12, 0.46, gk);
      const gOf = (gk) => sstep(0.54, 0.88, gk);
      ribbon(0, n, (i, s) => { const r = T.rO[i] * pOf(gravelK(s)), f = Math.min(1, r / 3); return [[-(1.08 + 0.48 * f), -r, 0, r], [-1.08, 0, 0, 0]]; }, rMat, 2, false, () => [0, 1]);
      ribbon(0, n, (i, s) => { const r = T.rP[i] * pOf(gravelK(s)), f = Math.min(1, r / 3); return [[1.08, 0, 0, 0], [1.08 + 0.48 * f, r, 0, r]]; }, rMat, 2, false, () => [0, 1]);
      ribbon(0, n, (i, s) => { const r = T.rO[i] * gOf(gravelK(s)); return [[-1.3, -r, 0, 0], [-1.3, 0, 0, 0]]; }, gMat, 2, false, () => [0, 1]);
      ribbon(0, n, (i, s) => { const r = T.rP[i] * gOf(gravelK(s)); return [[1.3, 0, 0, 0], [1.3, r, 0, 0]]; }, gMat, 2, false, () => [0, 1]);
      if (gStrips?.length) {
        // Tira estrecha de grava FIA (2,8 m) pegada al piano exterior delante del asfalto pintado (p. ej. T9-T10 en Spielberg)
        const sMat = ribbonMat(bio.gravel, 4, -3);
        ribbon(0, n, (i, s) => { const w = Math.min(2.8, T.rO[i]) * stripK(s) * pOf(gravelK(s)); return [[-1.12, -w, 0.01, 0], [-1.12, 0, 0.01, 0]]; }, sMat, 3, false, () => [0, 1]);
        ribbon(0, n, (i, s) => { const w = Math.min(2.8, T.rP[i]) * stripK(s) * pOf(gravelK(s)); return [[1.12, 0, 0.01, 0], [1.12, w, 0.01, 0]]; }, sMat, 3, false, () => [0, 1]);
      }
    } else if (painted) {
      ribbon(0, n, (i) => { const r = T.rO[i], f = Math.min(1, r / 3); return [[-(1.08 + 0.48 * f), -r, 0, r], [-1.08, 0, 0, 0]]; }, rMat, 2, false, () => [0, 1]);
      ribbon(0, n, (i) => { const r = T.rP[i], f = Math.min(1, r / 3); return [[1.08, 0, 0, 0], [1.08 + 0.48 * f, r, 0, r]]; }, rMat, 2, false, () => [0, 1]);
    } else {
      ribbon(0, n, (i) => [[-1.3, -T.rO[i], 0, 0], [-1.3, 0, 0, 0]], rMat, 2, false, () => [0, 1]);
      ribbon(0, n, (i) => [[1.3, 0, 0, 0], [1.3, T.rP[i], 0, 0]], rMat, 2, false, () => [0, 1]);
    }
  }
  // ---- Calle de boxes real (OSM) o paralela sintética
  let realPit = null;
  const pitI0 = Math.floor(track.pit.entry / T.ds), pitN = Math.ceil((T.L - track.pit.entry + track.pit.exit) / T.ds);
  if (hasRealPit) {
    const rawPts = T.env.pitPts.map(([gx, gy]) => [gx - T.cx, -(gy - T.cy)]);
    // Remuestreo suave cada ~7 m a lo largo de la polilínea real de OSM
    const cum = [0];
    for (let k = 1; k < rawPts.length; k++) cum.push(cum[k - 1] + Math.hypot(rawPts[k][0] - rawPts[k - 1][0], rawPts[k][1] - rawPts[k - 1][1]));
    const totL = cum[cum.length - 1] || 1;
    const M = Math.max(40, Math.round(totL / 7));
    const px = new Float32Array(M + 1), pz = new Float32Array(M + 1), py = new Float32Array(M + 1);
    const ptx = new Float32Array(M + 1), ptz = new Float32Array(M + 1), prx = new Float32Array(M + 1), prz = new Float32Array(M + 1);
    const ps = new Float32Array(M + 1), pushW = new Float32Array(M + 1), nearS = new Float32Array(M + 1);
    for (let k = 0; k <= M; k++) {
      const dist = (k / M) * totL;
      ps[k] = dist;
      let j = 0;
      while (j < cum.length - 2 && cum[j + 1] < dist) j++;
      const f = (dist - cum[j]) / Math.max(1e-4, cum[j + 1] - cum[j]);
      px[k] = rawPts[j][0] + (rawPts[j + 1][0] - rawPts[j][0]) * f;
      pz[k] = rawPts[j][1] + (rawPts[j + 1][1] - rawPts[j][1]) * f;
    }
    // Suavizado ligero de vértices interiores (mantiene intactos el arranque y la incorporación)
    for (let pass = 0; pass < 2; pass++) {
      const nx = px.slice(), nz = pz.slice();
      for (let k = 1; k < M; k++) { nx[k] = (px[k - 1] + 2 * px[k] + px[k + 1]) * 0.25; nz[k] = (pz[k - 1] + 2 * pz[k] + pz[k + 1]) * 0.25; }
      px.set(nx); pz.set(nz);
    }
    // Proyección sobre pista para altitud suave, tangentes y empuje lateral adaptativo con uW
    for (let k = 0; k <= M; k++) {
      const dx = px[Math.min(M, k + 1)] - px[Math.max(0, k - 1)];
      const dz = pz[Math.min(M, k + 1)] - pz[Math.max(0, k - 1)];
      const dl = Math.hypot(dx, dz) || 1;
      ptx[k] = dx / dl; ptz[k] = dz / dl;
      prx[k] = -ptz[k]; prz[k] = ptx[k];
      let bi = 0, bd2 = 1e12;
      for (let i = 0; i < n; i++) {
        const d2 = (T.X[i] - px[k]) ** 2 + (T.Z[i] - pz[k]) ** 2;
        if (d2 < bd2) { bd2 = d2; bi = i; }
      }
      nearS[k] = bi * T.ds;
      py[k] = T.H[bi];
      const dTr = Math.sqrt(bd2);
      const endK = sstep(0, 60, ps[k]) * sstep(0, 60, totL - ps[k]);
      // En la recta junto a boxes (dTr ~ 12 m), se abre con uW igual que PIT_OFF; en el atajo de curva 10 (dTr > 28 m) mantiene la isleta verde real
      pushW[k] = PIT_OFF * endK * (1 - sstep(16, 36, dTr));
    }
    for (let pass = 0; pass < 4; pass++) {
      const ny = py.slice();
      for (let k = 1; k < M; k++) ny[k] = (py[k - 1] + 2 * py[k] + py[k + 1]) * 0.25;
      py.set(ny);
    }
    // Construir cinta de asfalto del pit-lane real usando el mismo shader RMODE=2
    const V = (M + 1) * 2;
    const P = new Float32Array(V * 3), NO = new Float32Array(V * 3), S2 = new Float32Array(V * 3), ED = new Float32Array(V * 3), GEO = new Float32Array(V * 4);
    const f1 = () => new Float32Array(V), UU = f1(), VV = f1(), WET = f1(), WETO = f1(), KE = f1(), DA = f1(), LI = f1(), WR = f1();
    const idx = [];
    for (let k = 0; k <= M; k++) {
      const pw = pushW[k] * T.PS;
      const cols = [[pw - 0.55, -pw * W_REAL, 0.04, -1], [pw + 0.55, -pw * W_REAL, 0.04, 1]];
      const k0 = Math.max(0, k - 1), k1 = Math.min(M, k + 1);
      const dyP = py[k1] - py[k0], dsP = Math.max(0.5, ps[k1] - ps[k0]), tyP = dyP / Math.hypot(dsP, dyP);
      const pnx = -prz[k] * tyP, pny = Math.sqrt(Math.max(0.01, 1 - tyP * tyP)), pnz = prx[k] * tyP;
      for (let j = 0; j < 2; j++) {
        const v = k * 2 + j, c = cols[j];
        P[v * 3] = px[k]; P[v * 3 + 1] = py[k]; P[v * 3 + 2] = pz[k];
        NO[v * 3] = pnx; NO[v * 3 + 1] = pny; NO[v * 3 + 2] = pnz;
        S2[v * 3] = prx[k]; S2[v * 3 + 2] = prz[k];
        GEO[v * 4] = c[0]; GEO[v * 4 + 1] = c[1]; GEO[v * 4 + 2] = c[2]; GEO[v * 4 + 3] = 0;
        UU[v] = c[3]; VV[v] = ps[k]; WR[v] = 1;
      }
      if (k < M) { const a = k * 2, b = a + 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const pg = new THREE.BufferGeometry();
    const set = (nm, arr, sz) => pg.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
    set("position", P, 3); set("normal", NO, 3); set("aSide", S2, 3); set("aEdge", ED, 3); set("aGeo", GEO, 4);
    set("aU", UU, 1); set("aV", VV, 1); set("aWet", WET, 1); set("aWetOff", WETO, 1); set("aWr", WR, 1); set("aKerb", KE, 1); set("aDash", DA, 1); set("aLine", LI, 1);
    pg.setIndex(idx);
    const pitMesh = add(new THREE.Mesh(pg, ribbonMat(0x6d747e, 2, -2)));
    pitMesh.frustumCulled = false; pitMesh.renderOrder = 3; pitMesh.receiveShadow = true;
    // Muros bajos de hormigón (lado pista) y guardarraíles exteriores a lo largo del pit-lane real (atajo T10 y salida T1)
    const addPitWall = (sideLat, hFn, mat) => {
      const WP = new Float32Array(V * 3), WNO = new Float32Array(V * 3), WS = new Float32Array(V * 3), WED = new Float32Array(V * 3), WGEO = new Float32Array(V * 4);
      const WUU = f1(), WVV = f1(), WWET = f1(), WWETO = f1(), WKE = f1(), WDA = f1(), WLI = f1(), WWR = f1();
      for (let k = 0; k <= M; k++) {
        const pw = pushW[k] * T.PS, h = hFn(k);
        const cols = [[pw + sideLat, -pw * W_REAL, 0, 0], [pw + sideLat, -pw * W_REAL, h, 1]];
        for (let j = 0; j < 2; j++) {
          const v = k * 2 + j, c = cols[j];
          WP[v * 3] = px[k]; WP[v * 3 + 1] = py[k]; WP[v * 3 + 2] = pz[k]; WNO[v * 3 + 1] = 1;
          WS[v * 3] = prx[k]; WS[v * 3 + 2] = prz[k];
          WGEO[v * 4] = c[0]; WGEO[v * 4 + 1] = c[1]; WGEO[v * 4 + 2] = c[2]; WGEO[v * 4 + 3] = 0;
          WUU[v] = c[3]; WVV[v] = ps[k]; WWR[v] = 1;
        }
      }
      const wg = new THREE.BufferGeometry();
      const wset = (nm, arr, sz) => wg.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
      wset("position", WP, 3); wset("normal", WNO, 3); wset("aSide", WS, 3); wset("aEdge", WED, 3); wset("aGeo", WGEO, 4);
      wset("aU", WUU, 1); wset("aV", WVV, 1); wset("aWet", WWET, 1); wset("aWetOff", WWETO, 1); wset("aWr", WWR, 1); wset("aKerb", WKE, 1); wset("aDash", WDA, 1); wset("aLine", WLI, 1);
      wg.setIndex(idx);
      const wm = add(new THREE.Mesh(wg, mat));
      wm.frustumCulled = false; wm.renderOrder = 5; wm.receiveShadow = true;
    };
    // Muro divisor interior del carril de entrada (isla de T10) y del carril de salida (interior T1 hasta antes de la incorporación)
    addPitWall(-0.62 * T.PS, (k) => {
      const apr = pitApronRamp(nearS[k]);
      if (apr > 0.85) return 0;
      const inEnt = ps[k] > 55 && ps[k] < totL * 0.45;
      const inEx = ps[k] > totL * 0.5 && ps[k] < totL - 105;
      return inEnt || inEx ? 0.92 : 0;
    }, ribbonMat(0xcfd4db, 0, 0));
    // Guardarraíl exterior protegiendo entrada y salida de boxes fuera de la zona de garajes
    addPitWall(0.62 * T.PS, (k) => {
      const apr = pitApronRamp(nearS[k]);
      if (apr > 0.04) return 0;
      return ps[k] > 42 && ps[k] < totL - 48 ? 1.0 : 0;
    }, ribbonMat(0xcfd4db, 5, 0));
    // Muestras para animar los coches por la calle real de boxes sin tocar la simulación
    const samplePit = (u, W, out) => {
      const f = clamp(u, 0, 1) * M, k0 = Math.min(M - 1, Math.floor(f)), t = f - k0;
      const lerp = (a) => a[k0] + (a[k0 + 1] - a[k0]) * t;
      const rx = lerp(prx), rz = lerp(prz), tx = lerp(ptx), tz = lerp(ptz);
      const pw = lerp(pushW) * T.PS * (W - W_REAL);
      out.x = lerp(px) + rx * pw; out.y = lerp(py) + 0.04; out.z = lerp(pz) + rz * pw;
      out.tx = tx; out.tz = tz; out.rx = rx; out.rz = rz; out.s = lerp(nearS);
      return out;
    };
    const uOfS = (s) => {
      const sm = mod(s, T.L);
      let bk = 0, bd = 1e9;
      for (let k = 0; k <= M; k++) { const d = Math.min(mod(nearS[k] - sm, T.L), mod(sm - nearS[k], T.L)); if (d < bd) { bd = d; bk = k; } }
      return bk / M;
    };
    const pitNear = new Uint8Array(n);
    for (let k = 0; k <= M; k++) {
      for (let i = 0; i < n; i++) {
        if ((T.X[i] - px[k]) ** 2 + (T.Z[i] - pz[k]) ** 2 < 17 * 17) pitNear[i] = 1;
      }
    }
    realPit = { sample: samplePit, uOfS, sEntry: nearS[0], sExit: nearS[M], totL, pitNear };
    // Zona de trabajo delante de garajes y plataforma de paddock solo en el tramo recto
    const apI0 = Math.floor(mod(track.pit.entry + gM0 - 36, T.L) / T.ds);
    const apN = Math.ceil((laneLen0 - 2 * gM0 + 84) / T.ds);
    ribbon(apI0, apN, (i, s) => { const r = pitApronRamp(s), o = PIT_OFF; return [[o + 0.55, 0, 0, 0], [o + 0.55 + r * 0.8, 0, 0, 0]]; }, ribbonMat(0x9a9fa6, 8, -2), 3);
    ribbon(apI0, apN, (i, s) => { const r = pitApronRamp(s), o = PIT_OFF; return [[o + 1.35 * r + 0.55 * (1 - r), 0, 0, 0], [o + (1.35 + 2.6) * r + 0.55 * (1 - r), 10 * r, 0, 0]]; }, ribbonMat(0x8a9097, 8, -1), 2);
  } else {
    ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF; return [[o - 0.55, 0, 0, -1], [o + 0.55, 0, 0, 1]]; }, ribbonMat(0x6d747e, 2, -2), 3);
    // zona de trabajo delante de los garajes y paddock detrás
    ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF, r = ramp(s); return [[o + 0.55, 0, 0, 0], [o + 0.55 + r * 0.8, 0, 0, 0]]; }, ribbonMat(0x9a9fa6, 8, -2), 3);
    ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF, r = ramp(s); return [[o + 1.35 * r + 0.55 * (1 - r), 0, 0, 0], [o + (1.35 + 2.6) * r + 0.55 * (1 - r), 10 * r, 0, 0]]; }, ribbonMat(0x8a9097, 8, -1), 2);
  }
  const road = ribbon(0, n, () => [[-1, 0, 0, -1], [1, 0, 0, 1]], ribbonMat(0x5a606a, 1, -3), 4, true);
  // barrera a cada lado: neumáticos por fuera de las curvas con escapatoria, guardarraíl en el resto
  const wallMat = ribbonMat(0xcfd4db, 5, 0), wl = SH - 0.08;
  const kAbs = blur(Float32Array.from(track.curv, Math.abs), Math.round(45 / T.ds), n);
  const sideOf = (c) => (Math.sign(c[0]) * T.PS > 0 ? 1 : 0);
  const pitGap = (s) => {
    if (!realPit) return ramp(s) > 0.02;
    const sm = mod(s, T.L);
    const idx = Math.min(n - 1, Math.floor(sm / T.ds));
    // Abrir huecos limpios donde el pit-lane real discurre pegado a la pista (< 17 m), en la entrada/salida real y en la recta de boxes (manteniendo barrera en islas anchas como T10 en Spielberg)
    const inEntry = dCirc(sm, realPit.sEntry) < 42;
    const exitSpan = mod(realPit.sExit - (track.pit.entry + laneLen0 - gM0), T.L);
    const fromApron = mod(sm - (track.pit.entry + laneLen0 - gM0 - 15), T.L);
    const inExitCorridor = exitSpan < 700 && fromApron <= exitSpan + 35;
    return !!realPit.pitNear[idx] || inEntry || inExitCorridor || pitApronRamp(s) > 0.05;
  };
  ribbon(0, n, (i) => [[-wl, -T.rO[i], 0, 0], [-wl, -T.rO[i], 1.05, 1]], wallMat, 5, false, (i, s, c) => [T.rO[i] > 3 ? 1 : 0, sideOf(c)]);
  ribbon(0, n, (i, s) => { const h = pitGap(s) ? 0 : 1.05; return [[wl, T.rP[i], 0, 0], [wl, T.rP[i], h, 1]]; }, wallMat, 5, false, (i, s, c) => [T.rP[i] > 3 ? 1 : 0, sideOf(c)]);
  // muro del pit-lane, entre la pista y los boxes
  ribbon(pitI0, pitN, (i, s) => { const r = hasRealPit ? pitApronRamp(s) : ramp(s), o = 1.0 + (PIT_OFF - 0.55 - 1.0) * 0.5, h = r > 0.92 ? 0.9 : 0; return [[o, 0, 0, 0], [o, 0, h, 1]]; }, ribbonMat(0xcfd4db, 0, 0), 5);
  // valla alta translúcida (tras los coches para mezclarse bien sobre ellos si quedan detrás) y paneles de publicidad
  const fenceMat = ribbonMat(0x80868e, 6, 0), adMat = ribbonMat(0xffffff, 7, 0);
  const pitSide = (s) => pitGap(s);
  ribbon(0, n, (i) => [[-wl, -T.rO[i] - 1.6, 0, 0], [-wl, -T.rO[i] - 1.6, 3.4, 1]], fenceMat, 11);
  ribbon(0, n, (i, s) => { const h = pitSide(s) ? 0 : 3.4; return [[wl, T.rP[i] + 1.6, 0, 0], [wl, T.rP[i] + 1.6, h, 1]]; }, fenceMat, 11);
  const adH = (i) => (kAbs[i] < 0.0022 ? 1 : 0);
  ribbon(0, n, (i) => { const h = adH(i); return [[-wl, -T.rO[i] - 0.5, 1.1 * h, 0], [-wl, -T.rO[i] - 0.5, 2.15 * h, 1]]; }, adMat, 5, false, (i, s, c) => [0, sideOf(c)]);
  ribbon(0, n, (i, s) => { const h = pitSide(s) ? 0 : adH(i); return [[wl, T.rP[i] + 0.5, 1.1 * h, 0], [wl, T.rP[i] + 0.5, 2.15 * h, 1]]; }, adMat, 5, false, (i, s, c) => [0, sideOf(c)]);

  // ---- terreno: sigue la altura de la pista cerca de ella y se vuelve colinas suaves lejos
  const step = Math.max(1, Math.round(40 / T.ds)), sx = [], sz = [], sh = [];
  for (let i = 0; i < n; i += step) { sx.push(T.X[i]); sz.push(T.Z[i]); sh.push(T.H[i]); }
  const terr = (x, z, rc) => {
    let wsum = 0, hsum = 0, dmin = 1e12, cap = 1e9;
    const rc2 = rc * rc;
    for (let k = 0; k < sx.length; k++) {
      const d2 = (x - sx[k]) ** 2 + (z - sz[k]) ** 2;
      if (d2 < dmin) dmin = d2;
      if (d2 < rc2 && sh[k] < cap) cap = sh[k];
      const w = 1 / (d2 + 450) ** 1.75;
      wsum += w; hsum += w * sh[k];
    }
    const d = Math.sqrt(dmin), near = hsum / wsum;
    let far = T.hmean * 0.6 + (vnoise(x / (E * 0.22), z / (E * 0.22)) - 0.35) * E * 0.06;
    let b = sstep(E * 0.06, E * 0.55, d), wet = false;
    if (T.env) {
      // terreno real: mar/lagos/ríos por debajo de la lámina de agua, montañas y valles reales (Singapur/Las Vegas en DSM llano)
      wet = T.env.wet(x, z);
      far = wet ? T.env.sea - 6 : dsmFlat ? Math.max(T.env.sea + 1.5, Math.min(T.env.at(x, z), T.hmean + 2)) : T.env.at(x, z);
      b = wet ? sstep(T.SH * W_REAL + 22, T.SH * W_REAL + 72, d) : sstep(T.SH * T.Wov * 1.4, T.SH * T.Wov * 1.4 + 135, d);
    }
    const rawH = near + (far - near) * b - 0.85;
    // Solo recorta por debajo de la pista en un pasillo estrecho para no hundir laderas vecinas en circuitos con gran desnivel
    return { h: cap < 1e8 ? Math.min(rawH, cap - 1.35) : rawH, d, wet };
  };
  const park = (x, z) => sstep(0.24, 0.16, vnoise(x / 240 + 5, z / 240 + 9)); // zonas verdes de las ciudades
  const cPark = new THREE.Color(bio.cB), cRock = new THREE.Color(bio.slope), cGarr = new THREE.Color(0x556c44);
  const G = 128, R = E * 3.2, PW = 1.5, TR = U.uTexR.value = E * 1.5;
  const tp = new Float32Array((G + 1) * (G + 1) * 3), tc = new Float32Array((G + 1) * (G + 1) * 3), tuv = new Float32Array((G + 1) * (G + 1) * 2);
  const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), PW) * R;
  const cA = new THREE.Color(street ? 0x6d7278 : bio.cA), cB = new THREE.Color(street ? 0x80858b : bio.cB), cC = new THREE.Color(street ? 0x8a8f95 : bio.cC), cc = new THREE.Color();
  for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) {
    const ua = (a / G) * 2 - 1, ub = (b / G) * 2 - 1, x = warp(ua), z = warp(ub), v = a * (G + 1) + b;
    const cell = R * PW * Math.pow(Math.max(Math.abs(ua), Math.abs(ub), 0.02), PW - 1) * (2 / G);
    const t = terr(x, z, cell * 0.65 + T.Wov * 1.35 + 10);
    tp[v * 3] = x; tp[v * 3 + 1] = t.h; tp[v * 3 + 2] = z;
    tuv[v * 2] = x / (2 * TR) + 0.5; tuv[v * 2 + 1] = z / (2 * TR) + 0.5;
    cc.copy(cA).lerp(cB, vnoise(x / (E * 0.09) + 7, z / (E * 0.09) + 3)).lerp(cC, Math.max(0, 1 - t.d / (T.Wov * 5)) * 0.6);
    if (street) {
      // parques (donde no hay manzanas) y, en Mónaco, la ladera mediterránea: monte verde y roca caliza
      const far2 = sstep(T.SH * T.Wov + 30, T.SH * T.Wov + 70, t.d);
      cc.lerp(cPark, park(x, z) * far2 * 0.85);
      if (T.env) {
        const alt = t.h - T.env.sea;
        cc.lerp(cGarr, sstep(16, 65, alt) * 0.65);
        cc.lerp(cRock, sstep(55, 165, alt) * 0.85);
      }
    }
    tc[v * 3] = cc.r; tc[v * 3 + 1] = cc.g; tc[v * 3 + 2] = cc.b;
  }
  const ti = [];
  for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) { const p = a * (G + 1) + b; ti.push(p, p + 1, p + G + 1, p + 1, p + G + 2, p + G + 1); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(tp, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(tuv, 2));
  tg.setIndex(ti);
  tg.computeVertexNormals(); // normales suaves: las colinas ya no se ven a facetas
  const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  const uDetT = street ? DET_U.asfalto : bio.arid ? DET_U.grava : DET_U.hierba;
  terrMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uDet: uDetT, uRock: DET_U.grava, uCloud: U.uCloud, uTexR: U.uTexR, uFlood: U.uFlood, uSlopeCol: U.uSlopeCol, uDry: U.uDry, uCloudShade: U.uCloudShade });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX; varying float vWY, vSlope;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTX = position.xz; vWY = position.y; vSlope = 1.0 - clamp(normal.y, 0.0, 1.0);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX; varying float vWY, vSlope; uniform sampler2D uDet, uRock, uCloud; uniform float uTexR, uFlood, uDry, uCloudShade; uniform vec3 uSlopeCol;" + GLSL_NOISE)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 t1 = texture2D(uDet, vTX / 3.3), t2 = texture2D(uDet, vTX / 41.0 + 0.31);
        vec3 tcol = diffuse * (0.5 + 1.0 * t1.r) * (0.7 + 0.6 * t2.r) * (0.82 + 0.36 * vn(vTX * 0.13)) * (0.86 + 0.28 * vn(vTX * 0.011));
        ${street || bio.arid ? "" : "tcol = mix(tcol, tcol * vec3(1.42, 1.12, 0.58), smoothstep(0.5, 0.88, vn(vTX * 0.031 + 4.0)) * uDry);"}
        vec2 tdn = (t1.gb - 0.5) * 2.0 + (t2.gb - 0.5) * 0.8;
        // laderas muy empinadas: roca/tierra con estratos en proyección vertical (mantiene verdes las colinas suaves)
        float slp = smoothstep(0.24, 0.48, vSlope + (vn(vTX * 0.025) - 0.5) * 0.06);
        if (slp > 0.01) {
          vec4 rk = texture2D(uRock, vec2(vTX.x + vTX.y, vWY) / 6.0);
          float strata = 0.78 + 0.44 * vn(vec2((vTX.x - vTX.y) * 0.018, vWY * 0.16));
          vec3 rcol = uSlopeCol * (0.62 + 0.76 * rk.r) * strata;
          tcol = mix(tcol, rcol, slp * 0.68);
          tdn = mix(tdn, (rk.gb - 0.5) * 2.2, slp);
        }
        tcol *= 1.0 - uCloudShade * texture2D(uCloud, vTX / (2.0 * uTexR) + 0.5).g;
        vec4 diffuseColor = vec4(tcol, opacity);`)
      .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(tdn.x, 0.0, tdn.y));")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * vColor.rgb * uFlood * 0.12;");
  };
  terrMat.customProgramCacheKey = () => "terreno" + (street ? "u" : bio.arid ? "a" : "g");
  const terrain = add(new THREE.Mesh(tg, terrMat));
  terrain.frustumCulled = false; terrain.receiveShadow = true;

  // ---- mar, puertos, lagos y ríos: lámina de agua a su cota real (solo en circuitos que tienen agua en el entorno)
  let boatMeshRef = null;
  if (T.env && T.env.hasWater) {
    const en = T.env.en, NE = en.n, md = new Uint8Array(NE * NE * 4), wm0 = T.env.wMask;
    if (wm0) {
      // suavizado de 1 celda sobre la máscara booleana para dar una orilla orgánica y turquesa
      for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) {
        let s = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const jj = j + dj, ii = i + di;
          if (jj >= 0 && jj < NE && ii >= 0 && ii < NE) { s += wm0[jj * NE + ii]; cnt++; }
        }
        const k = j * NE + i, val = wm0[k] ? 0.55 + 0.45 * (s / cnt) : 0.45 * (s / cnt);
        md[k * 4] = clamp(val, 0, 1) * 255; md[k * 4 + 3] = 255;
      }
    } else {
      for (let k = 0; k < NE * NE; k++) { md[k * 4] = clamp((1.6 - en.h[k]) / 2, 0, 1) * 255; md[k * 4 + 3] = 255; }
    }
    const mt = new THREE.DataTexture(md, NE, NE, THREE.RGBAFormat); mt.magFilter = mt.minFilter = THREE.LinearFilter; mt.needsUpdate = true;
    const wm = new THREE.MeshStandardMaterial({ color: bio.sea, roughness: 0.18, metalness: 0, envMapIntensity: 0.72 });
    const span = en.paso * (NE - 1);
    wm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uMask: { value: mt }, uTime: U.uTime, uFlood: U.uFlood, uG: { value: new THREE.Vector4(T.cx - en.x0, T.cy - en.y0, span, 0) } });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWXZ;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWXZ = position.xz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vWXZ; uniform sampler2D uMask; uniform float uTime, uFlood; uniform vec4 uG;" + GLSL_NOISE)
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec2 mu = vec2(vWXZ.x + uG.x, -vWXZ.y + uG.y) / uG.z;
          float mk = texture2D(uMask, mu).r;
          if (mk < 0.5) discard;
          // olas: dos trenes de ruido que se cruzan, y agua algo más turquesa junto a la orilla y los muelles
          vec2 dn = (vec2(vn(vWXZ * 0.11 + uTime * 0.35), vn(vWXZ * 0.11 + 9.0 - uTime * 0.3)) - 0.5) * 0.32
                  + (vec2(vn(vWXZ * 0.53 - uTime * 0.9), vn(vWXZ * 0.47 + 3.0 + uTime * 0.8)) - 0.5) * 0.14;
          vec3 wcol = mix(diffuse, SR(vec3(0.06, 0.35, 0.44)), (1.0 - smoothstep(0.5, 0.95, mk)) * 0.55);
          vec4 diffuseColor = vec4(wcol * (0.85 + 0.3 * vn(vWXZ * 0.02)), opacity);`)
        .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(dn.x, 0.0, dn.y));")
        .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * uFlood * 0.1;");
    };
    wm.customProgramCacheKey = () => "agua";
    const water = add(new THREE.Mesh(new THREE.PlaneGeometry(E * 7, E * 7).rotateX(-Math.PI / 2).translate(0, T.env.sea + 0.2, 0), wm));
    water.frustumCulled = false; water.receiveShadow = true; water.renderOrder = 0;
    // barcos amarrados cerca de la orilla (solo en puertos deportivos como Mónaco, Singapur y Yas Marina)
    const boats = [], rB = (() => { let q = 999 + n; return () => ((q = (q * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const isLand = (idx) => (wm0 ? !wm0[idx] : en.h[idx] > 1);
    const shore = (i, j) => { for (let a = -3; a <= 3; a++) for (let b2 = -3; b2 <= 3; b2++) { const ii = i + a, jj = j + b2; if (ii >= 0 && jj >= 0 && ii < NE && jj < NE && isLand(jj * NE + ii)) return true; } return false; };
    if (vis.yachts) for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) {
      const idx = j * NE + i;
      if ((wm0 ? !wm0[idx] : en.h[idx] > 0) || !shore(i, j)) continue;
      for (let k = 0; k < 2; k++) {
        if (rB() < 0.55) continue;
        const gx = en.x0 + (i + rB() - 0.5) * en.paso, gy = en.y0 + (j + rB() - 0.5) * en.paso, x = gx - T.cx, z = -(gy - T.cy);
        const dd = trackDist(x, z);
        if (dd < T.SH * T.Wov + 25 || dd > 420 || !T.env.wet(x, z)) continue;
        boats.push([x, z, 12 + rB() * rB() * 45, rB() * Math.PI * 2, rB()]);
      }
    }
    if (boats.length) {
      const boatFallbackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
      const bm = add(new THREE.InstancedMesh(BOAT_GEO, boatFallbackMat, boats.length));
      bm.userData.sharedGeo = true;
      const qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
      const mb = new THREE.Matrix4();
      boats.forEach(([x, z, L, a], k) => { bm.setMatrixAt(k, mb.compose(vv.set(x, T.env.sea + 0.1, z), qq.setFromAxisAngle(yAx, a), sc3.set(L, L, L))); });
      bm.castShadow = true; bm.frustumCulled = false;
      bm.name = "yates";
      boatMeshRef = bm;
    }
  }

  // ---- Pre-cálculo de posiciones de hitos icónicos (para que el arbolado y las manzanas urbanas respeten su claro)
  const lmSpecs = LANDMARKS[track.id] || [];
  const lmClear = []; // [x, z, radio] para que ni árboles ni manzanas urbanas atraviesen los hitos
  const lmPlaced = [];
  if (lmSpecs.length) {
    const lmTmp = mkS(), safeTrack = T.SH * T.Wov + 24;
    for (const spec of lmSpecs) {
      const s = mod(spec.sFrac * T.L, T.L);
      sample(s, lmTmp);
      let lx = 0, lz = 0;
      if (spec.gameXY) {
        lx = spec.gameXY[0] - T.cx;
        lz = -(spec.gameXY[1] - T.cy);
      } else if (spec.infield) {
        // Busca el punto más despejado del prado interior cerca del centroide del circuito
        let bestD = -1;
        for (let gx = -180; gx <= 180; gx += 30) for (let gz = -180; gz <= 180; gz += 30) {
          const td = trackDist(gx, gz);
          if (td > bestD) { bestD = td; lx = gx; lz = gz; }
        }
      } else {
        let d = Math.max(spec.dist, safeTrack + 6), sg = spec.side;
        for (let attempt = 0; attempt < 6; attempt++) {
          lx = lmTmp.x + lmTmp.rx * sg * d;
          lz = lmTmp.z + lmTmp.rz * sg * d;
          if (trackDist(lx, lz) >= safeTrack) break;
          if (attempt === 2) { sg = -sg; d = Math.max(spec.dist, safeTrack + 8); } else d += 30;
        }
      }
      const gy = terr(lx, lz, 0).h;
      const yaw = spec.gameXY ? (spec.rot ?? 0) : (Math.atan2(-lmTmp.tz, lmTmp.tx) + (spec.rot ?? 0));
      const clr = Math.max(30, spec.height * 0.85);
      lmClear.push([lx, lz, clr]);
      lmPlaced.push({ spec, lx, lz, gy, yaw });
    }
  }
  // Áreas ocupadas por gradas reales de OSM (solo si hay >= 2 gradas mapeadas; si no, conserva las procedurales)
  const osmGradas = !street && T.env?.gradas && T.env.gradas.length >= 2 ? T.env.gradas : null;
  const gradaClear = osmGradas ? osmGradas.map(([gx, gy, gl, gd]) => [gx - T.cx, -(gy - T.cy), Math.max(gl, gd) * 0.52 + 12]) : [];

  // ---- arbolado (malla integrada al instante; los .glb por bioma la sustituyen en cuanto llegan)
  const trees = [], rnd = (() => { let s = 12345 + T.n; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const denseForest = !street && !bio.arid && q >= 2;
  const maxT = street ? Math.min(450, bio.maxT) : denseForest ? Math.round(bio.maxT * 2.35) : bio.maxT;
  const innerTarget = denseForest ? Math.round(maxT * 0.68) : 0;
  const useOsmForest = !street && !!T.env?.hasForest;
  for (let tries = 0; tries < 36000 && trees.length < maxT; tries++) {
    const innerPass = trees.length < innerTarget;
    const span = innerPass ? E * 0.92 : E * 1.25;
    const x = (rnd() * 2 - 1) * span, z = (rnd() * 2 - 1) * span;
    if (street) {
      if (park(x, z) < 0.6) continue;
    } else if (useOsmForest) {
      // Máscara real de bosques de OpenStreetMap: coníferas densas donde hay bosque real y praderas despejadas donde hay pradera
      const fv = T.env.forest(x, z);
      if (fv < 0.35 && !(fv > 0.14 && rnd() < 0.08)) continue;
    } else if (innerPass) {
      // masas forestales densas y orgánicas rodeando la pista y colinas cercanas
      const cl = vnoise(x / (E * 0.085) + 31, z / (E * 0.085) + 17);
      if (cl < 0.43) continue;
    } else {
      if (vnoise(x / (E * 0.12) + 31, z / (E * 0.12) + 17) < 0.48) continue;
    }
    const t = terr(x, z, 0);
    const minDist = street ? T.SH * T.Wov + 40 : (denseForest ? T.Wov * 2.7 + 34 : T.Wov * 3.4 + 45);
    if (t.wet || t.d < minDist) continue;
    if (lmClear.some(([lx, lz, lr]) => (x - lx) ** 2 + (z - lz) ** 2 < (lr + 12) ** 2)) continue;
    if (gradaClear.some(([gx, gz, gr]) => (x - gx) ** 2 + (z - gz) ** 2 < gr * gr)) continue;
    const sz = street || bio.arid ? (0.75 + rnd() * 0.7) : (0.95 + rnd() * 0.95);
    trees.push([x, t.h - 1.2, z, sz, rnd(), rnd() * Math.PI * 2, rnd()]);
  }
  let tgc = collect();
  // dos especies mezcladas en la misma malla: frondosa (copa de varios volúmenes) y conífera (tres pisos)
  const blob = (r, x, y, z, shade) => {
    // copa de pocas caras (20) con la normal de una esfera: se ve redonda y pesa poco (hay cientos de árboles, y cuentan
    // dos veces: también en la sombra)
    const g = new THREE.IcosahedronGeometry(r, 0), p = g.attributes.position, nrm = g.attributes.normal, cl = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1;
      nrm.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l);
      const k = 0.86 + 0.28 * hash2(Math.round(p.getX(i) * 400) * 0.0225 + x, Math.round(p.getY(i) * 400) * 0.0175 + z);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k);
      // sombra propia de la copa: oscura abajo y hacia el tronco, clara arriba y por fuera
      const wy = y + p.getY(i), out = Math.hypot(x + p.getX(i), z + p.getZ(i));
      const sh = shade * (0.55 + 0.45 * sstep(0.45, 1.15, wy)) * (0.8 + 0.2 * sstep(0.05, 0.45, out));
      cl[i * 3] = cl[i * 3 + 1] = cl[i * 3 + 2] = sh;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cl, 3));
    tgc.raw(g.translate(x, y, z));
  };
  blob(0.36, 0, 0.82, 0, 1); blob(0.27, 0.22, 0.66, 0.1, 0.9); blob(0.26, -0.2, 0.7, -0.12, 1.08); blob(0.22, 0.02, 1.08, 0.06, 1.14); blob(0.2, -0.05, 0.62, 0.22, 0.95);
  tgc.add(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6).translate(0, 0.27, 0), [0.5, 0.36, 0.26]);
  const treeGeo = tgc.done();
  // de muy lejos (vista general), una sola copa algo mayor y un tronco de tres caras: 26 triángulos en vez de 124
  tgc = collect();
  blob(0.47, 0, 0.8, 0, 1);
  tgc.add(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 3, 1, true).translate(0, 0.22, 0), [0.5, 0.36, 0.26]);
  const treeFar = tgc.done();
  const treeMesh = add(new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), trees.length));
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), c2 = new THREE.Color(bio.treeB);
  const tPos = new THREE.Vector3(), tQuat = new THREE.Quaternion(), tScl = new THREE.Vector3(), yUp = new THREE.Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    const s = T.Wov * 1.05 * t[3];
    m4.compose(tPos.set(t[0], t[1], t[2]), tQuat.setFromAxisAngle(yUp, t[5]), tScl.set(s, s, s));
    treeMesh.setMatrixAt(i, m4);
    treeMesh.setColorAt(i, col.setHex(bio.treeA).lerp(c2, t[4]));
  });
  treeMesh.frustumCulled = false; treeMesh.castShadow = true; treeMesh.receiveShadow = true; treeMesh.name = "arboles";
  treeMesh.userData = { near: treeGeo, far: treeFar };

  // ---- focos (solo de noche)
  const nP = Math.floor(T.L / 130), lampPos = [];
  const lamps = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1c9).multiplyScalar(4), fog: false }), nP));
  const poles = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.6, metalness: 0.5 }), nP));
  for (let k = 0; k < nP; k++) {
    const s = k * 130, i = Math.floor(s / T.ds);
    sample(s, tmp);
    const lat = -T.PS * (SH * W_REAL + T.rO[i] + 5), x = tmp.x + tmp.rx * lat, z = tmp.z + tmp.rz * lat;
    m4.makeScale(1.6, 0.6, 1.6).setPosition(x, tmp.y + 16, z); lamps.setMatrixAt(k, m4); lampPos.push({ x, y: tmp.y + 16, z });
    m4.makeScale(0.35, 16, 0.35).setPosition(x, tmp.y, z); poles.setMatrixAt(k, m4);
  }
  lamps.frustumCulled = poles.frustumCulled = false;
  const hc = document.createElement("canvas"); hc.width = hc.height = 64;
  { const g = hc.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,244,214,1)"); gr.addColorStop(0.25, "rgba(255,236,190,.45)"); gr.addColorStop(1, "rgba(255,230,170,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const hpos = new Float32Array(nP * 3);
  for (let k = 0; k < nP; k++) { lamps.getMatrixAt(k, m4); hpos[k * 3] = m4.elements[12]; hpos[k * 3 + 1] = m4.elements[13]; hpos[k * 3 + 2] = m4.elements[14]; }
  const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(hpos, 3));
  const halos = add(new THREE.Points(hg, new THREE.PointsMaterial({ map: srgb(new THREE.CanvasTexture(hc)), size: 26, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  halos.frustumCulled = false; halos.renderOrder = 15;

  // ---- carteles de frenada (150, 100, 50), puestos de comisarios, pórtico de salida y tribunas
  const vr = track.vref, brakes = [];
  { let vmax = vr[0], falling = false, imin = 0;
    for (let i = 1; i < n * 2 && brakes.length < 14; i++) {
      const j = i % n, v = vr[j];
      if (!falling) { if (v > vmax) vmax = v; if (vmax - v > 20) { falling = true; imin = j; } }
      else if (v < vr[imin]) imin = j;
      else if (v > vr[imin] + 4) { if (i >= n ? !brakes.includes(imin) && brakes.length > 0 : true) { if (!brakes.includes(imin)) brakes.push(imin); } falling = false; vmax = v; if (i >= n) break; }
    } }
  const sideAt = (i) => -T.PS * (SH * W_REAL + T.rO[i] + 2.6); // por fuera de la valla, en el lado contrario a boxes
  const place = (s, lat, y, sx, sy, sz) => {
    sample(s, tmp);
    m4.set(tmp.tx * sx, 0, tmp.rx * sz, tmp.x + tmp.rx * lat,
      0, sy, 0, tmp.y + y,
      tmp.tz * sx, 0, tmp.rz * sz, tmp.z + tmp.rz * lat,
      0, 0, 0, 1);
    return m4;
  };
  const numTex = (txt) => {
    const cv = document.createElement("canvas"); cv.width = 160; cv.height = 112; const g = cv.getContext("2d");
    g.fillStyle = "#f4f5f7"; g.fillRect(0, 0, 160, 112);
    g.fillStyle = "#16191f"; g.fillRect(0, 0, 160, 16);
    g.fillStyle = "#c81e24"; g.fillRect(0, 96, 160, 16);
    g.fillStyle = "#111317"; g.font = "900 66px 'Titillium Web', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, 80, 58);
    return srgb(new THREE.CanvasTexture(cv));
  };
  [150, 100, 50].forEach((d) => {
    const bm = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: numTex(String(d)), roughness: 0.6 }), brakes.length));
    brakes.forEach((bi, k) => { const s = bi * T.ds - d - 35, i2 = Math.floor(mod(s, T.L) / T.ds); bm.setMatrixAt(k, place(s, sideAt(i2) + T.PS * 1.6, 1.0, 1, 1.0, 1.45)); });
    bm.frustumCulled = false;
  });
  // pórtico de salida con el semáforo
  { const gg = collect(), half = SH * W_REAL + 1.2;
    for (const z of [half, -half]) gg.add(new THREE.BoxGeometry(0.3, 6.8, 0.3).translate(0, 3.4, z), [0.2, 0.22, 0.25]);
    gg.add(new THREE.BoxGeometry(0.5, 0.7, half * 2).translate(0, 6.6, 0), [0.2, 0.22, 0.25]);
    for (let k = -2; k <= 2; k++) gg.add(new THREE.BoxGeometry(0.25, 1.0, 0.5).translate(-0.3, 5.9, k * 0.8), [0.05, 0.05, 0.06]);
    const gm = add(new THREE.Mesh(gg.done(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 })));
    sample(6, tmp); gm.matrixAutoUpdate = false;
    gm.matrix.set(tmp.tx, 0, tmp.rx, tmp.x, 0, 1, 0, tmp.y, tmp.tz, 0, tmp.rz, tmp.z, 0, 0, 0, 1); gm.castShadow = true; gm.frustumCulled = false;
    // las cinco luces (dos por caja), mirando a la parrilla
    startL = add(new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 12, 8).scale(0.4, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 10));
    for (let k = 0; k < 10; k++) { const b = Math.floor(k / 2) - 2; startL.setMatrixAt(k, m4.makeTranslation(-0.44, k % 2 ? 5.68 : 6.12, b * 0.8).premultiply(gm.matrix)); startL.setColorAt(k, col.setRGB(0.04, 0.01, 0.01)); }
    startL.frustumCulled = false; }
  // ---- decorado: edificio de boxes con sus garajes, gradas, torres de televisión, puentes de publicidad y, en
  // los circuitos urbanos, calles con edificios. Todo se comprueba contra la pista (a cualquier escala) antes de quedarse.
  const B = propBuilder(), PS = T.PS, laneLen = T.L - track.pit.entry + track.pit.exit;
  const iOf = (s) => Math.min(n - 1, Math.floor(mod(s, T.L) / T.ds));
  const run = (sg, i) => (sg === PS ? T.rP : T.rO)[i];
  // lo de siempre decide si cabe; el detalle fino (calidad 2 y 3) solo se queda si tampoco pisa la pista de cerca
  const tryAdd = (fn, margin, near) => {
    const m = B.mark(); fn();
    if (!B.clear(m, margin, near, false)) { B.undo(m); return false; }
    if (!B.clear(m, margin, true, true)) B.dropFine(m);
    return true;
  };
  const busy = [[], []]; // tramos ya ocupados: [0] lado de boxes, [1] el otro
  // ---- Estructuras especiales del trazado (Bloque 5.3): túnel de Mónaco y puente en «8» de Suzuka
  if (vis.tunnel) {
    const tun = vis.tunnel, hT = tun.height ?? 6.4, openS = tun.openSide ?? -1;
    busy[0].push([tun.s0 - 18, tun.s1 + 18]);
    busy[1].push([tun.s0 - 18, tun.s1 + 18]);
    const nSeg = Math.max(8, Math.round((tun.s1 - tun.s0) / 14)), segL = (tun.s1 - tun.s0) / nSeg;
    const lwWall = T.SH - 0.02, lwRoof = T.SH + 0.06;
    const Q = (x, y, z, lw, u, v) => [x, y, z, lw, 0, u, v];
    for (let k = 0; k < nSeg; k++) {
      const sc = tun.s0 + (k + 0.5) * segL, x0 = -segL / 2 - 0.35, x1 = segL / 2 + 0.35, uo = k * segL;
      B.at(sc, 1);
      // pared sólida del lado de la ladera (o ambos lados si openSide === 0)
      for (const sg of [-1, 1]) {
        if (sg === openS) {
          // galería abierta hacia el mar con murete inferior, dintel superior y pilares cada tramo
          B.box(x0, x1, -1.5, 1.45, -0.55, 0.55, lwWall * sg, 0, 0xcfd4db, { front: [9, 0], top: [9, 0] }, uo);
          B.box(x0, x1, hT - 1.15, hT + 1.15, -0.65, 0.65, lwWall * sg, 0, 0xd8d2c6, { front: [9, 0], top: [9, 0] }, uo);
          B.box(-1.05, 1.05, 1.3, hT - 1.0, -0.62, 0.62, lwWall * sg, 0, 0xd8d2c6, { front: [9, 0], top: [9, 0] }, uo);
        } else {
          B.box(x0, x1, -1.5, hT + 1.15, -0.55, 0.75, lwWall * sg, 0, 0x5c6169, { front: [9, 0], top: [9, 0] }, uo);
          B.near(() => B.box(-0.55, 0.55, 0, hT, -0.95, -0.45, lwWall * sg, 0, 0x707680, { front: [9, 0] }, uo));
        }
      }
      // techo del túnel + paseo superior (se ensancha automáticamente con uW en la vista general)
      B.quad(Q(x0, hT, 0, -lwRoof, uo, 0), Q(x1, hT, 0, -lwRoof, uo + segL, 0), Q(x1, hT, 0, lwRoof, uo + segL, 12), Q(x0, hT, 0, lwRoof, uo, 12), 0x2c3037, 9, 0);
      B.quad(Q(x0, hT + 1.15, 0, -lwRoof, uo, 0), Q(x1, hT + 1.15, 0, -lwRoof, uo + segL, 0), Q(x1, hT + 1.15, 0, lwRoof, uo + segL, 12), Q(x0, hT + 1.15, 0, lwRoof, uo, 12), 0xd8ccb6, 9, 0);
      // pretiles del paseo superior
      B.box(x0, x1, hT + 1.15, hT + 2.05, -0.35, 0.35, -lwRoof, 0, 0xe2d8c5, { front: [9, 0], top: [9, 0] }, uo);
      B.box(x0, x1, hT + 1.15, hT + 2.05, -0.35, 0.35, lwRoof, 0, 0xe2d8c5, { front: [9, 0], top: [9, 0] }, uo);
      // doble fila de luces interiores encendidas en el techo del túnel
      for (const lx of [-0.46, 0.46]) {
        B.quad(Q(x0 + 1.2, hT - 0.08, -0.32, lx, 0, 0), Q(x1 - 1.2, hT - 0.08, -0.32, lx, 1, 0), Q(x1 - 1.2, hT - 0.08, 0.32, lx, 1, 1), Q(x0 + 1.2, hT - 0.08, 0.32, lx, 0, 1), 0xffffff, 10, 0);
      }
      // embocaduras arquitectónicas en la entrada y la salida
      if (k === 0 || k === nSeg - 1) {
        const xe = k === 0 ? x0 : x1;
        B.quad(Q(xe, hT - 0.1, 0, -lwRoof, 0, 0), Q(xe, hT - 0.1, 0, lwRoof, 14, 0), Q(xe, hT + 2.05, 0, lwRoof, 14, 2.2), Q(xe, hT + 2.05, 0, -lwRoof, 0, 2.2), 0xe4dac8, 9, 0);
      }
    }
  }
  if (ovp) {
    const hs = ovp.halfSpan ?? 52;
    busy[0].push([ovp.sOver - hs - 20, ovp.sOver + hs + 20], [ovp.sUnder - 50, ovp.sUnder + 50]);
    busy[1].push([ovp.sOver - hs - 20, ovp.sOver + hs + 20], [ovp.sUnder - 50, ovp.sUnder + 50]);
    const nSeg = Math.max(6, Math.round((hs * 2) / 13)), segL = (hs * 2) / nSeg;
    const lwDeck = 1.18;
    const Q = (x, y, z, lw, u, v) => [x, y, z, lw, 0, u, v];
    for (let k = 0; k < nSeg; k++) {
      const sc = ovp.sOver - hs + (k + 0.5) * segL, x0 = -segL / 2 - 0.25, x1 = segL / 2 + 0.25, uo = k * segL;
      B.at(sc, 1);
      // cara inferior del tablero (viga cajón de hormigón)
      B.quad(Q(x0, -1.65, 0, -lwDeck, uo, 0), Q(x1, -1.65, 0, -lwDeck, uo + segL, 0), Q(x1, -1.65, 0, lwDeck, uo + segL, 12), Q(x0, -1.65, 0, lwDeck, uo, 12), 0x626870, 9, 0);
      // vigas laterales blancas/grises, pretiles de seguridad y barandillas metálicas
      for (const sg of [-1, 1]) {
        B.box(x0, x1, -1.7, 0.08, -0.45, 0.45, lwDeck * sg, 0, 0xc8cdd4, { front: [9, 0], top: [9, 0] }, uo);
        B.box(x0, x1, 0.08, 1.15, -0.28, 0.28, lwDeck * sg, 0, 0xd8dce2, { front: [9, 0], top: [9, 0] }, uo);
        B.near(() => B.quad(Q(x0, 1.15, 0, lwDeck * sg, uo, 0), Q(x1, 1.15, 0, lwDeck * sg, uo + segL, 0), Q(x1, 2.35, 0, lwDeck * sg, uo + segL, 1), Q(x0, 2.35, 0, lwDeck * sg, uo, 1), 0xffffff, 13, 0));
      }
      // estribos de hormigón en los extremos del puente
      if (k === 0 || k === nSeg - 1) {
        const xe = k === 0 ? x0 : x1;
        B.quad(Q(xe, -12, 0, -lwDeck, 0, 0), Q(xe, -12, 0, lwDeck, 14, 0), Q(xe, -1.65, 0, lwDeck, 14, 10), Q(xe, -1.65, 0, -lwDeck, 0, 10), 0x8b9199, 9, 0);
      }
    }
    // pilares de hormigón a ambos lados del paso inferior (anclados en sUnder: se abren con uW para no pisar nunca la pista)
    const hO = sample(ovp.sOver, mkS()).y, hU = sample(ovp.sUnder, mkS()).y, pierH = Math.max(6.5, hO - hU - 1.3);
    for (const sg of [-1, 1]) {
      B.at(ovp.sUnder, sg);
      for (const px of [-6.2, 6.2]) {
        B.box(px - 1.1, px + 1.1, -2.5, pierH, 0.4, 2.8, T.SH + 0.14, 1.4, 0xb8bec6, { front: [9, 0], top: [9, 0] });
      }
      // viga cabezal uniendo los dos pilares de cada lado
      B.box(-8.0, 8.0, pierH - 1.35, pierH + 0.15, 0.2, 3.0, T.SH + 0.14, 1.4, 0xc9ced6, { front: [9, 0], top: [9, 0] });
    }
  }
  const isBusy = (sg, s0, s1) => busy[sg === PS ? 0 : 1].some(([a, b]) => mod(s0 - a, T.L) < b - a || mod(a - s0, T.L) < s1 - s0);
  let rs = 4321 + n; const rnd2 = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  // el detalle fino tira de otro azar: así lo de siempre sale igual que antes
  let rs3 = 977 + n; const rnd3 = () => ((rs3 = (rs3 * 1664525 + 1013904223) >>> 0) / 4294967296);
  // garajes: uno por equipo, en la parte recta de la calle de boxes (donde para el coche: gaV)
  const gM = Math.min(100, laneLen * 0.25), sA = track.pit.entry + gM, sB = track.pit.entry + laneLen - gM, slot = (sB - sA) / TEAMS.length;
  gaV = new Map(TEAMS.map((tm, k) => [tm.id, (gM + (k + 0.5) * slot) / laneLen])); gSlot = slot; DBG.gaV = gaV;
  busy[0].push([track.pit.entry - 40, track.pit.entry + laneLen + 40]);
  const wallLw = 1.0 + (PIT_OFF - 0.55 - 1.0) * 0.5;
  { const b0 = sA - 24, nSeg = Math.max(1, Math.round((sB - sA + 48) / 6)), segL = (sB - sA + 48) / nSeg;
    for (let k = 0; k < nSeg; k++) {
      const sc = b0 + (k + 0.5) * segL, lw = ramp(sc) * PIT_OFF + 1.35, x0 = -segL / 2 - 0.04, x1 = segL / 2 + 0.04, uo = sc - b0;
      const ti = Math.floor((sc - sA) / slot), tc = sA + (ti + 0.5) * slot, tm = ti >= 0 && ti < TEAMS.length ? TEAMS[ti] : null;
      const open = !!tm && Math.abs(sc - tc) < Math.min(9.5, slot * 0.42);
      // si no cabe entero (urbanos), un edificio menos profundo
      for (const D of [18, 10, 5]) if (tryAdd(() => {
        B.at(sc, PS);
        // planta baja: la puerta del garaje (o muro), con un pilar en cada junta
        if (open) {
          // garaje abierto: suelo claro, fondo con los paneles del equipo, techo con luces (los coches de libres se ven dentro)
          const Dg = Math.min(D, 14), Q = (x, y, z, u, v) => [x, y, z, lw, 0, u, v];
          B.quad(Q(x0, 0.03, 0, 0, 0), Q(x1, 0.03, 0, 0, 0), Q(x1, 0.03, Dg, 0, 0), Q(x0, 0.03, Dg, 0, 0), 0x9aa0a8, 9, 0);
          B.box(x0, x1, -3, 5.2, Dg, D, lw, 0, tm.color, { front: [3, 0], back: [9, 0], top: [8, 0] }, uo);
          B.quad(Q(x0, 5.2, 0, 0, 0), Q(x1, 5.2, 0, 0, 0), Q(x1, 5.2, Dg, 0, 0), Q(x0, 5.2, Dg, 0, 0), 0x2a2d31, 0, 0);
          B.near(() => { for (const zz of [Dg * 0.3, Dg * 0.7]) B.box(x0 + 0.6, x1 - 0.6, 5.0, 5.12, zz - 0.15, zz + 0.15, lw, 0, 0xffffff, { front: [10, 0], top: [10, 0] }); });
          B.box(x0, x1, -3, 0, 0, Dg, lw, 0, 0x9aa0a8, { front: [9, 0] }, uo);
        } else B.box(x0, x1, -3, 5.2, 0, D, lw, 0, 0xd9dde2, { front: [9, 0], back: [9, 0], top: [8, 0] }, uo);
        B.near(() => B.box(x0 - 0.15, x0 + 0.3, -3, 5.2, -0.35, 0.05, lw, 0, 0xc9ced4, { front: [9, 0] }, uo));
        // cartel sobre la puerta: el equipo o una marca
        B.box(x0, x1, 5.2, 6.7, -0.5, 1.2, lw, 0, 0xd0d4d9, { front: [9, 0], top: [9, 0] }, uo);
        B.near(() => B.panel(x0, x1, 5.35, 6.55, -0.52, lw, 0, open ? SIGN_TEAM0 + ti : (Math.floor(uo / 30) * 5) % 16, (uo + x0) / 5.4, (uo + x1) / 5.4));
        // dos plantas de cristal (hospitalidad), retranqueadas, con balcón, y la cubierta en voladizo
        B.box(x0, x1, 6.7, 6.95, -0.6, 2.0, lw, 0, 0xcfd3d8, { front: [9, 0], top: [9, 0] }, uo);
        B.near(() => B.box(x0, x1, 6.95, 7.9, -0.62, -0.55, lw, 0, 0x9aa3ad, { front: [9, 0] }, uo));
        const hT = D > 8 ? 14 : 10.4;
        B.box(x0, x1, 6.95, 10.4, 1.4, D, lw, 0, 0xffffff, { front: [2, k % 7], back: [9, 0], top: [9, 0] }, uo);
        if (D > 8) {
          B.box(x0, x1, 10.4, 10.7, 0.2, D, lw, 0, 0xcfd3d8, { front: [9, 0], top: [9, 0] }, uo);
          B.box(x0, x1, 10.7, 14, 2.6, D, lw, 0, 0xffffff, { front: [2, k % 5 + 3], back: [9, 0], top: [9, 0] }, uo);
        }
        const pitAccent = vis.runoff.accent ?? vis.kerbs[0] ?? 0xc81e1e;
        B.box(x0 - 0.05, x1 + 0.05, hT, hT + 0.55, -2.0, D + 1.5, lw, 0, 0xdce1e8, { front: [9, 0], top: [8, 0] }, uo);
        // Franja de color del circuito en alero delantero y trasero + costillas estructurales en cubierta (legible desde vista aérea)
        B.box(x0 - 0.05, x1 + 0.05, hT + 0.05, hT + 0.85, -2.18, -1.75, lw, 0, pitAccent, { front: [0, 0], top: [0, 0] }, uo);
        B.box(x0 - 0.05, x1 + 0.05, hT + 0.05, hT + 0.85, D + 1.15, D + 1.62, lw, 0, pitAccent, { front: [0, 0], top: [0, 0] }, uo);
        if (k % 3 === 0) B.box(x0 - 0.25, x0 + 0.25, hT + 0.52, hT + 0.95, -1.7, D + 1.1, lw, 0, 0x626a74, { front: [9, 0], top: [9, 0] }, uo);
        if (D > 8 && k % 4 === 1) {
          // Lucernarios acristalados y módulos de clima/hospitalidad sobre la cubierta
          B.box(x0 + 0.5, x1 - 0.5, hT + 0.52, hT + 1.35, 3.5, D * 0.48, lw, 0, 0xffffff, { front: [2, k % 5], top: [2, k % 5] }, uo);
          B.box(x0 + 1.1, x1 - 1.1, hT + 0.52, hT + 1.45, D * 0.62, D * 0.86, lw, 0, 0x9aa2ac, { front: [9, 0], top: [8, 0] }, uo);
        }
        B.fine(() => {
          const Q = (x, y, z, u, v) => [x, y, z, lw, 0, u, v];
          // peto metálico en el borde de la cubierta y barandilla en el balcón de la primera planta
          B.quad(Q(x0, hT + 0.5, -1.95, uo + x0, 0), Q(x1, hT + 0.5, -1.95, uo + x1, 0), Q(x1, hT + 1.55, -1.95, uo + x1, 1), Q(x0, hT + 1.55, -1.95, uo + x0, 1), 0xffffff, 13, 0);
          B.quad(Q(x0, 7.9, -0.6, uo + x0, 0), Q(x1, 7.9, -0.6, uo + x1, 0), Q(x1, 8.05, -0.6, uo + x1, 1), Q(x0, 8.05, -0.6, uo + x0, 1), 0x9aa3ad, 0, 0);
          // palcos: la segunda planta lleva delante una cristalera inclinada hacia fuera, como en los paddocks nuevos
          if (D > 8) {
            const zb = 1.9, zt = 0.75, cl = k % 5 + 3;
            B.quad(Q(x0, 10.7, zb, uo + x0, 0), Q(x1, 10.7, zb, uo + x1, 0), Q(x1, 14, zt, uo + x1, 3.3), Q(x0, 14, zt, uo + x0, 3.3), 0xffffff, 2, cl);
            B.box(x0, x1, 10.62, 10.72, zb - 0.05, 2.6, lw, 0, 0x5f666e, { front: [9, 0], top: [9, 0] }, uo);
            if (k === 0 || k === nSeg - 1) for (const x of [x0, x1]) B.quad(Q(x, 10.7, zb, 0, 0), Q(x, 10.7, 2.6, 0, 0), Q(x, 14, 2.6, 0, 0), Q(x, 14, zt, 0, 0), 0x5f666e, 9, 0);
          }
        });
      }, 1.5, D === 5)) break; // el último intento (urbanos estrechos) solo tiene que caber de cerca
      // el puesto de cada equipo en el muro del pit-lane, delante de su garaje
      if (open && Math.abs(sc - tc) < segL * 0.55) tryAdd(() => B.near(() => {
        B.at(tc, PS);
        B.box(-3.2, 3.2, 0, 2.3, -0.6, 0.8, wallLw, 0, 0x2a2e34, { front: [9, 0] });
        B.box(-3.5, 3.5, 2.3, 2.6, -1.3, 1.4, wallLw, 0, tm.color, { front: [9, 0] });
      }));
      // motorhome moderno de 2 plantas y camión tráiler del equipo en el paddock, detrás de su garaje
      if (open && Math.abs(sc - tc) < segL * 0.55) {
        tryAdd(() => {
          B.at(tc, PS);
          B.box(-6.8, 6.8, -3, 3.4, 24, 33.5, lw, 0, tm.color, { front: [0, 0], top: [9, 0] });
          B.box(-6.4, 6.4, 3.4, 6.8, 24.4, 33.2, lw, 0, 0xffffff, { front: [2, ti], top: [8, 0] });
          B.box(-7.2, 7.2, 6.8, 7.35, 23.6, 33.8, lw, 0, 0xe4e8ee, { front: [0, 0], top: [8, 0] });
          B.box(-7.2, 7.2, 6.9, 7.5, 23.4, 24.0, lw, 0, tm.color, { front: [0, 0], top: [0, 0] });
        });
        // Tráiler / camión de escudería aparcado en fila detrás del motorhome (muy reconocible desde vista aérea)
        if (!street) tryAdd(() => {
          B.at(tc, PS);
          // remolque largo con librea del equipo + techo blanco + cabina
          B.box(-5.8, 2.8, 0.5, 4.1, 38.5, 41.4, lw, 0, tm.color, { front: [0, 0], top: [9, 0] });
          B.box(-5.6, 2.6, 4.1, 4.35, 38.7, 41.2, lw, 0, 0xeceff2, { front: [0, 0], top: [0, 0] });
          B.box(3.0, 5.4, 0.5, 3.6, 38.7, 41.2, lw, 0, 0xe4e8ee, { front: [0, 0], top: [9, 0] });
          B.box(4.8, 5.45, 2.0, 3.1, 38.85, 41.05, lw, 0, 0x202630, { front: [2, 0] });
          // segundo camión paralelo para dar densidad de paddock real
          B.box(-5.2, 3.2, 0.5, 4.0, 43.2, 46.0, lw, 0, 0xdce0e6, { front: [0, 0], top: [9, 0] });
          B.box(-5.2, 3.2, 3.4, 4.1, 43.1, 46.1, lw, 0, tm.color, { front: [0, 0], top: [0, 0] });
        });
      }
    }
    // torre de control, detrás del centro del edificio
    const sc = (sA + sB) / 2, lw = ramp(sc) * PIT_OFF + 1.35;
    tryAdd(() => {
      B.at(sc, PS);
      B.box(-5, 5, -3, 24, 21, 31, lw, 0, 0xe4e7ea, { front: [9, 0], top: [9, 0] });
      B.near(() => B.panel(-4.6, 4.6, 19.8, 22.6, 20.95, lw, 0, 3, 0, 1.6));
      B.box(-6.5, 6.5, 24, 29, 19.5, 32.5, lw, 0, 0xffffff, { front: [2, 3], top: [9, 0] });
      B.box(-7, 7, 29, 29.6, 19, 33, lw, 0, 0x6d747c, { front: [9, 0], top: [8, 0] });
      // Helipuerto del paddock detrás de la torre de control (en circuitos permanentes)
      if (!street) {
        B.box(-8.5, 8.5, -2.5, 0.25, 36.5, 53.5, lw, 0, 0x383e46, { front: [9, 0], top: [9, 0] });
        B.box(-3.0, -2.0, 0.26, 0.34, 41.5, 48.5, lw, 0, 0xf0c420, { top: [0, 0] });
        B.box(2.0, 3.0, 0.26, 0.34, 41.5, 48.5, lw, 0, 0xf0c420, { top: [0, 0] });
        B.box(-2.0, 2.0, 0.26, 0.34, 44.5, 45.5, lw, 0, 0xf0c420, { top: [0, 0] });
      }
      B.near(() => {
        B.box(-0.15, 0.15, 29.6, 36, 25.8, 26.2, lw, 0, 0xb8bec5);
        B.box(-0.5, 0.5, 36, 36.6, 25.5, 26.5, lw, 0, 0xffffff, { front: [10, 0], top: [10, 0] });
      });
      B.fine(() => {
        // la cabina de dirección de carrera con los cristales inclinados hacia fuera, barandilla en la azotea y antenas
        const Q = (x, y, z, u, v) => [x, y, z, lw, 0, u, v];
        B.quad(Q(-6.5, 24, 19.5, 0, 0), Q(6.5, 24, 19.5, 13, 0), Q(6.5, 29, 18.5, 13, 5), Q(-6.5, 29, 18.5, 0, 5), 0xffffff, 2, 3);
        for (const x of [-6.5, 6.5]) B.quad(Q(x, 24, 19.5, 0, 0), Q(x, 24, 19.6, 0, 0), Q(x, 29, 19.6, 0, 0), Q(x, 29, 18.5, 0, 0), 0x6d747c, 9, 0);
        B.box(-6.7, 6.7, 23.8, 24.05, 18.9, 19.6, lw, 0, 0x6d747c, { front: [9, 0], top: [9, 0] });
        B.quad(Q(-7, 29.6, 19.05, 0, 0), Q(7, 29.6, 19.05, 14, 0), Q(7, 30.65, 19.05, 14, 1), Q(-7, 30.65, 19.05, 0, 1), 0xffffff, 13, 0);
        B.beam([-4, 29.6, 30], [-4, 34.5, 30], 0.06, lw, 0, 0xb8bec5);
        B.box(3, 5.4, 29.6, 31.2, 28, 31.5, lw, 0, 0xc9ced4, { front: [9, 0], top: [8, 0] });
      });
    }, 1);
  }
  // gradas: el perfil de verdad (muro con publicidad, asientos en pendiente con público, muro trasero y cubierta en
  // voladizo sobre pilares), hecho de tramos que siguen la curva
  const STAND_COL = [0x2f5fb0, 0xc8102e, 0x8a9099, 0xe9e9ea, 0x1f8a5b, 0xf2c230];
  const grandstand = (s0, s1, sg, D, H, ci) => {
    if (isBusy(sg, s0, s1)) return;
    const nS = Math.max(1, Math.round((s1 - s0) / 10)), L2 = (s1 - s0) / nS / 2 + 0.15, sl = Math.hypot(D - 0.5, H - 2.4), seat = STAND_COL[ci % STAND_COL.length];
    let ok = 0;
    for (let k = 0; k < nS; k++) {
      const sc = s0 + (k + 0.5) * (s1 - s0) / nS, lm = run(sg, iOf(sc)) + 4.5, lw = T.SH - 0.08, uo = k * 2 * L2;
      if (tryAdd(() => {
        B.at(sc, sg);
        B.box(-L2, L2, -2.5, 2.4, 0, 0.5, lw, lm, 0xd5d9de, { front: [9, 0], top: [9, 0] }, uo);
        B.near(() => B.panel(-L2, L2, 0.55, 2.15, -0.02, lw, lm, (ci * 5 + k) % 16, 0, 1));
        const Q = (x, y, z, u, v) => [x, y, z, lw, lm, u, v];
        B.quad(Q(-L2, 2.4, 0.5, uo - L2, 0), Q(L2, 2.4, 0.5, uo + L2, 0), Q(L2, H, D, uo + L2, sl), Q(-L2, H, D, uo - L2, sl), seat, 1, ci);
        B.box(-L2, L2, -2.5, H + 1.2, D, D + 0.5, lw, lm, 0xc4c9cf, { front: [9, 0], top: [9, 0] }, uo);
        const ra = [D + 0.9, H + 5.4], rb = [D * 0.28, H + 4.1];
        // Cubierta arquitectónica clara con faldón de color y costillas estructurales visibles desde vista aérea (deja ver graderío y público delante)
        B.quad(Q(-L2, rb[1], rb[0], uo - L2, 0), Q(L2, rb[1], rb[0], uo + L2, 0), Q(L2, ra[1], ra[0], uo + L2, 1), Q(-L2, ra[1], ra[0], uo - L2, 1), 0xe2e6ec, 8, 0);
        B.box(-L2, L2, rb[1] - 0.55, rb[1] + 0.35, rb[0] - 0.22, rb[0] + 0.18, lw, lm, seat, { front: [0, 0], top: [0, 0] }, uo);
        B.box(-L2, L2, ra[1] - 0.45, ra[1] + 0.35, ra[0] - 0.18, ra[0] + 0.22, lw, lm, seat, { front: [0, 0], top: [0, 0] }, uo);
        if (k % 2 === 0) B.box(-0.28, 0.28, rb[1] + 0.05, ra[1] + 0.38, rb[0], ra[0], lw, lm, 0x5d646e, { front: [9, 0], top: [9, 0] }, uo);
        // de lejos, sin la cara de abajo de la cubierta, la viga, los pilares ni las banderas
        B.near(() => {
          B.quad(Q(-L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, ra[1] - 0.35, ra[0], 0, 0), Q(-L2, ra[1] - 0.35, ra[0], 0, 0), 0x5a6068, 0, 0);
          B.box(-L2, L2, rb[1] - 0.35, rb[1], rb[0] - 0.05, rb[0] + 0.05, lw, lm, 0x5a6068);
          if (k % 2 === 0) B.box(-0.25, 0.25, H + 1.2, ra[1] - 0.2, D + 0.05, D + 0.45, lw, lm, 0x7a8088, { front: [9, 0] });
          B.fine(() => {
            // la cubierta cuelga de tirantes: un mástil sobre cada pilar, un cable al borde de delante y otro atrás
            if (k % 2 === 0) {
              const top = [0, ra[1] + 5.5, D + 0.25];
              B.beam([0, ra[1] - 0.2, D + 0.25], top, 0.16, lw, lm, 0x7a8088);
              B.beam(top, [0, rb[1] + 0.05, rb[0] + 0.6], 0.035, lw, lm, 0x3a3f45);
              B.beam(top, [0, (rb[1] + ra[1]) / 2 + 0.05, (rb[0] + ra[0]) / 2], 0.035, lw, lm, 0x3a3f45);
              B.beam(top, [0, H - 1.5, D + 6], 0.035, lw, lm, 0x3a3f45);
              B.beam([0, H - 1.5, D + 6], [0, -2.5, D + 6], 0.09, lw, lm, 0x7a8088);
            }
            // frente de la cubierta (el borde que se ve desde la pista) y correas debajo
            B.box(-L2, L2, rb[1] - 0.9, rb[1], rb[0] - 0.12, rb[0], lw, lm, 0xe9ebee, { front: [0, 0], top: [9, 0] });
            for (const t of [0.33, 0.66]) {
              const yy = rb[1] + (ra[1] - rb[1]) * t - 0.45, zz = rb[0] + (ra[0] - rb[0]) * t;
              B.box(-L2, L2, yy, yy + 0.1, zz - 0.06, zz + 0.06, lw, lm, 0x4a5058);
            }
          });
          // banderas de los aficionados, que ondean
          for (let fq = 0; fq < 2; fq++) if (rnd2() < 0.55) {
            const fx0 = (rnd2() * 2 - 1) * (L2 - 1.5), ff = 0.15 + rnd2() * 0.75, fz = 0.5 + ff * (D - 0.5), fy = 2.4 + ff * (H - 2.4), seed = Math.floor(rnd2() * 40);
            B.box(fx0 - 0.03, fx0 + 0.03, fy, fy + 2.3, fz - 0.03, fz + 0.03, lw, lm, 0x333333);
            B.quad(Q(fx0, fy + 1.5, fz, 0, 0), Q(fx0 + 1.3, fy + 1.5, fz, 1, 0), Q(fx0 + 1.3, fy + 2.3, fz, 1, 1), Q(fx0, fy + 2.3, fz, 0, 1), 0xffffff, 11, seed);
          }
        });
        for (const [kk, x] of [[0, -L2], [nS - 1, L2]]) if (k === kk) B.quad(Q(x, -2.5, 0.5, 0, 0), Q(x, 2.4, 0.5, 0, 0), Q(x, H + 1.2, D, 0, 0), Q(x, -2.5, D, 0, 0), 0xc4c9cf, 9, 0);
      })) ok++;
    }
    if (ok) { busy[sg === PS ? 0 : 1].push([s0, s1]); standS.push([(s0 + s1) / 2, sg, s1 - s0]); }
  };
  if (osmGradas) {
    // Gradas reales extraídas de OpenStreetMap: posición, longitud, profundidad y orientación exactas (ej. Red Bull Tribüne, Start/Ziel, Steiermark, T3, Mitte, T10)
    osmGradas.forEach(([gx, gy, glen, gdep, ang, gname], ci) => {
      const wx = gx - T.cx, wz = -(gy - T.cy);
      let ux = Math.cos(ang), uz = -Math.sin(ang);
      // v = (-sin(ang), cos(ang)) en XY apunta hacia la pista; en 3D (Z = -Y) hacia atrás (subiendo asientos) es bx = sin(ang), bz = cos(ang)
      let bx = Math.sin(ang), bz = Math.cos(ang);
      const nl = (gname || "").toLowerCase();
      const isMitte = nl.includes("mitte");
      const D = isMitte ? Math.min(gdep, 17) : clamp(gdep, 12, 30), H = clamp(D * 0.56, 9.5, 16.5);
      const seat = nl.includes("red bull") ? 0x1b459c
        : nl.includes("start") ? 0xc8102e
        : nl.includes("steiermark") ? 0x1f8a5b
        : isMitte ? 0xf2c230
        : STAND_COL[ci % STAND_COL.length];
      // Verificar orientación frente al punto de pista más cercano al centro de la grada (siempre mirando hacia el asfalto)
      let nearI = 0, bd2 = 1e12;
      for (let i = 0; i < n; i += 2) {
        const d2 = (T.X[i] - wx) ** 2 + (T.Z[i] - wz) ** 2;
        if (d2 < bd2) { bd2 = d2; nearI = i; }
      }
      if ((-bx) * (T.X[nearI] - wx) + (-bz) * (T.Z[nearI] - wz) < 0) {
        bx = -bx; bz = -bz; ux = -ux; uz = -uz;
      }
      // Empuje suave con uW (lw=1.15, lm=-W_REAL*lw) + retranqueo de seguridad si el borde delantero toca pista/escapatoria
      let fx0 = wx - bx * (D * 0.5), fz0 = wz - bz * (D * 0.5);
      let pushBack = 0;
      const minClear = T.SH * W_REAL + 4.5;
      for (const fl of [-0.45, 0, 0.45]) {
        const px = fx0 + ux * (fl * glen), pz = fz0 + uz * (fl * glen);
        let td2 = 1e12, ti = 0;
        for (let i = 0; i < n; i += 2) {
          const d2 = (T.X[i] - px) ** 2 + (T.Z[i] - pz) ** 2;
          if (d2 < td2) { td2 = d2; ti = i; }
        }
        const td = Math.sqrt(td2);
        const i1 = (ti + 1) % n, ttx = T.X[i1] - T.X[ti], ttz = T.Z[i1] - T.Z[ti], ttl = Math.hypot(ttx, ttz) || 1;
        const rrx = -ttz / ttl, rrz = ttx / ttl;
        const sideS = ((px - T.X[ti]) * rrx + (pz - T.Z[ti]) * rrz) >= 0 ? 1 : -1;
        const req = minClear + (sideS === PS ? T.rP[ti] : T.rO[ti]);
        if (td < req) pushBack = Math.max(pushBack, Math.min(28, req - td + 1.5));
      }
      if (pushBack > 0) { fx0 += bx * pushBack; fz0 += bz * pushBack; }
      const sNear = nearI * T.ds;
      const nS = Math.max(2, Math.round(glen / 12)), segL = glen / nS, L2 = segL * 0.5 + 0.15, sl = Math.hypot(D - 0.5, H - 2.4);
      const lw = 1.15, lm = -W_REAL * lw;
      const covered = true;
      for (let k = 0; k < nS; k++) {
        const offX = (k + 0.5 - nS * 0.5) * segL, uo = k * segL;
        const sx0 = fx0 + ux * offX, sz0 = fz0 + uz * offX;
        const wy = terr(sx0 + bx * D * 0.35, sz0 + bz * D * 0.35, 0).h;
        B.atWorld(sx0, wy, sz0, ux, uz, bx, bz, sNear);
        B.box(-L2, L2, -4.5, 2.4, 0, 0.5, lw, lm, 0xd5d9de, { front: [9, 0], top: [9, 0] }, uo);
        B.near(() => B.panel(-L2, L2, 0.55, 2.15, -0.02, lw, lm, (ci * 5 + k) % 16, 0, 1));
        const Q = (x, y, z, u, v) => [x, y, z, lw, lm, u, v];
        B.quad(Q(-L2, 2.4, 0.5, uo - L2, 0), Q(L2, 2.4, 0.5, uo + L2, 0), Q(L2, H, D, uo + L2, sl), Q(-L2, H, D, uo - L2, sl), seat, 1, ci);
        B.box(-L2, L2, -4.5, H + 1.2, D, D + 0.6, lw, lm, 0xc4c9cf, { front: [9, 0], top: [9, 0] }, uo);
        if (covered) {
          const ra = [D + 0.9, H + 5.2], rb = [D * 0.32, H + 4.0];
          B.quad(Q(-L2, rb[1], rb[0], uo - L2, 0), Q(L2, rb[1], rb[0], uo + L2, 0), Q(L2, ra[1], ra[0], uo + L2, 1), Q(-L2, ra[1], ra[0], uo - L2, 1), 0xe2e6ec, 8, 0);
          B.box(-L2, L2, rb[1] - 0.5, rb[1] + 0.35, rb[0] - 0.22, rb[0] + 0.18, lw, lm, seat, { front: [0, 0], top: [0, 0] }, uo);
          B.box(-L2, L2, ra[1] - 0.45, ra[1] + 0.35, ra[0] - 0.18, ra[0] + 0.22, lw, lm, seat, { front: [0, 0], top: [0, 0] }, uo);
          if (k % 2 === 0) B.box(-0.28, 0.28, rb[1] + 0.05, ra[1] + 0.38, rb[0], ra[0], lw, lm, 0x5d646e, { front: [9, 0], top: [9, 0] }, uo);
          B.near(() => {
            B.quad(Q(-L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, ra[1] - 0.35, ra[0], 0, 0), Q(-L2, ra[1] - 0.35, ra[0], 0, 0), 0x5a6068, 0, 0);
            if (k % 2 === 0) B.box(-0.25, 0.25, H + 1.2, ra[1] - 0.2, D + 0.05, D + 0.45, lw, lm, 0x7a8088, { front: [9, 0] });
          });
        }
        B.near(() => {
          for (let fq = 0; fq < 2; fq++) if (rnd2() < 0.55) {
            const fx1 = (rnd2() * 2 - 1) * (L2 - 1.5), ff = 0.15 + rnd2() * 0.75, fz1 = 0.5 + ff * (D - 0.5), fy1 = 2.4 + ff * (H - 2.4), seed = Math.floor(rnd2() * 40);
            B.box(fx1 - 0.03, fx1 + 0.03, fy1, fy1 + 2.3, fz1 - 0.03, fz1 + 0.03, lw, lm, 0x333333);
            B.quad(Q(fx1, fy1 + 1.5, fz1, 0, 0), Q(fx1 + 1.3, fy1 + 1.5, fz1, 1, 0), Q(fx1 + 1.3, fy1 + 2.3, fz1, 1, 1), Q(fx1, fy1 + 2.3, fz1, 0, 1), 0xffffff, 11, seed);
          }
        });
        for (const [kk, x] of [[0, -L2], [nS - 1, L2]]) if (k === kk) B.quad(Q(x, -4.5, 0.5, 0, 0), Q(x, 2.4, 0.5, 0, 0), Q(x, H + 1.2, D, 0, 0), Q(x, -4.5, D, 0, 0), 0xc4c9cf, 9, 0);
      }
      busy[1].push([sNear - glen * 0.45, sNear + glen * 0.45]);
      standS.push([sNear, -PS, glen]);
    });
  } else {
    grandstand(-170, 140, -PS, street ? 12 : 22, street ? 10 : 15, 0); // tribuna principal, enfrente de los boxes
    const vr2 = brakes.slice().sort((a, b) => vr[a] - vr[b]).slice(0, street ? 3 : 5);
    vr2.forEach((bi, k) => { const sg = track.curv[bi] > 0 ? 1 : -1, sb = bi * T.ds; grandstand(sb - 150, sb - 10, sg, street ? 10 : 14, street ? 8 : 10.5, k + 1); });
  }
  // torres de las cámaras de tele (en el mismo sitio que la cámara «Tele» a velocidad normal)
  { const nCam = Math.max(3, Math.round(T.L / 360)), sp = T.L / nCam, h = 9 + sp * 0.012 - 1.5;
    for (let k = 0; k < nCam; k++) {
      const cs = k * sp, sg = -PS;
      if (isBusy(sg, cs - 8, cs + 8)) continue;
      const st = street, lm = st ? run(sg, iOf(cs)) + 2.3 : run(sg, iOf(cs)) + 0.9, lw = st ? T.SH - 0.08 : 1.7, a = st ? 0.6 : 1.2;
      if (tryAdd(() => {
        B.at(cs, sg);
        B.box(-a, a, -2, h, -a, a, lw, lm, 0xffffff, { front: [7, 0], side: [7, 0], top: [9, 0] });
        B.near(() => {
          B.box(-a - 0.4, a + 0.4, h, h + 0.25, -a - 0.4, a + 0.4, lw, lm, 0x5b6169, { front: [9, 0], top: [9, 0] });
          B.box(-0.3, 0.5, h + 0.25, h + 0.9, -0.3, 0.3, lw, lm, 0x1a1c20);
        });
      }, st ? -1 : 0.5) && st) busy[1].push([cs - 6, cs + 6]); // en la calle, las casas dejan sitio a la torre
    } }
  // puentes de publicidad sobre las rectas
  { const bridges = [], stp = Math.max(1, Math.round(20 / T.ds));
    for (let i = 0; i < n && bridges.length < 3; i += stp) {
      const s = i * T.ds;
      if (mod(s, T.L) < 220 || mod(-s, T.L) < 140 || ramp(s) > 0.01) continue;
      let ok = true; for (let d = -70; d <= 70; d += 10) if (kAbs[iOf(s + d)] > 0.0016) ok = false;
      if (!ok || bridges.some((b) => Math.min(mod(b - s, T.L), mod(s - b, T.L)) < T.L / 5)) continue;
      bridges.push(s);
    }
    bridges.forEach((s, bk) => tryAdd(() => {
      const i = iOf(s), rR = (PS > 0 ? T.rP : T.rO)[i], rL = (PS > 0 ? T.rO : T.rP)[i], lw = T.SH + 0.02;
      B.at(s, 1);
      for (const [sg, r] of [[1, rR], [-1, rL]]) B.box(-0.7, 0.7, -2, 9.8, -0.7, 0.7, lw * sg, (r + 1.8) * sg, 0xd0d4d9, { front: [9, 0], top: [9, 0] });
      const Lq = [-lw, -(rL + 1.8)], Rq = [lw, rR + 1.8], C = (x, y, e, u, v) => [x, y, 0, e[0], e[1], u, v], cell = (bk * 6 + 2) % 16;
      B.quad(C(-0.75, 7, Lq, 0, 0), C(-0.75, 7, Rq, 3, 0), C(-0.75, 9.5, Rq, 3, 1), C(-0.75, 9.5, Lq, 0, 1), 0xffffff, 4, cell);
      B.quad(C(0.75, 7, Rq, 0, 0), C(0.75, 7, Lq, 3, 0), C(0.75, 9.5, Lq, 3, 1), C(0.75, 9.5, Rq, 0, 1), 0xffffff, 4, (cell + 5) % 16);
      B.quad(C(-0.75, 9.5, Lq, 0, 0), C(-0.75, 9.5, Rq, 9, 0), C(0.75, 9.5, Rq, 9, 1), C(0.75, 9.5, Lq, 0, 1), 0x8d949c, 8, 0);
      B.quad(C(-0.75, 7, Lq, 0, 0), C(-0.75, 7, Rq, 0, 0), C(0.75, 7, Rq, 0, 0), C(0.75, 7, Lq, 0, 0), 0x5a6068, 0, 0);
      // Cubierta superior de pasarela estilizada con arco/celosía y cristal lateral
      B.quad(C(-0.95, 11.4, Lq, 0, 0), C(-0.95, 11.4, Rq, 9, 0), C(0.95, 11.4, Rq, 9, 1), C(0.95, 11.4, Lq, 0, 1), 0xe2e6ec, 8, 0);
      for (const x of [-0.82, 0.82]) B.quad(C(x, 9.5, Lq, 0, 0), C(x, 9.5, Rq, 14, 0), C(x, 11.35, Rq, 14, 1.85), C(x, 11.35, Lq, 0, 1.85), 0xffffff, 2, bk % 5);
      B.fine(() => {
        // pasarela: barandilla a cada lado del tablero
        const span = Math.round((rL + rR + 3.6 + 2 * lw * W_REAL) / 1.2) * 1.2;
        for (const x of [-0.72, 0.72]) B.quad(C(x, 9.5, Lq, 0, 0), C(x, 9.5, Rq, span, 0), C(x, 10.6, Rq, span, 1), C(x, 10.6, Lq, 0, 1), 0xffffff, 13, 0);
      });
    }, 0.2));
  }
  // Remate de un edificio de calle (solo de cerca y con calidad 2 o 3): tejado a dos aguas de teja con chimeneas
  // sobre el alero; azotea con pretil, casetón y depósito; en las torres, pretil metálico, máquinas de clima, antenas
  // y, en las más altas, un helipuerto.
  const roofTop = (len, h, dd, lw, lm, c, roof, tower) => {
    const Q = (x, y, z, u, v) => [x, y, z, lw, lm, u, v], x0 = -len / 2, x1 = len / 2;
    if (roof) {
      const y0 = h + 0.7, rh = Math.min(3.4, dd * 0.24), zc = dd / 2, sl = Math.hypot(zc + 0.4, rh), e0 = x0 - 0.3, e1 = x1 + 0.3;
      B.quad(Q(e0, y0, -0.4, e0, sl), Q(e1, y0, -0.4, e1, sl), Q(e1, y0 + rh, zc, e1, 0), Q(e0, y0 + rh, zc, e0, 0), 0xffffff, 12, 0);
      B.quad(Q(e1, y0, dd + 0.4, e1, sl), Q(e0, y0, dd + 0.4, e0, sl), Q(e0, y0 + rh, zc, e0, 0), Q(e1, y0 + rh, zc, e1, 0), 0xffffff, 12, 0);
      for (const x of [x0, x1]) B.quad(Q(x, y0, -0.3, 0, 0), Q(x, y0, dd + 0.3, 0, 0), Q(x, y0 + rh - 0.05, zc, 0, 0), Q(x, y0 + rh - 0.05, zc, 0, 0), c, 0, 0);
      const nCh = 1 + Math.floor(rnd3() * 2);
      for (let j = 0; j < nCh; j++) {
        const cx = x0 + 1.5 + rnd3() * (len - 3), cz = zc + (rnd3() - 0.3) * dd * 0.3;
        B.box(cx - 0.35, cx + 0.35, y0 + rh * 0.5, y0 + rh + 1.1, cz - 0.35, cz + 0.35, lw, lm, 0xb9ab98, { front: [9, 0], top: [9, 0] });
      }
    } else if (!tower) {
      B.box(x0, x1, h + 0.35, h + 1.05, -0.33, -0.08, lw, lm, c, { front: [0, 0], top: [9, 0] });
      B.box(x0, x1, h + 0.35, h + 1.05, dd - 0.05, dd + 0.18, lw, lm, c, { front: [0, 0], top: [9, 0] });
      const cx = x0 + 1 + rnd3() * Math.max(0.5, len - 5), cz = 2 + rnd3() * Math.max(0.5, dd - 6);
      B.box(cx, cx + 2.6, h, h + 2.6, cz, cz + 3, lw, lm, 0xd9d0bf, { front: [9, 0], top: [8, 0] });
      if (rnd3() < 0.6) {
        const tx = x0 + 1 + rnd3() * Math.max(0.5, len - 3), tz = 1 + rnd3() * Math.max(0.5, dd - 3);
        B.box(tx, tx + 1.4, h, h + 1.8, tz, tz + 1.4, lw, lm, 0x8d949c, { front: [8, 0], top: [8, 0] });
      }
    } else {
      B.quad(Q(x0, h, -0.05, x0, 0), Q(x1, h, -0.05, x1, 0), Q(x1, h + 1.1, -0.05, x1, 1), Q(x0, h + 1.1, -0.05, x0, 1), 0xffffff, 13, 0);
      B.quad(Q(x1, h, dd + 0.05, -x1, 0), Q(x0, h, dd + 0.05, -x0, 0), Q(x0, h + 1.1, dd + 0.05, -x0, 1), Q(x1, h + 1.1, dd + 0.05, -x1, 1), 0xffffff, 13, 0);
      if (h > 30 && len > 16 && dd > 15 && rnd3() < 0.5) {
        // helipuerto sobre una losa elevada, con su barandilla de malla
        const cx = 0, cz = dd / 2, r = Math.min(len, dd) / 2 - 0.5;
        B.box(cx - r, cx + r, h, h + 1.2, cz - r, cz + r, lw, lm, 0x6d747c, { front: [9, 0], top: [9, 0] });
        B.quad(Q(cx - r, h + 1.22, cz - r, -r, -r), Q(cx + r, h + 1.22, cz - r, r, -r), Q(cx + r, h + 1.22, cz + r, r, r), Q(cx - r, h + 1.22, cz + r, -r, r), 0xffffff, 14, 0);
      } else {
        const n2 = 2 + Math.floor(rnd3() * 4);
        for (let j = 0; j < n2; j++) {
          const ax = x0 + 1.5 + rnd3() * Math.max(0.5, len - 5), az = 1.5 + rnd3() * Math.max(0.5, dd - 5), aw = 1.6 + rnd3() * 2;
          B.box(ax, ax + aw, h, h + 1.3 + rnd3(), az, az + 1.6 + rnd3() * 1.5, lw, lm, 0xa9afb5, { front: [8, 0], top: [8, 0] });
        }
        const mx = x0 + 2 + rnd3() * Math.max(0.5, len - 4), mz = 2 + rnd3() * Math.max(0.5, dd - 4);
        B.beam([mx, h, mz], [mx, h + 6 + rnd3() * 8, mz], 0.08, lw, lm, 0xd0d4d9);
      }
    }
  };
  // ---- Hitos icónicos del circuito (Bloque 5.4 / Plan 3D v2): silueta procedural inmediata + carga híbrida .glb bajo demanda
  if (lmPlaced.length) {
    const lmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.14, flatShading: true });
    lmMat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlood = U.uFlood;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uFlood;")
        .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + vColor.rgb * (max(0.0, max(vColor.r, max(vColor.g, vColor.b)) - 0.95) * (0.45 + 1.15 * uFlood) + uFlood * 0.22);");
    };
    lmMat.customProgramCacheKey = () => "hito-placeholder";
    for (const { spec, lx, lz, gy, yaw } of lmPlaced) {
      const phGeo = buildLandmarkPlaceholder(THREE, spec);
      const phMesh = add(new THREE.Mesh(phGeo, lmMat));
      phMesh.position.set(lx, gy, lz);
      phMesh.rotation.y = yaw;
      phMesh.castShadow = true;
      phMesh.receiveShadow = true;
      phMesh.frustumCulled = true;
      phMesh.name = `hito_${spec.id}`;
      // Si el .glb existe en public/assets/landmarks/manifest.json, se descarga bajo demanda y sustituye al placeholder
      modLoadLandmarkGlb(track.id, spec.id).then((tpl) => {
        if (!tpl || !alive3d || !world || !all.includes(phMesh)) return;
        const grp = new THREE.Group();
        grp.position.set(lx, gy - 0.5, lz);
        grp.rotation.y = yaw;
        grp.name = `hito_glb_${spec.id}`;
        const modelGrp = new THREE.Group();
        modelGrp.scale.setScalar(spec.height);
        for (const p of tpl.parts) {
          const m = new THREE.Mesh(p.geo, p.mat);
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.sharedGeo = true;
          m.userData.sharedMat = true;
          modelGrp.add(m);
        }
        // Plaza de piedra clara y zócalo metálico sobrio bajo esculturas monumentales (estilo acero Corten del Toro de Spielberg)
        if (spec.shape === "bull_monument") {
          const pr = Math.max(12, spec.height * 0.44), ph = Math.max(3.6, spec.height * 0.12);
          const plinth = new THREE.Mesh(
            new THREE.CylinderGeometry(pr * 0.90, pr * 1.12, ph + 8, 22),
            new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.86, metalness: 0.04 })
          );
          plinth.position.y = (ph - 8) * 0.5;
          plinth.castShadow = true;
          plinth.receiveShadow = true;
          grp.add(plinth);
          const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(pr * 0.94, pr * 0.96, 0.7, 22),
            new THREE.MeshStandardMaterial({ color: 0x5c4a3e, roughness: 0.65, metalness: 0.35 })
          );
          rim.position.y = ph + 0.05;
          rim.receiveShadow = true;
          grp.add(rim);
          modelGrp.position.y = ph + 0.4;
        }
        grp.add(modelGrp);
        add(grp);
        phMesh.visible = false;
        if (spec.shape === "ferris" && world?.trackKit) world.trackKit.setFerrisTarget(modelGrp);
      });
    }
  }
  // calles: una fila de edificios a cada lado, pegados a la acera, y manzanas detrás con identidad por ciudad
  if (street) {
    const isBay = urbanStyle === "bahia", isNeon = urbanStyle === "neones", isStone = urbanStyle === "piedra";
    const tower = isBay || isNeon;
    const PAL = isNeon ? [0x242834, 0x352e2a, 0x2a3344, 0x3b2c36, 0x2e353d, 0x453a2c, 0x1f2530]
      : isBay ? [0x6f8fa6, 0x8aa5b5, 0x5c7a8c, 0xaab8c2, 0x7d9aa0, 0xd9dcdf, 0x9bb7c9]
      : isStone ? [0xe4d5b7, 0xd8c39e, 0xcfb68e, 0xe8ddc6, 0xcab087, 0xdfd0b2]
      : [0xe9dcc0, 0xd9b77e, 0xe3a68a, 0xefe2a8, 0xf1ede4, 0xe9b9a9, 0xcfc3a8, 0xf0d6b0];
    const BAKU_GLASS = [0x4e7392, 0x6486a0, 0x3f5e78, 0x7693a8];
    const cityPat = isNeon ? 15 : isBay ? 6 : isStone ? 16 : 5;
    for (const sg of [1, -1]) {
      let s = 0;
      while (s < T.L) {
        const curvy = Math.abs(track.curv[iOf(s)]) > 0.01, len = curvy ? 7 + rnd2() * 5 : 12 + rnd2() * 14;
        if (rnd2() < 0.12) { s += 8 + rnd2() * 8; continue; } // bocacalle
        const sc = s + len / 2;
        if (!isBusy(sg, s, s + len) && !(sg === PS && ramp(sc) > 0.02)) {
          // Bakú mezcla fachada histórica de piedra caliza (100% en las curvas del casco viejo) con torres de cristal en bulevares rectos
          const bakuModern = isStone && !curvy && rnd2() < 0.24;
          const isT = tower || bakuModern;
          const bPat = isNeon ? 15 : isT ? 6 : isStone ? 16 : 5;
          const h = isNeon ? 18 + rnd2() * 34 : isT ? 16 + rnd2() * 26 : isStone ? 11 + rnd2() * 11 : 10 + rnd2() * 15;
          const D = 12 + rnd2() * 10;
          const c = bakuModern ? BAKU_GLASS[Math.floor(rnd2() * BAKU_GLASS.length)] : PAL[Math.floor(rnd2() * PAL.length)];
          const seed = Math.floor(rnd2() * 50), roof = !isT && !isStone && rnd2() < 0.5;
          const lm = run(sg, iOf(sc)) + 3, lw = T.SH - 0.08;
          // en la orilla no hay edificio: se ve el agua
          const pc = sample(sc, mkS()), lat = sg * (lw * W_REAL + lm + D / 2), wet = T.env && T.env.wet(pc.x + pc.rx * lat, pc.z + pc.rz * lat);
          if (!wet) for (const dd of [D, D * 0.5]) if (tryAdd(() => {
            B.at(sc, sg);
            B.box(-len / 2, len / 2, -4, h, 0, dd, lw, lm, c, { front: [bPat, seed], top: [8, 0] });
            if (roof) B.box(-len / 2 - 0.3, len / 2 + 0.3, h, h + 0.7, -0.4, dd + 0.4, lw, lm, 0xa65a3a, { front: [9, 0], top: [8, 0] });
            else if (!isT) B.near(() => B.box(-len / 2 - 0.25, len / 2 + 0.25, h - 0.5, h + 0.35, -0.35, dd + 0.2, lw, lm, isStone ? 0xcab897 : 0x8f887d, { front: [9, 0], top: [8, 0] }));
            if (!isT) B.near(() => B.box(-len / 2 - 0.1, len / 2 + 0.1, isStone ? 4.25 : 3.85, isStone ? 4.55 : 4.15, -0.22, dd + 0.1, lw, lm, isStone ? 0xd0be9d : 0xa59d8e, { front: [9, 0] }));
            if (!isT && !isStone && rnd2() < 0.25) B.near(() => B.panel(-len / 2 + 1, Math.min(len / 2 - 1, -len / 2 + 9), 4.2, 5.8, -0.05, lw, lm, Math.floor(rnd2() * 16), 0, 1));
            B.fine(() => roofTop(len, h, dd, lw, lm, c, roof, isT));
          }, 1)) break;
        }
        s += len;
      }
    }
    // manzanas lejos de la pista (no se ensanchan). Las calles siguen la pista (cada bloque se orienta como el tramo
    // más cercano); Mónaco crece ladera arriba, Singapur y Las Vegas usan el DSM y Bakú combina piedra histórica y torres.
    const list = [], ext = E * 0.72 + 260, used = new Set(), CS = 12;
    const free = (x, z, r) => { for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b2 = Math.floor((z - r) / CS); b2 <= Math.floor((z + r) / CS); b2++) if (used.has(a + "," + b2)) return false; return true; };
    const take = (x, z, r) => { for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b2 = Math.floor((z - r) / CS); b2 <= Math.floor((z + r) / CS); b2++) used.add(a + "," + b2); };
    for (let t = 0; t < 14000 && list.length < 2600; t++) {
      const x = (rnd2() * 2 - 1) * ext, z = (rnd2() * 2 - 1) * ext, w = 12 + rnd2() * 20, d = 12 + rnd2() * 18;
      const dist = trackDist(x, z), near = tdNear, need = Math.max(T.SH * T.Wov + 8, T.SH * W_REAL + 32) + Math.hypot(w, d) / 2;
      const rad = Math.max(w, d) * 0.58;
      if (dist < need || park(x, z) > 0.3 || (T.env && T.env.wet(x, z)) || !free(x, z, rad) || lmClear.some(([lx, lz, lr]) => Math.hypot(x - lx, z - lz) < lr + rad)) continue;
      const nx = (near + 2) % n, ang = Math.atan2(-(T.Z[nx] - T.Z[near]), T.X[nx] - T.X[near]) + (rnd2() - 0.5) * 0.15;
      let h, bCol;
      if (tower) {
        const above = T.env ? T.env.abs(x, z) - (-T.env.sea + 2) : 0;
        h = above > 20 ? above * (0.9 + rnd2() * 0.2) : (isNeon ? 18 + rnd2() * 30 : 14 + rnd2() * 22);
        bCol = PAL[Math.floor(rnd2() * PAL.length)];
      } else if (isStone) {
        const modern = dist - need > 35 && rnd2() < 0.26;
        h = modern ? 27 + rnd2() * 26 : 10 + rnd2() * 11;
        bCol = modern ? BAKU_GLASS[Math.floor(rnd2() * BAKU_GLASS.length)] : PAL[Math.floor(rnd2() * PAL.length)];
      } else {
        h = 9 + rnd2() * 12 + (T.env ? 26 * sstep(15, 110, T.env.abs(x, z)) : 0);
        bCol = PAL[Math.floor(rnd2() * PAL.length)];
      }
      h = Math.min(h, 14 + (dist - need) * (tower || isStone ? 1.3 : 0.6));
      if (isStone && h < 25) bCol = PAL[Math.floor(rnd2() * PAL.length)];
      take(x, z, rad);
      list.push([x, terr(x, z, 0).h, z, w, h, d, ang, bCol, dist - need]);
    }
    if (list.length) {
      // primero las que están cerca de la pista: solo esas dan sombra, con una copia que se dibuja únicamente en la
      // sombra (capa 1; la cámara solo ve la 0). Las de lejos no se ven con detalle y su sombra no se aprecia.
      list.sort((a, b) => a[8] - b[8]);
      const city = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat(cityPat), list.length));
      const qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
      list.forEach(([x, y, z, w, h, d, a, c], k) => { m4.compose(vv.set(x, y - 3, z), qq.setFromAxisAngle(yAx, a), sc3.set(w, h + 3, d)); city.setMatrixAt(k, m4); city.setColorAt(k, col.setHex(c)); });
      city.castShadow = false; city.receiveShadow = true; city.frustumCulled = false;
      const nNear = list.filter((b) => b[8] < 140).length;
      if (nNear) {
        const cs = add(new THREE.InstancedMesh(city.geometry, city.material, nNear));
        cs.instanceMatrix = city.instanceMatrix; cs.instanceColor = city.instanceColor; cs.count = nNear; cs.layers.set(1); cs.castShadow = true; cs.frustumCulled = false;
      }
      // tejados (calidad 2 y 3): en Mónaco algo más de la mitad a dos aguas y el resto azoteas; en torres, Las Vegas y Bakú, azoteas
      const gab = [], top = [], h21js = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
      list.forEach((b, k) => ((!tower && !isStone && h21js(b[0], b[2]) < 0.55) ? gab : top).push(k));
      for (const [geo, idx, part] of [[CITY_GABLE, gab, 1], [CITY_TOP, top, 2]]) {
        if (!idx.length) continue;
        const r = add(new THREE.InstancedMesh(geo, cityMat(cityPat, part), idx.length));
        idx.forEach((k, j) => { city.getMatrixAt(k, m4); r.setMatrixAt(j, m4); city.getColorAt(k, col); r.setColorAt(j, col); });
        r.receiveShadow = true; r.frustumCulled = false; r.visible = q >= 2; r.name = "tejados"; r.userData.sharedGeo = true;
        cityRoofs.push(r);
      }
    }
  }
  // torres de focos de las carreras de noche: celosía estilizada con batería LED inclinada sobre la pista
  const towers = [], night = !!vis.floodlights;
  if (night) for (let k = 0; k < Math.floor(T.L / 85); k++) {
    const s = 40 + k * 85, sg = k % 2 ? PS : -PS;
    if (sg === PS && ramp(s) > 0.02) continue;
    const lw = T.SH - 0.08, lm = run(sg, iOf(s)) + 2.2;
    if (tryAdd(() => {
      B.at(s, sg);
      B.box(-0.34, 0.34, -1, 1.2, -0.34, 0.34, lw, lm, 0x626872, { front: [9, 0], top: [9, 0] });
      B.box(-0.22, 0.22, 1.2, 13.4, -0.22, 0.22, lw, lm, 0x454b54, { front: [9, 0], top: [9, 0] });
      B.near(() => {
        B.box(-0.14, 0.14, 12.6, 13.1, -3.5, 0.15, lw, lm, 0x4a505a, { front: [9, 0] });
        B.box(-0.10, 0.10, 10.6, 12.8, -1.6, -0.1, lw, lm, 0x565d68, { front: [9, 0] });
      });
      B.box(-1.35, 1.35, 12.15, 12.75, -3.75, -2.35, lw, lm, 0x24282e, { front: [9, 0], top: [9, 0] });
      B.box(-1.25, 1.25, 12.05, 12.15, -3.65, -2.45, lw, lm, 0xffffff, { front: [10, 0], top: [10, 0] });
    }, -4.5, true)) towers.push({ s, sg, lw: lw * arrAt(T.wr, s), lm, z: -3.0, y: 12.0 });
  }
  // puestos de comisarios estilizados (base hormigón, peto naranja, cubierta inclinada y pilares), cada 360 m
  const posts = [];
  for (let k = 0; k < Math.floor(T.L / 360); k++) {
    const s = 190 + k * 360, sg = -PS, lw = T.SH, lm = run(sg, iOf(s)) + 4.0;
    if (tryAdd(() => {
      B.at(s, sg);
      B.box(-1.45, 1.45, -1, 0.35, -1.15, 1.15, lw, lm, 0x7a8088, { front: [9, 0], top: [9, 0] });
      B.box(-1.35, 1.35, 0.35, 1.65, -1.0, 1.0, lw, lm, 0xe8791f, { front: [9, 0], top: [9, 0] });
      B.box(-1.55, 1.55, 2.75, 2.98, -1.25, 1.25, lw, lm, 0xe6e9ee, { front: [0, 0], top: [8, 0] });
      B.near(() => {
        for (const px of [-1.2, 1.2]) for (const pz of [-0.9, 0.9]) {
          B.box(px - 0.08, px + 0.08, 1.65, 2.75, pz - 0.08, pz + 0.08, lw, lm, 0x383e46, { front: [9, 0] });
        }
      });
    }, 0.5)) posts.push({ s, sg, lw: lw * arrAt(T.wr, s), lm });
  }
  const props = add(B.mesh());
  const flags = add(new THREE.InstancedMesh(FLAG_GEO, FLAG_MAT, Math.max(1, posts.length)));
  flags.frustumCulled = false; flags.castShadow = true; flags.count = 0;
  for (let k = 0; k < posts.length; k++) flags.setColorAt(k, col.set(0xffd200));
  const scCar = add(new THREE.Mesh(SC_GEO, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 })));
  const scBar = add(new THREE.Mesh(SC_BAR, new THREE.MeshBasicMaterial({ color: 0xffa000 })));
  scCar.matrixAutoUpdate = scBar.matrixAutoUpdate = false; scCar.visible = scBar.visible = false; scCar.castShadow = true; scCar.frustumCulled = scBar.frustumCulled = false;
  modLoadSafetyCar().then((sc) => { if (sc && alive3d && world) world.scGlb = sc; });

  // ---- coches, ruedas, spray, sombras de reserva, fichas y aros
  const NC = sess.cars.length;
  const inst = (geo, mat, count, order) => { const m = add(new THREE.InstancedMesh(geo, mat, count)); m.frustumCulled = false; m.renderOrder = order; return m; };
  // dos juegos de mallas: la ligera para todos y la fina para los (pocos) coches cercanos con calidad alta
  const cars = inst(CAR_LO, CAR_MAT, NC, 10), wheels = inst(WHEEL_LO, WHEEL_MAT, NC * 4, 10);
  const carsHi = inst(CAR_GEO, CAR_MAT, NC, 10), wheelsHi = inst(WHEEL_GEO, WHEEL_MAT, NC * 4, 10);
  cars.castShadow = wheels.castShadow = carsHi.castShadow = wheelsHi.castShadow = true; cars.receiveShadow = carsHi.receiveShadow = true;
  const blobs = inst(BLOB_GEO, BLOB_MAT, NC, 6);
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size] of [["aCar", 3], ["aDir", 3], ["aPar", 4], ["aSpl", 1]]) sg.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(NC * SPRAY_P * size), size).setUsage(THREE.DynamicDrawUsage));
  sg.instanceCount = 0;
  const spray = add(new THREE.Mesh(sg, SPRAY_MAT)); spray.frustumCulled = false; spray.renderOrder = 12;
  // segundo color por coche
  const c2a = new Float32Array(NC * 3);
  sess.cars.forEach((c, i) => { col.set(SECOND[c.team.id] || "#e2e4e8"); c2a.set([col.r, col.g, col.b], i * 3); });
  // el casco de cada piloto, con los colores de su diseño (los mismos que en las pantallas)
  const hla = new Float32Array(NC * 3), hlb = new Float32Array(NC * 3);
  sess.cars.forEach((c, i) => { const d = helmetDesign(c.d.nombre); hla.set(col.set(d.base).toArray(), i * 3); hlb.set(col.set(d.c2).toArray(), i * 3); });
  const livSrc = Float32Array.from(sess.cars, (c) => Math.max(0, TEAMS.indexOf(c.team)));
  for (const g of [CAR_LO, CAR_GEO]) {
    const cd = new Float32Array(NC * 4);
    for (let k = 0; k < NC; k++) cd[k * 4] = livSrc[k];
    g.setAttribute("aCol2", new THREE.InstancedBufferAttribute(c2a.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aCarData", new THREE.InstancedBufferAttribute(cd, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aHelm", new THREE.InstancedBufferAttribute(hla.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aHelm2", new THREE.InstancedBufferAttribute(hlb.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  }
  // el coche mínimo (vista general) comparte con la ligera los datos de cada coche: se cambia una malla por otra
  for (const a of CAR_INST) CAR_MIN.setAttribute(a, CAR_LO.attributes[a]);
  const loose = inst(WHEEL_GEO.clone(), WHEEL_MAT, NC * 8, 10);
  const brakeH = new THREE.InstancedBufferAttribute(new Float32Array(NC * 4), 1).setUsage(THREE.DynamicDrawUsage);
  WHEEL_GEO.setAttribute("aBrake", brakeH);
  const steer = inst(STEER_GEO, STEER_MAT, NC, 10);
  const crewS = inst(crewAttr(CREW_STAND.clone(), NC * 12, 0xe2e4e8), CREW_MAT, NC * 12, 10), crewC = inst(crewAttr(CREW_CROUCH.clone(), NC * 4, 0xe2e4e8), CREW_MAT, NC * 4, 10), jacks = inst(JACK_GEO, JACK_MAT, NC * 2, 10);
  carLoCur = CAR_LO; // hasta que llegue la del .glb (con los datos de este circuito), la integrada
  loadCarAssets(({ carGeo, wheelGeo, carLoGeo, steer, cam }) => {
    if (!alive3d || !world) { carGeo?.dispose(); wheelGeo?.dispose(); carLoGeo?.dispose(); return; }
    if (steer) steerPos = steer;
    if (cam) camPos = cam;
    if (carLoGeo) {
      // comparte con la integrada los datos de cada coche (segundo color, librea, daños)
      for (const a of CAR_INST) carLoGeo.setAttribute(a, CAR_LO.attributes[a]);
      if (cars.geometry !== CAR_MIN) cars.geometry = carLoGeo;
      if (extCarLoGeo) extCarLoGeo.dispose();
      extCarLoGeo = carLoCur = carLoGeo;
    }
    if (carGeo) {
      for (const a of CAR_INST) carGeo.setAttribute(a, CAR_GEO.attributes[a]);
      carsHi.geometry = carGeo;
      if (extCarGeo) extCarGeo.dispose();
      extCarGeo = carGeo;
    }
    if (wheelGeo) {
      const looseGeo = wheelGeo.clone();
      loose.geometry.dispose(); loose.geometry = looseGeo;
      wheelGeo.setAttribute("aBrake", brakeH);
      wheelsHi.geometry = wheelGeo;
      if (extWheelGeo) extWheelGeo.dispose();
      extWheelGeo = wheelGeo;
    }
  });
  // tras un accidente: restos, comisarios y la grúa
  const debris = inst(new THREE.BoxGeometry(0.5, 0.08, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.6 }), NC * 7, 9);
  // pluma (amarilla) y cable (negro): cajas de 1 m estiradas entre dos puntos
  const beams = inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), NC * 2, 10);
  for (let i = 0; i < NC * 2; i++) beams.setColorAt(i, col.set(0xf2c00d));
  beams.count = 0; beams.castShadow = true;
  const marsh = inst(crewAttr(CREW_STAND.clone(), NC * 3, 0xf2f2f2), CREW_MAT, NC * 3, 10), crane = inst(CRANE_GEO, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), NC, 10);
  for (let i = 0; i < NC * 7; i++) debris.setColorAt(i, col.set(0x222222));
  for (let i = 0; i < NC * 3; i++) marsh.setColorAt(i, col.set(0xff6a00));
  debris.count = marsh.count = crane.count = 0; marsh.castShadow = crane.castShadow = true;
  // puño en alto de los tres primeros en la vuelta de honor, y el comisario de la bandera a cuadros
  const fists = inst(FIST_GEO, CREW_MAT, 3, 11);
  for (let i = 0; i < 3; i++) fists.setColorAt(i, col.set(0xffffff));
  fists.count = 0;
  const chk = add(new THREE.Group());
  let chkMan = null;
  { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 96; const g = cv.getContext("2d");
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4"; g.fillRect(x * 16, y * 16, 16, 16); }
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 10, 3).translate(0.75, 0, 0), new THREE.MeshStandardMaterial({ map: srgb(new THREE.CanvasTexture(cv)), side: THREE.DoubleSide, roughness: 0.8 }));
    cloth.material.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += sin(uTime * 11.0 - position.x * 4.0) * 0.18 * position.x;"); };
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6).translate(0, 0.65, 0), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const arm = new THREE.Group(); cloth.position.y = 1.1; arm.add(stick, cloth); arm.position.y = 1.55; arm.name = "brazo";
    chkMan = new THREE.Mesh(CREW_STAND, new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.8 }));
    chkMan.userData.sharedGeo = true;
    chk.add(chkMan, arm); chk.visible = false; chk.traverse((o) => { o.castShadow = true; o.frustumCulled = false; }); }
  const blank = inst(BLANKET_GEO, CREW_MAT, NC * 4, 10);
  for (let i = 0; i < NC * 4; i++) blank.setColorAt(i, col.set(0xffffff));
  blank.count = 0; blank.castShadow = true;
  const gant = inst(GANTRY_GEO, JACK_MAT, NC, 10), glit = inst(GLIT_GEO, GLIT_MAT, NC, 16);
  for (let i = 0; i < NC; i++) glit.setColorAt(i, col.set(0xff0000));
  gant.count = glit.count = 0; gant.castShadow = true;
  crewS.castShadow = crewC.castShadow = jacks.castShadow = loose.castShadow = true;
  for (let i = 0; i < NC * 12; i++) crewS.setColorAt(i, col.set(0xffffff));
  for (let i = 0; i < NC * 4; i++) crewC.setColorAt(i, col);
  for (let i = 0; i < NC * 8; i++) loose.setColorAt(i, col);
  crewS.count = crewC.count = jacks.count = loose.count = 0;
  const pg = new THREE.InstancedBufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); pg.setIndex([0, 1, 2, 0, 2, 3]);
  pg.setAttribute("aP", new THREE.InstancedBufferAttribute(new Float32Array(PN * 4), 4).setUsage(THREE.DynamicDrawUsage));
  pg.setAttribute("aC", new THREE.InstancedBufferAttribute(new Float32Array(PN * 4), 4).setUsage(THREE.DynamicDrawUsage));
  pg.instanceCount = 0;
  const puffs = add(new THREE.Mesh(pg, PUFF_MAT)); puffs.frustumCulled = false; puffs.renderOrder = 13;
  const spg = new THREE.InstancedBufferGeometry();
  spg.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); spg.setIndex([0, 1, 2, 0, 2, 3]);
  spg.setAttribute("aP", new THREE.InstancedBufferAttribute(new Float32Array(SPN * 4), 4).setUsage(THREE.DynamicDrawUsage));
  spg.setAttribute("aV", new THREE.InstancedBufferAttribute(new Float32Array(SPN * 4), 4).setUsage(THREE.DynamicDrawUsage));
  spg.instanceCount = 0;
  const sparkMesh = add(new THREE.Mesh(spg, SPARK_MAT)); sparkMesh.frustumCulled = false; sparkMesh.renderOrder = 14;
  const mg = new THREE.InstancedBufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); mg.setIndex([0, 1, 2, 0, 2, 3]);
  for (const a of ["aA", "aB", "aC"]) mg.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(MK * 4), 4).setUsage(THREE.DynamicDrawUsage));
  mg.instanceCount = 0;
  const markMesh = add(new THREE.Mesh(mg, MARK_MAT)); markMesh.frustumCulled = false; markMesh.renderOrder = 5;
  marks.dirty = true;
  // lámina de dorsales
  const nc = document.createElement("canvas"); nc.width = NUM_COLS * 64; nc.height = NUM_ROWS * 64;
  { const g = nc.getContext("2d"); g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 46px 'Titillium Web', sans-serif"; g.lineJoin = "round";
    sess.cars.forEach((c, i) => { const x = (i % NUM_COLS) * 64 + 32, y = Math.floor(i / NUM_COLS) * 64 + 34, t = String(c.d.numero ?? ""); g.lineWidth = 8; g.strokeStyle = "#0c0d10"; g.strokeText(t, x, y); g.fillStyle = "#ffffff"; g.fillText(t, x, y); }); }
  const numMat = new THREE.MeshBasicMaterial({ map: srgb(new THREE.CanvasTexture(nc)), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  numMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", `vMapUv = (uv + vec2(mod(aCell, ${NUM_COLS}.0), ${NUM_ROWS - 1}.0 - floor(aCell / ${NUM_COLS}.0))) / vec2(${NUM_COLS}.0, ${NUM_ROWS}.0);`);
  };
  const dg = DECAL_GEO.clone();
  dg.setAttribute("aCell", new THREE.InstancedBufferAttribute(Float32Array.from(sess.cars, (c, i) => i), 1));
  const decals = inst(dg, numMat, NC, 11);
  const discs = inst(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, fog: false }), NC, 7);
  for (let i = 0; i < NC; i++) { cars.setColorAt(i, col.set(0xffffff)); discs.setColorAt(i, col); }
  for (let i = 0; i < NC * 4; i++) wheels.setColorAt(i, col);
  const rings = [0, 1, 2].map((k) => {
    const r = add(new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: k === 2 ? 0xffd84a : 0xffffff, depthTest: false, depthWrite: false, fog: false })));
    r.renderOrder = 5; r.visible = false; return r;
  });
  const ghostRings = [0, 1].map(() => {
    const r = add(new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false })));
    r.userData.sharedGeo = true; r.renderOrder = 6; r.visible = false; return r;
  });
  // el dorsal y el segundo color son de cada coche, pero los coches se dibujan por orden en pista: se copian a su hueco en cada fotograma
  const carIdx = new Map(sess.cars.map((c, i) => [c.id, i]));
  DBG.towers = towers;
  // ---- de noche, luces de pueblos y ciudades en el borde del terreno, en grupos (se encienden con la noche, más abajo)
  const townLights = (() => {
    const NP = street ? 900 : 520, pos = [], cols = [];
    let rs3 = 777 + n; const r3 = () => ((rs3 = (rs3 * 1664525 + 1013904223) >>> 0) / 4294967296);
    const towns = Array.from({ length: street ? 22 : 14 }, () => ({ a: r3() * Math.PI * 2, R: E * (2.0 + r3() * 1.0), w: 0.03 + r3() * 0.08 }));
    for (let k = 0; k < NP; k++) {
      const tw = towns[Math.floor(r3() * towns.length)], a = tw.a + (r3() - 0.5) * tw.w * 2, R0 = tw.R * (1 + (r3() - 0.5) * 0.06);
      const x = Math.cos(a) * R0, z = Math.sin(a) * R0, t = terr(x, z, 0);
      if (t.wet) continue;
      pos.push(x, t.h + E * 0.02 + 4 + r3() * 10, z); // algo por encima: que no las tapen las lomas de delante
      cols.push(...(r3() < 0.75 ? [1, 0.7, 0.4] : [0.85, 0.9, 1]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = add(new THREE.Points(g, m)); pts.frustumCulled = false; pts.visible = false; pts.name = "pueblos";
    return pts;
  })();
  const trackKit = createTrackKit(THREE, {
    scene, trackId: track.id, trackName: track.name, L: T.L, ds: T.ds, PS: T.PS, SH: T.SH, W_REAL, street,
    pitEntry: track.pit.entry, pitExit: track.pit.exit, brakes, standS, rP: T.rP, rO: T.rO,
    sample, terrY: (x, z) => terr(x, z, 0).h, trackDist,
    isWet: T.env ? (x, z) => T.env.wet(x, z) : undefined,
    loadKitGlb: modLoadKitGlb,
  });
  const curWorld = { all, trackKit, realPit, cityRoofs, props, trees: treeMesh, treeMeshes: [treeMesh], treeLod: null, townLights, sparkMesh, fists, chk, beams, towers, night, lampPos, debris, marsh, crane, blank, gant, glit, markMesh, posts, flags, scCar, scBar, road, cars, wheels, crewS, crewC, jacks, loose, puffs, blobs, spray, discs, rings, ghostRings, lamps, poles, halos, decals, steer, carIdx, c2src: c2a.slice(), hlsA: hla, hlsB: hlb, hlA: CAR_LO.attributes.aHelm, hlB: CAR_LO.attributes.aHelm2, hlAH: CAR_GEO.attributes.aHelm, hlBH: CAR_GEO.attributes.aHelm2, carsHi, wheelsHi, col2: CAR_LO.attributes.aCol2, livSrc, carData: CAR_LO.attributes.aCarData, col2H: CAR_GEO.attributes.aCol2, carDataH: CAR_GEO.attributes.aCarData, brakeH, cell: dg.attributes.aCell };
  world = curWorld;
  // ---- carga asíncrona de los .glb de entorno (árboles del bioma, mecánicos y yates) sin bloquear el arranque
  if (trees.length && bio.species?.length) {
    const spKeys = bio.species.map(([k]) => k);
    Promise.all(spKeys.map((k) => modLoadEnvTree(k))).then((loaded) => {
      if (!alive3d || world !== curWorld) return;
      const byKey = new Map();
      const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      spKeys.forEach((k, idx) => {
        const tpl = loaded[idx];
        if (!tpl) return;
        const wrapParts = (parts) => parts.map((pt) => {
          const mat = pt.mat.clone();
          if (pt.mat.map) mat.map = cloneTemplateTex(pt.mat.map, maxAniso, envResDispose);
          envResDispose.push(mat);
          return { geo: pt.geo, mat, tintable: pt.tintable };
        });
        byKey.set(k, { hi: wrapParts(tpl.hi), lo: tpl.lo ? wrapParts(tpl.lo) : null });
      });
      if (!byKey.size) return;
      // repartir árboles entre las especies disponibles del bioma según pesos acumulados
      const buckets = new Map([...byKey.keys()].map((k) => [k, []]));
      const avail = bio.species.filter(([k]) => byKey.has(k));
      const wSum = avail.reduce((a, [, w]) => a + w, 0) || 1;
      for (const t of trees) {
        let r = t[6] * wSum, chosen = avail[avail.length - 1][0];
        for (const [k, w] of avail) { r -= w; if (r <= 0) { chosen = k; break; } }
        buckets.get(chosen).push(t);
      }
      const spScale = { leaf: 1.05, pine: 1.16, palm: 0.72 };
      const tintB = new THREE.Color(bio.tintB), tc = new THREE.Color();
      const tm = new THREE.Matrix4(), tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), uy = new THREE.Vector3(0, 1, 0);
      const newMeshes = [], lodHi = [], lodLo = [];
      const tinyNow = cars.geometry === CAR_MIN;
      const buildInst = (parts, list, scMul, visible) => {
        const out = [];
        for (const pt of parts) {
          const im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
          im.userData.sharedGeo = true; im.userData.sharedMat = true;
          im.frustumCulled = false; im.castShadow = q >= 3; im.receiveShadow = true; im.visible = visible;
          im.name = "arboles";
          for (let i = 0; i < list.length; i++) {
            const t = list[i], s = T.Wov * 1.05 * scMul * t[3];
            tm.compose(tp.set(t[0], t[1], t[2]), tq.setFromAxisAngle(uy, t[5]), ts.set(s, s, s));
            im.setMatrixAt(i, tm);
            if (pt.tintable) im.setColorAt(i, tc.setHex(bio.tintA).lerp(tintB, t[4]));
          }
          scene.add(im); all.push(im); newMeshes.push(im); out.push(im);
        }
        return out;
      };
      for (const [k, list] of buckets) {
        if (!list.length) continue;
        const tpl = byKey.get(k), scMul = spScale[k] ?? 0.88;
        if (tpl.lo) {
          lodHi.push(...buildInst(tpl.hi, list, scMul, !tinyNow));
          lodLo.push(...buildInst(tpl.lo, list, scMul, tinyNow));
        } else {
          buildInst(tpl.hi, list, scMul, true);
        }
      }
      // retirar el sustituto procedural
      scene.remove(treeMesh);
      const idxAll = all.indexOf(treeMesh); if (idxAll >= 0) all.splice(idxAll, 1);
      treeMesh.userData.near?.dispose(); treeMesh.userData.far?.dispose();
      treeMesh.material?.dispose();
      curWorld.trees = null;
      curWorld.treeMeshes = newMeshes;
      curWorld.treeLod = lodLo.length ? { hi: lodHi, lo: lodLo } : null;
    });
  }
  modLoadCrewModels().then((cr) => {
    if (!cr || !alive3d || world !== curWorld) return;
    const swapCrew = (mesh, tplGeo) => {
      const g = tplGeo.clone();
      if (mesh.geometry.attributes.aCrew2) g.setAttribute("aCrew2", mesh.geometry.attributes.aCrew2);
      mesh.geometry.dispose();
      mesh.geometry = g;
    };
    swapCrew(crewS, cr.stand);
    swapCrew(crewC, cr.crouch);
    swapCrew(marsh, cr.stand);
    if (chkMan) { chkMan.geometry = cr.stand; chkMan.userData.sharedGeo = true; }
  });
  if (boatMeshRef) {
    modLoadYachtModel().then((y) => {
      if (!y || !alive3d || world !== curWorld) return;
      const oldMat = boatMeshRef.material;
      const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const mat = y.mat.clone();
      if (y.mat.map) mat.map = cloneTemplateTex(y.mat.map, maxAniso, envResDispose);
      envResDispose.push(mat);
      boatMeshRef.geometry = y.geo;
      boatMeshRef.material = mat;
      boatMeshRef.userData.sharedGeo = true;
      boatMeshRef.userData.sharedMat = true;
      oldMat?.dispose();
    });
  }
  U.uL.value = T.L;
  wetT = -1e9;
  cloudReady = wxReady = false; cloudRow = wxRow = 0;
  lightInit = false; smoothClock = NaN; windInit = false;
  applyQuality();
}

/** Agua en la trazada y fuera de ella (el juego lleva las dos), interpolada entre minisectores para que no haya escalones. */
let wetT = -1e9, wetMap = null;
const wetVis = (w) => clamp(w < 0.02 ? w * 12 : 0.24 + w * 0.76, 0, 1);
function updateWet(now) {
  if (now - wetT < 400) return;
  wetT = now;
  const g = world.road.geometry, a = g.attributes.aWet, b = g.attributes.aWetOff, C = world.road.userData.C, N = a.count / C, M = track.ms.length;
  if (!wetMap || wetMap.road !== world.road) {
    const A = new Int16Array(N), B = new Int16Array(N), wB = new Float32Array(N), mid = (m) => (m.s0 + m.s1) / 2;
    for (let k = 0; k < N; k++) {
      const i = k % T.n, s = i * T.ds, m = track.ms[track.msOfPoint[i]], cm = mid(m), nx = s >= cm, o = track.ms[(m.i + (nx ? 1 : M - 1)) % M];
      const span = mod(nx ? mid(o) - cm : cm - mid(o), T.L) || 1;
      A[k] = m.i; B[k] = o.i; wB[k] = clamp(Math.abs(s - cm) / span, 0, 1);
    }
    wetMap = { road: world.road, A, B, wB };
  }
  const { A, B, wB } = wetMap;
  for (let k = 0; k < N; k++) {
    const on = wetVis(sess.water[A[k]] * (1 - wB[k]) + sess.water[B[k]] * wB[k]), off = wetVis(sess.waterOff[A[k]] * (1 - wB[k]) + sess.waterOff[B[k]] * wB[k]);
    for (let j = 0; j < C; j++) { a.array[k * C + j] = on; b.array[k * C + j] = Math.max(on, off); }
  }
  a.needsUpdate = b.needsUpdate = true;
}

/** Nubes y lluvia del juego en una textura sobre el circuito: R = lluvia, G = sombra de nube.
 *  Se rellena completa en el primer fotograma y después se actualiza por franjas (sin picos de CPU ni saltos). */
const cloudNext = new Uint8Array(CN * CN * 4);
let cloudReady = false, cloudRow = 0, cloudRmax = 0, rainHere = 0;
let windInit = false, windPosX = 0, windPosY = 0, smoothWindDir = 0;
let smoothClock = NaN, smoothCloud = 0, smoothRain = 0;
function updateCloud(dt, now) {
  const w = sess.weather, TR = U.uTexR.value;
  // Reloj continuo: el clima de la simulación avanza cada 5 s, aquí interpolamos suavemente entre pasos
  const simDt = isPaused() ? 0 : dt * (replay ? REPLAY_SPEED : curSpeed());
  if (!isFinite(smoothClock) || Math.abs(w.clock - smoothClock) > 1.5) {
    smoothClock = w.clock;
  } else {
    smoothClock += simDt / 60;
    smoothClock += (w.clock - smoothClock) * (1 - Math.exp(-dt / 2.5));
  }
  // Advectar el viento de forma incremental en cada fotograma: evita los teletransportes al variar windDir
  if (!windInit) {
    smoothWindDir = w.windDir;
    const k0 = (w.clock % 120) * w.windSpeed / 60 / 2.6;
    windPosX = -Math.cos(smoothWindDir) * k0;
    windPosY = Math.sin(smoothWindDir) * k0;
    windInit = true;
  } else {
    let dAng = ((w.windDir - smoothWindDir + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    smoothWindDir += dAng * (1 - Math.exp(-dt / 2.0));
    const adv = simDt * w.windSpeed / 9360; // km/h → unidades de 2,6 km por segundo simulado
    windPosX += -Math.cos(smoothWindDir) * adv;
    windPosY += Math.sin(smoothWindDir) * adv;
  }
  skyU.uWind.value.set(windPosX, windPosY);

  const rows = cloudReady ? 6 : CN;
  const endRow = Math.min(CN, cloudRow + rows);
  if (cloudRow === 0) cloudRmax = 0;
  for (let iz = cloudRow; iz < endRow; iz++) for (let ix = 0; ix < CN; ix++) {
    const X = ((ix + 0.5) / CN * 2 - 1) * TR, Z = ((iz + 0.5) / CN * 2 - 1) * TR;
    const xk = (X + T.cx) / 1000, yk = (-Z + T.cy) / 1000;
    const rain = rainAt(w, xk, yk);
    let cl = 0;
    for (const c of w.cells) {
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(c.age / c.life, 0, 1))), 0.6), rad = Math.max(2, 2.5 * c.sigma);
      cl += 0.85 * Math.min(1, env * 1.5) * Math.exp(-((xk - c.x) ** 2 + (yk - c.y) ** 2) / (2 * rad * rad));
    }
    const nx = xk * 1.3 + windPosX * 2.6, ny = yk * 1.3 - windPosY * 2.6;
    const cum = sstep(0.66 - 0.4 * w.baseCloud, 0.84, 0.6 * vnoise(nx, ny) + 0.4 * vnoise(nx * 2.3 + 9, ny * 2.3 + 4)) * 0.75;
    const shade = clamp(Math.max(cl * (0.6 + 0.6 * vnoise(nx * 0.7, ny * 0.7)), cum) + Math.min(0.5, rain / 6), 0, 1);
    const o = (iz * CN + ix) * 4;
    cloudNext[o] = clamp(rain / 3, 0, 1) * 255; cloudNext[o + 1] = shade * 255; cloudNext[o + 3] = 255;
    if (rain > cloudRmax) cloudRmax = rain;
  }
  cloudRow = endRow;
  if (cloudRow >= CN) {
    cloudRow = 0;
    if (!cloudReady) {
      cloudData.set(cloudNext);
      cloudReady = true;
    } else {
      for (let i = 0; i < cloudData.length; i += 4) {
        cloudData[i] = Math.round(cloudData[i] + (cloudNext[i] - cloudData[i]) * 0.45);
        cloudData[i + 1] = Math.round(cloudData[i + 1] + (cloudNext[i + 1] - cloudData[i + 1]) * 0.45);
        cloudData[i + 3] = 255;
      }
    }
    cloudTex.needsUpdate = true;
    rainHere = cloudRmax;
  }
  updateSkyWeather(now);
}
/** Lo que se ve en el cielo sale de las mismas células y la misma llovizna que dibuja el radar.
 *  Actualización incremental por franjas para evitar micro-tirones cada 2 s. */
const wxNext = new Uint8Array(WN * WN * 4);
let wxReady = false, wxRow = 0, wxSum = 0, wxMean = 0;
function updateSkyWeather(now) {
  const w = sess.weather;
  const rows = wxReady ? 4 : WN;
  const endRow = Math.min(WN, wxRow + rows);
  if (wxRow === 0) wxSum = 0;
  for (let iz = wxRow; iz < endRow; iz++) for (let ix = 0; ix < WN; ix++) {
    const xk = (((ix + 0.5) / WN * 2 - 1) * WX_R + T.cx) / 1000, yk = (-((iz + 0.5) / WN * 2 - 1) * WX_R + T.cy) / 1000;
    const rain = rainAt(w, xk, yk);
    let cl = w.baseCloud;
    for (const c of w.cells) {
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(c.age / c.life, 0, 1))), 0.6), rad = Math.max(2, 2.5 * c.sigma * Math.max(1, c.ax) ** 0.5);
      cl += 0.85 * Math.min(1, env * 1.5) * Math.exp(-((xk - c.x) ** 2 + (yk - c.y) ** 2) / (2 * rad * rad));
    }
    // donde llueve hay nube siempre, aunque el borde de la célula quede fuera de su mancha
    const cover = clamp(Math.max(cl, rain > 0.05 ? 0.75 + rain * 0.1 : 0), 0, 1), o = (iz * WN + ix) * 4;
    wxNext[o] = Math.sqrt(clamp(rain / 6, 0, 1)) * 255; wxNext[o + 1] = cover * 255; wxNext[o + 3] = 255;
    wxSum += cover;
  }
  wxRow = endRow;
  if (wxRow >= WN) {
    wxRow = 0;
    wxMean = wxSum / (WN * WN);
    if (!wxReady) {
      wxData.set(wxNext);
      wxReady = true;
    } else {
      for (let i = 0; i < wxData.length; i += 4) {
        wxData[i] = Math.round(wxData[i] + (wxNext[i] - wxData[i]) * 0.45);
        wxData[i + 1] = Math.round(wxData[i + 1] + (wxNext[i + 1] - wxData[i + 1]) * 0.45);
        wxData[i + 3] = 255;
      }
    }
    wxTex.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ luz según la hora
let lightInit = false, dayK = 1, smoothEnvInt = 0.85, chosenPreset = "dia";
const sunDir = new THREE.Vector3(0.4, 0.7, 0.4), _dayDir = new THREE.Vector3(), _moonDir = new THREE.Vector3(0.35, 0.8, 0.3).normalize();
const C = (h) => new THREE.Color(h), _c1 = C(0), _c2 = C(0), _c3 = C(0), _c4 = C(0);
const SKY = { zDay: C(0x3d7bc8), zDusk: C(0x34447c), zNight: C(0x04060c), zGrey: C(0x7f8a96), hDay: C(0xc3d8ea), hDusk: C(0xf0a56c), hNight: C(0x0c111d), hGrey: C(0xaab3bc) };
// ------------------------------------------------------------------ relámpagos
// Bajo las células de tormenta (más de 15 mm/h a menos de 30 km) caen rayos de vez en cuando: el cielo y la luz
// ambiente destellan ~0,2 s (con un segundo golpe a veces) y el trueno llega después, según lo lejos que esté
// (audio.ts, vía audioView). Solo dibujo: usa Math.random().
let flashAt = -1e9, flash2 = false, stormK = 0, lastStormT = 0;
const thunders = [];
function flashK(now) {
  const t = (now - flashAt) / 1000;
  if (t < 0 || t > 0.6) return 0;
  const a = Math.exp(-t / 0.06) * (t < 0.2 ? 1 : 0.3), b = flash2 && t > 0.12 ? Math.exp(-(t - 0.12) / 0.07) * 0.8 : 0;
  return Math.min(1.2, a + b);
}
function updateStorm(now) {
  const dtr = Math.min(0.25, Math.max(0, (now - lastStormT) / 1000)); lastStormT = now;
  if (replay || opt.paused() || dtr <= 0) return;
  let best = null, bestK = 0;
  for (const c of sess.weather.cells) {
    const d = Math.hypot(c.x, c.y), k = Math.max(0, (c.peak - 15) / 25) * (d < 30 ? 1 : 0);
    if (k > bestK) { bestK = k; best = { d }; }
  }
  stormK = bestK;
  // un rayo cada 6-20 s reales en una tormenta fuerte (a ×1); no más a velocidades altas
  if (best && Math.random() < dtr * Math.min(0.18, 0.05 + 0.1 * bestK)) {
    flashAt = now; flash2 = Math.random() < 0.5;
    const dist = Math.max(0.4, best.d + (Math.random() - 0.5) * 6);
    thunders.push({ dist });
    if (thunders.length > 4) thunders.shift(); // nadie los escucha (2D o sin sonido): no se acumulan
  }
}
function pickHdriPreset(day, warm, cloud, rain) {
  // Histéresis para evitar saltos continuos cuando las nubes, la lluvia o la elevación rozan el umbral
  if (chosenPreset === "noche") { if (day > 0.24) chosenPreset = warm > 0.36 ? "tarde" : (cloud > 0.56 || rain > 0.18) ? "nublado" : "dia"; }
  else if (day < 0.16) chosenPreset = "noche";
  else if (chosenPreset === "tarde") { if (warm < 0.28) chosenPreset = (cloud > 0.56 || rain > 0.18) ? "nublado" : "dia"; }
  else if (warm > 0.40) chosenPreset = "tarde";
  else if (chosenPreset === "nublado") { if (cloud < 0.48 && rain < 0.10) chosenPreset = "dia"; }
  else if (cloud > 0.60 || rain > 0.22) chosenPreset = "nublado";
  return chosenPreset;
}
function updateLight(dt, now) {
  updateStorm(now);
  const rawCloud = clamp(sess.weather.cloud ?? 0, 0, 1);
  if (!lightInit) {
    smoothCloud = rawCloud;
    smoothRain = rainHere;
    lightInit = true;
  } else {
    smoothCloud += (rawCloud - smoothCloud) * (1 - Math.exp(-dt / 1.8));
    smoothRain += (rainHere - smoothRain) * (1 - Math.exp(-dt / 1.5));
  }
  const h = (isFinite(smoothClock) ? smoothClock : sess.weather.clock) / 60, lat = track.def.clima?.latitud ?? 45, DEG = Math.PI / 180;
  let el = 62 * DEG * Math.sin(Math.PI * (h - 6.2) / 13.6), az = (h - 13) * 15 * DEG;
  if (hourMode === "tarde") { el = 8 * DEG; az = 78 * DEG; }
  if (hourMode === "noche") { el = -25 * DEG; az = 120 * DEG; }
  const cloud = smoothCloud;
  const day = dayK = sstep(-4 * DEG, 9 * DEG, el), warm = (1 - sstep(4 * DEG, 28 * DEG, el)) * day;
  const sunK = sstep(0.0, 0.14, day);
  _dayDir.set(-Math.sin(az) * Math.cos(el), Math.max(0.1, Math.sin(el)), Math.cos(az) * Math.cos(el) * (lat < 0 ? -1 : 1)).normalize();
  sunDir.copy(_moonDir).lerp(_dayDir, sunK).normalize();
  // transición continua entre luz lunar (noche) y luz solar (cálida al atardecer, blanca de día)
  _c4.setHex(0xfff3dd).lerp(_c1.setHex(0xff9a52), warm);
  sun.color.setHex(0x8fa8ff).lerp(_c4, sunK);
  // intensidades en unidades físicas de three (π ≈ «blanco a pleno sol»); contraste sol/sombra nítido estilo mánager moderno
  const sunTotal = 3.35 * day * (1 - 0.78 * cloud) + 0.35 * (1 - sunK);
  sunFar.color.copy(sun.color);
  if (csmActive) {
    sun.intensity = sunTotal * 0.65;
    sunFar.intensity = sunTotal * 0.35;
    sunFar.visible = true;
    sunFar.castShadow = true;
  } else {
    sun.intensity = sunTotal;
    sunFar.intensity = 0;
    sunFar.visible = false;
    sunFar.castShadow = false;
  }
  const grey = cloud * 0.85 * day;
  const zen = _c1.copy(SKY.zNight).lerp(_c3.copy(SKY.zDay).lerp(SKY.zDusk, warm), day).lerp(SKY.zGrey, grey);
  const hor = _c2.copy(SKY.hNight).lerp(_c3.copy(SKY.hDay).lerp(SKY.hDusk, warm * 0.8), day).lerp(SKY.hGrey, grey);
  skyU.uZen.value.copy(zen); skyU.uHor.value.copy(hor); skyU.uSun.value.copy(sunDir); skyU.uNight.value = 1 - day;
  skyU.uSunCol.value.copy(sun.color).multiplyScalar(day * (1 - 0.7 * cloud) + 0.25 * (1 - sunK));
  skyU.uCloudCol.value.setRGB(1, 1, 1).lerp(hor, 0.3 + 0.4 * cloud).multiplyScalar((0.25 + 0.75 * day) * 1.1);
  // el suelo que ve el entorno: lo que el sol y el cielo sacan del verde (o del gris en los urbanos)
  skyU.uGround.value.setHex(T.street ? 0x3a3d42 : 0x26381f).multiplyScalar(0.25 + 0.9 * day * (1 - 0.5 * cloud));
  fog.color.copy(hor);
  SPRAY_MAT.uniforms.uCol.value.setRGB(0.8, 0.84, 0.88).lerp(hor, 0.35).multiplyScalar(0.2 + 0.7 * day);
  renderer.setClearColor(hor, 1);
  // al atardecer y de noche el cielo apenas alumbra: sube un poco lo que aporta el entorno para que se siga viendo
  const preset = pickHdriPreset(day, warm, cloud, smoothRain);
  needHdri(preset);
  const fl = flashK(now);
  const targetEnv = hdriEnv ? (0.78 + 0.38 * (1 - day) + 0.45 * warm) : (0.94 + 0.62 * (1 - day) + 0.6 * warm);
  smoothEnvInt += (targetEnv - smoothEnvInt) * (1 - Math.exp(-dt / 0.55));
  // suaviza brevemente la exposición si acaba de cambiar el HDRI para evitar un fogonazo seco
  const swapT = clamp((now - hdriSwapAt) / 600, 0, 1);
  const swapDip = 1 - 0.08 * Math.sin(swapT * Math.PI);
  scene.environmentIntensity = smoothEnvInt * swapDip * (1 + 2.5 * fl);
  skyU.uFlash.value = fl * (0.6 + 0.6 * (1 - day));
  updateEnv(now, [sunDir.x, sunDir.y, sunDir.z, zen.r, zen.g, zen.b, hor.r, hor.g, hor.b, cloud, wxMean, Math.min(smoothRain, 3) / 2].map((v) => v.toFixed(2)).join());
  U.uFlood.value = (1 - day) * 0.8;
  U.uDay.value = day * (1 - 0.55 * cloud);
  U.uCloudShade.value = 0.36 * day * (1 - 0.65 * cloud);
  skyU.uCity.value = T.street ? 1 : 0.3;
  if (post?.grade) {
    const gu = post.grade.uniforms;
    gu.uWarm.value = warm;
    gu.uOvercast.value = clamp(cloud * 0.75 + clamp(smoothRain / 2.5, 0, 1) * 0.45, 0, 1) * day;
    gu.uNight.value = 1 - day;
  }
  // luces de los pueblos en el horizonte: con la noche (solo en calidad 2 y 3)
  if (world.townLights) { const k = sstep(0.25, 0.75, 1 - day); world.townLights.visible = q >= 2 && k > 0.01; world.townLights.material.opacity = k; }
  const lampFade = world.night ? 0 : sstep(0.65, 0.22, day);
  world.poles.visible = !world.night && day < 0.7;
  world.lamps.visible = lampFade > 0.01;
  world.halos.visible = lampFade > 0.01;
  if (lampFade > 0.01) {
    world.lamps.material.color.setHex(0xfff1c9).multiplyScalar(0.35 + 3.65 * lampFade);
    world.halos.material.opacity = lampFade;
  }
}

// ------------------------------------------------------------------ postproceso
// Con calidad 2 o 3 la escena se dibuja en un búfer con valores altos (HDR) y pasa por: oclusión ambiental (las
// rendijas y los contactos con el suelo se oscurecen), desenfoque del fondo en la cámara de tele, resplandor de lo
// muy brillante y, al final, la curva de tonos. Con calidad 0 o 1 se dibuja directo a pantalla, como siempre.
const DOF_SHADER = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uNear: { value: 1 }, uFar: { value: 1000 }, uFocus: { value: 50 }, uRange: { value: 5 }, uMax: { value: 0 }, uPx: { value: new THREE.Vector2() } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uRange, uMax; uniform vec2 uPx; varying vec2 vUv;
    // radio del círculo de confusión (px): cero en torno al coche enfocado, crece con la distancia a ese plano
    float coc(vec2 uv){ float d = texture2D(tDepth, uv).x, z = uNear * uFar / (uFar - d * (uFar - uNear));
      return uMax * clamp(max(0.0, abs(z - uFocus) - uRange) / z * (z < uFocus ? 0.7 : 1.5), 0.0, 1.0); }
    void main(){
      vec3 c0 = texture2D(tDiffuse, vUv).rgb; float r0 = coc(vUv);
      if (r0 < 0.6) { gl_FragColor = vec4(c0, 1.0); return; }
      vec3 acc = c0; float w = 1.0;
      for (int i = 1; i <= 16; i++) {
        float fr = sqrt(float(i) / 16.0), an = float(i) * 2.39996;
        vec2 uv = vUv + vec2(cos(an), sin(an)) * fr * r0 * uPx;
        // una muestra solo cuenta si su propio desenfoque llega hasta aquí: lo nítido no se derrama sobre el fondo
        float k = clamp(coc(uv) - fr * r0 + 1.5, 0.0, 1.0);
        acc += texture2D(tDiffuse, uv).rgb * k; w += k;
      }
      gl_FragColor = vec4(acc / w, 1.0);
    }`,
};
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0 }, uOvercast: { value: 0 }, uNight: { value: 0 }, uVig: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarm, uOvercast, uNight, uVig; varying vec2 vUv;
    void main(){
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = clamp(tex.rgb, 0.0, 1.0);
      // curva S muy sutil estilo retransmisión TV (respeta los colores de las libreas)
      float ct = 0.13 + 0.08 * uNight;
      c = mix(c, c * c * (3.0 - 2.0 * c), ct);
      // tinte climático suave: dorados al atardecer, tono frío/pizarra con lluvia o muy nublado
      vec3 tint = vec3(1.0);
      tint = mix(tint, vec3(1.035, 1.005, 0.945), uWarm * 0.85);
      tint = mix(tint, vec3(0.955, 0.985, 1.035), uOvercast * 0.75);
      c *= tint;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      float sat = 1.0 + 0.05 * (1.0 - uOvercast) - 0.09 * uOvercast;
      c = mix(vec3(luma), c, sat);
      // viñeta suave de lente en cámaras de retransmisión (Tele y A bordo)
      vec2 p = vUv * 2.0 - 1.0;
      float vig = 1.0 - uVig * smoothstep(0.45, 1.32, dot(p, p));
      gl_FragColor = vec4(clamp(c * vig, 0.0, 1.0), tex.a);
    }`,
};
let canPost = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float"));
if (!canPost) q = Math.min(q, 1);
let post = null, dofK = 0, dofFocus = 50, aoRadius = 1, vigK = 0;
function makePost() {
  // profundidad en coma flotante (WebGL2): evita los anillos de cuantización en la oclusión ambiental sobre el asfalto
  const depth = new THREE.DepthTexture(2, 2, THREE.FloatType);
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType }));
  const ao = new GTAOPass(scene, camera, 2, 2, { depthTexture: depth });
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ samples: 12, distanceExponent: 1.5, distanceFallOff: 1, thickness: 1, scale: 1.15, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
  const dof = new ShaderPass(DOF_SHADER);
  dof.uniforms.tDepth.value = depth;
  // umbral alto para que solo resplandezcan luces de verdad (sol, focos, pilotos, frenos, chispas) y no pintura blanca;
  // filtramos posibles NaN/Inf del búfer HDR para que un píxel suelto no pueda teñir toda la pantalla en el desenfoque
  const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.18, 0.45, 2.2);
  bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
    "vec4 texel = texture2D( tDiffuse, vUv );",
    "vec4 texel = texture2D( tDiffuse, vUv ); texel.r = (texel.r >= 0.0 && texel.r <= 32.0) ? texel.r : 0.0; texel.g = (texel.g >= 0.0 && texel.g <= 32.0) ? texel.g : 0.0; texel.b = (texel.b >= 0.0 && texel.b <= 32.0) ? texel.b : 0.0;"
  );
  const grade = new ShaderPass(GRADE_SHADER);
  for (const p of [new TexturePass(rt.texture), ao, dof, bloom, new OutputPass(), grade]) composer.addPass(p);
  return { rt, composer, ao, dof, bloom, grade };
}
let lastInfo = { calls: 0, tris: 0, q };
function render() {
  if (ctxLost) return;
  renderer.info.autoReset = false; renderer.info.reset();
  try { render2(); } finally { DBG.info = lastInfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, q }; renderer.info.autoReset = true; }
}
function render2() {
  if (q < 2 || !post) { renderer.render(scene, camera); return; }
  renderer.setRenderTarget(post.rt); renderer.render(scene, camera);
  if (!post.checked) {
    // hay móviles que no saben dibujar en un búfer HDR con suavizado: se nota aquí (no da error) y se sigue sin efectos
    const gl = renderer.getContext();
    post.checked = true;
    if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn("mapa 3D: este dispositivo no admite el búfer HDR; sigue sin postproceso");
      renderer.setRenderTarget(null); canPost = false; q = 1; applyQuality(); renderer.render(scene, camera); return;
    }
  }
  renderer.setRenderTarget(null);
  post.ao.enabled = q >= 3;
  if (post.ao.enabled) post.ao.updateGtaoMaterial({ radius: aoRadius });
  post.dof.enabled = q >= 3 && dofK > 0.02;
  if (post.dof.enabled) {
    const u = post.dof.uniforms, h = post.rt.height;
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uFocus.value = dofFocus; u.uRange.value = Math.max(10, dofFocus * 0.12);
    u.uMax.value = dofK * h * 0.008; u.uPx.value.set(1 / post.rt.width, 1 / h);
  }
  post.composer.render();
}

// ------------------------------------------------------------------ calidad
// 0: sin sombras ni efectos · 1: sombras · 2: + búfer HDR y resplandor · 3: + oclusión ambiental y desenfoque de tele
const Q_PR = [1, 1.5, 2, 2], Q_SHADOW = [1024, 1024, 2048, 4096];
function applyQuality() {
  if (q >= 2 && !canPost) q = 1;
  const box = opt.box, w = box.clientWidth, h = box.clientHeight;
  // con efectos, antes de quitarlos se prueba a dibujar con algo menos de resolución (prScale)
  const pr = Math.min(devicePixelRatio || 1, Q_PR[q]) * (q >= 2 ? prScale : 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  if (q >= 2) {
    try {
      post = post || makePost();
      const pw = Math.max(2, Math.floor(w * pr)), ph = Math.max(2, Math.floor(h * pr));
      post.rt.setSize(pw, ph); post.composer.setSize(pw, ph);
      // GTAO a media resolución: reduce ~4× el coste GPU manteniendo el contacto suave con el filtro bilateral
      post.ao.setSize(Math.max(2, Math.floor(pw * 0.5)), Math.max(2, Math.floor(ph * 0.5)));
    } catch (e) { console.warn("mapa 3D: sin postproceso", e); post = null; q = 1; applyQuality(); return; }
  }
  sun.castShadow = q > 0;
  skyU.uVol.value = q >= 2 ? 1 : 0;
  const useCsm = q >= 3 && isDesktop;
  const ms = useCsm ? 2048 : Q_SHADOW[q];
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (useCsm) {
    if (sunFar.shadow.mapSize.x !== 2048) { sunFar.shadow.mapSize.set(2048, 2048); if (sunFar.shadow.map) { sunFar.shadow.map.dispose(); sunFar.shadow.map = null; } }
  } else {
    sunFar.castShadow = false; sunFar.visible = false;
    if (sunFar.shadow.map) { sunFar.shadow.map.dispose(); sunFar.shadow.map = null; }
  }
  if (world) {
    // sombra de contacto suave siempre visible: en calidad 0 sustituye a la del sol; en el resto ancla fondo y ruedas
    world.blobs.visible = true;
    BLOB_MAT.opacity = q === 0 ? 0.72 : 0.52;
    // las sombras de cientos de árboles cuestan tanto como los árboles: solo en calidad máxima
    for (const tr of world.treeMeshes || []) tr.castShadow = q >= 3;
    for (const r of world.cityRoofs || []) r.visible = q >= 2; // tejados de las manzanas lejanas
  }
  U.uHiQ.value = q >= 2 ? 1 : 0; // interiores detrás de los cristales
}
/** El dispositivo no llega: primero fuera la oclusión y el desenfoque, luego menos resolución, luego sin efectos y al final sin sombras. */
function lowerQuality() {
  if (fixedQ !== undefined) return; // puesta a mano: no se toca
  if (q === 2 && prScale > 0.7) prScale -= 0.15;
  else if (q > 0) { q--; if (q < 2) prScale = 1; }
  else return;
  try { localStorage.setItem(Q_KEY, JSON.stringify({ q, t: Date.now() })); } catch (e) { /* sin memoria */ }
  applyQuality();
}

// ------------------------------------------------------------------ lluvia
const RAIN_N = 1300;
const rain = (() => {
  const seed = new Float32Array(RAIN_N * 6), end = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); seed.set([a, b, c, a, b, c], i * 6); end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(seed, 3));
  g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(100, 100, 100) }, uTime: { value: 0 }, uLum: { value: 1 }, uWind: { value: new THREE.Vector2() }, uTex: U.uCloud, uTexR: U.uTexR },
    vertexShader: `attribute float aEnd; uniform vec3 uCenter, uSize; uniform float uTime, uTexR; uniform vec2 uWind; uniform sampler2D uTex; varying float vA, vEnd, vDist;
      void main(){ vec3 q = fract(position + vec3(uWind.x * uTime * 0.25, -uTime * (0.9 + position.x * 0.5), uWind.y * uTime * 0.25)) - 0.5;
        vec3 p = uCenter + q * uSize; p.y += uSize.y * 0.45; p += aEnd * vec3(uWind.x * 0.4, -1.0, uWind.y * 0.4) * uSize.y * 0.016;
        vA = texture2D(uTex, p.xz / (2.0 * uTexR) + 0.5).r; vEnd = aEnd; vDist = length((modelViewMatrix * vec4(p, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uLum; varying float vA, vEnd, vDist;
      void main(){ float fade = sin(vEnd * 3.14159) * smoothstep(3.0, 14.0, vDist) * (1.0 - smoothstep(140.0, 420.0, vDist));
        gl_FragColor = vec4(vec3(0.78, 0.82, 0.88) * uLum, min(0.22, vA * 0.55) * fade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 20; scene.add(l);
  return l;
})();

// ------------------------------------------------------------------ halo húmedo bajo los focos
// De noche con lluvia, bajo cada uno de los focos más cercanos (los mismos que se reflejan en el agua) se ve el cono de
// luz con las gotas cayendo dentro: un cuadro que mira a la cámara girando solo en vertical, más ancho abajo, que se
// suma a la escena. Solo con calidad 2 o 3 (sale de updateLampRefl).
const SHAFT_N = 16;
const shafts = (() => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("aTop", new THREE.InstancedBufferAttribute(new Float32Array(SHAFT_N * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aTop; uniform vec2 uWind; varying vec2 vQ; varying float vH;
      void main(){
        vec3 top = aTop.xyz; float H = aTop.w, t = 1.0 - position.y; // t: 0 en el foco, 1 en el suelo
        vec3 toCam = cameraPosition - top; vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), toCam + vec3(1e-3, 0.0, 0.0)));
        float w = H * (0.12 + 0.55 * t);
        vec3 p = top + vec3(uWind.x, 0.0, uWind.y) * H * 0.08 * t - vec3(0.0, H * t, 0.0) + r * position.x * w;
        vQ = vec2(position.x * 2.0, t); vH = H;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float uK, uTime; varying vec2 vQ; varying float vH;` + GLSL_NOISE + `
      void main(){
        float x = abs(vQ.x), t = vQ.y;
        float cone = pow(max(0.0, 1.0 - x), 2.2) * (1.0 - smoothstep(0.55, 1.0, t)) * smoothstep(0.0, 0.05, t);
        // gotas: rayas finas que caen, iluminadas solo dentro del cono
        float drops = smoothstep(0.55, 0.9, vn(vec2(vQ.x * 38.0, t * vH * 0.9 - uTime * 14.0)));
        float glow = exp(-t * t * 90.0) * (1.0 - x) * 2.2; // el halo justo bajo el foco
        float a = uK * (cone * (0.16 + 0.6 * drops) + glow);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 16; mesh.visible = false; scene.add(mesh);
  return mesh;
})();

// ------------------------------------------------------------------ cámara a bordo: gotas y suciedad
// Una capa a pantalla completa delante de todo, solo a bordo: con lluvia, gotas que aparecen, se quedan y se escurren
// (a más velocidad, el aire las arrastra hacia fuera); con las vueltas y cada salida de pista, motas de suciedad.
const LENS_MAT = new THREE.ShaderMaterial({
  uniforms: { uRain: { value: 0 }, uDirt: { value: 0 }, uTime: { value: 0 }, uAsp: { value: 1 }, uSpeed: { value: 0 }, uLum: { value: 1 } },
  transparent: true, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform float uRain, uDirt, uTime, uAsp, uSpeed, uLum; varying vec2 vUv;` + GLSL_NOISE + `
    void main(){
      vec2 p = vec2((vUv.x - 0.5) * uAsp, vUv.y - 0.5);
      float a = 0.0; vec3 col = vec3(0.0);
      for (int L = 0; L < 3; L++) {
        float sc = 7.0 + float(L) * 5.0;
        vec2 g = p * sc + float(L) * 17.0, c = floor(g);
        float h = h21(c), life = 2.0 + 3.0 * h21(c + 5.0), ph = fract((uTime + h * 9.0) / life);
        // la gota se escurre hacia abajo y, con velocidad, hacia los lados
        vec2 drift = vec2(sign(p.x + 1e-3) * uSpeed * 0.9, -0.25 - uSpeed * 0.5) * ph * ph;
        vec2 ctr = c + 0.5 + (vec2(h21(c + 1.3), h21(c + 2.7)) - 0.5) * 0.6 + drift;
        if (h21(c + 4.4) < 1.0 - uRain) continue;
        float r = 0.08 + 0.18 * h21(c + 8.1);
        float d = length((g - ctr) * vec2(1.0, 1.0 + uSpeed));
        float m = (1.0 - smoothstep(r * 0.6, r, d)) * (1.0 - smoothstep(0.75, 1.0, ph));
        // el borde oscuro y un brillo arriba a la izquierda: lo que hace que se lea como una gota
        float rim = smoothstep(r * 0.55, r, d), hi = 1.0 - smoothstep(0.0, r * 0.35, length(g - ctr + vec2(r * 0.35, -r * 0.35)));
        col += m * (vec3(0.05) * rim + vec3(0.9) * hi);
        a = max(a, m * (0.25 + 0.4 * rim + 0.6 * hi));
      }
      // suciedad: motas pardas, más hacia los bordes
      float e = smoothstep(0.15, 0.55, length(p * vec2(0.8, 1.2)));
      vec2 du = vUv * vec2(110.0 * uAsp, 110.0);
      float dt = step(1.0 - 0.07 * uDirt * (0.3 + e), h21(floor(du))) * (1.0 - smoothstep(0.2, 0.5, length(fract(du) - 0.5))) * (0.5 + 0.5 * vn(vUv * 9.0));
      col = mix(col, vec3(0.16, 0.12, 0.08), dt * (1.0 - a)); a = max(a, dt * 0.32);
      gl_FragColor = vec4(col * uLum, a);
      #include <colorspace_fragment>
    }`,
});
const lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), LENS_MAT);
lens.frustumCulled = false; lens.renderOrder = 999; lens.visible = false; scene.add(lens);
const dirtOf = new Map(); // suciedad acumulada por coche (0..1)
const TV_CAMS = ["tele", "seguir", "boxes", "grua", "heli"]; // cámaras de tele que se mojan con la lluvia

// ------------------------------------------------------------------ carrera
const visible = (c) => c.loc === "track" || c.loc === "pit";
function followCar() {
  const s = opt.selId() === null ? null : sess.cars.find((c) => c.id === opt.selId());
  if (s && visible(s)) return s;
  return opt.mine().find(visible) || sess.cars.find(visible) || null;
}
/** Escala del coche: muy agrandado de lejos, casi real de cerca. */
function carK(W) { const t = clamp((W - W_REAL) / Math.max(1, T.Wov - W_REAL), 0, 1); return W / (5.6 - 3.3 * t); }

const PIT_A = 0.4, PIT_B = 0.6, WRECK_T = 150;
const fxDur = (fx) => (fx.k === "crash" ? WRECK_T : fx.k === "lock" ? 0.9 : clamp(2.5 + (fx.loss ?? 3) / 0.6, 3, 11));
/** Cuánto se ha ido hacia fuera (0..1) y hacia qué ángulo gira el coche en cada percance. */
function fxShape(p) {
  const t = p.fxTau, D = p.fxDur, back = 1 - sstep(D - 2.4, D, t);
  switch (p.fxK) {
    case "off": return [sstep(0, 1.1, t) * back, 0.2 * Math.sin(t * 2.6) * sstep(0, 0.6, t) * back];
    case "spin": { const e = 1 - (1 - Math.min(1, t / 2.0)) ** 2.2; return [sstep(0.1, 1.5, t) * back * 0.85, -p.fxSide * Math.PI * 2 * e]; }
    case "lock": return [0.12 * Math.sin(Math.PI * Math.min(1, t / D)), 0.04 * Math.sin(t * 9)];
    case "crash": return [sstep(0, 0.9, t), -p.fxSide * (0.7 + 1.1 * p.fxH) * sstep(0, 0.9, t)];
  }
  return [0, 0];
}
/** Hasta dónde se va: escapatoria de grava si la hay, si no la hierba; en los urbanos, rozando el muro. */
function fxLat(p, W) {
  const i = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds)), sg = p.fxSide, r = (sg === T.PS ? T.rP : T.rO)[i], wr = arrAt(T.wr, p.s), k = carK(W);
  if (p.fxK === "crash") return sg * ((T.SH - 0.08) * W * wr + r - 1.3 * k);
  if (T.street) return sg * 0.84 * W * wr;
  if (r > 3) return sg * (1.3 * W * wr + Math.min(r, 18) * 0.45 + 0.6 * k);
  return sg * 1.18 * W * wr;
}
/** ¿Pisa grava (1), hierba (0,5), escapatoria pintada (0,3) o nada? */
function fxGround(p, W, l0) {
  if (T.street) return 0;
  const i = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds)), r = (Math.sign(l0) === T.PS ? T.rP : T.rO)[i], a = Math.abs(l0) / (W * arrAt(T.wr, p.s));
  if (a < 1.05) return 0;
  if (a > 1.28 && r > 3) return getTrackVisual(track.id).runoff.mode === "asfalto" ? 0.3 : 1;
  return 0.5;
}
// ------------------------------------------------------------------ fotos de los momentos clave
// Durante una carrera en 3D se hacen fotos (cámara de tele, de cerca) de los adelantamientos, las paradas de tus pilotos
// y los percances, para el resumen. Cada foto es un fotograma aparte: se dibuja desde su cámara, se copia y se vuelve a
// dibujar la vista normal en el mismo fotograma, así que no se nota.
const MAX_PHOTOS = 10, photos = [], photoQ = [];
let evSeen = 0, photoNow = null;
function scanEvents() {
  if (!(sess.kind === "RACE" || sess.kind === "SPRINT")) return;
  const ev = sess.events;
  for (; evSeen < ev.length; evSeen++) {
    const e = ev[evSeen];
    if (e.carId === undefined || sess.t - e.t > 3) continue;
    const c = sess.cars.find((x) => x.id === e.carId);
    if (!c) continue;
    const clean = e.text.replace(/^[^\p{L}\p{N}]+/u, "");
    if (e.kind === "incident" && /trompo|se sale|toque|tocan|abandona|pinchazo/i.test(e.text)) photoQ.push({ id: c.id, due: e.t + 0.7, text: clean, lap: e.lap, until: e.t + 6 });
    else if (e.kind === "info" && /adelanta a/.test(e.text) && (c.player || /P[1-3]\b/.test(e.text))) photoQ.push({ id: c.id, due: e.t + 0.3, text: clean, lap: e.lap, until: e.t + 4 });
    else if (e.kind === "pit" && /entra a boxes/.test(e.text) && c.player) photoQ.push({ id: c.id, pit: true, due: e.t, text: clean, lap: e.lap, until: e.t + 60 });
  }
}
/** ¿Toca hacer una foto en este fotograma? (la del primero de la cola que ya esté en su momento) */
function pickPhoto() {
  if (photos.length >= MAX_PHOTOS || replay || opt.debug?.view) return null;
  const t = sess.t;
  for (let j = 0; j < photoQ.length; j++) {
    const r = photoQ[j], p = pose.get(r.id);
    if (t > r.until) { photoQ.splice(j--, 1); continue; }
    if (!p || t < r.due) continue;
    if (r.pit && !(p.pf > PIT_A + 0.04 && p.pf < PIT_B - 0.03)) continue; // la parada: con el coche en los gatos
    photoQ.splice(j, 1);
    return r;
  }
  return null;
}
function grabPhoto(r) {
  const cv = renderer.domElement, w = 400, h = 225, out = document.createElement("canvas");
  out.width = w; out.height = h;
  const sc = Math.max(w / cv.width, h / cv.height), sw = w / sc, sh = h / sc;
  out.getContext("2d").drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, 0, 0, w, h);
  try { photos.push({ src: out.toDataURL("image/jpeg", 0.78), text: r.text, lap: r.lap }); } catch (e) { /* lienzo no legible */ }
}

// ------------------------------------------------------------------ repetición
// Se guardan los últimos 15 s de sesión (posición en la pista, lado, giro y percance de cada coche) y, a petición, se
// vuelven a ver a cámara lenta desde una cámara baja al otro lado de la pista. Mientras dura, la sesión está en pausa.
const REC_T = 15, REPLAY_SPEED = 0.35, rec = [];
let replay = null;
const isPaused = () => (replay ? false : opt.paused());
const curSpeed = () => (replay ? REPLAY_SPEED : opt.speed());
const FX_CODE = { spin: 1, off: 2, lock: 3, crash: 4 }, FX_NAME = [null, "spin", "off", "lock", "crash"];
function record(list, W) {
  if (replay || opt.paused() || !list.length) return;
  const t = list[0].tn;
  if (rec.length && t - rec[rec.length - 1].t < 0.05) return;
  const cars = new Map();
  for (const p of list) cars.set(p.c.id, [p.s, p.l0 / (W * arrAt(T.wr, p.s)), p.yaw || 0, FX_CODE[p.fxK] || 0, p.fxTau || 0, p.gnd || 0, p.fxSide || 1, p.fxW || 0, p.fxH || 0, p.yUp ? p.yUp / Math.max(1, W / W_REAL) : 0]);
  rec.push({ t, cars });
  while (rec.length && t - rec[0].t > REC_T) rec.shift();
}
/** El percance más reciente que se puede repetir (trompo, salida o accidente con su grabación completa). */
function lastIncident() {
  let best = null;
  for (const p of pose.values()) if ((p.fxK === "spin" || p.fxK === "off" || p.fxK === "crash") && p.fxTau < 12 && (!best || p.fxTau < best.fxTau)) best = p;
  if (!best || !rec.length || rec[0].t > best.tn - best.fxTau - 1) return null;
  return { id: best.c.id, abrev: best.c.d.abrev };
}
function startReplay(id, onEnd) {
  const p = pose.get(id);
  if (!p || !p.fxK || !rec.length) return false;
  const tInc = p.tn - p.fxTau, t0 = Math.max(rec[0].t, tInc - 2.2), t1 = Math.min(rec[rec.length - 1].t, tInc + (p.fxK === "crash" ? 5 : 6.5));
  // cámara baja al otro lado de la pista, un poco antes de donde empezó el percance
  const f = rec.find((r) => r.t >= tInc) || rec[rec.length - 1], d = f.cars.get(id);
  if (!d) return false;
  const sInc = d[0], side = -(d[6] || 1), q = sample(sInc - 32, mkS()), lat = side * (T.street ? 0.75 : 1.2) * W_REAL * arrAt(T.wr, sInc - 32);
  replay = { id, t0, t1, t: t0, onEnd, cam: new THREE.Vector3(q.x + q.rx * lat, q.y + (T.street ? 4.5 : 2.0), q.z + q.rz * lat) };
  repEl.hidden = false; camSnap = true;
  return true;
}
function stopReplay() {
  if (!replay) return;
  const cb = replay.onEnd; replay = null; repEl.hidden = true; camSnap = true;
  cb && cb();
}
/** Poses de la repetición: interpoladas entre las dos tomas de la grabación que rodean el instante que se ve. */
function replayPoses(dtReal) {
  replay.t += dtReal * REPLAY_SPEED;
  if (replay.t >= replay.t1) { stopReplay(); return null; }
  let i = rec.findIndex((r) => r.t > replay.t); if (i <= 0) i = 1;
  const a = rec[i - 1], b = rec[i] || a, w = b.t > a.t ? clamp((replay.t - a.t) / (b.t - a.t), 0, 1) : 0, list = [];
  for (const [id, A] of a.cars) {
    const Bv = b.cars.get(id) || A, p = pose.get(id);
    if (!p) continue;
    const lerp = (x, y) => x + (y - x) * w, dy = Math.atan2(Math.sin(Bv[2] - A[2]), Math.cos(Bv[2] - A[2]));
    p.s = lerp(A[0], Bv[0]); p.rp = { l: lerp(A[1], Bv[1]), yaw: A[2] + dy * w, gnd: A[5], yUp: lerp(A[9], Bv[9]) };
    p.fxK = FX_NAME[A[3]]; p.fxTau = lerp(A[4], Bv[4]); p.fxSide = A[6]; p.fxW = A[7]; p.fxH = A[8]; p.pf = -1; p.gar = 0; p.cool = -1;
    p.tn = replay.t; p.simDt = dtReal * REPLAY_SPEED;
    list.push(p);
  }
  return list;
}

// posición dibujada de cada coche: interpolada entre los dos últimos pasos de la simulación y llevada a la trazada
const pose = new Map(), _a = mkS(), _b = mkS(); DBG.pose = pose;
function latAt(p, s, W, far) {
  // (la trazada de ahora: en mojado, la simulación la aparta del vértice)
  const line = arrAt(T.line, s) * (sess.lineFactor ? sess.lineFactor(s) : 1) * (1 - 0.45 * far) * (1 - Math.min(1, Math.abs(p.lat) / 0.3) * 0.65);
  // (la calle de boxes arranca de donde iba el coche: la simulación ya le lleva hacia el lado de boxes antes de entrar)
  if (p.c.loc === "pit" || p.c.loc === "lane_out" || p.c.loc === "lane_in" || p.gar || p.lane2) { const r = pitRamp(s); return clamp(line + p.lat, -0.82, 0.82) * (1 - r) + T.PS * (r * PIT_OFF + p.box * 0.95); }
  return clamp(line + p.lat, -0.82, 0.82);
}
function updatePoses(dtReal) {
  if (replay) { const l = replayPoses(dtReal); if (l) return l; }
  for (const p of pose.values()) p.rp = null;
  const alpha = opt.alpha(), tNow = sess.t - (1 - alpha) * sess.dt;
  const list = [];
  for (const c of sess.cars) {
    // un coche que se ha estrellado se queda un rato donde acabó
    const wreck = c.loc === "out" && c.fx?.k === "crash" && tNow - c.fx.t < WRECK_T;
    // en el garaje: los de libres y clasificación que no están en pista y los que han abandonado por avería
    const inGarage = c.loc === "garage" || (c.loc === "out" && !wreck && c.fx?.k !== "crash");
    const lane = c.loc === "lane_out" || c.loc === "lane_in", fin = c.loc === "fin" && isFinite(c.finishT);
    if (!visible(c) && !wreck && !inGarage && !lane && !fin) { pose.delete(c.id); continue; }
    let p = pose.get(c.id);
    if (!p) { p = mkS(); p.c = c; p.lat = 0; p.box = 0; p.acc = 0; p.roll = 0; pose.set(c.id, p); }
    const p0 = prevS.get(c.id), jump = p0 === undefined || Math.abs(c.s - p0) > 40;
    p.s = jump ? c.s : p0 + (c.s - p0) * alpha;
    // lo que se aparta de la trazada: de la simulación (Car.latOff), interpolado como la distancia
    const l0 = prevL.get(c.id), lNow = c.latOff ?? 0;
    p.lat = jump || l0 === undefined ? lNow : l0 + (lNow - l0) * alpha;
    let boxT = 0, pitU = -1;
    p.pf = -1;
    if (c.loc === "pit" && c.pit) {
      // la simulación cruza el pit-lane a velocidad constante: aquí el coche frena, se para delante de su garaje y sale
      const f = clamp((c.pit.t - (1 - alpha) * sess.dt) / c.pit.total, 0, 1), ga = gaV.get(c.team.id) ?? sess.garageAt(c), A = PIT_A, B = PIT_B;
      const g = f < A ? ga * (1 - (1 - f / A) ** 2) : f < B ? ga : ga + (1 - ga) * ((f - B) / (1 - B)) ** 2;
      p.s = c.pit.entryS + c.pit.dist * g;
      boxT = sstep(A - 0.1, A, f) - sstep(B, B + 0.1, f);
      p.pf = f;
      if (world?.realPit) {
        const laneLen2 = T.L - track.pit.entry + track.pit.exit;
        const uGar = world.realPit.uOfS(track.pit.entry + laneLen2 * ga);
        pitU = f < A ? uGar * (1 - (1 - f / A) ** 2) : f < B ? uGar : uGar + (1 - uGar) * ((f - B) / (1 - B)) ** 2;
      }
      // el compuesto que traía: la simulación cambia el juego a mitad de la parada
      if (f < 0.49 && c.tyres) p.oldC = c.tyres.c;
      p.newC = c.e.sets.find((x) => x.id === c.pit.setId)?.c ?? c.tyres?.c;
    } else if (c.tyres) p.oldC = c.tyres.c;
    // garaje y calle de boxes de libres/clasificación: sale de su garaje marcha atrás… de frente, y vuelve a él
    p.gar = 0; p.lane2 = false; p.cool = -1; p.pitU = pitU;
    const laneLen = T.L - track.pit.entry + track.pit.exit, gaC = gaV.get(c.team.id) ?? 0.5;
    if (inGarage) {
      const mates = sess.cars.filter((o) => o.team === c.team), side = mates.indexOf(c) === 0 ? -1 : 1;
      p.s = track.pit.entry + laneLen * gaC + side * Math.min(4.2, gSlot * 0.22); p.gar = 1;
    } else if (fin) {
      // vuelta de honor: baja de ritmo, da la vuelta despacio y entra por el pit-lane hasta su garaje
      const tau = Math.max(0, tNow - c.finishT), line = Math.round(c.s / T.L) * T.L;
      const S = 32 * tau + 45 * (1 - Math.exp(-tau / 1.1)), entry = track.pit.entry;
      p.cool = tau;
      if (S < entry) p.s = line + S;
      else {
        const ls = S - entry, stopAt = laneLen * gaC;
        if (ls < stopAt) { p.s = line + entry + ls; boxT = sstep(stopAt - 25, stopAt, ls); p.lane2 = true; }
        else { const mates = sess.cars.filter((o) => o.team === c.team), side = mates.indexOf(c) === 0 ? -1 : 1; p.s = track.pit.entry + laneLen * gaC + side * Math.min(4.2, gSlot * 0.22); p.gar = sstep(0, 3, ls - stopAt); }
      }
    } else if (lane && c.lane) {
      const f = clamp((c.lane.t - (1 - alpha) * sess.dt) / c.lane.total, 0, 1);
      if (c.loc === "lane_out") {
        p.s = track.pit.entry + laneLen * (gaC + (1 - gaC) * f); boxT = 1 - sstep(0.04, 0.16, f); p.gar = 1 - sstep(0, 0.05, f);
        if (world?.realPit) { const uG = world.realPit.uOfS(track.pit.entry + laneLen * gaC); p.pitU = uG + (1 - uG) * f; }
      } else {
        p.s = track.pit.entry + laneLen * gaC * f; boxT = sstep(0.84, 0.95, f); p.gar = sstep(0.95, 1, f);
        if (world?.realPit) { const uG = world.realPit.uOfS(track.pit.entry + laneLen * gaC); p.pitU = uG * f; }
      }
    }
    // percances (trompo, salida, bloqueo, accidente): solo dibujo, con el reloj de la sesión
    const fx = c.fx, tau = fx ? tNow - fx.t : -1;
    p.fxK = null;
    if (fx && tau >= 0 && tau < fxDur(fx)) {
      if (p.fxRef !== fx) {
        p.fxRef = fx;
        const kap = arrAt(track.curv, c.s);
        p.fxSide = Math.abs(kap) > 0.002 ? (kap > 0 ? 1 : -1) : (c.id & 1 ? 1 : -1);
        p.fxW = hash2(c.id * 3.7, fx.t) > 0.5 ? 0 : 1; p.fxH = hash2(fx.t, c.id);
      }
      p.fxK = fx.k; p.fxTau = tau; p.fxDur = fxDur(fx);
      if (fx.k === "crash") p.s = c.s + 24 * (1 - Math.exp(-tau / 0.45));
    }
    p.boxT = boxT; p.tn = tNow;
    list.push(p);
  }
  const simDt = dtReal * (isPaused() ? 0 : Math.min(8, curSpeed())), k2 = 1 - Math.exp(-simDt / 0.2);
  for (const p of list) {
    const c = p.c;
    p.box += (p.boxT - p.box) * (1 - Math.exp(-dtReal * 6));
    const v0 = prevV.get(c.id), acc = v0 === undefined || c.loc !== "track" ? 0 : (c.v - v0) / sess.dt;
    p.acc += (clamp(acc, -55, 20) - p.acc) * k2;
    const kap = arrAt(track.curv, p.s);
    p.kap = kap;
    p.roll += (clamp((c.v * c.v * kap) / 45, -1, 1) - p.roll) * k2;
    // giro de las ruedas: real hasta unas 2 vueltas por segundo; más deprisa solo parpadearía
    const frozen = (p.fxK === "lock" && p.fxTau < 0.7) || c.loc === "out";
    if (!frozen) p.spin = ((p.spin || 0) + Math.min(c.v / 0.36, 13) * simDt) % (Math.PI * 2);
    p.simDt = simDt;
  }
  return list;
}
/** Coloca cada coche en su trazada con la anchura de pista del fotograma. */
function placeCars(list, W) {
  const far = clamp((W - 10) / Math.max(1, T.Wov * 0.8 - 10), 0, 1);
  for (const p of list) {
    if (world?.realPit && p.pitU >= 0 && p.gar < 0.02 && !p.rp) {
      const rp = world.realPit.sample(p.pitU, W, _a);
      const boxLat = T.PS * p.box * 0.95 * W;
      p.x = rp.x; p.y = rp.y; p.z = rp.z; p.tx = rp.tx; p.tz = rp.tz; p.rx = rp.rx; p.rz = rp.rz;
      p.px = rp.x + rp.rx * boxLat; p.py = rp.y; p.pz = rp.z + rp.rz * boxLat;
      p.fx = rp.tx; p.fy = 0; p.fz = rp.tz; p.sx = rp.rx; p.sz = rp.rz;
      p.yaw = 0; p.gnd = 0; p.yUp = 0; p.bank = 0; p.l0 = boxLat;
      continue;
    }
    sample(p.s, p);
    let l0 = latAt(p, p.s, W, far) * W * arrAt(T.wr, p.s);
    p.yaw = 0; p.gnd = 0;
    p.yUp = 0;
    if (p.fxK) { const [o, yw] = fxShape(p); l0 += (fxLat(p, W) - l0) * o; p.yaw = yw; p.gnd = fxGround(p, W, l0); }
    if (p.fxK === "crash") {
      // la grúa lo levanta, lo pasa por encima de la barrera y lo deja detrás
      const t = p.fxTau, us = Math.max(1, W / W_REAL);
      p.yUp = (sstep(60, 72, t) - sstep(95, 105, t) * 0.85) * 3.6 * us;
      l0 += p.fxSide * sstep(74, 94, t) * 7 * us;
    }
    if (p.gar > 0) {
      // dentro del garaje, con el morro hacia el pit-lane
      const kk = carK(W), lg = T.PS * ((pitRamp(p.s) * PIT_OFF + 1.35) * W * arrAt(T.wr, p.s) + 1.0 * Math.max(1, W / W_REAL) + 2.9 * kk);
      l0 += (lg - l0) * p.gar; p.yaw = -T.PS * Math.PI / 2 * p.gar;
    }
    if (p.rp) { l0 = p.rp.l * W * arrAt(T.wr, p.s); p.yaw = p.rp.yaw; p.gnd = p.rp.gnd; p.yUp = p.rp.yUp * Math.max(1, W / W_REAL); }
    p.l0 = l0;
    const bk = arrAt(T.bank, p.s);
    p.bank = bk;
    const bankY = Math.abs(bk) > 1e-4 ? clamp(l0 / Math.max(1, W / W_REAL), -10, 10) * Math.sin(bk) : 0;
    p.px = p.x + p.rx * l0; p.py = p.y + bankY; p.pz = p.z + p.rz * l0;
    sample(p.s + 2.5, _a); sample(p.s - 2.5, _b);
    const la = latAt(p, p.s + 2.5, W, far) * W * arrAt(T.wr, p.s + 2.5), lb = latAt(p, p.s - 2.5, W, far) * W * arrAt(T.wr, p.s - 2.5);
    let fx = _a.x + _a.rx * la - (_b.x + _b.rx * lb), fy = _a.y - _b.y, fz = _a.z + _a.rz * la - (_b.z + _b.rz * lb);
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const hl = Math.hypot(fx, fz) || 1;
    p.fx = fx; p.fy = fy; p.fz = fz; p.sx = -fz / hl; p.sz = fx / hl;
  }
  return far;
}

// ------------------------------------------------------------------ cámara
let swayT = 0, busyUntil = 0;
let curW = 20, camFrom = null, camT = 1, camSnap = true, yaw = 0, teleIdx = -1;
const cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 36 };
const want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 36 };
const ov = { az: 0, dist: 4000, shift: 0, el: 54 * Math.PI / 180 };
const orb = { dAz: 0, dEl: 0, zoom: 1, active: false };
const _v = new THREE.Vector3(), probe = new THREE.PerspectiveCamera(36, 1, 5, 80000);
function ovPose(az, dist, shift, out, el = ov.el, lookAz = az) {
  const ch = Math.cos(el), sh = Math.sin(el), dx = Math.cos(az), dz = Math.sin(az);
  out.look.set(Math.cos(lookAz) * shift, T.hmean, Math.sin(lookAz) * shift);
  out.pos.set(out.look.x + dx * ch * dist, T.hmean + sh * dist, out.look.z + dz * ch * dist);
}
/** Encaja el circuito entero en el hueco: gira para que el eje largo coincida con el lado largo y busca la distancia justa. */
function fitOverview() {
  if (!T) return;
  const box = opt.box, asp = box.clientWidth / Math.max(1, box.clientHeight);
  ov.az = asp < 1 ? T.axis : T.axis + Math.PI / 2;
  probe.aspect = asp; probe.fov = 36; probe.updateProjectionMatrix();
  const tp = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const bounds = (dist, shift) => {
    ovPose(ov.az, dist, shift, tp);
    probe.position.copy(tp.pos); probe.lookAt(tp.look); probe.updateMatrixWorld(); probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    let x1 = 0, y0 = 9, y1 = -9;
    for (let i = 0; i < T.n; i += 12) { _v.set(T.X[i], T.H[i], T.Z[i]).project(probe); x1 = Math.max(x1, Math.abs(_v.x)); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    return { x1, y0, y1 };
  };
  let dist = T.E * 2, shift = 0;
  for (let it = 0; it < 4; it++) {
    let lo = T.E * 0.2, hi = T.E * 12;
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2, b = bounds(m, shift); if (b.x1 > 0.9 || b.y1 - b.y0 > 1.7) lo = m; else hi = m; }
    dist = hi;
    let a = -T.E, b2 = T.E; const mid = (o) => o.y0 + o.y1 - 0.1, sa = Math.sign(mid(bounds(dist, a)));
    for (let k = 0; k < 22; k++) { const m = (a + b2) / 2; if (Math.sign(mid(bounds(dist, m))) === sa) a = m; else b2 = m; }
    shift = (a + b2) / 2;
  }
  ov.dist = dist; ov.shift = shift;
}
const isAutoTv = () => (opt.autoTv ? !!opt.autoTv() : true);
const tvDir = { carId: null, shot: "tele", reason: "", prio: 0, since: -1e9, holdMs: 7000 };
let camFocusCar = null;
function clearOrbit() { orb.dAz = 0; orb.dEl = 0; orb.zoom = 1; orb.active = false; }
function setCam(m) {
  if (m === camMode) return;
  camMode = m; teleIdx = -1;
  clearOrbit();
  if (m === "tele") { tvDir.carId = null; tvDir.shot = "tele"; tvDir.reason = ""; tvDir.prio = 0; tvDir.since = -1e9; }
  camFrom = { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov }; camT = 0;
}
const _tp = mkS(), _tq = mkS(), _hv = new THREE.Vector3(), heliPos = new THREE.Vector3(), segPos = new THREE.Vector3();
let heliOn = false, segOn = false, fovBoost = 0;
const _up = new THREE.Vector3(0, 1, 0), _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sc = new THREE.Vector3();
/** Distancia (m, de cerca) del eje a la torre de la cámara de tele: en los urbanos, en la acera entre la valla y las casas. */
const tvLat = (i) => (T.street ? (T.SH - 0.08) * W_REAL + T.rO[i] + 2.3 : 1.7 * W_REAL + T.rO[i] + 0.9);
const isPitPose = (p) => !!p && (p.pf >= 0 || p.c.loc === "pit" || p.c.loc === "lane_in" || p.c.loc === "lane_out");
/** Realización automática en Tele (con histéresis): salida en grúa, boxes de tus pilotos, incidentes y batallas. */
function resolveTvShot(now) {
  const isRace = sess.kind === "RACE" || sess.kind === "SPRINT";
  const ord = typeof sess.order === "function" ? sess.order() : [];
  const lead = ord[0] && pose.has(ord[0].id) ? ord[0] : followCar();
  const leadP = lead ? pose.get(lead.id) : null;
  const inStart = isRace && !sess.chequered && (
    (sess.startLights ? sess.startLights() > 0 : false)
    || (sess.t === 0 && sess.flag === "green")
    || !!sess.restartHold
    || (sess.t > 0 && sess.t < 20 && (sess.leaderLap ?? 0) === 0 && !!leadP && leadP.s < Math.min(480, T.L * 0.16))
    || ((sess.launchT ?? 0) > 0 && sess.t - sess.launchT < 14)
  );
  let cand = null;
  if (inStart && lead) {
    cand = { carId: lead.id, shot: "grua", reason: "start", prio: 5, holdMs: 7000 };
  }
  if (!cand) {
    let inc = null, bt = 1e9;
    for (const p of pose.values()) {
      if (!p.fxK || p.fxK === "lock") continue;
      if (p.fxTau < (p.fxK === "crash" ? 8 : 5) && (p.fxTau < bt || (p.fxTau === bt && p.c.player))) { inc = p; bt = p.fxTau; }
    }
    if (inc) cand = { carId: inc.c.id, shot: "tele", reason: "incident", prio: 4, holdMs: 6500 };
  }
  if (!cand) {
    for (const c of opt.mine()) {
      const p = pose.get(c.id);
      if (c.loc !== "garage" && isPitPose(p)) {
        cand = { carId: c.id, shot: "boxes", reason: "pit", prio: 3, holdMs: 6500 };
        break;
      }
    }
  }
  if (!cand && isRace && ord.length > 1 && typeof sess.gapBetween === "function") {
    let bestCar = null, bestScore = -1e9;
    for (let i = 1; i < ord.length; i++) {
      const a = ord[i - 1], b = ord[i];
      if (a.loc !== "track" || b.loc !== "track" || !pose.has(a.id) || !pose.has(b.id)) continue;
      const gap = sess.gapBetween(a, b);
      if (!(gap > 0 && gap < 0.4)) continue;
      const hasMe = a.player || b.player;
      const sc = (hasMe ? 50 : 0) + Math.max(0, 22 - i) + (0.4 - gap) * 15;
      if (sc > bestScore) { bestScore = sc; bestCar = b.player ? b : a.player ? a : b; }
    }
    if (bestCar) cand = { carId: bestCar.id, shot: "tele", reason: "battle", prio: 2, holdMs: 7500 };
  }
  if (!cand) {
    const fc = followCar();
    if (fc) cand = { carId: fc.id, shot: "tele", reason: "follow", prio: 1, holdMs: 7000 };
  }
  const curP = tvDir.carId !== null ? pose.get(tvDir.carId) : null;
  if (opt.paused() && curP) return { car: curP.c, shot: tvDir.shot, cut: false };
  const valid = !!curP && (tvDir.shot !== "boxes" || isPitPose(curP)) && (tvDir.reason !== "start" || inStart);
  let cut = false;
  if (cand && (!valid || cand.prio > tvDir.prio || (now - tvDir.since >= tvDir.holdMs && (cand.carId !== tvDir.carId || cand.shot !== tvDir.shot || cand.reason !== tvDir.reason)))) {
    if (tvDir.carId !== cand.carId || tvDir.shot !== cand.shot) cut = true;
    tvDir.carId = cand.carId;
    tvDir.shot = cand.shot;
    tvDir.reason = cand.reason;
    tvDir.prio = cand.prio;
    tvDir.since = now;
    tvDir.holdMs = cand.holdMs;
    if (cut) teleIdx = -1;
  }
  const fp = tvDir.carId !== null ? pose.get(tvDir.carId) : null;
  return { car: fp ? fp.c : followCar(), shot: fp ? tvDir.shot : "tele", cut };
}
/** En la cámara de tele, como en la realización: si alguien acaba de trompear, salirse o estrellarse, se corta a él. */
function camTarget() {
  if (camMode === "tele") {
    if (isAutoTv()) {
      const fp = tvDir.carId !== null ? pose.get(tvDir.carId) : null;
      if (fp) return fp.c;
    } else {
      return followCar();
    }
    let best = null, bt = 1e9;
    for (const p of pose.values()) if (p.fxK && p.fxK !== "lock" && p.fxTau < (p.fxK === "crash" ? 7 : 4.5) && p.fxTau < bt) { best = p.c; bt = p.fxTau; }
    if (best) return best;
  }
  return followCar();
}
function updateCamera(dt, now) {
  let tgt = followCar(), mode = camMode, cut = false, onboard = false;
  if (mode === "tele") {
    if (isAutoTv() && !replay && !photoNow && !opt.debug?.view) {
      const res = resolveTvShot(now);
      tgt = res.car; mode = res.shot; cut = res.cut;
    } else if (!isAutoTv()) {
      tgt = followCar();
    } else {
      tgt = camTarget();
    }
  } else {
    tgt = camTarget();
  }
  let p = tgt && pose.get(tgt.id);
  if (!p && mode !== "circuito") mode = "circuito";
  camFocusCar = p ? p.c : null;
  // pit-lane: solo con el coche en boxes (entrando, parado o saliendo, o en su garaje); si no, se le sigue de cerca
  const inPits = p && (p.pf >= 0 || p.gar > 0 || p.lane2 || p.c.loc === "lane_out" || p.c.loc === "lane_in");
  if (mode === "boxes" && !inPits) mode = "seguir";
  if (mode !== "heli") heliOn = false;
  if (mode !== "seguir" || orb.active) segOn = false;
  const fast = Math.sqrt(Math.max(1, opt.speed() / 4));
  if (mode === "circuito") {
    if (orb.active) {
      ovPose(ov.az + orb.dAz, ov.dist * 1.03 * orb.zoom, ov.shift, want, clamp(ov.el + orb.dEl, 0.24, 1.43), ov.az);
    } else {
      if (!opt.paused()) swayT += dt; // en pausa la vista se queda quieta
      const sway = reduced ? 0 : 0.11 * Math.sin(swayT * 2 * Math.PI / 48);
      ovPose(ov.az + sway, ov.dist * 1.03, ov.shift, want);
    }
    want.fov = 36;
  } else if (mode === "seguir" && orb.active) {
    sample(p.s + 28, _tp);
    const yt = Math.atan2(_tp.tz, _tp.tx);
    let d = yt - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * (1 - Math.exp(-dt / 0.95));
    const D0 = (T.street ? 32 : 62) * fast, el0 = T.street ? 0.42 : 0.4;
    const D = clamp(D0 * orb.zoom, 10, 220), el = clamp(el0 + orb.dEl, 0.1, 1.38);
    const ang = yaw + orb.dAz, cx = Math.cos(ang), cz = Math.sin(ang);
    want.look.set(p.px + p.fx * 4, p.py + 1, p.pz + p.fz * 4);
    want.pos.set(want.look.x - cx * D * Math.cos(el), want.look.y + D * Math.sin(el), want.look.z - cz * D * Math.cos(el));
    want.fov = T.street ? 40 : 38;
  } else if (mode === "seguir" && T.street) {
    // en urbanos, la cámara sigue el corredor abierto de la calzada (y se agacha suavemente dentro del túnel de Mónaco)
    const tun = getTrackVisual(track.id).tunnel;
    const inTun = tun && p.s >= tun.s0 - 14 && p.s <= tun.s1 + 14;
    sample(p.s - (inTun ? 14 : 26 * fast), _tq);
    sample(p.s + 18, _tp);
    const lat = clamp(p.l0, -W_REAL * 0.6, W_REAL * 0.6) * 0.4;
    const camH = inTun ? Math.min(3.8, (tun.height ?? 6.4) - 2.2) : 13.5 * fast;
    _hv.set(_tq.x + _tq.rx * lat, _tq.y + camH, _tq.z + _tq.rz * lat);
    if (!segOn || camSnap || (camT < 0.02 && camFrom)) { segPos.copy(_hv); segOn = true; }
    else segPos.lerp(_hv, 1 - Math.exp(-dt / 0.35));
    const h = Math.hypot(_tp.x - p.px, _tp.z - p.pz) || 1;
    want.pos.copy(segPos);
    want.look.set(p.px + ((_tp.x - p.px) / h) * 8, p.py + 0.9, p.pz + ((_tp.z - p.pz) / h) * 8);
    want.fov = inTun ? 48 : 40;
  } else if (mode === "seguir") {
    sample(p.s + 28, _tp);
    const yt = Math.atan2(_tp.tz, _tp.tx);
    let d = yt - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (camT < 0.02 && camFrom) yaw = yt; else yaw += d * (1 - Math.exp(-dt / 0.95));
    const D = 62 * fast, el = 0.4, cx = Math.cos(yaw), cz = Math.sin(yaw);
    want.look.set(p.px + cx * 12, p.py + 1, p.pz + cz * 12);
    want.pos.set(p.px - cx * D * Math.cos(el), p.py + D * Math.sin(el), p.pz - cz * D * Math.cos(el));
    want.fov = 38;
  } else if (mode === "abordo") {
    // a bordo: sobre la toma de aire, solidaria con el coche (cabecea y se inclina con él) y mirando a donde va
    const k = carK(curW);
    const ux = -p.sz * p.fy, uy = p.sz * p.fx - p.sx * p.fz, uz = p.sx * p.fy;
    const th = clamp(p.acc / 55, -1, 0.4) * 0.05, ph = p.roll * 0.04;
    const hx = ux - p.fx * th + p.sx * ph, hy = uy - p.fy * th, hz = uz - p.fz * th + p.sz * ph;
    want.pos.set(p.px + p.fx * camPos[0] * k + hx * camPos[1] * k, p.py + hy * camPos[1] * k + p.fy * camPos[0] * k, p.pz + p.fz * camPos[0] * k + hz * camPos[1] * k);
    sample(p.s + 16, _tp);
    const la = latAt(p, p.s + 16, curW, 0) * curW * arrAt(T.wr, p.s + 16);
    const lx = p.px + p.fx * 14 * k + hx * 0.45 * k, ly = p.py + p.fy * 14 * k + hy * 0.45 * k, lz = p.pz + p.fz * 14 * k + hz * 0.45 * k;
    want.look.set(lx + (_tp.x + _tp.rx * la - lx) * 0.15, ly + (_tp.y + 0.5 - ly) * 0.15, lz + (_tp.z + _tp.rz * la - lz) * 0.15);
    want.fov = 72;
    onboard = true;
  } else if (mode === "heli") {
    // helicóptero: alto, detrás y a un lado, que deriva despacio alrededor del coche y se acerca con suavidad
    const drift = reduced ? 0.6 : 0.6 + 0.35 * Math.sin(now / 9000);
    const hl = Math.hypot(p.fx, p.fz) || 1, ax = p.fx / hl, az = p.fz / hl, H = 120 + 50 * (0.5 + 0.5 * Math.sin(now / 13000));
    const back = 110 * Math.cos(drift), side = 110 * Math.sin(drift);
    _hv.set(p.px - ax * back - az * side, p.py + H, p.pz - az * back + ax * side);
    if (!heliOn) { heliPos.copy(_hv); heliOn = true; } else heliPos.lerp(_hv, 1 - Math.exp(-dt / 1.6));
    want.pos.copy(heliPos); want.look.set(p.px + ax * 6, p.py, p.pz + az * 6);
    want.fov = clamp(2 * Math.atan(22 * fast / want.pos.distanceTo(want.look)) * 180 / Math.PI, 6, 30);
  } else if (mode === "boxes") {
    // pit-lane: fija en el muro, frente al garaje de su equipo, mirando al coche
    const laneLen = T.L - track.pit.entry + track.pit.exit, gs = track.pit.entry + laneLen * (gaV.get(p.c.team.id) ?? 0.5);
    sample(gs - 14, _tq);
    const wl = (1.0 + (PIT_OFF - 0.55 - 1.0) * 0.5) * curW * arrAt(T.wr, gs) * T.PS;
    want.pos.set(_tq.x + _tq.rx * wl, _tq.y + 2.6, _tq.z + _tq.rz * wl);
    want.look.set(p.px, p.py + 0.7, p.pz);
    want.fov = clamp(2 * Math.atan(5 / want.pos.distanceTo(want.look)) * 180 / Math.PI, 18, 55);
  } else if (mode === "trasera") {
    // alerón trasero: en la deriva, mirando hacia atrás (se ve al que viene detrás)
    const k = carK(curW);
    const ux = -p.sz * p.fy, uy = p.sz * p.fx - p.sx * p.fz, uz = p.sx * p.fy;
    want.pos.set(p.px - p.fx * 1.7 * k + ux * 1.4 * k, p.py + uy * 1.4 * k, p.pz - p.fz * 1.7 * k + uz * 1.4 * k);
    sample(p.s - 40, _tp);
    want.look.set(_tp.x + _tp.rx * p.l0, _tp.y + 1.6 * k, _tp.z + _tp.rz * p.l0);
    want.fov = 58;
    onboard = true;
  } else if (mode === "grua") {
    // grúa de meta: elevada y despejada sobre el borde de la recta principal; se eleva si el coche está en colinas lejanas para no chocar con boxes ni laderas
    const ds = mod(p.s + T.L / 2, T.L) - T.L / 2; // dónde está el coche respecto a la línea (m)
    sample(clamp(ds, -70, 110) * 0.48, _tq);
    const out = -T.PS * (T.SH * curW + 2.5);
    const farK = sstep(180, 420, Math.abs(ds));
    const hCrane = Math.max(22, (p.py - _tq.y) + 28 * farK + 18, 22 + 34 * farK);
    want.pos.set(_tq.x + _tq.rx * out, _tq.y + hCrane, _tq.z + _tq.rz * out);
    want.look.set(p.px, p.py + 0.8, p.pz);
    want.fov = clamp(2 * Math.atan(13 * fast / want.pos.distanceTo(want.look)) * 180 / Math.PI, 6, 48);
  } else {
    // cámaras fijas en torres junto a la pista, como la realización de la tele: giran, hacen zoom y se corta de una a otra
    const spacing = 360 * Math.max(1, opt.speed() / 2), nCam = Math.max(3, Math.round(T.L / spacing)), sp = T.L / nCam;
    const idx = Math.floor(mod(p.s + sp * 0.6, T.L) / sp) % nCam;
    if (idx !== teleIdx) { teleIdx = idx; cut = true; }
    const cs = idx * sp, ci = Math.min(T.n - 1, Math.floor(cs / T.ds));
    sample(cs, _tq);
    // siempre en el lado contrario a los boxes
    const out = -T.PS * tvLat(ci);
    want.pos.set(_tq.x + _tq.rx * out, _tq.y + 9 + sp * 0.012, _tq.z + _tq.rz * out);
    // adelanto suave según velocidad para que el coche seguido quede centrado en curvas rápidas y no pegado al borde
    const lead = clamp((p.c.v || 0) * 0.085, 0, 7.5);
    want.look.set(p.px + p.fx * lead, p.py + 1.0, p.pz + p.fz * lead);
    const dist = want.pos.distanceTo(want.look);
    want.fov = clamp(2 * Math.atan(15.5 * fast / dist) * 180 / Math.PI, 6.5, 46);
  }
  // sensación de velocidad: ligero aumento dinámico de FOV y micro-vibración en cámaras cercanas (A bordo, Trasera y Seguir)
  if (p && !reduced && !opt.paused() && !opt.debug?.view && !photoNow && !replay && opt.speed() <= 2) {
    const vNorm = clamp((p.c.v || 0) / 88, 0, 1.15);
    const spdV = vNorm * vNorm;
    const brkV = clamp((-p.acc - 11) / 30, 0, 1);
    const iK = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds));
    const edgeFrac = Math.abs(p.l0) / Math.max(1, curW * arrAt(T.wr, p.s));
    const onKerb = Math.abs(track.curv[iK]) > 0.009 && edgeFrac > 0.74 ? clamp((edgeFrac - 0.74) / 0.18, 0, 1) : 0;
    const offTrk = p.gnd > 0 ? clamp(p.gnd, 0, 1) : 0;
    const fovWant = mode === "abordo" ? 5.5 * spdV : mode === "trasera" ? 4.0 * spdV : mode === "seguir" && !orb.active ? 3.0 * spdV : 0;
    fovBoost += (fovWant - fovBoost) * (cut || camSnap ? 1 : 1 - Math.exp(-dt / 0.35));
    want.fov += fovBoost;
    const tS = now * 0.001, kc = carK(curW);
    const shakeScale = onboard ? 1.0 : mode === "seguir" && !orb.active ? 0.28 : 0;
    const amp = shakeScale * (0.0045 * spdV + 0.0085 * brkV + 0.014 * onKerb + 0.022 * offTrk) * kc;
    if (amp > 0.0005) {
      const kRumble = onKerb + offTrk > 0.01 ? Math.sin(p.s * 14.5) * (0.011 * onKerb + 0.018 * offTrk) * kc * shakeScale : 0;
      const jY = (Math.sin(tS * 47.3) * 0.55 + Math.sin(tS * 83.1) * 0.45) * amp + kRumble;
      const jS = (Math.sin(tS * 37.7 + 1.3) * 0.6 + Math.sin(tS * 67.9) * 0.4) * amp * 0.75;
      want.pos.x += p.sx * jS; want.pos.y += jY; want.pos.z += p.sz * jS;
      want.look.x += p.sx * jS * 0.35; want.look.y += jY * 0.35; want.look.z += p.sz * jS * 0.35;
    }
  } else {
    fovBoost += (0 - fovBoost) * (cut || camSnap ? 1 : 1 - Math.exp(-dt / 0.3));
    if (Math.abs(fovBoost) > 0.01) want.fov += fovBoost;
  }
  if (photoNow) {
    // foto: cámara de tele cercana, tres cuartos por detrás y un poco por encima
    const pp = pose.get(photoNow.id);
    if (pp) {
      const sd = photoNow.pit ? -T.PS : (pp.l0 > 0 ? -1 : 1), hl = Math.hypot(pp.fx, pp.fz) || 1, ax = pp.fx / hl, az = pp.fz / hl; // del lado del centro de la pista
      want.pos.set(pp.px - ax * 11 + pp.sx * sd * 6, pp.py + 3.6, pp.pz - az * 11 + pp.sz * sd * 6);
      want.look.set(pp.px + ax * 1.5, pp.py + 0.6, pp.pz + az * 1.5); want.fov = 34; onboard = false;
      cur.pos.copy(want.pos); cur.look.copy(want.look); cur.fov = want.fov; camFrom = null; camT = 1; camSnap = true;
    }
  }
  if (replay) {
    // repetición: cámara fija y baja, que sigue al coche con el zoom
    const rp = pose.get(replay.id);
    if (rp) { want.pos.copy(replay.cam); want.look.set(rp.px, rp.py + 0.8, rp.pz); want.fov = clamp(2 * Math.atan(8 / want.pos.distanceTo(want.look)) * 180 / Math.PI, 8, 50); onboard = false; }
    cur.pos.copy(want.pos); cur.look.copy(want.look); cur.fov = want.fov; camFrom = null; camT = 1;
  }
  if (opt.debug?.view) { // solo para pruebas: cámara puesta a mano, relativa al coche seguido
    const v = opt.debug.view, b = v.s === undefined ? p || { px: 0, py: 0, pz: 0, fx: 1, fz: 0, sx: 0, sz: 1 }
      : (() => { const q = sample(v.s, mkS()); return { px: q.x, py: q.y, pz: q.z, fx: q.tx, fz: q.tz, sx: q.rx, sz: q.rz }; })();
    const W2 = (a) => [b.px + b.fx * a[0] + b.sx * a[2], b.py + a[1], b.pz + b.fz * a[0] + b.sz * a[2]];
    want.pos.set(...W2(v.pos)); want.look.set(...W2(v.look)); want.fov = v.fov || 30; camSnap = true;
  }
  if (cut || camSnap) { camFrom = null; camT = 1; }
  if (camFrom) {
    camT = Math.min(1, camT + dt / 0.9);
    const e = camT * camT * (3 - 2 * camT);
    cur.pos.lerpVectors(camFrom.pos, want.pos, e); cur.look.lerpVectors(camFrom.look, want.look, e); cur.fov = camFrom.fov + (want.fov - camFrom.fov) * e;
    if (camT >= 1) camFrom = null;
  } else if ((mode === "tele" || mode === "grua" || mode === "boxes") && !cut && !camSnap) {
    cur.pos.copy(want.pos); cur.look.lerp(want.look, 1 - Math.exp(-dt / 0.08)); cur.fov += (want.fov - cur.fov) * (1 - Math.exp(-dt / 0.3));
  } else { cur.pos.copy(want.pos); cur.look.copy(want.look); cur.fov = want.fov; }
  camera.position.copy(cur.pos); camera.fov = cur.fov;
  if (onboard && p && Math.abs(p.bank || 0) > 0.005 && !opt.debug?.view) {
    const camTilt = p.bank * 0.55;
    camera.up.set(-p.sx * Math.sin(camTilt), Math.cos(camTilt), -p.sz * Math.sin(camTilt));
  } else {
    camera.up.set(0, 1, 0);
  }
  const dist = cur.pos.distanceTo(cur.look);
  camera.near = onboard ? 0.25 : Math.max(0.35, dist * 0.04);
  camera.far = Math.max(dist * 6, Math.min(18000, T.E * 4.5));
  camera.updateProjectionMatrix(); camera.lookAt(cur.look);
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  sky.position.copy(cur.pos); sky.scale.setScalar(camera.far * 0.5); skyU.uCam.value.set(cur.pos.x, cur.pos.z);
  // escala de maqueta: de lejos la pista y los coches engordan para leerse; de cerca, tamaño real
  const halfH = dist * Math.tan(cur.fov * Math.PI / 360);
  const wT = onboard || replay ? W_REAL : clamp(halfH * 0.0195, W_REAL, T.Wov);
  curW = cut || camSnap ? wT : curW + (wT - curW) * (1 - Math.exp(-dt / 0.2));
  // calima atmosférica exponencial: despega los planos lejanos según clima y lluvia; en vista general se abre para leer todo
  const wxHaze = 1 + 0.55 * (lightInit ? smoothCloud : clamp(sess.weather.cloud ?? 0, 0, 1)) + 0.8 * clamp((lightInit ? smoothRain : rainHere) / 2, 0, 1);
  const bioHaze = getTrackVisual(track.id).biome === "alpino" ? 1.15 : 1.0;
  fog.density = 0.00046 * wxHaze * bioHaze * Math.min(1, 460 / Math.max(1, dist));
  // el sol ilumina (y da sombra) alrededor de lo que mira la cámara
  // el tamaño va a saltos y el centro se mueve de téxel en téxel: así el borde de las sombras no tiembla al mover la cámara
  // con el sol bajo (atardecer) las sombras son largas: la caja de sombras se agranda para que no se corten
  // en calidad 3 de escritorio (fuera de vista general), 2 cascadas: cerca muy nítida (sun) + media/lejana amplia (sunFar)
  const lowSun = 1 + 0.9 * (1 - sstep(0.18, 0.55, sunDir.y));
  csmActive = q >= 3 && isDesktop && mode !== "circuito";
  const S0 = (csmActive ? (onboard ? 42 : clamp(halfH * 1.15, 24, 130)) : (onboard ? 75 : clamp(halfH * 2.1, 40, T.E * 0.9))) * lowSun;
  const S = Math.pow(2, Math.ceil(Math.log2(S0) * 3) / 3), sc = sun.shadow.camera;
  const texel = (2 * S) / sun.shadow.mapSize.x;
  _sr.crossVectors(_up, sunDir).normalize(); _su.crossVectors(sunDir, _sr);
  _sc.copy(sunDir).multiplyScalar(cur.look.dot(sunDir)).addScaledVector(_sr, Math.round(cur.look.dot(_sr) / texel) * texel).addScaledVector(_su, Math.round(cur.look.dot(_su) / texel) * texel);
  sun.target.position.copy(_sc); sun.position.copy(_sc).addScaledVector(sunDir, S * 3.2);
  sc.left = sc.bottom = -S; sc.right = sc.top = S; sc.near = 1; sc.far = S * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = texel * 0.85;
  if (csmActive) {
    const SF0 = clamp(halfH * 3.4, 180, T.E * 1.1) * lowSun;
    const SF = Math.pow(2, Math.ceil(Math.log2(SF0) * 3) / 3), scF = sunFar.shadow.camera;
    const texelF = (2 * SF) / sunFar.shadow.mapSize.x;
    _sc.copy(sunDir).multiplyScalar(cur.look.dot(sunDir)).addScaledVector(_sr, Math.round(cur.look.dot(_sr) / texelF) * texelF).addScaledVector(_su, Math.round(cur.look.dot(_su) / texelF) * texelF);
    sunFar.target.position.copy(_sc); sunFar.position.copy(_sc).addScaledVector(sunDir, SF * 3.2);
    scF.left = scF.bottom = -SF; scF.right = scF.top = SF; scF.near = 1; scF.far = SF * 8; scF.updateProjectionMatrix();
    sunFar.shadow.normalBias = texelF * 0.95;
  }
  // postproceso: oclusión ambiental pegada a los contactos (sin halos enormes); el desenfoque, solo en tele
  aoRadius = clamp(halfH * 0.055, 0.45, 28);
  dofFocus = dist; dofK += ((mode === "tele" ? 1 : 0) - dofK) * (cut || camSnap ? 1 : 1 - Math.exp(-dt / 0.4));
  const vigTgt = mode === "tele" || mode === "abordo" || mode === "trasera" ? 0.24 : mode === "circuito" ? 0.0 : 0.10;
  vigK += (vigTgt - vigK) * (cut || camSnap ? 1 : 1 - Math.exp(-dt / 0.4));
  if (post?.grade) post.grade.uniforms.uVig.value = vigK;
  camSnap = false;
  return halfH;
}

// ------------------------------------------------------------------ dibujo 3D
const _ws = new THREE.Vector3(), mS = new THREE.Matrix4();
const m4 = new THREE.Matrix4(), mL = new THREE.Matrix4(), mW = new THREE.Matrix4(), _col = new THREE.Color();
const WHEELS = [[1.8, 0.83, 1, 0.92], [1.8, -0.83, 1, 0.92], [-1.7, 0.82, 0, 1.18], [-1.7, -0.82, 0, 1.18]]; // x, z, ¿gira?, ancho
const mG = new THREE.Matrix4(), _e = new THREE.Vector3();
/** Humo de goma, polvo de la grava o de la hierba y la nube de un accidente, según el percance. */
function emitFx(p, c, m, k, fx, fz) {
  const dt = p.simDt, t = p.fxTau, R = Math.random, vf = c.v * 0.12;
  const at = (lx, ly, lz) => _e.set(lx, ly, lz).applyMatrix4(m);
  const burst = (rate, fn) => { const x = rate * dt, nn = Math.min(14, Math.floor(x) + (R() < x % 1 ? 1 : 0)); for (let j = 0; j < nn; j++) fn(); };
  if (p.fxK === "lock" && t < 0.7) { const wd = WHEELS[p.fxW]; burst(80, () => { const q = at(wd[0], 0.1, wd[1]); emit(q.x, q.y, q.z, fx * vf + R() - 0.5, 0.4 + R() * 0.6, fz * vf + R() - 0.5, 0.35 * k, 2.2 * k, 1.3, 0.85, 0.86, 0.88, 0.5, 0.5); }); }
  if (p.fxK === "spin" && t < 2.1) for (const w of [2, 3]) { const wd = WHEELS[w]; burst(55, () => { const q = at(wd[0], 0.1, wd[1]); emit(q.x, q.y, q.z, R() - 0.5, 0.5 + R() * 0.8, R() - 0.5, 0.6 * k, 4 * k, 2.4, 0.85, 0.86, 0.88, 0.55, 0.45); }); }
  if ((p.fxK === "off" || p.fxK === "spin") && p.gnd > 0 && c.v > 4) {
    const g = p.gnd, cl = g >= 1 ? [0.62, 0.5, 0.32] : [0.32, 0.3, 0.2];
    for (const w of [2, 3]) { const wd = WHEELS[w]; burst(50 * g, () => { const q = at(wd[0], 0.05, wd[1]); emit(q.x, q.y, q.z, (R() - 0.5) * 2.5, 1 + R() * 1.5, (R() - 0.5) * 2.5, 0.7 * k, 4.5 * k, 2.6, cl[0], cl[1], cl[2], 0.6 * g, 0.1); }); }
  }
  if (p.fxK === "crash") {
    if (t < 1.4) burst(140, () => { const q = at((R() - 0.5) * 4, 0.3, (R() - 0.5) * 2.5); const d = R() < 0.5; emit(q.x, q.y, q.z, (R() - 0.5) * 5, 1 + R() * 3, (R() - 0.5) * 5, 0.8 * k, 5.5 * k, 3, d ? 0.6 : 0.5, d ? 0.5 : 0.5, d ? 0.34 : 0.52, 0.55, d ? 0.05 : 0.5); });
    else if (t < 30) burst(3, () => { const q = at(-1.6, 0.6, 0); emit(q.x, q.y, q.z, R() - 0.5, 0.6, R() - 0.5, 0.8 * k, 5 * k, 4, 0.38, 0.38, 0.4, 0.35, 0.7); });
  }
}
/** Después de un accidente: trozos de coche en la pista, comisarios que llegan andando y la grúa que se lo lleva. */
const cs = { d: 0, m: 0, c: 0, b: 0 }, _cq = mkS(), _bA = new THREE.Vector3(), _bB = new THREE.Vector3(), _bD = new THREE.Vector3(), _bQ = new THREE.Quaternion(), _bZ = new THREE.Vector3(0, 0, 1);
function crashScene(p, c, k, W) {
  const t = p.fxTau, us = Math.max(1, W / W_REAL), sg = p.fxSide, s0 = c.s, wr = arrAt(T.wr, s0);
  const { debris, marsh, crane } = world;
  // restos: siete trozos donde golpeó, repartidos por la pista
  if (t > 0.3) for (let j = 0; j < 7; j++) {
    const h1 = hash2(c.id * 7.1 + j, j * 3.3), h2 = hash2(j * 1.7, c.id + 0.5), ss = s0 + 2 + h1 * 30, la = (sg * 0.3 + (h2 - 0.5) * 1.1) * W * arrAt(T.wr, ss);
    sample(ss, _cq);
    const a = h1 * 6.28, ca = Math.cos(a) * k, sa = Math.sin(a) * k, sc = 0.6 + h2;
    m4.set(ca * sc, 0, -sa * sc, _cq.x + _cq.rx * la, 0, k, 0, _cq.y + 0.05, sa * sc, 0, ca * sc, _cq.z + _cq.rz * la, 0, 0, 0, 1);
    debris.setMatrixAt(cs.d, m4); debris.setColorAt(cs.d++, _c3.set(j % 3 ? 0x1b1c20 : c.team.color));
  }
  sample(p.s, _cq);
  const h = Math.hypot(_cq.tx, _cq.tz) || 1, tx = _cq.tx / h, tz = _cq.tz / h, rx = _cq.rx * sg, rz = _cq.rz * sg;
  const barrier = (T.SH - 0.08) * W * wr + (sg === T.PS ? T.rP : T.rO)[Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds))];
  const at = (lat, along, y, yaw, mesh, idx, scl) => {
    const L = sg * lat, cy = Math.cos(yaw), sy = Math.sin(yaw);
    // ejes: x a lo largo de la pista, z hacia fuera (lado del accidente)
    const ax = tx * cy - rx * sy, az = tz * cy - rz * sy, bx = rx * cy + tx * sy, bz = rz * cy + tz * sy;
    m4.set(ax * scl, 0, bx * scl, _cq.x + _cq.rx * L + tx * along, 0, scl, 0, _cq.y + y, az * scl, 0, bz * scl, _cq.z + _cq.rz * L + tz * along, 0, 0, 0, 1);
    mesh.setMatrixAt(idx, m4);
  };
  // comisarios: saltan la barrera a los 6 s y se quedan junto al coche
  if (t > 6) for (let j = 0; j < 3; j++) {
    const e = sstep(6, 13, t), lat = barrier + 2 * us - e * (2 * us + 2.2 * k) + (j - 1) * 0.3 * k;
    at(lat, (j - 1) * 2.4 * k, 0, e < 1 ? Math.PI / 2 : Math.PI / 2 + (j - 1) * 0.6, marsh, cs.m, k);
    marsh.setColorAt(cs.m++, _c3.set(0xff6a00));
  }
  // grúa detrás de la barrera; la pluma va del pivote a un punto sobre el coche y el cable baja hasta él
  if (t > 25) {
    at(barrier + 4.5 * us, 0, 0, 0, crane, cs.c++, us);
    const L = sg * (barrier + 4.5 * us);
    _bA.set(_cq.x + _cq.rx * L, _cq.y + 2.6 * us, _cq.z + _cq.rz * L);                        // pivote
    const carTop = p.py + (p.yUp || 0) + 1.2 * k;
    _bB.set(p.px, Math.max(carTop + 3.2 * us, _bA.y + 2 * us), p.pz);                            // punta, sobre el coche
    const beam = (A, Bp, th, hex) => {
      _bD.subVectors(Bp, A); const len = _bD.length() || 1;
      _bQ.setFromUnitVectors(_bZ, _bD.divideScalar(len));
      m4.compose(A, _bQ, _ws.set(th, th, len)); world.beams.setMatrixAt(cs.b, m4); world.beams.setColorAt(cs.b++, _c3.set(hex));
    };
    beam(_bA, _bB, 0.5 * us, 0xf2c00d);
    beam(_bB, _ws.set(p.px, carTop, p.pz).clone(), 0.06 * us, 0x111111);
  }
}
/** Semáforo de salida: lo lleva la simulación (se encienden de uno en uno y la carrera arranca al apagarse). Rojas con bandera roja. */
function updateStartLights() {
  if (!startL) return;
  const lit = sess.flag === "red" ? 5 : sess.startLights ? sess.startLights() : 0;
  for (let j = 0; j < 10; j++) startL.setColorAt(j, _c3.setRGB(...(Math.floor(j / 2) < lit ? [1.8, 0, 0] : [0.03, 0.01, 0.01])));
  startL.instanceColor.needsUpdate = true;
}
/** Huellas que deja cada rueda: goma al bloquear o trompear, tierra en la hierba y grava al volver al asfalto. */
const _mw = new THREE.Vector3();
function trackMarks(p, c, m, k) {
  const W = curW, wr = arrAt(T.wr, p.s), t = p.tn;
  if (p.gnd >= 1) p.gravT = t;
  const kinds = [-1, -1, -1, -1];
  if (p.fxK === "lock" && p.fxTau < 0.7) kinds[p.fxW] = 0;
  if (p.fxK === "spin" && p.fxTau < 2.0) kinds[2] = kinds[3] = 0;
  if (p.gnd > 0 && p.gnd < 1) kinds[2] = kinds[3] = 2;
  if (p.gnd === 0 && p.gravT !== undefined && t - p.gravT < 2.5 && t >= p.gravT) kinds[0] = kinds[1] = kinds[2] = kinds[3] = 1;
  p.mk = p.mk || [null, null, null, null];
  for (let w = 0; w < 4; w++) {
    if (kinds[w] < 0 || c.v < 2) { p.mk[w] = null; continue; }
    const wd = WHEELS[w];
    _mw.set(wd[0], 0, wd[1]).applyMatrix4(m);
    const dx = _mw.x - p.px, dz = _mw.z - p.pz, h = Math.hypot(p.tx, p.tz) || 1;
    const sN = p.s + (dx * p.tx + dz * p.tz) / h, lN = (p.l0 + dx * p.rx + dz * p.rz) / (W * wr);
    const q = p.mk[w];
    if (q && q.kind === kinds[w]) {
      const ds = Math.abs(sN - q.s);
      if (ds < 0.5 * k) continue;
      if (ds < 30 * k) addMark(q.s, q.l, sN, lN + (kinds[w] === 1 ? (Math.random() - 0.5) * 0.04 : 0), kinds[w] === 1 ? 0.55 : 0.3, t, kinds[w]);
    }
    p.mk[w] = { s: sN, l: lN, kind: kinds[w] };
  }
}
let mkW = 0, mkT = -1e9;
function updateMarks(now, W, k) {
  const M = marks;
  if (!M.n || (!M.dirty && Math.abs(W - mkW) < W * 0.02 && now - mkT < 600)) return;
  M.dirty = false; mkW = W; mkT = now;
  const g = world.markMesh.geometry, A = g.attributes.aA.array, Bb = g.attributes.aB.array, C = g.attributes.aC.array, tn = sess.t;
  let j = 0;
  for (let i = 0; i < M.n; i++) {
    const life = MK_LIFE[M.k[i]], f = (tn - M.t[i]) / life;
    if (f >= 1 || f < -0.01) continue;
    sample(M.s0[i], _sa); const la = M.l0[i] * W * arrAt(T.wr, M.s0[i]);
    sample(M.s1[i], _sb); const lb = M.l1[i] * W * arrAt(T.wr, M.s1[i]);
    const cl = MK_COL[M.k[i]];
    A.set([_sa.x + _sa.rx * la, _sa.y, _sa.z + _sa.rz * la, M.w[i] * k], j * 4);
    Bb.set([_sb.x + _sb.rx * lb, _sb.y, _sb.z + _sb.rz * lb, 0], j * 4);
    C.set([cl[0], cl[1], cl[2], cl[3] * (1 - f) * (1 - f)], j * 4);
    j++;
  }
  g.instanceCount = j; DBG.marks = j;
  g.attributes.aA.needsUpdate = g.attributes.aB.needsUpdate = g.attributes.aC.needsUpdate = true;
}
/** Los 16 focos más cerca de lo que se mira, para sus reflejos en el asfalto mojado (de noche o con lluvia en urbanos). */
const _lp = mkS(), _lv = new THREE.Vector3();
function updateLampRefl(W) {
  const u = U.uLamps.value;
  let wetMax = 0; for (let j = 0; j < sess.water.length; j += 3) wetMax = Math.max(wetMax, sess.water[j], sess.waterOff[j]);
  const lampK = T.street && wetMax > 0.03 ? clamp((1 - dayK) * 0.9 + clamp(rainHere / 4, 0, 0.35), 0, 0.45) : 0;
  U.uLampK.value = Math.max(U.uFlood.value, lampK);
  // halo húmedo: con lluvia de noche (o al anochecer) y focos encendidos
  const wetGlow = q >= 2 && !reduced ? clamp(rainHere / 1.2, 0, 1) * sstep(0.3, 0.8, 1 - dayK) * (world.night || world.lamps.visible ? 1 : 0) : 0;
  if (world.halos) world.halos.material.size = 26 * (1 + 0.9 * wetGlow);
  if ((q < 2 || U.uLampK.value < 0.05 || wetMax < 0.03) && wetGlow < 0.01) { U.uNL.value = 0; shafts.visible = false; return wetMax; } // en calidad baja, sin reflejos de los focos
  const us = Math.max(1, W / W_REAL), list = [];
  if (world.night) for (const t of world.towers) {
    sample(t.s, _lp);
    const L = t.sg * (t.lw * W + t.lm) + t.sg * t.z * us;
    list.push([_lp.x + _lp.rx * L, _lp.y + t.y * us, _lp.z + _lp.rz * L, t.y * us]);
  } else for (const q of world.lampPos) list.push([q.x, q.y, q.z, 16]);
  const c = cur.look;
  list.sort((a, b) => (a[0] - c.x) ** 2 + (a[2] - c.z) ** 2 - ((b[0] - c.x) ** 2 + (b[2] - c.z) ** 2));
  const nL = Math.min(16, list.length);
  if (q >= 2 && U.uLampK.value >= 0.05 && wetMax >= 0.03) { for (let j = 0; j < nL; j++) u[j].set(list[j][0], list[j][1], list[j][2], 1); U.uNL.value = nL; }
  else U.uNL.value = 0;
  shafts.visible = wetGlow > 0.01;
  if (shafts.visible) {
    const a = shafts.geometry.attributes.aTop, nS = Math.min(SHAFT_N, list.length);
    for (let j = 0; j < nS; j++) a.array.set([list[j][0], list[j][1] - 0.3, list[j][2], list[j][3]], j * 4);
    a.needsUpdate = true; shafts.geometry.instanceCount = nS;
    const su = shafts.material.uniforms;
    su.uK.value = wetGlow * 0.9; su.uTime.value = U.uTime.value;
    su.uWind.value.set(Math.cos(sess.weather.windDir), -Math.sin(sess.weather.windDir));
  }
  return wetMax;
}
/** Los 6 pilotos traseros más cercanos, para su reflejo rojo en el asfalto mojado. */
function updateTailRefl(list, k, wetMax) {
  const u = U.uTails.value;
  if (q < 2 || wetMax < 0.03) { U.uNT.value = 0; return; }
  const c = cur.look, near = [];
  for (const p of list) {
    if (p.c.loc !== "track" || !(p.tail > 0.15)) continue;
    const x = p.px - p.fx * 2.65 * k, z = p.pz - p.fz * 2.65 * k;
    near.push([(x - c.x) ** 2 + (z - c.z) ** 2, x, p.py + 0.45 * k, z, p.tail]);
  }
  near.sort((a, b) => a[0] - b[0]);
  const nT = Math.min(6, near.length);
  for (let j = 0; j < nT; j++) u[j].set(near[j][1], near[j][2], near[j][3], near[j][4]);
  U.uNT.value = nT;
}
/** Coche de seguridad, banderas de los comisarios y la zona en amarillo sobre la pista. */
const _sa = mkS(), _sb = mkS();
function drawFlags(now, W, k) {
  const fl = sess.flag, L = T.L, us = Math.max(1, W / W_REAL);
  // tramo con bandera amarilla: con coche de seguridad o VSC, toda la pista; si no, antes del último percance
  let zc = 0, zh = 0, zon = 0, red = fl === "red";
  if (fl === "sc" || fl === "sc_in" || fl === "vsc") { zh = L; zon = 1; }
  else if (!red) {
    let best = null;
    for (const p of pose.values()) if ((p.fxK === "crash" || ((p.fxK === "off" || p.fxK === "spin") && p.fxTau < 9)) && (!best || p.fxTau < best.fxTau)) best = p;
    if (best) { zc = best.s - 110; zh = 170; zon = 1; }
  }
  U.uYel.value.set(mod(zc, L), zh, zon);
  // banderas: amarillas en el tramo, rojas con bandera roja; si no hay nada, guardadas
  const { flags, posts } = world;
  let nf = 0;
  for (const po of posts) {
    const inZone = zon && Math.abs(mod(po.s - zc + L / 2, L) - L / 2) < zh + 60;
    if (!red && !inZone) continue;
    sample(po.s, _sa);
    const h = Math.hypot(_sa.tx, _sa.tz) || 1, tx = _sa.tx / h, tz = _sa.tz / h, lat = po.sg * (po.lw * W + po.lm), rx = _sa.rx * po.sg, rz = _sa.rz * po.sg;
    m4.set(tx * us, 0, rx * us, _sa.x + _sa.rx * lat + rx * 0.4 * us, 0, us, 0, _sa.y + 2.3 * us, tz * us, 0, rz * us, _sa.z + _sa.rz * lat + rz * 0.4 * us, 0, 0, 0, 1);
    flags.setMatrixAt(nf, m4); flags.setColorAt(nf++, _col.set(red ? 0xe0201a : 0xffd200));
  }
  flags.count = nf; flags.instanceMatrix.needsUpdate = true; if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  // coche de seguridad, delante del líder; con «entra en esta vuelta» se mete por el pit-lane
  const { scCar, scBar } = world;
  let show = false;
  const lp = (fl === "sc" || fl === "sc_in") && pose.get(sess.leaderId);
  if (lp && lp.c.loc === "track") {
    const ss = lp.s + 40 + 7 * k, pm = mod(ss, L), inLane = fl === "sc_in" && pm >= track.pit.entry, r = inLane ? pitRamp(ss) : 0;
    show = !(inLane && r > 0.97);
    if (show) {
      const latOf = (s2) => (arrAt(T.line, s2) * 0.5 * (1 - r) + T.PS * r * PIT_OFF) * W * arrAt(T.wr, s2);
      sample(ss, _sa); sample(ss + 3, _sb);
      const la = latOf(ss), lb = latOf(ss + 3);
      const x0 = _sa.x + _sa.rx * la, z0 = _sa.z + _sa.rz * la, x1 = _sb.x + _sb.rx * lb, z1 = _sb.z + _sb.rz * lb;
      let fx = x1 - x0, fy = _sb.y - _sa.y, fz = z1 - z0; const fl2 = Math.hypot(fx, fy, fz) || 1; fx /= fl2; fy /= fl2; fz /= fl2;
      const hl = Math.hypot(fx, fz) || 1, rx = -fz / hl, rz = fx / hl;
      // el del .glb, fino de cerca y ligero de lejos (si no ha cargado, el de siempre)
      const g = world.scGlb && (camera.position.distanceToSquared(_ws.set(x0, _sa.y, z0)) < (90 * k) ** 2 ? world.scGlb.hi : world.scGlb.lo);
      if (g && scCar.geometry !== g.car) { scCar.geometry = g.car; scCar.userData.sharedGeo = true; scBar.geometry = g.bar ?? SC_BAR; scBar.userData.sharedGeo = !!g.bar; }
      scCar.matrix.set(fx * k, 0, rx * k, x0, fy * k, k, 0, _sa.y + 0.03 * k, fz * k, 0, rz * k, z0, 0, 0, 0, 1);
      scBar.matrix.copy(scCar.matrix);
      scBar.material.color.setRGB(...(Math.floor(now / 250) % 2 ? [8, 3.5, 0] : [0.3, 0.12, 0]));
    }
  }
  scCar.visible = scBar.visible = show;
  // bandera a cuadros: el comisario, subido al muro del pit-lane en la línea de meta, la agita hasta que acaban todos
  const chk = world.chk, on = sess.chequered && (sess.kind === "RACE" || sess.kind === "SPRINT") && !sess.finished;
  chk.visible = !!on;
  if (on) {
    sample(0, _sa);
    const lat = T.PS * (1.0 + (PIT_OFF - 0.55 - 1.0) * 0.5) * W * arrAt(T.wr, 0);
    chk.position.set(_sa.x + _sa.rx * lat, _sa.y + 0.9 * us, _sa.z + _sa.rz * lat);
    chk.scale.setScalar(us); chk.rotation.y = Math.atan2(-_sa.rz * T.PS, _sa.rx * T.PS) + Math.PI;
    chk.getObjectByName("brazo").rotation.x = Math.sin(now / 160) * 0.7;
  }
}
// Niveles de detalle del decorado: cada fotograma se mira qué tramos caen en la vista o en la caja de sombras y, de
// esos, cuáles están lejos (la distancia se divide por lo que ha crecido la maqueta). Solo si algo cambia se rehacen los
// índices: sigue siendo una única llamada de dibujo (y otra para la sombra).
const PROP_FAR = [170, 220, 300, 380]; // metros (a escala real) a partir de los que un tramo va sin detalle, por calidad
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();
function propLod(uS) {
  const pm = world.props, L = pm.userData.lod, { chunks, state } = L;
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  let sf = null;
  if (sun.castShadow) { sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun); sf = sun.shadow.getFrustum(); }
  const far2 = ((DBG.propFar ?? PROP_FAR[q]) * uS) ** 2;
  let changed = false;
  for (let c = 0; c < chunks.length; c++) {
    const ch = chunks[c], b = ch.box;
    const st = b.isEmpty() || !(DBG.noCull || _fr.intersectsBox(b) || (sf && sf.intersectsBox(b))) ? 0 : b.distanceToPoint(camera.position) ** 2 > far2 ? 1 : 2;
    if (st !== state[c]) { state[c] = st; changed = true; }
  }
  const fineQ = q >= 2 ? 1 : 0;
  if (L.fine !== fineQ) { L.fine = fineQ; changed = true; } // el detalle fino depende también de la calidad
  if (!changed) return;
  const idx = pm.geometry.index, a = idx.array;
  let k = 0;
  for (let c = 0; c < chunks.length; c++) {
    if (!state[c]) continue;
    const ch = chunks[c], e = ch.start + ch.n0 + (state[c] === 2 ? ch.n1 + (fineQ ? ch.n2 : 0) : 0);
    for (let i = ch.start; i < e; i++) a[k++] = i;
  }
  pm.geometry.setDrawRange(0, k);
  idx.clearUpdateRanges(); idx.addUpdateRange(0, Math.max(1, k)); idx.needsUpdate = true;
  DBG.props = { verts: L.nv, drawn: k, state: Array.from(state).join("") };
}
let screenPts = [], rainClock = 0;
function draw3d(dt, now) {
  const list = updatePoses(dt);
  placeCars(list, curW);
  const halfH = updateCamera(dt, now);
  const W = curW, k = carK(W);
  const far = placeCars(list, W);
  record(list, W);
  U.uW.value = W; U.uS.value = Math.max(1, W / W_REAL);
  if (!DBG.noLod) propLod(U.uS.value);
  U.uDetail.value = clamp((T.Wov * 0.8 - W) / Math.max(1, T.Wov * 0.8 - W_REAL), 0, 1);
  updateWet(now); updateCloud(dt, now); updateLight(dt, now);
  if (!isPaused()) U.uTime.value = (U.uTime.value + dt * (replay ? REPLAY_SPEED : 1)) % 1000;
  // gotas en la carrocería: aparecen enseguida con la lluvia y tardan en irse cuando para (al ritmo de la sesión)
  { const tgt = clamp(rainHere / 1.5, 0, 1), d = U.uDrops;
    if (d.value < 0) d.value = tgt;
    else d.value += (tgt - d.value) * (1 - Math.exp(-dt * (isPaused() ? 0 : Math.min(8, curSpeed())) / (tgt > d.value ? 8 : 120))); }
  // la luz trasera va por coche en aTail (recarga ERS vs lluvia); uLight queda en 0 para no pisarla
  U.uLight.value = 0;
  const rainPulse = Math.floor(now / 340) % 2 ? 1.0 : 0.42;
  const hasErs = !sess.era || sess.era.ers > 0;
  const { cars, wheels, blobs, spray, discs } = world;
  // malla fina solo de cerca y con calidad alta; de muy lejos (vista general), la mínima con las ruedas dentro
  const tiny = far > (cars.geometry === CAR_MIN ? 0.6 : 0.7);
  if ((cars.geometry === CAR_MIN) !== tiny) {
    cars.geometry = tiny ? CAR_MIN : carLoCur; wheels.visible = !tiny;
    const tr = world.trees; if (tr) tr.geometry = tiny ? tr.userData.far : tr.userData.near; // los árboles, igual
    if (world.treeLod) {
      for (const m of world.treeLod.hi) m.visible = !tiny;
      for (const m of world.treeLod.lo) m.visible = tiny;
    }
  }
  const fine = q >= 2 && far < 0.5, { carsHi, wheelsHi } = world, _zero = mS.clone().makeScale(0, 0, 0);
  let nH = 0;
  const dr = W * 0.6 * far;
  let i = 0, ns = 0, nS = 0, nC = 0, nJ = 0, nL = 0, nG = 0, nB = 0, nF = 0;
  const { fists } = world, podium = sess.chequered ? sess.cars.filter((o) => o.loc === "fin" && isFinite(o.finishT)).sort((a, b) => a.finishT - b.finishT).slice(0, 3).map((o) => o.id) : [];
  cs.d = cs.m = cs.c = cs.b = 0;
  const { crewS, crewC, jacks, loose, gant, glit, blank } = world;
  const fcDash = camMode === "abordo" && !replay ? followCar() : null;
  dashMesh.visible = false;
  for (const p of list) {
    const c = p.c;
    // base del coche: delante, lado y arriba, con cabeceo al frenar o acelerar y balanceo en curva
    let fx = p.fx, fy = p.fy, fz = p.fz, rx = p.sx, ry = 0, rz = p.sz;
    if (p.yaw) { // trompo, salida o accidente: el coche gira sobre sí mismo
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), nfx = fx * cy + rx * sy, nfz = fz * cy + rz * sy;
      rx = rx * cy - fx * sy; rz = rz * cy - fz * sy; fx = nfx; fz = nfz;
    }
    // parada: u va de 0 (se para) a 1 (sale); el coche sube en los gatos mientras cambian las ruedas
    const u = p.pf >= 0 ? (p.pf - PIT_A) / (PIT_B - PIT_A) : -9, stop = u > -0.3 && u < 1.15;
    const lift = stop ? sstep(0, 0.1, u) * (1 - sstep(0.86, 0.95, u)) : 0, off = stop && u >= 0.12 && u <= 0.62, crewOn = u > -0.45 && u < 1.35;
    let ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const bx = rx, bz = rz;
    const th = clamp(p.acc / 55, -1, 0.4) * 0.05;
    const bAng = p.roll * 0.04 - (p.bank || 0) * (1 - p.gar);
    const cb = Math.cos(bAng), sb = Math.sin(bAng);
    const f2x = fx + ux * th, f2y = fy + uy * th, f2z = fz + uz * th;
    const u2x = ux * cb + rx * sb - fx * th, u2y = uy * cb + ry * sb - fy * th, u2z = uz * cb + rz * sb - fz * th;
    const r2x = rx * cb - ux * sb, r2y = ry * cb - uy * sb, r2z = rz * cb - uz * sb;
    rx = r2x; ry = r2y; rz = r2z;
    m4.set(f2x * k, u2x * k, rx * k, p.px,
      f2y * k, u2y * k, ry * k, p.py + (0.03 + 0.09 * lift + (p.gar >= 0.999 ? 0.08 : 0)) * k + (p.yUp || 0),
      f2z * k, u2z * k, rz * k, p.pz,
      0, 0, 0, 1);
    // malla fina solo para los coches cerca de la cámara (hasta 8); en la ligera, ese hueco queda vacío
    const hi = fine && nH < 8 && camera.position.distanceToSquared(_ws.set(p.px, p.py, p.pz)) < 150 * 150 ? nH++ : -1;
    cars.setMatrixAt(i, hi >= 0 ? _zero : m4); cars.setColorAt(i, _col.set(c.team.color));
    if (hi >= 0) { carsHi.setMatrixAt(hi, m4); carsHi.setColorAt(hi, _col); }
    const steer = clamp(Math.atan(3.5 * p.kap) * 1.6, -0.5, 0.5);
    const brkT = c.loc === "track" ? clamp((-p.acc - 10) / 26, 0, 1) : 0;
    p.brk = p.brk === undefined ? brkT : p.brk + (brkT - p.brk) * (1 - Math.exp(-dt / 0.18));
    _col.set(COMPOUND[c.tyres?.c] || "#888888");
    for (let w = 0; w < 4; w++) {
      const wd = WHEELS[w];
      mL.makeRotationY(wd[2] ? steer : 0).multiply(mS.makeRotationZ(-p.spin)).scale(_ws.set(1, 1, wd[3])).setPosition(wd[0], 0.36, wd[1]);
      if (off) mW.makeScale(0, 0, 0); else mW.multiplyMatrices(m4, mL);
      if (hi >= 0) {
        wheelsHi.setMatrixAt(hi * 4 + w, mW); wheelsHi.setColorAt(hi * 4 + w, _col); wheels.setMatrixAt(i * 4 + w, _zero);
        world.brakeH.array[hi * 4 + w] = w < 2 ? p.brk : p.brk * 0.55;
      }
      else wheels.setMatrixAt(i * 4 + w, mW);
      wheels.setColorAt(i * 4 + w, _col);
      if (p.gar >= 0.999) { blank.setMatrixAt(nB, mW); blank.setColorAt(nB++, _c3.set(c.team.color)); } // en el garaje, con las mantas puestas
    }
    if (crewOn) {
      // mecánicos: salen corriendo del garaje antes de que llegue el coche, esperan en su sitio (las pistolas,
      // agachados) y vuelven corriendo cuando se va. Encima del morro, el semáforo de salida.
      mG.set(fx * k, 0, rx * k, p.px, 0, k, 0, p.py, fz * k, 0, rz * k, p.pz, 0, 0, 0, 1);
      const tc = _col.set(c.team.color), gs = T.PS, gz = gs * (0.42 * W * arrAt(T.wr, p.s) + 4) / k;
      const ci2 = world.carIdx.get(c.id) * 3, c2 = world.c2src.subarray(ci2, ci2 + 3); // segundo color del equipo
      const e = u < 0.5 ? sstep(-0.45, -0.1, u) : 1 - sstep(1.02, 1.35, u), moving = e > 0.001 && e < 0.999, ph = u * 40;
      const put = (mesh, idx, lx, lz, yw, colr = tc) => {
        // de su sitio (lx, lz) al garaje: mismo x, z del garaje; corriendo mira hacia donde va
        const x = lx, z = gz + (lz - gz) * e, bob = moving ? Math.abs(Math.sin(ph + lx * 3)) * 0.1 : 0;
        const ry = moving ? Math.atan2(-(u < 0.5 ? lz - gz : gz - lz), 0) : yw;
        mL.makeRotationY(ry).setPosition(x, bob, z); mW.multiplyMatrices(mG, mL); mesh.setMatrixAt(idx, mW); if (mesh.instanceColor) mesh.setColorAt(idx, colr);
        const a2 = mesh.geometry.attributes.aCrew2; if (a2) a2.array.set(c2, idx * 3);
      };
      put(crewS, nS++, 4.25, 0, Math.PI); put(crewS, nS++, -3.9, 0, 0);
      if (c.pit?.noseChange) { put(crewS, nS++, 3.4, 1.2, Math.PI * 0.75); put(crewS, nS++, 3.4, -1.2, -Math.PI * 0.75); } // los del morro
      if (stop) { put(jacks, nJ++, 3.0, 0, 0); put(jacks, nJ++, -2.7, 0, Math.PI); }
      for (const wd of WHEELS) {
        const sg = wd[1] > 0 ? 1 : -1, yw = sg * Math.PI / 2;
        if (moving) put(crewS, nS++, wd[0], wd[1] + sg * 0.62, yw); else put(crewC, nC++, wd[0], wd[1] + sg * 0.62, yw);
        put(crewS, nS++, wd[0] - 0.85, wd[1] + sg * 1.4, yw); put(crewS, nS++, wd[0] + 0.85, wd[1] + sg * 1.4, yw);
        // la rueda vieja sale y se la llevan hacia atrás; la nueva llega desde delante
        const wheel = (lx, lz, cmp) => { mL.makeScale(1, 1, wd[3]).setPosition(lx, 0.36, lz); mW.multiplyMatrices(mG, mL); loose.setMatrixAt(nL, mW); loose.setColorAt(nL++, _c3.set(COMPOUND[cmp] || "#888888")); };
        if (u >= 0.12 && u < 0.47) { const a = sstep(0.12, 0.28, u), b = sstep(0.28, 0.45, u); wheel(wd[0] - 0.85 * b, wd[1] + sg * (0.7 * a + 0.45 * b), p.oldC); }
        if (u >= 0.45 && u <= 0.62) { const e2 = sstep(0.45, 0.62, u); wheel(wd[0] + 0.85 * (1 - e2), wd[1] + sg * 1.15 * (1 - e2), p.newC); }
      }
      // semáforo de salida: rojo mientras trabajan, verde para soltarlo
      mL.makeScale(1, 1, gs).setPosition(2.7, 0, 0); mW.multiplyMatrices(mG, mL); gant.setMatrixAt(nG, mW);
      mL.makeTranslation(2.7, 0, 0); mW.multiplyMatrices(mG, mL); glit.setMatrixAt(nG, mW);
      glit.setColorAt(nG++, _c3.setRGB(...(u > 0.92 && u < 1.3 ? [0, 0, 1] : u > 0.84 && u <= 0.92 ? [0, 1, 0] : [1, 0, 0])));
    }
    if (p.fxK && p.simDt > 0) emitFx(p, c, m4, k, fx, fz);
    if (!replay) trackMarks(p, c, m4, k);
    if (q > 0 && c.loc === "track" && p.simDt > 0 && c.v > 62) {
      // más en las rectas rápidas y donde toca abajo; menos con la pista mojada (el agua las apaga)
      const i2 = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds)), wetK = 1 - Math.min(1, (sess.water[track.msOfPoint[i2]] || 0) * 2);
      // el reglaje: un coche bajo toca más el suelo (el doble con dos pasos por debajo de 0) y uno alto, casi nada
      const ride = c.setup ? clamp(1 - 0.45 * c.setup.r, 0.2, 2) : 1;
      const rate = (sstep(62, 88, c.v) * 18 + Math.min(60, T.dip[i2] * 9000)) * wetK * ride, x = rate * p.simDt;
      const nn = Math.min(10, Math.floor(x) + (Math.random() < x % 1 ? 1 : 0));
      for (let j = 0; j < nn; j++) {
        _mw.set(-0.9 - Math.random() * 1.1, 0.03, (Math.random() - 0.5) * 0.8).applyMatrix4(m4);
        const sp = c.v * (0.45 + Math.random() * 0.25);
        emitSpark(_mw.x, _mw.y, _mw.z, fx * sp + (Math.random() - 0.5) * 6, 1 + Math.random() * 3, fz * sp + (Math.random() - 0.5) * 6, (0.05 + Math.random() * 0.05) * k, 0.15 + Math.random() * 0.25);
      }
    }
    if (p.fxK === "crash") crashScene(p, c, k, W);
    if (p.cool >= 0 && p.cool < 45 && !p.gar && nF < 3 && podium.includes(c.id)) { fists.setMatrixAt(nF, m4); fists.setColorAt(nF++, _c3.set(c.team.color)); }
    // sombra de contacto pegada al suelo (sin cabeceo ni balanceo); si la grúa lo levanta, se encoge
    const shS = p.yUp ? Math.max(0.2, 1 - p.yUp / (5 * k)) : 1;
    mL.set(fx * k * shS, ux * k, bx * k * shS, p.px,
      fy * k * shS, uy * k, 0, p.py + 0.02 * k,
      fz * k * shS, uz * k, bz * k * shS, p.pz,
      0, 0, 0, 1);
    blobs.setMatrixAt(i, mL);
    world.decals.setMatrixAt(i, m4);
    const ci = world.carIdx.get(c.id);
    world.cell.array[i] = ci;
    // daños: el alerón tocado se ve descolgado; en un cambio de morro se quita mientras trabajan
    const nose = stop && c.pit?.noseChange && u > 0.18 && u < 0.7;
    const dmgVal = nose ? -1 : clamp(c.wing / 0.025, 0, 1) * (c.wing > 0.004 ? 1 : 0);
    // alerón trasero móvil (DRS / MO): apertura suave del flap cuando c.drs está activo
    const drsT = c.loc === "track" && !!c.drs ? 1 : 0;
    p.drs = p.drs === undefined || dt <= 0 ? drsT : p.drs + (drsT - p.drs) * (1 - Math.exp(-dt / 0.12));
    // luz trasera: parpadeo rápido de recarga ERS (~4,5 Hz) distinto de la luz de lluvia (~1,5 Hz con base fija)
    const miL = track.msOfPoint[Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds))];
    const wetL = c.loc === "track" ? Math.max(sess.water[miL] || 0, sess.waterOff[miL] || 0) : 0;
    const wetRain = rainHere > 0.25 || wetL > 0.06;
    const ersHarvest = hasErs && c.loc === "track" && c.v > 25 && (c.ers === 0 || (c.soc < 3.85 && p.acc < -15));
    const ersFast = Math.floor((now + c.id * 73) / 110) % 2 ? 1.25 : 0.04;
    const tailVal = ersHarvest && wetRain ? (ersFast > 0.5 ? 1.3 : 0.36)
      : ersHarvest ? ersFast
      : wetRain ? rainPulse
      : (1 - dayK) * 0.22;
    p.tail = tailVal;
    const livVal = world.livSrc[ci];
    world.carData.array.set([livVal, dmgVal, p.drs, tailVal], i * 4);
    world.col2.array[i * 3] = world.c2src[ci * 3]; world.col2.array[i * 3 + 1] = world.c2src[ci * 3 + 1]; world.col2.array[i * 3 + 2] = world.c2src[ci * 3 + 2];
    world.hlA.array.set(world.hlsA.subarray(ci * 3, ci * 3 + 3), i * 3); world.hlB.array.set(world.hlsB.subarray(ci * 3, ci * 3 + 3), i * 3);
    if (hi >= 0) { world.carDataH.array.set([livVal, dmgVal, p.drs, tailVal], hi * 4); world.col2H.array.set(world.col2.array.subarray(i * 3, i * 3 + 3), hi * 3); world.hlAH.array.set(world.hlsA.subarray(ci * 3, ci * 3 + 3), hi * 3); world.hlBH.array.set(world.hlsB.subarray(ci * 3, ci * 3 + 3), hi * 3); }
    const bigDash = fcDash && c === fcDash;
    mL.makeRotationX(-steer * 2.4).multiply(mTilt);
    if (bigDash) mL.scale(_ws.set(DASH_K, DASH_K, DASH_K));
    mL.setPosition(steerPos[0], steerPos[1], steerPos[2]); mW.multiplyMatrices(m4, mL); world.steer.setMatrixAt(i, mW);
    if (bigDash) {
      dashMesh.matrix.copy(mW); dashMesh.visible = true;
      if (now - dashT > 65) { dashT = now; drawDash(c); }
    }
    mL.makeScale(dr, dr, dr).setPosition(p.px, p.py + 0.3, p.pz); discs.setMatrixAt(i, mL); discs.setColorAt(i, _col.set(c.team.color));
    // spray: estela de agua detrás de cada coche sobre asfalto mojado
    const mi = track.msOfPoint[Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds))], offLine = Math.min(1, Math.abs(p.lat) / 0.3);
    const wet = c.loc === "track" ? sess.water[mi] + (sess.waterOff[mi] - sess.water[mi]) * offLine : 0;
    // ¿pisa un charco? Con mucha agua se forman en los badenes (donde el coche toca abajo) y a trozos sueltos de
    // 10 a 20 m a lo largo de la pista: al cruzarlos, la estela salta más alta y más abierta
    const i3 = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds));
    const pud = wet > 0.04 ? sstep(0.45, 0.85, wetVis(wet)) * Math.max(sstep(0.64, 0.8, vnoise(mod(p.s, T.L) / 22, 3.7)), sstep(0.002, 0.006, T.dip[i3])) : 0;
    const pudV = DBG.splash ?? pud; // (en las pruebas se puede forzar)
    p.spl = p.spl === undefined ? pudV : p.spl + (pudV - p.spl) * (1 - Math.exp(-p.simDt / (pudV > p.spl ? 0.08 : 0.35)));
    if (wet > 0.04 && c.v > 18 && q > 0) {
      // cuanta más agua y más velocidad, más densa y más larga
      const str = Math.min(1, wet * 2.2) * clamp((c.v - 18) / 35, 0, 1), L = (6 + c.v * 0.4) * k * (0.6 + 0.4 * Math.min(1, wet * 1.6));
      const sa = spray.geometry.attributes, ci = world.carIdx.get(c.id), spl = p.spl * clamp((c.v - 18) / 30, 0, 1);
      for (let j = 0; j < SPRAY_P; j++, ns++) {
        sa.aCar.array.set([p.px, p.py, p.pz], ns * 3); sa.aDir.array.set([fx, fy, fz], ns * 3);
        sa.aPar.array.set([str, k, ci * 0.173 + (j + 0.5) / SPRAY_P, L], ns * 4); sa.aSpl.array[ns] = spl;
      }
    }
    i++;
  }
  cars.count = blobs.count = discs.count = world.decals.count = world.steer.count = i; wheels.count = i * 4; spray.geometry.instanceCount = ns;
  crewS.count = nS; crewC.count = nC; jacks.count = nJ; loose.count = nL; gant.count = glit.count = nG; blank.count = nB; fists.count = nF; world.debris.count = cs.d; world.marsh.count = cs.m; world.crane.count = cs.c; world.beams.count = cs.b;
  for (const m of [crewS, crewC, jacks, loose, gant, glit, blank, fists, world.debris, world.marsh, world.crane, world.beams]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  crewS.geometry.attributes.aCrew2.needsUpdate = crewC.geometry.attributes.aCrew2.needsUpdate = true;
  // humo y polvo: avanzan con el reloj de la sesión (en pausa se quedan quietos)
  stepParts(dt * (isPaused() ? 0 : Math.min(8, curSpeed())));
  { const pa = world.puffs.geometry.attributes.aP, pc = world.puffs.geometry.attributes.aC, P = parts;
    for (let j = 0; j < P.n; j++) {
      const f = P.age[j] / P.life[j];
      pa.array.set([P.x[j * 3], P.x[j * 3 + 1], P.x[j * 3 + 2], P.s0[j] + (P.s1[j] - P.s0[j]) * Math.sqrt(f)], j * 4);
      pc.array.set([P.c[j * 3], P.c[j * 3 + 1], P.c[j * 3 + 2], P.a[j] * sstep(0, 0.06, f) * (1 - f) ** 1.4], j * 4);
    }
    world.puffs.geometry.instanceCount = P.n; pa.needsUpdate = pc.needsUpdate = true;
    PUFF_MAT.uniforms.uLum.value = 0.18 + 0.82 * dayK + 0.3 * U.uFlood.value; }
  stepSparks(dt * (isPaused() ? 0 : Math.min(8, curSpeed())));
  { const g = world.sparkMesh.geometry, pa = g.attributes.aP, aa = g.attributes.aV, P = sparks;
    for (let j = 0; j < P.n; j++) { pa.array.set([P.x[j * 3], P.x[j * 3 + 1], P.x[j * 3 + 2], P.sz[j]], j * 4); aa.array.set([P.v[j * 3], P.v[j * 3 + 1], P.v[j * 3 + 2], 1 - P.age[j] / P.life[j]], j * 4); }
    g.instanceCount = P.n; pa.needsUpdate = aa.needsUpdate = true; SPARK_MAT.uniforms.uNight.value = 1 - dayK; }
  for (const a of Object.values(spray.geometry.attributes)) if (a.isInstancedBufferAttribute) a.needsUpdate = true;
  discs.visible = far > 0.02;
  world.cell.needsUpdate = world.col2.needsUpdate = world.carData.needsUpdate = world.hlA.needsUpdate = world.hlB.needsUpdate = true;
  carsHi.count = nH; wheelsHi.count = nH * 4;
  world.carDataH.needsUpdate = world.col2H.needsUpdate = world.brakeH.needsUpdate = world.hlAH.needsUpdate = world.hlBH.needsUpdate = true;
  for (const m of [cars, wheels, carsHi, wheelsHi, blobs, discs, world.decals, world.steer]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const sel = opt.selId() === null ? null : pose.get(opt.selId());
  const ringFor = [...opt.mine().map((c) => (c.id === opt.selId() ? null : pose.get(c.id))), sel];
  world.rings.forEach((r, j) => {
    const p = ringFor[j];
    r.visible = !!p && far > 0.25;
    if (p) { r.position.set(p.px, p.py + 0.4, p.pz); r.scale.setScalar(k * 3.9); }
  });
  drawFlags(now, W, k); updateStartLights(); updateTailRefl(list, k, updateLampRefl(W));
  if (world.trackKit) {
    const top5 = sess.order ? sess.order().slice(0, 5).map((c) => ({ abrev: c.d.abrev, color: c.team.color }))
      : sess.cars.slice(0, 5).map((c) => ({ abrev: c.d.abrev, color: c.team.color }));
    const lp = pose.get(sess.leaderId);
    world.trackKit.update({
      dt, now, q, paused: isPaused(), W, uFlood: U.uFlood.value,
      flag: sess.flag, lap: sess.lap || 1, laps: sess.laps || track.laps || 50, kind: sess.kind || "RACE",
      yelCenter: U.uYel.value.x, yelHalf: U.uYel.value.y, yelOn: U.uYel.value.z,
      top5, leaderPos: lp ? { x: lp.px, y: lp.py, z: lp.pz } : null,
    });
  }
  // a bordo: gotas y suciedad del coche que se sigue
  { const fc2 = followCar(), on = camMode === "abordo" && !!fc2;
    let dirt = 0;
    if (fc2) {
      const pp = pose.get(fc2.id), prev = dirtOf.get(fc2.id) || 0;
      dirt = Math.min(1, Math.max(prev, (fc2.lapTimes?.length || 0) / 45) + (pp && pp.gnd > 0 ? 0.02 * (pp.simDt || 0) * 10 : 0));
      dirtOf.set(fc2.id, dirt);
    }
    // con calidad 2 o 3, también al objetivo de las cámaras de tele le caen gotas (menos y sin que el aire las arrastre)
    const tv = !on && q >= 2 && !reduced && rainHere > 0.25 && TV_CAMS.includes(camMode);
    lens.visible = (on && (rainHere > 0.1 || dirt > 0.02)) || tv;
    if (lens.visible) {
      const u2 = LENS_MAT.uniforms;
      u2.uRain.value = tv ? clamp(rainHere / 6, 0, 0.35) : clamp(rainHere / 2.5, 0, 0.85); u2.uDirt.value = tv ? 0 : dirt; u2.uAsp.value = opt.box.clientWidth / Math.max(1, opt.box.clientHeight);
      u2.uSpeed.value = tv || !fc2 ? 0 : clamp((fc2.v || 0) / 80, 0, 1); u2.uLum.value = 0.25 + 0.75 * dayK + 0.3 * U.uFlood.value;
      if (!isPaused()) u2.uTime.value += dt;
    }
  }
  updateMarks(now, W, k);
  // lluvia: cae alrededor de lo que se mira, solo donde la textura dice que llueve
  rain.visible = q > 0 && rainHere > 0.15 && !reduced;
  if (rain.visible) {
    if (!isPaused()) rainClock += dt * 1.6 * (replay ? REPLAY_SPEED : 1);
    const u = rain.material.uniforms, sz = clamp(halfH * 3.2, 60, 4000);
    u.uTime.value = rainClock; u.uLum.value = 0.28 + 0.65 * dayK + 0.25 * U.uFlood.value; u.uCenter.value.copy(cur.look); u.uSize.value.set(sz, sz * 0.75, sz);
    u.uWind.value.set(Math.cos(sess.weather.windDir), -Math.sin(sess.weather.windDir));
  }
  render();
  // rótulos tocables y enriquecidos de cerca (posición + compuesto)
  const box = opt.box, w = box.clientWidth, h = box.clientHeight, close = W < 12;
  screenPts = [];
  const placed = [], fc = camFocusCar || followCar(), fp = fc && pose.get(fc.id), selIdNow = opt.selId();
  const posMap = close && typeof sess.order === "function" ? new Map(sess.order().map((c, idx) => [c.id, idx + 1])) : null;
  const lblList = list.slice().sort((a, b) => {
    const ka = a.c.id === selIdNow ? 0 : a.c.player ? 1 : 2;
    const kb = b.c.id === selIdNow ? 0 : b.c.player ? 1 : 2;
    return ka - kb;
  });
  for (const p of lblList) {
    _v.set(p.px, p.py + 1.6 * k, p.pz).project(camera);
    const ok = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    if (ok) screenPts.push({ id: p.c.id, x, y });
    const rec = labels.get(p.c.id);
    if (!rec) continue;
    const el = rec.el;
    const near = close && fp && Math.min(mod(p.s - fp.s, T.L), mod(fp.s - p.s, T.L)) < 22 * k;
    if (ok && (p.c.player || p.c.id === selIdNow || near) && !((camMode === "abordo" || camMode === "trasera") && p === fp)) {
      if (close) {
        const pos = posMap ? posMap.get(p.c.id) : undefined;
        const cmp = p.c.tyres?.c || "";
        const key = `${pos ?? ""}|${cmp}`;
        if (rec.key !== key) {
          rec.key = key;
          rec.lp.textContent = pos ? `P${pos}` : "";
          rec.lc.textContent = cmp;
          rec.lc.style.background = COMPOUND[cmp] || "";
          rec.lc.style.color = cmp === "M" || cmp === "H" ? "#111" : "#fff";
          rec.lc.hidden = !cmp;
        }
        el.classList.add("rich");
      } else {
        if (rec.key !== "") {
          rec.key = "";
          rec.lp.textContent = "";
          rec.lc.textContent = "";
          rec.lc.hidden = true;
        }
        el.classList.remove("rich");
      }
      el.hidden = false;
      const bw = close ? 76 : 36, bh = close ? 16 : 14;
      const lx = clamp(x - bw * 0.5, 4, Math.max(4, w - bw - 4));
      let ly = clamp(y - (close ? 24 : 19), 30, Math.max(30, h - bh - 4));
      for (let tries = 0; tries < 4 && placed.some((o) => Math.abs(o.x - lx) < bw && Math.abs(o.y - ly) < bh); tries++) {
        const up = ly - (bh + 2);
        ly = up >= 30 ? up : Math.min(Math.max(30, h - bh - 4), ly + (bh + 2));
      }
      placed.push({ x: lx, y: ly });
      el.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
      el.classList.toggle("sel", p.c.id === selIdNow);
    } else if (!el.hidden) el.hidden = true;
  }
  for (const [id, rec] of labels) if (!pose.has(id) && !rec.el.hidden) rec.el.hidden = true;
  // fantasma de parada: dónde estaría tu piloto si parase ahora (etiqueta + aro en pista)
  const gs = layers.fantasma && opt.ghosts ? opt.ghosts() : [];
  ghostEls.forEach((el, j) => {
    const g = gs[j], gr = world.ghostRings?.[j];
    if (g) {
      sample(g.s, _a);
      _v.set(_a.x, _a.y + 1, _a.z).project(camera);
      if (gr) {
        gr.visible = true;
        gr.position.set(_a.x, _a.y + 0.25, _a.z);
        const pulse = reduced ? 1 : 0.92 + 0.14 * Math.sin(now * 0.005 + j * 1.5);
        gr.scale.setScalar(Math.max(W * 0.62, k * 2.4) * pulse);
        gr.material.color.set(g.color);
      }
    } else if (gr) {
      gr.visible = false;
    }
    const ok = !!g && _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
    if (el.hidden !== !ok) el.hidden = !ok;
    if (!ok) return;
    if (el.textContent !== g.text) el.textContent = g.text;
    el.style.borderColor = g.color;
    el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -50%)`;
  });
}


// ------------------------------------------------------------------ arranque y lo que se ofrece fuera
const layers = { drs: false, agua: false, fantasma: true };
function applyLayers(l) {
  if (l && typeof l === "object") {
    if (typeof l.drs === "boolean") layers.drs = l.drs;
    if (typeof l.agua === "boolean") layers.agua = l.agua;
    if (typeof l.fantasma === "boolean") layers.fantasma = l.fantasma;
  }
  U.uTacDrs.value = layers.drs ? 1 : 0;
  U.uTacWet.value = layers.agua ? 1 : 0;
}
applyLayers(opt.layers);
T = buildTrackData(track, track.id, opt.env);
const remember = () => { for (const c of sess.cars) { prevS.set(c.id, c.s); prevV.set(c.id, c.v); prevL.set(c.id, c.latOff ?? 0); } };
remember();
buildWorld();
for (const c of sess.cars) {
  const el = document.createElement("div");
  el.className = "lbl3" + (c.player ? " me" : ""); el.hidden = true;
  el.dataset.car = String(c.id);
  el.setAttribute("role", "button");
  el.innerHTML = `<i style="background:${c.team.color}"></i><em class="lp"></em><span class="ln">${c.d.abrev}</span><b class="lc" hidden></b>`;
  opt.labels.appendChild(el);
  labels.set(c.id, { el, lp: el.querySelector(".lp"), lc: el.querySelector(".lc"), key: "" });
}
const repEl = document.createElement("div"); repEl.className = "rep3"; repEl.hidden = true; repEl.textContent = "Repetición"; opt.labels.appendChild(repEl);
const ghostEls = [0, 1].map(() => { const el = document.createElement("div"); el.className = "gh3"; el.hidden = true; opt.labels.appendChild(el); return el; });
function resize() {
  const w = opt.box.clientWidth, h = opt.box.clientHeight;
  if (w < 10 || h < 10) return;
  applyQuality();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fitOverview(); camSnap = true;
}
resize();
let fN = 0, fT = performance.now(), lowSecs = 0, warm = 0, fps = 0;
// ------------------------------------------------------------------ sonido (audio.ts): lo que se oye desde la cámara
const auCam = new THREE.Vector3(), auVel = new THREE.Vector3(), auDir = new THREE.Vector3(), auS = mkS();
let auT = 0;
function audioView(now) {
  const cp = camera.position, dtr = (now - auT) / 1000;
  if (auT && dtr > 0 && dtr < 0.5) auVel.subVectors(cp, auCam).divideScalar(dtr); else auVel.set(0, 0, 0);
  auCam.copy(cp); auT = now;
  camera.getWorldDirection(auDir);
  const hr = Math.hypot(auDir.x, auDir.z) || 1, rx = -auDir.z / hr, rz = auDir.x / hr; // derecha de la cámara
  const sp = replay ? REPLAY_SPEED : opt.paused() ? 0 : opt.speed();
  const tgt = camMode === "abordo" && !replay ? camTarget() : null;
  // en la vista general la cámara está muy alta: se oye desde el coche seguido (como en el 2D), no desde el cielo
  const fc = camMode === "circuito" && !replay ? followCar() : null, fp = fc && pose.get(fc.id);
  const lx = fp ? fp.px : cp.x, ly = fp ? fp.py + 4 : cp.y, lz = fp ? fp.pz : cp.z;
  if (fp) auVel.set(fp.fx * (fc.v || 0) * sp, 0, fp.fz * (fc.v || 0) * sp);
  const cars = [], stops = [];
  for (const p of pose.values()) {
    if (p.px === undefined || p.gar >= 0.999) continue;
    const dx = p.px - lx, dy = p.py - ly, dz = p.pz - lz, d = Math.max(fp === p ? 6 : 1, Math.hypot(dx, dy, dz)), v = p.c.v || 0;
    const vx = p.fx * v * sp - auVel.x, vy = p.fy * v * sp - auVel.y, vz = p.fz * v * sp - auVel.z;
    const pan = (dx * rx + dz * rz) / d;
    if (p.pf >= 0) stops.push({ id: p.c.id, u: (p.pf - PIT_A) / (PIT_B - PIT_A), dist: d, pan });
    if (p.c.loc === "out") continue;
    cars.push({ id: p.c.id, dist: d, closing: -(vx * dx + vy * dy + vz * dz) / d, pan, v, onboard: !!tgt && tgt.id === p.c.id });
  }
  let crowd = 0;
  for (const [s0, sg, len] of standS) {
    sample(s0, auS);
    const off = curW + 14, d = Math.hypot(auS.x + auS.rx * sg * off - lx, auS.z + auS.rz * sg * off - lz);
    crowd += (len / 300) / (1 + (d / 120) ** 2);
  }
  return { cars, stops, crowd: clamp(crowd, 0, 1), rain: clamp(rainHere / 2.5, 0, 1), onboard: !!tgt, thunders: thunders.splice(0) };
}
const onCtxLost = (e) => {
  e.preventDefault();
  ctxLost = true;
  opt.onContextLost?.();
};
const onCtxRestored = () => {
  ctxLost = false;
  if (post) { post.rt.dispose(); post.composer.dispose(); post.ao.dispose(); post.bloom.dispose(); post = null; }
  hdriCache.clear();
  envHdriU.uHdriA.value = envHdriU.uHdriB.value = _dummyTex;
  envHdriU.uHdriMix.value = 1; envHdriU.uHdriHas.value = 0;
  if (envRT) { envRT.dispose(); envRT = null; }
  envSig = ""; hdriPreset = ""; hdriEnv = null;
  applyQuality();
  busyUntil = performance.now() + 500;
  opt.onContextRestored?.();
};
glc.addEventListener("webglcontextlost", onCtxLost);
glc.addEventListener("webglcontextrestored", onCtxRestored);

const canOrbit = () => camMode === "circuito" || camMode === "seguir";
function prepSegOrbit() {
  if (T.street && camMode === "seguir" && !orb.active) {
    yaw = Math.atan2(cur.look.z - cur.pos.z, cur.look.x - cur.pos.x);
  }
}

return {
  /** Antes de cada paso de la simulación: guarda dónde estaba cada coche, para interpolar. */
  beforeStep: remember,
  draw(dt, now) {
    if (ctxLost) { fN = 0; fT = now; lowSecs = 0; fps = 0; return; }
    scanEvents();
    const shot = pickPhoto();
    if (shot) {
      // fotograma de la foto (sin avanzar nada), se copia y enseguida el normal
      photoNow = shot; curW = W_REAL; draw3d(0, now); grabPhoto(shot); photoNow = null; camSnap = true;
    }
    draw3d(dt, now);
    if (opt.paused()) { fN = 0; fT = now; lowSecs = 0; fps = 0; return; } // en pausa se dibuja poco a propósito: no cuenta
    // calidad automática: si no llega al mínimo tres segundos seguidos, baja un escalón (ver lowerQuality)
    const target = opt.targetFps ? opt.targetFps() : 60;
    const minFps = target <= 30 ? 22 : 40;
    fN++;
    if (now - fT >= 1000) {
      fps = (fN * 1000) / (now - fT);
      if (++warm > 3) { lowSecs = fps < minFps ? lowSecs + 1 : 0; if (lowSecs >= 3) { lowSecs = 0; lowerQuality(); } }
      fN = 0; fT = now;
    }
  },
  /** Tras una pausa larga del dibujo (pestaña oculta, mapa tapado): que no cuente como fotogramas lentos. */
  idle() { fN = 0; fT = performance.now(); lowSecs = 0; fps = 0; },
  /** Para el sonido: coches cerca de la cámara ({ id, dist, closing, pan, v, onboard }), paradas en curso, público y lluvia. */
  audioView,
  /** Para el medidor de rendimiento: fotogramas por segundo (media del último segundo; 0 en pausa), calidad, escala de
   *  resolución (sobre la de la calidad), llamadas de dibujo y triángulos del último fotograma, y si la calidad es fija. */
  stats: () => ({ fps, q, scale: q >= 2 ? prScale : 1, pr: renderer.getPixelRatio(), calls: lastInfo.calls, tris: lastInfo.tris, fixed: fixedQ !== undefined }),
  /** Fija la calidad (0 a 3) o la deja automática (undefined): la automática empieza en la que recuerda el dispositivo. */
  setQuality(v) {
    fixedQ = v === undefined || v === null ? undefined : clamp(Math.round(v), 0, 3);
    q = startQuality(); prScale = 1; lowSecs = 0; warm = 0;
    if (q >= 2 && !canPost) q = 1;
    applyQuality(); busyUntil = performance.now() + 400;
  },
  /** La cámara está cambiando de sitio: hay que seguir dibujando aunque la sesión esté en pausa. */
  moving: () => camFrom !== null || camSnap || !!replay || performance.now() < busyUntil,
  /** El último percance que se puede volver a ver ({ id, abrev }) o null. */
  lastIncident,
  /** Repetición a cámara lenta del percance del coche id; onEnd al acabar (o al pararla). */
  replay: (id, onEnd) => startReplay(id, onEnd),
  stopReplay,
  replaying: () => !!replay,
  /** Fotos de los momentos clave de esta carrera: [{ src (JPEG), text, lap }]. */
  photos: () => photos.slice(),
  resize() { resize(); busyUntil = performance.now() + 400; },
  cycleCam() { busyUntil = performance.now() + 1300; setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); return CAM_NAME[camMode]; },
  /** Todas las cámaras ({ id, name, more }: las de «Más cámaras» con more) y poner una concreta (devuelve su nombre). */
  camList: () => [...CAMS, ...MORE_CAMS].map((id) => ({ id, name: CAM_NAME[id], more: MORE_CAMS.includes(id) })),
  setCamera(m) { if (CAM_NAME[m]) { busyUntil = performance.now() + 1300; setCam(m); } return CAM_NAME[camMode]; },
  cam: () => camMode,
  canOrbit,
  /** Orbita manualmente las cámaras Circuito o Seguir sin soltar la cámara al terminar el gesto. */
  orbit(dAz, dEl) {
    if (!canOrbit()) return;
    prepSegOrbit();
    const el0 = camMode === "circuito" ? ov.el : T.street ? 0.42 : 0.4;
    const elMin = camMode === "circuito" ? 0.24 : 0.1;
    const elMax = camMode === "circuito" ? 1.43 : 1.38;
    orb.dAz += dAz;
    orb.dEl = clamp(orb.dEl + dEl, elMin - el0, elMax - el0);
    orb.active = true; camFrom = null; camT = 1;
    busyUntil = performance.now() + 500;
  },
  /** Acerca (< 1) o aleja (> 1) la cámara en Circuito o Seguir. */
  zoomBy(factor) {
    if (!canOrbit() || !(factor > 0)) return;
    prepSegOrbit();
    const [zMin, zMax] = camMode === "circuito" ? [0.25, 1.8] : [0.35, 2.6];
    orb.zoom = clamp(orb.zoom * factor, zMin, zMax);
    orb.active = true; camFrom = null; camT = 1;
    busyUntil = performance.now() + 500;
  },
  /** Vuelve suavemente al encuadre automático de la cámara actual. */
  resetOrbit() {
    if (!orb.active) return;
    clearOrbit();
    camFrom = { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov };
    camT = 0;
    busyUntil = performance.now() + 900;
  },
  orbitState: () => ({ ...orb }),
  tvState: () => ({ ...tvDir, auto: isAutoTv() }),
  resetAutoTv() { tvDir.since = -1e9; tvDir.carId = null; tvDir.prio = 0; busyUntil = performance.now() + 300; },
  setLayers(l) { applyLayers(l); busyUntil = performance.now() + 250; },
  layers: () => ({ ...layers }),
  /** Coche más cercano al punto tocado (px del recuadro), o null. */
  pick(x, y) {
    let best = null, bd = 24 * 24;
    for (const p of screenPts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.id; } }
    return best;
  },
  /** Ha cambiado el coche seguido: la cámara va hacia el nuevo con suavidad. */
  selChanged() {
    busyUntil = performance.now() + 1300;
    segOn = false;
    if (camMode === "tele" && isAutoTv() && opt.selId() !== null) {
      tvDir.carId = opt.selId();
      tvDir.shot = "tele";
      tvDir.reason = "manual";
      tvDir.prio = 2;
      tvDir.since = performance.now();
      tvDir.holdMs = 7000;
      teleIdx = -1;
      camSnap = true;
      return;
    }
    if (camMode !== "circuito") {
      camFrom = { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov };
      camT = 0; teleIdx = -1;
    }
  },
  dispose() {
    alive3d = false;
    world?.trackKit?.dispose();
    glc.removeEventListener("webglcontextlost", onCtxLost);
    glc.removeEventListener("webglcontextrestored", onCtxRestored);
    scene.traverse((o) => {
      if (o.geometry && !o.userData?.sharedGeo) o.geometry.dispose();
      if (o.material && !o.userData?.sharedMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    cloudTex.dispose(); wxTex.dispose(); dashTex.dispose(); blobTex.dispose(); FAN_U.tex.value?.dispose(); if (sun.shadow.map) sun.shadow.map.dispose();
    for (const g of [CAR_GEO, WHEEL_GEO, CAR_LO, WHEEL_LO, CAR_MIN, STEER_GEO, CREW_STAND, CREW_CROUCH, BOAT_GEO, CITY_GABLE, CITY_TOP, SC_GEO, SC_BAR, extCarLoGeo]) g?.dispose();
    for (const r of envResDispose) r?.dispose();
    envResDispose.length = 0;
    for (const t of Object.values(DET)) t.dispose();
    for (const t of loadedTexs) t.dispose();
    hdriCache.clear();
    _dummyTex.dispose();
    if (sunFar.shadow.map) { sunFar.shadow.map.dispose(); sunFar.shadow.map = null; }
    envScene.children[0].material.dispose(); envCube.dispose(); if (envRT) envRT.dispose(); pmrem.dispose();
    if (post) { post.rt.dispose(); post.composer.dispose(); post.ao.dispose(); post.bloom.dispose(); }
    renderer.dispose(); renderer.forceContextLoss();
    opt.labels.innerHTML = "";
  },
};
}
