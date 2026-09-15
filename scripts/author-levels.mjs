/*
  Genera los niveles JSON a partir de mapas ASCII legibles.
  Uso: node scripts/author-levels.mjs

  Mapa: dígito = suelo con esa altura (×0.5) · '.' vacío · '#' muro (se apoya en el suelo más alto que toca)
  Letras (P, T, C, K, Y, F, X, I, J, S, D...): toman la altura de la capa `h` si existe;
  si no, la altura más repetida entre sus vecinos de suelo.
  Norma de diseño: suelos lisos y caminos largos; los cambios de altura solo hacia ABAJO
  en el sentido de avance (de la salida P hacia el tesoro T). Nada de escalones hacia arriba.
*/
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/level/campaign');

const PRACTICE = {
  file: '00-sendero-largo.json',
  id: 'sendero-largo', name: 'Sendero largo (prueba)', practice: true, count: 80,
  map: [
    '###############',
    '#000000T000000#',
    '#0000000000000#',
    '#########00####',
    '........#00#...',
    '........#00#...',
    '........#22#...',
    '..#######22#...',
    '..#22222222#...',
    '..#22222222#...',
    '..#22#######...',
    '..#22#.........',
    '..#22#.........',
    '..#44#.........',
    '..#44#######...',
    '..#44444444#...',
    '..#44444444#...',
    '..#######44#...',
    '........#44#...',
    '........#66#...',
    '........#66#...',
    '..#######66#...',
    '..#66666666#...',
    '..#66666666#...',
    '..#66#######...',
    '..#66#.........',
    '..#66#.........',
    '..#66########..',
    '..#6666666666#.',
    '..#66666666P6#.',
    '..###########..',
  ],
  tips: [
    { z: 29, text: 'Nivel de prueba: sin trampas, no se pierde limo' },
    { z: 24, text: 'Bajar un desnivel no hace daño' },
    { z: 15, text: 'Pasillos largos: prueba giros suaves con el joystick' },
  ],
};

