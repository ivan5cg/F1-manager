// Perfiles visuales 3D por circuito (solo apariencia, sin efecto alguno en la simulación).
// Define bioma, paleta de pianos (2 o 3 colores), tipo y pintura de escapatorias,
// tono de asfalto, marcas F1, pórticos, estilo urbano y estructuras icónicas para los 24 circuitos del calendario.

export type BiomeId = "alpino" | "bosque" | "tropical" | "seco" | "mediterraneo" | "dunas" | "desierto";
export type RunoffMode = "grava" | "asfalto";
export type UrbanStyle = "mediterraneo" | "bahia" | "neones" | "piedra";

export interface TrackRunoff {
  /** "grava" usa grava rastrillada clásica; "asfalto" usa escapatoria de asfalto pintado. */
  mode: RunoffMode;
  /** Color principal de la escapatoria (o de la grava si se quiere ajustar al circuito). */
  color: number;
  /** Color de acento para franjas o bandas de alta adherencia en asfalto pintado. */
  accent?: number;
  /** Dibujo del asfalto pintado: 0 = uniforme con borde, 1 = bandas paralelas, 2 = franjas diagonales. */
  pattern?: 0 | 1 | 2;
}

export interface TrackTunnel {
  /** Inicio y fin del túnel en metros a lo largo de la vuelta (s). */
  s0: number;
  s1: number;
  /** Altura libre interior en metros (por defecto 6,4). */
  height?: number;
  /** Lado con pilares abiertos al exterior/mar (-1 izquierda, +1 derecha, 0 ambos cerrados). */
  openSide?: -1 | 0 | 1;
}

export interface TrackOverpass {
  /** Distancia s del paso superior (puente) y del paso inferior en el cruce en «8». */
  sOver: number;
  sUnder: number;
  /** Semilongitud del tablero del puente en metros (por defecto 52). */
  halfSpan?: number;
  /** Elevación visual del paso superior y rebaje del inferior (m) para garantizar gálibo real. */
  liftOver?: number;
  dipUnder?: number;
}

export interface TrackBank {
  /** Inicio y fin de la curva peraltada en metros (s). */
  s0: number;
  s1: number;
  /** Ángulo de peralte en radianes (+ sube el lado derecho en curva a izquierdas; - sube el izquierdo en curva a derechas). */
  angle: number;
  /** Longitud de transición suave a entrada y salida en metros. */
  ramp?: number;
}

export interface TrackBridge {
  /** Posición s en metros del pórtico o pasarela icónica sobre la pista. */
  s: number;
  /** Índice de marca (0..15) en el atlas de publicidad del circuito. */
  brand?: number;
}

export interface TrackOverArch {
  /** Inicio y fin de la bóveda/arco arquitectónico que cruza sobre la pista (p. ej. Hotel W en Yas Marina). */
  s0: number;
  s1: number;
  /** Altura libre interior de la bóveda en metros (por defecto 12,5). */
  height?: number;
  /** Color principal de la estructura y color de las tiras luminosas nocturnas. */
  color?: number;
  glow?: number;
}

export interface TrackCastleWall {
  /** Tramo [s0, s1] en metros bordeado por muralla histórica almenada (p. ej. casco viejo de Bakú). */
  s0: number;
  s1: number;
  /** Lado principal de la muralla (-1 izquierda, +1 derecha, 0 ambos lados). */
  side?: -1 | 0 | 1;
}

