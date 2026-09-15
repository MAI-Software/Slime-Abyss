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
      { z: 9.5, text: 'Al tocarse, los trozos vuelven a unirse' },
      { z: 5.5, text: 'Los pinchos también dividen' },
    ],
  },
  {
    file: 'chapter1/03-c1-pasillo-de-fuego.json',
    id: 'c1-pasillo-de-fuego', name: 'Pasillo de fuego', count: 80, keepPct: 0.65,
    map: [
      '...#######.....',
      '...#C0T00#.....',
      '...#00000#.....',
      '...##000##.....',
      '....#XXX#......',
      '....#000#......',
      '....#000#......',
      '....#XXX#......',
      '....#000#......',
      '....#000#......',
      '..###000###....',
      '..#C0IIIF0#....',
      '..#0FIIII0#....',
      '..#0IIIIF0#....',
      '..#00000FC#....',
      '..#####00##....',
      '.......00......',
      '.......00......',
      '.......C0......',
      '.......00......',
      '.....#2222#....',
      '.....#2P22#....',
      '.....######....',
    ],
    tips: [
      { z: 21, text: 'Puente estrecho y sin muros: con calma' },
      { z: 14.5, text: 'El fuego evapora el limo y el hielo resbala' },
      { z: 9.5, text: 'Estas llamas se apagan a ratos: espera en las zonas seguras' },
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
      '...#0P0#...',
      '...#####...',
    ],
    tips: [
      { z: 14, text: 'Las llamas duran poco: date prisa' },
      { z: 7.5, text: 'Ardiendo, derrites los bloques de hielo' },
    ],
  },
  {
    file: 'chapter1/08-c1-ventiladores.json',
    id: 'c1-ventiladores', name: 'Ventiladores', count: 80, keepPct: 0.6,
    map: [
      '#############',
      '#00000T00000#',
      '#00000000000#',
      '#####000#####',
      '....#000#....',
      '...>0000C....',
      '....#000#....',
      '....#0C0#....',
      '....#000#....',
      '...>C0000....',
      '....#000#....',
      '....#000#....',
      '....#0P0#....',
      '....#####....',
    ],
    tips: [
      { z: 12, text: 'El viento de los ventiladores deshace el limo hacia el vacío' },
      { z: 10.2, text: 'Cruza las corrientes deprisa' },
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
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const n = def.map[j + dj]?.[i + di];
        if (n && isDigit(n)) votes[n] = (votes[n] ?? 0) + 1;
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
  const at = (i, j) => (j >= 0 && j < H && i >= 0 && i < W ? tiles[j][i] : '.');
  const walk = (i, j) => at(i, j) !== '.' && at(i, j) !== '#';
  const top = (i, j) => Number(heights[j][i]);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const WIND = { '^': [0, -1], v: [0, 1], '<': [-1, 0], '>': [1, 0] };
  const next = (i, j) => {
    const out = [];
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
  const walk = (t) => t !== '.' && t !== '#';
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
for (const def of [PRACTICE, ...CHAPTER1]) {
  writeFileSync(join(root, def.file), pretty(build(def)) + '\n');
  console.log('ok', def.file);
}
