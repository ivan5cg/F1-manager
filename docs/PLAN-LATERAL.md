# Plan · Posición lateral en la simulación

Hoy la simulación es de una dimensión: cada coche es un punto que avanza sobre la línea central (`Car.s`, metros
recorridos) y el 3D se inventa dónde está a lo ancho. Este plan le da a la simulación una segunda coordenada, la
**posición lateral**, para que adelantar, defender, tocarse o irse largo pasen *en la pista* y el 3D enseñe lo que de
verdad ha pasado, no una representación de una tirada de dados.

No es un motor de física de conducción (eso sería la opción A, descartada: ver «Por qué no física completa»). El
avance a lo largo de la pista sigue siendo el de ahora, por minisectores y ya calibrado.

---

## 1. Cómo está hoy

- **Estado del coche:** `s` (metros) y `v` (m/s). No hay nada lateral (`Car`, `src/sim/session.ts:215`).
- **Separación en el dibujo:** `map3d.ts:3423-3437`. Si un coche está a menos de 1,3 largos del de delante, se le
  pone `want = ±0,4` y se desliza hacia ese lado con una constante de 0,7 s. La simulación ni se entera.
- **Adelantar** (`overtakeCheck`, `session.ts:2153`): al entrar en cada minisector, si el de detrás está a menos de
  `PASS_REACH` (0,55 s), se calcula la ventaja (agarre en aire limpio, recta anterior, ataque contra defensa) y se tira
  una curva logística contra el umbral del circuito. Si sale, `grantPass` le da al de delante un `delay` y el de detrás
  pasa por velocidad en los pasos siguientes.
- **Toques** (`contact`, `session.ts:2293`): una probabilidad fija por intento (`0,004 × agresividades × …`) y luego
  un reparto de consecuencias (alerón 40 %, pinchazo 22 %, largos 31 %, accidente 7 %).
- **Errores** (`errorCheck`, `session.ts:2093`): probabilidad por curva. Las salidas y los trompos son un `delay` más
  `c.fx`, que es **solo dibujo**.
- **Aire sucio y rebufo:** dependen solo del hueco en segundos (`dirtyAir(gap)`, `tow(gap)`), da igual que vayas justo
  detrás o abierto un metro y medio.
- **Tapones** (`interactions`, `session.ts:2325`): si el de detrás se acerca a menos de 7 m sin permiso, se le
  echa hacia atrás (`b.s -= back`).
- **Ya existe medio camino hecho:**
  - `waterOff[m]`: agua fuera de la trazada (el que ataca pisa más agua).
  - Anchura real por punto en 17 de los 27 circuitos (`"ancho"` en `data/circuitos/*.json`).
  - Trazada ideal calculada… en el 3D (`map3d.ts:1331`, a partir de la curvatura).
  - La instantánea (`snapshot.ts`) guarda todos los campos del coche salvo las referencias, así que un campo nuevo
    se guarda solo.

**Lo que cuesta hoy:** unos 111 µs por paso con 22 coches (~5 µs por coche y paso). Una carrera sin interfaz son unos
10 s en Monza y unos 15 s en Mónaco en escritorio (`npx tsx`), y de 3 a 5 veces más en un móvil.

---

## 2. Decisiones de partida

1. **Un solo motor.** Ver la carrera o simularla sin mirar da exactamente lo mismo. Nada de un modo «bonito» para
   cuando se mira.
2. **Determinista** con la semilla, como ahora.
3. **Presupuesto de rendimiento:** como mucho **+25 %** por paso (objetivo: +10-15 %). Se mide con el script de
   tiempos (ver §8) antes y después de cada fase.
4. **Esto cambia resultados a propósito.** Se dice en cada PR, y la referencia de `finde.ts` se regenera al final de
   cada fase, no a mitad.
5. **La calibración que ya hay manda:** el número de adelantamientos por circuito, los toques, las salidas de pista y
   las neutralizaciones deben seguir dentro de los márgenes de `scripts/realismo.ts`. Lo lateral decide *cómo* y
   *quién*, no *cuántos*.
6. **Decidido: adelantar sigue siendo igual de frecuente.** El número de adelantamientos de cada circuito no cambia
   con este plan: la fase 3 ajusta `PASS_RESOLVE` para que la media por circuito quede como ahora (dentro de lo que pide
   `realismo.ts`). Si más adelante se quiere cambiar, será una tarea aparte.