export interface TrackVisualProfile {
  biome: BiomeId;
  /** Colores de los bloques del piano (2 o 3 tonos en hex sRGB). */
  kerbs: readonly [number, number] | readonly [number, number, number];
  runoff: TrackRunoff;
  /** Tono base del asfalto (hex sRGB): más oscuro en circuitos clásicos, más gris azulado en urbanos/modernos. */
  asphaltColor?: number;
  /** Selección/énfasis de marcas reales de F1 (16 índices 0..15 de F1_TRACK_ADS) para las vallas y arcos de este GP. */
  adBrands?: readonly number[];
  /** Pareja de colores opcional para barreras de neumáticos/Tecpro (por defecto rojo y blanco). */
  barrier?: readonly [number, number];
  /** Estilo arquitectónico en circuitos urbanos. */
  urban?: UrbanStyle;
  /** Torres de focos alrededor del trazado (carreras nocturnas o al atardecer). */
  floodlights?: boolean;
  /** Yates amarrados en puerto deportivo junto al trazado (Mónaco, Singapur, Yas Marina). */
  yachts?: boolean;
  /** Túnel cubierto sobre el trazado (p. ej. Mónaco). */
  tunnel?: TrackTunnel;
  /** Puente de cruce en «8» sobre la propia pista (p. ej. Suzuka). */
  overpass?: TrackOverpass;
  /** Bóveda/arco icónico sobre el trazado (p. ej. Hotel W en Yas Marina). */
  overArch?: TrackOverArch;
  /** Muralla histórica almenada pegada a la calzada (p. ej. curva del castillo en Bakú). */
  castleWall?: TrackCastleWall;
  /** Pórticos/pasarelas icónicas en puntos concretos del trazado (además de los automáticos en rectas). */
  bridges?: readonly TrackBridge[];
  /** Tramos [s0, s1] donde forzar barreras Tecpro bicolores en circuitos urbanos (p. ej. Piscina, Tabac y Rascasse en Mónaco). */
  tecproZones?: readonly (readonly [number, number])[];
  /** Tramos [s0, s1] con corredor denso de arbolado junto a la valla (p. ej. Kemmel, Les Combes y Blanchimont en Spa). */
  forestCorridors?: readonly (readonly [number, number])[];
  /** Curvas con peralte transversal visible (p. ej. Zandvoort y Madrid). */
  bankings?: readonly TrackBank[];
  /** Tramos [s0, s1] en metros con trampa de grava real en circuitos cuya escapatoria base es asfalto pintado. */
  gravelZones?: readonly (readonly [number, number])[];
  /** Tramos [s0, s1] con tira estrecha de grava FIA (~2,5 m) pegada al piano exterior delante del asfalto pintado (p. ej. T9-T10 en Spielberg 2024-2026). */
  gravelStrips?: readonly (readonly [number, number])[];
}

export const DEFAULT_TRACK_VISUAL: TrackVisualProfile = {
  biome: "bosque",
  kerbs: [0xc21f24, 0xdeddd8],
  runoff: { mode: "grava", color: 0xc2b28b },
};

// Índices de F1_TRACK_ADS en map3d.ts:
// 0 ARAMCO · 1 PIRELLI · 2 ROLEX · 3 DHL · 4 HEINEKEN 0.0 · 5 QATAR AIRWAYS · 6 AWS · 7 TAG HEUER
// 8 LENOVO · 9 MSC CRUISES · 10 CRYPTO.COM · 11 SALESFORCE · 12 LVMH · 13 SANTANDER · 14 P ZERO · 15 FORMULA 1

