// Planos técnicos del coche (12.2), en SVG, como en una oficina técnica: fondo azul, cuadrícula y trazo claro.
// Proporciones y silueta sacadas del modelo 3D real del monoplaza (public/assets/models/f1.glb, escala ~50 px/m).
// - En «Desarrollo del coche», vista de planta y de alzado: en dorado, lo que ya va montado; en trazo discontinuo, lo
//   que está en fábrica y cuándo llega. Aerodinámica: alerones y fondo; motor: tapa del motor y escape; fiabilidad:
//   pontones (radiadores) y caja de cambios.
// - En «Reglajes», alzado lateral: la altura sube o baja la carrocería respecto a las ruedas/asfalto y la carga varía
//   el ángulo de los planos de ambos alerones.
import type { DevArea, DevState } from "../sim/development";
import { DEV_AREAS } from "../sim/development";
import { esc } from "./common";

const INK = "#cfe3ff", INK_DIM = "rgba(207,227,255,.45)", BG = "#0c2542", BODY_FILL = "rgba(18,52,92,.62)", GOLD = "#ffd84a", COLD = "#7fd0ff";
type St = "" | "on" | "wait";

const grid = (w: number, h: number, id: string) =>
  `<defs>` +
    `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(207,227,255,.07)" stroke-width=".55"/></pattern>` +
    `<pattern id="${id}m" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="rgba(207,227,255,.14)" stroke-width=".75"/></pattern>` +
  `</defs>` +
  `<rect width="${w}" height="${h}" fill="${BG}"/><rect width="${w}" height="${h}" fill="url(#${id})"/><rect width="${w}" height="${h}" fill="url(#${id}m)"/>`;

