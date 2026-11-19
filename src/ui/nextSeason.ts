// Fin de temporada y paso a la siguiente: lo que ha pasado, los objetivos, tus pilotos (renovar o cambiar) y el
// mercado de los demás (career.ts).
import { BASE_TEAMS, MARKET, DRIVERS, TEAMS, CALENDARS, calendarOf, gridOf, who } from "./data";
import { $, esc, setBack, sheet } from "./common";
import type { SeasonState, SeatSwap } from "../sim/season";
import { driverStandings, teamStandings, pointsFor, RACE_POINTS, SPRINT_POINTS } from "../sim/season";
import { devLeft } from "../sim/development";
import { objectiveStatus } from "../sim/objectives";
import { MORAL0, moralOf, moralLabel, wantsRenew } from "../sim/morale";
import { recordExtras } from "../sim/hitos";
import { seatAt, gpOf, galaOf } from "./ritual";
import { offSeason, initialContracts, rating, ageOf, FIRST_YEAR, objectivesBonus, SeasonRecord, CAR_CARRY, OBJ_BONUS, OBJ_MALUS, salaryFor, clauseFor, midSeason, SeatNow } from "../sim/career";
import { publicDriver, trueTech, NEW_TEAM, PLAYER_TEAM_ID, clauseOf } from "../sim/market";
import { saveSeason } from "./store";
import type { DriverDef, TeamDef } from "../sim/session";

export const yearOf = (s: SeasonState) => s.year ?? FIRST_YEAR;
const app = () => document.getElementById("app")!;

/** Los objetivos de la temporada, cumplidos o no. */
function objectivesDone(s: SeasonState): { text: string; done: boolean }[] {
  const mine = DRIVERS.filter((d) => d.team.id === s.playerTeam).map((d) => d.id);
  const races = calendarOf(s).length;
  return (s.objetivos ?? []).map((o) => { const st = objectiveStatus(o, s, TEAMS, mine, races); return { text: st.text, done: st.state === "done" }; });
}

/** Lo que se guarda de la temporada que acaba. */
export function seasonRecord(s: SeasonState): SeasonRecord {
  const ds = driverStandings(s, DRIVERS.length), ts = teamStandings(s, TEAMS);
  const ch = who(s, ds[0].id);
  const tp = ts.findIndex((x) => x.team.id === s.playerTeam);
  return {
    year: yearOf(s),
    champion: { nombre: ch.d.nombre, equipo: ch.team.nombre, puntos: ds[0].points },
    constructores: { equipo: ts[0].team.nombre, puntos: ts[0].points },
    mine: {
      equipo: ts[tp].team.nombre, pos: tp + 1, puntos: ts[tp].points,
      pilotos: ds.map((x, i) => ({ x, i })).filter(({ x }) => x.id < 1000 && DRIVERS[x.id].team.id === s.playerTeam).map(({ x, i }) => ({ nombre: DRIVERS[x.id].d.nombre, pos: i + 1, puntos: x.points })),
    },
    objetivos: objectivesDone(s),
    carreras: calendarOf(s).length,
    ...recordExtras(s, seatAt(s), gpOf),
    gala: galaOf(s),
  };
}

/** Cómo es ahora un piloto (por su abreviatura), esté donde esté. */
function driverNow(s: SeasonState, abrev: string): DriverDef {
  for (const t of s.grid ?? []) { const d = t.pilotos.find((p) => p.abrev === abrev); if (d) return d; }
  const m = s.misPilotos?.find((p) => p.abrev === abrev) ?? s.pool?.find((p) => p.abrev === abrev)
    ?? s.swaps?.map((x) => (x.in.abrev === abrev ? x.in : x.out.abrev === abrev ? x.out : null)).find((d) => d);
  return m ?? publicDriver(MARKET, BASE_TEAMS, abrev);
}

/** Los pilotos de la temporada que acaba: los de la IA (por equipo) y los tuyos, con sus valores de ese año. */
function rosters(s: SeasonState): { ai: TeamDef[]; mine: DriverDef[]; fin: TeamDef[] } {
  const races = calendarOf(s).length;
  const fin = gridOf(s, races).teams;
  const custom = !!s.equipo;
  const base = s.grid ?? BASE_TEAMS;
  const ai = fin.filter((t) => t.id !== (custom ? PLAYER_TEAM_ID : s.playerTeam)).map((t) => {
    const b = base.find((x) => x.id === t.id) ?? t;
    return { ...b, pilotos: t.pilotos.map((d) => driverNow(s, d.abrev)) };
  });
  const mine = custom ? s.equipo!.pilotos.map((a) => driverNow(s, a)) : (fin.find((t) => t.id === s.playerTeam)?.pilotos ?? []).map((d) => driverNow(s, d.abrev));
  return { ai, mine, fin };
}

