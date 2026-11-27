#!/usr/bin/env python3
"""
Extrae métricas reales de calibración de la temporada 2026 a partir de los Parquet
descargados por scripts/descarga_f1.py y las compara con data/circuitos/*.json.

Calcula por cada GP:
  - Pole real 2026 (Q) vs poleObjetivo del simulador
  - Clima real en carrera (temp. asfalto/aire, lluvia)
  - Pérdida neta real en boxes vs boxes.perdida del simulador
  - Estrategias reales (distribución de paradas, combinaciones más usadas, vida media/máx por compuesto)
  - Degradación real por compuesto (s/vuelta corregida por combustible) en aire limpio y bandera verde
  - Delta real entre compuestos (M-S y H-M) a combustible corregido y baja edad de goma
  - Efecto de aire sucio (< 1.5 s vs > 2.5 s) usando intervals.parquet

Uso:
  python scripts/calibracion_real.py
  python scripts/calibracion_real.py --gp melbourne,silverstone,spa,monza
  python scripts/calibracion_real.py --json datos-reales/2026/calibracion_resumen.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "datos-reales"
CIRCUITS_DIR = ROOT / "data" / "circuitos"

COMPOUND_SHORT = {
    "SOFT": "S",
    "MEDIUM": "M",
    "HARD": "H",
    "INTERMEDIATE": "I",
    "WET": "W",
}


def load_circuit_cfg(circuit_id: str) -> dict[str, Any]:
    path = CIRCUITS_DIR / f"{circuit_id}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def sc_vsc_red_laps(rc: pd.DataFrame) -> set[int]:
    """Devuelve vueltas afectadas por Safety Car, VSC o Bandera Roja (con +1 vuelta de margen)."""
    if rc is None or rc.empty:
        return set()
    bad: set[int] = set()
    cat = rc.get("category", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
    flag = rc.get("flag", pd.Series(dtype=str)).fillna("").astype(str).str.upper()
    msg = rc.get("message", pd.Series(dtype=str)).fillna("").astype(str).str.upper()

    mask = (
        cat.str.contains("SAFETYCAR", na=False)
        | flag.isin(["RED", "DOUBLE YELLOW"])
        | msg.str.contains("SAFETY CAR DEPLOYED|VIRTUAL SAFETY CAR DEPLOYED|RED FLAG", na=False)
    )
    for lap in rc.loc[mask, "lap_number"].dropna().astype(int):
        bad.update((lap, lap + 1))
    return bad


def attach_stints(laps: pd.DataFrame, stints: pd.DataFrame) -> pd.DataFrame:
    """Asocia cada vuelta con su stint, compuesto y tyre_age."""
    if laps.empty or stints.empty:
        return laps.assign(stint_number=np.nan, compound=None, tyre_age=np.nan, stint_len=np.nan)

    st = stints.copy()
    st["stint_len"] = st["lap_end"] - st["lap_start"] + 1
    merged = laps.merge(
        st[["driver_number", "stint_number", "lap_start", "lap_end", "compound", "tyre_age_at_start", "stint_len"]],
        on="driver_number",
        how="left",
    )
    in_stint = (merged["lap_number"] >= merged["lap_start"]) & (merged["lap_number"] <= merged["lap_end"])
    merged = merged.loc[in_stint].copy()
    merged["tyre_age"] = merged["tyre_age_at_start"].fillna(0) + (merged["lap_number"] - merged["lap_start"])
    merged["comp"] = merged["compound"].map(COMPOUND_SHORT).fillna(merged["compound"])
    return merged


def attach_dirty_air(laps: pd.DataFrame, intervals: pd.DataFrame) -> pd.DataFrame:
    """Añade la mediana del intervalo al coche de delante durante cada vuelta."""
    if laps.empty or intervals is None or intervals.empty or "date_start" not in laps.columns:
        return laps.assign(interval_med=np.nan)

    iv = intervals.copy()
    if "interval_s" not in iv.columns:
        if "interval" not in iv.columns:
            return laps.assign(interval_med=np.nan)
        iv["interval_s"] = pd.to_numeric(iv["interval"], errors="coerce")

    iv = iv[["driver_number", "date", "interval_s"]].dropna(subset=["date"]).copy()
    if iv.empty:
        return laps.assign(interval_med=np.nan)

    iv = iv.sort_values(["driver_number", "date"])
    lp = laps[["driver_number", "lap_number", "date_start", "lap_duration"]].dropna(subset=["date_start"]).copy()
    lp["date_end"] = lp["date_start"] + pd.to_timedelta(lp["lap_duration"].fillna(90.0), unit="s")

    # Emparejar cada muestra de intervalo a la vuelta en curso usando merge_asof por piloto
    meds: list[pd.DataFrame] = []
    for drv, grp_iv in iv.groupby("driver_number"):
        grp_lp = lp.loc[lp["driver_number"] == drv].sort_values("date_start")
        if grp_lp.empty:
            continue
        m = pd.merge_asof(
            grp_iv.sort_values("date"),
            grp_lp[["lap_number", "date_start", "date_end"]],
            left_on="date",
            right_on="date_start",
            direction="backward",
        )
        m = m.loc[m["date"] <= m["date_end"]]
        if not m.empty:
            agg = m.groupby("lap_number", as_index=False)["interval_s"].median()
            agg["driver_number"] = drv
            agg.rename(columns={"interval_s": "interval_med"}, inplace=True)
            meds.append(agg)

    if not meds:
        return laps.assign(interval_med=np.nan)

    med_df = pd.concat(meds, ignore_index=True)
    return laps.merge(med_df, on=["driver_number", "lap_number"], how="left")


def estimate_pit_loss(laps: pd.DataFrame, pit: pd.DataFrame, bad_laps: set[int]) -> dict[str, Any]:
    """Calcula duración en pitlane, parada estacionaria y pérdida neta real en carrera."""
    res: dict[str, Any] = {"n_pits": 0}
    if pit is None or pit.empty:
        return res

    p = pit.copy()
    # Filtrar paradas anómalas (penalizaciones largas / reparaciones / bandera roja)
    if "lane_duration" in p.columns:
        valid_lane = p["lane_duration"].dropna()
        valid_lane = valid_lane[(valid_lane > 10) & (valid_lane < 45)]
        if not valid_lane.empty:
            res["lane_med_s"] = round(float(valid_lane.median()), 2)
    if "stop_duration" in p.columns:
        valid_stop = p["stop_duration"].dropna()
        valid_stop = valid_stop[(valid_stop > 1.5) & (valid_stop < 10.0)]
        if not valid_stop.empty:
            res["stop_med_s"] = round(float(valid_stop.median()), 2)

    res["n_pits"] = int(len(p))

    # Pérdida neta en carrera (bajo bandera verde): (in_lap + out_lap) - 2 * pace_normal
    # Usa is_pit_out_lap de laps (más fiable que pit.lap_number cuando OpenF1 desalinea vueltas)
    if not laps.empty and "is_pit_out_lap" in laps.columns:
        non_pit = laps[(~laps["is_pit_out_lap"].fillna(False)) & (laps["lap_duration"].notna())]
        med_field = non_pit.groupby("lap_number")["lap_duration"].median()
        green_ref = float(med_field.iloc[1:].median()) if len(med_field) > 1 else float(med_field.median())
        green_laps = set(med_field[med_field <= green_ref * 1.05].index.astype(int))

        net_losses: list[float] = []
        lp_idx = laps.set_index(["driver_number", "lap_number"])["lap_duration"].to_dict()
        out_laps = laps[(laps["is_pit_out_lap"] == True) & (laps["lap_number"] > 2)]
        for _, row in out_laps.iterrows():
            drv = row["driver_number"]
            out_l = int(row["lap_number"])
            in_l = out_l - 1
            if in_l in bad_laps or out_l in bad_laps or in_l not in green_laps or out_l not in green_laps:
                continue
            in_t = lp_idx.get((drv, in_l))
            out_t = lp_idx.get((drv, out_l))
            refs = [lp_idx.get((drv, l)) for l in (in_l - 2, in_l - 1, out_l + 1, out_l + 2) if l in green_laps]
            refs = [float(x) for x in refs if pd.notna(x) and float(x) < green_ref * 1.06]
            if pd.notna(in_t) and pd.notna(out_t) and len(refs) >= 2:
                loss = (float(in_t) + float(out_t)) - 2.0 * float(np.median(refs))
                if 13.0 <= loss <= 33.0:
                    net_losses.append(loss)
        if net_losses:
            res["net_loss_med_s"] = round(float(np.median(net_losses)), 2)
            res["net_loss_n"] = len(net_losses)
    return res


def analyze_strategies(stints: pd.DataFrame, total_laps: int) -> dict[str, Any]:
    """Analiza paradas, combinaciones reales y duración de stints por compuesto."""
    if stints.empty or total_laps <= 0:
        return {}
    st = stints.copy()
    st["comp"] = st["compound"].map(COMPOUND_SHORT).fillna(st["compound"])
    st["stint_len"] = st["lap_end"] - st["lap_start"] + 1

    # Solo pilotos que completaron >= 85% de la carrera para estadísticas de estrategia
    max_lap_by_drv = st.groupby("driver_number")["lap_end"].max()
    finishers = max_lap_by_drv[max_lap_by_drv >= total_laps * 0.85].index
    st_fin = st.loc[st["driver_number"].isin(finishers)].sort_values(["driver_number", "stint_number"])

    stops_dist: dict[int, int] = {}
    combos: dict[str, int] = {}
    for drv, grp in st_fin.groupby("driver_number"):
        n_stops = max(0, len(grp) - 1)
        stops_dist[n_stops] = stops_dist.get(n_stops, 0) + 1
        seq = "->".join(grp["comp"].fillna("?").astype(str).tolist())
        combos[seq] = combos.get(seq, 0) + 1

    top_combos = sorted(combos.items(), key=lambda x: (-x[1], x[0]))[:4]
    avg_stops = (
        sum(k * v for k, v in stops_dist.items()) / sum(stops_dist.values())
        if stops_dist
        else None
    )

    stint_lengths: dict[str, dict[str, Any]] = {}
    for comp, grp in st.groupby("comp"):
        lens = grp["stint_len"].dropna()
        if not lens.empty:
            stint_lengths[str(comp)] = {
                "n": int(len(lens)),
                "med": round(float(lens.median()), 1),
                "p75": round(float(lens.quantile(0.75)), 1),
                "max": int(lens.max()),
            }

    return {
        "finishers": int(len(finishers)),
        "avg_stops": round(avg_stops, 2) if avg_stops is not None else None,
        "stops_dist": {str(k): v for k, v in sorted(stops_dist.items())},
        "top_strategies": [{"seq": s, "n": n} for s, n in top_combos],
        "stint_lengths": stint_lengths,
    }


def analyze_degradation_and_deltas(
    df: pd.DataFrame, total_laps: int, fuel_s_per_lap: float
) -> tuple[dict[str, Any], dict[str, float], dict[str, Any]]:
    """
    Calcula degradación pura (s/vuelta) por compuesto tras descontar combustible,
    delta relativo entre compuestos (M-S, H-M) y efecto de aire sucio.
    """
    deg_out: dict[str, Any] = {}
    deltas_out: dict[str, float] = {}
    dirty_out: dict[str, Any] = {}

    if df.empty:
        return deg_out, deltas_out, dirty_out

    w = df.copy()
    # Normalizar tiempo a carga de combustible de final de carrera (vuelta = total_laps):
    # al principio el coche pesa más -> restamos el lastre extra de combustible
    w["lap_fuel_corr"] = w["lap_duration"] - (total_laps - w["lap_number"]) * fuel_s_per_lap

    # 1. Degradación por compuesto (mediana de pendientes OLS por stint limpio >= 6 vueltas)
    for comp in ("S", "M", "H"):
        sub = w.loc[w["comp"] == comp]
        if sub.empty:
            continue
        slopes: list[float] = []
        cliff_ratios: list[float] = []
        n_laps_used = 0
        for (_, _), grp in sub.groupby(["driver_number", "stint_number"]):
            # Filtrar aire limpio si tenemos intervalos
            clean_g = grp
            if "interval_med" in grp.columns and grp["interval_med"].notna().any():
                g_air = grp.loc[(grp["interval_med"].isna()) | (grp["interval_med"] >= 1.5)]
                if len(g_air) >= 6:
                    clean_g = g_air
            if len(clean_g) < 6:
                continue
            x = clean_g["tyre_age"].to_numpy(dtype=float)
            y = clean_g["lap_fuel_corr"].to_numpy(dtype=float)
            if np.ptp(x) < 5:
                continue
            slope = float(np.polyfit(x, y, 1)[0])
            if -0.15 <= slope <= 0.45:
                slopes.append(slope)
                n_laps_used += len(clean_g)

            # Detección simple de cliff en stints largos (>= 16 vueltas)
            if len(clean_g) >= 16:
                g_sorted = clean_g.sort_values("tyre_age")
                early = g_sorted.iloc[1:9]
                late = g_sorted.iloc[-5:]
                if len(early) >= 5 and np.ptp(early["tyre_age"]) >= 4 and np.ptp(late["tyre_age"]) >= 3:
                    s_early = float(np.polyfit(early["tyre_age"], early["lap_fuel_corr"], 1)[0])
                    s_late = float(np.polyfit(late["tyre_age"], late["lap_fuel_corr"], 1)[0])
                    if s_early > 0.01:
                        cliff_ratios.append(s_late - s_early)

        if slopes:
            entry: dict[str, Any] = {
                "deg_s_per_lap": round(float(np.median(slopes)), 4),
                "p25": round(float(np.percentile(slopes, 25)), 4),
                "p75": round(float(np.percentile(slopes, 75)), 4),
                "n_stints": len(slopes),
                "n_laps": n_laps_used,
            }
            if cliff_ratios:
                entry["late_accel_s_per_lap"] = round(float(np.median(cliff_ratios)), 4)
            deg_out[comp] = entry

    # 2. Delta entre compuestos (mismo piloto, combustible corregido, goma joven tyre_age <= 8)
    young = w.loc[(w["tyre_age"] >= 1) & (w["tyre_age"] <= 8) & (w["comp"].isin(["S", "M", "H"]))]
    if not young.empty:
        piv = young.groupby(["driver_number", "comp"])["lap_fuel_corr"].median().unstack()
        for a, b, key in (("M", "S", "M_minus_S"), ("H", "M", "H_minus_M"), ("H", "S", "H_minus_S")):
            if a in piv.columns and b in piv.columns:
                diff = (piv[a] - piv[b]).dropna()
                if len(diff) >= 2:
                    deltas_out[key] = round(float(diff.median()), 3)

    # 3. Efecto aire sucio (< 1.5 s vs > 2.5 s) dentro del mismo piloto y stint
    if "interval_med" in w.columns and w["interval_med"].notna().any():
        penalties: list[float] = []
        for (_, _), grp in w.groupby(["driver_number", "stint_number"]):
            dirty = grp.loc[grp["interval_med"] < 1.5, "lap_fuel_corr"]
            clean = grp.loc[grp["interval_med"] > 2.5, "lap_fuel_corr"]
            if len(dirty) >= 2 and len(clean) >= 2:
                penalties.append(float(dirty.median() - clean.median()))
        if penalties:
            dirty_out = {
                "dirty_minus_clean_s": round(float(np.median(penalties)), 3),
                "n_stints": len(penalties),
            }

    return deg_out, deltas_out, dirty_out


def analyze_gp(gp_dir: Path) -> dict[str, Any] | None:
    r_dir = gp_dir / "R"
    meta_path = r_dir / "meta.json"
    if not meta_path.exists():
        return None

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    circuit_id = meta["circuit_id"]
    cfg = load_circuit_cfg(circuit_id)

    laps = pd.read_parquet(r_dir / "laps.parquet") if (r_dir / "laps.parquet").exists() else pd.DataFrame()
    stints = pd.read_parquet(r_dir / "stints.parquet") if (r_dir / "stints.parquet").exists() else pd.DataFrame()
    pit = pd.read_parquet(r_dir / "pit.parquet") if (r_dir / "pit.parquet").exists() else pd.DataFrame()
    weather = pd.read_parquet(r_dir / "weather.parquet") if (r_dir / "weather.parquet").exists() else pd.DataFrame()
    rc = pd.read_parquet(r_dir / "race_control.parquet") if (r_dir / "race_control.parquet").exists() else pd.DataFrame()
    intervals = pd.read_parquet(r_dir / "intervals.parquet") if (r_dir / "intervals.parquet").exists() else pd.DataFrame()

    if laps.empty:
        return None

    total_laps = int(laps["lap_number"].max())
    # Efecto combustible 2026 (~72.5 kg repartidos en la carrera * 0.025 s/kg, alineado con deg.ts)
    fuel_s_per_lap = round((72.5 / max(total_laps, 1)) * 0.025, 4)

    # Pole real de Q
    pole_real = None
    q_laps_path = gp_dir / "Q" / "laps.parquet"
    if q_laps_path.exists():
        q_laps = pd.read_parquet(q_laps_path)
        valid_q = q_laps["lap_duration"].dropna()
        valid_q = valid_q[valid_q > 50]
        if not valid_q.empty:
            pole_real = round(float(valid_q.min()), 3)

    # Clima real en carrera
    climate: dict[str, Any] = {}
    if not weather.empty:
        climate = {
            "track_temp_med": round(float(weather["track_temperature"].median()), 1),
            "air_temp_med": round(float(weather["air_temperature"].median()), 1),
            "rain_pct": round(float((weather["rainfall"].fillna(0) > 0).mean() * 100), 1),
        }

    bad_laps = sc_vsc_red_laps(rc)
    pit_info = estimate_pit_loss(laps, pit, bad_laps)
    strat_info = analyze_strategies(stints, total_laps)

    # Preparar vueltas limpias en seco
    df = attach_stints(laps, stints)
    df = attach_dirty_air(df, intervals)

    # Marcar in-laps
    pit_pairs = set(zip(pit["driver_number"], pit["lap_number"])) if not pit.empty else set()
    is_in_lap = [
        (d, l) in pit_pairs for d, l in zip(df["driver_number"], df["lap_number"])
    ]
    df["is_in_lap"] = is_in_lap

    # Filtro vueltas limpias
    med_pace = df["lap_duration"].dropna().median()
    clean = df.loc[
        (df["lap_number"] > 1)
        & (~df["is_pit_out_lap"].fillna(False))
        & (~df["is_in_lap"])
        & (~df["lap_number"].isin(bad_laps))
        & (df["lap_duration"].notna())
        & (df["lap_duration"] < med_pace * 1.07)
        & (df["comp"].isin(["S", "M", "H"]))
    ].copy()

    deg_info, deltas_info, dirty_info = analyze_degradation_and_deltas(clean, total_laps, fuel_s_per_lap)

    return {
        "round": meta["round"],
        "circuit_id": circuit_id,
        "event": meta["meeting_name"],
        "total_laps": total_laps,
        "fuel_s_per_lap": fuel_s_per_lap,
        "sim_cfg": {
            "poleObjetivo": cfg.get("poleObjetivo"),
            "abrasividad": cfg.get("abrasividad"),
            "compuestos": cfg.get("compuestos"),
            "boxes_perdida": (cfg.get("boxes") or {}).get("perdida"),
        },
        "pole_real_s": pole_real,
        "climate": climate,
        "sc_vsc_laps": len(bad_laps),
        "pit": pit_info,
        "strategies": strat_info,
        "degradation": deg_info,
        "compound_deltas_s": deltas_info,
        "dirty_air": dirty_info,
    }


def format_table(results: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    header = (
        f"{'R':>2} {'Circuito':12} {'CompSim':9} {'Abr':>4} {'Tasf':>4} {'Lluv':>4} "
        f"{'Par':>4} {'TopEstrat':12} {'PitR/Sim':>10} "
        f"{'DegS':>6} {'DegM':>6} {'DegH':>6} {'M-S':>5} {'H-M':>5}"
    )
    lines.append(header)
    lines.append("-" * len(header))

    for r in results:
        sim = r["sim_cfg"]
        comps = ",".join(sim.get("compuestos") or [])[:9]
        abr = f"{sim['abrasividad']:.2f}" if sim.get("abrasividad") is not None else "  - "
        tasf = f"{r['climate'].get('track_temp_med', float('nan')):.0f}°" if r["climate"] else "  - "
        rain = f"{r['climate'].get('rain_pct', 0):.0f}%" if r["climate"] else " - "
        avg_st = r["strategies"].get("avg_stops")
        par = f"{avg_st:.1f}" if avg_st is not None else " - "
        top_s = r["strategies"].get("top_strategies") or []
        top_str = top_s[0]["seq"][:12] if top_s else "-"

        pit_r = r["pit"].get("net_loss_med_s")
        pit_s = sim.get("boxes_perdida")
        pit_txt = f"{pit_r:.1f}/{pit_s:.0f}" if (pit_r is not None and pit_s is not None) else (
            f"{pit_r:.1f}/-" if pit_r is not None else "-"
        )

        def fmt_deg(c: str) -> str:
            d = r["degradation"].get(c)
            return f"{d['deg_s_per_lap']:+.3f}" if d else "   -  "

        ms = r["compound_deltas_s"].get("M_minus_S")
        hm = r["compound_deltas_s"].get("H_minus_M")
        ms_txt = f"{ms:+.2f}" if ms is not None else "  -  "
        hm_txt = f"{hm:+.2f}" if hm is not None else "  -  "

        lines.append(
            f"{r['round']:2d} {r['circuit_id']:12} {comps:9} {abr:>4} {tasf:>4} {rain:>4} "
            f"{par:>4} {top_str:12} {pit_txt:>10} "
            f"{fmt_deg('S'):>6} {fmt_deg('M'):>6} {fmt_deg('H'):>6} {ms_txt:>5} {hm_txt:>5}"
        )

    # Resumen global
    all_deg = {c: [r["degradation"][c]["deg_s_per_lap"] for r in results if c in r["degradation"]] for c in ("S", "M", "H")}
    all_ms = [r["compound_deltas_s"]["M_minus_S"] for r in results if "M_minus_S" in r["compound_deltas_s"]]
    all_hm = [r["compound_deltas_s"]["H_minus_M"] for r in results if "H_minus_M" in r["compound_deltas_s"]]
    all_dirty = [r["dirty_air"]["dirty_minus_clean_s"] for r in results if "dirty_minus_clean_s" in r["dirty_air"]]

    lines.append("-" * len(header))
    lines.append(
        "Mediana global 2026 | "
        + " ".join(
            f"Deg{c}={np.median(vals):+.3f} s/v (n={len(vals)})"
            for c, vals in all_deg.items()
            if vals
        )
    )
    if all_ms or all_hm or all_dirty:
        parts = []
        if all_ms:
            parts.append(f"Delta M-S={np.median(all_ms):+.2f} s (n={len(all_ms)})")
        if all_hm:
            parts.append(f"Delta H-M={np.median(all_hm):+.2f} s (n={len(all_hm)})")
        if all_dirty:
            parts.append(f"Aire sucio (<1.5s vs >2.5s)={np.median(all_dirty):+.2f} s (n={len(all_dirty)})")
        lines.append("                    | " + " · ".join(parts))

    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser(description="Análisis real de degradación, deltas y estrategias 2026.")
    p.add_argument("--anio", type=int, default=2026)
    p.add_argument("--gp", type=str, default=None, help="Filtrar por circuit_id separados por coma.")
    p.add_argument(
        "--json",
        type=str,
        default=str(DATA_DIR / "2026" / "calibracion_resumen.json"),
        help="Ruta donde guardar el resumen JSON.",
    )
    args = p.parse_args()

    year_dir = DATA_DIR / str(args.anio)
    if not year_dir.exists():
        print(f"No existe {year_dir}. Ejecuta primero scripts/descarga_f1.py", file=sys.stderr)
        return 1

    gp_filter = {x.strip().lower() for x in args.gp.split(",") if x.strip()} if args.gp else None
    results: list[dict[str, Any]] = []

    for gp_dir in sorted(year_dir.iterdir()):
        if not gp_dir.is_dir():
            continue
        if gp_filter and not any(g in gp_dir.name.lower() for g in gp_filter):
            continue
        res = analyze_gp(gp_dir)
        if res:
            results.append(res)

    if not results:
        print("No se encontraron carreras descargadas para analizar.", file=sys.stderr)
        return 1

    print(format_table(results))

    out_path = Path(args.json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nResumen guardado en: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
