/*
  Formato de niveles (pensado para el futuro creador de niveles).

  Un nivel es un JSON serializable (LevelData) con dos capas del mismo tamaño:
    tiles   → un carácter por celda, ver TILES
    heights → un dígito por celda: altura de la base = dígito * 0.5
  Filas = eje Z (la fila 0 es el fondo, lejos de la cámara); columnas = eje X.

  El editor solo tiene que leer TILES para su paleta, pintar las dos capas y llamar a
  validateLevel() antes de guardar. encodeLevel/decodeLevel sirven para guardar,
  compartir por código y migrar versiones antiguas.
*/

export type Channel = 'A' | 'B';

export type CellKind =
  | 'void' | 'floor' | 'wall' | 'fire' | 'firet' | 'ice' | 'jump' | 'switch' | 'door' | 'start' | 'treasure'
  | 'coin' | 'blade' | 'spike' | 'gem' | 'relic'
  | 'oil' | 'plant' | 'iceblock' | 'fan' | 'coldjet'
  | 'station' | 'rail' | 'crack'
  | 'ramp' | 'slab' | 'hole' | 'exit' | 'spinner' | 'cannon' | 'target';

export interface TileDef {
  char: string;
  kind: CellKind;
  label: string;
  /** Altura extra sobre la base (muros, puertas cerradas). */
  raise?: number;
  channel?: Channel;
  friction?: number;
  /** Solo puede haber uno por nivel. */
  unique?: boolean;
  /** Color de referencia para miniaturas y paleta del editor. */
  color: string;
  /** Es peligrosa (útil para filtros del editor y niveles "sin trampas"). */
  hazard?: boolean;
  /** Sierras: eje a lo largo del que corre el disco ('z' divide izquierda/derecha, 'x' delante/detrás; 'd1' diagonal \\, 'd2' diagonal /). */
  axis?: 'x' | 'z' | 'd1' | 'd2';
  /** Divide el limo al atravesarlo (sin hacer daño). */
  divider?: boolean;
  /** Ventiladores: hacia dónde sopla (n = fila 0 / fondo, s = hacia la cámara, e = derecha, w = izquierda). */
  dir?: 'n' | 's' | 'e' | 'w';
  /** Obstáculo que desaparece al tocarlo el limo en llamas. */
  burnable?: boolean;
  /** Rampas: hacia dónde sube (la altura de la casilla es la del lado bajo; el alto está RAMP_RISE más arriba). */
  rise?: 'n' | 's' | 'e' | 'w';
  /** Suelos en diagonal: la esquina que conserva suelo (la otra media casilla es vacío). */
  corner?: 'nw' | 'ne' | 'sw' | 'se';
  /** Vías con forma: bucle vertical o espiral que da dos vueltas (marean). */
  shape?: 'loop' | 'spiral';
}

