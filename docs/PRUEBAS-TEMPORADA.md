# Pruebas del modo temporada (noviembre de 2026)

Se ha probado el modo temporada, con equipo real y con «crea tu equipo», a lo largo de **4 temporadas seguidas
(2026–2029)** con un jugador automático (`tests/partida.ts`) que lleva la partida igual que la interfaz. Hace lo
siguiente:

- presupuesto de desarrollo y piezas de motor y fiabilidad;
- túnel de viento y paquetes aerodinámicos, que mide en libres y decide si se montan;
- test de pretemporada de 8 h en Barcelona;
- fines de semana completos (libres, clasificación, sprint y carrera), simulados hasta el final como con «Simular»;
- unidades de potencia y sanciones de parrilla arrastradas;
- moral y rivalidades, directiva y prensa;
- lesiones y destituciones a mitad de temporada;
- mercado de invierno, desarrollo de invierno, aviso y despido.

En el mercado de invierno hace lo que propone la pantalla: sigue con sus pilotos y, si uno no quiere renovar, ficha
al mejor libre.

Por el camino comprueba lo que no debería pasar nunca:

- pilotos, nombres o dorsales repetidos;
- libres que también corren y contratos vencidos;
- puntos que no cuadran (carrera, sprint, mundial y constructores);
- valores sin sentido (NaN, edades, atributos, fiabilidad);
- sesiones del fin de semana que faltan;
- tus dos coches en cada carrera;
- objetivos sin resolver al acabar;
- un lesionado al acabar el año que pierde su asiento;
- pilotos en dos coches a la vez o lesionados que corren, antes de cada carrera;
- dorsales repetidos entre la parrilla y los libres.

## Qué se ha corrido

| | Partidas | Temporadas | Carreras | Cómo |
|---|---|---|---|---|
| Equipo real, simulación entera | 5 (McLaren, Ferrari, Williams, Haas, Cadillac) | 20 | 180 | ~21 min por partida |
| Crea tu equipo, simulación entera | 9 (equipos al azar dentro del techo; los 5 motores) | 36 | 324 | ~24 min por partida |
| Modo rápido (carreras por ritmo, con azar) | 120 (11 equipos reales y el propio × 10 semillas) | 480 | 4.320 | segundos |

Las partidas de «crea tu equipo» con semillas 1 a 5 salieron todas con motor Ferrari, por un fallo del sorteo del
jugador automático (ya corregido). Por eso se añadieron 4 más (semillas 6, 8, 9 y 10) con Mercedes, Red Bull Ford,
Audi y Honda.

## Fallos encontrados (arreglados)

Los tres se arreglaron después de las pruebas. Las 14 partidas guardadas en `scripts/partidas/base-2026-11` son de
antes de los arreglos.

### 1. Un piloto lesionado en las últimas carreras perdía su asiento para siempre

**Qué pasaba.** Si un piloto se lesionaba y su baja iba más allá de la última carrera, `midSeason` (en
`src/sim/career.ts`) no creaba el cambio de «vuelve». En invierno, `rosters()` (en `src/ui/nextSeason.ts`) tomaba la
parrilla tal como acabó, con el sustituto. Así, el sustituto se quedaba con el asiento la temporada siguiente y el
lesionado:

- pasaba al mercado y lo fichaba otro equipo; o
- si era tuyo en «crea tu equipo», dejaba tu equipo sin que hubieras decidido nada.

**Ejemplos con la simulación entera:**

- Gasly se lesiona en la R9 de 2026 y en 2027 está en Audi, no en Alpine.
- Bearman pierde Haas y acaba en Williams.
- En «crea tu equipo» #9, Russell (fichado con el techo de gasto) se lesiona en la R9 de 2027 y en 2028 el piloto
  del equipo es Tsolov.

**Ejemplos en modo rápido:** Verstappen acaba en Ferrari y Red Bull se queda con Câmara; Norris acaba en Williams.

**Cuánto.** 11 casos en 40 temporadas con la simulación entera y 98 en las 120 partidas rápidas.

**Arreglo.** `healedOverWinter()` busca a los lesionados cuyo asiento sigue ocupado por el sustituto al acabar el
año. `rosters()` los devuelve a su asiento, porque la baja se cura en invierno, y el sustituto vuelve a los libres
(antes también se perdía). Vale también para las partidas guardadas antes del arreglo.

### 2. En «crea tu equipo», tu piloto lesionado volvía a correr con su equipo de antes

**Qué pasaba.** Al lesionarse uno de tus pilotos, `syncMine()` metía al sustituto en tus fichajes
(`s.equipo.pilotos`). Como `buildGrid` deja en su equipo de origen a quien no has fichado, ese equipo recuperaba al
lesionado mientras estaba de baja, y su reserva desaparecía. Ejemplo: Russell, lesionado en tu equipo, corre la R9
con Mercedes y Vesti desaparece. Al acabar el año, además, Russell volvía a Mercedes gratis.

**Cuánto.** 1 caso en las 120 partidas rápidas, porque solo pasa con pilotos tuyos fichados de un equipo real que se
lesionan.

**Arreglo.** `syncMine()` ya no cuenta como fichaje al sustituto de un lesionado: tu piloto sigue siendo tuyo y el
sustituto solo ocupa el asiento.

### 3. Dorsales repetidos con los jóvenes inventados de la F2

**Qué pasaba.** En `offSeason` (`src/sim/career.ts`), los dorsales de los jóvenes nuevos de la F2 se elegían para no
repetir ninguno de la parrilla, pero no se miraban los de los libres del mercado. Uno nuevo podía llevar el número de
un libre, y luego coincidir los dos en la parrilla. En «crea tu equipo» con la semilla 5 (modo rápido), Pablo Vidal
(inventado) y Pourchaire llevan los dos el 19, en Aston Martin, en 2029. Entre parrilla y libres se repetía algún
dorsal en casi todas las partidas.

**Cuánto.** 1 caso en la parrilla en 120 partidas rápidas.

**Arreglo.** Los dorsales ocupados incluyen también los de los libres.

### Tests

- El jugador automático comprueba ahora que no haya pilotos en dos coches, ni un lesionado corriendo, ni dorsales
  repetidos entre la parrilla y los libres.