/** Pilotos libres: el grupo de la temporada o, en la primera, los reservas y libres del mercado. */
function poolOf(s: SeasonState, taken: Set<string>): DriverDef[] {
  const p = s.pool ?? MARKET.pilotos.filter((x) => x.rol !== "titular").map((x) => publicDriver(MARKET, BASE_TEAMS, x.abrev));
  return p.filter((d) => !taken.has(d.abrev));
}

/** Salarios de la temporada: los guardados o, en la primera, los del mercado (y si no está, lo que pediría). */
function salariesOf(s: SeasonState, drivers: DriverDef[]): Record<string, number> {
  if (s.salaries) return s.salaries;
  const out: Record<string, number> = {};
  for (const d of drivers) out[d.abrev] = MARKET.pilotos.find((p) => p.abrev === d.abrev)?.salario ?? salaryFor(d);
  return out;
}

/** Lo que cuesta cambiar a uno de tus pilotos por otro (cláusulas: la del tuyo si tiene contrato y la del nuevo si es
 *  de otro equipo). */
function swapCost(s: SeasonState, out: DriverDef, inAbrev: string | undefined, contracts: Record<string, number>, sal: Record<string, number>, ai: TeamDef[]): number {
  const y = yearOf(s) + 1;
  let c = clauseFor(sal[out.abrev] ?? salaryFor(out), contracts[out.abrev] ?? y - 1, y);
  const other = ai.flatMap((t) => t.pilotos).find((d) => d.abrev === inAbrev);
  if (other) c += clauseFor(sal[other.abrev] ?? salaryFor(other), contracts[other.abrev] ?? y - 1, y);
  return Math.round(c * 10) / 10;
}

/** La temporada siguiente, con tus decisiones sobre tus pilotos. */
/** Cambios de personal entre temporadas en «crear equipo»: jefe de equipo, director técnico y motor. */
export interface StaffChoice { jefe: string; tecnico: string; motor: string }
/** Lo que cuesta del presupuesto de desarrollo: la cláusula del jefe y del técnico nuevos si vienen de otro equipo. */
export function staffCost(s: SeasonState, st: StaffChoice): number {
  const e = s.equipo;
  if (!e) return 0;
  let c = 0;
  if (st.jefe !== e.jefe) { const j = MARKET.jefes.find((x) => x.nombre === st.jefe); if (j) c += clauseOf(j); }
  if (st.tecnico !== e.tecnico) { const t = MARKET.tecnicos.find((x) => x.nombre === st.tecnico); if (t) c += clauseOf(t); }
  return Math.round(c * 10) / 10;
}

/** ¿Te despide la directiva? Tres temporadas seguidas sin cumplir ningún objetivo (tras el aviso de la segunda). */
export function firedNow(s: SeasonState): boolean {
  const rec = objectivesDone(s);
  return rec.length > 0 && rec.every((o) => !o.done) && (s.aviso ?? 0) >= 2;
}

/** Las ofertas tras un despido (con equipo real): los dos equipos peor clasificados del mundial, sin el tuyo. */
export function firingOffers(s: SeasonState): TeamDef[] {
  return teamStandings(s, TEAMS).map((x) => x.team).filter((t) => t.id !== s.playerTeam).slice(-2).reverse();
}

