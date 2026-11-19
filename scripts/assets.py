#!/usr/bin/env python3
"""Descarga y optimiza los assets gratuitos (CC0 y MIT) en public/assets/."""
from __future__ import annotations

import io
import json
import math
import re
import shutil
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets"
HEADERS = {"User-Agent": "MuroDeBoxes-F1Manager/1.0"}

TEXTURAS = {
    "asfalto": "asphalt_track",
    "hierba": "grass_ground",
    "grava": "gravel_floor_02",
    "hormigon": "concrete_wall_008",
    "fachada": "plaster_grey_04",
}

ENTORNOS = {
    "dia": "kloofendal_43d_clear_puresky",
    "tarde": "belfast_sunset_puresky",
    "nublado": "kloofendal_overcast_puresky",
    "noche": "shanghai_bund",
    "estudio": "studio_small_09",
}

BANDERAS = [
    "ae", "ar", "at", "au", "az", "be", "bh", "br", "ca", "ch", "cn", "co", "de",
    "dk", "ee", "es", "fi", "fr", "gb", "hu", "id", "ie", "in", "it", "jp", "mc",
    "mx", "my", "nl", "nz", "pl", "qa", "ru", "se", "sg", "th", "us", "ve",
]

FLAG_ICONS_VER = "7.6.0"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def fetch_json(url: str) -> dict:
    return json.loads(fetch(url).decode("utf-8"))


def pick_tex_url(files: dict, kind: str, prefer: tuple[str, ...]) -> str | None:
    node = files.get(kind, {}).get("1k", {})
    for fmt in prefer:
        if fmt in node and "url" in node[fmt]:
            return node[fmt]["url"]
    return None


def recenter(arr: np.ndarray, target_std: float, lo: float, hi: float) -> np.ndarray:
    """Recentra una matriz float32 a media 0,5 con desviación típica dada."""
    std = float(np.std(arr))
    out = 0.5 + (arr - float(np.mean(arr))) * (target_std / std) if std > 1e-6 else np.full_like(arr, 0.5)
    return np.clip(np.round(np.clip(out, lo, hi) * 255.0), 0, 255).astype(np.uint8)


# Texturas que se repiten muy seguido (el asfalto, cada 2,7 m): sin manchas grandes, que al repetirse se ven como
# baldosas. Lo grande ya lo ponen las otras capas y el ruido del sombreador.
APLANAR = {"asfalto": 18.0}


def highpass(ch: np.ndarray, sigma: float) -> np.ndarray:
    """Quita a un canal (0..1) lo que varía en más de ~sigma píxeles, sin costuras (con la FFT, que da la vuelta)."""
    h, w = ch.shape
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
    low = np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return ch - np.real(np.fft.ifft2(np.fft.fft2(ch) * low)) + float(ch.mean())


def aplanar(dest: Path, sigma: float) -> None:
    """Aplana un .webp ya empaquetado (R claro/oscuro, GB relieve, A rugosidad): mismas medias y contraste fino."""
    x = np.asarray(Image.open(dest).convert("RGBA"), dtype=np.float32) / 255.0
    out = []
    for i, (lo, hi) in enumerate(((0.06, 0.94), (0.04, 0.96), (0.04, 0.96), (0.05, 0.95))):
        c = highpass(x[..., i], sigma)
        out.append(recenter(c, float(np.std(x[..., i])), lo, hi))
    Image.fromarray(np.stack(out, axis=-1), mode="RGBA").save(dest, format="WEBP", lossless=True, exact=True, method=6)
    print(f"  tex/{dest.name}: aplanada (sigma {sigma:g} px), {dest.stat().st_size / 1024:.1f} KB")


def pack_texture(nombre: str, asset_id: str, dest: Path) -> None:
    files = fetch_json(f"https://api.polyhaven.com/files/{asset_id}")
    u_diff = pick_tex_url(files, "Diffuse", ("jpg", "png"))
    u_norm = pick_tex_url(files, "nor_gl", ("png", "jpg"))
    u_rough = pick_tex_url(files, "Rough", ("jpg", "png"))
    u_ao = pick_tex_url(files, "AO", ("jpg", "png"))
    if not (u_diff and u_norm and u_rough):
        raise RuntimeError(f"Faltan mapas PBR en {asset_id}")

    sz = (384, 384)
    res = Image.Resampling.LANCZOS
    diff = np.asarray(Image.open(io.BytesIO(fetch(u_diff))).convert("RGB").resize(sz, res), dtype=np.float32) / 255.0
    norm = np.asarray(Image.open(io.BytesIO(fetch(u_norm))).convert("RGB").resize(sz, res), dtype=np.float32) / 255.0
    rough = np.asarray(Image.open(io.BytesIO(fetch(u_rough))).convert("L").resize(sz, res), dtype=np.float32) / 255.0

    # Luminancia perceptual del albedo mezclada un 25 % con AO, más normales y rugosidad sin submuestreo
    lum = 0.299 * diff[..., 0] + 0.587 * diff[..., 1] + 0.114 * diff[..., 2]
    if u_ao:
        ao = np.asarray(Image.open(io.BytesIO(fetch(u_ao))).convert("L").resize(sz, res), dtype=np.float32) / 255.0
        val = 0.75 * lum + 0.25 * ao
    else:
        val = lum
    r_ch = recenter(val, 0.17, 0.06, 0.94)
    g_ch = recenter(norm[..., 0], 0.15, 0.04, 0.96)
    b_ch = recenter(norm[..., 1], 0.15, 0.04, 0.96)
    a_ch = recenter(rough, 0.15, 0.05, 0.95)

    rgba = np.stack([r_ch, g_ch, b_ch, a_ch], axis=-1)
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(
        dest, format="WEBP", lossless=True, exact=True, method=6
    )
    print(f"  tex/{nombre}.webp ({asset_id}): {dest.stat().st_size / 1024:.1f} KB")
    if nombre in APLANAR:
        aplanar(dest, APLANAR[nombre])


