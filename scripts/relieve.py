#!/usr/bin/env python3
"""Altitud y anchura reales de cada circuito, guardadas en data/circuitos/*.json.

  python3 scripts/relieve.py [carpeta-de-caché]

Para cada circuito:
  1. Sitúa el trazado del juego (metros locales) sobre el mapa: lo ajusta al trazado
     georreferenciado de bacinger/f1-circuits (giro, traslado y escala; prueba también
     el espejo y el sentido contrario, y avisa si alguno encaja mejor).
  2. Lee la altitud en 256 puntos de la vuelta de las teselas «terrarium» de
     Mapzen/AWS Terrain Tiles y la suaviza (el modelo incluye árboles y edificios).
  3. Si el trazado viene de TUMFTM/racetrack-database, guarda también la anchura.
  4. Anota el sentido de giro medido y el lado de los boxes.

Campos que escribe: "relieve" (metros sobre el punto más bajo), "ancho" (metros),
"sentido" y "boxes.lado". La simulación no los usa: son para dibujar.
"""
import io, json, math, os, re, sys, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "circuitos")
CACHE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/relieve-cache"
os.makedirs(CACHE, exist_ok=True)
N = 256      # muestras por vuelta que se guardan
ZOOM = 14
SUAVE = {"singapur": 600}  # metros de suavizado; por defecto 150

# id del juego -> (bacinger, TUM, sentido real, lado real de los boxes)
CIRCUITS = {
    "spa": ("be-1925", "Spa", "horario", "derecha"),
    "suzuka": ("jp-1962", "Suzuka", "horario", "derecha"),
    "monaco": ("mc-1929", None, "horario", "derecha"),
    "interlagos": ("br-1940", "SaoPaulo", "antihorario", "izquierda"),
    "silverstone": ("gb-1948", "Silverstone", "horario", "derecha"),
    "monza": ("it-1922", "Monza", "horario", "derecha"),
    "bahrein": ("bh-2002", "Sakhir", "horario", "derecha"),
    "sepang": ("my-1999", "Sepang", "horario", "derecha"),
    "singapur": ("sg-2008", None, "antihorario", "izquierda"),
}

def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    return path