export const TILES: readonly TileDef[] = [
  { char: '.', kind: 'void', label: 'Vacío', color: '#140f2b', hazard: true },
  { char: '0', kind: 'floor', label: 'Suelo', color: '#e9d7ad' },
  { char: '#', kind: 'wall', label: 'Muro', raise: 1.5, color: '#6f6798' },
  { char: 'P', kind: 'start', label: 'Salida del limo', unique: true, color: '#2f8cff' },
  { char: 'T', kind: 'treasure', label: 'Tesoro', unique: true, color: '#f5b301' },
  { char: 'F', kind: 'fire', label: 'Fuego', color: '#ff5a1f', hazard: true },
  { char: 'X', kind: 'firet', label: 'Fuego intermitente', color: '#ff9a3c', hazard: true },
  // resbala; si lo pisa el limo en llamas se derrite y cae al vacío (ver COLLAPSE_DELAY en world.ts)
  { char: 'I', kind: 'ice', label: 'Hielo (el limo en llamas lo derrite)', friction: 0.25, color: '#bfeaff' },
  { char: 'J', kind: 'jump', label: 'Plataforma de salto', raise: 0.38, color: '#ec4899' },
  { char: 'S', kind: 'switch', label: 'Interruptor A', channel: 'A', color: '#f59e0b' },
  { char: 's', kind: 'switch', label: 'Interruptor B', channel: 'B', color: '#22c55e' },
  { char: 'D', kind: 'door', label: 'Puerta A', channel: 'A', raise: 1.5, color: '#b45309' },
  { char: 'd', kind: 'door', label: 'Puerta B', channel: 'B', raise: 1.5, color: '#15803d' },
  { char: 'C', kind: 'coin', label: 'Moneda', color: '#ffc53d' },
  // sierras circulares que giran: dividen al limo sin dañarlo; las diagonales sirven para esquinas y pasillos en diagonal
  { char: 'K', kind: 'blade', label: 'Sierra (divide izquierda / derecha)', axis: 'z', divider: true, color: '#d7dfea' },
  { char: 'k', kind: 'blade', label: 'Sierra (divide delante / detrás)', axis: 'x', divider: true, color: '#c3ccd8' },
  { char: 'V', kind: 'blade', label: 'Sierra diagonal (\\)', axis: 'd1', divider: true, color: '#cfd6e2' },
  { char: 'A', kind: 'blade', label: 'Sierra diagonal (/)', axis: 'd2', divider: true, color: '#cfd6e2' },
  // pinchan el limo que los pisa (el congelado no se pincha); dan un respingo como el fuego
  { char: 'Y', kind: 'spike', label: 'Casilla de pinchos', hazard: true, color: '#9aa4b4' },
  { char: 'G', kind: 'gem', label: 'Tesoro secreto (gema)', color: '#8b5cf6' },
  // coleccionable escondido en un camino oculto o bloqueado (solo en pisos sin gema; cuál es lo dice collectibles.ts)
  { char: 'L', kind: 'relic', label: 'Coleccionable (camino oculto)', color: '#f472b6' },
  { char: 'O', kind: 'oil', label: 'Botella de aceite', color: '#e0a526' },
  { char: 'W', kind: 'plant', label: 'Plantas (arden)', raise: 1.1, burnable: true, color: '#3f9d3c' },
  { char: 'Z', kind: 'iceblock', label: 'Bloque de hielo (se derrite)', raise: 1.0, burnable: true, color: '#a9e4ff' },
  { char: '^', kind: 'fan', label: 'Ventilador (sopla al fondo)', dir: 'n', raise: 1.0, color: '#3d4a66' },
  { char: 'v', kind: 'fan', label: 'Ventilador (sopla hacia la cámara)', dir: 's', raise: 1.0, color: '#3d4a66' },
  { char: '>', kind: 'fan', label: 'Ventilador (sopla a la derecha)', dir: 'e', raise: 1.0, color: '#3d4a66' },
  { char: '<', kind: 'fan', label: 'Ventilador (sopla a la izquierda)', dir: 'w', raise: 1.0, color: '#3d4a66' },
  { char: 'Q', kind: 'coldjet', label: 'Chorro de aire frío (congela 30 s)', color: '#bfefff' },
  // Raíles: el trozo que pisa una estación se hace bola y rueda por la vía hasta la otra estación.
  // La vía (casillas '=' seguidas, puede girar y subir) no se pisa: hace de valla para el limo a pie.
  { char: 'R', kind: 'station', label: 'Estación de raíl', color: '#7dd3fc' },
  { char: '=', kind: 'rail', label: 'Raíl', raise: 1.2, color: '#9aa3b5' },
  // tramos de vía con forma: la bola da la vuelta (bucle) o dos vueltas subiendo en espiral; tantas vueltas marean
  { char: '@', kind: 'rail', label: 'Raíl con bucle', raise: 1.2, shape: 'loop', color: '#a5b4fc' },
  { char: '%', kind: 'rail', label: 'Raíl en espiral', raise: 1.2, shape: 'spiral', color: '#a5b4fc' },
  // se agrieta al pisarla y cae al vacío poco después (mismo tiempo que el hielo derretido): solo se cruza una vez
  { char: 'B', kind: 'crack', label: 'Roca agrietada (se rompe al pasar)', color: '#a08c74' },
  // rampas: suben media altura en una casilla, hacia arriba o hacia abajo según se recorran
  { char: 'n', kind: 'ramp', label: 'Rampa (sube hacia el fondo)', rise: 'n', color: '#d8c49a' },
  { char: 'u', kind: 'ramp', label: 'Rampa (sube hacia la cámara)', rise: 's', color: '#d8c49a' },
  { char: 'e', kind: 'ramp', label: 'Rampa (sube a la derecha)', rise: 'e', color: '#d8c49a' },
  { char: 'o', kind: 'ramp', label: 'Rampa (sube a la izquierda)', rise: 'w', color: '#d8c49a' },
  // media casilla en diagonal: con ellas los caminos giran en diagonal sin escalones
  { char: 'q', kind: 'slab', label: 'Suelo diagonal (esquina del fondo izquierda)', corner: 'nw', color: '#e9d7ad' },
  { char: 'p', kind: 'slab', label: 'Suelo diagonal (esquina del fondo derecha)', corner: 'ne', color: '#e9d7ad' },
  { char: 'z', kind: 'slab', label: 'Suelo diagonal (esquina delantera izquierda)', corner: 'sw', color: '#e9d7ad' },
  { char: 'm', kind: 'slab', label: 'Suelo diagonal (esquina delantera derecha)', corner: 'se', color: '#e9d7ad' },
  // agujero redondo: el limo que cae por él aparece sobre la salida de agujero más cercana (mejor si está más abajo)
  { char: 'H', kind: 'hole', label: 'Agujero (lleva a una salida más abajo)', color: '#1f1a33' },
  { char: 'U', kind: 'exit', label: 'Salida de agujero', color: '#5b4b8a' },
  // plataforma giratoria (centro de un disco que ocupa 3x3 casillas): hace girar al limo y lo marea
  { char: 'E', kind: 'spinner', label: 'Plataforma giratoria (marea)', color: '#f0abfc' },
  // cañón: el trozo que se mete dentro sale disparado hacia su diana (la más cercana a la que no se llega andando).
  // Congelado vuela de una pieza y cae justo en la diana; líquido se esparce por el aire, más cuanto más lejos
  { char: 'N', kind: 'cannon', label: 'Cañón (lanza a la diana)', raise: 0.3, color: '#475569' },
  { char: 'x', kind: 'target', label: 'Diana del cañón', color: '#94a3b8' },
];

