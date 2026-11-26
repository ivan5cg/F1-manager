"""Ajuste del rendimiento de los coches de 2026 por tipo de circuito.

Para cada clasificación seca y cada equipo: d = (mejor vuelta del equipo / mejor de Mercedes − 1) en % de la vuelta,
menos lo que pone el piloto (ritmo del simulador, 0,07 % de agarre por punto). Modelo (todo en % de la vuelta):
  d = Σ_b (L_fase + o_b) · s_b + p_motor · pw
  s_b = s por 1 % de agarre en curvas lentas / medias / rápidas, dividido por la vuelta (del modelo de pista del juego)
  pw  = s por 1 % de potencia / vuelta
  L_fase: nivel del coche (déficit de agarre, %) en las carreras 1-12 y 13-21; o_b: carácter (déficit extra por tipo de
  curva, suma ponderada cero); p_motor: déficit de potencia (%) por fabricante (Mercedes = 0).
Mínimos cuadrados con un poco de cresta en o_b y p (se tira hacia cero lo que los datos no sostienen).
"""
import json, sys, re
import numpy as np

D = sys.argv[1] if len(sys.argv) > 1 else "scripts/auditoria/rendimiento/datos"
R = json.load(open(D + "/res2026.json"))
SENS = json.load(open(D + "/sens.json"))
# ritmo de los pilotos (para descontar lo que pone el piloto); al reajustar, el de antes de cambiar los coches
TEAMS = json.load(open("data/equipos-2026.json"))["equipos"]
RITMO = {p["abrev"]: p["ritmo"] for t in TEAMS for p in t["pilotos"]}
TRACKS = ["melbourne", "shanghai", "suzuka", "miami", "montreal", "monaco", "barcelona", "spielberg", "silverstone", "spa",
          "hungaroring", "zandvoort", "monza", "madrid", "baku", "sepang", "singapur", "austin", "mexico", "interlagos", "lasvegas"]
WET_Q = {20}  # São Paulo: clasificación mojada
ENGINE = {"mercedes": "mercedes", "mclaren": "mercedes", "williams": "mercedes", "alpine": "mercedes", "ferrari": "ferrari",
          "haas": "ferrari", "cadillac": "ferrari", "redbull": "rbford", "racingbulls": "rbford", "astonmartin": "honda", "audi": "audi"}
ENG = ["ferrari", "rbford", "honda", "audi"]
TEAM_IDS = [t for t in ENGINE if t != "mercedes"]
DRV_FIX = {"HÜL": "HUL", "PÉR": "PER", "CÂM": "CAM"}


def ts(s):
    m = re.match(r"^(?:(\d+):)?(\d+)\.(\d+)", (s or "").strip())
    return int(m.group(1) or 0) * 60 + int(m.group(2)) + float("0." + m.group(3)) if m else None


obs = []  # (team, round, d_pct, s_vec(3), pw)
for r, g in enumerate(R, 1):
    if r in WET_Q:
        continue
    tr = SENS[TRACKS[r - 1]]
    lap = tr["lap"]
    s = np.array([tr["slow"], tr["med"], tr["fast"]]) / lap * 100  # % de vuelta por 1 % de agarre
    pw = tr["power"] / lap * 100
    # mejor vuelta de cada equipo en la última parte a la que llegó, y la de Mercedes en esa misma parte: así no se le
    # carga al coche la evolución de la pista (el que cae en Q1 hizo su vuelta con la pista más verde)
    best, part = {}, {}
    for x in g["quali"]:
        d = DRV_FIX.get(x["drv"], x["drv"])
        for k, v in ((3, x["q3"]), (2, x["q2"]), (1, x["q1"])):
            if v:
                t = x["team"]
                if t not in part or k > part[t] or (k == part[t] and v < best[t][0]):
                    part[t] = k; best[t] = (v, d)
                break
    mer = {}
    for x in g["quali"]:
        if x["team"] != "mercedes": continue
        for k, v in ((1, x["q1"]), (2, x["q2"]), (3, x["q3"])):
            if v and (k not in mer or v < mer[k][0]): mer[k] = (v, DRV_FIX.get(x["drv"], x["drv"]))
    if not mer:
        continue
    for t in TEAM_IDS:
        if t not in best:
            continue
        b, d = best[t]
        k = part[t]
        while k not in mer and k > 1: k -= 1
        if k not in mer: continue
        bm, dm = mer[k]
        dobs = (b / bm - 1) * 100
        drvfix = (RITMO.get(dm, 85) - RITMO.get(d, 85)) * 0.07 * s.sum()  # lo que el piloto explica
        car = dobs - drvfix
        if car > 6:  # vuelta rota / sin tiempo representativo
            continue
        obs.append((t, r, car, s, pw))

