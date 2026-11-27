#!/usr/bin/env python3
"""
Descarga y almacena datos reales de Fórmula 1 con máxima granularidad en Parquet (zstd)
usando la API abierta de OpenF1 (sin necesidad de suscripción ni credenciales).

Estructura de salida (ignorada en Git):
  datos-reales/2026/01_melbourne/R/
    meta.json
    drivers.parquet
    laps.parquet          # tiempos, sectores, speed traps y mini-sectores
    stints.parquet        # compuestos, inicio/fin de tanda, edad de neumático
    pit.parquet           # paradas en boxes y duración
    weather.parquet       # temp asfalto/aire, humedad, lluvia, viento
    race_control.parquet  # banderas, SC/VSC, penalizaciones, mensajes FIA
    position.parquet      # evolución de posiciones
    intervals.parquet     # huecos segundo a segundo (aire sucio / adelantamientos)
    car_data.parquet      # telemetría ~3.7 Hz (speed, throttle, brake, gear, rpm, drs)
    location.parquet      # coordenadas X, Y, Z ~3.7 Hz

Uso típico:
  # Probar con la Ronda 1 (Melbourne: R, Q, FP2) con todo incluida telemetría
  python scripts/descarga_f1.py --rondas 1

  # Descarga rápida de toda la temporada 2026 (vueltas, stints, pit, clima, intervalos, sin 3.7 Hz)
  python scripts/descarga_f1.py --sin-telemetria

  # Completar después la telemetría ~3.7 Hz (reanuda y solo baja lo que falte)
  python scripts/descarga_f1.py

  # Filtrar por GP o sesiones concretas
  python scripts/descarga_f1.py --gp monza,silverstone --sesiones R,Q,FP2,S
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "datos-reales"
OPENF1_BASE = "https://api.openf1.org/v1"

# Correspondencia con los IDs de data/circuitos/*.json del simulador
LOCATION_TO_CIRCUIT_ID: dict[str, str] = {
    "melbourne": "melbourne",
    "shanghai": "shanghai",
    "suzuka": "suzuka",
    "sakhir": "bahrein",
    "miami gardens": "miami",
    "miami": "miami",
    "montréal": "montreal",
    "montreal": "montreal",
    "monte carlo": "monaco",
    "monaco": "monaco",
    "barcelona": "barcelona",
    "spielberg": "spielberg",
    "silverstone": "silverstone",
    "spa-francorchamps": "spa",
    "budapest": "hungaroring",
    "zandvoort": "zandvoort",
    "monza": "monza",
    "madrid": "madrid",
    "baku": "baku",
    "kuala lumpur": "sepang",
    "sepang": "sepang",
    "marina bay": "singapur",
    "singapore": "singapur",
    "austin": "austin",
    "mexico city": "mexico",
    "são paulo": "interlagos",
    "sao paulo": "interlagos",
    "las vegas": "lasvegas",
    "lusail": "lusail",
    "yas marina": "yasmarina",
    "yas island": "yasmarina",
}

SESSION_NAME_TO_CODE: dict[str, str] = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Qualifying": "Q",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout": "SQ",
    "Sprint": "S",
    "Race": "R",
}


class OpenF1Client:
    """Cliente HTTP con control de ritmo (<= 30 req/min en capa gratuita) y reintentos."""

    def __init__(self, min_interval_s: float = 2.15) -> None:
        self.session = requests.Session()
        self.min_interval_s = min_interval_s
        self._last_req = 0.0

    def get(self, endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        url = f"{OPENF1_BASE}/{endpoint}"
        for attempt in range(1, 6):
            elapsed = time.monotonic() - self._last_req
            if elapsed < self.min_interval_s:
                time.sleep(self.min_interval_s - elapsed)
            self._last_req = time.monotonic()

            try:
                resp = self.session.get(url, params=params, timeout=60)
            except requests.RequestException as exc:
                wait = 3 * attempt
                logging.warning("  Error de red en %s (%s). Reintentando en %ds...", endpoint, exc, wait)
                time.sleep(wait)
                continue

            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
            if resp.status_code == 404:
                # OpenF1 devuelve 404 cuando no hay registros para esa consulta
                return []
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 5.0 * attempt
                logging.warning("  Rate limit (429) en %s. Esperando %.1fs...", endpoint, wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 500:
                wait = 4 * attempt
                logging.warning("  Error servidor (%d) en %s. Reintentando en %ds...", resp.status_code, endpoint, wait)
                time.sleep(wait)
                continue

            resp.raise_for_status()

        raise RuntimeError(f"Agotados los reintentos en {endpoint} con params={params}")


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def resolve_circuit_id(location: str, meeting_name: str) -> str:
    key = (location or "").strip().lower()
    if key in LOCATION_TO_CIRCUIT_ID:
        return LOCATION_TO_CIRCUIT_ID[key]
    return slugify(location or meeting_name)


def parse_utc(iso_str: str | None) -> datetime | None:
    if not iso_str:
        return None
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def compact_and_save_parquet(df: pd.DataFrame, path: Path, kind: str = "generic") -> int:
    if df is None or df.empty:
        return 0
    out = df.copy()

    # Parsear fechas ISO a timestamp UTC naive (compacto en Parquet)
    for col in ("date", "date_start", "date_end"):
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], format="ISO8601", utc=True, errors="coerce").dt.tz_localize(None)

    # Serializar listas (p. ej. segments_sector_1/2/3 en laps) y sanear columnas mixtas
    for col in out.columns:
        if out[col].dtype == "object":
            non_null = out[col].dropna()
            if non_null.empty:
                continue
            types = {type(v) for v in non_null.head(50)}
            if any(issubclass(t, (dict, list, tuple, set)) for t in types):
                out[col] = out[col].apply(
                    lambda v: json.dumps(v, separators=(",", ":")) if v is not None else None
                )
            elif kind == "intervals" and col in ("interval", "gap_to_leader"):
                # OpenF1 mezcla segundos (float) con "+1 LAP" / "+2 LAPS" (str)
                out[f"{col}_s"] = pd.to_numeric(out[col], errors="coerce").astype("float32")
                laps_match = out[col].astype(str).str.extract(r"\+(\d+)\s*LAP", expand=False)
                out[f"{col}_laps"] = pd.to_numeric(laps_match, errors="coerce").astype("Int8")
                out[col] = out[col].astype("string")
            elif len({type(v) for v in non_null}) > 1:
                out[col] = out[col].astype("string")

    if kind == "car_data":
        for c, t in (
            ("driver_number", "Int16"),
            ("speed", "Int16"),
            ("rpm", "Int32"),
            ("throttle", "Int16"),
            ("brake", "Int16"),
            ("n_gear", "Int16"),
            ("drs", "Int16"),
        ):
            if c in out.columns:
                out[c] = pd.to_numeric(out[c], errors="coerce").round().astype(t)
        out.drop(columns=["meeting_key", "session_key"], inplace=True, errors="ignore")

    elif kind == "location":
        for c, t in (("driver_number", "Int16"), ("x", "float32"), ("y", "float32"), ("z", "float32")):
            if c in out.columns:
                out[c] = pd.to_numeric(out[c], errors="coerce").astype(t)
        out.drop(columns=["meeting_key", "session_key"], inplace=True, errors="ignore")

    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(path, index=False, engine="pyarrow", compression="zstd")
    return len(out)


def build_calendar(client: OpenF1Client, year: int) -> list[dict[str, Any]]:
    """Obtiene meetings y sesiones reales (sin tests ni cancelados) ordenados por ronda."""
    meetings = client.get("meetings", {"year": year})
    sessions = client.get("sessions", {"year": year})

    sess_by_meeting: dict[int, list[dict[str, Any]]] = {}
    for s in sessions:
        if s.get("is_cancelled"):
            continue
        mk = s.get("meeting_key")
        if mk is not None:
            sess_by_meeting.setdefault(int(mk), []).append(s)

    events: list[dict[str, Any]] = []
    for m in sorted(meetings, key=lambda x: x.get("date_start", "")):
        name = str(m.get("meeting_name", ""))
        if "testing" in name.lower():
            continue
        mk = int(m["meeting_key"])
        m_sessions = sess_by_meeting.get(mk, [])
        if not m_sessions:
            # GP cancelado (p. ej. Sakhir / Jeddah en 2026)
            continue

        codes: dict[str, dict[str, Any]] = {}
        for s in m_sessions:
            code = SESSION_NAME_TO_CODE.get(str(s.get("session_name", "")))
            if code:
                codes[code] = s

        if "R" not in codes:
            continue

        events.append(
            {
                "meeting_key": mk,
                "meeting_name": name,
                "location": str(m.get("location", "")),
                "country": str(m.get("country_name", "")),
                "circuit_id": resolve_circuit_id(str(m.get("location", "")), name),
                "is_sprint": "S" in codes or "SQ" in codes,
                "sessions": codes,
            }
        )

    for idx, ev in enumerate(events, start=1):
        ev["round"] = idx
    return events


def download_session(
    client: OpenF1Client,
    year: int,
    ev: dict[str, Any],
    sess_code: str,
    with_telemetry: bool,
    force: bool,
) -> bool:
    sess = ev["sessions"][sess_code]
    sk = int(sess["session_key"])
    round_num = ev["round"]
    circuit_id = ev["circuit_id"]

    out_dir = DATA_DIR / str(year) / f"{round_num:02d}_{circuit_id}" / sess_code
    meta_path = out_dir / "meta.json"

    # Endpoints por sesión
    core_endpoints = ["drivers", "laps", "stints", "weather", "race_control", "position"]
    if sess_code in ("R", "S"):
        core_endpoints.extend(["pit", "intervals"])
    else:
        core_endpoints.append("pit")

    telemetry_files = ["car_data", "location"] if with_telemetry else []

    # Comprobar si ya está completo
    if not force and meta_path.exists():
        prev_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        has_all_tel = all((out_dir / f"{t}.parquet").exists() for t in telemetry_files)
        if prev_meta.get("core_complete") and (not with_telemetry or has_all_tel):
            logging.info("Saltando R%02d %s [%s] (ya completo)", round_num, circuit_id, sess_code)
            return True

    t0 = time.perf_counter()
    logging.info("Descargando R%02d %s [%s] (session_key=%d)...", round_num, circuit_id, sess_code, sk)
    out_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    if meta_path.exists() and not force:
        counts.update(json.loads(meta_path.read_text(encoding="utf-8")).get("rows", {}))

    # 1. Tablas núcleo (una petición por tabla)
    drivers_list: list[int] = []
    for ep in core_endpoints:
        pq = out_dir / f"{ep}.parquet"
        if not force and pq.exists():
            df_existing = pd.read_parquet(pq)
            counts[ep] = len(df_existing)
            if ep == "drivers":
                drivers_list = sorted(df_existing["driver_number"].dropna().astype(int).unique().tolist())
            continue

        rows = client.get(ep, {"session_key": sk})
        if rows:
            df = pd.DataFrame(rows)
            counts[ep] = compact_and_save_parquet(df, pq, kind=ep)
            if ep == "drivers":
                drivers_list = sorted(df["driver_number"].dropna().astype(int).unique().tolist())
        else:
            counts[ep] = 0

    if not drivers_list and (out_dir / "drivers.parquet").exists():
        df_d = pd.read_parquet(out_dir / "drivers.parquet")
        drivers_list = sorted(df_d["driver_number"].dropna().astype(int).unique().tolist())

    # 2. Telemetría de alta frecuencia (~3.7 Hz): car_data y location por piloto
    if with_telemetry and drivers_list:
        for ep in ("car_data", "location"):
            pq = out_dir / f"{ep}.parquet"
            if not force and pq.exists():
                continue
            logging.info("  Descargando %s (%d pilotos)...", ep, len(drivers_list))
            frames: list[pd.DataFrame] = []
            for drv_num in drivers_list:
                rows = client.get(ep, {"session_key": sk, "driver_number": drv_num})
                if rows:
                    frames.append(pd.DataFrame(rows))
            if frames:
                full = pd.concat(frames, ignore_index=True)
                counts[ep] = compact_and_save_parquet(full, pq, kind=ep)
            else:
                counts[ep] = 0

    compounds: list[str] = []
    if (out_dir / "stints.parquet").exists():
        st = pd.read_parquet(out_dir / "stints.parquet")
        if "compound" in st.columns:
            compounds = sorted(st["compound"].dropna().astype(str).unique().tolist())

    meta = {
        "source": "openf1",
        "year": year,
        "round": round_num,
        "circuit_id": circuit_id,
        "meeting_key": ev["meeting_key"],
        "meeting_name": ev["meeting_name"],
        "location": ev["location"],
        "country": ev["country"],
        "is_sprint_weekend": ev["is_sprint"],
        "session": sess_code,
        "session_key": sk,
        "date_start_utc": sess.get("date_start"),
        "date_end_utc": sess.get("date_end"),
        "compounds_seen": compounds,
        "core_complete": True,
        "telemetry_complete": with_telemetry and (out_dir / "car_data.parquet").exists(),
        "rows": counts,
        "elapsed_s": round(time.perf_counter() - t0, 2),
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

    size_mb = sum(f.stat().st_size for f in out_dir.glob("*")) / (1024 * 1024)
    logging.info(
        "  OK R%02d %s [%s]: %d vueltas, %d stints, %d car_data, %.2f MB (%.1fs)",
        round_num,
        circuit_id,
        sess_code,
        counts.get("laps", 0),
        counts.get("stints", 0),
        counts.get("car_data", 0),
        size_mb,
        meta["elapsed_s"],
    )
    return True


def parse_rounds(spec: str | None) -> set[int] | None:
    if not spec:
        return None
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Descarga datos reales de F1 desde OpenF1 en Parquet (zstd).")
    p.add_argument("--anio", type=int, default=2026, help="Temporada a descargar (por defecto: 2026).")
    p.add_argument("--rondas", type=str, default=None, help="Rondas a descargar, ej: 1,2,5-8.")
    p.add_argument("--gp", type=str, default=None, help="Filtrar por circuit_id o nombre, ej: melbourne,monza.")
    p.add_argument(
        "--sesiones",
        type=str,
        default=None,
        help="Sesiones separadas por coma (ej: R,Q,FP2,S). Por defecto: R,Q,FP2 (y R,Q,S en finde Sprint).",
    )
    p.add_argument("--sin-telemetria", action="store_true", help="Omitir car_data y location (~3.7 Hz).")
    p.add_argument("--forzar", action="store_true", help="Re-descargar archivos existentes.")
    p.add_argument("--incluir-futuras", action="store_true", help="Intentar descargar también sesiones futuras.")
    p.add_argument(
        "--pausa",
        type=float,
        default=2.15,
        help="Segundos mínimos entre peticiones a OpenF1 (2.15s cumple el límite gratuito de 30 req/min).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )

    client = OpenF1Client(min_interval_s=args.pausa)
    logging.info("Consultando calendario %d en OpenF1...", args.anio)
    calendar = build_calendar(client, args.anio)
    logging.info("Encontrados %d grandes premios válidos en %d.", len(calendar), args.anio)

    rounds_filter = parse_rounds(args.rondas)
    gp_filter = {x.strip().lower() for x in args.gp.split(",") if x.strip()} if args.gp else None
    requested_sessions = (
        [x.strip().upper() for x in args.sesiones.split(",") if x.strip()]
        if args.sesiones
        else None
    )

    now_utc = datetime.now(timezone.utc)
    ok_count = 0
    err_count = 0

    for ev in calendar:
        rnum = ev["round"]
        cid = ev["circuit_id"]
        if rounds_filter is not None and rnum not in rounds_filter:
            continue
        if gp_filter is not None and not any(
            g in cid or g in ev["meeting_name"].lower() or g in ev["location"].lower()
            for g in gp_filter
        ):
            continue

        if requested_sessions is None:
            sess_list = ["R", "Q", "S"] if ev["is_sprint"] else ["R", "Q", "FP2"]
        else:
            sess_list = [s for s in requested_sessions if s in ev["sessions"]]

        for sc in sess_list:
            if sc not in ev["sessions"]:
                continue
            date_end = parse_utc(ev["sessions"][sc].get("date_end"))
            if not args.incluir_futuras and date_end is not None and date_end > now_utc:
                logging.info("Omitiendo R%02d %s [%s] (aún no disputada)", rnum, cid, sc)
                continue

            try:
                download_session(
                    client=client,
                    year=args.anio,
                    ev=ev,
                    sess_code=sc,
                    with_telemetry=not args.sin_telemetria,
                    force=args.forzar,
                )
                ok_count += 1
            except Exception as exc:
                err_count += 1
                logging.error("ERROR en R%02d %s [%s]: %s", rnum, cid, sc, exc)

    logging.info("Terminado: %d sesiones OK, %d errores.", ok_count, err_count)
    return 1 if err_count > 0 and ok_count == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
