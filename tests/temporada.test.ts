// Modo temporada, con equipo real y con «crea tu equipo», a lo largo de varias temporadas: el jugador automático de
// tests/partida.ts con las carreras rápidas (por ritmo, con azar), para probar en segundos lo que pasa entre carreras
// y entre temporadas con muchas semillas. Las partidas con la simulación entera: scripts/partidas.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCareer, randomSpec, type CareerResult } from "./partida";
import { MARKET, BASE_TEAMS, CALENDARS, useSeason, TEAMS, DRIVERS, gridOf } from "../src/ui/data";
import { buildNextSeason, randomSprintsFor, yearOf } from "../src/ui/nextSeason";
import { costOf, publicDriver } from "../src/sim/market";
import { ageStep, retireChance, rating, winterConcept, WINTER_STEP, WINTER_WORSE } from "../src/sim/career";
import { expectedPos, carRank } from "../src/sim/morale";
import { Rng } from "../src/sim/rng";
import type { DriverDef } from "../src/sim/session";
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

test("cada partida llega a las 4 temporadas y los años van seguidos (ya no hay despido)", () => {
  for (const r of allCareers()) {
    const ys = r.seasons.map((s) => s.year);
    assert.equal(ys[0], 2026);
    ys.forEach((y, i) => assert.equal(y, 2026 + i));
    assert.equal(r.seasons.length, SEASONS, `${r.opts.team} #${r.opts.seed}`);
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

test("sin directiva: ni objetivos ni aviso ni despido, y el presupuesto no depende de los resultados", () => {
  for (const r of allCareers()) for (const s of r.seasons) {
    assert.equal(s.objectives, undefined);
    assert.ok(!s.fired);
    // con equipo real, 40 M cada año (menos lo que se pague en cláusulas); en «crea tu equipo», según el techo
    assert.ok(s.devBonus <= 0, `${r.opts.team} #${r.opts.seed} ${s.year}: devBonus ${s.devBonus}`);
    if (r.opts.team !== "propio") assert.equal(s.budget, Math.max(15, 40 + s.devBonus));
  }
});

test("con equipo real juegas con tu equipo todas las temporadas", () => {
  for (const r of allCareers().filter((x) => x.opts.team !== "propio")) for (const s of r.seasons) assert.equal(s.playerTeam, r.opts.team, `${r.opts.team} #${r.opts.seed} ${s.year}`);
});

test("la moral espera de cada carrera lo que da el coche: ganar con los dos mejores, podio con el 3.º-4.º, puntos el resto", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 11].map(expectedPos), [1, 1, 3, 3, 8, 10, 10]);
  const s: SeasonState = { v: 1, playerTeam: "mercedes", seed: 1, round: 0, weekend: null, rounds: [], calendar: [...CALENDARS.corta.ids] };
  useSeason(s);
  assert.equal(carRank(gridOf(s, 0).teams, "mercedes"), 1, "Mercedes, el mejor coche de 2026");
  assert.equal(carRank(gridOf(s, 0).teams, "astonmartin"), 11);
  for (const r of allCareers()) for (const x of r.seasons) assert.equal(x.expectedPos, expectedPos(x.carRank0));
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

test("los pilotos envejecen: la parrilla sigue entre 17 y 49 años y entran novatos con los años", () => {
  // (Alonso, de 1981, puede seguir pasados los 45 si sigue siendo bueno)
  for (const r of allCareers()) for (const s of r.seasons) {
    assert.ok(s.ages.min >= 17 && s.ages.max <= 49, `${r.opts.team} #${r.opts.seed} ${s.year}: ${s.ages.min}-${s.ages.max}`);
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

test("lesión encadenada: si el sustituto también se lesiona y vuelve, el asiento sigue siendo del primero", () => {
  const { s, out } = endedWithInjury("williams", () => DRIVERS.find((d) => d.d.abrev === "BEA")!.id);
  const k = s.swaps![0].seat, sub1 = s.swaps![0].in, sub2 = publicDriver(MARKET, BASE_TEAMS, "BRO");
  // Bearman se lesiona en la R7 sin vuelta; su sustituto se lesiona en la R8 y vuelve en la R9
  s.swaps = [{ ...s.swaps![0], round: 6 }, { round: 7, seat: k, in: sub2, out: sub1, why: `lesión de ${sub1.nombre}` }, { round: 8, seat: k, in: sub1, out: sub2, why: `vuelve ${sub1.nombre}` }];
  useSeason(s);
  const next = buildNextSeason(s, [{ keep: true }, { keep: true }]);
  assert.ok(next.grid!.find((t) => t.id === "haas")!.pilotos.some((d) => d.abrev === out), `Haas: ${next.grid!.find((t) => t.id === "haas")!.pilotos.map((d) => d.abrev)}`);
});

test("los jóvenes de la F2 inventados no repiten el dorsal de nadie (ni de la parrilla ni de los libres)", () => {
  for (const sd of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = runCareer({ team: sd % 2 ? "propio" : "haas", seed: 300 + sd, seasons: 4, mode: "rapida" });
    assert.deepEqual(r.problems.filter((p) => /dorsal/.test(p)), []);
  }
});

// ------------------------------------------------------------------ cambios de noviembre de 2026
test("los pilotos no empeoran jóvenes: mejoran hasta los ~27, se mantienen hasta los 34 y bajan poco a poco", () => {
  for (let a = 18; a <= 34; a++) assert.ok(ageStep(a) >= 0, `${a} años: ${ageStep(a)}`);
  for (let a = 35; a <= 46; a++) assert.ok(ageStep(a) < 0 && ageStep(a) >= -1.2, `${a} años: ${ageStep(a)}`);
  // de los 33 a los 40 (como Alonso o Hamilton) se pierden unos 2-3 puntos de ritmo, no 7
  let lost = 0;
  for (let a = 34; a <= 40; a++) lost -= ageStep(a);
  assert.ok(lost > 1.5 && lost < 4, `pierde ${lost} de ritmo de los 33 a los 40`);
  // en las partidas: tus pilotos de 30 a 34 no empeoran de media
  const ch: number[] = [];
  for (const r of allCareers()) for (let i = 1; i < r.seasons.length; i++) for (const d of r.seasons[i - 1].myDrivers) {
    const e = r.seasons[i].myDrivers.find((x) => x.abrev === d.abrev);
    if (e && d.edad >= 30 && d.edad <= 33) ch.push(e.rating - d.rating);
  }
  if (ch.length >= 5) assert.ok(ch.reduce((a, b) => a + b, 0) / ch.length > -0.4, `de 30 a 34 años cambian ${ch}`);
});

test("los que siguen arriba se retiran menos, también pasados los 40", () => {
  const d = (ritmo: number, nacimiento: number) => ({ nombre: "X", abrev: "XXX", numero: 99, ritmo, regularidad: ritmo, neumaticos: ritmo, lluvia: ritmo, ataque: ritmo, defensa: ritmo, agresividad: 50, salida: 80, nacimiento } as DriverDef);
  const top = d(92, 1984), mid = d(84, 1984), low = d(78, 1984);
  assert.ok(rating(top) > 88 && rating(mid) < 85);
  assert.ok(retireChance(top, 2026) < retireChance(mid, 2026) && retireChance(mid, 2026) < retireChance(low, 2026));
  assert.ok(retireChance(top, 2026) <= 0.3, `42 años y muy bueno: ${retireChance(top, 2026)}`);
  assert.equal(retireChance(top, 2017), 0, "33 años: nadie se retira por la edad");
});

test("invierno: el coche nuevo casi siempre mejora (a veces mucho) y como mucho empeora un poco (7 a 1)", () => {
  const rng = new Rng(12345);
  const k = Array.from({ length: 20000 }, () => winterConcept(rng));
  const worse = k.filter((x) => x < 0).length / k.length, better = k.filter((x) => x > 0).length / k.length;
  assert.ok(Math.abs(worse - WINTER_WORSE) < 0.01, `empeora el ${(worse * 100).toFixed(1)} %`);
  assert.ok(better / worse >= 7, `mejora ${(better / worse).toFixed(1)} veces más a menudo que empeora`);
  assert.ok(Math.max(...k) / -Math.min(...k) >= 7 - 1e-9, `la mayor mejora es ${(Math.max(...k) / -Math.min(...k)).toFixed(1)} veces la peor caída`);
  const mean = k.reduce((a, b) => a + b, 0) / k.length;
  assert.ok(mean > 0.9 && mean < 1.1, `paso medio ×${mean.toFixed(2)}`);
  assert.ok(k.filter((x) => x >= 1.6).length / k.length > 0.08, "a veces un gran acierto");
  // el invierno pesa más que toda una temporada de evoluciones de un rival (0,06 × 8 = 0,48)
  assert.ok(WINTER_STEP > 0.48);
});

test("invierno: los coches cambian mucho más de orden que antes, pero la parrilla no se iguala de golpe", () => {
  const rel: number[] = [], moved: number[] = [];
  const order = (lv: Record<string, number>) => Object.keys(lv).sort((a, b) => lv[b] - lv[a]);
  for (const r of allCareers()) for (let i = 1; i < r.seasons.length; i++) {
    const a = r.seasons[i - 1].levelsEnd, b = r.seasons[i].levels0;
    const ma = Object.values(a).reduce((x, y) => x + y, 0) / Object.keys(a).length, mb = Object.values(b).reduce((x, y) => x + y, 0) / Object.keys(b).length;
    const oa = order(a), ob = order(b);
    for (const t of Object.keys(a)) if (t in b) { rel.push((b[t] - mb) - (a[t] - ma)); moved.push(Math.abs(oa.indexOf(t) - ob.indexOf(t))); }
  }
  const sd = Math.sqrt(rel.reduce((x, y) => x + y * y, 0) / rel.length);
  const mv = moved.reduce((x, y) => x + y, 0) / moved.length;
  // antes (partidas de scripts/partidas/base-2026-11): desviación 0,15 y 0,44 puestos por coche
  assert.ok(sd > 0.3, `cambio frente a la media en invierno: desviación ${sd.toFixed(2)}`);
  assert.ok(mv > 0.8, `un coche se mueve ${mv.toFixed(2)} puestos en invierno`);
  for (const r of allCareers()) assert.ok(r.seasons[r.seasons.length - 1].spread0 > 1, `${r.opts.team} #${r.opts.seed}: hueco ${r.seasons[r.seasons.length - 1].spread0} en el último año`);
});

test("tope de 50 años: nadie corre con más, tampoco tus pilotos", () => {
  const alo = BASE_TEAMS.flatMap((t) => t.pilotos).find((d) => d.abrev === "ALO")!;
  const born = alo.nacimiento!;
  assert.equal(retireChance(alo, born + 51), 1);
  assert.ok(retireChance(alo, born + 50) < 1, "con 50 todavía puede seguir");
  // Alonso, tuyo en Aston Martin, con 50 años al acabar el año: no sigue aunque se elija mantenerlo
  const s: SeasonState = { v: 1, playerTeam: "astonmartin", seed: 4, round: 9, weekend: null, rounds: [], calendar: [...CALENDARS.corta.ids], year: born + 50 };
  useSeason(s);
  s.contracts = Object.fromEntries(TEAMS.flatMap((t) => t.pilotos.map((d) => [d.abrev, born + 52])));
  const next = buildNextSeason(s, [{ keep: true }, { keep: true }]);
  const am = next.grid!.find((t) => t.id === "astonmartin")!;
  assert.ok(!am.pilotos.some((d) => d.abrev === "ALO"), am.pilotos.map((d) => d.abrev).join(","));
  assert.ok(next.news!.some((n) => /Alonso se retira a los 51/.test(n)), next.news!.join(" | "));
  for (const t of next.grid!) for (const d of t.pilotos) assert.ok(born + 51 - (d.nacimiento ?? 0) <= 50 || d.abrev !== "ALO");
});
