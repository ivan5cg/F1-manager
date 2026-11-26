import json,re,sys,statistics as st
R=json.load(open(sys.argv[1]))
def ts(s):
    if not s: return None
    m=re.match(r"^(?:(\d+):)?(\d+)\.(\d+)",s.strip()); 
    return int(m.group(1) or 0)*60+int(m.group(2))+float("0."+m.group(3)) if m else None
med=lambda a: st.median(a) if a else float('nan')
rows=[]; teamgap={}
for i,g in enumerate(R,1):
    gpn=g["info"].get("Grand Prix","?"); w=g["info"].get("Weather","").lower()
    wetq=False
    q=g["quali"]; r=g["race"]
    pole=ts(g["info"].get("Pole_Time")); fl=ts(g["info"].get("Fast_Time"))
    best={}
    for x in q:
        t=min([v for v in (x["q1"],x["q2"],x["q3"]) if v] or [None]) if any((x["q1"],x["q2"],x["q3"])) else None
        x["best"]=t
    q1=[x["q1"] for x in q if x["q1"]]
    q1s=sorted(q1)
    wetq = fl is not None and pole is not None and pole>fl*1.03
    # final quali times by position: Q3 for 1-10, Q2 11-16, Q1 17-22
    def ft(x,k): 
        p=int(x["pos"]) if x["pos"].isdigit() else 99
        return x["q3"] if p<=10 else x["q2"] if p<=16 else x["q1"]
    qp=[x for x in q if x["pos"].isdigit()]; qp.sort(key=lambda x:int(x["pos"]))
    p1=ft(qp[0],0); p2=ft(qp[1],0); p10=ft(qp[9],0) if len(qp)>9 else None
    evo_pole=(qp[0]["q1"]-qp[0]["q3"]) if qp[0]["q1"] and qp[0]["q3"] else None
    top10=[x for x in qp[:10] if x["q1"] and x["q3"]]
    evo10=med([x["q1"]-x["q3"] for x in top10])
    q3slow=sum(1 for x in qp[:10] if x["q2"] and x["q3"] and x["q3"]>x["q2"])
    # team best quali relative to pole, using best of any session time
    tb={}
    for x in q:
        if x["best"]: tb[x["team"]]=min(tb.get(x["team"],9e9),x["best"])
    tbest=min(tb.values())
    for t,v in tb.items(): teamgap.setdefault(t,[]).append((i,100*(v/tbest-1)))
    # teammates
    tm={}
    for x in q:
        if x["best"]: tm.setdefault(x["team"],[]).append(x["best"])
    mates=[abs(a[0]-a[1]) for a in tm.values() if len(a)==2]
    # race
    fin=[x for x in r if x["pos"].isdigit()]
    win=fin[0] if fin else None
    grid=lambda x: int(x["grid"]) if x["grid"].isdigit() else 22
    lapped=sum(1 for x in r if re.search(r"lap",x["time"],re.I) and x["pos"].isdigit())
    dnf=sum(1 for x in r if not x["pos"].isdigit())
    # spearman on finishers
    fx=[(grid(x),int(x["pos"])) for x in fin]
    n=len(fx)
    rg={v:k for k,v in enumerate(sorted(range(n),key=lambda j:fx[j][0]))}
    d2=sum((rg[j]-j)**2 for j in range(n)); sp=1-6*d2/(n*(n*n-1)) if n>2 else None
    m2=fin[1]["time"] if len(fin)>1 else ""
    margin=ts(m2.lstrip("+")) if m2.startswith("+") and "lap" not in m2 else None
    rows.append(dict(i=i,gp=gpn,wetq=wetq,flp=fl/pole if fl and pole and not wetq else None,q1sp=(q1s[-1]-q1s[0]) if q1s else None,q1_20=(q1s[19]-q1s[0]) if len(q1s)>19 else None,p2=p2-p1 if p1 and p2 else None,p10=p10-p1 if p10 and p1 else None,evo=evo_pole,evo10=evo10,q3slow=q3slow,mates=med(mates),polewin=win and grid(win)==1,wgrid=grid(win) if win else None,lapped=lapped,dnf=dnf,sp=sp,margin=margin))
for x in rows:
    print(f'{x["i"]:2d} {x["gp"][:12]:12s} {"Q mojada" if x["wetq"] else "        "} VR/pole {x["flp"] and round(x["flp"],3)} Q1 todos {x["q1sp"] and round(x["q1sp"],2)} P2 {x["p2"] and round(x["p2"],3)} P10 {x["p10"] and round(x["p10"],2)} Q1→Q3 pole {x["evo"] and round(x["evo"],2)} top10 {round(x["evo10"],2)} Q3>Q2 {x["q3slow"]} comp {round(x["mates"],2)} | gana desde P{x["wgrid"]} dob {x["lapped"]} ab {x["dnf"]} sp {x["sp"] and round(x["sp"],2)} margen {x["margin"]}')
dry=[x for x in rows if not x["wetq"]]
def M(k,src=dry): return med([x[k] for x in src if x[k] is not None])
print("\nMEDIANAS (Q seca, n=%d)"%len(dry))
import numpy as np
for k in ["flp","q1sp","q1_20","p2","p10","evo","evo10","q3slow","mates"]:
    v=[x[k] for x in dry if x[k] is not None]; print(" ",k,"med",round(M(k),3),"min",round(min(v),3),"max",round(max(v),3),"p10",round(float(np.percentile(v,10)),3),"p90",round(float(np.percentile(v,90)),3),"n",len(v))
v=[x["lapped"] for x in rows]; print("  doblados min",min(v),"max",max(v)); v=[x["dnf"] for x in rows]; print("  abandonos min",min(v),"max",max(v),"media",sum(v)/len(v))
v=[x["margin"] for x in rows if x["margin"] is not None]; print("  margen media",round(sum(v)/len(v),1))
print("  carreras: gana la pole %d/%d · desde P4+ %d · doblados media %.1f · abandonos media %.1f · spearman media %.2f · margen med %.1f"%(sum(1 for x in rows if x["polewin"]),len(rows),sum(1 for x in rows if x["wgrid"] and x["wgrid"]>=4),st.mean(x["lapped"] for x in rows),st.mean(x["dnf"] for x in rows),st.mean(x["sp"] for x in rows if x["sp"] is not None),M("margin",rows)))
print("\nDISTANCIA DEL MEJOR TIEMPO DE CADA EQUIPO A LA POLE (%), por tercios de temporada (solo Q secas)")
dryi={x["i"] for x in dry}
for t,v in sorted(teamgap.items(),key=lambda kv: med([g for i,g in kv[1] if i in dryi])):
    v=[(i,g) for i,g in v if i in dryi]
    a=med([g for i,g in v if i<=7]); b=med([g for i,g in v if 8<=i<=14]); c=med([g for i,g in v if i>=15])
    print(f"  {t:12s} total {med([g for i,g in v]):.2f}  1-7 {a:.2f}  8-14 {b:.2f}  15-21 {c:.2f}")
