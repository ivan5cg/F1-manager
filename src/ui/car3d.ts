// @ts-nocheck
// El monoplaza en 3D y su librea: geometría, textura de la decoración (dibujo y patrocinadores de cada equipo) y
// materiales. Lo usan el mapa 3D de la sesión (map3d.ts) y la vista previa del creador de equipo.
import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { BRANDS, FONT, LIV_STYLES } from "./livery";
export { BRANDS, FONT, LIV_STYLES, LIV_NAMES } from "./livery";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));


// ------------------------------------------------------------------ coche
// color de vértice: r = cuánto color del equipo, g = gris fijo, b = luz roja trasera
// color de vértice: r = cuánto color del equipo, g = gris fijo (−1 = luz roja trasera), b = cuánto del segundo color del equipo
const TEAM = [1, 0, 0], TEAM2 = [0.5, 0.02, 0], BLACK = [0, 0.04, 0], WHITE = [0, 0.85, 0], RED = [0, -1, 0];
// casco del piloto: g = 2, su color (aHelm); g = 3, la franja (aHelm2). Los colores salen de helmetDesign, por coche.
const HELM = [0, 2, 0], HELM2 = [0, 3, 0];
// segundo color de cada equipo (para la línea del costado y un plano del alerón); el resto usa un gris claro
export const SECOND = { mercedes: "#16181c", ferrari: "#f4f4f4", redbull: "#f0c020", mclaren: "#16181c", racingbulls: "#f4f4f4", alpine: "#f078b4", haas: "#d8242c", audi: "#c4c8cc", williams: "#f4f4f4", astonmartin: "#cfe22a", cadillac: "#16181c" };
export function collect() {
  const pos = [], nor = [], col = [], prt = [];
  return {
    /** Pieza a la que pertenece lo que se añade (1 = alerón delantero, que se puede romper o cambiar). */
    part: 0,
    add(g, c) {
      const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
      const p = n.attributes.position.array, qn = n.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(qn[i], qn[i + 1], qn[i + 2]); col.push(c[0], c[1], c[2]); prt.push(this.part); }
    },
    /** Con sus propias normales (superficies redondas: tubos, esferas, tornos) y un solo color. */
    keep(g, c) {
      const n = g.index ? g.toNonIndexed() : g, cl = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < cl.length; i += 3) cl.set(c, i);
      n.setAttribute("color", new THREE.BufferAttribute(cl, 3)); this.raw(n);
    },
    /** Geometría ya sin índices, con sus normales y colores de vértice. */
    raw(g) {
      const p = g.attributes.position.array, qn = g.attributes.normal.array, cc = g.attributes.color.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(qn[i]); col.push(cc[i]); }
      for (let i = 0; i < p.length; i += 3) prt.push(this.part);
    },
    done() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute("aPart", new THREE.Float32BufferAttribute(prt, 1));
      return g;
    },
  };
}
/**
 * Piel tendida entre anillos de puntos [x, y, z] (todos con el mismo número de puntos): carrocería, alerones…
 * col(u, r) da el color del punto u (0..1 alrededor del anillo) del anillo r. Las aristas vivas (borde de salida
 * de un alerón, tapas) se quedan vivas y el resto se sombrea suave.
 */