def resample(pts, n):
    """Polilínea cerrada -> n puntos a distancia constante."""
    p = np.asarray(pts, float)
    if np.hypot(*(p[0] - p[-1])) < 1e-6: p = p[:-1]
    q = np.vstack([p, p[:1]])
    d = np.hypot(*np.diff(q, axis=0).T)
    s = np.concatenate([[0], np.cumsum(d)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.column_stack([np.interp(t, s, q[:, 0]), np.interp(t, s, q[:, 1])]), s[-1]

def fit(p, q):
    """Mejor giro+escala+traslado de p (juego) a q (mapa), probando desfase, sentido y espejo."""
    M = len(p)
    pc, qc = p.mean(0), q.mean(0)
    zp = (p[:, 0] - pc[0]) + 1j * (p[:, 1] - pc[1])
    zq = (q[:, 0] - qc[0]) + 1j * (q[:, 1] - qc[1])
    best = None
    for mirror in (False, True):
        for rev in (False, True):
            a0 = np.conj(zp) if mirror else zp
            b0 = zq[::-1] if rev else zq
            for k in range(M):
                b = np.roll(b0, k)
                a = np.vdot(a0, b) / np.vdot(a0, a0)   # sum(conj(a0)*b)/sum|a0|^2
                rms = math.sqrt(np.mean(np.abs(a * a0 - b) ** 2))
                if best is None or rms < best[0]: best = (rms, a, mirror, rev)
    rms, a, mirror, rev = best
    def to_map(xy):
        z = (xy[:, 0] - pc[0]) + 1j * (xy[:, 1] - pc[1])
        if mirror: z = np.conj(z)
        w = a * z
        return np.column_stack([w.real + qc[0], w.imag + qc[1]])
    return rms, abs(a), math.degrees(np.angle(a)), mirror, rev, to_map

_tiles = {}
def elevation(lat, lon):
    n = 2 ** ZOOM
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    def px(tx, ty, i, j):
        key = (tx, ty)
        if key not in _tiles:
            path = fetch(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png", f"t{ZOOM}-{tx}-{ty}.png")
            a = np.asarray(Image.open(path).convert("RGB"), float)
            _tiles[key] = a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768
        return _tiles[key][j, i]
    gx, gy = x * 256 - 0.5, y * 256 - 0.5
    i0, j0 = math.floor(gx), math.floor(gy)
    fx, fy = gx - i0, gy - j0
    def at(i, j): return px(i // 256, j // 256, i % 256, j % 256)
    return (at(i0, j0) * (1 - fx) + at(i0 + 1, j0) * fx) * (1 - fy) + (at(i0, j0 + 1) * (1 - fx) + at(i0 + 1, j0 + 1) * fx) * fy

def smooth(v, sigma):
    """Suavizado gaussiano circular (sigma en muestras)."""
    n = len(v); k = np.arange(n); k = np.minimum(k, n - k)
    g = np.exp(-0.5 * (k / sigma) ** 2); g /= g.sum()
    return np.real(np.fft.ifft(np.fft.fft(v) * np.fft.fft(g)))

def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)

def write_fields(path, relieve, ancho, sentido, lado, nota):
    txt = open(path, encoding="utf8").read()
    txt = re.sub(r',\s*"relieve"\s*:\s*\{.*?\}', "", txt, flags=re.S)
    txt = re.sub(r',\s*"ancho"\s*:\s*\[.*?\]', "", txt, flags=re.S)
    txt = re.sub(r',\s*"sentido"\s*:\s*"[^"]*"', "", txt)
    txt = re.sub(r'"lado"\s*:\s*"[^"]*"\s*,\s*', "", txt)
    txt = re.sub(r'("boxes"\s*:\s*\{)', lambda m: f'{m.group(1)}"lado":"{lado}",', txt, count=1)
    extra = f',\n  "sentido":"{sentido}",\n  "relieve":{{"fuente":"{nota}","m":{json.dumps(relieve, separators=(",", ":"))}}}'
    if ancho: extra += f',\n  "ancho":{json.dumps(ancho, separators=(",", ":"))}'
    end = txt.rstrip().rfind("}")
    open(path, "w", encoding="utf8").write(txt[:end].rstrip() + extra + "\n}\n")

for cid, (bac, tum, sentido_real, lado) in CIRCUITS.items():
    path = os.path.join(ROOT, cid + ".json")
    d = json.load(open(path, encoding="utf8"))
    esc = d.get("escala", 1)
    pts = np.asarray(d["puntos"], float)[:, :2] * esc
    gj = json.load(open(fetch(f"https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/{bac}.geojson", bac + ".geojson")))
    ll = np.asarray(gj["features"][0]["geometry"]["coordinates"], float)[:, :2]
    lat0, lon0 = ll[:, 1].mean(), ll[:, 0].mean()
    mlat, mlon = 111132.0, 111320.0 * math.cos(math.radians(lat0))
    geo = np.column_stack([(ll[:, 0] - lon0) * mlon, (ll[:, 1] - lat0) * mlat])
    p, Lp = resample(pts, 360)
    q, Lq = resample(geo, 360)
    rms, scale, rot, mirror, rev, to_map = fit(p, q)
    # altitud en N puntos de la vuelta del juego
    pn, _ = resample(pts, N)
    m = to_map(pn)
    h = np.array([elevation(lat0 + y / mlat, lon0 + x / mlon) for x, y in m])
    raw_range = h.max() - h.min()
    # en ciudad llana el modelo recoge los edificios: se suaviza mucho más
    hs = smooth(h, SUAVE.get(cid, 150) / (Lp / N))
    hs -= hs.min()
    # sentido real: el del trazado del juego una vez colocado sobre el mapa (x este, y norte)
    cw = signed_area(m) < 0
    medido = "horario" if cw else "antihorario"
    ancho = None
    if tum:
        rows = [l.split(",") for l in open(fetch(f"https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/{tum}.csv", tum + ".csv")) if not l.startswith("#")]
        t = np.asarray(rows, float)
        same = len(t) == len(pts) and np.abs(t[:, :2] - pts).max() < 0.2
        if same:
            w = t[:, 2] + t[:, 3]
            wq = np.column_stack([np.arange(len(w)), w])
            seg = np.hypot(*np.diff(np.vstack([pts, pts[:1]]), axis=0).T)
            s = np.concatenate([[0], np.cumsum(seg)])
            ancho = [round(float(x), 1) for x in np.interp(np.linspace(0, s[-1], N, endpoint=False), s, np.concatenate([w, w[:1]]))]
        else:
            print(f"   ! {cid}: los puntos no coinciden con {tum}.csv ({len(t)} vs {len(pts)}); sin anchura")
    nota = f"Mapzen/AWS Terrain Tiles (terrarium, z14), suavizado {SUAVE.get(cid, 150)} m; trazado situado con bacinger/f1-circuits"
    write_fields(path, [round(float(x), 1) for x in hs], ancho, medido, lado, nota)
    flags = ("  ESPEJO" if mirror else "") + ("" if medido == sentido_real else f"  ! SENTIDO {medido}, se esperaba {sentido_real}")
    print(f"{cid:12s} ajuste {rms:5.1f} m  escala {scale:.3f}  giro {rot:7.1f}°  largo juego {Lp:6.0f} / mapa {Lq:6.0f} m  desnivel {hs.max():5.1f} m (bruto {raw_range:5.1f})  {medido}  boxes {lado}"
          + (f"  ancho {min(ancho):.1f}-{max(ancho):.1f} m" if ancho else "  sin anchura") + flags)
