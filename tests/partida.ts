// Partida sin interfaz: un jugador automático que lleva una partida de varias temporadas igual que la interfaz
// (src/ui/main.ts y src/ui/hubs.ts): presupuesto de desarrollo, objetivos, túnel de viento, test de pretemporada,
// fines de semana enteros (libres, clasificación, sprint y carrera, simulados hasta el final como el botón
// «Simular»), unidades de potencia, sanciones, moral, directiva, cambios a mitad de temporada, mercado e invierno.
//
// Dos maneras de correr las carreras:
//  - "real": cada sesión con la simulación del juego (unos 30 s por fin de semana).
//  - "rapida": la carrera sale del ritmo del coche y del piloto con azar (como scripts/temporadas.ts), para probar
//    en segundos lo que pasa entre carreras y entre temporadas con muchas semillas.
//
// Va comprobando lo que no debería pasar nunca (pilotos repetidos, puntos que no cuadran, valores sin sentido...) y lo
// apunta en `problems`; el resto se guarda en `seasons` para el informe (scripts/partidas.ts).
import { TEAMS, DRIVERS, CIRCUITS, MARKET, BASE_TEAMS, CALENDARS, getTrack, useSeason, gridOf, devContext, devBonuses, ensureAeroPkgs, myAtr, circuitOf, calendarOf, myTeamId } from "../src/ui/data";
import { buildNextSeason, applyMidSeason, yearOf, seasonRecord, firedNow, firingOffers } from "../src/ui/nextSeason";
import { settlePkg } from "../src/ui/tunel";
import { syncMood } from "../src/ui/vestuario";
import { buildSummary } from "../src/ui/summary";
import { boardMessage } from "../src/ui/prensa";
import { seatAt, gpOf } from "../src/ui/ritual";
import { Weekend, newWeekend, newPreseasonWeekend, preparePu } from "../src/sim/weekend";
import { isRaceKind, type ResultRow, type SessionKind, type TeamDef, type DriverDef } from "../src/sim/session";
import { driverStandings, teamStandings, pointsFor, RACE_POINTS, SPRINT_POINTS, type SeasonState } from "../src/sim/season";
import { newDev, newAeroPlan, devLeft, orderPart, atrMult, carLevel, type DevArea, type DevSize } from "../src/sim/development";
import { objectivesFor, objectiveStatus } from "../src/sim/objectives";
import { moraleAfterRace, rivalsAfterRace, expectedPos, wantsRenew, moralOf } from "../src/sim/morale";
import { hitosAfterRace } from "../src/sim/hitos";
import { quotaFor } from "../src/sim/powerunit";
import { rating, ageOf, initialContracts } from "../src/sim/career";
import { costOf, PLAYER_TEAM_ID, priceOf, type CustomTeam } from "../src/sim/market";
import { Rng } from "../src/sim/rng";

export type RaceMode = "real" | "rapida";

export interface CareerOptions {
  /** Equipo real (id) o "propio" para «crea tu equipo». */
  team: string;
  seed: number;
  seasons: number;
  mode: RaceMode;
  /** «Crea tu equipo»: lo fichado (si no, uno al azar con la semilla que quepa en el techo de gasto). */
  spec?: CustomTeam;
  /** Simular el test de pretemporada de 8 h (si no, se salta, como el botón «Saltar al GP 1»). */
  preseason?: boolean;
  /** Pedir piezas de motor y fiabilidad con el presupuesto (si no, el jugador no toca el desarrollo). */
  develop?: boolean;
  calendar?: "corta" | "completa";
  /** Solo las primeras carreras del calendario (para pruebas cortas). */
  rounds?: number;
  /** Lo que se va contando (una línea por carrera). */
  log?: (line: string) => void;
}

export interface RaceLog {
  round: number;
  circuitId: string;
  sprint: boolean;
  winner: string;
  winnerTeam: string;
  pole?: string;
  mine: { nombre: string; grid?: number; pos: number; status: string; reason?: string; points: number }[];
  dnfs: number;
  dnfReasons: Record<string, number>;
  dsq: number;
  finished: number;
  shortened: boolean;
  wet: boolean;
  passes?: number;
  safety?: number;
  vsc?: number;
  red?: boolean;
  gridPens: number;
  swaps: string[];
  board?: string;
  secs: number;
}

