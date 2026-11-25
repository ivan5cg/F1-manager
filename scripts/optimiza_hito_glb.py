#!/usr/bin/env python3
"""Optimiza un modelo 3D de hito (.glb/.obj/.ply) al contrato PWA de Muro de Boxes.

  python3 scripts/optimiza_hito_glb.py entrada.glb <circuito> <id_hito> [--tris 4500] [--tex 512] [--sin-draco]

Contrato de hitos (PLAN-3D-UX.md · Bloque 5.4):
  - Pivote normalizado: base exacta en y = 0, centrado en X/Z y altura normalizada a 1,0 m
    (map3d.ts lo escala automáticamente a `spec.height` según src/ui/landmarks.ts).
  - Geometría simplificada a ~3 000–6 000 triángulos (por defecto 4 500).
  - Texturas embebidas redimensionadas a <= 512 px y convertidas a WebP.
  - Compresión Draco mediante `gltf-transform` (si está instalado) con aviso si supera 300 KB.
  - Guarda en `public/assets/landmarks/<circuito>/<id_hito>.glb` y lo registra en
    `public/assets/landmarks/manifest.json` para que el juego lo cargue bajo demanda.

Dependencias Python: trimesh, numpy, Pillow (y opcionalmente fast-simplification o pyfqmr).
Dependencia opcional para Draco: `npx @gltf-transform/cli draco ...` (Node.js).
"""
import argparse, io, json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image

try:
    import trimesh
except ImportError:
    sys.exit("Falta 'trimesh'. Instálalo con: pip install trimesh pillow numpy fast-simplification")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LM_DIR = os.path.join(ROOT, "public", "assets", "landmarks")
MANIFEST = os.path.join(LM_DIR, "manifest.json")


def decimate_mesh(mesh: "trimesh.Trimesh", target_faces: int) -> "trimesh.Trimesh":
    """Reduce caras conservando los colores por vértice (p. ej. TripoSR) cuando existen."""
    n = len(mesh.faces)
    if n <= target_faces:
        return mesh
    orig_verts = np.asarray(mesh.vertices, dtype=np.float32)
    orig_vcol = None
    if getattr(mesh.visual, "kind", None) == "vertex" and getattr(mesh.visual, "vertex_colors", None) is not None:
        orig_vcol = np.asarray(mesh.visual.vertex_colors, dtype=np.uint8)
    # Intentar fast_simplification (rápido y fiel, ideal en local y Google Colab)
    try:
        import fast_simplification
        ratio = max(0.05, min(0.95, 1.0 - target_faces / float(n)))
        v_out, f_out = fast_simplification.simplify(
            orig_verts,
            np.asarray(mesh.faces, dtype=np.int32),
            target_reduction=ratio,
        )
        out = trimesh.Trimesh(vertices=v_out, faces=f_out, process=False)
        if orig_vcol is not None and len(orig_vcol) == len(orig_verts):
            from scipy.spatial import cKDTree
            _, idx = cKDTree(orig_verts).query(v_out)
            out.visual.vertex_colors = orig_vcol[idx]
        return out
    except Exception:
        pass
    # Respaldo nativo de trimesh (quadric decimation si está disponible)
    try:
        return mesh.simplify_quadric_decimation(face_count=target_faces)
    except Exception as exc:
        print(f"   ! aviso: no se pudo decimar ({exc}); se mantiene {n} triángulos")
        return mesh


def shrink_textures(scene: "trimesh.Scene", max_px: int):
    """Redimensiona todas las texturas PBR embebidas a <= max_px."""
    for geom in scene.geometry.values():
        vis = getattr(geom, "visual", None)
        mat = getattr(vis, "material", None)
        if mat is None:
            continue
        for attr in ("image", "baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture"):
            img = getattr(mat, attr, None)
            if isinstance(img, Image.Image):
                w, h = img.size
                if max(w, h) > max_px:
                    scale = max_px / float(max(w, h))
                    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
                    setattr(mat, attr, img)


def normalize_scene(scene: "trimesh.Scene") -> "trimesh.Scene":
    """Centra en X/Z, apoya la base en y = 0 y normaliza la altura total a 1,0 m."""
    bounds = scene.bounds
    if bounds is None:
        return scene
    lo, hi = bounds[0], bounds[1]
    cx = 0.5 * (lo[0] + hi[0])
    cz = 0.5 * (lo[2] + hi[2])
    by = lo[1]
    height = max(1e-4, float(hi[1] - lo[1]))
    s = 1.0 / height
    T = np.eye(4)
    T[:3, 3] = [-cx, -by, -cz]
    S = np.diag([s, s, s, 1.0])
    scene.apply_transform(S @ T)
    return scene


