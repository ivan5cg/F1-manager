// Modo temporada, con equipo real y con «crea tu equipo», a lo largo de varias temporadas: el jugador automático de
// tests/partida.ts con las carreras rápidas (por ritmo, con azar), para probar en segundos lo que pasa entre carreras
// y entre temporadas con muchas semillas. Las partidas con la simulación entera: scripts/partidas.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCareer, randomSpec, type CareerResult } from "./partida";
import { MARKET, BASE_TEAMS, CALENDARS, useSeason, TEAMS, DRIVERS, gridOf } from "../src/ui/data";
import { buildNextSeason, firedNow, randomSprintsFor, yearOf } from "../src/ui/nextSeason";
import { costOf, publicDriver } from "../src/sim/market";
import { objectivesBonus, OBJ_BONUS, OBJ_MALUS } from "../src/sim/career";
import type { SeasonState } from "../src/sim/season";

const REAL_TEAMS = ["mclaren", "mercedes", "ferrari", "williams", "haas", "cadillac", "audi", "alpine"];
const SEEDS = [1, 2, 3, 4, 5];
const SEASONS = 4;

// Las partidas se corren una vez y las comprueban varios tests.
const cache = new Map<string, CareerResult>();
const career = (team: string, seed: number, seasons = SEASONS) => {
  const k = `${team}|${seed}|${seasons}`;
  let r = cache.get(k);
  if (!r) cache.set(k, (r = runCareer({ team, seed, seasons, mode: "rapida" })));
  return r;
};
const allCareers = () => [
  ...REAL_TEAMS.flatMap((t, i) => SEEDS.map((sd) => career(t, sd * 10 + i))),
  ...SEEDS.map((sd) => career("propio", sd)),
];

test("partidas de 4 temporadas sin nada que no debería pasar (pilotos repetidos, puntos que no cuadran, valores sin sentido)", () => {
  for (const r of allCareers()) assert.deepEqual(r.problems, [], `${r.opts.team} semilla ${r.opts.seed}`);
});

test("cada partida llega a las 4 temporadas (o acaba por despido) y los años van seguidos", () => {
  for (const r of allCareers()) {
    const ys = r.seasons.map((s) => s.year);
    assert.equal(ys[0], 2026);
    ys.forEach((y, i) => assert.equal(y, 2026 + i));
    if (r.endedFired === undefined) assert.equal(r.seasons.length, SEASONS, `${r.opts.team} #${r.opts.seed}`);
    else assert.equal(r.seasons[r.seasons.length - 1].year, r.endedFired);
    for (const s of r.seasons) assert.equal(s.races.length, CALENDARS.corta.ids.length);
  }
});

test("la misma semilla da la misma partida", () => {
  const a = runCareer({ team: "williams", seed: 77, seasons: 3, mode: "rapida" });
  const b = runCareer({ team: "williams", seed: 77, seasons: 3, mode: "rapida" });
  assert.deepEqual(a.seasons.map((s) => [s.champion, s.myPoints, s.grid]), b.seasons.map((s) => [s.champion, s.myPoints, s.grid]));
  const c = runCareer({ team: "propio", seed: 77, seasons: 3, mode: "rapida" });
  const d = runCareer({ team: "propio", seed: 77, seasons: 3, mode: "rapida" });
  assert.deepEqual(c.seasons.map((s) => [s.champion, s.myPoints, s.grid, s.custom]), d.seasons.map((s) => [s.champion, s.myPoints, s.grid, s.custom]));
});

test("el presupuesto de desarrollo sigue a los objetivos del año anterior (y nunca baja de 15 M)", () => {
  for (const r of allCareers()) for (let i = 1; i < r.seasons.length; i++) {
    const prev = r.seasons[i - 1], cur = r.seasons[i];
    if (prev.fired) continue;
    const done = prev.objectives.filter((o) => o.done).length;
    const bonus = objectivesBonus(done, prev.objectives.length);
    // devBonus = premio o castigo de la directiva menos las cláusulas pagadas en invierno
    assert.ok(cur.devBonus <= bonus + 1e-9, `${r.opts.team} #${r.opts.seed} ${cur.year}: devBonus ${cur.devBonus} > ${bonus}`);
    assert.ok(cur.budget >= 15);
  }
  assert.equal(objectivesBonus(2, 2), 2 * OBJ_BONUS);
  assert.equal(objectivesBonus(0, 2), -2 * OBJ_MALUS);
  assert.equal(objectivesBonus(1, 2), OBJ_BONUS - OBJ_MALUS);
});

