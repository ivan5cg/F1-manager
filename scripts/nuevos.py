#!/usr/bin/env python3
"""Crea los circuitos del calendario completo de 2026 que faltaban (data/circuitos/<id>.json).

  python3 scripts/nuevos.py [carpeta-de-caché] [id ...]

Para cada circuito escribe el trazado y los datos de carrera. El trazado sale de TUMFTM/racetrack-database (línea
central en metros, como los demás circuitos de TUM) o, si TUM no lo tiene, de bacinger/f1-circuits (GeoJSON en
grados, convertido a metros y escalado a la longitud real). No toca los ficheros que ya existen salvo que se le
diga su id. Después hay que pasar scripts/relieve.py (relieve, anchura, sentido y lado de los boxes), en los urbanos
scripts/entorno.py, y calibrar el umbral de adelantamiento con scripts/calibra.ts.

Las poles son las reales de 2026 (clasificación de cada gran premio). Donde aún no se ha corrido (Las Vegas, Catar y
Abu Dabi) es una estimación: la pole anterior por POLE_2026, lo que han perdido de mediana los coches de 2026 en los
circuitos con pole de 2025 y de 2026. Los adelantamientos por carrera son una estimación del juego y lo dicen en su
campo «fuente».
"""
import json, math, os, sys, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "circuitos")
CACHE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/relieve-cache"
ONLY = sys.argv[2:]
os.makedirs(CACHE, exist_ok=True)

# pole de 2026 / pole de 2025 en los 17 circuitos con las dos: de 1,012 (México) a 1,046 (Melbourne), mediana ~1,027
POLE_2026 = 1.027

NORMAL = {"fp1": "V 13:30", "fp2": "V 17:00", "fp3": "S 12:30", "q": "S 16:00", "carrera": "D 15:00"}
SPRINT = {"fp1": "V 12:30", "sq": "V 16:30", "sprint": "S 12:00", "q": "S 16:00", "carrera": "D 15:00"}

def clima(lat, mx, mn, disp, sol, viento, peq, seco, chub, frente, llov, tarde, fuente):
    return {"latitud": lat, "maxima": mx, "minima": mn, "dispersion": disp, "sol": sol, "viento": viento, "pequenas": peq,
            "pesos": {"seco": seco, "chubascos": chub, "frente": frente, "llovizna": llov}, "tardeConvectiva": tarde, "fuente": fuente}

def adel(n, nota="estimación del juego: no se encontró una media fiable de adelantamientos por carrera"):
    return {"objetivo": n, "umbral": 1.6, "fuente": nota}