- `tests/temporada.test.ts` tiene un test por cada fallo (17 a 20), con casos construidos a mano.
- Con el código de antes fallan esos cuatro tests y el 1; con el de ahora pasan los 20.
- Las 120 partidas rápidas salen sin ningún problema (antes había 99).

### Banco de Las Vegas (arreglado)

`tests/banco-4.test.ts` fallaba en Las Vegas: 0,58 paradas por coche, con un mínimo de 0,9. Ya fallaba en el commit
de partida `b4681aa`, el de la física de carrera, y no era un fallo de estrategia sino del test:

- la física nueva cambió la carrera de la semilla 2, que pasó a tener dos banderas rojas (vueltas 16 y 30) y a
  acabar por el tiempo máximo en la vuelta 48 de 50;
- bajo bandera roja se pueden cambiar neumáticos sin parar, así que 15 de los 18 que acabaron cumplieron la regla de
  los dos compuestos sin entrar a boxes (0,17 paradas por coche);
- con solo dos carreras por circuito, esa carrera arrastraba la media.

Ahora el banco cuenta los cambios de neumáticos (paradas y cambios con bandera roja): Las Vegas da 1,11 de media y el
resto de circuitos no cambia. `npm test` pasa entero (84 de 84).

## Comportamientos que conviene revisar (no son fallos de programación)

- **Tus pilotos no se retiran nunca** (sigue igual; ver «Cambios a raíz del análisis»). Las retiradas solo se sortean entre los pilotos de la IA, aunque el
  comentario del código dice «los tuyos, si se retiran, también». Alonso sigue en un equipo propio con 48 años, y
  con 46-47 en la IA (allí cada año se retira el 85 % de las veces). El README («desde los 33 alguno se retira») no
  aclara si va también por los tuyos.
- **Banderas rojas: en el 19-22 % de las carreras.** El margen de referencia de `scripts/realismo.ts` es del 2-12 %.
  Se concentran en Mónaco (17 de 32 carreras) y Singapur (16 de 32); en seco, el 16 %.
- **Abandonos por carrera: 2,2-2,8, algo por debajo del margen (2,8-4,5).** Coche de seguridad (53-60 %), virtual
  (36-37 %) y victorias desde la pole (39-41 %) están dentro de sus márgenes.
- **Con equipo real, los coches se igualan mucho con los años.** El hueco entre el mejor y el peor pasa de 4,1 a 2,0
  en tres inviernos; en 2029, a veces el mejor coche es el de Audi o el de Racing Bulls. En «crea tu equipo» se
  iguala bastante menos (de 4,1 a 3,2), en parte porque a quien le quitas el jefe o el técnico se queda con un
  interino.
- **Crea tu equipo puede acabar arriba del todo.** Con buenos objetivos (ya no existen) el presupuesto subía a 55-62 M (con equipo
  real, 40-52 M):
  - la #1 (Allison como técnico) pasa del 8.º coche al 1.º y acaba 2.ª de constructores en 2029;
  - con la #8, Antonelli es campeón con el equipo propio en 2028 y 2029.

  Al revés, un buen coche con pilotos flojos se queda a medias: la #3 tiene el 2.º mejor coche en 2029 y acaba 6.ª.
- **Unidades de potencia: casi todos tus pilotos usan 3 con un cupo de 2.** Es decir, 10 puestos de sanción por
  piloto cada temporada. Lo decide `autoFit`; un jugador de verdad podría gestionarlo mejor.
- **Directiva** (quitada; ver «Cambios a raíz del análisis»):
  - Ferrari gana el mundial de 2026 y luego, con el mejor coche o el segundo, no cumple ningún objetivo en 2027 ni
    en 2028 (piden quedar entre los 2 primeros y ganar 2 carreras). En 2029 se queda a una temporada del despido.
  - Cadillac, con el peor coche, cumple sus objetivos 3 de 4 años con la simulación entera, pero en modo rápido la
    despiden 7 veces de 10. Con el coche más lento, que salgan los objetivos depende del azar de las carreras
    reales.
  - Nadie ha sido despedido con la simulación entera.
- **Casi nunca entra un novato inventado.** El juego solo lo crea si no queda ningún piloto libre. Los jóvenes
  entran fichados desde la F2 y los reservas (Câmara, Tsolov, Fornaroli, Browning…). Funciona como dice el README.
- **Todo lo demás se ha comportado como se espera:**
  - años seguidos;
  - misma semilla, misma partida;
  - presupuesto según los objetivos (+6 M por objetivo cumplido, −5 M por fallado, nunca por debajo de 15 M);
  - aviso tras dos temporadas sin objetivos y despido a la tercera (con oferta de otro equipo si el tuyo es real);
  - jefe, técnico y motor del equipo propio entre temporadas;
  - sprints sorteados desde 2027 (4 en el calendario corto);
  - test de pretemporada con unas 130-140 vueltas y un 4-4,5 % menos de averías;
  - paquetes aerodinámicos que se miden y se montan (alguno malo se monta y alguno bueno se descarta, como debe
    ser con la incertidumbre);
  - edades y valoraciones de la parrilla estables;
  - la moral siempre entre 0 y 100;
  - ninguna descalificación ni carrera que no termine.
- **Comprobación descartada.** Un coche que se retira en la última vuelta sale clasificado por delante de uno
  doblado que acaba. Se ordena por vueltas, como en el reglamento; la comprobación era demasiado estricta y se ha
  ajustado.

## Patrones en los resultados

Salen de las 14 partidas de `scripts/partidas/base-2026-11` (56 temporadas, 504 carreras) con
`python3 scripts/partidas/analiza.py`, que vale para cualquier carpeta de partidas. Límites:

- solo hay 9 circuitos;
- el jugador automático no toma decisiones de estrategia;
- los datos son de antes de los arreglos y de los cambios de más abajo.

**1. El coche decide casi todo.**

- El orden de coches y el de constructores casi coinciden: correlación de Spearman media de 0,92 (el peor año,
  0,70).
- El campeón de constructores tenía el mejor coche al empezar 33 de 56 veces y el 2.º, 9. Nunca uno peor que el
  6.º.
