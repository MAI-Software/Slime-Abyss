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
      '.....#uuu#.....',
      '.....#222#.....',
      '...#22222222#..',
      '...#2C222222#..',
      '...#2222.222#..',
      '...#222222C2#..',
      '...#22222222#..',
      '...######22##..',
      '........#22#...',
      '........#uu#...',
      '........#C3#...',
      '........#uu#...',
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
      { z: 18.5, text: 'Las rampas bajan suave' },
      { z: 13.5, text: 'Recoge todas las monedas para ganar una estrella' },
    ],
  },
  {
    file: 'chapter1/02-c1-filo-de-cuchilla.json',
    id: 'c1-filo-de-cuchilla', name: 'Filo de sierra', count: 80, keepPct: 0.7,
    // secreto: el interruptor verde pide 14 limitos juntos y abre el rincón de la gema
    need: { B: 14 }, latch: { B: true },
    map: [
      '###############',
      '#G0#000T000000#',
      '#00#00000000C0#',
      '#dd#0000000000#',
      '#0000000000000#',
      '#0s000000000C0#',
      '######000######',
      '.....#000#.....',
      '.....#222#.....',
      '....#22222#....',
      '....#22#22#....',
      '....#2C#22#....',
      '....#22#22#....',
      '....#22#22#....',
      '....#22#C2#....',
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
      '....#00T00#....',
      '....#00000#....',
      '....##000##....',
      '.....#XXX#.....',
      '.....#000#.....',
      '.....#0C0#.....',
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
      '#000C000C0#',
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
      '..#000T000#.....',
      '..#0000000#.....',
      '..####D####.....',
      '..#0000000#####.',
      '..#XX000XXd00G#.',
      '..#00C0C00#####.',
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
      '#00000T00000#',
      '#00000000000#',
      '#####WWW#####',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '..###000###..',
      '..#0000000#..',
      '..#00F0F00#..',
      '..#0C000C0#..',
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
      '#000T00000#',
      '#000000C00#',
      '####ZZZ####',
      '...#000#...',
      '...#0C0#...',
      '...#000#...',
      '####ZZZ####',
      '#0C0000000#',
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
      '#00000000000#',
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
      '..#00000#..',
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
      '#00000C000Z000#',
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
      '....#0C000#....',
      '....#00000#....',
      '....#0^^^0#....',
      '....#00000#....',
      '....#0Q0C0#....',
      '....#000C0#....',
      '....#00P00#....',
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
      '#00000000000#',
      '#####000#####',
      '....#0C0#....',
      '..###000###..',
      '..#0k000k0#..',
      '..#000k000#..',
      '..#0k000k0#..',
      '..#0C000C0#..',
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
      '...#######.......',
      '...#000T0#.......',
      '...#00000#.......',
      '...###R###.#####.',
      '......=....#8G8#.',
      '......=....#888#.',
      '......=....##R##.',
      '......=......=...',
      '...###R###...=...',
      '...#00000#...=...',
      '...#0C0C0R====...',
      '...#00P00#.......',
      '...#######.......',
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
      '#0T000#........',
      '#00000#........',
      '###R###........',
      '...=...........',
      '...===@==......',
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
      { z: 8.5, text: '¡Un bucle! La bola da la vuelta sola' },
    ],
  },
  {
    file: 'chapter2/04-c2-cuesta-arriba.json',
    id: 'c2-cuesta-arriba', name: 'Cuesta arriba', count: 80, keepPct: 0.8,
    // Las vías suben: a pie solo se baja, en bola se sube.
    map: [
      '...#######...',
      '...#888T8#...',
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
      '......%......',
      '...###R###...',
      '...#00000#...',
      '...#0C0P0#...',
      '...#######...',
    ],
    tips: [
      { z: 17, text: 'Las vías también suben: son el único camino a lo alto' },
      { z: 11.5, text: 'Tantas vueltas marean: espera a que se te pase antes de moverte' },
      { z: 9.5, text: 'Desde lo alto solo se baja: busca la siguiente estación' },
    ],
  },
  {
    file: 'chapter2/05-c2-todos-a-bordo.json',
    id: 'c2-todos-a-bordo', name: 'Todos a bordo', count: 80, keepPct: 0.75,
    // Apretar + raíles: solo sube el trozo que pisa la estación; los que se quedan pueden subir después.
    map: [
      '...#######...',
      '...#000T0#...',
      '...#00000#...',
      '...###R###...',
      '......=......',
      '......=......',
      '......=......',
      '...###R###...',
      '...#00000#...',
      '...#0k0k0#...',
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
      '...#000T0#...',
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
      '...#######....',
      '...#888T8#....',
      '...#88888#....',
      '...###R###....',
      '......=.......',
      '......=.......',
      '......=.......',
      '...###R#######',
      '...#22222#22G#',
      '...#2C2C22222#',
      '..............',
      '..............',
      '...#JJJJJ#JJJ#',
      '...#222222222#',
      '...#22P222222#',
      '...###########',
    ],
    tips: [
      { z: 14, text: 'Las plataformas te lanzan hasta la isla de la estación' },
      { z: 9.5, text: 'Junta el limo antes de subir: lo que se quede tendrá que subir después' },
    ],
  },
  {
    file: 'chapter2/08-c2-puente-de-viento.json',
    id: 'c2-puente-de-viento', name: 'Puente de viento', count: 80, keepPct: 0.7,
    // Dos caminos: puente con ventiladores o vía; las monedas llevan a la vía. Presenta la casilla de pinchos (flanquea el puente).
    map: [
      '#############',
      '#00000T00000#',
      '#0C000000000#',
      '###R#####0###',
      '...=.....0<..',
      '...=....>0...',
      '...=.....0<..',
      '...=.....0...',
      '###R#####0###',
      '#0000000Y0Y0#',
      '#00C00000000#',
      '#00000P00000#',
      '#############',
    ],
    tips: [
      { z: 11.2, text: 'Los pinchos pinchan el limo: no los pises' },
      { z: 9.8, text: 'El puente tiene viento: la vía es el camino seguro' },
      { z: 8.5, text: 'En bola, el viento no te mueve' },
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
      '...#888T8#.....',
      '...#88888#.....',
      '...###R###.....',
      '......=........',
      '......@........',
      '......=........',
      '...###R###.....',
      '...###W###.....',
      '...#F222F#.....',
      '...#22222#.....',
      '...#2C2C2#.....',
      '...#22222#.....',
      '...............',
      '...............',
      '...#JJJJJ#.....',
      '...#22O22#.....',
      '...#22222#.....',
      '...#2C2C2#.....',
      '...#22222#.....',
      '...#Y222Y#.....',
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

/**
  Capítulo 3 · Las Grietas Heladas (mismo decorado).
  Mecánicas nuevas: roca agrietada (B, se rompe al pasar) y hielo que se derrite bajo el limo en llamas.
  Lo que se rompe no vuelve: nada de lo que haya que cruzar dos veces es frágil.
*/
const CHAPTER3 = [
  {
    file: 'chapter3/01-c3-suelo-fragil.json',
    id: 'c3-suelo-fragil', name: 'Suelo frágil', count: 80, keepPct: 0.8,
    // Presenta la roca agrietada: dos franjas cortas dentro de salas con muros.
    map: [
      '#############',
      '#0C000T000C0#',
      '#00000000000#',
      '###0000000###',
      '..#BBBBBBB#..',
      '..#0000000###',
      '..#00C0C000G#',
      '..#0000000#B#',
      '..#BBBBBBB#B#',
      '..#000000000#',
      '..#000P000###',
      '..#########..',
    ],
    tips: [
      { z: 9, text: 'La roca agrietada se rompe al pisarla: no te pares encima' },
      { z: 5, text: 'Lo que se rompe no vuelve: cruza de una vez' },
    ],
  },
  {
    file: 'chapter3/02-c3-puente-quebradizo.json',
    id: 'c3-puente-quebradizo', name: 'Puente quebradizo', count: 80, keepPct: 0.6,
    // Puente agrietado sobre el vacío con dos giros.
    map: [
      '###########....',
      '#0T00000C0#....',
      '#000000000#....',
      '###BBB#####....',
      '...BBB.........',
      '...BBBBBBBB....',
      '...BBBBBBBB....',
      '...BBBBBBBB....',
      '........BBB....',
      '........BBB....',
      '......##BBB##..',
      '......#00C00#..',
      '......#00000#..',
      '......#00P00#..',
      '......#######..',
    ],
    tips: [
      { z: 12, text: 'Cruza sin pararte: cada losa aguanta poco' },
      { z: 6, text: 'Gira con suavidad en las esquinas' },
    ],
  },
  {
    file: 'chapter3/03-c3-hielo-fundido.json',
    id: 'c3-hielo-fundido', name: 'Hielo fundido', count: 80, keepPct: 0.75,
    // Presenta el hielo que se derrite: ardiendo, la franja de hielo cae tras pasar.
    map: [
      '#############',
      '#T00000000C0#',
      '#00000000000#',
      '####IIIII####',
      '...#00000#...',
      '...#00C00#...',
      '...#00000#...',
      '...##WWW##...',
      '...#00000#...',
      '...#00F00#...',
      '...#00000#...',
      '...#00O00#...',
      '...#00000#...',
      '...#00P00#...',
      '...#######...',
    ],
    tips: [
      { z: 11, text: 'Aceite y fuego: a arder otra vez' },
      { z: 5, text: 'Ardiendo, el suelo de hielo se derrite: crúzalo sin pararte' },
    ],
  },
  {
    file: 'chapter3/04-c3-pista-ardiente.json',
    id: 'c3-pista-ardiente', name: 'Pista ardiente', count: 80, keepPct: 0.7,
    // Puente de hielo sobre el vacío que se funde bajo el limo en llamas: resbala, así que se cruza de un tirón.
    map: [
      '###########..',
      '#0000T0000#..',
      '#000000000#..',
      '###00000###..',
      '....III......',
      '....III......',
      '....III......',
      '....III......',
      '...#000#.....',
      '...#0C0#.....',
      '####WWW######',
      '#000000000#G#',
      '#0000F0000W0#',
      '#000000000###',
      '###00O00###..',
      '..#00000#....',
      '..#00P00#....',
      '..#######....',
    ],
    tips: [
      { z: 14, text: 'Aceite y fuego para quemar la hiedra' },
      { z: 8.5, text: 'Ardiendo derrites el puente de hielo: crúzalo de un tirón' },
    ],
  },
  {
    file: 'chapter3/05-c3-grietas-entre-llamas.json',
    id: 'c3-grietas-entre-llamas', name: 'Grietas entre llamas', count: 80, keepPct: 0.65,
    // Llamas intermitentes y, justo detrás de las segundas, roca agrietada: se espera en suelo firme.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '###00000###',
      '....BBB....',
      '....BBB....',
      '....BBB....',
      '...#XXX#...',
      '...#000#...',
      '...#0C0#...',
      '...#000#...',
      '...#XXX#...',
      '...#000#...',
      '..##000##..',
      '..#0C0C0#..',
      '..#00P00#..',
      '..#######..',
    ],
    tips: [
      { z: 12.5, text: 'Espera en suelo firme a que se apaguen las llamas' },
      { z: 8, text: 'Detrás de las llamas la roca no aguanta: sigue sin parar' },
    ],
  },
  {
    file: 'chapter3/06-c3-dos-puentes.json',
    id: 'c3-dos-puentes', name: 'Dos puentes', count: 80, keepPct: 0.6,
    // La cuchilla parte al limo y cada mitad cruza su puente agrietado; se reúnen arriba.
    map: [
      '#############',
      '#00000T00000#',
      '#00000000000#',
      '###BBB#BBB###',
      '...BBB.BBB...',
      '...BBB.BBB...',
      '...BBB.BBB...',
      '..#000#000#..',
      '..#0C0#0C0#..',
      '..#000#000#..',
      '..#000K000#..',
      '..#000K000#..',
      '..#000P000#..',
      '..#########..',
    ],
    tips: [
      { z: 11, text: 'La cuchilla te divide: cada mitad cruza su puente' },
      { z: 2.5, text: 'Aprieta al otro lado para juntar el limo' },
    ],
  },
  {
    file: 'chapter3/07-c3-saltos-fragiles.json',
    id: 'c3-saltos-fragiles', name: 'Saltos frágiles', count: 80, keepPct: 0.6,
    // Plataformas de salto que aterrizan sobre roca agrietada; la siguiente plataforma está justo después.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '###00000###',
      '..#BBBBB#..',
      '..#BBBBB#..',
      '...........',
      '...........',
      '..#JJJJJ#..',
      '..#BBBBB#..',
      '..#BBBBB#..',
      '...........',
      '...........',
      '..#JJJJJ#..',
      '..#00000#..',
      '..#0C0C0#..',
      '..#00P00#..',
      '..#######..',
    ],
    tips: [
      { z: 14.5, text: 'Aterrizas sobre roca agrietada: sigue hacia la siguiente plataforma' },
      { z: 7.5, text: 'Salta otra vez sin pararte' },
    ],
  },
  {
    file: 'chapter3/08-c3-viento-y-grietas.json',
    id: 'c3-viento-y-grietas', name: 'Viento y grietas', count: 80, keepPct: 0.5,
    // Los ventiladores empujan contra el muro mientras la roca se rompe: el muro impide caer, la prisa evita hundirse.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '###00000###',
      '..>BBB#....',
      '...BBB#....',
      '..>BBB#....',
      '...BBB#....',
      '..>BBB#....',
      '..#000#....',
      '..#0C0#....',
      '..#000#....',
      '..#0P0#....',
      '..#####....',
    ],
    tips: [
      { z: 10.5, text: 'El viento te pega al muro mientras la roca se rompe' },
      { z: 6, text: 'No te detengas: el muro no se cae' },
    ],
  },
  {
    file: 'chapter3/09-c3-plaza-rota.json',
    id: 'c3-plaza-rota', name: 'Plaza rota', count: 80, keepPct: 0.55,
    // La cuchilla parte al limo justo antes de una plaza agrietada: hay que apretar mientras se avanza.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '####000####',
      '...#BBB#...',
      '..#BBBBB#..',
      '..#BBBBB#..',
      '..#BBBBB#..',
      '..##0K0##..',
      '...#000#...',
      '...#0C0#...',
      '...#000#...',
      '...#0P0#...',
      '...#####...',
    ],
    tips: [
      { z: 9.5, text: 'La cuchilla te parte justo antes de la roca rota' },
      { z: 6.5, text: 'Aprieta mientras avanzas: no hay tiempo para esperar' },
    ],
  },
  {
    file: 'chapter3/10-c3-gran-grieta.json',
    id: 'c3-gran-grieta', name: 'La gran grieta', count: 80, keepPct: 0.5,
    // Final: aceite y fuego, hiedra, puente de hielo que se funde, gema tras la hiedra, llamas, roca agrietada y vía.
    map: [
      '..#######....',
      '..#000T0#....',
      '..#00000#....',
      '..###R###....',
      '.....=.......',
      '.....@.......',
      '.....=.......',
      '..###R###....',
      '..#00000#....',
      '..#0C0C0#....',
      '..##BBB##....',
      '...#BBB#.....',
      '...#XXX#.....',
      '..##000######',
      '..#000000WG0#',
      '..#0C00000###',
      '..###III###..',
      '....#III#....',
      '....#III#....',
      '..###WWW###..',
      '..#0000000#..',
      '..#000F000#..',
      '..#0000000#..',
      '..###0O0###..',
      '....#000#....',
      '....#0P0#....',
      '....#####....',
    ],
    tips: [
      { z: 23, text: 'Última prueba del capítulo: usa todo lo aprendido' },
      { z: 16.5, text: 'En llamas, el hielo cede: no te pares' },
      { z: 11.5, text: 'Espera a que se apaguen las llamas antes de la roca agrietada' },
    ],
  },
];

