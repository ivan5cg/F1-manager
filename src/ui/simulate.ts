// Simular una sesión hasta el final: en segundo plano (Web Worker) para no bloquear la pantalla y,
// si no se puede, aquí mismo por trozos. Lo usan el ⏭ de la sesión y «Simular» en el fin de semana.
import type { Session } from "../sim/session";
import { isRaceKind } from "../sim/session";
import type { Weekend } from "../sim/weekend";
import { snapshotSession, parseSnapshot, applySnapshot, snapshotConditions, SessionSnapshot } from "../sim/snapshot";

/** Vuelca en la sesión el estado final calculado en segundo plano (mismos objetos de juegos y conocimiento). */
function adoptFinal(sess: Session, wk: Weekend, fin: SessionSnapshot) {
  for (const [id, sets] of Object.entries(fin.weekend.sets)) {
    const mineSets = wk.st.sets[Number(id)];
    for (const x of sets) { const o = mineSets.find((y) => y.id === x.id); if (o) Object.assign(o, x); }
  }
  for (const [team, k] of Object.entries(fin.weekend.knowledge)) Object.assign(wk.st.knowledge[team], k, { profile: {} });
  const cond = snapshotConditions(fin);
  sess.weather = cond.weather;
  sess.water = Float64Array.from(cond.water);
  sess.waterOff = Float64Array.from(cond.waterOff);
  applySnapshot(sess, fin);
}

/**
 * Lleva `sess` hasta el final. `onProgress` recibe 0..1 (y, si se calcula aquí por trozos, es buen
 * momento para redibujar); `onDone` se llama una vez con la sesión ya terminada.
 */
export function runToEnd(sess: Session, wk: Weekend, onProgress: (p: number) => void, onDone: () => void) {
  const race = isRaceKind(sess.kind);
  const t0 = sess.wall;
  const est = () => (race ? sess.leaderLap / sess.laps : (sess.wall - t0) / Math.max(1, (sess.parts.length ? 70 * 60 : 3600) - t0));
  const chunk = () => {
    const lim = performance.now() + 30;
    while (!sess.finished && performance.now() < lim) for (let i = 0; i < 200 && !sess.finished; i++) sess.step();
    onProgress(Math.min(1, est()));
    if (sess.finished) onDone(); else setTimeout(chunk, 0);
  };
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./simWorker.ts", import.meta.url), { type: "module" });
      onProgress(0);
      worker.onmessage = (ev: MessageEvent<{ type: string; p?: number; raw?: string }>) => {
        const m = ev.data;
        if (m.type === "progress") onProgress(m.p ?? 0);
        else if (m.type === "done" && m.raw) {
          worker.terminate();
          const fin = parseSnapshot(m.raw);
          if (!fin) { chunk(); return; }
          adoptFinal(sess, wk, fin);
          onDone();
        } else { worker.terminate(); chunk(); }
      };
      worker.onerror = () => { worker.terminate(); chunk(); };
      worker.postMessage({ raw: snapshotSession(sess, wk.st), playerTeam: wk.playerTeam, teams: wk.teams });
      return;
    } catch { /* sin workers: por trozos */ }
  }
  chunk();
}
