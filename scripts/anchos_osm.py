#!/usr/bin/env python3
"""Anchura de los circuitos que no están en TUMFTM/racetrack-database, sacada de OpenStreetMap.

  python3 scripts/anchos_osm.py [carpeta-de-caché] [id ...]
  python3 scripts/anchos_osm.py [carpeta-de-caché] --calibrar [id ...]

1. Sitúa el trazado del juego sobre el mapa (giro, traslado y escala sobre bacinger/f1-circuits, como relieve.py).
2. Descarga de Overpass las calles y pistas de alrededor: superficies de calzada (`area:highway`), y vías con
   `width` o `lanes`.
3. En cada uno de los 256 puntos de la vuelta, por orden de preferencia:
   - la calzada dibujada como superficie: se mide de borde a borde, en perpendicular a la marcha;
   - la vía más cercana (a menos de 12 m) con `width`;
   - la vía más cercana con `lanes`: se estima la calzada con los carriles y, si los hay, el aparcamiento y el
     carril bici de los lados (ver `por_carriles`);
   si no hay nada, la mediana de lo medido en el resto de la vuelta. Se suaviza a lo largo de la vuelta.

Los carriles solo cuentan la parte pintada de la calle: la pista usa también el aparcamiento, el carril bici y el
arcén, y el piano. Las constantes de `por_carriles` salen de comparar con circuitos que sí tienen anchura medida
(TUMFTM) y pasan por calles con `lanes`: `--calibrar melbourne montreal` lo repite sin escribir nada.

Escribe "ancho" (metros, 256 puntos) y "anchoFuente" con lo que se ha medido de cada forma. La simulación lo usa para
la anchura de la pista (`widthProfile` en src/sim/track.ts) y el 3D para dibujarla.
Datos de OpenStreetMap © colaboradores de OpenStreetMap (ODbL).
"""
import json, math, os, re, sys, urllib.parse, urllib.request, time
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "circuitos")
CACHE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/relieve-cache"
os.makedirs(CACHE, exist_ok=True)
N = 256
NEAR = 12
CIRCUITS = {"monaco": "mc-1929", "singapur": "sg-2008", "baku": "az-2016", "lasvegas": "us-2023",
            "miami": "us-2022", "lusail": "qa-2004", "madrid": "es-2026",
            # solo para --calibrar: tienen anchura de TUMFTM y pasan por calles
            "melbourne": "au-1953", "montreal": "ca-1978"}
CALIBRAR = "--calibrar" in sys.argv[2:]
ONLY = [a for a in sys.argv[2:] if not a.startswith("--")]
if not ONLY: ONLY = ["melbourne", "montreal"] if CALIBRAR else [c for c in CIRCUITS if c not in ("melbourne", "montreal")]

# Calzada estimada a partir de las etiquetas: carriles (4 como mucho) × LANE + aparcamiento + carril bici + BORDE (arcén y piano,
# las dos orillas juntas). Calibrado con --calibrar.
LANE, PARKING, BIKE, BORDE = 3.3, 2.2, 1.5, 3.0
NO = ("no", "none", "separate", "")

def fetch(url, name, data=None):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        for k in range(5):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "muro-de-boxes/1.0"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    body = r.read()
                with open(path, "wb") as f: f.write(body)
                break
            except Exception as e:
                if k == 4: raise
                print(f"   reintento ({e})"); time.sleep(20 * (k + 1))
    return path

def resample(pts, n):
    p = np.asarray(pts, float)
    if np.hypot(*(p[0] - p[-1])) < 1e-6: p = p[:-1]
    q = np.vstack([p, p[:1]])
    d = np.hypot(*np.diff(q, axis=0).T)
    s = np.concatenate([[0], np.cumsum(d)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(t, s, q[:, 0]), np.interp(t, s, q[:, 1])]), s[-1]

