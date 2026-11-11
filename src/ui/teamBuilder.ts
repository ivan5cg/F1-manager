// Modo «crear equipo»: pantalla de fichajes, panel de tu equipo y panel de unidades de potencia.
import { BASE_TEAMS, MARKET, ROUNDS, getTrack } from "./data";
import { $, esc, setBack } from "./common";
import type { TeamDef } from "../sim/session";
import type { SeasonState } from "../sim/season";
import type { WeekendState } from "../sim/weekend";
import {
  CustomTeam, MarketBoss, MarketDriver, MarketEngine, MarketTech, buildGrid, costOf, clauseOf, priceOf, publicDriver, trueDriver,
  trueBoss, trueTech, trueEngine, band, DRIVER_BAND_SD, devBudgetMult, NEW_TEAM, PLAYER_TEAM_ID, devMean,
} from "../sim/market";
import { PU_QUOTA, PU_PENALTY, PU_LIFE_KM, PU_WEEKEND_KM, puLife, puPowerLoss, puRaceRisk, fitUnit, PuState } from "../sim/powerunit";

const app = () => document.getElementById("app")!;
const M = MARKET;
const fmtM = (x: number) => `${Number.isInteger(x) ? x : x.toFixed(1).replace(".", ",")} M`;
const fx = (x: number, d = 0) => x.toFixed(d).replace(".", ",");
const teamName = (id: string | null) => (id ? BASE_TEAMS.find((t) => t.id === id)?.nombre ?? id : "");
const ROLE: Record<string, string> = { titular: "titular", reserva: "reserva", libre: "libre" };
export const COLORS = ["#FFD60A", "#FF6B00", "#E10600", "#E91E63", "#8E24AA", "#1E88E5", "#00ACC1", "#43A047", "#F5F5F5", "#8D6E63"];

/** Una barra con la horquilla del informe sobre su escala (mejor a la derecha). */
function bar(label: string, lo: number, hi: number, min: number, max: number, txt: string): string {
  const p = (x: number) => Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100));
  const a = p(lo), b = p(hi);
  const l = Math.min(a, b), w = Math.max(2, Math.abs(b - a));
  return `<div class="bandrow"><span class="bl">${label}</span><span class="bandbar"><i style="left:${l}%;width:${w}%"></i></span><span class="bv mono">${txt}</span></div>`;
}
const rng2 = ([a, b]: [number, number], d = 0) => (fx(a, d) === fx(b, d) ? fx(a, d) : `${fx(a, d)}–${fx(b, d)}`);
/** Rondas de evoluciones hasta la última carrera (la primera se corre con el coche de salida). */
const DEV_ROUNDS = ROUNDS.length - 1;
/** Lo que vale 1 punto de agarre en una vuelta de 90 s. */
const SEC_PER_GRIP = 90 / 180;