const CHAPTER1 = [
  {
    file: 'chapter1/01-c1-primeros-pasos.json',
    id: 'c1-primeros-pasos', name: 'Primeros pasos', count: 80, keepPct: 0.8,
    map: [
      '###############',
      '#000000T000000#',
      '#0C0000000000C#',
      '#0000000000000#',
      '######000######',
      '.....#000#.....',
      '.....#0C0#.....',
      '.....#000#.....',
      '.....#222#.....',
      '.....#222#.....',
      '...#22222222#..',
      '...#2C222222#..',
      '...#2222.222#..',
      '...#222222C2#..',
      '...#22222222#..',
      '...######22##..',
      '........#22#...',
      '........#22#...',
      '........#C2#...',
      '........#44#...',
      '..#######44#...',
      '..#44444444#...',
      '..#4C444.44#...',
      '..#44444444#...',
      '..#44#######...',
      '..#44#.........',
      '..#44#.........',
      '...44..........',
      '...C4..........',
      '...44..........',
      '..#66#.........',
      '..#66########..',
      '..#66666C666#..',
      '..#666666666#..',
      '..#######666#..',
      '..#######666#..',
      '........#888#..',
      '........#8P8#..',
      '........#####..',
    ],
    tips: [
      { z: 37, text: 'Desliza al limo con el joystick hacia el tesoro' },
      { z: 35.5, text: 'Bajar un desnivel no hace daño' },
      { z: 29.8, text: 'Tramo sin muros: lo que asoma por el borde, se cae' },
      { z: 23, text: 'Rodea los agujeros' },
      { z: 13.5, text: 'Recoge todas las monedas para ganar una estrella' },
    ],
  },
  {
    file: 'chapter1/02-c1-filo-de-cuchilla.json',
    id: 'c1-filo-de-cuchilla', name: 'Filo de cuchilla', count: 80, keepPct: 0.7,
    // secreto: el interruptor verde pide 14 limitos juntos y abre el rincón de la gema
    need: { B: 14 }, latch: { B: true },
    map: [
      '###############',
      '#G0#000T000000#',
      '#00#00000000C0#',
      '#dd#0000000000#',
      '#00000Y0000000#',
      '#0s000000000C0#',
      '######000######',
      '.....#000#.....',
      '.....#222#.....',
      '....#22222#....',
      '....#22#22#....',
      '....#2C#22#....',
      '....#22#2.#....',
      '....#22#22#....',
      '....#.2#C2#....',
      '....#22#22#....',
      '....#22#22#....',
      '....#22K22#....',
      '....#22222#....',
      '....#44444#....',
      '....#44C44#....',
      '....#44444#....',
      '....#44P44#....',
      '....#######....',
    ],
    tips: [
      { z: 21.5, text: 'Las cuchillas parten al limo en dos' },
      { z: 16.5, text: 'Las dos mitades se mueven a la vez' },
      { z: 9.5, text: 'Al tocarse, los trozos vuelven a unirse; también puedes mantener el botón de apretar' },
      { z: 5.5, text: 'Los pinchos también dividen' },
    ],
  },
  {
    file: 'chapter1/03-c1-pasillo-de-fuego.json',
    id: 'c1-pasillo-de-fuego', name: 'Pasillo de fuego', count: 80, keepPct: 0.7,
    // Solo fuego, de menos a más y siempre entre muros:
    // 1) sala con braseros fijos apartados del centro (el camino de 3 casillas queda libre)
    // 2) pasillo con dos filas de llamas intermitentes y tres filas seguras entre ellas
    map: [
      '....#######....',
      '....#C0T0C#....',
      '....#00000#....',
      '....##000##....',
      '.....#XXX#.....',
      '.....#000#.....',
      '.....#000#.....',
      '.....#000#.....',
      '.....#XXX#.....',
      '.....#000#.....',
      '.....#0C0#.....',
      '..####000####..',
      '..#F0000000F#..',
      '..#000C0C000#..',
      '..#00F000F00#..',
      '..#000000000#..',
      '..####000####..',
      '.....#000#.....',
      '.....#0P0#.....',
      '.....#####.....',
    ],
    tips: [
      { z: 17.5, text: 'El fuego evapora el limo: rodea los braseros' },
      { z: 10.5, text: 'Estas llamas se apagan a ratos: cruza cuando se apaguen' },
      { z: 7.5, text: 'Espera en la zona segura entre llamas' },
    ],
  },
  {
    file: 'chapter1/04-c1-divide-y-venceras.json',
    id: 'c1-divide-y-venceras', name: 'Divide y vencerás', count: 80, keepPct: 0.75,
    // Todo llano y sin callejones: la cuchilla parte al limo en dos carriles.
    // Izquierda: S (A, mientras se pisa) justo delante de la puerta d, así esa mitad lo sigue pisando al avanzar.
    // Derecha: cruza D y pisa s (B, se queda abierto) al fondo de la sala, que abre d y reúne a las dos mitades.
    latch: { B: true },
    map: [
      '###########',
      '#T0000000s#',
      '#0C00000C0#',
      '###dd#DD###',
      '###SS#00###',
      '###00#00###',
      '###00#0C###',
      '###00#00###',
      '###00K00###',
      '###00000###',
      '###00C00###',
      '###00000###',
      '###00P00###',
      '###########',
    ],
    tips: [
      { z: 11.5, text: 'Deja una parte sobre el interruptor mientras la otra cruza la puerta' },
      { z: 3, text: 'Pisa el interruptor verde para abrir el paso a la otra mitad' },
    ],
  },
  {
    file: 'chapter1/05-c1-salto-al-abismo.json',
    id: 'c1-salto-al-abismo', name: 'Salto al abismo', count: 80, keepPct: 0.65,
    // S abre la salida con solo tocarlo; s (secreto) pide 12 limitos juntos y abre la sala de la gema
    need: { B: 12 }, latch: { A: true, B: true },
    map: [
      '..#########.....',
      '..#0C0T000#.....',
      '..#0000000#.....',
      '..####D####.....',
      '..#C00000C#####.',
      '..#XX000XXd00G#.',
      '..#0000000#####.',
      '..#s00S000#.....',
      '..#0000000#.....',
      '................',
      '................',
      '..#JJJJJJJ#.....',
      '..#0000000#.....',
      '..#00C0000#.....',
      '..#0000000#.....',
      '..#000P000#.....',
      '..#########.....',
    ],
    tips: [
      { z: 15, text: 'Las plataformas rosas te lanzan sobre el abismo' },
      { z: 8, text: 'Pisa el interruptor para abrir la salida' },
    ],
  },
  {
    file: 'chapter1/06-c1-aceite-y-chispas.json',
    id: 'c1-aceite-y-chispas', name: 'Aceite y chispas', count: 80, keepPct: 0.75,
    map: [
      '#############',
      '#0C000T000C0#',
      '#00000000000#',
      '#####WWW#####',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '..###000###..',
      '..#0000000#..',
      '..#00F0F00#..',
      '..#0000000#..',
      '..###000###..',
      '....#000#....',
      '....#0O0#....',
      '....#000#....',
      '....#0P0#....',
      '....#####....',
    ],
    tips: [
      { z: 15, text: 'Coge la botella: el limo se vuelve aceite' },
      { z: 10.5, text: 'Con aceite, el fuego no te evapora: te hace arder' },
      { z: 6.5, text: 'Ardiendo quemas las plantas que cierran el paso' },
    ],
  },
  {
    file: 'chapter1/07-c1-hielo-que-arde.json',
    id: 'c1-hielo-que-arde', name: 'Hielo que arde', count: 80, keepPct: 0.75,
    // Primero el suelo helado solo, en una pista cerrada y sin peligros; después el aceite y el fuego
    // (ya vistos en el piso 6) con una sola idea nueva: ardiendo se derriten los bloques de hielo.
    map: [
      '###########',
      '#000T0000C#',
      '#000000000#',
      '####ZZZ####',
      '...#000#...',
      '...#0C0#...',
      '...#000#...',
      '####ZZZ####',
      '#C00000000#',
      '#0F00000F0#',
      '#000000000#',
      '####000####',
      '...#0O0#...',
      '...#000#...',
      '.###000###.',
      '.#IIIIIII#.',
      '.#IICIIII#.',
      '.#IIIIIII#.',
      '.###000###.',
      '...#000#...',
      '...#0P0#...',
      '...#####...',
    ],
    tips: [
      { z: 18.5, text: 'El suelo helado resbala: frena con tiempo' },
      { z: 12.5, text: 'Las llamas duran poco: date prisa' },
      { z: 7.5, text: 'Ardiendo, derrites los bloques de hielo' },
    ],
  },
  {
    file: 'chapter1/08-c1-ventiladores.json',
    id: 'c1-ventiladores', name: 'Ventiladores', count: 80, keepPct: 0.6,
    // Tres ráfagas de menos a más. Las monedas marcan la mejor línea (capítulo 1: guiar, no castigar):
    // 1) viento contra un muro: no se puede caer; la moneda está justo donde te deja el viento
    // 2) viento hacia el vacío: monedas antes y después en el lado del ventilador, lejos del borde
    // 3) lo mismo desde el otro lado
    map: [
      '#############',
      '#00000T00000#',
      '#00C00000C00#',
      '#####000#####',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '....#00C#....',
      '....0000<....',
      '....#00C#....',
      '....#000#....',
      '....#000#....',
      '....#C00#....',
      '...>00000....',
      '....#C00#....',
      '....#000#....',
      '....#000#....',
      '...>000C#....',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '....#0P0#....',
      '....#####....',
    ],
    tips: [
      { z: 19.5, text: 'El viento empuja al limo; aquí el muro te frena' },
      { z: 15.5, text: 'Sin muro, el viento te tira al vacío: sigue las monedas y cruza deprisa' },
      { z: 10.5, text: 'Cruza por el lado del ventilador, lejos del borde' },
    ],
  },
  {
    file: 'chapter1/09-c1-corriente-helada.json',
    id: 'c1-corriente-helada', name: 'Corriente helada', count: 80, keepPct: 0.75,
    map: [
      '..#######..',
      '..#00T00#..',
      '..#C0000#..',
      '..#00000#..',
      '...........',
      '...........',
      '...........',
      '..#00000#..',
      '..#0^^^0#..',
      '..#C000C#..',
      '..#00Q00#..',
      '..#00000#..',
      '..#00P00#..',
      '..#######..',
    ],
    tips: [
      { z: 12, text: 'El aire frío congela al limo durante 30 segundos' },
      { z: 9.5, text: 'Congelado no se deshace: la corriente te lleva entero' },
      { z: 7.5, text: 'Ponte delante de los ventiladores' },
    ],
  },
  {
    file: 'chapter1/10-c1-gran-cripta.json',
    id: 'c1-gran-cripta', name: 'La gran cripta', count: 80, keepPct: 0.7,
    map: [
      '###############',
      '#0T0000000#00G#',
      '#00C000000Z000#',
      '######WWW######',
      '.....#000#.....',
      '.....#0F0#.....',
      '.....#000#.....',
      '.....#000#.....',
      '.....#0O0#.....',
      '.....#000#.....',
      '.....#000#.....',
      '.....#000#.....',
      '...............',
      '...............',
      '...............',
      '...............',
      '....#C0000#....',
      '....#00000#....',
      '....#0^^^0#....',
      '....#00000#....',
      '....#0Q0C0#....',
      '....#00000#....',
      '....#C0P00#....',
      '....#######....',
    ],
    tips: [
      { z: 21, text: 'Última prueba: usa todo lo que has aprendido' },
      { z: 9, text: 'Aceite, fuego... y a quemar las plantas' },
    ],
  },
];

