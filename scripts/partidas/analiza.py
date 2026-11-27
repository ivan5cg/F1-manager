# Patrones en las partidas guardadas por scripts/partidas.ts (un JSON por partida): cuánto decide el coche, quién
# gana con los años, cómo cambian los coches en invierno, cada circuito, mojado y sprint, objetivos (si los hay),
# presupuesto, moral, tus pilotos y, en «crea tu equipo», en qué se gastó el techo.
#   python3 scripts/partidas/analiza.py [carpeta=scripts/partidas/base-2026-11]
import json, glob, collections, math, os, statistics as st, sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "base-2026-11")
EQ = json.load(open(os.path.join(HERE, "..", "..", "data", "equipos-2026.json")))["equipos"]
TEAM_ID = {x["nombre"]: x["id"] for x in EQ}
MOTOR = {x["id"]: x["motor"].lower().replace("red bull ford", "redbullford") for x in EQ}
runs = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(D, "*.json")))]
if not runs:
    sys.exit(f"no hay partidas en {D}")
real = [r for r in runs if r["opts"]["team"] != "propio"]
prop = [r for r in runs if r["opts"]["team"] == "propio"]
S = [(r, s) for r in runs for s in r["seasons"]]
R = [x for _, s in S for x in s["races"]]
YEARS = sorted({s["year"] for _, s in S})
tid = lambda n: TEAM_ID.get(n, "propio")
pct = lambda a, b: f"{100 * a / b:.0f} %" if b else "-"
order = lambda lv: sorted(lv, key=lambda k: -lv[k])


def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / den if den else 0


def spearman(a, b):
    ra = {k: i for i, k in enumerate(order(a))}
    rb = {k: i for i, k in enumerate(order(b))}
    n = len(a)
    return 1 - 6 * sum((ra[k] - rb[k]) ** 2 for k in a) / (n * (n * n - 1))


def head(t):
    print(f"\n== {t}")


print(f"{len(runs)} partidas ({len(real)} con equipo real, {len(prop)} de crea tu equipo), {len(S)} temporadas, {len(R)} carreras · {D}")

head("1. Cuánto decide el coche")
rho = [spearman({k: (s["levels0"][k] + s["levelsEnd"][k]) / 2 for k in s["levels0"]}, {tid(c["equipo"]): c["puntos"] for c in s["constructors"]}) for _, s in S]
print(f"  orden de coches frente a constructores (Spearman): media {st.mean(rho):.2f}, peor año {min(rho):.2f}")
cc = collections.Counter(order(s["levels0"]).index(tid(s["constructors"][0]["equipo"])) + 1 for _, s in S)
print("  campeón de constructores según el puesto de su coche al empezar:", dict(sorted(cc.items())))
wc = collections.Counter()
for _, s in S:
    o = order({k: (s["levels0"][k] + s["levelsEnd"][k]) / 2 for k in s["levels0"]})
    for x in s["races"]:
        wc[o.index(tid(x["winnerTeam"])) + 1] += 1
print("  victorias según el puesto del coche:", ", ".join(f"{k}.º {pct(v, len(R))}" for k, v in sorted(wc.items())))

head("2. Pilotos: quién gana con los años")
for y in YEARS:
    w = collections.Counter()
    for _, s in S:
        if s["year"] == y:
            w.update(s["wins"])
    tot = sum(w.values())
    print(f"  {y}: " + ", ".join(f"{k.split()[-1]} {pct(v, tot)}" for k, v in w.most_common(6)))
for y in YEARS:
    c = collections.Counter(s["champion"]["nombre"] for _, s in S if s["year"] == y)
    print(f"  campeones {y}: " + ", ".join(f"{k} {v}" for k, v in c.most_common()))
