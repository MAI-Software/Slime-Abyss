/**
  Logros: cada uno cose un parche en el tablón de la habitación del menú (huecos ach_slot_<n> de menu_room)
  y algunos desbloquean opciones raras de Mi limo (ver LOOK_UNLOCKS en look.ts).
  El progreso se calcula del guardado (pisos, estrellas, monedas, secretos) y de contadores de partida.
*/

/** Contadores que se acumulan jugando. */
export interface PlayStats {
  /** viajes en bola por las vías */
  rides: number;
  /** plantas o bloques de hielo quemados */
  burns: number;
  /** saltos en plataformas */
  jumps: number;
  /** veces que se han unido trozos mientras se apretaba */
  squeezes: number;
  /** disparos de cañón */
  shots: number;
  /** mareos */
  dizzy: number;
  /** veces que el limo se ha congelado */
  freezes: number;
  /** caídas por agujeros */
  holes: number;
  /** pisos perdidos */
  fails: number;
  /** niveles del creador probados */
  tests: number;
  /** cambios de aspecto en Mi limo */
  looks: number;
}

export const EMPTY_STATS: PlayStats = { rides: 0, burns: 0, jumps: 0, squeezes: 0, shots: 0, dizzy: 0, freezes: 0, holes: 0, fails: 0, tests: 0, looks: 0 };

/** Datos para calcular el progreso (los prepara el juego a partir del guardado). */
export interface AchievementContext {
  floorsDone: number;
  stars: number;
  coins: number;
  secrets: number;
  /** algún piso completado sin perder limo */
  fullSlime: boolean;
  /** pisos completados sin perder limo */
  fullSlimeFloors: number;
  secretFound: (floorId: string) => boolean;
  chapterDone: (id: string) => boolean;
  chapterAllCoins: (id: string) => boolean;
  /** todas las estrellas del capítulo */
  chapterAllStars: (id: string) => boolean;
  /** gemas secretas encontradas de un tipo */
  gems: (kind: 'ruby' | 'sapphire' | 'emerald' | 'diamond') => number;
  collectibles: number;
  /** niveles guardados en el creador */
  creations: number;
  /** mejor tiempo de cualquier piso completado (Infinity si ninguno) */
  fastest: number;
  stats: PlayStats;
}

export type PatchShape = 'round' | 'shield' | 'hex';
export type PatchIcon = 'chest' | 'star' | 'coin' | 'gem' | 'drop' | 'rail' | 'spring' | 'flame' | 'trophy1' | 'coins' | 'stars' | 'trophy2'
  | 'flag' | 'medal' | 'galaxy' | 'bag' | 'leaf' | 'train' | 'hug' | 'drops'
  | 'trophy3' | 'trophy4' | 'crown' | 'snow' | 'swirl' | 'clock' | 'pencil' | 'play' | 'heart' | 'palette' | 'box' | 'cannon' | 'vortex' | 'map';

