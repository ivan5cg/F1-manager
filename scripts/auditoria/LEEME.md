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
node scripts/auditoria/cabeza.js auditoria-out/seco                # cómo se decide la victoria (punto 6)
# la sprint en los 24 circuitos (los que no la tienen, a 100 km y con su horario)
node scripts/auditoria/lote.mjs sprint seco 1-2 --formato=sprint
# solo salidas: muchas, con la parrilla de un lote (o una por ritmo si no se da PARRILLA)
PARRILLA=auditoria-out/seco npx tsx scripts/auditoria/salida.ts RACE 1 8
# la misma carrera con 6 semillas y la misma parrilla (lo que decide el azar de la carrera); una línea JSON
npx tsx scripts/auditoria/repite.ts monaco 1 6
# un solo fin de semana (JSON por la salida estándar)
npx tsx scripts/auditoria/gp.ts silverstone 1 seco > fin.json
# solo carreras (parrilla por ritmo, sin libres ni clasificación, ~6 s cada una): uso del duro y del blando, paradas,
# adelantamientos, doblados y, con --equipos, el ritmo de carrera de cada equipo; para probar cambios deprisa
npx tsx scripts/auditoria/rapida.ts 1-4 shanghai suzuka spa lasvegas --equipos
# neumáticos en carrera: vueltas con cada compuesto, tanda media y estrategias más comunes (para comparar con 2026)
npx tsx scripts/auditoria/gomas.ts 1-2 singapur silverstone suzuka
# temperatura de carcasa, graining y agarre de cada compuesto a lo largo de una tanda
npx tsx scripts/auditoria/sonda.ts lasvegas silverstone
# distancia de cada equipo al mejor en clasificación y en carrera (aire limpio), y como en rendimiento/race.py
# (tiempo total del mejor coche, doblados a una vuelta por vuelta): lo que se compara con 2026
node scripts/auditoria/equipos.mjs auditoria-out/seco
node scripts/auditoria/carrera-equipos.mjs auditoria-out/seco
# pole simulada en seco (con los libres antes) y calibración de `poleAjuste` en cada circuito
npx tsx scripts/auditoria/pole.ts monaco 1-6
node scripts/auditoria/calibra-pole.mjs 1-6 --escribe
# desarrollo asimétrico ATR de rivales (equipo real y «crear equipo»), paquetes y delta real en pista
npx tsx scripts/auditoria/desarrollo.ts 1-40 23
```

- **Climas:** `seco` (los tres días «Estable»; aun así llueve en ~10 % de los fines de semana), `natural` (el que toque
  a la semilla), `lluviaD` (frente el domingo), `chubD` (chubascos el domingo), `lluviaS` (frente el sábado: clasificación
  mojada) y `mixto` (chubascos los tres días).
- **Tiempo:** cada fin de semana tarda ~30-40 s solo; con 20 a la vez, ~3-4 min cada uno. Un lote de 96 en 24 núcleos
  tarda ~20 min. Con menos núcleos, usa menos circuitos o semillas.
- **Salida:** `auditoria-out/<nombre>/<circuito>_<semilla>.json` (no se sube a git: ~200 KB por fin de semana). La
  simulación es determinista: las mismas semillas dan los mismos resultados mientras no cambie el código.
- **Semillas:** cada circuito juega con su propia semilla de fin de semana (`semilla × 1000 + un número sacado del
  nombre del circuito`), como el juego, que usa una por ronda. Hasta el 26 de noviembre de 2026, `gp.ts` usaba la misma
  en los 24 circuitos, y con ella todas las sesiones de una semilla compartían los dados: en la salida, los mismos para
  cada puesto de parrilla (la pole conservaba el liderato en 41 de 41 carreras de una semilla, o lo perdía en casi
  todas las de otra). Las medias de ritmo, neumáticos o neutralizaciones apenas cambian, pero lo que dependa de la
  salida o del orden en cabeza (gana la pole, gana desde P4+, la sprint) medido antes de esa fecha está sesgado, y la
  referencia `base-2026-11/` también.
- **Referencia actual:** `base-2026-11d/` (27 de noviembre de 2026, el código de main tras #50 y los commits de aero
  activa y ATR; `lote.mjs hoy seco 1-4`): `seco.txt` (con `--por-circuito`), `cabeza.txt` y `equipos.txt`. La anterior,
  `base-2026-11c/` (ver el punto 9 de «Estado»). La de antes, `base-2026-11b/` (26 de noviembre de 2026, con el punto 6 hecho y una semilla por circuito):
  `seco.txt` (`lote.mjs ref-seco seco 1-4`, con `--por-circuito`), `lluvia-agregado.txt` y `lluvia-sesiones.txt` (los
  tres lotes de lluvia de arriba, juntos), `sprint.txt` (`--formato=sprint`, semillas 1-2), `cabeza.txt` y
  `curvas-neumaticos.txt` (`deg.ts`).
- **Referencia antigua:** `base-2026-11/` tiene la salida de los analizadores con el código de noviembre de 2026 (antes de
  cualquier arreglo), jugada con la misma semilla en todos los circuitos (ver «Semillas»). Sirve para comparar el antes y el después de un cambio. El lote en seco de la referencia se jugó
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
2. ~~La clasificación no evoluciona (Q1 → Q3: 0,17 s frente a 1,28 s en 2026).~~ **Hecho:** evolución de la
   clasificación (`QUALI_EVO` en `session.ts`) y la IA la tiene en cuenta (margen para volver a salir, reparto de
   juegos nuevos para guardar dos a Q3). Con 48 fines de semana: Q1 → Q3 1,0-1,1 s en seco, Q3 peor que Q2 en 1-2 de
   10, la pole igual que antes (+0,006 s de media) y los de cabeza caen en Q1 lo mismo que antes. Tras el punto 3:
   Q1 → Q3 0,76-1,04 s y SQ1 → SQ3 0,9-1,3 s.
3. ~~Neumáticos: ~1 s entre compuestos (real 0,3-0,6 s), poca degradación progresiva y precipicio brusco; muy poco
   duro.~~ **Hecho:** escala de compuestos 1,000 / 0,987 / 0,978, más pendiente (sobre todo medio y duro), precipicio
   de como mucho un 12 % y coste de salir con el duro en el planificador. Con 48 fines de semana: ~0,4-0,6 s por
   escalón, degradación en carrera 0,08 / 0,065 / 0,04 s/v, duro 73-87 % (antes 25-55 %), blando 29-37 % (antes
   62-79 %), salida con medio ~63 %, 1,3 paradas.
   **Gama C1-C5:** cada circuito lleva los tres compuestos que eligió Pirelli en 2026 (`compuestos` en su JSON; Baréin,
   la de 2025). La gama (`RANGE` en `tyres.ts`) da el agarre (~1,2 % por escalón) y la ventana de temperatura de cada
   compuesto; lo que dura cada papel sigue siendo el del blando, medio y duro genéricos escalado por la abrasividad
   (con el desgaste propio de cada compuesto la dureza de la pista contaba dos veces y en tandas largas el duro barría
   al medio). Además: media ventana por debajo de la óptima no cuesta agarre y las dos primeras vueltas de un juego
   apenas cuestan. Con 48 fines de semana: 1,31/1,40 paradas, duro 86/92 %, blando 17/20 %, salida con medio ~67 %,
   vuelta rápida / pole 1,044; en las pistas frías el duro sube (Spa 61 %, Suzuka 68 %, Shanghái 44 %). Pendiente:
   Las Vegas (16 °C de asfalto) sigue sin duro; el blando se usa algo poco; en la sprint ~40 % sale con duro.
4. ~~Parrilla demasiado apretada (Q1 1,2 s frente a 3,3 s; 1,3 doblados frente a 7,5).~~ **Hecho:** las diferencias
   de agarre y potencia entre equipos se multiplican por 2,6 respecto al mejor (`TEAM_SPREAD` en `session.ts`; el
   mejor no cambia y la pole sigue calibrada). Q1 de primero a último 2,5-2,6 s, 4,4-4,6 doblados, Mercedes delante.
   **Recalibrado con los 21 GP de 2026** ([rendimiento-2026.md](rendimiento-2026.md)): nivel de cada coche de los GP
   13-21, carácter por tipo de curva (lenta, media, rápida: `curvas` en equipos-2026.json) y potencia por motor.
   Q1 P1-P20 2,1-2,3 s (real 2,13), P10 − P1 1,1-1,2 s (real 1,39), compañeros 0,30 s (real 0,31).
5. ~~Regularidad de metrónomo (σ 0,05 s frente a 0,2-0,3 s).~~ **Hecho:** ruido por vuelta además del de cada
   minisector (`LAP_NOISE`): σ en aire limpio 0,19-0,20 s.
6. Victorias demasiado abiertas en carrera y demasiado cerradas en la sprint (pole 83 %). **En parte hecho** (detalle
   en el informe, sección 5, «Punto 6»):
   - El 83 % de la sprint y el 33-50 % de la carrera venían de un fallo del banco: la misma semilla en los 24
     circuitos (ver «Semillas»). Con el banco corregido, la pole ganaba el 61 % de las sprints (bien) y solo el 21 % de
     las carreras, con un 44 % de victorias desde P4+.
   - Cambios: salir con el duro desde delante cuesta más (`START_FRONT`), prioridad del de delante para cubrir el
     undercut («cubrir» en `aiDecide`), defensa simétrica a 1,3 s (`aiModes`) y forma del fin de semana de cada piloto
     (`FORM` en `weekend.ts`, con `QUALI_NOISE` en `session.ts`).
   - Con 72 fines de semana: la pole gana el 34 % (real 71 %), desde P4+ el 32 % (real 10 %), y el compañero que sale
     delante acaba delante el 66 % (real 70 %). En la sprint, la pole gana el 70 %.
   - Pendiente: con la misma parrilla, la carrera cambia mucho de una semilla a otra (`repite.ts`: la pole gana el
     28 %). Falta medir cuánto pone cada fuente (salida, ciclo de paradas, neutralizaciones) y si los de cabeza deben
     separarse más en carrera que en clasificación.
7. ~~**Fallo:** descalificaciones por la regla de los dos compuestos cuando se prevé lluvia que no llega
   (`src/sim/strategy.ts:655-658` anula la parada de `strategy.ts:650`). Se reproduce con
   `npx tsx scripts/auditoria/gp.ts spa 32 chubD` (HAM, NOR, LAW y BEA descalificados; con `DEPURAR=1` sale por qué para
   cada uno).~~ **Hecho** (PR #41).
8. ~~Coche de seguridad y virtual demasiado lentos, y la mitad de vueltas en libres.~~ **Hecho:**
   - **Neutralizaciones:** tope de velocidad por circuito (`NEUTRAL_LAP`), y lo que cuesta parar con ellas, calculado con
     esos topes (`pitLossUnder`). La vuelta con coche de seguridad dura 1,43 veces la verde y con virtual 1,33 (antes
     1,89 y 1,58).
   - **Libres:** programas más largos y variados, con 24 / 23 / 14 vueltas por piloto (antes 15 / 15 / 6). La goma de
     cada vuelta de libres baja en proporción (`RUBBER_FP_LAP`).
   - **Q3:** el que va justo en Q2 ya no gasta uno de los dos juegos nuevos de Q3. Q3 peor que su Q2: de 3,2 a 1,3 de
     cada 10.
   - **Lluvia en «Estable»:** las células que nacen durante el día son flojas y pocas (`SECO_BIRTH`). Llueve a la hora
     de la clasificación el 5 % de los días (antes, el 17 %).

9. **Lo pendiente de la primera tanda** (26 de noviembre de 2026; detalle en el informe, «Lo pendiente: lo que se ha
   hecho»). Con 96 fines de semana:
   - ~~El duro en las pistas frías.~~ **Hecho:** graining con un umbral común a los tres de seco (`grainT`), el triple
     de fuerte (`GRAIN_GEN`) y menos pérdida por debajo de la ventana (`COLD_LOSS`, 0,05). Duro en Shanghái / Suzuka /
     Spa / Las Vegas: 73 / 64 / 38 / 63 % (antes 0 / 0 / 6 / 22 %).
   - ~~Pocos doblados.~~ **Hecho:** `ritmoCarrera` en equipos-2026.json (−0,8 % de agarre en carrera para los siete que
     no son de cabeza): 5,5 doblados por carrera, mediana 6 (antes 3,9 y 4; en 2026, 6 y 8).
   - ~~La pole, 0,3-0,5 s más rápida que la real.~~ **Hecho:** `poleObjetivo` es siempre la pole real y cada circuito
     lleva su `poleAjuste`, calibrado con `calibra-pole.mjs`: +0,02 s de mediana (antes −0,42 s).
   - Umbrales de adelantamiento recalibrados (`calibra.ts --objetivos`, para dar con el código nuevo lo mismo que con el
     viejo): 74 por carrera (antes 72).
   - El azar en cabeza: **en parte**. La pole gana el 44 % (antes 35 %; real 71 %) y desde P4+ se gana el 28 % (real 10 %).
- **Referencia nueva:** `base-2026-11c/` (lote `fin2`: `lote.mjs fin2 seco 1-4`): `seco.txt` (con `--por-circuito`),
  `cabeza.txt`, `equipos.txt` (`equipos.mjs` y `carrera-equipos.mjs`), `curvas-neumaticos.txt` y `pole.txt` (la segunda
  pasada de `calibra-pole.mjs`, que mide tras la primera). Las de lluvia y sprint siguen siendo las de `base-2026-11b/`.

Pendiente (en el informe, «Pendiente»; medido otra vez con `base-2026-11d/`): el azar en cabeza (la pole gana el 39 %);
el reparto de vueltas y tandas por compuesto (el duro casi siempre es realista; lo que se aparta es la degradación del
blando y del duro y lo corto de las tandas de medio: ver el informe); y la temperatura del asfalto de Suzuka, que las
fuentes de 2026 no aclaran. (Silverstone no tenía error de pole: era una Q3 mojada en la media; Mónaco y Hungaroring,
recalibrados.)