/**
  Capítulo 4 · Las Arenas Hundidas (primer capítulo del desierto).
  Mecánicas nuevas, una por piso: rampas, caminos en diagonal, sierras, pozos (agujeros que bajan a otra sala)
  y después mezcladas con lo anterior. Más profundidad: se sube y se baja varias alturas.
*/
const CHAPTER4 = [
  {
    file: 'chapter4/01-c4-dunas.json',
    id: 'c4-dunas', name: 'Dunas', count: 80, keepPct: 0.85,
    // Rampas: bajar y volver a subir, con muros a los lados.
    map: [
      '###########',
      '#4444T4444#',
      '#444444444#',
      '###nnnnn###',
      '..#33333#..',
      '..#3C3C3#..',
      '..#33333#..',
      '..#nnnnn##.',
      '..#22222eG#',
      '..#uuuuu##.',
      '..#33333#..',
      '..#3C3P3#..',
      '..#######..',
    ],
    tips: [
      { z: 10, text: 'Las rampas bajan y suben: el limo las recorre solo' },
      { z: 4.5, text: 'Sube hasta el tesoro' },
    ],
  },
  {
    file: 'chapter4/02-c4-sendero-diagonal.json',
    id: 'c4-sendero-diagonal', name: 'Sendero diagonal', count: 80, keepPct: 0.75,
    // Un camino en diagonal sin muros: las medias casillas lo dejan liso.
    map: [
      '#############',
      '#0T000C000C0#',
      '#00000000000#',
      '.......m000q.',
      '......m000q..',
      '.....m0C0q...',
      '....m000q....',
      '...m0C0q.....',
      '..m000q......',
      '.m000q.......',
      '#00000#######',
      '#00P0000G#...',
      '##########...',
    ],
    tips: [
      { z: 10, text: 'El camino va en diagonal: inclina en esa dirección' },
      { z: 5, text: 'Sin muros: sigue las monedas' },
    ],
  },
  {
    file: 'chapter4/03-c4-sierras.json',
    id: 'c4-sierras', name: 'Sierras', count: 80, keepPct: 0.8,
    // Sierras rectas y diagonales en una sala cerrada: parten sin dañar.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '#000V0A000#',
      '#000000000#',
      '#0C00K00C0#',
      '#000000000#',
      '#0000P0000#',
      '###########',
    ],
    tips: [
      { z: 6.5, text: 'Las sierras giran y te parten, pero no te hacen daño' },
      { z: 3.5, text: 'Aprieta para volver a juntarte' },
    ],
  },
  {
    file: 'chapter4/04-c4-el-pozo.json',
    id: 'c4-el-pozo', name: 'El pozo', count: 80, keepPct: 0.85,
    // Presenta los agujeros: desde la sala alta se cae a la sala del tesoro, mucho más abajo.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '#000U00000#',
      '#000000000#',
      '###########',
      '#888888888#',
      '#88C8H8C88#',
      '#888888888#',
      '#8888P8888#',
      '###########',
    ],
    tips: [
      { z: 8.5, text: 'Métete por el agujero: caerás a la sala de abajo' },
    ],
  },
  {
    file: 'chapter4/05-c4-pozos-y-rampas.json',
    id: 'c4-pozos-y-rampas', name: 'Pozos y rampas', count: 80, keepPct: 0.8,
    // Se baja por el pozo y se vuelve a subir por rampas hasta lo alto.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '###nnnnn###',
      '..#nnnnn#..',
      '..#nnnnn#..',
      '..#nnnnn#..',
      '#000000000#',
      '#00U000C00#',
      '#000000000#',
      '###########',
      '#0000000H0#',
      '#00C000000#',
      '#0P0000000#',
      '###########',
    ],
    h: [
      '66666666666',
      '66666666666',
      '66666666666',
      '55555555555',
      '44444444444',
      '33333333333',
      '22222222222',
      '22222222222',
      '22222222222',
      '22222222222',
      '88888888888',
      '88888888888',
      '88888888888',
      '88888888888',
      '88888888888',
    ],
    tips: [
      { z: 12.5, text: 'Baja por el pozo' },
      { z: 7, text: 'Las rampas suben hasta el tesoro' },
    ],
  },
  {
    file: 'chapter4/06-c4-remolino.json',
    id: 'c4-remolino', name: 'Remolino', count: 80, keepPct: 0.8,
    // Presenta la plataforma giratoria: un remolino de arena en una sala cerrada. Marea, pero aquí no hay peligro.
    map: [
      '###########',
      '#0000T0000#',
      '#000000000#',
      '###00000###',
      '..#00000###',
      '..#000000G#',
      '..#00E00###',
      '..#00C00#..',
      '..#00000#..',
      '..#C000C#..',
      '..#00P00#..',
      '..#######..',
    ],
    tips: [
      { z: 9, text: 'El remolino de arena te hace dar vueltas' },
      { z: 4.5, text: 'Mareado cuesta moverse: espera a que se te pase' },
    ],
  },
  {
    file: 'chapter4/07-c4-canonazo.json',
    id: 'c4-canonazo', name: 'Cañonazo', count: 80, keepPct: 0.75,
    // Presenta el cañón: primero un disparo corto a una sala cerrada (líquido, se esparce poco) y después
    // uno largo sobre el vacío que solo sale bien congelado (el aire frío está al lado del cañón).
    map: [
      '#############',
      '#44444T44444#',
      '#44444444444#',
      '#4C4444444C4#',
      '#44444x44444#',
      '#44444444444#',
      '.............',
      '.............',
      '.............',
      '.............',
      '#############',
      '#22222222222#',
      '#2Q222222222#',
      '#22222x222N2#',
      '#222C222C222#',
      '#############',
      '.............',
      '#############',
      '#00000000000#',
      '#00000N00000#',
      '#00C00000C00#',
      '#00000P00000#',
      '#############',
    ],
    tips: [
      { z: 20, text: 'Métete en el cañón: te lanza por encima del vacío' },
      { z: 13.5, text: 'Cuanto más lejos dispara, más te esparces en el aire' },
      { z: 12, text: 'Congelado vuelas de una pieza y caes justo en su sitio' },
    ],
  },
  {
    file: 'chapter4/08-c4-fuego-del-desierto.json',
    id: 'c4-fuego-del-desierto', name: 'Fuego del desierto', count: 80, keepPct: 0.65,
    // Aceite y fuego, rampas arriba, una sierra y la hiedra que hay que quemar antes de que se apaguen las llamas.
    map: [
      '###########',
      '#4444T4444#',
      '#444444444#',
      '####WWW####',
      '...#444#...',
      '...#nnn#...',
      '...#333#...',
      '...#3K3#...',
      '...#333#...',
      '...#nnn#...',
      '#222222222#',
      '#2222F2222#',
      '#2222O2222#',
      '#2C22P22C2#',
      '###########',
    ],
    tips: [
      { z: 11.5, text: 'Aceite, fuego y a correr: las llamas no duran' },
      { z: 7.5, text: 'La sierra te parte: aprieta sin perder tiempo' },
    ],
  },
  {
    file: 'chapter4/09-c4-railes-y-pozos.json',
    id: 'c4-railes-y-pozos', name: 'Raíles y pozos', count: 80, keepPct: 0.8,
    // La vía sube a una sala alta y el pozo baja a la del tesoro.
    map: [
      '###########',
      '#T00000000#',
      '#000000U00#',
      '#000C00000#',
      '###########',
      '#888888888#',
      '#8888H8888#',
      '#888888888#',
      '####8R8####',
      '.....=.....',
      '.....%.....',
      '.....=.....',
      '####2R2####',
      '#222222222#',
      '#22C2P2C22#',
      '###########',
    ],
    tips: [
      { z: 13, text: 'La vía sube a lo alto dando vueltas' },
      { z: 6.5, text: 'Y el pozo te baja hasta el tesoro' },
    ],
  },
  {
    file: 'chapter4/10-c4-corazon-de-arena.json',
    id: 'c4-corazon-de-arena', name: 'El corazón de arena', count: 80, keepPct: 0.55,
    // Final: rampas abajo, sierra, sendero diagonal sin muros, roca agrietada y pozo hasta el tesoro.
    map: [
      '#############',
      '#00C00T00C00#',
      '#00000000U00#',
      '#00000000000#',
      '#############',
      '#######33333#',
      '#######3H333#',
      '#######33333#',
      '.......BBBBB.',
      '.....m333q...',
      '....m333q....',
      '...m3C3q.....',
      '..m333q......',
      '.m333q.......',
      '#33333#######',
      '#3C3C3#......',
      '#33333#......',
      '##uuu##......',
      '#44K44#......',
      '##uuu##......',
      '#55555#......',
      '#55E55#......',
      '#55555#......',
      '#5C5C5#......',
      '#55P55#......',
      '#######......',
    ],
    tips: [
      { z: 21, text: 'Última prueba del desierto' },
      { z: 19.5, text: 'Espera a que se te pase el mareo antes del sendero' },
      { z: 12, text: 'Sendero en diagonal hasta la roca rota' },
      { z: 6.5, text: 'El pozo te deja junto al tesoro' },
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
      // rampas: su altura es la del lado bajo (la menor de alrededor)
      const ramp = 'nueo'.includes(ch);
      const best = ramp
        ? Object.entries(votes).sort((a, b) => Number(a[0]) - Number(b[0]))[0]
        : Object.entries(votes).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0];
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
  checkCoins(def, tiles);
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
  const walk = (i, j) => at(i, j) !== '.' && at(i, j) !== '#' && !'=@%'.includes(at(i, j));
  // la rampa llega hasta un escalón más arriba
  const top = (i, j) => Number(heights[j][i]) + ('nueo'.includes(at(i, j)) ? 1 : 0);
  // estación → estación del otro extremo de su vía
  const partner = (i, j) => {
    let prev = [i, j];
    let cur = DIRS.map(([di, dj]) => [i + di, j + dj]).find(([a, b]) => '=@%'.includes(at(a, b)));
    for (let guard = 0; cur && guard < W * H; guard++) {
      if (at(...cur) === 'R') return cur;
      const nxt = DIRS.map(([di, dj]) => [cur[0] + di, cur[1] + dj])
        .find(([a, b]) => (a !== prev[0] || b !== prev[1]) && ('=@%R'.includes(at(a, b))));
      prev = cur;
      cur = nxt;
    }
    return null;
  };
  const WIND = { '^': [0, -1], v: [0, 1], '<': [-1, 0], '>': [1, 0] };
  const next = (i, j) => {
    const out = [];
    if (at(i, j) === 'R') { const other = partner(i, j); if (other) out.push(other); }
    // agujero: se cae a la salida más cercana (preferida más abajo) y no se puede seguir andando por encima
    if (at(i, j) === 'H') {
      let best = null, score = Infinity;
      for (let b = 0; b < H; b++) for (let a = 0; a < W; a++) {
        if (at(a, b) !== 'U') continue;
        const sc = Math.hypot(a - i, b - j) + (Number(heights[b][a]) < Number(heights[j][i]) ? 0 : 1000);
        if (sc < score) { score = sc; best = [a, b]; }
      }
      return best ? [best] : [];
    }
    // cañón: lanza a su diana (la más cercana a la que no se llega andando desde él)
    if (at(i, j) === 'N') {
      const foot = new Set([String([i, j])]);
      const q = [[i, j]];
      while (q.length) {
        const [a, b] = q.shift();
        for (const [di, dj] of DIRS) {
          const k = String([a + di, b + dj]);
          if (!walk(a + di, b + dj) || foot.has(k)) continue;
          foot.add(k);
          q.push([a + di, b + dj]);
        }
      }
      let best = null, score = Infinity;
      for (let b = 0; b < H; b++) for (let a = 0; a < W; a++) {
        if (at(a, b) !== 'x' || foot.has(String([a, b]))) continue;
        const sc = Math.hypot(a - i, b - j);
        if (sc < score) { score = sc; best = [a, b]; }
      }
      return best ? [best] : [];
    }
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

/**
  Monedas que se pueden recoger: lejos del tesoro (si no, al ir a por ellas se toca el cofre y acaba el piso)
  y no encajadas en una esquina o un hueco de una casilla (el limo no llega a meterse lo bastante).
*/
function checkCoins(def, tiles) {
  const H = tiles.length, W = tiles[0].length;
  const at = (i, j) => (j >= 0 && j < H && i >= 0 && i < W ? tiles[j][i] : '.');
  let T;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (at(i, j) === 'T') T = [i, j];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (at(i, j) !== 'C' && at(i, j) !== 'G') continue;
    if (T && Math.max(Math.abs(i - T[0]), Math.abs(j - T[1])) < 3) console.warn(`  aviso ${def.id}: moneda en (${i}, ${j}) demasiado cerca del tesoro`);
    const blocked = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => '#.'.includes(at(i + di, j + dj)) || '=@%R'.includes(at(i + di, j + dj))).length;
    if (blocked >= 2 && at(i, j) === 'C') console.warn(`  aviso ${def.id}: moneda en (${i}, ${j}) encajada (${blocked} lados cerrados)`);
  }
}

/** Avisa si hay suelo contiguo que sube (el diseño pide solo bajadas). */
function checkNoStepsUp(def, tiles, heights) {
  if (def.h) return;
  // la vía no se pisa y las estaciones pueden estar a cualquier altura (la bola sube)
  // la vía no se pisa, las estaciones pueden estar a cualquier altura (la bola sube) y las rampas están para subir
  const walk = (t) => t !== '.' && t !== '#' && !'=@%R'.includes(t) && !'nueoH'.includes(t);
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
mkdirSync(join(root, 'chapter3'), { recursive: true });
mkdirSync(join(root, 'chapter4'), { recursive: true });
for (const def of [PRACTICE, ...CHAPTER1, ...CHAPTER2, ...CHAPTER3, ...CHAPTER4]) {
  writeFileSync(join(root, def.file), pretty(build(def)) + '\n');
  console.log('ok', def.file);
}
