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
import { rainAt } from "../sim/weather";
import { BRANDS, FONT, SECOND, collect, skin, carGeometry, wheelGeometry, liveryTexture, makeCarMaterial, makeWheelMaterial } from "./car3d";

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
 * opt: { canvas, labels, box, sess, mine(), selId(), alpha(), paused(), speed(), ghosts(), quality? }
 *  · alpha(): cuánto del paso de simulación en curso ha pasado ya (0..1), para interpolar posiciones;
 *  · ghosts(): [{ s, text, color }] con los fantasmas de parada;
 *  · quality (opcional): calidad fija de 0 a 3, sin memoria y sin bajar sola (pruebas, o fijada a mano en Ajustes);
 *  · debug (opcional, solo pruebas): { view: { pos, look, fov, s? } } pone la cámara a mano, relativa al coche seguido
 *    (o al punto s de la pista); en el mismo objeto se dejan algunos datos internos para comprobarlos.
 * Devuelve { beforeStep, draw, resize, cycleCam, pick, selChanged, stats, setQuality, dispose }.
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
const prevS = new Map(), prevV = new Map(), labels = new Map();

// ------------------------------------------------------------------ escena
const glc = opt.canvas;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: "high-performance" }); }
catch (e) { throw new Error("sin WebGL"); }
// La escena se calcula en luz lineal y con valores por encima de 1 (el sol, los focos); la curva de tonos
// la lleva a pantalla. La «neutra» comprime solo los brillos: los colores de los equipos salen como son.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.85;
const scene = new THREE.Scene();
const fog = new THREE.Fog(0xc3d8ea, 1000, 9000);
scene.fog = fog;
// el sol da la luz directa y la sombra; la luz ambiente sale del propio cielo (scene.environment, más abajo)
const sun = new THREE.DirectionalLight(0xfff3dd, 3);
scene.add(sun, sun.target);
sun.shadow.bias = -0.0004;
const camera = new THREE.PerspectiveCamera(36, 1, 5, 80000);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// color escrito «como se ve» (sRGB) pasado a luz lineal
vec3 SR(vec3 c){ return pow(c, vec3(2.2)); }
`;
// cielo: degradado del horizonte al cénit, bruma hacia el sol, nubes con volumen que se mueven y el disco del sol.
// El mismo material pinta el entorno que reflejan los coches y el asfalto mojado (uEnv = 1: sin disco, con suelo).
const skyU = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uNight: { value: 0 }, uCity: { value: 0 }, uFlash: { value: 0 },
  uWx: { value: null }, uWxR: { value: 40000 }, uCam: { value: new THREE.Vector2() }, uWind: { value: new THREE.Vector2() } };
const skyMat = (env) => new THREE.ShaderMaterial({
  uniforms: { ...skyU, uEnv: { value: env } }, side: THREE.BackSide, fog: false, depthWrite: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uZen, uHor, uSun, uSunCol, uCloudCol, uGround; uniform float uEnv, uNight, uWxR, uCity, uFlash; uniform vec2 uCam, uWind; uniform sampler2D uWx; varying vec3 vDir;` + GLSL_NOISE + `
    // ruido de gradiente con transición suave (no deja ver la rejilla) y octavas giradas
    vec2 g2(vec2 p){ float a = h21(p) * 6.2831853; return vec2(cos(a), sin(a)); }
    float gn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(mix(dot(g2(i), f), dot(g2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                 mix(dot(g2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(g2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y); }
    float cloudDen(vec2 q){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * gn(q); q = mat2(1.6, 1.2, -1.2, 1.6) * q + 3.7; a *= 0.5; } return 0.5 + 0.9 * s; }
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
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat(0));
sky.scale.setScalar(40000); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
// entorno: el cielo de este momento, fotografiado en un cubo pequeño y filtrado por rugosidad (PMREM). De ahí salen
// la luz ambiente de todo y los reflejos de la carrocería y del agua. Se rehace cuando cambian la hora o las nubes.
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.geometry, skyMat(1)));
const envCube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const envCam = new THREE.CubeCamera(0.1, 10, envCube);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envT = -1e9, envSig = "";
function updateEnv(now, sig) {
  if (sig === envSig || now - envT < 2500) return;
  envSig = sig; envT = now;
  envCam.update(renderer, envScene);
  envRT = pmrem.fromCubemap(envCube.texture, envRT);
  scene.environment = envRT.texture;
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

// uniformes que comparten la pista, los coches y la lluvia
const U = {
  uW: { value: 20 }, uDetail: { value: 0 }, uL: { value: 5000 }, uFlood: { value: 0 }, uLight: { value: 0.2 },
  uCloud: { value: null }, uTexR: { value: 3000 }, uTime: { value: 0 },
  uYel: { value: new THREE.Vector3(0, 0, 0) }, // zona en amarillo: centro (s), media longitud y cuánto se ve
  uLamps: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uNL: { value: 0 }, // focos que se reflejan en el agua
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
const RIB_VH = `
attribute vec3 aSide; attribute float aLat, aLatM, aY, aU, aV, aWet, aWetOff, aKerb, aDash, aLine, aWr; attribute vec3 aEdge;
uniform float uW;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine, vWY; varying vec3 vEdge; varying vec2 vXZ;
`;
const RIB_VB = `
vec3 transformed = position + aSide * (uW * aLat * aWr + aLatM);
transformed.y += aY * (aY > 0.0 ? uW / 6.5 : 1.0);
vU = aU; vV = aV; vWet = aWet; vWetOff = aWetOff; vKerb = aKerb; vDash = aDash; vLine = aLine; vEdge = aEdge; vXZ = transformed.xz; vWY = transformed.y;
`;
const RIB_FH = `` + GLSL_NOISE + `
uniform float uW, uDetail, uL, uFlood, uTexR, uTime, uNL; uniform vec3 uYel; uniform vec4 uLamps[16]; uniform sampler2D uCloud, uAds, uDet;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine, vWY; varying vec3 vEdge; varying vec2 vXZ;
`;
// Cada cinta compila solo su rama (RMODE): 0 muro liso, 1 pista, 2 calle de boxes, 3 hierba, 4 grava, 5 barrera, 6 valla, 7 publicidad.
// Sale de aquí: col (color), rough (rugosidad), metal y dn (inclinación fina de la superficie, en x/z del mundo).
const RIB_FB = `
float px = fwidth(vXZ.x) + fwidth(vXZ.y); // metros por píxel
vec3 col = diffuse; float rough = 0.9, metal = 0.0, glow = 0.0; vec2 dn = vec2(0.0); vec3 refC = vec3(0.0);
float cloudS = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).g;
#if RMODE == 1 || RMODE == 2
  float a = abs(vU);
  float edge = smoothstep(0.80, 0.85, a + (vn(vec2(vV * 0.9, vU * 3.0)) - 0.5) * 0.035 * uDetail);
  // asfalto: el árido de cerca, manchas de un par de metros y parches de distinto tono a lo lejos
  vec4 d1 = texture2D(uDet, vXZ / 2.7), d2 = texture2D(uDet, vXZ / 23.0 + 0.31);
  float big = vn(vXZ * 0.06);
  col *= (0.55 + 0.9 * d1.r) * (0.72 + 0.56 * d2.r) * (0.84 + 0.32 * big);
  dn = (d1.gb - 0.5) * 1.5 + (d2.gb - 0.5) * 0.5;
  rough = 0.86 + (d1.a - 0.5) * 0.2;
  #if RMODE == 1
    // la trazada: goma depositada, más oscura y más lisa
    float dl = (vU - vLine) / 0.30;
    float rub = exp(-dl * dl) * (0.35 + 0.65 * uDetail) * (0.8 + 0.4 * vn(vec2(vV * 0.15, vU * 4.0)));
    col *= 1.0 - 0.42 * rub; rough -= 0.2 * rub; dn *= 1.0 - 0.5 * rub;
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.7, a);
    // Agua. Las dos rodadas (y algo menos el carril entre ellas) llevan el agua de la trazada; el resto, la de fuera.
    float t1 = (vU - vLine - 0.12) / 0.075, t2 = (vU - vLine + 0.12) / 0.075;
    float lineK = max(max(exp(-t1 * t1), exp(-t2 * t2)), 0.6 * exp(-dl * dl * 0.6));
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
    // de noche, cada foco se refleja en el agua como una estela alargada hacia quien mira (más fina en los charcos)
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
      refC = vec3(1.0, 0.9, 0.74) * acc * max(film * 0.5, pud) * uFlood * 2.5;
    }
    col = mix(col, SR(vec3(0.27, 0.59, 0.94)), vWet * (1.0 - uDetail) * 0.85);
    float dash = vDash > 0.5 ? step(0.45, fract(vV / (uW * 4.0))) : 1.0;
    float stripe = step(0.5, fract(vV / (uW * 0.5)));
    vec3 kerb = mix(SR(vec3(0.82, 0.10, 0.08)), SR(vec3(0.95)), stripe) * (0.72 + 0.56 * d2.r);
    float k = step(0.5, vKerb) * uDetail;
    float em = edge * max(dash, k);
    col = mix(col, mix(SR(vEdge), kerb, k), em);
    float sl = step(vV, uW * 0.45) * step(a, 0.8);
    float chk = mod(floor(vU * 4.0) + floor(vV / (uW * 0.225)), 2.0);
    col = mix(col, mix(SR(vec3(0.95)), mix(SR(vec3(0.95)), SR(vec3(0.06)), chk), uDetail), sl);
    float g = (uL - vV - 9.0) / 8.0;
    float sideSel = mod(floor(g), 2.0) < 0.5 ? 1.0 : -1.0;
    float slot = step(0.0, g) * step(g, 22.0) * step(0.12, vU * sideSel) * step(vU * sideSel, 0.72) * step(fract(g), 0.07) * uDetail;
    col = mix(col, SR(vec3(0.93)), slot);
    // la pintura es más lisa que el asfalto (y brilla más mojada)
    float paint = max(em, max(sl, slot));
    rough = mix(rough, min(rough, mix(0.55, 0.12, film)), paint); dn *= 1.0 - 0.7 * paint;
    // banderas amarillas: el tramo afectado (o toda la pista con coche de seguridad) se marca en los bordes y, de lejos, entero
    float yd = abs(mod(vV - uYel.x + uL * 0.5, uL) - uL * 0.5), yz = uYel.z * (1.0 - smoothstep(uYel.y, uYel.y + 30.0, yd));
    float yk = yz * max(edge * 0.85, (1.0 - uDetail) * 0.35) * (0.75 + 0.25 * sin(uTime * 6.0));
    col = mix(col, SR(vec3(1.0, 0.8, 0.1)), yk); glow = max(glow, yk * 0.5);
  #else
    col = mix(col, SR(vec3(0.92)), edge * (0.3 + 0.6 * uDetail));
  #endif
#elif RMODE == 3
  // hierba: franjas de siega, calvas más secas y la textura de la hierba a dos escalas
  vec4 d1 = texture2D(uDet, vXZ / 3.3), d2 = texture2D(uDet, vXZ / 41.0 + 0.31);
  col *= 0.9 + 0.2 * step(0.5, fract(vV / 16.0)) * clamp(1.0 - px * 0.13, 0.0, 1.0);
  col *= (0.5 + 1.0 * d1.r) * (0.7 + 0.6 * d2.r) * (0.82 + 0.36 * vn(vXZ * 0.13));
  col = mix(col, col * vec3(1.45, 1.12, 0.55), smoothstep(0.55, 0.9, vn(vXZ * 0.031 + 4.0)) * 0.4);
  dn = (d1.gb - 0.5) * 2.0 + (d2.gb - 0.5) * 0.8; rough = 0.93;
#elif RMODE == 4
  vec4 d1 = texture2D(uDet, vXZ / 1.9), d2 = texture2D(uDet, vXZ / 13.0 + 0.31);
  col *= (0.55 + 0.9 * d1.r) * (0.75 + 0.5 * d2.r) * (0.9 + 0.2 * vn(vXZ * 0.6));
  dn = (d1.gb - 0.5) * 2.4 + (d2.gb - 0.5) * 1.2; rough = 0.96;
#elif RMODE == 5
  if (vKerb > 0.5) {
    // protección de neumáticos: bloques rojos y blancos
    col = mix(SR(vec3(0.78, 0.11, 0.09)), SR(vec3(0.92)), step(0.5, fract(vV / 2.4)));
    col *= 0.6 + 0.4 * step(0.18, fract(vU * 3.0)) * step(0.1, fract(vV / 0.6));
    rough = 0.7;
  } else {
    // guardarraíl: dos bandas de chapa galvanizada y un poste cada pocos metros
    float rail = step(0.16, vU) * step(vU, 0.46) + step(0.6, vU) * step(vU, 0.9);
    col = mix(SR(vec3(0.22, 0.23, 0.25)), SR(vec3(0.74, 0.76, 0.79)) * (0.85 + 0.3 * vn(vec2(vV * 0.7, vU * 6.0))), rail);
    col *= 1.0 - 0.45 * step(fract(vV / 3.8), 0.035);
    rough = mix(0.8, 0.42, rail); metal = 0.75 * rail;
  }
#elif RMODE == 6
  // valla: postes, cable de arriba y malla (que se apaga de lejos)
  float post = step(fract(vV / 5.0), 0.025), top = step(0.95, vU);
  float mesh = max(1.0 - step(0.16, fract(vV * 3.0)), 1.0 - step(0.16, fract(vU * 10.0))) * step(px, 0.5);
  if (post + top + mesh < 0.5) discard;
  col = SR(vec3(0.5, 0.53, 0.57)); rough = 0.5; metal = 0.6;
#elif RMODE == 7
  // paneles de publicidad: cada 7 m, una marca al azar
  float pi = floor(vV / 7.0), f = fract(vV / 7.0);
  col = texture2D(uAds, vec2((floor(h21(vec2(pi, 3.7)) * 8.0) + (vDash > 0.5 ? 1.0 - f : f)) / 8.0, vU)).rgb;
  col *= 1.0 - 0.5 * step(f, 0.012);
  rough = 0.45; glow = 0.22; // los paneles se leen también a contraluz
#else
  rough = 0.8;
