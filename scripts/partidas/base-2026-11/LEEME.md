# Partidas de referencia, noviembre de 2026

Generarlas costó ~3 h de cálculo con 4 núcleos. Se guardan aquí para poder analizarlas más adelante sin volver a
correrlas. Contienen **14 partidas de 4 temporadas (2026–2029) con la simulación entera**:

- libres, clasificación, sprint y carrera de cada fin de semana;
- test de pretemporada de 8 h;
- calendario corto de 9 carreras.

Las ha jugado el jugador automático de `tests/partida.ts`. El resumen está en `informe.md` y las conclusiones en
[docs/PRUEBAS-TEMPORADA.md](../../../docs/PRUEBAS-TEMPORADA.md).

| Fichero | Modo | Semilla | Notas |
|---|---|---|---|
| `mclaren-1`, `ferrari-2`, `williams-3`, `haas-4`, `cadillac-5` | equipo real | 1–5 | |
| `propio-1` … `propio-5` | crea tu equipo | 1–5 | todas con motor Ferrari (el sorteo de entonces de `randomSpec`) |
| `propio-6`, `propio-8`, `propio-9`, `propio-10` | crea tu equipo | 6, 8, 9, 10 | motores Mercedes, Red Bull Ford, Audi y Honda |

Cada `.json` es un `CareerResult` (ver `tests/partida.ts`), con estos campos:

- `opts`: equipo, semilla, temporadas y, en «crea tu equipo», lo fichado (`spec`).
- `problems`: lo que no debería pasar, según las comprobaciones de entonces.
- `seasons[]`: un `SeasonLog` por temporada:
  - presupuesto, piezas y paquetes aerodinámicos;
  - objetivos y aviso;
  - nivel de cada coche al empezar y al acabar (`levels0` y `levelsEnd`, con `carLevel`);
  - campeones y constructores;
  - tus pilotos (edad, valoración y moral);
  - cambios a mitad de temporada y noticias del invierno;
  - parrilla, edades, unidades de potencia y techo de gasto;
  - `races[]`: un `RaceLog` por carrera (ganador, pole, tus pilotos con parrilla y puesto, abandonos y motivos,
    coche de seguridad, virtual, bandera roja, adelantamientos y tiempo de cálculo).

El `.log` de cada una es lo que fue contando (una línea por carrera).

## Con qué código

- **El juego (`src/`)** es el del commit `b4681aa`, sin cambios durante las pruebas. Por tanto, tiene los tres fallos
  que se arreglaron después (ver [docs/PRUEBAS-TEMPORADA.md](../../../docs/PRUEBAS-TEMPORADA.md)):
  - un lesionado al acabar el año pierde su asiento;
  - en «crea tu equipo», tu lesionado vuelve a correr con su equipo de antes;
  - los jóvenes de la F2 inventados pueden repetir dorsal.
- **El jugador automático** tuvo algunos retoques de las comprobaciones entre unas partidas y otras, sin efecto en
  cómo se juega. Por eso los `problems` no son comparables entre ficheros:
  - límite de edad;
  - lesionados que pierden el asiento (solo en las cuatro últimas);
  - orden de llegada.
- **`wetRace`** (carrera mojada) solo está en las cuatro últimas. `wet` es «alguna sesión del fin de semana mojada».

## Repetir o ampliar

```bash
npm run partidas -- ferrari 2 4 --salida=partidas/ferrari-2.json   # misma semilla y mismo código → misma partida
npm run partidas:informe -- scripts/partidas/base-2026-11 informe.md
```

Con el código de ahora, la misma semilla ya no da la misma partida en cuanto alguien se lesiona en las últimas
carreras: se arregló el asiento de los lesionados.
