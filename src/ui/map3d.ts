// @ts-nocheck
// Mapa 3D de la sesión (WebGL, three.js). Se carga solo cuando el jugador pulsa «3D» en el mapa.
// Nació como prueba de concepto (poc3d/) y está portado casi tal cual, por eso va sin comprobación
// de tipos: quien lo use solo necesita createMap3d() y lo que devuelve.
//
// Qué sale de la simulación y qué es solo dibujo:
//  · de la simulación: posiciones, paradas, compuesto, agua en la trazada y fuera de ella, lluvia, nubes y hora;
//  · de los datos del circuito: altitud («relieve»), anchura («ancho») y lado de los boxes («boxes.lado»);
//  · solo dibujo: la trazada, el cabeceo y el balanceo, el coche parado en su caja, escapatorias, árboles y edificios.
import * as THREE from "three";
import { rainAt } from "../sim/weather";

const CAMS = ["circuito", "seguir", "tele", "abordo"];
const CAM_NAME = { circuito: "Circuito", seguir: "Seguir", tele: "Tele", abordo: "A bordo" };
const COMPOUND = { S: "#e8452c", M: "#f2d23c", H: "#f2f2f2", I: "#3cc35a", W: "#3a7be8" };
const PIT_OFF = 2.15;
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * opt: { canvas, labels, box, sess, mine(), selId(), alpha(), paused(), speed(), ghosts() }
 *  · alpha(): cuánto del paso de simulación en curso ha pasado ya (0..1), para interpolar posiciones;
 *  · ghosts(): [{ s, text, color }] con los fantasmas de parada.
 * Devuelve { beforeStep, draw, resize, cycleCam, pick, selChanged, dispose }.
 */