#endif
col *= 1.0 - 0.4 * cloudS;
vec4 diffuseColor = vec4(col, opacity);
`;
const RIB_DET = [null, DET.asfalto, DET.asfalto, DET.hierba, DET.grava, null, null, null];
function ribbonMat(color, mode, po) {
  // flatShading: la normal sale de la propia superficie ya deformada (las cintas se ensanchan en el sombreador)
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po });
  m.defines = { ...m.defines, RMODE: mode };
  const uDet = { value: RIB_DET[mode] };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uDet });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + RIB_VH).replace("#include <begin_vertex>", RIB_VB);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + RIB_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", RIB_FB)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(rough, 0.04, 1.0);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(dn.x, 0.0, dn.y));")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + col * (uFlood * (RMODE > 0 ? 1.0 : 0.3) + glow) + refC;");
  };
  m.customProgramCacheKey = () => "cinta" + mode;
  return m;
}

// dos mallas: la fina para verlo de cerca y una ligera para la vista de circuito y los dispositivos justos
const CAR_GEO = carGeometry(true), WHEEL_GEO = wheelGeometry(true), CAR_LO = carGeometry(false), WHEEL_LO = wheelGeometry(false);
// volante con las manos del piloto (gira con la dirección)
const STEER_GEO = (() => {
  const c = collect();
  c.add(new THREE.BoxGeometry(0.035, 0.15, 0.27), [0.07, 0.07, 0.08]);
  c.add(new THREE.BoxGeometry(0.02, 0.07, 0.11).translate(-0.02, 0.01, 0), [0.1, 0.5, 0.75]);
  for (const s of [1, -1]) { c.add(new THREE.BoxGeometry(0.07, 0.085, 0.07).translate(-0.01, 0, 0.125 * s), [0.82, 0.82, 0.84]); c.add(new THREE.BoxGeometry(0.2, 0.07, 0.07).translate(-0.12, -0.03, 0.15 * s), [0.82, 0.82, 0.84]); }
  return c.done();
})();
const STEER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
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
const BLOB_GEO = new THREE.PlaneGeometry(6.6, 3.0).rotateX(-Math.PI / 2);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
const RING_GEO = new THREE.RingGeometry(1.0, 1.13, 48).rotateX(-Math.PI / 2);
// Estela de agua: una nube de jirones por coche. Cada jirón es un cuadro que mira a la cámara, nace pegado a las
// ruedas traseras y al difusor, y se va quedando atrás mientras sube, se abre y se deshace. Todo ocurre en el
// sombreador: por jirón solo se guarda dónde está su coche, hacia dónde va y con cuánta agua.
const SPRAY_P = 20;
const SPRAY_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0.7, 0.75, 0.8) } },
  transparent: true, depthWrite: false,
  vertexShader: `attribute vec3 aCar, aDir; attribute vec4 aPar; uniform float uTime; varying vec2 vQ; varying float vA, vSeed;
    void main(){
      float seed = aPar.z, k = aPar.y, L = aPar.w;
      float ph = fract(seed * 7.31 + uTime * (0.6 + 0.5 * fract(seed * 3.7)));   // vida del jirón: 0 recién levantado, 1 deshecho
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), aDir));
      float lat = (fract(seed * 13.7) - 0.5) * 2.0;
      vec3 c = aCar - aDir * (1.7 * k + ph * L) + side * lat * k * (0.7 + ph * 1.7)
        + vec3(0.0, k * (0.3 + ph * (1.0 + 1.6 * fract(seed * 5.3))), 0.0);
      float size = k * (1.3 + ph * 4.8) * (0.75 + 0.5 * fract(seed * 9.1));
      vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * size;
      gl_Position = projectionMatrix * mv;
      vQ = position.xy * 2.0; vSeed = seed;
      vA = aPar.x * smoothstep(0.0, 0.07, ph) * pow(1.0 - ph, 1.3);
    }`,
  fragmentShader: `uniform vec3 uCol; varying vec2 vQ; varying float vA, vSeed;` + GLSL_NOISE + `
    void main(){
      float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
      float soft = (1.0 - r2) * (1.0 - r2), n = vn(vQ * 2.3 + vSeed * 37.0) * 0.7 + vn(vQ * 5.1 - vSeed * 11.0) * 0.3;
      gl_FragColor = vec4(uCol * (0.85 + 0.3 * n), vA * soft * smoothstep(0.15, 0.75, n + 0.35 * (1.0 - r2)) * 0.5);
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
// color de vértice: r = cuánto del color del equipo (el mono), g = gris fijo (casco, botas)
const CREW_STAND = (() => {
  const c = collect(), T1 = [1, 0, 0], HEL = [0, 0.85, 0], BLK = [0, 0.05, 0];
  for (const z of [0.11, -0.11]) { c.add(new THREE.BoxGeometry(0.16, 0.85, 0.16).translate(0, 0.5, z), T1); c.add(new THREE.BoxGeometry(0.27, 0.1, 0.15).translate(0.04, 0.05, z), BLK); }
  c.add(new THREE.BoxGeometry(0.27, 0.62, 0.44).translate(0, 1.22, 0), T1);
  for (const z of [0.29, -0.29]) c.add(new THREE.BoxGeometry(0.12, 0.58, 0.12).translate(0.07, 1.16, z), T1);
  c.keep(new THREE.SphereGeometry(0.15, 10, 8).translate(0.02, 1.7, 0), HEL);
  c.add(new THREE.BoxGeometry(0.06, 0.07, 0.22).translate(0.14, 1.7, 0), BLK);
  return c.done();
})();
const CREW_CROUCH = (() => {
  const c = collect(), T1 = [1, 0, 0], HEL = [0, 0.85, 0], BLK = [0, 0.05, 0];
  for (const z of [0.12, -0.12]) { c.add(new THREE.BoxGeometry(0.14, 0.5, 0.14).translate(-0.22, 0.25, z), T1); c.add(new THREE.BoxGeometry(0.52, 0.16, 0.16).translate(0.0, 0.52, z), T1); }
  c.add(new THREE.BoxGeometry(0.27, 0.56, 0.42).rotateZ(-0.5).translate(-0.04, 0.9, 0), T1);
  for (const z of [0.2, -0.2]) c.add(new THREE.BoxGeometry(0.46, 0.11, 0.11).translate(0.3, 0.92, z), T1);
  c.add(new THREE.BoxGeometry(0.32, 0.15, 0.15).translate(0.6, 0.88, 0), BLK);
  c.keep(new THREE.SphereGeometry(0.15, 10, 8).translate(0.2, 1.26, 0), HEL);
  return c.done();
})();
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
// semáforo de salida de la parada: poste desde el lado del garaje (z > 0) y brazo sobre el morro
const GANTRY_GEO = (() => {
  const c = collect(), D = [0.12, 0.12, 0.13];
  c.add(new THREE.BoxGeometry(0.12, 3.3, 0.12).translate(0, 1.65, 1.9), D);
  c.add(new THREE.BoxGeometry(0.12, 0.12, 1.95).translate(0, 3.25, 0.95), D);
  c.add(new THREE.BoxGeometry(0.4, 0.06, 0.4).translate(0, 0.03, 1.9), D);
  return c.done();
})();
const CREW_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
CREW_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <color_vertex>", "vColor = vec4(instanceColor.rgb * pow(color.r, 2.2) + vec3(pow(color.g, 2.2)), 1.0);");
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
function buildTrackData(tr, id) {
  const n = tr.xs.length, ds = tr.ds, L = tr.length;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < n; i++) { minx = Math.min(minx, tr.xs[i]); maxx = Math.max(maxx, tr.xs[i]); miny = Math.min(miny, tr.ys[i]); maxy = Math.max(maxy, tr.ys[i]); }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, E = Math.max(maxx - minx, maxy - miny);
  const X = new Float32Array(n), Z = new Float32Array(n);
  let H = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = tr.xs[i] - cx; Z[i] = -(tr.ys[i] - cy); }
  // altitud real (data/circuitos/*.json, campo «relieve»): muestras a distancia constante a lo largo de la vuelta
  const rel = tr.def.relieve?.m, lerpLap = (a, f) => { const x = f * a.length, i0 = Math.floor(x); return a[i0 % a.length] + (a[(i0 + 1) % a.length] - a[i0 % a.length]) * (x - i0); };
  if (rel) for (let i = 0; i < n; i++) H[i] = lerpLap(rel, i / n);
  H = blur(H, Math.round(25 / ds), n);
  let hmin = 1e9, hmean = 0;
  for (let i = 0; i < n; i++) hmin = Math.min(hmin, H[i]);
  for (let i = 0; i < n; i++) { H[i] -= hmin; hmean += H[i] / n; }
  // cambios de rasante: donde la pista pasa de bajar a subir el coche se aplasta y toca abajo (chispas)
  const dip = new Float32Array(n);
  for (let i = 0; i < n; i++) dip[i] = Math.max(0, (H[(i + 3) % n] - 2 * H[i] + H[(i - 3 + n) % n]) / (9 * ds * ds));
  // terreno real alrededor (urbanos, campo «entorno»): altitud absoluta en una rejilla; el mar sale a 0 m o menos.
  // La pista del juego va referida a su punto más bajo: el desfase es la mediana de (terreno − pista) bajo el trazado.
  let env = null;
  const en = tr.def.entorno;
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
    env = { en, abs, at: (x, z) => abs(x, z) - off, sea: -off, wet: (x, z) => abs(x, z) <= 0.6 };
  }
  let sxx = 0, szz = 0, sxz = 0;
  for (let i = 0; i < n; i++) { sxx += X[i] * X[i]; szz += Z[i] * Z[i]; sxz += X[i] * Z[i]; }
  const axis = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  // trazada: por fuera antes y después de la curva, por dentro en el vértice (curvatura > 0 = a izquierdas)
  const nk = new Float32Array(n);
  for (let i = 0; i < n; i++) nk[i] = Math.tanh(tr.curv[i] / 0.011);
  const narrow = blur(nk, Math.round(24 / ds), n), wide = blur(blur(nk, Math.round(110 / ds), n), Math.round(110 / ds), n);
  let line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = -0.6 * clamp(1.7 * narrow[i] - 1.9 * wide[i], -1, 1);
  line = blur(blur(line, Math.round(18 / ds), n), Math.round(18 / ds), n);
  // escapatorias: metros de grava por fuera de las curvas (izquierda y derecha)
  const street = id === "monaco" || id === "singapur";
  // anchura real por punto (campo «ancho»), como proporción de la media
  const an = tr.def.ancho;
  let wr = new Float32Array(n).fill(1), wReal = street ? 5 : 6.5;
  if (an) {
    wReal = an.reduce((a, b) => a + b, 0) / an.length / 2;
    for (let i = 0; i < n; i++) wr[i] = clamp(lerpLap(an, i / n) / 2 / wReal, 0.65, 1.6);
    wr = blur(wr, Math.round(20 / ds), n);
  }
  W_REAL = wReal;
  const PS = tr.def.boxes.lado === "izquierda" ? -1 : 1; // lado de los boxes: +1 derecha
  const absk = new Float32Array(n);
  for (let i = 0; i < n; i++) absk[i] = wide[i];
  const sw = blur(absk, Math.round(40 / ds), n);
  const rL = new Float32Array(n), rR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * ds, p = tr.pit, inPit = s >= p.entry - 60 || s <= p.exit + 60;
    const r = street ? 0 : clamp((Math.abs(sw[i]) - 0.1) * 60, 0, 26);
    if (sw[i] > 0) rR[i] = r; else rL[i] = r; // a izquierdas: el exterior es la derecha
    if (inPit) (PS > 0 ? rR : rL)[i] = 0;
  }
  const rP = PS > 0 ? rR : rL, rO = PS > 0 ? rL : rR; // escapatoria del lado de boxes y del otro
  return { dip, env, SH: street ? 1.22 : 1.7, n, ds, L, E, Ex: maxx - minx, Ez: maxy - miny, cx, cy, X, Z, H, hmean, axis, line, rP, rO, PS, wr, street, Wov: Math.max(16, E * 0.0115) };
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
const PROP_VH = `attribute vec3 aAnc, aSd; attribute float aLw; attribute vec4 aPat; uniform float uW, uS, uTime; varying vec4 vPat; varying vec2 vWXZ;`;
const PROP_VB = `vec3 transformed = aAnc + aSd * (uW * aLw) + position * uS; vPat = aPat; vWXZ = transformed.xz;
  if (abs(aPat.x - 11.0) < 0.5) transformed += aSd * sin(uTime * 7.0 - aPat.z * 4.0 + aPat.y) * 0.22 * aPat.z * uS; // banderas del público`;