# id: datos. «tum»: nombre del CSV de TUM; «bac»: id de bacinger; «largo»: longitud real (m) para escalar bacinger.
# pole26: pole real de 2026 (s); pole25: la anterior, para estimarla donde aún no se ha corrido.
C = {
 "melbourne": dict(bac="au-1953", largo=5278, nombre="Albert Park", gp="Gran Premio de Australia", pais="Australia", bandera="🇦🇺",
   fecha="2026-03-08", formato="normal", vueltas=58, pole26=78.518, poleNota="Russell 1:18.518, clasificación del 7 de marzo de 2026", aero=(0.95, 0.97), abr=0.85,
   boxes=("derecha", 380, 250, 19.0, 80), horario={"fp1": "V 12:30", "fp2": "V 16:00", "fp3": "S 12:30", "q": "S 16:00", "carrera": "D 15:00"},
   adel=adel(26), clima=clima(-37.85, 24.5, 13.5, 4.0, 20, 20, 0.4, 62, 18, 14, 6, 0.3, "Marzo en Melbourne: máxima ~24-25 °C, mínima ~13-14 °C, unos 8 días de lluvia, frentes del sur (medias aproximadas)")),
 "shanghai": dict(tum="Shanghai", bac="cn-2004", nombre="Shanghái", gp="Gran Premio de China", pais="China", bandera="🇨🇳",
   fecha="2026-03-15", formato="sprint", vueltas=56, vueltasSprint=19, pole26=92.064, poleNota="Antonelli 1:32.064, clasificación del 14 de marzo de 2026 (FIA)", aero=(1.02, 1.0), abr=1.0,
   boxes=("derecha", 450, 300, 22.0, 80), horario={"fp1": "V 11:30", "sq": "V 15:30", "sprint": "S 11:00", "q": "S 15:00", "carrera": "D 15:00"},
   adel=adel(48), clima=clima(31.34, 14.5, 6.5, 3.5, 14, 15, 0.4, 50, 15, 20, 15, 0.1, "Marzo en Shanghái: máxima ~14-15 °C, mínima ~6-7 °C, lloviznas y frentes frecuentes (medias aproximadas)")),
 "miami": dict(bac="us-2022", largo=5412, nombre="Miami", gp="Gran Premio de Miami", pais="Estados Unidos", bandera="🇺🇸",
   fecha="2026-05-03", formato="sprint", vueltas=57, vueltasSprint=19, pole26=87.798, poleNota="Antonelli 1:27.798, clasificación del 2 de mayo de 2026 (FIA)", aero=(0.95, 0.96), abr=0.8,
   boxes=("derecha", 400, 280, 20.0, 80), horario={"fp1": "V 12:30", "sq": "V 16:30", "sprint": "S 12:00", "q": "S 16:00", "carrera": "D 16:00"},
   adel=adel(30), clima=clima(25.96, 30.0, 22.5, 1.5, 24, 15, 0.7, 55, 38, 2, 5, 0.9, "Mayo en Miami: máxima ~30 °C, mínima ~22-23 °C, empieza la estación de tormentas de tarde (medias aproximadas)")),
 "montreal": dict(tum="Montreal", bac="ca-1978", nombre="Gilles Villeneuve", gp="Gran Premio de Canadá", pais="Canadá", bandera="🇨🇦",
   fecha="2026-05-24", formato="sprint", vueltas=70, vueltasSprint=23, pole26=72.578, poleNota="Russell 1:12.578, clasificación del 23 de mayo de 2026 (FIA)", aero=(0.86, 0.9), abr=0.72,
   boxes=("derecha", 360, 260, 18.0, 80), horario={"fp1": "V 12:30", "sq": "V 16:30", "sprint": "S 12:00", "q": "S 16:00", "carrera": "D 14:00"},
   adel=adel(44), clima=clima(45.50, 19.5, 9.0, 4.0, 18, 15, 0.5, 52, 25, 15, 8, 0.5, "Finales de mayo en Montreal: máxima ~19-20 °C, mínima ~9 °C, tiempo cambiante (medias aproximadas)")),
 "barcelona": dict(tum="Catalunya", bac="es-1991", nombre="Barcelona-Catalunya", gp="Gran Premio de Barcelona-Catalunya", pais="España", bandera="🇪🇸",
   fecha="2026-06-14", formato="normal", vueltas=66, pole26=74.679, poleNota="Russell 1:14.679, clasificación del 13 de junio de 2026 (FIA)", aero=(1.08, 1.04), abr=1.2,
   boxes=("derecha", 420, 280, 22.0, 80), horario=NORMAL,
   adel=adel(32), clima=clima(41.57, 27.0, 17.0, 2.5, 22, 12, 0.5, 78, 15, 4, 3, 0.5, "Junio en Montmeló: máxima ~27 °C, mínima ~17 °C, pocos días de lluvia, alguna tormenta de tarde (medias aproximadas)")),
 "spielberg": dict(tum="Spielberg", bac="at-1969", nombre="Red Bull Ring", gp="Gran Premio de Austria", pais="Austria", bandera="🇦🇹",
   fecha="2026-06-28", formato="normal", vueltas=71, pole26=66.113, poleNota="Russell 1:06.113, clasificación del 27 de junio de 2026 (FIA)", aero=(0.95, 0.97), abr=0.95,
   boxes=("derecha", 330, 230, 20.0, 80), horario=NORMAL,
   adel=adel(50), clima=clima(47.22, 25.0, 12.0, 3.5, 20, 12, 0.6, 50, 35, 10, 5, 0.9, "Finales de junio en Estiria (680 m): máxima ~25 °C, mínima ~12 °C, tormentas de tarde frecuentes (medias aproximadas)")),
 "hungaroring": dict(tum="Budapest", bac="hu-1986", nombre="Hungaroring", gp="Gran Premio de Hungría", pais="Hungría", bandera="🇭🇺",
   fecha="2026-07-26", formato="normal", vueltas=70, pole26=77.207, poleNota="Norris 1:17.207, clasificación del 25 de julio de 2026 (FIA)", aero=(1.18, 1.1), abr=0.9,
   boxes=("derecha", 400, 260, 20.5, 80), horario=NORMAL,
   adel=adel(24), clima=clima(47.58, 29.0, 16.5, 3.0, 22, 10, 0.6, 70, 22, 5, 3, 0.7, "Julio en Mogyoród: máxima ~29 °C, mínima ~16-17 °C, tormentas de verano algunos días (medias aproximadas)")),
 "zandvoort": dict(tum="Zandvoort", bac="nl-1948", nombre="Zandvoort", gp="Gran Premio de los Países Bajos", pais="Países Bajos", bandera="🇳🇱",
   fecha="2026-08-23", formato="sprint", vueltas=72, vueltasSprint=24, pole26=71.163, poleNota="Norris 1:11.163, clasificación del 22 de agosto de 2026 (FIA), con la lluvia llegando", aero=(1.15, 1.08), abr=1.1,
   boxes=("derecha", 300, 220, 21.0, 80), horario=SPRINT,
   adel=adel(16), clima=clima(52.39, 21.0, 14.0, 2.5, 16, 22, 0.5, 50, 30, 12, 8, 0.4, "Agosto en la costa holandesa: máxima ~21 °C, mínima ~14 °C, viento del mar y chubascos (medias aproximadas)")),
 "madrid": dict(bac="es-2026", largo=5474, nombre="Madring", gp="Gran Premio de España", pais="España", bandera="🇪🇸",
   fecha="2026-09-13", formato="normal", vueltas=57, pole26=91.824, poleNota="Norris 1:31.824, clasificación del 12 de septiembre de 2026", aero=(1.05, 1.02), abr=1.0,
   boxes=("derecha", 380, 260, 21.0, 80), horario=NORMAL,
   adel=adel(18, "estimación del juego: circuito nuevo; en su primera carrera (2026) hubo muy pocos adelantamientos (gpblog.com)"),
   clima=clima(40.46, 27.0, 15.0, 3.0, 22, 12, 0.4, 80, 12, 5, 3, 0.4, "Septiembre en Madrid: máxima ~27 °C, mínima ~15 °C, pocos días de lluvia (medias aproximadas)")),
 "baku": dict(bac="az-2016", largo=6003, nombre="Bakú", gp="Gran Premio de Azerbaiyán", pais="Azerbaiyán", bandera="🇦🇿",
   fecha="2026-09-26", formato="normal", vueltas=51, pole26=102.526, poleNota="Russell 1:42.526, clasificación del 25 de septiembre de 2026", aero=(0.82, 0.88), abr=0.6,
   boxes=("izquierda", 300, 250, 20.0, 80), dias="JVS",
   horario={"fp1": "J 13:30", "fp2": "J 17:00", "fp3": "V 13:30", "q": "V 17:00", "carrera": "S 15:00"},
   adel=adel(38), clima=clima(40.37, 26.0, 19.0, 2.0, 20, 25, 0.3, 85, 8, 4, 3, 0.2, "Finales de septiembre en Bakú: máxima ~26 °C, mínima ~19 °C, casi seco y con mucho viento del Caspio (medias aproximadas)")),
 "austin": dict(tum="Austin", bac="us-2012", nombre="Circuito de las Américas", gp="Gran Premio de Estados Unidos", pais="Estados Unidos", bandera="🇺🇸",
   fecha="2026-10-25", formato="normal", vueltas=56, pole26=94.035, poleNota="Antonelli 1:34.035, clasificación del 24 de octubre de 2026", aero=(1.02, 1.0), abr=1.1,
   boxes=("derecha", 420, 300, 21.0, 80), horario={"fp1": "V 12:30", "fp2": "V 16:00", "fp3": "S 12:30", "q": "S 16:00", "carrera": "D 14:00"},
   adel=adel(44), clima=clima(30.13, 26.0, 14.0, 4.0, 20, 15, 0.5, 75, 15, 8, 2, 0.4, "Finales de octubre en Austin: máxima ~26 °C, mínima ~14 °C, algún frente con tormentas (medias aproximadas)")),
 "mexico": dict(tum="MexicoCity", bac="mx-1962", nombre="Hermanos Rodríguez", gp="Gran Premio de la Ciudad de México", pais="México", bandera="🇲🇽",
   fecha="2026-11-01", formato="normal", vueltas=71, pole26=76.514, poleNota="Hamilton 1:16.514, clasificación de 2026", aero=(0.9, 0.85), abr=0.75,
   boxes=("derecha", 420, 300, 22.0, 80), horario={"fp1": "V 12:30", "fp2": "V 16:00", "fp3": "S 11:30", "q": "S 15:00", "carrera": "D 14:00"},
   adel=adel(30), clima=clima(19.40, 22.0, 9.5, 2.5, 22, 8, 0.5, 85, 10, 2, 3, 0.5, "Noviembre en Ciudad de México (2240 m): máxima ~22 °C, mínima ~9-10 °C, ya en la estación seca (medias aproximadas)")),
 "lasvegas": dict(bac="us-2023", largo=6201, nombre="Las Vegas", gp="Gran Premio de Las Vegas", pais="Estados Unidos", bandera="🇺🇸",
   fecha="2026-11-21", formato="normal", vueltas=50, pole25=92.312, poleNota="Russell 1:32.312 en 2024 (la de 2025 fue en mojado)", aero=(0.78, 0.84), abr=0.6,
   boxes=("derecha", 380, 300, 20.0, 80), dias="JVS",
   horario={"fp1": "J 18:30", "fp2": "J 22:00", "fp3": "V 18:30", "q": "V 22:00", "carrera": "S 20:00"},
   adel=adel(50), clima=clima(36.11, 18.0, 7.0, 3.0, 18, 12, 0.3, 95, 3, 1, 1, 0.0, "Noviembre en Las Vegas: máxima ~18 °C, mínima ~7 °C; de noche, frío y seco (medias aproximadas)")),
 "lusail": dict(bac="qa-2004", largo=5419, nombre="Lusail", gp="Gran Premio de Catar", pais="Catar", bandera="🇶🇦",
   fecha="2026-11-29", formato="normal", vueltas=57, pole25=79.387, poleNota="Piastri 1:19.387 en 2025", aero=(1.08, 1.04), abr=1.25,
   boxes=("derecha", 420, 300, 25.0, 80), horario={"fp1": "V 16:30", "fp2": "V 20:00", "fp3": "S 17:30", "q": "S 21:00", "carrera": "D 19:00"},
   adel=adel(34), clima=clima(25.49, 28.0, 20.0, 1.5, 20, 15, 0.2, 97, 2, 0, 1, 0.0, "Finales de noviembre en Doha: máxima ~28 °C, mínima ~20 °C, casi nunca llueve (medias aproximadas)")),
 "yasmarina": dict(bac="ae-2009", largo=5281, nombre="Yas Marina", gp="Gran Premio de Abu Dabi", pais="Emiratos Árabes Unidos", bandera="🇦🇪",
   fecha="2026-12-06", formato="normal", vueltas=58, pole25=82.207, poleNota="Verstappen 1:22.207 en 2025", aero=(1.0, 1.0), abr=0.8,
   boxes=("izquierda", 420, 300, 22.0, 80), horario={"fp1": "V 13:30", "fp2": "V 17:00", "fp3": "S 14:30", "q": "S 18:00", "carrera": "D 17:00"},
   adel=adel(30), clima=clima(24.47, 27.0, 19.0, 1.5, 22, 12, 0.2, 96, 2, 1, 1, 0.1, "Diciembre en Abu Dabi: máxima ~27 °C, mínima ~19 °C, casi nunca llueve (medias aproximadas)")),
}

