// Datos de las libreas que no necesitan 3D (el creador de equipo los usa sin cargar three.js).

/** Marcas inventadas: publicidad de pista, puentes, fachadas y patrocinadores de los coches. [nombre, fondo, letras] */
export const BRANDS = [
  ["VELTRA", "#0b3d91", "#ffffff"], ["KORU", "#f2f2f2", "#c8102e"], ["NIMBO", "#101216", "#ffd84a"], ["ARDEN", "#c8102e", "#ffffff"],
  ["OSTRA", "#0f6b4f", "#f2f2f2"], ["LUMEN", "#ffd84a", "#101216"], ["TAIGA", "#f2f2f2", "#0b3d91"], ["ZEFIR", "#3a3f48", "#7fe0ff"],
  ["ORVANE", "#5b2a86", "#f2f2f2"], ["BRISKA", "#ff7a1a", "#101216"], ["KAIVO", "#101216", "#3fe08a"], ["SELNA", "#e9eef4", "#d81b60"],
  ["TRUMEO", "#1e88e5", "#ffffff"], ["AZULIA", "#0a2342", "#4fc3f7"], ["FENNEX", "#f5f0e1", "#3b2f2f"], ["QORA", "#d32f2f", "#ffd84a"],
];
export const FONT = "'Titillium Web', 'Arial Narrow', sans-serif";
/** Dibujos de librea. */
export const LIV_STYLES = ["degradado", "bandas", "rayo", "aguja", "ondas", "partido", "bloques", "chevron", "rayas", "puntos", "llama"];
export const LIV_NAMES: Record<string, string> = { degradado: "Degradado", bandas: "Bandas", rayo: "Rayo", aguja: "Flecha", ondas: "Ondas", partido: "Partido", bloques: "Bloques", chevron: "Galones", rayas: "Rayas", puntos: "Puntos", llama: "Llamas" };
