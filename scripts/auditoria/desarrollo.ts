// Banco de auditoría del desarrollo asimétrico ATR (equipo real y «crear equipo»).
// Comprueba:
//  - Ronda 0 sin alteraciones, escala FIA ATR (70–120 %), media de parrilla equilibrada frente a los 40 M del jugador,
//    dispersión intratemporada, paquetes discretos (salto / ok / fallo), mejoras de UP por motorista (oficial vs cliente)
//    y maduración de fiabilidad.
//  - Modo «crear equipo» (buildGrid + ATR + director técnico real, incluido el impacto de fichar a un director rival).
//  - Revisión ATR de mitad de año (con la clasificación), cuota ATR del jugador y calendarios cortos.
//  - Impacto real en pista (delta de vuelta en Silverstone entre Ronda 1 y Ronda 23).
//   npx tsx scripts/auditoria/desarrollo.ts [semillas: 1-40] [rondas: 23]
import { readFileSync } from "fs";
import { rivalDevAt, applyGridDev, DEV_RIVAL, isWorks, atrCarOrder, atrMidRound, atrAt, atrMult, devExpect, AtrPlan } from "../../src/sim/development";
import { buildGrid, Market, CustomTeam, PLAYER_TEAM_ID } from "../../src/sim/market";
import { buildTrack } from "../../src/sim/track";
import { Weekend, newWeekend } from "../../src/sim/weekend";
import type { TeamDef } from "../../src/sim/session";

