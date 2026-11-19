// Moral, desobediencia y rivalidades sin interfaz (8.2 y 8.3):
//  1) cuántas veces se niega cada carácter a una orden según su moral (muchas órdenes, el mismo azar que la sesión);
//  2) cuánto cambia el ritmo: la vuelta posible de tus pilotos con distinta moral;
//  3) cuántas rivalidades nacen en una temporada de carreras.
// npx tsx scripts/moral.ts [circuito] [carreras] [equipo]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import type { TeamDef, Session } from "../src/sim/session";
import type { SeasonState } from "../src/sim/season";
import { rivalsAfterRace } from "../src/sim/morale";
import type { Caracter } from "../src/sim/caracter";

const id = process.argv[2] ?? "silverstone";
const n = Number(process.argv[3] ?? 6);
const team = process.argv[4] ?? "ferrari";
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const track = buildTrack(def);

function race(seed: number, moral?: number): Session {
  const st = newWeekend(1, def, teams, seed);
  if (moral !== undefined) st.moral = Object.fromEntries(teams.flatMap((t, ti) => t.pilotos.map((_, k) => [ti * 2 + k, moral])).filter(([cid]) => teams[Math.floor((cid as number) / 2)].id === team));
  const wk = new Weekend(st, track, teams, team);
  const s = wk.build("RACE");
  s.autoPlayers = true;
  while (!s.finished && s.wall < 4 * 3600) s.step();
  return s;
}

// 1) desobediencia: probabilidad por orden
console.log("1) Se niega a la orden (de cada 1000), según moral y carácter");
const chars: [Caracter, string][] = [["volcanico", "Charles Leclerc"], ["quejica", "Max Verstappen"], ["socarron", "Fernando Alonso"], ["cerebral", "George Russell"], ["novato", "Kimi Antonelli"], ["calmado", "Lewis Hamilton"]];
const st0 = newWeekend(1, def, teams, 1);
const s0 = new Weekend(st0, track, teams, team).build("RACE");
const car = s0.cars[0];
console.log("   moral  " + chars.map(([c]) => c.padStart(10)).join(""));
for (const m of [60, 44, 35, 25, 10]) {
  const row = chars.map(([, nombre]) => {
    car.d = { ...car.d, nombre }; car.moral = m;
    let no = 0;
    for (let i = 0; i < 1000; i++) if ((s0 as any).disobeys(car)) no++;
    return String(no).padStart(10);
  });
  console.log(`   ${String(m).padStart(5)}  ${row.join("")}`);
}

// 2) ritmo: la vuelta que puede dar ahora (estLap) con distinta moral, a mitad de carrera (sin azar de por medio)
console.log(`\n2) Vuelta posible de tus pilotos en ${id} según la moral (frente a 60)`);
{
  const sess = race(500);
  for (const c of sess.cars.filter((x) => x.team.id === team)) {
    if (!c.tyres) continue;
    const at = (m: number) => { c.moral = m; return sess.estLap(c); };
    const b0 = at(60);
    console.log(`   ${c.d.nombre.padEnd(18)} ` + [100, 80, 40, 10].map((m) => `moral ${m}: ${(at(m) - b0 >= 0 ? "+" : "")}${(at(m) - b0).toFixed(3)} s`).join(" · "));
  }
}

// 3) rivalidades en una temporada
console.log(`\n3) Rivalidades en ${n} carreras seguidas`);
const s = { rivals: [] } as unknown as SeasonState;
for (let r = 0; r < n; r++) {
  const sess = race(900 + r * 7);
  const born = rivalsAfterRace(s, Object.entries(sess.duels).map(([k, v]) => { const [a, b] = k.split("-").map(Number); return { a: sess.carById(a).d.nombre, b: sess.carById(b).d.nombre, ...v }; }));
  console.log(`   carrera ${r + 1}: ${Object.values(sess.duels).reduce((a, d) => a + d.touch, 0)} toques · nacen ${born.length}${born.length ? ` (${born.map((b) => `${b.a.split(" ").pop()}–${b.b.split(" ").pop()}`).join(", ")})` : ""} · vivas ${s.rivals!.length}`);
}
console.log("   al final: " + s.rivals!.map((r) => `${r.a.split(" ").pop()}–${r.b.split(" ").pop()} ${r.k}`).join(" · "));
