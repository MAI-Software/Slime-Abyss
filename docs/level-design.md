# Cómo se hacen los pisos de Slime Abyss

Manual de trabajo para montar niveles. Todo lo que hay aquí viene de tandas anteriores: cada
regla está porque algo se rompió antes. El kit que automatiza esto es `scripts/levelkit/`.

## 1. De qué está hecho un piso

- El ASCII vive en `scripts/author-levels.mjs`; `node scripts/author-levels.mjs` lo convierte en
  los `.json` de `src/level/campaign/`. **El generador escribe los ficheros uno a uno y si una
  fila no mide lo que el mapa revienta a medias**: mirar siempre su salida sin filtrar.
- En el ASCII un **dígito es la altura** del suelo (dígito × 0.5), no "suelo genérico".
- `map:` es la **planta baja**; las de `stories` van hacia arriba, separadas 4 de altura.
- La fila 0 del mapa es la de **arriba** (donde está el tesoro) y la última la de abajo, donde
  sale el limo. El limo recorre el piso de abajo arriba.
- Cada piso lleva su ruta de autopiloto en `src/dev-routes.ts`. Sin ruta no hay prueba, y sin
  prueba el piso no está terminado.

## 2. Reglas de medida

| Cosa | Medida | Por qué |
|---|---|---|
| Paso estrecho | **3 casillas** | con 1 o 2 el limo no cabe y se encalla |
| Sala | 7 de ancho, 4 filas | más ancha se ve vacía; las filas de en medio se cierran por los extremos |
| Escalón que sube | 1 dígito (0.5) | más alto hace falta rampa; 4 de caída atraviesan la losa |
| Hueco de ascensor | 3×3 libre alrededor de la estación | el radio de la espiral es fijo (1.45) |
| Aterrizaje de trampolines | 5 de ancho, pinchos en los extremos | el centro es el único premio |
| Hondonada | cruz: agujero en el centro, hundido a los lados | así se puede rodear pegado al muro |
| Caída libre | máximo 3 de altura | con 4 el limo atraviesa la losa de abajo |

## 3. Piezas y cuándo usarlas

`scripts/levelkit/pieces.py` tiene una función por pieza. Todas devuelven sus filas **en orden
de recorrido** y las marcas con las que el kit escribe la ruta.

- `start_room` — sala de salida con la P y dos monedas.
- `neck(door=...)` — paso de 3; con puerta si el nivel declara `latch`.
- `room(left=, right=, wedge=)` — sala con monedas y adornos pegados a los muros.
- `loop(left=, right=)` — dos carriles que se juntan arriba: hay que subir por uno y bajar por
  el otro para llevarse las cuatro monedas.
- `gauntlet` — fila de trampolines, hueco al vacío y aterrizaje castigado.
- `pit` — hondonada con agujero al vacío.
- `bubble_tower` — jabón, ventilador de techo y repisa dos alturas más arriba.
- `rail_puzzle` — dos pozos de raíl con interruptores encadenados y dos puertas.
- `blizzard` — pista de hielo con dos rachas de viento metidas en los muros, una por lado, y las
  monedas al lado contrario del empujón. Detrás del ventilador SIEMPRE un muro: si se deja el
  vacío, la racha va tirando trozos de limo por el borde.
- `switch_gate` — dos ramales sin comunicación (moneda en cada uno), el interruptor A al fondo
  del izquierdo y detrás de su puerta el interruptor B, que abre la salida. Gasta los dos
  canales del piso, así que no se junta con `rail_puzzle`.
- `weight_gate(need=12)` — placa de cinco casillas que solo baja con el limo entero encima.
  **La placa cuenta los limitos que TOCAN el suelo sobre ella, no los que hay**: el limo entero
  apoya 13-16 (la capa de abajo) y un cuarto de limo apoya 6-7, así que pide 12. Hecho bola
  apoya menos todavía, de modo que aquí se llega SIN apretar. Usa un canal y el nivel sale con
  `need: { A: 12 }`.
- `loop_rail` — la vía con forma: estación abajo, `@` (bucle vertical) y `%` (espiral de dos
  vueltas, marea) por el medio y estación arriba. Las casillas con forma NO pueden ser punta de
  la vía, así que siempre van con un `=` antes y otro después.