7. **Decidido: lo que manda el jugador.** Las órdenes de pelea que ya existen (defender, no pelear, dejar pasar) más
   una nueva, el **riesgo en la pelea** (limpio o duro), que **ya está hecha sobre el motor de ahora** (`hard`,
   `RISK_*` en `session.ts`). Con la posición lateral, «duro» pasará a ser frenar más tarde, cerrar más tarde y ceder
   menos en paralelo (§4.2-4.4), y no solo unas constantes. Nada de órdenes por curva: eso sería pilotar desde el muro.

---

## 3. El modelo

### 3.1 La pista a lo ancho (`track.ts`)

Todo lo que hoy calcula `map3d.ts` y necesita la simulación pasa a `buildTrack`, y el 3D lo lee de ahí:

- `halfW[i]`: media anchura en metros por punto (`ds`). Sale de `"ancho"` y, si no hay, de 6,5 m (5 m en los urbanos),
  como ahora.
- `line[i]`: la **trazada ideal**, en metros desde el centro (positivo a la derecha). Es la misma fórmula de
  `map3d.ts:1331` (por fuera antes de la curva, vértice por dentro y salida por fuera), pero en metros y limitada a
  `±(halfW − 1,2)`.
- `inside[i]`: el lado del interior de la próxima curva (±1), mirando unos 150 m por delante. Sirve para saber
  dónde está «por dentro» al llegar a la frenada.
- `runoff[i]`: qué hay por fuera, a cada lado (asfalto, grava o muro). Ya existe para el 3D (`rL`/`rR`, `rO`/`rP`).
  Decide si irse largo es perder tiempo, dañar el fondo o acabar contra el muro.

Anchura de cada circuito (noviembre de 2026):
- **Medida (19):** los 17 con trazado de TUMFTM (`relieve.py`) más Melbourne y Yas Marina, con TUM encajado sobre el
  trazado del juego (`scripts/anchos.py`; en Yas Marina, TUM es el trazado anterior a 2021 y el 27 % de la vuelta va
  con la mediana).
- **Constante, por defecto (8):** Bakú, Las Vegas, Lusail, Madrid, Miami, Mónaco y Singapur, pendientes de
  `scripts/anchos_osm.py` (OpenStreetMap; desde el entorno en la nube no se llega a overpass-api.de), y Sierra Norte,
  que es inventado. Funcionan con el valor por defecto; conviene tenerlos antes de la fase 4.

### 3.2 Estado nuevo del coche (`Car`)

```ts
lat: number;     // metros desde el centro (positivo a la derecha)
latV: number;    // m/s lateral
latWant: number; // adónde quiere ir el piloto ahora
duel?: Duel;     // maniobra en curso con otro coche (ver §4.2)
```

Son números sueltos: no pesan en la instantánea y se guardan solos.

### 3.3 El paso lateral

En `moveCar`, después de avanzar `s`:

- `latWant` lo elige el **piloto** (§3.4).
- Se mueve como un muelle amortiguado, con la velocidad lateral limitada por la velocidad del coche y lo que haya
  de agarre libre: en una recta a fondo puede cambiar de lado deprisa, en el apoyo de una curva casi nada. Algo así:
  `latV += clamp(k·(latWant − lat) − d·latV, ±aMax(v, curva))·dt` y `latMax ≈ 2-3 m/s`.
- Se limita a `±(halfW − 1)`. Pasarse de ahí es **salirse** (§4.5).

Coste: unas 10-15 operaciones por coche y paso. No hace falta subdividir el paso: a 20 Hz y unos 2 m/s, un coche se
mueve como mucho unos 10 cm lateralmente por paso.

### 3.4 El piloto: adónde quiere ir

Una función por coche, `latIntent(c)`, que se llama **una vez por minisector** (en `onMsEnter`, como `overtakeCheck`)
y no en cada paso. Por orden:

1. Hay una maniobra en curso (`duel`): manda la maniobra.
2. Lo están doblando o le han dicho que deje pasar: a la parte de fuera de la trazada, por el lado contrario al que
   llega el otro.
3. Va pegado a otro coche (a menos de ~1 s) en una curva rápida: se abre medio coche para respirar aire limpio. Así
   pierde algo de trazada, pero se le calienta menos el delantero (decisión real: «salirse de la estela»).