export function skin(c, rings, col, crease = 0.75) {
  const R = rings.length, N = rings[0].length, pos = [], colr = [], idx = [];
  for (let r = 0; r < R; r++) for (let j = 0; j < N; j++) { pos.push(...rings[r][j]); colr.push(...col(j / N, r, rings[r][j])); }
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < N; j++) {
    const a = r * N + j, b = r * N + ((j + 1) % N), d = a + N, e = b + N;
    idx.push(a, b, d, b, e, d);
  }
  for (const r of [0, R - 1]) {
    const cI = pos.length / 3, m = [0, 0, 0];
    for (const p of rings[r]) { m[0] += p[0] / N; m[1] += p[1] / N; m[2] += p[2] / N; }
    pos.push(...m); colr.push(...col(0.5, r, m));
    for (let j = 0; j < N; j++) idx.push(cI, r * N + j, r * N + ((j + 1) % N));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  c.raw(toCreasedNormals(g, crease));
}
// Monoplaza genérico con las formas de los coches de 2026 (x hacia delante, y arriba, z a la derecha; metros): morro
// largo y bajo que se apoya en el alerón, piloto adelantado, pontones de boca alta que caen hacia atrás, aleta
// triangular y alerón trasero de tres planos. hi = malla fina (de cerca); si no, una ligera para verlo de lejos.
export function carGeometry(hi) {
  const c = collect(), DEG = Math.PI / 180;
  const ACC = [0, 0, 1]; // línea de la decoración: el segundo color del equipo
  const NA = hi ? 36 : 14, PER = hi ? 4 : 1; // puntos alrededor de cada sección y secciones intermedias por tramo
  /** Caja que se estrecha hacia delante (f) o hacia atrás (r): [escala alto, escala ancho, desplazamiento en alto]. */
  const part = (lx, ly, lz, x, y, z, colr, f, r) => {
    const g = new THREE.BoxGeometry(lx, ly, lz), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i) > 0 ? f : r;
      if (s) { p.setY(i, p.getY(i) * s[0] + (s[2] || 0)); p.setZ(i, p.getZ(i) * s[1]); }
    }
    c.add(g.translate(x, y, z), colr);
  };
  /** Brazo de sección aplanada entre dos puntos (suspensión, soportes). */
  const strut = (a, b, t, colr) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(t * 0.75, t * 0.75, len, hi ? 10 : 5, 1).rotateZ(Math.PI / 2).scale(1, 0.4, 1);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize())));
    c.keep(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), colr);
  };
  const tube = (pts, rad, colr, closed = false) => c.keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), hi ? 56 : 16, rad, hi ? 12 : 6, closed), colr);
  const ball = (rx, ry, rz, x, y, z, colr) => c.keep(new THREE.SphereGeometry(1, hi ? 20 : 8, hi ? 14 : 6).scale(rx, ry, rz).translate(x, y, z), colr);
  /** Secciones intermedias suaves (Catmull-Rom) entre las que se dan a mano. */
  const resample = (secs, per = PER) => {
    if (per <= 1) return secs;
    const m = secs.length, at = (i) => secs[clamp(i, 0, m - 1)], out = [];
    for (let i = 0; i < m - 1; i++) for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push(at(i).map((p1, j) => { const p0 = at(i - 1)[j], p2 = at(i + 1)[j], p3 = at(i + 2)[j]; return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t); }));
    }
    out.push(secs[m - 1]);
    return out;
  };
  /** Sección de carrocería: superelipse con distinto alto por arriba (hT) y por abajo (hB). */
  const sec = (x, yc, zc, hw, hT, hB, e = 2.6, N = NA) => {
    const ring = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
      const k = Math.pow(Math.pow(Math.abs(cy), e) + Math.pow(Math.abs(sz), e), -1 / e);
      ring.push([x, yc + (cy >= 0 ? hT : hB) * cy * k, zc + hw * sz * k]);
    }
    return ring;
  };
  const deg = (u) => { const a = u * 360; return a > 180 ? 360 - a : a; }; // 0 = arriba, 180 = abajo
  // decoración: arriba el color del equipo, una línea del segundo color a lo largo del coche, un tono más
  // oscuro por debajo y fibra de carbono vista en los bajos y en la zaga
  const livery = (a, x) => {
    const band = 72;
    if (a > 128 || (x < -0.9 && a > 98)) return BLACK;
    return a < band - 8 ? TEAM : a < band + 6 ? ACC : TEAM2;
  };
  /** Perfil de ala (cuerda 1 hacia atrás) y ala tendida entre estaciones [z, x del borde de ataque, y, cuerda, ángulo]. */
  const FOIL0 = [[0, 0], [0.04, 0.05], [0.22, 0.085], [0.52, 0.07], [0.82, 0.03], [1, 0], [0.82, -0.012], [0.52, -0.022], [0.22, -0.028], [0.04, -0.025]];
  const FOIL = hi ? [[0, 0], [0.012, 0.028], [0.04, 0.05], [0.11, 0.072], [0.22, 0.085], [0.37, 0.082], [0.52, 0.07], [0.68, 0.052], [0.82, 0.03], [0.93, 0.012], [1, 0],
    [0.93, -0.006], [0.82, -0.012], [0.68, -0.018], [0.52, -0.022], [0.37, -0.026], [0.22, -0.028], [0.11, -0.028], [0.04, -0.025], [0.012, -0.016]] : FOIL0;
  const wing = (st, colr) => skin(c, resample(st, hi ? 3 : 1).map(([z, x0, y0, ch, th]) => FOIL.map(([px, py]) => [x0 - px * ch * Math.cos(th), y0 + px * ch * Math.sin(th) + py * ch, z])), () => colr, 0.9);
  /** Chapa recortada: contorno en el plano x-y (a la altura z) o en planta x-z (a la altura y). round redondea las esquinas. */
  const outline = (pts, round) => new THREE.Shape(hi && round ? new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "catmullrom", round).getPoints(pts.length * 7).map((p) => new THREE.Vector2(p.x, p.y)) : pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const slab = (pts, t, round) => new THREE.ExtrudeGeometry(outline(pts, round), hi ? { depth: t * 0.6, bevelEnabled: true, bevelThickness: t * 0.2, bevelSize: t * 0.2, bevelSegments: 1 } : { depth: t, bevelEnabled: false });
  const plate = (pts, z, t, colr, round = 0) => c.add(slab(pts, t, round).translate(0, 0, z - (hi ? t * 0.3 : t / 2)), colr);
  const plateXZ = (pts, y, t, colr, round = 0) => c.add(slab(pts, t, round).rotateX(Math.PI / 2).translate(0, y + t, 0), colr);

  // casco: [x, y del centro, medio ancho, alto por arriba, alto por abajo]
  const spine = [[3.05, 0.15, 0.07, 0.03, 0.03], [2.9, 0.165, 0.1, 0.045, 0.04], [2.6, 0.2, 0.125, 0.06, 0.05], [2.2, 0.27, 0.15, 0.085, 0.07], [1.8, 0.37, 0.19, 0.15, 0.13],
    [1.4, 0.43, 0.25, 0.19, 0.18], [1.0, 0.46, 0.31, 0.22, 0.22], [0.6, 0.47, 0.37, 0.23, 0.26], [0.2, 0.48, 0.4, 0.24, 0.29], [-0.1, 0.5, 0.39, 0.3, 0.3],
    [-0.5, 0.52, 0.34, 0.33, 0.31], [-1.0, 0.5, 0.27, 0.3, 0.28], [-1.5, 0.45, 0.2, 0.24, 0.22], [-2.0, 0.4, 0.13, 0.17, 0.15], [-2.4, 0.37, 0.07, 0.1, 0.08]];
  // el hueco del habitáculo va en negro
  skin(c, resample(spine).map((q) => sec(q[0], q[1], 0, q[2], q[3], q[4])), (u, r, p) => (p[0] > 0.24 && p[0] < 1.04 && deg(u) < 42 - 55 * Math.abs(p[0] - 0.64) ** 2 ? BLACK : livery(deg(u), p[0])));
  // borde acolchado del habitáculo
  if (hi) tube([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => { const a = (k / 12) * Math.PI * 2, x = 0.62 + 0.44 * Math.cos(a); return [x, 0.705 - 0.03 * Math.cos(a) + 0.012, 0.215 * Math.sin(a)]; }), 0.024, BLACK, true);
  for (const s of [1, -1]) {
    // pontón: boca apaisada y alta, vientre recogido (se ve el suelo por debajo) y lomo que baja hasta el suelo
    const pod = [[0.72, 0.56, 0.52, 0.25, 0.085, 0.09], [0.66, 0.555, 0.52, 0.275, 0.1, 0.11], [0.35, 0.5, 0.53, 0.3, 0.15, 0.2], [-0.2, 0.43, 0.52, 0.3, 0.17, 0.2], [-0.8, 0.33, 0.45, 0.26, 0.14, 0.14], [-1.3, 0.24, 0.36, 0.18, 0.08, 0.07], [-1.7, 0.19, 0.28, 0.08, 0.04, 0.04]];
    skin(c, [pod[0], ...resample(pod.slice(1))].map((q) => sec(q[0], q[1], q[2] * s, q[3], q[4], q[5], 3.4, hi ? 28 : 12)), (u, r, p) => (r === 0 ? BLACK : livery(deg(u), p[0])));
    // deflectores tras la rueda delantera y aleta del borde del suelo
    plate([[1.36, 0.1], [1.36, 0.4], [1.0, 0.44], [0.9, 0.1]], 0.5 * s, 0.02, BLACK, 0.15);
    plate([[1.2, 0.1], [1.2, 0.3], [0.95, 0.3], [0.9, 0.1]], 0.66 * s, 0.018, BLACK, 0.15);
    plate([[0.9, 0.09], [0.86, 0.16], [-1.1, 0.14], [-1.2, 0.09]], 0.8 * s, 0.018, BLACK);
  }
  // toma de aire sobre el piloto, cámara de tele y aleta triangular de la tapa del motor
  const box = [[0.0, 0.98, 0.115, 0.11, 0.1], [-0.06, 0.985, 0.13, 0.12, 0.11], [-0.4, 0.99, 0.13, 0.11, 0.13], [-0.9, 0.9, 0.1, 0.09, 0.15], [-1.5, 0.74, 0.05, 0.05, 0.1]];
  skin(c, [box[0], ...resample(box.slice(1))].map((q) => sec(q[0], q[1], 0, q[2], q[3], q[4], 2.2, hi ? 24 : 10)), (u, r) => (r === 0 ? BLACK : TEAM));
  part(0.06, 0.09, 0.03, -0.3, 1.13, 0, BLACK);
  wing([-0.17, 0, 0.17].map((z) => [z, -0.18, 1.18, 0.24, 0]), BLACK); // cámara en T
  plate([[-0.75, 0.6], [-0.6, 1.07], [-1.0, 1.05], [-1.82, 0.84], [-1.97, 0.5]], 0, 0.03, TEAM, 0.08);
  // fondo plano (con su forma en planta), difusor y estructura trasera con el escape y la luz de lluvia
  plateXZ([[1.78, 0.2], [1.3, 0.52], [1.0, 0.79], [-1.15, 0.8], [-1.32, 0.6], [-2.1, 0.56], [-2.1, -0.56], [-1.32, -0.6], [-1.15, -0.8], [1.0, -0.79], [1.3, -0.52], [1.78, -0.2]], 0.06, 0.035, BLACK, 0.12);
  part(0.7, 0.2, 1.1, -2.0, 0.17, 0, BLACK, [0.2, 1, -0.08], [1, 1]);
  for (const z of [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42]) plate([[-1.7, 0.08], [-2.34, 0.1], [-2.34, 0.27]], z, 0.014, BLACK); // aletas del difusor
  c.keep(new THREE.CylinderGeometry(0.07, 0.085, 0.5, hi ? 20 : 8).rotateZ(Math.PI / 2).translate(-2.4, 0.36, 0), BLACK);
  c.keep(new THREE.CylinderGeometry(0.05, 0.05, 0.22, hi ? 16 : 6, 1, true).rotateZ(Math.PI / 2).translate(-2.3, 0.5, 0), [0, 0.3, 0]);
  part(0.05, 0.11, 0.13, -2.67, 0.36, 0, RED);
  // habitáculo: casco del piloto con su visera, halo y retrovisores
  { const g = new THREE.SphereGeometry(0.135, hi ? 28 : 12, hi ? 20 : 8).toNonIndexed(), p = g.attributes.position, cl = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); cl.set(x > 0.035 && y > -0.03 && y < 0.06 ? [0, 0.02, 0] : Math.abs(z) < 0.035 && y > 0 ? HELM2 : HELM, i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(cl, 3)); c.raw(g.translate(0.5, 0.79, 0)); }
  tube([[-0.46, 0.62, 0.275], [-0.3, 0.77, 0.295], [-0.12, 0.875, 0.305], [0.2, 0.925, 0.305], [0.45, 0.93, 0.3], [0.68, 0.915, 0.265], [0.85, 0.88, 0.2], [0.98, 0.845, 0.1], [1.05, 0.82, 0], [0.98, 0.845, -0.1], [0.85, 0.88, -0.2], [0.68, 0.915, -0.265], [0.45, 0.93, -0.3], [0.2, 0.925, -0.305], [-0.12, 0.875, -0.305], [-0.3, 0.77, -0.295], [-0.46, 0.62, -0.275]], 0.04, TEAM2);
  tube([[1.05, 0.82, 0], [1.14, 0.75, 0], [1.24, 0.64, 0], [1.3, 0.57, 0]], 0.03, TEAM2);
  for (const s of [1, -1]) {
    ball(0.05, 0.05, 0.11, 0.95, 0.74, 0.66 * s, TEAM); ball(0.012, 0.042, 0.095, 0.915, 0.74, 0.66 * s, [0, 0.5, 0]);
    strut([0.95, 0.66, 0.36 * s], [0.95, 0.73, 0.58 * s], 0.025, BLACK);
  }
  if (hi) { c.keep(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6).translate(1.9, 0.63, 0), BLACK); c.keep(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6).translate(2.3, 0.4, 0.05), BLACK); } // antena y pitot
  c.part = 1;
  // alerón delantero: plano principal en V de lado a lado (el morro se apoya en él), tres flaps por lado y derivas con su aleta
  const fwX = (z) => 3.0 - 0.3 * Math.abs(z) / 0.95, fwY = (z) => 0.085 + 0.025 * Math.abs(z) / 0.95;
  wing([-0.95, -0.7, -0.45, -0.2, 0, 0.2, 0.45, 0.7, 0.95].map((z) => [z, fwX(z), fwY(z), 0.3, 4 * DEG]), TEAM);
  for (const s of [1, -1]) {
    wing([0.13, 0.4, 0.66, 0.93].map((z) => [z * s, fwX(z) - 0.24, fwY(z) + 0.045, 0.19, 13 * DEG]), TEAM2);
    wing([0.15, 0.42, 0.67, 0.93].map((z) => [z * s, fwX(z) - 0.39, fwY(z) + 0.095, 0.17, 22 * DEG]), BLACK);
    wing([0.17, 0.43, 0.68, 0.93].map((z) => [z * s, fwX(z) - 0.52, fwY(z) + 0.16, 0.15, 32 * DEG]), ACC);
    plate([[2.76, 0.05], [2.74, 0.19], [2.5, 0.32], [2.2, 0.39], [2.02, 0.39], [2.02, 0.05]], 0.945 * s, 0.02, TEAM, 0.12);
    wing([0.95, 1.0, 1.03].map((z) => [z * s, 2.55, 0.24, 0.34, 6 * DEG]), TEAM);  // aleta exterior de la deriva
    part(0.6, 0.016, 0.09, 2.36, 0.055, 0.99 * s, BLACK);
  }
  c.part = 0;
  // alerón trasero: plano principal fijo y dos planos superiores móviles (aPart = 2, DRS/MO) entre las dos derivas
  const spoon = (z) => 0.035 * (1 - (z / 0.6) ** 2);
  const span = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];
  wing(span.map((z) => [z, -1.98, 0.81 - spoon(z), 0.38, 8 * DEG]), BLACK);
  c.part = 2;
  wing(span.map((z) => [z, -2.34, 0.865 - spoon(z) * 0.6, 0.2, 24 * DEG]), BLACK);
  wing(span.map((z) => [z, -2.5, 0.935 - spoon(z) * 0.3, 0.13, 38 * DEG]), TEAM);
  c.part = 0;
  if (hi) c.keep(new THREE.CapsuleGeometry(0.03, 0.2, 4, 10).rotateZ(Math.PI / 2).translate(-2.2, 0.9, 0), BLACK); // actuador del ala
  for (const s of [1, -1]) {
    plate([[-1.9, 0.56], [-1.88, 0.99], [-2.62, 1.04], [-2.66, 0.6], [-2.46, 0.3], [-2.22, 0.3]], 0.61 * s, 0.02, TEAM, 0.1);
    plate([[-1.84, 0.42], [-2.02, 0.81], [-2.15, 0.81], [-2.0, 0.42]], 0.07 * s, 0.02, BLACK, 0.1);
  }
  // suspensión: dos triángulos por rueda, tirante, barra de dirección o palier, y el portamanguetas con su conducto de freno
  for (const s of [1, -1]) {
    const fw = [1.8, 0.36, 0.7 * s], rw = [-1.7, 0.36, 0.68 * s];
    for (const y of [0.47, 0.27]) {
      strut([2.15, y - 0.06, 0.15 * s], [fw[0], y - 0.01, fw[2]], 0.035, BLACK); strut([1.35, y + 0.02, 0.24 * s], [fw[0], y - 0.01, fw[2]], 0.035, BLACK);
      strut([-1.25, y - 0.02, 0.22 * s], [rw[0], y - 0.03, rw[2]], 0.035, BLACK); strut([-2.05, y - 0.06, 0.12 * s], [rw[0], y - 0.03, rw[2]], 0.035, BLACK);
    }
    strut([1.6, 0.36, 0.2 * s], [1.72, 0.38, fw[2]], 0.025, BLACK);
    strut([1.75, 0.5, 0.2 * s], [1.8, 0.24, 0.62 * s], 0.03, BLACK);
    strut([-1.7, 0.36, 0.16 * s], rw, 0.045, BLACK);
    for (const w of [fw, rw]) c.keep(new THREE.CylinderGeometry(0.2, 0.2, 0.12, hi ? 24 : 8).rotateX(Math.PI / 2).translate(w[0], 0.36, w[2] - 0.05 * s), [0, 0.03, 0]);
  }
  return c.done();
}
/**
 * Coche mínimo (unos 300 triángulos, ruedas incluidas) para la vista general, donde cada coche ocupa unos pocos
 * píxeles: casco, pontones, tapa del motor, casco del piloto, alerones, fondo y cuatro ruedas negras. La librea sale
 * igual que en los otros (se proyecta según la forma).
 */
