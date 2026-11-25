// Perfiles visuales 3D por circuito (solo apariencia, sin efecto alguno en la simulación).
// Define bioma, paleta de pianos (2 o 3 colores), tipo y pintura de escapatorias,
// estilo urbano y torres de focos para los 24 circuitos del calendario.

export type BiomeId = "bosque" | "tropical" | "seco" | "mediterraneo" | "dunas" | "desierto";
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
  },
  suzuka: {
    biome: "bosque",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "grava", color: 0xc0b08a },
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
    floodlights: true,
  },
  lusail: {
    biome: "desierto",
    kerbs: [0x7d1636, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x41454d, accent: 0x7d1636, pattern: 1 },
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
  },
  barcelona: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8],
    runoff: { mode: "asfalto", color: 0x484e57, accent: 0xc9961e, pattern: 1 },
  },
  spielberg: {
    biome: "bosque",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "asfalto", color: 0x474d56, accent: 0xc02424, pattern: 1 },
  },
  silverstone: {
    biome: "bosque",
    kerbs: [0x22252b, 0xdeddd8],
    runoff: { mode: "grava", color: 0xbeb08d },
  },
  spa: {
    biome: "bosque",
    kerbs: [0xc81e1e, 0xe0b81c],
    runoff: { mode: "grava", color: 0xbba986 },
  },
  hungaroring: {
    biome: "seco",
    kerbs: [0xc21f24, 0xdeddd8, 0x1c7a3c],
    runoff: { mode: "asfalto", color: 0x4a5058, accent: 0x25743c, pattern: 1 },
  },
  zandvoort: {
    biome: "dunas",
    kerbs: [0x1a5cb8, 0xe2bc1c],
    runoff: { mode: "grava", color: 0xd8c89e },
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
  },
  austin: {
    biome: "seco",
    kerbs: [0xbe1e26, 0xdeddd8, 0x1b4ca0],
    runoff: { mode: "asfalto", color: 0x1d4e96, accent: 0xbe242a, pattern: 2 },
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
