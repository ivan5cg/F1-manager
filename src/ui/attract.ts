// Pantalla de inicio en movimiento: una carrera de verdad (la misma simulación del juego) corre en
// bucle en un circuito al azar, detrás del título. Se monta «ligera» para no congelar el inicio:
// tiempo seco directamente a la hora de la carrera, sin simular la mañana, y coches ya en parrilla
// con una estrategia sencilla. Cada pocas vueltas cambia de circuito.
import { BASE_TEAMS, CIRCUITS, ROUNDS, getTrack } from "./data";
import { Weekend, newWeekend } from "../sim/weekend";
import { Session } from "../sim/session";
import { createDayWeather } from "../sim/weather";
import { Rng } from "../sim/rng";
import { flagHtml } from "./common";
import { reducedMotion, lightAt } from "./visual";
import type { Track } from "../sim/track";

const LAPS_SHOWN = 6;
const SPEED = 3;

function buildRace(id: string, seed: number): { sess: Session; track: Track } {
  const def = CIRCUITS[id];
  const track = getTrack(id);
  const st = newWeekend(1, def, BASE_TEAMS, seed);
  const [d, hm] = (def.horario.carrera as string).split(" ");
  void d;
  const [h, m] = hm.split(":").map(Number);
  const weather = createDayWeather(new Rng(seed), def.clima, "seco", 0, h * 60 + m);
  const entrants = new Weekend(st, track, BASE_TEAMS, "-").entrants();
  const sess = new Session({ kind: "RACE", seed, track, entrants, hidden: st.hidden, weather, water: [], rubber: 0.5, minutes: 60, laps: def.vueltas, sprintWeekend: false, restore: true });
  // parrilla por ritmo, con algo de azar; todos con medios y una parada a mitad de carrera
  const rng = new Rng(seed ^ 0x51);
  const grid = [...sess.cars].sort((a, b) => b.pace + rng.gauss(0, 0.004) - (a.pace + rng.gauss(0, 0.004)));
  sess.lapOrder[0] = grid.map((c) => c.id);
  grid.forEach((c, i) => {
    c.loc = "track";
    c.gridS = -12 - i * 8;
    c.s = c.gridS;
    c.fuel = sess.fuelPerLap * sess.laps + 1;
    const set = c.e.sets.find((x) => x.c === "M") ?? c.e.sets[0];
    sess.mount(c, set);
    c.plan = { stints: [{ c: "M", endLap: Math.round(sess.laps * (0.42 + rng.next() * 0.16)) }, { c: "H", endLap: sess.laps }] };
  });
  return { sess, track };
}