export interface Achievement {
  id: string;
  patch: PatchShape;
  /** color de la tela del parche */
  color: number;
  icon: PatchIcon;
  /** [valor actual, objetivo] */
  progress: (c: AchievementContext) => [number, number];
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-treasure', patch: 'round', color: 0xf59e0b, icon: 'chest', progress: (c) => [c.floorsDone, 1] },
  { id: 'stars-10', patch: 'shield', color: 0xeab308, icon: 'star', progress: (c) => [c.stars, 10] },
  { id: 'coins-50', patch: 'round', color: 0xd97706, icon: 'coin', progress: (c) => [c.coins, 50] },
  { id: 'secrets-2', patch: 'hex', color: 0x7c3aed, icon: 'gem', progress: (c) => [c.secrets, 2] },
  { id: 'full-slime', patch: 'round', color: 0x0ea5e9, icon: 'drop', progress: (c) => [c.fullSlime ? 1 : 0, 1] },
  { id: 'rider-10', patch: 'shield', color: 0x16a34a, icon: 'rail', progress: (c) => [c.stats.rides, 10] },
  { id: 'jumper-20', patch: 'hex', color: 0xdb2777, icon: 'spring', progress: (c) => [c.stats.jumps, 20] },
  { id: 'burner-10', patch: 'shield', color: 0xea580c, icon: 'flame', progress: (c) => [c.stats.burns, 10] },
  { id: 'chapter-1', patch: 'hex', color: 0x2563eb, icon: 'trophy1', progress: (c) => [c.chapterDone('cripta-azul') ? 1 : 0, 1] },
  { id: 'coins-c1', patch: 'round', color: 0xca8a04, icon: 'coins', progress: (c) => [c.chapterAllCoins('cripta-azul') ? 1 : 0, 1] },
  { id: 'stars-30', patch: 'shield', color: 0x64748b, icon: 'stars', progress: (c) => [c.stars, 30] },
  { id: 'chapter-2', patch: 'hex', color: 0x15803d, icon: 'trophy2', progress: (c) => [c.chapterDone('raices-colgantes') ? 1 : 0, 1] },
  { id: 'floors-10', patch: 'shield', color: 0x0891b2, icon: 'flag', progress: (c) => [c.floorsDone, 10] },
  { id: 'floors-20', patch: 'hex', color: 0x4338ca, icon: 'medal', progress: (c) => [c.floorsDone, 20] },
  { id: 'stars-50', patch: 'round', color: 0x9333ea, icon: 'galaxy', progress: (c) => [c.stars, 50] },
  { id: 'coins-150', patch: 'shield', color: 0xb45309, icon: 'bag', progress: (c) => [c.coins, 150] },
  { id: 'secret-roots', patch: 'round', color: 0x65a30d, icon: 'leaf', progress: (c) => [c.secretFound('c2-bifurcacion') ? 1 : 0, 1] },
  { id: 'rider-50', patch: 'hex', color: 0x0f766e, icon: 'train', progress: (c) => [c.stats.rides, 50] },
  { id: 'squeeze-30', patch: 'round', color: 0xe11d48, icon: 'hug', progress: (c) => [c.stats.squeezes, 30] },
  { id: 'full-slime-5', patch: 'shield', color: 0x0284c7, icon: 'drops', progress: (c) => [c.fullSlimeFloors, 5] },
  // capítulos
  { id: 'chapter-3', patch: 'hex', color: 0x0e7490, icon: 'trophy3', progress: (c) => [c.chapterDone('grietas-heladas') ? 1 : 0, 1] },
  { id: 'chapter-4', patch: 'hex', color: 0xb45309, icon: 'trophy4', progress: (c) => [c.chapterDone('arenas-hundidas') ? 1 : 0, 1] },
  { id: 'coins-c2', patch: 'round', color: 0x4d7c0f, icon: 'coins', progress: (c) => [c.chapterAllCoins('raices-colgantes') ? 1 : 0, 1] },
  { id: 'coins-c3', patch: 'round', color: 0x0369a1, icon: 'coins', progress: (c) => [c.chapterAllCoins('grietas-heladas') ? 1 : 0, 1] },
  { id: 'coins-c4', patch: 'round', color: 0xc2410c, icon: 'coins', progress: (c) => [c.chapterAllCoins('arenas-hundidas') ? 1 : 0, 1] },
  { id: 'perfect-c1', patch: 'shield', color: 0x1d4ed8, icon: 'crown', progress: (c) => [c.chapterAllStars('cripta-azul') ? 1 : 0, 1] },
  { id: 'perfect-c2', patch: 'shield', color: 0x15803d, icon: 'crown', progress: (c) => [c.chapterAllStars('raices-colgantes') ? 1 : 0, 1] },
  { id: 'perfect-c3', patch: 'shield', color: 0x0891b2, icon: 'crown', progress: (c) => [c.chapterAllStars('grietas-heladas') ? 1 : 0, 1] },
  { id: 'perfect-c4', patch: 'shield', color: 0xd97706, icon: 'crown', progress: (c) => [c.chapterAllStars('arenas-hundidas') ? 1 : 0, 1] },
  // progreso
  { id: 'stars-80', patch: 'hex', color: 0xa16207, icon: 'stars', progress: (c) => [c.stars, 80] },
  { id: 'stars-120', patch: 'round', color: 0xca8a04, icon: 'galaxy', progress: (c) => [c.stars, 120] },
  { id: 'floors-30', patch: 'shield', color: 0x6d28d9, icon: 'map', progress: (c) => [c.floorsDone, 30] },
  { id: 'floors-40', patch: 'hex', color: 0x7c2d12, icon: 'map', progress: (c) => [c.floorsDone, 40] },
  { id: 'coins-100', patch: 'hex', color: 0x92400e, icon: 'bag', progress: (c) => [c.coins, 100] },
  { id: 'secrets-1', patch: 'round', color: 0x9333ea, icon: 'gem', progress: (c) => [c.secrets, 1] },
  { id: 'secrets-6', patch: 'shield', color: 0x7e22ce, icon: 'gem', progress: (c) => [c.secrets, 6] },
  { id: 'secrets-12', patch: 'hex', color: 0x581c87, icon: 'gem', progress: (c) => [c.secrets, 12] },
  { id: 'rubies-9', patch: 'hex', color: 0xbe123c, icon: 'gem', progress: (c) => [c.gems('ruby'), 9] },
  { id: 'sapphires-9', patch: 'hex', color: 0x1e40af, icon: 'gem', progress: (c) => [c.gems('sapphire'), 9] },
  { id: 'full-slime-10', patch: 'hex', color: 0x0369a1, icon: 'drops', progress: (c) => [c.fullSlimeFloors, 10] },
  { id: 'full-slime-20', patch: 'round', color: 0x075985, icon: 'drops', progress: (c) => [c.fullSlimeFloors, 20] },
  { id: 'speed-30', patch: 'round', color: 0xdc2626, icon: 'clock', progress: (c) => [c.fastest <= 30 ? 1 : 0, 1] },
  // mecánicas
  { id: 'rider-100', patch: 'round', color: 0x065f46, icon: 'train', progress: (c) => [c.stats.rides, 100] },
  { id: 'jumper-100', patch: 'shield', color: 0xbe185d, icon: 'spring', progress: (c) => [c.stats.jumps, 100] },
  { id: 'burner-50', patch: 'hex', color: 0xc2410c, icon: 'flame', progress: (c) => [c.stats.burns, 50] },
  { id: 'squeeze-100', patch: 'shield', color: 0x9f1239, icon: 'hug', progress: (c) => [c.stats.squeezes, 100] },
  { id: 'cannon-1', patch: 'round', color: 0x475569, icon: 'cannon', progress: (c) => [c.stats.shots, 1] },
  { id: 'cannon-25', patch: 'hex', color: 0x334155, icon: 'cannon', progress: (c) => [c.stats.shots, 25] },
  { id: 'dizzy-1', patch: 'round', color: 0xc026d3, icon: 'swirl', progress: (c) => [c.stats.dizzy, 1] },
  { id: 'dizzy-20', patch: 'shield', color: 0xa21caf, icon: 'swirl', progress: (c) => [c.stats.dizzy, 20] },
  { id: 'frozen-10', patch: 'hex', color: 0x0284c7, icon: 'snow', progress: (c) => [c.stats.freezes, 10] },
  { id: 'holes-10', patch: 'round', color: 0x312e81, icon: 'vortex', progress: (c) => [c.stats.holes, 10] },
  { id: 'fails-10', patch: 'shield', color: 0xe11d48, icon: 'heart', progress: (c) => [c.stats.fails, 10] },
  // creador, Mi limo y colección
  { id: 'creator-1', patch: 'round', color: 0x0f766e, icon: 'pencil', progress: (c) => [c.creations, 1] },
  { id: 'creator-10', patch: 'hex', color: 0x115e59, icon: 'pencil', progress: (c) => [c.creations, 10] },
  { id: 'creator-test', patch: 'shield', color: 0x16a34a, icon: 'play', progress: (c) => [c.stats.tests, 1] },
  { id: 'style-10', patch: 'round', color: 0xdb2777, icon: 'palette', progress: (c) => [c.stats.looks, 10] },
  { id: 'collector-10', patch: 'shield', color: 0x78350f, icon: 'box', progress: (c) => [c.collectibles, 10] },
  { id: 'collector-30', patch: 'hex', color: 0x451a03, icon: 'box', progress: (c) => [c.collectibles, 30] },
];