test("aviso de la directiva: sube con cada temporada sin objetivos y vuelve a 0 al cumplir alguno", () => {
  for (const r of allCareers()) for (let i = 1; i < r.seasons.length; i++) {
    const prev = r.seasons[i - 1], cur = r.seasons[i];
    if (prev.fired) { assert.equal(cur.aviso, 0, "nuevo equipo tras el despido: sin aviso"); continue; }
    const none = prev.objectives.length > 0 && prev.objectives.every((o) => !o.done);
    assert.equal(cur.aviso, none ? prev.aviso + 1 : 0, `${r.opts.team} #${r.opts.seed} ${cur.year}`);
  }
});

test("despido: solo tras tres temporadas seguidas sin objetivos; con equipo real hay oferta, con equipo propio se acaba", () => {
  for (const r of allCareers()) for (const s of r.seasons) {
    if (!s.fired) continue;
    assert.ok(s.aviso >= 2 && s.objectives.every((o) => !o.done), `${r.opts.team} #${r.opts.seed} ${s.year}`);
    if (r.opts.team === "propio") assert.equal(r.endedFired, s.year);
    else assert.ok(s.offer && s.offer !== s.playerTeam);
  }
  // un caso forzado: tres temporadas sin cumplir nada
  const s: SeasonState = { v: 1, playerTeam: "cadillac", seed: 5, round: 9, weekend: null, rounds: [], calendar: [...CALENDARS.corta.ids], aviso: 2, objetivos: [{ kind: "victorias", target: 9 }] };
  useSeason(s);
  assert.equal(firedNow(s), true);
  assert.equal(firedNow({ ...s, aviso: 1 }), false);
});

test("con equipo real juegas con tu equipo todas las temporadas (salvo que te despidan y cambies)", () => {
  for (const r of allCareers().filter((x) => x.opts.team !== "propio")) {
    let team = r.opts.team;
    for (const s of r.seasons) {
      assert.equal(s.playerTeam, team, `${r.opts.team} #${r.opts.seed} ${s.year}`);
      if (s.fired && s.offer) team = s.offer;
    }
  }
});

test("crea tu equipo: 12 equipos, tu equipo sigue con su jefe, técnico y motor, y el techo de gasto cuadra", () => {
  for (const r of allCareers().filter((x) => x.opts.team === "propio")) {
    const spec = r.opts.spec!;
    assert.ok(costOf(MARKET, spec) <= MARKET.techo, "lo fichado cabe en el techo");
    for (const s of r.seasons) {
      assert.equal(s.grid.length, 12);
      assert.equal(s.custom!.jefe, spec.jefe);
      assert.equal(s.custom!.tecnico, spec.tecnico);
      assert.equal(s.custom!.motor, spec.motor);
      assert.ok(Number.isFinite(s.custom!.spentCap) && s.custom!.spentCap > 0);
      if (s.year > 2026) assert.ok(Number.isFinite(s.custom!.carry), "desde la segunda temporada el coche arrastra algo del anterior");
    }
    // tus pilotos son los fichados (al acabar el año, salvo que uno siga lesionado: entonces corre su sustituto)
    const s0 = r.seasons[0];
    const hurt = s0.races[0].mine.some((m) => s0.swaps.some((x) => x.includes(`lesión de ${m.nombre}`) && !s0.swaps.some((y) => y.includes(`vuelve ${m.nombre}`))));
    if (!hurt) assert.deepEqual(s0.myDrivers.map((d) => d.abrev).sort(), [...spec.pilotos].sort(), "tus pilotos son los fichados");
  }
});

test("los pilotos envejecen: la parrilla sigue entre 17 y 48 años y entran novatos con los años", () => {
  // (Alonso, de 1981, puede seguir con 46 o 47: a esa edad se retira el 85 % de las veces cada año)
  for (const r of allCareers()) for (const s of r.seasons) {
    assert.ok(s.ages.min >= 17 && s.ages.max <= 48, `${r.opts.team} #${r.opts.seed} ${s.year}: ${s.ages.min}-${s.ages.max}`);
    assert.ok(s.ages.mean > 22 && s.ages.mean < 34);
  }
  const news = allCareers().flatMap((r) => r.seasons.flatMap((s) => s.news));
  assert.ok(news.some((n) => /se retira/.test(n)), "alguna retirada en 4 temporadas");
  // los jóvenes llegan fichados de los reservas y la F2 (un novato inventado solo si no queda nadie libre)
  for (const r of allCareers()) {
    if (r.seasons.length < SEASONS) continue;
    const abr = (s: (typeof r.seasons)[number]) => new Set(s.grid.flatMap((g) => g.pilotos.map((x) => x.slice(0, 3))));
    const first = abr(r.seasons[0]), last = abr(r.seasons[r.seasons.length - 1]);
    const fresh = [...last].filter((a) => !first.has(a));
    assert.ok(fresh.length >= 2, `${r.opts.team} #${r.opts.seed}: solo ${fresh.length} pilotos nuevos en ${SEASONS} temporadas`);
  }
});

