"""Script para Blender 4.x: prepara un monoplaza de F1 y lo exporta como GLB con Draco.

Uso (desde la raíz del proyecto):
  blender -b archivo.blend --python scripts/blender_prepara_coche.py
  blender -b --python scripts/blender_prepara_coche.py -- ruta/al/modelo.glb [--voltear]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "assets" / "models"
MAX_TRIS_CAR = 14000
TARGET_LEN = 5.60


def parse_args() -> tuple[Path | None, bool]:
    if "--" not in sys.argv:
        return None, False
    args = sys.argv[sys.argv.index("--") + 1 :]
    flip = "--voltear" in args
    paths = [a for a in args if not a.startswith("-")]
    return (Path(paths[0]).resolve() if paths else None), flip


def import_model(path: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = path.suffix.lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    else:
        raise ValueError(f"Formato no soportado: {ext}")


def is_wheel(name: str) -> bool:
    low = name.lower()
    return any(k in low for k in ("rueda", "wheel", "tyre", "tire", "rim", "llanta"))


def apply_transforms(objs: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def world_bounds(objs: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn.x, mn.y, mn.z = min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)
            mx.x, mx.y, mx.z = max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)
    return mn, mx


def count_tris(objs: list[bpy.types.Object]) -> int:
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs:
        eo = o.evaluated_get(deps)
        mesh = eo.to_mesh()
        total += sum(max(1, len(p.vertices) - 2) for p in mesh.polygons)
        eo.to_mesh_clear()
    return total


def decimate_if_needed(objs: list[bpy.types.Object], max_tris: int) -> None:
    tris = count_tris(objs)
    if tris <= max_tris or tris <= 0:
        print(f"Triángulos del chasis: {tris} (dentro del tope {max_tris})")
        return
    ratio = max(0.01, (max_tris * 0.95) / tris)
    print(f"Reduciendo polígonos: {tris} -> objetivo {max_tris} (ratio {ratio:.3f})")
    for o in objs:
        if len(o.data.polygons) < 120:
            continue
        mod = o.modifiers.new(name="DecimateMovil", type="DECIMATE")
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f"Triángulos finales: {count_tris(objs)}")


def orient_and_scale(objs: list[bpy.types.Object], flip: bool) -> None:
    apply_transforms(objs)
    mn, mx = world_bounds(objs)
    sz = mx - mn
    # En Blender (Z arriba), si el largo va por Y se gira 90° en Z para dejar el morro en +X
    if sz.y > sz.x:
        for o in objs:
            o.rotation_euler.z += math.pi / 2
    if flip:
        for o in objs:
            o.rotation_euler.z += math.pi
    apply_transforms(objs)

    mn, mx = world_bounds(objs)
    sz = mx - mn
    scale = TARGET_LEN / max(0.01, sz.x)
    for o in objs:
        o.scale *= scale
    apply_transforms(objs)

    mn, mx = world_bounds(objs)
    cx = (mn.x + mx.x) * 0.5 - 0.25
    cy = (mn.y + mx.y) * 0.5
    cz = mn.z - 0.04
    for o in objs:
        o.location.x -= cx
        o.location.y -= cy
        o.location.z -= cz


def export_glb(objs: list[bpy.types.Object], dest: Path) -> None:
    for o in objs:
        mats = getattr(o.data, "materials", None)
        if mats and mats[0] and mats[0].name.lower() not in o.name.lower():
            o.name = f"{o.name}_{mats[0].name}"
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    dest.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(dest),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="NONE",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
    )
    print(f"Exportado {dest.name}: {dest.stat().st_size / 1024:.1f} KB")


def main() -> None:
    in_path, flip = parse_args()
    if in_path:
        import_model(in_path)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("No hay mallas en la escena")

    wheels = [o for o in meshes if is_wheel(o.name)]
    chassis = [o for o in meshes if not is_wheel(o.name)]

    orient_and_scale(meshes, flip)
    if chassis:
        decimate_if_needed(chassis, MAX_TRIS_CAR)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    car_objs = chassis if chassis else meshes
    export_glb(car_objs, OUT_DIR / "f1.glb")

    manifest = {"car": "f1.glb", "wheel": None}
    base_wheel = next((o for o in wheels if "base" in o.name.lower()), wheels[0] if wheels else None)
    if base_wheel:
        mn, mx = world_bounds([base_wheel])
        ctr = (mn + mx) * 0.5
        rad = max(mx.x - mn.x, mx.z - mn.z) * 0.5
        s = 0.36 / max(0.01, rad)
        base_wheel.location -= ctr
        base_wheel.scale *= s
        apply_transforms([base_wheel])
        export_glb([base_wheel], OUT_DIR / "wheel.glb")
        manifest["wheel"] = "wheel.glb"

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Actualizado public/assets/models/manifest.json:", manifest)


if __name__ == "__main__":
    main()