- **Las tablas (`seesaw_bridge`) van de REMATE, nunca como tramo con paso.** Puestas en medio
  del recorrido el limo se para encima, la tabla vuelca y se va un cuarto de la bola: c9f7
  alternaba entre 100 % y 69 % hasta que se sacaron del camino principal.
- `room(cliff=True)` — la misma sala pero sin muros laterales: una terraza colgada del abismo.
  Las monedas se quedan a dos casillas del borde; pegadas al borde el limo asoma media bola y
  se deja los trozos de fuera (probado: bajó al 66 % en c8f1).
- `treasure_room(gem=/relic=)` — sala final; el secreto va en un callejón, nunca de paso.

## 4. Reglas de diseño (las que rompen pisos si se saltan)

**Espacio.** Una sala de 7 con dos monedas y nada más se ve desangelada. Las filas vacías se
cierran por los extremos (quedan alcobas) salvo:
- la fila de **entrada** de una sala: ahí está el paso y se tapia el camino;
- cerca de roca agrietada, hielo, trampolines u hondonada: ahí hace falta sitio para maniobrar.

**Mecánicas.** Cada capítulo estrena una y sigue usando las anteriores. Nunca meter una mecánica
nueva en el primer piso del capítulo sin una pista (`tips`).

**Secretos.** La gema o el coleccionable van al final de un rodeo de 3 casillas o más; si el
camino principal pasa a su lado no es un secreto. `check.py` lo mide contra la ruta.

**Raíles.**
- A una estación se llega **parado** (BOARD_SPEED) y apretado, o solo viaja un trozo.
- Estación en medio de un pasillo = el limo se sube solo; van en un rincón.
- Después de bajarse, el limo queda marcado 3 s: el interruptor de una isla tiene que estar a
  **dos casillas** de la estación, y la ruta tiene que **esperar 3 s en el interruptor** antes de
  volver. La marca se quita por trozo y solo cuando ese trozo está a más de 1.4 de la estación:
  si el limo vuelve antes, se queda plantado encima sin montarse (así se colgaban c7f1 y c7f4).
- En la ruta la estación se toma con **`board`**, no con `to`: `board` suelta el mando en cuanto
  monta. Con `to` el empuje seguía activo, al bajarse en la otra punta lo volvía a montar y el
  limo hacía el viaje de vuelta (ida y vuelta infinita).
- Las vías se dibujan con casillas seguidas y el juego pone los codos; no hacen falta curvas
  a mano.

**Ventiladores.** El viento se corta con cualquier muro: el ventilador va **metido en el hueco
del muro**, no delante de él. El de techo (`A`) solo levanta a la burbuja y va pegado a la repisa.

**Agujeros.** `H` cae a la salida `U` más cercana que esté más abajo; sin `U` cae a la planta
de abajo. Un `H` en la planta alta sin nada debajo no traga.

**Puertas.** El interruptor solo se queda pisado si el NIVEL declara `latch: { A: true }`. La
puerta va en el paso de **más arriba** y su interruptor en la sala de **más abajo**: el limo lo
pisa antes de toparse con ella. Solo hay dos canales (A y B) por piso.

**El cofre** solo lo abre el limo principal; un trozo suelto que lo roce no cuenta.

## 5. La ruta del autopiloto

El bot **no busca camino**: va en línea recta al punto que le toca. Por eso:
- antes de subir por un pozo hay que llevarlo al pie (misma x, fila de la sala);
- los trampolines se cruzan **sin pararse encima**: un punto una fila antes y luego directo al
  aterrizaje con `squeeze`, y después **`settle`**: el trampolín lanza al limo 30 de alto y los
  pasos siguientes se darían en el aire (se quedaban sin coger las monedas de la sala de arriba);
- a las monedas de una sala se va **antes** que al interruptor (el limo llega desde abajo);
- tras un cañón o una caída conviene `{ squeeze: true, wait: 2 }` para que se junte;
- los puntos que caigan dentro de un hueco hay que borrarlos: uno olvidado manda al limo al vacío.

Umbral de la prueba: **todas las monedas y más del 90 % del limo** en los 50 pisos.

## 6. Cómo se prueba (siempre, sin saltarse pasos)

```bash
node scripts/author-levels.mjs          # mirar la salida entera, no filtrarla
npm run build
```

En el navegador (`preview_start` slime-abyss, puerto 5204):