- El mejor coche gana el 41 % de las carreras, el 2.º el 22 %, el 3.º el 18 % y el 4.º el 13 %. Del 7.º hacia
  atrás no gana casi nadie.

**2. El piloto pesa mucho arriba.**

- En 2026 todas las partidas empiezan con la misma parrilla y Mercedes tiene el mejor coche en todas. Aun así, el
  campeón es Verstappen, con Red Bull, en 8 de 14.
- Antonelli pasa de ganar el 20 % de las carreras en 2026 al 33 % en 2028, supera a Verstappen y es el rey de las
  poles (134 de 504). Hadjar aparece entre los ganadores en 2028-29.
- El que más carreras gana es campeón en 40 de 56 temporadas.
- Valoración de tus pilotos por edad, cambio en un año:

  | Edad | 21-23 | 24-26 | 27-29 | 30-32 | 36-38 | 39 o más |
  |---|---|---|---|---|---|---|
  | Cambio | +1,3 | +0,6 | +0,3 | −0,9 | −1,1 | −1,2 a −1,9 |

**3. El invierno apenas cambia nada.**

- El nivel de un coche al acabar un año y al empezar el siguiente coinciden casi del todo (correlación de 0,96).
- Un coche se mueve de media 0,44 puestos en invierno.
- El cambio frente a la media tiene una desviación de solo 0,15 (el hueco entre el mejor y el peor es de 3-4).
- Hay un ligero tirón hacia la media: los 3 primeros pierden 0,1 y los de abajo ganan 0,1.
- Con equipo real, Mercedes pasa de ser el mejor coche en 2026 a un puesto medio de 2,2 en 2029. Ferrari y Audi
  suben, pero Williams, Aston Martin y Cadillac siguen abajo los 4 años.

**4. Los objetivos de la directiva no estaban equilibrados.**

| Coche al empezar | 1.º–2.º | 3.º–4.º | 5.º–7.º | 8.º–9.º | 10.º o peor |
|---|---|---|---|---|---|
| Objetivos cumplidos | **20 %** (2 de 10) | 89 % | 91 % | 86 % | 74 % |

**5. Por circuito y condiciones.**

| Circuito | Gana el de la pole | Bandera roja | Abandonos | Adelantamientos | Ganadores distintos (de 56) |
|---|---|---|---|---|---|
| Mónaco | 59 % | 50 % | 3,8 | 27 | 12 |
| Singapur | 34 % | 36 % | 3,6 | 49 | 12 |
| Spa | 38 % | 20 % | 1,6 | 136 | 8 |
| Suzuka | 27 % | 20 % | 2,2 | 100 | 14 |
| Baréin | 43 % | 9 % | 2,2 | 88 | 7 |

- **Mojado:** con alguna sesión mojada en el fin de semana, la bandera roja se duplica (32 % frente a 16 %) y hay
  más coches de seguridad (66 % frente a 53 %).
- **Sprint:** en los fines de semana con sprint, el de la pole gana mucho menos (31 % frente a 45 %). Con solo unos
  libres los equipos saben menos de los neumáticos.

**6. En «crea tu equipo», el desarrollo rinde más que las estrellas.**

- Quien gastó 80-88 M en pilotos se quedó con 31-35 M de desarrollo y su coche no salió de abajo: 19-126 puntos en
  4 años.
- Con unos 50-60 M y un buen director técnico, el coche sube cada año:
  - la #1, con Allison, pasa del 8.º al 1.º;
  - la #8 suma 726 puntos, con Antonelli a 10 M.
- A más presupuesto, más puestos gana el coche durante el año: +0,8 con 55 M o más, −0,2 con menos de 35 M.

**7. Otros.**

- **Moral:** la diferencia de moral entre tus dos pilotos sigue a la de puntos (correlación de 0,78). Refleja los
  resultados más que causarlos.
- **De la salida a la meta:** tus pilotos que salen en el top 5 pierden de media 2,8 puestos y los que salen del
  21.º hacia atrás ganan 5,5.
- **Averías de tus pilotos por motor:** Ferrari 5 % de las salidas, Mercedes 4 %, Honda y Audi 11 % (una partida
  cada uno).
- **El jugador automático no tiene ventaja:** en 2026, cada equipo queda prácticamente igual llevándolo él que
  llevándolo la IA.

## Cambios a raíz del análisis (noviembre de 2026)

- **Banderas rojas:** se quedan como están.
- **Directiva y objetivos: se quitan.** Eran demasiado arbitrarios (punto 4 de los patrones). Además de los objetivos
  se van el mensaje tras cada carrera, el aviso, el despido y las ofertas. El presupuesto de desarrollo ya no depende
  de los resultados: 40 M con equipo real menos las cláusulas que pagues; en «crea tu equipo», según el techo.

  La moral de tus pilotos sigue comparando cada resultado con lo que se espera de tu coche, pero ahora eso sale del
  puesto del coche en la parrilla y no de los objetivos: ganar con uno de los dos mejores, podio con el 3.º o el 4.º,
  puntos con el resto. Las respuestas de la rueda de prensa que «gustaban a la directiva» ahora solo tocan la moral.
- **Pilotos: ya no empeoran tan jóvenes.**

  | Edad | Hasta 27 | 28-31 | 32-34 | 35-36 | 37-38 | 39-40 | 41 o más |
  |---|---|---|---|---|---|---|---|
  | Cambio de ritmo por año | igual que antes | +0,2 | 0 | −0,3 | −0,6 | −0,9 | −1,2 |
  | Antes | | +0,1 a −0,3 | −0,3 a −0,7 | −1,2 | −1,8 | −1,8 | −1,8 |

  De los 34 a los 40 se pierden unos 2-3 puntos de ritmo, no 7. La retirada:
  - empieza a los 34, no a los 33;
  - los que siguen arriba aguantan más a cualquier edad (Hamilton puede seguir hasta los 43-44);
  - desde los 44 pesa la edad y a los 46 es casi segura.
