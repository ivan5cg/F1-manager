// Gráficos compartidos por varias pantallas: cascos de los pilotos, siluetas de los circuitos, luz
// del día (noche, tarde, día), guardar o compartir un archivo y si el sistema pide menos movimiento.

/** El sistema pide reducir el movimiento (ajuste de accesibilidad): sin confeti, estelas ni lluvia animada. */
export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ colores
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => parseInt(c + c, 16)) : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return [v[0] || 0, v[1] || 0, v[2] || 0];
}
const hex = (c: number[]) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
/** Mezcla con blanco (k > 0) o con negro (k < 0). */
export function shade(color: string, k: number): string {
  const c = rgb(color);
  return hex(c.map((x) => (k >= 0 ? x + (255 - x) * k : x * (1 + k))));
}
export const luminance = (color: string) => { const [r, g, b] = rgb(color); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

// ------------------------------------------------------------------ cascos
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Colores de las banderas (del más característico al menos), para los cascos.
const FLAG_COLORS: Record<string, string[]> = {
  "🇬🇧": ["#012169", "#c8102e", "#ffffff"], "🇮🇹": ["#009246", "#ce2b37", "#ffffff"], "🇲🇨": ["#ce1126", "#ffffff"], "🇳🇱": ["#ff6a13", "#21468b", "#ffffff"],
  "🇫🇷": ["#0055a4", "#ef4135", "#ffffff"], "🇦🇺": ["#00843d", "#ffcd00", "#012169"], "🇳🇿": ["#111111", "#ffffff", "#c8102e"], "🇦🇷": ["#74acdf", "#ffffff", "#f6b40e"],
  "🇩🇪": ["#111111", "#dd0000", "#ffce00"], "🇧🇷": ["#ffdf00", "#009c3b", "#002776"], "🇪🇸": ["#c60b1e", "#ffc400"], "🇹🇭": ["#2d2a4a", "#a51931", "#ffffff"],
  "🇨🇦": ["#d80621", "#ffffff"], "🇲🇽": ["#006847", "#ce1126", "#ffffff"], "🇫🇮": ["#ffffff", "#002f6c"], "🇩🇰": ["#c8102e", "#ffffff"],
  "🇯🇵": ["#ffffff", "#bc002d"], "🇪🇪": ["#0072ce", "#111111", "#ffffff"], "🇺🇸": ["#3c3b6e", "#b22234", "#ffffff"], "🇨🇳": ["#de2910", "#ffde00"],
  "🇵🇱": ["#ffffff", "#dc143c"], "🇷🇺": ["#0039a6", "#d52b1e", "#ffffff"], "🇨🇭": ["#d52b1e", "#ffffff"], "🇦🇹": ["#c8102e", "#ffffff"],
  "🇻🇪": ["#ffcc00", "#00247d", "#cf142b"], "🇧🇪": ["#111111", "#fdda24", "#ef3340"], "🇮🇳": ["#ff9933", "#138808", "#ffffff"], "🇸🇪": ["#006aa7", "#fecc00"],
  "🇮🇩": ["#ce1126", "#ffffff"], "🇮🇪": ["#169b62", "#ff883e", "#ffffff"], "🇨🇴": ["#fcd116", "#003893", "#ce1126"],
};
// Colores para los que no llevan su bandera (o no se sabe de dónde son).
const HELMET_PALETTE = ["#f2c500", "#e8452c", "#1f6fd1", "#16a37a", "#7a3fd1", "#f07a1a", "#e8e8ea", "#14181f", "#d6246e", "#2ab7d6", "#b8d62a", "#8a1c2b"];

/** Diseño del casco de un piloto: tres colores y un motivo, siempre los mismos para él (sale de su nombre). */
export interface HelmetDesign { base: string; c2: string; c3: string; pat: number }
export function helmetDesign(nombre: string): HelmetDesign {
  const h = hashStr(nombre);
  const flag = FLAG_COLORS[driverFlag(nombre)];
  let cols: string[];
  if (flag && h % 5 < 3) {
    // con los colores de su bandera: uno de ellos de base y los otros de motivo
    const k = (h >>> 3) % flag.length;
    cols = [flag[k], ...flag.slice(k + 1), ...flag.slice(0, k)];
    if (cols.length < 3) cols.push(luminance(cols[0]) > 0.6 ? "#14181f" : "#ffffff");
  } else {
    const P = HELMET_PALETTE, a = (h >>> 3) % P.length;
    let b = (h >>> 9) % P.length;
    if (b === a || Math.abs(luminance(P[a]) - luminance(P[b])) < 0.18) b = (a + 6) % P.length;
    cols = [P[a], P[b], luminance(P[a]) > 0.6 ? "#14181f" : "#ffffff"];
  }
  // el motivo, que se vea sobre la base
  if (Math.abs(luminance(cols[0]) - luminance(cols[1])) < 0.12) [cols[1], cols[2]] = [cols[2], cols[1]];
  return { base: cols[0], c2: cols[1], c3: cols[2], pat: (h >>> 14) % 9 };
}

/**
 * Casco visto de lado (mirando a la derecha) con el número del piloto. Con su nombre, el diseño propio del piloto
 * (`helmetDesign`) y el color del equipo en la franja de abajo; sin él, el color del equipo con un motivo según
 * la abreviatura (como antes).
 */
export function helmetSvg(color: string, numero: number | string, abrev = "", size = 32, nombre?: string): string {
  const own = nombre ? helmetDesign(nombre) : null;
  const h = hashStr(abrev || String(numero));
  const base = own ? own.base : color;
  const light = luminance(base) > 0.62;
  const accent = own ? own.c2 : light ? "#14181f" : "#ffffff";
  const accent2 = own ? own.c3 : light ? shade(color, -0.45) : shade(color, 0.55);
  const dark = shade(base, -0.38);
  const pat = own ? own.pat : h % 6;
  const id = `h${hashStr(base + numero + abrev + (nombre ?? "")).toString(36)}`;
  const stripe = [
    // 0: franja diagonal doble
    `<path d="M5 19.5 L18 6 L23.5 5.6 L9.5 22 Z" fill="${accent}" opacity=".92"/><path d="M8.5 23 L22.5 8.5 L25 8.5 L11 24.4 Z" fill="${accent2}" opacity=".85"/>`,
    // 1: banda superior aerodinámica
    `<path d="M8.8 9.2 C13 4.4 19.5 3.1 26 3.7 L26.5 6.8 C19.8 6.4 14.2 7.6 10.6 11.2 Z" fill="${accent}" opacity=".92"/><path d="M11.4 11.8 C15 8.4 20 7.4 26.8 7.8 L27 9.5 C20.4 9.2 15.6 10.2 12.6 13.2 Z" fill="${accent2}" opacity=".8"/>`,
    // 2: rayo lateral bajo la visera
    `<path d="M7.5 20.4 L31.5 20.4 L34.8 23.2 L10 23.2 Z" fill="${accent}" opacity=".9"/><path d="M8.6 23.5 L34.4 23.5 L33.2 25.4 L10.2 25.4 Z" fill="${accent2}" opacity=".8"/>`,
    // 3: doble línea racing desde el frontal hasta la nuca
    `<path d="M12.5 5.6 L29.5 6.2 L30.8 8.3 L10.8 8 Z" fill="${accent}" opacity=".92"/><path d="M9.6 9.4 L31.6 9.6 L32.2 11.1 L8.5 11 Z" fill="${accent2}" opacity=".85"/>`,
    // 4: bloques geométricos en ángulo
    `<path d="M6.4 14.5 L16 6.5 L20.5 6.5 L13.5 14.5 Z" fill="${accent}" opacity=".88"/><path d="M15 14.5 L22.5 6.5 L26.2 6.8 L19.2 14.5 Z" fill="${accent2}" opacity=".85"/>`,
    // 5: corona y base contrastada
    `<path d="M11 6.8 C16 3.5 24 3.4 29.8 6.5 L28 9.4 C22.5 6.8 16.2 6.8 11.5 9.8 Z" fill="${accent}" opacity=".92"/><path d="M7.2 22.8 L35 22.2 L33.5 26.4 L10 26.4 Z" fill="${dark}" opacity=".75"/>`,
    // 6: estrella en lo alto con su estela
    `<path d="M6.5 12.6 L24 9.6 L24.2 11 L7 14.2 Z" fill="${accent2}" opacity=".85"/><path d="M8.2 6.2 L9.4 9 L12.4 9.1 L10 11 L10.9 13.9 L8.2 12.2 L5.6 13.9 L6.4 11 L4 9.1 L7 9 Z" transform="translate(10 -2.6)" fill="${accent}" stroke="#000" stroke-opacity=".3" stroke-width=".4"/>`,
    // 7: mitad superior de otro color (degradado) con un filo
    `<path d="M5.2 15 C6 8 12.5 2.8 21.8 2.6 C30 2.4 35.6 6.5 37.2 11.2 L19.8 11.4 C17.5 12.4 15 14 13 15 Z" fill="url(#${id}t)"/><path d="M5.3 15 L13 15 C15 14 17.5 12.4 19.8 11.4 L21 11.4 C18.5 12.8 15.6 14.6 13.4 16.2 L5.4 16.4 Z" fill="${accent2}" opacity=".9"/>`,
    // 8: flechas hacia delante en lo alto
    `<path d="M12.6 4.4 L18 7.8 L12.6 11.2 L15 11.2 L20.4 7.8 L15 4.4 Z" fill="${accent}" opacity=".92"/><path d="M18.8 3.6 L24.4 7.6 L19.6 11.2 L22 11.2 L26.8 7.6 L21.2 3.6 Z" fill="${accent2}" opacity=".88"/>`,
  ][pat];
  const rim = light ? "#222832" : "#dce3ef";
  // con diseño propio, el equipo va en la franja de abajo
  const teamBand = own ? `<path d="M7.6 25.6 C9 26.6 10.4 26.9 12 26.6 L17.4 25.7 C21.8 25.4 25.2 26.6 27.4 29 L26.2 29.2 C24.2 27.3 21.2 26.6 17.4 26.9 L11.8 27.9 C9.6 28.2 8.2 27.4 7.6 25.6 Z" fill="${color}" stroke="#000" stroke-opacity=".35" stroke-width=".4"/>` : "";
  return `<svg class="helmet" viewBox="0 0 40 32" width="${size}" height="${Math.round(size * 0.8)}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(base, 0.34)}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e6990"/><stop offset=".42" stop-color="#0b1018"/><stop offset=".75" stop-color="#1b2b44"/><stop offset="1" stop-color="#2c4466"/></linearGradient>
      ${pat === 7 ? `<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, -0.3)}"/></linearGradient>` : ""}
    </defs>
    <path d="M5 20.5 C4.2 10.6 11.4 2.6 21.8 2.4 C31.4 2.2 38 9.2 38.2 18.2 C38.3 22.6 37 26 33.8 28 L27.4 29 C25.2 26.6 21.8 25.4 17.4 25.7 L9.6 27 C6.8 27.4 5.3 24.6 5 20.5 Z" fill="url(#${id})" stroke="#000" stroke-opacity=".6" stroke-width=".85"/>
    ${stripe}
    ${teamBand}
    <path d="M13 4.8 C17.5 3.1 24.5 3.2 29.5 5.4" stroke="#fff" stroke-opacity=".38" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <path d="M20.2 11.4 L35.9 11.4 C37.1 13.3 37.6 15.6 37.6 18.7 L22.5 18.7 C20.6 18.7 19.4 17.2 19.4 15.2 C19.4 13.3 19.7 12.2 20.2 11.4 Z" fill="url(#${id}v)" stroke="#000" stroke-width=".7"/>
    <path d="M20.5 11.5 L35.5 11.5" stroke="${rim}" stroke-opacity=".75" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M22.2 13.2 L33.5 13.2" stroke="#b6cef2" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/>
    <path d="M31 23.2 h4.5 M31.6 24.8 h3.4" stroke="#000" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>
    <path d="M27.4 29 C25.2 26.6 21.8 25.4 17.4 25.7" stroke="#000" stroke-opacity=".55" stroke-width="1.2" fill="none"/>
    <circle cx="11.5" cy="16.5" r="5.1" fill="${light ? "#14181f" : "#fff"}" opacity=".94" stroke="#000" stroke-opacity=".25" stroke-width=".5"/>
    <text x="11.5" y="18.6" text-anchor="middle" font-family="'Titillium Web', sans-serif" font-weight="900" font-size="${String(numero).length > 1 ? 5.6 : 6.4}" fill="${light ? "#fff" : "#14181f"}">${numero}</text>
  </svg>`;
}

// ------------------------------------------------------------------ escudos
/** Formas y motivos del escudo de un equipo propio (inventado: nada de logos reales). */
export const CREST_SHAPES = ["Clásico", "Redondo", "Hexágono", "Punta", "Rombo"];
export const CREST_MOTIFS = ["Banda", "Cuartelado", "Cheurón", "Franja", "Cuadros", "Estrella"];
const CREST_SKIP = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "da", "di", "du", "le", "the", "of"]);
/** Iniciales del escudo: la primera letra de hasta tres palabras (sin «de», «la»…); con una sola palabra, dos letras. */
export function crestInitials(nombre: string): string {
  const w = nombre.trim().split(/[\s\-_.]+/).filter((x) => x && !CREST_SKIP.has(x.toLowerCase()));
  if (!w.length) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return w.slice(0, 3).map((x) => x[0]).join("").toUpperCase();
}
/** La forma y el motivo que tocan a un nombre si el jugador no ha elegido. */
export function crestDefault(nombre: string): { forma: number; motivo: number } {
  const h = hashStr(nombre.trim().toLowerCase() || "?");
  return { forma: h % CREST_SHAPES.length, motivo: (h >>> 5) % CREST_MOTIFS.length };
}
const CREST_PATH = [
  "M4 4 H36 V19 C36 31 29 39.5 20 44 C11 39.5 4 31 4 19 Z",
  "M20 3 A19 19 0 1 1 19.99 3 Z",
  "M20 2.5 L37 12.3 V32.2 L20 42 L3 32.2 V12.3 Z",
  "M3 6 L20 2 L37 6 L35 27 L20 44 L5 27 Z",
  "M20 1.5 L38.5 22 L20 43.5 L1.5 22 Z",
];
/**
 * Escudo vectorial de un equipo propio: forma, motivo con el segundo color, borde e iniciales. Sale igual en todas las
 * pantallas (los ids del SVG llevan un hash para que varios escudos convivan en la misma página).
 */
export function crestSvg(t: { nombre: string; color: string; color2?: string; forma?: number; motivo?: number }, size = 40): string {
  const def = crestDefault(t.nombre);
  const forma = ((t.forma ?? def.forma) % CREST_PATH.length + CREST_PATH.length) % CREST_PATH.length;
  const motivo = ((t.motivo ?? def.motivo) % CREST_MOTIFS.length + CREST_MOTIFS.length) % CREST_MOTIFS.length;
  const base = t.color;
  let c2 = t.color2 ?? (luminance(base) > 0.6 ? "#16181c" : "#f5f5f5");
  if (Math.abs(luminance(c2) - luminance(base)) < 0.12) c2 = luminance(base) > 0.5 ? shade(base, -0.55) : shade(base, 0.6);
  const id = `c${hashStr(JSON.stringify([t.nombre, base, c2, forma, motivo])).toString(36)}`;
  const path = CREST_PATH[forma];
  const motif = [
    `<path d="M-2 30 L30 -2 L42 -2 L42 4 L4 44 L-2 44 Z" fill="${c2}"/>`,
    `<rect x="20" y="0" width="22" height="23" fill="${c2}"/><rect x="-2" y="23" width="22" height="23" fill="${c2}"/>`,
    `<path d="M-2 18 L20 32 L42 18 L42 26 L20 40 L-2 26 Z" fill="${c2}"/>`,
    `<rect x="15" y="-2" width="10" height="48" fill="${c2}"/><rect x="13" y="-2" width="1.2" height="48" fill="${c2}" opacity=".6"/><rect x="25.8" y="-2" width="1.2" height="48" fill="${c2}" opacity=".6"/>`,
    `${Array.from({ length: 24 }, (_, k) => { const x = k % 8, y = Math.floor(k / 8); return (x + y) % 2 ? "" : `<rect x="${x * 5}" y="${y * 4}" width="5" height="4" fill="${c2}"/>`; }).join("")}<rect x="0" y="12" width="40" height="1.4" fill="${c2}"/>`,
    `<path d="M20 4.5 L22.4 10.4 L28.8 10.6 L23.8 14.5 L25.6 20.6 L20 17 L14.4 20.6 L16.2 14.5 L11.2 10.6 L17.6 10.4 Z" fill="${c2}"/>`,
  ][motivo];
  const ini = crestInitials(t.nombre);
  // las iniciales van abajo si el motivo ocupa lo alto (cuadros, estrella); si no, en el centro
  const ty = motivo === 4 || motivo === 5 ? 32 : forma === 0 ? 25.5 : 27;
  const fs = ini.length > 2 ? 10.5 : 13;
  const txt = luminance(base) > 0.6 ? "#14181f" : "#ffffff", halo = txt === "#ffffff" ? "#000" : "#fff";
  return `<svg class="crest" viewBox="0 0 40 46" width="${size}" height="${Math.round(size * 1.15)}" aria-hidden="true">
    <defs>
      <clipPath id="${id}k"><path d="${path}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
    </defs>
    <path d="${path}" fill="${base}"/>
    <g clip-path="url(#${id}k)">${motif}<rect width="40" height="46" fill="url(#${id}g)"/></g>
    <path d="${path}" fill="none" stroke="${shade(c2, luminance(c2) > 0.5 ? -0.25 : 0.15)}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${path}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round"/>
    <text x="20" y="${ty}" text-anchor="middle" font-family="'Titillium Web', sans-serif" font-weight="900" font-size="${fs}" letter-spacing=".3" fill="${txt}" stroke="${halo}" stroke-opacity=".45" stroke-width="1.6" paint-order="stroke">${esc(ini)}</text>
  </svg>`;
}
/** El escudo de un equipo propio con lo que guarda la partida. */
export function teamCrest(t: { nombre: string; color: string; librea?: { color2: string }; escudo?: { forma: number; motivo: number } }, size = 40): string {
  return crestSvg({ nombre: t.nombre, color: t.color, color2: t.librea?.color2, forma: t.escudo?.forma, motivo: t.escudo?.motivo }, size);
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ------------------------------------------------------------------ circuitos
/** Puntos del trazado de un circuito (de su JSON, sin construir la pista), reducidos a unos `n`. */
export function circuitPoints(def: { puntos: number[][]; escala?: number }, n = 140): [number, number][] {
  const pts = def.puntos;
  const step = Math.max(1, Math.floor(pts.length / n));
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i += step) out.push([pts[i][0] * (def.escala ?? 1), pts[i][1] * (def.escala ?? 1)]);
  return out;
}

/** Silueta del circuito en SVG (norte arriba), escalada a la caja. */
export function circuitSvg(def: { puntos: number[][]; escala?: number }, w = 80, h = 56, stroke = "#e8e8ea", width = 2.4): string {
  const pts = circuitPoints(def, 160);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const pad = width + 1;
  const sc = Math.min((w - 2 * pad) / (maxx - minx || 1), (h - 2 * pad) / (maxy - miny || 1));
  const ox = (w - (maxx - minx) * sc) / 2, oy = (h - (maxy - miny) * sc) / 2;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(ox + (x - minx) * sc).toFixed(1)} ${(oy + (maxy - y) * sc).toFixed(1)}`).join("") + "Z";
  const [sx, sy] = [ox + (pts[0][0] - minx) * sc, oy + (maxy - pts[0][1]) * sc];
  return `<svg class="csil" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${width * 1.1}" fill="#e3261c"/></svg>`;
}

