#!/usr/bin/env python3
"""Altitud del terreno alrededor de los circuitos urbanos (dónde hay mar y cómo sube la ciudad).

  python3 scripts/entorno.py [carpeta-de-caché] [id ...]

Sitúa el trazado del juego sobre el mapa igual que scripts/relieve.py y lee en una rejilla
de N × N puntos (en coordenadas del juego, centrada en el circuito) la altitud de las teselas
«terrarium» de Mapzen/AWS Terrain Tiles. El mar sale a 0 m o por debajo.

Campo que escribe: "entorno": {"x0", "y0", "paso", "n", "h": [...]} con la altitud en metros
(fila a fila, de y0 hacia arriba). La simulación no lo usa: es para dibujar el mapa 3D.
"""
import json, math, os, re, sys
import numpy as np
# las funciones de scripts/relieve.py (todo menos su bucle final)
lib_path = os.path.join(os.path.dirname(__file__), "relieve.py")
src = open(lib_path, encoding="utf8").read()
lib = src[: src.index("for cid, (bac, tum, sentido_real, lado) in CIRCUITS.items():")]
g = {"__file__": lib_path}
exec(compile(lib, lib_path, "exec"), g)
ROOT, fetch, resample, fit, elevation, CIRCUITS = g["ROOT"], g["fetch"], g["resample"], g["fit"], g["elevation"], g["CIRCUITS"]

N = 72
SEA = {"baku": -27.0}
# python3 scripts/entorno.py <caché> <id> ...: solo esos (por defecto, los urbanos)
for cid in (sys.argv[2:] or ("monaco", "singapur", "baku", "lasvegas")):
    bac = CIRCUITS[cid][0]
    path = os.path.join(ROOT, cid + ".json")
    d = json.load(open(path, encoding="utf8"))
    pts = np.asarray(d["puntos"], float)[:, :2] * d.get("escala", 1)
    gj = json.load(open(fetch(f"https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/{bac}.geojson", bac + ".geojson")))
    ll = np.asarray(gj["features"][0]["geometry"]["coordinates"], float)[:, :2]
    lat0, lon0 = ll[:, 1].mean(), ll[:, 0].mean()
    mlat, mlon = 111132.0, 111320.0 * math.cos(math.radians(lat0))
    geo = np.column_stack([(ll[:, 0] - lon0) * mlon, (ll[:, 1] - lat0) * mlat])
    p, _ = resample(pts, 360); q, _ = resample(geo, 360)
    rms, scale, rot, mirror, rev, to_map = fit(p, q)
    lo, hi = pts.min(0), pts.max(0)
    c, E = (lo + hi) / 2, (hi - lo).max()
    R = E * 0.75 + 450
    paso = 2 * R / (N - 1)
    x0, y0 = c[0] - R, c[1] - R
    grid = np.array([[x0 + i * paso, y0 + j * paso] for j in range(N) for i in range(N)])
    m = to_map(grid)
    h = np.array([elevation(lat0 + y / mlat, lon0 + x / mlon) for x, y in m])
    # el mar del juego está a 0 m: el Caspio está a unos 27 m por debajo (así sale en las teselas) del nivel del mar
    h = h - SEA.get(cid, 0.0)
    hh = [int(round(max(-5.0, float(v)))) for v in h]
    txt = open(path, encoding="utf8").read()
    txt = re.sub(r',\s*"entorno"\s*:\s*\{.*?\}', "", txt, flags=re.S)
    end = txt.rstrip().rfind("}")
    val = {"fuente": "Mapzen/AWS Terrain Tiles (terrarium, z14) con el trazado situado con bacinger/f1-circuits",
           "x0": round(float(x0), 1), "y0": round(float(y0), 1), "paso": round(float(paso), 2), "n": N, "h": hh}
    open(path, "w", encoding="utf8").write(txt[:end].rstrip() + ',\n  "entorno":' + json.dumps(val, separators=(",", ":"), ensure_ascii=False) + "\n}\n")
    a = np.array(hh).reshape(N, N)
    print(f"{cid}: ajuste {rms:.1f} m, rejilla {N}×{N} cada {paso:.0f} m, mar {np.mean(a <= 0) * 100:.0f} %, máx {a.max()} m")
    # mapa en texto (norte del juego arriba) con la pista encima
    tr = np.floor((pts - [x0, y0]) / paso + 0.5).astype(int)
    rows = [["~" if v <= 0 else "." if v < 10 else ":" if v < 40 else "#" for v in a[j]] for j in range(N)]
    for i, j in tr[::3]:
        if 0 <= i < N and 0 <= j < N: rows[j][i] = "o"
    for j in range(N - 1, -1, -2): print("".join(rows[j]))