export interface SeasonLog {
  year: number;
  playerTeam: string;
  teamName: string;
  calendar: string[];
  sprints: string[];
  budget: number;
  devBonus: number;
  devLeftStart: number;
  devLeftEnd: number;
  parts: { area: string; size: number; ordered: number; ready: number; expect: number; real: number }[];
  aeroPkgs: { period: number; ready: number; expect: number; real: number; medido?: number; montar?: boolean }[];
  objectives: { text: string; done: boolean }[];
  aviso: number;
  carRank0: number;
  carRankEnd: number;
  levels0: Record<string, number>;
  levelsEnd: Record<string, number>;
  spread0: number;
  spreadEnd: number;
  preseason?: { laps: number; fiabBonus: number; secs: number };
  races: RaceLog[];
  champion: { nombre: string; equipo: string; puntos: number };
  constructors: { equipo: string; puntos: number }[];
  myPos: number;
  myPoints: number;
  myDrivers: { nombre: string; abrev: string; pos: number; puntos: number; edad: number; rating: number; moral: number }[];
  wins: Record<string, number>;
  winnersDistinct: number;
  teamsWinning: number;
  poleToWin: number;
  dnfRate: number;
  swaps: string[];
  pu?: Record<string, { units: number; broken: number; penalties: number }>;
  hitos: number;
  rivals: number;
  news: string[];
  grid: { equipo: string; pilotos: string[] }[];
  ages: { mean: number; min: number; max: number };
  ratings: { mean: number; min: number; max: number };
  poolSize: number;
  custom?: { spentCap: number; leftCap: number; carry?: number; jefe: string; tecnico: string; motor: string };
  fired?: boolean;
  offer?: string;
}

export interface CareerResult {
  opts: Omit<CareerOptions, "log">;
  seasons: SeasonLog[];
  problems: string[];
  /** Temporada en la que acabó la partida por despido (la directiva o los inversores). */
  endedFired?: number;
  secs: number;
}

const STEP_LIMIT: Partial<Record<SessionKind, number>> = { TEST: 10 * 3600 };
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const stats = (a: number[]) => ({ mean: r1(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)), min: r1(Math.min(...a)), max: r1(Math.max(...a)) });

/** Un equipo propio al azar que cabe en el techo de gasto (dos pilotos, jefe, técnico y motor). */
export function randomSpec(seed: number): CustomTeam {
  const rng = new Rng(seed * 7919 + 17);
  for (let k = 0; k < 2000; k++) {
    const ps = [...MARKET.pilotos].sort(() => rng.next() - 0.5);
    const spec: CustomTeam = {
      nombre: `Propio ${seed}`, color: "#ff8800", pilotos: [ps[0].abrev, ps[1].abrev],
      jefe: MARKET.jefes[rng.int(0, MARKET.jefes.length - 1)].nombre,
      tecnico: MARKET.tecnicos[rng.int(0, MARKET.tecnicos.length - 1)].nombre,
      motor: MARKET.motores[rng.int(0, MARKET.motores.length - 1)].id,
    };
    const c = costOf(MARKET, spec);
    // como haría un jugador: gastar al menos la mitad del techo, sin pasarse
    if (c <= MARKET.techo && c >= MARKET.techo * 0.5) return spec;
  }
  throw new Error("no sale ningún equipo que quepa en el techo");
}

/** Lleva una sesión hasta el final (como «Simular»: en carrera, la IA decide también por tus pilotos). */
function runSession(wk: Weekend, kind: SessionKind) {
  const sess = wk.build(kind);
  if (isRaceKind(kind)) sess.autoPlayers = true;
  const lim = STEP_LIMIT[kind] ?? 5 * 3600;
  while (!sess.finished && sess.wall < lim) sess.step();
  return sess;
}

