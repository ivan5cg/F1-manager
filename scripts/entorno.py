#!/usr/bin/env python3
"""Altitud real y máscaras de agua (mar, lagos, ríos y embalses) de los 24 circuitos.

  python3 scripts/entorno.py [carpeta-de-caché] [id ... | --todos] [--semiurbano] [--sin-agua]

Sitúa el trazado del juego sobre el mapa igual que scripts/relieve.py y lee en una rejilla
de N × N puntos (en coordenadas del juego, centrada en el circuito) la altitud de las teselas
«terrarium» de Mapzen/AWS Terrain Tiles. En los circuitos con agua interior por encima de 0 m
(Melbourne, Montreal, Interlagos, Miami, Shanghái) o costa/marina estrecha (Yas Marina,
Zandvoort) descarga también los polígonos de agua de OpenStreetMap (Overpass) para construir
una máscara compacta en base64 ("agua") junto a su cota ("aguaNivel").

Escribe el resultado en public/assets/env-tracks/<id>.json (cargado bajo demanda en el 3D)
con "tipo": "urbano" | "semiurbano" | "circuito", "x0", "y0", "paso", "n", "h" y, si hay agua
explícita, "aguaNivel" y "agua". La simulación no lee este archivo: solo usa "urbano" en el
JSON del circuito.
"""
import base64, json, math, os, re, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageDraw

# las funciones de scripts/relieve.py (todo menos su bucle final)
lib_path = os.path.join(os.path.dirname(__file__), "relieve.py")
src = open(lib_path, encoding="utf8").read()
lib = src[: src.index("for cid, (bac, tum, sentido_real, lado) in CIRCUITS.items():")]
g = {"__file__": lib_path}
exec(compile(lib, lib_path, "exec"), g)
ROOT, CACHE, fetch, resample, fit, elevation, CIRCUITS = (
    g["ROOT"], g["CACHE"], g["fetch"], g["resample"], g["fit"], g["elevation"], g["CIRCUITS"]
)
ENV_DIR = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "public", "assets", "env-tracks")

N = 72
SEA = {"baku": -27.0}
URBANOS = {"monaco", "singapur", "baku", "lasvegas"}
SEMIURBANOS = {"melbourne", "montreal", "miami", "madrid"}
# Circuitos con lagos/ríos interiores o marinas que conviene extraer de OSM
OSM_WATER = {"melbourne", "montreal", "interlagos", "yasmarina"}
# Circuitos cuya costa de mar a 0 m también entra en la máscara de agua (excluye pólderes bajo 0 m)
SEA_BORDER_ONLY = {"zandvoort"}
SEA_ALL = {"melbourne"}
# En estos circuitos se descarga la geometría completa (sin recortar) para que embalses grandes rellenen bien la esquina
OSM_FULL_GEOM = {"interlagos", "melbourne", "yasmarina"}
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def fetch_overpass(cid, s, w, n, e):
    """Descarga y cachea polígonos de agua de OSM en la caja (s, w, n, e)."""
    path = os.path.join(CACHE, f"water-{cid}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf8"))
    out_clause = "out geom;" if cid in OSM_FULL_GEOM else f"out geom({s:.5f},{w:.5f},{n:.5f},{e:.5f});"
    if cid in ("miami", "shanghai"):
        body_q = f'way["natural"="water"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});way["waterway"="riverbank"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
    else:
        body_q = (
            f'way["natural"="water"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
            f'relation["natural"="water"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
            f'way["waterway"="riverbank"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
            f'relation["waterway"="riverbank"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
            f'way["landuse"="reservoir"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
            f'relation["landuse"="reservoir"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});'
        )
    q = f"[out:json][timeout:30];({body_q});{out_clause}"
    data = urllib.parse.urlencode({"data": q}).encode("utf8")
    last_err = None
    for attempt in range(4):
        url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "muro-de-boxes/1.0"})
            with urllib.request.urlopen(req, timeout=35) as r:
                body = r.read()
            parsed = json.loads(body.decode("utf8"))
            with open(path, "wb") as f:
                f.write(body)
            return parsed
        except Exception as exc:
            last_err = exc
            print(f"   reintento Overpass ({cid}, {attempt + 1}): {exc}", flush=True)
            time.sleep(3 * (attempt + 1))
    raise last_err