// ------------------------------------------------------------------ bordado del icono

const P = {
  star: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  drop: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  gem: 'M6 3h12l4 6-10 12L2 9z M2 9h20 M9 3l3 6 3-6 M12 21 9 9 M12 21l3-12',
  chest: 'M3 11h18v9H3z M3 11a9 6 0 0 1 18 0 M3 14h18 M11 13h2v3h-2z',
  coin: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  coins: 'M4 17a8 3 0 0 0 16 0 M4 17v-3 M20 17v-3 M4 14a8 3 0 0 0 16 0a8 3 0 0 0-16 0z M6 10a6 2.4 0 0 0 12 0a6 2.4 0 0 0-12 0z M6 10V7 M18 10V7 M6 7a6 2.4 0 0 0 12 0a6 2.4 0 0 0-12 0z',
  rail: 'M8 2v20 M16 2v20 M5 5h14 M5 10h14 M5 15h14 M5 20h14',
  spring: 'M5 3h14 M7 6l10 3-10 3 10 3-10 3 M5 21h14',
  trophy: 'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978 M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978 M18 9h1.5a1 1 0 0 0 0-5H18 M4 22h16 M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z M6 9H4.5a1 1 0 0 1 0-5H6',
  question: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  medal: 'M7.2 15 2.7 7.1a2 2 0 0 1 .1-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.1a2 2 0 0 1 .1 2.2L16.8 15 M11 12 5.1 2.2 M13 12l5.9-9.8 M8 7h8 M12 12a5 5 0 1 0 0 10a5 5 0 1 0 0-10z',
  orbit: 'M2 12a10 4 0 1 0 20 0a10 4 0 1 0-20 0z',
  bag: 'M8 3h8l-2 4h-4z M10 7C3 10 3 21 12 21s9-11 2-14 M12 11v6 M10 12.5h3a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h3',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12',
  train: 'M8 3.1V7a4 4 0 0 0 8 0V3.1 M9 15l-1-1 M15 15l1-1 M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5z M8 19l-2 3 M16 19l2 3',
  hug: 'm15 15 6 6m-6-6v4.8m0-4.8h4.8 M9 19.8V15m0 0H4.2M9 15l-6 6 M15 4.2V9m0 0h4.8M15 9l6-6 M9 4.2V9m0 0H4.2M9 9 3 3',
  crown: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z M5 21h14',
  snow: 'M2 12h20 M12 2v20 M20 16l-4-4 4-4 M4 8l4 4-4 4 M16 4l-4 4-4-4 M8 20l4-4 4 4',
  swirl: 'M12 12a1 1 0 0 1 2 0a2 2 0 0 1-4 0a3 3 0 0 1 6 0a4 4 0 0 1-8 0a5 5 0 0 1 10 0',
  clock: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M12 6v6l4 2',
  pencil: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4',
  play: 'M6 3l14 9-14 9z',
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3c.4.5.5 1.2.1 1.8-.5.9-1.4 1.9-2.6 1.9z M7.5 10.5h.5 M12 7h.5 M16.5 10.5h.5',
  box: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7L12 12l8.7-5 M12 22V12',
  cannon: 'M3 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0z M7.5 13.5 18 6l2.5 3.5L10 17 M12 21h9 M16 16v5',
  vortex: 'M2 12a10 4.5 0 1 0 20 0a10 4.5 0 1 0-20 0z M6.5 12a5.5 2.2 0 1 0 11 0a5.5 2.2 0 1 0-11 0z M10.5 12a1.5 .6 0 1 0 3 0a1.5 .6 0 1 0-3 0z',
  map: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z M15 5.764v15 M9 3.236v15',
};

