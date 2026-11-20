"""Prepara los modelos 3D de entorno (.glb descargados de Sketchfab) para el juego.

Solo con numpy y Pillow (sin Blender):
  - arbol.glb    -> tree_leaf.glb (285 tri, tronco + copa con alfa) y tree_leaf_lo.glb (101 tri, lejos)
  - pino.glb     -> tree_pine.glb (154 tri, una sola malla y textura WebP RGBA)
  - palmera.glb  -> tree_palm.glb (tronco + hojas unidos en una sola malla y textura WebP RGBA)
  - mecanico.glb -> crew_stand.glb (de pie, brazos relajados) y crew_crouch.glb (agachado con pistola),
                    sin texturas y con los canales de color de vértice de CREW_MAT (R=equipo1, B=equipo2, G=negro)
  - yate.glb     -> yacht.glb (sin el plano de agua, casco + cubierta unidos en un atlas WebP 1024x512)

Convierte KHR_materials_pbrSpecularGlossiness (que three.js ya no soporta) a pbrMetallicRoughness,
pasa las hojas a alphaMode MASK con sangrado de color RGB en los píxeles transparentes (sin halos)
y guarda las texturas en WebP (EXT_texture_webp) para mantenerse muy por debajo del presupuesto de 8 MB.

Uso:
  python scripts/prepara_entorno_glb.py [--preview-dir <carpeta>]
"""
from __future__ import annotations

import io
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "models"

DTYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def load_glb(path: Path) -> tuple[dict, bytes]:
    b = path.read_bytes()
    if b[:4] != b"glTF":
        raise ValueError(f"{path} no es un .glb")
    jlen = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    boff = 20 + jlen
    blen = struct.unpack("<I", b[boff:boff + 4])[0]
    return j, b[boff + 8:boff + 8 + blen]


def read_accessor(j: dict, buf: bytes, ai: int) -> np.ndarray:
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
        out = np.ascontiguousarray(
            np.lib.stride_tricks.as_strided(raw, shape=(cnt, eb), strides=(stride, 1))
        ).view(dt).reshape((cnt, nc))
    if acc.get("normalized") and np.issubdtype(dt, np.integer):
        out = out.astype(np.float64) / float(np.iinfo(dt).max)
    return out if nc > 1 else out.reshape(-1)


def read_image(j: dict, buf: bytes, img_idx: int) -> Image.Image:
    im = j["images"][img_idx]
    bv = j["bufferViews"][im["bufferView"]]
    off = int(bv.get("byteOffset", 0))
    raw = buf[off:off + int(bv["byteLength"])]
    return Image.open(io.BytesIO(raw))


def node_world_mats(j: dict) -> list[np.ndarray]:
    parents: dict[int, int] = {}
    for i, n in enumerate(j["nodes"]):
        for c in n.get("children", []):
            parents[c] = i

    def local(n: dict) -> np.ndarray:
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
                [0, 0, 0, 1],
            ])
            M = R @ M
        if "translation" in n:
            T = np.eye(4)
            T[:3, 3] = n["translation"]
            M = T @ M
        return M

    cache: dict[int, np.ndarray] = {}

    def world(i: int) -> np.ndarray:
        if i not in cache:
            M = local(j["nodes"][i])
            cache[i] = world(parents[i]) @ M if i in parents else M
        return cache[i]

    return [world(i) for i in range(len(j["nodes"]))]


def extract_prim(j: dict, buf: bytes, wm: list[np.ndarray], ni: int, pi: int = 0) -> dict:
    node = j["nodes"][ni]
    pr = j["meshes"][node["mesh"]]["primitives"][pi]
    M = wm[ni]
    pos = read_accessor(j, buf, pr["attributes"]["POSITION"]).astype(np.float64)
    pos = (np.hstack([pos, np.ones((len(pos), 1))]) @ M.T)[:, :3]
    if "NORMAL" in pr["attributes"]:
        nrm = read_accessor(j, buf, pr["attributes"]["NORMAL"]).astype(np.float64)
        nm = np.linalg.inv(M[:3, :3]).T
        nrm = nrm @ nm.T
        ln = np.linalg.norm(nrm, axis=1, keepdims=True)
        nrm = np.where(ln > 1e-8, nrm / np.maximum(ln, 1e-8), np.array([[0.0, 1.0, 0.0]]))
    else:
        nrm = None
    uv = read_accessor(j, buf, pr["attributes"]["TEXCOORD_0"]).astype(np.float64) if "TEXCOORD_0" in pr["attributes"] else None
    idx = read_accessor(j, buf, pr["indices"]).astype(np.uint32) if "indices" in pr else np.arange(len(pos), dtype=np.uint32)
    if np.linalg.det(M[:3, :3]) < 0:
        idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
    return {"pos": pos, "nrm": nrm, "uv": uv, "idx": idx}