export function createMap3d(opt) {
const sess = opt.sess, track = sess.track;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hourMode = "sesion", qMode = "auto";
let W_REAL = 6.5; // media anchura media de la pista (m); cada circuito pone la suya
let T, camMode = "circuito", q = 2;
const prevS = new Map(), prevV = new Map(), labels = new Map();

// ------------------------------------------------------------------ escena
const glc = opt.canvas;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: "high-performance" }); }
catch (e) { throw new Error("sin WebGL"); }
const scene = new THREE.Scene();
const fog = new THREE.Fog(0xc3d8ea, 1000, 9000);
scene.fog = fog;
const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x4a5a40, 0.8);
const sun = new THREE.DirectionalLight(0xfff3dd, 1.2);
scene.add(hemi, sun, sun.target);
sun.shadow.bias = -0.0004;
const camera = new THREE.PerspectiveCamera(36, 1, 5, 80000);
if (renderer) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
// cielo: cúpula con degradado del horizonte al cénit, pegada a la cámara
const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
// cielo: degradado del horizonte al cénit, nubes que se mueven y el disco del sol
const skyU = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
  uCloudCol: { value: new THREE.Color() }, uCover: { value: 0.3 }, uT: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, fog: false, depthWrite: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uZen, uHor, uSun, uSunCol, uCloudCol; uniform float uCover, uT; varying vec3 vDir;` + GLSL_NOISE + `
    void main(){
      vec3 d = normalize(vDir);
      vec3 col = mix(uHor, uZen, pow(max(d.y, 0.0), 0.55));
      float s = max(dot(d, uSun), 0.0);
      col += uSunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18);
      if (d.y > 0.015) {
        vec2 q = d.xz / (d.y + 0.14) * 1.3 + vec2(uT * 0.006, uT * 0.002);
        float n = 0.55 * vn(q) + 0.3 * vn(q * 2.1 + 7.0) + 0.15 * vn(q * 4.3 + 3.0);
        float c = smoothstep(0.68 - 0.42 * uCover, 0.86 - 0.3 * uCover, n) * smoothstep(0.015, 0.16, d.y);
        col = mix(col, uCloudCol * (0.82 + 0.3 * n), c * 0.92);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
    }`,
}));
sky.scale.setScalar(40000); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
// lo que refleja la carrocería: un cubo diminuto con el cielo arriba y el suelo abajo, que sigue a la hora del día
const envCanvas = [0, 1, 2, 3, 4, 5].map(() => { const c = document.createElement("canvas"); c.width = c.height = 16; return c; });
const envTex = new THREE.CubeTexture(envCanvas);
function paintEnv(zen, hor) {
  const css = (c, k = 1) => `rgb(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)})`;
  envCanvas.forEach((cv, f) => {
    const g = cv.getContext("2d");
    if (f === 2) g.fillStyle = css(zen);            // +y
    else if (f === 3) g.fillStyle = css(hor, 0.25); // -y: el asfalto
    else { const gr = g.createLinearGradient(0, 0, 0, 16); gr.addColorStop(0, css(zen)); gr.addColorStop(0.5, css(hor)); gr.addColorStop(0.56, css(hor, 0.35)); gr.addColorStop(1, css(hor, 0.2)); g.fillStyle = gr; }
    g.fillRect(0, 0, 16, 16);
  });
  envTex.needsUpdate = true;
}

// uniformes que comparten la pista, los coches y la lluvia
const U = {
  uW: { value: 20 }, uDetail: { value: 0 }, uL: { value: 5000 }, uFlood: { value: 0 }, uLight: { value: 0.2 },
  uCloud: { value: null }, uTexR: { value: 3000 },
};
const CN = 48, cloudData = new Uint8Array(CN * CN * 4);
const cloudTex = new THREE.DataTexture(cloudData, CN, CN, THREE.RGBAFormat);
cloudTex.magFilter = cloudTex.minFilter = THREE.LinearFilter; cloudTex.needsUpdate = true;
U.uCloud.value = cloudTex;
// publicidad de pista: ocho marcas inventadas en una tira
const adsCanvas = document.createElement("canvas"); adsCanvas.width = 2048; adsCanvas.height = 128;
{ const g = adsCanvas.getContext("2d"), ads = [["VELTRA", "#0b3d91", "#ffffff"], ["KORU", "#f2f2f2", "#c8102e"], ["NIMBO", "#101216", "#ffd84a"], ["ARDEN", "#c8102e", "#ffffff"], ["OSTRA", "#0f6b4f", "#f2f2f2"], ["LUMEN", "#ffd84a", "#101216"], ["TAIGA", "#f2f2f2", "#0b3d91"], ["ZEFIR", "#3a3f48", "#7fe0ff"]];
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 78px 'Titillium Web', 'Arial Narrow', sans-serif";
  ads.forEach(([t, bg, fg], k) => { g.fillStyle = bg; g.fillRect(k * 256, 0, 256, 128); g.fillStyle = fg; g.fillText(t, k * 256 + 128, 68, 220); }); }
const adsTex = new THREE.CanvasTexture(adsCanvas);
U.uAds = { value: adsTex };

// ------------------------------------------------------------------ material de las cintas (asfalto, hierba, grava, muros)
const RIB_VH = `
attribute vec3 aSide; attribute float aLat, aLatM, aY, aU, aV, aWet, aWetOff, aKerb, aDash, aLine, aWr; attribute vec3 aEdge;
uniform float uW;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine; varying vec3 vEdge; varying vec2 vXZ;
`;
const RIB_VB = `
vec3 transformed = position + aSide * (uW * aLat * aWr + aLatM);
transformed.y += aY * (aY > 0.0 ? uW / 6.5 : 1.0);
vU = aU; vV = aV; vWet = aWet; vWetOff = aWetOff; vKerb = aKerb; vDash = aDash; vLine = aLine; vEdge = aEdge; vXZ = transformed.xz;
`;
const RIB_FH = `` + GLSL_NOISE + `
uniform float uW, uDetail, uL, uFlood, uTexR, uMode; uniform sampler2D uCloud, uAds;
varying float vU, vV, vWet, vWetOff, vKerb, vDash, vLine; varying vec3 vEdge; varying vec2 vXZ;
`;
const RIB_FB = `
// metros por píxel: el grano fino se apaga de lejos para que no centellee
float px = fwidth(vXZ.x) + fwidth(vXZ.y);
#define FADE(f) clamp(1.0 - px * (f) * 1.3, 0.0, 1.0)
vec3 col = diffuse; float wetS = 0.02;
float cloudS = texture2D(uCloud, vXZ / (2.0 * uTexR) + 0.5).g;
if (uMode > 0.5 && uMode < 2.5) {
  float a = abs(vU);
  float edge = smoothstep(0.80, 0.85, a + (vn(vec2(vV * 0.9, vU * 3.0)) - 0.5) * 0.035 * uDetail);
  // grano del asfalto, parches de distinto tono y juntas
  col *= 1.0 + (vn(vXZ * 2.6) - 0.5) * 0.24 * FADE(2.6) + (vn(vXZ * 11.0) - 0.5) * 0.12 * FADE(11.0) + (vn(vXZ * 0.06) - 0.5) * 0.16;
  if (uMode < 1.5) {
    float dl = (vU - vLine) / 0.30;
    col *= 1.0 - 0.24 * exp(-dl * dl) * (0.35 + 0.65 * uDetail) * (0.8 + 0.4 * vn(vec2(vV * 0.15, vU * 4.0)));
    col *= 0.94 + 0.06 * smoothstep(0.0, 0.7, a);
    float wet = mix(vWetOff, vWet, exp(-dl * dl * 0.5));
    col = mix(col, col * vec3(0.46, 0.52, 0.62), wet * uDetail);
    col = mix(col, vec3(0.27, 0.59, 0.94), vWet * (1.0 - uDetail) * 0.85);
    wetS = 0.02 + wet * 0.6 * (0.2 + 0.8 * uDetail);
    float dash = vDash > 0.5 ? step(0.45, fract(vV / (uW * 4.0))) : 1.0;
    float stripe = step(0.5, fract(vV / (uW * 0.5)));
    vec3 kerb = mix(vec3(0.80, 0.12, 0.10), vec3(0.95), stripe) * (0.86 + 0.2 * vn(vXZ * 3.0));
    float k = step(0.5, vKerb) * uDetail;
    col = mix(col, mix(vEdge, kerb, k), edge * max(dash, k));
    float sl = step(vV, uW * 0.45) * step(a, 0.8);
    float chk = mod(floor(vU * 4.0) + floor(vV / (uW * 0.225)), 2.0);
    col = mix(col, mix(vec3(0.95), mix(vec3(0.95), vec3(0.06), chk), uDetail), sl);
    float g = (uL - vV - 9.0) / 8.0;
    float sideSel = mod(floor(g), 2.0) < 0.5 ? 1.0 : -1.0;
    float slot = step(0.0, g) * step(g, 22.0) * step(0.12, vU * sideSel) * step(vU * sideSel, 0.72) * step(fract(g), 0.07);
    col = mix(col, vec3(0.93), slot * uDetail);
  } else {
    col = mix(col, vec3(0.92), edge * (0.3 + 0.6 * uDetail));
  }
} else if (uMode < 3.5 && uMode > 2.5) {
  // hierba: franjas de siega, manchas y grano
  col *= 0.95 + 0.07 * step(0.5, fract(vV / 16.0)) * FADE(0.1);
  col *= 1.0 + (vn(vXZ * 3.4) - 0.5) * 0.34 * FADE(3.4) + (vn(vXZ * 0.13) - 0.5) * 0.2;
} else if (uMode < 4.5 && uMode > 3.5) {
  col *= 1.0 + (vn(vXZ * 7.0) - 0.5) * 0.4 * FADE(7.0) + (vn(vXZ * 0.6) - 0.5) * 0.16;
} else if (uMode < 5.5 && uMode > 4.5) {
  if (vKerb > 0.5) {
    // protección de neumáticos: bloques rojos y blancos
    col = mix(vec3(0.78, 0.11, 0.09), vec3(0.92), step(0.5, fract(vV / 2.4)));
    col *= 0.72 + 0.28 * step(0.18, fract(vU * 3.0)) * step(0.1, fract(vV / 0.6));
  } else {
    // guardarraíl: dos bandas de chapa y un poste cada pocos metros
    float rail = step(0.16, vU) * step(vU, 0.46) + step(0.6, vU) * step(vU, 0.9);
    col = mix(vec3(0.22, 0.23, 0.25), vec3(0.74, 0.76, 0.79) * (0.9 + 0.2 * vn(vec2(vV * 0.7, vU * 6.0))), rail);
    col *= 1.0 - 0.45 * step(fract(vV / 3.8), 0.035);
  }
} else if (uMode < 6.5 && uMode > 5.5) {
  // valla: postes, cable de arriba y malla (que se apaga de lejos)
  float post = step(fract(vV / 5.0), 0.025), top = step(0.95, vU);
  float mesh = max(1.0 - step(0.16, fract(vV * 3.0)), 1.0 - step(0.16, fract(vU * 10.0))) * step(px, 0.5);
  if (post + top + mesh < 0.5) discard;
  col = vec3(0.5, 0.53, 0.57);
} else if (uMode > 6.5) {
  // paneles de publicidad: cada 7 m, una marca al azar
  float pi = floor(vV / 7.0), f = fract(vV / 7.0);
  col = texture2D(uAds, vec2((floor(h21(vec2(pi, 3.7)) * 8.0) + (vDash > 0.5 ? 1.0 - f : f)) / 8.0, vU)).rgb;
  col *= 1.0 - 0.5 * step(f, 0.012);
}
col *= 1.0 - 0.32 * cloudS;
vec4 diffuseColor = vec4(col, opacity);
`;
function ribbonMat(color, mode, po) {
  const m = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x9fb0c4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po });
  m.extensions = { derivatives: true };
  const uMode = { value: mode };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uMode });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + RIB_VH).replace("#include <begin_vertex>", RIB_VB);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + RIB_FH)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", RIB_FB)
      .replace("#include <specularmap_fragment>", "float specularStrength = wetS;")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + col * uFlood * (uMode > 0.5 ? 1.0 : 0.3);");
  };
  return m;
}

// ------------------------------------------------------------------ coche
// color de vértice: r = cuánto color del equipo, g = gris fijo, b = luz roja trasera
// color de vértice: r = cuánto color del equipo, g = gris fijo (−1 = luz roja trasera), b = cuánto del segundo color del equipo
const TEAM = [1, 0, 0], TEAM2 = [0.5, 0.02, 0], BLACK = [0, 0.04, 0], WHITE = [0, 0.85, 0], RED = [0, -1, 0];
// segundo color de cada equipo (para la línea del costado y un plano del alerón); el resto usa un gris claro
const SECOND = { mercedes: "#16181c", ferrari: "#f4f4f4", redbull: "#f0c020", mclaren: "#16181c", racingbulls: "#f4f4f4", alpine: "#f078b4", haas: "#d8242c", audi: "#c4c8cc", williams: "#f4f4f4", astonmartin: "#cfe22a", cadillac: "#16181c" };
function collect() {
  const pos = [], nor = [], col = [];
  return {
    add(g, c) {
      const n = g.toNonIndexed(); n.computeVertexNormals();
      const p = n.attributes.position.array, qn = n.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(qn[i], qn[i + 1], qn[i + 2]); col.push(c[0], c[1], c[2]); }
    },
    /** Geometría ya sin índices, con sus normales y colores de vértice. */
    raw(g) {
      const p = g.attributes.position.array, qn = g.attributes.normal.array, cc = g.attributes.color.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(qn[i]); col.push(cc[i]); }
    },
    done() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      return g;
    },
  };
}
/**
 * Superficie curva a lo largo del coche: une secciones [x, y centro, z centro, medio ancho, medio alto]
 * con forma de superelipse. col(ángulo, índice de sección) da el color de cada vértice (ángulo 0 = arriba).
 */
function loft(c, secs, col, N = 14, expo = 2.6) {
  const pos = [], colr = [], idx = [], R = secs.length;
  for (let r = 0; r < R; r++) {
    const [x, yc, zc, hw, hh] = secs[r];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
      const k = Math.pow(Math.pow(Math.abs(cy), expo) + Math.pow(Math.abs(sz), expo), -1 / expo);
      pos.push(x, yc + hh * cy * k, zc + hw * sz * k);
      colr.push(...col(a > Math.PI ? Math.PI * 2 - a : a, r));
    }
  }
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < N; j++) {
    const a = r * N + j, b = r * N + ((j + 1) % N), d = a + N, e = b + N;
    idx.push(a, b, d, b, e, d);
  }
  // tapas delante y detrás
  for (const r of [0, R - 1]) {
    const cI = pos.length / 3, s = secs[r];
    pos.push(s[0], s[1], s[2]); colr.push(...col(Math.PI, r));
    for (let j = 0; j < N; j++) idx.push(cI, r * N + j, r * N + ((j + 1) % N));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals(); // normales suaves: la carrocería no se ve a facetas
  c.raw(g.toNonIndexed());
}
// Monoplaza genérico con las proporciones del reglamento de 2026 (x hacia delante, y arriba, z a la derecha; metros).
function carGeometry() {
  const c = collect(), DEG = Math.PI / 180;
  const ACC = [0, 0, 1]; // línea de la decoración: el segundo color del equipo
  /** Caja que se estrecha hacia delante (f) o hacia atrás (r): [escala alto, escala ancho, desplazamiento en alto]. */
  const part = (lx, ly, lz, x, y, z, colr, f, r) => {
    const g = new THREE.BoxGeometry(lx, ly, lz), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) > 0 ? f : r;
      if (s) { p.setY(i, p.getY(i) * s[0] + (s[2] || 0)); p.setZ(i, p.getZ(i) * s[1]); }
    }
    c.add(g.translate(x, y, z), colr);
  };
  /** Barra fina entre dos puntos (suspensión, soportes). */
  const strut = (a, b, t, colr) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.BoxGeometry(len, t * 0.6, t);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize())));
    c.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), colr);
  };
  const tube = (pts, rad, colr) => c.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 18, rad, 6, false), colr);
  // decoración por altura: arriba el color del equipo, una línea clara en el costado y debajo un tono más oscuro
  const livery = (a) => (a < 78 * DEG ? TEAM : a < 100 * DEG ? ACC : a < 150 * DEG ? TEAM2 : BLACK);

  // casco: morro bajo y fino, monocasco que sube hasta el habitáculo y tapa del motor que cae hacia atrás
  const spine = [[3.08, 0.2, 0, 0.09, 0.04], [2.75, 0.25, 0, 0.15, 0.07], [2.25, 0.33, 0, 0.2, 0.11], [1.75, 0.42, 0, 0.25, 0.15], [1.25, 0.48, 0, 0.31, 0.2],
    [0.8, 0.5, 0, 0.38, 0.23], [0.25, 0.52, 0, 0.41, 0.25], [-0.25, 0.6, 0, 0.36, 0.33], [-0.8, 0.62, 0, 0.29, 0.35], [-1.4, 0.54, 0, 0.21, 0.27], [-2.0, 0.44, 0, 0.13, 0.18], [-2.5, 0.4, 0, 0.06, 0.09]];
  // el hueco del habitáculo va en negro
  loft(c, spine, (a, r) => (r >= 5 && r <= 6 && a < 40 * DEG ? BLACK : livery(a)));
  // pontones: boca ancha detrás de las ruedas delanteras y cintura estrecha hacia atrás
  for (const s of [1, -1]) {
    loft(c, [[0.78, 0.44, 0.6 * s, 0.2, 0.15], [0.45, 0.43, 0.63 * s, 0.26, 0.2], [-0.2, 0.41, 0.62 * s, 0.27, 0.2], [-0.9, 0.36, 0.52 * s, 0.22, 0.15], [-1.5, 0.3, 0.4 * s, 0.14, 0.1], [-1.95, 0.26, 0.3 * s, 0.07, 0.06]],
      (a, r) => (r === 0 ? BLACK : livery(a)), 12, 3.2);
  }
  // toma de aire sobre el piloto, cámara de tele y aleta de la tapa del motor
  loft(c, [[-0.12, 0.98, 0, 0.13, 0.11], [-0.5, 0.98, 0, 0.14, 0.12], [-1.0, 0.9, 0, 0.1, 0.09], [-1.5, 0.78, 0, 0.05, 0.05]], (a, r) => (r === 0 ? BLACK : TEAM), 10, 2.2);
  part(0.34, 0.045, 0.12, -0.36, 1.2, 0, BLACK); part(0.06, 0.1, 0.03, -0.36, 1.13, 0, BLACK);
  part(1.5, 0.34, 0.03, -1.55, 0.82, 0, TEAM, [1, 1], [0.25, 1, -0.12]);
  // fondo plano con el borde levantado y difusor
  part(3.5, 0.035, 1.62, -0.35, 0.07, 0, BLACK, [1, 0.62], [1, 0.95]);
  part(0.7, 0.2, 1.1, -2.2, 0.17, 0, BLACK, [0.2, 1, -0.08], [1, 1]);
  for (const s of [1, -1]) part(2.2, 0.09, 0.03, -0.6, 0.12, 0.8 * s, BLACK, [0.5, 1], [1, 1]);
  // habitáculo: casco del piloto, halo y retrovisores
  c.add(new THREE.SphereGeometry(0.135, 10, 8).translate(0.22, 0.79, 0), WHITE);
  tube([[-0.3, 0.9, 0.31], [0.25, 0.93, 0.3], [0.68, 0.88, 0.21], [0.88, 0.82, 0], [0.68, 0.88, -0.21], [0.25, 0.93, -0.3], [-0.3, 0.9, -0.31]], 0.037, TEAM2);
  tube([[0.88, 0.82, 0], [0.98, 0.72, 0], [1.06, 0.6, 0]], 0.03, TEAM2);
  for (const s of [1, -1]) { part(0.06, 0.09, 0.17, 0.8, 0.78, 0.56 * s, TEAM); strut([0.8, 0.68, 0.4 * s], [0.8, 0.76, 0.52 * s], 0.025, BLACK); }
  // alerón delantero: tres planos que suben hacia atrás y placas en los extremos
  part(0.42, 0.028, 1.9, 2.96, 0.1, 0, BLACK, [0.8, 0.96], [1, 1]);
  for (const s of [1, -1]) {
    part(0.3, 0.026, 0.82, 2.74, 0.17, 0.55 * s, TEAM, [1, 1, -0.02], [1, 1, 0.02]);
    part(0.24, 0.026, 0.8, 2.56, 0.25, 0.56 * s, ACC, [1, 1, -0.02], [1, 1, 0.03]);
    part(0.62, 0.3, 0.03, 2.74, 0.21, 0.96 * s, TEAM, [0.45, 1, -0.06], [1, 1]);
    part(0.3, 0.02, 0.2, 2.62, 0.08, 1.05 * s, BLACK);
  }
  // alerón trasero: plano principal, flap, placas, soportes y ala inferior
  part(0.46, 0.04, 1.24, -2.62, 0.9, 0, BLACK);
  part(0.3, 0.17, 1.24, -2.8, 1.02, 0, TEAM, [0.25, 1, -0.05], [0.25, 1, 0.07]);
  for (const s of [1, -1]) {
    part(0.72, 0.6, 0.03, -2.62, 0.78, 0.63 * s, TEAM, [0.75, 1, 0.07], [1, 1]);
    strut([-2.15, 0.45, 0.07 * s], [-2.5, 0.88, 0.07 * s], 0.03, BLACK);
  }
  part(0.3, 0.035, 1.0, -2.56, 0.44, 0, BLACK);
  part(0.5, 0.1, 0.16, -2.72, 0.33, 0, BLACK); part(0.05, 0.11, 0.13, -2.98, 0.34, 0, RED);
  // suspensión: dos triángulos por rueda y la barra de dirección o el palier
  for (const s of [1, -1]) {
    const fw = [1.8, 0.36, 0.7 * s], rw = [-1.7, 0.36, 0.68 * s];
    for (const y of [0.5, 0.26]) {
      strut([2.15, y, 0.2 * s], [fw[0], y - 0.03, fw[2]], 0.035, BLACK); strut([1.35, y, 0.27 * s], [fw[0], y - 0.03, fw[2]], 0.035, BLACK);
      strut([-1.25, y - 0.02, 0.24 * s], [rw[0], y - 0.03, rw[2]], 0.035, BLACK); strut([-2.1, y - 0.04, 0.14 * s], [rw[0], y - 0.03, rw[2]], 0.035, BLACK);
    }
    strut([1.6, 0.4, 0.26 * s], [1.72, 0.38, fw[2]], 0.025, BLACK);
    strut([-1.7, 0.36, 0.16 * s], rw, 0.045, BLACK);
    // deflector tras la rueda delantera
    part(0.5, 0.26, 0.025, 1.12, 0.26, 0.5 * s, BLACK, [0.5, 1], [1, 1]);
  }
  return c.done();
}
/** Rueda: neumático con los hombros redondeados, tapacubos y la banda del compuesto en el flanco. */
function wheelGeometry() {
  const c = collect(), K = [0, 0.05, 0]; // r = color del compuesto, g = gris fijo
  const prof = [[0.2, -0.17], [0.31, -0.17], [0.345, -0.15], [0.36, -0.11], [0.36, 0.11], [0.345, 0.15], [0.31, 0.17], [0.2, 0.17]].map(([r, a]) => new THREE.Vector2(r, a));
  const tyre = new THREE.LatheGeometry(prof, 22).rotateX(Math.PI / 2);
  tyre.computeVertexNormals();
  const n = tyre.toNonIndexed(), cnt = n.attributes.position.count, cols = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) cols.set(K, i * 3);
  n.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  c.raw(n);
  for (const sz of [1, -1]) {
    const ring = new THREE.RingGeometry(0.235, 0.275, 22); if (sz < 0) ring.rotateY(Math.PI);
    c.add(ring.translate(0, 0, sz * 0.172), [1, 0, 0]);   // banda del compuesto
    const hub = new THREE.CircleGeometry(0.225, 18); if (sz < 0) hub.rotateY(Math.PI);
    c.add(hub.translate(0, 0, sz * 0.168), [0, 0.13, 0]);
    const cap = new THREE.CircleGeometry(0.07, 10); if (sz < 0) cap.rotateY(Math.PI);
    c.add(cap.translate(0, 0, sz * 0.174), [0, 0.3, 0]);
    for (let k = 0; k < 5; k++) c.add(new THREE.BoxGeometry(0.17, 0.03, 0.006).translate(0.13, 0, sz * 0.171).rotateZ((k * Math.PI * 2) / 5), [0, 0.26, 0]);
    for (let k = 0; k < 2; k++) c.add(new THREE.BoxGeometry(0.09, 0.022, 0.006).translate(0.31, 0, sz * 0.165).rotateZ(k * Math.PI + 0.4), [1, 0, 0]);
  }
  return c.done();
}
const CAR_GEO = carGeometry(), WHEEL_GEO = wheelGeometry();
// volante con las manos del piloto (gira con la dirección)
const STEER_GEO = (() => {
  const c = collect();
  c.add(new THREE.BoxGeometry(0.035, 0.15, 0.27), [0.07, 0.07, 0.08]);
  c.add(new THREE.BoxGeometry(0.02, 0.07, 0.11).translate(-0.02, 0.01, 0), [0.1, 0.5, 0.75]);
  for (const s of [1, -1]) { c.add(new THREE.BoxGeometry(0.07, 0.085, 0.07).translate(-0.01, 0, 0.125 * s), [0.82, 0.82, 0.84]); c.add(new THREE.BoxGeometry(0.2, 0.07, 0.07).translate(-0.12, -0.03, 0.15 * s), [0.82, 0.82, 0.84]); }
  return c.done();
})();
const STEER_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 20 });
// dorsales: una lámina con todos los números y tres pegatinas por coche (morro y los dos lados de la aleta)
const NUM_COLS = 8, NUM_ROWS = 4;
const DECAL_GEO = (() => {
  const pos = [], uv = [];
  const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
  quad([2.05, 0.492, 0.15], [2.05, 0.492, -0.15], [2.42, 0.44, -0.15], [2.42, 0.44, 0.15]);         // morro, se lee desde delante
  quad([-1.72, 0.74, 0.021], [-1.26, 0.74, 0.021], [-1.26, 0.99, 0.021], [-1.72, 0.99, 0.021]);     // aleta, lado derecho
  quad([-1.26, 0.74, -0.021], [-1.72, 0.74, -0.021], [-1.72, 0.99, -0.021], [-1.26, 0.99, -0.021]); // aleta, lado izquierdo
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
})();
const CAR_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: 0x888888, side: THREE.DoubleSide, envMap: envTex, combine: THREE.AddOperation, reflectivity: 0.12 });
CAR_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uFlood: U.uFlood, uLight: U.uLight });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uLight; attribute vec3 aCol2;")
    .replace("#include <color_vertex>", "vColor = instanceColor * color.r + aCol2 * color.b + vec3(max(color.g, 0.0)) + vec3(step(color.g, -0.5) * uLight, 0.0, 0.0);");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFlood;")
    .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive + vColor * uFlood * 0.6;");
};
const WHEEL_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x222222 });
WHEEL_MAT.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <color_vertex>", "vColor = instanceColor * color.r + vec3(color.g);"); };
const BLOB_GEO = new THREE.PlaneGeometry(6.6, 3.0).rotateX(-Math.PI / 2);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
const RING_GEO = new THREE.RingGeometry(1.0, 1.13, 48).rotateX(-Math.PI / 2);
const SPRAY_GEO = new THREE.ConeGeometry(1, 1, 7, 1, true).translate(0, -0.5, 0).rotateZ(-Math.PI / 2);
const SPRAY_MAT = new THREE.MeshBasicMaterial({ color: 0xe6eef7, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });

// ------------------------------------------------------------------ pista
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
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
  return { n, ds, L, E, Ex: maxx - minx, Ez: maxy - miny, cx, cy, X, Z, H, hmean, axis, line, rP, rO, PS, wr, street, Wov: Math.max(16, E * 0.0115) };
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

let world = null;
function buildWorld() {
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
  const rightEdge = (s) => Math.max(SH, ramp(s) * (PIT_OFF + 2.6));
  const grassCol = street ? 0x7c8187 : 0x4f8043;
  // arcén con su talud (cubre los huecos con el terreno), grava, calle de boxes, asfalto y muros
  ribbon(0, n, (i, s) => { const re = rightEdge(s); return [[-(SH + 1.3), -(T.rO[i] + 10), -40, 0], [-SH, -T.rO[i], 0, 0], [re, T.rP[i], 0, 0], [re + 1.3, T.rP[i] + 10, -40, 0]]; }, ribbonMat(grassCol, street ? 4 : 3, 0), 1);
  if (!street) {
    ribbon(0, n, (i) => [[-1.3, -T.rO[i], 0, 0], [-1.3, 0, 0, 0]], ribbonMat(0xc4b48d, 4, -1), 2);
    ribbon(0, n, (i) => [[1.3, 0, 0, 0], [1.3, T.rP[i], 0, 0]], ribbonMat(0xc4b48d, 4, -1), 2);
  }
  const pitI0 = Math.floor(track.pit.entry / T.ds), pitN = Math.ceil((T.L - track.pit.entry + track.pit.exit) / T.ds);
  ribbon(pitI0, pitN, (i, s) => { const o = ramp(s) * PIT_OFF; return [[o - 0.55, 0, 0, -1], [o + 0.55, 0, 0, 1]]; }, ribbonMat(0x6d747e, 2, -2), 3);
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
    const far = T.hmean * 0.6 + (vnoise(x / (E * 0.22), z / (E * 0.22)) - 0.35) * E * 0.06;
    const b = sstep(E * 0.06, E * 0.55, d);
    return { h: Math.min(near + (far - near) * b - 1, cap - 1.5), d };
  };
  const G = 128, R = E * 3.2, PW = 1.5, TR = U.uTexR.value = E * 1.5;
  const tp = new Float32Array((G + 1) * (G + 1) * 3), tc = new Float32Array((G + 1) * (G + 1) * 3), tuv = new Float32Array((G + 1) * (G + 1) * 2);
  const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), PW) * R;
  const cA = new THREE.Color(street ? 0x6d7278 : 0x3c6a37), cB = new THREE.Color(street ? 0x80858b : 0x4d7d44), cC = new THREE.Color(street ? 0x8a8f95 : 0x5c8c4e), cc = new THREE.Color();
  for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) {
    const ua = (a / G) * 2 - 1, ub = (b / G) * 2 - 1, x = warp(ua), z = warp(ub), v = a * (G + 1) + b;
    const cell = R * PW * Math.pow(Math.max(Math.abs(ua), Math.abs(ub), 0.02), PW - 1) * (2 / G);
    const t = terr(x, z, cell * 1.2 + T.Wov * 3.2 + 45);
    tp[v * 3] = x; tp[v * 3 + 1] = t.h; tp[v * 3 + 2] = z;
    tuv[v * 2] = x / (2 * TR) + 0.5; tuv[v * 2 + 1] = z / (2 * TR) + 0.5;
    cc.copy(cA).lerp(cB, vnoise(x / (E * 0.09) + 7, z / (E * 0.09) + 3)).lerp(cC, Math.max(0, 1 - t.d / (T.Wov * 5)) * 0.6);
    tc[v * 3] = cc.r; tc[v * 3 + 1] = cc.g; tc[v * 3 + 2] = cc.b;
  }
  const ti = [];
  for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) { const p = a * (G + 1) + b; ti.push(p, p + 1, p + G + 1, p + 1, p + G + 2, p + G + 1); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(tp, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(tuv, 2));
  tg.setIndex(ti);
  const terrMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000 });
  terrMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTX = position.xz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vTX;" + GLSL_NOISE)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "float tpx = fwidth(vTX.x) + fwidth(vTX.y);\nvec4 diffuseColor = vec4( diffuse * (1.0 + (vn(vTX * 2.9) - 0.5) * 0.32 * clamp(1.0 - tpx * 3.8, 0.0, 1.0) + (vn(vTX * 0.1) - 0.5) * 0.22), opacity );");
  };
  const terrain = add(new THREE.Mesh(tg, terrMat));
  terrain.frustumCulled = false; terrain.receiveShadow = true;
  // sombra de las nubes sobre el terreno (la misma textura oscurece las cintas en su material)
  const over = add(new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, alphaMap: cloudTex, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 })));
  over.frustumCulled = false; over.renderOrder = 0.5;

  // ---- arbolado
  const trees = [], rnd = (() => { let s = 12345 + T.n; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const maxT = street ? 160 : 800;
  for (let tries = 0; tries < 12000 && trees.length < maxT; tries++) {
    const x = (rnd() * 2 - 1) * E * 1.15, z = (rnd() * 2 - 1) * E * 1.15;
    if (vnoise(x / (E * 0.12) + 31, z / (E * 0.12) + 17) < (street ? 0.66 : 0.52)) continue;
    const t = terr(x, z, 0);
    if (t.d < T.Wov * 3.4 + 45) continue;
    trees.push([x, t.h - 1.5, z, 0.75 + rnd() * 0.7, rnd()]);
  }
  const tgc = collect();
  // dos especies mezcladas en la misma malla: frondosa (copa de varios volúmenes) y conífera (tres pisos)
  const blob = (r, x, y, z, shade) => {
    const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.86 + 0.28 * hash2(p.getX(i) * 9 + x, p.getY(i) * 7 + z); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.9, p.getZ(i) * k); }
    tgc.add(g.translate(x, y, z), [shade, shade, shade]);
  };
  blob(0.36, 0, 0.82, 0, 1); blob(0.27, 0.22, 0.66, 0.1, 0.9); blob(0.26, -0.2, 0.7, -0.12, 1.08); blob(0.22, 0.02, 1.08, 0.06, 1.14);
  tgc.add(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 5).translate(0, 0.27, 0), [0.5, 0.36, 0.26]);
  const treeMesh = add(new THREE.InstancedMesh(tgc.done(), new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000 }), trees.length));
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), c2 = new THREE.Color(0x4a8a4a);
  trees.forEach((t, i) => {
    const s = T.Wov * 1.05 * t[3];
    m4.makeScale(s, s, s).setPosition(t[0], t[1], t[2]); treeMesh.setMatrixAt(i, m4);
    treeMesh.setColorAt(i, col.setHex(0x2c5a34).lerp(c2, t[4]));
  });
  treeMesh.frustumCulled = false; treeMesh.castShadow = true; treeMesh.receiveShadow = true;

  // ---- edificio de boxes, tribuna de meta y focos (solo de noche)
  const blocks = [], laneLen = T.L - track.pit.entry + track.pit.exit;
  for (let k = 0; k < 7; k++) blocks.push({ s: track.pit.entry + laneLen * (0.2 + 0.1 * k), lat: T.PS * (PIT_OFF + 1.5), len: laneLen * 0.094, w: 1.1, h: 0.5, c: 0xaeb6c0 });
  for (let k = 0; k < 4; k++) blocks.push({ s: 60 + k * laneLen * 0.11, lat: -T.PS * (SH + 1.1), len: laneLen * 0.1, w: 1.2, h: 0.85, c: 0x7b8490 });
  const bMesh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshPhongMaterial({ flatShading: true, shininess: 0 }), blocks.length));
  blocks.forEach((b, i) => {
    sample(b.s, tmp);
    const W = T.Wov;
    m4.set(tmp.tx * b.len, 0, tmp.rx * W * b.w, tmp.x + tmp.rx * W * b.lat,
      0, W * b.h, 0, tmp.y - 2,
      tmp.tz * b.len, 0, tmp.rz * W * b.w, tmp.z + tmp.rz * W * b.lat,
      0, 0, 0, 1);
    bMesh.setMatrixAt(i, m4); bMesh.setColorAt(i, col.setHex(b.c));
  });
  bMesh.frustumCulled = false; bMesh.castShadow = true; bMesh.receiveShadow = true;
  const nP = Math.floor(T.L / 130);
  const lamps = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }), nP));
  const poles = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshPhongMaterial({ color: 0x30353c }), nP));
  for (let k = 0; k < nP; k++) {
    const s = k * 130, i = Math.floor(s / T.ds);
    sample(s, tmp);
    const lat = -T.PS * (SH * W_REAL + T.rO[i] + 5), x = tmp.x + tmp.rx * lat, z = tmp.z + tmp.rz * lat;
    m4.makeScale(1.6, 0.6, 1.6).setPosition(x, tmp.y + 16, z); lamps.setMatrixAt(k, m4);
    m4.makeScale(0.35, 16, 0.35).setPosition(x, tmp.y, z); poles.setMatrixAt(k, m4);
  }
  lamps.frustumCulled = poles.frustumCulled = false;
  const hc = document.createElement("canvas"); hc.width = hc.height = 64;
  { const g = hc.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,244,214,1)"); gr.addColorStop(0.25, "rgba(255,236,190,.45)"); gr.addColorStop(1, "rgba(255,230,170,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const hpos = new Float32Array(nP * 3);
  for (let k = 0; k < nP; k++) { lamps.getMatrixAt(k, m4); hpos[k * 3] = m4.elements[12]; hpos[k * 3 + 1] = m4.elements[13]; hpos[k * 3 + 2] = m4.elements[14]; }
  const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(hpos, 3));
  const halos = add(new THREE.Points(hg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(hc), size: 26, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
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
  const numTex = (txt) => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 96; const g = cv.getContext("2d"); g.fillStyle = "#f4f4f4"; g.fillRect(0, 0, 128, 96); g.fillStyle = "#111"; g.font = "900 64px 'Titillium Web', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 64, 52); return new THREE.CanvasTexture(cv); };
  [150, 100, 50].forEach((d) => {
    const bm = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ map: numTex(String(d)) }), brakes.length));
    brakes.forEach((bi, k) => { const s = bi * T.ds - d - 35, i2 = Math.floor(mod(s, T.L) / T.ds); bm.setMatrixAt(k, place(s, sideAt(i2) + T.PS * 1.6, 1.0, 1, 1.0, 1.45)); });
    bm.frustumCulled = false;
  });
  const nM = Math.floor(T.L / 380);
  const marsh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshPhongMaterial({ color: 0xe8791f, shininess: 5 }), nM));
  for (let k = 0; k < nM; k++) { const s = 190 + k * 380, i2 = Math.floor(s / T.ds) % n; marsh.setMatrixAt(k, place(s, sideAt(i2) - T.PS * 1.4, 0, 2.6, 2.3, 2.0)); }
  marsh.frustumCulled = false; marsh.castShadow = true;
  // pórtico de salida con el semáforo
  { const gg = collect(), half = SH * W_REAL + 1.2;
    for (const z of [half, -half]) gg.add(new THREE.BoxGeometry(0.3, 6.8, 0.3).translate(0, 3.4, z), [0.2, 0.22, 0.25]);
    gg.add(new THREE.BoxGeometry(0.5, 0.7, half * 2).translate(0, 6.6, 0), [0.2, 0.22, 0.25]);
    for (let k = -2; k <= 2; k++) gg.add(new THREE.BoxGeometry(0.25, 1.0, 0.5).translate(-0.3, 5.9, k * 0.8), [0.05, 0.05, 0.06]);
    const gm = add(new THREE.Mesh(gg.done(), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10 })));
    sample(6, tmp); gm.matrixAutoUpdate = false;
    gm.matrix.set(tmp.tx, 0, tmp.rx, tmp.x, 0, 1, 0, tmp.y, tmp.tz, 0, tmp.rz, tmp.z, 0, 0, 0, 1); gm.castShadow = true; gm.frustumCulled = false; }
  // tribunas con público por fuera de las tres frenadas más fuertes
  const crowd = document.createElement("canvas"); crowd.width = 256; crowd.height = 128;
  { const g = crowd.getContext("2d"); g.fillStyle = "#3a4048"; g.fillRect(0, 0, 256, 128);
    const pal = ["#e8452c", "#f2d23c", "#f2f2f2", "#3a7be8", "#ff8000", "#1f1f24", "#d9c9a8", "#00d7b6", "#e6e6e6", "#b03030"];
    for (let y = 6; y < 128; y += 5) { g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, y + 3, 256, 2); for (let x = 0; x < 256; x += 3) if (hash2(x, y) > 0.14) { g.fillStyle = pal[Math.floor(hash2(x * 3.1, y * 1.7) * pal.length)]; g.fillRect(x, y, 2, 3); } } }
  const crowdTex = new THREE.CanvasTexture(crowd); crowdTex.wrapS = THREE.RepeatWrapping; crowdTex.repeat.set(3, 1);
  const stands = brakes.slice().sort((a, b) => (vr[a] - vr[b])).slice(0, 3);
  const stM = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ map: crowdTex }), stands.length));
  const roofM = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshPhongMaterial({ color: 0x596270, shininess: 5 }), stands.length));
  stands.forEach((bi, k) => { const s = bi * T.ds - 60; stM.setMatrixAt(k, place(s, sideAt(bi) - T.PS * 14, 0, 70, 9, 12)); roofM.setMatrixAt(k, place(s, sideAt(bi) - T.PS * 15, 10.5, 72, 0.5, 14)); });
  stM.frustumCulled = roofM.frustumCulled = false; stM.castShadow = roofM.castShadow = true;

  // ---- coches, ruedas, spray, sombras de reserva, fichas y aros
  const NC = sess.cars.length;
  const inst = (geo, mat, count, order) => { const m = add(new THREE.InstancedMesh(geo, mat, count)); m.frustumCulled = false; m.renderOrder = order; return m; };
  const cars = inst(CAR_GEO, CAR_MAT, NC, 10), wheels = inst(WHEEL_GEO, WHEEL_MAT, NC * 4, 10);
  cars.castShadow = wheels.castShadow = true; cars.receiveShadow = true;
  const blobs = inst(BLOB_GEO, BLOB_MAT, NC, 6), spray = inst(SPRAY_GEO, SPRAY_MAT, NC, 12);
  // segundo color por coche
  const c2a = new Float32Array(NC * 3);
  sess.cars.forEach((c, i) => { col.set(SECOND[c.team.id] || "#e2e4e8"); c2a.set([col.r, col.g, col.b], i * 3); });
  CAR_GEO.setAttribute("aCol2", new THREE.InstancedBufferAttribute(c2a, 3));
  const steer = inst(STEER_GEO, STEER_MAT, NC, 10);
  // lámina de dorsales
  const nc = document.createElement("canvas"); nc.width = NUM_COLS * 64; nc.height = NUM_ROWS * 64;
  { const g = nc.getContext("2d"); g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 46px 'Titillium Web', sans-serif"; g.lineJoin = "round";
    sess.cars.forEach((c, i) => { const x = (i % NUM_COLS) * 64 + 32, y = Math.floor(i / NUM_COLS) * 64 + 34, t = String(c.d.numero ?? ""); g.lineWidth = 8; g.strokeStyle = "#0c0d10"; g.strokeText(t, x, y); g.fillStyle = "#ffffff"; g.fillText(t, x, y); }); }
  const numMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  numMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", `vUv = (uv + vec2(mod(aCell, ${NUM_COLS}.0), ${NUM_ROWS - 1}.0 - floor(aCell / ${NUM_COLS}.0))) / vec2(${NUM_COLS}.0, ${NUM_ROWS}.0);`);
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
  world = { all, road, cars, wheels, blobs, spray, discs, rings, lamps, poles, halos, decals, steer };
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
}

// ------------------------------------------------------------------ luz según la hora
let lightT = -1e9, dayK = 1;
const sunDir = new THREE.Vector3(0.4, 0.7, 0.4);
const C = (h) => new THREE.Color(h), _c1 = C(0), _c2 = C(0), _c3 = C(0);
const SKY = { zDay: C(0x3d7bc8), zDusk: C(0x34447c), zNight: C(0x04060c), zGrey: C(0x7f8a96), hDay: C(0xc3d8ea), hDusk: C(0xf0a56c), hNight: C(0x0c111d), hGrey: C(0xaab3bc) };
function updateLight(now) {
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
  sun.intensity = day > 0.02 ? 1.25 * day * (1 - 0.65 * cloud) : 0.16;
  hemi.intensity = 0.22 + 0.62 * day * (1 - 0.2 * cloud);
  hemi.color.setHex(0x35405e).lerp(_c1.setHex(0xcfe0f5), day);
  const grey = cloud * 0.85 * day;
  const zen = _c1.copy(SKY.zNight).lerp(_c3.copy(SKY.zDay).lerp(SKY.zDusk, warm), day).lerp(SKY.zGrey, grey);
  const hor = _c2.copy(SKY.hNight).lerp(_c3.copy(SKY.hDay).lerp(SKY.hDusk, warm * 0.8), day).lerp(SKY.hGrey, grey);
  skyU.uZen.value.copy(zen); skyU.uHor.value.copy(hor); skyU.uSun.value.copy(sunDir); skyU.uCover.value = cloud;
  skyU.uSunCol.value.copy(sun.color).multiplyScalar(day > 0.02 ? day * (1 - 0.7 * cloud) : 0.25);
  skyU.uCloudCol.value.setRGB(1, 1, 1).lerp(hor, 0.3 + 0.4 * cloud).multiplyScalar(0.25 + 0.75 * day);
  skyU.uT.value = sess.weather.clock * 60;
  paintEnv(zen, hor);
  fog.color.copy(hor);
  if (renderer) renderer.setClearColor(hor, 1);
  U.uFlood.value = (1 - day) * 0.8;
  world.lamps.visible = world.poles.visible = world.halos.visible = day < 0.5;
}

// ------------------------------------------------------------------ calidad
const Q_NAME = ["Baja", "Media", "Alta"];
function applyQuality() {
  if (!renderer) return;
  const box = opt.box;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, [1, 1.5, 2][q]));
  renderer.setSize(box.clientWidth, box.clientHeight, false);
  sun.castShadow = q > 0;
  const ms = q === 2 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (world) world.blobs.visible = q === 0;
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
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.82, 0.88, 1.0, min(0.6, vA * 1.6)); }`,
    transparent: true, depthWrite: false,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 20; scene.add(l);
  return l;
})();