export function buildNextSeason(s: SeasonState, choices: { keep: boolean; sign?: string }[], opts: { staff?: StaffChoice; newTeam?: string } = {}): SeasonState {
  const y = yearOf(s) + 1;
  const { ai, mine, fin } = rosters(s);
  const taken = new Set([...ai.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...mine.map((d) => d.abrev)]);
  const allTeams = [...ai, { ...ai[0], id: "_mios", pilotos: mine }];
  const contracts = s.contracts ?? initialContracts(allTeams, yearOf(s), s.seed);
  const salaries = salariesOf(s, allTeams.flatMap((t) => t.pilotos));
  const meanAgarre = BASE_TEAMS.reduce((a, t) => a + t.agarre, 0) / BASE_TEAMS.length;
  const departed = (s.swaps ?? []).map((x) => x.out).filter((d, i, a) => !taken.has(d.abrev) && a.findIndex((z) => z.abrev === d.abrev) === i);
  const basePool = poolOf(s, taken);
  const pool0 = [...basePool, ...departed.filter((d) => !basePool.some((p) => p.abrev === d.abrev))];
  const out = offSeason({
    year: y, seed: s.seed, final: fin, base: ai, meanAgarre, pool: pool0, contracts, salaries,
    mine: mine.map((d, i) => ({ d, keep: choices[i]?.keep ?? true, sign: choices[i]?.sign })),
  });
  // tu coche: lo mismo que los demás, desde como acabó el tuyo
  const endMean = fin.reduce((a, t) => a + t.agarre, 0) / fin.length;
  const myFin = fin.find((t) => t.id === (s.equipo ? PLAYER_TEAM_ID : s.playerTeam))!;
  const myAgarre = meanAgarre + CAR_CARRY * (myFin.agarre - endMean);
  const rec = seasonRecord(s);
  const done = rec.objetivos.filter((o) => o.done).length;
  const seed = (s.seed * 7 + 13) % 1_000_000;
  const next: SeasonState = {
    v: 1, playerTeam: s.playerTeam, seed, round: 0, weekend: null, rounds: [],
    calendar: s.calendar ? [...s.calendar] : [...CALENDARS.corta.ids], ...(s.formatos ? { formatos: { ...s.formatos } } : {}),
    year: y, trueSeed: s.trueSeed ?? s.seed, pool: out.pool, contracts: out.contracts, salaries: out.salaries, news: out.news,
    history: [...(s.history ?? []), rec],
    // los objetivos suben o bajan el presupuesto; las cláusulas que has pagado salen de él
    devBonus: (rec.objetivos.length ? objectivesBonus(done, rec.objetivos.length) : 0) - out.cost,
    aviso: rec.objetivos.length && done === 0 ? (s.aviso ?? 0) + 1 : 0,
    // la moral vuelve a medias hacia lo normal en invierno; las rivalidades se enfrían, pero no se olvidan
    ...(s.moral ? { moral: Object.fromEntries(Object.entries(s.moral).map(([n, m]) => [n, Math.round((MORAL0 + (m - MORAL0) * 0.5) * 10) / 10])) } : {}),
    ...(s.hitos ? { hitos: s.hitos } : {}),
    ...(s.records ? { records: s.records } : {}),
    ...(s.rivals ? { rivals: s.rivals.map((r) => ({ ...r, k: Math.round(r.k * 0.6 * 100) / 100 })).filter((r) => r.k >= 0.15) } : {}),
  };
  // despedido y con una oferta aceptada: a otro equipo, de cero (sin aviso ni premio ni castigo de la directiva)
  if (opts.newTeam && !s.equipo) {
    next.playerTeam = opts.newTeam;
    next.aviso = 0;
    next.devBonus = 0;
  }
  if (s.equipo) {
    next.equipo = { ...s.equipo, pilotos: out.mine.map((d) => d.abrev), ...(opts.staff ?? {}) };
    // un jefe o un técnico de otro equipo se paga con su cláusula, del presupuesto de desarrollo
    if (opts.staff) next.devBonus = (next.devBonus ?? 0) - staffCost(s, opts.staff);
    next.grid = out.base;
    next.misPilotos = out.mine;
    // lo que conserva tu coche frente al que haría tu director técnico de cero; ya no es un equipo nuevo
    const tech = MARKET.tecnicos.find((x) => x.nombre === s.equipo!.tecnico);
    const design = (tech ? trueTech(tech, s.trueSeed ?? s.seed).diseno : 0) + NEW_TEAM.agarre;
    next.carry = Math.round((myAgarre - design - NEW_TEAM.agarre * 0.5) * 100) / 100;
  } else {
    const mineBase = (s.grid ?? BASE_TEAMS).find((t) => t.id === s.playerTeam)!;
    // la potencia que ganaste con piezas de motor también se conserva en parte
    const pw = mineBase.potencia + CAR_CARRY * (myFin.potencia - mineBase.potencia);
    const mineNext: TeamDef = { ...mineBase, pilotos: out.mine, agarre: Math.round(myAgarre * 100) / 100, potencia: Math.round(pw * 100) / 100 };
    next.grid = (s.grid ?? BASE_TEAMS).map((t) => (t.id === s.playerTeam ? mineNext : out.base.find((b) => b.id === t.id)!));
  }
  return next;
}

