import re, json, sys, glob, os

D = sys.argv[1]
# orden: los nombres compuestos primero (McLaren-Mercedes, Williams-Mercedes, Haas-Ferrari...)
TEAMS = [("mclaren", "mclaren"), ("racing bulls", "racingbulls"), ("red bull racing", "redbull"), ("williams", "williams"),
         ("alpine", "alpine"), ("haas", "haas"), ("cadillac", "cadillac"), ("audi", "audi"), ("sauber", "audi"),
         ("aston martin", "astonmartin"), ("mercedes", "mercedes"), ("ferrari", "ferrari")]
Q = "'" * 3


def clean(c):
    c = re.sub(r"<ref[^>]*/>", "", c or "")
    c = re.sub(r"<ref.*?</ref>", "", c)
    c = re.sub(r"\{\{(ref|efn|refn)[^}]*\}\}", "", c, flags=re.I)
    return c.replace(Q, "").strip()


def value(c):
    """Contenido de una celda sin los atributos (style=..., align=...)."""
    c = clean(c)
    if "|" in c:
        head, rest = c.split("|", 1)
        if "=" in head and "[[" not in head and "{{" not in head:
            c = rest
    return c.strip()


def team(cell):
    t = clean(cell)
    links = re.findall(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", t)
    txt = ((links[0][1] or links[0][0]) + " " + links[0][0]).lower() if links else t.lower()
    for k, v in TEAMS:
        if k in txt:
            return v
    return txt


def drv(raw, cell):
    m = re.search(r'data-sort-value="([a-zA-Z]{3})"', raw)
    if m:
        return m.group(1).upper()
    l = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)
    name = (l.group(2) or l.group(1)) if l else cell
    name = re.sub(r"\(.*?\)", "", name).strip()
    parts = name.split()
    last = parts[-1] if parts else name
    return {"Jr.": "SAI"}.get(last, last[:3].upper())


def tsec(s):
    s = value(s)
    m = re.match(r"^(?:(\d+):)?(\d+)\.(\d+)$", s)
    return int(m.group(1) or 0) * 60 + int(m.group(2)) + float("0." + m.group(3)) if m else None


def num(c):
    v = value(c)
    m = re.search(r"\d+", v)
    return m.group(0) if m else re.sub(r"[^A-Za-z]", "", v)


def section(w, title):
    m = re.search(r"^===\s*" + title + r"\s*===\s*$", w, re.M)
    if not m:
        return None
    return w[m.end():w.find("|}", m.end())]


def rows(tab):
    out = []
    for r in tab.split("\n|-")[1:]:
        lines = [l for l in r.strip().split("\n") if l.strip()]
        if not lines or not lines[0].startswith("!"):
            continue
        head = re.sub(r"[^\w]", "", value(lines[0].lstrip("!")))
        cells = [l[1:] for l in lines[1:] if l.startswith("|")]
        out.append((head, cells, r))
    return out


res = []
for f in sorted(glob.glob(D + "/gp*.wiki")):
    w = open(f).read()
    info = {}
    for k in ["Fast_Time", "Pole_Time", "Distance_laps", "Grand Prix", "Weather", "Fast_Lap"]:
        m = re.search(r"^\|\s*" + k + r"\s*=\s*(.*)$", w, re.M)
        if m:
            info[k] = clean(m.group(1))
    gp = {"file": os.path.basename(f), "info": info, "quali": [], "race": []}
    q = section(w, "Qualifying classification")
    r = section(w, "Race classification")
    for h, c, raw in rows(q or ""):
        if len(c) < 6:
            continue
        gp["quali"].append({"pos": h, "drv": drv(raw, c[1]), "team": team(c[2]), "q1": tsec(c[3]), "q2": tsec(c[4]),
                            "q3": tsec(c[5]), "grid": num(c[6]) if len(c) > 6 else None})
    for h, c, raw in rows(r or ""):
        if len(c) < 6:
            continue
        gp["race"].append({"pos": h, "drv": drv(raw, c[1]), "team": team(c[2]), "laps": num(c[3]),
                           "time": value(c[4]), "grid": num(c[5])})
    res.append(gp)
json.dump(res, open(sys.argv[2], "w"), indent=1)
