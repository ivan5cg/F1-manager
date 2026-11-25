// Manifiesto de hitos icónicos de los 24 circuitos (solo apariencia 3D, sin efecto en la simulación)
// y generador ligero de siluetas procedurales (placeholders) mientras no exista su .glb en
// public/assets/landmarks/<circuito>/<id>.glb.

export type LandmarkShape =
  | "ferris"
  | "cota_tower"
  | "arch_hotel"
  | "sail_tower"
  | "sands"
  | "sphere"
  | "lattice_tower"
  | "flames"
  | "castle_tower"
  | "palace"
  | "bull_monument"
  | "wing_pavilion"
  | "stadium"
  | "tower"
  | "spire"
  | "canopy"
  | "grand_hall";

export interface LandmarkSpec {
  /** Identificador único dentro del circuito (coincide con public/assets/landmarks/<circuito>/<id>.glb). */
  id: string;
  /** Nombre legible del hito. */
  nombre: string;
  /** Posición a lo largo de la vuelta (0..1). */
  sFrac: number;
  /** Lado respecto al sentido de marcha (-1 izquierda, +1 derecha). */
  side: -1 | 1;
  /** Separación mínima al eje de la pista en metros (se respeta además el margen de la vista general). */
  dist: number;
  /** Si es true, busca el claro central del infield cerca del centroide del circuito en lugar de pegarse a sFrac. */
  infield?: boolean;
  /** Coordenadas exactas [gx, gy] del juego (extraídas de OSM) para clavar hitos reales en su sitio exacto. */
  gameXY?: [number, number];
  /** Giro adicional en radianes respecto a la tangente del tramo. */
  rot?: number;
  /** Altura objetivo en metros (usada tanto por el placeholder como para normalizar el .glb). */
  height: number;
  /** Silueta procedural de respaldo mientras no exista el .glb. */
  shape: LandmarkShape;
  /** Color principal, secundario y brillo nocturno opcional (hex sRGB). */
  color: number;
  accent: number;
  glow?: number;
  /** Prompt sugerido en inglés para generación 3D en Google Colab (Hunyuan3D-2 / TripoSR). */
  prompt: string;
}