- **Invierno: es cuando más cambian los coches.** Cada equipo saca un coche nuevo (`winterConcept` en
  `src/sim/career.ts`):
  - el paso medio es de ~0,8 s/vuelta (antes 0,30, y casi igual para todos), más que todo un año de evoluciones
    (0,48);
  - casi siempre es un paso grande, y a veces un gran acierto (hasta ×1,75 del paso medio);
  - 1 de cada 10 veces apenas mejora;
  - 1 de cada 12 sale algo peor que el del año pasado (como mucho ×−0,25).

  Mejorar es 11 veces más probable que empeorar, y la mayor mejora es 7 veces la peor caída; los dos cumplen el
  mínimo de 7 a 1. La cuota ATR y los rendimientos decrecientes ayudan a los de atrás un 70 % de lo que ayudan en las
  evoluciones del año. Con menos, el azar del coche nuevo iría separando la parrilla año tras año; con todo, se
  igualaría en pocos inviernos. Las noticias del invierno cuentan los grandes aciertos, los coches fallidos y si el
  tuyo ha salido bien.

  En 120 partidas rápidas de 4 temporadas:

  | | Antes | Ahora |
  |---|---|---|
  | Cambio de cada coche frente a la media en invierno (desviación) | 0,14 | 0,40 |
  | Puestos que se mueve un coche en invierno | 0,37 | ~1,1-1,5 |

  El hueco medio del mejor al peor coche, a 8 temporadas:

  | | 2029 antes | 2029 ahora | 2033 antes | 2033 ahora |
  |---|---|---|---|---|
  | Equipo real | 2,0 | 2,6 | 1,0 (todos los coches casi iguales) | 1,9 |
  | Crea tu equipo | 3,2 | 3,3 | 3,5 | 3,8 |
- **Lesión encadenada:** al probar el invierno salió otro caso del fallo del asiento de los lesionados, ya arreglado.
  Se lesiona el piloto, luego su sustituto, y el sustituto vuelve antes de acabar el año; entonces el primero no
  recuperaba su asiento. Ahora se sigue quién es el dueño de cada asiento (`seatOwners` en `src/ui/nextSeason.ts`).
- **Tope de 50 años.** Nadie corre con más de 50, tampoco tus pilotos. Antes, con la edad nueva y en partidas de 8
  temporadas, Alonso llegaba a correr con 51-52 años si era piloto tuyo, porque tus pilotos no se retiran nunca por
  azar. Ahora, en la pantalla de fin de temporada, el que pasaría de 50 se retira y hay que elegirle sustituto. Por
  debajo de esa edad, tus pilotos siguen sin retirarse.

## Cómo repetirlo

```bash
npm test                                   # incluye tests/temporada.test.ts y tests/temporada-real-*.test.ts
npm run partidas -- ferrari 2 4 --salida=partidas/ferrari-2.json
npm run partidas -- propio 8 4 --salida=partidas/propio-8.json
npm run partidas:informe -- partidas informe.md
python3 scripts/partidas/analiza.py partidas   # los patrones de arriba
```

## Anexo: datos de las 14 partidas con la simulación entera

### Temporada con equipo real (5 partidas, 20 temporadas, 180 carreras)

Problemas detectados: **0**

| Partida | Año | Equipo | Coche (puesto ini→fin) | Constructores | Pts | Objetivos | Aviso | Presup. | Campeón | Ganadores distintos |
|---|---|---|---|---|---|---|---|---|---|---|
| cadillac #5 | 2026 | Cadillac | 10→10 | 10.º | 6 | 2/2 | 0 | 40 M (+0) | Kimi Antonelli (Mercedes, 156) | 6 pilotos / 4 equipos |
| cadillac #5 | 2027 | Cadillac | 10→10 | 9.º | 19 | 2/2 | 0 | 52 M (+12) | George Russell (Mercedes, 160) | 5 pilotos / 4 equipos |
| cadillac #5 | 2028 | Cadillac | 11→9 | 11.º | 0 | 0/2 | 0 | 52 M (+12) | Kimi Antonelli (Mercedes, 206) | 5 pilotos / 4 equipos |
| cadillac #5 | 2029 | Cadillac | 10→11 | 10.º | 1 | 2/2 | 1 | 30 M (-10) | Kimi Antonelli (Mercedes, 164) | 6 pilotos / 5 equipos |
| ferrari #2 | 2026 | Ferrari | 4→2 | 1.º | 293 | 2/2 | 0 | 40 M (+0) | Lewis Hamilton (Ferrari, 152) | 5 pilotos / 3 equipos |
| ferrari #2 | 2027 | Ferrari | 2→1 | 3.º | 203 | 0/2 | 0 | 52 M (+12) | Max Verstappen (Red Bull Racing, 200) | 4 pilotos / 3 equipos |
| ferrari #2 | 2028 | Ferrari | 2→2 | 4.º | 151 | 0/2 | 1 | 30 M (-10) | Max Verstappen (Red Bull Racing, 156) | 5 pilotos / 3 equipos |
| ferrari #2 | 2029 | Ferrari | 2→1 | 3.º | 149 | 1/2 | 2 | 30 M (-10) | Max Verstappen (Red Bull Racing, 201) | 6 pilotos / 4 equipos |
| haas #4 | 2026 | Haas | 8→7 | 8.º | 18 | 2/2 | 0 | 40 M (+0) | Max Verstappen (Red Bull Racing, 191) | 3 pilotos / 3 equipos |
| haas #4 | 2027 | Haas | 7→8 | 8.º | 16 | 1/2 | 0 | 52 M (+12) | Max Verstappen (Red Bull Racing, 185) | 5 pilotos / 4 equipos |
| haas #4 | 2028 | Haas | 8→8 | 7.º | 22 | 2/2 | 0 | 41 M (+1) | Kimi Antonelli (Mercedes, 179) | 5 pilotos / 3 equipos |
| haas #4 | 2029 | Haas | 8→8 | 7.º | 37 | 2/2 | 0 | 52 M (+12) | Kimi Antonelli (Mercedes, 166) | 4 pilotos / 3 equipos |
| mclaren #1 | 2026 | McLaren | 3→2 | 4.º | 160 | 2/2 | 0 | 40 M (+0) | Lewis Hamilton (Ferrari, 148) | 7 pilotos / 4 equipos |
| mclaren #1 | 2027 | McLaren | 2→2 | 3.º | 202 | 1/2 | 0 | 52 M (+12) | Kimi Antonelli (Mercedes, 181) | 6 pilotos / 4 equipos |
| mclaren #1 | 2028 | McLaren | 3→2 | 2.º | 208 | 2/2 | 0 | 41 M (+1) | Kimi Antonelli (Mercedes, 200) | 5 pilotos / 4 equipos |
| mclaren #1 | 2029 | McLaren | 3→3 | 3.º | 191 | 2/2 | 0 | 52 M (+12) | Charles Leclerc (Ferrari, 171) | 5 pilotos / 4 equipos |
| williams #3 | 2026 | Williams | 9→9 | 10.º | 1 | 1/2 | 0 | 40 M (+0) | Max Verstappen (Red Bull Racing, 140) | 4 pilotos / 3 equipos |
| williams #3 | 2027 | Williams | 9→10 | 9.º | 8 | 1/2 | 0 | 41 M (+1) | Charles Leclerc (Ferrari, 170) | 5 pilotos / 4 equipos |
| williams #3 | 2028 | Williams | 10→10 | 10.º | 0 | 1/2 | 0 | 41 M (+1) | Max Verstappen (Red Bull Racing, 193) | 3 pilotos / 2 equipos |
| williams #3 | 2029 | Williams | 10→10 | 9.º | 10 | 2/2 | 0 | 41 M (+1) | Kimi Antonelli (Mercedes, 210) | 6 pilotos / 5 equipos |