/** Pantalla de fin de temporada: lo que ha pasado y tus pilotos para el año que viene. */
export function offSeasonScreen(s: SeasonState, onDone: (next: SeasonState) => void, onBack: () => void) {
  const y = yearOf(s);
  const rec = seasonRecord(s);
  const { ai, mine } = rosters(s);
  const taken = new Set([...ai.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...mine.map((d) => d.abrev)]);
  const contracts = s.contracts ?? initialContracts([...ai, { ...ai[0], id: "_mios", pilotos: mine }], y, s.seed);
  const sal = salariesOf(s, [...ai.flatMap((t) => t.pilotos), ...mine]);
  // a quién se puede fichar: los libres (con los de la F2) y los de los demás equipos (pagando su cláusula)
  const pool = poolOf(s, taken).sort((a, b) => rating(b) - rating(a)).slice(0, 20);
  const teamOf = new Map(ai.flatMap((t) => t.pilotos.map((d) => [d.abrev, t.nombre] as [string, string])));
  const others = ai.flatMap((t) => t.pilotos).sort((a, b) => rating(b) - rating(a));
  const options = [...pool, ...others];
  const done = rec.objetivos.filter((o) => o.done).length;
  const bonus = rec.objetivos.length ? objectivesBonus(done, rec.objetivos.length) : 0;
  const warn = rec.objetivos.length && done === 0 && (s.aviso ?? 0) >= 1;
  // con la moral por los suelos, alguno no quiere renovar: hay que buscarle sustituto
  const refuses = mine.map((d) => (contracts[d.abrev] ?? y) <= y && !wantsRenew(s, d.nombre));
  const choices = mine.map(() => ({ keep: true, sign: undefined as string | undefined }));
  refuses.forEach((no, i) => { if (no) { choices[i].keep = false; choices[i].sign = options.find((p) => !choices.some((o) => !o.keep && o.sign === p.abrev))?.abrev; } });
  const cost = () => choices.reduce((a, c, i) => a + (c.keep ? 0 : swapCost(s, mine[i], c.sign, contracts, sal, ai)), 0);
  const optLabel = (p: DriverDef) => {
    const t = teamOf.get(p.abrev);
    const cl = t ? clauseFor(sal[p.abrev] ?? salaryFor(p), contracts[p.abrev] ?? y, y + 1) : 0;
    return `${esc(p.nombre)} · ${ageOf(p, y + 1)} años · ritmo ${p.ritmo} · ${t ? `${esc(t)}${cl ? `, cláusula ${cl} M` : ", acaba contrato"}` : p.serie ? esc(p.serie) : "libre"}${p.debut === undefined ? " · sin experiencia en F1" : ""} · pide ${salaryFor(p)} M`;
  };
  const card = (d: DriverDef, i: number) => {
    const until = contracts[d.abrev] ?? y;
    const ends = until <= y;
    const c = choices[i];
    const out = clauseFor(sal[d.abrev] ?? salaryFor(d), until, y + 1);
    const ml = moralLabel(moralOf(s, d.nombre));
    return `<div class="list-item" style="display:block">
      <div class="row"><b class="grow">${esc(d.nombre)}</b><span class="small dim">${ageOf(d, y + 1)} años en ${y + 1} · ritmo ${d.ritmo} · ${sal[d.abrev] ?? salaryFor(d)} M/año</span></div>
      <div class="small"><span class="${ml.cls}">${ml.icon} ${ml.text}</span> <span class="dim">(moral ${Math.round(moralOf(s, d.nombre))})</span></div>
      <div class="small ${refuses[i] ? "redt" : ends ? "yellow" : "dim"}">${refuses[i] ? "Se le acaba el contrato y no quiere renovar: está harto del equipo." : ends ? `Se le acaba el contrato (renovar: pide ${salaryFor(d)} M/año).` : `Con contrato hasta ${until}: romperlo cuesta ${out} M.`}</div>
      <div class="seg" style="margin-top:4px">${refuses[i] ? "" : `<button data-keep="${i}" class="${c.keep ? "on" : ""}">${ends ? "Renovar" : "Seguir"}</button>`}<button data-swap="${i}" class="${c.keep ? "" : "on"}">Cambiar</button></div>
      ${c.keep ? "" : `<select data-sign="${i}" style="width:100%">${options.filter((p) => !choices.some((o, j) => j !== i && !o.keep && o.sign === p.abrev)).map((p) => `<option value="${p.abrev}" ${c.sign === p.abrev ? "selected" : ""}>${optLabel(p)}</option>`).join("")}</select>
      <div class="small dim">Cuesta ${swapCost(s, d, c.sign, contracts, sal, ai)} M del presupuesto de desarrollo de ${y + 1}.</div>`}
    </div>`;
  };
  // despedido: la directiva prescinde de ti; con un equipo real, dos ofertas de los de abajo
  if (firedNow(s)) {
    const offers = s.equipo ? [] : firingOffers(s);
    app().innerHTML = `<div style="padding-bottom:16px">
      <div class="panel"><div class="hd"><span class="t">🚪 Despedido</span><button id="back">Temporada</button></div><div class="bd">
        <div><b>${esc(rec.mine.equipo)}</b> acaba ${rec.mine.pos}.º de constructores y, por tercera temporada seguida, sin cumplir ningún objetivo. ${s.equipo ? "Los inversores toman el control del equipo y prescinden de ti." : "La directiva ha decidido prescindir de ti."}</div>
        <div class="small dim" style="margin-top:6px">${rec.objetivos.map((o) => `❌ ${esc(o.text)}`).join(" · ")}</div>
      </div></div>
      ${offers.length ? `<div class="panel"><div class="hd"><span class="t">Ofertas para ${y + 1}</span></div><div class="bd">
        <div class="small" style="margin-bottom:6px">Hay quien todavía confía en ti, aunque sea para empezar desde abajo. Llegas sin aviso de la directiva y con objetivos nuevos.</div>
        ${offers.map((t) => `<button class="big-cta" data-offer="${t.id}" style="width:100%;margin:4px 0;border-left:6px solid ${t.color}">Aceptar la oferta de ${esc(t.nombre)}</button>`).join("")}
      </div></div>` : ""}
      <div style="padding:0 10px"><button id="end" style="width:100%">Dejar la Fórmula 1 (termina la partida)</button></div>
    </div>`;
    setBack(onBack);
    $("#back").onclick = onBack;
    document.querySelectorAll<HTMLElement>("[data-offer]").forEach((b) => (b.onclick = () => onDone(buildNextSeason(s, mine.map(() => ({ keep: true })), { newTeam: b.dataset.offer }))));
    $("#end").onclick = () => { if (!confirm("¿Dejar la partida aquí? Se queda guardada como terminada.")) return; s.despedido = y; saveSeason(s); onBack(); };
    window.scrollTo(0, 0);
    return;
  }
  // «crear equipo»: el equipo técnico para el año que viene (jefe, director técnico y motor)
  const staff: StaffChoice | null = s.equipo ? { jefe: s.equipo.jefe, tecnico: s.equipo.tecnico, motor: s.equipo.motor } : null;
  const teamName = (id: string | null) => (id ? BASE_TEAMS.find((t) => t.id === id)?.nombre ?? id : "");
  const staffPanel = () => {
    if (!staff) return "";
    const opt = (sel: string, val: string, label: string) => `<option value="${esc(val)}"${sel === val ? " selected" : ""}>${esc(label)}</option>`;
    const who = (x: { nombre: string; equipo: string | null; salario: number }, extra: string) => `${x.nombre} · ${x.equipo ? `${teamName(x.equipo)}, cláusula ${clauseOf(x)} M` : "libre"} · ${x.salario} M/año · ${extra}`;
    const sc = staffCost(s, staff);
    return `<div class="panel"><div class="hd"><span class="t">Tu equipo técnico para ${y + 1}</span></div><div class="bd small">
      <div style="margin:2px 0">Jefe de equipo <select data-staff="jefe" style="width:100%">${MARKET.jefes.map((j) => opt(staff.jefe, j.nombre, who(j, `estrategia ${j.estrategia}, meteo ${j.meteo}`))).join("")}</select></div>
      <div style="margin:2px 0">Director técnico <select data-staff="tecnico" style="width:100%">${MARKET.tecnicos.map((t) => opt(staff.tecnico, t.nombre, who(t, `diseño ${t.diseno > 0 ? "+" : ""}${t.diseno}, desarrollo ${t.desarrollo}`))).join("")}</select></div>
      <div style="margin:2px 0">Motor <select data-staff="motor" style="width:100%">${MARKET.motores.map((e) => opt(staff.motor, e.id, `${e.nombre} · potencia ${e.potencia > 0 ? "+" : ""}${e.potencia} · fiabilidad ${e.fiabilidad} · ${e.precio} M/año`)).join("")}</select></div>
      <div class="dim" style="margin-top:4px">Fichar a un jefe o un técnico de otro equipo cuesta su cláusula${sc ? `: <b class="redt">−${sc} M</b> del presupuesto de desarrollo de ${y + 1}` : ""}; su equipo se queda con un interino. Los salarios y el motor cuentan en el techo de gasto del año que viene (lo que quede, para desarrollar). Lo que valen de verdad no se sabe hasta verlos trabajar.</div>
    </div></div>`;
  };
  const render = () => {
    app().innerHTML = `<div style="padding-bottom:16px">
      <div class="panel"><div class="hd"><span class="t">Fin de la temporada ${y}</span><button id="back">Temporada</button></div><div class="bd">
        <div>🏆 Campeón: <b>${esc(rec.champion.nombre)}</b> (${esc(rec.champion.equipo)}, ${rec.champion.puntos} pts) · constructores: <b>${esc(rec.constructores.equipo)}</b></div>
        <div class="small" style="margin-top:4px">${esc(rec.mine.equipo)}: ${rec.mine.pos}.º de constructores · ${rec.mine.pilotos.map((p) => `${esc(p.nombre)} ${p.pos}.º`).join(" · ")}</div>
      </div></div>
      ${rec.objetivos.length ? `<div class="panel"><div class="hd"><span class="t">La directiva</span><span class="small">${done} de ${rec.objetivos.length} objetivos</span></div><div class="bd small">
        ${rec.objetivos.map((o) => `<div>${o.done ? "✅" : "❌"} ${esc(o.text)}</div>`).join("")}
        <div style="margin-top:6px">Presupuesto de desarrollo para ${y + 1}: <b class="${bonus >= 0 ? "green" : "redt"}">${bonus >= 0 ? "+" : "−"}${Math.abs(bonus)} M</b> (${OBJ_BONUS} M más por cada objetivo cumplido y ${OBJ_MALUS} M menos por cada uno fallado)${cost() ? `, y <b class="redt">−${Math.round(cost() * 10) / 10} M</b> en cláusulas` : ""}.</div>
        ${warn ? `<div class="redt" style="margin-top:6px">⚠️ Segunda temporada seguida sin cumplir ningún objetivo: la directiva avisa de que, si el año que viene tampoco cumples ninguno, te despide.</div>` : done === 0 && rec.objetivos.length ? `<div class="yellow" style="margin-top:6px">La directiva no está nada contenta.</div>` : ""}
      </div></div>` : ""}
      <div class="panel"><div class="hd"><span class="t">Tus pilotos para ${y + 1}</span></div><div class="bd" style="padding:0">${mine.map(card).join("")}
        <div class="small dim" style="padding:6px 10px">Se puede fichar a cualquiera: a los libres y los de la F2, o a uno de otro equipo pagando su cláusula (la mitad de lo que le queda por cobrar); romper el contrato de uno tuyo también se paga. Las cláusulas salen del presupuesto de desarrollo. Con los años, los jóvenes ganan ritmo y oficio y los mayores pierden algo de ritmo; alguno se retira. Los demás equipos renuevan o fichan por su cuenta, y suben novatos de la F2.</div>
      </div></div>
      ${staffPanel()}
      <div class="sticky-cta"><button class="red big-cta" id="go">Empezar la temporada ${y + 1}</button></div>
    </div>`;
    setBack(onBack);
    $("#back").onclick = onBack;
    document.querySelectorAll<HTMLElement>("[data-keep]").forEach((b) => (b.onclick = () => { choices[Number(b.dataset.keep)].keep = true; render(); }));
    document.querySelectorAll<HTMLElement>("[data-swap]").forEach((b) => (b.onclick = () => {
      const c = choices[Number(b.dataset.swap)];
      c.keep = false;
      c.sign = options.find((p) => !choices.some((o) => o !== c && !o.keep && o.sign === p.abrev))?.abrev;
      render();
    }));
    document.querySelectorAll<HTMLSelectElement>("[data-sign]").forEach((el) => (el.onchange = () => { choices[Number(el.dataset.sign)].sign = el.value; render(); }));
    document.querySelectorAll<HTMLSelectElement>("[data-staff]").forEach((el) => (el.onchange = () => { if (staff) { staff[el.dataset.staff as keyof StaffChoice] = el.value; render(); } }));
    $("#go").onclick = () => onDone(buildNextSeason(s, choices, staff ? { staff } : {}));
    window.scrollTo(0, 0);
  };
  render();
}

