# Muro de Boxes

Juego de estrategia de Fórmula 1 centrado en el **fin de semana de carrera**: eres el muro de boxes de tus dos pilotos en una temporada de 9 grandes premios. Dos modos de temporada (y además el [modo gran premio](#modo-gran-premio) y el [modo escenario](#modo-escenario)):

- **Equipo real:** eliges uno de los 11 equipos de la parrilla real de 2026 y lo llevas tal cual es.
- **Crea tu equipo:** fichas pilotos, jefe de equipo, director técnico y motor con un techo de gasto de 100 millones, y gestionas las unidades de potencia durante el año (ver más abajo).

Es una web para el móvil (se instala como aplicación desde el navegador) y funciona sin conexión. La pantalla de sesión imita el grafismo de las retransmisiones de 2010-2013 sobre un tema gris pizarra (degradados suaves, sin negro puro): extremos en diagonal pero todo apilado en vertical para aprovechar el espacio:
- contador «Vuelta 28/71» en caja oscura, con el estado al lado en amarillo (coche de seguridad) o rojo (bandera roja),
- torre de tiempos con la posición en gris, el líder en rojo, tus pilotos en dorado, morado para el mejor tiempo y línea roja de corte en clasificación,
- mensajes con pestaña blanca en diagonal («RADIO DEL EQUIPO», «DIRECCIÓN DE CARRERA») sobre barra oscura,
- hora local con icono del cielo, temperaturas, lluvia media y máxima y agua por sector,
- rótulos de piloto con la posición en caja roja y diferencias en caja amarilla,
- **la prensa y la directiva tras cada carrera:** la portada de un periódico inventado con el titular del gran premio (tu victoria o tu podio, una remontada, una carrera de locos, un paseo de principio a fin...) y tres breves (cómo le ha ido a tu equipo, la remontada del día, la vuelta rápida, el abandono de alguien de delante). En temporada, además, un mensaje de la directiva según lo que se esperaba de tu coche, con aviso cuando un objetivo se cumple, se pone feo o ya no se puede. Las dos cosas se vuelven a ver desde el calendario,
- **cascos con diseño propio:** cada piloto lleva el suyo en todas las pantallas (torre, podio, clasificaciones, gran premio, escenarios) y en el 3D, siempre el mismo: tres colores (a menudo los de su bandera) y uno de nueve motivos (franjas, rayo, estrella, flechas, degradado...), sacados de su nombre. El color del equipo va en la franja de abajo. Diseños inventados, no los de verdad,
- velocímetro de cada uno de tus pilotos con velocidad, marcha, acelerador, freno, batería y modo adelantamiento,
- en la tarjeta de cada piloto, su coche visto desde arriba con las cuatro ruedas: el color es la temperatura frente a la ventana del compuesto (azul frío, verde bien, amarillo al borde, rojo caliente) y el relleno, la banda que queda (la simulación lleva cada eje, así que las dos ruedas de un eje van iguales),
- en la torre de carrera, las posiciones ganadas (▲) o perdidas (▼) desde la parrilla y una raya naranja en el que va a menos de 1 s del de delante.
- **comentarios de Antonio Lobato** en la caja de la izquierda (pestaña azul), al estilo de la tele: reacciona a adelantamientos (con especial entusiasmo si son por fuera), peleas rueda con rueda, defensas que cierran la puerta, coches de seguridad, banderas, toques, abandonos, paradas lentas, lluvia, la pole y los eliminados de cada parte, y en carrera comenta la salida, las peleas, la mitad de carrera, las cinco últimas vueltas, la última y al ganador (con especial entusiasmo por Alonso y Sainz). Los avisos de dirección de carrera se ven al menos 5 s antes de que él hable encima; todo queda también en «Radio». Se apaga en Ajustes. Reacciona al código de cada mensaje de la sesión, no a su texto (así un «P15» no se confunde con un «P1»), y en clasificación solo dice que alguien «se pone primero» cuando mejora. Son textos originales del juego, solo de interfaz: no cambian la simulación.
- **la radio de tus pilotos, con personalidad:** cada piloto tiene un carácter (calmado, quejica, volcánico, cerebral, socarrón, novato o autocrítico) y habla a su manera cuando adelanta (por dentro o por fuera) o le adelantan, va rueda con rueda, cierra la puerta o se la cierran, se toca (y si ha cerrado tarde o se la han cerrado a él), trompea, le estorban en clasificación, la parada sale lenta, se le acaban las gomas, abandona o acaba la carrera; contesta a veces al estratega y cuando el ingeniero pregunta si entra con la lluvia, y pide paso si lleva vueltas atascado detrás de su compañero. **Contesta a tus órdenes** (box, anular la parada, apretar o ahorrar con el ritmo o el motor, dejar pasar al compañero, defender o no pelear, pelear en duro o en limpio), y a disgusto cuando no le cuadran: parar con las gomas aún buenas, levantar con un rival a menos de un segundo, dejar pasar a un compañero más lento o no pelear con uno pegado detrás («¿En serio? Soy más rápido»). Siempre obedece: es solo radio. Sin repetir frase en una sesión y sin hablar a cada momento (unas 10 frases por carrera). En voz alta, cada uno con su tono.
- **radios míticas** (pestaña dorada ⭐, con la frase original y dónde se dijo): si su piloto está en pista y se da una situación parecida, a veces suena de verdad. Alonso y el «motor de GP2» si le pasa un coche con más motor, o lo de «cerrar la puerta por fuera» si se toca con Hamilton; el «Bono, mis neumáticos están acabados» de Hamilton y el «esto ha sido manipulado» si pierde la carrera al final; el «tu-tu-tu-du» del ingeniero de Verstappen y su «simplemente precioso» tras una parada lenta; el «¡soy estúpido!» de Leclerc si se va en clasificación y el «¿por qué?» si pierde el liderato en boxes; el «¡no, no, no!» de Norris si le preguntan si entra con la pista mojada; el «Smooth operator» de Sainz; el «a quien corresponda» de Bottas; y, en los escenarios, el «déjame en paz, sé lo que hago» de Räikkönen, el «no está mal para un piloto número dos» de Webber o el «Fernando es más rápido que tú» a Massa. Las de los rivales también se oyen. Cada una, como mucho una vez por sesión.

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

Al empezar una temporada se elige el calendario: el **corto** (9 grandes premios, abajo) o el **completo**, el de 2026
tal como es: 23 grandes premios (Baréin y Arabia Saudí se cancelaron en marzo y el GP de Baréin se corrió en Sepang)
con seis sprints (China, Miami, Canadá, Gran Bretaña, Países Bajos y Singapur). En el completo, Silverstone es sprint e
Interlagos no; Bakú y Las Vegas corren de jueves a sábado. En una temporada larga el desarrollo se reparte entre todas
las carreras (los rivales y el presupuesto dan lo mismo en la temporada entera) y, en «crea tu equipo», el cupo de
unidades de potencia sube a 5 (las mismas carreras por unidad que 2 en la corta).

Calendario corto:

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

En la realidad, en 2026 el GP de Baréin no se corrió en Sakhir: se trasladó a Sepang el 4 de octubre. Aquí hay las dos carreras. Las temporadas empezadas antes de cambiar el calendario siguen con el suyo (4 u 8 carreras; el circuito ficticio de Sierra Norte que tenían ya no está en el juego).

- **Formato normal:** Libres 1, Libres 2, Libres 3, Clasificación (Q1 18', Q2 15', Q3 12'; caen 6 y 6; con tu equipo hay 24 coches y en Q1 caen 7) y Carrera.
- **Formato sprint:** Libres 1, Clasificación sprint (SQ1 12', SQ2 10', SQ3 8'; medios en SQ1 y SQ2, blandos en SQ3), Sprint (unos 100 km: 21 vueltas en Singapur, 24 en Interlagos, 19 en Shanghái y Miami, 23 en Montreal, 17 en Silverstone y 24 en Zandvoort), Clasificación y Carrera.
- **Rendimiento de los coches** (en la pantalla de temporada, encima del mundial): lo que le falta a cada coche frente al
  más rápido en una vuelta de 1:30 (solo el coche: sin pilotos ni circuito), con lo ganado o perdido desde la ronda
  anterior y desde la primera, y una gráfica ronda a ronda. Sale del coche con el que corre cada uno en cada gran
  premio (tus paquetes y piezas, los de los rivales). `npx tsx scripts/rendimiento.ts [equipo|propio] [semilla]
  [--completo] [--tunel[=lenta,media,rápida,recta]]` saca la misma tabla.
- **Desarrollo del coche** (en la pantalla de temporada). Un presupuesto por temporada (40 M con un equipo real; en
  «crea tu equipo», de 25 a 50 M según lo que quedó del techo de gasto) y las horas de túnel de viento y CFD:
  - **La aerodinámica no se compra** (`src/sim/development.ts`, `src/ui/tunel.ts`). El año se parte en periodos (3
    rondas en el calendario corto, 4 en el completo) y en cada uno tienes las horas que te da tu **cuota ATR**: del
    70 % del primero de constructores del año anterior al 120 % del último, revisada a mitad de año. Las repartes entre
    curva lenta, media y rápida y eficiencia en recta; al acabar el periodo sale un paquete que llega a la carrera
    siguiente. Concentrar da más donde concentras: un paquete
    de curva lenta vale mucho en Mónaco y poco en Monza. Lo que se espera de cada uno sube con el ATR (×0,84 a ×1,18)
    y con tu director técnico. La fabricación se lleva el 40 % del presupuesto.
  - **El último periodo trabaja para el año siguiente** (y el de todos los equipos): el coche nuevo de cada uno sale
    con lo que da un paquete con la cuota ATR de ese periodo, frente a la media de la parrilla. Como el que acaba
    peor tiene más horas, empieza el año algo más cerca (con un ATR del 120 %, unas centésimas por vuelta frente al
    del 70 %). Las noticias del mercado lo cuentan. Lo que ganan tus paquetes durante el año pasa al coche nuevo
    como el resto del desarrollo (el 65 %).
  - **Se prueba en los libres.** Uno de cada ocho paquetes sale mal: da poco o hace el coche más lento. Antes de los
    libres 1 eliges el programa: **validar** (las tandas largas del viernes pasan a ser pruebas de piezas: ±0,035 s
    de error, pero llegas al domingo sabiendo peor cuánto gasta cada neumático), **equilibrado** (una tanda larga para
    el paquete: ±0,05 s) o **priorizar neumáticos** (±0,11 s). Al simular los libres, el equipo lo cumple; jugándolos,
    hay un tipo de tanda «Prueba de piezas». Antes de la clasificación ves lo medido y decides si se monta (desde
    ahí, parque cerrado); si no decides, el equipo lo monta cuando lo medido es positivo. Lo que da de verdad se ve
    tras correr con él. `npx tsx scripts/tunel.ts [circuito] [semilla] [equipo] [--sprint]` compara los tres programas.
  - **Motor y fiabilidad** siguen por piezas con el presupuesto: pequeñas (4 M) y medianas (8 M) tardan 2 rondas en
    llegar; grandes (14 M), 3; motor y eficiencia (potencia y algo menos de consumo, con un tope en la temporada más
    bajo si el motor es de cliente) y fiabilidad (menos averías). Una de cada ocho rinde menos de lo esperado.
  - **Los rivales** traen paquetes según su ATR (2 a 4 en la temporada, con aciertos y fallos), la evolución de su
    motorista y algo de fiabilidad; en «crea tu equipo», además según su director técnico. También miden sus
    paquetes: uno que sale mal no lo montan («En el paddock» lo cuenta).
  - Las temporadas empezadas antes del túnel de viento siguen con la aerodinámica por piezas (una de cada cuatro
    decepciona) y sus rivales como estaban.
- **Objetivos de la directiva:** al empezar la temporada, dos según lo bueno que es tu coche frente a la parrilla
  (por ejemplo, «acabar entre los 5 primeros de constructores» y «subir 2 veces al podio»; con el peor coche,
  «puntuar en 2 carreras»). Se ven en la pantalla de temporada con cómo van, y se marcan cuando ya no se pueden
  cumplir.
  En el calendario completo se piden más (las mismas por carrera). Al acabar, cumplirlos sube el presupuesto de
  desarrollo del año siguiente (6 M por objetivo) y fallarlos lo baja (5 M); dos temporadas seguidas sin cumplir
  ninguno y la directiva avisa de que el jefe de equipo peligra, y a la **tercera te despide**: con un equipo real, te
  ofrecen los dos equipos peor clasificados del mundial (sigues la partida con el que elijas, sin aviso y con objetivos
  nuevos) o dejas la Fórmula 1 y la partida se queda terminada; con «crea tu equipo», los inversores toman el control
  y la partida termina. Durante ese último año, la directiva te lo recuerda tras las malas carreras.
- **Equipo técnico entre temporadas** («crea tu equipo»): en la pantalla de fin de temporada puedes cambiar de jefe de
  equipo, director técnico o motor. Fichar a uno de otro equipo cuesta su cláusula, que sale del presupuesto de
  desarrollo, y su equipo se queda con un interino; los salarios y el motor cuentan en el techo de gasto del año
  siguiente. Lo que valen de verdad no se sabe hasta verlos trabajar.
- **Varias temporadas:** al acabar el año, «Empezar la temporada 2027» (y así cada año) en la misma partida. Antes se
  ve el resumen (campeones, tu puesto, los objetivos y lo que cambia el presupuesto) y se decide qué hacer con tus
  pilotos: seguir (o renovar si se les acaba el contrato) o cambiarlos por otro. Se puede fichar a cualquiera: a los
  libres, a los reservas, a los de la F2 o a uno de otro equipo pagando su cláusula (la mitad de lo que le queda por
  cobrar); romper el contrato de uno tuyo también se paga. Las cláusulas salen del presupuesto de desarrollo.
  - **Pilotos:** cumplen años. Mejoran hasta los ~28, se mantienen y empeoran desde los ~33; desde los 33 alguno se
    retira (los que siguen arriba aguantan más). Los contratos de la primera temporada son una estimación del juego.
  - **Mercado:** cada equipo renueva a quien le sirve según lo bueno que es su coche, y los mejores coches eligen
    primero; a veces uno se lleva al que acababa contrato en un equipo peor. Los asientos libres se llenan con los
    mejores que queden: libres, reservas y los de la **F2**. Está la parrilla real de F2 de 2026 (Câmara, Tsolov,
    Dunne, Herta, Minì…; sus valoraciones son estimaciones del juego) y cada año llegan a la F2 unos cuantos jóvenes
    nuevos (inventados) que van madurando hasta que algún equipo los sube. Las noticias del mercado salen al empezar
    la temporada.
  - **A mitad de temporada:** tras un accidente, un piloto puede lesionarse una a tres carreras (le sustituye el
    reserva de su equipo o el mejor libre, y luego vuelve); pasado un tercio del año, un equipo de la IA puede destituir
    al piloto que no rinde (muy por detrás de su compañero) y subir a uno mejor, a menudo de la F2. Tú puedes cambiar
    a uno de tus pilotos entre carreras («Cambiar un piloto» en la pantalla de temporada): un libre, uno de la F2 o uno
    de otro equipo, pagando las cláusulas del presupuesto de desarrollo. El mundial cuenta por piloto: el que sale
    conserva sus puntos y el coche los sigue sumando para constructores.
  - **Salarios:** cada piloto cobra según lo bueno que es (de ~0,5 M un novato a ~55 M el mejor). En «crea tu
    equipo», desde la segunda temporada el techo de gasto lo ocupan los salarios de ese año (tus pilotos, jefe y
    técnico) y el motor, y lo que sobra va al desarrollo, como en la primera.
  - **Coches:** el del año siguiente sale de cómo acabó cada uno, con su desarrollo, con una regresión a la media:
    se conserva un 65 % de la ventaja o la desventaja. Con «crea tu equipo», el tuyo ya no es un equipo nuevo.
  - En «crea tu equipo» los valores reales (ocultos) de pilotos, jefe, técnico y motor no cambian de un año a otro;
    los pilotos sí cambian con la edad. La pantalla de temporada guarda las temporadas anteriores.
  - `npx tsx scripts/temporadas.ts [temporadas] [semilla] [equipo|propio] [--completo]` pasa varias temporadas sin
    correr las carreras (resultados por ritmo) para ver cómo evolucionan pilotos, coches y presupuesto.
- **Puntos:** 25-18-15-12-10-8-6-4-2-1 en carrera; 8-7-6-5-4-3-2-1 en la sprint. Mundial de pilotos y de constructores.
- La partida se guarda sola al terminar cada sesión y también a mitad de una: cada pocos segundos y al salir de la app. Si se cierra el navegador o entra una llamada, al volver la sesión sigue exactamente donde estaba.
- Hay **3 partidas** (en el inicio: seguir, exportar o borrar cada una). Todo se guarda en el navegador del dispositivo, sin cuenta ni servidor: para hacer una copia de seguridad o seguir en otro dispositivo, «Exportar a un archivo» y luego «Importar partida» allí.
- Las partidas van en IndexedDB (sin el límite de unos 5 MB de localStorage). Al arrancar se cargan a memoria y cada cambio se escribe sin esperar. Las partidas de versiones anteriores, que estaban en localStorage, se copian solas la primera vez y solo entonces se borran de allí. Si el navegador no tiene IndexedDB (algunos modos privados), todo sigue en localStorage como antes. Al crear la primera partida se pide al navegador que no borre los datos por su cuenta, y en el inicio se ve cuánto ocupan. Los ajustes y la partida activa siguen en localStorage.
- Copias de seguridad: en Safari (y en cualquier navegador de iPhone o iPad) sin instalar el juego, el inicio avisa de
  que Safari borra los datos de las webs que no se usan en 7 días. En navegadores compatibles, la pantalla de inicio
  también ofrece un botón directo «Instalar app» (descartable) y el *service worker* avisa con un cartel discreto
  cuando hay una versión nueva lista para actualizar sin interrumpir una sesión en curso. Si el juego no está
  instalado, la pantalla de temporada recuerda exportar la partida cada 2 carreras desde la última copia. Los avisos
  se pueden cerrar para siempre.
- En la sesión, **⏩ hasta lo siguiente** avanza a toda velocidad y se para en cuanto pasa algo de tus pilotos (sale o vuelve al garaje, marca tiempo, entra a boxes, un aviso del ingeniero o del estratega) o de dirección de carrera. Teclas: espacio pausa, 1-6 o −/+ velocidad, F hasta lo siguiente.
- En el fin de semana, **¿Y ahora qué?** resume lo siguiente que conviene hacer: compuestos que tus ingenieros aún no han medido, blandos nuevos que quedan, previsión de lluvia, parrilla y sanciones.

## Qué decides

- **Libres:** qué tandas hace cada piloto (instalación, simulación de clasificación, tanda larga de 5-16 vueltas) y con qué juego, o dejarlo en automático. Cada tanda larga **mide el desgaste real** y reduce el error de lo que saben tus ingenieros, pero gasta neumáticos. Las tandas largas de todos (tuyas y de los rivales) salen comparadas por compuesto: ritmo medio corregido a depósito vacío y lo que pierde cada uno por vuelta. Con pista mojada los equipos no salen con slicks: esperan en el garaje si cae fuerte o va a escampar, o ruedan unas vueltas con intermedios o de lluvia sin gastar juegos nuevos a la ligera; si les pilla la lluvia en pista, vuelven a boxes.
- **Reglajes** (en la pantalla del fin de semana, hasta la clasificación): carga aerodinámica y altura de cada coche,
  en 5 pasos. Cada circuito tiene un óptimo que nadie conoce; el ingeniero da una horquilla que se estrecha con las
  vueltas de libres (y que depende de lo bueno que sea el equipo en estrategia), y con la pista mojada el óptimo pide
  más carga y más altura. Más carga: más paso por curva y menos punta, menos desgaste y más pérdida en aire sucio.
  Más baja: más agarre en las curvas rápidas, pero toca el suelo en las lentas (más chispas en el 3D) y gasta más
  goma. Alejarse del óptimo cuesta tiempo (hasta algo más de un segundo con dos pasos de error en los dos). Los rivales
  montan lo que creen sus ingenieros. Desde la primera clasificación (o la sprint), parque cerrado: no se toca hasta
  la carrera. La parrilla se mide contra su propia media, así que el ritmo medio es el de antes de los reglajes
  (`npx tsx scripts/reglajes.ts <circuito> [semillas]` lo compara; con `--vuelta`, la vuelta con cada reglaje).
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
  - **En pista:** la ventaja de tu piloto sobre el de delante si llega pegado (agarre, recta y manos, en s/vuelta), la que pide la mejor frenada del circuito y si pasarle es muy difícil, difícil, posible o probable. Y lo mismo del de detrás contigo. Sirve para decidir si pelear en pista o buscarle en boxes.
  - **Undercut:** si el de detrás para ya y tú respondes en la vuelta siguiente, ¿te pasa? Y al revés con el de delante.
  - **Huecos en meta** de las últimas 15 vueltas con el de delante, el de detrás y tu compañero. Tocando la gráfica se ven los de cada vuelta.
- ⏸ ×1 ×2 ×4 ×8 ×16 ×64 (teclas 1-6) y ⏭ (simular hasta el final). La sesión se pausa sola en los momentos clave.

## Modo gran premio

Desde el inicio, «Gran premio suelto»: un solo fin de semana, sin temporada. Eliges:

- **Equipo:** uno de los 11 de 2026, con sus dos pilotos y su coche tal cual.
- **Circuito:** cualquiera de los 24 del juego. En Silverstone e Interlagos se
  puede elegir también el formato (normal o sprint); el resto corre con el suyo.
- **Tiempo:** el clima del circuito en su fecha, estable (casi seguro en seco), chubascos los tres días o lluvia casi
  todo el fin de semana.

Y lo disputas entero, igual que en una temporada: libres (o libres y sprint), clasificación y carrera, con reglajes,
juegos de neumáticos y lo que saben tus ingenieros. Cada sesión se puede jugar o simular. Al acabar salen el podio, la
carrera y su resumen, y puedes repetirlo (otra semilla, mismas elecciones) o elegir otro. Se guarda aparte, sin ocupar
ninguna de las tres partidas: si cierras la app a mitad, se retoma desde el inicio («Tu gran premio»). Solo hay uno
guardado: empezar otro lo sustituye.

## Modo escenario

Desde el inicio, «Escenarios»: once carreras reales de 2010 a 2024 que empiezan **a mitad**, en el momento en que se
decidieron, con los equipos, los pilotos y el reglamento de aquel año. Tienes un objetivo y tres estrellas (la primera
es superarlo). Lo que pasa desde ahí lo decide la simulación y tú: la historia puede salir distinta. No toca tus
partidas: no se guarda a medias y, al salir, vuelve la parrilla de 2026.

| Año | Gran premio | Equipo | Empieza | Objetivo |
|---|---|---|---|---|
| 2010 | Abu Dabi | Ferrari | Vuelta 12, Alonso 4.º; Petrov y Rosberg ya han parado | Alonso campeón |
| 2011 | Canadá | McLaren | Vuelta 40, Button último con la pista secándose | Button en los puntos (y ganar) |
| 2012 | Malasia | Sauber | Vuelta 38, Pérez a 1,3 s de Alonso con intermedios | Pérez 2.º o mejor (y ganar) |
| 2012 | Brasil | Ferrari | Fin de la vuelta 1, Alonso 5.º y Vettel último y tocado, con chubascos | Alonso campeón |
| 2016 | Mónaco | Red Bull | Vuelta 30, Hamilton con lluvia extrema y Ricciardo detrás con intermedios | Ricciardo gana |
| 2020 | Italia | AlphaTauri | Salida parada tras la bandera roja, Gasly 2.º | Gasly en el podio (y ganar) |
| 2021 | Hungría | Alpine | Vuelta 4, Ocon líder y Hamilton último tras parar | Ocon en el podio (y ganar) |
| 2021 | Abu Dabi | Mercedes | Vuelta 52; en la 53 sale el coche de seguridad | Hamilton campeón |
| 2023 | Mónaco | Aston Martin | Vuelta 50, Alonso a 11 s de Verstappen y la lluvia a punto de llegar | Alonso gana |
| 2023 | Países Bajos | Aston Martin | Vuelta 60, en seco, con un chaparrón a pocos minutos | Alonso en el podio (y ganar) |
| 2024 | Miami | McLaren | Vuelta 27, Norris líder sin haber parado | Norris en el podio (y ganar) |

- **Reglamento de la época:** 2010 sin DRS ni batería; 2011-2013 con KERS (la parte eléctrica pesa poco) y DRS; desde
  2014, híbridos con DRS; coche de seguridad virtual desde 2015. El DRS usa el mismo segundo en el punto de detección
  que el modo adelantamiento. Nunca hay repostaje (desde 2010 no lo hay). La interfaz quita lo que no existía.
- **La situación de partida** se coloca directamente: orden, huecos (y doblados), neumático montado y gastado con el
  mismo modelo de la carrera, compuestos ya usados, paradas, daños, agua en pista, bandera (coche de seguridad o salida
  parada) y lo que ya ha abandonado.
- **El tiempo tiene guion:** bandas de lluvia que llegan al circuito a la hora prevista (se ven venir en el radar); en
  seco no nace nada por su cuenta.
- **Lo que no depende de ti** también puede ir en el guion: el coche de seguridad de Miami 2024 sale en la vuelta 28 y
  el de Abu Dabi 2021 en la 53. En Abu Dabi, Red Bull espera a ver qué haces: si paras a Hamilton, Verstappen se queda
  fuera.
- **Los niveles** de pilotos y coches de cada año son estimaciones en la misma escala que los de 2026, y los huecos y
  la edad de los neumáticos, aproximados. Los compuestos de cada carrera se pasan a blando, medio y duro. Se corre en
  el trazado actual de cada circuito (en Abu Dabi 2010 no era el mismo) y con el ritmo de los coches de 2026.
- Las mejores estrellas de cada escenario se guardan en las preferencias del navegador.

`npx tsx scripts/escenarios.ts [id] [veces] [--detalle]` monta cada escenario y lo corre hasta el final con el equipo
llevando también a tus pilotos: dice cuántas veces se cumple cada objetivo «sin hacer nada».

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

**Circuitos reales** (`data/circuitos/`). Silverstone, Spa, Monza, Interlagos y Suzuka usan la línea central real del trazado; Mónaco y Marina Bay, su trazado en GeoJSON convertido a metros. De la curvatura sale la velocidad máxima en cada punto (masa puntual con carga aerodinámica, potencia y frenada), con la carga de cada circuito (Monza baja). Sakhir y Sepang también usan la línea central real. Cada circuito se calibra contra la pole real de 2026: Suzuka 1:28.778, Mónaco 1:12.051, Silverstone 1:28.111, Spa 1:44.361, Monza 1:21.786, Sepang 1:35.130 (con mucho calor) y Singapur 1:31.373. Interlagos está estimada en ~1:12.1 y Sakhir en ~1:33.0 (la pole de 2025 más lo que han perdido los coches de 2026). Los adelantamientos de cada circuito se calibran con su media real por carrera: Monza ~47, Sakhir ~46, Sepang ~45 (estimado), Spa ~41, Suzuka ~40, Interlagos ~40, Singapur ~35, Silverstone ~35 y Mónaco ~9. Baréin en abril es casi siempre seco; Sepang en octubre tiene tormentas de tarde. Los 15 del calendario completo (Melbourne, Shanghái, Miami, Montreal, Barcelona, Spielberg, Hungaroring, Zandvoort, Madrid, Bakú, Austin, México, Las Vegas, Lusail y Yas Marina) se calibran con su pole real de 2026 (las tres que aún no se han corrido, estimadas) y su umbral de adelantamiento con `calibra.ts`; Bakú y Las Vegas son urbanos (más coches de seguridad y edificios en el 3D). La pérdida en boxes es la de cada circuito. Zonas de adelantamiento y de modo adelantamiento (MO, el sustituto del DRS en 2026) salen de la geometría.

**Neumáticos** (`src/sim/tyres.ts`). Duro, medio, blando, intermedio y lluvia. Por eje: temperatura de carcasa y de superficie, ventana de cada compuesto, desgaste con precipicio, graining y ampollas.

- **Graining:** la goma de la banda, demasiado fría para lo que se le pide, desliza en vez de agarrar y se rasga en rollitos. Hace falta frío y deslizamiento a la vez: pista verde (sin goma: viernes, o tras la lluvia; en carrera también se engoma vuelta a vuelta), aire sucio que hace deslizar el tren delantero, apretar con el neumático aún frío o un piloto brusco. Los blandos se rasgan más; los duros, al costarles llegar a temperatura, lo sufren más en frío. Se limpia sola cuando la banda trabaja caliente y con carga, antes en un asfalto abrasivo, pero esa goma ya no vuelve: cuesta banda. Si es por frío, ir más despacio lo empeora; hay que meterle temperatura.
- **Ampollas:** la banda se calienta por dentro más deprisa de lo que suelta el calor y se forman bolsas de gas que arrancan trozos. Mandan la temperatura de la banda en los picos de energía (curvas largas, tracción, bloqueos) con la carcasa ya caliente. Son permanentes, quitan agarre y aceleran el desgaste; los duros (banda gruesa) son los más propensos si se pasan de temperatura.
- **Nadie lo ve directamente.** El piloto nota el graining (con más o menos acierto según lo fino que sea) y las ampollas cuando ya vibran; la telemetría avisa de que la banda va pasada de temperatura (riesgo de ampollas). Lo que hay de verdad se ve al quitar el juego. `npx tsx scripts/neumaticos.ts <circuito>` resume graining y ampollas de un fin de semana. Entre compuestos hay ~1 s por vuelta con neumático nuevo en un circuito como Silverstone. Asignación real de juegos: 13 de seco (8 blandos, 3 medios, 2 duros), 4 intermedios y 3 de lluvia; en sprint, 12 de seco (6/4/2), 6 intermedios y 3 de lluvia. Tras cada libre se devuelven los más gastados. En carrera en seco hay que usar dos compuestos. Los juegos usados conservan su desgaste.

**En mojado** el agarre de cada compuesto depende del agua en la trazada, y el agua además enfría el neumático (mucho a un slick, poco a uno de lluvia). Está calibrado con datos reales:
- el intermedio compensa cuando la vuelta con slicks llega al 110-112 % de la de seco (regla de Pirelli), con ~0,17 mm de agua;
- un intermedio en pista seca pierde ~6 % y se destroza;
- con mucha agua el intermedio va un ~20 % más lento que en seco (en Interlagos 2024, la pole en mojado fue de 1:23.405 frente a 1:08.899 en seco el mismo fin de semana), y a partir de ~0,85 mm compensa el de lluvia.

Apartar agua frena también en recta: con pista empapada se pierde velocidad punta. La IA decide el cambio haciendo cuentas con el agua prevista (ver «La IA de los equipos»), cada equipo con su error y su carácter.

**Lo que nadie sabe.** Cada fin de semana esconde cuánto desgasta de verdad cada compuesto (±12-13 %), si los neumáticos trabajan más calientes o fríos de lo previsto y la tendencia al graining. Los equipos lo estiman con más o menos error, lo afinan en libres y lo corrigen en carrera comparando el desgaste real del stint con el previsto.

**Tiempo** (`src/sim/weather.ts`). Siempre dinámico y localizado. Hay células de lluvia grandes (frentes) y pequeñas (chubascos de 0,3-1,2 km) que mojan solo una parte del circuito. Nacen, crecen, se mueven con el viento y mueren. El clima de cada circuito corresponde a su lugar y fecha: temperaturas medias, días de lluvia y tormentas de tarde en Interlagos y Spa. El viento sopla con rachas y afecta al coche según la orientación de cada tramo: de cara frena en recta pero da carga en curva, y de cola al revés; con 25 km/h la vuelta cambia unas décimas según la dirección, y las rachas fuertes provocan más errores en las curvas rápidas. Hay ciclo diario de temperatura y sol, y cada día es continuo: la clasificación hereda el agua y las nubes de la mañana. El agua se calcula por tramo de pista: la lluvia la sube enseguida (con 4 mm/h, en un par de minutos ya hacen falta intermedios), el drenaje la baja deprisa cuando hay agua estancada y despacio cuando la pista solo está húmeda, y la evaporación remata. Cada coche que pasa aparta algo de agua de la trazada: en carrera se abre una línea seca y la pista se seca en ~15 minutos, más rápido que en unos libres con pocos coches. Fuera de la trazada sigue mojado, y quien sale de ella para adelantar lo nota. El radar ve el campo real; la previsión de tu meteorólogo extrapola lo que ve, con su error.

**Carrera** (`src/sim/session.ts`). Modo adelantamiento, tapones, banderas azules, toques, errores, pinchazos, averías, coche de seguridad y VSC.

**Neutralizaciones.** Dirección de carrera mira qué ha pasado y dónde:
- un **accidente** deja restos y barreras dañadas: coche de seguridad casi siempre, y si es fuerte puede haber bandera roja;
- una **avería** a veces deja llegar al garaje (sin neutralizar); si el coche se queda en la pista, lo normal es un virtual;
- los **restos** de un alerón tras un toque, a veces un virtual;
- en un **urbano** (Mónaco, Singapur) no hay escapatorias: cualquier coche parado trae coche de seguridad más a menudo.

Lo que no merece neutralizar se queda en **bandera amarilla** (doble si hay un coche parado) en esa zona: se levanta al
pasar y no se adelanta. En libres y clasificación, quien pasa por una amarilla en vuelta lanzada pierde unas décimas
(doble: la vuelta estropeada), y un trompo o una salida de pista dejan su amarilla un rato. El coche de seguridad dura
según lo que haya que limpiar (de 2 a 6 vueltas; el virtual, de 1 a 4 minutos). Detrás de él van en fila haciendo eses
para calentar las gomas. Antes de retirarse, los doblados pueden desdoblarse: adelantan al grupo por un lado, dan la
vuelta y se ponen a la cola, y se les espera una vuelta. En la última
vuelta el líder agrupa a todos y acelera donde quiere antes de la meta; los demás arrancan al verle, uno detrás de
otro. Tras una bandera roja por accidente se reanuda con **salida parada**, en el orden de carrera y con semáforos, y
la vuelta de formación cuenta como vuelta de carrera. Con lluvia se sigue reanudando detrás del coche de seguridad.

**Sanciones.** Los comisarios investigan cada toque y deciden en un par de vueltas: en la salida casi siempre es un
incidente de carrera; si no, la culpa suele ser del que se ha metido en el sitio del otro: casi siempre el que ataca
(más si es agresivo y el otro no), pero si el de delante estaba cerrando la puerta y la cierra tarde (es más agresivo, o
va en duro), suele ser suya. Son 5 s, o 10 s si acabó en pinchazo o accidente. Los **límites de pista** también cuentan en carrera: a la tercera, bandera blanca y
negra; a la cuarta, 5 s, y otros 5 cada tres más. Pasarse de velocidad en el pit-lane, 5 s. La sanción se cumple
parado en la próxima parada (el Muro ya la cuenta en «Si para ahora») o, si no se para más, se suma al tiempo final.
En la torre sale en rojo (+5s) hasta que se cumple. Con las banderas azules, el doblado se aparta de la trazada y el que dobla pasa por ella (también pierde algo al pasar).
El que va a parar se pone del lado de boxes unos 300 m antes de la entrada.
Si el sancionado **abandona sin cumplirla**, pasa a la **parrilla de la carrera siguiente**: 3 puestos por 5 s y 5 por
10 s (sale en los resultados, en «¿Y ahora qué?» y en el aviso de la parrilla). De vez en cuando un doblado **no hace
caso a las banderas azules** (más los agresivos y los novatos; algo así como una vez cada diez carreras, más en los
circuitos donde se dobla mucho, como Monza) y aguanta un rato al que le dobla: 5 s. Tras una **bandera roja por lluvia**,
la carrera se reanuda detrás del coche de seguridad y, cuando se retira, con **salida parada** desde la parrilla.
`npx tsx scripts/gestion.ts [circuito] [carreras]` cuenta las banderas azules ignoradas y las sanciones que pasan a la
carrera siguiente, y fuerza una bandera roja por lluvia para ver la salida parada.

**Toques en la pista.** Un toque pasa de verdad: el que se mete en el sitio del otro va hacia él hasta que se juntan, y
lo fuerte que es (un roce, el alerón, un pinchazo, los dos largos o el accidente) depende de lo deprisa que se cierran
a lo ancho y a lo largo.

**Salirse de pista.** El que se equivoca en una curva se va largo por fuera y vuelve. En qué acaba depende de lo que
haya: sin escapatoria (los urbanos) termina contra las barreras bastante más a menudo; con mucha grava, casi nunca,
pero se rompe más el fondo. En total hay los mismos accidentes que antes, repartidos según el circuito (en los urbanos,
más coches de seguridad).

**Daños.** El alerón delantero se rompe en toques y salidas de pista; el **fondo**, en la grava, en toques en los que
los dos se van largos y en los bordillos si el coche va más bajo de lo que pide el circuito (ver «Reglajes»). Los dos
quitan carga: la tarjeta del piloto dice cuánto cuesta cada uno por vuelta. El fondo no se arregla en una parada y
sube algo el riesgo de avería. El morro sí, pero cuesta 7,5 s más: en automático el equipo lo cambia si lo que queda
de carrera con el alerón dañado cuesta más que eso, y tú puedes elegir «Cambiar» o «Dejar» en la tarjeta. Con el
alerón muy tocado la IA adelanta la parada, o hace una de más si le sale a cuenta.

**Pelear o no.** En la tarjeta de cada piloto, «Pelea»: **Defender** cierra la puerta (el que ataca necesita
~0,35 s/vuelta más de ventaja para pasar), pero cada frenada defendida cuesta unas centésimas, calienta y gasta el
delantero y sube algo el riesgo de toque; **No pelear** deja pasar enseguida al que va más rápido (por ejemplo, uno con
otra estrategia), sin perder tiempo en la pelea. En automático el equipo cierra la puerta en las ocho últimas vueltas
si hay puntos en juego. El Muro dice, para el de delante y el de detrás, la ventaja que lleva cada uno, la que hace
falta y si se puede pasar (contando si defiendes).

**Riesgo en la pelea.** También en la tarjeta, «Riesgo»: **Limpio** (lo normal) o **Duro**. En duro tu piloto frena
más tarde y se tira con menos hueco (unas 0,15 s/vuelta más de ventaja al atacar, y vuelve a intentarlo antes) y, al
defender, cierra más tarde y cede menos (el que le ataca necesita ~0,12 s/vuelta más). Se ve en la pista: atacando va
más pegado al otro y, defendiendo, tapa el interior más tarde y más cerrado. A cambio, en paralelo y tan juntos se
rozan (de ahí salen sus toques de más: con toda la parrilla en duro, unos 2,8 por carrera frente a 1,1), se pasa más
de frenada, se mueve en la frenada bastante más a menudo y, si hay toque, los comisarios le echan la culpa más a
menudo.

**Moverse en la frenada.** El que tapa el interior puede cambiar de dirección una vez. A veces (más los agresivos, y
mucho más en duro) se mueve otra vez con el otro ya casi al lado: el que ataca tiene que levantar y los comisarios lo
investigan (5 s de sanción o una advertencia). Pasa más o menos una vez cada ocho carreras. La IA de los rivales y el
automático van siempre en limpio. El Muro cuenta el riesgo en la ventaja y en lo que hace falta para pasar.

**Averías que avisan.** La mitad de las averías rompen de golpe; el resto avisa antes por la telemetría (temperatura
de agua y aceite, presión hidráulica, frenos, batería…) y va a más cada vuelta. Con el motor en Ahorro y el ritmo bajo
(levantando antes de frenar) avanza mucho más despacio, así que a veces se llega a meta; mientras tanto, un motor o
una batería tocados dan algo menos de potencia y unos frenos tocados fallan más. El ingeniero te lo dice por radio, la
tarjeta del piloto enseña cómo va (⚠️ y el %) y la IA cuida las suyas.

**Paradas.** La parada hay que pedirla con tiempo: a menos de ~2,5 s de la entrada del pit-lane el piloto ya no
puede meterse y para en la vuelta siguiente. En la hoja de la parada se elige cómo: **segura** (+0,4 s, casi nunca sale
mal), **normal** o **rápida** (−0,25 s, sale mal el doble de veces y es más fácil soltar el coche justo cuando llega
otro: salida insegura, 5 s). Si el compañero acaba de parar, los mecánicos van con prisa y sale mal más a menudo.

**Pilotos con carácter.** Cada piloto lleva su confianza durante la sesión: sube con las vueltas limpias y los
adelantamientos y cae tras un error (más en los menos regulares), y con ella cambian un poco su ritmo y lo que se
equivoca; tras un trompo, alguno se viene abajo unas vueltas. Los **novatos** (sin carreras de F1 antes de esta
temporada: año de `debut` en los datos) fallan algo más, sobre todo en mojado, y los de segundo año, la mitad. Las
**rivalidades** conocidas (Verstappen con Norris o Hamilton, los compañeros de McLaren…) hacen que, cuando pelean
entre ellos, ninguno levante: más toques.

**El vestuario: moral, rivalidades y rueda de prensa** (`src/sim/morale.ts`, `src/ui/vestuario.ts`). Solo en la
temporada (el gran premio suelto y los escenarios, como siempre).
- **Moral** de cada uno de tus pilotos (0 a 100, 60 lo normal), que dura toda la temporada y se ve en la pantalla de
  temporada, en el fin de semana y con una cara en su ficha durante la sesión. Tras cada carrera sube con los buenos
  resultados (más si superan lo que se espera del coche), con ganar al compañero y cuando el equipo le da paso; baja
  sin puntos, con un abandono, por detrás del compañero y, sobre todo, cuando le haces **dejar pasar a su compañero**
  (−7). Con el tiempo vuelve poco a poco a lo normal; en invierno, a medias.
- Lo que cambia: un poco de **ritmo** (unas 5 centésimas por vuelta en los extremos); si **obedece** (por debajo de
  45, un piloto de carácter fuerte puede negarse a dejar pasar a su compañero o **retrasar una vuelta la parada** que le
  pides, si cree que las gomas aguantan; con 25 de moral, un volcánico se niega una de cada tres veces y uno tranquilo,
  una de cada treinta) y si **quiere renovar** (por debajo de 30, puede que no: hay que buscarle sustituto). Lo dice él
  por radio, con su voz, y Lobato también.
- **Rivalidades** que duran de carrera en carrera: nacen de un toque o de adelantarse una y otra vez, y se apagan poco
  a poco (como mucho 8 vivas). Entre rivales se defiende con todo y se tocan más; Lobato lo recuerda («¡Otra vez estos
  dos!») y tus pilotos también por radio. Se ven en la pantalla de temporada.
- **Rueda de prensa** antes de cada carrera: una o dos preguntas según cómo va la temporada (dos carreras sin
  puntos, favoritismo, una rivalidad, el piloto que no arranca o qué esperáis desde la parrilla). Cada respuesta toca
  la moral de tus pilotos, la rivalidad o lo que piensa la directiva, que lo comenta en su mensaje tras la carrera.
- `npx tsx scripts/moral.ts [circuito] [carreras] [equipo]` mide cuánto desobedece cada carácter según su moral, lo
  que cambia la vuelta y cuántas rivalidades nacen en una serie de carreras.

**El ritual de la temporada** (`src/sim/hitos.ts`, `src/ui/ritual.ts`):
- **Previa** de cada gran premio, al abrir el fin de semana: bandera, la clave del circuito (escrita para los más
  conocidos y, para el resto, sacada de sus datos: si se adelanta, cuánto desgasta, lo que cuesta parar, si es urbano o
  sprint), el tiempo esperado para la carrera y la historia en tu partida (quién ganó aquí los años anteriores, tu mejor
  resultado y el récord de la vuelta).
- **Hitos** de tu equipo tras cada carrera, con un rótulo dorado: primera victoria (de la partida y del año), primera
  victoria o primer podio de cada piloto, dobletes, rachas de victorias y de poles, victorias y carreras redondas,
  primeros puntos y récords del circuito (la mejor vuelta de la partida en cada circuito; la primera visita la fija sin
  anunciarla). Se guardan en la partida y se vuelven a ver desde el calendario.
- **Lobato con memoria:** en la bandera a cuadros sabe si es la primera victoria de tu piloto con el equipo, la primera
  del año de cualquiera o la tercera seguida; en la pole, si es la segunda o la tercera seguida.
- **Gala de fin de temporada** al acabar el año: piloto del año, remontada del año, golpe de estrategia (ganar puestos
  con un número de paradas distinto al del resto), más vueltas en cabeza, novato del año y el mejor de tu equipo.
- **Sala de trofeos** en la pantalla de temporada: una copa por cada podio de tu equipo, por año, los últimos hitos y
  las galas anteriores.
- `npx tsx scripts/hitos.ts [equipo] [carreras] [semilla]` corre varias carreras y vuelca los hitos de cada una, lo que
  sabría Lobato y la gala.

**La retransmisión y el público** (`src/ui/experta.ts`, `audio.ts`, `map3d.ts`):
- **Begoña Arrieta**, ingeniera de pista retirada (personaje inventado), comenta junto a Lobato en la caja de la
  izquierda y en Radio (pestaña verde), con su propia voz. Donde él se emociona, ella explica: el undercut de verdad
  (para con alguien a tiro delante que aún no ha parado) o la respuesta a la parada del de detrás, lo que cuesta
  parar con coche de seguridad o virtual en ese circuito, el compuesto que monta cada uno de los de delante y si le
  llega hasta el final, las estrategias cruzadas en cabeza, las gomas gastadas, el aire sucio y el cruce entre lluvia
  y slicks; en clasificación, la pista que mejora y el tráfico. Habla menos que Lobato (unos 13 comentarios por
  carrera). Se apaga en Ajustes. `npx tsx scripts/experta.ts [circuito] [semilla]` vuelca sus comentarios.
- **El público de casa:** cuando adelanta un piloto del país del circuito, la grada ruge más (y si gana, el doble de
  tiempo); en las gradas del 3D, más o menos la mitad de las banderas de los aficionados son la del país
  (`public/assets/flags`). Al acabar la carrera suena un **himno inventado** del país del ganador: una fanfarria de
  metales de unos 7 s generada al momento, distinta para cada país, que no imita ningún himno real.

**Planos técnicos** (`src/ui/planos.ts`): en «Desarrollo del coche», el coche visto desde arriba y de lado como un
plano, con la pieza montada en dorado (aerodinámica: alerones y fondo; motor: tapa del motor y escape; fiabilidad:
pontones y caja de cambios) y la que está en fábrica en trazo discontinuo, con el gran premio en que llega. En
«Reglajes», el perfil de cada piloto: el coche sube o baja con la altura y los alerones se inclinan con la carga.

**Vuelta de formación.** Los neumáticos salen de las mantas a 70 °C y en la vuelta de formación cogen temperatura
según el compuesto y el asfalto: el blando sale casi en su ventana y el duro, lejos; con frío o con agua, menos.

**Salida.** Cada piloto reacciona y tracciona distinto (su nota de salida, con azar), el blando arranca mejor que el medio y el duro, y de vez en cuando alguien se queda clavado. Hasta la primera frenada hay sitio a los lados: los puestos se ganan o se pierden por pura arrancada. La parrilla va en
dos filas (la pole, del lado del interior de la primera curva) y cada uno sale por su lado, así que a la primera frenada
se llega de dos en dos o de tres en tres. En la primera vuelta se pasa en casi cualquier curva, pero la diferencia de agarre cuenta la mitad (van en grupo).

**Adelantamientos.** En cada frenada se compara la **ventaja del que ataca, en segundos por vuelta**, con un umbral:
- **agarre en aire limpio** (neumáticos y su estado, coche, piloto, modo de ritmo, daños): es lo que da tracción y frenada;
- **lo que gana en la recta anterior**: rebufo, modo adelantamiento (que el de delante también lleva si va en tren), batería, motor, resistencia y peso;
- **ataque** de uno contra **defensa** del otro.

Con la ventaja igual al umbral se pasa una de cada dos veces, y sube o baja deprisa a partir de ahí: con coches iguales casi no se pasa (un 5 % por vuelta), con 1 s por vuelta de ventaja cuesta dos o tres vueltas, con 1,5 s se pasa casi a la primera y un coche con las gomas muertas pierde el puesto en cualquier curva. El umbral es el de la mejor frenada del circuito (`adelantamientos.umbral`); las zonas peores piden más. Hay que llegar pegado (menos de 0,55 s). Un intento fallido hace perder tiempo a los dos, y a veces el que ataca se pasa de frenada y se hace un plano; quien acaba de perder el puesto tarda unos segundos en poder devolverlo. Con un coche pegado detrás se cometen más errores (los pilotos regulares, casi ninguno más).

**Cómo se ve: una maniobra en la pista.** Cada intento es una maniobra con los dos coches en su sitio a lo ancho
(`Car.maneuver`, ver `docs/PLAN-LATERAL.md`):
- el que ataca se tira por el **interior** de la curva siguiente y el de delante se aparta un poco hacia el otro lado;
- si el de delante **cierra la puerta** (Defender, o la IA en las últimas vueltas) le tapa el interior y el ataque va
  **por fuera**; también se va por fuera si el de delante ya iba por dentro;
- van **en paralelo** un rato (el que pierde el puesto se queda atrás poco a poco, no de golpe) y el mensaje dice si
  ha sido por dentro o por fuera;
- un **intento fallido** se ve: se mete, no le da y vuelve detrás.

La probabilidad de que salga es la misma de arriba (la maniobra decide cómo y por dónde, no cuántas veces). En
`realismo.ts` salen el % de adelantamientos por fuera, los segundos en paralelo por adelantamiento y los segundos con
dos coches metidos uno en otro (que debería ser casi nunca).

Antes la dificultad del circuito recortaba la probabilidad por arriba: con dos segundos de ventaja se seguía sin pasar, se formaban trenes y lo que funcionaba siempre era alargar la tanda. Ahora unas gomas mucho más nuevas valen puestos en pista, y el undercut y el overcut dependen del circuito y del tráfico. `npx tsx scripts/carrera.ts <circuito> [carreras]` mide la curva (probabilidad de pasar según la ventaja), los trenes y el total; `npx tsx scripts/calibra.ts` ajusta el umbral de cada circuito al doble de su media real de adelantamientos, que es de coches anteriores a 2026 (con el modo adelantamiento y la batería de ahora se pasa bastante más).

**La IA de los equipos** (`src/sim/strategy.ts`).
- **Paradas.** Sigue su plan, pero mira la carrera: no para si va a salir en mitad de un grupo o detrás de su compañero y las gomas aguantan; si lleva vueltas atascado y la parada está cerca, intenta el **undercut**; si se lo hacen a él, lo **cubre** mientras aún pueda salir por delante y, si ya es tarde, **alarga** para tener gomas mejores al final; con las gomas hundidas hace la cuenta de parar ya. Con **coche de seguridad** compara de verdad parar ahora (la parada cuesta la mitad) con seguir, contando los puestos que perdería y la cola en su box.
- **Lluvia.** Proyecta el agua de los próximos minutos (la que hay, la prevista, el drenaje y lo que secan los coches) y compara cada tipo de neumático: lo que se pierde por vuelta, la parada (y la de vuelta) y el riesgo de ir con el equivocado. Aguanta un chaparrón flojo con slicks y no pone intermedios hasta que van a ser más rápidos en un par de vueltas.
- **Ritmo, motor y batería.** Gasta lo que las gomas y el combustible permiten para llegar a la parada prevista, y aprieta cuando vale puestos: atacando, defendiéndose, en la vuelta de entrada y las de después de parar y al final. Si lleva varias vueltas pegado a uno al que no pasa, se descuelga un par de vueltas para enfriar las gomas. El motor a tope, solo en plena pelea; la batería también se usa para defenderse.
- **Órdenes de equipo.** Si el compañero viene pegado y es claramente más rápido, le abren paso (en tu equipo lo decides tú).
- **Clasificación.** Se ahorra la última salida solo con margen de tiempo sobre el primer eliminado; guarda un juego nuevo por cada parte que queda (dos para la última) y hace la primera salida con uno usado si le basta; en mojado sale enseguida y encadena vueltas, y con la pista secándose rueda hasta la bandera; si estropea la vuelta y hay reloj, se queda fuera y lo intenta otra vez.
- **Y se equivoca.** Cada muro lee el agua y el desgaste con su error y los flojos ven las jugadas una vuelta tarde; los pilotos fallan más bajo presión, atacando al límite y en la primera vuelta.

**Aire sucio y rebufo.**
- **Aire sucio:** detrás de otro coche se pierde carga aerodinámica. Pesa en las curvas rápidas, donde el agarre depende de ella, y apenas en una chicane lenta. Se diluye deprisa: a 1 s ya es poco y a 1,6 s nada.
- **Rebufo:** en recta ahorra resistencia y dura más; aún se nota a 1,5-2 s.
- **Según el lado:** las dos cosas dependen también de lo que se aparte uno de la estela del otro. Justo detrás se lleva
  todo; a un coche de lado, bastante menos (la estela que da rebufo es más ancha que la que quita carga). Por eso el que
  sigue a otro a menos de 1 s **se abre un poco en las curvas rápidas** para respirar aire limpio, y en la recta vuelve
  detrás a por el rebufo.
- **Fuera de la trazada** se agarra menos en curva (no hay goma y sí gravilla de neumático, más con la pista
  engomada) y, con la pista mojándose o secándose, se pisa el agua que no han apartado los demás. Abrirse para
  respirar compensa hasta más o menos 1 s detrás; más lejos cuesta más de lo que da. `npx tsx scripts/aire.ts` dice
  lo que se pierde por vuelta a 0,3, 0,5, 0,8 y 1,2 s de otro coche en cada circuito.
- **Trazada de mojado:** con la pista mojada la goma de la trazada de seco resbala, así que la buena se aparta del
  vértice (con la pista empapada, algo por fuera). Los coches la siguen y lo que cuesta es ir por la de seco.

Cada circuito tiene su balance. En Monza ir a rebufo compensa; en Silverstone o Interlagos es mejor el aire limpio, salvo con mucho hueco.

**Clasificación y libres con tráfico.**
- Los garajes están repartidos por el pit-lane y se sale de uno en uno.
- Ante la lluvia, cada muro reacciona a su ritmo.
- En la vuelta de salida, cada piloto levanta para abrir hueco con el de delante: en Monza para quedarse a rebufo, en el resto para tener aire limpio. No todos lo hacen igual de bien, así que hay quien empieza la vuelta pegado a otro, y quien va lanzado a veces se encuentra a uno lento que no se aparta a tiempo.

**Banderas rojas** en todas las sesiones, por accidente fuerte (barreras dañadas) o por lluvia torrencial (agua estancada en algún sector o chaparrón muy fuerte). En carrera se para todo, se pueden cambiar los neumáticos sin perder tiempo y se reanuda con salida parada (con lluvia, detrás del coche de seguridad y no hasta que la pista lo permite).

**Reglamento de tiempo y carreras acortadas:**
- Una carrera dura como mucho 2 h sin contar las suspensiones, y 3 h en total. Al cumplirse, bandera a cuadros al final de esa vuelta.
- Si una carrera suspendida no puede reanudarse, cuenta la clasificación al final de la penúltima vuelta antes de la suspensión.
- Los puntos dependen de la distancia: sin puntos si no se completaron dos vueltas en verde; 6-4-3-2-1 por debajo del 25 %; 13-10-8-6-5-4-3-2-1 hasta el 50 %; 19-14-12-9-8-6-5-3-2-1 hasta el 75 %; completos por encima. En la sprint, por debajo del 75 %, mitad de puntos.

**Salida en mojado:** con mucha agua la carrera empieza detrás del coche de seguridad, que no se retira hasta que se puede correr. Cada equipo elige el neumático de salida mirando también el radar y su previsión, no solo el agua de ese momento. En clasificación hay tráfico (coches en vuelta de salida que estorban) y vueltas anuladas por límites de pista.

**Estrategia** (`src/sim/strategy.ts`). La IA simula stints con el mismo modelo de neumáticos (con su error) y busca la mejor combinación de 0, 1 o 2 paradas **con los juegos que le quedan**, valorando la posición en pista. Cada parada cuenta además lo que cuesta volver entre coches más lentos, que es más donde no se puede adelantar (en Mónaco una parada de más sale cara). En carrera reacciona a coches de seguridad, undercuts y lluvia (ver «La IA de los equipos»). El estratega te dice por qué recomienda parar.

## Parrilla 2026

`data/equipos-2026.json`: los 11 equipos y 22 pilotos reales con sus números. El rendimiento de cada coche es una estimación a partir del mundial de constructores 2026 tras México (Mercedes, Ferrari, Red Bull, McLaren, Racing Bulls, Alpine, Haas, Audi, Williams, Aston Martin, Cadillac); la potencia, del motor de cada equipo. Los atributos de los pilotos son una valoración propia y se pueden editar. Cada piloto lleva su año de nacimiento y el de su primera carrera de F1 (`nacimiento`, `debut`): con ellos se sabe quién es novato y cómo cambia con los años.

`data/mercado-2026.json`: el mercado del modo «crear equipo»: precios, incertidumbre, reservas y pilotos libres, jefes de equipo, directores técnicos y motores. Los cargos y reservas son los de la prensa de principios de 2026; los que no estaban confirmados llevan una nota. Las valoraciones son estimaciones del juego.

## Mapa 3D

En la sesión, el botón **3D** del mapa cambia el mapa de siempre por una vista en 3D que ocupa el mismo recuadro (se descarga la primera vez que se pulsa y se recuerda para la siguiente sesión). Arriba a la izquierda tienes chips rápidos para saltar entre tus dos pilotos a un toque, y de cerca las etiquetas sobre cada monoplaza muestran su posición y neumático y se pueden tocar directamente para seguirlo.

En 3D, tocar el botón **Cámara** abre un menú rápido con las ocho vistas —*Circuito*, *Seguir*, *Tele*, *A bordo*, *Helicóptero* (alto, detrás y a un lado del coche seguido, con zoom suave y deriva lenta), *Pit-lane* (fija en el muro frente a su garaje mientras está en boxes; si no, le sigue de cerca), *Alerón trasero* (a bordo mirando hacia atrás) y *Grúa de meta* (de lado y en alto sobre la recta de meta)—, el interruptor **Auto-TV** (activo por defecto, con el que la cámara *Tele* realiza automáticamente la salida desde la grúa, corta al *Pit-lane* en las paradas de tus pilotos y busca incidentes y batallas cercanas respetando varios segundos cada plano) y las **Capas tácticas** opcionales sobre la pista (zonas de DRS o Modo Adelantamiento con frenadas, contraste reforzado de carril seco frente a mojado y anillos del fantasma de parada en carrera). En *Circuito* y *Seguir* puedes orbitar arrastrando el dedo (o el ratón), acercar o alejar con pellizco (o rueda) y volver al encuadre automático con doble toque. En móvil, las hojas inferiores se animan al abrir/cerrar y se descartan deslizando hacia abajo desde la cabecera, los botones inferiores muestran avisos discretos (lluvia inminente en *Radar*, recomendación de parada en *Muro* y mensajes clave sin leer en *Radio*) y Ajustes permite activar o desactivar una vibración háptica suave en semáforos, coche de seguridad y paradas.

**Cada coche va donde la simulación dice también a lo ancho:** por la trazada (por fuera antes de la curva, por
dentro en el vértice) y, cuando se le echa encima a otro, se aparta a un lado y el de delante cede un poco hacia el
otro. Lo decide la simulación (`Car.lat`, ver `docs/PLAN-LATERAL.md`) y el 3D solo lo dibuja. Por ahora no cambia
nada de la carrera.

El botón de ampliar abre el 3D sobre la clasificación junto a una mini-torre flotante (Top 3 y tus dos pilotos) y botones rápidos de pausa y box; en ese modo, un toque en el fondo oculta o recupera toda la interfaz flotante sobre la pista.

La luz es física (three.js, materiales PBR): el sol da la luz directa y las sombras, y los reflejos
y la luz ambiente parten del cielo de cada momento con mapas de entorno HDRI (soleado, atardecer,
nublado y noche; más un estudio en el creador de equipo) y un cubo de cielo de respaldo al instante.
El asfalto, la hierba, la grava, el hormigón y las fachadas usan texturas PBR en WebP (cargadas al abrir
el 3D sobre las procedurales de arranque). Hay cuatro escalones de calidad y, si el dispositivo no llega a
40 fps, baja solo: primero quita la oclusión ambiental y el desenfoque de la cámara de tele,
luego resolución, luego el resplandor y el búfer HDR, y al final las sombras. Solo los coches cercanos (hasta 8) usan
la malla fina; los reflejos de los focos en mojado necesitan calidad 2 y las sombras de los árboles, la máxima.
Niveles de detalle: el decorado pegado a la pista va por tramos de unos 400 m y solo se dibujan los que caen en la
vista o en la caja de las sombras; los lejanos, sin rótulos, balcones, pilares, banderas ni bajos de las cubiertas (todo
sigue en una sola llamada de dibujo: lo que cambia son los índices, y solo cuando cambia algún tramo). Desde muy lejos
(la vista general) los coches pasan a una malla mínima de unos 300 triángulos con las ruedas dentro y los árboles a
una copa sola. En Mónaco y Singapur solo dan sombra las manzanas cercanas a la pista, y las fachadas lejanas, cuando
cada ventana ocupa menos de medio píxel, cambian sus ventanas encendidas por un brillo uniforme que no parpadea.
En Ajustes se puede fijar la calidad a mano (0 a 3, o automática; fijada no baja sola), activar **«Ahorro de batería
(30 fps)»** para limitar la tasa de fotogramas sin degradar el nivel de detalle, y encender un medidor de
rendimiento: fotogramas por segundo (media del último segundo), calidad, escala de resolución y triángulos y llamadas
de dibujo por fotograma. Tocando el medidor se pasa a la calidad siguiente. Si el navegador o el sistema móvil suspende
el contexto WebGL al cambiar de aplicación y no logra restaurarlo al volver, la vista salta al mapa 2D con un aviso para
evitar la pantalla negra.

Alrededor de la pista hay edificio de boxes con un garaje por equipo (con su cartel), puestos en el muro y
motorhomes en el paddock, torre de control, tribunas con su perfil de verdad (gradas en pendiente con público y cubierta
en voladizo) que siguen la curva, torres de las cámaras de tele y puentes de publicidad sobre las rectas. Cada uno de los
24 circuitos tiene además su identidad a pie de pista (`src/ui/trackVisuals.ts`): paleta de pianos propia de 2 o 3 colores
(rojo/amarillo en Spa y Spielberg, tricolor en Monza, México, Austin, Interlagos y Hungaroring, negro/blanco en Silverstone,
azul/amarillo en Zandvoort, granate/blanco en Lusail, azul/blanco en Miami, Yas Marina y Bakú…), escapatorias de asfalto
pintado con franjas de alta adherencia en los circuitos modernos frente a grava rastrillada en los clásicos, y cuatro
estilos urbanos propios: pisos mediterráneos con contraventanas y teja en Mónaco, torres de cristal junto a la bahía en
Singapur, hoteles-casino con neones y pantallas LED nocturnas en Las Vegas, y piedra caliza histórica con arcos mezclada
con torres modernas de cristal en Bakú. Todo lo que va junto a la pista se ensancha con
ella al alejar la cámara y se comprueba que no la pise a ninguna escala.
Con calidad 2 o 3, y solo de cerca, hay más detalle (los escalones 0 y 1 no dibujan ni un triángulo más):
- detrás de los cristales se ven habitaciones con fondo (paredes, suelo, techo, muebles y alguna cortina), oficinas en
  las torres y salas en la hospitalidad de los boxes; de día con la luz de la ventana y de noche con la de la lámpara;
- las torres tienen un vestíbulo acristalado de doble altura con marquesina, y unos tres de cada diez edificios de
  Mónaco, soportales con arcos en la planta baja;
- arriba, tejados a dos aguas de teja con chimeneas, azoteas con pretil, casetón y depósito, y en las torres
  máquinas de clima, antenas y algún helipuerto; también en las manzanas lejanas;
- la cubierta de las gradas cuelga de tirantes desde mástiles, con el frente y las correas a la vista, y las gradas
  tienen pasillos de escalones cada 14 m;
- los palcos de los boxes llevan una cristalera inclinada, con barandilla en la cubierta y en el balcón; la cabina de
  la torre de control, cristales inclinados y antenas, y los puentes, barandillas.

El hormigón de la zona de trabajo y del paddock va en losas con juntas, manchas de aceite y agua en las juntas cuando
llueve; el muro del pit-lane, en piezas de 6 m con su junta, y los muros de los edificios, en paños con su tono y
churretes.

Cada equipo lleva su librea pintada en una textura: un dibujo propio a partir de sus colores, juntas y
branquias de refrigeración y tres patrocinadores inventados con su isotipo (en los pontones, el alerón
trasero, el morro y la tapa del motor). De cerca, las ruedas muestran radios con discos de freno que
se iluminan al rojo en las frenadas fuertes, surcos de agua en intermedios y lluvia, y a bordo se ve el
volante con la pantalla LED viva (marcha, velocidad, batería y LEDs de RPM). Además se puede sustituir
el monoplaza por un `.glb` propio comprimido con Draco (`public/assets/models/`, ver
`docs/GUIA-BLENDER-COCHE.md`). En las paradas el coche se para delante
de su garaje, sube en los gatos y los mecánicos (mono del color del equipo, y casco y franjas de los hombros y las piernas del segundo color) quitan las ruedas viejas y ponen las nuevas, del
compuesto que toca. Los percances de la simulación se ven: el trompo gira el coche con humo de goma, la salida de pista
lo lleva a la escapatoria levantando polvo de la grava o de la hierba, el bloqueo echa humo de la rueda delantera y el
accidente deja el coche contra la barrera un par de minutos.

En los 24 circuitos el terreno de alrededor es el de verdad (`public/assets/env-tracks/<id>.json`, descargado bajo demanda al abrir ese GP y generado por `python3 scripts/entorno.py` con altitud real y polígonos de agua de OpenStreetMap): el mar y los puertos deportivos con yates amarrados en Mónaco, Singapur y Yas Marina; el lago interior de Albert Park en Melbourne; el río San Lorenzo y el canal olímpico rodeando Île Notre-Dame en Montreal; los embalses en Interlagos; la costa del Mar del Norte en Zandvoort (sin inundar los pólderes); y las montañas y valles reales de Spielberg, Spa, Hungaroring, Barcelona, Suzuka, Austin o México. En los circuitos urbanos, además, la ladera de Mónaco coloca los edificios más altos cuesta arriba, Singapur y Las Vegas toman la altura de sus torres del modelo de superficie y las calles siguen la pista.

La carrera se lee como en la tele:
- **Hora del día:** con el sol bajo la caja de las sombras se agranda para que las sombras largas del atardecer no se
  corten; al anochecer las ventanas de los edificios se encienden poco a poco (cada una con su umbral) y, de noche,
  hay un resplandor anaranjado sobre el horizonte (más en Singapur y Mónaco) y, en calidad 2 y 3, las luces de los
  pueblos en el borde del terreno.
- **Tormentas:** bajo los chubascos lejanos se ven cortinas de lluvia en el horizonte, franjas que se mueven con el
  viento. Con una célula de tormenta (más de 15 mm/h) a menos de 30 km caen rayos de vez en cuando: el cielo y la luz
  ambiente destellan unas décimas, a veces dos veces, y el trueno llega después según lo lejos que esté (a la
  velocidad del sonido).
- **Nubes y lluvia de cerca:** en calidad 2 y 3 las nubes tienen volumen: cada una sube más cuanto más densa es y,
  hacia el horizonte, entre los huecos de las bases se ven los costados de las de detrás, con el lado del sol más
  claro y en sombra donde otra nube le tapa el sol. Con lluvia la carrocería se llena de gotas (de cerca, con su
  reflejo; tardan en irse cuando para) y al cruzar un charco (en los badenes y a trozos cuando hay mucha agua) la
  estela de agua salta más alta y más abierta. La estela es bruma que gira, se estira y se deshilacha al envejecer,
  con un chorro bajo detrás de cada rueda trasera; más densa con más agua y más velocidad, y sin pasar del blanco
  apagado para que el resplandor no la convierta en luz.
- **Lluvia de noche** (calidad 2 y 3): bajo los focos más cercanos se ve el cono de luz con las gotas cayendo, y los
  halos de las farolas crecen. A las cámaras de tele (*Tele*, *Seguir*, *Pit-lane*, *Grúa* y *Helicóptero*) también
  les caen algunas gotas en el objetivo.
- La cámara *Tele* corta sola al coche que hace un trompo, se sale o se estrella.
- **Rótulos de tele** sobre el 3D (se apagan en Ajustes): al acabar una vuelta de clasificación, sus tres sectores
  frente a los de la pole (morado, más rápido; verde, a menos de una décima); «Récord del circuito» si alguien baja de
  la pole de referencia; batallas (dos coches a menos de 0,5 s en meta tres vueltas seguidas, con los huecos; como
  mucho una cada 4 vueltas, salvo las de tus pilotos); los neumáticos de los cinco primeros cada 10 vueltas, y la
  radio de tus pilotos unos segundos.
- Con coche de seguridad, el coche (plateado, con la barra de luces encendida) va delante del líder y entra por el
  pit-lane en su última vuelta. Con coche de seguridad o VSC los bordes de toda la pista se marcan en amarillo. Tras un
  percance solo se marca el tramo afectado y los comisarios agitan la bandera amarilla, o la roja si hay bandera roja.
- Los bloqueos y trompos dejan huellas de goma, la hierba deja surcos y al volver de la grava queda gravilla en el
  asfalto. Todo se borra poco a poco.
- En la parada, los mecánicos salen corriendo del garaje, trabajan (las pistolas, agachados) y vuelven. Sobre el morro
  hay un pórtico con una pértiga sobre el coche de la que cuelgan las mangueras de las cuatro pistolas, y un semáforo
  con visera y tres ópticas con su halo: rojo mientras trabajan, ámbar un instante y verde para soltar el coche.
- En libres y clasificación los coches se ven dentro de su garaje, sobre caballetes y con las mantas puestas, y entran y
  salen por el pit-lane. Los que abandonan por avería vuelven al garaje.
- Tras un accidente quedan restos en la pista, llegan los comisarios y una grúa levanta el coche y lo deja detrás de la
  barrera.
- En la parrilla, las cinco luces del pórtico se encienden de una en una y se apagan al darse la salida.
- En las gradas los aficionados agitan banderas. De lejos el público es un tono apagado.
- Con el botón ↺ (en 3D, tras un trompo, una salida o un accidente) se vuelve a ver a cámara lenta desde el borde de la
  pista; la sesión se para mientras tanto.
- Al terminar, un comisario agita la bandera a cuadros sobre el muro, los coches dan la vuelta de honor despacio (los tres
  primeros con el puño en alto) y entran a su garaje.
- Saltan chispas de debajo de los coches en las rectas rápidas y en los cambios de rasante, sobre todo de noche.
- **Hitos icónicos por circuito (`src/ui/landmarks.ts`):** los 24 circuitos muestran dos elementos reconocibles (Noria de Suzuka, Torre COTA, The Sphere en Las Vegas, Marina Bay Sands y Singapore Flyer, Flame Towers y Torre de la Doncella en Bakú, Hard Rock Stadium en Miami, Foro Sol en México, Biosphère en Montreal, Toro de Spielberg, Casino de Montecarlo, Hotel W en Yas Marina, etc.) con siluetas procedurales ligeras que se sustituyen automáticamente bajo demanda por modelos `.glb` (Draco + WebP 512 px, <300 KB) registrados en `public/assets/landmarks/manifest.json` (pipeline listo para GPU en `scripts/colab_genera_hitos.ipynb` y `scripts/optimiza_hito_glb.py`).
- **Estructuras singulares del trazado:** Mónaco cuenta con su túnel cubierto tras Portier (pared maciza hacia la ladera, columnata abierta hacia el mar, doble fila de luces interiores y ensanchado automático en la vista general); Suzuka tiene su puente del cruce en «8» con tablero de hormigón, pilares a los lados del paso inferior y barandillas; y Zandvoort (Hugenholtzbocht y Arie Luyendykbocht) y Madrid (*La Monumental*) inclinan la pista, escapatorias, barreras, coches y cámara a bordo con peralte real.
- A bordo y desde el alerón trasero hay una ligera micro-vibración según velocidad, frenada y paso por pianos (se desactiva con movimiento reducido del sistema); con lluvia, las gotas se quedan en la cámara y se escurren, y con las vueltas y cada salida se ensucia.
- El flap superior del alerón trasero se abre al activar DRS o Modo Adelantamiento, y la luz trasera distingue el parpadeo rápido de recarga ERS de la luz de lluvia. Las barandillas y celosías proyectan sombras caladas y los charcos del asfalto mojado reflejan el cielo y el sol.
- Un alerón tocado se ve descolgado, y en el cambio de morro se quita y se pone.
- Si la carrera se ve en 3D, se hacen fotos (cámara de tele) de los adelantamientos, tus paradas y los percances, y salen
  en el resumen («La carrera en imágenes»). Se guardan con la partida (hasta 10 por carrera) y se vuelven a ver al abrir
  esa carrera desde el calendario; sin IndexedDB no caben y solo duran hasta esa pantalla.
- En Singapur y Baréin hay torres de focos a lo largo de la pista, y con el asfalto mojado cada foco se refleja como
  una estela.

En las salidas paradas, la simulación enciende los cinco semáforos de uno en uno y arranca la carrera al apagarlos; esa
espera no cuenta en el tiempo de carrera y no cambia ningún resultado.

En «Crea tu equipo» se elige también la librea (dibujo, segundo color y tres patrocinadores de las 16 marcas inventadas),
con el coche en 3D girando al lado. Y el escudo, vectorial e inventado: cinco formas (clásico, redondo, hexágono, punta y rombo)
y seis motivos (banda, cuartelado, cheurón, franja, cuadros y estrella) con los dos colores del equipo y las iniciales del
nombre (sin «de», «la»…). Si no se toca, la forma y el motivo salen del nombre. Se ve en la lista de partidas, en la
cabecera de la temporada, en el panel del equipo y en el mundial de constructores. Los equipos reales no llevan logo:
sus colores y su nombre.

Posiciones, paradas, compuestos, percances, banderas, coche de seguridad, lluvia, nubes, hora y agua en pista (con el
carril seco al secarse) salen de la simulación. La altitud, la anchura y el lado de los boxes salen de los datos
de cada circuito (`relieve`, `ancho`, `boxes.lado`), que genera `python3 scripts/relieve.py`. La
trazada, el cabeceo de los coches, las escapatorias, los árboles, los edificios, las libreas y cómo se ve cada
parada y cada percance son solo dibujo.

## Sonido

Todo generado al vuelo con Web Audio, sin archivos de audio (`src/ui/audio.ts`). Solo interfaz: no cambia la
simulación. El sonido empieza al tocar la velocidad, el 3D o la salida (los navegadores no dejan sonar nada antes de
un toque) y se calla en pausa, al salir de la sesión y con la app en segundo plano. En Ajustes: sonido sí/no y
volumen general, de motores, de ambiente y de radio, y las voces de la radio y de Lobato.

- **Motores:** hasta 6 coches a la vez, los más cercanos a la cámara en 3D (en la vista general y en 2D, el coche
  seguido y los que tiene cerca en pista). Cada uno con tres osciladores en armónicos de las explosiones del V6
  (régimen según la velocidad y una caja de 8 marchas, con su caída al subir de marcha), un paso bajo que se abre con
  el acelerador y algo de ruido de escape. Volumen por distancia, panorama a izquierda y derecha y Doppler simple.
  Petardeo al soltar el acelerador. A bordo, solo el propio coche, más fuerte y con más graves. A ×4 y ×8, menos
  coches y más bajos; por encima de ×8, sin motores.
- **Ambiente:** público según las gradas que haya cerca (en 2D, fijo y bajo), que se levanta con los adelantamientos,
  la salida y la bandera a cuadros; lluvia según la que cae y viento según el que sopla.
- **Efectos:** las pistolas de la parada al quitar y al apretar las ruedas (en 2D, al entrar a boxes uno de tus
  pilotos), un pitido por cada semáforo que se enciende y medio segundo de silencio antes del rugido de la salida, y
  golpe seco y crujido en los accidentes.
- **Radio del equipo:** cada mensaje de radio de tus pilotos y del ingeniero suena con su clic y su ruido (también con
  la sesión en pausa, que muchos la paran), bajando el resto mientras dura. Con «Voz en la radio» (Ajustes), los
  importantes se leen en voz alta con la voz en español del dispositivo (si no tiene, sin voz), como mucho uno cada
  8 s; con «Voz de Lobato», sus comentarios, con otra voz.

## Tests

```bash
npm test             # tipos (tsc) y todos los tests: ~3 min con 4 núcleos
npm run test:rapido  # solo los rápidos (~1 s)
```

- `tests/unidad.test.ts`: que la simulación es determinista, el túnel de viento (paquetes malos, reparto, reserva,
  medida), el programa de libres con paquete y el orden de los coches de 2026.
- `tests/banco-*.test.ts` (en paralelo): dos carreras en seco por circuito en Mónaco, Monza, Hungaroring,
  Silverstone, Spa, Suzuka, Las Vegas y Baréin (parrilla por ritmo, como `scripts/auditoria/rapida.ts`). Los
  adelantamientos de cada uno, ±35 % de su calibración; nadie descalificado; entre 0,9 y 2 paradas por coche; como
  mucho 12 doblados; al menos 12 coches en meta. Con el umbral viejo de Mónaco (2,2) el test falla: 5 adelantamientos
  por carrera.
- Si un cambio mueve los adelantamientos a propósito, se recalibra el circuito y se actualiza su referencia en el
  fichero del banco (`pass`, de `rapida.ts 1-2 <circuito>`).
- `tests/temporada.test.ts`: el modo temporada a lo largo de 4 temporadas, con equipo real (8 equipos × 5 semillas)
  y con «crea tu equipo» (5 equipos al azar dentro del techo), con las carreras por ritmo (unos segundos): nada que
  no debería pasar (pilotos o dorsales repetidos, libres que también corren, contratos vencidos, puntos que no
  cuadran, valores sin sentido), años seguidos, misma semilla = misma partida, presupuesto según los objetivos,
  aviso y despido de la directiva, tu equipo y tu equipo técnico entre temporadas, edades, pilotos nuevos, hueco
  entre coches, objetivos según el coche, moral, sprints sorteados desde 2027 y renovaciones.
- `tests/temporada-real-*.test.ts` (en paralelo): lo mismo con la simulación entera (libres, clasificación, sprint y
  carrera) en dos temporadas de dos carreras, con equipo real y con equipo propio.
- El jugador automático de esos tests es `tests/partida.ts`: lleva la partida como la interfaz (presupuesto, túnel
  de viento, test de pretemporada, fines de semana simulados, unidades de potencia, sanciones, moral, directiva,
  cambios a mitad de temporada e invierno). Para partidas largas con la simulación entera, una por proceso:

```bash
npm run partidas -- williams 3 4 --salida=partidas/williams-3.json   # equipo, semilla, temporadas (~25 min)
npm run partidas -- propio 1 4 --sin-test --salida=partidas/propio-1.json
npm run partidas:informe -- partidas informe.md                       # resumen de todas en Markdown
```

  Opciones: `--rapida` (carreras por ritmo), `--sin-test` (salta el test de pretemporada), `--sin-desarrollo` (no
  pide piezas), `--completo` (calendario de 24) y `--rondas=N` (solo las N primeras carreras).

## Simular sin interfaz

```bash
npx tsx scripts/finde.ts silverstone 42 --resumen   # fin de semana completo
npx tsx scripts/carrera.ts silverstone 6             # varias carreras en seco: adelantamientos, trenes y curva de ventaja
npx tsx scripts/calibra.ts monza --escribe           # calibra el umbral de adelantamiento de un circuito
npx tsx scripts/realismo.ts --carreras=8             # banco de realismo: coches de seguridad, abandonos, quién gana, sanciones…
npx tsx scripts/pista.ts spa                         # análisis del circuito
```

`realismo.ts` corre clasificación y carrera en todos los circuitos (o los que se le digan) y compara cada cifra con un
margen de referencia (aproximado, de las temporadas 2022–2025): carreras con coche de seguridad, virtual o bandera roja,
abandonos, toques, sanciones, cuántas gana el de la pole, margen del ganador, diferencia del 1.º al 10.º, paradas y
adelantamientos frente al objetivo de cada circuito. Con `--json=a.json` guarda las cifras y con `--antes=a.json` las
enseña al lado de las nuevas; `--clima` corre con el tiempo de cada semilla en vez de en seco, y `--rapido` se salta la
clasificación.

`scripts/auditoria/` (ver su [LEEME](scripts/auditoria/LEEME.md)) juega fines de semana completos en lote, también con
lluvia, y mide lo que `realismo.ts` no mira: ritmo de carrera y de libres frente a la pole, evolución de la
clasificación, degradación por compuesto, regularidad, doblados y uso de cada compuesto. Las conclusiones de la
auditoría de noviembre de 2026 están en [docs/AUDITORIA-SIMULACION.md](docs/AUDITORIA-SIMULACION.md).

## Fuentes

- Trazados: [TUMFTM racetrack-database](https://github.com/TUMFTM/racetrack-database), licencia LGPL-3.0 (copia en `data/circuitos/LICENCIA-TRAZADOS-TUM.txt`); Mónaco, Marina Bay, Melbourne, Miami, Madrid, Bakú, Las Vegas, Lusail y Yas Marina de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), licencia MIT (copia en `data/circuitos/LICENCIA-TRAZADOS-BACINGER.txt`). Melbourne y Yas Marina, de bacinger porque los de TUM son de antes de sus reformas (2022 y 2021). Los circuitos del calendario completo los crea `python3 scripts/nuevos.py` (después, `scripts/relieve.py` y, en Bakú y Las Vegas, `scripts/entorno.py`).
- Calendario completo de 2026: [Planet F1: se cancelan Baréin y Arabia Saudí](https://www.planetf1.com/news/bahrain-saudi-arabian-f1-2026-cancelled), [GPFans: el GP de Baréin vuelve en Sepang](https://www.gpfans.com/en/f1-news/1088263/f1-bahrain-grand-prix-confirmed-2026-return-malaysia-sepang/).
- Poles 2026 del calendario completo: [Wikipedia: GP de Australia](https://en.wikipedia.org/wiki/2026_Australian_Grand_Prix), [FIA: clasificación de China](https://www.fia.com/sites/default/files/2026_02_chn_f1_q0_timing_qualifyingsessionprovisionalclassification_v01.pdf), [formula1.com: pole de Miami](https://www.formula1.com/en/latest/article/antonelli-storms-to-miami-grand-prix-pole-ahead-of-verstappen-and-leclerc.RV6Gs6Sku3GUiB4V4hki5), [FIA: pole de Canadá](https://www.fia.com/news/f1-late-surge-earns-russell-pole-canadian-gp-ahead-antonelli-and-norris), [FIA: clasificación de Barcelona](https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_final_qualifying_classification.pdf), [formula1.com: pole de Austria](https://formula1.com/en/latest/article/russell-beats-leclerc-and-hamilton-to-austrian-gp-pole-after-dramatic-late-verstappen-crash.6oiA7Tyo3B89DFJNLWtG8P), [FIA: pole de Hungría](https://admin.fia.com/news/f1-norris-snatches-hungarian-grand-prix-pole-just-0012s-ahead-hamilton), [FIA: pole de Países Bajos](https://api.fia.com/news/f1-norris-claims-pole-dutch-grand-prix-ahead-russell-and-antonelli), [McLaren: pole de Madrid](https://www.mclaren.com/racing/formula-1/2026/spanish-grand-prix/qualifying-report/), [formula1.com: pole de Azerbaiyán](https://www.formula1.com/en/latest/article/russell-charges-to-pole-position-as-antonelli-suffers-shock-exit-in-qualifying-for-azerbaijan-gp.6vFe7216mR8JZuWE4QIB4w), [formula1.com: pole de Estados Unidos](https://www.formula1.com/en/latest/article/antonelli-seizes-pole-position-ahead-of-verstappen-in-qualifying-at-the-united-states-gp.4xdH4w09GhNDOJdknowRAk), [Planet F1: clasificación de México](https://www.planetf1.com/news/f1-results-mexico-city-grand-prix-2026-qualifying). Las Vegas, Catar y Abu Dabi aún no se han corrido: su pole es la anterior (2025; en Las Vegas, la seca de 2024) más lo que han perdido de mediana los coches de 2026 (×1,027).
- Circuitos del calendario completo: clima (medias aproximadas del mes), pérdida en boxes, horarios, carga aerodinámica, abrasividad y adelantamientos por carrera son estimaciones propias (en Madrid, con lo poco que se adelantó en 2026: [GPBlog](https://www.gpblog.com/en/general/damning-madring-stat-exposes-madrid-gps-major-racing-failure)); lo dice el campo «fuente» de cada dato.
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
- Altitud de los circuitos y del terreno de Mónaco y Singapur (mar, puertos, ladera, altura de las torres): Mapzen/AWS Terrain Tiles (teselas «terrarium»), con el trazado situado sobre el mapa mediante bacinger/f1-circuits.
- Texturas PBR de superficie (asfalto, hierba, grava, hormigón, fachada) y entornos HDRI: [Poly Haven](https://polyhaven.com/) (licencia CC0, detalle en `public/assets/LICENCIA-POLYHAVEN-CC0.txt`).
- Banderas de los países en SVG: [flag-icons](https://github.com/lipis/flag-icons) (licencia MIT, copia en `public/assets/LICENCIA-FLAG-ICONS-MIT.txt`).
- Modelo 3D del monoplaza (`public/assets/models/f1.glb` y su versión ligera `f1_lo.glb`): [F1 2026 concept (polygon model)](https://sketchfab.com/3d-models/f1-2026-concept-polygon-model-ea3bde709b1e4dc9b0ec8557d106ed42) de [Qvist_designs](https://sketchfab.com/Qvist_Designs), licencia [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (adaptado: retiradas las ruedas estáticas para usar las ruedas animadas del juego, simplificado a ≤ 14.000 triángulos (≤ 3.800 en la versión ligera) y comprimido con Draco mediante `scripts/prepara_coche_glb.py`).
- Modelo 3D del coche de seguridad (`public/assets/models/safety.glb` y su versión ligera `safety_lo.glb`): [Mercedes Amg Gt Bs Safety Car](https://sketchfab.com/3d-models/mercedes-amg-gt-bs-safety-car-8fda6fc1fc4741b78890d3b548b2d990) de [DR1KING100K](https://sketchfab.com/DR1KING100K), licencia [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (adaptado con `scripts/prepara_safety_glb.py`: sin interior, matrículas ni insignias de la marca, simplificado a 30.000 triángulos (6.000 en la versión ligera), con las posiciones cuantizadas y coloreado por el juego).
- Modelos 3D de entorno (`public/assets/models/tree_*.glb`, `crew_*.glb`, `yacht.glb`), licencia [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (adaptados con `scripts/prepara_entorno_glb.py`, detalle en `public/assets/LICENCIA-MODELOS-SKETCHFAB.txt`): [Low Poly Forest Tree Pack](https://sketchfab.com/3d-models/low-poly-forest-tree-pack-5ff5a51e74324845a4e4905f182dfb2b) de 99.Miles, [Pine Trees Pack | PS1 Low Poly](https://sketchfab.com/3d-models/pine-trees-pack-ps1-low-poly-347d7f6122af4bf684f752df2dd0eb5a) de Vova Truestory, [Arabic Palmtree](https://sketchfab.com/3d-models/arabic-palmtree-d76f0654b92d4cf994b528555525219b) de gelmi.com.br, [Race Car Driver - Low Poly](https://sketchfab.com/3d-models/race-car-driver-low-poly-0fedfae53537473ba2ee3d9b722e0c66) de tomkart y [Hinckley T44 FB Model](https://sketchfab.com/3d-models/hinckley-t44-fb-model-1f4362d864424b7eb26bb429f6ef8f81) de mosak.