test("la parrilla no se descompensa con los años: hueco entre el mejor y el peor coche acotado", () => {
  for (const r of allCareers()) for (const s of r.seasons) {
    assert.ok(s.spread0 > 0.3 && s.spread0 < 6, `${r.opts.team} #${r.opts.seed} ${s.year}: hueco ${s.spread0}`);
    assert.ok(s.spreadEnd < 7, `${r.opts.team} #${r.opts.seed} ${s.year}: hueco final ${s.spreadEnd}`);
  }
});

test("objetivos según el coche: el mejor coche pide victorias, uno de atrás, puntuar", () => {
  for (const r of allCareers()) for (const s of r.seasons) {
    assert.ok(s.objectives.length === 2, `${s.objectives.length} objetivos`);
    if (s.carRank0 <= 2) assert.ok(s.objectives.some((o) => /Ganar/.test(o.text)), `${s.teamName} ${s.year}: ${s.objectives.map((o) => o.text)}`);
    if (s.carRank0 >= 8) assert.ok(s.objectives.some((o) => /Puntuar/.test(o.text)));
  }
});

test("moral de tus pilotos entre 0 y 100", () => {
  for (const r of allCareers()) for (const s of r.seasons) for (const d of s.myDrivers) assert.ok(d.moral >= 0 && d.moral <= 100, `${d.nombre}: ${d.moral}`);
});

test("sprints: 2026 con los del calendario; desde 2027, sorteados (proporcional en el corto) y distintos cada año", () => {
  const r = career("williams", 13);
  const first = r.seasons[0].sprints;
  assert.deepEqual(first, CALENDARS.corta.ids.filter((id) => (CALENDARS.corta.formatos[id] ?? null) === "sprint" || r.seasons[0].sprints.includes(id)));
  const n = Math.min(9, Math.max(2, Math.round((10 * 9) / 23)));
  for (const s of r.seasons.slice(1)) assert.equal(s.sprints.length, n, `${s.year}: ${s.sprints}`);
  const a = randomSprintsFor(CALENDARS.completa.ids, 2027, 1).sprintIds, b = randomSprintsFor(CALENDARS.completa.ids, 2028, 1).sprintIds;
  assert.equal(a.length, 10);
  assert.notDeepEqual(a, b);
});

test("el campeón suele llevar uno de los mejores coches, pero no siempre gana el mismo", () => {
  const all = allCareers().flatMap((r) => r.seasons);
  const champs = new Set(all.map((s) => s.champion.nombre));
  assert.ok(champs.size >= 3, `campeones: ${[...champs]}`);
  for (const s of all) assert.ok(s.champion.puntos > 50, `${s.year}: campeón con ${s.champion.puntos}`);
});

test("al renovar, quien tiene la moral por los suelos no sigue y se ficha a otro", () => {
  // temporada terminada con un piloto tuyo hundido y sin contrato
  const s: SeasonState = { v: 1, playerTeam: "williams", seed: 9, round: 9, weekend: null, rounds: [], calendar: [...CALENDARS.corta.ids] };
  useSeason(s);
  const mine = DRIVERS.filter((d) => d.team.id === "williams").map((d) => d.d);
  s.contracts = Object.fromEntries(TEAMS.flatMap((t) => t.pilotos.map((d) => [d.abrev, 2027])));
  for (const d of mine) s.contracts[d.abrev] = 2026;
  const next = buildNextSeason(s, [{ keep: false, sign: "DOO" }, { keep: true }]);
  const team = next.grid!.find((t) => t.id === "williams")!;
  assert.ok(team.pilotos.some((d) => d.abrev === "DOO"), team.pilotos.map((d) => d.abrev).join(","));
  assert.ok(!team.pilotos.some((d) => d.abrev === mine[0].abrev));
  assert.equal(yearOf(next), 2027);
  assert.ok(next.news!.some((n) => /Fichas a/.test(n)));
});

test("randomSpec: equipos propios distintos y dentro del techo", () => {
  const specs = SEEDS.map((sd) => randomSpec(sd));
  for (const sp of specs) assert.ok(costOf(MARKET, sp) <= MARKET.techo);
  assert.ok(new Set(specs.map((x) => x.pilotos.join())).size > 1);
  assert.equal(new Set(specs.map((x) => x.motor)).size, MARKET.motores.length, "los cinco motores");
  void BASE_TEAMS;
});

