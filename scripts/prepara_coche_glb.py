"""Prepara un monoplaza .glb/.gltf descargado (p. ej. de Sketchfab) sin usar Blender.

Lee la geometría, detecta ruedas y orientación automáticamente, alinea los ejes a
las coordenadas del juego (+X delante, batalla -1.70..+1.80, centro de rueda y=0.36),
descarta las ruedas estáticas, simplifica mallas de alta densidad con @gltf-transform/cli
hasta ≤ 14.000 triángulos, separa semánticamente carrocería/carbono/alerón/casco/luz,
calcula normales suaves con pliegues y exporta f1.glb (fina, ≤ 14.000 triángulos) y
f1_lo.glb (ligera, ≤ 3.800 triángulos, para la parrilla lejana y la calidad baja)
comprimidos con Draco junto a public/assets/models/manifest.json.

Uso:
  python scripts/prepara_coche_glb.py coche.glb [--voltear]
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "models"
MAX_TRIS = 14000
TARGET_TRIS = 12500
# versión ligera: el mismo presupuesto que la malla ligera integrada (unos 4.000 triángulos)
MAX_TRIS_LO = 3800
TARGET_TRIS_LO = 3300
CREASE_COS = math.cos(math.radians(42.0))

DTYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def npx_cmd() -> str:
    return shutil.which("npx.cmd") or shutil.which("npx") or "npx"


def run_gltf_transform(args: list[str]) -> None:
    cmd = [npx_cmd(), "--yes", "@gltf-transform/cli", *args]
    res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Fallo {' '.join(cmd)}:\n{res.stdout}\n{res.stderr}")


def _node_matrix(n: dict) -> np.ndarray:
    if "matrix" in n:
        return np.array(n["matrix"], dtype=np.float64).reshape((4, 4)).T
    M = np.eye(4, dtype=np.float64)
    if "scale" in n:
        sx, sy, sz = n["scale"]
        M = M @ np.diag([sx, sy, sz, 1.0])
    if "rotation" in n:
        qx, qy, qz, qw = n["rotation"]
        R = np.array(
            [
                [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 0.0],
                [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 0.0],
                [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy), 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )
        M = R @ M
    if "translation" in n:
        T = np.eye(4, dtype=np.float64)
        T[:3, 3] = n["translation"]
        M = T @ M
    return M


def _read_accessor(j: dict, buf: bytes, ai: int) -> np.ndarray:
    acc = j["accessors"][ai]
    bv = j["bufferViews"][acc["bufferView"]]
    dt = np.dtype(DTYPES[acc["componentType"]])
    nc = NCOMP[acc["type"]]
    cnt = int(acc["count"])
    off = int(bv.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
    elem_bytes = nc * dt.itemsize
    stride = int(bv.get("byteStride", elem_bytes))
    if stride == elem_bytes:
        arr = np.frombuffer(buf, dtype=dt, count=cnt * nc, offset=off).copy()
        out = arr.reshape((cnt, nc)) if nc > 1 else arr
    else:
        raw = np.frombuffer(buf, dtype=np.uint8, count=cnt * stride, offset=off)
        chunks = np.lib.stride_tricks.as_strided(raw, shape=(cnt, elem_bytes), strides=(stride, 1))
        out = np.ascontiguousarray(chunks).view(dt)
        out = out.reshape((cnt, nc)) if nc > 1 else out.reshape((cnt,))
    if acc.get("normalized") and np.issubdtype(dt, np.integer):
        info = np.iinfo(dt)
        out = out.astype(np.float64) / float(max(abs(info.min), info.max))
    return out


def read_glb_geometry(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Lee un .glb y devuelve vértices (N,3) y caras triangulares (M,3) con jerarquía aplicada."""
    with path.open("rb") as f:
        header = f.read(12)
        magic, _ver, _length = json_hdr = (header[:4], *memoryview(header[4:12]).cast("I"))
        if magic != b"glTF":
            raise ValueError(f"{path} no es un GLB válido")
        jlen = int.from_bytes(f.read(4), "little")
        _jtype = f.read(4)
        j = json.loads(f.read(jlen))
        blen = int.from_bytes(f.read(4), "little")
        _btype = f.read(4)
        buf = f.read(blen)

    nodes = j.get("nodes", [])
    meshes = j.get("meshes", [])
    all_v: list[np.ndarray] = []
    all_f: list[np.ndarray] = []
    v_off = 0

    def walk(ni: int, pm: np.ndarray) -> None:
        nonlocal v_off
        node = nodes[ni]
        lm = pm @ _node_matrix(node)
        if "mesh" in node:
            for pr in meshes[node["mesh"]].get("primitives", []):
                mode = pr.get("mode", 4)
                if mode != 4 or "POSITION" not in pr.get("attributes", {}):
                    continue
                pos = _read_accessor(j, buf, pr["attributes"]["POSITION"]).astype(np.float64)
                wpos = (pos @ lm[:3, :3].T) + lm[:3, 3]
                all_v.append(wpos)
                if "indices" in pr:
                    idx = _read_accessor(j, buf, pr["indices"]).astype(np.int64).reshape(-1, 3) + v_off
                else:
                    n_tr = (len(pos) // 3) * 3
                    idx = np.arange(n_tr, dtype=np.int64).reshape(-1, 3) + v_off
                all_f.append(idx)
                v_off += len(pos)
        for ch in node.get("children", []):
            walk(ch, lm)

    scenes = j.get("scenes", [])
    roots = scenes[j.get("scene", 0)].get("nodes", []) if scenes else list(range(len(nodes)))
    for r in roots:
        walk(r, np.eye(4, dtype=np.float64))

    if not all_v or not all_f:
        raise RuntimeError(f"Sin geometría triangular en {path}")
    V = np.vstack(all_v)
    F = np.vstack(all_f)
    return V, F


def write_glb(meshes: list[tuple[str, np.ndarray, np.ndarray, np.ndarray | None]], dest: Path) -> None:
    """Escribe mallas [(nombre, pos_f32, norm_f32_o_None, idx_u32)] en un .glb válido sin texturas."""
    bin_parts: list[bytes] = []
    offset = 0
    bvs: list[dict] = []
    accs: list[dict] = []
    gltf_meshes: list[dict] = []
    gltf_nodes: list[dict] = []

    def push_bytes(data: bytes, target: int) -> int:
        nonlocal offset
        pad = (-len(data)) % 4
        bv_idx = len(bvs)
        bvs.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        bin_parts.append(data + b"\x00" * pad)
        offset += len(data) + pad
        return bv_idx

    for name, pos, norm, idx in meshes:
        if len(pos) == 0 or len(idx) == 0:
            continue
        pos32 = np.ascontiguousarray(pos, dtype=np.float32)
        pbv = push_bytes(pos32.tobytes(), 34962)
        pmin = [float(x) for x in pos32.min(axis=0)]
        pmax = [float(x) for x in pos32.max(axis=0)]
        p_acc = len(accs)
        accs.append(
            {
                "bufferView": pbv,
                "componentType": 5126,
                "count": len(pos32),
                "type": "VEC3",
                "min": pmin,
                "max": pmax,
            }
        )
        attrs: dict[str, int] = {"POSITION": p_acc}

        if norm is not None:
            norm32 = np.ascontiguousarray(norm, dtype=np.float32)
            nbv = push_bytes(norm32.tobytes(), 34962)
            n_acc = len(accs)
            accs.append({"bufferView": nbv, "componentType": 5126, "count": len(norm32), "type": "VEC3"})
            attrs["NORMAL"] = n_acc

        max_idx = int(idx.max())
        idx_flat = idx.ravel()
        if max_idx < 65535:
            idx_arr = np.ascontiguousarray(idx_flat, dtype=np.uint16)
            itype = 5123
        else:
            idx_arr = np.ascontiguousarray(idx_flat, dtype=np.uint32)
            itype = 5125
        ibv = push_bytes(idx_arr.tobytes(), 34963)
        i_acc = len(accs)
        accs.append({"bufferView": ibv, "componentType": itype, "count": len(idx_arr), "type": "SCALAR"})

        m_idx = len(gltf_meshes)
        gltf_meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": i_acc, "mode": 4}]})
        gltf_nodes.append({"name": name, "mesh": m_idx})

    bin_blob = b"".join(bin_parts)
    gltf_json = {
        "asset": {"version": "2.0", "generator": "F1-manager/prepara_coche_glb"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(gltf_nodes)))}],
        "nodes": gltf_nodes,
        "meshes": gltf_meshes,
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": bvs,
        "accessors": accs,
    }
    j_bytes = json.dumps(gltf_json, separators=(",", ":")).encode("utf-8")
    j_pad = (-len(j_bytes)) % 4
    j_chunk = j_bytes + b" " * j_pad

    total_len = 12 + 8 + len(j_chunk) + 8 + len(bin_blob)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        f.write(b"glTF")
        f.write((2).to_bytes(4, "little"))
        f.write(total_len.to_bytes(4, "little"))
        f.write(len(j_chunk).to_bytes(4, "little"))
        f.write(b"JSON")
        f.write(j_chunk)
        f.write(len(bin_blob).to_bytes(4, "little"))
        f.write(b"BIN\x00")
        f.write(bin_blob)


