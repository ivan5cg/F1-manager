// Auditoría: solo la salida. Juega las primeras vueltas de muchas salidas (carrera o sprint) con la parrilla de la
// clasificación real del juego y cuenta cuántas veces sale líder la pole y qué puestos pierde.
//   npx tsx scripts/auditoria/salida.ts <RACE|SPRINT> <vueltas> <salidas por circuito> [circuitos...]
// Con PARRILLA=<carpeta de gp.ts>, la parrilla es la de la clasificación de cada fin de semana de esa carpeta (y las
// salidas, variaciones de esa sesión); si no, una parrilla por ritmo del coche y del piloto con algo de azar.
import { readFileSync, readdirSync } from "fs";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import { TeamDef } from "../../src/sim/session";

const [kindArg = "SPRINT", lapsArg = "1", nArg = "20", ...ids0] = process.argv.slice(2);
const kind = kindArg as "RACE" | "SPRINT";
const upTo = Number(lapsArg), n = Number(nArg);
const ids = ids0.length ? ids0 : readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
let lead = 0, total = 0, p2lead = 0, poleLost = 0;
const pos: number[] = [];
for (const id of ids) {
  const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
  if (kind === "SPRINT" && def.formato !== "sprint") {
    const h = def.horario;
    const otro = def.horarioOtro ?? { fp1: h.fp1, sq: h.fp2, sprint: h.fp3, q: h.q, carrera: h.carrera }; def.horarioOtro = h; def.horario = otro; def.formato = "sprint";
  }
  const track = buildTrack(def);
  if (def.formato === "sprint" && !def.vueltasSprint) def.vueltasSprint = Math.ceil(100000 / track.length);
  const gridDir = process.env.PARRILLA;
  const grids: { seed: number; order: string[] }[] = gridDir
    ? readdirSync(gridDir).filter((f) => f.startsWith(id + "_")).map((f) => JSON.parse(readFileSync(`${gridDir}/${f}`, "utf8"))).filter((w) => w.sessions[kind === "SPRINT" ? "SQ" : "Q"] && w.sessions[kind]?.maxWater < 0.2).map((w) => ({ seed: w.seed, order: w.sessions[kind].grid }))
    : [];
  for (let s = 1; s <= n * Math.max(1, grids.length); s++) {
    const g = grids.length ? grids[(s - 1) % grids.length] : null;
    const st = newWeekend(def.ronda, def, teams, g ? g.seed : 1000 + s);
    for (const d of st.days) d.scenario = "seco";
    const wk = new Weekend(st, track, teams, "-");
    // parrilla: por ritmo del coche y del piloto, con algo de azar (como una clasificación)
    const ents = wk.entrants();
    const score = (e: (typeof ents)[number]) => -(e.team.agarre * 2.6 + (e.team.potencia ?? 0) + (e.d.ritmo - 85) * 0.13 + ((s * 7919 + e.id * 104729) % 1000) / 1000 * 0.6);
    const order = g ? g.order.map((ab) => ents.find((e) => e.d.abrev === ab)!.id) : [...ents].sort((a, b) => score(a) - score(b)).map((e) => e.id);
    (st.results as any)[kind === "SPRINT" ? "SQ" : "Q"] = order.map((x) => ({ id: x }));
    const sess = wk.build(kind, g ? s : 0);
    while (!sess.finished && sess.leaderLap < upTo && sess.wall < 3600) sess.step();
    const o = sess.lapOrder[upTo];
    if (!o) continue;
    total++;
    if (o[0] === order[0]) lead++;
    if (o[0] === order[1]) p2lead++;
    const p = o.indexOf(order[0]) + 1;
    pos.push(p);
    if (p > 1) poleLost++;
  }
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`${kind}, tras la vuelta ${upTo} (${total} salidas): la pole lidera ${((100 * lead) / total).toFixed(0)} % · lidera el P2 ${((100 * p2lead) / total).toFixed(0)} % · la pole va de media P${mean(pos).toFixed(2)}`);