export const TILE_BY_CHAR: ReadonlyMap<string, TileDef> = new Map(TILES.map((t) => [t.char, t]));
export const HEIGHT_STEP = 0.5;
/** Lo que sube una rampa en su casilla. */
export const RAMP_RISE = HEIGHT_STEP;
export const MAX_HEIGHT = 9;

export interface Tip { z: number; text: string }

export const LEVEL_FORMAT = 1;

export interface LevelData {
  format: typeof LEVEL_FORMAT;
  id: string;
  name: string;
  author?: string;
  /** Limitos con los que empieza el limo. */
  count: number;
  /**
    Obsoleto: los pisos ya no tienen mínimo para completarse (solo se pierde si no queda limo).
    El limo conservado cuenta para las estrellas con keepPct.
  */
  minPct?: number;
  tiles: string[];
  heights: string[];
  /**
    Plantas de encima (1, 2...), del mismo tamaño: cada una STORY_H más arriba, con suelos de losa por los que se
    puede pasar por debajo. Se conectan con agujeros, ascensores (estaciones una encima de otra) y cañones.
  */
  stories?: StoryGrid[];
  /**
    Peso necesario por canal de interruptor (por defecto 1: basta con tocarlo).
    Norma de diseño: las puertas del camino principal NO piden peso; solo las puertas secretas.
  */
  need?: Partial<Record<Channel, number>>;
  /** Canales cuyo interruptor se queda pulsado. */
  latch?: Partial<Record<Channel, boolean>>;
  tips?: Tip[];
  /** Nivel de pruebas: siempre desbloqueado y fuera de la progresión. */
  practice?: boolean;
  /** Fracción de limo a conservar para la 3ª estrella (por defecto DEFAULT_KEEP_PCT). */
  keepPct?: number;
}