/**
  Capítulo 2 · Las Raíces Colgantes (mismo decorado de rocas y plantas del abismo).
  Mecánicas nuevas: botón de apretar y raíles (R estación, = vía). Una idea nueva por piso y luego mezclas.
*/
const CHAPTER2 = [
  {
    file: 'chapter2/01-c2-todos-a-una.json',
    id: 'c2-todos-a-una', name: 'Todos a una', count: 80, keepPct: 0.75,
    // Botón de apretar: la cuchilla y los pinchos desperdigan el limo en una sala sin peligros.
    map: [
      '#############',
      '#00000T00000#',
      '#00C00000C00#',
      '#####000#####',
      '....#0C0#....',
      '..###000###..',
      '..#0Y000Y0#..',
      '..#000Y000#..',
      '..#0Y000Y0#..',
      '..#C00000C#..',
      '..###000###..',
      '....#000#....',
      '....#0K0#....',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '....#0P0#....',
      '....#####....',
    ],
    tips: [
      { z: 14, text: 'La cuchilla te parte en trozos' },
      { z: 11.5, text: 'Mantén pulsado el botón de apretar: los trozos se juntan poco a poco' },
      { z: 5, text: 'Aprieta antes de las salidas estrechas' },
    ],
  },
  {
    file: 'chapter2/02-c2-sobre-railes.json',
    id: 'c2-sobre-railes', name: 'Sobre raíles', count: 80, keepPct: 0.8,
    // Raíles: una vía recta y corta entre dos estaciones; no hay forma de caerse.
    map: [
      '...#######...',
      '...#0C0T0#...',
      '...#00000#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...#00000#...',
      '...#0C0C0#...',
      '...#00P00#...',
      '...#######...',
    ],
    tips: [
      { z: 10.5, text: 'Entra en la estación: el limo se hace bola y rueda por la vía' },
      { z: 2.8, text: 'Al llegar a la otra estación vuelves a ser limo' },
    ],
  },
  {
    file: 'chapter2/03-c2-curvas.json',
    id: 'c2-curvas', name: 'Curvas', count: 80, keepPct: 0.8,
    // Vías con curvas y dos trayectos seguidos con una isla en medio.
    map: [
      '#######........',
      '#0T0C0#........',
      '#00000#........',
      '###R###........',
      '...=...........',
      '...======......',
      '........=......',
      '........=......',
      '......##R##....',
      '......#222#....',
      '......#2C2#....',
      '......#222#....',
      '......#2C2#....',
      '......##R##....',
      '........=......',
      '........===....',
      '..........=....',
      '........##R##..',
      '........#444#..',
      '........#4P4#..',
      '........#####..',
    ],
    tips: [
      { z: 19, text: 'Las vías pueden girar: la bola las sigue sola' },
      { z: 12.5, text: 'Recoge las monedas y busca la siguiente estación' },
    ],
  },
  {
    file: 'chapter2/04-c2-cuesta-arriba.json',
    id: 'c2-cuesta-arriba', name: 'Cuesta arriba', count: 80, keepPct: 0.8,
    // Las vías suben: a pie solo se baja, en bola se sube.
    map: [
      '...#######...',
      '...#8C8T8#...',
      '...#88888#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...#44C44#...',
      '...#44444#...',
      '...#66666#...',
      '...#6C666#...',
      '...###R###...',
      '......=......',
      '......=......',
      '...###R###...',
      '...#00000#...',
      '...#0C0P0#...',
      '...#######...',
    ],
    tips: [
      { z: 17, text: 'Las vías también suben: son el único camino a lo alto' },
      { z: 9.5, text: 'Desde lo alto solo se baja: busca la siguiente estación' },
    ],
  },
  {
    file: 'chapter2/05-c2-todos-a-bordo.json',
    id: 'c2-todos-a-bordo', name: 'Todos a bordo', count: 80, keepPct: 0.75,
    // Apretar + raíles: solo sube el trozo que pisa la estación; los que se quedan pueden subir después.
    map: [
      '...#######...',
      '...#0C0T0#...',
      '...#00000#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...#00000#...',
      '...#0Y0Y0#...',
      '...#00K00#...',
      '...#C000C#...',
      '...#00000#...',
      '...#00P00#...',
      '...#######...',
    ],
    tips: [
      { z: 12.5, text: 'Solo sube a la bola el trozo que está en la estación' },
      { z: 9, text: 'Aprieta para juntar el limo antes de subir' },
    ],
  },
  {
    file: 'chapter2/06-c2-plantas-en-la-via.json',
    id: 'c2-plantas-en-la-via', name: 'Plantas en la vía', count: 80, keepPct: 0.75,
    // Aceite y fuego (capítulo 1) para despejar la entrada de una estación.
    map: [
      '...#######...',
      '...#0C0T0#...',
      '...#00000#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...###W###...',
      '...#00000#...',
      '...#F000F#...',
      '...#0C0C0#...',
      '...#00O00#...',
      '...#00P00#...',
      '...#######...',
    ],
    tips: [
      { z: 13, text: 'Coge el aceite y préndete en un brasero' },
      { z: 9.5, text: 'Ardiendo, quemas las plantas que tapan la estación' },
    ],
  },
  {
    file: 'chapter2/07-c2-salto-a-la-estacion.json',
    id: 'c2-salto-a-la-estacion', name: 'Salto a la estación', count: 80, keepPct: 0.5,
    // Plataformas de salto hasta una isla con estación que sube.
    map: [
      '...#######...',
      '...#8C8T8#...',
      '...#88888#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...#22222#...',
      '...#2C2C2#...',
      '.............',
      '.............',
      '...#JJJJJ#...',
      '...#22222#...',
      '...#22P22#...',
      '...#######...',
    ],
    tips: [
      { z: 14, text: 'Las plataformas te lanzan hasta la isla de la estación' },
      { z: 9.5, text: 'Junta el limo antes de subir: lo que se quede tendrá que subir después' },
    ],
  },
  {
    file: 'chapter2/08-c2-puente-de-viento.json',
    id: 'c2-puente-de-viento', name: 'Puente de viento', count: 80, keepPct: 0.7,
    // Dos caminos: puente con ventiladores o vía; las monedas llevan a la vía.
    map: [
      '#############',
      '#00000T00000#',
      '#0C0000000C0#',
      '###R#####0###',
      '...=.....0<..',
      '...=....>0...',
      '...=.....0<..',
      '...=.....0...',
      '###R#####0###',
      '#00000000000#',
      '#00C00000000#',
      '#00000P00000#',
      '#############',
    ],
    tips: [
      { z: 10.5, text: 'El puente tiene viento: la vía es el camino seguro' },
      { z: 8.8, text: 'En bola, el viento no te mueve' },
    ],
  },
  {
    file: 'chapter2/09-c2-bifurcacion.json',
    id: 'c2-bifurcacion', name: 'Bifurcación', count: 80, keepPct: 0.75,
    // Secreto: la vía de la izquierda lleva a un interruptor que pide peso (apretar) y a la gema; se vuelve en bola.
    need: { B: 14 }, latch: { B: true },
    map: [
      '#####...#######',
      '#G#s#...#00T00#',
      '#d00#...#00000#',
      '#00R#...###R###',
      '...=.......=...',
      '...=.......=...',
      '...=.......=...',
      '###R#######R###',
      '#0000000000000#',
      '#00C000P000C00#',
      '###############',
    ],
    tips: [
      { z: 8.5, text: 'Dos estaciones, dos destinos' },
      { z: 3.5, text: 'El interruptor verde pide peso: aprieta para juntar el limo encima' },
    ],
  },
  {
    file: 'chapter2/10-c2-gran-raiz.json',
    id: 'c2-gran-raiz', name: 'La gran raíz', count: 80, keepPct: 0.5,
    // Final: apretar tras la cuchilla, aceite, saltar, prenderse lejos del borde, quemar plantas y vía hacia lo alto.
    map: [
      '...#######.....',
      '...#8C8T8#.....',
      '...#88888#.....',
      '...###R###.....',
      '......=........',
      '......=........',
      '......=........',
      '...###R###.....',
      '...###W###.....',
      '...#F222F#.....',
      '...#22222#.....',
      '...#22222#.....',
      '...#2C2C2#.....',
      '...............',
      '...............',
      '...#JJJJJ#.....',
      '...#22O22#.....',
      '...#22222#.....',
      '...#2C2C2#.....',
      '...#22222#.....',
      '...#2Y2Y2#.....',
      '...#22K22#.....',
      '...#C222C#.....',
      '...#22P22#.....',
      '...#######.....',
    ],
    tips: [
      { z: 23, text: 'Última prueba del capítulo: usa todo lo aprendido' },
      { z: 19, text: 'Aprieta antes de saltar' },
      { z: 17, text: 'Coge el aceite y préndete al otro lado para quemar las plantas' },
    ],
  },
];

