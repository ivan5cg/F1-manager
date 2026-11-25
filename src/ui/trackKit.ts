// Kit modular 3D escalable para los 24 circuitos (solo apariencia, 0 impacto en simulación).
// Incluye:
//  - Paneles LED FIA reactivos a banderas (amarilla local, SC/VSC, roja, verde)
//  - Torre de clasificación LED en recta de meta (Top 5 en vivo)
//  - Pantallas gigantes (Jumbotrons) frente a gradas y curvas clave
//  - Grúas telescópicas de rescate en las principales zonas de frenada (con hook opcional .glb)
//  - Vehículo de intervención / Medical Car en salida de boxes (con hook opcional .glb)
//  - Helicóptero de realización TV orbitando sobre la carrera en q >= 2 (con hook opcional .glb)
//  - Animación de norias (Suzuka y Singapur)

export interface TrackKitSample {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  rz: number;
}

export interface TrackKitInit {
  scene: any;
  trackId: string;
  trackName: string;
  L: number;
  ds: number;
  PS: number; // +1 derecha, -1 izquierda
  SH: number;
  W_REAL: number;
  street: boolean;
  pitEntry: number;
  pitExit: number;
  brakes: number[]; // índices de curva de frenada fuerte
  standS: [number, number, number][]; // [s, sg, len]
  rP: Float32Array;
  rO: Float32Array;
  sample: (s: number, out: TrackKitSample) => TrackKitSample;
  terrY: (x: number, z: number) => number;
  trackDist: (x: number, z: number) => number;
  isWet?: (x: number, z: number) => boolean;
  /** Opcional: cargador de modelos .glb del manifest (kit.crane / kit.heli / kit.medical). */
  loadKitGlb?: (key: "crane" | "heli" | "medical") => Promise<any>;
}

export interface TrackKitUpdate {
  dt: number;
  now: number;
  q: number;
  paused: boolean;
  W: number;
  uFlood: number;
  flag: string;
  lap: number;
  laps: number;
  kind: string;
  yelCenter: number;
  yelHalf: number;
  yelOn: number;
  top5: { abrev: string; color: string }[];
  leaderPos: { x: number; y: number; z: number } | null;
}

export interface TrackKitHandle {
  update: (u: TrackKitUpdate) => void;
  setFerrisTarget: (obj: any) => void;
  dispose: () => void;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function mergeBoxes(
  THREE: any,
  parts: { w: number; h: number; d: number; x: number; y: number; z: number; col: number; rx?: number; ry?: number; rz?: number }[],
): any {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    if (p.rz) g.rotateZ(p.rz);
    g.translate(p.x, p.y, p.z);
    const src = g.index ? g.toNonIndexed() : g;
    src.computeVertexNormals();
    const pa = src.attributes.position;
    const na = src.attributes.normal;
    c.setHex(p.col);
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nrm.push(na.getX(i), na.getY(i), na.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (src !== g) src.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function createTrackKit(THREE: any, cfg: TrackKitInit): TrackKitHandle {
  const root = new THREE.Group();
  root.name = "track_kit";
  cfg.scene.add(root);

  const geos: any[] = [];
  const mats: any[] = [];
  const texs: any[] = [];
  const trackGeo = <T,>(g: T) => { geos.push(g); return g; };
  const trackMat = <T,>(m: T) => { mats.push(m); return m; };
  const trackTex = <T,>(t: T) => { texs.push(t); return t; };
  const boxGeo = (parts: { w: number; h: number; d: number; x: number; y: number; z: number; col: number; rx?: number; ry?: number; rz?: number }[]) => trackGeo(mergeBoxes(THREE, parts));

  const tmp: TrackKitSample = { x: 0, y: 0, z: 0, tx: 1, ty: 0, tz: 0, rx: 0, rz: 1 };
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const vPos = new THREE.Vector3();
  const vScl = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const cTmp = new THREE.Color();

  const runAt = (sg: number, s: number) => {
    const i = Math.min(cfg.rP.length - 1, Math.floor(mod(s, cfg.L) / cfg.ds));
    return (sg === cfg.PS ? cfg.rP : cfg.rO)[i];
  };
  const inPitSpan = (s: number) => {
    const sm = mod(s, cfg.L);
    return sm >= cfg.pitEntry - 45 || sm <= cfg.pitExit + 45;
  };
  const safeLat = (sg: number, s: number, extra: number) => sg * (cfg.SH * cfg.W_REAL + runAt(sg, s) + extra);

  // =========================================================================
  // 1. PANELES LED FIA REACTIVOS (cada ~260 m alrededor del circuito)
  // =========================================================================
  const nLed = Math.max(8, Math.min(26, Math.round(cfg.L / 260)));
  const ledSpots: { s: number; x: number; y: number; z: number; yaw: number }[] = [];
  for (let k = 0; k < nLed; k++) {
    const s = mod(75 + (k * cfg.L) / nLed, cfg.L);
    const sg = k % 2 === 0 ? -cfg.PS : (inPitSpan(s) ? -cfg.PS : cfg.PS);
    cfg.sample(s, tmp);
    const lat = safeLat(sg, s, 2.2);
    const x = tmp.x + tmp.rx * lat;
    const z = tmp.z + tmp.rz * lat;
    if (cfg.isWet?.(x, z)) continue;
    // Mirando hacia los coches que se acercan (-tx, -tz)
    const yaw = Math.atan2(-(tmp.tz), tmp.tx) + Math.PI;
    ledSpots.push({ s, x, y: tmp.y, z, yaw });
  }
  const ledPoleGeo = boxGeo([
    { w: 0.22, h: 4.4, d: 0.22, x: 0, y: 2.2, z: 0, col: 0x2a2e35 },
    { w: 0.35, h: 1.55, d: 2.1, x: 0, y: 3.65, z: 0, col: 0x181b20 },
  ]);
  const ledPoleMat = trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }));
  const ledPoles = new THREE.InstancedMesh(ledPoleGeo, ledPoleMat, Math.max(1, ledSpots.length));
  ledPoles.frustumCulled = false;
  ledPoles.castShadow = false;

