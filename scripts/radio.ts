// Radio de los pilotos sin interfaz: corre fines de semana y vuelca lo que dicen (y las radios míticas), para ver
// cuánto hablan y si las frases encajan. npx tsx scripts/radio.ts [circuito] [equipo] [fines de semana]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, SESSION_NAMES, fmt, isRaceKind, Session } from "../src/sim/session";
import { createVoces } from "../src/ui/voces";
const id = process.argv[2] ?? "silverstone";
const team = process.argv[3] ?? "ferrari";
const n = Number(process.argv[4] ?? 1);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
let cur: Session | null = null;
// la voz limita las frases por tiempo real: aquí, el tiempo real es el de la sesión
(globalThis as any).performance = { now: () => (cur?.t ?? 0) * 1000 };
const count: Record<string, number> = {};
for (let w = 0; w < n; w++) {
  const st = newWeekend(def.ronda, def, teams, 100 + w * 13);
  const wk = new Weekend(st, track, teams, team);
  for (let k = wk.nextKind(); k; k = wk.nextKind()) {
    const s = wk.build(k);
    s.autoPlayers = true;
    cur = s;
    const v = createVoces(s);
    let said = 0;
    const show = (text: string, extra = "") => { said++; console.log(`   ${isRaceKind(k) ? "V" + s.leaderLap : fmt(s.t).slice(0, 5)} ${text}${extra}`); };
    s.onEvent = (e) => {
      if (e.voz) { show(e.text, e.mitica ? `   [${e.mitica}]` : ""); return; }
      const r = v.onEvent(e);
      if (r.replace) show(r.replace.text, " (reescrito)");
      for (const l of r.lines) s.log({ kind: "radio", carId: l.carId, text: l.text, important: l.important, voz: true, mitica: l.mitica });
    };
    console.log(`== ${SESSION_NAMES[k]}`);
    while (!s.finished && s.wall < 4 * 3600) { s.step(); for (const l of v.tick()) s.log({ kind: "radio", carId: l.carId, text: l.text, important: l.important, voz: true, mitica: l.mitica }); }
    count[k] = (count[k] ?? 0) + said;
    wk.finish(s);
  }
}
console.log("\nFrases por sesión (media):", Object.entries(count).map(([k, c]) => `${k} ${(c / n).toFixed(1)}`).join(" · "));
