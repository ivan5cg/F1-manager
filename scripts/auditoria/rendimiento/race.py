import json, re, sys, statistics as st
D = sys.argv[1] if len(sys.argv) > 1 else "scripts/auditoria/rendimiento/datos"
R = json.load(open(D + "/res2026.json"))
def ts(s):
    m = re.match(r"^\+?(?:(\d+):)?(\d+)\.(\d+)$", (s or "").strip())
    if not m: return None
    return int(m.group(1) or 0) * 60 + int(m.group(2)) + float("0." + m.group(3))
def tl(s):
    m = re.match(r"^(\d+):(\d+):(\d+)\.(\d+)$", s.strip())
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + float("0." + m.group(4)) if m else None
rq, rr = {}, {}
for r, g in enumerate(R, 1):
    if r < 13: continue
    win = g["race"][0]; T = tl(win["time"]); L = int(win["laps"]); lap = T / L
    tot = {}
    for x in g["race"]:
        if not x["pos"].isdigit(): continue
        if x is win: t = T
        elif "lap" in x["time"]:
            n = int(re.search(r"\d+", x["time"]).group(0)); t = T + n * lap
        else:
            gp = ts(x["time"]);
            if gp is None: continue
            t = T + gp
        tot[x["team"]] = min(tot.get(x["team"], 9e9), t)
    best = {}
    for x in g["quali"]:
        v = [z for z in (x["q1"], x["q2"], x["q3"]) if z]
        if v: best[x["team"]] = min(best.get(x["team"], 9e9), min(v))
    if "mercedes" not in tot or "mercedes" not in best: continue
    for t in tot:
        rr.setdefault(t, []).append((r, 100 * (tot[t] / tot["mercedes"] - 1)))
    if r != 20:
        for t in best:
            rq.setdefault(t, []).append((r, 100 * (best[t] / best["mercedes"] - 1)))
print(f"{'equipo':12s} {'clasif.':>8s} {'carrera':>8s}  (mediana GP 13-21, % frente a Mercedes; carrera = tiempo total del mejor coche)")
out = {}
for t in sorted(rq, key=lambda t: st.median(v for _, v in rq[t])):
    q = st.median(v for _, v in rq[t]); c = st.median(v for _, v in rr.get(t, [(0, float('nan'))]))
    out[t] = {"q": q, "race": c}
    print(f"{t:12s} {q:8.2f} {c:8.2f}   carreras: {' '.join(f'{v:.1f}' for _, v in rr.get(t, []))}")
json.dump(out, open(D + "/carrera.json", "w"), indent=1)
