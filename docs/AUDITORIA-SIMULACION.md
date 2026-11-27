# Auditoría de realismo de la simulación (noviembre de 2026)

Revisión del motor de sesión (`src/sim/session.ts`, `strategy.ts`, `tyres.ts`, `track.ts`, `weekend.ts`) jugando
fines de semana completos sin interfaz y comparando lo que sale con la F1 real. No se ha cambiado nada del juego.

## Qué se ha jugado

- **96 fines de semana en seco** (los 24 circuitos × 4 semillas, escenario «Estable» los tres días): 96 libres 1,
  72 libres 2 y 3, 96 clasificaciones, 24 clasificaciones sprint, 24 sprints y 96 carreras.
- **40 fines de semana con lluvia**: frente el domingo (8 circuitos × 2), chubascos el domingo (8 × 2) y frente el
  sábado para clasificación mojada (4 × 2). Spa, Silverstone, Interlagos, Suzuka, Montreal, Singapur, Mónaco y Melbourne.
- En total **136 fines de semana, ~650 sesiones**, registrando vuelta a vuelta cada coche: tiempo, compuesto y edad,
  combustible, modo de ritmo, banderas vistas en la vuelta, distancia al de delante, paradas, sucesos de carrera.
- Referencia real: **los 21 grandes premios de 2026 ya disputados** (Australia a Las Vegas; faltan Catar y Abu Dabi),
  con las tablas de clasificación y de carrera de Wikipedia (actualizado el 26 de noviembre; la primera versión usaba 8).
  Lo que esas tablas no dan (coches de seguridad, virtuales, rojas) sigue saliendo de los 8 primeros que se leyeron, y
  donde 2026 no da dato hay valores de 2022-2025 de memoria (marcados «aprox.»). Resumen en la sección siguiente.

El banco de pruebas está en [`scripts/auditoria/`](../scripts/auditoria/LEEME.md): `gp.ts` juega un fin de semana y
vuelca JSON, `lote.mjs` juega lotes en paralelo, `analiza.js` agrega, `lluvia.js` resume las sesiones mojadas y `deg.ts`
saca las curvas de neumático del modelo. Las cifras de este informe están en `scripts/auditoria/base-2026-11/`.

## Referencia real: los 21 GP de 2026

Medianas de las 20 clasificaciones secas (São Paulo fue mojada) y de las 21 carreras, entre paréntesis el p10-p90:

| Métrica | 21 GP de 2026 | Con los 8 primeros |
|---|---|---|
| Vuelta rápida de carrera / pole | **1,041** (1,021-1,062) | 1,045 |
| Q1, primero a último | 3,24 s (2,49-4,83) | 3,3 s |
| Q1, P1 − P20 | 2,13 s (1,90-2,99) | — |
| P2 − P1 | 0,17 s (0,01-0,30) | ~0,1 (aprox.) |
| P10 − P1 | **1,39 s** (0,93-2,19) | ~0,6-0,9 (aprox.) |
| Mejora Q1 → Q3, poleman / mediana del top 10 | 1,27 s (0,83-1,67) / 1,04 s | 1,28 s / — |
| Top 10 con Q3 peor que su Q2 | 1 de 10 (0-3) | ~1 (aprox.) |
| Compañeros, diferencia en clasificación | **0,31 s** (0,18-0,43) | ~0,2 (aprox.) |
| Gana el de la pole | **15 de 21 (71 %)** | 5 de 8 |
| Gana desde P4 o más atrás | **2 de 21 (10 %)** (Monza desde P19, México desde P5) | ~15 % (aprox.) |
| Doblados por carrera | **6,0** (0-12) | 7,5 |
| Abandonos por carrera | **4,0** (2-7) | 3,4 |
| Margen del ganador | med 4,4 / media 6,7 s | med 3,9 / media 7,0 |
| Spearman parrilla-final | 0,75 | ~0,7 (aprox.) |

Distancia del mejor tiempo de cada equipo a la pole en clasificación (%, mediana de las secas), por tercios del año:

| Equipo | GP 1-7 | GP 8-14 | GP 15-21 |
|---|---|---|---|
| Mercedes | 0,00 | 0,01 | 0,01 |
| Ferrari | 0,39 | 0,27 | 0,24 |
| Red Bull | 0,46 | 0,55 | **0,21** |
| McLaren | 0,44 | **0,22** | 0,45 |
| Racing Bulls | 1,85 | 1,33 | 1,00 |
| Alpine | 1,54 | 1,89 | 1,02 |
| Audi | 1,80 | 1,52 | 1,61 |
| Haas | 2,28 | 2,32 | 2,16 |
| Williams | 2,42 | 2,84 | 2,44 |
| Aston Martin | 4,36 | 4,11 | 3,12 |
| Cadillac | 3,86 | 4,28 | 3,69 |

Mercedes hace la pole en casi todas las clasificaciones secas, pero su ventaja sobre Ferrari, Red Bull y McLaren baja a
0,2-0,45 % a lo largo del año (Red Bull gana 4 de las últimas 6 carreras); Racing Bulls, Alpine y Aston Martin mejoran
mucho. Con estas carreras se recalibraron los coches (`scripts/auditoria/rendimiento-2026.md`).

## Resumen

Lo que está bien hecho es mucho y se nota: reglamento (partes de la clasificación, puntos de carreras acortadas,
2 h / 3 h, parque cerrado, devolución de juegos, regla de dos compuestos), frecuencia de neutralizaciones y banderas
rojas, abandonos, duración de las carreras, pérdida en boxes, salida y primera vuelta, el comportamiento en mojado y
la cantidad de adelantamientos de 2026.

Lo que más aleja la simulación de la F1 real, por orden de gravedad:

1. **La carrera va casi al ritmo de la clasificación.** La vuelta rápida de carrera sale a +0,5 % de la pole; en 2026
   es +4,1 %. Y los libres igualan o baten la pole. *Hecho (PR #42).*
2. **La clasificación no evoluciona.** El poleman mejora 0,17 s de Q1 a Q3; en 2026, 1,27 s. En casi la mitad de los
   casos el tiempo de Q3 es peor que el de Q2. *Hecho (PR #43).*
3. **Neumáticos: demasiada diferencia entre compuestos y casi nada de degradación progresiva.** ~1 s por escalón
   (real 0,3-0,6 s) y el duro apenas cae hasta un precipicio brusco. De ahí salen el abuso del blando y el poco duro. *Hecho (PR #44 y #45; el duro en las pistas frías, en «Pendiente»).*
4. **La parrilla está demasiado apretada.** 1,2 s de primero a último en Q1 (real 2026: 3,2 s); 1,3 doblados por carrera
   (real 2026: 6,0). *Hecho (PR #46; los doblados, en «Pendiente»).*
5. **Los coches son metrónomos.** σ vuelta a vuelta en aire limpio de 0,05 s (real 0,2-0,3 s). *Hecho (PR #46).*
6. **Resultados demasiado abiertos en cabeza.** La pole gana el 31 % (real 2026: 15 de 21) y el 35 % de las victorias
   salen de P4 o más atrás (real 2026: 2 de 21). *En parte hecho (sección 5): con el banco ya corregido, la pole pasa
   del 21 % al 34 % y desde P4+ del 44 % al 32 %. La sprint estaba bien: el 83 % salía de un fallo del banco. Con lo de «Pendiente», la pole gana el 44 %.*
7. **Un fallo de la IA**: con lluvia prevista que no llega, varios coches acaban **descalificados** por no usar dos
   compuestos de seco. *Hecho (PR #41).*
8. Menores: coche de seguridad y virtual demasiado lentos, libres con la mitad de vueltas (la «sprint demasiado
   previsible» era un fallo del banco: ver sección 5). *Hecho (secciones 6 y 7).*

## 1. Carrera frente a clasificación

| Métrica | Simulador (seco, 96) | Real 2026 (21 GP) | Veredicto |
|---|---|---|---|
| Vuelta rápida de carrera / pole | **1,005** (p10 0,996, p90 1,014) | **1,041** (1,021-1,062) | ✘ muy lejos |
| Carreras con vuelta rápida más rápida que la pole | 13 % (10 de 80 con clasificación y carrera secas) | 0 | ✘ |
| Vuelta verde típica del top 10 / pole | 1,031 | ~1,07-1,08 (aprox.) | ✘ |
| Vuelta media del ganador (con boxes y SC) / pole | 1,093 | 1,11 (6 GP sin roja) | ≈ (compensa el SC lento) |
| Duración de la carrera | 91 min | ~91 min (mediana) | ✔ |

Ejemplo, Silverstone semilla 1: pole 1:27.921, vuelta rápida 1:28.291 (VER, blando de 4 vueltas con 21 kg). En la real
de 2026: pole 1:28.111, vuelta rápida 1:31.777.

**Causa.** El ritmo «Normal» de carrera (`PUSH_GRIP[2] = 1`) solo está un 1,1 % de agarre por debajo del «Al límite» de
la clasificación (`PUSH_GRIP[4] = 1,011`, `src/sim/session.ts:18`), unas 0,4 s en Silverstone. La IA va en Normal por
defecto (`strategy.ts:713`) y sube a Atacar o Al límite en las peleas, en la vuelta de entrada y en la última. No hay
un «modo clasificación» del motor y la batería: en 2026 la gestión de energía en carrera es justo lo que más separa las
dos cosas (las fuentes de 2026 coinciden en que la clasificación es donde se exprime todo). Tampoco existe el pico de
agarre de la primera vuelta de un blando nuevo.

**Efecto en libres.** Las tandas de clasificación de los libres van en el mismo modo 4 (`session.ts:2089`) con el mismo
combustible que la clasificación. El mejor tiempo de libres queda a +0,24 s (L1), +0,28 s (L2) y +0,41 s (L3) de la pole,
y **en el 26 % de los fines de semana el mejor de L2 bate la pole (el 15 % el de L3)**. En la F1 real, L1 suele quedar
a 1-1,5 s, L2 a 0,6-1 s y L3 a 0,4-0,8 s de la pole (aprox.), y batirla no pasa casi nunca. En Barcelona semilla 1,
Russell hace 1:15.166 en L3 y la pole es 1:15.239.

## 2. Clasificación

| Métrica | Simulador (seco, 88) | Real | Veredicto |
|---|---|---|---|
| Mejora Q1 → Q3 | 0,17 s (top 10) | **1,27 s** el poleman, 1,04 s el top 10 (2026: 0,83-1,67) | ✘ |
| Pilotos del top 10 con Q3 peor que su Q2 | **4,6 de 10** | 1 de 10 (2026) | ✘ |
| Q1, primero a último | **1,23 s** | **3,24 s** (2026: 2,5-4,8) | ✘ |
| P2 − P1 (mediana) | 0,037 s | 0,17 s (2026) | ✘ |
| P10 − P1 | 0,93 s | 1,39 s (2026) | ✘ algo corto |
| Corte de Q1 (P16-P17) | 0,023 s | ~0,03-0,05 (aprox.) | ✔ |
| Uno de los 8 de cabeza cae en Q1 | 19 % de sesiones | frecuente con el 2.º de Red Bull (aprox.) | ✔ |
| Compañeros, diferencia mediana | 0,12 s | 0,31 s (2026) | ✘ |
| Bandera roja | 8 % (seco) | ~15-25 % (2026: Melbourne, varias en libres) | ≈ algo baja |
| Pole frente a la real calibrada (seco) | +0,10 s (σ 0,58) | — | ✔ |
| Neumáticos | blando en las tres partes | igual | ✔ |

**Causa.** La evolución de la pista es mínima: cada vuelta suma 0,0009 de goma (`session.ts:2036`) y la goma vale
como mucho un 1,8 % de agarre (`session.ts:1532`): en una clasificación entera, ~0,1 s. Falta lo demás que hace bajar
los tiempos de verdad: pista que se engoma más deprisa en clasificación, pilotos que van cogiendo el límite y los
modos de motor que se reservan para Q3. Con tan poca evolución, la mejor vuelta de cada parte es ruido alrededor del
mismo valor.

La **dispersión de Q1** viene de los datos: la fórmula de ritmo (`session.ts:772`) con `agarre` de −1,6 a +1,6 da
±0,9 % de agarre por equipo, y con los pilotos sale ~1,2 s de primero a último. En 2026, Cadillac y Aston Martin están a
2,5-3,5 s del poleman y la parrilla abarca más del triple.

**Sprint (24 clasificaciones sprint):** SQ1 y SQ2 con medios y SQ3 con blandos, como manda el reglamento, así que la
mejora SQ1 → SQ3 sí sale (0,82 s), porque la da el cambio de compuesto.

## 3. Neumáticos y estrategia

Curvas del propio modelo (lo que pierde cada compuesto frente a un blando nuevo, desgaste real, `deg.ts`):

| Circuito | Medio − blando (nuevos) | Duro − medio | Precipicio S / M / H (vuelta) | Degradación lineal S / M / H (s/v) |
|---|---|---|---|---|
| Silverstone | 0,97 s | 0,98 s | 16 / 30 / 46 | 0,10 / 0,03 / 0,011 |
| Baréin | 0,86 | 1,11 | 8 / 18 / 34 | 0,23* / 0,055 / 0,018 |
| Suzuka | 1,39 | 1,45 | 17 / 28 / 40 | 0,11 / 0,037 / 0,017 |
| Barcelona | 0,70 | 0,76 | 11 / 24 / 41 | 0,17 / 0,039 / 0,015 |
| Monza | 0,55 | 0,66 | 14 / 29 / 51 | 0,08 / 0,020 / 0,007 |
| Mónaco | 0,87 | 0,93 | 18 / 39 / 64 | 0,08 / 0,020 / 0,008 |

\* Baréin S: antes del precipicio en la vuelta 8.

- **Diferencia entre compuestos ~2-3 veces la real.** La base de agarre es 1,000 / 0,973 / 0,955 (`tyres.ts:45-47`):
  un 2,7 % y un 1,9 %. El comentario dice «~2,5 % de agarre = ~1 s por vuelta», pero un escalón de Pirelli suele valer
  0,3-0,6 s (aprox.). En Suzuka el duro sale casi 3 s más lento que el blando.
- **Degradación progresiva demasiado baja y precipicio demasiado brusco.** En carrera, corregida de combustible y con el
  mismo modo de ritmo: blando 0,046, medio 0,019 y duro 0,009 s/vuelta (medianas), frente a ~0,08-0,20, 0,04-0,10 y
  0,02-0,07 reales (aprox.). Las tandas duran lo que deben (blando 15,5 vueltas, medio 27, duro 32) porque las corta el
  precipicio, no porque el neumático vaya cayendo. Pasado el precipicio se pierden hasta 5 s por vuelta y el pinchazo se
  dispara por encima del 96 % de desgaste.
- **Consecuencias en la estrategia** (carreras en seco):
  - el 70 % de los que acaban usan blandos y solo el 36 % duros. Salen con medio el 52 %, con blando el 28 % y con duro
    el 20 %; en la F1 real se sale casi siempre con medio y el duro es el neumático de carrera;
  - duro en Silverstone 1 %, Spa 0 %, Suzuka 0 %, Shanghái 0 % y Las Vegas 0 % de los pilotos: justo los circuitos donde
    en la realidad se corre con el duro;
  - estrategias raras para cumplir la regla, como blando-blando-medio con un último medio de 4 vueltas (Spa).
- Lo que está bien: 1,44 paradas de media (1 parada 64 %, 2 paradas 33 %), pérdida en boxes medida de 19,4 s de mediana
  (coincide con la configurada en cada circuito, ±1,5 s), vuelta rápida al final de la carrera con neumático fresco,
  efecto del combustible de 0,015-0,026 s/kg según el circuito (real ~0,03, aprox.).

## 4. Dispersión y regularidad

| Métrica | Simulador | Real | Veredicto |
|---|---|---|---|
| σ vuelta a vuelta, aire limpio, mismo modo (residuo de la tendencia) | **0,054 s** | ~0,2-0,3 s (aprox.) | ✘ |
| Doblados por carrera | **1,3** | **6,0** (2026: 0-12) | ✘ |
| Primero a décimo | 44,6 s | ~45-75 s (aprox.) | ≈ algo corto |
| Margen del ganador | med 3,9 / media 6,3 s | med 4,4 / media 6,7 (2026) | ✔ |

El ruido es una gaussiana por minisector con σ = 0,35 % × (1,25 − regularidad) (`session.ts:1760`). Al sumarse unos 40
minisectores independientes, se promedia y en la vuelta queda en centésimas: con el mismo modo de ritmo, Russell hace
90,51 · 90,52 · 90,48 · 90,55. Lo que mueve de verdad los tiempos son los cambios de modo de la IA (±0,7 s entre
Conservar y Normal), en escalones, no la variación de un piloto.

Los pocos doblados salen de la parrilla apretada (punto 2) sumada a lo poco que pierden en carrera los coches lentos.

## 5. Resultados de carrera

| Métrica | Simulador (seco, 96) | Real | Veredicto |
|---|---|---|---|
| Gana el de la pole | **31 %** | 15 de 21 en 2026 (71 %); ~45-50 % en 2022-25 (aprox.) | ✘ |
| Gana alguien desde P4 o más atrás | **35 %** | 2 de 21 en 2026 (10 %: Monza desde P19, México desde P5) | ✘ |
| Spearman parrilla-final | 0,69 | 0,75 (2026) | ✔ |
| Cambios de puesto en la primera vuelta (suma de \|Δ\|) | 51 | ~40-60 (aprox.) | ✔ |
| Adelantamientos | ×2,4 la media 2022-25 de cada circuito (calibrado así) | 2026: ×2-4 sobre 2025 (Australia 45→120, China 72→146, Japón 28→106) | ✔ |

Remontadas que en la realidad son excepcionales salen a menudo: Piastri gana desde P22 en Las Vegas (cuatro coches de
seguridad), Russell desde P16 en Bakú, Hadjar gana dos de cuatro en Bakú, Gasly gana Hungría desde P8. Se juntan tres
cosas: los cuatro primeros equipos van casi iguales en los datos (puesto medio en clasificación: RUS 3,0, ANT 3,3,
VER 3,6, LEC 4,5), en 2026 se adelanta mucho y la estrategia cambia mucho de unos a otros por los neumáticos (punto 3).
El volumen de adelantamientos está bien. Lo que habría que revisar es que la ventaja de ritmo en cabeza sea la de
2026 (Mercedes claramente por delante al principio del año).

### Punto 6: lo que se ha hecho (26 de noviembre de 2026)

**Primero, un fallo del banco.** `gp.ts` (y `scripts/banco.ts`, que usan `realismo.ts` y los demás scripts) jugaba los
24 circuitos con la misma semilla de fin de semana. Los circuitos no traen la ronda, así que todas las sesiones de una
misma semilla compartían los dados del principio. En la salida eran los mismos para cada puesto de parrilla en los 24
circuitos: con una semilla la pole conservaba el liderato en la vuelta 1 en 41 de 41 carreras, y con otra lo perdía en
casi todas. El juego no tiene el problema, porque usa una semilla por ronda. Ahora cada circuito tiene la suya. Las
medias de ritmo, neumáticos o neutralizaciones apenas se movían, pero todo lo que depende de la salida y del orden en
cabeza estaba sesgado. Con el banco corregido, la situación de partida era peor de lo que decía la tabla de arriba:

| Métrica (carrera en seco; 72 fines de semana, semillas 1-3) | Antes | Después | Real 2026 |
|---|---|---|---|
| Gana el de la pole | **21 %** | **34 %** | 71 % |
| Gana alguien desde P4 o más atrás | **44 %** | **32 %** | 10 % |
| La pole lidera tras la vuelta 1 | 81 % | 84 % | ~70-80 % (aprox.) |
| El compañero que sale delante acaba delante | 56 % | **66 %** (71 % en los equipos de cabeza) | 70 % (106 de 152) |
| La pole acaba delante de su compañero | 61 % | 76 % | 94 % (17 de 18) |
| Compañeros en clasificación, diferencia mediana | 0,29 s | 0,29 s | 0,31 s |
| Spearman parrilla-final | 0,76 | 0,79 | 0,75 |

Sin cambios fuera de esto: vuelta rápida / pole 1,044, vuelta verde / pole 1,071, paradas 1,31 → 1,36, uso del duro
73 %, adelantamientos 77 → 74 por carrera, coche de seguridad, abandonos, pole frente a la real, mejora de Q1 a Q3.
`scripts/realismo.ts` (24 circuitos × 3 carreras, también con una semilla por circuito) sigue todo dentro de margen; ahí
la pole pasa del 33 % al 38 % y desde P4+ del 28 % al 24 %.

**Por qué perdía la pole** (`scripts/auditoria/cabeza.js`, que mide cómo se decide la victoria):

- **Con el duro desde delante.** Una de cada cuatro poles salía con duro y ganaba el 11 % (con medio, el 24 %): perdía
  puestos en la arrancada y su primera tanda larga le dejaba el undercut a los de detrás. El planificador le cobraba al
  duro 1,2 s en la salida, saliera de donde saliera.
- **El undercut.** Parar antes que el de delante (en pareja a menos de 4 s) ganaba 0,7 s parando una vuelta antes,
  2,2 s con dos y 3,2 s con tres, y salía bien el 60-75 % de las veces. El líder solo reaccionaba cuando el otro ya había
  parado, y entonces solo si aún le daba para salir delante; si no, alargaba la tanda. Casi todos los que le ganaban la
  posición a la pole en la ventana de paradas habían parado antes que ella.
- **El de delante en un modo de ritmo más bajo.** Era el caso más frecuente en los adelantamientos al líder (un 32 %):
  el de detrás pasaba a Atacar a 1,3 s y el de delante solo se defendía a 1,0 s.
- **La clasificación decía poco del domingo.** La pole era el coche con mejor ritmo de carrera solo en el 17 % de las
  carreras. Entre compañeros, la clasificación era azar de esa vuelta y la carrera, azar aparte. En 2026, la
  diferencia de 0,3 s entre compañeros del sábado sigue el domingo.

**Cambios:**

1. **Salir con el duro desde las primeras filas cuesta más en el planificador** (`START_FRONT` en `strategy.ts`): 4 s
   más desde la pole, y menos cuanto más atrás, hasta nada desde la undécima. Ninguna pole sale ya con duro (antes, el
   26 %).
2. **Prioridad del de delante** (`strategy.ts`, «cubrir»): con un rival de su vuelta a tiro de undercut detrás
   (2 × lo que ganan las gomas nuevas por vuelta + 0,5 s, entre 1 y 4 s), con gomas de la misma edad y la ventana de su
   parada a 1-3 vueltas, para antes que él (con más probabilidad cuanto mejor es el muro). El undercut de una vuelta
   deja de valer nada (sale bien el 48 %). Los de dos o tres vueltas siguen valiendo 2-3,7 s: el que va delante no
   siempre los ve venir, porque solo mira a 1-3 vueltas de su parada.
3. **Defensa simétrica** (`aiModes`): el de delante pasa a Atacar con uno a menos de 1,3 s detrás, la misma distancia
   con la que ataca el de detrás, sin saltarse el límite de las gomas ni el del combustible.
4. **Forma del fin de semana** (`FORM` en `weekend.ts`): cada piloto tiene un ritmo propio en cada fin de semana
   (σ 0,15 % de agarre, ~0,13 s por vuelta), el mismo en libres, clasificación y carrera. Sale de la semilla y del
   piloto, sin tocar el azar de las sesiones. Para que los compañeros sigan a ~0,3 s en clasificación, el ruido de cada
   vuelta en clasificación baja al 85 % (`QUALI_NOISE` en `session.ts`).

**Lo que se probó y no ayudó:**

- Defenderse al ritmo del de detrás aunque las gomas no lo aguanten: la pole gana menos, porque el líder gasta las gomas,
  hace más paradas y luego le hacen el undercut.
- Juntar los modos de ritmo (Conservar a −0,9 % en vez de −1,7 %, Atacar a +0,4 % en vez de +0,6 %): sin efecto medible.
- Una forma más fuerte (σ 0,2 % con el ruido de clasificación al 45 %): poco más, con los compañeros a 0,22 s y la pole
  0,3 s más rápida que la real.

**Lo que queda.** `scripts/auditoria/repite.ts` juega la misma carrera con 6 semillas y la misma parrilla. Con el
código de los cambios 1 y 2, la pole gana el 28 % y en 7 de 24 fines de semana no gana ninguna de las seis. En
Mónaco, Russell desde la pole gana 2 de 6: dos veces le pasa su compañero en la vuelta 1, y una vez gana Hamilton
alargando la tanda con un virtual. El azar de la carrera entre coches parecidos (salida, ciclo de paradas,
neutralizaciones) pesa más que la diferencia entre ellos. Lo siguiente sería medir, con `repite.ts`, cuánto pesa cada
uno, empezando por la salida en los circuitos donde casi no se adelanta y por lo que gana cada estrategia en el ciclo de
paradas. Y comprobar si los cuatro primeros equipos deben ir más separados en carrera que en clasificación: la
recalibración con 2026 solo usó tiempos de clasificación.

## 6. Neutralizaciones, abandonos y sanciones

| Métrica | Simulador (seco, 96) | Real | Veredicto |
|---|---|---|---|
| Carreras con coche de seguridad | 52 % | ~55 % 2022-25 (aprox.); 2 de 8 en 2026 | ≈ |
| Carreras con virtual | 46 % | 7 de 8 en 2026 | ≈ algo bajo para 2026 |
| Carreras con bandera roja | 11 % | ~10 % (aprox.); 2 de 8 en 2026 | ✔ |
| Vueltas detrás del coche de seguridad | 5,2 | ~4-5 (aprox.) | ✔ |
| Vuelta entera con coche de seguridad / vuelta verde | **1,87** | ~1,4 (aprox.) | ✘ |
| Vuelta entera con virtual / vuelta verde | **1,53** | ~1,3-1,35 (aprox.) | ✘ |
| Abandonos por carrera | 3,16 | 4,0 (2026: 2-7) | ≈ algo bajo |
| Reparto de abandonos | 73 % averías, 27 % accidentes | 2026: mayoría mecánicos (frenos, hidráulica, ERS) | ✔ para 2026 |
| Toques por carrera | 0,64 | — | probablemente bajo |
| Sanciones por carrera | 1,06 (límites 37, toques 28, salida insegura 16, pit-lane 10…) | ~1,5-2,5 (aprox.) | ≈ algo bajo |

El coche de seguridad lleva al líder a como mucho el 50 % de la velocidad de referencia y 180 km/h, y al resto al
50-62 % y 223 km/h (`session.ts:1628-1631`). El virtual limita al 60 % en todo el circuito (`session.ts:1623`). Las dos
cosas frenan también en las curvas lentas, donde en la realidad casi no se pierde. Lo que cuesta parar con ellos sale
bien (aprox. la mitad de una parada en verde), porque las dos cosas se compensan. Lo que sale mal es la duración: una
vuelta con coche de seguridad dura casi el doble que una verde.

**Hecho (26 de noviembre de 2026).**
- **Tope por circuito.** Ya no se limita a un porcentaje de la velocidad en todo el circuito: cada uno tiene un tope de
  velocidad, sacado de su perfil de velocidades (`NEUTRAL_LAP` en `session.ts`).
  - Con el tope, la vuelta dura ~1,3 veces la de referencia con el virtual y ~1,4 detrás del coche de seguridad. El que
    va lejos del grupo, ~1,2, para alcanzarlo.
  - Por encima del tope se va a su velocidad y por debajo, como en verde. Así se pierde en recta y casi nada en las
    curvas lentas.
  - Topes: 126-190 km/h detrás del coche de seguridad (Mónaco y Monza) y 141-210 km/h con el virtual.
- **Coste de parar.** La IA lo calcula con esos mismos topes (`pitLossUnder` en `strategy.ts`), en vez del 45 % (coche
  de seguridad) y el 60 % (virtual) fijos. Sale el 70-87 % de una parada en verde con el coche de seguridad y el 77-91 %
  con el virtual. Las referencias que hay dan ~70 % y 60-80 %.
- Además, al líder se le aplicaba el límite dos veces.

| Métrica (72 fines de semana en seco) | Antes | Después | Real (aprox.) |
|---|---|---|---|
| Vuelta con coche de seguridad / verde | 1,89 | **1,43** | ~1,4 |
| Vuelta con virtual / verde | 1,58 | **1,33** | ~1,3 |
| Paradas por piloto | 1,35 | 1,16 | — |
| Gana la pole / desde P4+ | 34 % / 30 % | 39 % / 22 % | 71 % / 10 % (2026) |
| Adelantamientos por carrera | 73 | 70 | ×2-4 sobre 2025 |

Parar con neutralización sale menos barato que antes, así que se para menos aprovechándolas: hay menos 2 paradas y
algo menos de lotería en el resultado. `realismo.ts` sigue todo dentro de margen.

## 7. Libres

| Métrica | Simulador | Real (aprox.) | Veredicto |
|---|---|---|---|
| Vueltas por piloto en L1 / L2 / L3 | **15 / 15 / 6** | ~25 / ~28 / ~18 | ✘ |
| L3: los 22 pilotos con exactamente 6 vueltas | sí, en todas las semillas | no | ✘ |
| Tandas largas registradas | ~22 en L1 y L2 | — | ✔ |
| Pendiente de las tandas largas | S 0,12-0,17, M 0,03-0,04 s/v | — | coherente con el modelo |
| Banderas rojas en libres | 4-11 % | ~10-20 % | ✔ |

El programa de la IA (`strategy.ts:814`) es fijo y corto: L1 = 1 vuelta de instalación, una tanda de 7-11 vueltas y
dos vueltas lanzadas; L2 = dos lanzadas y una tanda de 9-13; L3 = dos salidas de 1-2 lanzadas. Se queda en la mitad de
rodaje que la realidad y, en L3, todos hacen lo mismo.

**Hecho (26 de noviembre de 2026).** Programas más largos y con salidas que dependen del azar (`practiceProgram`):
- **L1:** salidas de reglajes con medio y una segunda tanda larga con otro compuesto.
- **L2:** reglajes, dos simulaciones de clasificación y dos tandas largas.
- **L3:** reglajes, dos o tres salidas con blando y, la mitad de las veces, una tanda con medio.

Vueltas por piloto: **24 / 23 / 14** (antes 15 / 15 / 6). En L3, entre 7 y 20 según el piloto.

Tres efectos secundarios, ya corregidos:
- **Goma en pista:** con tantas vueltas, la pista llegaba a la clasificación con el tope de goma. La de cada vuelta de
  libres baja en proporción (`RUBBER_FP_LAP`).
- **Blandos para Q3:** a casi todos les quedaba un solo juego nuevo para Q3, porque el que iba justo en Q2 gastaba uno de
  los dos que se guardan. Ya no lo gasta (`qualiSet`). Q3 peor que su Q2: de 3,2 a **1,3 de 10** (real ~1).
- **Libres frente a la pole:** el mejor de L1 / L2 / L3 queda a 1,6 / 0,9 / 0,7 s, y L3 bate la pole el 2 % de las veces
  (antes, el 13 %).

## 8. Sprint (24)

| Métrica | Simulador | Real (aprox.) | Veredicto |
|---|---|---|---|
| Paradas | 0,01 | ~0 | ✔ |
| Neumáticos | medio 76 %, blando 22 %, duro 2 % | mayoría medio, algún blando | ✔ |
| Gana el de la pole | **83 %** (con el fallo de semillas del banco; corregido, 61 %, y con los cambios del punto 6, 70 %) | ~50-60 % | ✔ (≈ tras el punto 6) |
| Adelantamientos (sin la primera vuelta) | 10,6 por sprint (0,5 por vuelta, frente a 1,4 en carrera) | más, en 2026 | ✘ probable |
| Vuelta rápida / pole sprint | 1,009 | ~1,02-1,03 | ✘ (punto 1) |
| Coche de seguridad / bandera roja | 38 % / 13 % | ~30 % / ~5 % | ≈ |

En la sprint todos van con el mismo neumático y sin paradas, así que no hay diferencias de goma que valgan un
adelantamiento: el de la pole se escapa.

Con el banco corregido (sección 5) y los 24 circuitos en formato sprint (los que no la tienen, a 100 km), 46 sprints
en seco: la pole gana el 61 % (tras el punto 6, el 70 %), lidera la vuelta 1 el 80 %, y cuando pierde es en la salida
(la mitad de las veces) o en pista. Hay 14-15 adelantamientos por sprint después de la vuelta 1, y el duro se usa
el 14-19 %.

## 9. Lluvia (40 fines de semana, 25 carreras mojadas)

Funciona bien:
- relación con la pole seca: intermedio 1,13-1,22 y lluvia 1,18-1,27 (Interlagos 2024: 1,21 en mojado de verdad);
- los equipos cambian a intermedios en bloque, con σ de 0,4-1,5 vueltas en el momento del cambio, y vuelven a slicks
  igual;
- salidas detrás del coche de seguridad con mucha agua, rojas por lluvia (23 % de las carreras mojadas) y salida parada
  tras ellas;
- clasificaciones mojadas con intermedios y de lluvia, y el que tiene un tiempo seco a tiempo, arriba;
- carreras mixtas con 2-4 paradas.

Para revisar:
- **Ganadores sorpresa muy frecuentes:** Hülkenberg desde P17, Gasly desde P19, Albon desde P15 en Mónaco, Leclerc
  desde P21 y Antonelli desde P15. Son 6 de ~25 carreras mojadas, el 24 %. Pasa en la realidad, pero bastante menos.
  *Con el banco corregido (sección 5) es 1 de 24: Lindblad desde P9. Ya está bien.*
- **Las averías no bajan con el agua:** las carreras mojadas tienen las mismas averías que las secas, pero los
  accidentes casi no suben (29 en 40 carreras, frente a 58 en 96 en seco). *Con el banco corregido, los accidentes
  suben: 1,2 por carrera con agua, frente a 0,66 en seco. Las averías se quedan en 2,5 frente a 2,2.*
- **Escenario «Estable» con lluvia:** en el 10 % de los fines de semana «Estable» llueve en alguna sesión. Bakú,
  Shanghái, México y Suzuka tuvieron la clasificación mojada con el escenario seco. *Hecho:*
  - Las células que nacen durante un día estable salen flojas y pocas, como las de primera hora (`SECO_BIRTH` en
    `weather.ts`). Antes nacían ~0,014 por minuto con toda su fuerza.
  - Los días «Estable» con un chaparrón sobre el circuito a la hora de la clasificación bajan del 17 % al ~5 % (1 % en
    el desierto, 10 % en Singapur). Lo mide `scripts/auditoria/tiempo.ts`.
  - Antes, la clasificación salía mojada en uno de cada ocho fines de semana secos.

### Fallo: descalificaciones por la regla de los dos compuestos

En Spa con chubascos (semilla 32) **Hamilton, Norris, Lawson y Bearman acaban descalificados**. Su plan era
blando → blando (vuelta 17-20) → medio en la vuelta 40, para cumplir la regla. En la vuelta 40 se anuncia lluvia y la
parada no se hace nunca.

En `strategy.ts:650` está la red de seguridad (`needRule && left <= 6` → parar), pero justo debajo, en `strategy.ts:655-658`,
si la previsión da más del 55 % de lluvia y el agua aún no está cerca del cruce, `if (wear < 0.86) return null` cancela
la parada, aunque sea la obligatoria. Si la lluvia no llega a tiempo, la carrera se acaba sin el segundo compuesto. En la
F1 real esto no pasa. Arreglo: que la espera por lluvia no anule una parada por la regla (`why === "regla"`), o que en
ese caso se monte el intermedio si hay agua o el otro compuesto de seco si no.

## Recomendaciones, por impacto

1. **Separar el ritmo de carrera del de clasificación.** Un modo de clasificación del motor y la batería que solo exista
   en las vueltas lanzadas de clasificación (y no en las de libres), y un ritmo normal de carrera ~2,5-3,5 % por debajo
   del de la pole con poco combustible. Objetivo: vuelta rápida / pole ≈ 1,04-1,05 y L3 a 0,4-0,8 s de la pole.
2. **Evolución en clasificación** de ~0,8-1,3 s de Q1 a Q3: más goma por vuelta en clasificación y/o un factor de
   «coger el límite» por parte. Objetivo: Q3 peor que Q2 en como mucho 1-2 de 10.
3. **Rehacer la escala de compuestos:** ~1,0-1,3 % de agarre por escalón (0,4-0,6 s), más degradación lineal (sobre todo
   medio y duro) y un precipicio más suave. Volver a calibrar la estrategia. Objetivo: el duro como neumático de carrera
   (60-75 % de uso), salida mayoritaria con medio y blando por debajo del 40 %.
4. **Abrir la parrilla** a la dispersión de 2026 (~3 s en Q1) y revisar la ventaja entre los equipos de cabeza.
   Objetivo: 5-8 doblados y la pole ganando ~50 %.
5. **Ruido vuelta a vuelta** que no se promedie: una componente por vuelta (no solo por minisector) de σ ~0,15-0,25 s,
   menor para los más regulares.
6. **Arreglar las descalificaciones por la regla** (`strategy.ts:655-658`).
7. Coche de seguridad y virtual: limitar el delta de tiempo por tramo en lugar de un tope de velocidad del 50-60 % en
   todo el circuito. Objetivo: 1,4 y 1,3 veces la vuelta verde.
8. Programas de libres más largos y variados (dos tandas largas en L2, más salidas en L3).

Antes y después de cualquier cambio conviene pasar `scripts/realismo.ts` (ya mide neutralizaciones, abandonos,
adelantamientos y márgenes) y este banco, que añade ritmo frente a la pole, evolución de clasificación, degradación,
regularidad, doblados, uso de compuestos y libres.

## Lo pendiente: lo que se ha hecho (26 de noviembre de 2026, segunda tanda)

Medido con el banco: la referencia es el código de antes (48 fines de semana en seco, semillas 1-2) y lo nuevo, 96
(semillas 1-4). Salida de los analizadores en `scripts/auditoria/base-2026-11c/`.

| Métrica (carrera en seco) | Antes | Ahora | Real 2026 |
|---|---|---|---|
| Duro en Shanghái / Suzuka / Spa / Las Vegas | 0 / 0 / 6 / 22 % | 73 / 64 / 38 / 63 % | medio y duro |
| Usa el duro / el blando (todas) | 76 / 29 % | 91 / 14 % | — |
| Paradas por coche | 1,18 | 1,16 | — |
| Doblados por carrera (media / mediana) | 3,9 / 4 | 5,5 / 6 | 6,0 / 8 |
| Pole − pole real (mediana en seco) | −0,42 s | +0,02 s | 0 |
| Gana la pole | 35 % | 44 % | 71 % |
| Gana desde P4 o más atrás | 24-27 % | 28 % | 10 % |
| Adelantamientos por carrera (sin la primera vuelta) | 72 | 74 | (calibrado así) |

**1. El duro en las pistas frías** (`src/sim/tyres.ts`). Tres cambios:
- **Graining con un umbral común.** Los tres compuestos de seco se rasgan por debajo de la temperatura del medio del
  circuito menos 12 °C, y lo que los distingue es su tendencia (`grainK`, más en los blandos). Antes cada uno tenía la
  suya (su óptima − 12 °C) y en frío el que más se rasgaba era el duro: en Las Vegas, 0,48 frente a 0,06 del medio.
  En la F1 real es al revés.
- **Más graining en carrera** (`GRAIN_GEN` × 3). Con la goma ya puesta y sin apretar, el graining se quedaba en un 0,3 %
  de agarre, y en frío el blando aguantaba como neumático de carrera (blando-medio en las cuatro pistas). Ahora, en
  una pista fría, le cuesta al blando ~1 %.
- **Menos pérdida por debajo de la ventana** (`COLD_LOSS`, de 0,075 a 0,05). El tren delantero va 20-30 °C por debajo de
  la ventana del duro en casi todos los circuitos, no solo en los fríos. Por eso este coeficiente decide el uso del duro
  en todo el calendario: con 0,03, el duro pasaba del 90 % en las pistas templadas y los adelantamientos bajaban a la
  mitad. 0,05 es el compromiso.

Los adelantamientos bajaban con esto, porque hay menos diferencias de goma. Se recalibró el umbral de cada circuito
(`scripts/calibra.ts --objetivos=…`): con el código viejo y sus umbrales se midió en `carrera.ts` cuántos adelantamientos
salían en cada circuito, y se buscó el umbral con el que el código nuevo da lo mismo. No se recalibró contra la media
real × 2,4, el objetivo original del script. Ese banco (parrilla por ritmo) ya daba con el código viejo bastante menos
que esos objetivos (Austin 65 frente a 106), y recalibrar contra ellos habría disparado los adelantamientos del fin de
semana, que estaban bien.

**2. Pocos doblados** (`ritmoCarrera` en `data/equipos-2026.json`). Primero, una corrección del diagnóstico: casi
toda la diferencia que se había medido entre clasificación y carrera (Williams a 2,9 % del mejor el sábado y a 1,8 % el
domingo) era de la medida. El que cae en Q1
hace su vuelta con la pista más verde (la evolución de la clasificación, `QUALI_EVO`), y eso le suma ~0,8 % en la
clasificación. Comparando en la misma parte, el ritmo de carrera de cada equipo era el del sábado
(`scripts/auditoria/equipos.mjs`). Lo que faltaba era que la zona media perdiera más en carrera: en 2026, en las
carreras sin neutralizaciones, Racing Bulls, Alpine, Haas o Audi acaban a ~1,8 % del ganador (dobladas), cuando el
sábado van a ~1 % (`rendimiento/race.py`). Los cuatro de cabeza, en cambio, van en carrera tan cerca de Mercedes como
el sábado. Ahora los siete equipos que no son de cabeza pierden en carrera (y en la sprint) un 0,8 % de agarre más que
el sábado.
- **Lo que se probó antes:** multiplicar todas las diferencias entre equipos en carrera (× 1,4-2). Doblaba bien, pero
  separaba también a los de cabeza (Red Bull, McLaren y Ferrari a ~0,45 % de Mercedes) y Mercedes ganaba desde atrás
  cuando la pole era de otro.
- Una estimación de lo que pierde cada coche por vuelta (agarre y potencia con las sensibilidades del circuito) no
  separaba a Audi de McLaren, así que va como dato por equipo.

**3. La pole.** `poleObjetivo` es ahora siempre la pole real. En Suzuka, Sepang y Singapur se había movido a mano «para
que la pole simulada rondara la real», y Las Vegas tenía una estimación: 1:34.8, cuando la vuelta más rápida de la
clasificación de 2026 fue de 1:33.893. La corrección de cada circuito va en `poleAjuste` (s, se suma al objetivo de la
vuelta ideal en `buildTrack`). `scripts/auditoria/calibra-pole.mjs` la ajusta jugando libres y clasificación en seco
con 6 semillas por circuito (`pole.ts`). Se hicieron dos pasadas: tras la primera, el error mediano bajó de −0,34 s a
+0,02 s, con un solo circuito por encima de 0,3 s (Shanghái, −0,45 s; la segunda pasada lo corrigió a medias).

**4. El azar en cabeza: sigue pendiente.** La pole gana el 44 % (antes, el 35 %; en 2026, el 71 %), pero desde P4 o más
atrás se sigue ganando el 28 % (en 2026, el 10 %).
- **Cuando no gana la pole**, el ganador se le pone delante en la salida el 16 % de las veces, en boxes el 30 %, en
  pista el 44 % y por abandono de la pole el 10 %. A la pole la pasan en pista estando en cabeza en el 36 % de las
  carreras.
- **El equipo ya cuadra con 2026:** Mercedes hace la mitad de las poles y gana el 47 % (real 62 % y 57 %). Lo que no
  cuadra es que, con coches parecidos, la posición en pista vale poco: el líder se deja pasar y el ciclo de paradas
  cambia el orden.
- **Lo que se probó:** separar a los de cabeza en carrera (ver el punto 2). Con menos adelantamientos la pole ganaba
  más (52 %), pero era por eso: con los umbrales recalibrados volvía al ~40 %.
- **Lo siguiente sería mirar lo que defiende el líder** (el modo adelantamiento del que le sigue a menos de 1 s, el aire
  sucio a esa distancia) y el ciclo de paradas entre los de cabeza, con `repite.ts` y `cabeza.js`.

**De paso, un fallo.** Tras un pinchazo en un toque, el coche pedía un juego de medios. Si no le quedaba ninguno, no
pedía nada: seguía con el pinchazo hasta el final y le descalificaban por la regla de los dos compuestos (Spa, semilla
4). Ahora monta el que haya, mejor de otro compuesto que el que llevaba.

## Medida tras los cambios de 2026 (27 de noviembre de 2026)

Tras #49 llegaron a main dos commits directos que cambian la carrera (aero activa X/Z, modo adelantamiento real,
desarrollo ATR, la IA que pelea en duro y un ajuste de adelantamientos: `0f9cf4a` y `d19dfa8`) y el ATR del jugador
(#50). Se volvió a pasar el mismo lote (`lote.mjs hoy seco 1-4`, 96 fines de semana) para ver dónde queda lo pendiente.
Salida de los analizadores en `scripts/auditoria/base-2026-11d/`.

| Métrica (carrera en seco) | #49 (`base-2026-11c`) | Ahora (`base-2026-11d`) | Real 2026 |
|---|---|---|---|
| Gana la pole | 44 % | 39 % | 71 % |
| Gana desde P4 o más atrás | 29 % | 24 % | 10 % |
| Gana el que lidera tras la vuelta 1 | 46 % | 49 % | — |
| Cambios de líder por carrera (en pista / boxes) | 3,48 (1,42 / 1,98) | 3,04 (1,42 / 1,57) | — |
| Usa el duro / el blando (todas) | 91 / 14 % | 94 / 20 % | — |
| Duro en Shanghái / Suzuka / Spa / Las Vegas | 73 / 64 / 38 / 63 % | 67 / 69 / 67 / 80 % | medio y duro |
| Adelantamientos por carrera (sin la primera vuelta) | 74 | 81 | (calibrado así) |
| Doblados por carrera (media / mediana) | 5,5 / 6 | 5,7 / 6 | 6,0 / 8 |
| Pole − objetivo (mediana en seco) | +0,02 s | +0,02 s | 0 |
| Sprint: gana la pole | 55 % | 77 % | — |

- **El azar en cabeza sigue igual o algo peor** (la pole gana el 39 %). Cuando no gana la pole, el ganador se le pone
  delante en boxes el 44 % de las veces (antes el 30 %) y en pista el 29 % (antes el 44 %): ahora pesa más el ciclo de
  paradas que los adelantamientos. Mercedes gana el 63 % (real 57 %).
- **El duro, aún más usado** (94 %). En Spa sube del 38 al 67 %, que era lo que faltaba allí, pero en el resto ya casi
  todos lo llevan.
- **Adelantamientos:** suben de 74 a 81 por carrera. Mónaco baja a 3,3 (antes 7,3).
- Silverstone tiene un error de pole de +2,6 s (igual que en `base-2026-11c`), que el resto de circuitos no tiene.
  Habría que mirarlo con `pole.ts silverstone 1-6`.

**Temperatura del asfalto en Shanghái y Suzuka.** La simulación da 13-23 °C en carrera. Lo publicado de 2026 no se
pone de acuerdo: Honda da 16 °C de aire y 24 °C de asfalto en Shanghái (nublado) y 16/36 °C en Suzuka (nublado);
Ferrari.com, 27/38 °C en Shanghái y 14/19 °C en Suzuka. Shanghái cuadra con Honda; Suzuka, según la fuente, va bien o
unos 13 °C corta. No se cambia el clima con datos tan dispares.

## Pendiente (27 de noviembre de 2026)

- **El azar en cabeza** (punto 4 de la segunda tanda y la tabla de arriba): la pole gana el 39 %, desde P4+ el 24 %. Ahora
  lo que más la tumba es el ciclo de paradas entre los de cabeza (`repite.ts`, `cabeza.js`).
- **El duro, casi siempre** (94 % de los coches; el blando, 20 %). La raíz sigue siendo la misma: el modelo de
  temperatura mide la energía de cada curva relativa a la vuelta y no ve lo que exige cada circuito, así que el tren
  delantero va frío en casi todas partes y un solo coeficiente (`COLD_LOSS`) decide el duro en todo el calendario.
- ~~**Silverstone:** +2,6 s de error de pole.~~ **No era un fallo:** una de sus cuatro clasificaciones tuvo lluvia en
  la Q3 (pole de 99,1 s, con hasta 0,79 mm de agua) aun con el día «Estable», y la columna por circuito de
  `analiza.js` hacía la media de todas. En seco, −0,15 s. Ahora esa columna solo cuenta las clasificaciones secas.
- ~~**Mónaco:** 3,3 adelantamientos por carrera.~~ **Hecho:** umbral recalibrado de 2,2 a 1,04 con `calibra.ts monaco
  --clasif --carreras=10` contra su objetivo (8,8 reales × 2,4): 22,3 sin la primera vuelta. En el lote de auditoría,
  12 por carrera. Sigue siendo el más difícil: con 1-1,5 s/vuelta de ventaja se pasa un 10 % de las vueltas (en
  Silverstone, un 52 %), y hacen falta más de 2 s para tener opciones. Ya en la calibración original se quedaba en
  el 0,43 del objetivo.
- **Hungaroring**, algo bajo en el mismo banco (44,5 frente a 57,6 de objetivo).
- **Suzuka:** confirmar la temperatura del asfalto con una fuente fiable antes de tocar su clima.

## Fuentes

- Wikipedia, [temporada 2026](https://en.wikipedia.org/wiki/2026_Formula_One_World_Championship) y los 21 grandes premios
  disputados (por ronda): [1](https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix), [2](https://en.wikipedia.org/wiki/2026_Chinese_Grand_Prix), [3](https://en.wikipedia.org/wiki/2026_Japanese_Grand_Prix), [4](https://en.wikipedia.org/wiki/2026_Miami_Grand_Prix), [5](https://en.wikipedia.org/wiki/2026_Canadian_Grand_Prix), [6](https://en.wikipedia.org/wiki/2026_Monaco_Grand_Prix), [7](https://en.wikipedia.org/wiki/2026_Barcelona-Catalunya_Grand_Prix), [8](https://en.wikipedia.org/wiki/2026_Austrian_Grand_Prix), [9](https://en.wikipedia.org/wiki/2026_British_Grand_Prix), [10](https://en.wikipedia.org/wiki/2026_Belgian_Grand_Prix), [11](https://en.wikipedia.org/wiki/2026_Hungarian_Grand_Prix), [12](https://en.wikipedia.org/wiki/2026_Dutch_Grand_Prix), [13](https://en.wikipedia.org/wiki/2026_Italian_Grand_Prix), [14](https://en.wikipedia.org/wiki/2026_Spanish_Grand_Prix), [15](https://en.wikipedia.org/wiki/2026_Azerbaijan_Grand_Prix), [16](https://en.wikipedia.org/wiki/2026_Bahrain_Grand_Prix_in_Malaysia), [17](https://en.wikipedia.org/wiki/2026_Singapore_Grand_Prix), [18](https://en.wikipedia.org/wiki/2026_United_States_Grand_Prix), [19](https://en.wikipedia.org/wiki/2026_Mexico_City_Grand_Prix), [20](https://en.wikipedia.org/wiki/2026_S%C3%A3o_Paulo_Grand_Prix), [21](https://en.wikipedia.org/wiki/2026_Las_Vegas_Grand_Prix). De estas páginas salen las tablas de clasificación y
  carrera de la referencia de 21 GP; los primeros 8 que se leyeron fueron: [Australia](https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix),
  [Japón](https://en.wikipedia.org/wiki/2026_Japanese_Grand_Prix), [Austria](https://en.wikipedia.org/wiki/2026_Austrian_Grand_Prix),
  [Gran Bretaña](https://en.wikipedia.org/wiki/2026_British_Grand_Prix), [Hungría](https://en.wikipedia.org/wiki/2026_Hungarian_Grand_Prix),
  [Países Bajos](https://en.wikipedia.org/wiki/2026_Dutch_Grand_Prix), [Italia](https://en.wikipedia.org/wiki/2026_Italian_Grand_Prix),
  [España (Madrid)](https://en.wikipedia.org/wiki/2026_Spanish_Grand_Prix). Algunos datos de esas páginas se resumieron,
  no se copiaron literalmente (márgenes, doblados, motivos de abandono): sirven como orden de magnitud.
- Adelantamientos en 2026: [FanAmp](https://www.fanamp.com/articles/f1-fantasy-overtake-trends-first-three-races-2026),
  [ScuderiaFans](https://scuderiafans.com/f1-2026-vs-2025-the-numbers-behind-formula-1s-dramatic-overtaking-increase/),
  [Motor Sport Magazine](https://www.motorsportmagazine.com/articles/single-seaters/f1/why-f1s-fixation-on-overtaking-is-flawed/).
- Gestión de energía en 2026: [Autosport](https://www.autosport.com/f1/news/why-f1-drivers-delay-going-full-throttle-on-2026-qualifying-laps/10800071/),
  [The Race](https://www.the-race.com/formula-1/what-explains-mercedes-big-early-2026-f1-advantage/).
- Lo marcado «aprox.» son órdenes de magnitud de 2022-2025, de memoria, sin una fuente medida concreta.
