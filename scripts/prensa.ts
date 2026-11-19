// Titulares y mensajes de la directiva sin interfaz: corre varias carreras (solo la carrera, con la parrilla de la
// clasificación) y vuelca la portada de cada una y lo que escribe la directiva con los objetivos del equipo.
// npx tsx scripts/prensa.ts [equipo] [carreras] [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef } from "../src/sim/session";
import type { SeasonState } from "../src/sim/season";
import { objectivesFor } from "../src/sim/objectives";
import { buildSummary } from "../src/ui/summary";
import { headlines, boardMessage } from "../src/ui/prensa";
import { DRIVERS } from "../src/ui/data";
const team = process.argv[2] ?? "williams";
const n = Number(process.argv[3] ?? 5);
const seed = Number(process.argv[4] ?? 7);
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const cal = ["silverstone", "monza", "monaco", "spa", "suzuka", "interlagos", "singapur", "sepang", "bahrein"];
const s = { v: 1, playerTeam: team, seed, round: 0, rounds: [], objetivos: objectivesFor(teams, team, n) } as unknown as SeasonState;
const mine = DRIVERS.filter((d) => d.team.id === team).map((d) => d.id);
console.log("Objetivos:", JSON.stringify(s.objetivos));
for (let r = 0; r < n; r++) {
  const id = cal[r % cal.length];
  const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
  const wk = new Weekend(newWeekend(r + 1, def, teams, seed * 31 + r), buildTrack(def), teams, team);
  let race = null as any;
  for (let k = wk.nextKind(); k; k = wk.nextKind()) {
    const sess = wk.build(k);
    sess.autoPlayers = true;
    while (!sess.finished && sess.wall < 4 * 3600) sess.step();
    if (k === "RACE") race = sess;
    wk.finish(sess);
  }
  const sum = buildSummary(race), rows = race.results();
  s.rounds.push({ round: r + 1, circuitId: id, race: rows, summary: sum } as any);
  s.round = r + 1;
  const gp = def.gp ?? def.nombre ?? id;
  const p = headlines(sum, rows, gp, team);
  console.log(`\n== ${gp} · ${mine.map((m) => `${DRIVERS[m].d.abrev} ${rows.findIndex((x: any) => x.id === m) + 1}`).join(", ")}`);
  console.log(`  [${p.paper}] ${p.title}\n  ${p.sub}`);
  for (const x of p.side) console.log(`   · ${x}`);
  const msg = boardMessage(s, teams, mine, n);
  if (msg) s.rounds[s.rounds.length - 1].board = msg; // como el juego: así no repite frase
  console.log(`  📩 ${msg}`);
}