**Carreras.** Abandonos por carrera 2,24 (acaban 19,8); motivos: avería 218, accidente 145, choque con otro 25, daños tras un toque 16. Descalificados: 0. Carreras acortadas: 0. Fines de semana con alguna sesión mojada: 62 (carrera mojada: 0). Coche de seguridad en 53 %, virtual en 36 %, bandera roja en 39 (22 %; monaco 11, monza 6, interlagos 5). Adelantamientos por carrera 78,9. La pole gana el 41 %. Sanciones de parrilla arrastradas: 8. Tiempo de cálculo por fin de semana: 32,7 s.

**Tus pilotos.** 360 salidas, 31 abandonos (9 %): avería 16, accidente 11, choque con otro 2, daños tras un toque 2. Victorias 16, podios 44.

**Campeones.** Kimi Antonelli 8, Max Verstappen 7, Lewis Hamilton 2, Charles Leclerc 2, George Russell 1. Por equipo: Mercedes 9, Red Bull Racing 7, Ferrari 4. Puntos del campeón: 176,4 de media (140–210). Ganadores distintos por temporada: 5,0.

**Coches (nivel, carLevel).** Diferencia entre el mejor y el peor al empezar y al acabar cada año, y el equipo con mejor coche al empezar:

| Año | Hueco inicio | Hueco final | Mejor coche al empezar (veces) |
|---|---|---|---|
| 2026 | 4,06 | 3,61 | mercedes 5 |
| 2027 | 3,20 | 2,80 | mercedes 4, ferrari 1 |
| 2028 | 2,45 | 2,14 | mercedes 3, redbull 1, ferrari 1 |
| 2029 | 2,00 | 1,76 | mercedes 3, redbull 1, audi 1 |

**Desarrollo.** Piezas pedidas por temporada 4,0 (rinden 0,96× lo esperado de media; 10 decepcionan). Paquetes aerodinámicos 2,0 por temporada, 36 montados de 40; salen mal (real < 50 % de lo esperado) 7; se montó uno malo 3 veces y se descartó uno bueno 0. Presupuesto que queda sin gastar al acabar: 2,2 M.

**Pilotos.** Edad media de la parrilla por año: 2026 28,9 (19–45) · 2027 27,8 (20–46) · 2028 27,7 (21–43) · 2029 28,6 (22–44). Valoración media: 2026 87,2 · 2027 86,8 · 2028 87,0 · 2029 87,3. Libres en el mercado: 2026 40,6 · 2027 38,6 · 2028 39,0 · 2029 39,2.

**Mercado entre temporadas** (15 inviernos): retiradas 24, no renovados 1, traspasos 9, novatos 0, fichajes 25, tus fichajes 1.
**A mitad de temporada:** 43 cambios (23 lesiones, 3 destituciones, 17 otros).

**Moral de tus pilotos al acabar:** 57,3 de media (27.8–99.8). Rivalidades vivas: 5,0. Hitos por temporada: 1,6.
**Test de pretemporada:** 140,6 vueltas de tus pilotos (bonus de fiabilidad 4,4 %), 18,4 s de cálculo.
**Sprints por temporada:** 2026 2,0 · 2027 4,0 · 2028 4,0 · 2029 4,0.

### Crea tu equipo (9 partidas, 36 temporadas, 324 carreras)

Problemas detectados: **1**
- propio semilla 10: 2029 R9 interlagos: sprint: un coche que acaba detrás de uno que no