export const DEFAULT_KEEP_PCT = 0.75;

/** Las 3 estrellas de un piso: llegar al tesoro, todas las monedas y conservar limo. */
export interface FloorResult {
  done: boolean;
  /** encontró el coleccionable del camino oculto */
  relic?: boolean;
  allCoins: boolean;
  kept: boolean;
  coins: number;
  coinsTotal: number;
  pct: number;
  time: number;
}

export function starsOf(r: Pick<FloorResult, 'done' | 'allCoins' | 'kept'>): number {
  return r.done ? 1 + (r.allCoins ? 1 : 0) + (r.kept ? 1 : 0) : 0;
}

export interface ChapterDef {
  id: string;
  name: string;
  subtitle: string;
  /** Tema del abismo (texturas, cielo, luces): piedra 1-3, arena 4-6, hielo 7-9, tecnológico 10-12. */
  biome: import('../biomes').Biome;
  floors: LevelData[];
}

/** Una planta del nivel: casillas y alturas (la planta 0 son tiles/heights del propio nivel). */
export interface StoryGrid { tiles: string[]; heights: string[] }
/** Separación en altura entre el suelo de una planta y el de la siguiente (unidades del mundo). */
export const STORY_H = 4;
export const MAX_STORIES = 3;

/** Todas las plantas del nivel, de abajo arriba. */
export function storyGrids(level: LevelData): StoryGrid[] {
  return [{ tiles: level.tiles, heights: level.heights }, ...(level.stories ?? [])];
}

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
  Recorre las vías de un nivel: para cada estación, la lista de casillas hasta la estación del otro extremo
  (índices absolutos: planta * ancho * fondo + fila * ancho + columna).
  Una estación sin vía al lado que tiene otra estación justo encima o debajo en otra planta es un ascensor:
  la bola sube o baja en espiral entre las dos (lifts: [de abajo, de arriba]).
  Devuelve también los errores (estación sin vía, vía que no acaba en estación, vías con ramales).
*/
export function traceRails(level: LevelData): { paths: Map<number, number[]>; lifts: [number, number][]; errors: string[] } {
  const { w, d } = levelSize(level);
  const N = w * d;
  const grids = storyGrids(level);
  const paths = new Map<number, number[]>();
  const lifts: [number, number][] = [];
  const errors: string[] = [];
  const isRail = (c: string) => TILE_BY_CHAR.get(c)?.kind === 'rail';
  const tileAt = (s: number, i: number, j: number) => (i >= 0 && j >= 0 && i < w && j < d ? grids[s].tiles[j]?.[i] ?? '.' : '.');
  const railsAround = (s: number, i: number, j: number) => DIR4.filter(([di, dj]) => isRail(tileAt(s, i + di, j + dj)));
  grids.forEach((_, s) => {
    const at = (i: number, j: number) => tileAt(s, i, j);
    const where = s ? ` de la planta ${s}` : '';
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (at(i, j) !== 'R') continue;
      const rails = railsAround(s, i, j);
      if (rails.length === 0) {
        // ascensor: la estación sin vía más cercana justo encima o debajo
        let partner = -1;
        for (let k = 0; k < grids.length; k++) {
          if (k === s || tileAt(k, i, j) !== 'R' || railsAround(k, i, j).length) continue;
          if (partner < 0 || Math.abs(k - s) < Math.abs(partner - s)) partner = k;
        }
        if (partner < 0) errors.push(`La estación de (${i}, ${j})${where} no toca ninguna vía ni tiene otra estación encima o debajo.`);
        else if (s < partner) lifts.push([s * N + j * w + i, partner * N + j * w + i]);
        continue;
      }
      if (rails.length !== 1) { errors.push(`La estación de (${i}, ${j})${where} debe tocar exactamente una vía.`); continue; }
      const path = [s * N + j * w + i];
      let [ci, cj] = [i + rails[0][0], j + rails[0][1]];
      let [pi, pj] = [i, j];
      for (let guard = 0; guard < w * d; guard++) {
        path.push(s * N + cj * w + ci);
        if (at(ci, cj) === 'R') break;
        const next = DIR4.map(([di, dj]) => [ci + di, cj + dj]).filter(([a, b]) => (a !== pi || b !== pj) && (isRail(at(a, b)) || at(a, b) === 'R'));
        if (next.length !== 1) { errors.push(`La vía de (${ci}, ${cj})${where} ${next.length ? 'tiene ramales' : 'no acaba en una estación'}.`); path.length = 0; break; }
        [pi, pj, ci, cj] = [ci, cj, next[0][0], next[0][1]];
      }
      if (path.length) paths.set(s * N + j * w + i, path);
    }
  });
  return { paths, lifts, errors };
}