def stitch_rings(segments):
    """Une segmentos abiertos de un multipolígono OSM en anillos cerrados."""
    unused = [list(seg) for seg in segments if len(seg) >= 2]
    rings = []
    while unused:
        ring = unused.pop(0)
        changed = True
        while changed and len(ring) >= 2:
            changed = False
            if math.hypot(ring[0][0] - ring[-1][0], ring[0][1] - ring[-1][1]) < 1e-5:
                break
            for idx, seg in enumerate(unused):
                if math.hypot(ring[-1][0] - seg[0][0], ring[-1][1] - seg[0][1]) < 1e-5:
                    ring.extend(seg[1:])
                    unused.pop(idx)
                    changed = True
                    break
                if math.hypot(ring[-1][0] - seg[-1][0], ring[-1][1] - seg[-1][1]) < 1e-5:
                    ring.extend(reversed(seg[:-1]))
                    unused.pop(idx)
                    changed = True
                    break
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def fit_inverse(pts, geo):
    """Ajuste directo e inverso (mapa -> coordenadas del juego) sobre bacinger/f1-circuits."""
    p, _ = resample(pts, 360)
    q, _ = resample(geo, 360)
    rms, scale, rot, mirror, rev, to_map = fit(p, q)
    # recuperar transformación lineal afín exacta desde 3 puntos no colineales
    ref = np.array([[0.0, 0.0], [1000.0, 0.0], [0.0, 1000.0]])
    mapped = to_map(ref)
    A = np.column_stack([(mapped[1] - mapped[0]) / 1000.0, (mapped[2] - mapped[0]) / 1000.0])
    Ainv = np.linalg.inv(A)
    b0 = mapped[0]

    def from_map(xy):
        arr = np.asarray(xy, float)
        return (arr - b0) @ Ainv.T

    return rms, to_map, from_map


def rasterize_water(cid, osm_data, lat0, lon0, mlat, mlon, from_map, x0, y0, paso):
    """Rasteriza polígonos de agua OSM a una rejilla booleana N × N (sobrerresolución 4×)."""
    SS = 4
    W = N * SS
    img = Image.new("L", (W, W), 0)
    draw = ImageDraw.Draw(img)

    def to_px(coords):
        arr = np.asarray(coords, float)
        mxy = np.column_stack([(arr[:, 1] - lon0) * mlon, (arr[:, 0] - lat0) * mlat])
        gxy = from_map(mxy)
        px = ((gxy[:, 0] - x0) / paso + 0.5) * SS
        py = ((gxy[:, 1] - y0) / paso + 0.5) * SS
        return [(float(a), float(b)) for a, b in zip(px, py)]

    outers, inners = [], []
    for el in osm_data.get("elements", []):
        et = el.get("type")
        if et == "way" and el.get("geometry"):
            pts = [(pt["lat"], pt["lon"]) for pt in el["geometry"] if pt is not None]
            if len(pts) >= 3:
                outers.append(pts)
        elif et == "relation" and el.get("members"):
            o_segs, i_segs = [], []
            for mem in el["members"]:
                if mem.get("type") != "way" or not mem.get("geometry"):
                    continue
                seg = [(pt["lat"], pt["lon"]) for pt in mem["geometry"] if pt is not None]
                if len(seg) < 2:
                    continue
                if mem.get("role") == "inner":
                    i_segs.append(seg)
                else:
                    o_segs.append(seg)
            outers.extend(stitch_rings(o_segs))
            inners.extend(stitch_rings(i_segs))

    # dibujar primero exteriores grandes y luego perforar islas interiores
    for ring in outers:
        poly = to_px(ring)
        if len(poly) >= 3:
            draw.polygon(poly, fill=255)
    for ring in inners:
        poly = to_px(ring)
        if len(poly) >= 3:
            draw.polygon(poly, fill=0)

    arr = np.asarray(img, float).reshape(N, SS, N, SS).mean(axis=(1, 3))
    return arr >= 96.0


