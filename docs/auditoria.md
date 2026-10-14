# Auditoría del juego (14 de octubre de 2026)

12 capítulos · 120 pisos · 6.766 monedas · 57 gemas · **252 minutos** de juego para un autopiloto
perfecto (una persona tardará entre el doble y el triple).

Medido con `python -m scripts.levelkit.report` (lo que se puede medir sin jugar) cruzado con
`auto-run.log` (lo que saca el autopiloto al jugar los 120 pisos). Los 120 pasan con TODAS las
monedas y entre el 91 % y el 100 % de limo.

## 1. Tamaño y ritmo

| cap | tema | filas | s/piso | min | monedas | limo bot | nota | objetivo |
|---|---|---|---|---|---|---|---|---|
| 1 | piedra | 67 | 54 | 8,9 | 285 | 100 % | 35 | 26 |
| 2 | piedra | 82 | 77 | 12,8 | 333 | 96 % | 54 | 40 |
| 3 | piedra | 91 | 80 | 13,4 | 344 | 99 % | 68 | 58 |
| 4 | arena | 110 | 111 | 18,5 | 450 | 97 % | 74 | 60 |
| 5 | arena | 110 | 108 | 18,0 | 433 | 96 % | 79 | 72 |
| 6 | arena | 124 | 131 | 21,8 | 468 | 97 % | 83 | 76 |
| 7 | hielo | 142 | 155 | 25,8 | 612 | 97 % | 86 | 80 |
| 8 | hielo | 169 | 150 | 25,0 | 783 | 97 % | 86 | 84 |
| 9 | hielo | 174 | 150 | 25,1 | 782 | 97 % | 84 | 86 |
| 10 | neón | 180 | 166 | 27,8 | 773 | 98 % | 83 | 86 |
| 11 | neón | 160 | 165 | 27,6 | 753 | 97 % | 83 | 86 |
| 12 | neón | 165 | 166 | 27,7 | 750 | 97 % | 84 | 88 |

**El ritmo se para en el capítulo 7.** Sube bien hasta ahí (54 → 155 s por piso) y luego se queda
plano: 155 / 150 / 150 / 166 / 165 / 166. Los seis últimos capítulos duran lo mismo. No es malo
en sí —los pisos no deben crecer sin parar— pero significa que de la mitad para adelante el juego
solo puede crecer en exigencia, y ahí es donde hay que apretar.

**Cinco saltos bruscos dentro de un capítulo** (más de 45 s de un piso al siguiente, en orden
de juego):

| capítulo | salto | ¿vale? |
|---|---|---|
| 3 | piso 9 → 10: 64 s → 131 s | sí, es el remate del capítulo |
| 4 | piso 5 → 6: 65 s → 138 s | **no**, el doble de piso a mitad de capítulo |
| 5 | piso 8 → 9: 74 s → 126 s | justo antes del final, pasa |
| 11 | piso 1 → 2: 141 s → 194 s | **no**, es el segundo piso del capítulo |
| 12 | piso 4 → 5: 156 s → 208 s | **no**, y el 5 era el piso más largo del juego |

## 2. La tercera estrella (el porcentaje de limo)

Las estrellas son tres: llegar al cofre, todas las monedas y conservar el `keepPct` del piso. El
limo **no** es una barra de vida: perderlo no mata, solo cuesta la estrella.

Margen del autopiloto (limo que conserva menos el listón del piso):

| | |
|---|---|
| mínimo | **+11** (`c12-torres-caidas`, 95 % con listón 84) |
| mediana | **+22** |
| máximo | **+50** |
| pisos con margen > 25 (estrella casi regalada) | **33 de 120** |

Margen medio por capítulo: 1:+28 · 2:+26 · 3:+37 · 4:+23 · 5:+30 · 6:+21 · 7:+23 · 8:+23 · 9:+21 ·
10:+19 · 11:+17 · 12:+15.

Va en la dirección buena (se estrecha hacia el final) pero **la primera mitad regala la tercera
estrella**, y el capítulo 3 es el más blando de todos (+37). Un jugador normal pierde más limo que
el autopiloto, así que el margen no debería pasar de +15 ó +20 en ningún sitio.

Los pisos que más limo le cuestan al bot (y por tanto los más duros para una persona):
`c9-vias-del-nucleo` 91 % · `c7-tablas-heladas` 93 % · `c8-puertas-de-escarcha` 93 %.

## 3. Lo que se enseña

| capítulos | pistas (`tips`) |
|---|---|
| 1-5 (50 pisos) | **136** |
| 6-12 (70 pisos) | **12** |