def fit(p, q):
    pc, qc = p.mean(0), q.mean(0)
    zp = (p[:, 0] - pc[0]) + 1j * (p[:, 1] - pc[1])
    zq = (q[:, 0] - qc[0]) + 1j * (q[:, 1] - qc[1])
    best = None
    for mirror in (False, True):
        for rev in (False, True):
            a0 = np.conj(zp) if mirror else zp
            b0 = zq[::-1] if rev else zq
            for k in range(len(p)):
                b = np.roll(b0, k)
                a = np.vdot(a0, b) / np.vdot(a0, a0)
                rms = math.sqrt(np.mean(np.abs(a * a0 - b) ** 2))
                if best is None or rms < best[0]: best = (rms, a, mirror)
    rms, a, mirror = best
    def to_map(xy):
        z = (xy[:, 0] - pc[0]) + 1j * (xy[:, 1] - pc[1])
        if mirror: z = np.conj(z)
        w = a * z
        return np.column_stack([w.real + qc[0], w.imag + qc[1]])
    return rms, to_map

def num(v):
    m = re.match(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*(m|ft|')?", v or "")
    if not m: return None
    x = float(m.group(1).replace(",", "."))
    return x * 0.3048 if m.group(2) in ("ft", "'") else x

def lados(t, prefix, si):
    """Cuántos lados (0, 1 o 2) tienen `prefix` con un valor de `si` (both/left/right, y la forma :lane:)."""
    n = 0
    for side, k in (("both", 2), ("left", 1), ("right", 1)):
        for key in (f"{prefix}:{side}", f"{prefix}:lane:{side}"):
            v = t.get(key, "")
            if v not in NO and si(v): n += k; break
    if n == 0 and si(t.get(prefix, "no")) and t.get(prefix, "no") not in NO: n = 2
    return min(n, 2)

def por_carriles(t):
    """Anchura de calzada estimada con `lanes` y lo que hay a los lados, o None. Devuelve también las partes."""
    lanes = num(t.get("lanes", "").split(";")[0])
    if not lanes:
        f, b = num(t.get("lanes:forward")), num(t.get("lanes:backward"))
        lanes = (f or 0) + (b or 0) or None
    if not lanes: return None
    # En las avenidas anchas la pista no pasa de unos 15 m (las vallas cortan la calzada): no más de 4 carriles.
    lanes = min(lanes, 4)
    park = lados(t, "parking", lambda v: v not in NO) if t.get("highway") != "raceway" else 0
    bike = lados(t, "cycleway", lambda v: v == "lane")
    return lanes * LANE + park * PARKING + bike * BIKE + BORDE, (lanes, park, bike)

def seg_dist(p, a, b):
    """Distancia de los puntos p (n×2) a los segmentos a-b (m×2): matriz n×m."""
    ab = b - a
    L2 = np.maximum((ab ** 2).sum(1), 1e-9)
    t = np.clip(((p[:, None, :] - a[None]) * ab[None]).sum(2) / L2[None], 0, 1)
    c = a[None] + t[..., None] * ab[None]
    return np.hypot(*(p[:, None, :] - c).transpose(2, 0, 1))

def ray_cross(o, d, polys):
    """Distancia hasta el primer borde de las superficies a lo largo de o + t·d (t > 0), o None."""
    best = None
    for P in polys:
        a, b = P, np.roll(P, -1, axis=0)
        e = b - a
        den = d[0] * e[:, 1] - d[1] * e[:, 0]
        ok = np.abs(den) > 1e-9
        w = a - o
        t = np.where(ok, (w[:, 0] * e[:, 1] - w[:, 1] * e[:, 0]) / np.where(ok, den, 1), -1)
        u = np.where(ok, (w[:, 0] * d[1] - w[:, 1] * d[0]) / np.where(ok, den, 1), -1)
        hit = ok & (t > 0) & (u >= 0) & (u <= 1)
        if hit.any():
            x = t[hit].min()
            best = x if best is None else min(best, x)
    return best

def inside(pt, P):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(P, np.roll(P, -1, axis=0)):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def medir(cid, bac, d):
    """Anchura por punto (NaN donde no hay dato), cómo se ha medido, las partes de los carriles, y el error del ajuste."""
    pts = np.asarray(d["puntos"], float)[:, :2] * d.get("escala", 1)
    gj = json.load(open(fetch(f"https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/{bac}.geojson", bac + ".geojson")))
    ll = np.asarray(gj["features"][0]["geometry"]["coordinates"], float)[:, :2]
    lat0, lon0 = ll[:, 1].mean(), ll[:, 0].mean()
    mlat, mlon = 111132.0, 111320.0 * math.cos(math.radians(lat0))
    geo = np.column_stack([(ll[:, 0] - lon0) * mlon, (ll[:, 1] - lat0) * mlat])
    rms, to_map = fit(resample(pts, 360)[0], resample(geo, 360)[0])
    pn, _ = resample(pts, N)
    m = to_map(pn)                                   # metros, x este / y norte
    tang = np.roll(m, -1, axis=0) - np.roll(m, 1, axis=0)
    tang /= np.maximum(np.hypot(*tang.T), 1e-9)[:, None]
    nrm = np.column_stack([-tang[:, 1], tang[:, 0]])
    pad = 0.0008
    bb = f"{ll[:, 1].min() - pad},{ll[:, 0].min() - pad},{ll[:, 1].max() + pad},{ll[:, 0].max() + pad}"
    q = (f'[out:json][timeout:120];(way["area:highway"]({bb});way["highway"]["width"]({bb});'
         f'way["highway"]["lanes"]({bb});way["highway"="raceway"]({bb}););out tags geom;')
    osm = json.load(open(fetch("https://overpass-api.de/api/interpreter", f"osm-{cid}.json", urllib.parse.urlencode({"data": q}).encode())))
    tomet = lambda g: np.array([[(x["lon"] - lon0) * mlon, (x["lat"] - lat0) * mlat] for x in g])
    areas, ways = [], []   # ways: (a, b, ancho, cómo, partes)
    for e in osm["elements"]:
        if "geometry" not in e: continue
        t, g = e.get("tags", {}), tomet(e["geometry"])
        if "area:highway" in t and len(g) >= 4 and np.hypot(*(g[0] - g[-1])) < 0.5:
            if t["area:highway"] not in ("traffic_island", "footway", "pedestrian", "cycleway"): areas.append(g[:-1])
            continue
        w, how, parts = (num(t.get("width")) if "width" in t else None), "width", None
        if w is None:
            r = por_carriles(t)
            if r: (w, parts), how = r, "lanes"
        if w is None or not (5 <= w <= 30) or len(g) < 2: continue
        ways.append((g[:-1], g[1:], w, how, parts))
    W = np.full(N, np.nan); how = np.array([""] * N, dtype=object); parts = [None] * N
    for i in range(N):
        cont = [P for P in areas if inside(m[i], P)]
        if cont:
            a, b = ray_cross(m[i], nrm[i], cont), ray_cross(m[i], -nrm[i], cont)
            if a is not None and b is not None and 5 <= a + b <= 30:
                W[i], how[i] = a + b, "superficie"; continue
    for kind in ("width", "lanes"):
        sel = [x for x in ways if x[3] == kind]
        if not sel: continue
        A = np.vstack([x[0] for x in sel]); B = np.vstack([x[1] for x in sel])
        wv = np.concatenate([[x[2]] * len(x[0]) for x in sel])
        pv = [x[4] for x in sel for _ in range(len(x[0]))]
        # solo vías que van en la misma dirección que la pista (no las que la cruzan)
        dirs = (B - A) / np.maximum(np.hypot(*(B - A).T), 1e-9)[:, None]
        D = seg_dist(m, A, B)
        D[np.abs(tang @ dirs.T) < 0.8] = 1e9
        for i in np.where(np.isnan(W))[0]:
            j = D[i].argmin()
            if D[i, j] < NEAR: W[i], how[i], parts[i] = wv[j], kind, pv[j]
    return W, how, parts, rms, resample(pts, N)[1]

def suavizar(W, L):
    """Suavizado circular (~40 m) para que no haya escalones entre tramos medidos de distinta forma."""
    sig = 40 / (L / N); k = np.arange(N); k = np.minimum(k, N - k); g = np.exp(-0.5 * (k / sig) ** 2); g /= g.sum()
    return np.real(np.fft.ifft(np.fft.fft(W) * np.fft.fft(g)))

if CALIBRAR:
    # Compara la calzada estimada por carriles con la anchura medida (TUMFTM) en los mismos puntos.
    X, Y = [], []
    for cid in ONLY:
        path = os.path.join(ROOT, cid + ".json")
        d = json.load(open(path, encoding="utf8"))
        real = np.asarray(d["ancho"], float)
        W, how, parts, rms, L = medir(cid, CIRCUITS[cid], d)
        sel = [i for i in range(N) if how[i] == "lanes"]
        for i in sel: X.append(parts[i]); Y.append(real[i])
        if sel:
            err = W[sel] - real[sel]
            print(f"{cid:10s} ajuste {rms:5.1f} m  {len(sel)} puntos por carriles  estimado-real: media {err.mean():+.1f} m, "
                  f"error medio {np.abs(err).mean():.1f} m")
        else: print(f"{cid:10s} ajuste {rms:5.1f} m  ningún punto por carriles")
    if X:
        X, Y = np.asarray(X, float), np.asarray(Y, float)
        for lanes in sorted(set(X[:, 0])):
            s = X[:, 0] == lanes
            print(f"   {int(lanes)} carriles: {s.sum():3d} puntos, real {np.median(Y[s]):.1f} m (mediana)  "
                  f"estimado {np.median(X[s, 0] * LANE + X[s, 1] * PARKING + X[s, 2] * BIKE + BORDE):.1f} m")
    sys.exit()

for cid in ONLY:
    bac = CIRCUITS[cid]
    path = os.path.join(ROOT, cid + ".json")
    d = json.load(open(path, encoding="utf8"))
    W, how, _, rms, L = medir(cid, bac, d)
    got = ~np.isnan(W)
    cnt = {k: int((how == k).sum()) for k in ("superficie", "width", "lanes")}
    if got.sum() < N * 0.15:
        print(f"{cid:10s} ajuste {rms:5.1f} m  muy pocos datos ({cnt}): no se escribe"); continue
    med = float(np.median(W[got]))
    W[~got] = med
    ancho = [round(float(x), 1) for x in np.clip(suavizar(W, L), 7, 22)]
    fuente = (f"OpenStreetMap (ODbL) con el trazado situado sobre bacinger/f1-circuits (error medio {rms:.1f} m): "
              f"{cnt['superficie']} de {N} puntos medidos sobre la calzada, {cnt['width']} por la anchura de la vía, "
              f"{cnt['lanes']} estimados por los carriles y lo que hay a los lados, y {N - int(got.sum())} con la mediana ({med:.1f} m)")
    txt = open(path, encoding="utf8").read()
    txt = re.sub(r',\s*"ancho"\s*:\s*\[.*?\]', "", txt, flags=re.S)
    txt = re.sub(r',\s*"anchoFuente"\s*:\s*"[^"]*"', "", txt)
    end = txt.rstrip().rfind("}")
    open(path, "w", encoding="utf8").write(txt[:end].rstrip() + f',\n  "anchoFuente":"{fuente}",\n  "ancho":{json.dumps(ancho, separators=(",", ":"))}' + "\n}\n")
    print(f"{cid:10s} ajuste {rms:5.1f} m  {cnt}  sin dato {N - int(got.sum())}  ancho {min(ancho):.1f}-{max(ancho):.1f} m (media {np.mean(ancho):.1f})")
