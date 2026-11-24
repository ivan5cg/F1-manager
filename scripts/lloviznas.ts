// Banco del caso «llovizna sobre pista casi seca» tras un fin de semana mojado: corre fines de semana enteros con
// lluvia (los intermedios llegan gastados a la carrera) y mira, en la carrera, qué montan los coches cuando hay
// poca agua: de lluvia con menos de 0,35 mm (se deshacen), intermedios muy gastados o slicks.
//   npx tsx scripts/lloviznas.ts [circuito=silverstone] [fines=6] [semilla=1]
import { readFileSync } from "fs";
import { buildTrack } from "../src/sim/track";
import { Weekend, newWeekend } from "../src/sim/weekend";
import { TeamDef } from "../src/sim/session";
import { setWear, WET } from "../src/sim/tyres";

const id = process.argv[2] ?? "silverstone";
const n = Number(process.argv[3] ?? 6);
const seed0 = Number(process.argv[4] ?? 1);
const def = JSON.parse(readFileSync(`data/circuitos/${id}.json`, "utf8"));
const teams = JSON.parse(readFileSync("data/equipos-2026.json", "utf8")).equipos as TeamDef[];
const track = buildTrack(def);
let wetSlick = 0, wetLaps = 0, wLow = 0, iWorn = 0, stops = 0, wetStops = 0, lowWaterLaps = 0, lowWaterSlick = 0;
for (let r = 0; r < n; r++) {
  const st = newWeekend(def.ronda, def, teams, seed0 + r);
  st.days[0].scenario = "chubascos";
  st.days[1].scenario = "frente";
  st.days[2].scenario = "llovizna";
  const wk = new Weekend(st, track, teams, "-");
  for (let k = wk.nextKind(); k; k = wk.nextKind()) {
    const s = wk.build(k);
    if (k !== "RACE") { while (!s.finished && s.wall < 4 * 3600) s.step(); wk.finish(s); continue; }
    const last = new Map<number, string>();
    const lapSeen = new Map<number, number>();
    const log: string[] = [];
    const lapWater: number[] = []; // agua al pasar el líder por meta, para ver si llegó el chaparrón que se esperaba
    const after = (L: number) => ` → luego ${[1, 3, 5].map((d) => lapWater[L + d]?.toFixed(2) ?? "-").join("/")}`;
    while (!s.finished && s.wall < 4 * 3600) {
      s.step();
      const w = s.avgWater();
      const lead = Math.max(...s.cars.map((c) => s.lapsDone(c)));
      if (lapWater[lead] === undefined) lapWater[lead] = w;
      for (const c of s.cars) {
        if (!c.tyres || c.loc === "out") continue;
        const L = s.lapsDone(c);
        if (lapSeen.get(c.id) !== L) {
          lapSeen.set(c.id, L);
          if (w > 0.35 && c.loc === "track") { wetLaps++; if (["S", "M", "H"].includes(c.tyres.c)) wetSlick++; }
          if (w > 0.08 && w < WET.si * 1.4 && c.loc === "track") { lowWaterLaps++; if (["S", "M", "H"].includes(c.tyres.c)) lowWaterSlick++; }
        }
        const prev = last.get(c.id);
        if (prev !== undefined && prev !== c.tyres.id) {
          stops++;
          const wr = setWear(c.tyres);
          if (c.tyres.c === "W" || c.tyres.c === "I") wetStops++;
          if (c.tyres.c === "W" && w < 0.35) { wLow++; log.push(`V${L} ${c.d.abrev} ${prev}→${c.tyres.id}(${(wr * 100).toFixed(0)}%) agua ${w.toFixed(2)} lluvia ${s.rainOnTrack().toFixed(1)} ${c.pitWhy ?? ""}`); }
          if (c.tyres.c === "I" && wr > 0.45 && w < 0.3) { iWorn++; log.push(`V${L} ${c.d.abrev} ${prev}→${c.tyres.id}(${(wr * 100).toFixed(0)}%) agua ${w.toFixed(2)} lluvia ${s.rainOnTrack().toFixed(1)} ${c.pitWhy ?? ""}`); }
        }
        last.set(c.id, c.tyres.id);
      }
    }
    const res = s.results();
    console.log(`semilla ${seed0 + r}: podio ${res.slice(0, 3).map((x) => s.carById(x.id).d.abrev + "[" + [...s.carById(x.id).usedCompounds].join("") + "]").join(" ")}`);
    for (const l of log.slice(0, 8)) console.log("   " + l.replace(/^V(\d+)(.*)$/, (_, L, r) => `V${L}${r}${after(Number(L))}`));
    wk.finish(s);
  }
}
console.log(`\nparadas ${stops} (a agua ${wetStops}); de lluvia con <0,35 mm: ${wLow}; intermedios >45 % con <0,3 mm: ${iWorn}; vueltas con poca agua en slicks: ${lowWaterSlick}/${lowWaterLaps}; con >0,35 mm en slicks: ${wetSlick}/${wetLaps}`);