De la mitad para adelante el juego **no explica nada**: una sola pista en el piso que estrena la
espuma de jabón, la ventisca, la placa de peso, las vías con forma y los cilindros. Y encima son
justo las mecánicas más raras de adivinar (la placa cuenta los limitos APOYADOS, el cilindro
empuja hacia donde empujas tú).

## 4. El vocabulario se agota en el capítulo 4

Estreno de cada familia de mecánica, en orden de juego:

* **capítulo 1**: pinchos, puertas, rampas, saltos, picos, fuego, aceite, plantas, hielo, viento, jabón
* **capítulo 2**: raíles, agujeros
* **capítulo 3**: grietas
* **capítulo 4**: balancines, disco, hondonada, cañón, frío
* **capítulo 11**: cilindros

Entre el 5 y el 10 **no se estrena ni una familia nueva**: lo que hay son variantes (la ventisca es
viento, la placa es una puerta, el bucle y la espiral son raíl). Ocho capítulos recombinando lo
mismo es la razón de fondo de que las notas se queden planas en 83-86.

## 5. Economía

* **Monedas**: 6.766 en total, 26,8 por minuto, repartidas casi igual por minuto en todo el juego.
  Por capítulo: 285 → 783 (capítulo 8, el más rico) → 750.
* **Gemas**: 57. Tres por capítulo del 1 al 5, **seis o siete del 6 al 12**.

Eso rompe el precio de los colores de gema, que es `GEMS_PER_KIND = 9` para los cuatro tipos:

| color | capítulos | gemas que hay | para desbloquear |
|---|---|---|---|
| rubí | 1-3 | **9** | 9 (hacen falta todas) |
| zafiro | 4-6 | 11 | 9 |
| esmeralda | 7-9 | **18** | 9 (sobra la mitad) |
| diamante | 10-12 | **19** | 9 (sobra la mitad) |

El rubí pide ser perfecto y el diamante se saca jugando a medias. O se bajan las gemas de los
capítulos 6-12 a tres por capítulo, o el precio deja de ser 9 para todos.

## 6. Capítulo 1: es el que más se juega y el más vacío

Las cinco peores notas del juego son suyas (26, 30, 32, 33, 33) y lo que las hunde es medible:

* **relleno 0,66-0,68**: dos tercios del suelo del piso no tienen nada encima.
* **variedad 3-5 familias** (el resto del juego anda por 9-12).
* **peligro 0,02**: el recorrido casi no pasa cerca de nada.

Que un tutorial sea fácil está bien; que sea un pasillo vacío, no. Es el primer minuto del juego.

## 7. Assets y carga

| | |
|---|---|
| `dist` completo | 13 MB |
| `assets.glb` | **4,2 MB** (170 k triángulos, sin texturas dentro) |
| JS | 1,5 MB |
| texturas | por tema; de salida solo piedra y hielo, los demás al entrar en sus pisos |

El `.glb` es lo primero que descarga el jugador y ya bajó de 7,5 a 4,2 MB. Si hiciera falta más,
el siguiente paso es comprimirlo (Draco) y llevarlo a ~1,5 MB, a cambio de cargar el descodificador.

## 8. Deuda conocida

* **El ascensor de dos plantas (`Level.lift()`) no se usa**: la vagoneta se lleva solo a los limitos
  que están encima y el resto se queda en un cuarto sellado (23 % de limo en la prueba). Las plantas
  en sí SÍ se usan: 18 pisos de los capítulos 2 al 5 tienen planta de abajo por los agujeros.
* **Los capítulos 9 al 12 se quedan por debajo de su objetivo** de nota (84 / 83 / 83 / 84 contra
  86 / 86 / 86 / 88). Como el techo de tamaño es intencionado, lo que tiene que subir es variedad,
  combos y decisiones, no filas.

## 9. Lista de pulido, por orden

1. **Pistas en los capítulos 6-12.** Una por mecánica nueva no llega: la placa de peso y el cilindro
   necesitan explicarse donde se estrenan, y la ventisca y las vías con forma, un recordatorio.
2. **Apretar la tercera estrella en los capítulos 1-5** (margen +23 a +37). Bajar el listón de regalo
   sin tocar los pisos: es un número por piso.