// ------------------------------------------------------------------ fallos arreglados (noviembre de 2026)
/** Una temporada de equipo real ya terminada, con un lesionado en la última carrera (asiento `seat`). */
function endedWithInjury(team: string, seat: () => number, equipo?: SeasonState["equipo"]): { s: SeasonState; out: string; sub: string } {
  const s: SeasonState = { v: 1, playerTeam: team, seed: 21, round: 9, weekend: null, rounds: [], calendar: [...CALENDARS.corta.ids], ...(equipo ? { equipo } : {}) };
  useSeason(s);
  const k = seat();
  const out = DRIVERS[k].d;
  const sub = publicDriver(MARKET, BASE_TEAMS, "DUN"); // joven: no se retira del grupo de libres en invierno
  s.swaps = [{ round: 8, seat: k, in: sub, out, why: `lesión de ${out.nombre}` }];
  useSeason(s);
  return { s, out: out.abrev, sub: sub.abrev };
}

test("un lesionado en la última carrera recupera su asiento al año siguiente (equipo de la IA)", () => {
  // Bearman, de Haas: antes del arreglo quedaba libre y lo fichaba otro (o volvía de rebote si su equipo lo elegía)
  const { s, out, sub } = endedWithInjury("williams", () => DRIVERS.find((d) => d.d.abrev === "BEA")!.id);
  const next = buildNextSeason(s, [{ keep: true }, { keep: true }]);
  assert.ok(next.grid!.find((t) => t.id === "haas")!.pilotos.some((d) => d.abrev === out), `vuelve a Haas: ${next.grid!.find((t) => t.id === "haas")!.pilotos.map((d) => d.abrev)}`);
  assert.ok(!next.grid!.some((t) => t.pilotos.some((d) => d.abrev === sub)) || next.news!.some((n) => n.includes("Dunne")), "el sustituto no se queda con el asiento");
  assert.ok(next.pool!.some((d) => d.abrev === sub) || next.grid!.some((t) => t.pilotos.some((d) => d.abrev === sub)), "el sustituto no desaparece: vuelve a los libres");
});

test("un lesionado en la última carrera recupera su asiento al año siguiente (tu piloto, equipo real)", () => {
  const { s, out } = endedWithInjury("williams", () => DRIVERS.find((d) => d.team.id === "williams")!.id);
  const next = buildNextSeason(s, [{ keep: true }, { keep: true }]);
  assert.ok(next.grid!.find((t) => t.id === "williams")!.pilotos.some((d) => d.abrev === out));
});

test("crea tu equipo: tu piloto lesionado sigue siendo tuyo (su equipo de antes no lo recupera) y vuelve al año siguiente", () => {
  const spec = { nombre: "Prueba", color: "#fff", pilotos: ["VIL", "RUS"], jefe: MARKET.jefes[12].nombre, tecnico: MARKET.tecnicos[12].nombre, motor: "mercedes" };
  const { s, out } = endedWithInjury("propio", () => DRIVERS.find((d) => d.d.abrev === "RUS" && d.team.id === "propio")!.id, spec);
  assert.equal(out, "RUS");
  // durante la baja: Russell no corre (tampoco con Mercedes) y Mercedes sigue con su reserva
  for (const r of [8, 9]) {
    const ab = gridOf(s, r).teams.flatMap((t) => t.pilotos.map((d) => d.abrev));
    assert.ok(!ab.includes("RUS"), `ronda ${r}: ${ab.join(",")}`);
    assert.equal(new Set(ab).size, ab.length);
  }
  const next = buildNextSeason(s, [{ keep: true }, { keep: true }]);
  assert.deepEqual([...next.equipo!.pilotos].sort(), ["RUS", "VIL"]);
  assert.ok(!next.grid!.some((t) => t.pilotos.some((d) => d.abrev === "RUS")), "Russell no está también en Mercedes");
  // partidas guardadas antes del arreglo: el sustituto ya estaba en tu equipo
  const old = endedWithInjury("propio", () => DRIVERS.find((d) => d.d.abrev === "RUS" && d.team.id === "propio")!.id, spec).s;
  old.equipo = { ...old.equipo!, pilotos: ["VIL", "DUN"] };
  assert.deepEqual([...buildNextSeason(old, [{ keep: true }, { keep: true }]).equipo!.pilotos].sort(), ["RUS", "VIL"]);
});

test("los jóvenes de la F2 inventados no repiten el dorsal de nadie (ni de la parrilla ni de los libres)", () => {
  for (const sd of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = runCareer({ team: sd % 2 ? "propio" : "haas", seed: 300 + sd, seasons: 4, mode: "rapida" });
    assert.deepEqual(r.problems.filter((p) => /dorsal/.test(p)), []);
  }
});
