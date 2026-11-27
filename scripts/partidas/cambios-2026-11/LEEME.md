# Partidas con los cambios de noviembre de 2026

Son 4 partidas de 4 temporadas (2026–2029) con la simulación entera y el código del commit `0333b53`. Tienen las
mismas semillas que sus pares de `base-2026-11`, así que se pueden comparar con ellas. Ese commit incluye:

- sin directiva ni objetivos;
- pilotos que no empeoran tan jóvenes;
- un invierno con coche nuevo que pesa mucho más (`winterConcept`).

| Fichero | Modo | Semilla |
|---|---|---|
| `williams-3`, `ferrari-2` | equipo real | 3, 2 |
| `propio-1`, `propio-8` | crea tu equipo | 1, 8 |

Las cuatro, 0 problemas. Frente a `base-2026-11` (`python3 scripts/partidas/analiza.py <carpeta>`):

| | `base-2026-11` | Esta carpeta |
|---|---|---|
| Nivel del coche al acabar un año frente al del siguiente (correlación) | 0,96 | 0,88 |
| Puestos que se mueve un coche en invierno | 0,44 | 1,26 |
| Cambio frente a la media en invierno (desviación) | 0,15 | 0,45 |

El hueco entre el mejor y el peor coche se queda entre 2,6 y 3,6.

Con equipo real, el orden cambia de verdad:

- Red Bull pasa del 2.º coche al 7,5.º de media en 2029.
- Cadillac, del 10.º al 6,5.º.
- Racing Bulls, del 7,5.º en 2027 al 3.º en 2029.

Coches nuevos de la IA en las noticias: 17 grandes aciertos y 8 fallidos, de unos 130. Del tuyo: 2 grandes aciertos y
1 fallido. En «crea tu equipo» #1, Pourchaire es campeón en 2029 con el equipo propio.

El formato es el de `base-2026-11` (ver su LEEME). Estos JSON ya no tienen `objectives` ni `aviso`, y llevan
`expectedPos` (lo que la moral espera de tu coche) y `wetRace`.