const PROP_FH = GLSL_NOISE + `uniform float uFlood, uTexR; uniform sampler2D uCloud, uSigns; varying vec4 vPat; varying vec2 vWXZ;
// al anochecer las ventanas se encienden poco a poco: cada una a partir de su propio umbral
float winOn(vec2 c){ return smoothstep(0.0, 0.06, uFlood * 1.3 - 0.05 - h21(c + 7.31) * 0.9) * 0.8; }
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
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
vec3 col = vColor.rgb; float rough = 0.85, metal = 0.0; vec3 glowC = vec3(0.0);
if (P > 0.5 && P < 1.5) {
  // gradas: filas de asientos (0,55 × 0,8 m) con gente de todos los colores; de lejos, su color medio
  vec2 g = uv / vec2(0.55, 0.8), c = floor(g), f = fract(g);
  float h = h21(c + sd * 13.1);
  vec3 shirt = SR(hsv(h21(c + 7.1), 0.1 + 0.5 * h21(c + 1.7) * h21(c + 5.9), 0.25 + 0.6 * h21(c + 3.3)));
  float body = step(0.15, h) * smoothstep(0.3, 0.22, length((f - vec2(0.5 + 0.12 * (h21(c + 2.2) - 0.5), 0.45)) * vec2(1.0, 0.6)));
  body = max(body, step(0.15, h) * smoothstep(0.16, 0.1, length(f - vec2(0.5, 0.82)))); // la cabeza
  shirt = mix(shirt, SR(vec3(0.85, 0.66, 0.52)) * (0.5 + 0.5 * h21(c + 4.4)), step(0.7, f.y));
  vec3 det = mix(col, shirt, body) * (0.55 + 0.45 * step(0.13, f.y));
  // de lejos no se distingue a nadie: un tono apagado, casi el de la ropa media
  col = mix(det, mix(col, SR(vec3(0.36, 0.33, 0.31)), 0.82) * 0.85, clamp(px * 2.2 - 0.35, 0.0, 1.0));
  rough = 0.95;
} else if (P < 2.5) {
  // cristal con montantes cada 1,6 m y forjados cada 3,4 m; de noche, luz dentro
  vec2 g = uv / vec2(1.6, 3.4), c = floor(g), f = fract(g);
  float fr = max(step(f.x, 0.05), step(f.y, 0.08)) * step(px, 0.6);
  col = mix(SR(vec3(0.12, 0.17, 0.22)), SR(vec3(0.62, 0.64, 0.67)), fr);
  rough = mix(0.06, 0.5, fr); metal = mix(0.2, 0.6, fr);
  glowC = SR(vec3(1.0, 0.86, 0.62)) * step(0.35, h21(c + sd)) * (1.0 - fr) * winOn(c + sd) * 2.2;
} else if (P < 3.5) {
  // garaje abierto: dentro en penumbra con el color del equipo al fondo y la fila de luces del techo
  // garaje abierto: en penumbra, con el color del equipo en los paneles del fondo, estanterías de ruedas y luces en el techo
  float lt = step(4.3, uv.y) * step(0.2, fract(uv.x / 2.2)) * step(uv.y, 4.7);
  float band = step(0.9, uv.y) * step(uv.y, 2.6), tyre = step(0.3, uv.y) * step(uv.y, 1.9) * step(0.7, fract(uv.x / 3.0)) * step(0.5, fract(uv.y / 0.4) + 0.2);
  col = mix(vec3(0.012), col * 0.12, band); col = mix(col, vec3(0.01), tyre); rough = 0.9;
  glowC = vColor.rgb * 0.02 * band + vec3(1.0, 0.97, 0.9) * lt * 2.5;
} else if (P < 4.5) {
  col = signAt(sd, uv); rough = 0.5; glowC = col * (0.12 + 1.1 * uFlood);
} else if (P < 5.5) {
  // fachada de ciudad: planta baja de tiendas y pisos de 3,1 m con ventanas, contraventanas y balcones
  col *= 0.86 + 0.14 * vn(uv * 0.35 + sd);
  if (uv.y < 4.0) {
    float sh = step(0.12, fract(uv.x / 5.0)) * step(0.4, uv.y) * step(uv.y, 3.3);
    col = mix(col, SR(vec3(0.07, 0.08, 0.09)), sh); rough = mix(0.8, 0.1, sh);
    float aw = step(3.3, uv.y) * step(uv.y, 3.8);
    col = mix(col, SR(hsv(h21(vec2(floor(uv.x / 5.0), sd)), 0.6, 0.6)), aw);
    glowC = SR(vec3(1.0, 0.85, 0.6)) * sh * (0.15 + uFlood * 1.5);
  } else {
    vec2 g = vec2(uv.x / 2.7, (uv.y - 4.0) / 3.1), c = floor(g), f = fract(g);
    float win = step(0.3, f.x) * step(f.x, 0.7) * step(0.2, f.y) * step(f.y, 0.85);
    float shut = (step(0.17, f.x) * step(f.x, 0.3) + step(0.7, f.x) * step(f.x, 0.83)) * step(0.2, f.y) * step(f.y, 0.85) * step(0.4, h21(vec2(sd, 3.0)));
    float balc = step(0.12, f.y) * step(f.y, 0.22) * step(0.2, f.x) * step(f.x, 0.8) * step(0.5, h21(vec2(c.y, sd)));
    float k = step(px, 0.9);
    col = mix(col, SR(vec3(0.3, 0.38, 0.28)) * (0.8 + 0.4 * h21(vec2(sd, 9.0))), shut * k);
    col = mix(col, SR(vec3(0.08, 0.09, 0.11)), win * k);
    col = mix(col, SR(vec3(0.15)), balc * k);
    rough = mix(rough, 0.12, win * k);
    glowC = SR(vec3(1.0, 0.82, 0.55)) * win * step(0.55, h21(c + sd)) * winOn(c + sd) * 1.4;
  }
} else if (P < 6.5) {
  // torre de oficinas: muro cortina con su retícula, de noche con medio edificio encendido
  vec2 g = uv / vec2(1.5, 3.6), c = floor(g), f = fract(g);
  float sp = step(f.y, 0.22), fr = step(f.x, 0.06);
  col = mix(col * 0.32, SR(vec3(0.7)), max(sp * 0.6, fr) * step(px, 0.8));
  rough = mix(0.05, 0.6, sp); metal = 0.5;
  glowC = SR(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.62), step(0.5, h21(vec2(c.y, sd))))) * step(0.55, h21(vec2(floor(c.x / 3.0), c.y) + sd)) * (1.0 - sp) * winOn(vec2(floor(c.x / 3.0), c.y) + sd) * 1.2;
} else if (P < 7.5) {
  // celosía de tubos (torres de televisión, puentes): huecos de verdad de cerca
  vec2 f = fract(uv / 1.4);
  float bar = max(max(step(f.x, 0.1), step(f.y, 0.1)), step(abs(f.x - f.y), 0.08));
  if (bar < 0.5 && px < 0.35) discard;
  col = SR(vec3(0.62, 0.64, 0.67)); rough = 0.45; metal = 0.7;
} else if (P < 8.5) {
  col *= 0.82 + 0.18 * step(0.5, fract(uv.x / 0.45)); rough = 0.5; metal = 0.4;
} else if (P < 9.5) {
  col *= (0.9 + 0.1 * vn(uv * 1.7 + sd)) * (1.0 - 0.3 * step(fract(uv.x / 4.0), 0.015));
} else if (P < 10.5) {
  col = vec3(1.0); glowC = vec3(1.0, 0.96, 0.88) * (0.6 + 6.0 * uFlood);
} else if (P < 11.5) {
  // bandera de aficionado: tres franjas de colores al azar
  float band = floor(clamp(uv.x, 0.0, 0.999) * 3.0);
  col = SR(hsv(h21(vec2(sd, band)), 0.75, 0.9)); if (h21(vec2(band, sd + 3.0)) > 0.7) col = SR(vec3(0.95));
  rough = 0.9;
}
col *= 1.0 - 0.35 * texture2D(uCloud, vWXZ / (2.0 * uTexR) + 0.5).g;
vec4 diffuseColor = vec4(col, opacity);
`;
function propMat() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uW: U.uW, uS: U.uS, uTime: U.uTime, uFlood: U.uFlood, uCloud: U.uCloud, uTexR: U.uTexR, uSigns: { value: signTex } });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + PROP_VH).replace("#include <begin_vertex>", PROP_VB);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PROP_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PROP_FB)
      .replace("#include <color_fragment>", "")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = rough;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + glowC + col * uFlood * 0.35;");
  };
  m.customProgramCacheKey = () => "decorado";
  return m;
}
// la sombra tiene que salir de la forma ya ensanchada
const PROP_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
PROP_DEPTH.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uW: U.uW, uS: U.uS, uTime: U.uTime });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + PROP_VH).replace("#include <begin_vertex>", PROP_VB);
};
PROP_DEPTH.customProgramCacheKey = () => "decorado-sombra";
/**
 * Constructor del decorado. at(s, lado) se sitúa en el punto s de la pista; los vértices van en el sistema de ese punto:
 * x a lo largo de la pista, y arriba, z hacia fuera (metros, crecen de lejos), más lw (medias anchuras de pista) y lm
 * (metros fijos hacia fuera, p. ej. la escapatoria).
 */
function propBuilder() {
  const P = [], AN = [], SD = [], LW = [], CO = [], PA = [], f = mkS();
  let tx = 1, tz = 0, wr = 1, sg = 1;
  const col = new THREE.Color();
  const B = {
    at(s, side = 1) { sample(s, f); const h = Math.hypot(f.tx, f.tz) || 1; tx = f.tx / h; tz = f.tz / h; wr = arrAt(T.wr, s); sg = side; return B; },
    v(x, y, z, lw, lm, c, pat, cell, u, v) {
      const rx = f.rx * sg, rz = f.rz * sg;
      AN.push(f.x + rx * lm, f.y, f.z + rz * lm); SD.push(f.rx, 0, f.rz); LW.push(lw * sg * wr);
      P.push(tx * x + rx * z, y, tz * x + rz * z); CO.push(c.r, c.g, c.b); PA.push(pat, cell, u, v);
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
    undo(m) { for (const a of [P, AN, SD, CO]) a.length = m; LW.length = m / 3; PA.length = (m / 3) * 4; },
    /** ¿Lo añadido desde m queda fuera de la pista (de cerca, a media distancia y de lejos)? */
    clear(m, margin = 1.5, near = false) {
      for (const W of near ? [W_REAL, W_REAL * 1.5] : [W_REAL, (W_REAL + T.Wov) / 2, T.Wov]) {
        const us = Math.max(1, W / W_REAL);
        for (let i = m; i < P.length; i += 3) {
          const k = i / 3, x = AN[i] + SD[i] * W * LW[k] + P[i] * us, z = AN[i + 2] + SD[i + 2] * W * LW[k] + P[i + 2] * us;
          if (trackDist(x, z) < T.SH * W + margin) return false;
        }
      }
      return true;
    },
    mesh() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(P.length).fill(0), 3));
      g.setAttribute("aAnc", new THREE.Float32BufferAttribute(AN, 3));
      g.setAttribute("aSd", new THREE.Float32BufferAttribute(SD, 3));
      g.setAttribute("aLw", new THREE.Float32BufferAttribute(LW, 1));
      g.setAttribute("color", new THREE.Float32BufferAttribute(CO, 3));
      g.setAttribute("aPat", new THREE.Float32BufferAttribute(PA, 4));
      const m = new THREE.Mesh(g, propMat());
      m.customDepthMaterial = PROP_DEPTH; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 6;
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
// Manzanas de ciudad lejos de la pista (Mónaco y Singapur): cajas repetidas cuyas fachadas salen del sombreador.
function cityMat(style) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uFlood: U.uFlood, uCloud: U.uCloud, uTexR: U.uTexR, uSigns: { value: signTex } });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec4 vPat; varying vec2 vWXZ;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wq = instanceMatrix * vec4(position, 1.0); vec3 lq = wq.xyz - instanceMatrix[3].xyz; vWXZ = wq.xz;
        vec3 wn = normalize(mat3(instanceMatrix) * normal); vec2 tn = vec2(-wn.z, wn.x);
        float sd = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 50.0;
        vPat = abs(wn.y) > 0.5 ? vec4(8.0, sd, lq.x, lq.z) : vec4(${style}.0, sd, dot(lq.xz, tn), lq.y - 3.0);
        vColor = vec4(instanceColor.rgb * (abs(wn.y) > 0.5 ? 0.55 : 1.0), 1.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PROP_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", PROP_FB)
      .replace("#include <color_fragment>", "")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = rough;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metal;")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + glowC;");
  };
  m.customProgramCacheKey = () => "ciudad" + style;
  return m;
}