function build(def) {
  const d = def.map.length;
  const w = def.map[0].length;
  def.map.forEach((r, j) => { if (r.length !== w) throw new Error(`${def.id}: fila ${j} mide ${r.length}, no ${w}`); });
  const isDigit = (c) => c >= '0' && c <= '9';
  const tiles = [], heights = [];
  for (let j = 0; j < d; j++) {
    let t = '', h = '';
    for (let i = 0; i < w; i++) {
      const ch = def.map[j][i];
      if (ch === '.') { t += '.'; h += '0'; continue; }
      if (isDigit(ch)) { t += '0'; h += def.h ? def.h[j][i] : ch; continue; }
      t += ch;
      if (def.h) { h += def.h[j][i]; continue; }
      if (ch === '#') { h += '0'; continue; }
      const votes = {};
      for (let r = 1; r <= 2 && !Object.keys(votes).length; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const n = def.map[j + dj]?.[i + di];
          if (n && isDigit(n)) votes[n] = (votes[n] ?? 0) + 1;
        }
      }
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0];
      h += best ? best[0] : '0';
    }
    tiles.push(t); heights.push(h);
  }
  if (!def.h) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (tiles[j][i] !== '#') continue;
      let base = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const t = tiles[j + dj]?.[i + di];
        if (!t || t === '#' || t === '.') continue;
        base = Math.max(base, Number(heights[j + dj][i + di]));
      }
      heights[j] = heights[j].slice(0, i) + base + heights[j].slice(i + 1);
    }
  }
  checkNoStepsUp(def, tiles, heights);
  checkNoDeadEnds(def, tiles, heights);
  const { map, h, file, ...meta } = def;
  return { format: 1, ...meta, tiles, heights };
}

