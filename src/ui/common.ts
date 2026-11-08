import { COMPOUNDS, Compound, TyreSet, setWear } from "../sim/tyres";

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const fmtLap = (t: number | null | undefined) => (t && isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}` : "—");
export const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export const fmtRace = (t: number) => { const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = (t % 60).toFixed(3).padStart(6, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };
export const tyreHtml = (c: Compound, big = false) => `<span class="tyre${big ? " big" : ""}" style="border-color:${COMPOUNDS[c].color}">${c}</span>`;
export const setLabel = (s: TyreSet) => `${s.laps === 0 ? "nuevo" : `${s.laps} v · ${Math.round(setWear(s) * 100)} %`}`;

/** Hoja inferior. Devuelve una función para cerrarla. */
export function sheet(html: string, onClose?: () => void): { el: HTMLElement; close: () => void } {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); onClose?.(); };
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = close));
  return { el: bg, close };
}

export function radarColor(r: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [[0.2, [80, 160, 230]], [1, [40, 120, 240]], [2.5, [40, 200, 80]], [5, [230, 220, 40]], [10, [240, 140, 30]], [20, [230, 40, 40]], [40, [200, 40, 200]]];
  if (r < 0.2) return [0, 0, 0, 0];
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) {
      const [r0, c0] = stops[i - 1], [r1, c1] = stops[i];
      const t = (r - r0) / (r1 - r0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t, 200];
    }
  }
  return [200, 40, 200, 220];
}

export function dirName(a: number) {
  const names = ["el este", "el noreste", "el norte", "el noroeste", "el oeste", "el suroeste", "el sur", "el sureste"];
  return names[Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
}

export const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" });