let world = null, gaV = new Map(), gSlot = 20, startL = null;
let standS = []; // gradas para el sonido del público: [s del centro, lado, largo]
const srgb = (t) => { t.colorSpace = THREE.SRGBColorSpace; return t; };
function buildWorld() {
  standS = [];
  if (world) for (const o of world.all) { scene.remove(o); o.geometry && o.geometry.dispose(); }
  const all = [], n = T.n, tmp = mkS(), E = T.E, street = T.street;
  const add = (o) => { scene.add(o); all.push(o); return o; };
  const SH = street ? 1.22 : 1.7; // hasta dónde llega el arcén (en medias anchuras)
  /** Cinta a lo largo de la pista. cols(i, s) devuelve, por columna, [lado en anchuras, lado en metros, altura, u]. */
  function ribbon(i0, count, cols, mat, order, road, extra) {
    const N = count + 1, C = cols(0, 0).length, V = N * C;
    const P = new Float32Array(V * 3), NO = new Float32Array(V * 3), S = new Float32Array(V * 3), ED = new Float32Array(V * 3);
    const f1 = () => new Float32Array(V), LAT = f1(), LATM = f1(), Y = f1(), UU = f1(), VV = f1(), WET = f1(), WETO = f1(), KE = f1(), DA = f1(), LI = f1(), WR = f1();
    const msIdx = new Int16Array(N);
    for (let k = 0; k < N; k++) {
      const i = mod(i0 + k, n), s = (i0 + k) * T.ds;
      sample(s, tmp);
      const m = track.ms[track.msOfPoint[i]], cs = cols(i, s);
      msIdx[k] = m.i;
      for (let j = 0; j < C; j++) {
        const v = k * C + j, c = cs[j];
        P[v * 3] = tmp.x; P[v * 3 + 1] = tmp.y; P[v * 3 + 2] = tmp.z; NO[v * 3 + 1] = 1;
        S[v * 3] = tmp.rx; S[v * 3 + 2] = tmp.rz;
        const ps = road ? 1 : T.PS;
        LAT[v] = c[0] * ps; LATM[v] = c[1] * ps; Y[v] = c[2]; UU[v] = c[3]; VV[v] = s; WR[v] = T.wr[i];
        if (road) {
          const ot = m.overtake >= 0.15;
          ED[v * 3] = ot ? 1 : 0.93; ED[v * 3 + 1] = ot ? 0.58 : 0.95; ED[v * 3 + 2] = ot ? 0.16 : 0.97;
          DA[v] = m.drs && !ot ? 1 : 0; KE[v] = Math.abs(track.curv[i]) > 0.009 ? 1 : 0; LI[v] = T.line[i];
        } else if (extra) { const e = extra(i, s, c); KE[v] = e[0]; DA[v] = e[1]; }
      }
    }
    const idx = [];
    for (let k = 0; k < count; k++) for (let j = 0; j < C - 1; j++) { const a = k * C + j, b = a + C; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    const set = (name, arr, size) => g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    set("position", P, 3); set("normal", NO, 3); set("aSide", S, 3); set("aEdge", ED, 3);
    set("aLat", LAT, 1); set("aLatM", LATM, 1); set("aY", Y, 1); set("aU", UU, 1); set("aV", VV, 1);
    set("aWet", WET, 1); set("aWetOff", WETO, 1); set("aWr", WR, 1); set("aKerb", KE, 1); set("aDash", DA, 1); set("aLine", LI, 1);
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = order; mesh.receiveShadow = true;
    mesh.userData = { msIdx, C };
    return add(mesh);
  }
  const ramp = (s) => pitRamp(s);
  const rightEdge = (s) => Math.max(SH, ramp(s) * (PIT_OFF + 4.2));
  const grassCol = street ? 0x7c8187 : 0x48743d;
  // arcén con su talud (cubre los huecos con el terreno), grava, calle de boxes, asfalto y muros
  ribbon(0, n, (i, s) => { const re = rightEdge(s); return [[-(SH + 1.3), -(T.rO[i] + 10), -40, 0], [-SH, -T.rO[i], 0, 0], [re, T.rP[i], 0, 0], [re + 1.3, T.rP[i] + 10, -40, 0]]; }, ribbonMat(grassCol, street ? 4 : 3, 0), 1);
  if (!street) {
    ribbon(0, n, (i) => [[-1.3, -T.rO[i], 0, 0], [-1.3, 0, 0, 0]], ribbonMat(0xc4b48d, 4, -1), 2);
    ribbon(0, n, (i) => [[1.3, 0, 0, 0], [1.3, T.rP[i], 0, 0]], ribbonMat(0xc4b48d, 4, -1), 2);
  }
  const pitI0 = Math.floor(track.pit.entry / T.ds), pitN = Math.ceil((T.L - track.pit.entry + track.pit.exit) / T.ds);
  ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF; return [[o - 0.55, 0, 0, -1], [o + 0.55, 0, 0, 1]]; }, ribbonMat(0x6d747e, 2, -2), 3);
  // zona de trabajo delante de los garajes y paddock detrás
  ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF, r = ramp(s); return [[o + 0.55, 0, 0, 0], [o + 0.55 + r * 0.8, 0, 0, 0]]; }, ribbonMat(0x868c95, 2, -2), 3);
  ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF, r = ramp(s); return [[o + 1.35 * r + 0.55 * (1 - r), 0, 0, 0], [o + (1.35 + 2.6) * r + 0.55 * (1 - r), 10 * r, 0, 0]]; }, ribbonMat(0x737a83, 2, -1), 2);
  const road = ribbon(0, n, () => [[-1, 0, 0, -1], [1, 0, 0, 1]], ribbonMat(0x5a606a, 1, -3), 4, true);
  // barrera a cada lado: neumáticos por fuera de las curvas con escapatoria, guardarraíl en el resto
  const wallMat = ribbonMat(0xcfd4db, 5, 0), wl = SH - 0.08;
  const kAbs = blur(Float32Array.from(track.curv, Math.abs), Math.round(45 / T.ds), n);
  const sideOf = (c) => (Math.sign(c[0]) * T.PS > 0 ? 1 : 0);
  ribbon(0, n, (i) => [[-wl, -T.rO[i], 0, 0], [-wl, -T.rO[i], 1.05, 1]], wallMat, 5, false, (i, s, c) => [T.rO[i] > 3 ? 1 : 0, sideOf(c)]);
  ribbon(0, n, (i, s) => { const h = ramp(s) > 0.02 ? 0 : 1.05; return [[wl, T.rP[i], 0, 0], [wl, T.rP[i], h, 1]]; }, wallMat, 5, false, (i, s, c) => [T.rP[i] > 3 ? 1 : 0, sideOf(c)]);
  // muro del pit-lane, entre la pista y los boxes
  ribbon(pitI0, pitN, (i, s) => { const r = ramp(s), o = 1.0 + (PIT_OFF - 0.55 - 1.0) * 0.5, h = r > 0.98 ? 0.9 : 0; return [[o, 0, 0, 0], [o, 0, h, 1]]; }, ribbonMat(0xcfd4db, 0, 0), 5);
  // valla alta detrás de la barrera y paneles de publicidad en las rectas
  const fenceMat = ribbonMat(0x80868e, 6, 0), adMat = ribbonMat(0xffffff, 7, 0);
  const pitSide = (s) => ramp(s) > 0.02;
  ribbon(0, n, (i) => [[-wl, -T.rO[i] - 1.6, 0, 0], [-wl, -T.rO[i] - 1.6, 3.4, 1]], fenceMat, 5);
  ribbon(0, n, (i, s) => { const h = pitSide(s) ? 0 : 3.4; return [[wl, T.rP[i] + 1.6, 0, 0], [wl, T.rP[i] + 1.6, h, 1]]; }, fenceMat, 5);
  const adH = (i) => (kAbs[i] < 0.0022 ? 1 : 0);
  ribbon(0, n, (i) => { const h = adH(i); return [[-wl, -T.rO[i] - 0.5, 1.1 * h, 0], [-wl, -T.rO[i] - 0.5, 2.15 * h, 1]]; }, adMat, 5, false, (i, s, c) => [0, sideOf(c)]);
  ribbon(0, n, (i, s) => { const h = pitSide(s) ? 0 : adH(i); return [[wl, T.rP[i] + 0.5, 1.1 * h, 0], [wl, T.rP[i] + 0.5, 2.15 * h, 1]]; }, adMat, 5, false, (i, s, c) => [0, sideOf(c)]);

  // ---- terreno: sigue la altura de la pista cerca de ella y se vuelve colinas suaves lejos
  const step = Math.max(1, Math.round(40 / T.ds)), sx = [], sz = [], sh = [];
  for (let i = 0; i < n; i += step) { sx.push(T.X[i]); sz.push(T.Z[i]); sh.push(T.H[i]); }
  const terr = (x, z, rc) => {
    let wsum = 0, hsum = 0, dmin = 1e12, cap = 1e9;
    for (let k = 0; k < sx.length; k++) {
      const d2 = (x - sx[k]) ** 2 + (z - sz[k]) ** 2;
      if (d2 < dmin) dmin = d2;
      if (d2 < rc * rc && sh[k] < cap) cap = sh[k];
      const w = 1 / (d2 + 900) ** 1.6;
      wsum += w; hsum += w * sh[k];
    }
    const d = Math.sqrt(dmin), near = hsum / wsum;
    let far = T.hmean * 0.6 + (vnoise(x / (E * 0.22), z / (E * 0.22)) - 0.35) * E * 0.06;
    let b = sstep(E * 0.06, E * 0.55, d), wet = false;
    if (T.env) {
      // el terreno de verdad: el mar (y el puerto) por debajo del agua, la ladera de Mónaco; Singapur es llano
      // (su modelo de superficie trae los edificios, que se ponen aparte)
      wet = T.env.wet(x, z);
      far = wet ? T.env.sea - 6 : track.id === "singapur" ? Math.max(T.env.sea + 1.5, Math.min(T.env.at(x, z), T.hmean + 2)) : T.env.at(x, z);
      b = sstep(T.SH * T.Wov * 1.6, T.SH * T.Wov * 1.6 + 110, d);
    }
    return { h: Math.min(near + (far - near) * b - 1, cap - 1.5), d, wet };
  };
  const park = (x, z) => sstep(0.24, 0.16, vnoise(x / 240 + 5, z / 240 + 9)); // zonas verdes de las ciudades
  const cPark = new THREE.Color(0x4d7a3e), cRock = new THREE.Color(0x6f7a5a);
  const G = 128, R = E * 3.2, PW = 1.5, TR = U.uTexR.value = E * 1.5;
  const tp = new Float32Array((G + 1) * (G + 1) * 3), tc = new Float32Array((G + 1) * (G + 1) * 3), tuv = new Float32Array((G + 1) * (G + 1) * 2);
  const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), PW) * R;
  const cA = new THREE.Color(street ? 0x6d7278 : 0x355f31), cB = new THREE.Color(street ? 0x80858b : 0x456f3c), cC = new THREE.Color(street ? 0x8a8f95 : 0x527e45), cc = new THREE.Color();
  for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) {
    const ua = (a / G) * 2 - 1, ub = (b / G) * 2 - 1, x = warp(ua), z = warp(ub), v = a * (G + 1) + b;
    const cell = R * PW * Math.pow(Math.max(Math.abs(ua), Math.abs(ub), 0.02), PW - 1) * (2 / G);
    const t = terr(x, z, cell * 1.2 + T.Wov * 3.2 + 45);
    tp[v * 3] = x; tp[v * 3 + 1] = t.h; tp[v * 3 + 2] = z;
    tuv[v * 2] = x / (2 * TR) + 0.5; tuv[v * 2 + 1] = z / (2 * TR) + 0.5;
    cc.copy(cA).lerp(cB, vnoise(x / (E * 0.09) + 7, z / (E * 0.09) + 3)).lerp(cC, Math.max(0, 1 - t.d / (T.Wov * 5)) * 0.6);
    if (street) {
      // parques (donde no hay manzanas) y, en Mónaco, el monte de detrás: verde y roca
      const far2 = sstep(T.SH * T.Wov + 30, T.SH * T.Wov + 70, t.d);
      cc.lerp(cPark, park(x, z) * far2 * 0.85);
      if (T.env) cc.lerp(cRock, sstep(70, 200, t.h - T.env.sea) * 0.8);
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
  const uDetT = { value: street ? DET.asfalto : DET.hierba };
  terrMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uDet: uDetT, uCloud: U.uCloud, uTexR: U.uTexR, uFlood: U.uFlood });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTX = position.xz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX; uniform sampler2D uDet, uCloud; uniform float uTexR, uFlood;" + GLSL_NOISE)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 t1 = texture2D(uDet, vTX / 3.3), t2 = texture2D(uDet, vTX / 41.0 + 0.31);
        vec3 tcol = diffuse * (0.5 + 1.0 * t1.r) * (0.7 + 0.6 * t2.r) * (0.82 + 0.36 * vn(vTX * 0.13)) * (0.86 + 0.28 * vn(vTX * 0.011));
        ${street ? "" : "tcol = mix(tcol, tcol * vec3(1.45, 1.12, 0.55), smoothstep(0.55, 0.9, vn(vTX * 0.031 + 4.0)) * 0.4);"}
        tcol *= 1.0 - 0.4 * texture2D(uCloud, vTX / (2.0 * uTexR) + 0.5).g;
        vec2 tdn = (t1.gb - 0.5) * 2.0 + (t2.gb - 0.5) * 0.8;
        vec4 diffuseColor = vec4(tcol, opacity);`)
      .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(tdn.x, 0.0, tdn.y));")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * vColor.rgb * uFlood * 0.12;");
  };
  terrMat.customProgramCacheKey = () => "terreno" + street;
  const terrain = add(new THREE.Mesh(tg, terrMat));
  terrain.frustumCulled = false; terrain.receiveShadow = true;

  // ---- mar y puertos (Mónaco, Singapur): una lámina de agua que solo se ve donde el terreno real está a nivel del mar
  if (T.env) {
    const en = T.env.en, NE = en.n, md = new Uint8Array(NE * NE * 4);
    for (let k = 0; k < NE * NE; k++) { md[k * 4] = clamp((1.6 - en.h[k]) / 2, 0, 1) * 255; md[k * 4 + 3] = 255; }
    const mt = new THREE.DataTexture(md, NE, NE, THREE.RGBAFormat); mt.magFilter = mt.minFilter = THREE.LinearFilter; mt.needsUpdate = true;
    const wm = new THREE.MeshStandardMaterial({ color: 0x0b2b36, roughness: 0.07, metalness: 0 });
    const span = en.paso * (NE - 1);
    wm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uMask: { value: mt }, uTime: U.uTime, uFlood: U.uFlood, uG: { value: new THREE.Vector4(T.cx - en.x0, T.cy - en.y0, span, 0) } });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWXZ;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWXZ = position.xz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vWXZ; uniform sampler2D uMask; uniform float uTime, uFlood; uniform vec4 uG;" + GLSL_NOISE)
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec2 mu = vec2(vWXZ.x + uG.x, -vWXZ.y + uG.y) / uG.z;
          if (texture2D(uMask, mu).r < 0.5) discard;
          // olas: dos trenes de ruido que se cruzan
          vec2 dn = (vec2(vn(vWXZ * 0.11 + uTime * 0.35), vn(vWXZ * 0.11 + 9.0 - uTime * 0.3)) - 0.5) * 0.5
                  + (vec2(vn(vWXZ * 0.53 - uTime * 0.9), vn(vWXZ * 0.47 + 3.0 + uTime * 0.8)) - 0.5) * 0.22;
          vec4 diffuseColor = vec4(diffuse * (0.85 + 0.3 * vn(vWXZ * 0.02)), opacity);`)
        .replace("#include <normal_fragment_maps>", "normal = normalize(normal + mat3(viewMatrix) * vec3(dn.x, 0.0, dn.y));")
        .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * uFlood * 0.1;");
    };
    wm.customProgramCacheKey = () => "agua";
    const water = add(new THREE.Mesh(new THREE.PlaneGeometry(E * 7, E * 7).rotateX(-Math.PI / 2).translate(0, T.env.sea + 0.2, 0), wm));
    water.frustumCulled = false; water.receiveShadow = true; water.renderOrder = 0;
    // barcos amarrados cerca de la orilla
    const boats = [], rB = (() => { let q = 999 + n; return () => ((q = (q * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const shore = (i, j) => { for (let a = -3; a <= 3; a++) for (let b2 = -3; b2 <= 3; b2++) { const ii = i + a, jj = j + b2; if (ii >= 0 && jj >= 0 && ii < NE && jj < NE && en.h[jj * NE + ii] > 1) return true; } return false; };
    for (let j = 0; j < NE; j++) for (let i = 0; i < NE; i++) {
      if (en.h[j * NE + i] > 0 || !shore(i, j)) continue;
      for (let k = 0; k < 2; k++) {
        if (rB() < 0.55) continue;
        const gx = en.x0 + (i + rB() - 0.5) * en.paso, gy = en.y0 + (j + rB() - 0.5) * en.paso, x = gx - T.cx, z = -(gy - T.cy);
        const dd = trackDist(x, z);
        if (dd < T.SH * T.Wov + 25 || dd > 420 || !T.env.wet(x, z)) continue;
        boats.push([x, z, 12 + rB() * rB() * 45, rB() * Math.PI * 2, rB()]);
      }
    }
    if (boats.length) {
      const bm = add(new THREE.InstancedMesh(BOAT_GEO, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), boats.length));
      const qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
      const mb = new THREE.Matrix4();
      boats.forEach(([x, z, L, a], k) => { bm.setMatrixAt(k, mb.compose(vv.set(x, T.env.sea + 0.1, z), qq.setFromAxisAngle(yAx, a), sc3.set(L, L, L))); });
      bm.castShadow = true; bm.frustumCulled = false;
    }
  }

  // ---- arbolado
  const trees = [], rnd = (() => { let s = 12345 + T.n; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const maxT = street ? 450 : 800;
  for (let tries = 0; tries < 12000 && trees.length < maxT; tries++) {
    const x = (rnd() * 2 - 1) * E * 1.15, z = (rnd() * 2 - 1) * E * 1.15;
    if (street ? park(x, z) < 0.6 : vnoise(x / (E * 0.12) + 31, z / (E * 0.12) + 17) < 0.52) continue;
    const t = terr(x, z, 0);
    if (t.wet || t.d < (street ? T.SH * T.Wov + 40 : T.Wov * 3.4 + 45)) continue;
    trees.push([x, t.h - 1.5, z, 0.75 + rnd() * 0.7, rnd()]);
  }
  const tgc = collect();
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
  const treeMesh = add(new THREE.InstancedMesh(tgc.done(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), trees.length));
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), c2 = new THREE.Color(0x5c9a50);
  trees.forEach((t, i) => {
    const s = T.Wov * 1.05 * t[3];
    m4.makeScale(s, s, s).setPosition(t[0], t[1], t[2]); treeMesh.setMatrixAt(i, m4);
    treeMesh.setColorAt(i, col.setHex(0x3a6e3c).lerp(c2, t[4]));
  });
  treeMesh.frustumCulled = false; treeMesh.castShadow = true; treeMesh.receiveShadow = true; treeMesh.name = "arboles";

  // ---- focos (solo de noche)
  const nP = Math.floor(T.L / 130), lampPos = [];
  const lamps = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1c9).multiplyScalar(6), fog: false }), nP));
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
  const numTex = (txt) => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 96; const g = cv.getContext("2d"); g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, 128, 96); g.fillStyle = "#111"; g.font = "900 64px 'Titillium Web', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 64, 52); return srgb(new THREE.CanvasTexture(cv)); };
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
  const tryAdd = (fn, margin, near) => { const m = B.mark(); fn(); if (B.clear(m, margin, near)) return true; B.undo(m); return false; };
  const busy = [[], []]; // tramos ya ocupados: [0] lado de boxes, [1] el otro
  const isBusy = (sg, s0, s1) => busy[sg === PS ? 0 : 1].some(([a, b]) => mod(s0 - a, T.L) < b - a || mod(a - s0, T.L) < s1 - s0);
  let rs = 4321 + n; const rnd2 = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
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
          for (const zz of [Dg * 0.3, Dg * 0.7]) B.box(x0 + 0.6, x1 - 0.6, 5.0, 5.12, zz - 0.15, zz + 0.15, lw, 0, 0xffffff, { front: [10, 0], top: [10, 0] });
          B.box(x0, x1, -3, 0, 0, Dg, lw, 0, 0x9aa0a8, { front: [9, 0] }, uo);
        } else B.box(x0, x1, -3, 5.2, 0, D, lw, 0, 0xd9dde2, { front: [9, 0], back: [9, 0], top: [8, 0] }, uo);
        B.box(x0 - 0.15, x0 + 0.3, -3, 5.2, -0.35, 0.05, lw, 0, 0xc9ced4, { front: [9, 0] }, uo);
        // cartel sobre la puerta: el equipo o una marca
        B.box(x0, x1, 5.2, 6.7, -0.5, 1.2, lw, 0, 0xd0d4d9, { front: [9, 0], top: [9, 0] }, uo);
        B.panel(x0, x1, 5.35, 6.55, -0.52, lw, 0, open ? SIGN_TEAM0 + ti : (Math.floor(uo / 30) * 5) % 16, (uo + x0) / 5.4, (uo + x1) / 5.4);
        // dos plantas de cristal (hospitalidad), retranqueadas, con balcón, y la cubierta en voladizo
        B.box(x0, x1, 6.7, 6.95, -0.6, 2.0, lw, 0, 0xcfd3d8, { front: [9, 0], top: [9, 0] }, uo);
        B.box(x0, x1, 6.95, 7.9, -0.62, -0.55, lw, 0, 0x9aa3ad, { front: [9, 0] }, uo);
        const hT = D > 8 ? 14 : 10.4;
        B.box(x0, x1, 6.95, 10.4, 1.4, D, lw, 0, 0xffffff, { front: [2, k % 7], back: [9, 0], top: [9, 0] }, uo);
        if (D > 8) {
          B.box(x0, x1, 10.4, 10.7, 0.2, D, lw, 0, 0xcfd3d8, { front: [9, 0], top: [9, 0] }, uo);
          B.box(x0, x1, 10.7, 14, 2.6, D, lw, 0, 0xffffff, { front: [2, k % 5 + 3], back: [9, 0], top: [9, 0] }, uo);
        }
        B.box(x0 - 0.05, x1 + 0.05, hT, hT + 0.5, -2.0, D + 1.5, lw, 0, 0x8d949c, { front: [9, 0], top: [8, 0] }, uo);
      }, 1.5, D === 5)) break; // el último intento (urbanos estrechos) solo tiene que caber de cerca
      // el puesto de cada equipo en el muro del pit-lane, delante de su garaje
      if (open && Math.abs(sc - tc) < segL * 0.55) tryAdd(() => {
        B.at(tc, PS);
        B.box(-3.2, 3.2, 0, 2.3, -0.6, 0.8, wallLw, 0, 0x2a2e34, { front: [9, 0] });
        B.box(-3.5, 3.5, 2.3, 2.6, -1.3, 1.4, wallLw, 0, tm.color, { front: [9, 0] });
      });
      // motorhome del equipo en el paddock, detrás de su garaje
      if (open && Math.abs(sc - tc) < segL * 0.55) tryAdd(() => {
        B.at(tc, PS);
        B.box(-6.5, 6.5, -3, 3.2, 25, 33, lw, 0, tm.color, { front: [0, 0], top: [9, 0] });
        B.box(-6.5, 6.5, 3.2, 6.4, 25.3, 33, lw, 0, 0xffffff, { front: [2, ti], top: [8, 0] });
      });
    }
    // torre de control, detrás del centro del edificio
    const sc = (sA + sB) / 2, lw = ramp(sc) * PIT_OFF + 1.35;
    tryAdd(() => {
      B.at(sc, PS);
      B.box(-5, 5, -3, 24, 21, 31, lw, 0, 0xe4e7ea, { front: [9, 0], top: [9, 0] });
      B.panel(-4.6, 4.6, 19.8, 22.6, 20.95, lw, 0, 3, 0, 1.6);
      B.box(-6.5, 6.5, 24, 29, 19.5, 32.5, lw, 0, 0xffffff, { front: [2, 3], top: [9, 0] });
      B.box(-7, 7, 29, 29.6, 19, 33, lw, 0, 0x6d747c, { front: [9, 0], top: [8, 0] });
      B.box(-0.15, 0.15, 29.6, 36, 25.8, 26.2, lw, 0, 0xb8bec5);
      B.box(-0.5, 0.5, 36, 36.6, 25.5, 26.5, lw, 0, 0xffffff, { front: [10, 0], top: [10, 0] });
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
        B.panel(-L2, L2, 0.55, 2.15, -0.02, lw, lm, (ci * 5 + k) % 16, 0, 1);
        const Q = (x, y, z, u, v) => [x, y, z, lw, lm, u, v];
        B.quad(Q(-L2, 2.4, 0.5, uo - L2, 0), Q(L2, 2.4, 0.5, uo + L2, 0), Q(L2, H, D, uo + L2, sl), Q(-L2, H, D, uo - L2, sl), seat, 1, ci);
        B.box(-L2, L2, -2.5, H + 1.2, D, D + 0.5, lw, lm, 0xc4c9cf, { front: [9, 0], top: [9, 0] }, uo);
        const ra = [D + 0.8, H + 5.6], rb = [-1.4, H + 4.3];
        B.quad(Q(-L2, rb[1], rb[0], uo - L2, 0), Q(L2, rb[1], rb[0], uo + L2, 0), Q(L2, ra[1], ra[0], uo + L2, 1), Q(-L2, ra[1], ra[0], uo - L2, 1), 0x9aa1a9, 8, 0);
        B.quad(Q(-L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, rb[1] - 0.35, rb[0], 0, 0), Q(L2, ra[1] - 0.35, ra[0], 0, 0), Q(-L2, ra[1] - 0.35, ra[0], 0, 0), 0x5a6068, 0, 0);
        B.box(-L2, L2, rb[1] - 0.35, rb[1], rb[0] - 0.05, rb[0] + 0.05, lw, lm, 0x5a6068);
        if (k % 2 === 0) B.box(-0.25, 0.25, H + 1.2, ra[1] - 0.2, D + 0.05, D + 0.45, lw, lm, 0x7a8088, { front: [9, 0] });
        // banderas de los aficionados, que ondean
        for (let fq = 0; fq < 2; fq++) if (rnd2() < 0.55) {
          const fx0 = (rnd2() * 2 - 1) * (L2 - 1.5), ff = 0.15 + rnd2() * 0.75, fz = 0.5 + ff * (D - 0.5), fy = 2.4 + ff * (H - 2.4), seed = Math.floor(rnd2() * 40);
          B.box(fx0 - 0.03, fx0 + 0.03, fy, fy + 2.3, fz - 0.03, fz + 0.03, lw, lm, 0x333333);
          B.quad(Q(fx0, fy + 1.5, fz, 0, 0), Q(fx0 + 1.3, fy + 1.5, fz, 1, 0), Q(fx0 + 1.3, fy + 2.3, fz, 1, 1), Q(fx0, fy + 2.3, fz, 0, 1), 0xffffff, 11, seed);
        }
        for (const [kk, x] of [[0, -L2], [nS - 1, L2]]) if (k === kk) B.quad(Q(x, -2.5, 0.5, 0, 0), Q(x, 2.4, 0.5, 0, 0), Q(x, H + 1.2, D, 0, 0), Q(x, -2.5, D, 0, 0), 0xc4c9cf, 9, 0);
      })) ok++;
    }
    if (ok) { busy[sg === PS ? 0 : 1].push([s0, s1]); standS.push([(s0 + s1) / 2, sg, s1 - s0]); }
  };
  grandstand(-170, 140, -PS, street ? 12 : 22, street ? 10 : 15, 0); // tribuna principal, enfrente de los boxes
  const vr2 = brakes.slice().sort((a, b) => vr[a] - vr[b]).slice(0, street ? 3 : 5);
  vr2.forEach((bi, k) => { const sg = track.curv[bi] > 0 ? 1 : -1, sb = bi * T.ds; grandstand(sb - 150, sb - 10, sg, street ? 10 : 14, street ? 8 : 10.5, k + 1); });
  // torres de las cámaras de tele (en el mismo sitio que la cámara «Tele» a velocidad normal)
  { const nCam = Math.max(3, Math.round(T.L / 360)), sp = T.L / nCam, h = 9 + sp * 0.012 - 1.5;
    for (let k = 0; k < nCam; k++) {
      const cs = k * sp, sg = -PS;
      if (isBusy(sg, cs - 8, cs + 8)) continue;
      const st = street, lm = st ? run(sg, iOf(cs)) + 2.3 : run(sg, iOf(cs)) + 0.9, lw = st ? T.SH - 0.08 : 1.7, a = st ? 0.6 : 1.2;
      if (tryAdd(() => {
        B.at(cs, sg);
        B.box(-a, a, -2, h, -a, a, lw, lm, 0xffffff, { front: [7, 0], side: [7, 0], top: [9, 0] });
        B.box(-a - 0.4, a + 0.4, h, h + 0.25, -a - 0.4, a + 0.4, lw, lm, 0x5b6169, { front: [9, 0], top: [9, 0] });
        B.box(-0.3, 0.5, h + 0.25, h + 0.9, -0.3, 0.3, lw, lm, 0x1a1c20);
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
    }, 0.2));
  }
  // calles: una fila de edificios a cada lado, pegados a la acera, y manzanas detrás
  if (street) {
    const tower = track.id === "singapur";
    const PAL = tower ? [0x6f8fa6, 0x8aa5b5, 0x5c7a8c, 0xaab8c2, 0x7d9aa0, 0xd9dcdf, 0x9bb7c9] : [0xe9dcc0, 0xd9b77e, 0xe3a68a, 0xefe2a8, 0xf1ede4, 0xe9b9a9, 0xcfc3a8, 0xf0d6b0];
    for (const sg of [1, -1]) {
      let s = 0;
      while (s < T.L) {
        const curvy = Math.abs(track.curv[iOf(s)]) > 0.01, len = curvy ? 7 + rnd2() * 5 : 12 + rnd2() * 14;
        if (rnd2() < 0.12) { s += 8 + rnd2() * 8; continue; } // bocacalle
        const sc = s + len / 2;
        if (!isBusy(sg, s, s + len) && !(sg === PS && ramp(sc) > 0.02)) {
          const h = tower ? 14 + rnd2() * 26 : 10 + rnd2() * 15, D = 12 + rnd2() * 10, c = PAL[Math.floor(rnd2() * PAL.length)], seed = Math.floor(rnd2() * 50), roof = !tower && rnd2() < 0.5;
          const lm = run(sg, iOf(sc)) + 3, lw = T.SH - 0.08;
          // en la orilla no hay edificio: se ve el agua
          const pc = sample(sc, mkS()), lat = sg * (lw * W_REAL + lm + D / 2), wet = T.env && T.env.wet(pc.x + pc.rx * lat, pc.z + pc.rz * lat);
          if (!wet) for (const dd of [D, D * 0.5]) if (tryAdd(() => {
            B.at(sc, sg);
            B.box(-len / 2, len / 2, -4, h, 0, dd, lw, lm, c, { front: [tower ? 6 : 5, seed], top: [8, 0] });
            if (roof) B.box(-len / 2 - 0.3, len / 2 + 0.3, h, h + 0.7, -0.4, dd + 0.4, lw, lm, 0xa65a3a, { front: [9, 0], top: [8, 0] });
            if (!tower && rnd2() < 0.25) B.panel(-len / 2 + 1, Math.min(len / 2 - 1, -len / 2 + 9), 4.2, 5.8, -0.05, lw, lm, Math.floor(rnd2() * 16), 0, 1);
          }, 1)) break;
        }
        s += len;
      }
    }
    // manzanas lejos de la pista (no se ensanchan). Las calles siguen la pista (cada bloque se orienta como el tramo
    // más cercano); Mónaco crece en altura ladera arriba y Singapur toma la altura de sus torres del modelo de superficie.
    const list = [], ext = E * 0.72 + 260, used = new Set(), CS = 12;
    const free = (x, z, r) => { for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b2 = Math.floor((z - r) / CS); b2 <= Math.floor((z + r) / CS); b2++) if (used.has(a + "," + b2)) return false; return true; };
    const take = (x, z, r) => { for (let a = Math.floor((x - r) / CS); a <= Math.floor((x + r) / CS); a++) for (let b2 = Math.floor((z - r) / CS); b2 <= Math.floor((z + r) / CS); b2++) used.add(a + "," + b2); };
    for (let t = 0; t < 14000 && list.length < 2600; t++) {
      const x = (rnd2() * 2 - 1) * ext, z = (rnd2() * 2 - 1) * ext, w = 12 + rnd2() * 20, d = 12 + rnd2() * 18;
      const dist = trackDist(x, z), near = tdNear, need = Math.max(T.SH * T.Wov + 8, T.SH * W_REAL + 32) + Math.hypot(w, d) / 2;
      if (dist < need || park(x, z) > 0.3 || (T.env && T.env.wet(x, z)) || !free(x, z, Math.min(w, d) * 0.45)) continue;
      const nx = (near + 2) % n, ang = Math.atan2(-(T.Z[nx] - T.Z[near]), T.X[nx] - T.X[near]) + (rnd2() - 0.5) * 0.15;
      let h;
      if (tower) {
        const above = T.env ? T.env.abs(x, z) - (-T.env.sea + 2) : 0;
        h = above > 20 ? above * (0.9 + rnd2() * 0.2) : 14 + rnd2() * 22;
      } else h = 9 + rnd2() * 12 + (T.env ? 26 * sstep(15, 110, T.env.abs(x, z)) : 0);
      h = Math.min(h, 14 + (dist - need) * (tower ? 1.3 : 0.6));
      take(x, z, Math.min(w, d) * 0.45);
      list.push([x, terr(x, z, 0).h, z, w, h, d, ang, PAL[Math.floor(rnd2() * PAL.length)]]);
    }
    if (list.length) {
      const city = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat(tower ? 6 : 5), list.length));
      const qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
      list.forEach(([x, y, z, w, h, d, a, c], k) => { m4.compose(vv.set(x, y - 3, z), qq.setFromAxisAngle(yAx, a), sc3.set(w, h + 3, d)); city.setMatrixAt(k, m4); city.setColorAt(k, col.setHex(c)); });
      city.castShadow = city.receiveShadow = true; city.frustumCulled = false;
    }
  }
  // torres de focos de las carreras de noche: un poste junto a la valla cada 85 m, alternando lados, con la batería de
  // focos en un brazo sobre la pista
  const towers = [], night = track.id === "singapur" || track.id === "bahrein";
  if (night) for (let k = 0; k < Math.floor(T.L / 85); k++) {
    const s = 40 + k * 85, sg = k % 2 ? PS : -PS;
    if (sg === PS && ramp(s) > 0.02) continue;
    const lw = T.SH - 0.08, lm = run(sg, iOf(s)) + 2.2;
    if (tryAdd(() => {
      B.at(s, sg);
      B.box(-0.22, 0.22, -1, 13, -0.22, 0.22, lw, lm, 0x4a4f57, { front: [9, 0], top: [9, 0] });
      B.box(-0.12, 0.12, 12.6, 12.85, -3.4, 0.1, lw, lm, 0x4a4f57, { front: [9, 0] });
      B.box(-1.1, 1.1, 12.1, 12.55, -3.6, -2.4, lw, lm, 0x2a2d31, { front: [9, 0], top: [9, 0] });
      B.box(-1.0, 1.0, 12.05, 12.1, -3.5, -2.5, lw, lm, 0xffffff, { front: [10, 0], top: [10, 0] });
    }, -4.5, true)) towers.push({ s, sg, lw: lw * arrAt(T.wr, s), lm, z: -3.0, y: 12.0 });
  }
  // puestos de comisarios, cada 380 m por fuera de la valla (con su bandera, que sale cuando hace falta)
  const posts = [];
  for (let k = 0; k < Math.floor(T.L / 380); k++) {
    const s = 190 + k * 380, sg = -PS, lw = T.SH, lm = run(sg, iOf(s)) + 4.0;
    if (tryAdd(() => { B.at(s, sg); B.box(-1.3, 1.3, -1, 2.3, -1, 1, lw, lm, 0xe8791f, { front: [9, 0], top: [9, 0] }); }, 0.5)) posts.push({ s, sg, lw: lw * arrAt(T.wr, s), lm });
  }
  add(B.mesh());
  const flags = add(new THREE.InstancedMesh(FLAG_GEO, FLAG_MAT, Math.max(1, posts.length)));
  flags.frustumCulled = false; flags.castShadow = true; flags.count = 0;
  for (let k = 0; k < posts.length; k++) flags.setColorAt(k, col.set(0xffd200));
  const scCar = add(new THREE.Mesh(SC_GEO, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 })));
  const scBar = add(new THREE.Mesh(SC_BAR, new THREE.MeshBasicMaterial({ color: 0xffa000 })));
  scCar.matrixAutoUpdate = scBar.matrixAutoUpdate = false; scCar.visible = scBar.visible = false; scCar.castShadow = true; scCar.frustumCulled = scBar.frustumCulled = false;

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
  for (const [name, size] of [["aCar", 3], ["aDir", 3], ["aPar", 4]]) sg.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(NC * SPRAY_P * size), size).setUsage(THREE.DynamicDrawUsage));
  sg.instanceCount = 0;
  const spray = add(new THREE.Mesh(sg, SPRAY_MAT)); spray.frustumCulled = false; spray.renderOrder = 12;
  // segundo color por coche
  const c2a = new Float32Array(NC * 3);
  sess.cars.forEach((c, i) => { col.set(SECOND[c.team.id] || "#e2e4e8"); c2a.set([col.r, col.g, col.b], i * 3); });
  const livSrc = Float32Array.from(sess.cars, (c) => Math.max(0, TEAMS.indexOf(c.team)));
  for (const g of [CAR_LO, CAR_GEO]) {
    g.setAttribute("aCol2", new THREE.InstancedBufferAttribute(c2a.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aLiv", new THREE.InstancedBufferAttribute(livSrc.slice(), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aDmg", new THREE.InstancedBufferAttribute(new Float32Array(NC), 1).setUsage(THREE.DynamicDrawUsage));
  }
  const steer = inst(STEER_GEO, STEER_MAT, NC, 10);
  const crewS = inst(CREW_STAND, CREW_MAT, NC * 12, 10), crewC = inst(CREW_CROUCH, CREW_MAT, NC * 4, 10), jacks = inst(JACK_GEO, JACK_MAT, NC * 2, 10);
  const loose = inst(WHEEL_GEO, WHEEL_MAT, NC * 8, 10);
  // tras un accidente: restos, comisarios y la grúa
  const debris = inst(new THREE.BoxGeometry(0.5, 0.08, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.6 }), NC * 7, 9);
  // pluma (amarilla) y cable (negro): cajas de 1 m estiradas entre dos puntos
  const beams = inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2 }), NC * 2, 10);
  for (let i = 0; i < NC * 2; i++) beams.setColorAt(i, col.set(0xf2c00d));
  beams.count = 0; beams.castShadow = true;
  const marsh = inst(CREW_STAND, CREW_MAT, NC * 3, 10), crane = inst(CRANE_GEO, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), NC, 10);
  for (let i = 0; i < NC * 7; i++) debris.setColorAt(i, col.set(0x222222));
  for (let i = 0; i < NC * 3; i++) marsh.setColorAt(i, col.set(0xff6a00));
  debris.count = marsh.count = crane.count = 0; marsh.castShadow = crane.castShadow = true;
  // puño en alto de los tres primeros en la vuelta de honor, y el comisario de la bandera a cuadros
  const fists = inst(FIST_GEO, CREW_MAT, 3, 11);
  for (let i = 0; i < 3; i++) fists.setColorAt(i, col.set(0xffffff));
  fists.count = 0;
  const chk = add(new THREE.Group());
  { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 96; const g = cv.getContext("2d");
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4"; g.fillRect(x * 16, y * 16, 16, 16); }
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 10, 3).translate(0.75, 0, 0), new THREE.MeshStandardMaterial({ map: srgb(new THREE.CanvasTexture(cv)), side: THREE.DoubleSide, roughness: 0.8 }));
    cloth.material.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, { uTime: U.uTime });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += sin(uTime * 11.0 - position.x * 4.0) * 0.18 * position.x;"); };
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6).translate(0, 0.65, 0), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const arm = new THREE.Group(); cloth.position.y = 1.1; arm.add(stick, cloth); arm.position.y = 1.55; arm.name = "brazo";
    const man = new THREE.Mesh(CREW_STAND, new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.8 }));
    chk.add(man, arm); chk.visible = false; chk.traverse((o) => { o.castShadow = true; o.frustumCulled = false; }); }
  const blank = inst(BLANKET_GEO, CREW_MAT, NC * 4, 10);
  for (let i = 0; i < NC * 4; i++) blank.setColorAt(i, col.set(0xffffff));
  blank.count = 0; blank.castShadow = true;
  const gant = inst(GANTRY_GEO, JACK_MAT, NC, 10), glit = inst(new THREE.BoxGeometry(0.3, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), NC, 10);
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
  world = { all, townLights, sparkMesh, fists, chk, beams, towers, night, lampPos, debris, marsh, crane, blank, gant, glit, markMesh, posts, flags, scCar, scBar, road, cars, wheels, crewS, crewC, jacks, loose, puffs, blobs, spray, discs, rings, lamps, poles, halos, decals, steer, carIdx, c2src: c2a.slice(), carsHi, wheelsHi, col2: CAR_LO.attributes.aCol2, livSrc, liv: CAR_LO.attributes.aLiv, dmg: CAR_LO.attributes.aDmg, col2H: CAR_GEO.attributes.aCol2, livH: CAR_GEO.attributes.aLiv, dmgH: CAR_GEO.attributes.aDmg, cell: dg.attributes.aCell };
  U.uL.value = T.L;
  wetT = cloudT = lightT = -1e9;
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