4. Llega una frenada buena para adelantar con el de delante a tiro: mira si se tira (§4.2).
5. Si no: la **trazada** (`line`), con un pequeño error según su regularidad, para que no vayan todos sobre el mismo
   hilo.

### 3.5 Lo que cuesta no ir por la trazada

`msTime` recibe la separación respecto a la trazada (`off = |lat − line|` en la curva):

- **Agarre:** fuera de la trazada hay menos goma y, con la carrera avanzada, *marbles* (crecen con `rubber` y con las
  vueltas). Pérdida de agarre ∝ `cornerSens · (off / halfW)² · (0,6 + marbles)`.
- **Recorrido:** el exterior es más largo y el interior obliga a frenar antes y a salir peor. Se aplica como un
  multiplicador pequeño del tiempo del minisector, solo en curva.
- **Agua:** se reparte entre `water` (trazada) y `waterOff` (fuera) según `off`. Esto ya existe a medias para el que
  ataca, y ahora vale para todos.

---

## 4. Lo que cambia

### 4.1 Aire sucio y rebufo según el lado

Hoy: `dirtyAir(gap)` y `tow(gap)`. Pasan a ser `dirtyAir(gap) · solape(dLat)` y `tow(gap) · solapeRebufo(dLat)`:

- `solape(d) = exp(−(d / 1,4)²)`: justo detrás es todo, a 2 m (un coche de ancho) ya es poco.
- El rebufo es más ancho (la estela se abre): `exp(−(d / 2,5)²)`.

Consecuencia que se ve: el que sigue de cerca en las curvas rápidas va algo abierto, y en la recta se mete detrás
para coger el rebufo y luego sale para atacar. Hoy eso no existe.

**Calibración:** la media del efecto sobre un coche que «sigue» debe parecerse a la de ahora. Se compensa subiendo un
poco `DIRTY_AIR` o `TOW` si hace falta, y se comprueba con el tiempo medio perdido detrás de otro coche (métrica
nueva, §8).

### 4.2 Adelantar como maniobra de varios pasos

`overtakeCheck` deja de resolver con una sola tirada. La cuenta de la ventaja (`adv`, `will`) se queda: es la que
está calibrada por circuito. Lo que cambia es que ahora decide **si se intenta y con cuánta convicción**, y el
resultado sale de una maniobra:

```
nada → preparar → en paralelo → resolver
```

1. **Preparar** (en la recta, antes de la frenada): si `will` supera un mínimo, el atacante pone `latWant` al
   interior de la curva (`inside`). Si el de delante defiende (`fightMode`), también va al interior… y ahí se
   decide algo que hoy no existe: si llega antes él, el atacante tiene que ir **por fuera** o quedarse detrás.
2. **En paralelo** (frenada y curva): hay solape a lo largo (`|Δs| < 5,6 m`) y los dos están a los lados. Cada
   paso, el atacante «frena más tarde» según `adv`, ataque contra defensa y agarre, y con algo de azar se va un poco
   por delante o por detrás. El de fuera tiene el recorrido más largo y el de dentro sale peor de la curva.
3. **Resolver** (salida de la curva o a los 2-3 minisectores):
   - Si el atacante tiene el morro delante → adelanta. El que pierde la posición se lleva el `delay` de ahora, pero
     calculado por la geometría, no a ojo.
   - Si no → se queda detrás, con la pérdida de un intento fallido.
   - Si alguno se pasa de frenada → se va largo (§4.5) o bloquea.
   - Si los dos quieren el mismo trozo de pista → **toque** (§4.4).

**Por qué no se descalibra:** la probabilidad de que la maniobra acabe en adelantamiento se ajusta para que, con la
misma `will`, salga lo mismo que hoy (una constante, `PASS_RESOLVE`, ajustada con `realismo.ts`). Lo nuevo es
*cómo* pasa y lo que cuesta, no *cuántas veces*.

**Sitios nuevos que salen solos:**
- Por fuera: rara vez sale, pero sale (Interlagos T1, Spa en Les Combes).
- Cruce: el que defiende el interior frena antes y sale peor, y el de fuera cruza y le pasa en la salida.
- Rueda con rueda dos curvas seguidas (la S de Senna, Maggotts-Becketts).
- Tres coches a la vez en la vuelta 1.

### 4.3 Defender

Hoy `fightMode === "defend"` cuesta un `delay` fijo. Ahora defender **es moverse**:

- Se tapa el interior antes de la frenada: trazada peor y salida peor. El coste sale solo de §3.5.
- **Un solo cambio de dirección:** si el defensor ya se ha movido y se mueve otra vez con el otro al lado, puede haber
  toque o investigación («moverse en la frenada», 5 s), con poca probabilidad.
- Lo que manda el jugador («defender» o «no pelear») cambia el `latWant` del piloto. Se verá en el mapa.

### 4.4 Toques por geometría

Hay toque cuando **dos coches se solapan a lo largo y a lo ancho** (`|Δs| < 5,6 m` y `|Δlat| < 1,9 m`).
Hoy el toque es `contactP` por intento. Pasa a ser:

- Detección en `interactions`, que ya ordena por `s` y recorre vecinos. Se mira solo el de delante y el de detrás
  inmediatos (y el segundo si hay paralelo): sigue siendo O(n).
- Antes del choque, el piloto **intenta evitarlo:** el que tiene menos derecho (el de detrás, o el de fuera en el
  vértice) se aparta o levanta. Lo hace bien con una probabilidad que depende de su agresividad, de la rivalidad y del
  agua. La agresividad y las rivalidades que ya hay (`RIVALS`, `rivalOf`) siguen mandando.
- Si se tocan, la gravedad sale de la **velocidad de cierre** (lateral y longitudinal) y no de una tirada: un roce a
  1 m/s es alerón o nada, un golpe por detrás a 15 m/s es pinchazo o accidente. Se conservan las cinco consecuencias de
  `contact` y se reparte la probabilidad de cada una según esa gravedad.
- Los comisarios (`probes`) ya investigan cada toque. Ahora pueden mirar **quién se movió**: el que cambió de
  dirección o el que llegó de detrás sin solape tiene la culpa más a menudo.

**Calibración:** el número total de toques por carrera tiene que seguir dentro de lo que pide `realismo.ts`.

### 4.5 Salirse de pista

Ahora es algo que se ve y se recorre:

- Un error en curva (`errorCheck`, misma probabilidad) ya no es un `delay` sin más: es una **velocidad lateral hacia
  fuera** (`latV`) y algo de frenada. El coche se va hacia el exterior y lo que pase depende de `runoff`:
  - asfalto: pierde tiempo y vuelve (posible límites de pista);
  - grava: frena mucho y puede dañar el fondo (lo de ahora: `damageFloor`);
  - muro: accidente.
- La proporción de trompos, salidas y accidentes debe salir parecida a la de ahora (`CRASH_P`, 0,2, 0,35). Se ajusta
  con la fuerza del empujón lateral.
- **Volver a la pista con cuidado:** el que vuelve cede a los que llegan (si no, toque o investigación).
- Los límites de pista (`trackLimits`, `TL_P`) pasan a ser el piloto rozando el borde: ocurren cuando `|lat|` toca
  `halfW` en la salida de la curva. El número total se calibra con `TL_P` como ahora.
- El dibujo del trompo (`c.fx`) se queda, pero **sobre la posición real**.

### 4.6 Salida y vuelta 1

- **La parrilla en dos filas**, con `lat` a cada lado.
- Hasta la primera frenada, `interactions` ya deja que cada uno avance con su tracción. Ahora cada uno elige hueco a
  lo ancho (el de detrás busca el lado libre), y en la primera curva se ve el embudo: dos o tres a la par, el de fuera
  levanta o se toca.
- Esto debería **sustituir parte de los multiplicadores de la vuelta 1** (`lap1 ? 2,2 : 1` en los toques, `p *= 2` en
  los errores). Se ajusta con la métrica de toques en la vuelta 1.

### 4.7 Doblados, coche de seguridad y boxes

- **Banderas azules:** el doblado se aparta hacia fuera de la trazada (y pierde por ello, en vez de un `delay` fijo).
  El que no hace caso (`blueHold`) se queda en la trazada.
- **Coche de seguridad:** fila india en la trazada, con un vaivén lateral para calentar los neumáticos (solo cuesta
  un poco de combustible y es lo que se ve en la tele).
- **Entrada y salida de boxes:** al pedir la parada, el piloto va hacia el lado de boxes antes de la entrada, y al
  salir se incorpora pegado a la línea de salida. Los que llegan por la pista no se le echan encima (lo justo para la
  «salida insegura», que ya existe en `UNSAFE_P`).

### 4.8 Lluvia