export function runCareer(o: CareerOptions): CareerResult {
  const t00 = Date.now();
  const problems: string[] = [];
  const log = o.log ?? (() => {});
  const cal = CALENDARS[o.calendar ?? "corta"];
  const custom = o.team === PLAYER_TEAM_ID;
  let s: SeasonState = { v: 1, playerTeam: o.team, seed: o.seed, round: 0, weekend: null, rounds: [], calendar: cal.ids.slice(0, o.rounds ?? cal.ids.length), ...(Object.keys(cal.formatos).length ? { formatos: { ...cal.formatos } } : {}) };
  if (custom) s.equipo = o.spec ?? randomSpec(o.seed);
  const opts = { ...o, spec: s.equipo };
  delete (opts as { log?: unknown }).log;
  const seasons: SeasonLog[] = [];
  let endedFired: number | undefined;
  const fail = (where: string, what: string) => problems.push(`${where}: ${what}`);

  for (let k = 0; k < o.seasons; k++) {
    const Y = yearOf(s);
    // ---- temporada nueva (main.ts: newSeason)
    s.dev = newDev(devContext(s).left);
    if (s.devBonus) s.dev.budget = Math.max(15, s.dev.budget + s.devBonus);
    s.dev.aero = newAeroPlan(s.dev.budget);
    useSeason(s);
    // ---- pantalla de temporada (hubs.ts: seasonScreen)
    if (!s.objetivos) s.objetivos = objectivesFor(gridOf(s, 0).teams, s.playerTeam, calendarOf(s).length);
    if (ensureAeroPkgs(s)) useSeason(s);
    const calIds = calendarOf(s);
    checkSeasonStart(s, Y, custom, fail);
    const lv0 = levels(TEAMS);
    const myId = myTeamId(s);
    const rank = (lv: Record<string, number>) => Object.entries(lv).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === myId) + 1;
    const sl: Partial<SeasonLog> = {
      year: Y, playerTeam: s.playerTeam, teamName: TEAMS.find((t) => t.id === s.playerTeam)?.nombre ?? "?", calendar: calIds,
      sprints: calIds.filter((id) => circuitOf(s, id).formato === "sprint"),
      budget: s.dev.budget, devBonus: s.devBonus ?? 0, devLeftStart: devLeft(s.dev), levels0: lv0, carRank0: rank(lv0), spread0: spread(lv0),
      races: [], aviso: s.aviso ?? 0, news: s.news ?? [],
    };
    if (custom) {
      const ctx = devContext(s);
      sl.custom = { spentCap: r1(MARKET.techo - (ctx.left ?? 0)), leftCap: r1(ctx.left ?? 0), carry: s.carry, jefe: s.equipo!.jefe, tecnico: s.equipo!.tecnico, motor: s.equipo!.motor };
    }

    // ---- test de pretemporada (8 h en Barcelona) o saltarlo
    if (o.mode === "real" && o.preseason) {
      const t0 = Date.now();
      s.weekend = newPreseasonWeekend(CIRCUITS.barcelona, TEAMS, s.seed * 1000 + 7, Y);
      const wk = new Weekend(s.weekend, getTrack("barcelona"), TEAMS, s.playerTeam);
      const kind = wk.nextKind();
      if (kind !== "TEST") fail(`${Y} test`, `la sesión del test es ${kind}`);
      const sess = runSession(wk, "TEST");
      wk.finish(sess);
      const rows0 = sess.results();
      const myLaps = rows0.filter((r) => DRIVERS[r.id]?.team.id === s.playerTeam).reduce((a, r) => a + r.laps, 0);
      const fiabBonus = Math.min(0.05, Math.round((myLaps / 160) * 0.05 * 1000) / 1000);
      s.preseason = { done: true, results: rows0, longRuns: sess.longRuns, myLaps, fiabBonus };
      s.weekend = null;
      useSeason(s);
      sl.preseason = { laps: myLaps, fiabBonus, secs: (Date.now() - t0) / 1000 };
      if (!sess.finished) fail(`${Y} test`, "el test no termina");
      if (myLaps <= 0) fail(`${Y} test`, "tus pilotos no dan ninguna vuelta en el test");
      log(`${Y} test: ${myLaps} vueltas, fiabilidad −${(fiabBonus * 100).toFixed(1)} %`);
    } else s.preseason = { done: true, skipped: true };

    // ---- las carreras
    for (let r = 0; r < calIds.length; r++) {
      const t0 = Date.now();
      if (s.round !== r) fail(`${Y} R${r + 1}`, `la ronda en curso es ${s.round}`);
      if (ensureAeroPkgs(s)) useSeason(s);
      if (o.develop !== false) develop(s);
      const where = `${Y} R${r + 1} ${calIds[r]}`;
      const swapsBefore = s.swaps?.length ?? 0;
      const pensIn = s.gridPens?.length ?? 0;
      let race: ResultRow[], sprint: ResultRow[] | undefined, q: ResultRow[] | undefined;
      let extra: Partial<RaceLog> = {};
      if (o.mode === "real") {
        const out = realWeekend(s, r, calIds, where, fail);
        race = out.race; sprint = out.sprint; q = out.q; extra = out.extra;
      } else {
        race = fastRace(s, r, new Rng(s.seed * 1013 + r * 71 + 5));
        s.rounds.push({ round: r + 1, circuitId: calIds[r], race });
        s.round++;
        s.weekend = null;
        const mid = applyMidSeason(s);
        extra.swaps = mid;
        const myCars = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => ({ id: d.id, nombre: d.d.nombre }));
        const hs = hitosAfterRace(s, seatAt(s), gpOf);
        if (hs.length) s.hitos = [...(s.hitos ?? []), ...hs].slice(-200);
        moraleAfterRace(s, race, myCars, [], expectedPos(s.objetivos));
        rivalsAfterRace(s, []);
        const myIds = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => d.id);
        const msg = boardMessage(s, TEAMS, myIds, calendarOf(s).length);
        if (msg) { s.rounds[s.rounds.length - 1].board = msg; extra.board = msg; }
        s.boardMood = 0;
        useSeason(s);
      }
      checkRound(s, r, race, sprint, where, fail);
      const ri = s.rounds[s.rounds.length - 1];
      const table = ri.raceTable ?? RACE_POINTS;
      const pts = pointsFor(race, table), spts = pointsFor(sprint, ri.sprintTable ?? SPRINT_POINTS);
      const at = seatAt(s);
      const win = race.find((x) => x.status === "fin");
      const winner = win ? at(r, win.id) : { nombre: "-", equipo: "-" };
      const reasons: Record<string, number> = {};
      for (const x of race) if (x.status === "out") { const k2 = (x.reason ?? "?").replace(/ \(.*\)$/, "").replace(/^avería.*/, "avería"); reasons[k2] = (reasons[k2] ?? 0) + 1; }
      const mine = race.map((x, i) => ({ x, i })).filter(({ x }) => at(r, x.id).mine).map(({ x, i }) => ({
        nombre: at(r, x.id).nombre, grid: x.grid, pos: i + 1, status: x.status, reason: x.reason, points: (pts.get(x.id) ?? 0) + (spts.get(x.id) ?? 0),
      }));
      const rl: RaceLog = {
        round: r + 1, circuitId: calIds[r], sprint: !!sprint, winner: winner.nombre, winnerTeam: winner.equipo,
        pole: q?.[0] ? at(r, q[0].id).nombre : undefined, mine,
        dnfs: race.filter((x) => x.status === "out").length, dnfReasons: reasons, dsq: race.filter((x) => x.status === "dsq").length,
        finished: race.filter((x) => x.status === "fin").length, shortened: !!ri.raceTable, wet: false, gridPens: pensIn,
        swaps: (s.swaps ?? []).slice(swapsBefore).map((x) => `${x.out.abrev}→${x.in.abrev} (${x.why})`), secs: (Date.now() - t0) / 1000, ...extra,
      } as RaceLog;
      sl.races!.push(rl);
      log(`${where}: gana ${rl.winner} (${rl.winnerTeam}); tuyos ${mine.map((m) => `${m.nombre.split(" ").pop()} P${m.pos}${m.status !== "fin" ? ` ${m.status}` : ""}`).join(", ")} · ${rl.dnfs} abandonos · ${rl.secs.toFixed(0)} s`);
    }

    // ---- fin de temporada
    useSeason(s);
    if (s.round !== calIds.length) fail(`${Y} fin`, `la temporada acaba en la ronda ${s.round} de ${calIds.length}`);
    const lvE = levels(gridOf(s, calIds.length).teams);
    const ds = driverStandings(s, DRIVERS.length);
    const ts = teamStandings(s, TEAMS);
    checkStandings(s, ds, ts, `${Y} fin`, fail);
    const rec = seasonRecord(s);
    const tp = ts.findIndex((x) => x.team.id === s.playerTeam);
    const wins: Record<string, number> = {};
    for (const rl of sl.races!) wins[rl.winner] = (wins[rl.winner] ?? 0) + 1;
    const teamsWin = new Set(sl.races!.map((x) => x.winnerTeam));
    const totalCars = sl.races!.reduce((a, x) => a + x.finished + x.dnfs + x.dsq, 0);
    const myDrivers = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => {
      const i = ds.findIndex((x) => x.id === d.id);
      return { nombre: d.d.nombre, abrev: d.d.abrev, pos: i + 1, puntos: ds[i]?.points ?? 0, edad: ageOf(d.d, Y), rating: r1(rating(d.d)), moral: r1(moralOf(s, d.d.nombre)) };
    });
    // objetivos: la pantalla y el registro deben coincidir
    const mineIds = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => d.id);
    for (const ob of s.objetivos ?? []) {
      const st = objectiveStatus(ob, s, TEAMS, mineIds, calIds.length);
      if (st.state !== "done" && st.state !== "failed") fail(`${Y} fin`, `objetivo «${st.text}» sigue ${st.state} al acabar`);
    }
    const puLog: SeasonLog["pu"] = {};
    if (custom && s.pu) for (const d of DRIVERS.filter((x) => x.team.id === PLAYER_TEAM_ID)) {
      const p = s.pu[d.id];
      if (p) puLog[d.d.abrev] = { units: p.units.length, broken: p.units.filter((u) => u.broken).length, penalties: Math.max(0, p.units.length - (p.quota ?? 2)) };
    }
    Object.assign(sl, {
      devLeftEnd: devLeft(s.dev), levelsEnd: lvE, carRankEnd: rank(lvE), spreadEnd: spread(lvE),
      parts: s.dev.parts.map((p) => ({ area: p.area, size: p.size, ordered: p.ordered, ready: p.ready, expect: r3(p.expect), real: r3(p.real) })),
      aeroPkgs: (s.dev.aero?.pkgs ?? []).map((p) => ({ period: p.period, ready: p.ready, expect: r3(p.expect), real: r3(p.real), medido: p.medido === undefined ? undefined : r3(p.medido), montar: p.montar })),
      objectives: rec.objetivos, champion: rec.champion, constructors: ts.map((x) => ({ equipo: x.team.nombre, puntos: x.points })),
      myPos: tp + 1, myPoints: ts[tp].points, myDrivers, wins, winnersDistinct: Object.keys(wins).length, teamsWinning: teamsWin.size,
      poleToWin: sl.races!.filter((x) => x.pole && x.pole === x.winner).length,
      dnfRate: r3(sl.races!.reduce((a, x) => a + x.dnfs, 0) / Math.max(1, totalCars)),
      swaps: (s.swaps ?? []).map((x) => `R${x.round + 1} ${x.out.nombre} → ${x.in.nombre} (${x.why})`),
      pu: custom ? puLog : undefined, hitos: (s.hitos ?? []).filter((h) => h.year === Y).length, rivals: s.rivals?.length ?? 0,
      grid: TEAMS.map((t) => ({ equipo: t.nombre, pilotos: t.pilotos.map((d) => `${d.abrev}${ageOf(d, Y)}`) })),
      ages: stats(DRIVERS.map((d) => ageOf(d.d, Y))), ratings: stats(DRIVERS.map((d) => rating(d.d))), poolSize: s.pool?.length ?? 0,
    } as Partial<SeasonLog>);
    log(`== ${Y}: campeón ${rec.champion.nombre} (${rec.champion.equipo}) · tu equipo ${tp + 1}.º con ${ts[tp].points} · objetivos ${rec.objetivos.filter((x) => x.done).length}/${rec.objetivos.length}`);

    // ---- invierno (nextSeason.ts: offSeasonScreen con lo que propone la pantalla)
    if (k === o.seasons - 1) { seasons.push(sl as SeasonLog); break; }
    if (firedNow(s)) {
      sl.fired = true;
      const offers = s.equipo ? [] : firingOffers(s);
      if (!offers.length) { s.despedido = Y; endedFired = Y; seasons.push(sl as SeasonLog); log(`${Y}: despedido; se acaba la partida`); break; }
      sl.offer = offers[0].id;
      seasons.push(sl as SeasonLog);
      log(`${Y}: despedido; acepta la oferta de ${offers[0].nombre}`);
      s = buildNextSeason(s, DRIVERS.filter((d) => d.team.id === s.playerTeam).map(() => ({ keep: true })), { newTeam: offers[0].id });
      continue;
    }
    seasons.push(sl as SeasonLog);
    s = buildNextSeason(s, winterChoices(s));
  }
  return { opts, seasons, problems, endedFired, secs: (Date.now() - t00) / 1000 };
}