def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    return path

def tum_points(name):
    rows = [l.split(",") for l in open(fetch(f"https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/{name}.csv", name + ".csv")) if not l.startswith("#")]
    return [[round(float(r[0]), 1), round(float(r[1]), 1)] for r in rows]

# sentido real de los que vienen de bacinger (el GeoJSON no siempre va en el sentido de la carrera)
SENTIDO = {"melbourne": "horario", "yasmarina": "antihorario", "madrid": "horario", "miami": "antihorario", "baku": "antihorario", "lasvegas": "antihorario", "lusail": "horario"}

def bac_points(bac, largo, sentido=None):
    gj = json.load(open(fetch(f"https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/{bac}.geojson", bac + ".geojson")))
    ll = gj["features"][0]["geometry"]["coordinates"]
    if ll[0] == ll[-1]: ll = ll[:-1]
    lat0 = sum(p[1] for p in ll) / len(ll); lon0 = sum(p[0] for p in ll) / len(ll)
    mlat, mlon = 111132.0, 111320.0 * math.cos(math.radians(lat0))
    pts = [[(p[0] - lon0) * mlon, (p[1] - lat0) * mlat] for p in ll]
    area = 0.5 * sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))
    if sentido and (area < 0) != (sentido == "horario"):
        pts = [pts[0]] + pts[1:][::-1]  # misma salida, al revés
    L = sum(math.dist(pts[i], pts[i - 1]) for i in range(len(pts)))
    return [[round(x, 1), round(y, 1)] for x, y in pts], round(largo / L, 4)