export function carMinGeometry() {
  const c = collect();
  const box = (lx, ly, lz, x, y, z, colr, back = null) => {
    const g = new THREE.BoxGeometry(lx, ly, lz), p = g.attributes.position;
    if (back) for (let i = 0; i < p.count; i++) if (p.getX(i) < 0) { p.setY(i, p.getY(i) * back[0] + back[2]); p.setZ(i, p.getZ(i) * back[1]); }
    c.add(g.translate(x, y, z), colr);
  };
  // casco: seis puntos por sección y siete secciones, del morro a la caja de cambios
  const sec = (x, yc, hw, hT, hB) => [[x, yc + hT, 0], [x, yc + hT * 0.55, hw], [x, yc - hB * 0.6, hw * 0.9], [x, yc - hB, 0], [x, yc - hB * 0.6, -hw * 0.9], [x, yc + hT * 0.55, -hw]];
  const spine = [[3.05, 0.15, 0.07, 0.03, 0.03], [2.2, 0.27, 0.15, 0.085, 0.07], [1.4, 0.43, 0.25, 0.19, 0.18], [0.6, 0.47, 0.37, 0.23, 0.26], [-0.1, 0.5, 0.39, 0.3, 0.3], [-1.0, 0.5, 0.27, 0.3, 0.28], [-2.4, 0.37, 0.07, 0.1, 0.08]];
  skin(c, spine.map((q) => sec(q[0], q[1], q[2], q[3], q[4])), (u) => (u > 0.3 && u < 0.7 ? [0, 0.04, 0] : [1, 0, 0]), 0.6);
  for (const s of [1, -1]) box(2.2, 0.32, 0.36, -0.4, 0.38, 0.55 * s, [1, 0, 0], [0.5, 0.7, -0.1]); // pontones
  box(1.6, 0.34, 0.26, -0.6, 0.88, 0, [1, 0, 0], [0.4, 0.5, -0.12]); // tapa del motor
  box(0.26, 0.24, 0.24, 0.5, 0.79, 0, HELM); // casco del piloto
  box(4.2, 0.04, 1.5, -0.15, 0.06, 0, [0, 0.04, 0]); // fondo
  box(0.5, 0.26, 1.24, -2.35, 0.9, 0, [0, 0.04, 0]); // alerón trasero
  c.part = 1;
  box(0.34, 0.05, 1.95, 2.85, 0.1, 0, [1, 0, 0]); // alerón delantero (el que se rompe)
  c.part = 0;
  for (const [x, z] of [[1.8, 0.83], [1.8, -0.83], [-1.7, 0.82], [-1.7, -0.82]]) c.add(new THREE.CylinderGeometry(0.36, 0.36, 0.34, 8).rotateX(Math.PI / 2).translate(x, 0.36, z), [0, 0.05, 0]);
  return c.done();
}
/** Rueda: neumático de flanco abombado, llanta de radios (de cerca) con disco de freno y banda del compuesto. */
export function wheelGeometry(hi) {
  const c = collect(), SEG = hi ? 48 : 16; // r = color del compuesto, g = gris fijo (−1 = disco de freno), b = metal
  const prof = (hi ? [[0.205, -0.165], [0.24, -0.172], [0.285, -0.176], [0.315, -0.172], [0.337, -0.16], [0.351, -0.14], [0.358, -0.115], [0.36, -0.07], [0.36, 0.07], [0.358, 0.115], [0.351, 0.14], [0.337, 0.16], [0.315, 0.172], [0.285, 0.176], [0.24, 0.172], [0.205, 0.165]]
    : [[0.2, -0.168], [0.295, -0.172], [0.34, -0.155], [0.36, -0.1], [0.36, 0.1], [0.34, 0.155], [0.295, 0.172], [0.2, 0.168]]).map(([r, a]) => new THREE.Vector2(r, a));
  c.keep(new THREE.LatheGeometry(prof, SEG).rotateX(Math.PI / 2), [0, 0.05, 0]);
  for (const sz of [1, -1]) {
    const face = (g) => (sz < 0 ? g.rotateY(Math.PI) : g);
    c.keep(face(new THREE.RingGeometry(0.248, 0.286, SEG)).translate(0, 0, sz * 0.1765), [1, 0, 0]);   // banda del compuesto
    c.keep(face(new THREE.RingGeometry(0.194, 0.226, SEG)).translate(0, 0, sz * 0.17), [0, 0.55, 1]);  // aro de la llanta
    if (hi) {
      // disco de freno detrás de los radios (al frenar fuerte se pone al rojo) y buje con tuerca central
      c.keep(face(new THREE.RingGeometry(0.095, 0.176, SEG)).translate(0, 0, sz * 0.146), [0, -1, 0]);
      c.keep(face(new THREE.ConeGeometry(0.088, 0.02, SEG, 1, true).rotateX(Math.PI / 2)).translate(0, 0, sz * 0.168), [0, 0.085, 0]);
      for (let k = 0; k < 8; k++) c.add(new THREE.BoxGeometry(0.125, 0.015, 0.008).translate(0.135, 0, sz * 0.164).rotateZ((k * Math.PI) / 4), [0, 0.14, 0.45]);
    } else {
      c.keep(face(new THREE.ConeGeometry(0.2, 0.022, SEG, 1, true).rotateX(Math.PI / 2)).translate(0, 0, sz * 0.166), [0, 0.085, 0]);
    }
    c.keep(face(new THREE.CylinderGeometry(0.045, 0.055, 0.03, hi ? 12 : 6).rotateX(Math.PI / 2)).translate(0, 0, sz * 0.178), [0, 0.45, 1]);
    for (let k = 0; k < 2; k++) c.add(new THREE.BoxGeometry(0.09, 0.022, 0.006).translate(0.31, 0, sz * 0.172).rotateZ(k * Math.PI + 0.4), [1, 0, 0]);
  }
  const g = c.done();
  g.setAttribute("aBrake", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}
// ------------------------------------------------------------------ libreas
// Cada equipo tiene su dibujo (sale de sus colores) y tres patrocinadores inventados, pintados en una lámina de 4 × 4
// casillas de 512 px. En cada casilla: el costado derecho, el izquierdo (los rótulos van en espejo para leerse bien) y la
// vista de arriba. El sombreador proyecta la casilla sobre la carrocería según hacia dónde mira cada punto.
const LIV_X0 = -2.8, LIV_X1 = 3.15, LIV_Y1 = 1.3, LIV_Z = 1.1;
const LIV_STYLE = { mercedes: "degradado", ferrari: "bandas", redbull: "rayo", mclaren: "aguja", racingbulls: "ondas", alpine: "partido", haas: "bloques", audi: "chevron", williams: "rayas", astonmartin: "puntos", cadillac: "llama" };
const THIRD = { mercedes: "#c9ced6", ferrari: "#ffd400", redbull: "#d8242c", mclaren: "#3a7be8", racingbulls: "#d8242c", alpine: "#ffffff", haas: "#16181c", audi: "#16181c", williams: "#0a2342", astonmartin: "#16181c", cadillac: "#c8a24a" };
export function liveryTexture(teams) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 2048;
  const g = cv.getContext("2d");
  const SX = 512 / (LIV_X1 - LIV_X0), REG = [[0, 192], [192, 192], [384, 128]]; // [fila, alto] de cada vista
  const lum = (hex) => { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };
  teams.forEach((tm, ti) => {
    if (ti >= 16) return;
    const ox = (ti % 4) * 512, oy = Math.floor(ti / 4) * 512;
    const c1 = tm.color, c2 = tm.librea?.color2 || SECOND[tm.id] || (lum(c1) > 0.5 ? "#1b1d22" : "#eef0f3"), c3 = THIRD[tm.id] || (lum(c1) > 0.5 ? "#16181c" : "#f4f4f4");
    let h = 0; for (const ch of String(tm.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const lv = tm.librea || {};
    const st = lv.estilo || LIV_STYLE[tm.id] || LIV_STYLES[h % LIV_STYLES.length];
    const spIdx = lv.marcas?.length === 3 ? lv.marcas.map((m) => m % BRANDS.length) : [0, 7, 11].map((d) => (ti * 5 + d) % BRANDS.length);
    const sp = spIdx.map((idx) => [idx, BRANDS[idx]]);
    for (let reg = 0; reg < 3; reg++) {
      const [ry, rh] = REG[reg], top = reg === 2, SY = top ? rh / (2 * LIV_Z) : rh / LIV_Y1;
      g.save();
      g.beginPath(); g.rect(ox, oy + ry, 512, rh); g.clip();
      // coordenadas del coche: x hacia delante; v = altura (costados) o lado (arriba)
      if (top) g.setTransform(SX, 0, 0, SY, ox - LIV_X0 * SX, oy + ry + rh / 2);
      else g.setTransform(SX, 0, 0, -SY, ox - LIV_X0 * SX, oy + ry + rh);
      paintDesign(g, st, top, c1, c2, c3);
      paintCarDetails(g, top);
      g.restore();
      // patrocinadores: [marca, x, v, ancho, alto, estilo] (estilo 0: letras del color que contrasta; 1: en su recuadro)
      const fg = lum(c1) > 0.55 ? "#121418" : "#ffffff";
      const put = ([bi, b], x, v, w, hh, boxed) => {
        const px = ox + (x - LIV_X0) * SX, py = top ? oy + ry + rh / 2 + v * SY : oy + ry + rh - v * SY;
        g.save(); g.translate(px, py); g.scale((reg === 1 ? -1 : 1) * SX / 100, SY / 100);
        if (top && v < -0.1) g.rotate(Math.PI); // el de la izquierda se lee desde la izquierda
        const W = w * 100, H = hh * 100, ic = boxed ? b[2] : fg, ms = H * 0.66;
        if (boxed) { g.fillStyle = b[1]; g.beginPath(); g.roundRect(-W / 2, -H / 2, W, H, H * 0.2); g.fill(); }
        g.font = `${boxed ? "" : "italic "}900 ${H * 0.8}px ${FONT}`; g.textAlign = "left"; g.textBaseline = "middle";
        const tw = g.measureText(b[0]).width, gap = H * 0.16, k = Math.min(1, Math.max(0.35, (W * 0.9 - ms - gap) / Math.max(1, tw)));
        const tot = ms + gap + tw * k, x0 = -tot / 2;
        g.save(); g.translate(x0 + ms * 0.5, 0); drawBrandMark(g, bi, ms, ic, boxed ? b[1] : c1); g.restore();
        g.save(); g.translate(x0 + ms + gap, H * 0.04); g.scale(k, 1);
        if (!boxed) { g.lineWidth = H * 0.12; g.strokeStyle = fg === "#ffffff" ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.4)"; g.strokeText(b[0], 0, 0); }
        g.fillStyle = ic; g.fillText(b[0], 0, 0);
        g.restore();
        g.restore();
      };
      if (!top) {
        put(sp[0], 0.0, 0.47, 1.15, 0.17, false);   // pontón
        put(sp[0], -2.28, 0.8, 0.62, 0.15, false);  // deriva del alerón trasero
        put(sp[1], 1.85, 0.3, 0.55, 0.085, true);   // morro
        put(sp[2], -0.85, 0.8, 0.42, 0.1, true);    // aleta de la tapa del motor
      } else {
        for (const z of [0.55, -0.55]) put(sp[0], -0.15, z, 0.9, 0.2, false); // lomo de los pontones
        put(sp[1], -0.9, 0, 0.85, 0.13, true);      // tapa del motor
        put(sp[2], 1.5, 0, 0.42, 0.1, true);        // morro, delante del dorsal
      }
    }
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/** Juntas de carrocería y branquias de refrigeración sobre la librea. */
function paintCarDetails(g, top) {
  g.save();
  const line = (pts, w = 0.012, col = "rgba(0,0,0,.32)") => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); pts.forEach(([x, v], i) => (i ? g.lineTo(x, v) : g.moveTo(x, v))); g.stroke();
  };
  if (!top) {
    // corte del morro, división de la tapa del motor y branquias laterales en el pontón
    line([[2.18, 0.14], [2.14, 0.36]]);
    line([[0.32, 0.34], [0.2, 0.68], [-0.45, 0.72], [-1.5, 0.56]]);
    line([[-0.4, 0.72], [-0.4, 1.06]]);
    for (let k = 0; k < 8; k++) {
      const x = 0.28 - k * 0.11;
      line([[x, 0.58], [x - 0.05, 0.64]], 0.015, "rgba(10,12,16,.5)");
      line([[x + 0.01, 0.58], [x - 0.04, 0.64]], 0.005, "rgba(255,255,255,.1)");
    }
  } else {
    for (const s of [1, -1]) {
      line([[2.18, 0.02 * s], [2.14, 0.14 * s]]);
      line([[0.45, 0.3 * s], [-0.25, 0.42 * s], [-1.45, 0.26 * s]]);
      for (let k = 0; k < 8; k++) {
        const x = 0.24 - k * 0.1;
        line([[x, 0.48 * s], [x - 0.05, 0.61 * s]], 0.016, "rgba(10,12,16,.48)");
      }
    }
  }
  g.restore();
}
/** Isotipo geométrico de cada una de las 16 marcas ficticias. */
function drawBrandMark(g, idx, s, fg, bg) {
  const r = s * 0.44;
  g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = Math.max(1.5, s * 0.14);
  g.lineJoin = "round"; g.lineCap = "round";
  switch (idx % 16) {
    case 0: g.beginPath(); g.moveTo(-r, -r * 0.7); g.lineTo(0, r * 0.8); g.lineTo(r, -r * 0.7); g.lineTo(r * 0.45, -r * 0.7); g.lineTo(0, r * 0.15); g.lineTo(-r * 0.45, -r * 0.7); g.closePath(); g.fill(); break;
    case 1: g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-r * 0.35, -r * 0.7); g.lineTo(-r * 0.35, r * 0.7); g.moveTo(-r * 0.3, 0); g.lineTo(r * 0.55, -r * 0.6); g.moveTo(-r * 0.3, 0); g.lineTo(r * 0.55, r * 0.6); g.stroke(); break;
    case 2: g.beginPath(); g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); g.fill(); g.fillStyle = bg; g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill(); break;
    case 3: g.beginPath(); g.moveTo(-r, r * 0.75); g.lineTo(0, -r * 0.85); g.lineTo(r, r * 0.75); g.lineTo(r * 0.35, r * 0.75); g.lineTo(0, 0); g.lineTo(-r * 0.35, r * 0.75); g.closePath(); g.fill(); break;
    case 4: g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, r, r * 0.36, -0.45, 0, Math.PI * 2); g.stroke(); break;
    case 5: g.beginPath(); g.moveTo(r * 0.3, -r); g.lineTo(-r * 0.7, r * 0.1); g.lineTo(r * 0.05, r * 0.1); g.lineTo(-r * 0.3, r); g.lineTo(r * 0.7, -r * 0.1); g.lineTo(-r * 0.05, -r * 0.1); g.closePath(); g.fill(); break;
    case 6: for (const dx of [-r * 0.42, r * 0.18]) { g.beginPath(); g.moveTo(dx - r * 0.45, -r * 0.7); g.lineTo(dx + r * 0.35, 0); g.lineTo(dx - r * 0.45, r * 0.7); g.stroke(); } break;
    case 7: g.beginPath(); g.moveTo(-r, -r * 0.6); g.lineTo(r, -r * 0.6); g.lineTo(-r, r * 0.6); g.lineTo(r, r * 0.6); g.stroke(); break;
    case 8: g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill(); break;
    case 9: g.fillRect(-r, -r * 0.7, r * 2, r * 0.36); g.fillRect(-r * 0.7, -r * 0.18, r * 1.7, r * 0.36); g.fillRect(-r * 0.4, r * 0.34, r * 1.4, r * 0.36); break;
    case 10: g.beginPath(); g.arc(0, r * 0.25, r * 0.8, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(0, r * 0.25); g.lineTo(r * 0.55, -r * 0.55); g.stroke(); g.beginPath(); g.arc(0, r * 0.25, r * 0.24, 0, Math.PI * 2); g.fill(); break;
    case 11: g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(-r * 0.4, -r, 0, 0); g.quadraticCurveTo(r * 0.4, r, r, 0); g.stroke(); break;
    case 12: g.beginPath(); g.moveTo(-r, -r * 0.6); g.lineTo(r, -r * 0.6); g.moveTo(0, -r * 0.6); g.lineTo(0, r * 0.85); g.stroke(); break;
    case 13: g.beginPath(); g.moveTo(-r, r * 0.6); g.lineTo(0, -r * 0.85); g.lineTo(r, r * 0.6); g.closePath(); g.stroke(); g.fillRect(-r * 0.45, r * 0.15, r * 0.9, r * 0.25); break;
    case 14: g.beginPath(); g.moveTo(-r * 0.8, -r * 0.8); g.lineTo(r * 0.8, r * 0.8); g.moveTo(r * 0.8, -r * 0.8); g.lineTo(-r * 0.8, r * 0.8); g.stroke(); break;
    default: g.beginPath(); g.arc(0, 0, r * 0.85, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(r * 0.85, r * 0.85); g.stroke(); break;
  }
}
/** Dibujo de la librea en coordenadas del coche (x, v). En la vista de arriba v es el lado (simétrico). */
export function paintDesign(g, st, top, c1, c2, c3) {
  const poly = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, v], i) => (i ? g.lineTo(x, v) : g.moveTo(x, v))); g.closePath(); g.fill(); };
  const both = (f) => { if (top) { f(1); f(-1); } else f(1); }; // arriba se repite en los dos lados
  const V = (y, z, s) => (top ? z * s : y); // altura en el costado o lado arriba
  g.fillStyle = c1; g.fillRect(-4, -2, 8, 4);
  switch (st) {
    case "degradado": {
      const gr = g.createLinearGradient(1.4, 0, -1.8, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(-4, -2, 8, 4);
      both((s) => poly([[3.2, V(0.33, 0.05, s)], [3.2, V(0.37, 0.08, s)], [-2.9, V(0.66, 0.52, s)], [-2.9, V(0.6, 0.46, s)]], c3));
      break;
    }
    case "bandas":
      both((s) => { poly([[-4, V(0.27, 0.15, s)], [4, V(0.27, 0.15, s)], [4, V(0.33, 0.21, s)], [-4, V(0.33, 0.21, s)]], c2);
        poly([[-4, V(0.355, 0.24, s)], [4, V(0.355, 0.24, s)], [4, V(0.375, 0.26, s)], [-4, V(0.375, 0.26, s)]], c3); });
      if (!top) poly([[-1.6, 1.4], [-2.9, 1.4], [-2.9, 0.55], [-1.9, 0.55]], c2);
      break;
    case "rayo":
      both((s) => { const pts = [], n = 9;
        for (let k = 0; k <= n; k++) { const x = 3.1 - (k / n) * 5.9; pts.push([x, V(k % 2 ? 0.62 : 0.4, k % 2 ? 0.55 : 0.2, s)]); }
        for (let k = n; k >= 0; k--) { const x = 3.1 - (k / n) * 5.9 - 0.25; pts.push([x, V(k % 2 ? 0.52 : 0.3, k % 2 ? 0.45 : 0.1, s)]); }
        poly(pts, c2); });
      if (!top) poly([[-2.9, 1.4], [-1.5, 1.4], [-1.9, 0.7], [-2.9, 0.75]], c3);
      break;
    case "aguja": {
      const pts = [];
      for (let k = 0; k <= 20; k++) { const v = top ? -1.2 + 2.4 * k / 20 : -0.1 + 1.5 * k / 20; pts.push([-0.3 + (top ? 1.3 * Math.abs(v) : 1.0 * Math.abs(v - 0.55)), v]); }
      poly([[-4, pts[0][1]], ...pts, [-4, pts[20][1]]], c2);
      both((s) => poly([[3.2, V(0.42, 0.0, s)], [-0.2, V(0.56, 0.05, s)], [-0.2, V(0.6, 0.09, s)], [3.2, V(0.46, 0.03, s)]], c3));
      break;
    }
    case "ondas":
      both((s) => { const a = [], b = [];
        for (let k = 0; k <= 40; k++) { const x = 3.2 - k * 6.2 / 40, w = 0.09 * Math.sin(x * 2.3); a.push([x, V(0.5 + w, 0.32 + w, s)]); b.unshift([x, V(0.38 + w, 0.2 + w, s)]); }
        poly([...a, ...b], c2);
        const d = a.map(([x, v]) => [x, v + (top ? 0.06 * s : 0.06)]), e = a.map(([x, v]) => [x, v + (top ? 0.03 * s : 0.03)]).reverse();
        poly([...d, ...e], c3); });
      break;
    case "partido":
      if (!top) { poly([[3.2, -1], [3.2, 0.24], [-2.9, 0.78], [-2.9, -1]], c2); poly([[3.2, 0.24], [3.2, 0.28], [-2.9, 0.82], [-2.9, 0.78]], c3); }
      else both((s) => { poly([[3.2, 0.3 * s], [-2.9, 0.18 * s], [-2.9, 1.3 * s], [3.2, 1.3 * s]], c2); poly([[3.2, 0.27 * s], [-2.9, 0.15 * s], [-2.9, 0.19 * s], [3.2, 0.31 * s]], c3); });
      break;
    case "bloques":
      both((s) => { poly([[0.8, V(0.62, 0.62, s)], [-0.2, V(0.62, 0.62, s)], [-0.7, V(0.32, 0.25, s)], [0.3, V(0.32, 0.25, s)]], c2);
        poly([[-0.9, V(1.2, 0.3, s)], [-1.6, V(1.2, 0.3, s)], [-2.1, V(0.55, 0.0, s)], [-1.4, V(0.55, 0.0, s)]], c2);
        poly([[2.6, V(0.25, 0.04, s)], [1.6, V(0.45, 0.12, s)], [1.4, V(0.45, 0.12, s)], [2.3, V(0.25, 0.04, s)]], c3); });
      break;
    case "chevron":
      for (const dx of [0, -1.5]) {
        if (!top) poly([[1.7 + dx, 0.55], [1.0 + dx, 1.1], [0.7 + dx, 1.1], [1.4 + dx, 0.55], [0.7 + dx, 0.0], [1.0 + dx, 0.0]], dx ? c3 : c2);
        else poly([[1.7 + dx, 0], [0.9 + dx, 1.2], [0.6 + dx, 1.2], [1.4 + dx, 0], [0.6 + dx, -1.2], [0.9 + dx, -1.2]], dx ? c3 : c2);
      }
      break;
    case "rayas":
      for (let k = 0; k < 7; k++) { const x = -0.4 - k * 0.36;
        if (!top) poly([[x, -0.2], [x - 0.16, -0.2], [x - 0.5, 1.4], [x - 0.34, 1.4]], k % 2 ? c3 : c2);
        else poly([[x, 0], [x - 0.16, 0], [x - 0.6, 1.2], [x - 0.44, 1.2], [x - 0.16, 0], [x - 0.6, -1.2], [x - 0.44, -1.2], [x, 0]], k % 2 ? c3 : c2); }
      break;
    case "puntos":
      g.fillStyle = c2;
      for (let x = -2.9; x < 3.2; x += 0.11) for (let v = top ? -1.15 : -0.1; v < (top ? 1.15 : 1.35); v += 0.11) {
        const r = 0.055 * clamp((0.9 - x) / 3.0, 0, 1);
        if (r > 0.006) { g.beginPath(); g.arc(x + (Math.round(v / 0.11) % 2) * 0.055, v, r, 0, Math.PI * 2); g.fill(); }
      }
      both((s) => poly([[3.2, V(0.4, 0.02, s)], [0.9, V(0.5, 0.12, s)], [0.9, V(0.54, 0.16, s)], [3.2, V(0.44, 0.05, s)]], c3));
      break;
    case "llama":
      both((s) => { for (let k = 0; k < 4; k++) {
        const v0 = top ? (0.08 + k * 0.17) * s : 0.25 + k * 0.13, L = 2.2 + 0.6 * Math.sin(k * 2.1), w = top ? 0.08 * s : 0.06;
        g.fillStyle = k % 2 ? c3 : c2; g.beginPath(); g.moveTo(3.2, v0 - w);
        g.bezierCurveTo(2.0, v0 - w, 3.1 - L * 0.6, v0 - w * 3, 3.1 - L, v0 + w * 2);
        g.bezierCurveTo(3.1 - L * 0.7, v0 + w * 0.5, 2.0, v0 + w * 1.2, 3.2, v0 + w); g.closePath(); g.fill(); } });
      break;
  }
}
export const LIV_GLSL = `
uniform sampler2D uLiv;
vec3 liveryAt(vec3 p, vec3 n, float cell){
  float cy = floor((cell + 0.5) / 4.0); vec2 c = vec2(floor(cell + 0.5) - 4.0 * cy, cy);
  float u = clamp((p.x - ${LIV_X0.toFixed(2)}) / ${(LIV_X1 - LIV_X0).toFixed(2)}, 0.002, 0.998);
  float left = (abs(p.z) > 0.03 ? p.z : n.z) < 0.0 ? 1.0 : 0.0; // por la posición: algunas pieles tienen la normal hacia dentro
  float ys = clamp(1.0 - p.y / ${LIV_Y1.toFixed(2)}, 0.004, 0.996) * 192.0 + left * 192.0;
  float yt = 384.0 + clamp(0.5 + p.z / ${(2 * LIV_Z).toFixed(2)}, 0.008, 0.992) * 128.0;
  vec3 side = texture2D(uLiv, vec2((c.x + u) / 4.0, 1.0 - (c.y * 512.0 + ys) / 2048.0)).rgb;
  vec3 topc = texture2D(uLiv, vec2((c.x + u) / 4.0, 1.0 - (c.y * 512.0 + yt) / 2048.0)).rgb;
  return mix(side, topc, smoothstep(0.5, 0.8, abs(n.y)));
}`;
// Carrocería: pintura con barniz (dos capas de brillo) que refleja el cielo. La geometría mezcla pintura, fibra de
// carbono, casco y luz trasera: vPaint dice cuánto de pintura tiene cada punto y el resto sale mate y sin barniz.
/** Material de la carrocería; U aporta uFlood (luz de los focos) y uLight (luz de lluvia trasera). */
// color de cada coche (o de cada rueda: el compuesto); las mallas que aún no lo tienen (la fina con calidad baja, las
// ruedas sueltas antes de la primera parada) se compilan sin él: así no falla el sombreador
const INST_COL_DEF = "\n#ifdef USE_INSTANCING_COLOR\n#define INST_COL instanceColor.rgb\n#else\n#define INST_COL vec3(1.0)\n#endif\n";
// Gotas de lluvia sobre la carrocería: una rejilla de casillas de 5 cm en el plano al que más mira cada punto, con
// una gota redonda en algunas (más cuanto más moja, uDrops). Devuelve (cuánto es gota, brillo de su reflejo). Solo de
// cerca: de lejos no se distinguen y se apagan.
const DROPS_GLSL = `
float dH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 dropsAt(vec3 p, vec3 n){
  vec3 a = abs(n); vec2 uv = a.y > max(a.x, a.z) ? p.xz : (a.z > a.x ? p.xy : p.zy);
  uv /= 0.05;
  float px = length(fwidth(uv));
  if (px > 0.8) return vec2(0.0);
  vec2 c = floor(uv), f = fract(uv) - 0.5;
  float h = dH(c), on = step(h, 0.25 + 0.45 * uDrops);
  vec2 o = vec2(dH(c + 3.1), dH(c + 7.7)) - 0.5;
  float r = 0.12 + 0.2 * dH(c + 1.3), d = length(f - o * (0.9 - 2.0 * r));
  float drop = on * smoothstep(r, r * 0.7, d);
  // el reflejo: un punto claro arriba de cada gota
  float hl = on * smoothstep(r * 0.4, r * 0.15, length(f - o * (0.9 - 2.0 * r) - vec2(-0.3, 0.35) * r));
  // el reflejo, solo si la gota ocupa varios píxeles (si no, parece ruido); la gota, un poco más lejos
  return vec2(drop * (1.0 - smoothstep(0.35, 0.8, px)), hl * (1.0 - smoothstep(0.08, 0.18, px)));
}`;
const CARBON_GLSL = `
float carbonWeave(vec3 p, vec3 n){
  vec3 a = abs(n);
  vec2 uv = a.y > max(a.x, a.z) ? p.xz : (a.z > a.x ? p.xy : p.zy);
  uv /= 0.008;
  float px = length(fwidth(uv));
  if (px > 0.7) return 0.5;
  vec2 c = floor(uv);
  float w = step(2.0, mod(c.x + c.y, 4.0));
  return mix(0.5, w, 1.0 - smoothstep(0.25, 0.7, px));
}`;
export function makeCarMaterial(livTex, U) {
const uLiv = { value: livTex };
const CAR_MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide });
CAR_MAT.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uFlood: U.uFlood, uLight: U.uLight, uLiv, uDrops: U.uDrops || { value: 0 } });
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + INST_COL_DEF + "uniform float uLight; attribute vec3 aCol2, aHelm, aHelm2; attribute vec4 aCarData; attribute float aPart; varying float vPaint, vGlow, vShade, vLiv, vHelm; varying vec3 vLP, vLN;")
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      if (aPart > 1.5 && aCarData.z > 0.001) {
        float da = 0.50 * aCarData.z, dc = cos(da), ds = sin(da);
        objectNormal.xy = vec2(objectNormal.x * dc - objectNormal.y * ds, objectNormal.x * ds + objectNormal.y * dc);
      }`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      // alerón delantero (aPart = 1): con daño (aCarData.y), el lado derecho se descuelga; sin él (cambio de morro), no se dibuja
      if (aPart > 0.5 && aPart < 1.5 && aCarData.y != 0.0) {
        if (aCarData.y < 0.0) transformed = vec3(2.6, 0.2, 0.0);
        else { float k = smoothstep(0.05, 0.95, transformed.z) * aCarData.y;
          transformed.y = max(0.012, transformed.y - 0.3 * k - 0.05 * k * (transformed.x - 2.4));
          transformed.x -= 0.1 * k; }
      }
      // alerón trasero móvil (aPart = 2): el plano superior se abre alrededor del borde de salida con DRS / MO (aCarData.z)
      if (aPart > 1.5 && aCarData.z > 0.001) {
        float da = 0.50 * aCarData.z, dc = cos(da), ds = sin(da);
        vec2 piv = vec2(-2.60, 0.99);
        vec2 rp = transformed.xy - piv;
        transformed.xy = piv + vec2(rp.x * dc - rp.y * ds, rp.x * ds + rp.y * dc);
      }`)
    .replace("#include <color_vertex>", `float kr = pow(color.r, 2.2), kb = pow(color.b, 2.2), red = step(color.g, -0.5);
      float h2 = step(2.5, color.g), h1 = step(1.5, color.g) - h2; vHelm = h1 + h2;
      vColor = vec4(INST_COL * kr + aCol2 * kb + vec3(pow(clamp(color.g, 0.0, 1.0), 2.2)) * (1.0 - vHelm) + aHelm * h1 + aHelm2 * h2 + vec3(0.25, 0.0, 0.0) * red, 1.0);
      vPaint = step(0.25, color.r + color.b); vGlow = red * max(uLight, aCarData.w); vShade = max(kr, kb); vLiv = aCarData.x; vLP = position; vLN = normal;`);
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFlood, uDrops; varying float vPaint, vGlow, vShade, vLiv, vHelm; varying vec3 vLP, vLN;" + LIV_GLSL + DROPS_GLSL + CARBON_GLSL)
    .replace("#include <color_fragment>", "#include <color_fragment>\nvec3 nL = normalize(vLN);\nif (vPaint > 0.5) diffuseColor.rgb = liveryAt(vLP, nL, floor(vLiv + 0.5)) * vShade;\nisCarb = (1.0 - vPaint) * (1.0 - step(0.5, vHelm)) * (1.0 - step(0.06, diffuseColor.r + diffuseColor.g + diffuseColor.b));\nif (isCarb > 0.5) { cw = carbonWeave(vLP, nL); diffuseColor.rgb = mix(vec3(0.005), vec3(0.018), cw); }\ndrop = uDrops > 0.01 ? dropsAt(vLP, nL) * uDrops : vec2(0.0); diffuseColor.rgb *= 1.0 - 0.3 * drop.x;")
    .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(mix(mix(0.62, 0.34 + 0.18 * (1.0 - cw), isCarb), roughness, vPaint), 0.04, drop.x);")
    .replace("#include <metalnessmap_fragment>", "float metalnessFactor = metalness * vPaint;")
    .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\nmaterial.clearcoat *= mix(0.32 * isCarb, 1.0, vPaint);")
    .replace("vec3 totalEmissiveRadiance = emissive;", "vec2 drop = vec2(0.0); float isCarb = 0.0, cw = 0.5;\nvec3 totalEmissiveRadiance = emissive + vColor.rgb * uFlood * 0.28 + vec3(3.2, 0.16, 0.06) * vGlow;")
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * drop.y * (0.15 + 0.6 * uFlood);");
};
CAR_MAT.userData.uLiv = uLiv; // para cambiar la librea sin rehacer el material
return CAR_MAT;
}
export function makeWheelMaterial() {
const WHEEL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
WHEEL_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + INST_COL_DEF + "attribute float aBrake; varying vec3 vLP; varying float vMetal, vDisc, vBrake, vWetTyre;")
    .replace("#include <color_vertex>", `float disc = step(color.g, -0.5);
      vColor = vec4(INST_COL * color.r + vec3(pow(max(color.g, 0.0), 2.2)) + vec3(0.05) * disc, 1.0);
      vMetal = color.b; vDisc = disc; vBrake = aBrake; vLP = position;
      vWetTyre = max(step(0.55, INST_COL.g) * (1.0 - step(0.65, INST_COL.r)), step(0.6, INST_COL.b));`);
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vLP; varying float vMetal, vDisc, vBrake, vWetTyre;")
    .replace("vec3 totalEmissiveRadiance = emissive;", "float groove = 0.0;\nvec3 totalEmissiveRadiance = emissive;")
    .replace("#include <color_fragment>", `#include <color_fragment>
      float rad = length(vLP.xy), ang = atan(vLP.y, vLP.x);
      float isSide = step(0.145, abs(vLP.z)) * step(0.22, rad) * (1.0 - vDisc);
      float isTread = (1.0 - step(0.145, abs(vLP.z))) * step(0.32, rad);
      if (isSide > 0.5 && rad > 0.24 && rad < 0.295) {
        float arc = smoothstep(0.22, 0.34, abs(sin(ang * 2.0)));
        diffuseColor.rgb = mix(vec3(0.015), diffuseColor.rgb, arc);
      }
      if (isTread > 0.5) {
        float gr = fract(sin(floor(ang * 48.0) * 12.989 + floor(vLP.z * 90.0) * 78.233) * 43758.545);
        diffuseColor.rgb *= 0.85 + 0.3 * gr;
        if (vWetTyre > 0.5) {
          float vpat = abs(fract((ang / 6.28318) * 18.0 + abs(vLP.z) * 4.5) - 0.5);
          float ch = smoothstep(0.06, 0.14, abs(abs(vLP.z) - 0.045));
          groove = 1.0 - min(smoothstep(0.08, 0.18, vpat), ch);
          diffuseColor.rgb *= 1.0 - 0.45 * groove;
        }
      }`)
    .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(mix(roughness + 0.1 * groove, 0.3, vMetal), 0.45, vDisc);")
    .replace("#include <metalnessmap_fragment>", "float metalnessFactor = mix(vMetal, 0.7, vDisc);")
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(5.2, 0.95, 0.08) * vDisc * vBrake * vBrake;");
};
return WHEEL_MAT;
}