function paths(icon: PatchIcon | 'question'): { d: string; t?: [number, number, number] }[] {
  switch (icon) {
    case 'stars': return [{ d: P.star, t: [0.5, 6, 1] }, { d: P.star, t: [0.36, 1, 13] }, { d: P.star, t: [0.36, 14.5, 13] }];
    case 'trophy1': case 'trophy2': case 'trophy3': case 'trophy4': return [{ d: P.trophy }];
    case 'galaxy': return [{ d: P.orbit }, { d: P.star, t: [0.5, 6, 6] }];
    case 'drops': return [{ d: P.drop, t: [0.75, 1, 3] }, { d: P.star, t: [0.36, 14.5, 1] }];
    default: return [{ d: P[icon] }];
  }
}

/**
  Dibuja el icono bordado en un canvas (fondo transparente): hilo claro grueso con puntadas marcadas.
  locked: interrogación en hilo apagado.
*/
export function drawPatchIcon(g: CanvasRenderingContext2D, icon: PatchIcon, size: number, locked = false) {
  g.clearRect(0, 0, size, size);
  const scale = (size * 0.62) / 24;
  const off = (size - 24 * scale) / 2;
  const list = locked ? paths('question') : paths(icon);
  const stroke = (color: string, width: number, dash: number[]) => {
    for (const { d, t } of list) {
      g.save();
      g.translate(off, off);
      g.scale(scale, scale);
      if (t) { g.translate(t[1], t[2]); g.scale(t[0], t[0]); }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = color;
      g.lineWidth = width / (t ? t[0] : 1);
      g.setLineDash(dash.map((v) => v / (t ? t[0] : 1)));
      g.stroke(new Path2D(d));
      g.restore();
    }
  };
  if (locked) {
    stroke('rgba(255,255,255,0.35)', 2.6, [1.6, 1.4]);
    return;
  }
  stroke('rgba(15,23,42,0.45)', 3.6, []);          // sombra del relieve
  stroke('#fdf6e3', 2.8, []);                       // hilo
  stroke('rgba(120,90,60,0.35)', 0.7, [0.9, 1.1]);  // puntadas
  const trophy = /^trophy(\d)$/.exec(icon);
  if (trophy) {
    g.fillStyle = '#fdf6e3';
    g.font = `700 ${size * 0.2}px Fredoka, Nunito, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(trophy[1], size / 2, size * 0.41);
  }
}