def sea_connected_to_edge(h_grid, edges=("left", "right", "top", "bottom"), thr=0.2):
    """Flood-fill de celdas h <= thr conectadas a los bordes indicados (evita pólderes interiores)."""
    mask = np.zeros((N, N), dtype=bool)
    stack = []
    if "left" in edges:
        for j in range(N):
            if h_grid[j, 0] <= thr:
                stack.append((j, 0))
    if "right" in edges:
        for j in range(N):
            if h_grid[j, N - 1] <= thr:
                stack.append((j, N - 1))
    if "bottom" in edges:
        for i in range(N):
            if h_grid[0, i] <= thr:
                stack.append((0, i))
    if "top" in edges:
        for i in range(N):
            if h_grid[N - 1, i] <= thr:
                stack.append((N - 1, i))
    while stack:
        j, i = stack.pop()
        if mask[j, i]:
            continue
        mask[j, i] = True
        for dj, di in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nj, ni = j + dj, i + di
            if 0 <= nj < N and 0 <= ni < N and not mask[nj, ni] and h_grid[nj, ni] <= thr:
                stack.append((nj, ni))
    return mask


def clean_speckles(wm):
    """Elimina celdas de agua aisladas de 1 píxel (ruido de DEM en zonas llanas)."""
    pad = np.pad(wm.astype(int), 1, mode="edge")
    nb = (
        pad[:-2, :-2] + pad[:-2, 1:-1] + pad[:-2, 2:]
        + pad[1:-1, :-2] + pad[1:-1, 2:]
        + pad[2:, :-2] + pad[2:, 1:-1] + pad[2:, 2:]
    )
    return wm & (nb >= 2)


def pack_mask_b64(mask_flat):
    """Empaqueta N*N booleanos en una cadena base64 compacta (LSB primero por byte)."""
    nbytes = (len(mask_flat) + 7) // 8
    buf = bytearray(nbytes)
    for k, v in enumerate(mask_flat):
        if v:
            buf[k >> 3] |= 1 << (k & 7)
    return base64.b64encode(bytes(buf)).decode("ascii")