/** Las temporadas anteriores, para la pantalla de temporada. */
export function historyPanel(s: SeasonState): string {
  const h = s.history ?? [];
  if (!h.length) return "";
  return `<div class="panel"><div class="hd"><span class="t">Temporadas anteriores</span></div><div class="bd" style="padding:0">
    <table class="tv"><tr><th>Año</th><th>Campeón</th><th>Constructores</th><th>Tú</th></tr>
    ${h.slice().reverse().map((r) => `<tr><td class="mono">${r.year}</td><td>${esc(r.champion.nombre)}</td><td>${esc(r.constructores.equipo)}</td><td class="mono">${r.mine.pos}.º · ${r.objetivos.filter((o) => o.done).length}/${r.objetivos.length}</td></tr>`).join("")}
    </table></div></div>`;
}

/** Lo que pasó en el mercado antes de esta temporada. */
export function newsPanel(s: SeasonState): string {
  if (!s.news?.length || s.rounds.length) return "";
  return `<div class="panel"><div class="hd"><span class="t">Mercado de pilotos ${yearOf(s)}</span></div><div class="bd small">${s.news.map((n) => `<div>${esc(n)}</div>`).join("")}</div></div>`;
}

// --------------------------------------------------------------- a mitad de temporada
/** Los asientos de la última carrera (o de la próxima), con quién los lleva. */
function seatsAt(s: SeasonState, round: number): SeatNow[] {
  const teams = gridOf(s, round).teams;
  const out: SeatNow[] = [];
  let id = 0;
  for (const t of teams) {
    const first = id;
    t.pilotos.forEach((d, k) => out.push({ seat: id++, d, teamId: t.id, team: t.nombre, player: t.id === s.playerTeam, mate: first + (k === 0 ? 1 : 0) }));
  }
  return out;
}