def run_gltf_transform(src_glb: str, dst_glb: str, max_tex: int, use_draco: bool) -> bool:
    """Usa @gltf-transform/cli para convertir texturas a WebP 512px y comprimir con Draco."""
    cli = shutil.which("gltf-transform")
    npx_exe = shutil.which("npx")
    base_cmd = [cli] if cli else ([npx_exe, "--yes", "@gltf-transform/cli"] if npx_exe else None)
    if not base_cmd:
        return False
    with tempfile.TemporaryDirectory() as td:
        cur = src_glb
        res_glb = os.path.join(td, "res.glb")
        r0 = subprocess.run(base_cmd + ["resize", cur, res_glb, "--width", str(max_tex), "--height", str(max_tex)], capture_output=True, text=True)
        if r0.returncode == 0 and os.path.exists(res_glb):
            cur = res_glb
        webp_glb = os.path.join(td, "webp.glb")
        r1 = subprocess.run(base_cmd + ["webp", cur, webp_glb, "--quality", "82"], capture_output=True, text=True)
        if r1.returncode == 0 and os.path.exists(webp_glb):
            cur = webp_glb
        if use_draco:
            r2 = subprocess.run(base_cmd + ["draco", cur, dst_glb, "--method", "edgebreaker"], capture_output=True, text=True)
            if r2.returncode == 0 and os.path.exists(dst_glb):
                return True
        shutil.copy2(cur, dst_glb)
        return True


def update_manifest(track_id: str, lm_id: str):
    os.makedirs(LM_DIR, exist_ok=True)
    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST, encoding="utf8"))
    else:
        man = {"version": 1, "glb": {}}
    man.setdefault("glb", {})[f"{track_id}/{lm_id}"] = True
    man["glb"] = dict(sorted(man["glb"].items()))
    open(MANIFEST, "w", encoding="utf8").write(json.dumps(man, indent=2, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description="Optimiza un hito 3D al contrato PWA (<300 KB, Draco + WebP 512px)")
    ap.add_argument("entrada", help="Archivo 3D de entrada (.glb, .gltf, .obj, .ply)")
    ap.add_argument("circuito", help="ID del circuito (p. ej. suzuka, austin, lasvegas)")
    ap.add_argument("hito", help="ID del hito en src/ui/landmarks.ts (p. ej. noria, torre_cota, esfera)")
    ap.add_argument("--tris", type=int, default=4500, help="Triángulos objetivo (por defecto 4500)")
    ap.add_argument("--tex", type=int, default=512, help="Tamaño máximo de textura en px (por defecto 512)")
    ap.add_argument("--sin-draco", action="store_true", help="Omitir compresión Draco")
    ap.add_argument("--salida", help="Ruta .glb alternativa (por defecto public/assets/landmarks/<circuito>/<hito>.glb)")
    ap.add_argument("--sin-manifest", action="store_true", help="No modificar public/assets/landmarks/manifest.json")
    args = ap.parse_args()

    loaded = trimesh.load(args.entrada, force="scene")
    scene = loaded if isinstance(loaded, trimesh.Scene) else trimesh.Scene(loaded)
    total_before = sum(len(g.faces) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))

    if total_before > args.tris and total_before > 0:
        for name, g in list(scene.geometry.items()):
            if isinstance(g, trimesh.Trimesh) and len(g.faces) > 64:
                share = max(64, int(round(args.tris * (len(g.faces) / float(total_before)))))
                scene.geometry[name] = decimate_mesh(g, share)

    normalize_scene(scene)
    shrink_textures(scene, args.tex)
    total_after = sum(len(g.faces) for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))

    out_path = args.salida or os.path.join(LM_DIR, args.circuito, f"{args.hito}.glb")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        raw_glb = os.path.join(td, "raw.glb")
        scene.export(raw_glb, file_type="glb")
        ok_gt = run_gltf_transform(raw_glb, out_path, args.tex, not args.sin_draco)
        if not ok_gt:
            shutil.copy2(raw_glb, out_path)
            print("   ! aviso: gltf-transform no está instalado; guardado sin compresión Draco/WebP")

    size_kb = os.path.getsize(out_path) / 1024.0
    if not args.sin_manifest and not args.salida:
        update_manifest(args.circuito, args.hito)
    flag = "  ! SUPERA 300 KB (reduce --tris o --tex)" if size_kb > 300 else "  OK (<300 KB)"
    print(f"{args.circuito}/{args.hito}: {total_before} -> {total_after} tris, {size_kb:.1f} KB{flag} -> {out_path}")


if __name__ == "__main__":
    main()