/** Volante de F1 detallado en carbono con ruletas de colores, levas y manos enguantadas. */
export function steerGeometry() {
  const c = collect();
  const s = new THREE.Shape();
  s.moveTo(-0.14, -0.055); s.lineTo(-0.13, 0.055); s.lineTo(-0.075, 0.078);
  s.lineTo(0.075, 0.078); s.lineTo(0.13, 0.055); s.lineTo(0.14, -0.055);
  s.lineTo(0.08, -0.078); s.lineTo(0.045, -0.045); s.lineTo(-0.045, -0.045); s.lineTo(-0.08, -0.078);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  body.rotateY(Math.PI / 2).translate(-0.011, 0, 0);
  c.add(body, [0.07, 0.075, 0.085]);
  // marco de pantalla, botones/ruletas de colores y levas traseras
  c.add(new THREE.BoxGeometry(0.014, 0.076, 0.126).translate(-0.014, 0.014, 0), [0.02, 0.022, 0.028]);
  for (const [y, z, col] of [[0.036, 0.082, [0.9, 0.15, 0.1]], [0.008, 0.085, [0.95, 0.78, 0.1]], [-0.022, 0.08, [0.15, 0.78, 0.35]], [0.036, -0.082, [0.15, 0.55, 0.95]], [0.008, -0.085, [0.95, 0.78, 0.1]], [-0.022, -0.08, [0.9, 0.15, 0.1]]]) {
    c.keep(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8).rotateZ(Math.PI / 2).translate(-0.018, y, z), col);
  }
  // brazos: manga ignífuga que se afina hacia la muñeca, puño con franja, guante redondeado con dedos y pulgar
  const blob = (r, x, y, z, col) => c.keep(new THREE.SphereGeometry(1, 14, 10).scale(r[0], r[1], r[2]).translate(x, y, z), col);
  /** Tubo de sección elíptica a lo largo de una curva suave; rad = [radio, achatamiento] en cada punto dado. */
  const loft = (pts, rad, col, n = 10, sides = 12) => {
    const cur = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.5);
    const P = cur.getPoints(n), rings = [], m = rad.length - 1;
    for (let i = 0; i <= n; i++) {
      const t = cur.getTangentAt(i / n), ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(t, ref).normalize(), v = new THREE.Vector3().crossVectors(t, u);
      const f = (i / n) * m, k = Math.min(m - 1, Math.floor(f)), w = f - k;
      const r = rad[k][0] + (rad[k + 1][0] - rad[k][0]) * w, fl = rad[k][1] + (rad[k + 1][1] - rad[k][1]) * w;
      const ring = [];
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        ring.push([P[i].x + u.x * Math.cos(a) * r + v.x * Math.sin(a) * r * fl, P[i].y + u.y * Math.cos(a) * r + v.y * Math.sin(a) * r * fl, P[i].z + u.z * Math.cos(a) * r + v.z * Math.sin(a) * r * fl]);
      }
      rings.push(ring);
    }
    skin(c, rings, () => col, 0.8);
  };
  const SUIT = [0.09, 0.1, 0.13], SUIT2 = [0.13, 0.14, 0.18], CUFF = [0.82, 0.82, 0.85], GLOVE = [0.055, 0.06, 0.07], GRIP = [0.2, 0.21, 0.25], SEAM = [0.75, 0.1, 0.08];
  for (const sg of [1, -1]) {
    const hz = 0.135 * sg;
    // brazo entero: del hombro al codo y del codo a la muñeca, con el músculo del antebrazo y la muñeca fina
    loft([[-0.62, 0.05, 0.24 * sg], [-0.5, 0, 0.255 * sg], [-0.37, -0.1, 0.245 * sg]], [[0.058, 0.95], [0.052, 0.95], [0.045, 1]], SUIT, 6);
    blob([0.052, 0.05, 0.05], -0.37, -0.1, 0.245 * sg, SUIT2); // codo
    loft([[-0.37, -0.1, 0.245 * sg], [-0.27, -0.09, 0.225 * sg], [-0.16, -0.055, 0.185 * sg], [-0.075, -0.02, 0.148 * sg]], [[0.044, 1], [0.047, 0.92], [0.038, 0.9], [0.027, 0.92]], SUIT, 12);
    loft([[-0.31, -0.095, 0.235 * sg], [-0.30, -0.094, 0.233 * sg]], [[0.05, 0.9], [0.05, 0.9]], SEAM, 1); // banda reflectante del antebrazo
    loft([[-0.085, -0.025, 0.152 * sg], [-0.05, -0.008, 0.14 * sg]], [[0.03, 0.9], [0.031, 0.9]], CUFF, 3); // puño del mono
    loft([[-0.058, -0.012, 0.142 * sg], [-0.02, 0.0, hz]], [[0.031, 0.9], [0.034, 0.92]], GLOVE, 3); // puño del guante
    // dorso de la mano con nudillos y palma sobre el agarre
    blob([0.04, 0.044, 0.034], -0.02, 0.004, hz, GLOVE);
    blob([0.014, 0.035, 0.026], 0.0, 0.0, hz + 0.014 * sg, GRIP);
    for (let i = 0; i < 4; i++) {
      const y = 0.036 - i * 0.021, rr = 0.0105 - i * 0.0004;
      blob([0.013, 0.012, 0.012], -0.028, y, hz + 0.004 * sg, GLOVE); // nudillo
      // dedo que rodea el agarre: por detrás, por fuera y por delante, con la punta hacia el centro
      loft([[-0.032, y, 0.12 * sg], [-0.03, y, 0.152 * sg], [-0.002, y, 0.162 * sg], [0.026, y, 0.152 * sg], [0.032, y, 0.126 * sg]], [[rr, 1], [rr, 1], [rr * 0.9, 1], [rr * 0.82, 1]], GLOVE, 8, 8);
    }
    // pulgar en dos falanges, apoyado en la cara trasera del volante
    loft([[-0.04, 0.055, 0.13 * sg], [-0.03, 0.062, 0.108 * sg], [-0.016, 0.07, 0.092 * sg]], [[0.013, 1], [0.0115, 1], [0.0095, 1]], GLOVE, 5, 8);
  }
  return c.done();
}