export const TRACK_VISUALS: Record<string, TrackVisualProfile> = {
  // ---- Oceanía y Asia ----
  melbourne: {
    biome: "tropical",
    kerbs: [0x197b3c, 0xdeddd8],
    runoff: { mode: "grava", color: 0xc4b18a },
    asphaltColor: 0x575e68, // asfalto semiurbano parque Albert Park
    adBrands: [2, 4, 0, 1, 6, 12, 3, 14, 2, 11, 8, 15, 0, 4, 7, 1],
    bridges: [{ s: 1220, brand: 2 }, { s: 3320, brand: 4 }],
    forestCorridors: [[720, 1620], [2480, 3680]],
  },
  shanghai: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x414751, accent: 0xb02626, pattern: 1 },
    asphaltColor: 0x4a4f58, // asfalto oscuro moderno de Shanghái
    adBrands: [8, 0, 1, 3, 6, 15, 4, 14, 8, 11, 5, 2, 0, 1, 8, 9],
    bridges: [{ s: 3920, brand: 8 }, { s: 4480, brand: 0 }],
    // Trampas de grava reales en Shanghái: horquilla T6, enlazadas T7-T8, T11-T13 y horquilla T14
    gravelZones: [[1860, 2195], [2240, 2800], [3160, 3670], [4685, 4975]],
  },
  suzuka: {
    biome: "bosque",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "grava", color: 0xc0b08a },
    asphaltColor: 0x4a4e56, // asfalto clásico abrasivo de Suzuka
    adBrands: [8, 1, 0, 3, 6, 14, 2, 15, 8, 4, 7, 11, 1, 0, 3, 8],
    overpass: { sOver: 4924, sUnder: 2548, halfSpan: 52, liftOver: 4.4, dipUnder: 2.6 },
    bridges: [{ s: 1460, brand: 8 }, { s: 4380, brand: 1 }],
    forestCorridors: [[740, 2320], [3260, 4420]],
  },
  sepang: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbda97c },
    asphaltColor: 0x4c5056, // asfalto tropical cálido y desgastado
    adBrands: [0, 1, 5, 3, 6, 14, 8, 15, 0, 2, 4, 11, 1, 5, 3, 9],
    bridges: [{ s: 4720, brand: 0 }, { s: 1580, brand: 1 }],
    forestCorridors: [[1240, 2460], [3120, 4120]],
  },
  singapur: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x464b54, pattern: 0 },
    asphaltColor: 0x565e69, // asfalto urbano nocturno brillante bajo focos
    adBrands: [5, 10, 0, 4, 1, 12, 7, 15, 6, 11, 3, 14, 5, 2, 10, 8],
    bridges: [{ s: 1380, brand: 5 }, { s: 3260, brand: 10 }],
    tecproZones: [[420, 620], [1860, 2140], [3480, 3820]],
    urban: "bahia",
    floodlights: true,
    yachts: true,
  },

  // ---- Oriente Medio ----
  bahrein: {
    biome: "desierto",
    kerbs: [0xc21e26, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x3b4048, accent: 0x2372a4, pattern: 1 },
    asphaltColor: 0x484d55, // asfalto muy abrasivo del desierto de Sakhir
    adBrands: [0, 5, 1, 3, 6, 15, 10, 14, 0, 5, 2, 11, 1, 7, 3, 9],
    bridges: [{ s: 1040, brand: 0 }, { s: 3560, brand: 5 }],
    // Trampas de grava exteriores reales en Sakhir: T4, horquilla T8 y T11
    gravelZones: [[1400, 1670], [2510, 2880], [3730, 4050]],
    floodlights: true,
  },
  lusail: {
    biome: "desierto",
    kerbs: [0x7d1636, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x41454d, accent: 0x7d1636, pattern: 1 },
    asphaltColor: 0x464b54, // asfalto oscuro reasfaltado bajo focos en Catar
    adBrands: [5, 0, 1, 3, 12, 15, 6, 14, 5, 5, 2, 7, 0, 1, 10, 5],
    bridges: [{ s: 680, brand: 5 }, { s: 4320, brand: 0 }],
    // Trampas de grava y tiras FIA 2024-2026 en Lusail (T1, T4, T6, T10, T12-T14, T16)
    gravelZones: [[335, 655], [1315, 1750], [1825, 2085], [2810, 3270], [3410, 4045], [4550, 4900]],
    gravelStrips: [[2165, 2490], [4140, 4400]],
    barrier: [0x7d1636, 0xdeddd8],
    floodlights: true,
  },
  yasmarina: {
    biome: "desierto",
    kerbs: [0x1284cf, 0xe0e2e6],
    runoff: { mode: "asfalto", color: 0x0e84d1, accent: 0x0b4c8a, pattern: 1 },
    asphaltColor: 0x4b515c, // asfalto moderno azulado de Yas Marina
    adBrands: [0, 9, 1, 5, 10, 12, 6, 15, 0, 4, 2, 14, 9, 7, 3, 11],
    // Arco luminoso del Hotel W Abu Dhabi cruzando sobre el trazado en la zona del puerto
    overArch: { s0: 3920, s1: 4070, height: 12.2, color: 0x2084cc, glow: 0x6c5cff },
    bridges: [{ s: 1920, brand: 0 }, { s: 3120, brand: 9 }],
    barrier: [0x1284cf, 0xe0e2e6],
    floodlights: true,
    yachts: true,
  },

  // ---- Europa y Cáucaso ----
  monaco: {
    biome: "mediterraneo",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x4c5159, pattern: 0 },
    asphaltColor: 0x626a76, // asfalto urbano gris-azulado más claro y pulido
    // Identidad Mónaco GP: TAG Heuer, Rolex, LVMH, Aramco, Pirelli/P Zero, Heineken 0.0 y MSC Cruises
    adBrands: [7, 2, 12, 0, 1, 7, 2, 14, 4, 9, 15, 7, 2, 12, 0, 1],
    barrier: [0xc81e24, 0xebedf0],
    urban: "mediterraneo",
    yachts: true,
    tunnel: { s0: 1560, s1: 1900, height: 6.4, openSide: -1 },
    // Barreras Tecpro bicolores en curvas icónicas: Ste Devote, Nouvelle Chicane, Tabac, Piscina y Rascasse
    tecproZones: [[150, 265], [1905, 2065], [2220, 2360], [2445, 2765], [2835, 3050]],
  },
  barcelona: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x484e57, accent: 0xc9961e, pattern: 1 },
    asphaltColor: 0x52565e, // asfalto mediterráneo soleado y gris medio
    adBrands: [0, 13, 1, 4, 3, 9, 6, 15, 0, 13, 2, 14, 1, 8, 11, 4],
    bridges: [{ s: 3020, brand: 0 }, { s: 410, brand: 13 }],
    // Trampas de grava reales del trazado 2023-2026 (sin chicane final): T1-T2, T3-T4 Repsol, T5, T7-T9 Campsa y T12-T14
    gravelZones: [[595, 720], [1100, 1830], [1900, 2470], [2600, 2950], [3680, 4400]],
  },
  spielberg: {
    biome: "alpino",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "asfalto", color: 0x474d56, accent: 0xc02424, pattern: 1 },
    asphaltColor: 0x4c5159, // asfalto alpino nítido de Estiria
    adBrands: [9, 1, 0, 3, 6, 4, 2, 15, 9, 14, 8, 11, 0, 1, 3, 7],
    bridges: [{ s: 940, brand: 9 }, { s: 1860, brand: 1 }],
    forestCorridors: [[1560, 2140], [2420, 3240]],
    // Trampas de grava reales FIA 2024-2026: salida de T3 (frenada asfaltada), T4 completa y T6+T7 continuas
    gravelZones: [[1415, 1545], [2120, 2340], [2580, 3175]],
    // Tiras estrechas de grava de 2,5 m tras el piano exterior en T9 y T10 manteniendo el gran asfalto pintado detrás
    gravelStrips: [[3740, 4070]],
  },
  silverstone: {
    biome: "bosque",
    kerbs: [0x22252b, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbeb08d },
    asphaltColor: 0x4e535b, // asfalto británico clásico gris oscuro
    adBrands: [5, 0, 1, 2, 6, 3, 4, 15, 5, 14, 11, 7, 0, 1, 8, 12],
    bridges: [{ s: 1580, brand: 5 }, { s: 4160, brand: 0 }],
    forestCorridors: [[2950, 3850], [4500, 5150]],
  },
  spa: {
    biome: "alpino",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "grava", color: 0xbba986 },
    asphaltColor: 0x4b5058, // asfalto clásico oscuro y gastado de las Ardenas
    // Identidad GP de Bélgica: Aramco, Pirelli, DHL, Heineken 0.0, AWS, Lenovo, P Zero, Qatar Airways
    adBrands: [0, 1, 3, 4, 6, 8, 14, 15, 0, 1, 2, 5, 3, 4, 6, 11],
    barrier: [0xc81e1e, 0xe8e8e6],
    // Pórticos icónicos: entrada de Eau Rouge, recta de Kemmel y aproximación a Blanchimont
    bridges: [{ s: 820, brand: 0 }, { s: 1620, brand: 1 }, { s: 6080, brand: 3 }],
    // Corredores cerrados de coníferas pegados a la valla en Kemmel, Les Combes y Blanchimont
    forestCorridors: [[1260, 2240], [2340, 3060], [4980, 6280]],
  },
  hungaroring: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8, 0x1c7a3c],
    runoff: { mode: "asfalto", color: 0x4a5058, accent: 0x25743c, pattern: 1 },
    asphaltColor: 0x545860, // asfalto polvoriento de colina centroeuropea
    adBrands: [8, 1, 0, 4, 3, 6, 14, 15, 8, 2, 9, 11, 0, 1, 4, 13],
    bridges: [{ s: 1220, brand: 8 }, { s: 2820, brand: 1 }],
    // Trampas de grava reales en Hungaroring: T4 Mansell, T5, T11 y T12
    gravelZones: [[1930, 2345], [3420, 3585], [3655, 3915]],
  },
  zandvoort: {
    biome: "dunas",
    kerbs: [0x1a5cb8, 0xe2bc1c],
    runoff: { mode: "grava", color: 0xd8c89e },
    asphaltColor: 0x525760, // asfalto costero con arena fina de las dunas
    adBrands: [4, 1, 0, 3, 6, 14, 15, 2, 4, 4, 8, 9, 0, 1, 11, 4],
    bridges: [{ s: 1460, brand: 4 }, { s: 3220, brand: 1 }],
    bankings: [
      { s0: 805, s1: 995, angle: 0.34, ramp: 35 },   // Hugenholtzbocht (Curva 3, ~19°)
      { s0: 3540, s1: 3970, angle: -0.32, ramp: 55 }, // Arie Luyendykbocht (Curva 14, ~18°)
    ],
  },
  monza: {
    biome: "bosque",
    kerbs: [0x197d3a, 0xdeddd8, 0xc21f24],
    runoff: { mode: "grava", color: 0xc2b28b },
    asphaltColor: 0x494e56, // asfalto clásico oscuro del Parco di Monza
    adBrands: [1, 14, 4, 0, 9, 8, 13, 15, 1, 3, 2, 6, 14, 4, 1, 7],
    // Puentes/pórticos clásicos en Curva Grande, recta de Serraglio y aproximación a Parabolica
    bridges: [{ s: 1740, brand: 1 }, { s: 3420, brand: 14 }, { s: 4720, brand: 4 }],
    // Arboleda densa del Parco di Monza flanqueando las largas rectas
    forestCorridors: [[1120, 2360], [2680, 4860]],
  },
  madrid: {
    biome: "seco",
    kerbs: [0xc21e26, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x444952, accent: 0xb62a24, pattern: 2 },
    asphaltColor: 0x565c66, // asfalto semiurbano nuevo de IFEMA/Valdebebas
    adBrands: [13, 0, 1, 4, 12, 6, 15, 14, 13, 3, 7, 11, 0, 13, 8, 9],
    bridges: [{ s: 1220, brand: 13 }, { s: 3820, brand: 0 }],
    gravelZones: [[2260, 2845]], // Grava exterior en el peralte de La Monumental (T12)
    bankings: [
      { s0: 2285, s1: 2750, angle: -0.38, ramp: 65 }, // La Monumental (Curva 12, ~22°)
    ],
  },
  baku: {
    biome: "seco",
    kerbs: [0x207bc4, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x4e5259, pattern: 0 },
    asphaltColor: 0x5f6672, // asfalto urbano claro del bulevar y casco viejo de Bakú
    adBrands: [5, 0, 1, 3, 4, 6, 15, 14, 5, 9, 10, 2, 0, 1, 8, 11],
    // Muralla medieval almenada del castillo en la estrecha subida del casco histórico (T8–T10)
    castleWall: { s0: 2560, s1: 3120, side: 1 },
    bridges: [{ s: 1180, brand: 5 }, { s: 5280, brand: 0 }],
    tecproZones: [[1420, 1680], [2540, 3140], [3980, 4280]],
    urban: "piedra",
  },

  // ---- América ----
  miami: {
    biome: "tropical",
    kerbs: [0x1a7cc8, 0xe0e2e6],
    runoff: { mode: "asfalto", color: 0x26a2c4, accent: 0x155f88, pattern: 2 },
    asphaltColor: 0x545b66, // asfalto moderno de campus Hard Rock Stadium
    adBrands: [10, 11, 6, 0, 1, 4, 15, 14, 10, 12, 7, 3, 10, 11, 9, 8],
    bridges: [{ s: 2920, brand: 10 }, { s: 4520, brand: 11 }],
    tecproZones: [[2200, 2660], [3620, 3980]],
    barrier: [0x1a7cc8, 0xe0e2e6],
  },
  montreal: {
    biome: "bosque",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x464c54, accent: 0x2c6b3a, pattern: 0 },
    asphaltColor: 0x535962, // asfalto semiurbano de la Île Notre-Dame
    adBrands: [1, 0, 6, 4, 11, 3, 15, 14, 1, 2, 7, 10, 0, 8, 9, 1],
    bridges: [{ s: 1960, brand: 1 }, { s: 3320, brand: 6 }],
    forestCorridors: [[720, 1860], [2180, 2980]],
    // Trampas de grava reales en Montreal: S de Senna (T1-T2) y Horquilla (T10)
    gravelZones: [[265, 690], [2600, 2816]],
  },
  austin: {
    biome: "seco",
    kerbs: [0xbe1e26, 0xdeddd8, 0x1b4ca0],
    runoff: { mode: "asfalto", color: 0x1d4e96, accent: 0xbe242a, pattern: 2 },
    asphaltColor: 0x4f555f, // asfalto tejano oscuro con contraste de escapatorias tricolor
    adBrands: [1, 6, 11, 10, 0, 3, 15, 14, 6, 11, 4, 8, 1, 0, 10, 7],
    bridges: [{ s: 2860, brand: 6 }, { s: 4620, brand: 1 }],
    // Grava en T12 y T19 + tiras de grava FIA 2024-2026 en T6 y T11
    gravelZones: [[3675, 3835], [4970, 5200]],
    gravelStrips: [[1405, 1635], [2445, 2720]],
    barrier: [0x1b4ca0, 0xe0e2e6],
  },
  mexico: {
    biome: "seco",
    kerbs: [0x197d3a, 0xdeddd8, 0xc21f24],
    runoff: { mode: "asfalto", color: 0x1f763d, accent: 0x15522a, pattern: 1 },
    asphaltColor: 0x555961, // asfalto pulido de altitud del Autódromo Hermanos Rodríguez
    adBrands: [4, 13, 1, 0, 3, 6, 15, 14, 4, 9, 11, 8, 13, 1, 2, 4],
    bridges: [{ s: 580, brand: 4 }, { s: 1620, brand: 13 }],
    forestCorridors: [[1820, 2780]],
  },
  interlagos: {
    biome: "tropical",
    kerbs: [0x198038, 0xe0ba1c, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbba87e },
    asphaltColor: 0x4b4f57, // asfalto clásico abrasivo de São Paulo
    adBrands: [8, 4, 1, 0, 3, 13, 15, 14, 8, 6, 9, 2, 1, 4, 11, 0],
    bridges: [{ s: 1020, brand: 8 }, { s: 3860, brand: 4 }],
    forestCorridors: [[620, 1460], [2420, 3160]],
  },
  lasvegas: {
    biome: "desierto",
    kerbs: [0xc21f26, 0xe0dfd9],
    runoff: { mode: "asfalto", color: 0x3c4048, pattern: 0 },
    asphaltColor: 0x454a54, // asfalto nocturno recién asfaltado del Strip de Las Vegas
    adBrands: [4, 10, 12, 11, 1, 0, 15, 7, 4, 10, 6, 14, 12, 3, 9, 4],
    bridges: [{ s: 4480, brand: 4 }, { s: 5120, brand: 10 }],
    tecproZones: [[620, 960], [2180, 2640], [5460, 5840]],
    urban: "neones",
    floodlights: true,
  },
};

/** Circuitos con rejilla de entorno 3D bajo demanda en public/assets/env-tracks/<id>.json. */
export const ENV_TRACK_IDS = new Set<string>(Object.keys(TRACK_VISUALS));

/** Devuelve el perfil visual del circuito (o el estándar si el id no está registrado). */
export function getTrackVisual(id: string): TrackVisualProfile {
  return TRACK_VISUALS[id] ?? DEFAULT_TRACK_VISUAL;
}
