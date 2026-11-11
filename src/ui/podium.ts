// Después de una carrera: podio con confeti, puntos del mundial que suben y una tarjeta vertical
// (1080×1920, formato «story») con tu resultado para compartir.
import type { ResultRow } from "../sim/session";
import type { RaceSummary, Standing } from "../sim/season";
import { DRIVERS, CIRCUITS } from "./data";
import { esc, sheet } from "./common";
import { helmetSvg, circuitPoints, reducedMotion, saveFile, shade } from "./visual";

// ------------------------------------------------------------------ podio
const CONFETTI = ["#ffd84a", "#ffffff", "#e3261c", "#3cc35a", "#3a8be8", "#b25cff"];

/** Podio (2.º, 1.º, 3.º) con el casco de cada uno y confeti cayendo. Vacío si no hay tres clasificados. */
export function podiumHtml(rows: ResultRow[], title: string, playerTeam: string): string {
  const top = rows.filter((r) => r.status === "fin").slice(0, 3);
  if (top.length < 3) return "";
  const col = (r: ResultRow, place: number) => {
    const d = DRIVERS[r.id];
    return `<div class="pcol p${place}${d.team.id === playerTeam ? " mine" : ""}">
      <div class="phelm">${helmetSvg(d.team.color, d.d.numero, d.d.abrev, place === 1 ? 64 : 52)}</div>
      <b class="pname">${esc(d.d.abrev)}</b><span class="pteam">${esc(d.team.nombre)}</span>
      <div class="pstep" style="--tc:${d.team.color}"><span>${place}</span></div></div>`;
  };
  const conf = reducedMotion() ? "" : `<div class="confetti" aria-hidden="true">${Array.from({ length: 46 }, (_, i) => {
    const c = i % 4 === 0 ? DRIVERS[top[0].id].team.color : CONFETTI[i % CONFETTI.length];
    return `<i style="left:${(i * 37) % 100}%;background:${c};animation-delay:${((i * 53) % 900) / 1000}s;animation-duration:${2.2 + ((i * 29) % 140) / 100}s;--rx:${(i * 71) % 360}deg"></i>`;
  }).join("")}</div>`;
  return `<div class="panel podiumwrap"><div class="hd"><span class="t">${esc(title)}</span></div><div class="bd podium">${conf}${col(top[1], 2)}${col(top[0], 1)}${col(top[2], 3)}</div></div>`;
}

// ------------------------------------------------------------------ mundial
/** Panel del mundial tras la carrera: los puntos suben desde los de antes y cada uno lleva lo que ha ganado o perdido de puesto. */
export function standingsHtml(gp: string, before: Standing[], after: Standing[], playerTeam: string, foot: string): string {
  const prevPos = new Map(before.map((x, i) => [x.id, i]));
  const prevPts = new Map(before.map((x) => [x.id, x.points]));
  const shown = after.map((x, i) => ({ x, i })).filter(({ x, i }) => i < 5 || DRIVERS[x.id].team.id === playerTeam);
  return `<div class="panel"><div class="hd"><span class="t">Mundial tras ${esc(gp)}</span></div><div class="bd standings">${shown.map(({ x, i }, k) => {
    const d = DRIVERS[x.id];
    const from = prevPts.get(x.id) ?? 0;
    const was = prevPos.get(x.id) ?? i;
    const mv = was - i;
    const arrow = mv > 0 ? `<span class="green small">▲${mv}</span>` : mv < 0 ? `<span class="redt small">▼${-mv}</span>` : "";
    return `${k > 0 && i > shown[k - 1].i + 1 ? `<div class="dim small" style="padding-left:6px">···</div>` : ""}<div class="row srow${d.team.id === playerTeam ? " yellow" : ""}"><span class="pos">${i + 1}</span>${helmetSvg(d.team.color, d.d.numero, d.d.abrev, 24)}<span class="grow">${esc(d.d.nombre)} ${arrow}</span>${x.points > from ? `<span class="gain small">+${x.points - from}</span>` : ""}<b class="mono" data-count="${from}:${x.points}">${from}</b></div>`;
  }).join("")}${foot}</div></div>`;
}

/** Hace subir los números marcados con data-count="desde:hasta". */
export function animateCounts(root: ParentNode = document, delay = 500, ms = 1300) {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-count]"));
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));
  if (reducedMotion()) { els.forEach((el) => (el.textContent = fmt(Number(el.dataset.count!.split(":")[1])))); return; }
  setTimeout(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      for (const el of els) {
        const [a, b] = el.dataset.count!.split(":").map(Number);
        el.textContent = fmt(k >= 1 ? b : Math.round(a + (b - a) * e));
      }
      if (k < 1 && els.some((el) => el.isConnected)) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

// ------------------------------------------------------------------ tarjeta para compartir
export interface ShareInfo {
  kind: "RACE" | "SPRINT";
  circuitId: string;
  rows: ResultRow[];
  points: Map<number, number>;
  sum: RaceSummary | null;
  playerTeam: string;
  teamName: string;
  teamColor: string;
  standing: { id: number; pos: number; points: number }[]; // tus pilotos en el mundial
}

const svgImage = (svg: string) => new Promise<HTMLImageElement>((res) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(img);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
});