  const ledFaceGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.32, 1.88));
  ledFaceGeo.translate(0.14, 3.65, 0);
  const ledFaceMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  const ledFaces = new THREE.InstancedMesh(ledFaceGeo, ledFaceMat, Math.max(1, ledSpots.length));
  ledFaces.frustumCulled = false;
  ledFaces.renderOrder = 12;

  ledSpots.forEach((p, idx) => {
    m4.compose(vPos.set(p.x, p.y, p.z), q4.setFromAxisAngle(yAxis, p.yaw), vScl.set(1, 1, 1));
    ledPoles.setMatrixAt(idx, m4);
    ledFaces.setMatrixAt(idx, m4);
    ledFaces.setColorAt(idx, cTmp.setHex(0x1b2430));
  });
  ledPoles.count = ledFaces.count = ledSpots.length;
  ledPoles.instanceMatrix.needsUpdate = ledFaces.instanceMatrix.needsUpdate = true;
  if (ledFaces.instanceColor) ledFaces.instanceColor.needsUpdate = true;
  const ledGroup = new THREE.Group();
  ledGroup.add(ledPoles, ledFaces);
  root.add(ledGroup);

  // =========================================================================
  // 2. TORRE DE CLASIFICACIÓN LED EN RECTA DE META (Top 5 en vivo)
  // =========================================================================
  const towerGroup = new THREE.Group();
  const towerCv = document.createElement("canvas");
  towerCv.width = 256;
  towerCv.height = 512;
  const towerCtx = towerCv.getContext("2d")!;
  const towerTex = trackTex(new THREE.CanvasTexture(towerCv));
  towerTex.colorSpace = THREE.SRGBColorSpace;

  const towerBodyGeo = boxGeo([
    { w: 2.2, h: 1.8, d: 2.2, x: 0, y: 0.9, z: 0, col: 0x262a32 },
    { w: 1.5, h: 13.8, d: 1.5, x: 0, y: 8.5, z: 0, col: 0x16191f },
    { w: 2.1, h: 0.65, d: 2.1, x: 0, y: 15.6, z: 0, col: 0xc81e24 },
  ]);
  const towerBody = new THREE.Mesh(
    towerBodyGeo,
    trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 })),
  );
  towerBody.castShadow = true;
  towerGroup.add(towerBody);

  const towerScreenMat = trackMat(new THREE.MeshBasicMaterial({ map: towerTex, fog: false }));
  const screenPlaneGeo = trackGeo(new THREE.PlaneGeometry(1.42, 11.4));
  // 4 caras visibles desde cualquier ángulo de cámara
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Mesh(screenPlaneGeo, towerScreenMat);
    const a = (side * Math.PI) / 2;
    face.position.set(Math.sin(a) * 0.78, 8.6, Math.cos(a) * 0.78);
    face.rotation.y = a;
    towerGroup.add(face);
  }
  {
    const sT = 26;
    const sgT = -cfg.PS;
    cfg.sample(sT, tmp);
    const latT = safeLat(sgT, sT, 4.8);
    const tx = tmp.x + tmp.rx * latT;
    const tz = tmp.z + tmp.rz * latT;
    towerGroup.position.set(tx, tmp.y, tz);
    towerGroup.rotation.y = Math.atan2(-tmp.tz, tmp.tx);
    root.add(towerGroup);
  }

  // =========================================================================
  // 3. PANTALLAS GIGANTES (JUMBOTRONS) FRENTE A GRADAS Y CURVAS LENTAS
  // =========================================================================
  const jumboCv = document.createElement("canvas");
  jumboCv.width = 512;
  jumboCv.height = 256;
  const jumboCtx = jumboCv.getContext("2d")!;
  const jumboTex = trackTex(new THREE.CanvasTexture(jumboCv));
  jumboTex.colorSpace = THREE.SRGBColorSpace;
  const jumboScreenMat = trackMat(new THREE.MeshBasicMaterial({ map: jumboTex, fog: false }));

  const jumboFrameGeo = boxGeo([
    { w: 0.65, h: 7.2, d: 0.65, x: -5.4, y: 3.6, z: 0, col: 0x353b44 },
    { w: 0.65, h: 7.2, d: 0.65, x: 5.4, y: 3.6, z: 0, col: 0x353b44 },
    { w: 12.6, h: 6.4, d: 0.75, x: 0, y: 9.8, z: 0, col: 0x16191f },
    { w: 12.8, h: 0.45, d: 0.85, x: 0, y: 13.2, z: 0, col: 0xc81e24 },
  ]);
  const jumboFrameMat = trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }));
  const jumboFaceGeo = trackGeo(new THREE.PlaneGeometry(11.6, 5.6));

  const jumboGroup = new THREE.Group();
  const jumboSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  const candidateS: { s: number; sg: number }[] = [];
  for (const [s, sg] of cfg.standS.slice(0, 6)) {
    // Pantalla al lado contrario de la grada (para que el público la vea)
    candidateS.push({ s, sg: -sg });
  }
  for (const bi of cfg.brakes.slice(0, 4)) {
    const s = bi * cfg.ds;
    candidateS.push({ s, sg: -cfg.PS });
  }
  for (const cand of candidateS) {
    if (jumboSpots.length >= 4) break;
    if (cand.sg === cfg.PS && inPitSpan(cand.s)) continue;
    cfg.sample(cand.s, tmp);
    const lat = safeLat(cand.sg, cand.s, 8.5);
    const x = tmp.x + tmp.rx * lat;
    const z = tmp.z + tmp.rz * lat;
    if (cfg.isWet?.(x, z)) continue;
    if (cfg.trackDist(x, z) < cfg.SH * cfg.W_REAL + 4.5) continue;
    if (jumboSpots.some((o) => Math.hypot(o.x - x, o.z - z) < 280)) continue;
    // Cara mirando hacia la pista
    const yaw = Math.atan2(tmp.x - x, tmp.z - z);
    jumboSpots.push({ x, y: tmp.y, z, yaw });
  }
  for (const sp of jumboSpots) {
    const g = new THREE.Group();
    g.position.set(sp.x, sp.y, sp.z);
    g.rotation.y = sp.yaw;
    const frame = new THREE.Mesh(jumboFrameGeo, jumboFrameMat);
    frame.castShadow = true;
    const face = new THREE.Mesh(jumboFaceGeo, jumboScreenMat);
    face.position.set(0, 9.8, 0.42);
    g.add(frame, face);
    jumboGroup.add(g);
  }
  root.add(jumboGroup);

  // =========================================================================
  // 4. GRÚAS TELESCÓPICAS DE RESCATE EN FRENADAS FUERTES (con hook .glb)
  // =========================================================================
  const craneGroup = new THREE.Group();
  const craneGeo = boxGeo([
    // Chasis y ruedas
    { w: 2.6, h: 0.9, d: 6.2, x: 0, y: 1.05, z: 0, col: 0x262a30 },
    { w: 2.8, h: 0.85, d: 1.1, x: 0, y: 0.55, z: -2.0, col: 0x16181c },
    { w: 2.8, h: 0.85, d: 1.1, x: 0, y: 0.55, z: 1.9, col: 0x16181c },
    // Carrocería amarilla y cabina
    { w: 2.5, h: 1.35, d: 4.8, x: 0, y: 2.1, z: -0.3, col: 0xeba918 },
    { w: 2.2, h: 1.25, d: 1.9, x: 0, y: 2.4, z: 2.1, col: 0x243442 },
    // Contrapeso trasero
    { w: 2.5, h: 1.1, d: 1.2, x: 0, y: 2.35, z: -2.8, col: 0x2e333a },
    // Pluma telescópica elevada mirando hacia la escapatoria
    { w: 0.72, h: 0.78, d: 8.8, x: 0, y: 4.5, z: 1.6, col: 0xf2b71c, rx: -0.42 },
    { w: 0.48, h: 0.52, d: 4.2, x: 0, y: 6.8, z: 6.2, col: 0xd99b10, rx: -0.42 },
    // Baliza ámbar en cabina
    { w: 0.45, h: 0.28, d: 0.45, x: 0, y: 3.2, z: 2.1, col: 0xff8800 },
  ]);
  const craneMat = trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }));
  const craneSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  if (!cfg.street) {
    for (const bi of cfg.brakes.slice(0, 6)) {
      if (craneSpots.length >= 3) break;
      const s = mod(bi * cfg.ds + 18, cfg.L);
      const sg = runAt(-cfg.PS, s) >= runAt(cfg.PS, s) ? -cfg.PS : cfg.PS;
      if (sg === cfg.PS && inPitSpan(s)) continue;
      const r = runAt(sg, s);
      if (r < 5) continue;
      cfg.sample(s, tmp);
      const lat = sg * (cfg.SH * cfg.W_REAL + r + 5.5);
      const x = tmp.x + tmp.rx * lat;
      const z = tmp.z + tmp.rz * lat;
      if (cfg.isWet?.(x, z)) continue;
      if (cfg.trackDist(x, z) < cfg.SH * cfg.W_REAL + 4) continue;
      if (craneSpots.some((o) => Math.hypot(o.x - x, o.z - z) < 220)) continue;
      const yaw = Math.atan2(tmp.x - x, tmp.z - z);
      craneSpots.push({ x, y: Math.max(tmp.y - 0.5, cfg.terrY(x, z)), z, yaw });
    }
  }
  const craneMeshes: any[] = [];
  for (const sp of craneSpots) {
    const m = new THREE.Mesh(craneGeo, craneMat);
    m.position.set(sp.x, sp.y, sp.z);
    m.rotation.y = sp.yaw;
    m.castShadow = true;
    craneGroup.add(m);
    craneMeshes.push(m);
  }
  root.add(craneGroup);

  // =========================================================================
  // 5. VEHÍCULO DE INTERVENCIÓN / MEDICAL CAR (salida de boxes, con hook .glb)
  // =========================================================================
  const medGroup = new THREE.Group();
  const medGeo = boxGeo([
    { w: 1.95, h: 0.72, d: 4.7, x: 0, y: 0.66, z: 0, col: 0xc81e24 },
    { w: 1.72, h: 0.62, d: 2.35, x: 0, y: 1.28, z: -0.25, col: 0x1d2630 },
    { w: 1.78, h: 0.08, d: 2.3, x: 0, y: 1.60, z: -0.25, col: 0xe6eaef },
    { w: 0.95, h: 0.16, d: 0.25, x: 0, y: 1.72, z: 0.1, col: 0x33b5ff },
    { w: 2.02, h: 0.62, d: 0.68, x: 0, y: 0.34, z: 1.45, col: 0x16181c },
    { w: 2.02, h: 0.62, d: 0.68, x: 0, y: 0.34, z: -1.45, col: 0x16181c },
  ]);
  const medMat = trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }));
  const medMesh = new THREE.Mesh(medGeo, medMat);
  medMesh.castShadow = true;
  {
    const sM = mod(cfg.pitExit - 35, cfg.L);
    cfg.sample(sM, tmp);
    const latM = cfg.PS * (cfg.SH * cfg.W_REAL + 5.0);
    const mx = tmp.x + tmp.rx * latM;
    const mz = tmp.z + tmp.rz * latM;
    if (!cfg.isWet?.(mx, mz)) {
      medGroup.position.set(mx, tmp.y, mz);
      medGroup.rotation.y = Math.atan2(tmp.tx, tmp.tz);
      medGroup.add(medMesh);
      root.add(medGroup);
    }
  }

  // =========================================================================
  // 6. HELICÓPTERO DE REALIZACIÓN TV (orbitando en q >= 2, con hook .glb)
  // =========================================================================
  const heliRoot = new THREE.Group();
  const heliBodyGeo = boxGeo([
    // Fuselaje blanco con franja roja F1 TV
    { w: 2.1, h: 1.75, d: 5.2, x: 0, y: 1.45, z: 0.3, col: 0xeef1f5 },
    { w: 2.16, h: 0.38, d: 4.8, x: 0, y: 1.15, z: 0.2, col: 0xc81e24 },
    // Cabina acristalada delantera
    { w: 1.92, h: 1.15, d: 2.0, x: 0, y: 1.65, z: 2.4, col: 0x192430 },
    // Cola y estabilizador
    { w: 0.45, h: 0.55, d: 5.4, x: 0, y: 1.7, z: -4.4, col: 0xeef1f5 },
    { w: 0.22, h: 1.7, d: 0.9, x: 0, y: 2.2, z: -6.9, col: 0xc81e24 },
    { w: 1.8, h: 0.14, d: 0.55, x: 0, y: 1.7, z: -5.4, col: 0x333942 },
    // Patines de aterrizaje
    { w: 0.14, h: 0.14, d: 4.4, x: -1.15, y: 0.15, z: 0.5, col: 0x262a32 },
    { w: 0.14, h: 0.14, d: 4.4, x: 1.15, y: 0.15, z: 0.5, col: 0x262a32 },
    { w: 2.3, h: 0.12, d: 0.12, x: 0, y: 0.55, z: 1.6, col: 0x262a32 },
    { w: 2.3, h: 0.12, d: 0.12, x: 0, y: 0.55, z: -0.6, col: 0x262a32 },
    // Gimbal de cámara TV bajo el morro
    { w: 0.55, h: 0.55, d: 0.55, x: 0, y: 0.55, z: 3.15, col: 0x181b20 },
  ]);
  const heliBody = new THREE.Mesh(
    heliBodyGeo,
    trackMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 })),
  );
  heliBody.castShadow = false;
  const rotorMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.4, metalness: 0.5 }));
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.65, 0.3);
  const blade1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.6, 0.06, 0.32)), rotorMat);
  const blade2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.06, 9.6)), rotorMat);
  mainRotor.add(blade1, blade2);

  const tailRotor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 1.8, 0.18)), rotorMat);
  tailRotor.position.set(0.28, 2.25, -6.95);
  heliRoot.add(heliBody, mainRotor, tailRotor);
  heliRoot.scale.setScalar(1.35);
  root.add(heliRoot);

  // Hook opcional para reemplazar vehículos procedurales por .glb de Sketchfab si existen en manifest.json
  if (cfg.loadKitGlb) {
    cfg.loadKitGlb("crane").then((tpl) => {
      if (!tpl || !craneSpots.length) return;
      for (const old of craneMeshes) craneGroup.remove(old);
      for (const sp of craneSpots) {
        const inst = tpl.clone(true);
        inst.position.set(sp.x, sp.y, sp.z);
        inst.rotation.y = sp.yaw;
        craneGroup.add(inst);
      }
    }).catch(() => {});
    cfg.loadKitGlb("heli").then((tpl) => {
      if (!tpl) return;
      heliBody.visible = false;
      mainRotor.visible = false;
      tailRotor.visible = false;
      heliRoot.add(tpl.clone(true));
    }).catch(() => {});
    cfg.loadKitGlb("medical").then((tpl) => {
      if (!tpl || !medGroup.children.length) return;
      medMesh.visible = false;
      medGroup.add(tpl.clone(true));
    }).catch(() => {});
  }

  // =========================================================================
  // ACTUALIZACIÓN EN VIVO (CanvasTextures de torre + pantallas, LEDs, heli, noria)
  // =========================================================================
  let lastBoardSig = "";
  let heliAngle = 0.7;
  let heliX = 0, heliZ = 0, heliY = 95, heliInit = false;
  let ferrisObj: any = null;

  function redrawBoards(u: TrackKitUpdate) {
    const fl = u.flag;
    const fCol = fl === "red" ? "#e3261c"
      : fl === "sc" || fl === "sc_in" || fl === "vsc" ? "#f5c418"
      : u.yelOn > 0.5 ? "#f5c418"
      : "#1ea84f";
    const fTxt = fl === "red" ? "BANDERA ROJA"
      : fl === "sc" || fl === "sc_in" ? "SAFETY CAR"
      : fl === "vsc" ? "VSC"
      : u.yelOn > 0.5 ? "AMARILLA"
      : u.kind === "RACE" || u.kind === "SPRINT" ? `VUELTA ${u.lap}/${u.laps}`
      : u.kind;

    // 1. Torre de tiempos (256x512)
    const g = towerCtx;
    g.fillStyle = "#0e1116";
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = fCol;
    g.fillRect(0, 0, 256, 58);
    g.fillStyle = fl === "sc" || fl === "sc_in" || fl === "vsc" || u.yelOn > 0.5 ? "#111" : "#fff";
    g.font = "900 26px 'Titillium Web', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(fTxt, 128, 30, 240);

    const rows = u.top5.slice(0, 5);
    rows.forEach((r, i) => {
      const y = 74 + i * 84;
      g.fillStyle = i % 2 ? "#161b23" : "#1c222c";
      g.fillRect(10, y, 236, 72);
      g.fillStyle = r.color || "#ffffff";
      g.fillRect(10, y, 14, 72);
      g.fillStyle = "#ffffff";
      g.font = "900 34px 'Titillium Web', sans-serif";
      g.textAlign = "left";
      g.fillText(String(i + 1), 36, y + 38);
      g.font = "900 38px 'Titillium Web', sans-serif";
      g.fillText(r.abrev || "---", 88, y + 38);
    });
    towerTex.needsUpdate = true;

    // 2. Pantallas gigantes (512x256)
    const j = jumboCtx;
    j.fillStyle = "#10141c";
    j.fillRect(0, 0, 512, 256);
    j.fillStyle = fCol;
    j.fillRect(0, 0, 512, 54);
    j.fillStyle = fl === "sc" || fl === "sc_in" || fl === "vsc" || u.yelOn > 0.5 ? "#111" : "#fff";
    j.font = "900 30px 'Titillium Web', sans-serif";
    j.textAlign = "left";
    j.textBaseline = "middle";
    j.fillText(cfg.trackName.toUpperCase(), 20, 28, 290);
    j.textAlign = "right";
    j.fillText(fTxt, 492, 28, 190);

    if (rows[0]) {
      j.fillStyle = rows[0].color || "#e02020";
      j.fillRect(20, 72, 16, 68);
      j.fillStyle = "#9aa5b4";
      j.font = "700 22px 'Titillium Web', sans-serif";
      j.textAlign = "left";
      j.fillText("LÍDER", 48, 88);
      j.fillStyle = "#ffffff";
      j.font = "900 44px 'Titillium Web', sans-serif";
      j.fillText(`1. ${rows[0].abrev}`, 48, 122);
    }
    for (let k = 1; k < Math.min(4, rows.length); k++) {
      const rx = 20 + (k - 1) * 162;
      j.fillStyle = "#1a202a";
      j.fillRect(rx, 162, 150, 72);
      j.fillStyle = rows[k].color || "#fff";
      j.fillRect(rx, 162, 10, 72);
      j.fillStyle = "#ffffff";
      j.font = "900 32px 'Titillium Web', sans-serif";
      j.textAlign = "left";
      j.fillText(`${k + 1} ${rows[k].abrev}`, rx + 20, 199);
    }
    jumboTex.needsUpdate = true;
  }

  return {
    setFerrisTarget(obj) {
      ferrisObj = obj;
    },
    update(u: TrackKitUpdate) {
      // Escalado por calidad: q=0 solo torre; q=1 + LEDs y pantallas; q>=2 + grúas, medical y helicóptero
      ledGroup.visible = u.q >= 1;
      jumboGroup.visible = u.q >= 1;
      craneGroup.visible = u.q >= 2;
      medGroup.visible = u.q >= 1;
      heliRoot.visible = u.q >= 2;

      // 1. Paneles LED FIA reactivos
      if (ledGroup.visible && ledSpots.length) {
        const blink = Math.floor(u.now / 260) % 2 === 0;
        const isRed = u.flag === "red";
        const isSc = u.flag === "sc" || u.flag === "sc_in" || u.flag === "vsc";
        for (let i = 0; i < ledSpots.length; i++) {
          const sp = ledSpots[i];
          const inYel = u.yelOn > 0.5 && Math.abs(mod(sp.s - u.yelCenter + cfg.L / 2, cfg.L) - cfg.L / 2) < u.yelHalf + 80;
          if (isRed) cTmp.setRGB(blink ? 2.6 : 0.6, 0.05, 0.05);
          else if (isSc || inYel) cTmp.setRGB(blink ? 2.4 : 0.35, blink ? 1.9 : 0.25, 0.02);
          else cTmp.setRGB(0.06, 0.14 + 0.12 * u.uFlood, 0.18 + 0.16 * u.uFlood);
          ledFaces.setColorAt(i, cTmp);
        }
        if (ledFaces.instanceColor) ledFaces.instanceColor.needsUpdate = true;
      }

      // 2. Redibujar torre y pantallas solo si cambia la clasificación, vuelta o bandera
      const sig = `${u.flag}|${u.lap}|${u.yelOn > 0.5 ? 1 : 0}|` + u.top5.slice(0, 5).map((r) => r.abrev).join(",");
      if (sig !== lastBoardSig) {
        lastBoardSig = sig;
        redrawBoards(u);
      }

      // 3. Helicóptero TV orbitando suavemente sobre el líder
      if (heliRoot.visible) {
        const dtc = Math.min(0.05, Math.max(0, u.dt));
        mainRotor.rotation.y += dtc * 24;
        tailRotor.rotation.x += dtc * 32;
        if (!u.paused) heliAngle += dtc * 0.18;
        const tx = (u.leaderPos?.x ?? 0) + Math.cos(heliAngle) * 145;
        const tz = (u.leaderPos?.z ?? 0) + Math.sin(heliAngle) * 145;
        const ty = (u.leaderPos?.y ?? 0) + 86 + Math.sin(heliAngle * 2.1) * 4;
        if (!heliInit) {
          heliX = tx; heliZ = tz; heliY = ty; heliInit = true;
        } else {
          const a = 1 - Math.exp(-dtc * 1.4);
          heliX += (tx - heliX) * a;
          heliZ += (tz - heliZ) * a;
          heliY += (ty - heliY) * a;
        }
        const vx = tx - heliX;
        const vz = tz - heliZ;
        heliRoot.position.set(heliX, heliY, heliZ);
        if (Math.hypot(vx, vz) > 0.5) {
          heliRoot.rotation.y = Math.atan2(vx, vz);
        } else {
          heliRoot.rotation.y = -heliAngle;
        }
        heliRoot.rotation.x = 0.08; // ligera inclinación hacia delante en vuelo
      }

      // 4. Animación lenta de noria (Suzuka / Singapur)
      if (ferrisObj && !u.paused) {
        ferrisObj.rotation.z += Math.min(0.05, Math.max(0, u.dt)) * 0.06;
      }
    },
    dispose() {
      cfg.scene.remove(root);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