3. **Rellenar el capítulo 1** (relleno 0,67, variedad 3-5). Es el primer minuto de juego.
4. **Cuadrar las gemas** con `GEMS_PER_KIND`: o tres por capítulo del 6 al 12, o precio por tipo.
5. **Partir el salto de `c4-railes-y-pozos`** (65 s → 137 s a mitad de capítulo).
6. **Una mecánica nueva para la segunda mitad.** Es lo único que mueve de verdad las notas planas de
   los capítulos 8-12, y lo que hace que el jugador sienta que el juego sigue creciendo.
7. **El ascensor**, si se quiere recuperar: hace falta una plataforma que suba a los 80 limitos.

---

# Lo arreglado el 14 de octubre

| punto de la lista | qué se hizo |
|---|---|
| 1. pistas en 6-12 | +10 pistas: el hielo que resbala, el borde que se lleva al limo, la placa que cuenta los limitos APOYADOS (en el 9 y recordada en el 10), la racha, la espiral que marea y el cilindro (recordado en el 11 y en el 12) |
| 2. tercera estrella | listón nuevo por piso: **15 a 20 puntos por debajo de lo que saca el autopiloto en ese piso concreto** (20 en el tutorial, 17 en la arena, 15 de la mitad para el final). Antes era una escalera fija por capítulo que no sabía si el piso era duro o blando |
| 3. capítulo 1 | 52 monedas sembradas en las filas que no tenían nada, encima del camino de la ruta. **Relleno 0,67 → 0,57**, monedas por piso 28,5 → 33,7. De las 71 que se sembraron, 19 cayeron donde el limo no llega a pisar (la ruta son puntos sueltos y el limo no va en línea recta entre ellos): esas se quitaron |
| 4. gemas | 3 por capítulo (4 en el 6): rubí 9, zafiro 9, esmeralda 9, diamante 9, que es justo lo que pide `GEMS_PER_KIND`. De 57 gemas a 36. La gema no da estrella: es coleccionable y puntuación aparte |
| 5. saltos | fuera la sección de relleno de los tres pisos más largos: **c11 piso 2 194→185 s, c12 piso 5 208→173 s, c12 piso 8 198→170 s**. El piso 8 del 12 además repetía casi clavada la lista del piso 5 y ahora lleva ventisca y pasillo de hielo |
| 6. mecánica nueva para la segunda mitad | pendiente: es lo único que mueve las notas planas de 83-86 |
| 7. ascensor | pendiente: hace falta una plataforma que suba a los 80 limitos |

## El ritmo de cada capítulo (segunda tanda)

Los capítulos 4 y 5 no se tocaron casilla a casilla: **se reordenaron los pisos por duración**,
dejando fijo el que enseña (lleva las pistas de la mecánica nueva) y el remate del capítulo.

| capítulo | antes | ahora | salto mayor |
|---|---|---|---|
| 4 | 108 · 80 · 116 · 76 · **65 · 138** · 145 · 110 · 137 · 134 | 120 · 66 · 81 · 79 · 122 · 116 · 131 · 138 · 145 · 111 | +73 → **+43** |
| 5 | 111 · 90 · 113 · 100 · 127 · 96 · 120 · **74 · 126** · 125 | 111 · 73 · 112 · 100 · 131 · 98 · 121 · 89 · 126 · 125 | +52 → **+39** |

Y **ningún piso pasa ya de 180 s**: los que se pasaban pierden su sección de relleno — c9 piso 9
185 → 167 s, c10 piso 6 **202 → 181 s** (era el más largo del juego), c10 piso 9 191 → 179 s, c11
piso 2 194 → 165 s y c11 piso 8 202 → 172 s. Solo queda uno al filo: `c10-almacen`, 181 s.

Queda **un solo salto** por encima de 45 s en todo el juego, el del capítulo 3 (piso 9 → 10, +67),
y ese se queda: es el remate del capítulo.

**Aviso sobre las medidas**: el autopiloto no da el mismo resultado exacto en cada pasada. En los
pisos justos la diferencia llega a 6-10 puntos de limo (`c6-torres-de-arena` dio 88 %, 94 % y 98 %
en tres pasadas seguidas). Para decidir si un piso está mal hay que verlo fallar dos veces.

**Lo que NO se ha tocado del capítulo 1, a propósito**: su nota sigue siendo la más baja del juego
(26-48) y eso está bien. Lo que la hunde es variedad 3-5 familias y peligro 0,02-0,12, o sea, que
es un tutorial. Subirle la nota sería hacerlo difícil. Lo que sí era un defecto —que estuviera
vacío— está arreglado.

Todo lo de arriba está comprobado con el autopiloto: los 120 pisos siguen pasando con todas las
monedas.
