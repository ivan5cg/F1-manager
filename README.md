# Muro de Boxes

Juego de estrategia de carreras de monoplazas centrado en el **día de carrera**. No hay gestión de equipo: eres el muro de boxes de dos pilotos y decides paradas, neumáticos, ritmo, motor y batería mientras el tiempo, los neumáticos y los rivales hacen de las suyas.

Es una web para el móvil (se instala como aplicación desde el navegador) y funciona sin conexión.

## Jugar

```bash
npm install
npm run dev        # abre la URL que muestra (también desde el móvil en la misma wifi)
```

- **Previa**: eliges equipo, ves la previsión del meteorólogo y los datos de los libres (estimados, con error), y decides neumático de salida y carga de combustible.
- **Carrera**: velocidad ×1 a ×64. La carrera **se pausa sola** cuando hay que decidir (lluvia, coche de seguridad, neumáticos que caen, consejo del estratega). Toca el aviso para seguir.
- Abajo, siempre a mano: posición, distancia delante/detrás, vida del neumático, ritmo (− / +) y **BOX**.
- Pestañas: clasificación, pilotos (temperaturas de carcasa y superficie por eje, desgaste, graining, ampollas, combustible, batería, modos), tiempo (radar de 40 km, previsión por minutos, agua por sector) y radio.

## Simular sin interfaz

```bash
npm run sim -- 42 frente     # una carrera, semilla 42, escenario forzado
npm run lote -- 20 chubascos # estadísticas de 20 carreras
```

Sirve para calibrar: paradas por coche, abandonos, coches de seguridad, adelantamientos, distancias...

## El modelo

Todo es determinista a partir de la semilla: la misma semilla repite la misma carrera.

**Circuito y coche** (`src/sim/track.ts`). El trazado es una curva; de su curvatura sale la velocidad máxima en cada punto con un modelo de masa puntual con carga aerodinámica (adherencia × (peso + carga) ≥ fuerza centrífuga), más pasadas de aceleración (potencia, tracción, resistencia) y frenada. Así se obtiene la vuelta de referencia y, para cada uno de los 25 minisectores, cuánto tiempo cambia con la adherencia, la potencia, la resistencia y la masa. El carácter del circuito (qué zonas castigan los neumáticos delanteros o traseros, dónde se puede adelantar, dónde va el DRS) sale de la geometría, no se escribe a mano.

**Neumáticos** (`src/sim/tyres.ts`). Por eje: temperatura de carcasa (lenta) y de superficie (rápida), que dependen del asfalto, el aire, la energía que mete cada curva, el ritmo, el calor de los frenos (llanta delantera) y el agua. La adherencia depende de la ventana de temperatura de cada compuesto, el desgaste (con "precipicio"), el graining (carcasa fría, se limpia al calentarse) y las ampollas (permanentes). Un día frío favorece al blando y el duro hace graining; un día caluroso el blando se sobrecalienta.

**Lo que nadie sabe.** Cada carrera esconde cuánto desgasta de verdad cada compuesto (±12-15 %), si los neumáticos trabajan más fríos o calientes de lo previsto y la tendencia al graining. Cada equipo tiene una estimación con más o menos error según su calidad; la IA compara el desgaste real con el que esperaba, corrige su modelo y replanifica en carrera. Al final se revela lo oculto.

**Tiempo** (`src/sim/weather.ts`). La lluvia son células que nacen, crecen, se desplazan con el viento en altura y mueren. Cuatro escenarios: estable, chubascos dispersos, frente y llovizna. Afecta a la temperatura del aire y del asfalto (sol, nubes, hora). El agua en pista se calcula por minisector: entra con la lluvia y sale por drenaje, evaporación y **el paso de los coches**, que abren trazada seca. El radar muestra el campo real; la previsión del equipo es un conjunto de 30 miembros que extrapola lo que ve, sin saber qué células nacerán ni cuándo morirán.

**Carrera** (`src/sim/race.ts`). Pasos de 0,2 s. Cada coche avanza según su tiempo en cada minisector con su estado de ese instante. Aire sucio (pierde carga en curva y calienta los delanteros), rebufo, DRS, tapones físicos, adelantamientos en zonas de frenada según la diferencia de ritmo, la batería y las habilidades de ataque y defensa, banderas azules, toques, errores (más con neumáticos fríos, desgastados o con agua), pinchazos, averías, coche de seguridad y VSC, salida parada, combustible por distancia y regla de dos compuestos en seco.

**Estrategia** (`src/sim/strategy.ts`). La IA simula stints con el mismo modelo de neumáticos (con su error), busca la mejor combinación de 0, 1 o 2 paradas, y en carrera reacciona a coches de seguridad, undercuts, lluvia (con su previsión) y desgaste inesperado. A tus pilotos les da consejos, pero decides tú.

## Datos editables

- `data/equipos.json`: equipos y pilotos (inventados).
- `data/circuito-sierra.json`: trazado (puntos), vueltas, boxes, abrasividad.

## Próximos pasos

1. Clasificación jugable (Q1-Q3, tráfico, vuelta de preparación, evolución de pista, elegir cuándo salir).
2. Estratega con Monte Carlo: simular cientos de futuros de la carrera para dar probabilidades ("parar ahora: 62 % de quedar delante").
3. Temperatura de frenos y motor, refrigeración en aire sucio.
4. Más circuitos y temporada.
5. Reglaje (carga aerodinámica / mecánico) antes de la carrera.