/** Una pieza: con lo que tenga su área (montada, en fábrica o estado base). */
const part = (st: St, shape: string, baseFill = "none") => {
  const fill = st === "on" ? "rgba(255,216,74,.30)" : st === "wait" ? "rgba(127,208,255,.15)" : baseFill;
  const stroke = st === "on" ? GOLD : st === "wait" ? COLD : INK;
  const sw = st ? 1.45 : 0.95;
  return shape.replace(/\/>$/, ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${st === "wait" ? ' stroke-dasharray="3.5 2.5"' : ""}/>`);
};

/** Vista en planta (morro a la derecha, eje en y = 65; medidas de f1.glb). */
function topView(st: Record<DevArea, St>, id: string): string {
  const W = 320, H = 130;
  return `<svg viewBox="0 0 ${W} ${H}" class="plano" aria-hidden="true">${grid(W, H, id)}
    <path d="M8 65 H312" stroke="${INK}" stroke-opacity=".22" stroke-width=".6" stroke-dasharray="6 4"/>
    <!-- Fondo plano y difusor (aero) -->
    ${part(st.aero, `<path d="M36 46 L76 42 L88 26 L186 22 L206 38 L206 92 L186 108 L88 104 L76 88 L36 84 Z"/>`, "rgba(16,45,80,.55)")}
    <path d="M92 26 L184 24 M92 104 L184 106" stroke="${INK_DIM}" stroke-width=".65"/>
    <!-- Suspensión delantera y trasera (triángulos) -->
    <g stroke="${INK}" stroke-opacity=".75" stroke-width=".95" fill="none">
      <path d="M254 57 L236 31 M220 55 L236 31 M238 56 L236 31 M254 73 L236 99 M220 75 L236 99 M238 74 L236 99"/>
      <path d="M84 57 L62 32 M48 58 L62 32 M64 58 L62 32 M84 73 L62 98 M48 72 L62 98 M64 72 L62 98"/>
    </g>
    <!-- Pontones / radiadores (fiabilidad) -->
    ${part(st.fiab, `<path d="M188 30 C166 28 136 32 108 42 C96 46 88 50 82 54 L82 58 L184 53 C190 48 192 38 188 30 Z"/>`, BODY_FILL)}
    ${part(st.fiab, `<path d="M188 100 C166 102 136 98 108 88 C96 84 88 80 82 76 L82 72 L184 77 C190 82 192 92 188 100 Z"/>`, BODY_FILL)}
    <!-- Branquias de refrigeración -->
    <path d="M148 39 L156 38 M138 42 L146 41 M128 45 L136 44 M148 91 L156 92 M138 88 L146 89 M128 85 L136 86" stroke="${INK_DIM}" stroke-width=".7"/>
    <!-- Monocasco y morro estrecho -->
    <path d="M298 63 L298 67 C282 70 258 72 232 73 L194 76 L142 75 L142 55 L194 54 L232 57 C258 58 282 60 298 63 Z" fill="${BODY_FILL}" stroke="${INK}" stroke-width="1"/>
    <!-- Tapa del motor y escape (motor) -->
    ${part(st.motor, `<path d="M142 56 L102 58 L64 60 L54 62 L54 68 L64 70 L102 72 L142 74 Z"/>`, BODY_FILL)}
    ${part(st.motor, `<path d="M40 62.5 L54 62.5 L54 67.5 L40 67.5 Z"/>`)}
    <!-- Caja de cambios / estructura trasera (fiabilidad) -->
    ${part(st.fiab, `<path d="M54 59 L84 58 L84 72 L54 71 Z"/>`)}
    <!-- Habitáculo, casco y halo en Y -->
    <ellipse cx="164" cy="65" rx="22" ry="8" fill="#091b31" stroke="${INK}" stroke-width=".9"/>
    <circle cx="159" cy="65" r="6" fill="#173a61" stroke="${INK}" stroke-width="1"/>
    <path d="M161 60.5 A5.5 5.5 0 0 1 161 69.5" fill="none" stroke="${GOLD}" stroke-opacity=".65" stroke-width="1.1"/>
    <path d="M146 56 C160 54 176 57 188 65 C176 73 160 76 146 74 M188 65 L196 65" fill="none" stroke="${INK}" stroke-width="1.45" stroke-linejoin="round"/>
    <!-- Toma de aire y cámara T -->
    <rect x="132" y="61" width="9" height="8" rx="2" fill="#091b31" stroke="${INK}" stroke-width=".9"/>
    <path d="M135 58 V72" stroke="${INK}" stroke-width="1.2"/>
    <!-- Alerón delantero en flecha con flaps y derivas (aero) -->
    ${part(st.aero, `<path d="M258 19 L276 19 C288 28 298 46 300 65 C298 84 288 102 276 111 L258 111 L262 84 L268 74 L268 56 L262 46 Z"/>`, BODY_FILL)}
    <path d="M270 22 C280 34 287 48 288 65 C287 82 280 96 270 108 M264 21 C272 34 278 48 279 65 C278 82 272 96 264 109" fill="none" stroke="${INK_DIM}" stroke-width=".65"/>
    <!-- Alerón trasero con derivas (aero) -->
    ${part(st.aero, `<path d="M22 36 L48 37 L48 93 L22 94 Z"/>`, BODY_FILL)}
    <path d="M32 37 V93 M40 37 V93 M22 36 H48 M22 94 H48" stroke="${INK_DIM}" stroke-width=".7"/>
    <!-- Cuatro neumáticos 18" -->
    <g fill="#132e4d" stroke="${INK}" stroke-width="1.05">
      <rect x="218" y="14" width="36" height="17" rx="4.5"/><rect x="218" y="99" width="36" height="17" rx="4.5"/>
      <rect x="43" y="12" width="37" height="20" rx="5"/><rect x="43" y="98" width="37" height="20" rx="5"/>
    </g>
    <g stroke="${INK_DIM}" stroke-width=".65" fill="none">
      <path d="M222 18 H250 M222 27 H250 M222 103 H250 M222 112 H250 M47 16 H76 M47 28 H76 M47 102 H76 M47 114 H76"/>
    </g>
  </svg>`;
}

/**
 * Vista lateral realista (morro a la derecha, suelo en y = 101; fiel a public/assets/models/f1.glb).
 * y: desplazamiento vertical de la carrocería por altura (px); fa y ra: ángulo de flaps delantero y trasero (grados).
 */
function sideView(st: Record<DevArea, St>, id: string, y = 0, fa = 6, ra = 14, dims = ""): string {
  const W = 320, H = 110;
  // Rotaciones realistas dentro de los endplates según carga (-2..+2): más carga = plano más inclinado hacia arriba atrás
  const rTilt = (ra - 14) * 1.15;
  const fTilt = (fa - 6) * 1.05;
  const wheel = (cx: number) =>
    `<g>` +
      `<circle cx="${cx}" cy="83" r="17.8" fill="#102945" stroke="${INK}" stroke-width="1.2"/>` +
      `<circle cx="${cx}" cy="83" r="14.2" fill="none" stroke="${INK}" stroke-opacity=".35" stroke-width=".7"/>` +
      `<circle cx="${cx}" cy="83" r="10.2" fill="#0b1f36" stroke="${INK}" stroke-width=".95"/>` +
      `<circle cx="${cx}" cy="83" r="3.2" fill="#173a61" stroke="${INK}" stroke-width=".85"/>` +
      `<path d="M${cx - 9.5} 83 H${cx - 3.5} M${cx + 3.5} 83 H${cx + 9.5} M${cx} 73.5 V79.5 M${cx} 86.5 V92.5 M${cx - 6.7} 76.3 L${cx - 2.4} 80.6 M${cx + 2.4} 85.4 L${cx + 6.7} 89.7 M${cx - 6.7} 89.7 L${cx - 2.4} 85.4 M${cx + 2.4} 80.6 L${cx + 6.7} 76.3" stroke="${INK}" stroke-opacity=".32" stroke-width=".6"/>` +
    `</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="plano" aria-hidden="true">${grid(W, H, id)}
    <!-- Línea de asfalto -->
    <path d="M6 101 H314" stroke="${INK}" stroke-opacity=".55" stroke-width=".9" stroke-dasharray="3 3"/>
    <!-- Carrocería suspendida (sube/baja con la altura respecto al suelo y las ruedas) -->
    <g transform="translate(0 ${(-y).toFixed(2)})">
      <!-- Fondo plano, quilla delantera y difusor trasero (aero) -->
      ${part(st.aero, `<path d="M35 86 L62 94 L208 95 L208 97.5 L68 97.5 L34 89 Z"/>`, "rgba(16,45,80,.7)")}
      <path d="M98 94.5 L186 94.5 M72 95.5 L42 88" stroke="${INK_DIM}" stroke-width=".65"/>
      <!-- Brazos de suspensión (tras las ruedas) -->
      <g stroke="${INK}" stroke-opacity=".65" stroke-width=".9" fill="none">
        <path d="M214 75 L236 82 M248 77 L236 82 M214 86 L236 84 M248 85 L236 84"/>
        <path d="M78 79 L61 82 M46 80 L61 82 M78 88 L61 85 M46 86 L61 85"/>
      </g>
      <!-- Silueta principal: monocasco, morro bajo 2026, toma de aire y aleta de tiburón -->
      <path d="M40 77 L56 71 L86 64 L134 49 L141 49 L142 62 L149 65 L188 64 L218 67 L256 74 L288 82 L297 86.5 L295 89 L254 87 L210 89 L190 93 L74 93 L40 82 Z" fill="${BODY_FILL}" stroke="${INK}" stroke-width="1.05" stroke-linejoin="round"/>
      <!-- Tapa del motor, aleta dorsal y salida de escape (motor) -->
      ${part(st.motor, `<path d="M56 71 L86 64 L134 49 L141 49 L141 64 L116 69 L82 77 L56 78 Z"/>`)}
      ${part(st.motor, `<path d="M39 74.5 L52 74.5 L52 78.5 L39 78.5 Z"/>`)}
      <!-- Cámara en T y antena pitot -->
      <path d="M135 49 V45 M130 45 H140" stroke="${INK}" stroke-width="1.25" stroke-linecap="round"/>
      <path d="M222 68 L223 63" stroke="${INK_DIM}" stroke-width=".75"/>
      <!-- Luz roja FIA trasera -->
      <rect x="37" y="75" width="2.5" height="5" rx=".8" fill="#ff4a5a" stroke="none"/>
      <!-- Pontón esculpido con undercut profundo (fiabilidad) -->
      ${part(st.fiab, `<path d="M84 82 C112 75 152 68 188 68 L190 79 C174 86 154 91 120 92 L84 91 Z"/>`, "rgba(18,56,98,.75)")}
      <path d="M188 68 C185 72 184 76 186 79 M102 83 C130 78 158 74 185 73" fill="none" stroke="${INK_DIM}" stroke-width=".7"/>
      <!-- Caja de cambios trasera (fiabilidad) -->
      ${part(st.fiab, `<path d="M46 79 L79 78 L79 88 L46 86 Z"/>`)}
      <!-- Casco del piloto y visera -->
      <circle cx="160" cy="63.5" r="5.8" fill="#173a61" stroke="${INK}" stroke-width="1"/>
      <path d="M161 60.5 L165.6 61.8 L165.2 64.5 L161 63.8 Z" fill="${GOLD}" fill-opacity=".65"/>
      <!-- Halo curvo con pilar delantero y retrovisor -->
      <path d="M142 63 C149 56 167 54 182 56.5 L191 64" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M144 64 C151 58.5 167 57 180 59 L188 64" fill="none" stroke="${BG}" stroke-width=".75"/>
      <rect x="179" y="61" width="5.5" height="2.6" rx="1" fill="${BG}" stroke="${INK}" stroke-width=".85"/>
      <!-- Alerón trasero: soporte cuello de cisne, beam wing, plano fijo + flap móvil y deriva (aero) -->
      <path d="M43 58 L48 54 L54 71" fill="none" stroke="${INK}" stroke-width="1"/>
      <path d="M27 75 L42 78" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
      ${part(st.aero, `<path d="M23 53 L49 54 C51 64 48 76 43 87 L29 87 C24 76 22 64 23 53 Z"/>`, "rgba(14,44,78,.65)")}
      <path d="M27 61 Q38 62.5 47 58" fill="none" stroke="${INK}" stroke-width="1.25"/>
      <g transform="rotate(${rTilt.toFixed(1)} 45 58)">
        ${part(st.aero, `<path d="M24 52.5 L46 56.5 L45 59 L23.5 55 Z"/>`, "rgba(207,227,255,.22)")}
      </g>
      <!-- Alerón delantero: plano principal + flaps móviles y deriva curva (aero) -->
      ${part(st.aero, `<path d="M256 80 Q276 82 296 90 L297 95 L256 95 Z"/>`, "rgba(14,44,78,.65)")}
      <g transform="rotate(${fTilt.toFixed(1)} 294 92)">
        ${part(st.aero, `<path d="M260 84 L295 91.5 L294 94 L259 88 Z"/>`, "rgba(207,227,255,.22)")}
      </g>
      <path d="M256 94.5 L298 93.5" stroke="${INK}" stroke-width="1.2"/>
    </g>
    <!-- Ruedas 18" siempre apoyadas en el asfalto -->
    ${wheel(61)}
    ${wheel(236)}
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

/** El perfil del coche con un reglaje (carga a y altura r, de −2 a +2), con sus cotas técnicas. */
export function setupPlanoHtml(a: number, r: number, id: string): string {
  const none: Record<DevArea, St> = { aero: "", motor: "", fiab: "" };
  const y = r * 1.9, fa = 6 + a * 3.2, ra = 14 + a * 5.5;
  const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
  const floorY = +(97.5 - y).toFixed(1);
  const dims = `<g font-size="9" fill="${GOLD}" font-family="'Titillium Web', sans-serif" font-weight="700">
      <text x="10" y="18">CARGA ${sign(a)}</text>
      <path d="M36 22 Q41 34 38 48" fill="none" stroke="${GOLD}" stroke-width=".95"/>
      <path d="M35.5 45 L38 49 L40.5 45.5" fill="none" stroke="${GOLD}" stroke-width=".95"/>
      <path d="M148 ${floorY} V101 M145 ${floorY} H151 M145 101 H151" stroke="${GOLD}" stroke-width=".95"/>
      <text x="155" y="107.5">ALTURA ${sign(r)}</text>
    </g>`;
  return sideView(none, id, y, fa, ra, dims);
}