| Partida | Año | Equipo | Coche (puesto ini→fin) | Constructores | Pts | Objetivos | Aviso | Presup. | Campeón | Ganadores distintos |
|---|---|---|---|---|---|---|---|---|---|---|
| propio #1 | 2026 | Propio 1 | 8→5 | 5.º | 56 | 2/2 | 0 | 45 M (+0) | Max Verstappen (Red Bull Racing, 135) | 5 pilotos / 4 equipos |
| propio #1 | 2027 | Propio 1 | 7→5 | 5.º | 78 | 2/2 | 0 | 62 M (+12) | Lando Norris (McLaren, 167) | 6 pilotos / 4 equipos |
| propio #1 | 2028 | Propio 1 | 5→2 | 4.º | 94 | 2/2 | 0 | 61 M (+12) | Kimi Antonelli (Mercedes, 195) | 5 pilotos / 3 equipos |
| propio #1 | 2029 | Propio 1 | 3→1 | 2.º | 216 | 2/2 | 0 | 61 M (+12) | Lando Norris (McLaren, 150) | 5 pilotos / 4 equipos |
| propio #10 | 2026 | Propio 10 | 10→9 | 9.º | 22 | 2/2 | 0 | 31 M (+0) | George Russell (Mercedes, 160) | 4 pilotos / 3 equipos |
| propio #10 | 2027 | Propio 10 | 10→9 | 12.º | 0 | 0/2 | 0 | 55 M (+12) | Kimi Antonelli (Mercedes, 186) | 4 pilotos / 3 equipos |
| propio #10 | 2028 | Propio 10 | 9→10 | 12.º | 0 | 0/2 | 1 | 33 M (-10) | George Russell (Mercedes, 155) | 5 pilotos / 4 equipos |
| propio #10 | 2029 | Propio 10 | 10→10 | 9.º | 14 | 2/2 | 2 | 40 M (-10) | Max Verstappen (Audi, 181) | 4 pilotos / 3 equipos |
| propio #2 | 2026 | Propio 2 | 9→9 | 9.º | 11 | 2/2 | 0 | 41 M (+0) | Max Verstappen (Red Bull Racing, 150) | 6 pilotos / 4 equipos |
| propio #2 | 2027 | Propio 2 | 9→9 | 7.º | 31 | 2/2 | 0 | 61 M (+12) | George Russell (Mercedes, 172) | 4 pilotos / 3 equipos |
| propio #2 | 2028 | Propio 2 | 10→10 | 9.º | 6 | 2/2 | 0 | 62 M (+12) | Charles Leclerc (Ferrari, 183) | 5 pilotos / 3 equipos |
| propio #2 | 2029 | Propio 2 | 10→8 | 11.º | 6 | 2/2 | 0 | 62 M (+12) | Charles Leclerc (Ferrari, 161) | 5 pilotos / 4 equipos |
| propio #3 | 2026 | Propio 3 | 5→5 | 8.º | 26 | 1/2 | 0 | 47 M (+0) | Max Verstappen (Red Bull Racing, 144) | 5 pilotos / 4 equipos |
| propio #3 | 2027 | Propio 3 | 5→4 | 5.º | 44 | 2/2 | 0 | 51 M (+1) | Charles Leclerc (Ferrari, 199) | 4 pilotos / 3 equipos |
| propio #3 | 2028 | Propio 3 | 3→3 | 5.º | 62 | 0/2 | 0 | 62 M (+12) | Lando Norris (McLaren, 163) | 5 pilotos / 3 equipos |
| propio #3 | 2029 | Propio 3 | 2→2 | 6.º | 76 | 0/2 | 1 | 40 M (-10) | Kimi Antonelli (Mercedes, 119) | 6 pilotos / 6 equipos |
| propio #4 | 2026 | Propio 4 | 11→10 | 12.º | 0 | 0/2 | 0 | 35 M (+0) | Max Verstappen (Red Bull Racing, 156) | 5 pilotos / 3 equipos |
| propio #4 | 2027 | Propio 4 | 11→9 | 8.º | 16 | 2/2 | 1 | 36 M (-10) | Max Verstappen (Red Bull Racing, 205) | 3 pilotos / 2 equipos |
| propio #4 | 2028 | Propio 4 | 10→9 | 7.º | 3 | 2/2 | 0 | 58 M (+12) | Isack Hadjar (Red Bull Racing, 187) | 4 pilotos / 3 equipos |
| propio #4 | 2029 | Propio 4 | 10→9 | 12.º | 0 | 0/2 | 0 | 56 M (+12) | Isack Hadjar (Red Bull Racing, 171) | 4 pilotos / 3 equipos |
| propio #5 | 2026 | Propio 5 | 10→9 | 9.º | 2 | 2/2 | 0 | 35 M (+0) | George Russell (Mercedes, 200) | 3 pilotos / 2 equipos |
| propio #5 | 2027 | Propio 5 | 9→9 | 8.º | 18 | 2/2 | 0 | 58 M (+12) | Kimi Antonelli (Mercedes, 213) | 4 pilotos / 3 equipos |
| propio #5 | 2028 | Propio 5 | 9→7 | 6.º | 54 | 2/2 | 0 | 56 M (+12) | Kimi Antonelli (Mercedes, 191) | 4 pilotos / 3 equipos |
| propio #5 | 2029 | Propio 5 | 7→6 | 5.º | 52 | 2/2 | 0 | 62 M (+12) | Leonardo Fornaroli (Ferrari, 153) | 7 pilotos / 4 equipos |
| propio #6 | 2026 | Propio 6 | 8→6 | 8.º | 30 | 2/2 | 0 | 47 M (+0) | Kimi Antonelli (Mercedes, 142) | 6 pilotos / 4 equipos |
| propio #6 | 2027 | Propio 6 | 7→6 | 6.º | 34 | 2/2 | 0 | 62 M (+12) | Max Verstappen (Red Bull Racing, 223) | 3 pilotos / 3 equipos |
| propio #6 | 2028 | Propio 6 | 7→5 | 7.º | 20 | 2/2 | 0 | 62 M (+12) | Max Verstappen (Red Bull Racing, 179) | 5 pilotos / 4 equipos |
| propio #6 | 2029 | Propio 6 | 5→5 | 6.º | 72 | 2/2 | 0 | 62 M (+12) | Isack Hadjar (Red Bull Racing, 169) | 4 pilotos / 3 equipos |
| propio #8 | 2026 | Propio 8 | 5→4 | 5.º | 153 | 2/2 | 0 | 50 M (+0) | Max Verstappen (Red Bull Racing, 138) | 6 pilotos / 4 equipos |
| propio #8 | 2027 | Propio 8 | 4→4 | 4.º | 156 | 2/2 | 0 | 48 M (+12) | George Russell (Mercedes, 178) | 6 pilotos / 4 equipos |
| propio #8 | 2028 | Propio 8 | 4→2 | 2.º | 185 | 2/2 | 0 | 48 M (+12) | Kimi Antonelli (Propio 8, 158) | 6 pilotos / 5 equipos |
| propio #8 | 2029 | Propio 8 | 3→2 | 2.º | 232 | 2/2 | 0 | 48 M (+12) | Kimi Antonelli (Propio 8, 160) | 4 pilotos / 4 equipos |
| propio #9 | 2026 | Propio 9 | 7→7 | 6.º | 49 | 2/2 | 0 | 43 M (+0) | Max Verstappen (Red Bull Racing, 164) | 5 pilotos / 4 equipos |
| propio #9 | 2027 | Propio 9 | 8→9 | 7.º | 25 | 2/2 | 0 | 62 M (+12) | Max Verstappen (Red Bull Racing, 160) | 4 pilotos / 4 equipos |
| propio #9 | 2028 | Propio 9 | 8→10 | 9.º | 15 | 2/2 | 0 | 62 M (+12) | Kimi Antonelli (Mercedes, 145) | 4 pilotos / 4 equipos |
| propio #9 | 2029 | Propio 9 | 10→10 | 9.º | 15 | 2/2 | 0 | 62 M (+12) | Kimi Antonelli (Mercedes, 167) | 6 pilotos / 5 equipos |