/**
  Rampas: suben exactamente una altura. Por su lado bajo llega suelo a su altura, por el alto suelo una altura más
  arriba y a los lados muro, vacío u otra rampa igual; si no, el limo choca contra el escalón y se deshace.
  (Entre alturas distintas solo se sube por rampa: un desnivel sin rampa corta el paso.)
*/
export function rampErrors(level: LevelData): string[] {
  const { w, d } = levelSize(level);
  const errors: string[] = [];
  const rise = (c: string) => {
    const r = TILE_BY_CHAR.get(c)?.rise;
    return r ? { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[r] : null;
  };
  const solid = (c: string) => { const k = TILE_BY_CHAR.get(c)?.kind; return !k || k === 'void' || k === 'wall' || k === 'rail'; };
  storyGrids(level).forEach((g, s) => {
    const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < w && j < d ? g.tiles[j][i] : '.');
    const hAt = (i: number, j: number) => Number(g.heights[j]?.[i] ?? 0);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const r = rise(at(i, j));
      if (!r) continue;
      const h = hAt(i, j);
      const lo: [number, number] = [i - r[0], j - r[1]], hi: [number, number] = [i + r[0], j + r[1]];
      const sideOk = [[i + r[1], j + r[0]], [i - r[1], j - r[0]]].every(([a, b]) => solid(at(a, b)) || (at(a, b) === at(i, j) && hAt(a, b) === h));
      const loOk = solid(at(...lo)) || (rise(at(...lo)) ? at(...lo) === at(i, j) && hAt(...lo) === h - 1 : hAt(...lo) === h);
      const hiOk = solid(at(...hi)) || (rise(at(...hi)) ? at(...hi) === at(i, j) && hAt(...hi) === h + 1 : hAt(...hi) === h + 1);
      if (!sideOk || !loOk || !hiOk) {
        errors.push(`La rampa de (${i}, ${j})${s ? ` de la planta ${s}` : ''} no está alineada: abajo tiene que quedar a su altura, arriba una altura más y a los lados muro u otra rampa igual.`);
      }
    }
  });
  return errors;
}

