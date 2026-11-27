// Tests rápidos de piezas concretas (unos segundos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { benchRace, circuit, TEAMS } from "../scripts/banco";
import { Weekend, newWeekend } from "../src/sim/weekend";
import {
  newAeroPlan, makeAeroPkg, aeroGains, aeroPkgCount, aeroPkgRound, aeroSigma, measurePkg, newDev, devLeft, AERO_BAD, DRAG_PER_GRIP,
} from "../src/sim/development";
import { carLevel } from "../src/ui/rendimiento";

test("la simulación es determinista: la misma carrera da lo mismo dos veces", () => {
  const run = () => {
    const s = benchRace("monza", 3);
    for (let i = 0; i < 6000; i++) s.step(); // ~5 minutos de carrera
    return s.cars.map((c) => `${c.id}:${c.s.toFixed(3)}:${c.lapTimes.length}`).join(",");
  };
  assert.equal(run(), run());
});

test("túnel de viento: uno de cada ocho paquetes sale mal (entre el 9 y el 15 %)", () => {
  const a = newAeroPlan(40);
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 600; seed++) for (let p = 0; p < 2; p++) {
    const pk = makeAeroPkg(a, p, 9, seed, 95)!;
    n++;
    if (pk.real < pk.expect * 0.5) bad++;
  }
  const k = bad / n;
  assert.ok(k > AERO_BAD - 0.03 && k < AERO_BAD + 0.03, `salen mal el ${(k * 100).toFixed(1)} %`);
});

test("túnel de viento: el reparto no cambia lo que da un paquete en un circuito medio", () => {
  for (const split of [[1, 0, 0, 0], [0, 0, 0, 1], [0.25, 0.25, 0.25, 0.25], [0.6, 0, 0.4, 0]]) {
    const a = newAeroPlan(40);
    a.pkgs.push({ period: 0, ready: 3, split, atr: 95, expect: 0.3, real: 0.3 });
    const g = aeroGains(a, 3);
    // en un circuito medio (rendimiento.ts): media de las tres curvas más la resistencia pasada a agarre
    const avg = (g.curvas[0] + g.curvas[1] + g.curvas[2]) / 3 - g.drag / DRAG_PER_GRIP;
    assert.ok(Math.abs(avg - 0.3) < 1e-9, `reparto ${split}: ${avg}`);
    assert.equal(aeroGains(a, 2).total, 0, "antes de llegar no cuenta");
    a.pkgs[0].montar = false;
    assert.equal(aeroGains(a, 3).total, 0, "descartado no cuenta");
  }
});

test("túnel de viento: paquetes por calendario, reserva y error de la medida", () => {
  assert.equal(aeroPkgCount(9), 2);
  assert.equal(aeroPkgCount(23), 5);
  assert.equal(aeroPkgRound(2, 9), null, "el último periodo no da paquete en la temporada");
  const d = newDev(null);
  d.aero = newAeroPlan(d.budget);
  assert.equal(devLeft(d), 24, "40 M menos el 40 % de fabricación");
  assert.ok(aeroSigma(40) < aeroSigma(16) && aeroSigma(16) < aeroSigma(0, 115), "más vueltas de prueba, menos error");
  const pk = makeAeroPkg(newAeroPlan(40), 0, 9, 7, 95)!;
  measurePkg(pk, 7);
  const m1 = pk.medido;
  measurePkg(pk, 7);
  assert.equal(pk.medido, m1, "la medida es siempre la misma");
});

test("libres: el programa «validar» cambia las tandas largas de tus pilotos por pruebas de piezas", () => {
  const { def, track } = circuit("silverstone");
  const kinds = (prog?: "validar" | "neumaticos") => {
    const st = newWeekend(def.ronda, def, TEAMS, 1017);
    st.pkgTest = prog;
    const s = new Weekend(st, track, TEAMS, "williams").build("FP1");
    const mine = s.cars.filter((c) => c.player).flatMap((c) => c.queue.map((r) => r.kind));
    const rival = s.cars.filter((c) => !c.player).flatMap((c) => c.queue.map((r) => r.kind));
    return { mine, rival };
  };
  const v = kinds("validar"), n = kinds("neumaticos"), none = kinds();
  assert.ok(v.mine.includes("test") && !v.mine.includes("long"), `validar: ${v.mine}`);
  assert.ok(!n.mine.includes("test") && n.mine.includes("long"), `neumáticos: ${n.mine}`);
  assert.deepEqual(none.mine, n.mine, "sin paquete, como priorizar neumáticos");
  assert.ok(!v.rival.includes("test"), "los rivales no cambian");
});

test("rendimiento: el orden de los coches de 2026 (Mercedes delante, Aston Martin detrás)", () => {
  const order = [...TEAMS].sort((a, b) => carLevel(b) - carLevel(a)).map((t) => t.id);
  assert.equal(order[0], "mercedes");
  assert.equal(order[order.length - 1], "astonmartin");
  assert.deepEqual(order.slice(0, 4).sort(), ["ferrari", "mclaren", "mercedes", "redbull"]);
});