def bleed_alpha_rgb(img: Image.Image, iters: int = 8) -> Image.Image:
    """Rellena los píxeles transparentes con el color de sus vecinos opacos para evitar halos en mipmaps."""
    arr = np.array(img.convert("RGBA"), dtype=np.uint8)
    rgb = arr[:, :, :3].astype(np.float32)
    mask = arr[:, :, 3] > 24
    if mask.all() or not mask.any():
        return Image.fromarray(arr, "RGBA")
    for _ in range(iters):
        if mask.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(mask.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            sm = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
            sr = np.roll(np.roll(rgb, dy, axis=0), dx, axis=1)
            # evita envolver de borde a borde
            if dy > 0: sm[:dy, :] = False
            elif dy < 0: sm[dy:, :] = False
            if dx > 0: sm[:, :dx] = False
            elif dx < 0: sm[:, dx:] = False
            acc += sr * sm[:, :, None]
            cnt += sm.astype(np.float32)
        fill = (~mask) & (cnt > 0)
        if not fill.any():
            break
        rgb[fill] = acc[fill] / cnt[fill, None]
        mask = mask | fill
    arr[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def encode_webp(img: Image.Image, size: tuple[int, int] | None = None, quality: int = 82, rgba: bool = False) -> bytes:
    if rgba:
        im = bleed_alpha_rgb(img, iters=10)
        if size is not None and im.size != size:
            im = im.resize(size, Image.Resampling.LANCZOS)
            im = bleed_alpha_rgb(im, iters=6)
    else:
        im = img.convert("RGB")
        if size is not None and im.size != size:
            im = im.resize(size, Image.Resampling.LANCZOS)
    bio = io.BytesIO()
    im.save(bio, format="WEBP", quality=quality, method=6)
    return bio.getvalue()


def tint_foliage_green(img: Image.Image) -> Image.Image:
    """Ajusta el follaje amarillo-oliva de arbol.glb hacia un verde natural equilibrado (para teñirlo por bioma)."""
    arr = np.array(img.convert("RGBA"), dtype=np.float32)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    # Reduce ligeramente el exceso de rojo/amarillo en las hojas y sube un poco el verde
    r2 = r * 0.72 + g * 0.10
    g2 = g * 1.06
    b2 = b * 0.92 + g * 0.08
    arr[:, :, 0] = np.clip(r2, 0, 255)
    arr[:, :, 1] = np.clip(g2, 0, 255)
    arr[:, :, 2] = np.clip(b2, 0, 255)
    arr[:, :, 3] = a
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def compute_vertex_normals(pos: np.ndarray, idx: np.ndarray) -> np.ndarray:
    tris = idx.reshape(-1, 3)
    v0, v1, v2 = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    nrm = np.zeros_like(pos)
    np.add.at(nrm, tris[:, 0], fn)
    np.add.at(nrm, tris[:, 1], fn)
    np.add.at(nrm, tris[:, 2], fn)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    return np.where(ln > 1e-8, nrm / np.maximum(ln, 1e-8), np.array([[0.0, 1.0, 0.0]]))


def write_glb(
    out_path: Path,
    parts: list[dict],
    materials: list[dict],
    images_webp: list[bytes],
    samplers: list[dict] | None = None,
) -> int:
    """Escribe un .glb limpio (float32 pos/nrm/uv/col, uint16/uint32 indices, EXT_texture_webp opcional)."""
    blob = bytearray()
    bvs: list[dict] = []
    accs: list[dict] = []

    def add_buf(data: bytes, target: int | None = None) -> int:
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target is not None:
            bv["target"] = target
        bvs.append(bv)
        return len(bvs) - 1

    def add_acc(arr: np.ndarray, comp_type: int, acc_type: str, target: int, minmax: bool = False) -> int:
        raw = np.ascontiguousarray(arr).tobytes()
        bvi = add_buf(raw, target)
        a: dict = {"bufferView": bvi, "componentType": comp_type, "count": len(arr), "type": acc_type}
        if minmax:
            a["min"] = [float(x) for x in arr.min(axis=0)]
            a["max"] = [float(x) for x in arr.max(axis=0)]
        accs.append(a)
        return len(accs) - 1

    imgs_json: list[dict] = []
    texs_json: list[dict] = []
    for i, wb in enumerate(images_webp):
        bvi = add_buf(wb)
        imgs_json.append({"bufferView": bvi, "mimeType": "image/webp"})
        texs_json.append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": i}}})

    meshes_json: list[dict] = []
    nodes_json: list[dict] = []
    for p in parts:
        pos = p["pos"].astype(np.float32)
        nrm = p["nrm"].astype(np.float32) if p.get("nrm") is not None else compute_vertex_normals(p["pos"], p["idx"]).astype(np.float32)
        attrs: dict[str, int] = {
            "POSITION": add_acc(pos, 5126, "VEC3", 34962, minmax=True),
            "NORMAL": add_acc(nrm, 5126, "VEC3", 34962),
        }
        if p.get("uv") is not None:
            attrs["TEXCOORD_0"] = add_acc(p["uv"].astype(np.float32), 5126, "VEC2", 34962)
        if p.get("col") is not None:
            attrs["COLOR_0"] = add_acc(p["col"].astype(np.float32), 5126, "VEC3", 34962)
        idx = p["idx"]
        if idx.max() < 65536:
            idx_ai = add_acc(idx.astype(np.uint16), 5123, "SCALAR", 34963)
        else:
            idx_ai = add_acc(idx.astype(np.uint32), 5125, "SCALAR", 34963)
        prim: dict = {"attributes": attrs, "indices": idx_ai}
        if "material" in p and p["material"] is not None:
            prim["material"] = p["material"]
        mi = len(meshes_json)
        meshes_json.append({"name": p["name"], "primitives": [prim]})
        nodes_json.append({"name": p["name"], "mesh": mi})

    while len(blob) % 4:
        blob.append(0)

    gltf: dict = {
        "asset": {"version": "2.0", "generator": "F1-manager/prepara_entorno_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes_json)))}],
        "nodes": nodes_json,
        "meshes": meshes_json,
        "accessors": accs,
        "bufferViews": bvs,
        "buffers": [{"byteLength": len(blob)}],
    }
    if materials:
        gltf["materials"] = materials
    if imgs_json:
        gltf["images"] = imgs_json
        gltf["textures"] = texs_json
        gltf["samplers"] = samplers or [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
        gltf["extensionsUsed"] = ["EXT_texture_webp"]
        gltf["extensionsRequired"] = ["EXT_texture_webp"]

    jbytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(jbytes) % 4:
        jbytes += b" "

    total = 12 + 8 + len(jbytes) + 8 + len(blob)
    out = bytearray()
    out.extend(struct.pack("<4sII", b"glTF", 2, total))
    out.extend(struct.pack("<I4s", len(jbytes), b"JSON"))
    out.extend(jbytes)
    out.extend(struct.pack("<I4s", len(blob), b"BIN\x00"))
    out.extend(blob)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(out)
    return len(out)


def merge_prims(prims: list[dict]) -> dict:
    pos_l, nrm_l, uv_l, col_l, idx_l = [], [], [], [], []
    off = 0
    has_uv = all(p.get("uv") is not None for p in prims)
    has_col = all(p.get("col") is not None for p in prims)
    for p in prims:
        pos_l.append(p["pos"])
        nrm = p["nrm"] if p.get("nrm") is not None else compute_vertex_normals(p["pos"], p["idx"])
        nrm_l.append(nrm)
        if has_uv:
            uv_l.append(p["uv"])
        if has_col:
            col_l.append(p["col"])
        idx_l.append(p["idx"] + off)
        off += len(p["pos"])
    return {
        "pos": np.vstack(pos_l),
        "nrm": np.vstack(nrm_l),
        "uv": np.vstack(uv_l) if has_uv else None,
        "col": np.vstack(col_l) if has_col else None,
        "idx": np.concatenate(idx_l),
    }


# ------------------------------------------------------------------ 1. Árbol frondoso (arbol.glb)
def build_tree_leaf() -> None:
    j, buf = load_glb(ROOT / "arbol.glb")
    wm = node_world_mats(j)

    # Versión cercana: Tree_Trunk_02 (node 62) + Tree_Branches_02 (node 54) -> 285 tris
    trunk = extract_prim(j, buf, wm, 62)
    leaves = extract_prim(j, buf, wm, 54)
    all_pos = np.vstack([trunk["pos"], leaves["pos"]])
    # Centrar X/Z en la base del tronco y apoyar en y = -0.02 (raíz ligeramente enterrada en pendientes)
    cx = 0.5 * (trunk["pos"][:, 0].min() + trunk["pos"][:, 0].max())
    cz = 0.5 * (trunk["pos"][:, 2].min() + trunk["pos"][:, 2].max())
    ymin, ymax = all_pos[:, 1].min(), all_pos[:, 1].max()
    sc = 1.28 / (ymax - ymin)
    for p in (trunk, leaves):
        p["pos"] = (p["pos"] - np.array([cx, ymin, cz])) * sc
        p["pos"][:, 1] -= 0.02

    # Texturas: img[14] = tronco, img[9] = hojas (ajustadas a verde natural equilibrado)
    trunk_wb = encode_webp(read_image(j, buf, 14), size=(256, 256), quality=80, rgba=False)
    leaves_wb = encode_webp(tint_foliage_green(read_image(j, buf, 9)), size=(512, 512), quality=82, rgba=True)

    mats = [
        {"name": "trunk", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.92}},
        {"name": "leaves", "pbrMetallicRoughness": {"baseColorTexture": {"index": 1}, "metallicFactor": 0.0, "roughnessFactor": 0.85},
         "alphaMode": "MASK", "alphaCutoff": 0.42, "doubleSided": True},
    ]
    parts = [
        {**trunk, "name": "trunk", "material": 0},
        {**leaves, "name": "leaves", "material": 1},
    ]
    sz = write_glb(OUT_DIR / "tree_leaf.glb", parts, mats, [trunk_wb, leaves_wb])
    print(f"tree_leaf.glb      : {sz/1024:6.1f} KB  ({(len(trunk['idx'])+len(leaves['idx']))//3} tris)")

    # Versión lejana: Background_Tree_Atlas.001 (node 6) -> 101 tris, 1 material
    lo = extract_prim(j, buf, wm, 6)
    mn, mx = lo["pos"].min(0), lo["pos"].max(0)
    cx = 0.5 * (mn[0] + mx[0])
    cz = 0.5 * (mn[2] + mx[2])
    sy = 1.28 / (mx[1] - mn[1])
    sx = sy * 1.38  # ensanchar ligeramente para igualar silueta de tree_leaf.glb
    lo["pos"] = (lo["pos"] - np.array([cx, mn[1], cz])) * np.array([sx, sy, sx])
    lo["pos"][:, 1] -= 0.02
    atlas_wb = encode_webp(read_image(j, buf, 0), size=(256, 256), quality=78, rgba=True)
    mats_lo = [
        {"name": "leaves", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.88},
         "alphaMode": "MASK", "alphaCutoff": 0.42, "doubleSided": True},
    ]
    sz_lo = write_glb(OUT_DIR / "tree_leaf_lo.glb", [{**lo, "name": "leaves", "material": 0}], mats_lo, [atlas_wb])
    print(f"tree_leaf_lo.glb   : {sz_lo/1024:6.1f} KB  ({len(lo['idx'])//3} tris)")


# ------------------------------------------------------------------ 2. Pino / Conífera (pino.glb)
def build_tree_pine() -> None:
    j, buf = load_glb(ROOT / "pino.glb")
    wm = node_world_mats(j)
    p = extract_prim(j, buf, wm, 5)  # Tree_Pine_T1 (154 tris)
    mn, mx = p["pos"].min(0), p["pos"].max(0)
    cx, cz = 0.5 * (mn[0] + mx[0]), 0.5 * (mn[2] + mx[2])
    sc = 1.48 / (mx[1] - mn[1])
    p["pos"] = (p["pos"] - np.array([cx, mn[1], cz])) * sc
    p["pos"][:, 1] -= 0.02

    wb = encode_webp(read_image(j, buf, 0), size=(512, 256), quality=82, rgba=True)
    mats = [
        {"name": "pine", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.88},
         "alphaMode": "MASK", "alphaCutoff": 0.40, "doubleSided": True},
    ]
    sz = write_glb(OUT_DIR / "tree_pine.glb", [{**p, "name": "pine", "material": 0}], mats, [wb])
    print(f"tree_pine.glb      : {sz/1024:6.1f} KB  ({len(p['idx'])//3} tris)")


# ------------------------------------------------------------------ 3. Palmera (palmera.glb)
def build_tree_palm() -> None:
    j, buf = load_glb(ROOT / "palmera.glb")
    wm = node_world_mats(j)
    leaves = extract_prim(j, buf, wm, 4)
    trunk = extract_prim(j, buf, wm, 5)
    # Ambos comparten exactamente la misma textura RGBA img[0] (tronco en la franja superior v=0..0.12)
    merged = merge_prims([trunk, leaves])
    tcx = 0.5 * (trunk["pos"][:, 0].min() + trunk["pos"][:, 0].max())
    tcz = 0.5 * (trunk["pos"][:, 2].min() + trunk["pos"][:, 2].max())
    ymin, ymax = merged["pos"][:, 1].min(), merged["pos"][:, 1].max()
    sc = 1.42 / (ymax - ymin)
    merged["pos"] = (merged["pos"] - np.array([tcx, ymin, tcz])) * sc
    merged["pos"][:, 1] -= 0.02

    # Asegurar que la franja superior de corteza sea 100% opaca antes de sangrar alfa en las hojas
    im = read_image(j, buf, 0).convert("RGBA")
    arr = np.array(im, dtype=np.uint8)
    arr[:int(arr.shape[0] * 0.13), :, 3] = 255
    im = Image.fromarray(arr, "RGBA")
    wb = encode_webp(im, size=(512, 512), quality=82, rgba=True)

    mats = [
        {"name": "palm", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.86},
         "alphaMode": "MASK", "alphaCutoff": 0.36, "doubleSided": True},
    ]
    sz = write_glb(OUT_DIR / "tree_palm.glb", [{**merged, "name": "palm", "material": 0}], mats, [wb])
    print(f"tree_palm.glb      : {sz/1024:6.1f} KB  ({len(merged['idx'])//3} tris)")