/** Lo que propone la pantalla de fin de temporada: seguir con tus pilotos; si uno no quiere renovar, el mejor libre. */
function winterChoices(s: SeasonState): { keep: boolean; sign?: string }[] {
  const y = yearOf(s);
  const custom = !!s.equipo;
  const fin = gridOf(s, calendarOf(s).length).teams;
  const mine = custom ? fin.find((t) => t.id === PLAYER_TEAM_ID)!.pilotos : fin.find((t) => t.id === s.playerTeam)!.pilotos;
  const ai = fin.filter((t) => t.id !== myTeamId(s));
  const taken = new Set([...ai.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...mine.map((d) => d.abrev)]);
  const contracts = s.contracts ?? initialContracts([...ai, { ...ai[0], id: "_mios", pilotos: mine }], y, s.seed);
  const pool = (s.pool ?? MARKET.pilotos.filter((x) => x.rol !== "titular").map((x) => ({ abrev: x.abrev } as DriverDef))).filter((d) => !taken.has(d.abrev));
  const ranked = [...pool].sort((a, b) => (b.ritmo !== undefined && a.ritmo !== undefined ? rating(b) - rating(a) : 0));
  const out = mine.map(() => ({ keep: true, sign: undefined as string | undefined }));
  mine.forEach((d, i) => {
    if ((contracts[d.abrev] ?? y) <= y && !wantsRenew(s, d.nombre)) {
      out[i].keep = false;
      out[i].sign = ranked.find((p) => !out.some((x) => !x.keep && x.sign === p.abrev))?.abrev;
    }
  });
  return out;
}