for cid, c in C.items():
    path = os.path.join(ROOT, cid + ".json")
    if (ONLY and cid not in ONLY) or (not ONLY and os.path.exists(path)):
        continue
    if "tum" in c:
        pts, esc, fuente = tum_points(c["tum"]), 1.0, "TUMFTM racetrack-database (LGPL-3.0): línea central del trazado"
    else:
        pts, esc = bac_points(c["bac"], c["largo"], SENTIDO.get(cid))
        fuente = "bacinger/f1-circuits (MIT): trazado en GeoJSON, convertido a metros y escalado a la longitud real"
    lado, entrada, salida, perdida, limite = c["boxes"]
    d = {"id": cid, "ronda": 0, "nombre": c["nombre"], "gp": c["gp"], "pais": c["pais"], "bandera": c["bandera"], "fecha": c["fecha"],
         "formato": c["formato"], "vueltas": c["vueltas"]}
    if "vueltasSprint" in c: d["vueltasSprint"] = c["vueltasSprint"]
    if "pole26" in c:
        d["poleObjetivo"] = c["pole26"]
        d["poleFuente"] = c["poleNota"]
    else:
        d["poleObjetivo"] = round(c["pole25"] * POLE_2026, 2)
        d["poleFuente"] = f"estimada: {c['poleNota']}, más lo que han perdido de mediana los coches de 2026 (×{POLE_2026})"
    d["aero"] = {"cl": c["aero"][0], "cd": c["aero"][1]}
    d["abrasividad"] = c["abr"]
    d["boxes"] = {"lado": lado, "entrada": entrada, "salida": salida, "perdida": perdida, "limite": limite}
    if "dias" in c: d["dias"] = c["dias"]
    d["horario"] = c["horario"]
    d["adelantamientos"] = c["adel"]
    d["clima"] = c["clima"]
    d["puntos"] = pts
    d["escala"] = esc
    d["fuenteTrazado"] = fuente
    with open(path, "w", encoding="utf8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{cid:12s} {len(pts)} puntos, escala {esc}")