def decode_hdr(raw: bytes) -> tuple[np.ndarray, int, int]:
    """Decodifica un archivo Radiance .hdr RLE a float32 lineal (H, W, 3)."""
    pos = 0
    w = h = 0
    while pos < len(raw):
        nl = raw.find(b"\n", pos)
        if nl < 0:
            raise ValueError("Cabecera .hdr incompleta")
        line = raw[pos:nl].decode("ascii", errors="replace").strip()
        pos = nl + 1
        m = re.match(r"^-Y\s+(\d+)\s+\+X\s+(\d+)$", line)
        if m:
            h, w = int(m.group(1)), int(m.group(2))
            break
    if w <= 0 or h <= 0:
        raise ValueError("Dimensiones .hdr no válidas")

    rgbe = np.empty((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if raw[pos] != 2 or raw[pos + 1] != 2 or ((raw[pos + 2] << 8) | raw[pos + 3]) != w:
            raise ValueError("Se esperaba formato RLE estándar en .hdr")
        pos += 4
        scan = np.empty(4 * w, dtype=np.uint8)
        ptr = 0
        while ptr < 4 * w:
            cnt = raw[pos]
            pos += 1
            if cnt > 128:
                run = cnt - 128
                scan[ptr : ptr + run] = raw[pos]
                pos += 1
                ptr += run
            else:
                scan[ptr : ptr + cnt] = np.frombuffer(raw, dtype=np.uint8, count=cnt, offset=pos)
                pos += cnt
                ptr += cnt
        rgbe[y, :, 0] = scan[0:w]
        rgbe[y, :, 1] = scan[w : 2 * w]
        rgbe[y, :, 2] = scan[2 * w : 3 * w]
        rgbe[y, :, 3] = scan[3 * w : 4 * w]

    e = rgbe[..., 3].astype(np.int32)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    mask = e > 0
    scale = np.zeros((h, w), dtype=np.float32)
    scale[mask] = np.ldexp(1.0, e[mask] - 128).astype(np.float32) / 255.0
    rgb[mask] = rgbe[mask, :3].astype(np.float32) * scale[mask, None]
    return rgb, w, h


def encode_rle_channel(ch: np.ndarray) -> bytes:
    """Codifica una fila de un canal uint8 en RLE Radiance."""
    n = len(ch)
    out = bytearray()
    i = 0
    while i < n:
        # Buscar racha repetida de al menos 4 bytes iguales
        run = 1
        while i + run < n and run < 127 and ch[i + run] == ch[i]:
            run += 1
        if run >= 4:
            out.append(128 + run)
            out.append(int(ch[i]))
            i += run
            continue
        # Tramo literal hasta encontrar otra racha larga o alcanzar 128 bytes
        lit_start = i
        i += 1
        while i < n and (i - lit_start) < 128:
            r2 = 1
            while i + r2 < n and r2 < 4 and ch[i + r2] == ch[i]:
                r2 += 1
            if r2 >= 4:
                break
            i += 1
        lit_len = i - lit_start
        out.append(lit_len)
        out.extend(ch[lit_start:i].tobytes())
    return bytes(out)


def encode_hdr(rgb: np.ndarray, dest: Path) -> None:
    """Codifica un array float32 lineal (H, W, 3) como Radiance .hdr RLE."""
    h, w, _ = rgb.shape
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            r, g, b = float(rgb[y, x, 0]), float(rgb[y, x, 1]), float(rgb[y, x, 2])
            mx = max(r, g, b)
            if mx < 1e-32:
                continue
            _, exp = math.frexp(mx)
            inv = 255.0 / math.ldexp(1.0, exp)
            rgbe[y, x, 0] = min(255, max(0, int(round(r * inv))))
            rgbe[y, x, 1] = min(255, max(0, int(round(g * inv))))
            rgbe[y, x, 2] = min(255, max(0, int(round(b * inv))))
            rgbe[y, x, 3] = min(255, max(1, exp + 128))

    buf = bytearray()
    buf.extend(f"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {h} +X {w}\n".encode("ascii"))
    row_hdr = bytes([2, 2, (w >> 8) & 0xFF, w & 0xFF])
    for y in range(h):
        buf.extend(row_hdr)
        for c in range(4):
            buf.extend(encode_rle_channel(rgbe[y, :, c]))

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(bytes(buf))


def pack_hdri(nombre: str, asset_id: str, dest: Path) -> None:
    files = fetch_json(f"https://api.polyhaven.com/files/{asset_id}")
    url = files["hdri"]["1k"]["hdr"]["url"]
    rgb, w, h = decode_hdr(fetch(url))
    tw, th = 256, 128
    if w % tw == 0 and h % th == 0:
        small = rgb.reshape(th, h // th, tw, w // tw, 3).mean(axis=(1, 3))
    else:
        ys = (np.linspace(0, h - 1, th)).astype(np.int32)
        xs = (np.linspace(0, w - 1, tw)).astype(np.int32)
        small = rgb[np.ix_(ys, xs)]
    encode_hdr(small, dest)

    # Comprobar lectura de vuelta para garantizar compatibilidad con HDRLoader
    check, cw, ch = decode_hdr(dest.read_bytes())
    assert (cw, ch) == (tw, th)
    rel_err = abs(float(check.mean()) - float(small.mean())) / max(1e-6, float(small.mean()))
    assert rel_err < 0.02, f"Error demasiado alto al verificar {dest}: {rel_err}"
    print(f"  env/{nombre}.hdr ({asset_id}): {dest.stat().st_size / 1024:.1f} KB (err medio {rel_err:.4f})")


def download_flags() -> None:
    fdir = OUT / "flags"
    fdir.mkdir(parents=True, exist_ok=True)
    total = 0
    for cc in BANDERAS:
        data = fetch(f"https://cdn.jsdelivr.net/npm/flag-icons@{FLAG_ICONS_VER}/flags/4x3/{cc}.svg")
        p = fdir / f"{cc}.svg"
        p.write_bytes(data)
        total += len(data)
    lic = fetch(f"https://cdn.jsdelivr.net/npm/flag-icons@{FLAG_ICONS_VER}/LICENSE")
    (OUT / "LICENCIA-FLAG-ICONS-MIT.txt").write_bytes(lic)
    print(f"  flags/*.svg ({len(BANDERAS)} archivos): {total / 1024:.1f} KB")


def write_polyhaven_license() -> None:
    lines = [
        "Assets de Poly Haven (texturas PBR y entornos HDRI) bajo licencia CC0 1.0 Universal",
        "https://polyhaven.com/license",
        "",
        "Texturas (public/assets/tex/*.webp):",
        *[f"  - {k}.webp <- https://polyhaven.com/a/{v}" for k, v in TEXTURAS.items()],
        "",
        "Entornos HDRI (public/assets/env/*.hdr):",
        *[f"  - {k}.hdr <- https://polyhaven.com/a/{v}" for k, v in ENTORNOS.items()],
        "",
    ]
    (OUT / "LICENCIA-POLYHAVEN-CC0.txt").write_text("\n".join(lines), encoding="utf-8")


def copy_draco() -> None:
    """Copia los decodificadores Draco de Three.js a public/draco/ si están instalados."""
    src = ROOT / "node_modules" / "three" / "examples" / "jsm" / "libs" / "draco" / "gltf"
    if not src.is_dir():
        return
    dst = ROOT / "public" / "draco"
    dst.mkdir(parents=True, exist_ok=True)
    for name in ("draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"):
        f = src / name
        if f.is_file():
            shutil.copy2(f, dst / name)
    print("  draco/: decodificador copiado desde three")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Descargando texturas PBR (Poly Haven CC0)...")
    for k, v in TEXTURAS.items():
        pack_texture(k, v, OUT / "tex" / f"{k}.webp")
    print("Descargando entornos HDRI (Poly Haven CC0)...")
    for k, v in ENTORNOS.items():
        pack_hdri(k, v, OUT / "env" / f"{k}.hdr")
    print("Descargando banderas SVG (flag-icons MIT)...")
    download_flags()
    copy_draco()
    write_polyhaven_license()
    total_kb = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) / 1024
    print(f"Hecho. Peso total en public/assets/: {total_kb:.1f} KB")


if __name__ == "__main__":
    import sys
    if "--aplanar" in sys.argv:  # solo aplanar las que ya están, sin descargar nada
        for k, sg in APLANAR.items():
            aplanar(OUT / "tex" / f"{k}.webp", sg)
    else:
        main()