- La **línea seca** (`waterOff` frente a `water`) ya existe. Con el lateral, el que va por la trazada pisa menos agua y
  el que se sale de ella, más. Adelantar con la pista medio seca cuesta de verdad.
- En mojado fuerte, la trazada buena es **otra** (por fuera del vértice, donde no está la goma). Se puede hacer más
  adelante; en la primera versión basta con que el agua dependa de `off`.

---

## 5. El 3D

- `map3d.ts` lee `c.lat` (interpolado entre pasos como ya hace con `s`) y **se borra la separación inventada**
  (`want = ±0,4`, `map3d.ts:3423-3437`).
- La trazada `line` la calcula la simulación y el 3D la usa: los dos van con los mismos números.
- `p.fxSide` y los desplazamientos de los percances (`fxSide`, `p.s = c.s + 24 · …` en el accidente) salen de la
  posición real.
- Se puede añadir en el mapa una ayuda para ver la maniobra en curso: una flecha de «se tira por dentro» encima del
  coche que ataca. Es lo que hoy no se puede contar porque no existe.

Este cambio en el 3D **no toca la simulación** y se puede hacer en cuanto exista `lat`.

---

## 6. Azar y determinismo

- Nada de azar nuevo con `Math.random()` en la simulación (regla del proyecto).
- **Los temblores de la trazada** (§3.4, error según regularidad) y las decisiones laterales usan su **propio `Rng`**
  (`this.latRng`, semilla derivada de la de la sesión), como hacen `blueRoll`, `setup.ts` y `development.ts`. Así, la
  fase 1 (solo dibujo y trazada) no mueve el resto del azar y se puede comprobar con `finde.ts` que la carrera sale
  idéntica.
- A partir de la fase 2 los resultados cambian a propósito. Eso se dice en el PR y se regenera la referencia.

---

## 7. Rendimiento

| Parte | Cuándo | Coste aproximado |
|---|---|---|
| Paso lateral (muelle y límites) | cada paso, cada coche | ~10-15 operaciones |
| Intención del piloto (`latIntent`) | una vez por minisector | parecido a `overtakeCheck` |
| Solapes y toques | cada paso, en `interactions`, solo con los vecinos | O(n), ya se recorre la lista |
| Aire sucio y rebufo con el lado | cada paso que ya los calcula | una `exp` más |
| `msTime` con la separación | ya se llama por minisector | unas pocas operaciones |

Estimación: **+10-20 %** por paso. El móvil se queda dentro: simular sin mirar pasa de 30-70 s a 35-85 s en el peor
caso.

Se mide con un script nuevo, `scripts/tiempos.ts` (el que se ha usado para este plan: corre una carrera de Monza y
otra de Mónaco y saca los µs por paso). Si una fase sube más del 25 %, no se mezcla.

Trucos si hiciera falta: guardar los `halfW` y `line` de cada minisector para no buscarlos en cada paso, y saltarse el
muelle lateral cuando el coche está en la trazada sin nadie a menos de 2 s (que es la mayor parte del tiempo).

---

## 8. Calibración y métricas

`scripts/realismo.ts` ya mide `passes`, `lap1`, `contacts`, `offs`, `pens`, `sc`, `vsc`, `red`, `retire`… Hay que
seguir dentro de sus márgenes y añadir:

- **% de adelantamientos por dentro / por fuera / en la salida** (referencia aproximada: la gran mayoría por dentro en
  la frenada, unos pocos por fuera).
- **Tiempo en paralelo** por adelantamiento (que no se queden rueda con rueda media vuelta).
- **Toques por gravedad** (roce, alerón, pinchazo, accidente) y cuántos son en la vuelta 1.
- **Pérdida media siguiendo a otro coche** (s/vuelta a 0,5 s y a 1 s detrás), comparada con la de antes del cambio.
- **Salidas de pista por tipo de escapatoria** (asfalto, grava, muro).
- **µs por paso** (§7).

Y una comprobación de sentido: en ninguna carrera puede haber dos coches solapados a lo largo y a lo ancho más de
un paso sin que haya habido toque (es una prueba barata de que la geometría funciona).

---

## 9. Fases (un PR cada una)

### Fase 1 · La pista a lo ancho y la trazada · no cambia resultados · ✅ Hecha
- **`track.ts`:** `line` (trazada, fracción de la media anchura), `wr` y `wReal` (anchura) y `street`. Es la misma
  fórmula que tenía el 3D, que ahora los lee de aquí. `inside` y `runoff` se dejan para las fases 3 y 4, que son las
  que los usan.
