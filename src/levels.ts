/*
  Leyenda del mapa (1 carácter = 1 bloque; filas = eje Z, la fila 0 es el fondo):
    ' ' '.'  vacío (caída)
    '0'-'9'  suelo, altura = dígito * 0.5
    '#'      muro (base + 1.5)
    'P'      salida del limo       'T'  tesoro
    'F'      fuego fijo            'X'  fuego intermitente
    'I'      hielo (resbala)       'J'  plataforma de salto
    'S' 's'  interruptor canal A/B 'D' 'd'  puerta canal A/B
  Capa opcional `h`: dígito por celda = altura base para letras y muros.
*/

export type Channel = 'A' | 'B';

export interface Tip { z: number; text: string }

export interface LevelDef {
  name: string;
  map: string[];
  h?: string[];
  count: number;
  minPct: number;
  need?: Partial<Record<Channel, number>>;
  latch?: Partial<Record<Channel, boolean>>;
  tips?: Tip[];
}

export const LEVELS: LevelDef[] = [
  {
    name: 'Primer deslizamiento',
    count: 50,
    minPct: 0.35,
    map: [
      '  #######  ',
      '  #00T00#  ',
      '  #00000#  ',
      '  ##000##  ',
      '   #111#   ',
      '   #111#   ',
      '   #000#   ',
      '  ##000##  ',
      '  #00000#  ',
      '  #00.00#  ',
      '  #0...0#  ',
      '  #00.00#  ',
      '  #00000#  ',
      '  #00000#  ',
      '  #00P00#  ',
      '  #######  ',
    ],
    tips: [
      { z: 16, text: 'Inclina el móvil para deslizarte' },
      { z: 13.5, text: 'Rodea el agujero: lo que cae, se pierde' },
      { z: 7.5, text: 'Un escalón: pulsa SALTAR' },
      { z: 3.5, text: 'El tesoro está al fondo' },
    ],
  },
  {
    name: 'Pasillo de fuego',
    count: 50,
    minPct: 0.35,
    map: [
      '   #####   ',
      '   #0T0#   ',
      '   #000#   ',
      '  ##000##  ',
      '  #0XX0#   ',
      '  #0XX0#   ',
      '  #0000#   ',
      '  #0000#   ',
      ' ###0I0### ',
      ' #00IIIF0# ',
      ' #0FIIII0# ',
      ' #00000F0# ',
      ' ####00### ',
      '    .00.   ',
      '    .00.   ',
      '    .00.   ',
      '   #0000#  ',
      '   #0P00#  ',
      '   ######  ',
    ],
    tips: [
      { z: 18, text: 'Puente estrecho: con calma' },
      { z: 12, text: 'El fuego evapora el limo. El hielo resbala' },
      { z: 7, text: 'Este fuego se apaga a ratos: espera tu momento' },
    ],
  },
  {
    name: 'Divide y vencerás',
    count: 50,
    minPct: 0.35,
    need: { A: 15 },
    map: [
      '  ########  ',
      '  #000T00#  ',
      '  #000000#  ',
      '  ###DD###  ',
      '  #000000#  ',
      '  #SS0000#  ',
      '  #SS0000#  ',
      '  #000000#  ',
      '  #000000#  ',
      '  #00P000#  ',
      '  ########  ',
    ],
    h: [
      '  33333333  ',
      '  33333333  ',
      '  33333333  ',
      '  33333333  ',
      '  33333333  ',
      '  30033333  ',
      '  30033333  ',
      '  33333333  ',
      '  33333333  ',
      '  33333333  ',
      '  33333333  ',
    ],
    tips: [
      { z: 10, text: 'La puerta necesita peso sobre el interruptor' },
      { z: 7.5, text: 'Pulsa DIVIDIR antes del foso: solo debe caer una parte' },
      { z: 3.5, text: 'Mantén UNIR para juntar los trozos cercanos' },
    ],
  },
  {
    name: 'Salto al abismo',
    count: 50,
    minPct: 0.35,
    need: { B: 25 },
    latch: { B: true },
    map: [
      '  #########  ',
      '  #000T000#  ',
      '  #0000000#  ',
      '  ####d####  ',
      '  #0000000#  ',
      '  #XX000XX#  ',
      '  #0000000#  ',
      '  #000s000#  ',
      '  #0000000#  ',
      '  .........  ',
      '  .........  ',
      '  #JJJJJJJ#  ',
      '  #0000000#  ',
      '  #000P000#  ',
      '  #########  ',
    ],
    h: [
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  222222222  ',
      '  000000000  ',
      '  000000000  ',
      '  000000000  ',
      '  000000000  ',
      '  000000000  ',
      '  000000000  ',
    ],
    tips: [
      { z: 13, text: 'Las plataformas rosas te lanzan por los aires' },
      { z: 8, text: 'Reúnete con UNIR: el interruptor pide 25' },
    ],
  },
];
