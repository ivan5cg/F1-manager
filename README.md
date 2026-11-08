# Muro de Boxes

Juego de estrategia de Fórmula 1 centrado en el **fin de semana de carrera**. No hay gestión de equipo: eres el muro de boxes de tus dos pilotos en una minitemporada de 5 grandes premios con la parrilla real de 2026.

Es una web para el móvil (se instala como aplicación desde el navegador) y funciona sin conexión. La pantalla de sesión imita el grafismo de las retransmisiones de 2010-2013 sobre un tema gris pizarra (degradados suaves, sin negro puro): extremos en diagonal pero todo apilado en vertical para aprovechar el espacio:
- contador «Vuelta 28/71» en caja oscura, con el estado al lado en amarillo (coche de seguridad) o rojo (bandera roja),
- torre de tiempos con la posición en gris, el líder en rojo, tus pilotos en dorado, morado para el mejor tiempo y línea roja de corte en clasificación,
- mensajes con pestaña blanca en diagonal («RADIO DEL EQUIPO», «DIRECCIÓN DE CARRERA») sobre barra oscura,
- hora local con icono del cielo, temperaturas, lluvia media y máxima y agua por sector,
- rótulos de piloto con la posición en caja roja y diferencias en caja amarilla,
- velocímetro de cada uno de tus pilotos con velocidad, marcha, acelerador, freno, batería y modo adelantamiento.

El radar meteorológico enseña en bucle los últimos 30 minutos (un fotograma cada 3), con la paleta por bandas de los radares reales, vista de 40 km y vista ampliada del circuito. Las células de lluvia tienen forma irregular, núcleos y textura propia que viaja con ellas, y siguen el ciclo de vida de una tormenta (30-60 min): nacen pequeñas y casi sin lluvia, crecen en tamaño e intensidad, maduran y se deshacen extendiéndose en lluvia débil. Las nuevas brotan sobre todo junto a las que ya llueven (tormentas multicelulares que se regeneran), y los sistemas grandes y los frentes nacen fuera del alcance del radar y entran por el borde: nada aparece hecho de la nada. Los frentes llegan en banda con lluvia más débil detrás. Lo que se ve en el radar es exactamente lo que cae en cada tramo de pista.

## Jugar

```bash
npm install
npm run dev        # abre la URL que muestra (también desde el móvil en la misma wifi)
```

## La temporada

| Ronda | Gran Premio | Circuito | Fecha | Formato |
|---|---|---|---|---|
| 1 | Gran Bretaña | Silverstone | 5 de julio | Normal |
| 2 | Bélgica | Spa-Francorchamps | 19 de julio | Normal |
| 3 | Italia | Monza | 6 de septiembre | Normal |
| 4 | Sierra Norte (ficticio) | Sierra Norte | 11 de octubre | Normal |
| 5 | São Paulo | Interlagos | 8 de noviembre | **Sprint** |