# ------------------------------------------------------------------ 4. Yate (yate.glb)
def build_yacht() -> None:
    j, buf = load_glb(ROOT / "yate.glb")
    wm = node_world_mats(j)
    bdy = extract_prim(j, buf, wm, 3)   # yacht-bdy_0 -> img[6]
    miss = extract_prim(j, buf, wm, 5)  # yacht-missc_0 -> img[3]

    # Unir ambas texturas 512x512 en un único atlas 1024x512 con margen anti-costura
    im_bdy = read_image(j, buf, 6).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    im_miss = read_image(j, buf, 3).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    atlas = Image.new("RGB", (1024, 512))
    atlas.paste(im_bdy, (0, 0))
    atlas.paste(im_miss, (512, 0))
    wb = encode_webp(atlas, size=None, quality=84, rgba=False)

    bdy["uv"] = bdy["uv"].copy()
    bdy["uv"][:, 0] = np.clip(bdy["uv"][:, 0], 0.0, 1.0) * 0.496 + 0.002
    miss["uv"] = miss["uv"].copy()
    miss["uv"][:, 0] = np.clip(miss["uv"][:, 0], 0.0, 1.0) * 0.496 + 0.502

    merged = merge_prims([bdy, miss])
    mn, mx = merged["pos"].min(0), merged["pos"].max(0)
    cx = 0.5 * (mn[0] + mx[0])
    cz = 0.5 * (mn[2] + mx[2])
    L = mx[0] - mn[0]  # eslora original (~13.1), water_0 estaba en y=0.0
    merged["pos"] = (merged["pos"] - np.array([cx, 0.0, cz])) / L

    mats = [
        {"name": "yacht", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.08, "roughnessFactor": 0.42},
         "doubleSided": True},
    ]
    sz = write_glb(OUT_DIR / "yacht.glb", [{**merged, "name": "yacht", "material": 0}], mats, [wb])
    print(f"yacht.glb          : {sz/1024:6.1f} KB  ({len(merged['idx'])//3} tris)")


