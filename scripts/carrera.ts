// Banco de pruebas de la carrera: corre varias carreras en seco (sin libres ni clasificación) y mide lo que
// importa para calibrar los adelantamientos: cuántos hay, cuánto tiempo se pasa en tren y, sobre todo, la
// probabilidad de pasar en una vuelta según la ventaja de ritmo en aire limpio del que persigue.
//   npx tsx scripts/carrera.ts silverstone [carreras=6] [semilla=1] [--detalle]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, ResultRow, setPassT, setPassW } from "../src/sim/session";
import { Rng } from "../src/sim/rng";

const id = process.argv[2] ?? "silverstone";
const nRaces = Number(process.argv[3] ?? 6);
const seed0 = Number(process.argv[4] ?? 1);
const detail = process.argv.includes("--detalle");
// --umbral=1.8 prueba otro umbral de adelantamiento sin tocar el circuito
const um = process.argv.find((a) => a.startsWith("--umbral="));
if (um) setPassT(Number(um.split("=")[1]));
const pw = process.argv.find((a) => a.startsWith("--w="));
if (pw) setPassW(Number(pw.split("=")[1]));
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);

const EDGES = [-9, 0, 0.3, 0.6, 1.0, 1.5, 2.2, 99];
const bucket = (d: number) => { let b = 0; while (b < EDGES.length - 2 && d >= EDGES[b + 1]) b++; return b; };
const tries = EDGES.slice(1).map(() => 0), wins = EDGES.slice(1).map(() => 0);
let lap1 = 0, passes = 0, carLaps = 0, inTrain = 0, inLongTrain = 0, stuck3 = 0, chases = 0, contacts = 0, retired = 0, errors = 0;
const stopsHist: Record<number, number> = {};
const t0 = Date.now();

for (let r = 0; r < nRaces; r++) {
  const seed = seed0 + r;
  const st = newWeekend(def.ronda, def, teams, seed);
  for (const d of st.days) d.scenario = "seco";
  // lo que habrían aprendido en los libres
  const kr = new Rng(seed * 77 + 5);
  for (const k of Object.values(st.knowledge)) {
    for (const c of ["S", "M", "H"] as const) { k.noise[c] = Math.max(0.03, k.noise[c] * 0.45); k.hidden.wearMult[c] = st.hidden.wearMult[c] * kr.logn(k.noise[c]); }
    k.hidden.thermalOffset = st.hidden.thermalOffset + kr.gauss(0, 1.5);
  }
  st.rubber = 0.6;
  const wk = new Weekend(st, track, teams, "-");
  // parrilla: por ritmo con algo de azar, como una clasificación
  const ents = wk.entrants();
  const q = ents.map((e) => ({ id: e.id, k: -(e.d.ritmo - 85) * 0.0007 - e.team.agarre / 180 - e.team.potencia * 0.0012 + kr.gauss(0, 0.0022) })).sort((a, b) => a.k - b.k);
  st.results.Q = q.map((x, i) => ({ id: x.id, pos: i + 1, best: 90, time: 0, laps: 0, status: "ok", stops: 0 }) as ResultRow);
  st.next = wk.sessions().indexOf("RACE");
  const s = wk.build("RACE");
  const lapsSeen = new Map<number, number>();
  const watch = new Map<number, { a: number; stopsC: number; stopsA: number; lap: number }>();
  const streak = new Map<number, { a: number; n: number }>();
  s.onEvent = (e) => {
    if (e.text.includes("Toque") || e.text.includes("se tocan")) contacts++;
    if (e.text.includes("trompo") || e.text.includes("se sale de pista")) errors++;
    if (detail && (e.kind === "control" || e.kind === "incident")) console.log(`   V${e.lap} ${e.text}`);
  };
  while (!s.finished && s.wall < 4 * 3600) {
    s.step();
    for (const c of s.cars) {
      if (c.loc !== "track") continue;
      const done = c.lapTimes.length;
      if ((lapsSeen.get(c.id) ?? 0) === done) continue;
      lapsSeen.set(c.id, done);
      if (done < 2 || s.flag !== "green") { watch.delete(c.id); streak.delete(c.id); continue; }
      // ¿pasó al que perseguía hace una vuelta?
      const w = watch.get(c.id);
      if (w) {
        const a = s.carById(w.a);
        if (a.loc === "track" && c.stops === w.stopsC && a.stops === w.stopsA && !a.pitRequest && !c.pitRequest) {
          const b = (w as any).b as number;
          tries[b]++;
          const st2 = streak.get(c.id);
          if (c.s > a.s) { wins[b]++; streak.delete(c.id); }
          else if (st2 && st2.a === a.id) { st2.n++; if (st2.n === 3) stuck3++; } else streak.set(c.id, { a: a.id, n: 1 });
        }
        watch.delete(c.id);
      }
      carLaps++;
      if (c.aheadId >= 0 && c.followGap < 1.0) {
        const a = s.carById(c.aheadId);
        if (a.loc === "track" && Math.abs(a.s - c.s) < 200) {
          inTrain++;
          if (a.aheadId >= 0 && a.followGap < 1.0) inLongTrain++;
          const d = s.estLap(a) - s.estLap(c);
          if (!streak.has(c.id)) chases++;
          watch.set(c.id, { a: a.id, stopsC: c.stops, stopsA: a.stops, lap: done, b: bucket(d) } as any);
        }
      } else streak.delete(c.id);
    }
  }
  passes += s.passCount;
  lap1 += s.passLap1;
  const res = s.results();
  for (const x of res) { if (x.status === "fin") stopsHist[x.stops] = (stopsHist[x.stops] ?? 0) + 1; else retired++; }
  if (detail) console.log(`carrera ${seed}: ${s.passCount} adelantamientos, gana ${s.carById(res[0].id).d.abrev} desde P${res[0].grid}; podio ${res.slice(0, 3).map((x) => `${s.carById(x.id).d.abrev}(P${x.grid})`).join(" ")}`);
}

console.log(`\n${track.name}: ${nRaces} carreras en ${((Date.now() - t0) / 1000).toFixed(0)} s · objetivo real ${def.adelantamientos?.objetivo ?? "?"} adelantamientos`);
console.log(`adelantamientos por carrera: ${(passes / nRaces).toFixed(1)} (${(lap1 / nRaces).toFixed(1)} en la primera vuelta) · toques ${(contacts / nRaces).toFixed(1)} · errores ${(errors / nRaces).toFixed(1)} · abandonos ${(retired / nRaces).toFixed(1)}`);
console.log(`vueltas a menos de 1 s del de delante: ${((100 * inTrain) / carLaps).toFixed(0)} % · en tren de 3 o más: ${((100 * inLongTrain) / carLaps).toFixed(0)} % · atascado 3+ vueltas tras el mismo: ${(stuck3 / nRaces).toFixed(1)} por carrera`);
console.log("paradas:", JSON.stringify(stopsHist));
console.log("prob. de pasar en una vuelta según la ventaja de ritmo en aire limpio (s/vuelta):");
for (let b = 0; b < tries.length; b++) {
  const name = b === 0 ? "más lento" : b === tries.length - 1 ? `> ${EDGES[b]}` : `${EDGES[b]}–${EDGES[b + 1]}`;
  console.log(`  ${name.padEnd(10)} ${tries[b] ? ((100 * wins[b]) / tries[b]).toFixed(0).padStart(3) : "  –"} %  (${wins[b]}/${tries[b]})`);
}