/** El jugador pide piezas de motor y fiabilidad (la aerodinámica va por el túnel de viento) mientras le llegan a tiempo. */
function develop(s: SeasonState) {
  const d = s.dev!;
  const n = calendarOf(s).length;
  if (s.round > n - 3) return;
  const ctx = devContext(s);
  const { motorK } = devBonuses(s);
  const plan: [DevArea, DevSize][] = [["motor", 2], ["fiab", 1], ["motor", 2], ["fiab", 1], ["motor", 1], ["fiab", 1]];
  const p = plan[d.parts.length];
  if (!p) return;
  orderPart(d, p[0], p[1], s.round, s.seed, ctx.pubK, ctx.realK, atrMult(myAtr(s, s.round)), motorK);
}

/** Un fin de semana entero con la simulación (seasonScreen → weekendScreen → simulate → finishSession). */
function realWeekend(s: SeasonState, r: number, calIds: string[], where: string, fail: (w: string, x: string) => void) {
  // «Ir al gran premio»
  s.weekend = newWeekend(s.round + 1, circuitOf(s, calIds[s.round]), TEAMS, s.seed * 1000 + s.round * 97 + 1);
  s.weekend.year = yearOf(s);
  if (s.dev?.aero?.pkgs.some((p) => p.ready === s.round)) s.weekend.pkgTest = s.dev.aero.pkgs.find((p) => p.ready === s.round)!.programa ?? "equilibrado";
  syncMood(s);
  if (s.gridPens?.length) {
    const gp: Record<number, { places: number; why: string }> = {};
    for (const x of s.gridPens) { const d = DRIVERS.find((dd) => dd.d.nombre === x.nombre); if (d) gp[d.id] = { places: x.places, why: x.why }; }
    s.weekend.gridPens = gp;
    s.gridPens = [];
  }
  if (s.equipo) preparePu(s.weekend, s.pu, DRIVERS.length, quotaFor(calIds.length));
  const st = s.weekend;
  const extra: Partial<RaceLog> = {};
  let wet = false;
  const kinds: SessionKind[] = [];
  for (;;) {
    // pantalla del fin de semana
    if (!st.moral) syncMood(s);
    settlePkg(s, new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam));
    const wk = new Weekend(st, getTrack(st.circuitId), TEAMS, s.playerTeam);
    const kind = wk.nextKind();
    if (!kind) break;
    kinds.push(kind);
    if (kinds.length > 6) { fail(where, `demasiadas sesiones: ${kinds.join(",")}`); break; }
    const sess = runSession(wk, kind);
    if (!sess.finished) fail(where, `${kind} no termina (${(sess.wall / 60).toFixed(0)} min)`);
    if (sess.avgWater() > 0.2) wet = true;
    // finishSession
    wk.finish(sess);
    settlePkg(s, wk);
    const sum = isRaceKind(kind) ? buildSummary(sess) : null;
    const rows0 = sess.results();
    if (sum) st.summaries = { ...st.summaries, [kind]: sum };
    if (kind === "RACE") {
      extra.passes = sess.passCount;
      const codes = sess.events.map((e) => (e as { code?: string }).code);
      extra.safety = codes.filter((c) => c === "sc").length;
      extra.vsc = codes.filter((c) => c === "vsc").length;
      extra.red = codes.filter((c) => c === "roja").length > 0;
      if (st.pu) s.pu = st.pu;
      s.rounds.push({ round: st.round, circuitId: st.circuitId, q: st.results.Q, sprint: st.results.SPRINT, race: st.results.RACE, raceTable: st.scoring?.RACE, sprintTable: st.scoring?.SPRINT, summary: st.summaries?.RACE, sprintSummary: st.summaries?.SPRINT });
      s.round++;
      s.weekend = null;
      extra.swaps = applyMidSeason(s);
      s.gridPens = sess.gridPenaltiesNext().map((g) => ({ nombre: sess.carById(g.carId).d.nombre, places: g.places, why: g.why }));
      const hs = hitosAfterRace(s, seatAt(s), gpOf);
      if (hs.length) s.hitos = [...(s.hitos ?? []), ...hs].slice(-200);
      const myCars = sess.cars.filter((c) => c.player).map((c) => ({ id: c.id, nombre: c.d.nombre }));
      if (myCars.length !== 2) fail(where, `${myCars.length} coches tuyos en carrera`);
      moraleAfterRace(s, rows0, myCars, sess.orders, expectedPos(s.objetivos));
      rivalsAfterRace(s, Object.entries(sess.duels).map(([k, v]) => { const [a, b] = k.split("-").map(Number); return { a: sess.carById(a).d.nombre, b: sess.carById(b).d.nombre, ...v }; }));
      const myIds = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => d.id);
      const msg = boardMessage(s, TEAMS, myIds, calendarOf(s).length);
      if (msg) { s.rounds[s.rounds.length - 1].board = msg; extra.board = msg; }
      s.boardMood = 0;
      useSeason(s);
      break;
    }
  }
  const expect = st.sprint ? ["FP1", "SQ", "SPRINT", "Q", "RACE"] : ["FP1", "FP2", "FP3", "Q", "RACE"];
  if (kinds.join(",") !== expect.join(",")) fail(where, `sesiones ${kinds.join(",")} (se esperaban ${expect.join(",")})`);
  const ri = s.rounds[s.rounds.length - 1];
  extra.wet = wet;
  return { race: ri?.race ?? [], sprint: ri?.sprint, q: ri?.q, extra };
}