# ------------------------------------------------------------------ 5. Mecánicos (mecanico.glb)
def _rot_x(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)


def _rot_y(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)


def _rot_z(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)


def _xform_around(p: dict, pivot: np.ndarray, R: np.ndarray, trans: np.ndarray | None = None) -> None:
    p["pos"] = (p["pos"] - pivot) @ R.T + pivot
    if trans is not None:
        p["pos"] = p["pos"] + trans
    if p.get("nrm") is not None:
        p["nrm"] = p["nrm"] @ R.T


def _make_box(sx: float, sy: float, sz: float, center: tuple[float, float, float], col: tuple[float, float, float]) -> dict:
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    # 6 caras con normales planas
    faces = [
        ([(-hx,-hy, hz),( hx,-hy, hz),( hx, hy, hz),(-hx, hy, hz)], (0,0,1)),
        ([( hx,-hy,-hz),(-hx,-hy,-hz),(-hx, hy,-hz),( hx, hy,-hz)], (0,0,-1)),
        ([( hx,-hy, hz),( hx,-hy,-hz),( hx, hy,-hz),( hx, hy, hz)], (1,0,0)),
        ([(-hx,-hy,-hz),(-hx,-hy, hz),(-hx, hy, hz),(-hx, hy,-hz)], (-1,0,0)),
        ([(-hx, hy, hz),( hx, hy, hz),( hx, hy,-hz),(-hx, hy,-hz)], (0,1,0)),
        ([(-hx,-hy,-hz),( hx,-hy,-hz),( hx,-hy, hz),(-hx,-hy, hz)], (0,-1,0)),
    ]
    pos, nrm, idx = [], [], []
    cx, cy, cz = center
    for fi, (vs, n) in enumerate(faces):
        base = fi * 4
        for vx, vy, vz in vs:
            pos.append([vx + cx, vy + cy, vz + cz])
            nrm.append(list(n))
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    pos_a = np.array(pos, dtype=np.float64)
    return {
        "pos": pos_a,
        "nrm": np.array(nrm, dtype=np.float64),
        "uv": None,
        "col": np.tile(np.array(col, dtype=np.float64), (len(pos_a), 1)),
        "idx": np.array(idx, dtype=np.uint32),
    }