// ------------------------------------------------------------------ modelos externos (.glb + Draco)
let glbCache = null; // Promise<{ carBase, wheelBase } | null>

function normName(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function classifyMesh(name) {
  if (/rueda|wheel|tyre|tire|rim|llanta/.test(name)) return { wheel: true };
  if (/aleron_del|front_wing|frontwing|ala_del/.test(name)) return { part: 1, col: TEAM };
  if (/luz|rain_light|taillight|tail_light|brake_light/.test(name)) return { part: 0, col: RED };
  if (/casco|helmet|driver|piloto/.test(name)) return { part: 0, col: HELM };
  if (/carbono|carbon|suelo|floor|difusor|diffuser|halo|susp|wishbone|brake|freno|cockpit|seat|escape|exhaust/.test(name)) return { part: 0, col: BLACK };
  if (/acento|accent|secundario|stripe|franja/.test(name)) return { part: 0, col: ACC };
  return { part: 0, col: TEAM };
}

function normalizeCarBounds(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b || b.isEmpty()) return;
  const sz = new THREE.Vector3(), ctr = new THREE.Vector3();
  b.getSize(sz); b.getCenter(ctr);
  const s = sz.x < 4.5 || sz.x > 6.5 ? 5.6 / Math.max(0.01, sz.x) : 1;
  const dx = sz.x < 4.5 || sz.x > 6.5 ? 0.25 - ctr.x * s : 0;
  const dy = b.min.y * s < -0.08 || b.min.y * s > 0.25 ? 0.04 - b.min.y * s : 0;
  const dz = Math.abs(ctr.z * s) > 0.15 ? -ctr.z * s : 0;
  if (s !== 1 || dx || dy || dz) g.applyMatrix4(new THREE.Matrix4().makeScale(s, s, s).setPosition(dx, dy, dz));
}

