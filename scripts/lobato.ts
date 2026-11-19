// Lobato y las respuestas a las órdenes sin interfaz: corre un fin de semana, vuelca lo que comenta Lobato (con el
// código del suceso que lo provoca) y, en carrera, da órdenes al azar a tus pilotos para ver cómo contestan.
// Al final, los mensajes de dirección de carrera, meteo, incidentes y boxes que siguen sin código.
// npx tsx scripts/lobato.ts [circuito] [equipo] [semilla]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef, SESSION_NAMES, fmt, isRaceKind, Session } from "../src/sim/session";
import { createLobato } from "../src/ui/lobato";
import { createVoces, Orden } from "../src/ui/voces";
const id = process.argv[2] ?? "silverstone";
const team = process.argv[3] ?? "ferrari";
const seed = Number(process.argv[4] ?? 100);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
let cur: Session | null = null;
// Lobato y la radio limitan lo que dicen por tiempo real: aquí, el tiempo real es el de la sesión
(globalThis as any).performance = { now: () => (cur?.t ?? 0) * 1000 };
const porCodigo: Record<string, number> = {};
const sinCodigo = new Set<string>();
const ORDENES: Orden[] = ["box", "anula", "apretar", "ahorrar", "dejarPasar", "defender", "noPelear"];
const st = newWeekend(def.ronda, def, teams, seed);
const wk = new Weekend(st, track, teams, team);
for (let k = wk.nextKind(); k; k = wk.nextKind()) {
  const s = wk.build(k);
  s.autoPlayers = true;
  cur = s;
  const lob = createLobato(s, def.nombre ?? id);
  const v = createVoces(s);
  const at = () => (isRaceKind(k) ? "V" + (s.leaderLap + 1) : fmt(s.t).slice(0, 5));
  s.onEvent = (e) => {
    if (e.voz) return;
    if (!e.code && e.kind !== "radio" && e.kind !== "info") sinCodigo.add(e.text.replace(/\d+([.,]\d+)?/g, "#").slice(0, 70));
    const c = lob.onEvent(e);
    if (c) { porCodigo[e.code!] = (porCodigo[e.code!] ?? 0) + 1; console.log(`   ${at()} [${e.code}] ${c.text}`); }
  };
  console.log(`== ${SESSION_NAMES[k]}`);
  let nextOrder = 600;
  while (!s.finished && s.wall < 4 * 3600) {
    s.step();
    const c = lob.tick();
    if (c) console.log(`   ${at()} [tick] ${c.text}`);
    if (isRaceKind(k) && s.t > nextOrder) {
      nextOrder += 300;
      const mine = s.cars.filter((x) => x.player && x.loc === "track");
      if (mine.length) {
        const car = mine[Math.floor(Math.random() * mine.length)], o = ORDENES[Math.floor(Math.random() * ORDENES.length)];
        const l = v.responde(car, o);
        if (l) console.log(`   ${at()} → ${o.padEnd(10)} ${l.text}${l.important ? "  (a disgusto)" : ""}`);
      }
    }
  }
  wk.finish(s);
}
console.log("\nComentarios por código:", Object.entries(porCodigo).map(([k, n]) => `${k} ${n}`).join(" · "));
console.log("Sin código:", sinCodigo.size ? [...sinCodigo].join("\n  ") : "ninguno");
