# Rendimiento de los coches de 2026 por tipo de circuito

De dónde salen `agarre`, `potencia` y `curvas` de `data/equipos-2026.json` (y la `potencia` de los motores de
`data/mercado-2026.json`). Hecho el 26 de noviembre de 2026, con los 21 grandes premios disputados.

## Qué representa cada valor

- **`agarre`**: el nivel del coche en curva. Es el de los **GP 13 a 21** (Monza, Madrid, Bakú, Baréin en Sepang,
  Singapur, Austin, México, São Paulo y Las Vegas), porque es la forma más reciente de cada equipo.
- **`curvas`** `[lenta, media, rápida]`: lo que el coche gana (+) o pierde (−) sobre su agarre en cada tipo de curva.
  En cada minisector del juego, el agarre del coche es `agarre + curvas` repartido según la velocidad mínima del
  minisector (`cornerBand` en `src/sim/track.ts`):
  - lenta por debajo de 110-140 km/h;
  - rápida por encima de 190-230 km/h;
  - media entre medias, con transiciones suaves.
- **`potencia`**: una por fabricante de motor (Mercedes, Ferrari, Red Bull-Ford, Honda y Audi), compartida por los
  equipos que lo llevan.

Las unidades son las de siempre. `TEAM_SPREAD` (2,6) multiplica las diferencias frente al mejor de la parrilla, y el
desarrollo durante la temporada (`development.ts`) suma en esas mismas unidades.

## Método

1. **Datos.** Tablas de clasificación (Q1, Q2 y Q3 de cada piloto) y de carrera de las páginas de Wikipedia de cada
   gran premio. Están en `rendimiento/datos/res2026.json`; `parse.py` las extrae del wikitexto.
2. **Distancia de cada equipo a Mercedes.** Se toma la mejor vuelta del equipo en la última parte a la que llegó y la
   de Mercedes en esa misma parte.
   - Así no se le carga al coche la evolución de la pista: el que cae en Q1 hizo su vuelta con la pista más verde. La
     primera versión del ajuste comparaba con la pole y salía ~0,5 % más lenta para la zona media.
   - Se descuenta lo que pone el piloto que marcó la vuelta, con su `ritmo` del juego (0,07 % de agarre por punto).
   - Se excluye São Paulo, porque su clasificación fue mojada.
3. **Tipo de circuito.** `sens.ts` mide, con el modelo de pista del juego, cuántos segundos por vuelta vale en cada
   circuito un 1 % de agarre en curva lenta, media y rápida, y un 1 % de potencia. Resultado en `datos/sens.json`.
4. **Ajuste** (`fit.py`). Mínimos cuadrados sobre las 20 clasificaciones secas del año (200 observaciones):
   `distancia = Σ_curva (nivel + carácter) · sensibilidad + déficit del motor · sensibilidad a la potencia`.
   - El nivel tiene dos fases: GP 1-12 y GP 13-21. En el juego se usa el de 13-21.
   - El carácter y el motor salen del año entero, porque los GP 13-21 casi no tienen curvas rápidas.
   - El carácter suma cero y se tira hacia cero lo que los datos no sostienen.
   - La potencia de cada motor se tira hacia la que ya tenía el juego. Sin eso, agarre y potencia se confunden:
     Honda salía con un 19 % menos.
   - Error del ajuste: 0,52 % de la vuelta, frente a 0,88 % sin modelo.
5. **Corrección empírica.** En el simulador, la clasificación tiene efectos que el ajuste no ve: moral, reglajes y que
   los de cabeza exprimen la Q1. Por eso se corrige el nivel de cada equipo en tres pasadas amortiguadas, comparando con
   lo real en los 9 circuitos de los GP 13-21 (`cmp.js`). Se paró cuando las diferencias quedaron dentro del ruido
   (±0,2-0,3 % con tres semillas por circuito).

## Resultado

Déficit de potencia frente a Mercedes: Ferrari 2,0 %, Red Bull-Ford 1,1 %, Audi 1,9 %, Honda 4,8 %.

Carácter (déficit de agarre en %, positivo = peor en ese tipo de curva) y nivel por fases (`datos/fit.json`):

