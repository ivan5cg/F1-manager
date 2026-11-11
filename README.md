# Muro de Boxes

Juego de estrategia de Fórmula 1 centrado en el **fin de semana de carrera**: eres el muro de boxes de tus dos pilotos en una temporada de 9 grandes premios. Dos modos:

- **Equipo real:** eliges uno de los 11 equipos de la parrilla real de 2026 y lo llevas tal cual es.
- **Crea tu equipo:** fichas pilotos, jefe de equipo, director técnico y motor con un techo de gasto de 100 millones, y gestionas las unidades de potencia durante el año (ver más abajo).

Es una web para el móvil (se instala como aplicación desde el navegador) y funciona sin conexión. La pantalla de sesión imita el grafismo de las retransmisiones de 2010-2013 sobre un tema gris pizarra (degradados suaves, sin negro puro): extremos en diagonal pero todo apilado en vertical para aprovechar el espacio:
- contador «Vuelta 28/71» en caja oscura, con el estado al lado en amarillo (coche de seguridad) o rojo (bandera roja),
- torre de tiempos con la posición en gris, el líder en rojo, tus pilotos en dorado, morado para el mejor tiempo y línea roja de corte en clasificación,
- mensajes con pestaña blanca en diagonal («RADIO DEL EQUIPO», «DIRECCIÓN DE CARRERA») sobre barra oscura,
- hora local con icono del cielo, temperaturas, lluvia media y máxima y agua por sector,
- rótulos de piloto con la posición en caja roja y diferencias en caja amarilla,
- velocímetro de cada uno de tus pilotos con velocidad, marcha, acelerador, freno, batería y modo adelantamiento,
- en la tarjeta de cada piloto, su coche visto desde arriba con las cuatro ruedas: el color es la temperatura frente a la ventana del compuesto (azul frío, verde bien, amarillo al borde, rojo caliente) y el relleno, la banda que queda (la simulación lleva cada eje, así que las dos ruedas de un eje van iguales),
- en la torre de carrera, las posiciones ganadas (▲) o perdidas (▼) desde la parrilla y una raya naranja en el que va a menos de 1 s del de delante.

**El mapa** enseña las zonas de modo adelantamiento (línea discontinua por fuera), las frenadas donde se adelanta (en naranja) y los sectores del coche que sigues o de tu piloto, en morado, verde o amarillo como los parciales. Tocando un coche en el mapa, en la torre o en la franja de huecos se sigue: queda resaltado y arriba sale su rótulo con su posición, neumático y hueco con tus pilotos (o su mejor vuelta y lo que está haciendo, en libres y clasificación). Se deja de seguir tocando el rótulo, el mismo coche o Esc.
- **Libres y clasificación:** los que no van en vuelta rápida salen apagados, y los coches lentos a menos de 350 m por delante de tu piloto en vuelta lanzada llevan un aro amarillo (tráfico).
- **Carrera, fantasma de parada:** un círculo discontinuo marca dónde estaría ahora tu piloto si hubiera parado (la pérdida en boxes convertida en metros de pista), con la posición en la que saldría, la misma que da el Muro.
- **Carrera, franja de huecos:** debajo del mapa, toda la parrilla en una vuelta, con el líder a la izquierda y una marca cada 10 s. Se ve dónde hay hueco y en cuál caería tu piloto si parase.
- **Aviso de lluvia:** tu meteorólogo mira cada sector. Si va a llover en uno seco, la fila «Cielo» lo dice con cuenta atrás (por ejemplo, «Lluvia en S2 en ~6′») y sale un aviso a la izquierda; si llueve en todos y va a parar, «escampa ~10′». Tiene el mismo error que su previsión del radar.

