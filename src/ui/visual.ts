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

/**
 * Casco visto de lado (mirando a la derecha) con los colores del equipo y el número del piloto.
 * Diseño propio: el dibujo de la franja sale del nombre, así los dos compañeros no van iguales.
 */
export function helmetSvg(color: string, numero: number | string, abrev = "", size = 32): string {
  const light = luminance(color) > 0.62;
  const accent = light ? "#14181f" : "#ffffff";
  const dark = shade(color, -0.35);
  const pat = hashStr(abrev || String(numero)) % 3;
  const id = `h${hashStr(color + numero + abrev).toString(36)}`;
  const stripe = [
    // franja diagonal desde la nuca
    `<path d="M5 19 L18 6.5 L23 6 L9.5 22 Z" fill="${accent}" opacity=".9"/>`,
    // banda por arriba
    `<path d="M9 9 C13 4.6 19 3.4 25 3.8 L25.6 6.6 C19.4 6.4 14 7.6 10.6 11 Z" fill="${accent}" opacity=".9"/>`,
    // destello lateral bajo la visera
    `<path d="M8 20.6 L31 20.6 L34.6 23.6 L10 23.6 Z" fill="${accent}" opacity=".85"/>`,
  ][pat];
  return `<svg class="helmet" viewBox="0 0 40 32" width="${size}" height="${Math.round(size * 0.8)}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.28)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b4a63"/><stop offset=".45" stop-color="#0d1118"/><stop offset="1" stop-color="#1b2433"/></linearGradient></defs>
    <path d="M5 20.5 C4.2 10.6 11.4 2.6 21.8 2.4 C31.4 2.2 38 9.2 38.2 18.2 C38.3 22.6 37 26 33.8 28 L27.4 29 C25.2 26.6 21.8 25.4 17.4 25.7 L9.6 27 C6.8 27.4 5.3 24.6 5 20.5 Z" fill="url(#${id})" stroke="#000" stroke-opacity=".55" stroke-width=".8"/>
    ${stripe}
    <path d="M20.5 11.6 L35.8 11.6 C37 13.4 37.5 15.6 37.5 18.6 L22.6 18.6 C20.8 18.6 19.6 17.2 19.6 15.2 C19.6 13.4 19.9 12.3 20.5 11.6 Z" fill="url(#${id}v)" stroke="#000" stroke-width=".6"/>
    <path d="M22 12.8 L33 12.8" stroke="#9fb6d8" stroke-opacity=".55" stroke-width=".9" stroke-linecap="round"/>
    <path d="M27.4 29 C25.2 26.6 21.8 25.4 17.4 25.7" stroke="#000" stroke-opacity=".5" stroke-width="1.2" fill="none"/>
    <circle cx="11.5" cy="16.5" r="5" fill="${light ? "#14181f" : "#fff"}" opacity=".92"/>
    <text x="11.5" y="18.6" text-anchor="middle" font-family="'Titillium Web', sans-serif" font-weight="900" font-size="${String(numero).length > 1 ? 5.6 : 6.4}" fill="${light ? "#fff" : "#14181f"}">${numero}</text>
  </svg>`;
}

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