**Carreras.** Abandonos por carrera 2,77 (acaban 21,2); motivos: avería 512, accidente 285, choque con otro 69, daños tras un toque 30. Descalificados: 0. Carreras acortadas: 0. Fines de semana con alguna sesión mojada: 119 (carrera mojada: 14). Coche de seguridad en 60 %, virtual en 37 %, bandera roja en 70 (22 %; monaco 17, singapur 16, silverstone 9). Adelantamientos por carrera 92,4. La pole gana el 39 %. Sanciones de parrilla arrastradas: 14. Tiempo de cálculo por fin de semana: 37,4 s.

**Tus pilotos.** 648 salidas, 85 abandonos (13 %): avería 41, accidente 28, choque con otro 8, daños tras un toque 8. Victorias 16, podios 32.

**Campeones.** Max Verstappen 11, Kimi Antonelli 10, George Russell 5, Lando Norris 3, Charles Leclerc 3, Isack Hadjar 3, Leonardo Fornaroli 1. Por equipo: Red Bull Racing 13, Mercedes 13, Ferrari 4, McLaren 3, Propio 8 2, Audi 1. Puntos del campeón: 168,9 de media (119–223). Ganadores distintos por temporada: 4,8.

**Coches (nivel, carLevel).** Diferencia entre el mejor y el peor al empezar y al acabar cada año, y el equipo con mejor coche al empezar:

| Año | Hueco inicio | Hueco final | Mejor coche al empezar (veces) |
|---|---|---|---|
| 2026 | 4,06 | 3,84 | mercedes 9 |
| 2027 | 3,59 | 3,51 | mercedes 6, ferrari 1, redbull 2 |
| 2028 | 3,36 | 3,38 | redbull 3, audi 1, mercedes 4, ferrari 1 |
| 2029 | 3,23 | 3,37 | racingbulls 1, audi 1, mercedes 4, ferrari 1, redbull 2 |

**Desarrollo.** Piezas pedidas por temporada 5,1 (rinden 1,00× lo esperado de media; 43 decepcionan). Paquetes aerodinámicos 2,0 por temporada, 64 montados de 72; salen mal (real < 50 % de lo esperado) 8; se montó uno malo 0 veces y se descartó uno bueno 4. Presupuesto que queda sin gastar al acabar: 2,9 M.

**Pilotos.** Edad media de la parrilla por año: 2026 28,7 (19–45) · 2027 27,4 (20–46) · 2028 27,5 (21–47) · 2029 28,2 (22–48). Valoración media: 2026 86,7 · 2027 86,1 · 2028 86,4 · 2029 86,7. Libres en el mercado: 2026 37,9 · 2027 38,4 · 2028 38,9 · 2029 39,1.

**Mercado entre temporadas** (27 inviernos): retiradas 44, no renovados 8, traspasos 31, novatos 0, fichajes 52, tus fichajes 0.
**A mitad de temporada:** 90 cambios (48 lesiones, 5 destituciones, 37 otros).

**Moral de tus pilotos al acabar:** 54,2 de media (19.2–100). Rivalidades vivas: 6,8. Hitos por temporada: 1,3.
**Test de pretemporada:** 132,1 vueltas de tus pilotos (bonus de fiabilidad 4,1 %), 18,9 s de cálculo.
**Sprints por temporada:** 2026 2,0 · 2027 4,0 · 2028 4,0 · 2029 4,0.

**Crea tu equipo.**