/** Puntos de cada asiento esta temporada. */
function seatPointsOf(s: SeasonState): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of s.rounds) {
    for (const [id, p] of pointsFor(r.race, r.raceTable ?? RACE_POINTS)) m.set(id, (m.get(id) ?? 0) + p);
    for (const [id, p] of pointsFor(r.sprint, r.sprintTable ?? SPRINT_POINTS)) m.set(id, (m.get(id) ?? 0) + p);
  }
  return m;
}

/** Tras una carrera: lesiones y destituciones para la próxima (las guarda en la temporada). Devuelve las noticias. */
export function applyMidSeason(s: SeasonState): string[] {
  const last = s.rounds[s.rounds.length - 1];
  if (!last?.race) return [];
  const seats = seatsAt(s, s.round - 1);
  const taken = new Set(seatsAt(s, s.round).map((x) => x.d.abrev));
  for (const x of s.swaps ?? []) if (x.round >= s.round) taken.add(x.out.abrev);
  const reserves: Record<string, string[]> = {};
  for (const p of MARKET.pilotos) if (p.rol === "reserva" && p.equipo) (reserves[p.equipo] ??= []).push(p.abrev);
  const out = midSeason({
    next: s.round, rounds: calendarOf(s).length, year: yearOf(s), seed: s.seed, seats,
    race: last.race.map((r) => ({ seat: r.id, status: r.status, reason: r.reason })), points: seatPointsOf(s),
    pool: poolOf(s, taken), reserves, swaps: s.swaps ?? [],
  });
  if (out.swaps.length) {
    s.swaps = [...(s.swaps ?? []), ...out.swaps];
    s.pool = out.pool;
    syncMine(s);
  }
  return out.news;
}

