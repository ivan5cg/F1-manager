// Auditoría: juega un fin de semana completo y vuelca métricas detalladas en JSON.
//   npx tsx scripts/auditoria/gp.ts <circuito> <semilla> <clima: seco|natural|lluviaD|chubD|lluviaS|mixto> [formato: normal|sprint]
import { readFileSync } from "fs";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import { TeamDef, isRaceKind } from "../../src/sim/session";
import { pitLoss } from "../../src/sim/strategy";

const [id, seedS, clima = "seco", fmtArg] = process.argv.slice(2);
const seed = Number(seedS);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
if (fmtArg && fmtArg !== def.formato) {
  // formato forzado: el horario del otro formato, o uno hecho con las mismas horas si el circuito no lo trae
  const h = def.horario;
  const otro = def.horarioOtro ?? (fmtArg === "sprint" ? { fp1: h.fp1, sq: h.fp2, sprint: h.fp3, q: h.q, carrera: h.carrera } : { fp1: h.fp1, fp2: h.sq, fp3: h.sprint, q: h.q, carrera: h.carrera });
  def.horarioOtro = h; def.horario = otro; def.formato = fmtArg;
}
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
// sprint forzada en un circuito sin sprint: la distancia del reglamento (100 km)
if (def.formato === "sprint" && !def.vueltasSprint) def.vueltasSprint = Math.ceil(100000 / track.length);
const st = newWeekend(def.ronda, def, teams, seed);
const sc = st.days;
if (clima === "seco") for (const d of sc) d.scenario = "seco";
else if (clima === "lluviaD") { sc[0].scenario = "seco"; sc[1].scenario = "seco"; sc[2].scenario = "frente"; }
else if (clima === "chubD") { sc[0].scenario = "seco"; sc[1].scenario = "seco"; sc[2].scenario = "chubascos"; }
else if (clima === "lluviaS") { sc[0].scenario = "seco"; sc[1].scenario = "frente"; sc[2].scenario = "seco"; }
else if (clima === "mixto") { sc[0].scenario = "chubascos"; sc[1].scenario = "chubascos"; sc[2].scenario = "chubascos"; }
const wk = new Weekend(st, track, teams, "-");
const ents = wk.entrants();
const ab = (i: number) => ents[i].d.abrev;
const out: any = { id, seed, clima, sprint: st.sprint, days: st.days.map((d) => d.scenario), poleObj: def.poleObjetivo, laps: def.vueltas, len: track.length, pitLossModel: 0, sessions: {} };
const kgSens = track.ms.reduce((a, m) => a + m.dMass, 0);
out.kgSens = kgSens;

