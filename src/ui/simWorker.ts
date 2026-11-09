// Simula una sesión hasta el final en segundo plano (Web Worker), sin bloquear la pantalla.
// Recibe la instantánea de la sesión, la retoma, la corre hasta la bandera y devuelve la final.
import { getTrack } from "./data";
import { Weekend } from "../sim/weekend";
import { parseSnapshot, snapshotSession } from "../sim/snapshot";
import { isRaceKind, TeamDef } from "../sim/session";

self.onmessage = (ev: MessageEvent<{ raw: string; playerTeam: string; teams: TeamDef[] }>) => {
  const snap = parseSnapshot(ev.data.raw);
  if (!snap) { (self as unknown as Worker).postMessage({ type: "error" }); return; }
  // la parrilla llega con el mensaje: en el modo «crear equipo» no es la de los datos
  const wk = new Weekend(snap.weekend, getTrack(snap.weekend.circuitId), ev.data.teams, ev.data.playerTeam);
  const sess = wk.restore(snap);
  const race = isRaceKind(sess.kind);
  const t0 = sess.wall;
  let last = 0;
  while (!sess.finished && sess.wall < t0 + 6 * 3600) {
    for (let i = 0; i < 500 && !sess.finished; i++) sess.step();
    const now = performance.now();
    if (now - last > 100) {
      last = now;
      const p = race ? sess.leaderLap / sess.laps : (sess.wall - t0) / Math.max(1, (sess.parts.length ? 70 * 60 : 3600) - t0);
      (self as unknown as Worker).postMessage({ type: "progress", p: Math.min(1, p) });
    }
  }
  (self as unknown as Worker).postMessage({ type: "done", raw: snapshotSession(sess, wk.st) });
};
