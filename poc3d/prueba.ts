// Página de prueba del 3D (no se sube): ?c=circuito&q=calidad&h=hora&v=vista&s=punto&storm=1&sc=1&pit=1&lluvia=3
import teamsJson from "../data/equipos-2026.json";
import { CIRCUITS } from "../src/ui/data";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { createMap3d, loadTrackEnv } from "../src/ui/map3d";
const P = new URLSearchParams(location.search), id = P.get("c") || "singapur", q = +(P.get("q") ?? 0);
const reqW = +(P.get("vw") ?? 0), reqH = +(P.get("vh") ?? 0);
if (reqW > 0 && reqH > 0) {
  const box = document.querySelector(".mapbox") as HTMLElement | null;
  if (box) { box.style.width = `${reqW}px`; box.style.height = `${reqH}px`; }
}
const TEAMS = teamsJson.equipos as any;
const def = JSON.parse(JSON.stringify(CIRCUITS[id]));
const wk = new Weekend(newWeekend(1, def, TEAMS, 42), buildTrack(def), TEAMS, TEAMS[0].id);
const sess: any = wk.build("RACE");
for (let i = 0; i < +(P.get("n") ?? 1800); i++) sess.step();
const atS = P.get("atS");
if (atS !== null) {
  const tgtS = +atS, L = sess.track.length;
  for (let i = 0; i < 8000; i++) {
    const c0 = sess.cars[0];
    const d = Math.abs(((c0.s - tgtS + L * 1.5) % L) - L * 0.5);
    if (c0.loc === "track" && d < 18) break;
    sess.step();
  }
}
if (P.get("h")) sess.weather.clock = +P.get("h")! * 60;
// lluvia=<mm/h>: llovizna en todo el circuito y la pista empapada (para ver la estela, los charcos y los halos)
if (P.get("lluvia")) { sess.weather.drizzle = +P.get("lluvia")!; sess.weather.cloud = 0.9; sess.water.fill(0.65); sess.waterOff.fill(0.75); }
if (P.get("sol")) { sess.weather.drizzle = 0; sess.weather.cloud = 0.08; sess.weather.cells = []; sess.water.fill(0); sess.waterOff.fill(0); }
// sc=1: coche de seguridad en pista (delante del líder, al que sigue la cámara)
if (P.get("sc")) sess.flag = "sc";
// pit=1: sigue hasta que un coche está parado en boxes (para ver a los mecánicos), y la cámara va con él
let pitCar: any = null;
if (P.get("pit")) for (let i = 0; i < 400000 && !pitCar; i++) { sess.step(); pitCar = sess.cars.find((c: any) => c.loc === "pit" && c.pit && c.pit.t / c.pit.total > 0.5) ?? null; }
const VIEWS: Record<string, any> = {
  horizonte: { pos: [-60, 25, 40], look: [200, 0, -80], fov: 50 },
  general: { pos: [-1500, 1800, 900], look: [0, 0, 0], fov: 40 },
  medio: { pos: [-180, 120, 120], look: [0, 0, 0], fov: 40 },
  cerca: { pos: [-14, 4, 6], look: [3, 0.5, 0], fov: 34 },
  cielo: { pos: [-20, 3, 0], look: [300, 90, 40], fov: 60 },
  gotas: { pos: [-3.5, 1.7, 2.0], look: [0.3, 0.5, 0], fov: 40 },
  estela: { pos: [-30, 4, 9], look: [-6, 1, 0], fov: 40 },
  morro: { pos: [0.2, 1.3, 1.1], look: [1.6, 0.4, 0.2], fov: 45 },
};
const cam = P.get("cam");
const v = P.get("v") || "horizonte", view = cam ? undefined : (VIEWS[v] ? { ...VIEWS[v] } : JSON.parse(v));
if (view && P.get("s")) view.s = +P.get("s")!;
const debug: any = { view, noLod: !!P.get("nolod"), noCull: !!P.get("nocull"), propFar: P.get("far") ? +P.get("far")! : undefined, splash: P.get("charco") ? +P.get("charco")! : undefined };
void (async () => {
  const env = await loadTrackEnv(id);
  const m = createMap3d({ canvas: document.getElementById("c"), labels: document.getElementById("lbl"), box: document.querySelector(".mapbox"), sess, env,
    mine: () => sess.cars.filter((c: any) => c.team.id === TEAMS[0].id), selId: () => (pitCar ? pitCar.id : P.get("sc") ? sess.leaderId : sess.cars[0].id), alpha: () => 1, paused: () => true, speed: () => 1,
    ghosts: () => [], quality: q, debug });
  if (cam) m.setCamera(cam);
  let n = 0, t0 = performance.now();
  let last = performance.now();
  const canvasEl = document.getElementById("c") as HTMLCanvasElement | null;
  function loop(now: number) {
    m.draw(Math.min(0.1, (now - last) / 1000), now);
    last = now;
    if (++n === +(P.get("f") ?? 40)) {
      const gl = canvasEl?.getContext("webgl2") || canvasEl?.getContext("webgl");
      const done = { ...debug.info, props: debug.props, glErr: gl ? gl.getError() : -1, ms: Math.round(performance.now() - t0) };
      (window as any).__done = done;
      document.title = "DONE:" + JSON.stringify(done);
      return;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  (window as any).__m = m; (window as any).__dbg = debug; (window as any).__sess = sess;
  (window as any).__desglose = () => {
    const out: any[] = [];
    debug.scene.traverse((o: any) => {
      if (!o.geometry || !o.visible) return;
      const g = o.geometry, n = g.index ? Math.min(g.index.count, g.drawRange.count) : g.attributes.position?.count ?? 0;
      const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
      out.push([o.name || o.material?.type || o.type, Math.round((o.isPoints || o.isLine ? n : n / 3) * inst), inst, o.castShadow ? "S" : "", o.layers.mask]);
    });
    return out.sort((a, b) => b[1] - a[1]).slice(0, 18);
  };
})();
