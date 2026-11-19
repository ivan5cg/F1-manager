"""Prepara el coche de seguridad (.glb descargado, p. ej. de Sketchfab) sin Blender ni herramientas externas.

Solo con numpy:
  1. lee la geometría con la jerarquía aplicada y clasifica cada malla por el nombre de su nodo (que lleva el
     material original): pintura, negro, carbono, metal, llanta, goma, cristal, pilotos, intermitentes y luces del
     techo. El interior, los cinturones, las pantallas y las pegatinas o insignias se descartan (no se ven y no
     queremos marcas);
  2. lo orienta como el juego (+X delante, +Y arriba), lo escala a 4,7 m de largo y lo apoya en y = 0;
  3. lo simplifica agrupando vértices en una rejilla (más fina para las piezas pequeñas) hasta el presupuesto de
     triángulos: safety.glb (cerca) y safety_lo.glb (lejos y calidad baja);
  4. lo escribe con las posiciones cuantizadas a 16 bits (KHR_mesh_quantization: three.js lo lee sin
     decodificador) y sin normales (el juego las calcula con pliegues al cargarlo).
Cada malla se llama como su grupo; el juego pone los colores (src/ui/map3d.ts, SC_COLORS).

Uso:
  python3 scripts/prepara_safety_glb.py coche.glb [--voltear] [--info]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "models"
LENGTH = 4.7  # largo del coche de seguridad en el juego (como SC_GEO)
BUDGET_HI, BUDGET_LO = 30000, 6000

DTYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

# grupos, por orden: el primero que encaja con el nombre del nodo. None = se descarta.
GROUPS: list[tuple[str | None, str]] = [
    (None, r"(^|_)(int|intsp|intzxc|sp_roof)_|anquandai|seat|steer|stereo|screen|rpm|tc_level|shift|pone|mark|tiezhi|logo|badge|arrow|sanre|zxcasdgf|GTs_|usb|airbag|dash|plate|wheel_metal|zhegai"),
    ("luz", r"safelight_light"),
    ("ambar", r"turn"),
    ("rojo", r"red_glass|(^|_)r_light|_r_bulb|fog_light|brake"),
    ("acento", r"body_red"),
    ("cristal", r"glass|window|s_window"),
    ("goma", r"tyre|tire"),
    ("llanta", r"wheel_color"),
    ("metal", r"chrome|metal|luosi|paiqi|disc"),
    ("carbono", r"carbon"),
    ("negro", r"paint_black"),
    ("pintura", r"car_paint|paint_backroof|fengxian"),
    ("negro", r"."),
]


def _node_matrix(n: dict) -> np.ndarray:
    if "matrix" in n:
        return np.array(n["matrix"], dtype=np.float64).reshape((4, 4)).T
    M = np.eye(4)
    if "scale" in n:
        M = M @ np.diag([*n["scale"], 1.0])
    if "rotation" in n:
        qx, qy, qz, qw = n["rotation"]
        R = np.array([
            [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 0],
            [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 0],
            [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy), 0],
            [0, 0, 0, 1]])
        M = R @ M
    if "translation" in n:
        T = np.eye(4)
        T[:3, 3] = n["translation"]
        M = T @ M
    return M


def _read_accessor(j: dict, buf: bytes, ai: int) -> np.ndarray:
    acc = j["accessors"][ai]
    bv = j["bufferViews"][acc["bufferView"]]
    dt = np.dtype(DTYPES[acc["componentType"]])
    nc, cnt = NCOMP[acc["type"]], int(acc["count"])
    off = int(bv.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
    eb = nc * dt.itemsize
    stride = int(bv.get("byteStride", eb))
    if stride == eb:
        out = np.frombuffer(buf, dtype=dt, count=cnt * nc, offset=off).copy().reshape((cnt, nc))
    else:
        raw = np.frombuffer(buf, dtype=np.uint8, count=cnt * stride, offset=off)
        out = np.ascontiguousarray(np.lib.stride_tricks.as_strided(raw, shape=(cnt, eb), strides=(stride, 1))).view(dt).reshape((cnt, nc))
    if acc.get("normalized") and np.issubdtype(dt, np.integer):
        out = out.astype(np.float64) / float(np.iinfo(dt).max)
    return out if nc > 1 else out.reshape(-1)


def group_of(name: str) -> str | None:
    for g, rx in GROUPS:
        if re.search(rx, name, re.I):
            return g
    return "negro"


def read_groups(path: Path) -> tuple[dict[str, list[tuple[np.ndarray, np.ndarray]]], dict[str, int]]:
    b = path.read_bytes()
    if b[:4] != b"glTF":
        raise ValueError(f"{path} no es un .glb")
    jlen = int.from_bytes(b[12:16], "little")
    j = json.loads(b[20:20 + jlen])
    boff = 20 + jlen
    buf = b[boff + 8: boff + 8 + int.from_bytes(b[boff:boff + 4], "little")]
    nodes, meshes = j["nodes"], j["meshes"]
    out: dict[str, list] = {}
    names: dict[str, int] = {}

    def walk(ni: int, pm: np.ndarray, label: str) -> None:
        node = nodes[ni]
        lm = pm @ _node_matrix(node)
        nm = node.get("name", "") or label
        if "mesh" in node:
            g = group_of(nm)
            for pr in meshes[node["mesh"]]["primitives"]:
                if pr.get("mode", 4) != 4:
                    continue
                pos = _read_accessor(j, buf, pr["attributes"]["POSITION"]).astype(np.float64)
                idx = _read_accessor(j, buf, pr["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in pr else np.arange(len(pos) // 3 * 3).reshape(-1, 3)
                key = f"{g}  {re.sub(r'^[0-9]+(_T)?_', '', nm)}"
                names[key] = names.get(key, 0) + len(idx)
                if g is None:
                    continue
                out.setdefault(g, []).append(((pos @ lm[:3, :3].T) + lm[:3, 3], idx))
        for ch in node.get("children", []):
            walk(ch, lm, nm)

    for r in j["scenes"][j.get("scene", 0)]["nodes"]:
        walk(r, np.eye(4), "")
    return out, names


# Insignias de la marca (ya orientado, en metros): la estrella del morro y la del maletero, las de los costados y
# lo que asoma en el centro de los dos extremos. Se quitan los triángulos del grupo cuyo centro cae dentro de la caja.
BADGES: list[tuple[str, tuple[float, float, float, float, float, float]]] = [
    # grupo, (x0, x1, y0, y1, |z|0, |z|1)
    ("metal", (2.15, 9, 0.28, 0.64, 0, 0.2)),
    ("cristal", (2.15, 9, 0.28, 0.64, 0, 0.05)),
    ("metal", (-9, -2.15, 0.7, 0.95, 0, 0.2)),
    ("cristal", (-9, -2.25, 0.4, 0.7, 0, 0.05)),
    ("metal", (0.4, 0.72, 0.6, 0.72, 0.9, 9)),
]


def remove_badges(groups: dict[str, tuple[np.ndarray, np.ndarray]]) -> int:
    n = 0
    for g, (x0, x1, y0, y1, z0, z1) in BADGES:
        if g not in groups:
            continue
        V, F = groups[g]
        C = V[F].mean(1)
        az = np.abs(C[:, 2])
        out = (C[:, 0] > x0) & (C[:, 0] < x1) & (C[:, 1] > y0) & (C[:, 1] < y1) & (az >= z0) & (az < z1)
        n += int(out.sum())
        groups[g] = (V, F[~out])
    return n


def merge(parts: list[tuple[np.ndarray, np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    V, F, o = [], [], 0
    for v, f in parts:
        V.append(v); F.append(f + o); o += len(v)
    return np.vstack(V), np.vstack(F)


def orient(groups: dict[str, tuple[np.ndarray, np.ndarray]], flip: bool) -> None:
    """+X delante (donde están los intermitentes), +Y arriba, largo LENGTH, apoyado en y = 0 y centrado."""
    allV = np.vstack([v for v, _ in groups.values()])
    lo, hi = allV.min(0), allV.max(0)
    ext = hi - lo
    long_ax = 0 if ext[0] >= ext[2] else 2
    ctr = (lo + hi) / 2
    # delante: los intermitentes (o, si no hay, las luces rojas están detrás)
    front = 1.0
    if "ambar" in groups:
        front = np.sign(groups["ambar"][0][:, long_ax].mean() - ctr[long_ax]) or 1.0
    elif "rojo" in groups:
        front = -np.sign(groups["rojo"][0][:, long_ax].mean() - ctr[long_ax]) or 1.0
    if flip:
        front = -front
    s = LENGTH / ext[long_ax]
    for g, (V, F) in groups.items():
        P = (V - ctr) * s
        if long_ax == 0:
            x, z = P[:, 0] * front, P[:, 2] * front
        else:  # el largo va en z: se gira 90° alrededor de y
            x, z = P[:, 2] * front, -P[:, 0] * front
        y = P[:, 1] - (lo[1] - ctr[1]) * s
        groups[g] = (np.stack([x, y, z], 1), F)


def cluster(V: np.ndarray, F: np.ndarray, cell: float) -> tuple[np.ndarray, np.ndarray]:
    """Junta los vértices de cada celda de la rejilla en su media y quita los triángulos que se aplastan o repiten."""
    Q = np.floor(V / cell).astype(np.int64)
    _, inv = np.unique(Q, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    n = inv.max() + 1
    S = np.zeros((n, 3)); np.add.at(S, inv, V)
    C = np.bincount(inv, minlength=n).astype(np.float64)
    Vn = S / C[:, None]
    Fn = inv[F]
    ok = (Fn[:, 0] != Fn[:, 1]) & (Fn[:, 1] != Fn[:, 2]) & (Fn[:, 0] != Fn[:, 2])
    Fn = Fn[ok]
    _, keep = np.unique(np.sort(Fn, 1), axis=0, return_index=True)
    Fn = Fn[np.sort(keep)]
    used = np.unique(Fn)
    remap = np.full(n, -1); remap[used] = np.arange(len(used))
    return Vn[used], remap[Fn]


# rejilla de cada grupo: más fina para las luces (que no desaparezcan) y la pintura (lo que más se ve), más gruesa
# para lo oscuro (negro, carbono, gomas), donde no se notan los detalles
FINE = {"luz": 0.2, "rojo": 0.5, "ambar": 0.4, "acento": 0.6, "pintura": 0.75, "cristal": 0.85, "negro": 1.15, "carbono": 1.2, "goma": 1.3}


def simplify(groups: dict[str, tuple[np.ndarray, np.ndarray]], budget: int) -> tuple[dict, float]:
    lo, hi = 0.002, 0.3
    best = None
    for _ in range(22):
        cell = (lo + hi) / 2
        res = {g: cluster(V, F, cell * FINE.get(g, 1.0)) for g, (V, F) in groups.items()}
        n = sum(len(f) for _, f in res.values())
        if n > budget:
            lo = cell
        else:
            hi, best = cell, (res, cell)
    return best


def write_quantized(groups: dict[str, tuple[np.ndarray, np.ndarray]], dest: Path, info: dict) -> None:
    """Un .glb con una malla por grupo: posiciones int16 (la escala va en el nodo) e índices uint16/uint32."""
    allV = np.vstack([v for v, f in groups.values() if len(f)])
    lo, hi = allV.min(0), allV.max(0)
    ctr, half = (lo + hi) / 2, np.max(hi - lo) / 2 * 1.0001
    k = half / 32767.0
    parts, bvs, accs, meshes, off = [], [], [], [], 0

    def push(data: bytes, target: int, stride: int | None = None) -> int:
        nonlocal off
        pad = (-len(data)) % 4
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target}
        if stride:
            bv["byteStride"] = stride
        bvs.append(bv); parts.append(data + b"\0" * pad); off += len(data) + pad
        return len(bvs) - 1

    groups = {g: vf for g, vf in groups.items() if len(vf[1])}
    for g, (V, F) in groups.items():
        q = np.round((V - ctr) / k).astype(np.int16)
        q4 = np.zeros((len(q), 4), dtype=np.int16); q4[:, :3] = q  # alineado a 4 bytes
        pa = len(accs)
        accs.append({"bufferView": push(q4.tobytes(), 34962, 8), "componentType": 5122, "count": len(q), "type": "VEC3",
                     "min": [int(x) for x in q.min(0)], "max": [int(x) for x in q.max(0)]})
        big = F.max() >= 65535
        ia = len(accs)
        accs.append({"bufferView": push(F.astype(np.uint32 if big else np.uint16).tobytes(), 34963), "componentType": 5125 if big else 5123,
                     "count": int(F.size), "type": "SCALAR"})
        meshes.append({"name": g, "primitives": [{"attributes": {"POSITION": pa}, "indices": ia, "mode": 4}]})
    blob = b"".join(parts)
    j = {
        "asset": {"version": "2.0", "generator": "F1-manager/prepara_safety_glb", "extras": info},
        "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "safety_car", "translation": [float(x) for x in ctr], "scale": [k, k, k], "children": list(range(1, len(meshes) + 1))}]
        + [{"name": m["name"], "mesh": i} for i, m in enumerate(meshes)],
        "meshes": meshes, "buffers": [{"byteLength": len(blob)}], "bufferViews": bvs, "accessors": accs,
    }
    jb = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    jb += b" " * ((-len(jb)) % 4)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        f.write(b"glTF" + (2).to_bytes(4, "little") + (12 + 8 + len(jb) + 8 + len(blob)).to_bytes(4, "little"))
        f.write(len(jb).to_bytes(4, "little") + b"JSON" + jb)
        f.write(len(blob).to_bytes(4, "little") + b"BIN\0" + blob)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__); sys.exit(1)
    src = Path(args[0])
    raw, names = read_groups(src)
    if "--info" in sys.argv:
        for k, n in sorted(names.items(), key=lambda x: (str(x[0]), -x[1])):
            print(f"{n:8d}  {k}")
    groups = {g: merge(p) for g, p in raw.items()}
    orient(groups, "--voltear" in sys.argv)
    print(f"insignias: {remove_badges(groups)} triángulos fuera")
    src_info = json.loads(src.read_bytes()[20:20 + int.from_bytes(src.read_bytes()[12:16], "little")]).get("asset", {}).get("extras", {})
    info = {k: src_info[k] for k in ("title", "author", "license", "source") if k in src_info}
    for name, budget in (("safety.glb", BUDGET_HI), ("safety_lo.glb", BUDGET_LO)):
        res, cell = simplify(groups, budget)
        dest = OUT_DIR / name
        write_quantized(res, dest, info)
        print(f"{name}: rejilla {cell * 100:.1f} cm, {sum(len(f) for _, f in res.values())} triángulos, {dest.stat().st_size // 1024} KB · "
              + ", ".join(f"{g} {len(f)}" for g, (_, f) in res.items()))


if __name__ == "__main__":
    main()