- **Formato normal:** Libres 1, Libres 2, Libres 3, Clasificación (Q1 18', Q2 15', Q3 12'; caen 6 y 6) y Carrera.
- **Formato sprint:** Libres 1, Clasificación sprint (SQ1 12', SQ2 10', SQ3 8'; medios en SQ1 y SQ2, blandos en SQ3), Sprint (24 vueltas), Clasificación y Carrera.
- **Puntos:** 25-18-15-12-10-8-6-4-2-1 en carrera; 8-7-6-5-4-3-2-1 en la sprint. Mundial de pilotos y de constructores.
- La partida se guarda sola al terminar cada sesión y también a mitad de una: cada pocos segundos y al salir de la app. Si se cierra el navegador o entra una llamada, al volver la sesión sigue exactamente donde estaba.

## Qué decides

- **Libres:** qué tandas hace cada piloto (instalación, simulación de clasificación, tanda larga de 5-16 vueltas) y con qué juego, o dejarlo en automático. Cada tanda larga **mide el desgaste real** y reduce el error de lo que saben tus ingenieros, pero gasta neumáticos. Las tandas largas de todos (tuyas y de los rivales) salen comparadas por compuesto: ritmo medio corregido a depósito vacío y lo que pierde cada uno por vuelta. Con pista mojada los equipos no salen con slicks: esperan en el garaje si cae fuerte o va a escampar, o ruedan unas vueltas con intermedios o de lluvia sin gastar juegos nuevos a la ligera; si les pilla la lluvia en pista, vuelven a boxes.
- **Clasificación:** cuándo sale cada piloto, con qué juego y cuántas vueltas lanzadas, mirando el reloj, el tráfico y el radar.
  - **Vuelta lanzada como en la tele:** sobre el mapa, el rótulo de cada piloto con el cronómetro corriendo, el parcial al pasar por cada sector y la diferencia con la referencia (verde si va más rápido, amarillo si va más lento). Al cruzar la meta, el tiempo, la posición que logra y la diferencia final.
  - **La referencia:** el primero, en caja roja. Si tu piloto está fuera del corte, el último que se salva (por ejemplo, el 16.º en Q1), en caja gris. Los parciales se comparan con los de la mejor vuelta de esa referencia.
- **Carrera:** neumático y combustible de salida (sin repostaje), paradas y con qué juego, ritmo, motor, batería y órdenes de equipo.
  - **Estrategia:** en la parrilla se eligen entre las 2-3 mejores distintas que ve el equipo, cada una con su número de paradas, lo que cuesta frente a la más rápida y cuánto perdería si los neumáticos se gastan un 15 % más de lo previsto.
  - Al simular hasta el final (⏭), el equipo lleva también a tus pilotos con esa estrategia. Se calcula en segundo plano, sin bloquear la pantalla.
- **Después de la carrera:**
  - gráfica de posiciones vuelta a vuelta (el ganador y tus pilotos en color);
  - tandas de neumáticos de cada piloto;
  - momentos clave: coches de seguridad, banderas, abandonos, tus paradas y la vuelta rápida.
- **Muro de boxes** (botón «Muro» en carrera), con estimaciones del equipo: su modelo de neumáticos con su error, el ritmo reciente de cada coche y la pérdida en boxes del circuito (menor con coche de seguridad o VSC). No sabe qué harán los rivales.
  - **Si para ahora:** en qué posición sale, detrás de quién y a cuánto, y quién queda detrás. Con cada juego disponible, cuánto ritmo gana frente a seguir y si alcanza al de delante. Se puede parar desde ahí.
  - **Undercut:** si el de detrás para ya y tú respondes en la vuelta siguiente, ¿te pasa? Y al revés con el de delante.
  - **Huecos en meta** de las últimas 15 vueltas con el de delante, el de detrás y tu compañero. Tocando la gráfica se ven los de cada vuelta.
- ⏸ ×1 ×4 ×16 ×64 y ⏭ (simular hasta el final). La sesión se pausa sola en los momentos clave.

## El modelo

Todo es determinista a partir de la semilla de la temporada.

**Simulación a 20 Hz.** Cada coche avanza en pasos de 0,05 s sobre el perfil de velocidad del circuito, escalado por el tiempo que tardaría él en ese tramo con su adherencia, potencia, resistencia y masa de ese instante. Un fin de semana entero se calcula en ~7 s.

**Circuitos reales** (`data/circuitos/`). Silverstone, Spa, Monza e Interlagos usan la línea central real del trazado. De la curvatura sale la velocidad máxima en cada punto (masa puntual con carga aerodinámica, potencia y frenada), con la carga de cada circuito (Monza baja). Cada circuito se calibra contra la pole real de 2026: Silverstone 1:28.111, Spa 1:44.361 y Monza 1:21.786; Interlagos, estimada en ~1:12.1. La pérdida en boxes es la de cada circuito. Zonas de adelantamiento y de modo adelantamiento (MO, el sustituto del DRS en 2026) salen de la geometría.

**Neumáticos** (`src/sim/tyres.ts`). Duro, medio, blando, intermedio y lluvia. Por eje: temperatura de carcasa y de superficie, ventana de cada compuesto, desgaste con precipicio, graining y ampollas. Entre compuestos hay ~1 s por vuelta con neumático nuevo en un circuito como Silverstone. Asignación real de juegos: 13 de seco (8 blandos, 3 medios, 2 duros), 4 intermedios y 3 de lluvia; en sprint, 12 de seco (6/4/2), 6 intermedios y 3 de lluvia. Tras cada libre se devuelven los más gastados. En carrera en seco hay que usar dos compuestos. Los juegos usados conservan su desgaste.

**En mojado** el agarre de cada compuesto depende del agua en la trazada, y el agua además enfría el neumático (mucho a un slick, poco a uno de lluvia). Está calibrado con datos reales:
- el intermedio compensa cuando la vuelta con slicks llega al 110-112 % de la de seco (regla de Pirelli), con ~0,17 mm de agua;
- un intermedio en pista seca pierde ~6 % y se destroza;
- con mucha agua el intermedio va un ~20 % más lento que en seco (en Interlagos 2024, la pole en mojado fue de 1:23.405 frente a 1:08.899 en seco el mismo fin de semana), y a partir de ~0,85 mm compensa el de lluvia.

Apartar agua frena también en recta: con pista empapada se pierde velocidad punta. La IA cambia de neumático alrededor de esos puntos de cruce, cada equipo con su criterio.

**Lo que nadie sabe.** Cada fin de semana esconde cuánto desgasta de verdad cada compuesto (±12-13 %), si los neumáticos trabajan más calientes o fríos de lo previsto y la tendencia al graining. Los equipos lo estiman con más o menos error, lo afinan en libres y lo corrigen en carrera comparando el desgaste real del stint con el previsto.

**Tiempo** (`src/sim/weather.ts`). Siempre dinámico y localizado. Hay células de lluvia grandes (frentes) y pequeñas (chubascos de 0,3-1,2 km) que mojan solo una parte del circuito. Nacen, crecen, se mueven con el viento y mueren. El clima de cada circuito corresponde a su lugar y fecha: temperaturas medias, días de lluvia y tormentas de tarde en Interlagos y Spa. El viento sopla con rachas y afecta al coche según la orientación de cada tramo: de cara frena en recta pero da carga en curva, y de cola al revés; con 25 km/h la vuelta cambia unas décimas según la dirección, y las rachas fuertes provocan más errores en las curvas rápidas. Hay ciclo diario de temperatura y sol, y cada día es continuo: la clasificación hereda el agua y las nubes de la mañana. El agua se calcula por tramo de pista: la lluvia la sube enseguida (con 4 mm/h, en un par de minutos ya hacen falta intermedios), el drenaje la baja deprisa cuando hay agua estancada y despacio cuando la pista solo está húmeda, y la evaporación remata. Cada coche que pasa aparta algo de agua de la trazada: en carrera se abre una línea seca y la pista se seca en ~15 minutos, más rápido que en unos libres con pocos coches. Fuera de la trazada sigue mojado, y quien sale de ella para adelantar lo nota. El radar ve el campo real; la previsión de tu meteorólogo extrapola lo que ve, con su error.

**Carrera** (`src/sim/session.ts`). Modo adelantamiento, tapones, adelantamientos en las zonas de frenada según diferencia de ritmo y habilidad (quien acaba de perder la posición no puede devolverla en la frenada siguiente), banderas azules, toques, errores, pinchazos, averías, coche de seguridad y VSC.

**Aire sucio y rebufo.**
- **Aire sucio:** detrás de otro coche se pierde carga aerodinámica. Pesa en las curvas rápidas, donde el agarre depende de ella, y apenas en una chicane lenta. Se diluye deprisa: a 1 s ya es poco y a 1,6 s nada.
- **Rebufo:** en recta ahorra resistencia y dura más; aún se nota a 1,5-2 s.

Cada circuito tiene su balance. En Monza ir a rebufo compensa; en Silverstone o Interlagos es mejor el aire limpio, salvo con mucho hueco.

**Clasificación y libres con tráfico.**
- Los garajes están repartidos por el pit-lane y se sale de uno en uno.
- Ante la lluvia, cada muro reacciona a su ritmo.
- En la vuelta de salida, cada piloto levanta para abrir hueco con el de delante: en Monza para quedarse a rebufo, en el resto para tener aire limpio. No todos lo hacen igual de bien, así que hay quien empieza la vuelta pegado a otro, y quien va lanzado a veces se encuentra a uno lento que no se aparta a tiempo.

**Banderas rojas** en todas las sesiones, por accidente fuerte (barreras dañadas) o por lluvia torrencial (agua estancada en algún sector o chaparrón muy fuerte). En carrera se para todo, se pueden cambiar los neumáticos sin perder tiempo y se reanuda detrás del coche de seguridad; con lluvia no se reanuda hasta que la pista lo permite.

**Reglamento de tiempo y carreras acortadas:**
- Una carrera dura como mucho 2 h sin contar las suspensiones, y 3 h en total. Al cumplirse, bandera a cuadros al final de esa vuelta.
- Si una carrera suspendida no puede reanudarse, cuenta la clasificación al final de la penúltima vuelta antes de la suspensión.
- Los puntos dependen de la distancia: sin puntos si no se completaron dos vueltas en verde; 6-4-3-2-1 por debajo del 25 %; 13-10-8-6-5-4-3-2-1 hasta el 50 %; 19-14-12-9-8-6-5-3-2-1 hasta el 75 %; completos por encima. En la sprint, por debajo del 75 %, mitad de puntos.

**Salida en mojado:** con mucha agua la carrera empieza detrás del coche de seguridad, que no se retira hasta que se puede correr. Cada equipo elige el neumático de salida mirando también el radar y su previsión, no solo el agua de ese momento. En clasificación hay tráfico (coches en vuelta de salida que estorban) y vueltas anuladas por límites de pista.

**Estrategia** (`src/sim/strategy.ts`). La IA simula stints con el mismo modelo de neumáticos (con su error) y busca la mejor combinación de 0, 1 o 2 paradas **con los juegos que le quedan**, valorando la posición en pista. En carrera reacciona a coches de seguridad, undercuts y lluvia.

## Parrilla 2026

`data/equipos-2026.json`: los 11 equipos y 22 pilotos reales con sus números. El rendimiento de cada coche es una estimación a partir del mundial de constructores 2026 tras México (Mercedes, Ferrari, Red Bull, McLaren, Racing Bulls, Alpine, Haas, Audi, Williams, Aston Martin, Cadillac); la potencia, del motor de cada equipo. Los atributos de los pilotos son una valoración propia y se pueden editar.

## Simular sin interfaz

```bash
npx tsx scripts/finde.ts silverstone 42 --resumen   # fin de semana completo
npx tsx scripts/pista.ts spa                         # análisis del circuito
```

## Fuentes

- Trazados: [TUMFTM racetrack-database](https://github.com/TUMFTM/racetrack-database), licencia LGPL-3.0 (copia en `data/circuitos/LICENCIA-TRAZADOS-TUM.txt`).
- Parrilla y números: [formula1.com: Verstappen usará el 3](https://www.formula1.com/en/latest/article/max-verstappen-confirms-he-will-use-car-number-3-for-2026-season.6qvN2SQwcyGYnMWhGdDpNS), [Goodwood: pilotos y equipos 2026](https://www.goodwood.com/grr/f1/2026-f1-drivers-and-teams/), [formula1.com: Alpine completa su alineación](https://www.formula1.com/en/latest/article/colapinto-earns-new-deal-as-alpine-complete-2026-driver-line-up.5KBTVHBlPBBR0Ld91fSJim), [Motorsport Magazine: los 22 pilotos](https://www.motorsportmagazine.com/articles/single-seaters/f1/f1-2026-driver-line-ups-latest-contract-news-and-rumours).
- Mundial de constructores 2026: [GPFans](https://www.gpfans.com/en/f1-standings/constructors/).
- Poles 2026: [Wikipedia: GP de Gran Bretaña 2026](https://en.wikipedia.org/wiki/2026_British_Grand_Prix), [formula1.com: clasificación de Bélgica 2026](https://www.formula1.com/en/latest/article/antonelli-charges-to-pole-position-in-exhilarating-belgian-gp-qualifying.zpGgC6xi6e3QnZEOmi6qS), [Wikipedia: GP de Italia 2026](https://en.wikipedia.org/wiki/2026_Italian_Grand_Prix).
- Reglamento de carreras acortadas y tiempo máximo: [Motorsport Magazine: nuevo sistema de puntos en carreras cortas](https://motorsportmagazine.com/articles/single-seaters/f1/f1-reveals-new-short-race-points-system-to-avoid-spa-repeat), [Wikipedia: lista de carreras con bandera roja](https://en.wikipedia.org/wiki/List_of_red-flagged_Formula_One_races), [Wikipedia: sistemas de puntos de F1](https://en.wikipedia.org/wiki/List_of_Formula_One_points_systems), [F1 Chronicle: límite de tiempo de una carrera](https://f1chronicle.com/what-is-the-time-limit-for-an-f1-race/).
- Calendario: [Silverstone: calendario 2026](https://www.silverstone.co.uk/news/f1-2026-calendar-full-list-venues-key-dates).
- Neumáticos: [formula1.com: asignación en fin de semana sprint](https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2025-chinese-grand-prix.6yy4SvLV4JKr2GQ39wJPa1), [f1technical: reglas de SQ en Spa](https://www.f1technical.net/news/27363), [F1 Chronicle](https://f1chronicle.com/how-many-tyres-can-f1-teams-use).
- Tormentas: [NWS: ciclo de vida de una tormenta](https://www.weather.gov/spotterguide/life), [Royal Meteorological Society: ciclo de vida de una tormenta](https://www.rmets.org/metmatters/life-cycle-thunderstorm).
- Mojado: [Pirelli: cuándo cambiar de slicks a neumáticos de lluvia](https://www.pirelli.com/global/en-ww/race/when-it-s-time-to-change-from-slick-to-wet-tyres-in-formula-1), [FIA: pole en mojado de Interlagos 2024](https://fia.com/node/54403), [FIA: clasificación sprint de Interlagos 2024](https://fia.com/node/54364).
- Clima: [24 Horas de Spa (julio)](https://www.crowdstrike24hoursofspa.com/news/1919/what-an-autumn-edition-means-for-the-total-24-hours-of-spa-weather-forecast), [weatherapi.com: Spa](https://www.weatherapi.com/history/july/q/spa-205712), [weatherapi.com: Monza](https://www.weatherapi.com/history/september/q/monza-1281402), [weatheronthisday.com: São Paulo](https://weatheronthisday.com/intl/sao-paulo/november), [weathermonth.com: São Paulo](https://weathermonth.com/en/sao-paulo-weather-in-november). Silverstone en julio es aproximado (no se encontró una normal climática fiable).