// ------------------------------------------------------------------ informes de cada elemento
function driverBars(abrev: string, inc: number, real?: ReturnType<typeof trueDriver>, seen = 0): string {
  const pub = publicDriver(M, BASE_TEAMS, abrev);
  const b = (k: "ritmo" | "neumaticos" | "lluvia" | "regularidad") => band(pub[k], real ? real[k] : pub[k], DRIVER_BAND_SD[k] * inc, seen);
  return bar("Ritmo", ...b("ritmo"), 72, 99, rng2(b("ritmo"))) + bar("Regular.", ...b("regularidad"), 72, 99, rng2(b("regularidad"))) + bar("Neumát.", ...b("neumaticos"), 72, 99, rng2(b("neumaticos"))) + bar("Lluvia", ...b("lluvia"), 72, 99, rng2(b("lluvia")));
}
function bossBars(j: MarketBoss, real?: MarketBoss, seen = 0): string {
  const e = band(j.estrategia, real?.estrategia ?? j.estrategia, 3 * j.inc, seen);
  const m = band(j.meteo, real?.meteo ?? j.meteo, 3 * j.inc, seen);
  const bx = band(j.boxes + NEW_TEAM.boxes, (real?.boxes ?? j.boxes) + NEW_TEAM.boxes, 0.04 * j.inc, seen);
  return bar("Estrategia", ...e, 60, 99, rng2(e)) + bar("Meteo", ...m, 60, 99, rng2(m)) + bar("Parada", bx[1], bx[0], 2.75, 2.15, `${rng2(bx, 2)} s`);
}
function techBars(t: MarketTech, real?: MarketTech, seen = 0, mult = 1): string {
  // coche: lo que le sacaría a la media de la parrilla (equipo nuevo incluido), en s por vuelta de 90 s
  const car = band(t.diseno + NEW_TEAM.agarre, (real?.diseno ?? t.diseno) + NEW_TEAM.agarre, 0.25 * t.inc, seen).map((x) => -x * SEC_PER_GRIP) as [number, number];
  const dev = band(t.desarrollo * mult, (real?.desarrollo ?? t.desarrollo) * mult, t.desarrollo * 0.15 * t.inc * mult, seen).map((x) => -(x - devMean(M)) * SEC_PER_GRIP * DEV_ROUNDS) as [number, number];
  const tyre = band(t.desgaste, real?.desgaste ?? t.desgaste, 0.01 * t.inc, seen).map((x) => (x - 1) * 100) as [number, number];
  const sg = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + fx(Math.abs(x), 1);
  const rs = ([a, b]: [number, number], u = "") => { const lo = Math.min(a, b), hi = Math.max(a, b); return `${sg(lo)}${u} a ${sg(hi)}${u}`; };
  return bar("Coche", car[1], car[0], 1.2, -1.2, `${rs(car)} s`) + bar("Desarrollo", dev[1], dev[0], 0.6, -0.6, `${rs(dev)} s`) + bar("Desg. neum.", tyre[1], tyre[0], 6, -6, `${rs(tyre, " %")}`);
}
let refSpp = 0;
function engineBars(e: MarketEngine, real?: MarketEngine, seen = 0): string {
  // potencia: segundos por vuelta frente al motor medio, en un circuito de referencia (Silverstone)
  if (!refSpp) refSpp = secPerPower("silverstone");
  const mean = M.motores.reduce((a, x) => a + x.potencia, 0) / M.motores.length;
  const p = band(e.potencia, real?.potencia ?? e.potencia, 0.2 * e.inc, seen).map((x) => -(x - mean) * 0.6 * refSpp) as [number, number];
  const f = band(e.fiabilidad, real?.fiabilidad ?? e.fiabilidad, e.fiabilidad * 0.06 * e.inc, seen);
  const sg = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + fx(Math.abs(x), 2);
  return bar("Potencia", p[1], p[0], 0.25, -0.25, `${sg(Math.min(...p))} a ${sg(Math.max(...p))} s`) + bar("Averías", f[1], f[0], 1.7, 0.8, `×${rng2(f, 2)}`);
}
const incDots = (inc: number) => `<span class="dim small" title="Lo que se sabe de él">${inc <= 1 ? "●●●" : inc <= 2 ? "●●○" : "●○○"}</span>`;
const priceHtml = (x: { equipo: string | null; salario: number; rol?: "titular" | "reserva" | "libre" }) => {
  const c = clauseOf(x);
  return `<div class="price"><b class="mono">${fmtM(priceOf(x))}</b>${c ? `<span class="small dim">${fmtM(x.salario)} + ${fmtM(c)} cláusula</span>` : `<span class="small dim">sin cláusula</span>`}</div>`;
};