// ------------------------------------------------------------------ carrera
const visible = (c) => c.loc === "track" || c.loc === "pit";
function followCar() {
  const s = opt.selId() === null ? null : sess.cars.find((c) => c.id === opt.selId());
  if (s && visible(s)) return s;
  return opt.mine().find(visible) || sess.cars.find(visible) || null;
}
/** Escala del coche: muy agrandado de lejos, casi real de cerca. */
function carK(W) { const t = clamp((W - W_REAL) / Math.max(1, T.Wov - W_REAL), 0, 1); return W / (5.6 - 3.3 * t); }

// posición dibujada de cada coche: interpolada entre los dos últimos pasos de la simulación y llevada a la trazada
const pose = new Map(), _a = mkS(), _b = mkS();
function latAt(p, s, W, far) {
  const line = arrAt(T.line, s) * (1 - 0.45 * far) * (1 - Math.min(1, Math.abs(p.lat) / 0.3) * 0.65);
  if (p.c.loc === "pit") { const r = pitRamp(s); return line * (1 - r) + T.PS * (r * PIT_OFF + p.box * 0.62); }
  return clamp(line + p.lat, -0.82, 0.82);
}
function updatePoses(dtReal) {
  const alpha = opt.alpha();
  const list = [];
  for (const c of sess.cars) {
    if (!visible(c)) { pose.delete(c.id); continue; }
    let p = pose.get(c.id);
    if (!p) { p = mkS(); p.c = c; p.lat = 0; p.want = 0; p.box = 0; p.acc = 0; p.roll = 0; pose.set(c.id, p); }
    const p0 = prevS.get(c.id), jump = p0 === undefined || Math.abs(c.s - p0) > 40;
    p.s = jump ? c.s : p0 + (c.s - p0) * alpha;
    let boxT = 0;
    if (c.loc === "pit" && c.pit) {
      // la simulación cruza el pit-lane a velocidad constante: aquí el coche frena, se para en su caja y sale
      const f = clamp((c.pit.t - (1 - alpha) * sess.dt) / c.pit.total, 0, 1), ga = sess.garageAt(c), A = 0.4, B = 0.6;
      const g = f < A ? ga * (1 - (1 - f / A) ** 2) : f < B ? ga : ga + (1 - ga) * ((f - B) / (1 - B)) ** 2;
      p.s = c.pit.entryS + c.pit.dist * g;
      boxT = sstep(A - 0.1, A, f) - sstep(B, B + 0.1, f);
    }
    p.boxT = boxT; p.want = 0;
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
  const simDt = dtReal * (opt.paused() ? 0 : Math.min(8, opt.speed())), k1 = 1 - Math.exp(-simDt / 0.7), k2 = 1 - Math.exp(-simDt / 0.2);
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
    p.spin = ((p.spin || 0) + Math.min(c.v / 0.36, 13) * simDt) % (Math.PI * 2);
  }
  return list;
}
/** Coloca cada coche en su trazada con la anchura de pista del fotograma. */
function placeCars(list, W) {
  const far = clamp((W - 10) / Math.max(1, T.Wov * 0.8 - 10), 0, 1);
  for (const p of list) {
    sample(p.s, p);
    const l0 = latAt(p, p.s, W, far) * W * arrAt(T.wr, p.s);
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
const _tp = mkS(), _tq = mkS();
function updateCamera(dt, now) {
  const tgt = followCar(), p = tgt && pose.get(tgt.id);
  let mode = camMode;
  if (!p && mode !== "circuito") mode = "circuito";
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
  } else {
    // cámaras fijas en torres junto a la pista, como la realización de la tele: giran, hacen zoom y se corta de una a otra
    const spacing = 360 * Math.max(1, opt.speed() / 2), nCam = Math.max(3, Math.round(T.L / spacing)), sp = T.L / nCam;
    const idx = Math.floor(mod(p.s + sp * 0.6, T.L) / sp) % nCam;
    if (idx !== teleIdx) { teleIdx = idx; cut = true; }
    const cs = idx * sp, ci = Math.min(T.n - 1, Math.floor(cs / T.ds));
    sample(cs, _tq);
    // siempre en el lado contrario a los boxes
    const out = -T.PS * (1.7 * W_REAL + T.rO[ci] + 0.9);
    want.pos.set(_tq.x + _tq.rx * out, _tq.y + 9 + sp * 0.012, _tq.z + _tq.rz * out);
    want.look.set(p.px, p.py + 1, p.pz);
    const dist = want.pos.distanceTo(want.look);
    want.fov = clamp(2 * Math.atan(15 * fast / dist) * 180 / Math.PI, 4, 46);
  }
  if (cut || camSnap) { camFrom = null; camT = 1; }
  if (camFrom) {
    camT = Math.min(1, camT + dt / 0.9);
    const e = camT * camT * (3 - 2 * camT);
    cur.pos.lerpVectors(camFrom.pos, want.pos, e); cur.look.lerpVectors(camFrom.look, want.look, e); cur.fov = camFrom.fov + (want.fov - camFrom.fov) * e;
    if (camT >= 1) camFrom = null;
  } else if (mode === "tele" && !cut && !camSnap) {
    cur.pos.copy(want.pos); cur.look.lerp(want.look, 1 - Math.exp(-dt / 0.08)); cur.fov += (want.fov - cur.fov) * (1 - Math.exp(-dt / 0.3));
  } else { cur.pos.copy(want.pos); cur.look.copy(want.look); cur.fov = want.fov; }
  camera.position.copy(cur.pos); camera.fov = cur.fov;
  const dist = cur.pos.distanceTo(cur.look);
  camera.near = onboard ? 0.25 : Math.max(1.5, dist * 0.04);
  camera.updateProjectionMatrix(); camera.lookAt(cur.look);
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  sky.position.copy(cur.pos);
  // escala de maqueta: de lejos la pista y los coches engordan para leerse; de cerca, tamaño real
  const halfH = dist * Math.tan(cur.fov * Math.PI / 360);
  const wT = onboard ? W_REAL : clamp(halfH * 0.0195, W_REAL, T.Wov);
  curW = cut || camSnap ? wT : curW + (wT - curW) * (1 - Math.exp(-dt / 0.2));
  fog.near = Math.max(dist * 1.3, 220); fog.far = Math.max(dist * 6, 3800);
  // el sol ilumina (y da sombra) alrededor de lo que mira la cámara
  const S = onboard ? 75 : clamp(halfH * 2.1, 40, T.E * 0.9), sc = sun.shadow.camera;
  sun.target.position.copy(cur.look); sun.position.copy(cur.look).addScaledVector(sunDir, S * 3.2);
  sc.left = sc.bottom = -S; sc.right = sc.top = S; sc.near = 1; sc.far = S * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = S / 350;
  camSnap = false;
  return halfH;
}

// ------------------------------------------------------------------ dibujo 3D
const _ws = new THREE.Vector3(), mS = new THREE.Matrix4();
const m4 = new THREE.Matrix4(), mL = new THREE.Matrix4(), mW = new THREE.Matrix4(), _col = new THREE.Color();
const WHEELS = [[1.8, 0.83, 1, 0.92], [1.8, -0.83, 1, 0.92], [-1.7, 0.82, 0, 1.18], [-1.7, -0.82, 0, 1.18]]; // x, z, ¿gira?, ancho
let screenPts = [], rainClock = 0;
function draw3d(dt, now) {
  const list = updatePoses(dt);
  placeCars(list, curW);
  const halfH = updateCamera(dt, now);
  const W = curW, k = carK(W);
  const far = placeCars(list, W);
  U.uW.value = W;
  U.uDetail.value = clamp((T.Wov * 0.8 - W) / Math.max(1, T.Wov * 0.8 - W_REAL), 0, 1);
  updateWet(now); updateCloud(now); updateLight(now);
  U.uLight.value = rainHere > 0.3 ? (Math.floor(now / 160) % 2 ? 1 : 0.1) : 0.25;
  const { cars, wheels, blobs, spray, discs } = world;
  const dr = W * 0.6 * far;
  let i = 0, ns = 0;
  for (const p of list) {
    const c = p.c;
    // base del coche: delante, lado y arriba, con cabeceo al frenar o acelerar y balanceo en curva
    let fx = p.fx, fy = p.fy, fz = p.fz, rx = p.sx, ry = 0, rz = p.sz;
    let ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const th = clamp(p.acc / 55, -1, 0.4) * 0.05, ph = p.roll * 0.04;
    const f2x = fx + ux * th, f2y = fy + uy * th, f2z = fz + uz * th;
    const u2x = ux - fx * th + rx * ph, u2y = uy - fy * th + ry * ph, u2z = uz - fz * th + rz * ph;
    rx -= ux * ph; ry -= uy * ph; rz -= uz * ph;
    m4.set(f2x * k, u2x * k, rx * k, p.px,
      f2y * k, u2y * k, ry * k, p.py + 0.03 * k,
      f2z * k, u2z * k, rz * k, p.pz,
      0, 0, 0, 1);
    cars.setMatrixAt(i, m4); cars.setColorAt(i, _col.set(c.team.color));
    const steer = clamp(Math.atan(3.5 * p.kap) * 1.6, -0.5, 0.5);
    _col.set(COMPOUND[c.tyres?.c] || "#888888");
    for (let w = 0; w < 4; w++) {
      const wd = WHEELS[w];
      mL.makeRotationY(wd[2] ? steer : 0).multiply(mS.makeRotationZ(-p.spin)).scale(_ws.set(1, 1, wd[3])).setPosition(wd[0], 0.36, wd[1]);
      mW.multiplyMatrices(m4, mL);
      wheels.setMatrixAt(i * 4 + w, mW); wheels.setColorAt(i * 4 + w, _col);
    }
    if (q === 0) { mL.copy(m4); mL.elements[13] = p.py + 0.1; blobs.setMatrixAt(i, mL); } // sin sombras del sol, una mancha bajo el coche
    world.decals.setMatrixAt(i, m4);
    mL.makeRotationX(-steer * 2.4).setPosition(0.6, 0.67, 0); mW.multiplyMatrices(m4, mL); world.steer.setMatrixAt(i, mW);
    mL.makeScale(dr, dr, dr).setPosition(p.px, p.py + 0.3, p.pz); discs.setMatrixAt(i, mL); discs.setColorAt(i, _col.set(c.team.color));
    // spray: estela de agua detrás de cada coche sobre asfalto mojado
    const mi = track.msOfPoint[Math.min(T.n - 1, Math.floor(mod(p.s, T.L) / T.ds))], offLine = Math.min(1, Math.abs(p.lat) / 0.3);
    const wet = c.loc === "track" ? sess.water[mi] + (sess.waterOff[mi] - sess.water[mi]) * offLine : 0;
    if (wet > 0.12 && c.v > 22 && q > 0) {
      const len = (7 + c.v * 0.3) * Math.min(1, wet * 1.6) * k, rad = (1.5 + c.v * 0.035) * k;
      mL.set(fx * len, 0, p.sx * rad, p.px - fx * 2.2 * k,
        fy * len, rad * 0.8, 0, p.py + 0.5 * k,
        fz * len, 0, p.sz * rad, p.pz - fz * 2.2 * k,
        0, 0, 0, 1);
      spray.setMatrixAt(ns++, mL);
    }
    i++;
  }
  cars.count = blobs.count = discs.count = world.decals.count = world.steer.count = i; wheels.count = i * 4; spray.count = ns;
  discs.visible = far > 0.02;
  for (const m of [cars, wheels, blobs, discs, spray, world.decals, world.steer]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  const sel = opt.selId() === null ? null : pose.get(opt.selId());
  const ringFor = [...opt.mine().map((c) => (c.id === opt.selId() ? null : pose.get(c.id))), sel];
  world.rings.forEach((r, j) => {
    const p = ringFor[j];
    r.visible = !!p && far > 0.25;
    if (p) { r.position.set(p.px, p.py + 0.4, p.pz); r.scale.setScalar(k * 3.9); }
  });
  // lluvia: cae alrededor de lo que se mira, solo donde la textura dice que llueve
  rain.visible = q > 0 && rainHere > 0.15 && !reduced;
  if (rain.visible) {
    if (!opt.paused()) rainClock += dt * 1.6;
    const u = rain.material.uniforms, sz = clamp(halfH * 3.2, 60, 4000);
    u.uTime.value = rainClock; u.uCenter.value.copy(cur.look); u.uSize.value.set(sz, sz * 0.75, sz);
    u.uWind.value.set(Math.cos(sess.weather.windDir), -Math.sin(sess.weather.windDir));
  }
  renderer.render(scene, camera);
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
    if (ok && (p.c.player || p.c.id === opt.selId() || near) && !(camMode === "abordo" && p === fp)) {
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
const ghostEls = [0, 1].map(() => { const el = document.createElement("div"); el.className = "gh3"; el.hidden = true; opt.labels.appendChild(el); return el; });
function resize() {
  const w = opt.box.clientWidth, h = opt.box.clientHeight;
  if (w < 10 || h < 10) return;
  applyQuality();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fitOverview(); camSnap = true;
}
resize();
let fN = 0, fT = performance.now(), lowSecs = 0, warm = 0;
return {
  /** Antes de cada paso de la simulación: guarda dónde estaba cada coche, para interpolar. */
  beforeStep: remember,
  draw(dt, now) {
    draw3d(dt, now);
    if (opt.paused()) { fN = 0; fT = now; lowSecs = 0; return; } // en pausa se dibuja poco a propósito: no cuenta
    // calidad automática: si no llega a 40 fps tres segundos seguidos, baja un escalón (resolución, luego sombras y lluvia)
    fN++;
    if (now - fT >= 1000) {
      const fps = (fN * 1000) / (now - fT);
      if (++warm > 3 && q > 0) { lowSecs = fps < 40 ? lowSecs + 1 : 0; if (lowSecs >= 3) { q--; lowSecs = 0; applyQuality(); } }
      fN = 0; fT = now;
    }
  },
  /** Tras una pausa larga del dibujo (pestaña oculta, mapa tapado): que no cuente como fotogramas lentos. */
  idle() { fN = 0; fT = performance.now(); lowSecs = 0; },
  /** La cámara está cambiando de sitio: hay que seguir dibujando aunque la sesión esté en pausa. */
  moving: () => camFrom !== null || camSnap || performance.now() < busyUntil,
  resize() { resize(); busyUntil = performance.now() + 400; },
  cycleCam() { busyUntil = performance.now() + 1300; setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); return CAM_NAME[camMode]; },
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
    cloudTex.dispose(); if (sun.shadow.map) sun.shadow.map.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    opt.labels.innerHTML = "";
  },
};
}
