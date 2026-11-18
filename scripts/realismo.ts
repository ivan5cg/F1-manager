// Banco de realismo: corre carreras en varios circuitos y compara lo que sale con márgenes de referencia (coches de
// seguridad, abandonos, paradas, quién gana, diferencias, adelantamientos, toques y sanciones). Sirve para ver el antes
// y el después de cualquier cambio que mueva los resultados.
//   npx tsx scripts/realismo.ts [circuito ...] [--carreras=6] [--semilla=1] [--clima] [--rapido] [--json=archivo]
// --clima: con el tiempo que toque a cada semilla (por defecto, todo en seco).
// --rapido: parrilla por ritmo con algo de azar en vez de correr la clasificación (un 30 % más rápido, pero la pole
// no es la de verdad y «gana el de la pole» sale bajo).
// --json: guarda las cifras para comparar luego con --antes=archivo (enseña la diferencia de cada fila).
// Los márgenes son aproximados, de las temporadas 2022–2025 a ojo: no son datos medidos, son para ver si algo se va.
import { execFile } from "child_process";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { benchRace, circuit } from "./banco";

interface Race {
  sc: number; vsc: number; red: number; retire: number; contacts: number; offs: number; pens: number;
  passes: number; lap1: number; stops: number[]; poleWin: boolean; winGrid: number; margin: number; gap10: number;
  lapped: number; wet: boolean;
}

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

if (args[0] === "--hijo") {
  // una tanda de carreras en un circuito: escribe las cifras en JSON
  const [, id, n, seed0, clima, fast] = args;
  const out: Race[] = [];
  for (let r = 0; r < Number(n); r++) {
    const s = benchRace(id, Number(seed0) + r, clima !== "1", fast !== "1");
    let wet = false;
    while (!s.finished && s.wall < 4 * 3600) { s.step(); if (s.avgWater() > 0.2) wet = true; }
    const res = s.results();
    const fin = res.filter((x) => x.status === "fin");
    const lead = fin[0];
    const sameLap = fin.filter((x) => x.laps === lead?.laps);
    out.push({
      ...s.stats, passes: s.passCount - s.passLap1, lap1: s.passLap1,
      stops: fin.map((x) => x.stops), poleWin: lead?.grid === 1, winGrid: lead?.grid ?? 0,
      margin: sameLap[1] ? sameLap[1].time - lead.time : NaN,
      gap10: sameLap[9] ? sameLap[9].time - lead.time : NaN,
      lapped: fin.length - sameLap.length, wet,
      retire: res.filter((x) => x.status === "out").length,
    });
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

const nRaces = Number(opt("carreras") ?? 6);
const seed0 = Number(opt("semilla") ?? 1);
const clima = args.includes("--clima");
const fast = args.includes("--rapido");
let ids = args.filter((a) => !a.startsWith("--"));
if (!ids.length) ids = readdirSync("data/circuitos").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));

function child(id: string): Promise<Race[]> {
  return new Promise((ok, ko) => {
    execFile("npx", ["tsx", "scripts/realismo.ts", "--hijo", id, String(nRaces), String(seed0), clima ? "1" : "0", fast ? "1" : "0"], { maxBuffer: 1 << 24 }, (err, stdout) => {
      if (err) return ko(err);
      ok(JSON.parse(stdout.trim().split("\n").pop()!));
    });
  });
}

const mean = (xs: number[]) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const pct = (xs: boolean[]) => (100 * xs.filter(Boolean).length) / Math.max(1, xs.length);