| Equipo | Nivel GP 1-12 | Nivel GP 13-21 | Lentas | Medias | Rápidas |
|---|---|---|---|---|---|
| Ferrari | 0,18 | −0,15 | 0,09 | −0,23 | 0,27 |
| Red Bull | 1,10 | 0,24 | −0,14 | 0,11 | 0,15 |
| McLaren | 1,02 | 0,88 | 0,17 | −0,25 | 0,07 |
| Racing Bulls | 2,42 | 1,80 | 0,00 | 0,00 | −0,01 |
| Alpine | 2,30 | 1,96 | 0,38 | −0,55 | 0,15 |
| Haas | 2,57 | 1,77 | −0,14 | 0,09 | 0,20 |
| Audi | 2,20 | 1,56 | −0,13 | 0,31 | −0,33 |
| Williams | 4,32 | 4,63 | −0,78 | 0,96 | 0,06 |
| Cadillac | 4,52 | 4,34 | 0,07 | −0,10 | 0,01 |
| Aston Martin | 4,76 | 3,37 | −0,73 | 0,73 | 0,43 |

En resumen:
- **Ferrari** va mejor en curva media y peor en rápida.
- **Williams** y **Aston Martin** van bien en curva lenta y mal en media (Aston Martin, también en rápida).
- **Alpine** sufre en curva lenta.
- **Audi** sufre en curva media y va bien en rápida.
- **Red Bull** y **Aston Martin** son los que más mejoran de la primera a la segunda mitad del año.

Comprobación: distancia a Mercedes en clasificación, misma parte de la sesión, mediana de los 9 circuitos de los GP
13-21 (São Paulo sin dato real). Real frente a simulador, 3 semillas por circuito:

| Equipo | Real | Simulador |
|---|---|---|
| Ferrari | 0,19 | 0,19 |
| Red Bull | 0,22 | 0,16 |
| McLaren | 0,37 | 0,36 |
| Audi | 0,89 | 0,87 |
| Racing Bulls | 1,11 | 0,67-1,32 (ruido entre pasadas: se dejó en el punto medio) |
| Haas | 1,16 | 0,98 |
| Alpine | 1,16 | 0,96 |
| Williams | 1,92 | 1,66 |
| Cadillac | 2,14 | 2,17 |
| Aston Martin | 2,34 | 2,32 |

## Lo que no se ha podido sacar

- **Ritmo de carrera.** Wikipedia solo da el tiempo total. Los coches de seguridad agrupan, los doblados solo dicen
  vueltas y la estrategia mete ruido, así que las distancias en carrera salen a la mitad que en clasificación
  (`race.py`). Hace falta el tiempo vuelta a vuelta. La única señal coherente: Red Bull y McLaren rinden algo mejor en
  carrera que en clasificación (−0,04 % y 0,11 % frente a 0,21 % y 0,22 %).
- **Pilotos.** En la segunda mitad del año hubo cambios (por ejemplo, Lawson en Red Bull y Tsunoda en Racing Bulls desde
  Monza), pero `equipos-2026.json` mantiene la alineación inicial. El ajuste descuenta al piloto que marcó cada vuelta,
  así que los coches no se ven afectados, pero las alineaciones del juego siguen siendo las del principio de año.

## Repetirlo

```bash
# desde la raíz del repo; datos ya descargados en scripts/auditoria/rendimiento/datos/
npx tsx scripts/auditoria/rendimiento/sens.ts melbourne shanghai suzuka miami montreal monaco barcelona spielberg silverstone spa hungaroring zandvoort monza madrid baku sepang singapur austin mexico interlagos lasvegas > scripts/auditoria/rendimiento/datos/sens.json
python3 scripts/auditoria/rendimiento/fit.py                 # ajuste → datos/fit.json
python3 scripts/auditoria/rendimiento/metrics.py scripts/auditoria/rendimiento/datos/res2026.json   # métricas reales
node scripts/auditoria/lote.mjs r seco 1-3 monza madrid baku sepang singapur austin mexico interlagos lasvegas
node scripts/auditoria/rendimiento/cmp.js auditoria-out/r scripts/auditoria/rendimiento/datos/res2026.json
```

Para nuevas carreras: descargar el wikitexto de cada página (`index.php?title=…&action=raw`) con `gpNN.wiki` como
nombre y pasar `python3 scripts/auditoria/rendimiento/parse.py <carpeta> datos/res2026.json`. Los números de ronda
de `fit.py` y `cmp.js` son los de 2026.