/** Carrera rápida: por ritmo del coche y del piloto, con azar y un 14 % de abandonos (como scripts/temporadas.ts). */
function fastRace(s: SeasonState, r: number, rng: Rng): ResultRow[] {
  const teams = gridOf(s, r).teams;
  let id = 0;
  const rows = teams.flatMap((t) => t.pilotos.map((d) => ({ id: id++, k: t.agarre / 180 + t.potencia * 0.0012 + (d.ritmo - 85) * 0.0007 + rng.gauss(0, 0.004), fiab: t.fiabilidad })));
  rows.sort((a, b) => b.k - a.k);
  return rows.map((x, i) => (rng.chance(0.14 * Math.min(2, x.fiab))
    ? { id: x.id, pos: i + 1, best: 90, time: 0, laps: 20, status: "out", reason: rng.chance(0.5) ? "accidente" : "avería (motor)", stops: 1, grid: i + 1 }
    : { id: x.id, pos: i + 1, best: 90, time: 5400 + i, laps: 50, status: "fin", stops: 1, grid: i + 1 }) as ResultRow)
    .sort((a, b) => (a.status === b.status ? a.pos - b.pos : a.status === "fin" ? -1 : 1));
}

// ------------------------------------------------------------------ comprobaciones
const levels = (teams: TeamDef[]) => Object.fromEntries(teams.map((t) => [t.id, r3(carLevel(t))]));
const spread = (lv: Record<string, number>) => r3(Math.max(...Object.values(lv)) - Math.min(...Object.values(lv)));
const NUMERIC = ["agarre", "potencia", "fiabilidad", "desgaste", "resistencia", "boxes"] as const;