- **`Car`:** `lat` (metros desde el centro), `latOff` (lo que se aparta de la trazada) y `latWant` (adónde quiere
  apartarse). Los calcula `lateral()` en cada paso, después de `interactions()` y con su mismo orden de coches.
  - Hace lo que hacía el dibujo (el de detrás se aparta si está a menos de 1,3 largos y el de delante cede un poco),
    con tres mejoras para que no se atraviesen: se aparta antes cuanto más deprisa se acerca (`LAT_LOOK`), elige el
    lado por donde ya va cada uno (así no cambian de lado a mitad de un adelantamiento) y, pegados, se mueve más
    deprisa (`LAT_TAU_QUICK`).
  - Sin azar, así que no hizo falta `latRng`. Tampoco `latV`: en esta fase basta con acercarse poco a poco al
    objetivo.
- **El 3D** interpola `latOff` como la distancia y se borra la separación inventada.
- **Comprobación:**
  - `finde.ts silverstone 42` y `monaco 7` idénticos.
  - `tiempos.ts`: la diferencia con antes está dentro del ruido de la medida (±8 % entre ejecuciones).
  - De los pares de coches a menos de 5 m (Silverstone), quedan separados a lo ancho más de un coche el **89 %**,
    frente al 66 % de la separación que hacía el dibujo.
  - Captura del 3D en paralelo con `poc3d/prueba.html`. La página de prueba deja ahora la sesión en
    `window.__sess` para buscar momentos así.

### Fase 2 · Aire sucio, rebufo y trazada · cambia resultados · ✅ Hecha
- **Estela según el lado:** el aire sucio y el rebufo se multiplican por `exp(−(dl/w)²)`, con `dl` la separación
  lateral con el de delante (`Car.aheadDl`, de `lateral()`). La estela que quita carga mide `WAKE_DIRTY` = 3,5 m y la
  del rebufo, `WAKE_TOW` = 4,5 m. Son más anchas que los 1,4 y 2,5 m del borrador: con esos, abrirse quitaba casi
  todo el aire sucio. Lo mismo en el trabajo extra del delantero (graining en aire sucio).
- **Fuera de la trazada** (`Car.offLine`, fracción de la media anchura): agarre `× (1 − OFFLINE_GRIP · sensibilidad ·
  off² · (0,6 + 0,4 · goma))`, con `OFFLINE_GRIP` = 0,035, y el agua de fuera de la trazada (`waterOff`) en proporción.
- **Respirar:** a menos de `BREATHE_GAP` = 1 s de otro, en las curvas de `aero · sensibilidad` ≥ 0,25 (más o menos
  el cuarto más rápido), se abre `LAT_BREATHE` = 0,25 hacia el centro. Se precalcula por circuito (`breatheSide`).
  Con 1,3 s se probó y sale peor: a 1,2 s abrirse cuesta más de lo que da.
- **Recalibrado:** `DIRTY_AIR` pasa de 0,12 a 0,135, para que lo que se pierde siguiendo a otro coche quede como antes
  (`scripts/aire.ts`, media de los 25 circuitos, en s/vuelta):

  | Detrás a | 0,3 s | 0,5 s | 0,8 s | 1,2 s |
  |---|---|---|---|---|
  | Antes | 0,415 | 0,339 | 0,208 | 0,042 |
  | Ahora | 0,400 | 0,338 | 0,225 | 0,059 |

- **Lo que hizo falta para que adelantar siga igual de frecuente:**
  - Con lo anterior, los adelantamientos bajaban del 0,92 al 0,85 del objetivo: el que ataca llegaba a la recta abierto
    de la curva anterior (menos rebufo) y con el agarre de fuera de la trazada en la frenada. En `overtakeCheck`, ahora
    el que ataca hace la recta en la estela y los dos frenan por la trazada, como ya suponía `passOutlook`.
  - Aun así quedaba un ~4,5 % menos (semillas 1 y 101, 400 carreras). `PASS_LAT` = 0,05 s/vuelta rebaja el umbral de
    todos los circuitos, y también lo que el Muro dice que hace falta.
