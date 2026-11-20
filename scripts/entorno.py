#!/usr/bin/env python3
"""Altitud del terreno alrededor de los circuitos urbanos y semiurbanos (mar, puertos y edificios).

  python3 scripts/entorno.py [carpeta-de-caché] [id ...] [--semiurbano]

Sitúa el trazado del juego sobre el mapa igual que scripts/relieve.py y lee en una rejilla
de N × N puntos (en coordenadas del juego, centrada en el circuito) la altitud de las teselas
«terrarium» de Mapzen/AWS Terrain Tiles. El mar sale a 0 m o por debajo.

Escribe el resultado en public/assets/env-tracks/<id>.json (cargado bajo demanda en el 3D)
con "tipo": "urbano" (o "semiurbano" con --semiurbano), "x0", "y0", "paso", "n", "h".
Si el circuito es urbano y su JSON tenía "entorno" incrustado, lo sustituye por "urbano": true.
La simulación no lee este archivo: solo usa "urbano" en el JSON del circuito.
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
ENV_DIR = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "public", "assets", "env-tracks")

N = 72
SEA = {"baku": -27.0}
args = [a for a in sys.argv[2:] if not a.startswith("--")]
tipo = "semiurbano" if "--semiurbano" in sys.argv[2:] else "urbano"
os.makedirs(ENV_DIR, exist_ok=True)
# python3 scripts/entorno.py <caché> <id> ... [--semiurbano]: solo esos (por defecto, los urbanos)
for cid in (args or ("monaco", "singapur", "baku", "lasvegas")):
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
    val = {"fuente": "Mapzen/AWS Terrain Tiles (terrarium, z14) con el trazado situado con bacinger/f1-circuits",
           "tipo": tipo, "x0": round(float(x0), 1), "y0": round(float(y0), 1), "paso": round(float(paso), 2), "n": N, "h": hh}
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
    print(f"{cid}: ajuste {rms:.1f} m, rejilla {N}×{N} cada {paso:.0f} m, mar {np.mean(a <= 0) * 100:.0f} %, máx {a.max()} m")
    # mapa en texto (norte del juego arriba) con la pista encima
    tr = np.floor((pts - [x0, y0]) / paso + 0.5).astype(int)
    rows = [["~" if v <= 0 else "." if v < 10 else ":" if v < 40 else "#" for v in a[j]] for j in range(N)]
    for i, j in tr[::3]:
        if 0 <= i < N and 0 <= j < N: rows[j][i] = "o"
    for j in range(N - 1, -1, -2): print("".join(rows[j]))