El radar meteorológico enseña en bucle los últimos 30 minutos (un fotograma cada 3), con la paleta por bandas de los radares reales, vista de 40 km y vista ampliada del circuito. Las células de lluvia tienen forma irregular, núcleos y textura propia que viaja con ellas, y siguen el ciclo de vida de una tormenta (30-60 min): nacen pequeñas y casi sin lluvia, crecen en tamaño e intensidad, maduran y se deshacen extendiéndose en lluvia débil. Las nuevas brotan sobre todo junto a las que ya llueven (tormentas multicelulares que se regeneran), y los sistemas grandes y los frentes nacen fuera del alcance del radar y entran por el borde: nada aparece hecho de la nada. Los frentes llegan en banda con lluvia más débil detrás. Lo que se ve en el radar es exactamente lo que cae en cada tramo de pista.

## Jugar

```bash
npm install
npm run dev        # abre la URL que muestra (también desde el móvil en la misma wifi)
```

## La temporada

| Ronda | Gran Premio | Circuito | Fecha | Formato |
|---|---|---|---|---|
| 1 | Japón | Suzuka | 29 de marzo | Normal |
| 2 | Baréin (de noche) | Sakhir | 12 de abril | Normal |
| 3 | Mónaco | Mónaco | 7 de junio | Normal |
| 4 | Gran Bretaña | Silverstone | 5 de julio | Normal |
| 5 | Bélgica | Spa-Francorchamps | 19 de julio | Normal |
| 6 | Italia | Monza | 6 de septiembre | Normal |
| 7 | Malasia | Sepang | 4 de octubre | Normal |
| 8 | Singapur (de noche) | Marina Bay | 11 de octubre | **Sprint** |
| 9 | São Paulo | Interlagos | 8 de noviembre | **Sprint** |

En la realidad, en 2026 el GP de Baréin no se corrió en Sakhir: se trasladó a Sepang el 4 de octubre. Aquí hay las dos carreras. Las temporadas empezadas antes de cambiar el calendario siguen con el suyo (5 u 8 carreras, con el circuito ficticio de Sierra Norte).