def _color_crew_node(ni: int, pos_raw: np.ndarray) -> np.ndarray:
    """Asigna canales de vértice compatibles con CREW_MAT: R=equipo1, B=equipo2, G=gris oscuro fijo."""
    T1 = np.array([1.0, 0.0, 0.0])       # mono del equipo
    T2 = np.array([0.0, 0.0, 1.0])       # casco y franjas de acento (o blanco en comisarios)
    VISOR = np.array([0.0, 0.10, 0.0])   # visera negra
    DARK = np.array([0.0, 0.16, 0.0])    # guantes, botas, collarín HANS
    n = len(pos_raw)
    if ni in (8, 6):                     # casco
        return np.tile(T2, (n, 1))
    if ni == 12:                         # franja del casco en color principal
        return np.tile(T1, (n, 1))
    if ni in (10, 4):                    # visera y rostro interior
        return np.tile(VISOR, (n, 1))
    if ni in (14, 20, 28, 32, 38):       # guantes, HANS, botas
        return np.tile(DARK, (n, 1))
    col = np.tile(T1, (n, 1))
    return col


def _render_crew_preview(parts_dict: dict[str, dict], out_png: Path) -> None:
    """Dibuja vista lateral (+X derecha) y frontal de crew_stand y crew_crouch para verificar poses."""
    W, H = 800, 420
    im = Image.new("RGB", (W, H), (28, 32, 38))
    dr = ImageDraw.Draw(im)
    panels = [
        ("stand side (+X ->)", parts_dict["stand"], 0, 1, 100, 380, 165),
        ("stand front",        parts_dict["stand"], 2, 1, 300, 380, 165),
        ("crouch side (+X ->)",parts_dict["crouch"], 0, 1, 510, 380, 165),
        ("crouch front",       parts_dict["crouch"], 2, 1, 700, 380, 165),
    ]
    for title, m, ax, ay, ox, oy, sc in panels:
        dr.line([(ox - 85, oy), (ox + 85, oy)], fill=(90, 95, 105), width=2)
        dr.text((ox - 70, 12), title, fill=(230, 235, 240))
        tris = m["idx"].reshape(-1, 3)
        pos, col = m["pos"], m["col"]
        # ordenar por profundidad
        az = 3 - ax - ay
        order = np.argsort(pos[tris, az].mean(axis=1))
        for ti in order:
            t = tris[ti]
            c = col[t].mean(axis=0)
            rgb = (
                int(np.clip(c[0] * 210 + c[1] * 180 + c[2] * 240, 25, 255)),
                int(np.clip(c[0] * 35  + c[1] * 180 + c[2] * 240, 25, 255)),
                int(np.clip(c[0] * 35  + c[1] * 190 + c[2] * 245, 25, 255)),
            )
            pts = [(ox + float(pos[vi, ax]) * sc, oy - float(pos[vi, ay]) * sc) for vi in t]
            dr.polygon(pts, fill=rgb)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_png)


