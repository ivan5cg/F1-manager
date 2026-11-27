// Test de humo del modo temporada con la simulación entera (libres, clasificación, sprint y carrera): dos temporadas
// cortas (dos carreras cada una) para que el paso de una a otra también se haga con resultados de verdad. Lo llaman
// temporada-real-*.test.ts (uno por modo, para que corran en paralelo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCareer } from "./partida";

export function smoke(team: string, seed: number) {
  test(`temporada con la simulación entera (${team === "propio" ? "crea tu equipo" : team}, 2 temporadas de 2 carreras)`, () => {
    const r = runCareer({ team, seed, seasons: 2, mode: "real", rounds: 2, preseason: seed % 2 === 0 });
    assert.deepEqual(r.problems, []);
    assert.equal(r.seasons.length, 2);
    for (const s of r.seasons) {
      assert.equal(s.races.length, 2);
      for (const x of s.races) {
        assert.equal(x.mine.length, 2, "tus dos pilotos en cada carrera");
        assert.ok(x.finished >= 12, `acaban ${x.finished}`);
        assert.equal(x.dsq, 0);
      }
    }
    assert.equal(r.seasons[1].year, 2027);
  });
}
