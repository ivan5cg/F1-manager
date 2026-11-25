// Perfiles visuales 3D por circuito (solo apariencia, sin efecto alguno en la simulación).
// Define bioma, paleta de pianos (2 o 3 colores), tipo y pintura de escapatorias,
// estilo urbano y torres de focos para los 24 circuitos del calendario.

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

export interface TrackVisualProfile {
  biome: BiomeId;
  /** Colores de los bloques del piano (2 o 3 tonos en hex sRGB). */
  kerbs: readonly [number, number] | readonly [number, number, number];
  runoff: TrackRunoff;
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

export const TRACK_VISUALS: Record<string, TrackVisualProfile> = {
  // ---- Oceanía y Asia ----
  melbourne: {
    biome: "tropical",
    kerbs: [0x197b3c, 0xdeddd8],
    runoff: { mode: "grava", color: 0xc4b18a },
  },
  shanghai: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x414751, accent: 0xb02626, pattern: 1 },
    // Trampas de grava reales en Shanghái: horquilla T6, enlazadas T7-T8, T11-T13 y horquilla T14
    gravelZones: [[1860, 2195], [2240, 2800], [3160, 3670], [4685, 4975]],
  },
  suzuka: {
    biome: "bosque",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "grava", color: 0xc0b08a },
    overpass: { sOver: 4924, sUnder: 2548, halfSpan: 52, liftOver: 4.4, dipUnder: 2.6 },
  },
  sepang: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbda97c },
  },
  singapur: {
    biome: "tropical",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x464b54, pattern: 0 },
    urban: "bahia",
    floodlights: true,
    yachts: true,
  },

  // ---- Oriente Medio ----
  bahrein: {
    biome: "desierto",
    kerbs: [0xc21e26, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x3b4048, accent: 0x2372a4, pattern: 1 },
    // Trampas de grava exteriores reales en Sakhir: T4, horquilla T8 y T11
    gravelZones: [[1400, 1670], [2510, 2880], [3730, 4050]],
    floodlights: true,
  },
  lusail: {
    biome: "desierto",
    kerbs: [0x7d1636, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x41454d, accent: 0x7d1636, pattern: 1 },
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
    barrier: [0x1284cf, 0xe0e2e6],
    floodlights: true,
    yachts: true,
  },

  // ---- Europa y Cáucaso ----
  monaco: {
    biome: "mediterraneo",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x4c5159, pattern: 0 },
    urban: "mediterraneo",
    yachts: true,
    tunnel: { s0: 1560, s1: 1900, height: 6.4, openSide: -1 },
  },
  barcelona: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x484e57, accent: 0xc9961e, pattern: 1 },
    // Trampas de grava reales del trazado 2023-2026 (sin chicane final): T1-T2, T3-T4 Repsol, T5, T7-T9 Campsa y T12-T14
    gravelZones: [[595, 720], [1100, 1830], [1900, 2470], [2600, 2950], [3680, 4400]],
  },
  spielberg: {
    biome: "alpino",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "asfalto", color: 0x474d56, accent: 0xc02424, pattern: 1 },
    // Trampas de grava reales FIA 2024-2026: salida de T3 (frenada asfaltada), T4 completa y T6+T7 continuas
    gravelZones: [[1415, 1545], [2120, 2340], [2580, 3175]],
    // Tiras estrechas de grava de 2,5 m tras el piano exterior en T9 y T10 manteniendo el gran asfalto pintado detrás
    gravelStrips: [[3740, 4070]],
  },
  silverstone: {
    biome: "bosque",
    kerbs: [0x22252b, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbeb08d },
  },
  spa: {
    biome: "alpino",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "grava", color: 0xbba986 },
  },
  hungaroring: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8, 0x1c7a3c],
    runoff: { mode: "asfalto", color: 0x4a5058, accent: 0x25743c, pattern: 1 },
    // Trampas de grava reales en Hungaroring: T4 Mansell, T5, T11 y T12
    gravelZones: [[1930, 2345], [3420, 3585], [3655, 3915]],
  },
  zandvoort: {
    biome: "dunas",
    kerbs: [0x1a5cb8, 0xe2bc1c],
    runoff: { mode: "grava", color: 0xd8c89e },
    bankings: [
      { s0: 805, s1: 995, angle: 0.34, ramp: 35 },   // Hugenholtzbocht (Curva 3, ~19°)
      { s0: 3540, s1: 3970, angle: -0.32, ramp: 55 }, // Arie Luyendykbocht (Curva 14, ~18°)
    ],
  },
  monza: {
    biome: "bosque",
    kerbs: [0x197d3a, 0xdeddd8, 0xc21f24],
    runoff: { mode: "grava", color: 0xc2b28b },
  },
  madrid: {
    biome: "seco",
    kerbs: [0xc21e26, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x444952, accent: 0xb62a24, pattern: 2 },
    gravelZones: [[2260, 2845]], // Grava exterior en el peralte de La Monumental (T12)
    bankings: [
      { s0: 2285, s1: 2750, angle: -0.38, ramp: 65 }, // La Monumental (Curva 12, ~22°)
    ],
  },
  baku: {
    biome: "seco",
    kerbs: [0x207bc4, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x4e5259, pattern: 0 },
    urban: "piedra",
  },

  // ---- América ----
  miami: {
    biome: "tropical",
    kerbs: [0x1a7cc8, 0xe0e2e6],
    runoff: { mode: "asfalto", color: 0x26a2c4, accent: 0x155f88, pattern: 2 },
    barrier: [0x1a7cc8, 0xe0e2e6],
  },
  montreal: {
    biome: "bosque",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x464c54, accent: 0x2c6b3a, pattern: 0 },
    // Trampas de grava reales en Montreal: S de Senna (T1-T2) y Horquilla (T10)
    gravelZones: [[265, 690], [2600, 2816]],
  },
  austin: {
    biome: "seco",
    kerbs: [0xbe1e26, 0xdeddd8, 0x1b4ca0],
    runoff: { mode: "asfalto", color: 0x1d4e96, accent: 0xbe242a, pattern: 2 },
    // Grava en T12 y T19 + tiras de grava FIA 2024-2026 en T6 y T11
    gravelZones: [[3675, 3835], [4970, 5200]],
    gravelStrips: [[1405, 1635], [2445, 2720]],
    barrier: [0x1b4ca0, 0xe0e2e6],
  },
  mexico: {
    biome: "seco",
    kerbs: [0x197d3a, 0xdeddd8, 0xc21f24],
    runoff: { mode: "asfalto", color: 0x1f763d, accent: 0x15522a, pattern: 1 },
  },
  interlagos: {
    biome: "tropical",
    kerbs: [0x198038, 0xe0ba1c, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbba87e },
  },
  lasvegas: {
    biome: "desierto",
    kerbs: [0xc21f26, 0xe0dfd9],
    runoff: { mode: "asfalto", color: 0x3c4048, pattern: 0 },
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