function checkSeasonStart(s: SeasonState, Y: number, custom: boolean, fail: (w: string, x: string) => void) {
  const w = `${Y} inicio`;
  const nTeams = TEAMS.length;
  if (nTeams !== (custom ? 12 : 11)) fail(w, `${nTeams} equipos en la parrilla`);
  if (!TEAMS.some((t) => t.id === s.playerTeam)) fail(w, `tu equipo (${s.playerTeam}) no está en la parrilla`);
  if (DRIVERS.length !== nTeams * 2) fail(w, `${DRIVERS.length} pilotos para ${nTeams} equipos`);
  const ab = DRIVERS.map((d) => d.d.abrev), names = DRIVERS.map((d) => d.d.nombre);
  const dup = ab.filter((a, i) => ab.indexOf(a) !== i), dupN = names.filter((a, i) => names.indexOf(a) !== i);
  if (dup.length) fail(w, `pilotos repetidos en la parrilla: ${dup.join(", ")}`);
  if (dupN.length) fail(w, `nombres repetidos en la parrilla: ${dupN.join(", ")}`);
  const nums = DRIVERS.map((d) => d.d.numero), dupNum = nums.filter((a, i) => nums.indexOf(a) !== i);
  if (dupNum.length) fail(w, `dorsales repetidos: ${dupNum.join(", ")}`);
  for (const t of TEAMS) {
    if (t.pilotos.length !== 2) fail(w, `${t.nombre} tiene ${t.pilotos.length} pilotos`);
    for (const f of NUMERIC) { const v = (t as unknown as Record<string, number>)[f]; if (v !== undefined && !Number.isFinite(v)) fail(w, `${t.nombre}.${f} = ${v}`); }
    if (!(t.fiabilidad > 0.2 && t.fiabilidad < 3)) fail(w, `${t.nombre}: fiabilidad ${t.fiabilidad}`);
    for (const d of t.pilotos) {
      for (const f of ["ritmo", "regularidad", "neumaticos", "lluvia", "ataque", "defensa"] as const) {
        const v = d[f];
        if (!Number.isFinite(v) || v < 40 || v > 100) fail(w, `${d.nombre} (${t.nombre}): ${f} = ${v}`);
      }
      const age = ageOf(d, Y);
      if (age < 16 || age > 50) fail(w, `${d.nombre} tiene ${age} años`);
    }
  }
  if (s.pool) {
    const onGrid = new Set(ab);
    const inPool = s.pool.filter((d) => onGrid.has(d.abrev)).map((d) => d.abrev);
    if (inPool.length) fail(w, `en la parrilla y también libres: ${inPool.join(", ")}`);
  }
  if (s.contracts) {
    for (const d of DRIVERS) { const c = s.contracts[d.d.abrev]; if (c !== undefined && c < Y) fail(w, `${d.d.nombre} corre con contrato hasta ${c}`); }
  }
  if (!s.dev || !(s.dev.budget >= 15)) fail(w, `presupuesto de desarrollo ${s.dev?.budget}`);
  if ((s.objetivos ?? []).length < 1) fail(w, "sin objetivos de la directiva");
  if (custom) {
    const ctx = devContext(s);
    if (ctx.left === null || !Number.isFinite(ctx.left)) fail(w, `techo de gasto sin sentido (${ctx.left})`);
    if (s.equipo!.pilotos.length !== 2) fail(w, `tu equipo tiene ${s.equipo!.pilotos.length} pilotos`);
  }
}