```js
await __auto.level(c, k)   // un piso: c es 0-indexado, all(0) es el capítulo 1
await __auto.all(c)        // un capítulo entero (~1 min)
await __auto.all()         // los 50 pisos (~5 min)
__auto.trace(c, k)         // paso a paso: dice dónde se queda o dónde pierde limo
```

Después de regenerar los JSON hay que **recargar la página**: si no, el piloto prueba los niveles
viejos y los resultados salen con el nombre de otro nivel.

Un piso terminado: `OK`, todas las monedas, limo > 90 %, y dos vueltas seguidas sin fallo (hay
variación entre corridas; una sola no demuestra nada).

## 7. Tamaños por capítulo

Media de filas por piso (después de la última tanda): 46 / 59 / 71 / 73 / 78 / 120 / 145 / 170.
Del capítulo 6 en adelante los tramos se montan con pasos de UNA fila, salas de cuatro y una
sala de cada dos colgada del vacío (`cliff`), más un bucle de más por piso: el bucle es un rodeo
y los rodeos son lo que el medidor cuenta como decisiones. Un piso corto se nota enseguida: si el recorrido no tiene al menos cuatro
momentos distintos (sala con monedas, mecánica del capítulo, rodeo con secreto y remate), está
corto aunque tenga filas.

## 8. La nota de cada piso (para saber si es soso)

`python -m scripts.levelkit.score` mide los 60 pisos y saca una nota de 0 a 100. No sustituye
a jugarlos, pero dice sin discutir cuál está corto o vacío.

| Medida | Qué mira | Peso |
|---|---|---|
| tamaño | filas del mapa (tope 150) | 15 |
| largo | metros reales del recorrido del autopiloto (tope 400) | 10 |
| variedad | familias de mecánica distintas (tope 12) | 20 |
| combos | veces que dos familias DISTINTAS se tocan a 3 casillas (tope 25) | 20 |
| peligro | parte del recorrido pegada a algo que hace daño o al vacío (tope 0.30) | 15 |
| decisiones | puertas con interruptor, estaciones y rodeos de la ruta (tope 12) | 15 |
| relleno | tramos seguidos de suelo sin nada: resta | 5 |

**Los topes se recalibraron** cuando los capítulos 5 al 8 se quedaron todos entre 80 y 84: con
los topes viejos un piso grande los reventaba y la nota dejaba de distinguir. El peligro se mide
contra 0.30 y no contra 0.75 porque más exposición no se puede pedir: la prueba exige conservar
más del 90 % del limo y los pinchos van comiendo. Objetivos por capítulo con los topes nuevos:
26 / 40 / 58 / 60 / 72 / 76 / 80 / 84.

Avisos automáticos: `corto`, `poca variedad`, `sin encadenar`, `sin riesgo`, `tramo muerto`
(ocho filas seguidas sin nada) y `flojo para el capítulo` (por debajo del objetivo del capítulo,
que sube: 34 / 46 / 56 / 64 / 70 / 76). Al final avisa si un capítulo puntúa menos que el anterior.

**Lo que enseñó la primera medición.** El capítulo 6 recién hecho era largo pero sacaba 50: mucho
metro y ninguna mezcla. Subirlo a 74 fue meter las mecánicas unas junto a otras y poner el peligro
en la fila de las monedas, no al final del pasillo.

**El adorno peligroso pegado a la moneda va sangrando.** La roca agrietada o los pinchos en la
casilla de al lado de una moneda se llevan 1-2 limitos por sala, porque el borde de la bola los
pisa al recoger. En un piso de doce salas eso es un 10 % de limo: en los pisos que ya castigan
con hondonadas, trampolines o cornisas, el adorno tiene que ser inofensivo (bloque de hielo o
planta). Así se arreglaron c6-corrientes-del-oasis (84 % → 99 %) y c10-horno (88 % → 99 %).

**El techo de dificultad lo pone el autopiloto.** Pinchos y fuego van comiendo limo: en un piso
largo, seis tramos con pinchos dejan al bot en el 80 % y la prueba exige más del 90 %. Por eso la
dificultad del final del juego se sube con ESTRUCTURA (tablas sobre el vacío, discos giratorios,
puzles de vías, rodeos) y no con desgaste. Los pinchos, uno por sala y a un solo lado.