poles = collections.Counter(x["pole"] for x in R if x.get("pole"))
print("  poles:", ", ".join(f"{k.split()[-1]} {v}" for k, v in poles.most_common(6)))
k = sum(1 for _, s in S if collections.Counter(x["winner"] for x in s["races"]).most_common(1)[0][0] == s["champion"]["nombre"])
print(f"  el que más carreras gana es campeón en {k} de {len(S)}")
ch = collections.defaultdict(list)
for r in runs:
    for s0, s1 in zip(r["seasons"], r["seasons"][1:]):
        for d in s0["myDrivers"]:
            e = [x for x in s1["myDrivers"] if x["abrev"] == d["abrev"]]
            if e:
                ch[d["edad"] // 3 * 3].append(e[0]["rating"] - d["rating"])
print("  tus pilotos, cambio de valoración en un año por edad:", ", ".join(f"{a}-{a + 2} {st.mean(v):+.2f} (n={len(v)})" for a, v in sorted(ch.items())))

head("3. Los coches con los años y en invierno (solo partidas con equipo real)")
if real:
    print("  puesto medio del coche al empezar cada año:")
    print("   " + " " * 12 + "".join(f"{y:>7}" for y in YEARS))
    for t in TEAM_ID.values():
        row = []
        for y in YEARS:
            ps = [order(s["levels0"]).index(t) + 1 for r in real for s in r["seasons"] if s["year"] == y and t in s["levels0"]]
            row.append(f"{st.mean(ps):7.1f}" if ps else "      -")
        print(f"   {t:12}" + "".join(row))
a, b, mv, dl = [], [], [], []
toward = collections.defaultdict(list)
for r in runs:
    for s0, s1 in zip(r["seasons"], r["seasons"][1:]):
        m0, m1 = st.mean(s0["levelsEnd"].values()), st.mean(s1["levels0"].values())
        o0, o1 = order(s0["levelsEnd"]), order(s1["levels0"])
        for i, t in enumerate(o0):
            if t not in s1["levels0"]:
                continue
            a.append(s0["levelsEnd"][t]); b.append(s1["levels0"][t])
            mv.append(abs(i - o1.index(t)))
            rel = (s1["levels0"][t] - m1) - (s0["levelsEnd"][t] - m0)
            dl.append(rel)
            toward["1-3" if i < 3 else "4-8" if i < 8 else "9+"].append(rel)
if a:
    print(f"  nivel al acabar un año frente al del siguiente: correlación {corr(a, b):.2f}; un coche se mueve {st.mean(mv):.2f} puestos de media en invierno (máx. {max(mv)})")
    print(f"  cambio frente a la media en invierno: desviación {st.pstdev(dl):.2f}; por puesto al acabar:", ", ".join(f"{k} {st.mean(v):+.2f}" for k, v in toward.items()))
for y in YEARS:
    ss = [s for _, s in S if s["year"] == y]
    print(f"  {y}: hueco entre el mejor y el peor coche {st.mean(s['spread0'] for s in ss):.2f} al empezar, {st.mean(s['spreadEnd'] for s in ss):.2f} al acabar")

head("4. Por circuito")
C = collections.defaultdict(list)
for x in R:
    C[x["circuitId"]].append(x)
print(f"  {'circuito':12}   n  pole gana   SC  VSC  roja  abandonos  adelant.  mojado  ganadores")
for c, xs in C.items():
    n = len(xs)
    print(f"  {c:12}{n:4}  {pct(sum(x.get('pole') == x['winner'] for x in xs), n):>8} {pct(sum(bool(x.get('safety')) for x in xs), n):>5} {pct(sum(bool(x.get('vsc')) for x in xs), n):>4} {pct(sum(bool(x.get('red')) for x in xs), n):>5}"
          f" {st.mean(x['dnfs'] for x in xs):9.1f} {st.mean(x.get('passes', 0) for x in xs):9.0f} {pct(sum(x['wet'] for x in xs), n):>7} {len(set(x['winner'] for x in xs)):10}")

head("5. Mojado y sprint")
for lab, f in [("seco", lambda x: not x["wet"]), ("alguna sesión mojada", lambda x: x["wet"]), ("fin de semana normal", lambda x: not x["sprint"]), ("con sprint", lambda x: x["sprint"])]:
    xs = [x for x in R if f(x)]
    if xs:
        print(f"  {lab:22} n={len(xs):4}  gana el de la pole {pct(sum(x.get('pole') == x['winner'] for x in xs), len(xs))}, roja {pct(sum(bool(x.get('red')) for x in xs), len(xs))}, coche de seguridad {pct(sum(bool(x.get('safety')) for x in xs), len(xs))}, abandonos {st.mean(x['dnfs'] for x in xs):.2f}")

head("6. Objetivos de la directiva (partidas de antes de quitarlos)")
o = collections.defaultdict(lambda: [0, 0])
for _, s in S:
    if not s.get("objectives"):
        continue
    k = s["carRank0"]
    g = "1-2" if k <= 2 else "3-4" if k <= 4 else "5-7" if k <= 7 else "8-9" if k <= 9 else "10+"
    o[g][0] += sum(x["done"] for x in s["objectives"]); o[g][1] += len(s["objectives"])
print("  cumplidos según el puesto del coche al empezar:", ", ".join(f"{k}: {v[0]}/{v[1]} ({pct(*v)})" for k, v in sorted(o.items())) if o else "(no hay)")

head("7. Presupuesto, moral y tus pilotos")
rows = [(s1["budget"], s1["carRank0"] - s1["carRankEnd"]) for r in runs for s1 in r["seasons"][1:]]
for lo, hi in [(0, 35), (35, 45), (45, 55), (55, 999)]:
    xs = [g for bdg, g in rows if lo <= bdg < hi]
    if xs:
        print(f"  presupuesto {lo}-{hi if hi < 999 else '…'} M: {len(xs)} temporadas, puestos que gana el coche durante el año {st.mean(xs):+.1f}")
d = [(a["moral"] - b["moral"], a["puntos"] - b["puntos"]) for _, s in S for a, b in [s["myDrivers"][:2]] if len(s["myDrivers"]) >= 2]
if len(d) > 2:
    print(f"  diferencia de moral entre tus pilotos frente a la de puntos: correlación {corr([x for x, _ in d], [y for _, y in d]):.2f}")
g = collections.defaultdict(list)
for x in R:
    for m in x["mine"]:
        if m["status"] == "fin" and m.get("grid"):
            g[(m["grid"] - 1) // 5].append(m["grid"] - m["pos"])
print("  tus pilotos que acaban, puestos ganados según donde salen:", ", ".join(f"{5 * k + 1}-{5 * k + 5}: {st.mean(v):+.1f}" for k, v in sorted(g.items())))
mo = collections.defaultdict(lambda: [0, 0])
for r in runs:
    eng = r["opts"]["spec"]["motor"] if r["opts"]["team"] == "propio" else MOTOR[r["opts"]["team"]]
    for x in (x for s in r["seasons"] for x in s["races"]):
        for m in x["mine"]:
            mo[eng][1] += 1
            mo[eng][0] += m["status"] != "fin" and (m.get("reason") or "").startswith("avería")
print("  averías de tus pilotos por motor:", ", ".join(f"{k} {v[0]}/{v[1]} ({100 * v[0] / v[1]:.1f} %)" for k, v in mo.items()))
if real:
    print("  primer año con el mismo coche, puesto en constructores llevándolo tú frente a llevándolo la IA:")
    for r in real:
        t = r["opts"]["team"]
        me = [i + 1 for i, c in enumerate(r["seasons"][0]["constructors"]) if tid(c["equipo"]) == t][0]
        ai = [[i + 1 for i, c in enumerate(r2["seasons"][0]["constructors"]) if tid(c["equipo"]) == t][0] for r2 in runs if r2 is not r and r2["opts"]["team"] != "propio"]
        print(f"    {t:12} tú {me}.º · la IA {st.mean(ai):.1f}.º" if ai else f"    {t:12} tú {me}.º")

if prop:
    head("8. Crea tu equipo: en qué se gastó el techo")
    print(f"  {'semilla':8}{'gastado':>8}{'presup.':>8}{'mejor piloto':>13}{'coche 1.er año':>15}{'coche último':>13}{'constr. 1.º':>12}{'constr. último':>15}{'puntos':>8}")
    for r in sorted(prop, key=lambda r: -sum(s["myPoints"] for s in r["seasons"])):
        s0, s3 = r["seasons"][0], r["seasons"][-1]
        print(f"  {r['opts']['seed']:<8}{s0['custom']['spentCap']:8.0f}{s0['budget']:8}{max(d['rating'] for d in s0['myDrivers']):13.1f}{s0['carRank0']:15}{s3['carRankEnd']:13}{s0['myPos']:12}{s3['myPos']:15}{sum(s['myPoints'] for s in r['seasons']):8}")