/** Nubes y lluvia del juego en una textura sobre el circuito: R = lluvia, G = sombra de nube. */
let cloudT = -1e9, rainHere = 0;
function updateCloud(now) {
  if (now - cloudT < 450) return;
  cloudT = now;
  const w = sess.weather, TR = U.uTexR.value, t = w.clock;
  const wx = Math.cos(w.windDir) * w.windSpeed / 60, wy = Math.sin(w.windDir) * w.windSpeed / 60;
  let rmax = 0;
  for (let iz = 0; iz < CN; iz++) for (let ix = 0; ix < CN; ix++) {
    const X = ((ix + 0.5) / CN * 2 - 1) * TR, Z = ((iz + 0.5) / CN * 2 - 1) * TR;
    const xk = (X + T.cx) / 1000, yk = (-Z + T.cy) / 1000;
    const rain = rainAt(w, xk, yk);
    let cl = 0;
    for (const c of w.cells) {
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(c.age / c.life, 0, 1))), 0.6), rad = Math.max(2, 2.5 * c.sigma);
      cl += 0.85 * Math.min(1, env * 1.5) * Math.exp(-((xk - c.x) ** 2 + (yk - c.y) ** 2) / (2 * rad * rad));
    }
    const nx = xk * 1.3 - wx * t, ny = yk * 1.3 - wy * t;
    const cum = sstep(0.66 - 0.4 * w.baseCloud, 0.84, 0.6 * vnoise(nx, ny) + 0.4 * vnoise(nx * 2.3 + 9, ny * 2.3 + 4)) * 0.75;
    const shade = clamp(Math.max(cl * (0.6 + 0.6 * vnoise(nx * 0.7, ny * 0.7)), cum) + Math.min(0.5, rain / 6), 0, 1);
    const o = (iz * CN + ix) * 4;
    cloudData[o] = clamp(rain / 3, 0, 1) * 255; cloudData[o + 1] = shade * 255; cloudData[o + 3] = 255;
    if (rain > rmax) rmax = rain;
  }
  cloudTex.needsUpdate = true;
  rainHere = rmax;
  updateSkyWeather(now);
}
/** Lo que se ve en el cielo sale de las mismas células y la misma llovizna que dibuja el radar. */
let wxT = -1e9, wxMean = 0;
function updateSkyWeather(now) {
  const w = sess.weather;
  // las nubes viajan con el viento de altura, igual que las células
  const k = w.clock * w.windSpeed / 60 / 2.6;
  skyU.uWind.value.set(-Math.cos(w.windDir) * k, Math.sin(w.windDir) * k);
  if (now - wxT < 2000) return;
  wxT = now;
  let sum = 0;
  for (let iz = 0; iz < WN; iz++) for (let ix = 0; ix < WN; ix++) {
    const xk = (((ix + 0.5) / WN * 2 - 1) * WX_R + T.cx) / 1000, yk = (-((iz + 0.5) / WN * 2 - 1) * WX_R + T.cy) / 1000;
    const rain = rainAt(w, xk, yk);
    let cl = w.baseCloud;
    for (const c of w.cells) {
      const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp(c.age / c.life, 0, 1))), 0.6), rad = Math.max(2, 2.5 * c.sigma * Math.max(1, c.ax) ** 0.5);
      cl += 0.85 * Math.min(1, env * 1.5) * Math.exp(-((xk - c.x) ** 2 + (yk - c.y) ** 2) / (2 * rad * rad));
    }
    // donde llueve hay nube siempre, aunque el borde de la célula quede fuera de su mancha
    const cover = clamp(Math.max(cl, rain > 0.05 ? 0.75 + rain * 0.1 : 0), 0, 1), o = (iz * WN + ix) * 4;
    wxData[o] = Math.sqrt(clamp(rain / 6, 0, 1)) * 255; wxData[o + 1] = cover * 255; wxData[o + 3] = 255;
    sum += cover;
  }
  wxMean = sum / (WN * WN);
  wxTex.needsUpdate = true;
}

