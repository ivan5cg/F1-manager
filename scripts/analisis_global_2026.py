#!/usr/bin/env python3
"""
Análisis global representativo de la temporada F1 2026 (21 GPs, 63 sesiones,
42.696 vueltas + telemetría 3.7 Hz en 7 circuitos) a partir de
datos-reales/2026/_consolidado/.

Mide patrones estructurales globales (sin sobreajustar a días concretos):
  1. Libres (FP2): volumen, ritmo vs pole, tandas largas, delta puro entre compuestos
  2. Clasificación (Q): dispersión, evolución Q1->Q3, compañeros, neumáticos
  3. Sprint (S): ritmo, compuestos, degradación, salida
  4. Carrera (R): uso real de compuestos, estrategias, vida de stints, curva de
     degradación por compuesto / temperatura / abrasividad / gama Pirelli
  5. Condiciones de pista: temperatura de asfalto vs aire, SC/VSC/rojas y su ritmo
  6. Acción en pista: aire sucio (<1s, 1-1.5s, 1.5-2.5s), adelantamientos, vuelta 1,
     victorias desde pole / P4+, consistencia σ y perfiles 3.7 Hz (Q vs R)

Uso:
  python scripts/analisis_global_2026.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CONS_DIR = ROOT / "datos-reales" / "2026" / "_consolidado"
CIRCUITS_DIR = ROOT / "data" / "circuitos"


def load_circuits_meta() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for p in CIRCUITS_DIR.glob("*.json"):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[d["id"]] = {
            "abrasividad": d.get("abrasividad"),
            "compuestos": tuple(d.get("compuestos") or []),
            "gama": "-".join(d.get("compuestos") or []),
            "vueltas": d.get("vueltas"),
            "clima": d.get("clima") or {},
            "boxes_perdida": (d.get("boxes") or {}).get("perdida"),
            "poleObjetivo": d.get("poleObjetivo"),
        }
    return out


def fuel_rate(total_laps: int) -> float:
    return (72.5 / max(total_laps, 1)) * 0.025


def main() -> int:
    laps = pd.read_parquet(CONS_DIR / "laps_all.parquet")
    stints = pd.read_parquet(CONS_DIR / "stints_all.parquet")
    weather = pd.read_parquet(CONS_DIR / "weather_all.parquet")
    rc = pd.read_parquet(CONS_DIR / "race_control_all.parquet")
    tel = pd.read_parquet(CONS_DIR / "telemetry_profiles.parquet") if (CONS_DIR / "telemetry_profiles.parquet").exists() else pd.DataFrame()
    circuits = load_circuits_meta()

    # Añadir metadatos de circuito a laps y stints
    laps["abrasividad"] = laps["circuit_id"].map(lambda c: circuits.get(c, {}).get("abrasividad"))
    laps["gama"] = laps["circuit_id"].map(lambda c: circuits.get(c, {}).get("gama", ""))
    stints["abrasividad"] = stints["circuit_id"].map(lambda c: circuits.get(c, {}).get("abrasividad"))
    stints["gama"] = stints["circuit_id"].map(lambda c: circuits.get(c, {}).get("gama", ""))

    # Pole real por GP (mínima vuelta válida de Q)
    q_laps = laps[laps["session"] == "Q"].copy()
    poles = q_laps[q_laps["lap_duration"] > 50].groupby("circuit_id")["lap_duration"].min().to_dict()

    # Identificar carreras secas (<5% lluvia y <10% vueltas con I/W)
    r_laps = laps[laps["session"] == "R"].copy()
    wet_races: set[str] = set()
    for cid, g in r_laps.groupby("circuit_id"):
        w_pct = g["comp"].isin(["I", "W"]).mean()
        r_pct = (g["rainfall"].fillna(0) > 0).mean() if "rainfall" in g.columns else 0
        if w_pct > 0.05 or r_pct > 0.10:
            wet_races.add(cid)

    report: dict[str, Any] = {}

    print("=" * 88)
    print("PERFIL GLOBAL TEMPORADA F1 2026 (21 GPs, 63 sesiones, 42.696 vueltas)")
    print("=" * 88)

    # =========================================================================
    # 1. LIBRES (FP2)
    # =========================================================================
    fp2 = laps[laps["session"] == "FP2"].copy()
    fp2_laps_per_drv = fp2.groupby(["circuit_id", "driver_number"])["lap_number"].count()
    fp2_vs_pole = []
    fp2_beat_pole = 0
    fp2_deltas: dict[str, list[float]] = {"M-S": [], "H-M": [], "H-S": []}
    fp2_long_degs: dict[str, list[float]] = {"S": [], "M": [], "H": []}
    fp2_long_counts = []

    for cid, g in fp2.groupby("circuit_id"):
        pole = poles.get(cid)
        valid = g[(g["lap_duration"] > 50) & (g["comp"].isin(["S", "M", "H"]))]
        if valid.empty:
            continue
        best_fp2 = valid["lap_duration"].min()
        if pole:
            fp2_vs_pole.append(best_fp2 - pole)
            if best_fp2 < pole:
                fp2_beat_pole += 1

        # Delta puro entre compuestos en FP2: mejor vuelta rápida por piloto y compuesto (stints <= 6 v)
        short_st = valid[(valid["stint_len"] <= 7) & (~valid["is_pit_out_lap"].fillna(False)) & (~valid["is_in_lap"])]
        if not short_st.empty:
            piv = short_st.groupby(["driver_number", "comp"])["lap_duration"].min().unstack()
            for a, b, k in (("M", "S", "M-S"), ("H", "M", "H-M"), ("H", "S", "H-S")):
                if a in piv.columns and b in piv.columns:
                    d = (piv[a] - piv[b]).dropna()
                    d = d[(d > -1.0) & (d < 3.0)]
                    fp2_deltas[k].extend(d.tolist())

        # Tandas largas en FP2 (>= 7 vueltas limpias en mismo stint)
        n_long = 0
        med_c = valid["lap_duration"].median()
        for (drv, stn), sg in valid.groupby(["driver_number", "stint_number"]):
            cg = sg[(~sg["is_pit_out_lap"].fillna(False)) & (~sg["is_in_lap"]) & (sg["lap_duration"] < med_c * 1.07)]
            if len(cg) >= 7:
                n_long += 1
                comp = str(cg["comp"].iloc[0])
                if comp in fp2_long_degs:
                    x = cg["tyre_age"].to_numpy(dtype=float)
                    y = cg["lap_duration"].to_numpy(dtype=float)
                    # En FP2 la carga de combustible baja ~0.03 s/v -> corregir igual
                    y_corr = y + x * 0.030
                    if np.ptp(x) >= 5:
                        sl = float(np.polyfit(x, y_corr, 1)[0])
                        if -0.2 <= sl <= 0.5:
                            fp2_long_degs[comp].append(sl)
        fp2_long_counts.append(n_long)

    print("\n1. LIBRES 2 (FP2 — 15 GPs convencionales)")
    print(f"   Vueltas por piloto: med {fp2_laps_per_drv.median():.1f} [p10 {fp2_laps_per_drv.quantile(0.1):.0f}, p90 {fp2_laps_per_drv.quantile(0.9):.0f}]")
    print(f"   Mejor FP2 − Pole:   med {np.median(fp2_vs_pole):+.3f} s [p10 {np.percentile(fp2_vs_pole, 10):+.2f}, p90 {np.percentile(fp2_vs_pole, 90):+.2f}] · bate pole: {fp2_beat_pole}/{len(fp2_vs_pole)}")
    print(f"   Tandas largas/GP:   med {np.median(fp2_long_counts):.1f} (>=7 vueltas limpias)")
    print("   Degradación tandas largas FP2 (corregida comb.): " + " · ".join(
        f"{c}={np.median(v):+.3f} s/v (n={len(v)})" for c, v in fp2_long_degs.items() if v
    ))
    print("   Delta PURO entre compuestos en FP2 (vuelta rápida, mismo piloto): " + " · ".join(
        f"{k}={np.median(v):+.3f} s [p25 {np.percentile(v,25):+.2f}, p75 {np.percentile(v,75):+.2f}] (n={len(v)})"
        for k, v in fp2_deltas.items() if v
    ))

    # =========================================================================
    # 2. CLASIFICACIÓN (Q)
    # =========================================================================
    q_laps_drv = q_laps.groupby(["circuit_id", "driver_number"])["lap_number"].count()
    q_p2_p1, q_p10_p1, q_p20_p1, q_all_span, q_mate, q_evo_pole, q_evo_top10 = [], [], [], [], [], [], []
    q_red_flags = 0
    q_dry_n = 0

    for cid, g in q_laps.groupby("circuit_id"):
        if g["comp"].isin(["I", "W"]).mean() > 0.15:
            continue
        q_dry_n += 1
        valid = g[(g["lap_duration"] > 50) & (~g["is_pit_out_lap"].fillna(False))].copy()
        if valid.empty:
            continue
        best_drv = valid.groupby(["driver_number", "team_name"])["lap_duration"].min().reset_index().sort_values("lap_duration")
        ts = best_drv["lap_duration"].to_numpy()
        if len(ts) >= 20:
            q_p2_p1.append(ts[1] - ts[0])
            q_p10_p1.append(ts[9] - ts[0])
            q_p20_p1.append(ts[19] - ts[0])
            q_all_span.append(ts[-1] - ts[0])
        for _, tg in best_drv.groupby("team_name"):
            if len(tg) == 2:
                q_mate.append(abs(float(tg["lap_duration"].iloc[1] - tg["lap_duration"].iloc[0])))

        # Evolución Q1 -> Q3 usando primer tercio vs último tercio de la sesión Q
        if valid["date_start"].notna().any():
            t0 = valid["date_start"].min()
            t1 = valid["date_start"].max()
            dur = (t1 - t0).total_seconds()
            if dur > 1800:
                valid["q_frac"] = (valid["date_start"] - t0).dt.total_seconds() / dur
                early = valid[valid["q_frac"] <= 0.35].groupby("driver_number")["lap_duration"].min()
                late = valid[valid["q_frac"] >= 0.72].groupby("driver_number")["lap_duration"].min()
                both = pd.DataFrame({"early": early, "late": late}).dropna()
                if len(both) >= 5:
                    pole_drv = best_drv.iloc[0]["driver_number"]
                    if pole_drv in both.index:
                        q_evo_pole.append(float(both.loc[pole_drv, "early"] - both.loc[pole_drv, "late"]))
                    q_evo_top10.append(float((both["early"] - both["late"]).median()))

        # Banderas rojas en Q
        rc_q = rc[(rc["circuit_id"] == cid) & (rc["session"] == "Q")]
        if not rc_q.empty and (rc_q["flag"].fillna("").str.upper() == "RED").any():
            q_red_flags += 1

    print(f"\n2. CLASIFICACIÓN (Q seca — {q_dry_n} GPs)")
    print(f"   Vueltas por piloto: med {q_laps_drv.median():.1f} [p10 {q_laps_drv.quantile(0.1):.0f}, p90 {q_laps_drv.quantile(0.9):.0f}]")
    print(f"   P2−P1: {np.median(q_p2_p1):.3f} s · P10−P1: {np.median(q_p10_p1):.3f} s · P20−P1: {np.median(q_p20_p1):.3f} s · Todos: {np.median(q_all_span):.3f} s")
    print(f"   Compañeros |Δ|:     med {np.median(q_mate):.3f} s · Mejora Q1→Q3: pole {np.median(q_evo_pole):.3f} s / top10 {np.median(q_evo_top10):.3f} s")
    print(f"   Banderas rojas Q:   {q_red_flags}/{q_dry_n} ({100*q_red_flags/max(q_dry_n,1):.0f} %)")

    # =========================================================================
    # 3. SPRINT (S)
    # =========================================================================
    s_laps = laps[laps["session"] == "S"].copy()
    s_stints = stints[stints["session"] == "S"].copy()
    s_comp_start = s_stints[s_stints["stint_number"] == 1]["comp"].value_counts(normalize=True) * 100
    s_fl_pole, s_green_pole = [], []
    for cid, g in s_laps.groupby("circuit_id"):
        pole = poles.get(cid)
        cg = g[g["is_clean_dry_lap"]]
        if pole and not cg.empty:
            s_fl_pole.append(cg["lap_duration"].min() / pole)
            s_green_pole.append(cg["lap_duration"].median() / pole)

    print(f"\n3. SPRINT ({s_laps['circuit_id'].nunique()} GPs Sprint)")
    print(f"   FL / pole: med {np.median(s_fl_pole):.4f} · Vuelta verde / pole: med {np.median(s_green_pole):.4f}")
    print("   Neumático salida Sprint: " + " · ".join(f"{k} {v:.0f}%" for k, v in s_comp_start.items()))

    # =========================================================================
    # 4. NEUMÁTICOS, ESTRATEGIAS Y DEGRADACIÓN GLOBAL EN CARRERA SECA
    # =========================================================================
    dry_r = r_laps[~r_laps["circuit_id"].isin(wet_races)].copy()
    dry_st = stints[(stints["session"] == "R") & (~stints["circuit_id"].isin(wet_races))].copy()

    # Excluir Mónaco (5 paradas anómalas por regla/roja) solo en la media de paradas normales, mostrando ambos
    fin_rows = []
    used_comp_rows = []
    start_comps: list[str] = []
    stint_lens_by_comp: dict[str, list[int]] = {"S": [], "M": [], "H": []}

    for cid, g in dry_st.groupby("circuit_id"):
        tot = int(g["total_laps"].max()) if g["total_laps"].notna().any() else 55
        max_l = g.groupby("driver_number")["lap_end"].max()
        fins = max_l[max_l >= tot * 0.85].index
        gf = g[g["driver_number"].isin(fins)].sort_values(["driver_number", "stint_number"])
        for drv, dg in gf.groupby("driver_number"):
            n_stops = max(0, len(dg) - 1)
            comps = dg["comp"].dropna().astype(str).tolist()
            if not comps:
                continue
            start_comps.append(comps[0])
            fin_rows.append({"circuit_id": cid, "stops": n_stops, "is_monaco": cid == "monaco"})
            used_comp_rows.append({
                "circuit_id": cid,
                "used_S": "S" in comps,
                "used_M": "M" in comps,
                "used_H": "H" in comps,
                "seq": "->".join(comps),
            })
        for _, row in g.iterrows():
            c = str(row["comp"])
            if c in stint_lens_by_comp and pd.notna(row["stint_len"]) and row["stint_len"] >= 3:
                stint_lens_by_comp[c].append(int(row["stint_len"]))

    fin_df = pd.DataFrame(fin_rows)
    used_df = pd.DataFrame(used_comp_rows)
    fin_no_mon = fin_df[~fin_df["is_monaco"]]

    print(f"\n4. ESTRATEGIAS Y NEUMÁTICOS EN CARRERA SECA ({dry_r['circuit_id'].nunique()} GPs secos; húmedos excluidos: {sorted(wet_races)})")
    print(f"   Paradas/coche (todas secas):     media {fin_df['stops'].mean():.2f} · reparto {fin_df['stops'].value_counts().sort_index().to_dict()}")
    print(f"   Paradas/coche (sin Mónaco):      media {fin_no_mon['stops'].mean():.2f} · reparto {fin_no_mon['stops'].value_counts().sort_index().to_dict()}")
    print(f"   Uso compuesto (% clasificados):  S {100*used_df['used_S'].mean():.0f}% · M {100*used_df['used_M'].mean():.0f}% · H {100*used_df['used_H'].mean():.0f}%")
    sc_s = pd.Series(start_comps).value_counts(normalize=True) * 100
    print("   Neumático de salida:             " + " · ".join(f"{k} {v:.0f}%" for k, v in sc_s.items()))
    print("   Top estrategias:                 " + " · ".join(f"{k}:{v}" for k, v in used_df["seq"].value_counts().head(8).items()))
    print("   Longitud stints (med / p75 / p90 / máx):")
    for c in ("S", "M", "H"):
        arr = stint_lens_by_comp[c]
        if arr:
            print(f"     {c}: med {np.median(arr):.1f} · p75 {np.percentile(arr,75):.1f} · p90 {np.percentile(arr,90):.1f} · máx {max(arr)} v (n={len(arr)})")

    # Degradación detallada por compuesto, temperatura de asfalto, abrasividad y gama Pirelli
    stint_degs = []
    age_curve_rows = []
    for cid, g in dry_r[dry_r["is_clean_dry_lap"]].groupby("circuit_id"):
        tot = int(r_laps.loc[r_laps["circuit_id"] == cid, "lap_number"].max())
        fr = fuel_rate(tot)
        g = g.copy()
        g["lap_corr"] = g["lap_duration"] - (tot - g["lap_number"]) * fr
        abr = circuits.get(cid, {}).get("abrasividad", 1.0)
        gama = circuits.get(cid, {}).get("gama", "")

        for (drv, stn), sg in g.groupby(["driver_number", "stint_number"]):
            # Preferir aire limpio (>= 1.5s)
            clean_g = sg[(sg["interval_med_s"].isna()) | (sg["interval_med_s"] >= 1.5)]
            if len(clean_g) < 6:
                continue
            comp = str(clean_g["comp"].iloc[0])
            x = clean_g["tyre_age"].to_numpy(dtype=float)
            y = clean_g["lap_corr"].to_numpy(dtype=float)
            if np.ptp(x) < 5:
                continue
            slope = float(np.polyfit(x, y, 1)[0])
            if not (-0.15 <= slope <= 0.45):
                continue
            t_track = float(clean_g["track_temperature"].median()) if clean_g["track_temperature"].notna().any() else np.nan
            stint_degs.append({
                "circuit_id": cid,
                "comp": comp,
                "slope": slope,
                "n_laps": len(clean_g),
                "max_age": float(x.max()),
                "track_t": t_track,
                "abr": abr,
                "gama": gama,
            })

            # Curva normalizada respecto a edad 2-5 del mismo stint
            base_rows = clean_g[(clean_g["tyre_age"] >= 2) & (clean_g["tyre_age"] <= 5)]
            if len(base_rows) >= 2:
                base_t = float(base_rows["lap_corr"].median())
                for _, lr in clean_g.iterrows():
                    age_curve_rows.append({
                        "comp": comp,
                        "age": int(lr["tyre_age"]),
                        "dt": float(lr["lap_corr"] - base_t),
                        "track_t": t_track,
                        "abr": abr,
                    })

    sd_df = pd.DataFrame(stint_degs)
    ac_df = pd.DataFrame(age_curve_rows)

    print("\n   DEGRADACIÓN REAL EN AIRE LIMPIO (pendiente por stint >=6v, corregida comb. 2026):")
    for c in ("S", "M", "H"):
        sub = sd_df[sd_df["comp"] == c]["slope"]
        if not sub.empty:
            print(f"     {c}: med {sub.median():+.4f} s/v [p10 {sub.quantile(0.1):+.3f}, p25 {sub.quantile(0.25):+.3f}, p75 {sub.quantile(0.75):+.3f}, p90 {sub.quantile(0.9):+.3f}] (n={len(sub)} stints)")

    print("\n   SENSIBILIDAD TÉRMICA REAL (degradación s/v según temperatura de asfalto):")
    sd_df["temp_band"] = pd.cut(sd_df["track_t"], bins=[0, 26, 40, 80], labels=["Fría (<26°)", "Templada (26-40°)", "Caliente (>40°)"])
    for band in ["Fría (<26°)", "Templada (26-40°)", "Caliente (>40°)"]:
        bsub = sd_df[sd_df["temp_band"] == band]
        parts = [f"{c}={bsub[bsub['comp']==c]['slope'].median():+.3f} (n={len(bsub[bsub['comp']==c])})"
                 for c in ("S", "M", "H") if len(bsub[bsub["comp"] == c]) >= 3]
        print(f"     {band:18s}: " + " · ".join(parts))

    print("\n   SENSIBILIDAD A ABRASIVIDAD DEL CIRCUITO:")
    sd_df["abr_band"] = pd.cut(sd_df["abr"], bins=[0, 0.86, 1.05, 2.0], labels=["Baja (<=0.85)", "Media (0.86-1.05)", "Alta (>1.05)"])
    for band in ["Baja (<=0.85)", "Media (0.86-1.05)", "Alta (>1.05)"]:
        bsub = sd_df[sd_df["abr_band"] == band]
        parts = [f"{c}={bsub[bsub['comp']==c]['slope'].median():+.3f} (n={len(bsub[bsub['comp']==c])})"
                 for c in ("S", "M", "H") if len(bsub[bsub["comp"] == c]) >= 3]
        print(f"     {band:18s}: " + " · ".join(parts))

    print("\n   CURVA DE DEGRADACIÓN POR EDAD (Δ s frente a vueltas 2-5 del mismo stint):")
    age_bins = [(1, 3), (4, 8), (9, 14), (15, 20), (21, 28), (29, 40), (41, 60)]
    for c in ("S", "M", "H"):
        csub = ac_df[ac_df["comp"] == c]
        pts = []
        for a0, a1 in age_bins:
            v = csub[(csub["age"] >= a0) & (csub["age"] <= a1)]["dt"]
            if len(v) >= 15:
                pts.append(f"v{a0}-{a1}:{v.median():+.2f}s(n{len(v)})")
        print(f"     {c}: " + "  ".join(pts))

    # =========================================================================
    # 5. CONDICIONES DE PISTA, TEMPERATURAS Y NEUTRALIZACIONES
    # =========================================================================
    w_r = weather[weather["session"] == "R"].copy()
    w_r["delta_t"] = w_r["track_temperature"] - w_r["air_temperature"]
    print("\n5. CONDICIONES DE PISTA Y NEUTRALIZACIONES (21 carreras)")
    print(f"   Temp asfalto carrera: med {w_r['track_temperature'].median():.1f}° [p10 {w_r['track_temperature'].quantile(0.1):.1f}°, p90 {w_r['track_temperature'].quantile(0.9):.1f}°]")
    print(f"   Temp aire carrera:    med {w_r['air_temperature'].median():.1f}° · (Asfalto − Aire): med +{w_r['delta_t'].median():.1f}° [p10 +{w_r['delta_t'].quantile(0.1):.1f}°, p90 +{w_r['delta_t'].quantile(0.9):.1f}°]")
    # Comparativa específica de asfalto en circuitos fríos/críticos
    print("   Temp asfalto real en carrera por circuito (aire -> asfalto):")
    w_by_c = w_r.groupby("circuit_id").agg(air=("air_temperature", "median"), track=("track_temperature", "median"), rain=("rainfall", lambda s: (s > 0).mean() * 100))
    for cid in ["shanghai", "suzuka", "montreal", "spa", "silverstone", "lasvegas", "barcelona", "monza", "madrid"]:
        if cid in w_by_c.index:
            row = w_by_c.loc[cid]
            sim_cl = circuits.get(cid, {}).get("clima", {})
            print(f"     {cid:12s}: aire {row['air']:4.1f}° -> asfalto {row['track']:4.1f}° (Δ +{row['track']-row['air']:4.1f}°) · sim clima [{sim_cl.get('minima')}-{sim_cl.get('maxima')}°]")

    # Neutralizaciones SC / VSC / Rojas en las 21 carreras
    rc_r = rc[rc["session"] == "R"].copy()
    sc_races, vsc_races, red_races = 0, 0, 0
    sc_events, vsc_events = 0, 0
    sc_lap_ratios, vsc_lap_ratios = [], []
    for cid, g in r_laps.groupby("circuit_id"):
        grc = rc_r[rc_r["circuit_id"] == cid]
        msgs = grc["message"].fillna("").astype(str).str.upper()
        n_sc = int(msgs.str.contains("SAFETY CAR DEPLOYED").sum()) - int(msgs.str.contains("VIRTUAL SAFETY CAR DEPLOYED").sum())
        n_vsc = int(msgs.str.contains("VIRTUAL SAFETY CAR DEPLOYED").sum())
        has_red = bool((grc["flag"].fillna("").str.upper() == "RED").any())
        if n_sc > 0: sc_races += 1; sc_events += n_sc
        if n_vsc > 0: vsc_races += 1; vsc_events += n_vsc
        if has_red: red_races += 1

        # Ratio vuelta bajo SC/VSC frente a verde
        green_med = g.loc[g["is_green_lap"] & (~g["is_pit_out_lap"].fillna(False)), "lap_duration"].median()
        if pd.notna(green_med) and green_med > 50:
            lap_meds = g[~g["is_pit_out_lap"].fillna(False)].groupby("lap_number")["lap_duration"].median()
            for l, t in lap_meds.items():
                if l <= 1 or t > green_med * 2.2:
                    continue
                ratio = t / green_med
                if 1.20 <= ratio <= 1.75:
                    # Clasificar aprox según si esa vuelta tuvo VSC o SC
                    if n_sc > 0 and ratio >= 1.38:
                        sc_lap_ratios.append(ratio)
                    elif n_vsc > 0 and ratio < 1.42:
                        vsc_lap_ratios.append(ratio)

    n_gps = r_laps["circuit_id"].nunique()
    print(f"   SC: {sc_races}/{n_gps} ({100*sc_races/n_gps:.0f}%, {sc_events/n_gps:.2f}/carrera) · VSC: {vsc_races}/{n_gps} ({100*vsc_races/n_gps:.0f}%, {vsc_events/n_gps:.2f}/carrera) · Roja: {red_races}/{n_gps} ({100*red_races/n_gps:.0f}%)")
    if sc_lap_ratios or vsc_lap_ratios:
        print(f"   Ritmo neutralizado: SC/verde med {np.median(sc_lap_ratios) if sc_lap_ratios else np.nan:.2f} · VSC/verde med {np.median(vsc_lap_ratios) if vsc_lap_ratios else np.nan:.2f}")

    # =========================================================================
    # 6. ACCIÓN EN PISTA, RITMOS, BATALLAS, AIRE SUCIO Y TELEMETRÍA 3.7 Hz
    # =========================================================================
    fl_pole, green_pole, lap1_ratio = [], [], []
    cons_sigmas = []
    dirty_bands = {"<0.8s": [], "0.8-1.5s": [], "1.5-2.5s": []}
    overtakes_per_race = []
    lap1_pos_changes = []
    pole_keeps_l1 = 0
    pole_l1_n = 0
    fl_fracs, fl_ages, fl_comps = [], [], []
    wet_ratios_I, wet_ratios_W = [], []

    for cid, g in r_laps.groupby("circuit_id"):
        pole = poles.get(cid)
        is_dry = cid not in wet_races
        tot = int(g["lap_number"].max())
        fr = fuel_rate(tot)

        if pole:
            for comp_w, bucket in (("I", wet_ratios_I), ("W", wet_ratios_W)):
                wg = g[(g["comp"] == comp_w) & (g["is_green_lap"]) & (~g["is_pit_out_lap"].fillna(False)) & (g["lap_duration"].notna())]
                if len(wg) >= 10:
                    bucket.append(float(wg["lap_duration"].median() / pole))

        if is_dry:
            cg = g[g["is_clean_dry_lap"]].copy()
            if pole and not cg.empty:
                fl_row = cg.loc[cg["lap_duration"].idxmin()]
                fl_pole.append(float(fl_row["lap_duration"] / pole))
                fl_fracs.append(float(fl_row["lap_number"] / max(tot, 1)))
                if pd.notna(fl_row["tyre_age"]):
                    fl_ages.append(float(fl_row["tyre_age"]))
                fl_comps.append(str(fl_row["comp"]))

                top10 = cg[cg["pos_end_lap"] <= 10] if "pos_end_lap" in cg.columns and cg["pos_end_lap"].notna().any() else cg
                green_med = float(top10["lap_duration"].median())
                green_pole.append(green_med / pole)

                l1 = g[g["lap_number"] == 1]["lap_duration"].dropna()
                if not l1.empty:
                    lap1_ratio.append(float(l1.median() / green_med))

            # Consistencia vuelta a vuelta (σ residuo lineal en aire limpio >= 6 v)
            cg["lap_corr"] = cg["lap_duration"] - (tot - cg["lap_number"]) * fr
            for (drv, stn), sg in cg.groupby(["driver_number", "stint_number"]):
                air = sg[(sg["interval_med_s"].isna()) | (sg["interval_med_s"] >= 2.0)]
                if len(air) >= 7:
                    x = air["tyre_age"].to_numpy(dtype=float)
                    y = air["lap_corr"].to_numpy(dtype=float)
                    if np.ptp(x) >= 5:
                        coef = np.polyfit(x, y, 1)
                        resid = y - np.polyval(coef, x)
                        cons_sigmas.append(float(np.std(resid, ddof=1)))

                # Efecto aire sucio por bandas dentro del mismo piloto y stint (eliminando pendiente)
                if len(sg) >= 6 and sg["interval_med_s"].notna().any():
                    clean_ref = sg[sg["interval_med_s"] > 2.5]
                    if len(clean_ref) >= 2:
                        # Ajustar tendencia lineal simple de la tanda o usar mediana
                        x_all = sg["tyre_age"].to_numpy(dtype=float)
                        y_all = sg["lap_corr"].to_numpy(dtype=float)
                        if np.ptp(x_all) >= 4:
                            slope_s = float(np.polyfit(x_all, y_all, 1)[0])
                            sg = sg.copy()
                            sg["detrend"] = sg["lap_corr"] - slope_s * sg["tyre_age"]
                            ref_d = float(sg[sg["interval_med_s"] > 2.5]["detrend"].median())
                            for label, lo, hi in (("<0.8s", 0.0, 0.8), ("0.8-1.5s", 0.8, 1.5), ("1.5-2.5s", 1.5, 2.5)):
                                b = sg[(sg["interval_med_s"] >= lo) & (sg["interval_med_s"] < hi)]["detrend"]
                                if len(b) >= 2:
                                    dirty_bands[label].append(float(b.median() - ref_d))

        # Adelantamientos en pista (pos_end_lap, excluyendo V1 y vueltas con parada de cualquiera de los coches)
        if "pos_end_lap" in g.columns and g["pos_end_lap"].notna().any():
            piv_pos = g.pivot_table(index="lap_number", columns="driver_number", values="pos_end_lap", aggfunc="last").sort_index()
            pit_l = set(zip(g.loc[g["is_in_lap"] | g["is_pit_out_lap"].fillna(False), "driver_number"],
                            g.loc[g["is_in_lap"] | g["is_pit_out_lap"].fillna(False), "lap_number"]))
            # También excluir la vuelta donde alguien abandona
            pass_cnt = 0
            laps_idx = piv_pos.index.tolist()
            for i in range(1, len(laps_idx)):
                l_prev, l_cur = laps_idx[i - 1], laps_idx[i]
                if l_cur <= 1:
                    continue
                p_prev = piv_pos.loc[l_prev].dropna()
                p_cur = piv_pos.loc[l_cur].dropna()
                common = p_prev.index.intersection(p_cur.index)
                # Solo pares donde ninguno paró en l_prev ni l_cur
                active_drvs = [d for d in common if (d, l_prev) not in pit_l and (d, l_cur) not in pit_l]
                # Contar inversiones de orden relativo entre coches activos
                if len(active_drvs) >= 2:
                    a_prev = p_prev.loc[active_drvs].to_numpy()
                    a_cur = p_cur.loc[active_drvs].to_numpy()
                    # Pares (u, v) donde u estaba detrás en l_prev y delante en l_cur
                    inv = int(((a_prev[:, None] > a_prev[None, :]) & (a_cur[:, None] < a_cur[None, :])).sum())
                    pass_cnt += inv
            if is_dry:
                overtakes_per_race.append((cid, pass_cnt))

    print("\n6. ACCIÓN EN PISTA, RITMOS, BATALLAS Y AIRE SUCIO (carreras secas 2026)")
    print(f"   FL / pole:           med {np.median(fl_pole):.4f} [p10 {np.percentile(fl_pole,10):.4f}, p90 {np.percentile(fl_pole,90):.4f}]")
    print(f"   Vuelta verde / pole: med {np.median(green_pole):.4f} [p10 {np.percentile(green_pole,10):.4f}, p90 {np.percentile(green_pole,90):.4f}]")
    print(f"   Vuelta rápida en:    {100*np.median(fl_fracs):.0f}% carrera · edad goma med {np.median(fl_ages):.0f} v · compuestos {pd.Series(fl_comps).value_counts().to_dict()}")
    print(f"   Consistencia σ:      med {np.median(cons_sigmas):.3f} s [p10 {np.percentile(cons_sigmas,10):.3f}, p90 {np.percentile(cons_sigmas,90):.3f}] (n={len(cons_sigmas)} stints)")
    print("   Aire sucio (detrended mismo stint vs >2.5s): " + " · ".join(
        f"{k}={np.median(v):+.3f} s (n={len(v)})" for k, v in dirty_bands.items() if v
    ))
    if overtakes_per_race:
        ov_vals = [x[1] for x in overtakes_per_race]
        print(f"   Adelantamientos reales (sin V1 ni boxes): med {np.median(ov_vals):.1f} · media {np.mean(ov_vals):.1f} [p10 {np.percentile(ov_vals,10):.0f}, p90 {np.percentile(ov_vals,90):.0f}]")
        top_ov = sorted(overtakes_per_race, key=lambda x: -x[1])
        print("     Más:   " + ", ".join(f"{c}:{n}" for c, n in top_ov[:5]))
        print("     Menos: " + ", ".join(f"{c}:{n}" for c, n in top_ov[-5:]))
    if wet_ratios_I:
        print(f"   Mojado (Inter/pole seca): med {np.median(wet_ratios_I):.3f} (n={len(wet_ratios_I)} carreras)")

    # 7. Telemetría 3.7 Hz (Q vs R vs FP2)
    if not tel.empty:
        print("\n7. TELEMETRÍA 3.7 Hz — PERFILES FÍSICOS Q vs R vs FP2 (7 circuitos clave)")
        for sess in ("Q", "FP2", "S", "R"):
            sub = tel[tel["session"] == sess]
            if sub.empty:
                continue
            print(
                f"   {sess:3s} (n={len(sub)}): full_thr {sub['full_throttle_pct'].median():5.1f}% · "
                f"partial {sub['partial_throttle_pct'].median():4.1f}% · coast {sub['coast_pct'].median():4.1f}% · "
                f"brake {sub['brake_pct'].median():4.1f}% · v_med {sub['speed_mean'].median():5.1f} · "
                f"v_p10 {sub['speed_p10'].median():5.1f} · v_p99 {sub['speed_p99'].median():5.1f} km/h"
            )
        # Diferencia pareada Q vs R en los 7 circuitos
        piv_t = tel[tel["session"].isin(["Q", "R"])].pivot(index="circuit_id", columns="session", values=["speed_mean", "speed_p10", "speed_p99", "full_throttle_pct", "coast_pct"])
        if ("speed_mean", "Q") in piv_t.columns and ("speed_mean", "R") in piv_t.columns:
            dv_mean = (piv_t[("speed_mean", "R")] - piv_t[("speed_mean", "Q")]).median()
            dv_p10 = (piv_t[("speed_p10", "R")] - piv_t[("speed_p10", "Q")]).median()
            dv_p99 = (piv_t[("speed_p99", "R")] - piv_t[("speed_p99", "Q")]).median()
            d_coast = (piv_t[("coast_pct", "R")] - piv_t[("coast_pct", "Q")]).median()
            d_thr = (piv_t[("full_throttle_pct", "R")] - piv_t[("full_throttle_pct", "Q")]).median()
            print(
                f"   Δ (R − Q) pareado: v_media {dv_mean:+.1f} km/h · v_curva(p10) {dv_p10:+.1f} km/h · "
                f"v_punta(p99) {dv_p99:+.1f} km/h · full_thr {d_thr:+.1f} pp · coast {d_coast:+.1f} pp"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