# incógnitas: por equipo [L1, L2, os, om, of]; por motor p
nT = len(TEAM_IDS)
idx = {t: i * 5 for i, t in enumerate(TEAM_IDS)}
eng0 = nT * 5
N = eng0 + len(ENG)
rows, y = [], []
for t, r, car, s, pw in obs:
    a = np.zeros(N)
    k = idx[t]
    a[k + (0 if r <= 12 else 1)] = s.sum()
    a[k + 2:k + 5] = s
    e = ENGINE[t]
    if e in ENG:
        a[eng0 + ENG.index(e)] = pw
    rows.append(a)
    y.append(car)
A = np.array(rows)
y = np.array(y)
# cresta: carácter y motor hacia 0; y el carácter con suma ponderada cero (mismo reparto medio de curvas)
share = np.mean([o[3] for o in obs], axis=0)
share = share / share.sum()
reg_rows, reg_y = [], []
LAM_O, LAM_P, LAM_SUM = 0.5, 0.6, 5.0
# referencia para la potencia: el déficit que ya tiene el juego (potencia del motor × 0,6 × TEAM_SPREAD frente a Mercedes)
P0 = {"ferrari": (1.2 - 0.8) * 0.6 * 2.6, "rbford": (1.2 - 0.5) * 0.6 * 2.6, "honda": (1.2 + 1.2) * 0.6 * 2.6, "audi": 1.2 * 0.6 * 2.6}
for t in TEAM_IDS:
    k = idx[t]
    for b in range(3):
        a = np.zeros(N); a[k + 2 + b] = LAM_O; reg_rows.append(a); reg_y.append(0)
    a = np.zeros(N); a[k + 2:k + 5] = share * LAM_SUM; reg_rows.append(a); reg_y.append(0)
for j in range(len(ENG)):
    a = np.zeros(N); a[eng0 + j] = LAM_P; reg_rows.append(a); reg_y.append(LAM_P * P0[ENG[j]])
AA = np.vstack([A, np.array(reg_rows)])
yy = np.concatenate([y, np.array(reg_y)])
x, *_ = np.linalg.lstsq(AA, yy, rcond=None)
pred = A @ x
res = y - pred
print(f"observaciones {len(y)} · error medio cuadrático {np.sqrt(np.mean(res**2)):.3f} % de vuelta (sin modelo: {np.sqrt(np.mean((y - y.mean())**2)):.3f})")
out = {"teams": {}, "engines": {"mercedes": 0.0}}
for j, e in enumerate(ENG):
    out["engines"][e] = float(x[eng0 + j])
print("potencia (déficit %, frente a Mercedes):", {e: round(v, 2) for e, v in out["engines"].items()})
print(f"{'equipo':12s} {'L 1-12':>7s} {'L 13-21':>7s} {'lentas':>7s} {'medias':>7s} {'rápidas':>7s}  err")
for t in TEAM_IDS:
    k = idx[t]
    v = x[k:k + 5]
    er = np.sqrt(np.mean([res[i] ** 2 for i, o in enumerate(obs) if o[0] == t]))
    out["teams"][t] = {"L1": float(v[0]), "L2": float(v[1]), "o": [float(z) for z in v[2:5]], "rmse": float(er)}
    print(f"{t:12s} {v[0]:7.2f} {v[1]:7.2f} {v[2]:7.2f} {v[3]:7.2f} {v[4]:7.2f}  {er:.2f}")
json.dump(out, open(D + "/fit.json", "w"), indent=1)