def main():
    raw_args = sys.argv[2:]
    all_flag = "--todos" in raw_args
    no_water = "--sin-agua" in raw_args
    force_semi = "--semiurbano" in raw_args
    cids = [a for a in raw_args if not a.startswith("--")]
    if all_flag:
        cids = list(CIRCUITS.keys())
    elif not cids:
        cids = ["monaco", "singapur", "baku", "lasvegas"]

    os.makedirs(ENV_DIR, exist_ok=True)
    for cid in cids:
        bac = CIRCUITS[cid][0]
        path = os.path.join(ROOT, cid + ".json")
        d = json.load(open(path, encoding="utf8"))
        pts = np.asarray(d["puntos"], float)[:, :2] * d.get("escala", 1)
        gj = json.load(
            open(fetch(f"https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/{bac}.geojson", bac + ".geojson"))
        )
        ll = np.asarray(gj["features"][0]["geometry"]["coordinates"], float)[:, :2]
        lat0, lon0 = ll[:, 1].mean(), ll[:, 0].mean()
        mlat, mlon = 111132.0, 111320.0 * math.cos(math.radians(lat0))
        geo = np.column_stack([(ll[:, 0] - lon0) * mlon, (ll[:, 1] - lat0) * mlat])
        rms, to_map, from_map = fit_inverse(pts, geo)

        lo, hi = pts.min(0), pts.max(0)
        c, E = (lo + hi) / 2, (hi - lo).max()
        R = E * 0.75 + 450
        paso = 2 * R / (N - 1)
        x0, y0 = c[0] - R, c[1] - R
        grid = np.array([[x0 + i * paso, y0 + j * paso] for j in range(N) for i in range(N)])
        m = to_map(grid)
        lats = lat0 + m[:, 1] / mlat
        lons = lon0 + m[:, 0] / mlon
        h = np.array([elevation(lat, lon) for lat, lon in zip(lats, lons)])
        h = h - SEA.get(cid, 0.0)
        h_grid = h.reshape(N, N)
        hh = [int(round(max(-5.0, float(v)))) for v in h]

        if force_semi:
            tipo = "semiurbano"
        elif cid in URBANOS:
            tipo = "urbano"
        elif cid in SEMIURBANOS:
            tipo = "semiurbano"
        else:
            tipo = "circuito"

        # Máscara de agua explícita para lagos/ríos interiores y marinas/costas seleccionadas
        water_mask = None
        water_lvl = None
        if not no_water and (cid in OSM_WATER or cid in SEA_BORDER_ONLY or cid in SEA_ALL):
            wm = np.zeros((N, N), dtype=bool)
            if cid in OSM_WATER:
                s_box, n_box = float(lats.min()) - 0.004, float(lats.max()) + 0.004
                w_box, e_box = float(lons.min()) - 0.004, float(lons.max()) + 0.004
                osm_data = fetch_overpass(cid, s_box, w_box, n_box, e_box)
                wm |= rasterize_water(cid, osm_data, lat0, lon0, mlat, mlon, from_map, x0, y0, paso)
            if cid in SEA_ALL:
                wm |= h_grid <= 0.2
            elif cid in SEA_BORDER_ONLY:
                # Mar del Norte al oeste en Zandvoort (los pólderes bajos tierra adentro quedan secos)
                wm |= sea_connected_to_edge(h_grid, edges=("left", "top", "bottom"))
            if cid == "yasmarina":
                # Yas Island tiene desierto llano a 0 m: solo sumar mar real conectado al borde con h <= -0.5
                wm |= sea_connected_to_edge(h_grid, edges=("left", "right", "top", "bottom"), thr=-0.5)
            wm = clean_speckles(wm)
            # Limpiar siempre un margen de seguridad alrededor de la pista para no inundar el asfalto
            tr_samp, _ = resample(pts, 360)
            gx_all = grid[:, 0].reshape(N, N)
            gy_all = grid[:, 1].reshape(N, N)
            safe_r2 = max(paso * 0.75, 42.0) ** 2
            for tx, ty in tr_samp[::2]:
                wm &= ((gx_all - tx) ** 2 + (gy_all - ty) ** 2) > safe_r2

            if wm.any():
                # Cota real de la lámina de agua: mediana de las celdas de agua, siempre por debajo de la pista
                tr_m = to_map(tr_samp[::4])
                tr_h = np.array([elevation(lat0 + y / mlat, lon0 + x / mlon) for x, y in tr_m]) - SEA.get(cid, 0.0)
                med_w = float(np.median(h_grid[wm]))
                # Si la lámina de agua es mar (<= 1 m), fijarla en 0 m; si es lago/río interior, limitar bajo la pista
                water_lvl = 0 if med_w <= 1.0 and cid in (SEA_ALL | SEA_BORDER_ONLY | {"yasmarina"}) else int(round(min(med_w, float(np.percentile(tr_h, 5)) - 2.0)))
                water_mask = pack_mask_b64(wm.flatten())

        val = {
            "fuente": "Mapzen/AWS Terrain Tiles (terrarium, z14) con el trazado situado con bacinger/f1-circuits"
            + (" y agua de OpenStreetMap" if water_mask else ""),
            "tipo": tipo,
            "x0": round(float(x0), 1),
            "y0": round(float(y0), 1),
            "paso": round(float(paso), 2),
            "n": N,
            "h": hh,
        }
        if water_mask is not None:
            val["aguaNivel"] = water_lvl
            val["agua"] = water_mask

        out_env = os.path.join(ENV_DIR, cid + ".json")
        open(out_env, "w", encoding="utf8").write(json.dumps(val, separators=(",", ":"), ensure_ascii=False) + "\n")
        if tipo == "urbano":
            txt = open(path, encoding="utf8").read()
            txt = re.sub(r',\s*"entorno"\s*:\s*\{.*?\}', "", txt, flags=re.S)
            if not d.get("urbano"):
                txt = re.sub(r',\s*"urbano"\s*:\s*(?:true|false)', "", txt)
                end = txt.rstrip().rfind("}")
                txt = txt[:end].rstrip() + ',\n  "urbano": true\n}\n'
            open(path, "w", encoding="utf8").write(txt)

        a = np.array(hh).reshape(N, N)
        w_pct = (wm.mean() * 100.0) if water_mask is not None else (np.mean(a <= 0) * 100.0)
        sz_kb = os.path.getsize(out_env) / 1024.0
        extra_w = f", agua {w_pct:.0f} % (cota {water_lvl} m)" if water_mask is not None else f", mar {w_pct:.0f} %"
        print(f"{cid:12s} [{tipo:10s}] ajuste {rms:4.1f} m, paso {paso:4.0f} m, min/máx {a.min():4d}/{a.max():4d} m{extra_w} -> {sz_kb:.1f} KB", flush=True)


if __name__ == "__main__":
    main()