| Partida | Año | Pilotos | Jefe / técnico / motor | Techo gastado | Queda | Arrastre | Unidades de potencia (usadas/rotas) |
|---|---|---|---|---|---|---|---|
| #1 | 2026 | CRA 21 (79.8), POU 23 (81.1) | Andrea Stella / James Allison / ferrari | 59,3 | 40,7 | - | CRA 3/1, POU 3/0 |
| #1 | 2027 | CRA 22 (82.4), POU 24 (82.8) | Andrea Stella / James Allison / ferrari | 47,0 | 53,0 | 0.52 | CRA 3/0, POU 3/0 |
| #1 | 2028 | CRA 23 (83.9), POU 25 (82.8) | Andrea Stella / James Allison / ferrari | 51,9 | 48,1 | 0.92 | CRA 3/0, POU 3/0 |
| #1 | 2029 | CRA 24 (85.9), POU 26 (83.1) | Andrea Stella / James Allison / ferrari | 51,9 | 48,1 | 1.11 | CRA 3/0, POU 3/0 |
| #10 | 2026 | HAD 22 (84.5), LEC 29 (91.4) | Laurent Mekies / Dan Fallows / honda | 88,0 | 12,0 | - | HAD 2/0, LEC 3/0 |
| #10 | 2027 | HAD 23 (83.9), LEC 30 (91.4) | Laurent Mekies / Dan Fallows / honda | 64,7 | 35,3 | 0.36 | HAD 3/0, LEC 3/0 |
| #10 | 2028 | HAD 24 (84.9), LEC 31 (89.9) | Laurent Mekies / Dan Fallows / honda | 64,7 | 35,3 | 0.59 | HAD 3/1, LEC 3/1 |
| #10 | 2029 | HAD 25 (85.9), LEC 32 (87.7) | Laurent Mekies / Dan Fallows / honda | 49,1 | 50,9 | 0.75 | HAD 2/0, LEC 2/0 |
| #2 | 2026 | VIL 25 (75.4), ALO 45 (92) | Andreas Seidl / Enrico Cardile / ferrari | 67,5 | 32,5 | - | VIL 3/0, ALO 3/0 |
| #2 | 2027 | VIL 26 (75.4), ALO 46 (90.5) | Andreas Seidl / Enrico Cardile / ferrari | 52,9 | 47,1 | 0.51 | VIL 2/0, ALO 2/0 |
| #2 | 2028 | VIL 27 (76.9), ALO 47 (88.9) | Andreas Seidl / Enrico Cardile / ferrari | 46,1 | 53,9 | 0.84 | VIL 3/0, ALO 3/0 |
| #2 | 2029 | VIL 28 (77.2), ALO 48 (87.3) | Andreas Seidl / Enrico Cardile / ferrari | 40,9 | 59,1 | 1.05 | VIL 3/0, ALO 3/0 |
| #3 | 2026 | MAI 26 (78.1), ZHO 27 (82.1) | Flavio Briatore / Pierre Waché / ferrari | 56,6 | 43,4 | - | MAI 3/0, ZHO 3/0 |
| #3 | 2027 | MAI 27 (79.1), ZHO 28 (80.6) | Flavio Briatore / Pierre Waché / ferrari | 41,9 | 58,1 | 0.47 | MAI 3/0, ZHO 3/0 |
| #3 | 2028 | MAI 28 (78.5), ZHO 29 (82.1) | Flavio Briatore / Pierre Waché / ferrari | 43,3 | 56,7 | 0.72 | MAI 3/0, ZHO 3/2 |
| #3 | 2029 | MAI 29 (77.9), ZHO 30 (80.6) | Flavio Briatore / Pierre Waché / ferrari | 43,2 | 56,8 | 0.93 | MAI 3/0, ZHO 3/0 |
| #4 | 2026 | VIL 25 (78.3), RUS 28 (90.8) | Andrea Stella / David Sanchez / ferrari | 79,5 | 20,5 | - | VIL 3/0, RUS 3/0 |
| #4 | 2027 | VIL 26 (77.7), RUS 29 (91.8) | Andrea Stella / David Sanchez / ferrari | 58,5 | 41,5 | 0.8 | VIL 2/0, RUS 3/0 |
| #4 | 2028 | VIL 27 (77.1), RUS 30 (91.3) | Andrea Stella / David Sanchez / ferrari | 58,5 | 41,5 | 1.39 | VIL 3/0, RUS 3/0 |
| #4 | 2029 | VIL 28 (78.1), RUS 31 (91.3) | Andrea Stella / David Sanchez / ferrari | 61,2 | 38,8 | 1.75 | VIL 3/0, RUS 3/0 |
| #5 | 2026 | LEC 29 (92.5), IWA 25 (83.9) | Graeme Lowdon / Andrea De Zordo / ferrari | 79,5 | 20,5 | - | LEC 3/0, IWA 3/0 |
| #5 | 2027 | LEC 30 (92.7), IWA 26 (84.9) | Graeme Lowdon / Andrea De Zordo / ferrari | 58,0 | 42,0 | 0.85 | LEC 2/0, IWA 2/0 |
| #5 | 2028 | LEC 31 (91.1), IWA 27 (86.5) | Graeme Lowdon / Andrea De Zordo / ferrari | 61,1 | 38,9 | 1.62 | LEC 3/0, IWA 3/0 |
| #5 | 2029 | LEC 32 (90.5), IWA 28 (86.5) | Graeme Lowdon / Andrea De Zordo / ferrari | 46,7 | 53,3 | 1.96 | LEC 3/0, IWA 3/0 |
| #6 | 2026 | OCO 30 (83.4), MAI 26 (79.6) | Jonathan Wheatley / James Allison / mercedes | 55,1 | 44,9 | - | OCO 3/0, MAI 3/0 |
| #6 | 2027 | OCO 31 (81.4), MAI 27 (81.5) | Jonathan Wheatley / James Allison / mercedes | 50,0 | 50,0 | 0.51 | OCO 3/0, MAI 3/0 |
| #6 | 2028 | OCO 32 (81.4), MAI 28 (83.2) | Jonathan Wheatley / James Allison / mercedes | 46,3 | 53,7 | 0.74 | OCO 3/1, MAI 3/0 |
| #6 | 2029 | OCO 33 (80.7), MAI 29 (83.5) | Jonathan Wheatley / James Allison / mercedes | 45,7 | 54,3 | 0.95 | OCO 3/0, MAI 3/1 |
| #8 | 2026 | ZHO 27 (82.5), ANT 20 (94.7) | Oliver Oakes / Enrico Cardile / redbullford | 50,0 | 50,0 | - | ZHO 3/0, ANT 3/0 |
| #8 | 2027 | ZHO 28 (82.5), ANT 21 (95.8) | Oliver Oakes / Enrico Cardile / redbullford | 78,1 | 21,9 | 0.58 | ZHO 3/0, ANT 3/0 |
| #8 | 2028 | ZHO 29 (82), ANT 22 (96.9) | Oliver Oakes / Enrico Cardile / redbullford | 77,2 | 22,8 | 0.79 | ZHO 3/0, ANT 3/0 |
| #8 | 2029 | ZHO 30 (82.9), ANT 23 (97.4) | Oliver Oakes / Enrico Cardile / redbullford | 77,2 | 22,8 | 1.01 | ZHO 3/1, ANT 3/0 |
| #9 | 2026 | RUS 28 (91.6), BEN 21 (85) | Alan Permane / Aldo Costa / audi | 65,0 | 35,0 | - | RUS 3/1, BEN 3/1 |
| #9 | 2027 | TSO 21 (83.6), BEN 22 (85.9) | Alan Permane / Aldo Costa / audi | 49,5 | 50,5 | 0.04 | TSO 3/1, BEN 3/2 |
| #9 | 2028 | TSO 22 (83.2), BEN 23 (89.4) | Alan Permane / Aldo Costa / audi | 22,7 | 77,3 | -0.02 | TSO 2/1, BEN 3/1 |
| #9 | 2029 | TSO 23 (84.3), BEN 24 (91) | Alan Permane / Aldo Costa / audi | 24,4 | 75,6 | -0.15 | TSO 3/1, BEN 2/0 |
