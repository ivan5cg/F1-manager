// Tests del banco por circuito: cada fichero banco-*.test.ts llama a esto con sus circuitos (se ejecutan en paralelo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { circuitStats, around } from "./comun";

export interface CircuitRef {
  id: string;
  /** Adelantamientos por carrera sin la primera vuelta (rapida.ts, semillas 1-2, noviembre de 2026). */
  pass: number;
}

const SEEDS = [1, 2];
/** Margen de los adelantamientos: con dos carreras hay ruido (±35 %), pero no deja pasar un circuito que se descalibra
 *  (Mónaco pasó de 7,3 a 3,3 por carrera sin que nada avisara). */
const PASS_K = 0.35;

export function benchCircuits(refs: CircuitRef[]) {
  for (const ref of refs) {
    test(`banco: ${ref.id}`, async (t) => {
      const st = circuitStats(ref.id, SEEDS);
      await t.test("adelantamientos dentro de su calibración", () => {
        const [lo, hi] = around(ref.pass, PASS_K);
        assert.ok(st.pass >= lo && st.pass <= hi, `${st.pass.toFixed(1)} adelantamientos por carrera; se esperaban entre ${lo.toFixed(1)} y ${hi.toFixed(1)}`);
      });
      await t.test("nadie descalificado (regla de los dos compuestos)", () => assert.equal(st.dsq, 0));
      // cuenta también los cambios con bandera roja: con una o dos rojas muchos cumplen la regla de los dos compuestos
      // sin parar (Las Vegas, semilla 2: dos rojas y 0,17 paradas por coche, pero 1,22 cambios)
      await t.test("cambios de neumáticos por coche (paradas y con bandera roja) entre 0,9 y 2", () => assert.ok(st.changes >= 0.9 && st.changes <= 2, `${st.changes.toFixed(2)} cambios (${st.stops.toFixed(2)} paradas)`));
      await t.test("doblados por carrera entre 0 y 14", () => assert.ok(st.lapped >= 0 && st.lapped <= 14, `${st.lapped} doblados`));
      await t.test("acaban al menos 12 coches", () => assert.ok(st.finished >= 12, `acaban ${st.finished}`));
    });
  }
}
