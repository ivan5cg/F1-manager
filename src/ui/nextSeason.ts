// Fin de temporada y paso a la siguiente: lo que ha pasado, los objetivos, tus pilotos (renovar o cambiar) y el
// mercado de los demás (career.ts).
import { BASE_TEAMS, MARKET, DRIVERS, TEAMS, CALENDARS, calendarOf, gridOf } from "./data";
import { $, esc, setBack } from "./common";
import type { SeasonState } from "../sim/season";
import { driverStandings, teamStandings } from "../sim/season";
import { objectiveStatus } from "../sim/objectives";
import { offSeason, initialContracts, rating, ageOf, FIRST_YEAR, objectivesBonus, SeasonRecord, CAR_CARRY, OBJ_BONUS, OBJ_MALUS } from "../sim/career";
import { publicDriver, trueTech, NEW_TEAM, PLAYER_TEAM_ID } from "../sim/market";
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
  const ch = DRIVERS[ds[0].id];
  const tp = ts.findIndex((x) => x.team.id === s.playerTeam);
  return {
    year: yearOf(s),
    champion: { nombre: ch.d.nombre, equipo: ch.team.nombre, puntos: ds[0].points },
    constructores: { equipo: ts[0].team.nombre, puntos: ts[0].points },
    mine: {
      equipo: ts[tp].team.nombre, pos: tp + 1, puntos: ts[tp].points,
      pilotos: ds.map((x, i) => ({ x, i })).filter(({ x }) => DRIVERS[x.id].team.id === s.playerTeam).map(({ x, i }) => ({ nombre: DRIVERS[x.id].d.nombre, pos: i + 1, puntos: x.points })),
    },
    objetivos: objectivesDone(s),
    carreras: calendarOf(s).length,
  };
}

/** Cómo es ahora un piloto (por su abreviatura), esté donde esté. */
function driverNow(s: SeasonState, abrev: string): DriverDef {
  for (const t of s.grid ?? []) { const d = t.pilotos.find((p) => p.abrev === abrev); if (d) return d; }
  const m = s.misPilotos?.find((p) => p.abrev === abrev) ?? s.pool?.find((p) => p.abrev === abrev);
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
  const mine = custom ? s.equipo!.pilotos.map((a) => driverNow(s, a)) : (base.find((t) => t.id === s.playerTeam)?.pilotos ?? []).map((d) => driverNow(s, d.abrev));
  return { ai, mine, fin };
}

/** Pilotos libres: el grupo de la temporada o, en la primera, los reservas y libres del mercado. */
function poolOf(s: SeasonState, taken: Set<string>): DriverDef[] {
  const p = s.pool ?? MARKET.pilotos.filter((x) => x.rol !== "titular").map((x) => publicDriver(MARKET, BASE_TEAMS, x.abrev));
  return p.filter((d) => !taken.has(d.abrev));
}