/**
  Diana de cada cañón (índices absolutos; -1 si no tiene): la más cercana de las que no se alcanzan andando
  desde el cañón, en cualquier planta. Así un cañón nunca apunta a la sala en la que ya está.
*/
export function cannonTargets(level: LevelData): Map<number, number> {
  const { w, d } = levelSize(level);
  const N = w * d;
  const grids = storyGrids(level);
  const out = new Map<number, number>();
  const targets: number[] = [];
  grids.forEach((g, s) => { for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (g.tiles[j][i] === 'x') targets.push(s * N + j * w + i); });
  grids.forEach((g, s) => {
    const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < w && j < d ? g.tiles[j][i] : '.');
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (at(i, j) !== 'N') continue;
      const seen = new Set([s * N + j * w + i]);
      const queue: [number, number][] = [[i, j]];
      while (queue.length) {
        const [ci, cj] = queue.shift()!;
        for (const [a, b] of [[ci + 1, cj], [ci - 1, cj], [ci, cj + 1], [ci, cj - 1]]) {
          const kind = TILE_BY_CHAR.get(at(a, b))?.kind;
          const k = s * N + b * w + a;
          if (!kind || kind === 'void' || kind === 'wall' || kind === 'rail' || seen.has(k)) continue;
          seen.add(k);
          queue.push([a, b]);
        }
      }
      let best = -1, bestD = Infinity;
      for (const t of targets) {
        if (seen.has(t)) continue;
        const ts = Math.floor(t / N), tl = t % N;
        const dd = Math.hypot((tl % w) - i, Math.floor(tl / w) - j, (ts - s) * 2);
        if (dd < bestD) { bestD = dd; best = t; }
      }
      out.set(s * N + j * w + i, best);
    }
  });
  return out;
}

export const LIMITS = { minSize: 3, maxSize: 96, minCount: 10, maxCount: 120 } as const;

export function levelSize(level: LevelData) {
  return { w: level.tiles[0]?.length ?? 0, d: level.tiles.length };
}

/** Lista de problemas en español; vacía si el nivel es válido. */
export function validateLevel(level: LevelData): string[] {
  const errors: string[] = [];
  const { w, d } = levelSize(level);
  if (d < LIMITS.minSize || w < LIMITS.minSize) errors.push(`El nivel es demasiado pequeño (mínimo ${LIMITS.minSize}x${LIMITS.minSize}).`);
  if (d > LIMITS.maxSize || w > LIMITS.maxSize) errors.push(`El nivel es demasiado grande (máximo ${LIMITS.maxSize}x${LIMITS.maxSize}).`);
  const grids = storyGrids(level);
  if (grids.length > MAX_STORIES) errors.push(`Como mucho ${MAX_STORIES} plantas.`);

  const counts = new Map<string, number>();
  grids.forEach((g, s) => {
    const where = s ? ` de la planta ${s}` : '';
    if (g.tiles.length !== d || g.heights.length !== d) errors.push(`La planta ${s} no tiene ${d} filas en casillas y alturas.`);
    for (let j = 0; j < g.tiles.length; j++) {
      const row = g.tiles[j];
      const hrow = g.heights[j] ?? '';
      if (row.length !== w) errors.push(`La fila ${j}${where} no mide ${w} casillas.`);
      if (hrow.length !== row.length) errors.push(`La fila ${j}${where} de alturas no coincide con la de casillas.`);
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (!TILE_BY_CHAR.has(ch)) errors.push(`Casilla desconocida "${ch}" en (${i}, ${j})${where}.`);
        counts.set(ch, (counts.get(ch) ?? 0) + 1);
        const h = hrow[i];
        if (h !== undefined && !(h >= '0' && h <= '9')) errors.push(`Altura no válida "${h}" en (${i}, ${j})${where}.`);
      }
    }
  });
  for (const t of TILES) {
    if (t.unique && (counts.get(t.char) ?? 0) !== 1) errors.push(`Tiene que haber exactamente una casilla de "${t.label}".`);
  }
  for (const ch of ['A', 'B'] as Channel[]) {
    const sw = TILES.filter((t) => t.kind === 'switch' && t.channel === ch).some((t) => counts.get(t.char));
    const door = TILES.filter((t) => t.kind === 'door' && t.channel === ch).some((t) => counts.get(t.char));
    if (door && !sw) errors.push(`Hay puerta ${ch} pero ningún interruptor ${ch}.`);
    const need = level.need?.[ch];
    if (sw && need !== undefined && (need < 1 || need > level.count)) errors.push(`El interruptor ${ch} pide un peso imposible (${need}).`);
  }
  errors.push(...traceRails(level).errors);
  errors.push(...rampErrors(level));
  const targets = cannonTargets(level);
  for (const [from, to] of targets) {
    const s = Math.floor(from / (w * d)), local = from % (w * d);
    if (to < 0) errors.push(`El cañón de (${local % w}, ${Math.floor(local / w)})${s ? ` de la planta ${s}` : ''} no tiene ninguna diana a la que no se llegue andando.`);
  }
  if (level.count < LIMITS.minCount || level.count > LIMITS.maxCount) {
    errors.push(`El limo debe tener entre ${LIMITS.minCount} y ${LIMITS.maxCount} limitos.`);
  }
  if (level.keepPct !== undefined && (level.keepPct <= 0 || level.keepPct > 1)) {
    errors.push('El limo a conservar para la 3ª estrella debe estar entre 0 y 1.');
  }
  return errors;
}