def build_crew(preview_dir: Path | None = None) -> None:
    j, buf = load_glb(ROOT / "mecanico.glb")
    wm = node_world_mats(j)
    node_ids = [i for i, n in enumerate(j["nodes"]) if "mesh" in n and i != 28]  # 28 = HANS (de piloto, no de mecánico)

    def load_limbs() -> dict[int, dict]:
        d = {}
        for ni in node_ids:
            pr = extract_prim(j, buf, wm, ni)
            pr["uv"] = None
            pr["col"] = _color_crew_node(ni, pr["pos"])
            d[ni] = pr
        return d

    # ---- 1) De pie (crew_stand.glb): relajar la pose en A pegando los brazos al cuerpo
    stand = load_limbs()
    for ni in (18, 16, 14):  # brazo izquierdo (+X)
        _xform_around(stand[ni], np.array([0.46, 1.28, 0.18]), _rot_x(0.18) @ _rot_z(-0.34))
    for ni in (24, 22, 20):  # brazo derecho (-X)
        _xform_around(stand[ni], np.array([-0.46, 1.28, 0.18]), _rot_x(0.18) @ _rot_z(0.34))

    m_stand = merge_prims(list(stand.values()))
    ymin_raw, ymax_raw = m_stand["pos"][:, 1].min(), m_stand["pos"][:, 1].max()
    sc = 1.78 / (ymax_raw - ymin_raw)  # 1,78 m de altura real
    cx_raw = 0.5 * (m_stand["pos"][:, 0].min() + m_stand["pos"][:, 0].max())
    cz_raw = 0.22

    # Girar +90° en Y para que mire hacia +X (en el origen mira hacia +Z)
    R_face_x = _rot_y(math.pi * 0.5)

    def finalize_crew(m: dict) -> dict:
        m["pos"] = (m["pos"] - np.array([cx_raw, 0.0, cz_raw])) * sc
        m["pos"] = m["pos"] @ R_face_x.T
        m["nrm"] = m["nrm"] @ R_face_x.T
        m["pos"][:, 1] -= m["pos"][:, 1].min()
        return m

    m_stand = finalize_crew(m_stand)
    mats_crew = [{"name": "crew", "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.75}}]
    sz_s = write_glb(OUT_DIR / "crew_stand.glb", [{**m_stand, "name": "crew_stand", "material": 0}], mats_crew, [])
    print(f"crew_stand.glb     : {sz_s/1024:6.1f} KB  ({len(m_stand['idx'])//3} tris)")

    # ---- 2) Agachado con pistola neumática (crew_crouch.glb)
    cr = load_limbs()
    # Primero bajar cadera/torso/brazos/cabeza y piernas en espacio local (+Z = delante)
    # Cadera baja ~1.25 unidades (en bruto: altura 4.34 -> 1.25 ≈ 0.51 m más abajo -> altura total agachado ~1.28 m)
    hip_drop = np.array([0.0, -1.28, -0.18])
    hip_piv = np.array([0.0, 0.05, 0.22])

    # Pierna izquierda (+X): pie adelantado apoyado plano en el suelo, muslo algo inclinado hacia abajo
    l_hip = np.array([0.22, -0.15, 0.20])
    for ni in (36, 34, 32):
        _xform_around(cr[ni], l_hip, _rot_x(-1.05), hip_drop + np.array([0.05, 0.0, 0.12]))
    l_knee = (np.array([0.22, -1.05, 0.16]) - l_hip) @ _rot_x(-1.05).T + l_hip + hip_drop + np.array([0.05, 0.0, 0.12])
    for ni in (34, 32):
        _xform_around(cr[ni], l_knee, _rot_x(1.05))

    # Pierna derecha (-X): rodilla apoyada en el suelo atrás, pantorrilla horizontal hacia atrás
    r_hip = np.array([-0.22, -0.15, 0.20])
    for ni in (42, 40, 38):
        _xform_around(cr[ni], r_hip, _rot_x(-0.18), hip_drop + np.array([-0.05, 0.0, -0.04]))
    r_knee = (np.array([-0.22, -1.05, 0.16]) - r_hip) @ _rot_x(-0.18).T + r_hip + hip_drop + np.array([-0.05, 0.0, -0.04])
    for ni in (40, 38):
        _xform_around(cr[ni], r_knee, _rot_x(1.75))
    # Bota derecha alineada para que la punta apoye a la misma cota que el pie delantero
    r_ankle = (np.array([-0.22, -2.02, 0.12]) - r_hip) @ _rot_x(-0.18).T + r_hip + hip_drop + np.array([-0.05, 0.0, -0.04])
    r_ankle = (r_ankle - r_knee) @ _rot_x(1.75).T + r_knee
    _xform_around(cr[38], r_ankle, _rot_x(-0.45))

    # Alinear bota izquierda al suelo (cota de la rodilla derecha)
    floor_y = min(cr[40]["pos"][:, 1].min(), cr[38]["pos"][:, 1].min())
    dy_l = floor_y - cr[32]["pos"][:, 1].min()
    for ni in (34, 32):
        cr[ni]["pos"][:, 1] += dy_l * 0.85

    # Torso + cadera + cabeza: bajar e inclinar hacia delante (+Z)
    torso_ids = [44, 30, 26, 4, 6, 8, 10, 12, 18, 16, 14, 24, 22, 20]
    for ni in torso_ids:
        _xform_around(cr[ni], hip_piv, _rot_x(0.42), hip_drop)

    # Cabeza: compensar inclinación del torso para mirar al frente hacia la rueda
    neck_piv = (np.array([0.0, 1.48, 0.25]) - hip_piv) @ _rot_x(0.42).T + hip_piv + hip_drop
    for ni in (4, 6, 8, 10, 12):
        _xform_around(cr[ni], neck_piv, _rot_x(-0.34))

    # Brazos extendidos hacia delante (+Z) y cerrados al centro para agarrar la pistola neumática
    l_sh = (np.array([0.46, 1.28, 0.18]) - hip_piv) @ _rot_x(0.42).T + hip_piv + hip_drop
    r_sh = (np.array([-0.46, 1.28, 0.18]) - hip_piv) @ _rot_x(0.42).T + hip_piv + hip_drop
    for ni in (18, 16, 14):
        _xform_around(cr[ni], l_sh, _rot_y(-0.38) @ _rot_x(-1.38) @ _rot_z(-0.25))
    for ni in (24, 22, 20):
        _xform_around(cr[ni], r_sh, _rot_y(0.38) @ _rot_x(-1.38) @ _rot_z(0.25))

    # Pistola neumática entre los dos guantes (en espacio local +Z = delante)
    gloves_pos = np.vstack([cr[14]["pos"], cr[20]["pos"]])
    gx, gy, gz = 0.0, float(gloves_pos[:, 1].mean()), float(gloves_pos[:, 2].max())
    GUN = (0.0, 0.24, 0.0)
    GUN_TIP = (0.0, 0.36, 0.0)
    gun_parts = [
        _make_box(0.32, 0.34, 0.78, (gx, gy + 0.06, gz + 0.20), GUN),      # cuerpo pistola
        _make_box(0.18, 0.18, 0.42, (gx, gy + 0.06, gz + 0.72), GUN_TIP),  # vaso / boca
        _make_box(0.20, 0.44, 0.22, (gx, gy - 0.16, gz - 0.04), GUN),      # empuñadura
    ]

    m_crouch = merge_prims(list(cr.values()) + gun_parts)
    m_crouch = finalize_crew(m_crouch)
    sz_c = write_glb(OUT_DIR / "crew_crouch.glb", [{**m_crouch, "name": "crew_crouch", "material": 0}], mats_crew, [])
    print(f"crew_crouch.glb    : {sz_c/1024:6.1f} KB  ({len(m_crouch['idx'])//3} tris)")

    if preview_dir is not None:
        _render_crew_preview({"stand": m_stand, "crouch": m_crouch}, preview_dir / "crew_poses.png")


def main() -> None:
    preview_dir = None
    if "--preview-dir" in sys.argv:
        preview_dir = Path(sys.argv[sys.argv.index("--preview-dir") + 1])
    build_tree_leaf()
    build_tree_pine()
    build_tree_palm()
    build_yacht()
    build_crew(preview_dir)


if __name__ == "__main__":
    main()