function normalizeWheelBounds(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b || b.isEmpty()) return;
  const sz = new THREE.Vector3(), ctr = new THREE.Vector3();
  b.getSize(sz); b.getCenter(ctr);
  const rad = Math.max(sz.x, sz.y) * 0.5;
  const s = rad > 0.01 ? 0.36 / rad : 1;
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z));
  if (s !== 1) g.scale(s, s, s);
}

/** Convierte una escena glTF al formato de atributos y colores de vértice de CAR_MAT y WHEEL_MAT. */
export function extractCarFromGltf(root, separateWheel = false) {
  const carC = collect(), whlC = collect();
  let hasCar = false, hasWhl = false;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const tag = classifyMesh(normName(`${o.name} ${o.material?.name || ""}`));
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    if (tag.wheel) {
      if (separateWheel && !hasWhl) { whlC.keep(ni, [0, 0.05, 0]); hasWhl = true; }
      return;
    }
    carC.part = tag.part;
    if (tag.col === HELM) {
      // el casco con su franja: una banda por arriba, de delante atrás, como en el integrado
      ni.computeBoundingBox();
      const bb = ni.boundingBox, p = ni.attributes.position, cl = new Float32Array(p.count * 3);
      const zc = (bb.min.z + bb.max.z) / 2, yc = (bb.min.y + bb.max.y) / 2, w = (bb.max.z - bb.min.z) * 0.13;
      for (let i = 0; i < p.count; i++) cl.set(Math.abs(p.getZ(i) - zc) < w && p.getY(i) > yc ? HELM2 : HELM, i * 3);
      ni.setAttribute("color", new THREE.BufferAttribute(cl, 3));
      carC.raw(ni);
    } else carC.keep(ni, tag.col);
    hasCar = true;
  });
  let carBase = null, wheelBase = null;
  if (hasCar) {
    carBase = carC.done();
    normalizeCarBounds(carBase);
    // etiquetar el plano superior del alerón trasero (aPart = 2) para animar DRS/MO sin romper las derivas
    const pos = carBase.attributes.position, prt = carBase.attributes.aPart;
    if (pos && prt) {
      let hasFlap = false;
      for (let i = 0; i < prt.count; i++) if (prt.getX(i) > 1.5) { hasFlap = true; break; }
      if (!hasFlap) {
        for (let t = 0; t + 2 < pos.count; t += 3) {
          if (prt.getX(t) > 0.5) continue;
          const x0 = pos.getX(t), y0 = pos.getY(t), z0 = pos.getZ(t);
          const x1 = pos.getX(t + 1), y1 = pos.getY(t + 1), z1 = pos.getZ(t + 1);
          const x2 = pos.getX(t + 2), y2 = pos.getY(t + 2), z2 = pos.getZ(t + 2);
          const cy = (y0 + y1 + y2) / 3;
          if (
            cy > 0.855
            && x0 < -1.82 && x1 < -1.82 && x2 < -1.82
            && y0 > 0.82 && y1 > 0.82 && y2 > 0.82
            && Math.abs(z0) < 0.51 && Math.abs(z1) < 0.51 && Math.abs(z2) < 0.51
          ) {
            prt.setX(t, 2); prt.setX(t + 1, 2); prt.setX(t + 2, 2);
          }
        }
        prt.needsUpdate = true;
      }
    }
  }
  if (hasWhl) {
    wheelBase = whlC.done();
    normalizeWheelBounds(wheelBase);
    wheelBase.setAttribute("aBrake", new THREE.BufferAttribute(new Float32Array(wheelBase.attributes.position.count), 1));
  }
  return { carBase, wheelBase };
}

