#!/usr/bin/env python3
"""Anchura real de los circuitos cuyo trazado del juego no viene de TUMFTM/racetrack-database.

  python3 scripts/anchos.py [carpeta-de-caché] [id ...]

relieve.py solo guarda la anchura si los puntos del juego son los mismos que los de TUM. Aquí, para los circuitos
con trazado de bacinger/f1-circuits que también están en TUM, se encaja la línea central de TUM sobre la del juego
(giro, traslado y escala, probando desfase, sentido y espejo, como en relieve.py) y a cada uno de los 256 puntos de
la vuelta del juego se le da la anchura del punto de TUM más cercano.

Escribe "ancho" (metros, 256 puntos) y "anchoFuente". La simulación no lo usa: es para dibujar.
"""
import json, math, os, re, sys, urllib.request
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "circuitos")
CACHE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/relieve-cache"
os.makedirs(CACHE, exist_ok=True)
N = 256
# id del juego -> pista de TUM
CIRCUITS = {"melbourne": "Melbourne", "yasmarina": "YasMarina"}
ONLY = sys.argv[2:]
FAR = 15  # m: más lejos que esto del trazado de TUM, el tramo no es el mismo

def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
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
    """Mejor giro+escala+traslado de p (juego) a q (TUM), probando desfase, sentido y espejo."""
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
    def to_tum(xy):
        z = (xy[:, 0] - pc[0]) + 1j * (xy[:, 1] - pc[1])
        if mirror: z = np.conj(z)
        w = a * z
        return np.column_stack([w.real + qc[0], w.imag + qc[1]])
    return rms, abs(a), to_tum

for cid, tum in CIRCUITS.items():
    if ONLY and cid not in ONLY: continue
    path = os.path.join(ROOT, cid + ".json")
    d = json.load(open(path, encoding="utf8"))
    pts = np.asarray(d["puntos"], float)[:, :2] * d.get("escala", 1)
    rows = [l.split(",") for l in open(fetch(f"https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/{tum}.csv", tum + ".csv")) if not l.startswith("#")]
    t = np.asarray(rows, float)
    rms, scale, to_tum = fit(resample(pts, 360)[0], resample(t[:, :2], 360)[0])
    # los 256 puntos de la vuelta del juego (los mismos que usa relieve.py), llevados al sistema de TUM
    pn, _ = resample(pts, N)
    m = to_tum(pn)
    dist = np.hypot(m[:, None, 0] - t[None, :, 0], m[:, None, 1] - t[None, :, 1])
    near = dist.argmin(1)
    w = t[near, 2] + t[near, 3]
    off = dist[np.arange(N), near]
    # donde el trazado de TUM es otro (Yas Marina antes de 2021), esa anchura no es de este tramo: la mediana del
    # circuito, con una transición suave para que no haya escalones
    far = off > FAR
    if far.any():
        k = np.clip((off - FAR) / 10, 0, 1)
        w = w * (1 - k) + np.median(w[~far]) * k
    ancho = [round(float(x), 1) for x in w]
    txt = open(path, encoding="utf8").read()
    txt = re.sub(r',\s*"ancho"\s*:\s*\[.*?\]', "", txt, flags=re.S)
    txt = re.sub(r',\s*"anchoFuente"\s*:\s*"[^"]*"', "", txt)
    fuente = f"TUMFTM/racetrack-database (LGPL-3.0), {tum}.csv, encajado sobre el trazado del juego (error medio {rms:.1f} m{f'; {int(far.sum())} de {N} puntos sin tramo equivalente, con la mediana' if far.any() else ''})"
    end = txt.rstrip().rfind("}")
    open(path, "w", encoding="utf8").write(txt[:end].rstrip() + f',\n  "anchoFuente":"{fuente}",\n  "ancho":{json.dumps(ancho, separators=(",", ":"))}' + "\n}\n")
    print(f"{cid:12s} ajuste {rms:5.1f} m  escala {scale:.3f}  distancia al punto de TUM: media {off.mean():.1f} m, máx {off.max():.1f} m  ancho {min(ancho):.1f}-{max(ancho):.1f} m (media {np.mean(ancho):.1f})  sin tramo equivalente: {int(far.sum())}")