// ------------------------------------------------------------------ pantalla de fichajes
export function builderScreen(onCancel: () => void, onCreate: (spec: CustomTeam) => void) {
  const spec: CustomTeam = { nombre: "Escudería Muro", color: COLORS[0], pilotos: [], jefe: "", tecnico: "", motor: "" };
  let tab: "pilotos" | "jefe" | "tecnico" | "motor" = "pilotos";
  let filt: "todos" | "titular" | "reserva" | "libre" = "todos";
  const render = () => {
    const cost = costOf(M, spec);
    const left = M.techo - cost;
    const over = left < 0;
    const complete = spec.pilotos.length === 2 && spec.jefe && spec.tecnico && spec.motor;
    const mult = complete ? devBudgetMult(M, spec as CustomTeam) : 0.7 + 0.6 * Math.min(1, Math.max(0, left) / 50);
    const changes = spec.pilotos.length || spec.jefe || spec.tecnico ? buildGrid(BASE_TEAMS, M, spec, 1, 0).changes : [];
    const drivers = M.pilotos.filter((p) => filt === "todos" || p.rol === filt).sort((a, b) => priceOf(b) - priceOf(a));
    const item = (key: string, sel: boolean, title: string, sub: string, body: string, price: string) =>
      `<div class="mk${sel ? " on" : ""}" data-pick="${esc(key)}"><div class="mkh"><span class="chk">${sel ? "✔" : ""}</span><div class="grow"><b>${title}</b><br><span class="small dim">${sub}</span></div>${price}</div>${body}</div>`;
    let list = "";
    if (tab === "pilotos") {
      list = `<div class="row wrap" style="gap:4px;padding:6px 8px">${(["todos", "titular", "reserva", "libre"] as const).map((f) => `<button class="${filt === f ? "on" : ""}" data-filt="${f}">${f === "todos" ? "Todos" : f === "titular" ? "Titulares" : f === "reserva" ? "Reservas" : "Libres"}</button>`).join("")}</div>` +
        drivers.map((p) => {
          const d = publicDriver(M, BASE_TEAMS, p.abrev);
          return item(p.abrev, spec.pilotos.includes(p.abrev), `#${d.numero} ${esc(d.nombre)}`, `${p.equipo ? `${esc(teamName(p.equipo))} · ${ROLE[p.rol]}` : "sin equipo"} ${incDots(p.inc)}${p.nota ? ` · <i>${esc(p.nota)}</i>` : ""}`, driverBars(p.abrev, p.inc), priceHtml(p));
        }).join("");
    } else if (tab === "jefe") {
      list = M.jefes.slice().sort((a, b) => priceOf(b) - priceOf(a)).map((j) => item(j.nombre, spec.jefe === j.nombre, esc(j.nombre), `${j.equipo ? esc(teamName(j.equipo)) : "sin equipo"} ${incDots(j.inc)}${j.nota ? ` · <i>${esc(j.nota)}</i>` : ""}`, bossBars(j), priceHtml(j))).join("");
    } else if (tab === "tecnico") {
      list = M.tecnicos.slice().sort((a, b) => priceOf(b) - priceOf(a)).map((t) => item(t.nombre, spec.tecnico === t.nombre, esc(t.nombre), `${t.equipo ? esc(teamName(t.equipo)) : "sin equipo"} ${incDots(t.inc)}${t.nota ? ` · <i>${esc(t.nota)}</i>` : ""}`, techBars(t, undefined, 0, mult), priceHtml(t))).join("");
      list = `<div class="small dim" style="padding:6px 10px">Coche: segundos por vuelta frente a la media de la parrilla con su diseño, ya contando que un equipo nuevo empieza con desventaja (− es más rápido). Desarrollo: lo que habrá ganado o perdido frente a la media al llegar a la última carrera (${DEV_ROUNDS} rondas de evoluciones), con tu presupuesto. Desg. neum.: cuánto más (+) o menos (−) gasta los neumáticos.</div>` + list;
    } else {
      list = `<div class="small dim" style="padding:6px 10px">Potencia: segundos por vuelta en Silverstone frente al motor medio (− es más rápido). Averías: multiplicador de la probabilidad de avería (×1 normal). Lo real del motor vale para todos sus clientes.</div>` + M.motores.map((e) => item(e.id, spec.motor === e.id, esc(e.nombre), `${BASE_TEAMS.filter((t) => t.motor === e.nombre).map((t) => esc(t.nombre)).join(", ")} ${incDots(e.inc)}`, engineBars(e), `<div class="price"><b class="mono">${fmtM(e.precio)}</b><span class="small dim">por temporada</span></div>`)).join("");
    }
    const need = [spec.pilotos.length < 2 ? `${2 - spec.pilotos.length} piloto${spec.pilotos.length ? "" : "s"}` : "", !spec.jefe ? "jefe de equipo" : "", !spec.tecnico ? "director técnico" : "", !spec.motor ? "motor" : ""].filter(Boolean);
    const tabs: [typeof tab, string, string][] = [["pilotos", "Pilotos", `${spec.pilotos.length}/2`], ["jefe", "Jefe", spec.jefe ? "✔" : ""], ["tecnico", "Técnico", spec.tecnico ? "✔" : ""], ["motor", "Motor", spec.motor ? "✔" : ""]];
    app().innerHTML = `<div style="padding-bottom:80px">
      <div class="panel"><div class="hd"><span class="t">Crea tu equipo</span><button id="cancel">Volver</button></div><div class="bd">
        <div class="row" style="gap:6px"><input id="tname" maxlength="24" value="${esc(spec.nombre)}" class="grow" aria-label="Nombre del equipo"></div>
        <div class="row wrap" style="gap:6px;margin-top:8px">${COLORS.map((c) => `<button class="swatch${spec.color === c ? " on" : ""}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}</div>
        <div class="budget${over ? " over" : ""}"><div class="row"><b class="grow">Techo de gasto</b><b class="mono">${fmtM(cost)} / ${fmtM(M.techo)}</b></div>
          <div class="progress"><i style="width:${Math.min(100, (cost / M.techo) * 100)}%"></i></div>
          <div class="small ${over ? "redt" : "dim"}">${over ? `Te pasas ${fmtM(-left)}.` : `Quedan ${fmtM(left)} para evoluciones: el coche se desarrolla ×${fx(mult, 2)} de rápido que con el presupuesto normal.`}</div></div>
        <div class="small dim" style="margin-top:6px">Los informes son horquillas: el valor real de cada uno puede caer dentro o algo fuera, y no se sabe hasta verlo en pista (●●● muy conocido, ●○○ casi desconocido). El precio va por la fama y el contrato, no por lo que rinde de verdad. Fichar a alguien de otro equipo cuesta su cláusula, y ese equipo tira de su reserva o de un interino.</div>
      </div></div>
      ${changes.length ? `<div class="panel"><div class="hd"><span class="t">Así cambia la parrilla</span></div><div class="bd small">${changes.map((c) => `${esc(c.team)}: ${c.what === "piloto" ? `${esc(c.in)} sustituye a ${esc(c.out)}` : `un interino sustituye a ${esc(c.out)} (${c.what === "jefe" ? "jefe de equipo" : "director técnico: se desarrollarán más despacio"})`}`).join("<br>")}</div></div>` : ""}
      <div class="tabs4">${tabs.map(([k, n, s]) => `<button class="${tab === k ? "on" : ""}" data-tab="${k}">${n} <span class="small">${s}</span></button>`).join("")}</div>
      <div class="panel"><div class="bd" style="padding:0">${list}</div></div>
      <div class="sticky-cta"><button class="red big-cta" id="go" ${complete && !over ? "" : "disabled"}>${complete && !over ? `Fichar y empezar la temporada · ${fmtM(cost)}` : over ? `Te pasas del techo en ${fmtM(-left)}` : `Falta: ${need.join(", ")}`}</button></div>
    </div>`;
    $("#cancel").onclick = onCancel;
    $<HTMLInputElement>("#tname").oninput = (e) => { spec.nombre = (e.target as HTMLInputElement).value; };
    document.querySelectorAll<HTMLElement>("[data-color]").forEach((b) => (b.onclick = () => { spec.color = b.dataset.color!; render(); }));
    document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab as typeof tab; render(); }));
    document.querySelectorAll<HTMLElement>("[data-filt]").forEach((b) => (b.onclick = () => { filt = b.dataset.filt as typeof filt; render(); }));
    document.querySelectorAll<HTMLElement>("[data-pick]").forEach((el) => (el.onclick = () => {
      const k = el.dataset.pick!;
      if (tab === "pilotos") {
        if (spec.pilotos.includes(k)) spec.pilotos = spec.pilotos.filter((x) => x !== k);
        else if (spec.pilotos.length < 2) spec.pilotos.push(k);
        else spec.pilotos = [spec.pilotos[1], k];
      } else if (tab === "jefe") spec.jefe = spec.jefe === k ? "" : k;
      else if (tab === "tecnico") spec.tecnico = spec.tecnico === k ? "" : k;
      else spec.motor = spec.motor === k ? "" : k;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }));
    $("#go").onclick = () => {
      if (!(complete && !over)) return;
      spec.nombre = spec.nombre.trim() || "Escudería Muro";
      onCreate({ ...spec, pilotos: [...spec.pilotos] });
    };
  };
  setBack(onCancel);
  render();
}

// ------------------------------------------------------------------ tu equipo (temporada)
/** Lo que sabe tu equipo de sus fichajes: las horquillas se estrechan hacia lo real con cada carrera. */
export function myTeamPanel(s: SeasonState, teams: TeamDef[]): string {
  const spec = s.equipo;
  if (!spec) return "";
  const seen = s.rounds.length;
  const me = teams.find((t) => t.id === PLAYER_TEAM_ID)!;
  const j = M.jefes.find((x) => x.nombre === spec.jefe)!;
  const t = M.tecnicos.find((x) => x.nombre === spec.tecnico)!;
  const e = M.motores.find((x) => x.id === spec.motor)!;
  const mult = devBudgetMult(M, spec);
  const drivers = spec.pilotos.map((a) => {
    const md = M.pilotos.find((p) => p.abrev === a)!;
    const d = publicDriver(M, BASE_TEAMS, a);
    return `<div class="mkh" style="margin-top:6px"><b class="grow">#${d.numero} ${esc(d.nombre)}</b>${incDots(md.inc)}</div>${driverBars(a, md.inc, trueDriver(M, BASE_TEAMS, a, s.seed), seen)}`;
  }).join("");
  const rank = 1 + teams.filter((x) => x.id !== PLAYER_TEAM_ID && x.agarre > me.agarre).length;
  return `<div class="panel"><div class="hd"><span class="t">${esc(spec.nombre)} · lo que sabéis</span></div><div class="bd">
    <div class="small dim">Gasto ${fmtM(costOf(M, spec))} de ${fmtM(M.techo)} · desarrollo ×${fx(mult, 2)}. ${seen ? `Tras ${seen} carrera${seen > 1 ? "s" : ""} los datos afinan las horquillas.` : "Antes de rodar solo hay los informes del mercado."}</div>
    ${drivers}
    <div class="mkh" style="margin-top:8px"><b class="grow">Jefe de equipo: ${esc(j.nombre)}</b>${incDots(j.inc)}</div>${bossBars(j, trueBoss(j, s.seed), seen)}
    <div class="mkh" style="margin-top:8px"><b class="grow">Director técnico: ${esc(t.nombre)}</b>${incDots(t.inc)}</div>${techBars(t, trueTech(t, s.seed), seen, mult)}
    <div class="mkh" style="margin-top:8px"><b class="grow">Motor ${esc(e.nombre)}</b>${incDots(e.inc)}</div>${engineBars(e, trueEngine(e, s.seed), seen)}
    ${seen ? `<div class="small" style="margin-top:6px">Por agarre, vuestro coche es ahora el ${rank}.º de ${teams.length} según los datos de pista.</div>` : ""}
  </div></div>`;
}