/**
  Avisa de zonas sin vuelta: casillas a las que se puede llegar desde la salida pero desde las que ya no
  se llega al tesoro (fosos, bajadas a callejones). El limo sube como mucho una losa de altura; las puertas
  cuentan como abiertas, las plataformas de salto alcanzan 6 casillas y las corrientes de aire 10.
*/
function checkNoDeadEnds(def, tiles, heights) {
  const H = tiles.length, W = tiles[0].length;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const at = (i, j) => (j >= 0 && j < H && i >= 0 && i < W ? tiles[j][i] : '.');
  const walk = (i, j) => at(i, j) !== '.' && at(i, j) !== '#' && at(i, j) !== '=';
  const top = (i, j) => Number(heights[j][i]);
  // estación → estación del otro extremo de su vía
  const partner = (i, j) => {
    let prev = [i, j];
    let cur = DIRS.map(([di, dj]) => [i + di, j + dj]).find(([a, b]) => at(a, b) === '=');
    for (let guard = 0; cur && guard < W * H; guard++) {
      if (at(...cur) === 'R') return cur;
      const nxt = DIRS.map(([di, dj]) => [cur[0] + di, cur[1] + dj])
        .find(([a, b]) => (a !== prev[0] || b !== prev[1]) && (at(a, b) === '=' || at(a, b) === 'R'));
      prev = cur;
      cur = nxt;
    }
    return null;
  };
  const WIND = { '^': [0, -1], v: [0, 1], '<': [-1, 0], '>': [1, 0] };
  const next = (i, j) => {
    const out = [];
    if (at(i, j) === 'R') { const other = partner(i, j); if (other) out.push(other); }
    const reach = at(i, j) === 'J' ? 6 : WIND[at(i, j)] || at(i, j) === 'Q' ? 10 : 1;
    const dirs = WIND[at(i, j)] ? [WIND[at(i, j)]] : DIRS;
    for (const [di, dj] of reach > 1 ? [...dirs, ...(dirs === DIRS ? [] : DIRS)] : DIRS) {
      for (let k = 1; k <= reach; k++) {
        const a = i + di * k, b = j + dj * k;
        if (walk(a, b) && top(a, b) <= top(i, j) + 1) out.push([a, b]);
      }
    }
    return out;
  };
  const reachable = (start) => {
    const seen = new Set([String(start)]);
    const queue = [start];
    while (queue.length) for (const n of next(...queue.shift())) if (!seen.has(String(n))) { seen.add(String(n)); queue.push(n); }
    return seen;
  };
  let P, T;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (at(i, j) === 'P') P = [i, j]; if (at(i, j) === 'T') T = [i, j]; }
  if (!P || !T) return;
  const fromStart = reachable(P);
  if (!fromStart.has(String(T))) console.warn(`  aviso ${def.id}: el tesoro no se alcanza desde la salida`);
  const stuck = [...fromStart].filter((k) => !reachable(k.split(',').map(Number)).has(String(T)));
  if (stuck.length) console.warn(`  aviso ${def.id}: zona sin vuelta en ${stuck.map((k) => `(${k})`).join(' ')}`);
}