export const LANDMARKS: Record<string, readonly LandmarkSpec[]> = {
  melbourne: [
    { id: "skyline_melbourne", nombre: "Torres de Melbourne", sFrac: 0.70, side: -1, dist: 195, height: 115, shape: "sands", color: 0x5c768d, accent: 0xcfd9e2, glow: 0xffd58a, prompt: "Stylized low-poly Melbourne modern glass skyline towers cluster, clean architectural silhouette, PBR textures" },
    { id: "pabellon_lago", nombre: "Club náutico Albert Park", sFrac: 0.36, side: 1, dist: 72, height: 15, shape: "canopy", color: 0xe8ecef, accent: 0x1a7f46, prompt: "Stylized low-poly lakeside rowing club pavilion with white tensile canopy and timber deck" },
  ],
  shanghai: [
    { id: "puente_shanghai", nombre: "Pabellón puente de Shanghái", sFrac: 0.04, side: -1, dist: 92, height: 32, shape: "arch_hotel", color: 0xe6e9ee, accent: 0xc82026, glow: 0xff5a5a, prompt: "Stylized low-poly Shanghai International Circuit futuristic white and red arched paddock bridge pavilion" },
    { id: "loto_shanghai", nombre: "Pabellón del Loto", sFrac: 0.21, side: 1, dist: 112, height: 24, shape: "canopy", color: 0xebeef2, accent: 0xb82226, prompt: "Stylized low-poly lotus petal sculpted white race circuit grandstand canopy" },
  ],
  suzuka: [
    { id: "noria", nombre: "Noria de Suzuka", sFrac: 0.78, side: 1, dist: 120, height: 56, shape: "ferris", color: 0xedf0f4, accent: 0xd42228, glow: 0xffd978, prompt: "Stylized low-poly white and red Suzuka Circuit Ferris wheel with A-frame support and gondolas" },
    { id: "torre_suzuka", nombre: "Torre de Suzuka", sFrac: 0.02, side: 1, dist: 102, height: 28, shape: "tower", color: 0xebebee, accent: 0xc81e24, prompt: "Stylized low-poly Japanese motorsport timing tower, white and red stripes, glass top cabin" },
  ],
  bahrein: [
    { id: "torre_sakhir", nombre: "Torre VIP de Sakhir", sFrac: 0.03, side: 1, dist: 98, height: 45, shape: "sail_tower", color: 0xf0eee8, accent: 0xc81d25, glow: 0xffe2a8, prompt: "Stylized low-poly Bahrain Sakhir VIP curved sail tower in white and crimson red, desert motorsport architecture" },
    { id: "carpas_oasis", nombre: "Carpas del Oasis", sFrac: 0.50, side: 1, dist: 88, rot: 1.57, height: 18, shape: "canopy", color: 0xf2ede2, accent: 0xc89a4b, prompt: "Stylized low-poly white Bedouin desert tensile peak pavilions, clean architectural forms" },
  ],
  miami: [
    { id: "hard_rock_stadium", nombre: "Hard Rock Stadium", sFrac: 0.42, side: 1, dist: 135, height: 44, shape: "stadium", color: 0xeef2f5, accent: 0x1ea3c8, glow: 0x4de6ff, prompt: "Stylized low-poly Hard Rock Stadium Miami with open white roof canopy and four corner white cable-stayed spires" },
    { id: "pabellon_miami", nombre: "Pabellón Marina Miami", sFrac: 0.66, side: -1, dist: 82, height: 19, shape: "canopy", color: 0xf2f5f7, accent: 0x1ea3c8, prompt: "Stylized low-poly Miami turquoise and white modern palm marina hospitality pavilion" },
  ],
  montreal: [
    { id: "biosfera", nombre: "Biosphère de Montreal", sFrac: 0.26, side: -1, dist: 82, height: 62, shape: "sphere", color: 0xbac4ce, accent: 0x627384, glow: 0x99d6ff, prompt: "Stylized low-poly Montreal Biosphere geodesic dome steel lattice sphere on concrete base" },
    { id: "pabellon_olimpico", nombre: "Pabellón del Bassin Olympique", sFrac: 0.75, side: 1, dist: 82, height: 20, shape: "wing_pavilion", color: 0xe6eaee, accent: 0xc42026, prompt: "Stylized low-poly modern white concrete rowing basin grandstand pavilion" },
  ],
  monaco: [
    { id: "casino_montecarlo", nombre: "Casino de Montecarlo", sFrac: 0.26, side: -1, dist: 68, height: 26, shape: "palace", color: 0xeadcc2, accent: 0x4c8a72, glow: 0xffd996, prompt: "Stylized low-poly Monte Carlo Casino Belle Epoque cream limestone palace with green copper domes and ornate facade" },
    { id: "palacio_roca", nombre: "Palacio del Príncipe", sFrac: 0.88, side: 1, dist: 118, height: 34, shape: "castle_tower", color: 0xe2d2b5, accent: 0xb25c3c, prompt: "Stylized low-poly Prince Palace of Monaco Mediterranean stone castle fortress with battlements" },
  ],
  barcelona: [
    { id: "torre_montmelo", nombre: "Torre de Montmeló", sFrac: 0.03, side: 1, dist: 96, height: 28, shape: "tower", color: 0xebe6dc, accent: 0xc82424, prompt: "Stylized low-poly Circuit de Barcelona-Catalunya timing tower in white, red and ochre" },
    { id: "tribuna_catalunya", nombre: "Pabellón Catalunya", sFrac: 0.42, side: 1, dist: 86, rot: 1.57, height: 20, shape: "canopy", color: 0xedeae2, accent: 0xd49c1e, prompt: "Stylized low-poly modern Spanish race circuit curved sunshade pavilion in white and ochre" },
  ],
  spielberg: [
    { id: "toro_acero", nombre: "Toro de Spielberg", sFrac: 0.72, side: 1, dist: 72, gameXY: [-382.0, 312.0], height: 38, rot: 0.4, shape: "bull_monument", color: 0xb4bcc6, accent: 0xc81e24, prompt: "Stylized low-poly giant stainless steel and crimson charging bull sculpture on stone plinth, Red Bull Ring landmark" },
    { id: "voestalpine_wing", nombre: "Voestalpine Wing", sFrac: 0.052, side: 1, dist: 56, gameXY: [-238.0, -4.0], height: 26, rot: 0.27, shape: "wing_pavilion", color: 0xdce2e8, accent: 0xc81e24, prompt: "Stylized low-poly Red Bull Ring Voestalpine Wing futuristic sweeping cantilevered silver-white roof building" },
  ],
  silverstone: [
    { id: "the_wing", nombre: "The Wing Silverstone", sFrac: 0.01, side: 1, dist: 108, height: 24, shape: "wing_pavilion", color: 0xd0d6de, accent: 0x262a32, prompt: "Stylized low-poly Silverstone Wing pit complex with sharp angular silver metallic sawtooth roof" },
    { id: "torre_brdc", nombre: "Clubhouse BRDC", sFrac: 0.58, side: -1, dist: 84, height: 26, shape: "tower", color: 0xdce0e5, accent: 0x22262e, prompt: "Stylized low-poly British motorsport clubhouse tower in dark slate and white glass" },
  ],
  spa: [
    { id: "torre_eau_rouge", nombre: "Torre de Eau Rouge", sFrac: 0.14, side: -1, dist: 68, height: 32, shape: "tower", color: 0xe6e8ec, accent: 0xc81e24, prompt: "Stylized low-poly Spa-Francorchamps endurance race tower in white, red and yellow overlooking Eau Rouge" },
    { id: "pabellon_raidillon", nombre: "Pabellón del Raidillon", sFrac: 0.18, side: 1, dist: 78, height: 22, shape: "grand_hall", color: 0x5c646e, accent: 0xd8b21c, prompt: "Stylized low-poly Spa-Francorchamps Raidillon hillside grandstand hall with dark slate roof and glass facade" },
  ],
  hungaroring: [
    { id: "torre_hungaroring", nombre: "Torre de Hungaroring", sFrac: 0.03, side: 1, dist: 98, rot: 1.57, height: 26, shape: "tower", color: 0xebe9e4, accent: 0x1e7d3c, prompt: "Stylized low-poly Hungaroring timing tower with red white and green Hungarian accents" },
    { id: "pabellon_mogyorod", nombre: "Pabellón de la Colina", sFrac: 0.62, side: 1, dist: 86, height: 18, shape: "canopy", color: 0xebe7de, accent: 0xc42226, prompt: "Stylized low-poly amphitheatre hillside motorsport pavilion with curved white roof" },
  ],
  zandvoort: [
    { id: "faro_zandvoort", nombre: "Torre de las Dunas", sFrac: 0.16, side: -1, dist: 88, height: 34, shape: "sail_tower", color: 0xebe8e0, accent: 0xe66b1c, prompt: "Stylized low-poly Dutch coastal dunes lookout tower in white, orange and royal blue" },
    { id: "club_playa", nombre: "Pabellón Tarzan", sFrac: 0.72, side: 1, dist: 88, height: 16, shape: "canopy", color: 0xf0ece2, accent: 0x1c5db8, prompt: "Stylized low-poly Dutch beach circuit hospitality pavilion in white, orange and blue" },
  ],
  monza: [
    { id: "podio_monza", nombre: "Podio suspendido de Monza", sFrac: 0.015, side: 1, dist: 92, height: 20, shape: "wing_pavilion", color: 0xeceae4, accent: 0xc81e24, prompt: "Stylized low-poly Autodromo di Monza iconic cantilevered red and white podium structure" },
    { id: "villa_parco", nombre: "Villa del Parco di Monza", sFrac: 0.48, side: 1, dist: 112, height: 24, shape: "palace", color: 0xe8d7b8, accent: 0x1c7d3c, prompt: "Stylized low-poly classic Italian neoclassical villa in warm ochre and terracotta roof" },
  ],
  madrid: [
    { id: "pabellon_ifema", nombre: "Pabellones IFEMA", sFrac: 0.06, side: 1, dist: 96, height: 24, shape: "grand_hall", color: 0xdce2e8, accent: 0xc21e26, prompt: "Stylized low-poly IFEMA Madrid modern glass and crimson steel exhibition hall" },
    { id: "torre_monumental", nombre: "Torre de La Monumental", sFrac: 0.46, side: -1, dist: 88, height: 44, shape: "spire", color: 0xe6e9ee, accent: 0xc21e26, glow: 0xffc864, prompt: "Stylized low-poly modern Madrid motorsport landmark glass spire with crimson accents" },
  ],
  baku: [
    { id: "flame_towers", nombre: "Flame Towers", sFrac: 0.56, side: -1, dist: 215, height: 140, shape: "flames", color: 0x3b5875, accent: 0xff8c2b, glow: 0xff7824, prompt: "Stylized low-poly Baku Flame Towers trio of three curved flame-shaped glass skyscrapers glowing orange and blue" },
    { id: "torre_doncella", nombre: "Torre de la Doncella", sFrac: 0.38, side: 1, dist: 68, height: 29, shape: "castle_tower", color: 0xdcc6a0, accent: 0xb89c72, prompt: "Stylized low-poly Maiden Tower Baku ancient cylindrical warm sandstone medieval fortress tower" },
  ],
  singapur: [
    { id: "marina_sands", nombre: "Marina Bay Sands", sFrac: 0.62, side: -1, dist: 185, height: 145, shape: "sands", color: 0x6f8ca2, accent: 0xdbe3ea, glow: 0xffe4a8, prompt: "Stylized low-poly Marina Bay Sands Singapore three curved skyscrapers topped by the cantilevered boat-shaped SkyPark deck" },
    { id: "singapore_flyer", nombre: "Singapore Flyer", sFrac: 0.14, side: 1, dist: 155, rot: 1.57, height: 120, shape: "ferris", color: 0xdce4ec, accent: 0x3eb8e6, glow: 0x5ce1ff, prompt: "Stylized low-poly Singapore Flyer giant waterfront observation Ferris wheel illuminated at night" },
  ],
  austin: [
    { id: "torre_cota", nombre: "Torre COTA", sFrac: 0.62, side: 1, dist: 76, height: 77, shape: "cota_tower", color: 0xebedf0, accent: 0xc81e24, glow: 0xff4048, prompt: "Stylized low-poly Circuit of the Americas COTA observation tower with sweeping red tubular steel veil and white top deck" },
    { id: "anfiteatro_cota", nombre: "Anfiteatro COTA", sFrac: 0.45, side: -1, dist: 96, height: 22, shape: "canopy", color: 0xedf0f4, accent: 0x1b4ca0, prompt: "Stylized low-poly COTA Austin white tensile amphitheatre pavilion with blue accents" },
  ],
  mexico: [
    { id: "foro_sol", nombre: "Estadio Foro Sol", sFrac: 0.85, side: 1, dist: 78, height: 28, shape: "stadium", color: 0xdcd8d0, accent: 0x197d3a, glow: 0xffd26a, prompt: "Stylized low-poly Mexico City Foro Sol stadium bowl with concrete tiers and green red banners" },
    { id: "pabellon_mexico", nombre: "Pabellón Tricolor", sFrac: 0.35, side: -1, dist: 86, height: 20, shape: "canopy", color: 0xefede8, accent: 0xc21f24, prompt: "Stylized low-poly Mexican race circuit modern pavilion with green white and red canopy" },
  ],
  interlagos: [
    { id: "torre_interlagos", nombre: "Torre S de Senna", sFrac: 0.08, side: -1, dist: 72, height: 30, shape: "tower", color: 0xebe9e4, accent: 0x198038, prompt: "Stylized low-poly Interlagos Sao Paulo motorsport control tower in white, green and yellow" },
    { id: "pabellon_interlagos", nombre: "Pabellón Curva do Lago", sFrac: 0.56, side: 1, dist: 86, rot: 1.57, height: 18, shape: "canopy", color: 0xe8ece8, accent: 0xe0ba1c, prompt: "Stylized low-poly Brazilian race circuit cantilevered pavilion roof in white, green and yellow" },
  ],
  lasvegas: [
    { id: "esfera", nombre: "The Sphere", sFrac: 0.34, side: 1, dist: 148, height: 92, shape: "sphere", color: 0x22d8ff, accent: 0xff2ea8, glow: 0xffd028, prompt: "Stylized low-poly Las Vegas MSG Sphere giant glowing LED exosphere arena with vibrant cyan and magenta patterns" },
    { id: "torre_paris", nombre: "Torre París Strip", sFrac: 0.68, side: -1, dist: 132, height: 118, shape: "lattice_tower", color: 0xd4a44a, accent: 0xffd24c, glow: 0xffc438, prompt: "Stylized low-poly Paris Las Vegas illuminated golden Eiffel lattice tower replica at night" },
  ],
  lusail: [
    { id: "arco_lusail", nombre: "Arco de Lusail", sFrac: 0.04, side: 1, dist: 105, height: 34, shape: "arch_hotel", color: 0xeeeae4, accent: 0x7d1636, glow: 0xff5a82, prompt: "Stylized low-poly Lusail Qatar sleek curved architectural arch in white and Qatari maroon illuminated at night" },
    { id: "torre_lusail", nombre: "Torre del Desierto", sFrac: 0.52, side: 1, dist: 96, height: 56, shape: "spire", color: 0xe8e2d8, accent: 0x7d1636, glow: 0xffcf78, prompt: "Stylized low-poly modern Qatari desert glass spire tower with maroon geometric accent lighting" },
  ],
  yasmarina: [
    { id: "hotel_w", nombre: "Hotel W Abu Dhabi", sFrac: 0.72, side: 1, dist: 64, height: 36, shape: "arch_hotel", color: 0xdce4ee, accent: 0x1884be, glow: 0x6a5aff, prompt: "Stylized low-poly W Abu Dhabi Yas Marina hotel curved gridshell glass canopy glowing blue and violet at night" },
    { id: "torre_sol", nombre: "Torre Shams", sFrac: 0.28, side: -1, dist: 86, height: 60, shape: "spire", color: 0xe8eef4, accent: 0x1284cf, glow: 0x3ec8ff, prompt: "Stylized low-poly Yas Marina sleek white and blue illuminated glass observation spire" },
  ],
  sepang: [
    { id: "cubierta_sepang", nombre: "Cubierta Hibisco de Sepang", sFrac: 0.02, side: -1, dist: 98, height: 28, shape: "canopy", color: 0xf0f2f4, accent: 0xc21f24, prompt: "Stylized low-poly Sepang International Circuit iconic giant white undulating twin hibiscus-petal grandstand roof" },
    { id: "torre_sepang", nombre: "Torre de Sepang", sFrac: 0.52, side: -1, dist: 82, height: 38, shape: "spire", color: 0xebedf0, accent: 0xc21f24, prompt: "Stylized low-poly Sepang Malaysia motorsport observation spire in white and crimson" },
  ],
};

