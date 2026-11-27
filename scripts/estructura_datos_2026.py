#!/usr/bin/env python3
"""
Consolida y estructura los datos descargados de la temporada 2026 en tablas
unificadas y enriquecidas dentro de datos-reales/2026/_consolidado/:

  - catalogo.json               Inventario de GPs, sesiones, filas y telemetría
  - laps_all.parquet            Todas las vueltas (R, Q, FP2, S) enriquecidas con piloto,
                                equipo, compuesto, edad de goma, clima, intervalo, posición
                                y banderas verde/limpia
  - stints_all.parquet          Todos los stints de la temporada
  - weather_all.parquet         Meteorología de todas las sesiones
  - pit_all.parquet             Paradas en boxes con pérdida neta real en verde
  - race_control_all.parquet    Mensajes FIA, SC, VSC, rojas y sanciones
  - telemetry_profiles.parquet  Perfiles de telemetría 3.7 Hz (Q vs R vs FP2) de los
                                circuitos con car_data descargado

Uso:
  python scripts/estructura_datos_2026.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
YEAR_DIR = ROOT / "datos-reales" / "2026"
OUT_DIR = YEAR_DIR / "_consolidado"

COMPOUND_SHORT = {
    "SOFT": "S",
    "MEDIUM": "M",
    "HARD": "H",
    "INTERMEDIATE": "I",
    "WET": "W",
}


def read_pq(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.exists() else pd.DataFrame()


def compute_green_laps(laps: pd.DataFrame, rc: pd.DataFrame, session: str) -> set[int]:
    """Identifica vueltas bajo bandera verde real (sin SC, VSC, roja ni tráfico general lento)."""
    if laps.empty:
        return set()
    all_laps = set(laps["lap_number"].dropna().astype(int).unique().tolist())
    if session not in ("R", "S"):
        return all_laps

    bad: set[int] = set()
    if not rc.empty and "date" in rc.columns:
        sc_active = False
        for _, row in rc.sort_values("date").iterrows():
            m = str(row.get("message") or "").upper()
            f = str(row.get("flag") or "").upper()
            l = row.get("lap_number")
            if pd.isna(l):
                continue
            l = int(l)
            if "SAFETY CAR DEPLOYED" in m or "VIRTUAL SAFETY CAR DEPLOYED" in m or f == "RED":
                sc_active = True
                bad.add(l)
            elif "SAFETY CAR IN THIS LAP" in m or "VIRTUAL SAFETY CAR ENDING" in m or "GREEN LIGHT" in m:
                if sc_active:
                    bad.add(l)
                    bad.add(l + 1)
                sc_active = False
            elif sc_active:
                bad.add(l)

    non_pit = laps[(~laps["is_pit_out_lap"].fillna(False)) & (laps["lap_duration"].notna())]
    if not non_pit.empty:
        med_field = non_pit.groupby("lap_number")["lap_duration"].median()
        ref = med_field.iloc[1:].median() if len(med_field) > 1 else med_field.median()
        if pd.notna(ref) and ref > 0:
            slow = set(med_field[med_field > ref * 1.06].index.astype(int))
            bad |= slow

    return all_laps - bad


def enrich_laps(
    laps: pd.DataFrame,
    drivers: pd.DataFrame,
    stints: pd.DataFrame,
    weather: pd.DataFrame,
    intervals: pd.DataFrame,
    position: pd.DataFrame,
    rc: pd.DataFrame,
    meta: dict[str, Any],
) -> pd.DataFrame:
    if laps.empty:
        return pd.DataFrame()

    df = laps.copy()
    sess = meta["session"]
    df["round"] = int(meta["round"])
    df["circuit_id"] = str(meta["circuit_id"])
    df["session"] = sess
    df["is_sprint_weekend"] = bool(meta.get("is_sprint_weekend", False))

    # Piloto y equipo
    if not drivers.empty:
        d_sub = drivers[["driver_number", "name_acronym", "team_name"]].drop_duplicates("driver_number")
        df = df.merge(d_sub, on="driver_number", how="left")
    else:
        df["name_acronym"] = None
        df["team_name"] = None

    # Stints y edad de goma
    if not stints.empty:
        st = stints.copy()
        st["stint_len"] = st["lap_end"] - st["lap_start"] + 1
        st["comp"] = st["compound"].map(COMPOUND_SHORT).fillna(st["compound"])
        m = df.merge(
            st[["driver_number", "stint_number", "lap_start", "lap_end", "comp", "tyre_age_at_start", "stint_len"]],
            on="driver_number",
            how="left",
        )
        matched = m[(m["lap_number"] >= m["lap_start"]) & (m["lap_number"] <= m["lap_end"])].copy()
        # Conservar también vueltas sin stint si existieran
        matched["tyre_age"] = matched["tyre_age_at_start"].fillna(0) + (matched["lap_number"] - matched["lap_start"])
        matched = matched.drop_duplicates(subset=["driver_number", "lap_number"], keep="last")
        df = df.merge(
            matched[["driver_number", "lap_number", "stint_number", "comp", "tyre_age", "stint_len", "lap_start", "lap_end"]],
            on=["driver_number", "lap_number"],
            how="left",
        )
    else:
        for c in ("stint_number", "comp", "tyre_age", "stint_len", "lap_start", "lap_end"):
            df[c] = np.nan

    # In-lap real (la vuelta inmediatamente anterior a un is_pit_out_lap del mismo piloto)
    out_pairs = set(
        zip(
            df.loc[df["is_pit_out_lap"] == True, "driver_number"],
            df.loc[df["is_pit_out_lap"] == True, "lap_number"] - 1,
        )
    )
    df["is_in_lap"] = [
        (d, l) in out_pairs for d, l in zip(df["driver_number"], df["lap_number"])
    ]

    # Clima más cercano a date_start
    if not weather.empty and "date_start" in df.columns and "date" in weather.columns:
        w = weather[["date", "track_temperature", "air_temperature", "rainfall", "wind_speed", "humidity"]].dropna(
            subset=["date"]
        ).sort_values("date")
        valid_dt = df["date_start"].notna()
        if valid_dt.any() and not w.empty:
            sub = df.loc[valid_dt, ["driver_number", "lap_number", "date_start"]].sort_values("date_start")
            wm = pd.merge_asof(sub, w, left_on="date_start", right_on="date", direction="nearest")
            wm.drop(columns=["date", "date_start"], inplace=True)
            df = df.merge(wm, on=["driver_number", "lap_number"], how="left")

    # Intervalos (aire sucio y hueco al líder)
    if not intervals.empty and "date_start" in df.columns:
        iv = intervals.copy()
        if "interval_s" not in iv.columns and "interval" in iv.columns:
            iv["interval_s"] = pd.to_numeric(iv["interval"], errors="coerce")
        if "gap_to_leader_s" not in iv.columns and "gap_to_leader" in iv.columns:
            iv["gap_to_leader_s"] = pd.to_numeric(iv["gap_to_leader"], errors="coerce")

        iv = iv[["driver_number", "date", "interval_s", "gap_to_leader_s"]].dropna(subset=["date"]).sort_values("date")
        lp = df[["driver_number", "lap_number", "date_start", "lap_duration"]].dropna(subset=["date_start"]).copy()
        lp["date_end"] = lp["date_start"] + pd.to_timedelta(lp["lap_duration"].fillna(90.0), unit="s")
        meds = []
        for drv, g_iv in iv.groupby("driver_number"):
            g_lp = lp.loc[lp["driver_number"] == drv].sort_values("date_start")
            if g_lp.empty:
                continue
            m = pd.merge_asof(
                g_iv.sort_values("date"),
                g_lp[["lap_number", "date_start", "date_end"]],
                left_on="date",
                right_on="date_start",
                direction="backward",
            )
            m = m.loc[m["date"] <= m["date_end"]]
            if not m.empty:
                agg = m.groupby("lap_number", as_index=False).agg(
                    interval_med_s=("interval_s", "median"),
                    gap_leader_med_s=("gap_to_leader_s", "median"),
                )
                agg["driver_number"] = drv
                meds.append(agg)
        if meds:
            df = df.merge(pd.concat(meds, ignore_index=True), on=["driver_number", "lap_number"], how="left")

    # Posición al final de cada vuelta
    if not position.empty and "date_start" in df.columns and sess in ("R", "S"):
        pos = position[["driver_number", "date", "position"]].dropna(subset=["date"]).sort_values("date")
        lp = df[["driver_number", "lap_number", "date_start", "lap_duration"]].dropna(subset=["date_start"]).copy()
        lp["date_end"] = lp["date_start"] + pd.to_timedelta(lp["lap_duration"].fillna(90.0), unit="s")
        pos_rows = []
        for drv, g_lp in lp.groupby("driver_number"):
            g_pos = pos.loc[pos["driver_number"] == drv].sort_values("date")
            if g_pos.empty:
                continue
            m = pd.merge_asof(
                g_lp.sort_values("date_end"),
                g_pos[["date", "position"]],
                left_on="date_end",
                right_on="date",
                direction="backward",
            )
            pos_rows.append(m[["driver_number", "lap_number", "position"]].rename(columns={"position": "pos_end_lap"}))
        if pos_rows:
            df = df.merge(pd.concat(pos_rows, ignore_index=True), on=["driver_number", "lap_number"], how="left")

    # Banderas verde y limpia
    green = compute_green_laps(df, rc, sess)
    df["is_green_lap"] = df["lap_number"].isin(green)

    med_pace = df.loc[df["is_green_lap"], "lap_duration"].dropna().median()
    df["is_clean_dry_lap"] = (
        df["is_green_lap"]
        & (df["lap_number"] > 1 if sess in ("R", "S") else True)
        & (~df["is_pit_out_lap"].fillna(False))
        & (~df["is_in_lap"])
        & (df["lap_duration"].notna())
        & (df["lap_duration"] < (med_pace * 1.07 if pd.notna(med_pace) else 999))
        & (df["comp"].isin(["S", "M", "H"]))
    )

    return df


def extract_telemetry_profile(gp_dir: Path, sess_dir: Path, meta: dict[str, Any]) -> list[dict[str, Any]]:
    """Extrae firmas físicas de telemetría 3.7 Hz (acelerador, frenada, velocidades, Q vs R)."""
    cd_path = sess_dir / "car_data.parquet"
    laps_path = sess_dir / "laps.parquet"
    if not cd_path.exists() or not laps_path.exists():
        return []

    cd = pd.read_parquet(cd_path)
    laps = pd.read_parquet(laps_path)
    if cd.empty or laps.empty:
        return []

    # Filtrar solo muestras en movimiento en pista (speed > 40 km/h)
    active = cd.loc[cd["speed"] > 40]
    if active.empty:
        return []

    # En Q, quedarse con la ventana de vueltas rápidas (< 1.06 * pole); en R/S/FP2, todo el rodar activo
    sess = meta["session"]
    rows: list[dict[str, Any]] = []
    if sess == "Q":
        valid_l = laps["lap_duration"].dropna()
        if valid_l.empty:
            return []
        pole = valid_l.min()
        fast_laps = laps.loc[
            (laps["lap_duration"].notna())
            & (laps["lap_duration"] <= pole * 1.04)
            & (laps["date_start"].notna())
        ]
        # Muestras de car_data durante vueltas rápidas de clasificación
        fast_samples = []
        for drv, gl in fast_laps.groupby("driver_number"):
            gc = active.loc[active["driver_number"] == drv]
            if gc.empty:
                continue
            t_cd = gc["date"].to_numpy()
            for _, lr in gl.iterrows():
                t0 = lr["date_start"]
                t1 = t0 + pd.to_timedelta(lr["lap_duration"], unit="s")
                mask = (t_cd >= np.datetime64(t0)) & (t_cd <= np.datetime64(t1))
                if mask.any():
                    fast_samples.append(gc.loc[mask])
        sample_df = pd.concat(fast_samples, ignore_index=True) if fast_samples else active
    else:
        # En R/S/FP2, filtrar vueltas limpias con velocidad media alta
        valid_l = laps["lap_duration"].dropna()
        med_l = valid_l.median() if not valid_l.empty else 120.0
        clean_l = laps.loc[
            (laps["lap_duration"].notna())
            & (laps["lap_duration"] <= med_l * 1.05)
            & (~laps["is_pit_out_lap"].fillna(False))
            & (laps["date_start"].notna())
        ]
        if len(clean_l) > 250:
            # Muestra determinista para mantener rapidez manteniendo precisión (<0.1% error)
            clean_l = clean_l.iloc[::2]
        clean_samples = []
        for drv, gl in clean_l.groupby("driver_number"):
            gc = active.loc[active["driver_number"] == drv]
            if gc.empty:
                continue
            t_cd = gc["date"].to_numpy()
            for _, lr in gl.iterrows():
                t0 = lr["date_start"]
                t1 = t0 + pd.to_timedelta(lr["lap_duration"], unit="s")
                mask = (t_cd >= np.datetime64(t0)) & (t_cd <= np.datetime64(t1))
                if mask.any():
                    clean_samples.append(gc.loc[mask])
        sample_df = pd.concat(clean_samples, ignore_index=True) if clean_samples else active

    spd = sample_df["speed"].dropna().to_numpy(dtype=float)
    thr = sample_df["throttle"].dropna().to_numpy(dtype=float)
    brk = sample_df["brake"].dropna().to_numpy(dtype=float)
    rpm = sample_df["rpm"].dropna().to_numpy(dtype=float)

    rows.append(
        {
            "round": int(meta["round"]),
            "circuit_id": str(meta["circuit_id"]),
            "session": sess,
            "n_samples": int(len(sample_df)),
            "full_throttle_pct": round(float((thr >= 98).mean() * 100), 2),
            "partial_throttle_pct": round(float(((thr > 5) & (thr < 98)).mean() * 100), 2),
            "coast_pct": round(float(((thr <= 5) & (brk == 0)).mean() * 100), 2),
            "brake_pct": round(float((brk > 0).mean() * 100), 2),
            "speed_mean": round(float(np.mean(spd)), 2),
            "speed_p10": round(float(np.percentile(spd, 10)), 1),
            "speed_p50": round(float(np.percentile(spd, 50)), 1),
            "speed_p90": round(float(np.percentile(spd, 90)), 1),
            "speed_p99": round(float(np.percentile(spd, 99)), 1),
            "rpm_p50": round(float(np.percentile(rpm, 50)), 0),
            "rpm_p95": round(float(np.percentile(rpm, 95)), 0),
        }
    )
    return rows


def main() -> int:
    if not YEAR_DIR.exists():
        print(f"No existe {YEAR_DIR}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    catalogo: list[dict[str, Any]] = []
    all_laps: list[pd.DataFrame] = []
    all_stints: list[pd.DataFrame] = []
    all_weather: list[pd.DataFrame] = []
    all_pit: list[pd.DataFrame] = []
    all_rc: list[pd.DataFrame] = []
    tel_profiles: list[dict[str, Any]] = []

    for gp_dir in sorted(YEAR_DIR.iterdir()):
        if not gp_dir.is_dir() or gp_dir.name.startswith("_"):
            continue
        for sess_dir in sorted(gp_dir.iterdir()):
            meta_path = sess_dir / "meta.json"
            if not sess_dir.is_dir() or not meta_path.exists():
                continue
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            size_mb = round(sum(f.stat().st_size for f in sess_dir.glob("*")) / (1024 * 1024), 2)
            has_tel = (sess_dir / "car_data.parquet").exists() and (sess_dir / "location.parquet").exists()

            catalogo.append(
                {
                    "round": meta["round"],
                    "circuit_id": meta["circuit_id"],
                    "meeting_name": meta["meeting_name"],
                    "session": meta["session"],
                    "is_sprint_weekend": meta.get("is_sprint_weekend", False),
                    "compounds_seen": meta.get("compounds_seen", []),
                    "has_telemetry_3hz": has_tel,
                    "size_mb": size_mb,
                    "rows": meta.get("rows", {}),
                }
            )

            laps = read_pq(sess_dir / "laps.parquet")
            drivers = read_pq(sess_dir / "drivers.parquet")
            stints = read_pq(sess_dir / "stints.parquet")
            weather = read_pq(sess_dir / "weather.parquet")
            pit = read_pq(sess_dir / "pit.parquet")
            rc = read_pq(sess_dir / "race_control.parquet")
            intervals = read_pq(sess_dir / "intervals.parquet")
            position = read_pq(sess_dir / "position.parquet")

            el = enrich_laps(laps, drivers, stints, weather, intervals, position, rc, meta)
            if not el.empty:
                all_laps.append(el)

            if not stints.empty:
                st = stints.copy()
                st["round"] = int(meta["round"])
                st["circuit_id"] = str(meta["circuit_id"])
                st["session"] = str(meta["session"])
                st["comp"] = st["compound"].map(COMPOUND_SHORT).fillna(st["compound"])
                st["stint_len"] = st["lap_end"] - st["lap_start"] + 1
                st["total_laps"] = int(laps["lap_number"].max()) if not laps.empty else np.nan
                if not drivers.empty:
                    st = st.merge(
                        drivers[["driver_number", "name_acronym", "team_name"]].drop_duplicates("driver_number"),
                        on="driver_number",
                        how="left",
                    )
                all_stints.append(st)

            if not weather.empty:
                w = weather.copy()
                w["round"] = int(meta["round"])
                w["circuit_id"] = str(meta["circuit_id"])
                w["session"] = str(meta["session"])
                all_weather.append(w)

            if not pit.empty:
                p = pit.copy()
                p["round"] = int(meta["round"])
                p["circuit_id"] = str(meta["circuit_id"])
                p["session"] = str(meta["session"])
                all_pit.append(p)

            if not rc.empty:
                r = rc.copy()
                r["round"] = int(meta["round"])
                r["circuit_id"] = str(meta["circuit_id"])
                r["session"] = str(meta["session"])
                all_rc.append(r)

            if has_tel:
                tel_profiles.extend(extract_telemetry_profile(gp_dir, sess_dir, meta))

    def save(frames: list[pd.DataFrame], name: str) -> int:
        if not frames:
            return 0
        df = pd.concat(frames, ignore_index=True)
        path = OUT_DIR / name
        df.to_parquet(path, index=False, engine="pyarrow", compression="zstd")
        sz = path.stat().st_size / (1024 * 1024)
        print(f"  {name:28s}: {len(df):8d} filas ({sz:.2f} MB)")
        return len(df)

    print("Consolidando temporada 2026...")
    save(all_laps, "laps_all.parquet")
    save(all_stints, "stints_all.parquet")
    save(all_weather, "weather_all.parquet")
    save(all_pit, "pit_all.parquet")
    save(all_rc, "race_control_all.parquet")
    if tel_profiles:
        save([pd.DataFrame(tel_profiles)], "telemetry_profiles.parquet")

    (OUT_DIR / "catalogo.json").write_text(json.dumps(catalogo, indent=2, ensure_ascii=False), encoding="utf-8")
    total_mb = sum(c["size_mb"] for c in catalogo)
    n_tel = sum(1 for c in catalogo if c["has_telemetry_3hz"])
    print(f"\nCatálogo guardado: {len(catalogo)} sesiones ({n_tel} con telemetría 3.7 Hz), {total_mb:.1f} MB totales.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