/** Crea un GLTFLoader con decodificador Draco WASM servido directamente desde three/addons. */
export async function createDracoGltfLoader() {
  const [{ GLTFLoader }, { DRACOLoader }, { default: js }, { default: wasm }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
    import("three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url"),
    import("three/addons/libs/draco/gltf/draco_decoder.wasm?url"),
  ]);
  const draco = new DRACOLoader();
  draco.setDecoderPath({ js, wasm });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return { loader, draco };
}

/** Carga de forma asíncrona el monoplaza .glb (con Draco) si existe en assets/models/manifest.json. */
export function loadCarAssets(onReady) {
  if (!glbCache) {
    glbCache = (async () => {
      try {
        const base = `${import.meta.env.BASE_URL}assets/models/`;
        const res = await fetch(`${base}manifest.json`);
        if (!res.ok) return null;
        const man = await res.json();
        if (!man?.car && !man?.wheel) return null;
        const { loader, draco } = await createDracoGltfLoader();
        const resolveUrl = (p) => (/^(https?:)?\//.test(p) ? p : p.startsWith("assets/") ? `${import.meta.env.BASE_URL}${p}` : `${base}${p}`);
        let carBase = null, wheelBase = null;
        if (man.car) {
          const gltf = await loader.loadAsync(resolveUrl(man.car));
          ({ carBase, wheelBase } = extractCarFromGltf(gltf.scene, !man.wheel));
        }
        if (man.wheel) {
          const gltf = await loader.loadAsync(resolveUrl(man.wheel));
          const wC = collect();
          let ok = false;
          gltf.scene.updateWorldMatrix(true, true);
          gltf.scene.traverse((o) => {
            if (!o.isMesh || !o.geometry) return;
            const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
            const ni = g.index ? g.toNonIndexed() : g;
            if (!ni.attributes.normal) ni.computeVertexNormals();
            wC.keep(ni, [0, 0.05, 0]); ok = true;
          });
          if (ok) {
            wheelBase = wC.done();
            normalizeWheelBounds(wheelBase);
            wheelBase.setAttribute("aBrake", new THREE.BufferAttribute(new Float32Array(wheelBase.attributes.position.count), 1));
          }
        }
        const steer = Array.isArray(man.steer) && man.steer.length === 3 ? man.steer.map(Number) : null;
        const cam = Array.isArray(man.cam) && man.cam.length === 2 ? man.cam.map(Number) : null;
        // versión ligera opcional (resto de la parrilla y calidad baja): si falla, se queda la integrada
        let carLoBase = null;
        if (man.carLo) {
          try {
            const gltf = await loader.loadAsync(resolveUrl(man.carLo));
            carLoBase = extractCarFromGltf(gltf.scene, false).carBase;
          } catch { carLoBase = null; }
        }
        draco.dispose();
        return carBase || wheelBase || carLoBase ? { carBase, wheelBase, carLoBase, steer, cam } : null;
      } catch {
        return null;
      }
    })();
  }
  glbCache.then((res) => {
    if (!res) return;
    onReady({
      carGeo: res.carBase ? res.carBase.clone() : null,
      wheelGeo: res.wheelBase ? res.wheelBase.clone() : null,
      carLoGeo: res.carLoBase ? res.carLoBase.clone() : null,
      steer: res.steer,
      cam: res.cam,
    });
  });
}



/**
 * Vista previa del coche (creador de equipo): el monoplaza girando despacio en un estudio; se puede arrastrar para
 * girarlo. update(team) cambia color y librea; se para y libera la GPU solo cuando el lienzo sale de la página.
 */
export function createCarPreview(canvas, team) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  // un estudio sencillo para los reflejos de la pintura: cielo claro arriba, suelo oscuro abajo
  const pm = new THREE.PMREMGenerator(renderer), envS = new THREE.Scene();
  envS.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vP; void main(){ float y = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.06), vec3(1.2, 1.18, 1.15), smoothstep(-0.2, 0.6, y)) + vec3(2.5) * smoothstep(0.9, 0.97, y), 1.0); }" })));
  let envRT = pm.fromScene(envS, 0.02); scene.environment = envRT.texture;
  new HDRLoader().load(`${import.meta.env.BASE_URL}assets/env/estudio.hdr`, (hdr) => {
    if (!alive) { hdr.dispose(); return; }
    const rt = pm.fromEquirectangular(hdr);
    hdr.dispose();
    const old = envRT; envRT = rt;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.15;
    old.dispose();
  }, undefined, () => { /* respaldo procedural */ });
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const U = { uFlood: { value: 0 }, uLight: { value: 0 } };
  let tex = liveryTexture([team]);
  const mat = makeCarMaterial(tex, U), wmat = makeWheelMaterial();
  let geo = carGeometry(true), wgeo = wheelGeometry(true);
  geo.setAttribute("aCol2", new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
  geo.setAttribute("aCarData", new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
  // casco de la vista previa: blanco con la franja del color del equipo
  const col = new THREE.Color();
  geo.setAttribute("aHelm", new THREE.InstancedBufferAttribute(new Float32Array(col.set("#eceef2").toArray()), 3));
  geo.setAttribute("aHelm2", new THREE.InstancedBufferAttribute(new Float32Array(col.set(team.color).toArray()), 3));
  const car = new THREE.InstancedMesh(geo, mat, 1);
  car.setMatrixAt(0, new THREE.Matrix4()); car.setColorAt(0, col.set(team.color));
  const wheels = new THREE.InstancedMesh(wgeo, wmat, 4), m = new THREE.Matrix4();
  [[1.8, 0.83, 0.92], [1.8, -0.83, 0.92], [-1.7, 0.82, 1.18], [-1.7, -0.82, 1.18]].forEach(([x, z, w], i) => { wheels.setMatrixAt(i, m.makeScale(1, 1, w).setPosition(x, 0.36, z)); wheels.setColorAt(i, col.set("#e8452c")); });
  loadCarAssets(({ carGeo, wheelGeo, carLoGeo }) => {
    carLoGeo?.dispose(); // la vista previa siempre se ve de cerca: solo usa la fina
    if (!alive) { carGeo?.dispose(); wheelGeo?.dispose(); return; }
    if (carGeo) {
      for (const a of ["aCol2", "aCarData", "aHelm", "aHelm2"]) carGeo.setAttribute(a, geo.attributes[a]);
      car.geometry = carGeo; geo.dispose(); geo = carGeo;
    }
    if (wheelGeo) {
      wheels.geometry = wheelGeo; wgeo.dispose(); wgeo = wheelGeo;
    }
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40).rotateX(-Math.PI / 2).scale(1.1, 1, 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.position.y = 0.005;
  const group = new THREE.Group(); group.add(car, wheels, shadow); scene.add(group);
  const camera = new THREE.PerspectiveCamera(26, 2, 0.5, 100);
  camera.position.set(0, 2.1, 8.4); camera.lookAt(0, 0.4, 0);
  let yaw = -1.25, drag = null, alive = true, last = performance.now();
  canvas.addEventListener("pointerdown", (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (drag !== null) { yaw += (e.clientX - drag) * 0.012; drag = e.clientX; } });
  canvas.addEventListener("pointerup", () => { drag = null; });
  const loop = (now) => {
    if (!alive) return;
    if (!canvas.isConnected) { dispose(); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0 && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    if (drag === null) yaw += (now - last) * 0.00025;
    last = now;
    group.rotation.y = yaw;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  function dispose() {
    alive = false;
    tex.dispose(); geo.dispose(); wgeo.dispose(); mat.dispose(); wmat.dispose(); envRT.dispose(); pm.dispose();
    renderer.dispose();
  }
  return {
    canvas,
    update(t) {
      const old = tex; tex = liveryTexture([t]); mat.userData.uLiv.value = tex; old.dispose();
      car.setColorAt(0, col.set(t.color)); car.instanceColor.needsUpdate = true;
      const h2 = car.geometry.attributes.aHelm2; h2.array.set(col.toArray()); h2.needsUpdate = true;
    },
    dispose,
  };
}
