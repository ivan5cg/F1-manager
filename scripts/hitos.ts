// Hitos, memoria de Lobato y gala sin interfaz (9.4 y 9.6): corre varias carreras con tu equipo (fin de semana
// entero, la IA lleva a tus pilotos) y vuelca los hitos de cada una y la gala del final.
// npx tsx scripts/hitos.ts [equipo] [carreras] [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef } from "../src/sim/session";
import type { SeasonState } from "../src/sim/season";
import { driverStandings } from "../src/sim/season";
import { buildSummary } from "../src/ui/summary";
import { hitosAfterRace, lobatoMemo, gala, SeatAt } from "../src/sim/hitos";

const team = process.argv[2] ?? "mercedes";
const n = Number(process.argv[3] ?? 5);
const seed = Number(process.argv[4] ?? 3);
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const seats = teams.flatMap((t) => t.pilotos.map((d) => ({ d, t })));
const at: SeatAt = (_r, seat) => ({ nombre: seats[seat].d.nombre, equipo: seats[seat].t.nombre, mine: seats[seat].t.id === team, debut: seats[seat].d.debut });
const cal = ["silverstone", "monza", "monaco", "spa", "suzuka", "interlagos", "singapur", "sepang", "bahrein"];
const defs: Record<string, any> = {};
const gpOf = (id: string) => (defs[id] ??= JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"))).gp;
const s = { v: 1, playerTeam: team, seed, round: 0, rounds: [], year: 2026 } as unknown as SeasonState;
for (let r = 0; r < n; r++) {
  const id = cal[r % cal.length];
  const def = (defs[id] ??= JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8")));
  const wk = new Weekend(newWeekend(r + 1, def, teams, seed * 31 + r), buildTrack(def), teams, team);
  let race: any = null;
  for (let k = wk.nextKind(); k; k = wk.nextKind()) {
    const sess = wk.build(k); sess.autoPlayers = true;
    while (!sess.finished && sess.wall < 4 * 3600) sess.step();
    if (k === "RACE") race = sess;
    wk.finish(sess);
  }
  const memo = lobatoMemo(s, at, gpOf); // lo que sabría Lobato antes de esta carrera
  s.rounds.push({ round: r + 1, circuitId: id, q: wk.st.results.Q, race: race.results(), summary: buildSummary(race) } as any);
  s.round = r + 1;
  const hs = hitosAfterRace(s, at, gpOf);
  const res = race.results();
  console.log(`\n== ${def.gp}: gana ${at(r, res[0].id).nombre}, pole ${at(r, wk.st.results.Q![0].id).nombre} · los tuyos ${res.map((x: any, i: number) => ({ x, i })).filter(({ x }: any) => at(r, x.id).mine).map(({ x, i }: any) => `${seats[x.id].d.abrev} ${i + 1}.º`).join(", ")}`);
  console.log(`   Lobato sabía: victorias ${JSON.stringify(memo.wins)} · poles seguidas ${JSON.stringify(memo.poles)} · racha ${JSON.stringify(memo.winStreak)}`);
  for (const h of hs) console.log(`   ${h.icon} ${h.text}`);
}
const ds = driverStandings(s, seats.length).map((x) => ({ nombre: seats[x.id].d.nombre, equipo: seats[x.id].t.nombre, points: x.points, mine: seats[x.id].t.id === team, debut: seats[x.id].d.debut }));
console.log("\nGala:");
for (const a of gala(s, at, gpOf, ds)) console.log(`   ${a.icon} ${a.title}: ${a.who} — ${a.detail}`);
console.log("Récords:", JSON.stringify(s.records));