function checkRound(s: SeasonState, r: number, race: ResultRow[], sprint: ResultRow[] | undefined, where: string, fail: (w: string, x: string) => void) {
  const n = DRIVERS.length;
  for (const [name, rows] of [["carrera", race], ["sprint", sprint]] as const) {
    if (!rows) continue;
    if (rows.length !== n) fail(where, `${name}: ${rows.length} filas para ${n} coches`);
    const ids = rows.map((x) => x.id).sort((a, b) => a - b);
    if (ids.some((x, i) => x !== i)) fail(where, `${name}: ids que no cuadran (${ids.join(",")})`);
    // los que acaban, antes que los que no; y por tiempo
    let seenOut = false;
    for (const x of rows) { if (x.status !== "fin") seenOut = true; else if (seenOut) { fail(where, `${name}: un coche que acaba detrás de uno que no`); break; } }
    for (const x of rows) if (x.status === "fin" && !Number.isFinite(x.time)) fail(where, `${name}: tiempo ${x.time}`);
    const fin = rows.filter((x) => x.status === "fin");
    if (fin.length < Math.min(10, n / 2)) fail(where, `${name}: solo acaban ${fin.length}`);
  }
  const ri = s.rounds[s.rounds.length - 1];
  if (!ri || ri.round !== r + 1) fail(where, `la ronda guardada es ${ri?.round}`);
  const pts = [...pointsFor(race, ri.raceTable ?? RACE_POINTS).values()].reduce((a, b) => a + b, 0);
  const full = (ri.raceTable ?? RACE_POINTS).reduce((a, b) => a + b, 0);
  const finN = race.filter((x) => x.status === "fin").length;
  if (finN >= 10 && pts !== full) fail(where, `se reparten ${pts} puntos en carrera (${full} en juego)`);
  if (sprint) {
    const sp = [...pointsFor(sprint, ri.sprintTable ?? SPRINT_POINTS).values()].reduce((a, b) => a + b, 0);
    if (sprint.filter((x) => x.status === "fin").length >= 8 && sp !== (ri.sprintTable ?? SPRINT_POINTS).reduce((a, b) => a + b, 0)) fail(where, `se reparten ${sp} puntos en el sprint`);
  }
}

function checkStandings(s: SeasonState, ds: ReturnType<typeof driverStandings>, ts: ReturnType<typeof teamStandings>, where: string, fail: (w: string, x: string) => void) {
  const dSum = ds.reduce((a, x) => a + x.points, 0), tSum = ts.reduce((a, x) => a + x.points, 0);
  if (dSum !== tSum) fail(where, `los pilotos suman ${dSum} y los equipos ${tSum}`);
  let total = 0;
  for (const r of s.rounds) {
    total += [...pointsFor(r.race, r.raceTable ?? RACE_POINTS).values()].reduce((a, b) => a + b, 0);
    total += [...pointsFor(r.sprint, r.sprintTable ?? SPRINT_POINTS).values()].reduce((a, b) => a + b, 0);
  }
  if (total !== dSum) fail(where, `el mundial suma ${dSum} y las carreras ${total}`);
  for (let i = 1; i < ds.length; i++) if (ds[i].points > ds[i - 1].points) { fail(where, "mundial de pilotos mal ordenado"); break; }
  const wins = ds.reduce((a, x) => a + x.wins, 0);
  const races = s.rounds.filter((r) => r.race?.[0]?.status === "fin").length;
  if (wins !== races) fail(where, `${wins} victorias en ${races} carreras`);
  if (ts.length !== TEAMS.length) fail(where, `${ts.length} equipos en constructores`);
  void BASE_TEAMS;
  void priceOf;
}