/** Dibuja la tarjeta 1080×1920 con tu resultado. */
export async function drawShareCard(info: ShareInfo): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const F = (w: number, px: number) => `${w} ${px}px "Titillium Web", "Arial Narrow", sans-serif`;
  const def = CIRCUITS[info.circuitId];
  const tc = info.teamColor;
  // fondo: del color de tu equipo (oscurecido) al grafito
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, shade(tc, -0.45)); bg.addColorStop(0.45, "#141a22"); bg.addColorStop(1, "#0b0e13");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // silueta del circuito, grande y tenue
  const pts = circuitPoints(def, 400);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const sc = Math.min(900 / (maxx - minx), 760 / (maxy - miny));
  const ox = (W - (maxx - minx) * sc) / 2, oy = 330;
  g.save();
  g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = 26; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath(); pts.forEach(([x, y], i) => { const X = ox + (x - minx) * sc, Y = oy + (maxy - y) * sc; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); g.stroke();
  g.strokeStyle = tc; g.globalAlpha = 0.35; g.lineWidth = 6; g.stroke();
  g.restore();
  // cabecera
  g.fillStyle = "#fff"; g.font = F(700, 34); g.textBaseline = "alphabetic";
  g.fillText("MURO DE BOXES · TEMPORADA 2026", 70, 110);
  g.fillStyle = "#e3261c"; g.fillRect(70, 128, 120, 8);
  g.fillStyle = "#fff"; g.font = F(900, 78);
  const gpName = def.gp.toUpperCase();
  g.fillText(gpName.length > 22 ? gpName.replace("GRAN PREMIO", "GP") : gpName, 70, 220);
  g.font = F(700, 36); g.fillStyle = "rgba(255,255,255,.75)";
  g.fillText(`${info.kind === "SPRINT" ? "SPRINT" : "CARRERA"} · ${def.nombre.toUpperCase()}`, 70, 275);
  // tus pilotos
  const mine = info.rows.map((r, i) => ({ r, i })).filter(({ r }) => DRIVERS[r.id].team.id === info.playerTeam);
  let y = 1060;
  g.fillStyle = "#fff"; g.font = F(900, 40);
  g.fillText(info.teamName.toUpperCase(), 70, y - 40);
  g.fillStyle = tc; g.fillRect(70, y - 26, 90, 8);
  for (const { r, i } of mine) {
    const d = DRIVERS[r.id];
    const out = r.status !== "fin";
    // caja de posición
    g.fillStyle = out ? "#3a3f48" : i < 3 ? "#ffd84a" : "#e3261c";
    g.fillRect(70, y, 190, 170);
    g.fillStyle = out ? "#c9ccd2" : i < 3 ? "#111" : "#fff";
    g.font = F(900, out ? 64 : 110); g.textAlign = "center";
    g.fillText(out ? (r.status === "dsq" ? "DSQ" : "OUT") : `P${i + 1}`, 165, y + (out ? 110 : 128));
    g.textAlign = "left";
    const hel = await svgImage(helmetSvg(d.team.color, d.d.numero, d.d.abrev, 120));
    g.drawImage(hel, 290, y + 18, 150, 120);
    g.fillStyle = "#fff"; g.font = F(900, 56);
    g.fillText(d.d.nombre.toUpperCase(), 460, y + 75);
    const pts = info.points.get(r.id) ?? 0;
    const gain = r.grid && !out ? r.grid - (i + 1) : 0;
    g.font = F(700, 38); g.fillStyle = "rgba(255,255,255,.8)";
    const line = out ? (r.reason ?? "abandono") : `${pts ? `+${pts} pts` : "sin puntos"}${r.grid ? ` · salía P${r.grid}` : ""}`;
    g.fillText(line, 460, y + 130);
    if (gain) { g.fillStyle = gain > 0 ? "#3cdc6e" : "#ff5a50"; g.fillText(`${gain > 0 ? "▲" : "▼"}${Math.abs(gain)}`, 460 + g.measureText(line + "  ").width, y + 130); }
    y += 200;
  }
  // podio
  y = Math.max(y + 30, 1500);
  g.fillStyle = "rgba(255,255,255,.65)"; g.font = F(700, 32);
  g.fillText("PODIO", 70, y);
  const top = info.rows.filter((r) => r.status === "fin").slice(0, 3);
  top.forEach((r, k) => {
    const d = DRIVERS[r.id];
    const yy = y + 30 + k * 72;
    g.fillStyle = d.team.color; g.fillRect(70, yy, 10, 56);
    g.fillStyle = "#fff"; g.font = F(900, 44);
    g.fillText(`${k + 1}  ${d.d.nombre}`, 100, yy + 44);
    g.font = F(600, 32); g.fillStyle = "rgba(255,255,255,.6)";
    g.textAlign = "right"; g.fillText(d.team.nombre, W - 70, yy + 42); g.textAlign = "left";
  });
  // mundial de tus pilotos
  const foot = info.standing.map((x) => `${DRIVERS[x.id].d.abrev} ${x.pos}.º · ${x.points} pts`).join("   ");
  g.fillStyle = "rgba(255,255,255,.85)"; g.font = F(700, 34);
  g.fillText(`MUNDIAL  ${foot}`, 70, H - 70);
  return cv;
}

/** Enseña la tarjeta y deja compartirla (o guardarla). */
export async function shareSheet(info: ShareInfo) {
  const cv = await drawShareCard(info);
  const url = cv.toDataURL("image/png");
  const { el, close } = sheet(`<div class="row"><b class="up grow">Compartir resultado</b><button data-close>Cerrar</button></div>
    <img src="${url}" alt="Tarjeta con tu resultado" class="sharepreview">
    <div class="btnrow" style="padding:0"><button data-close>Cerrar</button><button class="red" id="doshare">Compartir</button></div>`);
  el.querySelector<HTMLButtonElement>("#doshare")!.onclick = () => {
    cv.toBlob((b) => {
      if (!b) return;
      const name = `muro-de-boxes-${info.circuitId}-${info.kind === "SPRINT" ? "sprint" : "carrera"}.png`;
      void saveFile(new File([b], name, { type: "image/png" })).then(() => close());
    }, "image/png");
  };
}