def weld_and_clean(V: np.ndarray, F: np.ndarray, grid: float) -> tuple[np.ndarray, np.ndarray]:
    """Suelda vértices duplicados dentro de la rejilla `grid` y elimina triángulos degenerados."""
    Q = np.round(V / grid).astype(np.int64)
    _, first, inv = np.unique(Q, axis=0, return_index=True, return_inverse=True)
    Vw = V[first]
    Fw = inv[F]
    valid = (Fw[:, 0] != Fw[:, 1]) & (Fw[:, 1] != Fw[:, 2]) & (Fw[:, 2] != Fw[:, 0])
    Fw = Fw[valid]
    if len(Fw) == 0:
        return np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int64)
    p0, p1, p2 = Vw[Fw[:, 0]], Vw[Fw[:, 1]], Vw[Fw[:, 2]]
    area2 = np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1)
    Fw = Fw[area2 > 1e-12]
    return Vw, Fw


def find_components(nv: int, F: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    e0 = np.concatenate([F[:, 0], F[:, 1], F[:, 2]])
    e1 = np.concatenate([F[:, 1], F[:, 2], F[:, 0]])
    adj = csr_matrix((np.ones(len(e0), dtype=np.int8), (e0, e1)), shape=(nv, nv))
    _nc, labels = connected_components(adj, directed=False)
    flab = labels[F[:, 0]]
    return flab, np.bincount(flab)


def orient_and_detect_wheels(V: np.ndarray, F: np.ndarray, force_flip: bool) -> tuple[np.ndarray, np.ndarray, set[int]]:
    """Alinea largo al eje X, detecta las 4 ruedas, escala a batalla 3.50 m y orienta morro en +X."""
    sz0 = V.max(axis=0) - V.min(axis=0)
    # Si el modelo viene a lo largo de Z, rotación +90° en Y (det +1): x' = z, z' = -x
    if sz0[2] > sz0[0]:
        V = np.column_stack([V[:, 2], V[:, 1], -V[:, 0]])

    span_x = float(V[:, 0].max() - V[:, 0].min())
    Vw, Fw = weld_and_clean(V, F, max(1e-5, span_x * 1e-4))
    flab, counts = find_components(len(Vw), Fw)
    s_approx = 5.55 / max(1e-6, span_x)

    wheel_cands: list[tuple[int, float, float, float, float, float]] = []
    for cid, cnt in enumerate(counts):
        if cnt < 200:
            continue
        vs = Vw[Fw[flab == cid].ravel()]
        mn, mx = vs.min(axis=0), vs.max(axis=0)
        sz = (mx - mn) * s_approx
        ct = (mn + mx) * 0.5
        if (
            0.55 <= sz[0] <= 0.88
            and 0.55 <= sz[1] <= 0.88
            and abs(sz[0] - sz[1]) / max(sz[0], sz[1]) < 0.15
            and 0.18 <= sz[2] <= 0.55
            and abs(ct[2]) * s_approx > 0.45
        ):
            wheel_cands.append((cid, float(ct[0]), float(ct[1]), float(sz[2]), float(mn[0]), float(mx[0])))

    wheel_ids: set[int] = set()
    x_min_g, x_max_g = float(Vw[:, 0].min()), float(Vw[:, 0].max())

    if len(wheel_cands) >= 4:
        wheel_cands.sort(key=lambda w: w[1])
        ax_lo = wheel_cands[:2]
        ax_hi = wheel_cands[-2:]
        wheel_ids = {w[0] for w in ax_lo + ax_hi}
        x_lo = sum(w[1] for w in ax_lo) * 0.5
        x_hi = sum(w[1] for w in ax_hi) * 0.5
        w_lo = sum(w[3] for w in ax_lo) * 0.5
        w_hi = sum(w[3] for w in ax_hi) * 0.5
        # El eje delantero tiene mayor voladizo hacia su extremo (morro) y suele ser más estrecho
        ov_lo = abs(x_lo - x_min_g)
        ov_hi = abs(x_max_g - x_hi)
        front_is_hi = (ov_hi > ov_lo + 0.05 / s_approx) or (abs(ov_hi - ov_lo) <= 0.05 / s_approx and w_hi < w_lo)
        xf, xr = (x_hi, x_lo) if front_is_hi else (x_lo, x_hi)
        s = 3.50 / max(1e-6, abs(xf - xr))
        y_ctr_raw = sum(w[2] for w in ax_lo + ax_hi) * 0.25
        flip = (xf < xr) ^ force_flip
    else:
        s = 5.60 / max(1e-6, span_x)
        xf, xr = x_max_g, x_min_g
        y_ctr_raw = float(Vw[:, 1].min()) + 0.36 / s
        flip = force_flip

    x_mid = (xf + xr) * 0.5
    Vo = np.empty_like(Vw)
    if flip:
        Vo[:, 0] = (x_mid - Vw[:, 0]) * s + 0.05
        Vo[:, 2] = -Vw[:, 2] * s
    else:
        Vo[:, 0] = (Vw[:, 0] - x_mid) * s + 0.05
        Vo[:, 2] = Vw[:, 2] * s
    Vo[:, 1] = (Vw[:, 1] - y_ctr_raw) * s + 0.36
    return Vo, Fw, wheel_ids


def smooth_creased_normals(V: np.ndarray, F: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calcula normales suaves con división de aristas > 42° y garantiza 0 NaN."""
    if len(F) == 0:
        return (
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0, 3), dtype=np.int64),
        )
    v0, v1, v2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    fn_raw = np.cross(v1 - v0, v2 - v0)
    area2 = np.linalg.norm(fn_raw, axis=1)
    keep = area2 > 1e-10
    F = F[keep]
    fn_raw = fn_raw[keep]
    area2 = area2[keep]
    if len(F) == 0:
        return (
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0, 3), dtype=np.float32),
            np.zeros((0, 3), dtype=np.int64),
        )
    fn_unit = fn_raw / area2[:, None]

    # Agrupar las M*3 esquinas por índice de vértice para promediar caras dentro del umbral angular
    nf = len(F)
    corners_v = F.ravel()
    corners_f = np.repeat(np.arange(nf), 3)
    order = np.argsort(corners_v, kind="mergesort")
    sv = corners_v[order]
    sf = corners_f[order]
    splits = np.flatnonzero(np.diff(sv)) + 1
    groups = np.split(sf, splits)

    corner_n = np.empty((nf * 3, 3), dtype=np.float64)
    for g_idx in range(len(groups)):
        fids = groups[g_idx]
        # fids corresponde al tramo correspondiente de order
        start = 0 if g_idx == 0 else int(splits[g_idx - 1])
        end = int(splits[g_idx]) if g_idx < len(splits) else len(sv)
        if len(fids) == 1:
            corner_n[order[start]] = fn_unit[fids[0]]
            continue
        nu = fn_unit[fids]
        nw = fn_raw[fids]
        dots = nu @ nu.T
        mask = dots >= CREASE_COS
        # Garantizar que al menos la propia cara contribuye
        np.fill_diagonal(mask, True)
        avg = mask @ nw
        norms = np.linalg.norm(avg, axis=1)
        bad = norms < 1e-12
        avg[bad] = nu[bad]
        norms[bad] = 1.0
        avg /= norms[:, None]
        corner_n[order[start:end]] = avg

    # Re-indexar por (posición original, normal cuantizada) para evitar NaN y ahorrar tamaño en Draco
    pos_corners = V[corners_v]
    q_norm = np.round(corner_n * 2048.0).astype(np.int64)
    keys = np.column_stack([corners_v, q_norm])
    _, first, inv = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    out_V = pos_corners[first].astype(np.float32)
    out_N = corner_n[first].astype(np.float32)
    # Comprobación final defensiva contra NaN / Inf
    bad_n = ~np.isfinite(out_N).all(axis=1)
    if bad_n.any():
        out_N[bad_n] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    out_F = inv.reshape((-1, 3)).astype(np.int64)
    return out_V, out_N, out_F


def make_helmet_mesh(center=(0.30, 0.71, 0.0), radii=(0.125, 0.125, 0.115), n_lon=16, n_lat=10):
    """Genera esfera limpia del casco y separa la franja de visera para carbono oscuro."""
    cx0, cy0, cz0 = center
    rx, ry, rz = radii
    verts = []
    for i in range(n_lat + 1):
        phi = math.pi * i / n_lat
        sp, cp = math.sin(phi), math.cos(phi)
        for j in range(n_lon + 1):
            th = 2.0 * math.pi * j / n_lon
            x = sp * math.cos(th) * rx
            y = cp * ry
            z = sp * math.sin(th) * rz
            verts.append((cx0 + x, cy0 + y, cz0 + z))
    V = np.array(verts, dtype=np.float64)
    tris = []
    stride = n_lon + 1
    for i in range(n_lat):
        for j in range(n_lon):
            a = i * stride + j
            b = a + stride
            c = a + 1
            d = b + 1
            if i != 0:
                tris.append([a, b, c])
            if i != n_lat - 1:
                tris.append([c, b, d])
    F = np.array(tris, dtype=np.int64)
    # Orientar caras hacia fuera del centro del casco
    tri_c = V[F].mean(axis=1) - np.array([cx0, cy0, cz0])
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    flip = np.sum(fn * tri_c, axis=1) < 0
    F[flip] = F[flip][:, [0, 2, 1]]

    loc = V[F].mean(axis=1) - np.array([cx0, cy0, cz0])
    visor = (loc[:, 0] > 0.035) & (loc[:, 1] > -0.025) & (loc[:, 1] < 0.055)
    return V, F[~visor], F[visor]


def make_box_mesh(center: tuple[float, float, float], size: tuple[float, float, float]) -> tuple[np.ndarray, np.ndarray]:
    cx, cy, cz = center
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    V = np.array(
        [
            [cx - hx, cy - hy, cz - hz],
            [cx + hx, cy - hy, cz - hz],
            [cx + hx, cy + hy, cz - hz],
            [cx - hx, cy + hy, cz - hz],
            [cx - hx, cy - hy, cz + hz],
            [cx + hx, cy - hy, cz + hz],
            [cx + hx, cy + hy, cz + hz],
            [cx - hx, cy + hy, cz + hz],
        ],
        dtype=np.float64,
    )
    F = np.array(
        [
            [0, 2, 1], [0, 3, 2],
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [3, 7, 6], [3, 6, 2],
            [0, 4, 7], [0, 7, 3],
            [1, 2, 6], [1, 6, 5],
        ],
        dtype=np.int64,
    )
    return V, F


def classify_triangles(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Devuelve etiqueta por triángulo: 0=carroceria, 1=carbono, 2=aleron_del."""
    C = V[F].mean(axis=1)
    cx, cy, cz = C[:, 0], C[:, 1], C[:, 2]
    az = np.abs(cz)

    is_fw = cx > 2.15
    is_carb = (~is_fw) & (
        (cy < 0.145)
        | ((cx > -1.35) & (cx < 1.35) & (cy < 0.19) & (az > 0.56))
        | ((cx < -1.45) & (cy < 0.34))
        | ((cx < -1.52) & (az < 0.08) & (cy > 0.44) & (cy < 0.62))
        | ((cx >= 1.15) & (cx <= 2.15) & (az > 0.34) & (cy < 0.64))
        | ((cx >= -2.05) & (cx <= -1.10) & (az > 0.34) & (cy < 0.62))
        | ((cx >= -0.04) & (cx <= 1.02) & (cy > 0.72) & (az < 0.35))
        | (cy > 1.03)
        | ((cx >= 0.00) & (cx <= 0.85) & (az < 0.22) & (cy < 0.71))
        | ((cx < -1.75) & (az < 0.51) & (cy >= 0.34) & (cy <= 0.86))
    )
    out = np.zeros(len(F), dtype=np.int32)
    out[is_carb] = 1
    out[is_fw] = 2
    return out


def extract_submesh(V: np.ndarray, F_sub: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if len(F_sub) == 0:
        return np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int64)
    used, inv = np.unique(F_sub.ravel(), return_inverse=True)
    return V[used], inv.reshape((-1, 3))


def append_meshes(parts: list[tuple[np.ndarray, np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    vs, fs = [], []
    off = 0
    for V, F in parts:
        if len(F) == 0:
            continue
        vs.append(V)
        fs.append(F + off)
        off += len(V)
    if not vs:
        return np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int64)
    return np.vstack(vs), np.vstack(fs)


def simplify_to(tmp_raw: Path, tmp_sim: Path, n_tris: int, target: int, max_tris: int) -> tuple[np.ndarray, np.ndarray]:
    """Simplifica con meshoptimizer subiendo el error permitido hasta quedar por debajo de max_tris."""
    base_ratio = max(0.002, target / max(1, n_tris))
    attempts = [
        (base_ratio, 0.03),
        (base_ratio * 0.85, 0.06),
        (base_ratio * 0.70, 0.12),
        (base_ratio * 0.55, 0.20),
        (max(0.002, base_ratio * 0.40), 0.35),
    ]
    Vsim = np.zeros((0, 3), dtype=np.float64)
    Fsim = np.zeros((0, 3), dtype=np.int64)
    for ratio, err in attempts:
        r_str = f"{ratio:.5f}"
        e_str = f"{err:.3f}"
        run_gltf_transform(["simplify", str(tmp_raw), str(tmp_sim), "--ratio", r_str, "--error", e_str])
        Vsim, Fsim = read_glb_geometry(tmp_sim)
        print(f"  simplify ratio={r_str} err={e_str} -> {len(Fsim)} tris")
        if len(Fsim) <= max_tris:
            break
    return Vsim, Fsim


def build_variant(
    Vsim: np.ndarray,
    Fsim: np.ndarray,
    Vs: np.ndarray,
    Fs: np.ndarray,
    helmet_res: tuple[int, int],
    tmp_sem: Path,
    dest: Path,
) -> int:
    """Separa piezas, calcula normales, comprime con Draco en dest y devuelve los triángulos totales."""
    Vall, Fall = append_meshes([(Vsim, Fsim), (Vs, Fs)])
    cls = classify_triangles(Vall, Fall)

    Vh, Fh_shell, Fh_visor = make_helmet_mesh(n_lon=helmet_res[0], n_lat=helmet_res[1])
    Vl, Fl = make_box_mesh((-2.12, 0.53, 0.0), (0.04, 0.10, 0.08))

    V_body, F_body = extract_submesh(Vall, Fall[cls == 0])
    V_carb0, F_carb0 = extract_submesh(Vall, Fall[cls == 1])
    V_fw, F_fw = extract_submesh(Vall, Fall[cls == 2])
    V_carb, F_carb = append_meshes([(V_carb0, F_carb0), (Vh, Fh_visor)])

    raw_parts = [
        ("carroceria", V_body, F_body),
        ("carbono", V_carb, F_carb),
        ("aleron_del", V_fw, F_fw),
        ("casco", Vh, Fh_shell),
        ("luz", Vl, Fl),
    ]

    out_parts: list[tuple[str, np.ndarray, np.ndarray | None, np.ndarray]] = []
    tot_tris = 0
    for name, vp, fp in raw_parts:
        nv, nn, nf = smooth_creased_normals(vp, fp)
        tot_tris += len(nf)
        print(f"  malla {name:10s}: {len(nf):5d} tris, {len(nv):5d} vértices")
        out_parts.append((name, nv, nn, nf))

    write_glb(out_parts, tmp_sem)
    run_gltf_transform(
        [
            "draco",
            str(tmp_sem),
            str(dest),
            "--method",
            "edgebreaker",
            "--quantize-position",
            "14",
            "--quantize-normal",
            "10",
        ]
    )
    print(f"  -> {dest.relative_to(ROOT)} = {dest.stat().st_size / 1024:.1f} KB ({tot_tris} tris)")
    return tot_tris


def main() -> None:
    args = sys.argv[1:]
    force_flip = "--voltear" in args
    paths = [a for a in args if not a.startswith("-")]
    in_path = (Path(paths[0]) if paths else (ROOT / "coche.glb")).resolve()
    if not in_path.exists():
        raise FileNotFoundError(f"No existe {in_path}")

    print(f"Leyendo {in_path.name} ({in_path.stat().st_size / 1024 / 1024:.2f} MB)...")
    Vraw, Fraw = read_glb_geometry(in_path)
    V, F, wheel_ids = orient_and_detect_wheels(Vraw, Fraw, force_flip)

    flab, counts = find_components(len(V), F)
    keep_main = np.zeros(len(F), dtype=bool)
    keep_small = np.zeros(len(F), dtype=bool)
    for cid, cnt in enumerate(counts):
        if cid in wheel_ids or cnt < 20:
            continue
        if cnt < 400:
            keep_small |= flab == cid
        else:
            keep_main |= flab == cid

    Vm, Fm = extract_submesh(V, F[keep_main])
    Vs, Fs = extract_submesh(V, F[keep_small])
    # Soldar costuras de malla principal a 0,25 mm para que simplify no abra grietas
    Vm, Fm = weld_and_clean(Vm, Fm, 0.00025)
    print(f"Chasis sin ruedas: {len(Fm)} tris + {len(Fs)} tris de detalles pequeños")

    tmp_raw = OUT_DIR / "_tmp_raw.glb"
    tmp_sim = OUT_DIR / "_tmp_sim.glb"
    tmp_sem = OUT_DIR / "_tmp_sem.glb"
    dest_hi = OUT_DIR / "f1.glb"
    dest_lo = OUT_DIR / "f1_lo.glb"

    try:
        write_glb([("chasis", Vm, None, Fm)], tmp_raw)

        print("Versión fina (cerca de la cámara):")
        Vsim, Fsim = simplify_to(tmp_raw, tmp_sim, len(Fm), TARGET_TRIS, MAX_TRIS)
        tris_hi = build_variant(Vsim, Fsim, Vs, Fs, (16, 10), tmp_sem, dest_hi)

        # Versión ligera para la parrilla lejana y la calidad baja: mismo presupuesto que la malla ligera integrada
        print("Versión ligera (resto de la parrilla):")
        Vsim, Fsim = simplify_to(tmp_raw, tmp_sim, len(Fm), TARGET_TRIS_LO, MAX_TRIS_LO)
        tris_lo = build_variant(Vsim, Fsim, Vs, Fs, (10, 6), tmp_sem, dest_lo)

        manifest = {
            "car": dest_hi.name,
            "carLo": dest_lo.name,
            "wheel": None,
            "steer": [0.70, 0.70, 0],
            "cam": [-0.45, 1.38],
        }
        (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Listo: fina {tris_hi} tris, ligera {tris_lo} tris | manifest={manifest}")
    finally:
        for tmp in (tmp_raw, tmp_sim, tmp_sem):
            if tmp.exists():
                tmp.unlink()


if __name__ == "__main__":
    main()