// ---- Generador de siluetas procedurales ligeras (40–180 triángulos cada una, pivote en y = 0) ----
function pushGeo(
  THREE: any,
  out: { pos: number[]; nrm: number[]; col: number[] },
  g: any,
  hex: number,
  emissiveBoost = 0,
) {
  const src = g.index ? g.toNonIndexed() : g;
  src.computeVertexNormals();
  const p = src.attributes.position;
  const n = src.attributes.normal;
  const c = new THREE.Color(hex);
  const k = 1 + emissiveBoost;
  for (let i = 0; i < p.count; i++) {
    out.pos.push(p.getX(i), p.getY(i), p.getZ(i));
    out.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    out.col.push(c.r * k, c.g * k, c.b * k);
  }
  if (src !== g) src.dispose();
  g.dispose();
}

/** Construye la geometría de respaldo (placeholder) de un hito, normalizada con base en y = 0 y altura = spec.height. */
export function buildLandmarkPlaceholder(THREE: any, spec: LandmarkSpec): any {
  const out = { pos: [] as number[], nrm: [] as number[], col: [] as number[] };
  const H = spec.height;
  const C = spec.color;
  const A = spec.accent;
  const G = spec.glow ?? A;
  const push = (g: any, hex: number, boost = 0) => pushGeo(THREE, out, g, hex, boost);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: number, ry = 0, rz = 0, boost = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    push(g, col, boost);
  };
  const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, col: number, rx = 0, rz = 0, boost = 0) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    push(g, col, boost);
  };

  // zócalo hundido (-4 m) para que ningún hito flote en terrenos con pendiente
  box(H * 0.24, 4.4, H * 0.24, 0, -2.0, 0, 0x6b7078);

  switch (spec.shape) {
    case "ferris": {
      const r = H * 0.42, cy = H * 0.54;
      const rim = new THREE.TorusGeometry(r, H * 0.025, 6, 20);
      rim.translate(0, cy, 0);
      push(rim, A, 0.35);
      const rimIn = new THREE.TorusGeometry(r * 0.78, H * 0.014, 5, 16);
      rimIn.translate(0, cy, 0);
      push(rimIn, C);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI;
        box(r * 1.96, H * 0.016, H * 0.016, 0, cy, 0, C, 0, ang);
      }
      // patas en A
      for (const s of [-1, 1]) {
        box(H * 0.04, cy * 1.06, H * 0.04, s * r * 0.34, cy * 0.5, -H * 0.07, C, 0, s * 0.32);
        box(H * 0.04, cy * 1.06, H * 0.04, s * r * 0.34, cy * 0.5, H * 0.07, C, 0, s * 0.32);
      }
      cyl(H * 0.05, H * 0.05, H * 0.22, 8, 0, cy, 0, G, Math.PI / 2, 0, 0.4);
      break;
    }
    case "cota_tower": {
      cyl(H * 0.045, H * 0.075, H * 0.92, 10, 0, H * 0.46, 0, C);
      cyl(H * 0.14, H * 0.11, H * 0.09, 12, 0, H * 0.88, 0, C);
      cyl(H * 0.145, H * 0.145, H * 0.025, 12, 0, H * 0.91, 0, G, 0, 0, 0.45);
      // velo metálico rojo curvo característico de COTA
      for (let k = 0; k < 5; k++) {
        const f = k / 4;
        box(H * 0.025, H * (0.34 + 0.14 * f), H * 0.18, -H * (0.04 + 0.08 * Math.sin(f * Math.PI)), H * (0.22 + 0.62 * f), 0, A, 0, 0.28 - 0.55 * f, 0.2);
      }
      break;
    }
    case "arch_hotel": {
      const span = H * 1.65;
      for (const s of [-1, 1]) {
        box(H * 0.42, H * 0.72, H * 0.48, s * span * 0.36, H * 0.36, 0, C);
      }
      box(span * 0.95, H * 0.26, H * 0.56, 0, H * 0.78, 0, A, 0, 0, 0.35);
      box(span * 1.04, H * 0.10, H * 0.66, 0, H * 0.94, 0, G, 0, 0, 0.55);
      break;
    }
    case "sail_tower": {
      box(H * 0.34, H * 0.76, H * 0.22, 0, H * 0.38, 0, C);
      box(H * 0.24, H * 0.96, H * 0.14, H * 0.06, H * 0.48, 0, A, 0, -0.14, 0.18);
      cyl(H * 0.02, H * 0.04, H * 0.24, 6, H * 0.12, H * 0.92, 0, G, 0, 0, 0.35);
      break;
    }
    case "sands": {
      const sp = H * 0.28;
      for (const s of [-1, 0, 1]) {
        box(H * 0.14, H * 0.88, H * 0.20, s * sp, H * 0.44, 0, C, 0, s * 0.04);
      }
      // cubierta SkyPark en forma de barco coronando las 3 torres
      box(H * 0.96, H * 0.08, H * 0.24, H * 0.06, H * 0.92, 0, A, 0, 0, 0.25);
      box(H * 0.88, H * 0.03, H * 0.26, H * 0.06, H * 0.97, 0, G, 0, 0, 0.45);
      break;
    }
    case "sphere": {
      const r = H * 0.52;
      const sp = new THREE.IcosahedronGeometry(r, 2);
      sp.translate(0, r * 0.92, 0);
      push(sp, C, spec.glow ? 0.35 : 0);
      const band = new THREE.TorusGeometry(r * 0.98, r * 0.045, 6, 18);
      band.rotateX(Math.PI / 2);
      band.translate(0, r * 0.92, 0);
      push(band, G, 0.65);
      const band2 = new THREE.TorusGeometry(r * 0.86, r * 0.035, 6, 16);
      band2.rotateX(Math.PI / 2);
      band2.translate(0, r * 1.32, 0);
      push(band2, A, 0.55);
      break;
    }
    case "lattice_tower": {
      cyl(H * 0.03, H * 0.22, H * 0.92, 4, 0, H * 0.46, 0, C);
      box(H * 0.26, H * 0.04, H * 0.26, 0, H * 0.34, 0, A, 0, 0, 0.35);
      box(H * 0.16, H * 0.035, H * 0.16, 0, H * 0.64, 0, A, 0, 0, 0.45);
      cyl(H * 0.012, H * 0.02, H * 0.16, 6, 0, H * 0.96, 0, G, 0, 0, 0.65);
      break;
    }
    case "flames": {
      const towers: [number, number, number, number][] = [
        [0, 0, 1.0, 0.08],
        [-H * 0.28, -H * 0.16, 0.86, -0.10],
        [H * 0.28, -H * 0.14, 0.78, 0.12],
      ];
      for (const [tx, tz, sc, tilt] of towers) {
        const th = H * sc;
        cyl(th * 0.015, th * 0.13, th, 6, tx, th * 0.5, tz, C, 0, tilt);
        cyl(th * 0.01, th * 0.10, th * 0.72, 6, tx + tilt * th * 0.2, th * 0.6, tz, G, 0, tilt * 1.1, 0.45);
      }
      break;
    }
    case "castle_tower": {
      cyl(H * 0.28, H * 0.34, H * 0.88, 12, 0, H * 0.44, 0, C);
      box(H * 0.22, H * 0.84, H * 0.42, H * 0.24, H * 0.42, 0, A);
      cyl(H * 0.31, H * 0.31, H * 0.10, 12, 0, H * 0.92, 0, A);
      break;
    }
    case "palace": {
      box(H * 1.85, H * 0.66, H * 0.92, 0, H * 0.33, 0, C);
      box(H * 0.72, H * 0.78, H * 1.02, 0, H * 0.39, 0, C);
      for (const s of [-1, 1]) {
        cyl(H * 0.14, H * 0.20, H * 0.32, 8, s * H * 0.62, H * 0.80, 0, A);
      }
      const dome = new THREE.SphereGeometry(H * 0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(0, H * 0.78, 0);
      push(dome, A);
      break;
    }
    case "bull_monument": {
      // zócalo + escultura estilizada del toro de Spielberg
      box(H * 0.85, H * 0.22, H * 0.55, 0, H * 0.11, 0, 0x8e949c);
      box(H * 0.95, H * 0.34, H * 0.36, -H * 0.05, H * 0.58, 0, A, 0, 0.08, 0.2);
      box(H * 0.36, H * 0.30, H * 0.30, H * 0.44, H * 0.66, 0, A, 0, -0.25, 0.2);
      // cuernos metálicos
      for (const s of [-1, 1]) box(H * 0.24, H * 0.06, H * 0.06, H * 0.58, H * 0.84, s * H * 0.14, C, s * 0.3, 0.45);
      // patas
      for (const [lx, lz] of [[-0.36, -0.11], [-0.36, 0.11], [0.24, -0.11], [0.24, 0.11]]) {
        box(H * 0.10, H * 0.34, H * 0.10, lx * H, H * 0.36, lz * H, C);
      }
      break;
    }
    case "wing_pavilion": {
      box(H * 2.4, H * 0.52, H * 0.95, 0, H * 0.26, 0, C);
      box(H * 2.8, H * 0.14, H * 1.25, 0, H * 0.66, 0, C, 0, 0.07);
      box(H * 2.85, H * 0.07, H * 0.18, 0, H * 0.74, -H * 0.58, A, 0, 0.07, 0.25);
      break;
    }
    case "stadium": {
      const rO = H * 1.85;
      const ring = new THREE.CylinderGeometry(rO, rO * 0.82, H * 0.72, 16, 1, true);
      ring.translate(0, H * 0.36, 0);
      push(ring, C);
      const roof = new THREE.TorusGeometry(rO * 0.88, H * 0.14, 5, 16);
      roof.rotateX(Math.PI / 2);
      roof.translate(0, H * 0.76, 0);
      push(roof, A, 0.2);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
        cyl(H * 0.03, H * 0.06, H * 1.05, 6, Math.cos(ang) * rO * 0.95, H * 0.52, Math.sin(ang) * rO * 0.95, G, 0, 0, 0.35);
      }
      break;
    }
    case "spire": {
      cyl(H * 0.03, H * 0.16, H * 0.96, 8, 0, H * 0.48, 0, C);
      cyl(H * 0.09, H * 0.11, H * 0.14, 8, 0, H * 0.68, 0, A, 0, 0, 0.3);
      cyl(H * 0.015, H * 0.03, H * 0.18, 6, 0, H * 0.96, 0, G, 0, 0, 0.55);
      break;
    }
    case "canopy": {
      box(H * 1.9, H * 0.42, H * 1.05, 0, H * 0.21, 0, C);
      for (const s of [-0.55, 0, 0.55]) {
        const cone = new THREE.ConeGeometry(H * 0.52, H * 0.48, 4);
        cone.rotateY(Math.PI / 4);
        cone.translate(s * H, H * 0.72, 0);
        push(cone, s === 0 ? A : C);
      }
      break;
    }
    case "grand_hall": {
      box(H * 2.6, H * 0.68, H * 1.3, 0, H * 0.34, 0, C);
      box(H * 2.75, H * 0.14, H * 1.42, 0, H * 0.74, 0, A);
      break;
    }
    default: {
      // "tower"
      box(H * 0.34, H * 0.84, H * 0.34, 0, H * 0.42, 0, C);
      box(H * 0.44, H * 0.16, H * 0.44, 0, H * 0.88, 0, A, 0, 0, 0.2);
      cyl(H * 0.015, H * 0.025, H * 0.18, 6, 0, H * 0.98, 0, G, 0, 0, 0.4);
      break;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(out.nrm, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(out.col, 3));
  return geo;
}
