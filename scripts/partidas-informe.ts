// Resume las partidas guardadas por scripts/partidas.ts (un JSON por partida) en un informe en Markdown.
//   npx tsx scripts/partidas-informe.ts <carpeta con los .json> [salida.md]
import { readdirSync, readFileSync, writeFileSync } from "fs";
import type { CareerResult, SeasonLog } from "../tests/partida";

const dir = process.argv[2] ?? "partidas";
const outFile = process.argv[3];
const runs: CareerResult[] = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
const L: string[] = [];
const p = (s = "") => L.push(s);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (x: number) => x.toFixed(1).replace(".", ",");
const f2 = (x: number) => x.toFixed(2).replace(".", ",");
const pct = (x: number) => `${Math.round(x * 100)} %`;
/** Motivo de abandono agrupado: avería, accidente (solo o con otro) o daños tras un toque. */
const why = (r?: string) => !r ? "?" : /^avería/.test(r) ? "avería" : /^accidente con/.test(r) ? "choque con otro" : /^accidente/.test(r) ? "accidente" : /daños/.test(r) ? "daños tras un toque" : r;

for (const mode of ["real", "propio"] as const) {
  const rs = runs.filter((r) => (mode === "propio") === (r.opts.team === "propio"));
  if (!rs.length) continue;
  const all: SeasonLog[] = rs.flatMap((r) => r.seasons);
  const races = all.flatMap((s) => s.races);
  p(`## ${mode === "real" ? "Temporada con equipo real" : "Crea tu equipo"} (${rs.length} partidas, ${all.length} temporadas, ${races.length} carreras)`);
  p();
  p(`Problemas detectados: **${rs.reduce((a, r) => a + r.problems.length, 0)}**`);
  for (const r of rs) for (const x of r.problems) p(`- ${r.opts.team} semilla ${r.opts.seed}: ${x}`);
  p();
  p("| Partida | Año | Equipo | Coche (puesto ini→fin) | Constructores | Pts | Objetivos | Aviso | Presup. | Campeón | Ganadores distintos |");
  p("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rs) for (const s of r.seasons) {
    p(`| ${r.opts.team} #${r.opts.seed} | ${s.year} | ${s.teamName} | ${s.carRank0}→${s.carRankEnd} | ${s.myPos}.º | ${s.myPoints} | ${s.objectives.filter((o) => o.done).length}/${s.objectives.length} | ${s.aviso} | ${s.budget} M (${s.devBonus >= 0 ? "+" : ""}${s.devBonus}) | ${s.champion.nombre} (${s.champion.equipo}, ${s.champion.puntos}) | ${s.winnersDistinct} pilotos / ${s.teamsWinning} equipos |${s.fired ? " **despedido**" + (s.offer ? ` → ${s.offer}` : "") : ""}`);
  }
  p();
  // carreras
  const dnf = mean(races.map((x) => x.dnfs)), fin = mean(races.map((x) => x.finished));
  const reasons: Record<string, number> = {};
  for (const x of races) for (const [k, v] of Object.entries(x.dnfReasons)) reasons[why(k)] = (reasons[why(k)] ?? 0) + v;
  p(`**Carreras.** Abandonos por carrera ${f2(dnf)} (acaban ${f1(fin)}); motivos: ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}. `
    + `Descalificados: ${races.reduce((a, x) => a + x.dsq, 0)}. Carreras acortadas: ${races.filter((x) => x.shortened).length}. Fines de semana con alguna sesión mojada: ${races.filter((x) => x.wet).length}${races.some((x) => x.wetRace !== undefined || x.wet) ? ` (carrera mojada: ${races.filter((x) => x.wetRace).length})` : ""}. `
    + `Coche de seguridad en ${pct(races.filter((x) => (x.safety ?? 0) > 0).length / races.length)}, virtual en ${pct(races.filter((x) => (x.vsc ?? 0) > 0).length / races.length)}, bandera roja en ${races.filter((x) => x.red).length} (${pct(races.filter((x) => x.red).length / races.length)}; ${Object.entries(races.filter((x) => x.red).reduce((a, x) => { a[x.circuitId] = (a[x.circuitId] ?? 0) + 1; return a; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ")}). `
    + `Adelantamientos por carrera ${f1(mean(races.filter((x) => x.passes !== undefined).map((x) => x.passes!)))}. `
    + `La pole gana el ${pct(races.filter((x) => x.pole && x.pole === x.winner).length / races.length)}. Sanciones de parrilla arrastradas: ${races.reduce((a, x) => a + x.gridPens, 0)}. `
    + `Tiempo de cálculo por fin de semana: ${f1(mean(races.map((x) => x.secs)))} s.`);
  p();
  const myDnf = races.flatMap((x) => x.mine).filter((m) => m.status !== "fin");
  p(`**Tus pilotos.** ${races.flatMap((x) => x.mine).length} salidas, ${myDnf.length} abandonos (${pct(myDnf.length / Math.max(1, races.flatMap((x) => x.mine).length))}): ${Object.entries(myDnf.reduce((a, m) => { const k = why(m.reason ?? m.status); a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ")}. `
    + `Victorias ${races.filter((x) => x.mine.some((m) => m.pos === 1 && m.status === "fin")).length}, podios ${races.reduce((a, x) => a + x.mine.filter((m) => m.pos <= 3 && m.status === "fin").length, 0)}.`);
  p();
  // campeones y dominio
  const champs: Record<string, number> = {}, champTeams: Record<string, number> = {};
  for (const s of all) { champs[s.champion.nombre] = (champs[s.champion.nombre] ?? 0) + 1; champTeams[s.champion.equipo] = (champTeams[s.champion.equipo] ?? 0) + 1; }
  p(`**Campeones.** ${Object.entries(champs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}. Por equipo: ${Object.entries(champTeams).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}. `
    + `Puntos del campeón: ${f1(mean(all.map((s) => s.champion.puntos)))} de media (${Math.min(...all.map((s) => s.champion.puntos))}–${Math.max(...all.map((s) => s.champion.puntos))}). Ganadores distintos por temporada: ${f1(mean(all.map((s) => s.winnersDistinct)))}.`);
  p();
  // coches
  const byYear = new Map<number, SeasonLog[]>();
  for (const s of all) byYear.set(s.year, [...(byYear.get(s.year) ?? []), s]);
  p("**Coches (nivel, carLevel).** Diferencia entre el mejor y el peor al empezar y al acabar cada año, y el equipo con mejor coche al empezar:");
  p();
  p("| Año | Hueco inicio | Hueco final | Mejor coche al empezar (veces) |");
  p("|---|---|---|---|");
  for (const [y, ss] of [...byYear].sort((a, b) => a[0] - b[0])) {
    const tops: Record<string, number> = {};
    for (const s of ss) { const t = Object.entries(s.levels0).sort((a, b) => b[1] - a[1])[0][0]; tops[t] = (tops[t] ?? 0) + 1; }
    p(`| ${y} | ${f2(mean(ss.map((s) => s.spread0)))} | ${f2(mean(ss.map((s) => s.spreadEnd)))} | ${Object.entries(tops).map(([k, v]) => `${k} ${v}`).join(", ")} |`);
  }
  p();
  // desarrollo
  const parts = all.flatMap((s) => s.parts), pk = all.flatMap((s) => s.aeroPkgs);
  p(`**Desarrollo.** Piezas pedidas por temporada ${f1(parts.length / all.length)} (rinden ${f2(mean(parts.map((x) => x.real / Math.max(1e-9, x.expect))))}× lo esperado de media; ${parts.filter((x) => x.real < x.expect * 0.75).length} decepcionan). `
    + `Paquetes aerodinámicos ${f1(pk.length / all.length)} por temporada, ${pk.filter((x) => x.montar).length} montados de ${pk.length}; salen mal (real < 50 % de lo esperado) ${pk.filter((x) => x.real < x.expect * 0.5).length}; `
    + `se montó uno malo ${pk.filter((x) => x.montar && x.real < 0).length} veces y se descartó uno bueno ${pk.filter((x) => x.montar === false && x.real > 0).length}. `
    + `Presupuesto que queda sin gastar al acabar: ${f1(mean(all.map((s) => s.devLeftEnd)))} M.`);
  p();
  // pilotos y mercado
  p(`**Pilotos.** Edad media de la parrilla por año: ${[...byYear].sort((a, b) => a[0] - b[0]).map(([y, ss]) => `${y} ${f1(mean(ss.map((s) => s.ages.mean)))} (${Math.min(...ss.map((s) => s.ages.min))}–${Math.max(...ss.map((s) => s.ages.max))})`).join(" · ")}. `
    + `Valoración media: ${[...byYear].sort((a, b) => a[0] - b[0]).map(([y, ss]) => `${y} ${f1(mean(ss.map((s) => s.ratings.mean)))}`).join(" · ")}. `
    + `Libres en el mercado: ${[...byYear].sort((a, b) => a[0] - b[0]).map(([y, ss]) => `${y} ${f1(mean(ss.map((s) => s.poolSize)))}`).join(" · ")}.`);
  p();
  const news = all.flatMap((s) => s.news);
  const kinds: [string, RegExp][] = [["retiradas", /se retira/], ["no renovados", /no renueva/], ["traspasos", /deja .* y se va/], ["novatos", /novato/], ["fichajes", /ficha a/], ["tus fichajes", /^✍️ Fichas/]];
  p(`**Mercado entre temporadas** (${all.length - rs.length} inviernos): ${kinds.map(([k, re]) => `${k} ${news.filter((n) => re.test(n)).length}`).join(", ")}.`);
  const swaps = all.flatMap((s) => s.swaps);
  p(`**A mitad de temporada:** ${swaps.length} cambios (${swaps.filter((x) => /lesi/.test(x)).length} lesiones, ${swaps.filter((x) => /destitu/.test(x)).length} destituciones${swaps.filter((x) => !/lesi|destitu/.test(x)).length ? `, ${swaps.filter((x) => !/lesi|destitu/.test(x)).length} otros` : ""}).`);
  p();
  p(`**Moral de tus pilotos al acabar:** ${f1(mean(all.flatMap((s) => s.myDrivers.map((d) => d.moral))))} de media (${Math.min(...all.flatMap((s) => s.myDrivers.map((d) => d.moral)))}–${Math.max(...all.flatMap((s) => s.myDrivers.map((d) => d.moral)))}). Rivalidades vivas: ${f1(mean(all.map((s) => s.rivals)))}. Hitos por temporada: ${f1(mean(all.map((s) => s.hitos)))}.`);
  const pre = all.filter((s) => s.preseason);
  if (pre.length) p(`**Test de pretemporada:** ${f1(mean(pre.map((s) => s.preseason!.laps)))} vueltas de tus pilotos (bonus de fiabilidad ${f1(mean(pre.map((s) => s.preseason!.fiabBonus * 100)))} %), ${f1(mean(pre.map((s) => s.preseason!.secs)))} s de cálculo.`);
  p(`**Sprints por temporada:** ${[...byYear].sort((a, b) => a[0] - b[0]).map(([y, ss]) => `${y} ${f1(mean(ss.map((s) => s.sprints.length)))}`).join(" · ")}.`);
  if (mode === "propio") {
    p();
    p("**Crea tu equipo.**");
    p();
    p("| Partida | Año | Pilotos | Jefe / técnico / motor | Techo gastado | Queda | Arrastre | Unidades de potencia (usadas/rotas) |");
    p("|---|---|---|---|---|---|---|---|");
    for (const r of rs) for (const s of r.seasons) {
      p(`| #${r.opts.seed} | ${s.year} | ${s.myDrivers.map((d) => `${d.abrev} ${d.edad} (${d.rating})`).join(", ")} | ${s.custom?.jefe} / ${s.custom?.tecnico} / ${s.custom?.motor} | ${f1(s.custom?.spentCap ?? 0)} | ${f1(s.custom?.leftCap ?? 0)} | ${s.custom?.carry ?? "-"} | ${Object.entries(s.pu ?? {}).map(([k, v]) => `${k} ${v.units}/${v.broken}`).join(", ")} |`);
    }
  }
  p();
}
const txt = L.join("\n");
if (outFile) writeFileSync(outFile, txt);
console.log(txt);