- **Comprobación** (`realismo.ts --carreras=8 --rapido`, 25 circuitos, 200 carreras por semilla, antes → ahora):

  | | Semilla 1 | Semilla 101 |
  |---|---|---|
  | Adelantamientos / objetivo | 0,92 → 0,94 | 1,21 → 1,23 |
  | Coche de seguridad | 57 → 55 % | 57 → 59 % |
  | Bandera roja | 6 → 10 % | 2 → 7 % |
  | Toques por carrera | 0,8 → 0,8 | 1,0 → 1,0 |
  | Sanciones por carrera | 1,3 → 1,4 | 1,6 → 1,5 |
  | Paradas medias | 1,50 → 1,50 | 1,69 → 1,69 |

  - Las banderas rojas son pocas (de 4 a 20 por cada 200 carreras) y bailan mucho entre pasadas: con un código casi
    igual salieron un 1 % y un 6 %. Nada de esta fase toca los accidentes.
  - Lo que estaba fuera de margen (gana el de la pole y gana alguien desde P4 o más atrás, por `--rapido`, y la
    dispersión de los adelantamientos con la semilla 101) ya lo estaba antes.
  - Tiempo por paso: igual que antes, con el lado hacia el que se abre precalculado por circuito.

### Fase 3 · Adelantar y defender como maniobras · cambia resultados
- §4.2 y §4.3. `PASS_RESOLVE` ajustada por circuito con `realismo.ts`.
- El muro (`passOutlook`) sigue dando la misma probabilidad: ahora es la de que la maniobra salga.
- **Comprobación:** adelantamientos por circuito dentro de su objetivo; métricas nuevas de §8.

### Fase 4 · Toques, salidas y vuelta 1 · cambia resultados
- §4.4, §4.5 y §4.6. Se quitan los multiplicadores de la vuelta 1 que ya sobren.
- Comisarios: culpa según quién se movió.
- **Comprobación:** toques, salidas, coches de seguridad y abandonos dentro de márgenes; la prueba de solapes de §8.

### Fase 5 · Doblados, coche de seguridad, boxes y lluvia · cambia resultados (poco)
- §4.7 y §4.8.

### Fase 6 · Radio, Lobato y README
- Mensajes nuevos con código propio: «se tira por dentro», «por fuera», «rueda con rueda», «le cierra la puerta»,
  «se mueve en la frenada». Lobato y la radio reaccionan a ellos (`lobato.ts` y `voces.ts` ya funcionan por código).
- README: apartado «El modelo» al día.

---

## 10. Riesgos

- **Que parezca de carriles:** si el piloto solo tiene tres posiciones (trazada, dentro, fuera), se notará. Por eso el
  muelle, los temblores según regularidad y el apartarse medio coche en las curvas rápidas.
- **Descalibrar los adelantamientos:** es lo que más tiempo ha costado ajustar (ver el comentario de `PASS_T0`). La
  fase 3 mantiene la cuenta de `adv`/`will` y solo cambia cómo se resuelve, para que el ajuste sea una sola constante.
- **Toques en cadena** en la vuelta 1 si la evitación falla: se limita con la evitación (§4.4) y se mira la métrica
  de toques en la vuelta 1.
- **Coches atascados a la par:** se fuerza la resolución a los 2-3 minisectores.
- **Circuitos sin anchura real:** funcionan con el valor por defecto, pero Mónaco y Singapur con 5 m de media anchura
  son justo donde más importa. Conviene añadir `"ancho"` a los urbanos antes de la fase 4.

---

## 11. Por qué no física completa

Se comparó con una física de conducción en 2D (cada coche con x/y, ángulo, deslizamiento y un piloto IA con
volante):

- Necesita unos 200 Hz (a 20 Hz y 300 km/h se recorren 4 m por paso): de 3 a 8 veces más coste. Simular sin mirar en
  el móvil pasaría de menos de un minuto a varios minutos, y habría que tener dos motores, con lo que ver la carrera
  la cambiaría.
- Se perdería toda la calibración (tiempos por vuelta, reglajes, desgaste, agua, aire sucio) y la IA de estrategia
  predice con el modelo de una dimensión.
- El jugador no conduce: casi todo lo que la física completa añade respecto a este plan no se nota desde el muro.

Este plan se queda con lo que sí se nota (dónde está cada coche, quién va por dentro, quién se toca y por qué) y deja
la puerta abierta a añadir más física solo en los momentos que la necesiten (un trompo, un golpe), sin tocar el
resto.
