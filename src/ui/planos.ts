// Planos técnicos del coche (12.2), en SVG, como en una oficina técnica: fondo azul, cuadrícula y trazo claro.
// - En «Desarrollo del coche», vista de arriba y de lado: en dorado, lo que ya va montado; en trazo discontinuo, lo
//   que está en fábrica y cuándo llega. Aerodinámica: alerones y fondo; motor: tapa del motor y escape; fiabilidad:
//   pontones (radiadores) y caja de cambios.
// - En «Reglajes», de lado: la altura sube o baja el coche sobre el suelo y la carga cambia el ángulo de los alerones.
import type { DevArea, DevState } from "../sim/development";
import { DEV_AREAS } from "../sim/development";
import { esc } from "./common";

const INK = "#cfe3ff", BG = "#0e2a4a", GOLD = "#ffd84a", COLD = "#7fd0ff";
type St = "" | "on" | "wait";

const grid = (w: number, h: number, id: string) => `<defs><pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(207,227,255,.08)" stroke-width=".6"/></pattern></defs><rect width="${w}" height="${h}" fill="${BG}"/><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
/** Una pieza: con lo que tenga su área (montada, en fábrica o nada). */
const part = (st: St, shape: string) => {
  const fill = st === "on" ? "rgba(255,216,74,.32)" : st === "wait" ? "rgba(127,208,255,.12)" : "none";
  const stroke = st === "on" ? GOLD : st === "wait" ? COLD : INK;
  return shape.replace(/\/>$/, ` fill="${fill}" stroke="${stroke}" stroke-width="${st ? 1.6 : 1}"${st === "wait" ? ' stroke-dasharray="4 3"' : ""}/>`);
};

/** Vista de arriba (el morro a la derecha). */
function topView(st: Record<DevArea, St>, id: string): string {
  const W = 320, H = 130;
  return `<svg viewBox="0 0 ${W} ${H}" class="plano" aria-hidden="true">${grid(W, H, id)}
    ${part(st.aero, `<path d="M60 34 L250 44 L250 86 L60 96 Z"/>`)}
    <path d="M150 60 L300 62 L300 68 L150 70 Z M110 50 L230 56 L240 65 L230 74 L110 80 Z" fill="none" stroke="${INK}"/>
    ${part(st.fiab, `<path d="M125 36 Q160 30 195 42 L195 50 L125 50 Z"/>`)}
    ${part(st.fiab, `<path d="M125 94 Q160 100 195 88 L195 80 L125 80 Z"/>`)}
    ${part(st.motor, `<rect x="88" y="54" width="70" height="22" rx="6"/>`)}
    <circle cx="205" cy="65" r="7" fill="none" stroke="${INK}"/>
    ${part(st.fiab, `<rect x="48" y="58" width="36" height="14" rx="2"/>`)}
    ${part(st.motor, `<rect x="40" y="62" width="10" height="6" rx="2"/>`)}
    ${part(st.aero, `<path d="M282 18 L306 22 L306 108 L282 112 Z"/>`)}
    ${part(st.aero, `<rect x="18" y="32" width="26" height="66" rx="2"/>`)}
    <g fill="#1b3e66" stroke="${INK}"><rect x="245" y="12" width="30" height="20" rx="4"/><rect x="245" y="98" width="30" height="20" rx="4"/><rect x="58" y="8" width="36" height="24" rx="4"/><rect x="58" y="98" width="36" height="24" rx="4"/></g>
  </svg>`;
}

/** Vista de lado (el morro a la derecha). y: cuánto sube el coche (px); fa y ra: ángulo de los alerones (grados). */
function sideView(st: Record<DevArea, St>, id: string, y = 0, fa = 6, ra = 14, dims = ""): string {
  const W = 320, H = 110;
  return `<svg viewBox="0 0 ${W} ${H}" class="plano" aria-hidden="true">${grid(W, H, id)}
    <path d="M6 102 H314" stroke="${INK}" stroke-opacity=".5" stroke-dasharray="2 3"/>
    <g transform="translate(0 ${-y})">
      ${part(st.aero, `<path d="M58 92 L262 92 L262 95 L58 95 Z"/>`)}
      <path d="M62 88 L95 66 L150 60 L190 50 L215 50 L232 64 L300 80 L300 86 L232 86 L62 90 Z" fill="none" stroke="${INK}"/>
      ${part(st.motor, `<path d="M95 66 L150 60 L175 52 L150 47 L105 56 Z"/>`)}
      ${part(st.fiab, `<path d="M118 70 L190 66 L196 84 L118 86 Z"/>`)}
      ${part(st.fiab, `<rect x="52" y="78" width="30" height="10" rx="2"/>`)}
      <path d="M200 50 Q214 38 228 50" fill="none" stroke="${INK}"/>
      <g transform="rotate(${-ra} 28 40)">${part(st.aero, `<rect x="16" y="37" width="30" height="6" rx="2"/>`)}</g>
      <path d="M44 42 L58 70" stroke="${INK}"/>
      <g transform="rotate(${-fa} 296 90)">${part(st.aero, `<rect x="280" y="87" width="32" height="5" rx="2"/>`)}</g>
    </g>
    <g fill="#1b3e66" stroke="${INK}"><circle cx="75" cy="84" r="17"/><circle cx="258" cy="86" r="15"/></g>
    <g fill="none" stroke="${INK}" stroke-opacity=".6"><circle cx="75" cy="84" r="8"/><circle cx="258" cy="86" r="7"/></g>
    ${dims}
  </svg>`;
}

/** Estado de cada área del desarrollo en esta ronda: montada (on), en fábrica (wait) o nada. */
function devStates(d: DevState, round: number): { st: Record<DevArea, St>; when: Partial<Record<DevArea, number>> } {
  const st: Record<DevArea, St> = { aero: "", motor: "", fiab: "" };
  const when: Partial<Record<DevArea, number>> = {};
  for (const p of d.parts) {
    if (p.ready <= round) st[p.area] = "on";
    else { if (st[p.area] !== "on") st[p.area] = "wait"; when[p.area] = Math.min(when[p.area] ?? 99, p.ready); }
  }
  return { st, when };
}

/** El plano del panel «Desarrollo del coche». gpAt: nombre corto del gran premio de una ronda. */
export function devPlanoHtml(d: DevState, round: number, gpAt: (r: number) => string): string {
  const { st, when } = devStates(d, round);
  const legend = (Object.keys(DEV_AREAS) as DevArea[]).map((a) => {
    const w = when[a];
    const txt = st[a] === "on" ? (w !== undefined ? `montada · otra llega al ${gpAt(w)}` : "montada") : st[a] === "wait" ? `en fábrica · llega al ${gpAt(w!)}` : "sin piezas";
    return `<span class="pl-k ${st[a]}"><i></i>${esc(DEV_AREAS[a].name)}: ${esc(txt)}</span>`;
  }).join("");
  return `<div class="planos"><div class="pl-v">${topView(st, "pgt")}${sideView(st, "pgs")}</div><div class="pl-leg small">${legend}</div></div>`;
}

/** El perfil del coche con un reglaje (carga a y altura r, de −2 a +2), con sus cotas. */
export function setupPlanoHtml(a: number, r: number, id: string): string {
  const none: Record<DevArea, St> = { aero: "", motor: "", fiab: "" };
  const y = r * 2.2, fa = 6 + a * 2.5, ra = 14 + a * 5;
  const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
  const dims = `<g font-size="9" fill="${GOLD}" font-family="'Titillium Web', sans-serif" font-weight="700">
      <path d="M160 ${95 - y} V102" stroke="${GOLD}" stroke-width="1"/><text x="164" y="${101 - y / 2}">altura ${sign(r)}</text>
      <text x="6" y="16">carga ${sign(a)}</text><path d="M28 18 Q34 26 30 34" fill="none" stroke="${GOLD}"/>
    </g>`;
  return sideView(none, id, y, fa, ra, dims);
}
