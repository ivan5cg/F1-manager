# Banco de auditoría de la simulación

Juega fines de semana completos sin interfaz (libres, clasificación, sprint y carrera), registra vuelta a vuelta cada
coche y compara lo que sale con la F1 real. Es lo que se usó para [docs/AUDITORIA-SIMULACION.md](../../docs/AUDITORIA-SIMULACION.md).
No cambia nada del juego.

## Uso (desde la raíz del repo)

```bash
npm install
# lote: <nombre> <clima> <semillas> [circuitos...] [--formato=sprint] [--hilos=N]
node scripts/auditoria/lote.mjs seco seco 1-4                       # los 24 circuitos en seco (96 fines de semana)
node scripts/auditoria/lote.mjs lluviaD lluviaD 21-22 spa silverstone interlagos suzuka montreal singapur monaco melbourne
node scripts/auditoria/lote.mjs chubD chubD 31-32 spa silverstone interlagos suzuka montreal singapur monaco melbourne
node scripts/auditoria/lote.mjs lluviaS lluviaS 41-42 spa interlagos suzuka silverstone
# análisis
node scripts/auditoria/analiza.js auditoria-out/seco --por-circuito
node scripts/auditoria/lluvia.js auditoria-out/lluviaD auditoria-out/chubD auditoria-out/lluviaS
npx tsx scripts/auditoria/deg.ts silverstone bahrein monza         # curvas de neumático del modelo
# un solo fin de semana (JSON por la salida estándar)
npx tsx scripts/auditoria/gp.ts silverstone 1 seco > fin.json
```

- **Climas:** `seco` (los tres días «Estable»; aun así llueve en ~10 % de los fines de semana), `natural` (el que toque
  a la semilla), `lluviaD` (frente el domingo), `chubD` (chubascos el domingo), `lluviaS` (frente el sábado: clasificación
  mojada) y `mixto` (chubascos los tres días).
- **Tiempo:** cada fin de semana tarda ~30-40 s solo; con 20 a la vez, ~3-4 min cada uno. Un lote de 96 en 24 núcleos
  tarda ~20 min. Con menos núcleos, usa menos circuitos o semillas.
- **Salida:** `auditoria-out/<nombre>/<circuito>_<semilla>.json` (no se sube a git: ~200 KB por fin de semana). La
  simulación es determinista: las mismas semillas dan los mismos resultados mientras no cambie el código.
- **Referencia:** `base-2026-11/` tiene la salida de los analizadores con el código de noviembre de 2026 (antes de
  cualquier arreglo). Sirve para comparar el antes y el después de un cambio. El lote en seco de la referencia se jugó
  con una versión anterior de `gp.ts` que aún no apuntaba las banderas de cada vuelta: por eso ahí salen sin dato las
  vueltas enteras con SC/VSC (en el de lluvia sí están: 1,87 y 1,53).

## Qué mide `analiza.js`

- **Libres:** vueltas por piloto, P1-P20, tandas largas y su pendiente, y el mejor de libres frente a la pole (y cuántas
  veces la bate).
- **Clasificación:** pole frente a la real calibrada, P2/P3/P10 frente a P1, dispersión de Q1, cortes de Q1 y Q2,
  mejora de Q1 a Q3, Q3 peor que Q2, compañeros, de los 8 de cabeza cuántos caen en Q1 y Q2, banderas rojas y
  neumáticos.
- **Carrera y sprint:**
  - ritmo: vuelta rápida / pole, vuelta verde / pole, primera vuelta, regularidad σ en aire limpio (mismo modo de
    ritmo) y degradación por compuesto corregida de combustible;
  - estrategia: pérdida en boxes medida, paradas, estrategias, neumático de salida y uso de duro y blando;
  - incidencias: coche de seguridad, virtual y roja (y cuánto dura una vuelta con ellos), abandonos y motivos,
    sanciones;
  - resultado: gana la pole, gana desde P4+, margen, 1.º-10.º, doblados y Spearman parrilla-final.

## Estado al dejarlo (25 de noviembre de 2026)

Auditoría hecha y escrita en `docs/AUDITORIA-SIMULACION.md`; no se ha cambiado nada del simulador. Lo pendiente, por
impacto (detalle y líneas de código en el informe):

1. ~~Ritmo de carrera casi igual que el de clasificación (vuelta rápida / pole 1,005 frente a 1,045 real en 2026), y los
   libres baten la pole.~~ **Hecho:** modo de clasificación del motor y la batería (`DEPLOY_TRIM` en `session.ts`).
   Con 48 fines de semana (semillas 1 y 2): vuelta rápida / pole 1,045, vuelta verde / pole 1,073, sprint 1,028,
   libres a 1,2 / 0,9 / 0,6 s de la pole, sin cambios en coches de seguridad, abandonos ni pole frente a la real.
2. La clasificación no evoluciona (Q1 → Q3: 0,17 s frente a 1,28 s en 2026).
3. Neumáticos: ~1 s entre compuestos (real 0,3-0,6 s), poca degradación progresiva y precipicio brusco; muy poco duro.
4. Parrilla demasiado apretada (Q1 1,2 s frente a 3,3 s; 1,3 doblados frente a 7,5).
5. Regularidad de metrónomo (σ 0,05 s frente a 0,2-0,3 s).
6. Victorias demasiado abiertas en carrera (pole 31 %, desde P4+ 35 %) y demasiado cerradas en la sprint (pole 83 %).
7. ~~**Fallo:** descalificaciones por la regla de los dos compuestos cuando se prevé lluvia que no llega
   (`src/sim/strategy.ts:655-658` anula la parada de `strategy.ts:650`). Se reproduce con
   `npx tsx scripts/auditoria/gp.ts spa 32 chubD` (HAM, NOR, LAW y BEA descalificados; con `DEPURAR=1` sale por qué para
   cada uno).~~ **Hecho** (PR #41).
8. Coche de seguridad y virtual demasiado lentos, y la mitad de vueltas en libres.

Siguiente: los puntos 2 y 3, de uno en uno y midiendo con este banco y con `scripts/realismo.ts`. Con el punto 1 la
vuelta media del ganador sube a ~1,10-1,12 de la pole (real 1,11), pero las carreras con coche de seguridad largo se
alargan: el punto 8 (coche de seguridad demasiado lento) pesa ahora algo más. Al tocar el punto 2 hay que volver a mirar
los libres frente a la pole (`PRACTICE_PUSH_TRIM`), porque una clasificación que evoluciona cambia esa distancia.