// ------------------------------------------------------------------ luz según la hora
let lightT = -1e9, dayK = 1;
const sunDir = new THREE.Vector3(0.4, 0.7, 0.4);
const C = (h) => new THREE.Color(h), _c1 = C(0), _c2 = C(0), _c3 = C(0);
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
function updateLight(now) {
  updateStorm(now);
  if (now - lightT < 700) return;
  lightT = now;
  const h = sess.weather.clock / 60, lat = track.def.clima?.latitud ?? 45, DEG = Math.PI / 180;
  let el = 62 * DEG * Math.sin(Math.PI * (h - 6.2) / 13.6), az = (h - 13) * 15 * DEG;
  if (hourMode === "tarde") { el = 8 * DEG; az = 78 * DEG; }
  if (hourMode === "noche") { el = -25 * DEG; az = 120 * DEG; }
  const cloud = clamp(sess.weather.cloud ?? 0, 0, 1);
  const day = dayK = sstep(-4 * DEG, 9 * DEG, el), warm = (1 - sstep(4 * DEG, 28 * DEG, el)) * day;
  if (day > 0.02) sunDir.set(-Math.sin(az) * Math.cos(el), Math.max(0.1, Math.sin(el)), Math.cos(az) * Math.cos(el) * (lat < 0 ? -1 : 1)).normalize();
  else sunDir.set(0.35, 0.8, 0.3).normalize();
  sun.color.setHex(0xfff3dd).lerp(_c1.setHex(0xff9a52), warm);
  if (day <= 0.02) sun.color.setHex(0x8fa8ff);
  // intensidades en unidades físicas de three (π ≈ «blanco a pleno sol»); de noche el «sol» es la luna
  sun.intensity = day > 0.02 ? 3.0 * day * (1 - 0.8 * cloud) : 0.35;
  const grey = cloud * 0.85 * day;
  const zen = _c1.copy(SKY.zNight).lerp(_c3.copy(SKY.zDay).lerp(SKY.zDusk, warm), day).lerp(SKY.zGrey, grey);
  const hor = _c2.copy(SKY.hNight).lerp(_c3.copy(SKY.hDay).lerp(SKY.hDusk, warm * 0.8), day).lerp(SKY.hGrey, grey);
  skyU.uZen.value.copy(zen); skyU.uHor.value.copy(hor); skyU.uSun.value.copy(sunDir); skyU.uNight.value = 1 - day;
  skyU.uSunCol.value.copy(sun.color).multiplyScalar(day > 0.02 ? day * (1 - 0.7 * cloud) : 0.25);
  skyU.uCloudCol.value.setRGB(1, 1, 1).lerp(hor, 0.3 + 0.4 * cloud).multiplyScalar((0.25 + 0.75 * day) * 1.1);
  // el suelo que ve el entorno: lo que el sol y el cielo sacan del verde (o del gris en los urbanos)
  skyU.uGround.value.setHex(T.street ? 0x3a3d42 : 0x26381f).multiplyScalar(0.25 + 0.9 * day * (1 - 0.5 * cloud));
  fog.color.copy(hor);
  SPRAY_MAT.uniforms.uCol.value.setRGB(0.8, 0.84, 0.88).lerp(hor, 0.35).multiplyScalar(0.2 + 0.7 * day);
  renderer.setClearColor(hor, 1);
  // al atardecer y de noche el cielo apenas alumbra: sube un poco lo que aporta el entorno para que se siga viendo
  scene.environmentIntensity = (1 + 0.6 * (1 - day) + 0.6 * warm) * (1 + 2.5 * flashK(now));
  skyU.uFlash.value = flashK(now) * (0.6 + 0.6 * (1 - day));
  updateEnv(now, [sunDir.x, sunDir.y, sunDir.z, zen.r, zen.g, zen.b, hor.r, hor.g, hor.b, cloud, wxMean, Math.min(rainHere, 3) / 2].map((v) => v.toFixed(2)).join());
  U.uFlood.value = (1 - day) * 0.8;
  skyU.uCity.value = T.street ? 1 : 0.3;
  // luces de los pueblos en el horizonte: con la noche (solo en calidad 2 y 3)
  if (world.townLights) { const k = sstep(0.25, 0.75, 1 - day); world.townLights.visible = q >= 2 && k > 0.01; world.townLights.material.opacity = k; }
  world.lamps.visible = world.poles.visible = world.halos.visible = day < 0.5 && !world.night;
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
let canPost = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float"));
if (!canPost) q = Math.min(q, 1);
let post = null, dofK = 0, dofFocus = 50, aoRadius = 1;
function makePost() {
  const depth = new THREE.DepthTexture(2, 2);
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType }));
  const ao = new GTAOPass(scene, camera, 2, 2, { depthTexture: depth });
  ao.updateGtaoMaterial({ samples: 16, distanceExponent: 1, distanceFallOff: 1, thickness: 1, scale: 1.5, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  const dof = new ShaderPass(DOF_SHADER);
  dof.uniforms.tDepth.value = depth;
  const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.25, 0.6, 1.4);
  for (const p of [new TexturePass(rt.texture), ao, dof, bloom, new OutputPass()]) composer.addPass(p);
  return { rt, composer, ao, dof, bloom };
}
let lastInfo = { calls: 0, tris: 0, q };
function render() {
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
    } catch (e) { console.warn("mapa 3D: sin postproceso", e); post = null; q = 1; applyQuality(); return; }
  }
  sun.castShadow = q > 0;
  const ms = Q_SHADOW[q];
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (world) {
    world.blobs.visible = q === 0;
    // las sombras de cientos de árboles cuestan tanto como los árboles: solo en calidad máxima
    const tr = world.all.find((o) => o.name === "arboles"); if (tr) tr.castShadow = q >= 3;
  }
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
    uniforms: { uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(100, 100, 100) }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uTex: U.uCloud, uTexR: U.uTexR },
    vertexShader: `attribute float aEnd; uniform vec3 uCenter, uSize; uniform float uTime, uTexR; uniform vec2 uWind; uniform sampler2D uTex; varying float vA;
      void main(){ vec3 q = fract(position + vec3(uWind.x * uTime * 0.25, -uTime * (0.9 + position.x * 0.5), uWind.y * uTime * 0.25)) - 0.5;
        vec3 p = uCenter + q * uSize; p.y += uSize.y * 0.45; p += aEnd * vec3(uWind.x * 0.4, -1.0, uWind.y * 0.4) * uSize.y * 0.035;
        vA = texture2D(uTex, p.xz / (2.0 * uTexR) + 0.5).r; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.62, 0.72, 1.0, min(0.4, vA * 1.1));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 20; scene.add(l);
  return l;
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
      col = mix(col, vec3(0.16, 0.12, 0.08), dt * (1.0 - a)); a = max(a, dt * 0.85);
      gl_FragColor = vec4(col * uLum, a);
      #include <colorspace_fragment>
    }`,
});
const lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), LENS_MAT);
lens.frustumCulled = false; lens.renderOrder = 999; lens.visible = false; scene.add(lens);
const dirtOf = new Map(); // suciedad acumulada por coche (0..1)

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
/** ¿Pisa grava (1), hierba (0,5) o nada? */
function fxGround(p, W, l0) {
  if (T.street) return 0;
  const i = Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds)), r = (Math.sign(l0) === T.PS ? T.rP : T.rO)[i], a = Math.abs(l0) / (W * arrAt(T.wr, p.s));
  if (a < 1.05) return 0;
  return a > 1.28 && r > 3 ? 1 : 0.5;
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
  const line = arrAt(T.line, s) * (1 - 0.45 * far) * (1 - Math.min(1, Math.abs(p.lat) / 0.3) * 0.65);
  if (p.c.loc === "pit" || p.c.loc === "lane_out" || p.c.loc === "lane_in" || p.gar || p.lane2) { const r = pitRamp(s); return line * (1 - r) + T.PS * (r * PIT_OFF + p.box * 0.95); }
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
    if (!p) { p = mkS(); p.c = c; p.lat = 0; p.want = 0; p.box = 0; p.acc = 0; p.roll = 0; pose.set(c.id, p); }
    const p0 = prevS.get(c.id), jump = p0 === undefined || Math.abs(c.s - p0) > 40;
    p.s = jump ? c.s : p0 + (c.s - p0) * alpha;
    let boxT = 0;
    p.pf = -1;
    if (c.loc === "pit" && c.pit) {
      // la simulación cruza el pit-lane a velocidad constante: aquí el coche frena, se para delante de su garaje y sale
      const f = clamp((c.pit.t - (1 - alpha) * sess.dt) / c.pit.total, 0, 1), ga = gaV.get(c.team.id) ?? sess.garageAt(c), A = PIT_A, B = PIT_B;
      const g = f < A ? ga * (1 - (1 - f / A) ** 2) : f < B ? ga : ga + (1 - ga) * ((f - B) / (1 - B)) ** 2;
      p.s = c.pit.entryS + c.pit.dist * g;
      boxT = sstep(A - 0.1, A, f) - sstep(B, B + 0.1, f);
      p.pf = f;
      // el compuesto que traía: la simulación cambia el juego a mitad de la parada
      if (f < 0.49 && c.tyres) p.oldC = c.tyres.c;
      p.newC = c.e.sets.find((x) => x.id === c.pit.setId)?.c ?? c.tyres?.c;
    } else if (c.tyres) p.oldC = c.tyres.c;
    // garaje y calle de boxes de libres/clasificación: sale de su garaje marcha atrás… de frente, y vuelve a él
    p.gar = 0; p.lane2 = false; p.cool = -1;
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
      if (c.loc === "lane_out") { p.s = track.pit.entry + laneLen * (gaC + (1 - gaC) * f); boxT = 1 - sstep(0.04, 0.16, f); p.gar = 1 - sstep(0, 0.05, f); }
      else { p.s = track.pit.entry + laneLen * gaC * f; boxT = sstep(0.84, 0.95, f); p.gar = sstep(0.95, 1, f); }
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
    p.boxT = boxT; p.want = 0; p.tn = tNow;
    list.push(p);
  }
  const L = T.L, W = curW, carLen = 5.6 * carK(W);
  list.sort((a, b) => mod(b.s, L) - mod(a.s, L));
  for (let i = 0; i < list.length; i++) {
    const me = list[i], front = list[(i - 1 + list.length) % list.length];
    if (me === front || me.c.loc !== "track" || front.c.loc !== "track") continue;
    if (mod(front.s - me.s, L) < carLen * 1.3) {
      const sgn = front.want > 0 ? -1 : front.want < 0 ? 1 : (me.c.id & 1 ? 1 : -1);
      if (front.want === 0) front.want = -sgn * 0.3;
      me.want = sgn * 0.4;
    }
  }
  const simDt = dtReal * (isPaused() ? 0 : Math.min(8, curSpeed())), k1 = 1 - Math.exp(-simDt / 0.7), k2 = 1 - Math.exp(-simDt / 0.2);
  for (const p of list) {
    const c = p.c;
    p.lat += (p.want - p.lat) * k1;
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
    p.px = p.x + p.rx * l0; p.py = p.y; p.pz = p.z + p.rz * l0;
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
const _v = new THREE.Vector3(), probe = new THREE.PerspectiveCamera(36, 1, 5, 80000);
function ovPose(az, dist, shift, out) {
  const ch = Math.cos(ov.el), sh = Math.sin(ov.el), dx = Math.cos(az), dz = Math.sin(az);
  out.look.set(dx * shift, T.hmean, dz * shift);
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
function setCam(m) {
  if (m === camMode) return;
  camMode = m; teleIdx = -1;
  camFrom = { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov }; camT = 0;
}
const _tp = mkS(), _tq = mkS(), _hv = new THREE.Vector3(), heliPos = new THREE.Vector3();
let heliOn = false;
const _up = new THREE.Vector3(0, 1, 0), _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sc = new THREE.Vector3();
/** Distancia (m, de cerca) del eje a la torre de la cámara de tele: en los urbanos, en la acera entre la valla y las casas. */
const tvLat = (i) => (T.street ? (T.SH - 0.08) * W_REAL + T.rO[i] + 2.3 : 1.7 * W_REAL + T.rO[i] + 0.9);
/** En la cámara de tele, como en la realización: si alguien acaba de trompear, salirse o estrellarse, se corta a él. */
function camTarget() {
  if (camMode === "tele") {
    let best = null, bt = 1e9;
    for (const p of pose.values()) if (p.fxK && p.fxK !== "lock" && p.fxTau < (p.fxK === "crash" ? 7 : 4.5) && p.fxTau < bt) { best = p.c; bt = p.fxTau; }
    if (best) return best;
  }
  return followCar();
}
function updateCamera(dt, now) {
  const tgt = camTarget(), p = tgt && pose.get(tgt.id);
  let mode = camMode;
  if (!p && mode !== "circuito") mode = "circuito";
  // pit-lane: solo con el coche en boxes (entrando, parado o saliendo, o en su garaje); si no, se le sigue de cerca
  const inPits = p && (p.pf >= 0 || p.gar > 0 || p.lane2 || p.c.loc === "lane_out" || p.c.loc === "lane_in");
  if (mode === "boxes" && !inPits) mode = "seguir";
  if (mode !== "heli") heliOn = false;
  let cut = false, onboard = false;
  const fast = Math.sqrt(Math.max(1, opt.speed() / 4));
  if (mode === "circuito") {
    if (!opt.paused()) swayT += dt; // en pausa la vista se queda quieta
    const sway = reduced ? 0 : 0.11 * Math.sin(swayT * 2 * Math.PI / 48);
    ovPose(ov.az + sway, ov.dist * 1.03, ov.shift, want); want.fov = 36;
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
    want.pos.set(p.px - p.fx * 0.25 * k + hx * 1.32 * k, p.py + hy * 1.32 * k - p.fy * 0.25 * k, p.pz - p.fz * 0.25 * k + hz * 1.32 * k);
    sample(p.s + 26, _tp);
    const la = latAt(p, p.s + 26, curW, 0) * curW * arrAt(T.wr, p.s + 26);
    want.look.set(_tp.x + _tp.rx * la, _tp.y + 0.6, _tp.z + _tp.rz * la);
    want.fov = 62;
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
    // grúa de meta: de lado y en alto sobre la recta de meta, al otro lado de los boxes; barre siguiendo al coche
    const ds = mod(p.s + T.L / 2, T.L) - T.L / 2; // dónde está el coche respecto a la línea (m)
    sample(clamp(ds, -90, 90) * 0.45, _tq);
    const out = -T.PS * ((T.SH + 1.4) * curW + 8);
    want.pos.set(_tq.x + _tq.rx * out, _tq.y + 13, _tq.z + _tq.rz * out);
    want.look.set(p.px, p.py + 0.8, p.pz);
    want.fov = clamp(2 * Math.atan(12 * fast / want.pos.distanceTo(want.look)) * 180 / Math.PI, 3, 50);
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
    want.look.set(p.px, p.py + 1, p.pz);
    const dist = want.pos.distanceTo(want.look);
    want.fov = clamp(2 * Math.atan(15 * fast / dist) * 180 / Math.PI, 4, 46);
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
  const dist = cur.pos.distanceTo(cur.look);
  camera.near = onboard ? 0.25 : Math.max(1.5, dist * 0.04);
  camera.updateProjectionMatrix(); camera.lookAt(cur.look);
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  sky.position.copy(cur.pos); skyU.uCam.value.set(cur.pos.x, cur.pos.z);
  // escala de maqueta: de lejos la pista y los coches engordan para leerse; de cerca, tamaño real
  const halfH = dist * Math.tan(cur.fov * Math.PI / 360);
  const wT = onboard || replay ? W_REAL : clamp(halfH * 0.0195, W_REAL, T.Wov);
  curW = cut || camSnap ? wT : curW + (wT - curW) * (1 - Math.exp(-dt / 0.2));
  fog.near = Math.max(dist * 1.3, 220); fog.far = Math.max(dist * 6, 3800);
  // el sol ilumina (y da sombra) alrededor de lo que mira la cámara
  // el tamaño va a saltos y el centro se mueve de téxel en téxel: así el borde de las sombras no tiembla al mover la cámara
  // con el sol bajo (atardecer) las sombras son largas: la caja de sombras se agranda para que no se corten
  const lowSun = 1 + 0.9 * (1 - sstep(0.18, 0.55, sunDir.y));
  const S0 = (onboard ? 75 : clamp(halfH * 2.1, 40, T.E * 0.9)) * lowSun, S = Math.pow(2, Math.ceil(Math.log2(S0) * 3) / 3), sc = sun.shadow.camera;
  const texel = (2 * S) / sun.shadow.mapSize.x;
  _sr.crossVectors(_up, sunDir).normalize(); _su.crossVectors(sunDir, _sr);
  _sc.copy(sunDir).multiplyScalar(cur.look.dot(sunDir)).addScaledVector(_sr, Math.round(cur.look.dot(_sr) / texel) * texel).addScaledVector(_su, Math.round(cur.look.dot(_su) / texel) * texel);
  sun.target.position.copy(_sc); sun.position.copy(_sc).addScaledVector(sunDir, S * 3.2);
  sc.left = sc.bottom = -S; sc.right = sc.top = S; sc.near = 1; sc.far = S * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = texel * 1.6;
  // postproceso: la oclusión abarca más o menos lo mismo en pantalla a cualquier distancia; el desenfoque, solo en tele
  aoRadius = clamp(halfH * 0.1, 0.5, 400);
  dofFocus = dist; dofK += ((mode === "tele" ? 1 : 0) - dofK) * (cut || camSnap ? 1 : 1 - Math.exp(-dt / 0.4));
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
/** Los 16 focos más cerca de lo que se mira, para sus reflejos en el asfalto mojado (solo de noche y con agua). */
const _lp = mkS(), _lv = new THREE.Vector3();
function updateLampRefl(W) {
  const u = U.uLamps.value;
  let wetMax = 0; for (let j = 0; j < sess.water.length; j += 3) wetMax = Math.max(wetMax, sess.water[j], sess.waterOff[j]);
  if (q < 2 || U.uFlood.value < 0.05 || wetMax < 0.03) { U.uNL.value = 0; return; } // en calidad baja, sin reflejos de los focos
  const us = Math.max(1, W / W_REAL), list = [];
  if (world.night) for (const t of world.towers) {
    sample(t.s, _lp);
    const L = t.sg * (t.lw * W + t.lm) + t.sg * t.z * us;
    list.push([_lp.x + _lp.rx * L, _lp.y + t.y * us, _lp.z + _lp.rz * L]);
  } else for (const q of world.lampPos) list.push([q.x, q.y, q.z]);
  const c = cur.look;
  list.sort((a, b) => (a[0] - c.x) ** 2 + (a[2] - c.z) ** 2 - ((b[0] - c.x) ** 2 + (b[2] - c.z) ** 2));
  const nL = Math.min(16, list.length);
  for (let j = 0; j < nL; j++) u[j].set(list[j][0], list[j][1], list[j][2], 1);
  U.uNL.value = nL;
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
let screenPts = [], rainClock = 0;
function draw3d(dt, now) {
  const list = updatePoses(dt);
  placeCars(list, curW);
  const halfH = updateCamera(dt, now);
  const W = curW, k = carK(W);
  const far = placeCars(list, W);
  record(list, W);
  U.uW.value = W; U.uS.value = Math.max(1, W / W_REAL);
  U.uDetail.value = clamp((T.Wov * 0.8 - W) / Math.max(1, T.Wov * 0.8 - W_REAL), 0, 1);
  updateWet(now); updateCloud(now); updateLight(now);
  if (!isPaused()) U.uTime.value = (U.uTime.value + dt * (replay ? REPLAY_SPEED : 1)) % 1000;
  U.uLight.value = rainHere > 0.3 ? (Math.floor(now / 160) % 2 ? 1 : 0.1) : 0.25;
  const { cars, wheels, blobs, spray, discs } = world;
  // malla fina solo de cerca y con calidad alta
  const fine = q >= 2 && far < 0.5, { carsHi, wheelsHi } = world, _zero = mS.clone().makeScale(0, 0, 0);
  let nH = 0;
  const dr = W * 0.6 * far;
  let i = 0, ns = 0, nS = 0, nC = 0, nJ = 0, nL = 0, nG = 0, nB = 0, nF = 0;
  const { fists } = world, podium = sess.chequered ? sess.cars.filter((o) => o.loc === "fin" && isFinite(o.finishT)).sort((a, b) => a.finishT - b.finishT).slice(0, 3).map((o) => o.id) : [];
  cs.d = cs.m = cs.c = cs.b = 0;
  const { crewS, crewC, jacks, loose, gant, glit, blank } = world;
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
    const th = clamp(p.acc / 55, -1, 0.4) * 0.05, ph = p.roll * 0.04;
    const f2x = fx + ux * th, f2y = fy + uy * th, f2z = fz + uz * th;
    const u2x = ux - fx * th + rx * ph, u2y = uy - fy * th + ry * ph, u2z = uz - fz * th + rz * ph;
    rx -= ux * ph; ry -= uy * ph; rz -= uz * ph;
    m4.set(f2x * k, u2x * k, rx * k, p.px,
      f2y * k, u2y * k, ry * k, p.py + (0.03 + 0.09 * lift + (p.gar >= 0.999 ? 0.08 : 0)) * k + (p.yUp || 0),
      f2z * k, u2z * k, rz * k, p.pz,
      0, 0, 0, 1);
    // malla fina solo para los coches cerca de la cámara (hasta 8); en la ligera, ese hueco queda vacío
    const hi = fine && nH < 8 && camera.position.distanceToSquared(_ws.set(p.px, p.py, p.pz)) < 150 * 150 ? nH++ : -1;
    cars.setMatrixAt(i, hi >= 0 ? _zero : m4); cars.setColorAt(i, _col.set(c.team.color));
    if (hi >= 0) { carsHi.setMatrixAt(hi, m4); carsHi.setColorAt(hi, _col); }
    const steer = clamp(Math.atan(3.5 * p.kap) * 1.6, -0.5, 0.5);
    _col.set(COMPOUND[c.tyres?.c] || "#888888");
    for (let w = 0; w < 4; w++) {
      const wd = WHEELS[w];
      mL.makeRotationY(wd[2] ? steer : 0).multiply(mS.makeRotationZ(-p.spin)).scale(_ws.set(1, 1, wd[3])).setPosition(wd[0], 0.36, wd[1]);
      if (off) mW.makeScale(0, 0, 0); else mW.multiplyMatrices(m4, mL);
      if (hi >= 0) { wheelsHi.setMatrixAt(hi * 4 + w, mW); wheelsHi.setColorAt(hi * 4 + w, _col); wheels.setMatrixAt(i * 4 + w, _zero); }
      else wheels.setMatrixAt(i * 4 + w, mW);
      wheels.setColorAt(i * 4 + w, _col);
      if (p.gar >= 0.999) { blank.setMatrixAt(nB, mW); blank.setColorAt(nB++, _c3.set(c.team.color)); } // en el garaje, con las mantas puestas
    }
    if (crewOn) {
      // mecánicos: salen corriendo del garaje antes de que llegue el coche, esperan en su sitio (las pistolas,
      // agachados) y vuelven corriendo cuando se va. Encima del morro, el semáforo de salida.
      mG.set(fx * k, 0, rx * k, p.px, 0, k, 0, p.py, fz * k, 0, rz * k, p.pz, 0, 0, 0, 1);
      const tc = _col.set(c.team.color), gs = T.PS, gz = gs * (0.42 * W * arrAt(T.wr, p.s) + 4) / k;
      const e = u < 0.5 ? sstep(-0.45, -0.1, u) : 1 - sstep(1.02, 1.35, u), moving = e > 0.001 && e < 0.999, ph = u * 40;
      const put = (mesh, idx, lx, lz, yw, colr = tc) => {
        // de su sitio (lx, lz) al garaje: mismo x, z del garaje; corriendo mira hacia donde va
        const x = lx, z = gz + (lz - gz) * e, bob = moving ? Math.abs(Math.sin(ph + lx * 3)) * 0.1 : 0;
        const ry = moving ? Math.atan2(-(u < 0.5 ? lz - gz : gz - lz), 0) : yw;
        mL.makeRotationY(ry).setPosition(x, bob, z); mW.multiplyMatrices(mG, mL); mesh.setMatrixAt(idx, mW); if (mesh.instanceColor) mesh.setColorAt(idx, colr);
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
      mL.makeTranslation(2.7, 3.05, 0); mW.multiplyMatrices(mG, mL); glit.setMatrixAt(nG, mW);
      glit.setColorAt(nG++, _c3.setRGB(...(u > 0.92 && u < 1.3 ? [0, 3, 0.2] : [3, 0, 0])));
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
    if (q === 0) { mL.copy(m4); mL.elements[13] = p.py + 0.1; blobs.setMatrixAt(i, mL); } // sin sombras del sol, una mancha bajo el coche
    world.decals.setMatrixAt(i, m4);
    const ci = world.carIdx.get(c.id);
    world.cell.array[i] = ci; world.liv.array[i] = world.livSrc[ci];
    // daños: el alerón tocado se ve descolgado; en un cambio de morro se quita mientras trabajan
    const nose = stop && c.pit?.noseChange && u > 0.18 && u < 0.7;
    world.dmg.array[i] = nose ? -1 : clamp(c.wing / 0.025, 0, 1) * (c.wing > 0.004 ? 1 : 0); world.col2.array[i * 3] = world.c2src[ci * 3]; world.col2.array[i * 3 + 1] = world.c2src[ci * 3 + 1]; world.col2.array[i * 3 + 2] = world.c2src[ci * 3 + 2];
    if (hi >= 0) { world.livH.array[hi] = world.liv.array[i]; world.dmgH.array[hi] = world.dmg.array[i]; world.col2H.array.set(world.col2.array.subarray(i * 3, i * 3 + 3), hi * 3); }
    mL.makeRotationX(-steer * 2.4).setPosition(0.88, 0.66, 0); mW.multiplyMatrices(m4, mL); world.steer.setMatrixAt(i, mW);
    mL.makeScale(dr, dr, dr).setPosition(p.px, p.py + 0.3, p.pz); discs.setMatrixAt(i, mL); discs.setColorAt(i, _col.set(c.team.color));
    // spray: estela de agua detrás de cada coche sobre asfalto mojado
    const mi = track.msOfPoint[Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds))], offLine = Math.min(1, Math.abs(p.lat) / 0.3);
    const wet = c.loc === "track" ? sess.water[mi] + (sess.waterOff[mi] - sess.water[mi]) * offLine : 0;
    if (wet > 0.04 && c.v > 18 && q > 0) {
      // cuanta más agua y más velocidad, más densa y más larga
      const str = Math.min(1, wet * 2.2) * clamp((c.v - 18) / 35, 0, 1), L = (6 + c.v * 0.4) * k * (0.6 + 0.4 * Math.min(1, wet * 1.6));
      const sa = spray.geometry.attributes, ci = world.carIdx.get(c.id);
      for (let j = 0; j < SPRAY_P; j++, ns++) {
        sa.aCar.array.set([p.px, p.py, p.pz], ns * 3); sa.aDir.array.set([fx, fy, fz], ns * 3);
        sa.aPar.array.set([str, k, ci * 0.173 + (j + 0.5) / SPRAY_P, L], ns * 4);
      }
    }
    i++;
  }
  cars.count = blobs.count = discs.count = world.decals.count = world.steer.count = i; wheels.count = i * 4; spray.geometry.instanceCount = ns;
  crewS.count = nS; crewC.count = nC; jacks.count = nJ; loose.count = nL; gant.count = glit.count = nG; blank.count = nB; fists.count = nF; world.debris.count = cs.d; world.marsh.count = cs.m; world.crane.count = cs.c; world.beams.count = cs.b;
  for (const m of [crewS, crewC, jacks, loose, gant, glit, blank, fists, world.debris, world.marsh, world.crane, world.beams]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
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
  world.cell.needsUpdate = world.col2.needsUpdate = world.liv.needsUpdate = world.dmg.needsUpdate = true;
  carsHi.count = nH; wheelsHi.count = nH * 4;
  world.livH.needsUpdate = world.dmgH.needsUpdate = world.col2H.needsUpdate = true;
  for (const m of [cars, wheels, carsHi, wheelsHi, blobs, discs, world.decals, world.steer]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const sel = opt.selId() === null ? null : pose.get(opt.selId());
  const ringFor = [...opt.mine().map((c) => (c.id === opt.selId() ? null : pose.get(c.id))), sel];
  world.rings.forEach((r, j) => {
    const p = ringFor[j];
    r.visible = !!p && far > 0.25;
    if (p) { r.position.set(p.px, p.py + 0.4, p.pz); r.scale.setScalar(k * 3.9); }
  });
  drawFlags(now, W, k); updateStartLights(); updateLampRefl(W);
  // a bordo: gotas y suciedad del coche que se sigue
  { const fc2 = followCar(), on = camMode === "abordo" && !!fc2;
    let dirt = 0;
    if (fc2) {
      const pp = pose.get(fc2.id), prev = dirtOf.get(fc2.id) || 0;
      dirt = Math.min(1, Math.max(prev, (fc2.lapTimes?.length || 0) / 45) + (pp && pp.gnd > 0 ? 0.02 * (pp.simDt || 0) * 10 : 0));
      dirtOf.set(fc2.id, dirt);
    }
    lens.visible = on && (rainHere > 0.1 || dirt > 0.02);
    if (lens.visible) {
      const u2 = LENS_MAT.uniforms;
      u2.uRain.value = clamp(rainHere / 2.5, 0, 0.85); u2.uDirt.value = dirt; u2.uAsp.value = opt.box.clientWidth / Math.max(1, opt.box.clientHeight);
      u2.uSpeed.value = clamp((fc2.v || 0) / 80, 0, 1); u2.uLum.value = 0.25 + 0.75 * dayK + 0.3 * U.uFlood.value;
      if (!isPaused()) u2.uTime.value += dt;
    }
  }
  updateMarks(now, W, k);
  // lluvia: cae alrededor de lo que se mira, solo donde la textura dice que llueve
  rain.visible = q > 0 && rainHere > 0.15 && !reduced;
  if (rain.visible) {
    if (!isPaused()) rainClock += dt * 1.6 * (replay ? REPLAY_SPEED : 1);
    const u = rain.material.uniforms, sz = clamp(halfH * 3.2, 60, 4000);
    u.uTime.value = rainClock; u.uCenter.value.copy(cur.look); u.uSize.value.set(sz, sz * 0.75, sz);
    u.uWind.value.set(Math.cos(sess.weather.windDir), -Math.sin(sess.weather.windDir));
  }
  render();
  // rótulos y puntos para tocar
  const box = opt.box, w = box.clientWidth, h = box.clientHeight, close = camMode !== "circuito" && W < 12;
  screenPts = [];
  const placed = [], fc = followCar(), fp = fc && pose.get(fc.id);
  for (const p of list) {
    _v.set(p.px, p.py + 1.6 * k, p.pz).project(camera);
    const ok = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    if (ok) screenPts.push({ id: p.c.id, x, y });
    const el = labels.get(p.c.id);
    if (!el) continue;
    const near = close && fp && Math.min(mod(p.s - fp.s, T.L), mod(fp.s - p.s, T.L)) < 22 * k;
    if (ok && (p.c.player || p.c.id === opt.selId() || near) && !((camMode === "abordo" || camMode === "trasera") && p === fp)) {
      el.hidden = false;
      let ly = y - 19;
      while (placed.some((o) => Math.abs(o.x - x) < 30 && Math.abs(o.y - ly) < 13)) ly -= 14;
      placed.push({ x, y: ly });
      el.style.transform = `translate3d(${(x + 3).toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
      el.classList.toggle("sel", p.c.id === opt.selId());
    } else if (!el.hidden) el.hidden = true;
  }
  for (const [id, el] of labels) if (!pose.has(id) && !el.hidden) el.hidden = true;
  // fantasma de parada: dónde estaría tu piloto si parase ahora
  const gs = opt.ghosts ? opt.ghosts() : [];
  ghostEls.forEach((el, j) => {
    const g = gs[j];
    if (g) { sample(g.s, _a); _v.set(_a.x, _a.y + 1, _a.z).project(camera); }
    const ok = !!g && _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
    if (el.hidden !== !ok) el.hidden = !ok;
    if (!ok) return;
    if (el.textContent !== g.text) el.textContent = g.text;
    el.style.borderColor = g.color;
    el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -50%)`;
  });
}


// ------------------------------------------------------------------ arranque y lo que se ofrece fuera
T = buildTrackData(track, track.id);
const remember = () => { for (const c of sess.cars) { prevS.set(c.id, c.s); prevV.set(c.id, c.v); } };
remember();
buildWorld();
for (const c of sess.cars) {
  const el = document.createElement("div");
  el.className = "lbl3" + (c.player ? " me" : ""); el.hidden = true;
  el.innerHTML = `<i style="background:${c.team.color}"></i><span>${c.d.abrev}</span>`;
  opt.labels.appendChild(el); labels.set(c.id, el);
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
return {
  /** Antes de cada paso de la simulación: guarda dónde estaba cada coche, para interpolar. */
  beforeStep: remember,
  draw(dt, now) {
    scanEvents();
    const shot = pickPhoto();
    if (shot) {
      // fotograma de la foto (sin avanzar nada), se copia y enseguida el normal
      photoNow = shot; curW = W_REAL; draw3d(0, now); grabPhoto(shot); photoNow = null; camSnap = true;
    }
    draw3d(dt, now);
    if (opt.paused()) { fN = 0; fT = now; lowSecs = 0; fps = 0; return; } // en pausa se dibuja poco a propósito: no cuenta
    // calidad automática: si no llega a 40 fps tres segundos seguidos, baja un escalón (ver lowerQuality)
    fN++;
    if (now - fT >= 1000) {
      fps = (fN * 1000) / (now - fT);
      if (++warm > 3) { lowSecs = fps < 40 ? lowSecs + 1 : 0; if (lowSecs >= 3) { lowSecs = 0; lowerQuality(); } }
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
  /** Coche más cercano al punto tocado (px del recuadro), o null. */
  pick(x, y) {
    let best = null, bd = 24 * 24;
    for (const p of screenPts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.id; } }
    return best;
  },
  /** Ha cambiado el coche seguido: la cámara va hacia el nuevo con suavidad. */
  selChanged() { busyUntil = performance.now() + 1300; if (camMode !== "circuito") { camFrom = { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov }; camT = 0; teleIdx = -1; } },
  dispose() {
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    cloudTex.dispose(); wxTex.dispose(); if (sun.shadow.map) sun.shadow.map.dispose();
    for (const t of Object.values(DET)) t.dispose();
    envScene.children[0].material.dispose(); envCube.dispose(); if (envRT) envRT.dispose(); pmrem.dispose();
    if (post) { post.rt.dispose(); post.composer.dispose(); post.ao.dispose(); post.bloom.dispose(); }
    renderer.dispose(); renderer.forceContextLoss();
    opt.labels.innerHTML = "";
  },
};
}