/** La temporada siguiente, con tus decisiones sobre tus pilotos. */
export function buildNextSeason(s: SeasonState, choices: { keep: boolean; sign?: string }[]): SeasonState {
  const y = yearOf(s) + 1;
  const { ai, mine, fin } = rosters(s);
  const taken = new Set([...ai.flatMap((t) => t.pilotos.map((d) => d.abrev)), ...mine.map((d) => d.abrev)]);
  const allTeams = [...ai, { ...ai[0], id: "_mios", pilotos: mine }];
  const contracts = s.contracts ?? initialContracts(allTeams, yearOf(s), s.seed);
  const meanAgarre = BASE_TEAMS.reduce((a, t) => a + t.agarre, 0) / BASE_TEAMS.length;
  const out = offSeason({
    year: y, seed: s.seed, final: fin, base: ai, meanAgarre, pool: poolOf(s, taken), contracts,
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
    year: y, trueSeed: s.trueSeed ?? s.seed, pool: out.pool, contracts: out.contracts, news: out.news,
    history: [...(s.history ?? []), rec],
    devBonus: rec.objetivos.length ? objectivesBonus(done, rec.objetivos.length) : 0,
    aviso: rec.objetivos.length && done === 0 ? (s.aviso ?? 0) + 1 : 0,
  };
  if (s.equipo) {
    next.equipo = { ...s.equipo, pilotos: out.mine.map((d) => d.abrev) };
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
  const pool = poolOf(s, taken).sort((a, b) => rating(b) - rating(a)).slice(0, 12);
  const done = rec.objetivos.filter((o) => o.done).length;
  const bonus = rec.objetivos.length ? objectivesBonus(done, rec.objetivos.length) : 0;
  const warn = rec.objetivos.length && done === 0 && (s.aviso ?? 0) >= 1;
  const choices = mine.map(() => ({ keep: true, sign: undefined as string | undefined }));
  const card = (d: DriverDef, i: number) => {
    const until = contracts[d.abrev] ?? y;
    const ends = until <= y;
    const c = choices[i];
    return `<div class="list-item" style="display:block">
      <div class="row"><b class="grow">${esc(d.nombre)}</b><span class="small dim">${ageOf(d, y + 1)} años en ${y + 1} · ritmo ${d.ritmo}</span></div>
      <div class="small ${ends ? "yellow" : "dim"}">${ends ? `Se le acaba el contrato.` : `Con contrato hasta ${until}.`}</div>
      ${ends ? `<div class="seg" style="margin-top:4px"><button data-keep="${i}" class="${c.keep ? "on" : ""}">Renovar</button><button data-swap="${i}" class="${c.keep ? "" : "on"}">Cambiar</button></div>
      ${c.keep ? "" : `<select data-sign="${i}" style="width:100%">${pool.filter((p) => !choices.some((o, j) => j !== i && !o.keep && o.sign === p.abrev)).map((p) => `<option value="${p.abrev}" ${c.sign === p.abrev ? "selected" : ""}>${esc(p.nombre)} · ${ageOf(p, y + 1)} años · ritmo ${p.ritmo}${p.debut === undefined ? " · sin experiencia en F1" : ""}</option>`).join("")}</select>`}` : ""}
    </div>`;
  };
  const render = () => {
    app().innerHTML = `<div style="padding-bottom:16px">
      <div class="panel"><div class="hd"><span class="t">Fin de la temporada ${y}</span><button id="back">Temporada</button></div><div class="bd">
        <div>🏆 Campeón: <b>${esc(rec.champion.nombre)}</b> (${esc(rec.champion.equipo)}, ${rec.champion.puntos} pts) · constructores: <b>${esc(rec.constructores.equipo)}</b></div>
        <div class="small" style="margin-top:4px">${esc(rec.mine.equipo)}: ${rec.mine.pos}.º de constructores · ${rec.mine.pilotos.map((p) => `${esc(p.nombre)} ${p.pos}.º`).join(" · ")}</div>
      </div></div>
      ${rec.objetivos.length ? `<div class="panel"><div class="hd"><span class="t">La directiva</span><span class="small">${done} de ${rec.objetivos.length} objetivos</span></div><div class="bd small">
        ${rec.objetivos.map((o) => `<div>${o.done ? "✅" : "❌"} ${esc(o.text)}</div>`).join("")}
        <div style="margin-top:6px">Presupuesto de desarrollo para ${y + 1}: <b class="${bonus >= 0 ? "green" : "redt"}">${bonus >= 0 ? "+" : "−"}${Math.abs(bonus)} M</b> (${OBJ_BONUS} M más por cada objetivo cumplido y ${OBJ_MALUS} M menos por cada uno fallado).</div>
        ${warn ? `<div class="redt" style="margin-top:6px">⚠️ Segunda temporada seguida sin cumplir ningún objetivo: la directiva avisa de que el jefe de equipo peligra.</div>` : done === 0 && rec.objetivos.length ? `<div class="yellow" style="margin-top:6px">La directiva no está nada contenta.</div>` : ""}
      </div></div>` : ""}
      <div class="panel"><div class="hd"><span class="t">Tus pilotos para ${y + 1}</span></div><div class="bd" style="padding:0">${mine.map(card).join("")}
        <div class="small dim" style="padding:6px 10px">Con los años, los jóvenes ganan ritmo y oficio y los mayores pierden algo de ritmo; alguno se retira. Los demás equipos renuevan o fichan por su cuenta, y suben novatos.</div>
      </div></div>
      <div class="sticky-cta"><button class="red big-cta" id="go">Empezar la temporada ${y + 1}</button></div>
    </div>`;
    setBack(onBack);
    $("#back").onclick = onBack;
    document.querySelectorAll<HTMLElement>("[data-keep]").forEach((b) => (b.onclick = () => { choices[Number(b.dataset.keep)].keep = true; render(); }));
    document.querySelectorAll<HTMLElement>("[data-swap]").forEach((b) => (b.onclick = () => {
      const c = choices[Number(b.dataset.swap)];
      c.keep = false;
      c.sign = pool.find((p) => !choices.some((o) => o !== c && !o.keep && o.sign === p.abrev))?.abrev;
      render();
    }));
    document.querySelectorAll<HTMLSelectElement>("[data-sign]").forEach((el) => (el.onchange = () => { choices[Number(el.dataset.sign)].sign = el.value; render(); }));
    $("#go").onclick = () => onDone(buildNextSeason(s, choices));
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