- **Formato normal:** Libres 1, Libres 2, Libres 3, Clasificación (Q1 18', Q2 15', Q3 12'; caen 6 y 6; con tu equipo hay 24 coches y en Q1 caen 7) y Carrera.
- **Formato sprint:** Libres 1, Clasificación sprint (SQ1 12', SQ2 10', SQ3 8'; medios en SQ1 y SQ2, blandos en SQ3), Sprint (21 vueltas en Singapur y 24 en Interlagos), Clasificación y Carrera.
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
- ⏸ ×1 ×2 ×4 ×8 ×16 ×64 (teclas 1-6) y ⏭ (simular hasta el final). La sesión se pausa sola en los momentos clave.

## Crea tu equipo

Un equipo nuevo, el 12.º de la parrilla. Antes de la temporada fichas, con un techo de gasto de **100 millones**:

- **Dos pilotos** de 47: los 22 titulares, el reserva de cada equipo y pilotos libres (veteranos sin volante y jóvenes de F2).
- **Un jefe de equipo** de 17. Pone el nivel del muro (las estrategias), del meteorólogo (las previsiones) y de los mecánicos (lo que dura una parada).
- **Un director técnico** de 14. Diseña el coche (agarre, resistencia al avance y trato a los neumáticos) y lo desarrolla durante el año. También pesa en la fiabilidad del chasis.
- **Un motor** de los 5 de 2026: potencia y fiabilidad.

**Precio e incertidumbre.**
- Cada uno tiene un informe con horquillas, no un número exacto. El valor real de esa temporada se aparta de lo publicado más cuanto menos se le conoce: ●●● muy conocido, ●○○ casi desconocido.
- El precio va por la fama y el contrato, no por lo que rinde: hay gangas y fichajes que decepcionan.
- Fichar a alguien con contrato cuesta su salario más la cláusula (medio salario; 1 M un reserva). Su equipo tira de su reserva o, si no tiene o también lo has fichado, del mejor piloto libre.
- Si te llevas un jefe o un director técnico, ese equipo sigue con un interino. Sin jefe: peor muro y paradas más lentas. Sin director técnico: el coche que ya tenía, pero se desarrolla más despacio.
- Lo real vale para todos: si un motor rinde menos de lo publicado, rinde menos también para sus clientes.
- Con cada carrera tus ingenieros afinan las horquillas de tus fichajes hacia lo real.

**Ser nuevo cuesta.** El coche sale ~0,3 s por vuelta más lento de lo que daría el diseño del director técnico, las paradas son 0,1 s más lentas y hay un 10 % más de averías.

**Desarrollo.** Cada equipo gana o pierde agarre carrera a carrera según su director técnico, frente a la media de la parrilla (que en conjunto no se acelera). Lo que te sobra del techo va a evoluciones: con todo gastado el tuyo se desarrolla ×0,7; con 50 M libres o más, ×1,3.

**Unidades de potencia** (`src/sim/powerunit.ts`).
- Cada piloto tiene un cupo de **2 unidades** para las 9 carreras (escalado de las 4 reales para 24).
- Cada unidad dura ~2.800 km a modo normal; un fin de semana gasta ~600. El modo de motor alto la gasta un 60 % más deprisa y el de ahorro, un 25 % menos.
- Con el desgaste pierde potencia: ~0,2 s por vuelta en Silverstone o Monza al final de su vida (menos de 0,1 en Mónaco), y más si se pasa de vida. También se rompe más: el doble de averías de motor al final de su vida que de media.
- Una unidad rota no vuelve a usarse.
- Antes de Libres 1 eliges qué unidad monta cada piloto: una usada o una nueva. El equipo propone una.
- Cada unidad nueva fuera del cupo cuesta **10 puestos** en la parrilla de la carrera. Los demás equipos deciden igual: estiran la unidad mientras aguanta y cambian cuando está gastada o rota.

## El modelo

Todo es determinista a partir de la semilla de la temporada.

**Simulación a 20 Hz.** Cada coche avanza en pasos de 0,05 s sobre el perfil de velocidad del circuito, escalado por el tiempo que tardaría él en ese tramo con su adherencia, potencia, resistencia y masa de ese instante. Un fin de semana entero se calcula en ~7 s.

**Circuitos reales** (`data/circuitos/`). Silverstone, Spa, Monza, Interlagos y Suzuka usan la línea central real del trazado; Mónaco y Marina Bay, su trazado en GeoJSON convertido a metros. De la curvatura sale la velocidad máxima en cada punto (masa puntual con carga aerodinámica, potencia y frenada), con la carga de cada circuito (Monza baja). Sakhir y Sepang también usan la línea central real. Cada circuito se calibra contra la pole real de 2026: Suzuka 1:28.778, Mónaco 1:12.051, Silverstone 1:28.111, Spa 1:44.361, Monza 1:21.786, Sepang 1:35.130 (con mucho calor) y Singapur 1:31.373. Interlagos está estimada en ~1:12.1 y Sakhir en ~1:33.0 (la pole de 2025 más lo que han perdido los coches de 2026). Los adelantamientos de cada circuito se calibran con su media real por carrera: Monza ~47, Sakhir ~46, Sepang ~45 (estimado), Spa ~41, Suzuka ~40, Interlagos ~40, Singapur ~35, Silverstone ~35 y Mónaco ~9. Baréin en abril es casi siempre seco; Sepang en octubre tiene tormentas de tarde. La pérdida en boxes es la de cada circuito. Zonas de adelantamiento y de modo adelantamiento (MO, el sustituto del DRS en 2026) salen de la geometría.

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

`data/mercado-2026.json`: el mercado del modo «crear equipo»: precios, incertidumbre, reservas y pilotos libres, jefes de equipo, directores técnicos y motores. Los cargos y reservas son los de la prensa de principios de 2026; los que no estaban confirmados llevan una nota. Las valoraciones son estimaciones del juego.

## Simular sin interfaz

```bash
npx tsx scripts/finde.ts silverstone 42 --resumen   # fin de semana completo
npx tsx scripts/pista.ts spa                         # análisis del circuito
```

## Fuentes

- Trazados: [TUMFTM racetrack-database](https://github.com/TUMFTM/racetrack-database), licencia LGPL-3.0 (copia en `data/circuitos/LICENCIA-TRAZADOS-TUM.txt`); Mónaco y Marina Bay de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), licencia MIT (copia en `data/circuitos/LICENCIA-TRAZADOS-BACINGER.txt`).
- Poles 2026 de los circuitos nuevos: [FIA: Antonelli, pole en Japón](https://api.fia.com/news/f1-antonelli-takes-second-pole-2026-ahead-russell-and-piastri-japan), [FIA: clasificación de Mónaco 2026](https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_final_qualifying_classification.pdf), [Formula One History: clasificación de Singapur 2026](https://www.formulaonehistory.com/2026-singapore-gp-qualifying/).
- Calendario y horarios: [The Race: calendario 2026](https://www.the-race.com/formula-1/f1-2026-calendar-when-is-next-race/), [Crash.net: horario de Singapur 2026](https://www.crash.net/f1/news/1106593/1/f1-2026-singapore-grand-prix-start-time-and-full-weekend-schedule).
- Adelantamientos por circuito: [F1 Race Review: circuitos por adelantamientos](https://www.f1-race-review.com/stats/best-track-by-overtakes/), [GPBlog: Mónaco 2024](https://www.gpblog.com/en/news/very-little-overtaking-at-grand-prix-of-monaco-2024.html).
- Clima de los circuitos nuevos: [weatherapi.com: Suzuka en marzo](https://www.weatherapi.com/history/march/q/suzuka-3126056), [weather2travel: Mónaco](https://weather2travel.com/monaco/monte-carlo/climate), [weatherapi.com: Singapur en octubre](https://www.weatherapi.com/history/october/q/singapore-2285382). La pérdida en boxes de Suzuka, Mónaco y Singapur, la carga aerodinámica y la abrasividad son estimaciones propias.
- Parrilla y números: [formula1.com: Verstappen usará el 3](https://www.formula1.com/en/latest/article/max-verstappen-confirms-he-will-use-car-number-3-for-2026-season.6qvN2SQwcyGYnMWhGdDpNS), [Goodwood: pilotos y equipos 2026](https://www.goodwood.com/grr/f1/2026-f1-drivers-and-teams/), [formula1.com: Alpine completa su alineación](https://www.formula1.com/en/latest/article/colapinto-earns-new-deal-as-alpine-complete-2026-driver-line-up.5KBTVHBlPBBR0Ld91fSJim), [Motorsport Magazine: los 22 pilotos](https://www.motorsportmagazine.com/articles/single-seaters/f1/f1-2026-driver-line-ups-latest-contract-news-and-rumours).
- Baréin y Malasia: [formula1.com: resultado del GP de Baréin en Malasia 2026](https://www.formula1.com/en/results/2026/races/1308/malaysia/race-result), [Malay Mail: pole de Verstappen en Sepang](https://www.malaymail.com/news/sports/2026/10/03/verstappen-ends-pole-drought-with-bahrain-gp-qualifying-win-in-sepang/237571), [formula1.com: datos previos del GP en Malasia](https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2026-bahrain-grand-prix-in-malaysia.7q5fTKLLQ5TrEcsNerl406), [formula1.com: zona de DRS y adelantamientos en Baréin](https://www.formula1.com/en/latest/article/drivers-predicting-aggressive-bahrain-strategies-after-drs-zone-addition.39q2U8vXlKeE1b85oVnDMj). Clima, pérdida en boxes y horarios de Sakhir y Sepang: estimaciones propias.
- Mercado: [Motorsport Magazine: reservas 2026](https://www.motorsportmagazine.com/articles/single-seaters/f1/2026-f1-reserve-drivers-the-hopefuls-on-standby-for-each-gp-team), [GPBlog: reservas 2026](https://www.gpblog.com/en/news/all-confirmed-reserve-drivers-across-the-formula-1-grid-for-2026), [formula1.com: jefes de equipo 2026](https://www.formula1.com/en/latest/article/who-are-the-2026-team-principals.2Jrw5LEJbEoX2gM5OtFL8K), [Wikipedia: Alpine](https://en.wikipedia.org/wiki/Alpine_F1_Team), [Wikipedia: Matt Harman](https://en.wikipedia.org/wiki/Matt_Harman), [Sky Sports: Cadillac](https://www.skysports.com/f1/news/13492528/cadillac-f1-all-you-need-to-know-about-new-2026-team-drivers-team-principal-engine-super-bowl-launch).
- Mundial de constructores 2026: [GPFans](https://www.gpfans.com/en/f1-standings/constructors/).
- Poles 2026: [Wikipedia: GP de Gran Bretaña 2026](https://en.wikipedia.org/wiki/2026_British_Grand_Prix), [formula1.com: clasificación de Bélgica 2026](https://www.formula1.com/en/latest/article/antonelli-charges-to-pole-position-in-exhilarating-belgian-gp-qualifying.zpGgC6xi6e3QnZEOmi6qS), [Wikipedia: GP de Italia 2026](https://en.wikipedia.org/wiki/2026_Italian_Grand_Prix).
- Reglamento de carreras acortadas y tiempo máximo: [Motorsport Magazine: nuevo sistema de puntos en carreras cortas](https://motorsportmagazine.com/articles/single-seaters/f1/f1-reveals-new-short-race-points-system-to-avoid-spa-repeat), [Wikipedia: lista de carreras con bandera roja](https://en.wikipedia.org/wiki/List_of_red-flagged_Formula_One_races), [Wikipedia: sistemas de puntos de F1](https://en.wikipedia.org/wiki/List_of_Formula_One_points_systems), [F1 Chronicle: límite de tiempo de una carrera](https://f1chronicle.com/what-is-the-time-limit-for-an-f1-race/).
- Calendario: [Silverstone: calendario 2026](https://www.silverstone.co.uk/news/f1-2026-calendar-full-list-venues-key-dates).
- Neumáticos: [formula1.com: asignación en fin de semana sprint](https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2025-chinese-grand-prix.6yy4SvLV4JKr2GQ39wJPa1), [f1technical: reglas de SQ en Spa](https://www.f1technical.net/news/27363), [F1 Chronicle](https://f1chronicle.com/how-many-tyres-can-f1-teams-use).
- Tormentas: [NWS: ciclo de vida de una tormenta](https://www.weather.gov/spotterguide/life), [Royal Meteorological Society: ciclo de vida de una tormenta](https://www.rmets.org/metmatters/life-cycle-thunderstorm).
- Mojado: [Pirelli: cuándo cambiar de slicks a neumáticos de lluvia](https://www.pirelli.com/global/en-ww/race/when-it-s-time-to-change-from-slick-to-wet-tyres-in-formula-1), [FIA: pole en mojado de Interlagos 2024](https://fia.com/node/54403), [FIA: clasificación sprint de Interlagos 2024](https://fia.com/node/54364).
- Clima: [24 Horas de Spa (julio)](https://www.crowdstrike24hoursofspa.com/news/1919/what-an-autumn-edition-means-for-the-total-24-hours-of-spa-weather-forecast), [weatherapi.com: Spa](https://www.weatherapi.com/history/july/q/spa-205712), [weatherapi.com: Monza](https://www.weatherapi.com/history/september/q/monza-1281402), [weatheronthisday.com: São Paulo](https://weatheronthisday.com/intl/sao-paulo/november), [weathermonth.com: São Paulo](https://weathermonth.com/en/sao-paulo-weather-in-november). Silverstone en julio es aproximado (no se encontró una normal climática fiable).