for (let k = wk.nextKind(); k; k = wk.nextKind()) {
  const s = wk.build(k);
  if (!out.pitLossModel) out.pitLossModel = pitLoss(s);
  out.secPerGrip = s.secPerGrip;
  out.fuelPerLap = s.fuelPerLap;
  const evs: any[] = [];
  s.onEvent = (e) => { if (e.code || e.kind === "control" || e.kind === "incident") evs.push({ t: Math.round(e.t), lap: e.lap, code: e.code, kind: e.kind, motivo: e.motivo, n: e.n, text: e.text }); };
  const race = isRaceKind(k);
  const per = new Map<number, { clean: boolean; minGap: number; pit: boolean; n: number; push: number[]; laps: any[]; behindMin: number }>();
  for (const c of s.cars) per.set(c.id, { clean: true, minGap: 99, pit: false, n: 0, push: [], laps: [], behindMin: 99 });
  const flagLog: { flag: string; t: number; lap: number }[] = [];
  let lastFlag = s.flag;
  let maxW = 0, sumW = 0, nW = 0;
  const t0 = Date.now();
  while (!s.finished && s.wall < 5 * 3600) {
    s.step();
    if (s.flag !== lastFlag) { flagLog.push({ flag: s.flag, t: s.t, lap: s.leaderLap }); lastFlag = s.flag; }
    if (Math.round(s.wall / 0.05) % 100 === 0) { const w = s.avgWater(); maxW = Math.max(maxW, w); sumW += w; nW++; }
    if (!race) continue;
    for (const c of s.cars) {
      const p = per.get(c.id)!;
      if (s.flag !== "green") p.clean = false;
      (p as any).fl = ((p as any).fl ?? "") + (((p as any).fl ?? "").includes(s.flag[0]) ? "" : s.flag[0]);
      if (c.loc === "pit") p.pit = true;
      if (c.loc === "track" && c.aheadId >= 0) p.minGap = Math.min(p.minGap, c.followGap);
      if (c.loc === "track") p.behindMin = Math.min(p.behindMin, c.chased ?? 99);
      if (c.delay > 0.6) p.clean = false;
      if (c.lapTimes.length > p.n) {
        for (let j = p.n; j < c.lapTimes.length; j++) {
          p.laps.push({ n: j + 1, t: +c.lapTimes[j].toFixed(3), g: p.clean, fl: (p as any).fl ?? "", pos: s.order().indexOf(c) + 1, gap: +p.minGap.toFixed(2), bh: +p.behindMin.toFixed(2), pit: p.pit, c: c.tyres?.c, age: c.tyres?.laps, fuel: +c.fuel.toFixed(2), stops: c.stops, push: c.push, eng: c.engine, ers: c.ers, wear: c.tyres ? +Math.max(c.tyres.F.wear, c.tyres.R.wear).toFixed(3) : null, wing: c.wing, floor: c.floor });
        }
        p.n = c.lapTimes.length;
        (p as any).fl = s.flag[0];
        p.clean = s.flag === "green"; p.minGap = 99; p.pit = c.loc === "pit"; p.behindMin = 99;
      }
    }
  }
  const res = s.results();
  const S: any = { kind: k, calcS: (Date.now() - t0) / 1000, wallMin: s.wall / 60, airT: s.weather.airT, trackT: s.weather.trackT, maxWater: maxW, meanWater: nW ? sumW / nW : 0, stats: s.stats, flags: flagLog, events: evs, bestLap: s.bestLap, passCount: s.passCount, passLap1: s.passLap1, rubber: s.rubber };
  if (race) {
    S.lapsTotal = s.laps;
    S.grid = s.lapOrder[0]?.map(ab);
    S.lap1 = s.lapOrder[1]?.map(ab);
    S.lapOrder = s.lapOrder.map((o) => o.map(ab));
    S.res = res.map((r) => {
      const c = s.carById(r.id);
      return { ab: ab(r.id), team: c.team.id, pos: r.pos, grid: r.grid, status: r.status, reason: r.reason, time: r.time, laps: r.laps, stops: r.stops, best: c.best, bestTyre: c.bestTyre, pen: r.pen, stints: c.stintLog.map((x) => ({ c: x.c, from: x.from, used: x.used })), lapsRec: per.get(r.id)!.laps };
    });
    S.shortened = !!s.shortened;
  } else {
    S.res = res.map((r) => {
      const c = s.carById(r.id);
      return { ab: ab(r.id), team: c.team.id, pos: r.pos, best: r.best, laps: r.laps, part: r.part, byPart: c.bestByPart.map((x) => (x === undefined ? null : x)), tyreByPart: c.bestTyreByPart, lapTimes: c.lapTimes.map((x) => +x.toFixed(3)), elim: c.eliminated ? c.elimPart : null, sessionLaps: c.sessionLaps };
    });
    S.longRuns = s.longRuns.map((l) => ({ ab: ab(l.id), c: l.c, n: l.n, avg: +l.avg.toFixed(3), deg: +l.deg.toFixed(4), wet: l.wet }));
  }
  out.sessions[k] = S;
  wk.finish(s);
}
console.log(JSON.stringify(out));