// ------------------------------------------------------------------ unidades de potencia
/** Segundos por vuelta que vale una unidad de potencia en este circuito. */
function secPerPower(circuitId: string): number {
  return getTrack(circuitId).ms.reduce((a, m) => a + m.dPower, 0);
}

export function puSummary(pu: Record<number, PuState> | undefined, ids: number[], names: string[]): string {
  if (!pu) return "";
  return ids.map((id, k) => {
    const p = pu[id];
    if (!p) return "";
    return `<div class="row small" style="gap:6px;margin-top:3px"><b style="width:44px">${esc(names[k])}</b><span class="grow">${p.units.map((u, i) => `<span class="pill${i === p.cur ? " yellow" : ""}" style="${u.broken ? "opacity:.45;text-decoration:line-through" : ""}">U${i + 1} ${Math.round(puLife(u.km) * 100)} %</span>`).join(" ")}</span><span class="dim">${Math.min(p.units.length, PU_QUOTA)}/${PU_QUOTA} del cupo${p.units.length > PU_QUOTA ? ` <span class="redt">+${p.units.length - PU_QUOTA}</span>` : ""}</span></div>`;
  }).join("");
}

/** Panel del fin de semana: qué unidad lleva cada piloto, con lo que pierde y su riesgo; se elige antes de Libres 1. */
export function puPanel(st: WeekendState, ids: number[], names: string[], team: TeamDef, laps: number, lapKm: number): string {
  if (!st.pu) return "";
  const editable = st.next === 0;
  const spp = secPerPower(st.circuitId);
  const rows = ids.map((id, k) => {
    const p = st.pu![id];
    const base = p.base ?? p.units.length;
    const opts = p.units.map((u, i) => ({ u, i })).filter(({ u, i }) => !u.broken && (i < base || i === p.cur));
    const newIdx = p.units.findIndex((u, i) => i >= base && !u.broken);
    const nextNewExtra = (newIdx >= 0 ? newIdx : p.units.length) >= PU_QUOTA;
    const line = (km: number, i: number | "new", label: string) => {
      const u = puLife(km);
      const on = i === "new" ? p.cur >= base : i === p.cur;
      const loss = puPowerLoss(u + 300 / PU_LIFE_KM) * spp;
      const risk = puRaceRisk(km + 300, team.fiabilidad, laps, lapKm);
      return `<div class="puopt${on ? " on" : ""}"${editable ? ` data-pu="${id}" data-u="${i}"` : ""}><span class="chk">${on ? "✔" : ""}</span><b style="width:76px">${label}</b><span class="grow small">${Math.round(u * 100)} % de vida · ${loss < 0.005 ? "sin pérdida" : `−${fx(loss, 2)} s/v`} · avería en carrera ~${fx(risk * 100, risk < 0.1 ? 1 : 0)} %</span></div>`;
    };
    const fresh = !opts.some(({ i }) => i >= base);
    return `<div style="margin-bottom:8px"><div class="row"><b class="grow">${esc(names[k])}</b><span class="small dim">${Math.min(p.units.length, PU_QUOTA)} de ${PU_QUOTA} del cupo usadas</span></div>
      ${opts.filter(({ i }) => i < base).map(({ u, i }) => line(u.km, i, `Unidad ${i + 1}`)).join("")}
      ${editable || p.cur >= base ? line(p.cur >= base ? p.units[p.cur].km : 0, "new", fresh && !editable ? "" : `Nueva (U${(newIdx >= 0 ? newIdx : p.units.length) + 1})`) : ""}
      ${(editable || p.cur >= base) && nextNewExtra ? `<div class="small ${p.cur >= base ? "redt" : "dim"}">Una nueva está fuera del cupo: ${PU_PENALTY} puestos de sanción en la parrilla de la carrera.</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="panel"><div class="hd"><span class="t">Unidades de potencia</span></div><div class="bd">
    ${rows}
    <div class="small dim">Vida nominal ~${fx(PU_LIFE_KM / 1000, 1)} mil km (un fin de semana gasta ~${PU_WEEKEND_KM}; el modo de motor alto la gasta un 60 % más deprisa y el de ahorro un 25 % menos). Con el desgaste pierde potencia (s/v en este circuito, a mitad de fin de semana) y se rompe más. ${editable ? "El equipo propone la marcada; se puede cambiar hasta Libres 1." : "Ya está montada para este fin de semana."} Una unidad rota no se puede volver a usar.</div>
  </div></div>`;
}

/** Engancha los botones del panel de unidades: cambia la unidad y vuelve a dibujar. */
export function wirePu(st: WeekendState, onChange: () => void) {
  document.querySelectorAll<HTMLElement>("[data-pu]").forEach((el) => (el.onclick = () => {
    const p = st.pu?.[Number(el.dataset.pu)];
    if (!p || st.next !== 0) return;
    fitUnit(p, el.dataset.u === "new" ? "new" : Number(el.dataset.u));
    onChange();
  }));
}

export { PLAYER_TEAM_ID };