// ------------------------------------------------------------------ luz del día
export type Light = "dia" | "tarde" | "noche";
/** Luz a una hora local (min desde las 0:00): noche antes de las 7 y desde las 19:15; tarde desde las 17. */
export function lightAt(clock: number): Light {
  const m = ((clock % 1440) + 1440) % 1440;
  if (m < 7 * 60 || m >= 19.25 * 60) return "noche";
  if (m >= 17 * 60) return "tarde";
  return "dia";
}
/** Fondo del cielo para una hora y lo nublado/lluvioso que está (0..1). */
export function skyGradient(clock: number, gloom = 0): string {
  const l = lightAt(clock);
  const base = l === "noche" ? ["#0a1020", "#16213a"] : l === "tarde" ? ["#3a2a3d", "#c8643a"] : ["#2d5f9a", "#8fb8de"];
  const grey = l === "noche" ? ["#0b0e14", "#1a1f29"] : ["#3a4049", "#7d848e"];
  const mix = (a: string, b: string) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * Math.min(1, gloom))); };
  return `linear-gradient(180deg, ${mix(base[0], grey[0])} 0%, ${mix(base[1], grey[1])} 100%)`;
}

// ------------------------------------------------------------------ archivos
/** Guarda un archivo: con la hoja de compartir del móvil si la hay (para dejarlo en Archivos o mandarlo), si no, como descarga. */
export async function saveFile(file: File) {
  const n = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (n.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ------------------------------------------------------------------ icono del cielo
/** Icono del cielo para la caja de hora local (sol, nubes, lluvia, chaparrón). */
export function skyIcon(cloud: number, rain: number, clock: number): string {
  const day = clock > 7 * 60 && clock < 19.25 * 60; // de noche (Singapur), luna
  const sun = day ? `<circle cx="7" cy="6" r="4" fill="#ffd84a"/>` : `<path d="M9 2a5 5 0 1 0 3 8 4 4 0 1 1-3-8z" fill="#e8e8ef"/>`;
  const cl = (x: number, y: number, s: number, c: string) => `<path transform="translate(${x} ${y}) scale(${s})" d="M4 10h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.5 1A3 3 0 0 0 4 10z" fill="${c}"/>`;
  if (rain > 0.15) {
    const n = rain > 6 ? 4 : rain > 1.5 ? 3 : 2;
    const drops = Array.from({ length: n }, (_, i) => `<path d="M${7 + i * 3.5} 11.5l-1.2 3" stroke="#5aa8ff" stroke-width="1.6" stroke-linecap="round"/>`).join("");
    return `<svg viewBox="0 0 22 15">${cl(1, -1.5, 1, rain > 6 ? "#7d828c" : "#c9ccd2")}${drops}</svg>`;
  }
  if (cloud > 0.6) return `<svg viewBox="0 0 22 15">${cl(0, 1, 0.75, "#8d9199")}${cl(4, 2, 0.85, "#d4d7dc")}</svg>`;
  if (cloud > 0.3) return `<svg viewBox="0 0 22 15">${sun}${cl(5, 3, 0.8, "#e6e8eb")}</svg>`;
  return `<svg viewBox="0 0 22 15">${sun}</svg>`;
}

/**
 * Icono de la previsión según la probabilidad de lluvia (0..1) y la hora: sol (o luna) si apenas
 * hay riesgo, sol con nubes, nublado y, solo a partir del 60 %, nube con lluvia.
 */
export function forecastIcon(prob: number, clock: number): string {
  const svg = prob < 0.15 ? clearIcon(clock) : prob < 0.35 ? skyIcon(0.45, 0, clock) : prob < 0.6 ? skyIcon(0.7, 0, clock) : skyIcon(0.8, prob >= 0.85 ? 2 : 0.5, clock);
  return `<span class="fcico">${svg}</span>`;
}

/** Cielo despejado: sol con rayos, centrado (o luna de noche). */
function clearIcon(clock: number): string {
  if (lightAt(clock) === "noche") return `<svg viewBox="0 0 22 15"><path d="M12.6 2.2a5.6 5.6 0 1 0 4.3 8.9 4.6 4.6 0 1 1-4.3-8.9z" fill="#e8e8ef"/></svg>`;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4, c = Math.cos(a), sn = Math.sin(a);
    return `<path d="M${(11 + c * 4.9).toFixed(1)} ${(7.5 + sn * 4.9).toFixed(1)}L${(11 + c * 6.6).toFixed(1)} ${(7.5 + sn * 6.6).toFixed(1)}" stroke="#ffd84a" stroke-width="1.4" stroke-linecap="round"/>`;
  }).join("");
  return `<svg viewBox="0 0 22 15">${rays}<circle cx="11" cy="7.5" r="3.6" fill="#ffd84a"/></svg>`;
}