/** Lo que se mira, con su margen de referencia [mín, máx] (null: solo se enseña). */
const METRICS: { k: string; name: string; ref: [number, number] | null; f: (r: Race[], id?: string) => number; dec?: number }[] = [
  { k: "scp", name: "% carreras con coche de seguridad", ref: [35, 65], f: (r) => pct(r.map((x) => x.sc > 0)) },
  { k: "vscp", name: "% carreras con virtual", ref: [20, 50], f: (r) => pct(r.map((x) => x.vsc > 0)) },
  { k: "neut", name: "% carreras neutralizadas (SC o VSC)", ref: [50, 80], f: (r) => pct(r.map((x) => x.sc + x.vsc > 0)) },
  { k: "red", name: "% carreras con bandera roja", ref: [2, 12], f: (r) => pct(r.map((x) => x.red > 0)) },
  { k: "ret", name: "abandonos por carrera", ref: [2.8, 4.5], f: (r) => mean(r.map((x) => x.retire)), dec: 1 },
  { k: "cont", name: "toques por carrera", ref: [0.5, 3], f: (r) => mean(r.map((x) => x.contacts)), dec: 1 },
  { k: "offs", name: "salidas y trompos por carrera", ref: null, f: (r) => mean(r.map((x) => x.offs)), dec: 1 },
  { k: "pens", name: "sanciones por carrera", ref: [0.8, 4], f: (r) => mean(r.map((x) => x.pens)), dec: 1 },
  { k: "pole", name: "% gana el de la pole", ref: [35, 60], f: (r) => pct(r.map((x) => x.poleWin)) },
  { k: "far", name: "% gana alguien que salió de P4 o más atrás", ref: [5, 25], f: (r) => pct(r.map((x) => x.winGrid > 3)) },
  { k: "marg", name: "margen del ganador (s)", ref: [2, 12], f: (r) => mean(r.map((x) => x.margin)), dec: 1 },
  { k: "gap10", name: "del 1.º al 10.º (s)", ref: [30, 95], f: (r) => mean(r.map((x) => x.gap10)), dec: 0 },
  { k: "lapd", name: "doblados por carrera", ref: null, f: (r) => mean(r.map((x) => x.lapped)), dec: 1 },
  { k: "stops", name: "paradas medias", ref: [1, 2.3], f: (r) => mean(r.flatMap((x) => x.stops)), dec: 2 },
  {
    k: "pass", name: "adelantamientos / objetivo del circuito", ref: [0.65, 1.35], dec: 2,
    f: (r, id) => mean(r.map((x) => x.passes)) / ((circuit(id!).def.adelantamientos?.objetivo ?? 35) * 2.4),
  },
  { k: "cv", name: "dispersión de los adelantamientos (desv./media)", ref: [0, 0.35], f: (r) => sd(r.map((x) => x.passes)) / mean(r.map((x) => x.passes)), dec: 2 },
];
const fmtv = (v: number, dec = 0) => (Number.isFinite(v) ? v.toFixed(dec) : "–");

(async () => {
  const t0 = Date.now();
  const by: Record<string, Race[]> = {};
  const queue = [...ids];
  await Promise.all(Array.from({ length: 4 }, async () => { for (let id = queue.shift(); id; id = queue.shift()) by[id] = await child(id); }));
  const all = ids.flatMap((id) => by[id]);
  const before = opt("antes") ? JSON.parse(readFileSync(opt("antes")!, "utf8")) as Record<string, number> : null;
  const now: Record<string, number> = {};

  console.log(`\n${ids.length} circuitos × ${nRaces} carreras${clima ? " (con su tiempo)" : " en seco"} en ${((Date.now() - t0) / 1000).toFixed(0)} s` + (clima ? ` · mojadas: ${all.filter((x) => x.wet).length}` : ""));
  console.log("\nPor circuito: SC% VSC% roja% abandonos toques pole% margen 1.º–10.º paradas adelant./obj. disp.");
  for (const id of ids) {
    const r = by[id];
    const g = (k: string) => { const m = METRICS.find((x) => x.k === k)!; return fmtv(m.f(r, id), m.dec); };
    console.log(`  ${id.padEnd(13)} ${g("scp").padStart(4)} ${g("vscp").padStart(4)} ${g("red").padStart(4)} ${g("ret").padStart(5)} ${g("cont").padStart(5)} ${g("pole").padStart(4)} ${g("marg").padStart(6)} ${g("gap10").padStart(5)} ${g("stops").padStart(5)} ${g("pass").padStart(6)} ${g("cv").padStart(5)}`);
  }
  console.log("\nTotal (margen de referencia):");
  let bad = 0;
  for (const m of METRICS) {
    // los adelantamientos se miden contra el objetivo de cada circuito: media de las razones
    const v = m.k === "pass" ? mean(ids.map((id) => m.f(by[id], id))) : m.k === "cv" ? mean(ids.map((id) => m.f(by[id], id))) : m.f(all);
    now[m.k] = v;
    const ok = !m.ref || (v >= m.ref[0] && v <= m.ref[1]);
    if (!ok) bad++;
    const diff = before && Number.isFinite(before[m.k]) ? `  (antes ${fmtv(before[m.k], m.dec)})` : "";
    console.log(`  ${m.ref ? (ok ? "✔" : "✘") : " "} ${m.name.padEnd(48)} ${fmtv(v, m.dec).padStart(6)}${m.ref ? `   [${m.ref[0]}–${m.ref[1]}]` : ""}${diff}`);
  }
  console.log(`\n${bad ? `${bad} fuera de margen` : "Todo dentro de margen"}.`);
  if (opt("json")) writeFileSync(opt("json")!, JSON.stringify(now, null, 1));
})();