/** «Crear equipo»: tus pilotos de ahora en el equipo que fichaste (para la temporada siguiente). */
function syncMine(s: SeasonState) {
  if (!s.equipo) return;
  const mine = seatsAt(s, s.round).filter((x) => x.player).map((x) => x.d);
  s.equipo = { ...s.equipo, pilotos: mine.map((d) => d.abrev) };
  if (s.misPilotos) s.misPilotos = mine.map((d) => s.misPilotos!.find((m) => m.abrev === d.abrev) ?? d);
}

/** Lo que cuesta cambiar a uno de tus pilotos a mitad de temporada (cláusulas, como entre temporadas). */
function midSwapCost(s: SeasonState, out: DriverDef, inn: DriverDef, fromTeam: boolean): number {
  const y = yearOf(s);
  const contracts = s.contracts ?? {};
  const sal = s.salaries ?? {};
  const mk = (d: DriverDef) => MARKET.pilotos.find((p) => p.abrev === d.abrev)?.salario ?? salaryFor(d);
  let c = clauseFor(sal[out.abrev] ?? mk(out), contracts[out.abrev] ?? y, y);
  if (fromTeam) c += clauseFor(sal[inn.abrev] ?? mk(inn), contracts[inn.abrev] ?? y, y);
  return Math.round(c * 10) / 10;
}

