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

**Dos saltos bruscos dentro de un capítulo** (más de 50 s de un piso al siguiente):

* `c3-dos-puentes` 78 s → `c3-gran-grieta` 131 s. Es el piso 10, el remate del capítulo: vale.
* `c4-pozos-y-rampas` 65 s → `c4-railes-y-pozos` 137 s. **Esto no vale**: el doble de piso a mitad
  de capítulo, sin ser el final.

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