// ------------------------------------------------------------------ banderas de los pilotos
// Por nombre, para que valga igual con la parrilla real, los fichajes del mercado y el equipo creado.
const DRIVER_FLAG: Record<string, string> = {
  "George Russell": "🇬🇧", "Kimi Antonelli": "🇮🇹", "Charles Leclerc": "🇲🇨", "Lewis Hamilton": "🇬🇧", "Max Verstappen": "🇳🇱", "Isack Hadjar": "🇫🇷",
  "Lando Norris": "🇬🇧", "Oscar Piastri": "🇦🇺", "Liam Lawson": "🇳🇿", "Arvid Lindblad": "🇬🇧", "Pierre Gasly": "🇫🇷", "Franco Colapinto": "🇦🇷",
  "Esteban Ocon": "🇫🇷", "Oliver Bearman": "🇬🇧", "Nico Hülkenberg": "🇩🇪", "Gabriel Bortoleto": "🇧🇷", "Carlos Sainz": "🇪🇸", "Alexander Albon": "🇹🇭",
  "Fernando Alonso": "🇪🇸", "Lance Stroll": "🇨🇦", "Sergio Pérez": "🇲🇽", "Valtteri Bottas": "🇫🇮",
  "Frederik Vesti": "🇩🇰", "Antonio Giovinazzi": "🇮🇹", "Yuki Tsunoda": "🇯🇵", "Pato O'Ward": "🇲🇽", "Leonardo Fornaroli": "🇮🇹", "Ayumu Iwasa": "🇯🇵",
  "Paul Aron": "🇪🇪", "Ryo Hirakawa": "🇯🇵", "Luke Browning": "🇬🇧", "Jak Crawford": "🇺🇸", "Zhou Guanyu": "🇨🇳", "Mick Schumacher": "🇩🇪",
  "Kevin Magnussen": "🇩🇰", "Jack Doohan": "🇦🇺", "Felipe Drugovich": "🇧🇷", "Théo Pourchaire": "🇫🇷", "Nyck de Vries": "🇳🇱", "Logan Sargeant": "🇺🇸",
  // modo escenario (2010-2024)
  "Sebastian Vettel": "🇩🇪", "Mark Webber": "🇦🇺", "Jenson Button": "🇬🇧", "Felipe Massa": "🇧🇷", "Michael Schumacher": "🇩🇪", "Nico Rosberg": "🇩🇪",
  "Robert Kubica": "🇵🇱", "Vitaly Petrov": "🇷🇺", "Rubens Barrichello": "🇧🇷", "Adrian Sutil": "🇩🇪", "Vitantonio Liuzzi": "🇮🇹", "Kamui Kobayashi": "🇯🇵",
  "Nick Heidfeld": "🇩🇪", "Pedro de la Rosa": "🇪🇸", "Sébastien Buemi": "🇨🇭", "Jaime Alguersuari": "🇪🇸", "Jarno Trulli": "🇮🇹", "Heikki Kovalainen": "🇫🇮",
  "Timo Glock": "🇩🇪", "Lucas di Grassi": "🇧🇷", "Bruno Senna": "🇧🇷", "Christian Klien": "🇦🇹", "Paul di Resta": "🇬🇧", "Pastor Maldonado": "🇻🇪",
  "Jérôme d'Ambrosio": "🇧🇪", "Narain Karthikeyan": "🇮🇳", "Kimi Räikkönen": "🇫🇮", "Romain Grosjean": "🇫🇷", "Daniel Ricciardo": "🇦🇺", "Jean-Éric Vergne": "🇫🇷",
  "Charles Pic": "🇫🇷", "Daniil Kvyat": "🇷🇺", "Esteban Gutiérrez": "🇲🇽", "Jolyon Palmer": "🇬🇧", "Marcus Ericsson": "🇸🇪", "Felipe Nasr": "🇧🇷",
  "Pascal Wehrlein": "🇩🇪", "Rio Haryanto": "🇮🇩", "Nicholas Latifi": "🇨🇦", "Nikita Mazepin": "🇷🇺",
  "Richard Verschoor": "🇳🇱", "Alex Dunne": "🇮🇪", "Gabriele Minì": "🇮🇹", "Dino Beganovic": "🇸🇪", "Victor Martins": "🇫🇷", "Sebastián Montoya": "🇨🇴", "Kush Maini": "🇮🇳",
};
/** Bandera del país del piloto (cadena vacía si no se conoce). */
export const driverFlag = (nombre: string): string => DRIVER_FLAG[nombre] ?? "";
