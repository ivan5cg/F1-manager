// Tests rápidos de piezas concretas (unos segundos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { benchRace, circuit, TEAMS } from "../scripts/banco";
import { Weekend, newWeekend, newPreseasonWeekend, sprintLapsOf, horarioFor, BARCELONA_MARCH_CLIMA } from "../src/sim/weekend";
import {
  newAeroPlan, makeAeroPkg, aeroGains, aeroPkgCount, aeroPkgRound, aeroSigma, measurePkg, aeroPosterior,
  newDev, devLeft, AERO_BAD, DRAG_PER_GRIP, aduoMult, motorCapFor, catchUpMult, carLevel as simCarLevel,
} from "../src/sim/development";
import { developPlayerWinter, DEFAULT_WINTER, normalizeGridScale } from "../src/sim/career";
import { objectivesFor } from "../src/sim/objectives";
import { randomSprintsFor } from "../src/ui/nextSeason";
import { CIRCUITS, CALENDARS } from "../src/ui/data";
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
  const simOrder = [...TEAMS].sort((a, b) => simCarLevel(b) - simCarLevel(a)).map((t) => t.id);
  assert.equal(simOrder[0], "mercedes");
  assert.equal(simOrder[simOrder.length - 1], "astonmartin");
  // atributos físicos explícitos de carrera 2026 (energia y aireSucio medidos por equipo, sin ritmoCarrera)
  assert.ok(TEAMS.every((t) => t.ritmoCarrera === undefined), "sin ritmoCarrera genérico en equipos-2026");
  const ens = new Set(TEAMS.map((t) => t.energia ?? 1));
  const das = new Set(TEAMS.map((t) => t.aireSucio ?? 1));
  assert.ok(ens.size >= 7 && das.size >= 5, `energia/aireSucio deben variar por equipo: en=${ens.size}, da=${das.size}`);
});

test("concesiones ADUO FIA 2026, objetivos de fondo y posterior bayesiano del túnel", () => {
  const merc = TEAMS.find((t) => t.id === "mercedes")!;
  const am = TEAMS.find((t) => t.id === "astonmartin")!;
  assert.equal(aduoMult(merc.potencia, merc.potencia, true), 1);
  assert.ok(aduoMult(am.potencia, merc.potencia, true) > 1.35, "Honda recibe concesiones ADUO");
  assert.ok(motorCapFor(am, merc.potencia) > 1.0, "Tope de motor ampliado por ADUO");
  assert.ok(catchUpMult(simCarLevel(am), simCarLevel(merc)) > catchUpMult(simCarLevel(merc), simCarLevel(merc)));
  // Objetivos P11 en calendario de 23 carreras: 2 carreras puntuando (no 5)
  const objAM = objectivesFor(TEAMS, "astonmartin", 23);
  const scoreObj = objAM.find((o) => o.kind === "puntuar")!;
  assert.equal(scoreObj.target, 2);
  // Posterior bayesiano: ruido leve negativo (-0.002 con sigma 0.075) no descarta paquete esperado de +0.11
  const pNoisy = { period: 0, ready: 4, split: [0.25, 0.25, 0.25, 0.25], atr: 115, expect: 0.11, real: 0.095, medido: -0.002, sigma: 0.075 };
  assert.ok(aeroPosterior(pNoisy).mean > 0, "no descarta falso negativo leve");
  // Un paquete muy negativo (-0.10 con sigma 0.04) sí se descarta
  const pBad = { period: 0, ready: 4, split: [0.25, 0.25, 0.25, 0.25], atr: 115, expect: 0.11, real: -0.04, medido: -0.10, sigma: 0.04 };
  assert.ok(aeroPosterior(pBad).mean < 0, "sí descarta paquete malo claro");
});

test("sprints 2027+: 10 al azar con vueltas y horarios válidos en los 24 circuitos", () => {
  const cal = CALENDARS.completa.ids;
  const s27 = randomSprintsFor(cal, 2027, 42);
  const s28 = randomSprintsFor(cal, 2028, 42);
  assert.equal(s27.sprintIds.length, 10);
  assert.equal(s28.sprintIds.length, 10);
  assert.notDeepEqual(s27.sprintIds, s28.sprintIds, "cambian al azar entre temporadas");
  for (const def of Object.values(CIRCUITS)) {
    assert.ok(sprintLapsOf(def) >= 12, `${def.id} vueltasSprint`);
    const hs = horarioFor(def, true);
    const hn = horarioFor(def, false);
    assert.ok(hs.fp1 && hs.sq && hs.sprint && hs.q && hs.carrera, `${def.id} horario sprint`);
    assert.ok(hn.fp1 && hn.fp2 && hn.fp3 && hn.q && hn.carrera, `${def.id} horario normal`);
  }
});

test("desarrollo de invierno conserva mejoras y normalización uniforme mantiene intactas las brechas", () => {
  const am = TEAMS.find((t) => t.id === "astonmartin")!;
  const res = developPlayerWinter(am, TEAMS, 120, DEFAULT_WINTER, 101, 2027, 1);
  assert.ok(res.team.potencia > am.potencia, "motor mejora en invierno");
  assert.ok(res.team.fiabilidad < am.fiabilidad, "fiabilidad mejora y no se resetea");
  assert.ok((res.team.energia ?? 1) < (am.energia ?? 1), "eficiencia energética ERS mejora con el desarrollo");
  assert.ok((res.team.aireSucio ?? 1) < (am.aireSucio ?? 1), "estabilidad en aire sucio mejora con el desarrollo");
  // Normalización uniforme conserva las diferencias entre equipos
  const boosted = TEAMS.map((t) => ({ ...t, agarre: t.agarre + 0.6, potencia: t.potencia + 0.5 }));
  const gapBefore = boosted[0].agarre - boosted[boosted.length - 1].agarre;
  const norm = normalizeGridScale(boosted, 0.71, 0.2);
  const gapAfter = norm[0].agarre - norm[norm.length - 1].agarre;
  assert.ok(Math.abs(gapBefore - gapAfter) < 0.02, "brechas entre equipos intactas");
});

test("test de pretemporada de 8 horas en Barcelona (clima de marzo)", () => {
  const { def, track } = circuit("barcelona");
  const st = newPreseasonWeekend(def, TEAMS, 202601, 2026);
  assert.equal(st.preseason, true);
  assert.equal(st.circuitId, "barcelona");
  assert.equal(BARCELONA_MARCH_CLIMA.maxima, 16.5);
  const wk = new Weekend(st, track, TEAMS, "astonmartin");
  assert.deepEqual(wk.sessions(), ["TEST"]);
  const sess = wk.build("TEST");
  assert.equal(sess.durationS, 480 * 60, "dura exactamente 8 horas");
  // Avanzar 40 minutos para comprobar que los coches salen y completan vueltas sin errores
  for (let i = 0; i < 40 * 60 * 20 && !sess.finished; i++) sess.step();
  const totalLaps = sess.results().reduce((a, r) => a + r.laps, 0);
  assert.ok(totalLaps > 100, `deben completarse vueltas en el test: ${totalLaps}`);
});
