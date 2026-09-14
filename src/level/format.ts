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
  | 'void' | 'floor' | 'wall' | 'fire' | 'firet' | 'ice' | 'jump' | 'switch' | 'door' | 'start' | 'treasure';

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
}

export const TILES: readonly TileDef[] = [
  { char: '.', kind: 'void', label: 'Vacío', color: '#140f2b', hazard: true },
  { char: '0', kind: 'floor', label: 'Suelo', color: '#e9d7ad' },
  { char: '#', kind: 'wall', label: 'Muro', raise: 1.5, color: '#6f6798' },
  { char: 'P', kind: 'start', label: 'Salida del limo', unique: true, color: '#2f8cff' },
  { char: 'T', kind: 'treasure', label: 'Tesoro', unique: true, color: '#f5b301' },
  { char: 'F', kind: 'fire', label: 'Fuego', color: '#ff5a1f', hazard: true },
  { char: 'X', kind: 'firet', label: 'Fuego intermitente', color: '#ff9a3c', hazard: true },
  { char: 'I', kind: 'ice', label: 'Hielo', friction: 0.25, color: '#bfeaff' },
  { char: 'J', kind: 'jump', label: 'Plataforma de salto', color: '#ec4899' },
  { char: 'S', kind: 'switch', label: 'Interruptor A', channel: 'A', color: '#f59e0b' },
  { char: 's', kind: 'switch', label: 'Interruptor B', channel: 'B', color: '#22c55e' },
  { char: 'D', kind: 'door', label: 'Puerta A', channel: 'A', raise: 1.5, color: '#b45309' },
  { char: 'd', kind: 'door', label: 'Puerta B', channel: 'B', raise: 1.5, color: '#15803d' },
];

export const TILE_BY_CHAR: ReadonlyMap<string, TileDef> = new Map(TILES.map((t) => [t.char, t]));
export const HEIGHT_STEP = 0.5;
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
  /** Fracción mínima de limo para no perder (0 = no se puede perder). */
  minPct: number;
  tiles: string[];
  heights: string[];
  /** Peso necesario por canal de interruptor. */
  need?: Partial<Record<Channel, number>>;
  /** Canales cuyo interruptor se queda pulsado. */
  latch?: Partial<Record<Channel, boolean>>;
  tips?: Tip[];
  /** Nivel de pruebas: siempre desbloqueado y fuera de la progresión. */
  practice?: boolean;
}

export const LIMITS = { minSize: 3, maxSize: 96, minCount: 10, maxCount: 80 } as const;

export function levelSize(level: LevelData) {
  return { w: level.tiles[0]?.length ?? 0, d: level.tiles.length };
}

/** Lista de problemas en español; vacía si el nivel es válido. */
export function validateLevel(level: LevelData): string[] {
  const errors: string[] = [];
  const { w, d } = levelSize(level);
  if (d < LIMITS.minSize || w < LIMITS.minSize) errors.push(`El nivel es demasiado pequeño (mínimo ${LIMITS.minSize}x${LIMITS.minSize}).`);
  if (d > LIMITS.maxSize || w > LIMITS.maxSize) errors.push(`El nivel es demasiado grande (máximo ${LIMITS.maxSize}x${LIMITS.maxSize}).`);
  if (level.heights.length !== d) errors.push('La capa de alturas no tiene las mismas filas que la de casillas.');

  const counts = new Map<string, number>();
  for (let j = 0; j < d; j++) {
    const row = level.tiles[j];
    const hrow = level.heights[j] ?? '';
    if (row.length !== w) errors.push(`La fila ${j} no mide ${w} casillas.`);
    if (hrow.length !== row.length) errors.push(`La fila ${j} de alturas no coincide con la de casillas.`);
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (!TILE_BY_CHAR.has(ch)) errors.push(`Casilla desconocida "${ch}" en (${i}, ${j}).`);
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      const h = hrow[i];
      if (h !== undefined && !(h >= '0' && h <= '9')) errors.push(`Altura no válida "${h}" en (${i}, ${j}).`);
    }
  }
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
  if (level.count < LIMITS.minCount || level.count > LIMITS.maxCount) {
    errors.push(`El limo debe tener entre ${LIMITS.minCount} y ${LIMITS.maxCount} limitos.`);
  }
  if (level.minPct < 0 || level.minPct >= 1) errors.push('El porcentaje mínimo debe estar entre 0 y 0.99.');
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
  return { format: LEVEL_FORMAT, id: `custom-${Date.now().toString(36)}`, name, count: 50, minPct: 0.35, tiles, heights };
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