/** Arranca la carrera de fondo en `cv`; `label` recibe el rótulo «en directo». Se para sola al salir de la pantalla. */
export function startAttract(cv: HTMLCanvasElement, label: HTMLElement) {
  let id = ROUNDS[Math.floor(Math.random() * ROUNDS.length)];
  let seed = Math.floor(Math.random() * 1e6);
  let { sess, track } = buildRace(id, seed);
  for (let i = 0; i < 500; i++) sess.step(); // ya en marcha
  let startLap = 0;
  let last = performance.now(), lastDraw = 0, lastLabel = 0, acc = 0;
  const still = reducedMotion();
  const fit = { sc: 1, ox: 0, oy: 0, w: 0, h: 0 };
  const sizeFit = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w < 10 || h < 10) return false;
    if (fit.w !== w || fit.h !== h) { cv.width = w * dpr; cv.height = h * dpr; fit.w = w; fit.h = h; }
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < track.xs.length; i++) { minx = Math.min(minx, track.xs[i]); maxx = Math.max(maxx, track.xs[i]); miny = Math.min(miny, track.ys[i]); maxy = Math.max(maxy, track.ys[i]); }
    // el circuito, a la derecha y algo grande: el título va abajo a la izquierda
    const pad = 14 * dpr;
    fit.sc = Math.min((cv.width - 2 * pad) / (maxx - minx), (cv.height - 2 * pad) / (maxy - miny));
    fit.ox = cv.width - pad - (maxx - minx) * fit.sc - minx * fit.sc;
    fit.oy = (cv.height - (maxy - miny) * fit.sc) / 2 + maxy * fit.sc;
    return true;
  };
  const X = (x: number) => fit.ox + x * fit.sc, Y = (y: number) => fit.oy - y * fit.sc;
  const at = (s: number) => {
    const L = track.length, n = track.xs.length;
    const i = Math.min(n - 1, Math.floor((((s % L) + L) % L) / track.ds));
    return { x: X(track.xs[i]), y: Y(track.ys[i]) };
  };
  function draw() {
    if (!sizeFit()) return;
    const g = cv.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    g.clearRect(0, 0, cv.width, cv.height);
    const night = lightAt(sess.weather.clock) === "noche";
    g.lineJoin = "round"; g.lineCap = "round";
    g.save();
    g.strokeStyle = night ? "rgba(255,236,190,.22)" : "rgba(255,255,255,.10)";
    g.shadowColor = night ? "rgba(255,225,160,.6)" : "rgba(120,170,255,.35)"; g.shadowBlur = 16 * dpr;
    g.lineWidth = 10 * dpr;
    g.beginPath();
    for (let i = 0; i < track.xs.length; i += 2) { const x = X(track.xs[i]), y = Y(track.ys[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.stroke();
    g.restore();
    g.strokeStyle = "#7b818c"; g.lineWidth = 3.2 * dpr;
    g.stroke();
    const order = sess.order();
    for (const c of [...sess.cars].reverse()) {
      if (c.loc !== "track" && c.loc !== "pit") continue;
      const p = at(c.s);
      if (!still && c.v > 30) {
        const t = at(c.s - Math.min(120, c.v * 1.2));
        const gr = g.createLinearGradient(t.x, t.y, p.x, p.y);
        gr.addColorStop(0, c.team.color + "00"); gr.addColorStop(1, c.team.color + "cc");
        g.strokeStyle = gr; g.lineWidth = 3 * dpr;
        g.beginPath();
        for (let d = Math.min(120, c.v * 1.2); d >= 0; d -= track.ds * 3) { const q = at(c.s - d); g.lineTo(q.x, q.y); }
        g.stroke();
      }
      g.fillStyle = c.team.color;
      g.beginPath(); g.arc(p.x, p.y, (c === order[0] ? 4.6 : 3.4) * dpr, 0, 7); g.fill();
      g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 1 * dpr; g.stroke();
    }
    const lead = order[0];
    if (lead) {
      const p = at(lead.s);
      g.font = `900 ${10 * dpr}px "Titillium Web", sans-serif`;
      g.fillStyle = "#fff"; g.fillText(lead.d.abrev, p.x + 7 * dpr, p.y - 6 * dpr);
    }
  }
  function updLabel() {
    const def = CIRCUITS[id];
    const lead = sess.order()[0];
    label.innerHTML = `<span class="livedot"></span>En directo · ${flagHtml(def.bandera)} ${def.gp.replace("Gran Premio de ", "GP de ")} · V${Math.min(sess.laps, sess.leaderLap + 1)}/${sess.laps}${lead ? ` · lidera <b>${lead.d.abrev}</b>` : ""}`;
  }
  function next() {
    const others = ROUNDS.filter((x) => x !== id);
    id = others[Math.floor(Math.random() * others.length)];
    seed = Math.floor(Math.random() * 1e6);
    ({ sess, track } = buildRace(id, seed));
    for (let i = 0; i < 500; i++) sess.step();
    startLap = sess.leaderLap;
    fit.w = 0;
  }
  updLabel();
  draw();
  if (still) return;
  const loop = (now: number) => {
    if (!cv.isConnected) return; // se ha salido del inicio
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.visibilityState === "visible") {
      acc += real * SPEED;
      while (acc >= sess.dt) { sess.step(); acc -= sess.dt; }
      if (now - lastDraw > 33) { lastDraw = now; draw(); }
      if (now - lastLabel > 600) { lastLabel = now; updLabel(); }
      if (sess.finished || sess.leaderLap - startLap >= LAPS_SHOWN) { next(); updLabel(); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