/** Hoja para cambiar a uno de tus pilotos entre carreras: un libre, uno de la F2 o uno de otro equipo (con cláusula). */
export function swapSheet(s: SeasonState, onDone: (news: string) => void) {
  const seats = seatsAt(s, s.round);
  const mine = seats.filter((x) => x.player);
  const taken = new Set(seats.map((x) => x.d.abrev));
  const pool = poolOf(s, taken).sort((a, b) => rating(b) - rating(a)).slice(0, 20);
  const others = seats.filter((x) => !x.player).sort((a, b) => rating(b.d) - rating(a.d));
  const left = s.dev ? devLeft(s.dev) : 0;
  let pick = 0, inAb = pool[0]?.abrev ?? "";
  const options = () => [...pool.map((d) => ({ d, team: null as SeatNow | null })), ...others.map((x) => ({ d: x.d, team: x }))];
  const body = () => {
    const o = options().find((x) => x.d.abrev === inAb) ?? options()[0];
    const cost = o ? midSwapCost(s, mine[pick].d, o.d, !!o.team) : 0;
    return `<div class="row"><b class="up grow">Cambiar un piloto</b><span class="small dim">desde la próxima carrera</span></div>
      <div class="seg">${mine.map((x, i) => `<button data-who="${i}" class="${i === pick ? "on" : ""}">${esc(x.d.nombre)}</button>`).join("")}</div>
      <select id="swin" style="width:100%">${options().map((x) => `<option value="${x.d.abrev}" ${x.d.abrev === inAb ? "selected" : ""}>${esc(x.d.nombre)} · ${ageOf(x.d, yearOf(s))} años · ritmo ${x.d.ritmo} · ${x.team ? esc(x.team.team) : x.d.serie ? esc(x.d.serie) : "libre"}${x.d.debut === undefined ? " · sin experiencia en F1" : ""}</option>`).join("")}</select>
      <div class="small" style="margin:6px 0">Cuesta <b>${cost} M</b> del presupuesto de desarrollo (quedan ${left} M): romper el contrato de ${esc(mine[pick].d.nombre)}${o?.team ? ` y la cláusula de ${esc(o.d.nombre)} con ${esc(o.team.team)}, que pondrá a otro` : ""}.</div>
      <div class="btnrow" style="padding:0"><button data-close>Cancelar</button><button class="red" id="swok" ${o && cost <= left ? "" : "disabled"}>Cambiar</button></div>`;
  };
  const { el, close } = sheet(`<div id="swb">${body()}</div>`);
  const wire = () => {
    el.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = () => close()));
    el.querySelectorAll<HTMLElement>("[data-who]").forEach((b) => (b.onclick = () => { pick = Number(b.dataset.who); redraw(); }));
    el.querySelector<HTMLSelectElement>("#swin")!.onchange = (e) => { inAb = (e.target as HTMLSelectElement).value; redraw(); };
    const ok = el.querySelector<HTMLButtonElement>("#swok");
    if (ok) ok.onclick = () => {
      const o = options().find((x) => x.d.abrev === inAb)!;
      const out = mine[pick];
      const cost = midSwapCost(s, out.d, o.d, !!o.team);
      if (s.dev) s.dev.budget = Math.round((s.dev.budget - cost) * 10) / 10;
      let rest = poolOf(s, taken).filter((d) => d.abrev !== o.d.abrev);
      const swaps: SeatSwap[] = [{ round: s.round, seat: out.seat, in: o.d, out: out.d, why: "fichaje" }];
      let txt = `✍️ Fichas a ${o.d.nombre}${o.team ? ` de ${o.team.team}` : ""} en lugar de ${out.d.nombre} (${cost} M).`;
      if (o.team) {
        // su equipo pone al mejor libre que quede
        const sub = rest.sort((a, b) => rating(b) - rating(a))[0];
        if (sub) { swaps.push({ round: s.round, seat: o.team.seat, in: sub, out: o.d, why: "sustituto" }); rest = rest.filter((d) => d !== sub); txt += ` ${o.team.team} sube a ${sub.nombre}.`; }
      }
      rest.push(out.d);
      s.swaps = [...(s.swaps ?? []), ...swaps];
      s.pool = rest;
      if (s.contracts) s.contracts[o.d.abrev] = Math.max(s.contracts[o.d.abrev] ?? 0, yearOf(s));
      if (s.salaries) s.salaries[o.d.abrev] = salaryFor(o.d);
      syncMine(s);
      close();
      onDone(txt);
    };
  };
  const redraw = () => { el.querySelector("#swb")!.innerHTML = body(); wire(); };
  wire();
}

/** Los cambios de piloto de esta temporada, para la pantalla de temporada. */
export function swapsPanel(s: SeasonState): string {
  const sw = s.swaps ?? [];
  if (!sw.length) return "";
  const cal = calendarOf(s);
  return `<div class="panel"><div class="hd"><span class="t">Cambios de pilotos</span></div><div class="bd small">${sw.map((x) => `<div>R${x.round + 1} · ${esc(x.in.nombre)} por ${esc(x.out.nombre)} <span class="dim">(${esc(x.why)}${x.round >= s.round && x.round < cal.length ? ", próxima" : ""})</span></div>`).join("")}</div></div>`;
}