/** Avisa si hay suelo contiguo que sube (el diseño pide solo bajadas). */
function checkNoStepsUp(def, tiles, heights) {
  if (def.h) return;
  // la vía no se pisa y las estaciones pueden estar a cualquier altura (la bola sube)
  const walk = (t) => t !== '.' && t !== '#' && t !== '=' && t !== 'R';
  for (let j = 0; j < tiles.length; j++) for (let i = 0; i < tiles[0].length; i++) {
    if (!walk(tiles[j][i])) continue;
    // hacia el tesoro se avanza a filas menores: la fila de arriba no puede ser más alta
    const up = tiles[j - 1]?.[i];
    if (up && walk(up) && Number(heights[j - 1][i]) > Number(heights[j][i])) {
      console.warn(`  aviso ${def.id}: sube en (${i}, ${j - 1})`);
    }
  }
}

function pretty(data) {
  return JSON.stringify(data, null, 2).replace(/\[\n\s+("[^"\n]*",?\n\s+)+"[^"\n]*"\n\s+\]/g, (m) =>
    m.replace(/\n\s+/g, '\n    ').replace(/\n    \]/, '\n  ]'));
}

mkdirSync(join(root, 'chapter1'), { recursive: true });
mkdirSync(join(root, 'chapter2'), { recursive: true });
for (const def of [PRACTICE, ...CHAPTER1, ...CHAPTER2]) {
  writeFileSync(join(root, def.file), pretty(build(def)) + '\n');
  console.log('ok', def.file);
}