const [semS = "1-40", roundsS = "23"] = process.argv.slice(2);
const seeds = semS.includes("-")
  ? (() => { const [a, b] = semS.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
  : semS.split(",").map(Number);
const totalRounds = Math.max(2, Number(roundsS) || 23);
const lastRound = totalRounds - 1;

const teams: TeamDef[] = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos;
const market: Market = JSON.parse(readFileSync("data/mercado-2026.json", "utf8"));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

console.log(`=== DESARROLLO RIVAL ATR — EQUIPO REAL (${seeds.length} temporadas · ${totalRounds} rondas) ===`);
const r0 = applyGridDev(teams, seeds[0], 0, totalRounds, "ferrari");
const r0Clean = r0.every((t, i) => t.agarre === teams[i].agarre && t.potencia === teams[i].potencia && t.fiabilidad === teams[i].fiabilidad);
console.log(`Ronda 0 intacta: ${r0Clean ? "OK" : "FALLO"}`);

const aero = new Map<string, number[]>(), motor = new Map<string, number[]>(), fiab = new Map<string, number[]>(), atr = new Map<string, number>();
const spreads: number[] = [];
let jumps = 0, oks = 0, flops = 0, puWaves = 0;

for (const s of seeds) {
  const seed = s * 1337;
  const end = rivalDevAt(teams, seed, lastRound, totalRounds);
  const vals: number[] = [];
  for (const t of teams) {
    const g = end.get(t.id)!;
    (aero.get(t.id) ?? aero.set(t.id, []).get(t.id)!).push(g.aero);
    (motor.get(t.id) ?? motor.set(t.id, []).get(t.id)!).push(g.motor);
    (fiab.get(t.id) ?? fiab.set(t.id, []).get(t.id)!).push(g.fiab);
    atr.set(t.id, g.atr);
    vals.push(g.aero);
  }
  spreads.push(Math.max(...vals) - Math.min(...vals));
  for (let r = 1; r <= lastRound; r++) {
    const m = rivalDevAt(teams, seed, r, totalRounds);
    for (const g of m.values()) {
      for (const p of g.arrivals) {
        if (p.area === "motor") puWaves++;
        else if (p.verdict === "salto") jumps++;
        else if (p.verdict === "fallo") flops++;
        else oks++;
      }
    }
  }
}

const rows = teams.map((t) => ({
  t,
  atr: atr.get(t.id)!,
  a: mean(aero.get(t.id)!),
  m: mean(motor.get(t.id)!),
  f: mean(fiab.get(t.id)!),
})).sort((x, y) => x.atr - y.atr);

for (const x of rows) {
  const role = isWorks(x.t) ? "oficial" : "cliente";
  console.log(`  ${x.t.nombre.padEnd(15)} ATR ${String(x.atr).padStart(3)}% (${role}) | aero +${x.a.toFixed(3)} (${(-x.a * 0.38).toFixed(2)} s) | UP +${x.m.toFixed(3)} | fiab −${(x.f * 100).toFixed(1)}%`);
}
const gridMeanAero = mean(rows.map((x) => x.a));
const targetAero = DEV_RIVAL * (totalRounds > 9 ? 8 : lastRound);
console.log(`Media parrilla aero: +${gridMeanAero.toFixed(3)} (objetivo jugador 40 M = +${targetAero.toFixed(3)}) · dispersión máx-mín: ${mean(spreads).toFixed(3)} (~${(mean(spreads) * 0.38).toFixed(2)} s/v)`);
const totAeroPkg = jumps + oks + flops;
console.log(`Paquetes aero (${(totAeroPkg / seeds.length).toFixed(1)}/temp): salto ${(100 * jumps / totAeroPkg).toFixed(1)}% · ok ${(100 * oks / totAeroPkg).toFixed(1)}% · fallo ${(100 * flops / totAeroPkg).toFixed(1)}% · olas UP oficiales ${(puWaves / seeds.length).toFixed(1)}/temp`);

console.log(`\n=== MODO «CREAR EQUIPO» (ATR + DIRECTOR TÉCNICO · ${seeds.length} temporadas) ===`);
const ferrariTech = market.tecnicos.find((x) => x.equipo === "ferrari")!;
const spec: CustomTeam = {
  nombre: "Auditoria GP",
  color: "#00aaff",
  pilotos: ["BOT", "PER"],
  jefe: market.jefes[0].nombre,
  tecnico: ferrariTech.nombre, // fichamos al director técnico de Ferrari para verificar que frena a Ferrari
  motor: "mercedes",
};
const catDelta = new Map<string, number[]>();
let catR0Ok = true;
for (const s of seeds) {
  const g0 = buildGrid(teams, market, spec, s * 1337, 0, true, undefined, totalRounds);
  const gEnd = buildGrid(teams, market, spec, s * 1337, lastRound, true, undefined, totalRounds);
  if (g0.teams.some((t) => t.id !== PLAYER_TEAM_ID && Math.abs(t.agarre - teams.find((b) => b.id === t.id)!.agarre) > 1e-9)) catR0Ok = false;
  for (const t of gEnd.teams) {
    if (t.id === PLAYER_TEAM_ID) continue;
    const t0 = g0.teams.find((x) => x.id === t.id)!;
    (catDelta.get(t.id) ?? catDelta.set(t.id, []).get(t.id)!).push(t.agarre - t0.agarre);
  }
}
console.log(`Ronda 0 «crear equipo» intacta: ${catR0Ok ? "OK" : "FALLO"} (técnico fichado de Ferrari: ${ferrariTech.nombre})`);
for (const x of rows) {
  const d = mean(catDelta.get(x.t.id)!);
  const note = x.t.id === "ferrari" ? "  ← con técnico interino (fichado)" : "";
  console.log(`  ${x.t.nombre.padEnd(15)} ATR ${String(x.atr).padStart(3)}% | Δagarre neto vs media: ${d >= 0 ? "+" : ""}${d.toFixed(3)} (${(-d * 0.38 >= 0 ? "+" : "")}${(-d * 0.38).toFixed(2)} s)${note}`);
}

console.log(`\n=== REVISIÓN ATR DE MITAD DE AÑO (${seeds.length} temporadas) ===`);
{
  const start = atrCarOrder(teams);
  const mid = atrMidRound(totalRounds);
  // caso extremo: la clasificación a mitad de año, al revés que el orden de partida
  const plan: AtrPlan = mid === null ? { start } : { start, mid: { round: mid, order: [...start].reverse() } };
  console.log(`Revisión tras ${mid ?? "—"} carreras (orden al revés)`);
  for (const id of [start[0], start[1], start[start.length - 2], start[start.length - 1]]) {
    const fixed = mean(seeds.map((x) => rivalDevAt(teams, x * 1337, lastRound, totalRounds).get(id)!.aero));
    const rev = mean(seeds.map((x) => rivalDevAt(teams, x * 1337, lastRound, totalRounds, undefined, plan).get(id)!.aero));
    const t = teams.find((x) => x.id === id)!;
    console.log(`  ${t.nombre.padEnd(15)} ATR ${atrAt(plan, id, 0)}% → ${atrAt(plan, id, lastRound)}% | aero sin revisión +${fixed.toFixed(3)} · con revisión +${rev.toFixed(3)}`);
  }
  const same = seeds.every((x) => { const a = rivalDevAt(teams, x * 1337, lastRound, totalRounds), b = rivalDevAt(teams, x * 1337, lastRound, totalRounds, undefined, { start }); return teams.every((t) => Math.abs(a.get(t.id)!.aero - b.get(t.id)!.aero) < 1e-12); });
  console.log(`Sin revisión = reparto por defecto: ${same ? "OK" : "FALLO"}`);

  console.log("\n=== CUOTA ATR DEL JUGADOR (40 M todo en aerodinámica, piezas medianas) ===");
  for (const id of [start[0], start[Math.floor(start.length / 2)], start[start.length - 1]]) {
    const atrP = atrAt({ start }, id, 0);
    console.log(`  ${teams.find((x) => x.id === id)!.nombre.padEnd(15)} ATR ${atrP}% → ×${atrMult(atrP).toFixed(2)} | 40 M en aero: +${(5 * devExpect("aero", 2, 1, atrMult(atrP))).toFixed(3)} (media rival +${gridMeanAero.toFixed(3)})`);
  }
  const custom = atrCarOrder(teams, [PLAYER_TEAM_ID]);
  console.log(`  Crear equipo (nuevo, ${custom.length} equipos): ATR ${atrAt({ start: custom }, PLAYER_TEAM_ID, 0)}% → ×${atrMult(atrAt({ start: custom }, PLAYER_TEAM_ID, 0)).toFixed(2)}`);

  console.log("\n=== CALENDARIOS CORTOS ===");
  for (const n of [2, 3, 5, 7, 9]) {
    let pk = 0, want = 0;
    const maxR = n - 1, nPkg = maxR >= 12 ? 4 : maxR >= 6 ? 3 : maxR >= 2 ? 2 : 1;
    for (let r = 0; r < n; r++) for (const g of rivalDevAt(teams, 1337, r, n).values()) pk += g.arrivals.filter((x) => x.area === "aero").length;
    want = nPkg * teams.length;
    const end = rivalDevAt(teams, 1337, maxR, n);
    const pu = mean(teams.filter(isWorks).map((t) => end.get(t.id)!.motor));
    console.log(`  ${n} carreras: paquetes aero que llegan ${pk}/${want} ${pk === want ? "OK" : "FALLO"} · UP oficial +${pu.toFixed(3)} · aero medio +${mean(teams.map((t) => end.get(t.id)!.aero)).toFixed(3)}`);
  }
}

console.log("\n=== IMPACTO EN PISTA (Silverstone: Ronda 1 vs Ronda 23, semilla 2026) ===");
const def = JSON.parse(readFileSync("data/circuitos/silverstone.json", "utf8"));
const tr = buildTrack(def);
const paceAt = (tList: TeamDef[]) => {
  const st = newWeekend(1, def, tList, 2026);
  st.days.forEach((d) => (d.scenario = "seco"));
  const wk = new Weekend(st, tr, tList, "-", { setups: false });
  const s = wk.build("RACE");
  const out = new Map<string, number>();
  for (const t of tList) {
    const c = s.cars.find((x) => x.team.id === t.id)!;
    c.fuel = 40; c.followGap = 99; c.aheadId = -1; c.drs = false; c.noise = 0;
    let lap = 0;
    for (const m of tr.ms) lap += s.msTime(c, m, 0).t;
    out.set(t.id, lap);
  }
  return out;
};
const pStart = paceAt(teams);
const pEnd = paceAt(applyGridDev(teams, 2026, lastRound, totalRounds, "__none__"));
const diffs = teams.map((t) => ({ name: t.nombre, atr: atr.get(t.id)!, dt: pEnd.get(t.id)! - pStart.get(t.id)! })).sort((a, b) => a.dt - b.dt);
for (const d of diffs) console.log(`  ${d.name.padEnd(15)} ATR ${String(d.atr).padStart(3)}% | Δvuelta R1→R${totalRounds}: ${d.dt.toFixed(3)} s`);