/** Nivel vacío con suelo y muro perimetral, punto de partida del editor. */
export function createEmptyLevel(w = 11, d = 15, name = 'Nivel nuevo'): LevelData {
  const tiles: string[] = [];
  const heights: string[] = [];
  for (let j = 0; j < d; j++) {
    let row = '';
    for (let i = 0; i < w; i++) row += i === 0 || j === 0 || i === w - 1 || j === d - 1 ? '#' : '0';
    tiles.push(row);
    heights.push('0'.repeat(w));
  }
  const mid = Math.floor(w / 2);
  tiles[d - 2] = replaceAt(tiles[d - 2], mid, 'P');
  tiles[1] = replaceAt(tiles[1], mid, 'T');
  return { format: LEVEL_FORMAT, id: `custom-${Date.now().toString(36)}`, name, count: 80, tiles, heights };
}

export function replaceAt(row: string, i: number, ch: string): string {
  return row.slice(0, i) + ch + row.slice(i + 1);
}

/** Ajusta la base de cada muro al suelo más alto que toca (ayuda del editor). */
export function autoWallHeights(level: LevelData): LevelData {
  const { w, d } = levelSize(level);
  const heights = level.heights.slice();
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      if (level.tiles[j][i] !== '#') continue;
      let base = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const t = level.tiles[j + dj]?.[i + di];
          if (!t || t === '#' || t === '.') continue;
          base = Math.max(base, Number(level.heights[j + dj][i + di]));
        }
      }
      heights[j] = replaceAt(heights[j], i, String(base));
    }
  }
  return { ...level, heights };
}

// ------------------------------------------------------------------ guardar / compartir

export function encodeLevel(level: LevelData): string {
  return JSON.stringify(level);
}

/** Lee un nivel (texto JSON o código compartido), migra versiones y valida. */
export function decodeLevel(text: string): { level: LevelData | null; errors: string[] } {
  let raw: unknown;
  try {
    const trimmed = text.trim();
    raw = JSON.parse(trimmed.startsWith('{') ? trimmed : fromShareCode(trimmed));
  } catch {
    return { level: null, errors: ['No es un nivel válido.'] };
  }
  const level = migrate(raw);
  if (!level) return { level: null, errors: ['Versión de nivel no soportada.'] };
  const errors = validateLevel(level);
  return { level: errors.length ? null : level, errors };
}

function migrate(raw: unknown): LevelData | null {
  const r = raw as Partial<LevelData>;
  if (r && r.format === LEVEL_FORMAT && Array.isArray(r.tiles) && Array.isArray(r.heights)) return r as LevelData;
  return null;
}

/** Código corto para compartir un nivel (base64url del JSON). */
export function toShareCode(level: LevelData): string {
  const bytes = new TextEncoder().encode(encodeLevel(level));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromShareCode(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
