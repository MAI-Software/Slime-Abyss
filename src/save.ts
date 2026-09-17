import type { ControlMode } from './input';
import type { Lang } from './i18n';
import { DEFAULT_LOOK, sanitizeLook, type SlimeLook } from './look';
import type { LevelData } from './level/format';
import { EMPTY_STATS, type PlayStats } from './achievements';
import { COLLECTIBLES } from './collectibles';

/** Mejor resultado de un piso. */
export interface FloorSave {
  done: boolean;
  allCoins: boolean;
  kept: boolean;
  bestCoins: number;
  bestPct: number;
  bestTime: number;
  secret?: boolean;
  /** coleccionable del camino oculto encontrado */
  relic?: boolean;
}

export interface Save {
  v: 3;
  control: ControlMode;
  sound: boolean;
  vibration: boolean;
  lang: Lang | null;
  floors: Record<string, FloorSave>;
  /** coleccionables conseguidos (se exponen en la habitación del menú) */
  collectibles: string[];
  /** aspecto elegido en Mi limo */
  look: SlimeLook;
  /** logros conseguidos */
  achievements: string[];
  /** contadores de partida para los logros */
  stats: PlayStats;
  /** joysticks fijos en vez de flotantes */
  joyFixed: boolean;
  /** ya se enseñó el aviso del joystick de cámara */
  cameraHint: boolean;
  /** monedas gastadas en la tienda de Mi limo (saldo = mejores monedas de cada piso − gastadas) */
  coinsSpent: number;
  /** opciones de Mi limo compradas ("apartado:opción") */
  bought: string[];
  /** niveles del creador: 10 huecos (null = libre) */
  creations: (LevelData | null)[];
  /** código de pruebas: todo desbloqueado (también lo que aún no tiene condición) */
  unlockAll?: boolean;
}

export const CREATOR_SLOTS = 10;

/** Nivel guardado con la forma mínima correcta (el resto lo comprueba el creador antes de jugar). */
function sanitizeCreation(raw: unknown): LevelData | null {
  const l = raw as Partial<LevelData> | null;
  if (!l || !Array.isArray(l.tiles) || !Array.isArray(l.heights) || !l.tiles.length || l.tiles.length !== l.heights.length) return null;
  const w = String(l.tiles[0]).length;
  if (!w || l.tiles.some((r, j) => typeof r !== 'string' || r.length !== w || String(l.heights![j]).length !== w)) return null;
  // plantas de encima: solo las que tienen el mismo tamaño
  const stories = Array.isArray(l.stories)
    ? l.stories.filter((st) => Array.isArray(st?.tiles) && Array.isArray(st?.heights) && st.tiles.length === l.tiles!.length
      && st.tiles.every((r, j) => typeof r === 'string' && r.length === w && String(st.heights[j]).length === w))
    : [];
  return { format: 1, id: String(l.id ?? `custom-${Date.now().toString(36)}`), name: String(l.name ?? '').slice(0, 24), count: 80, tiles: l.tiles, heights: l.heights, ...(stories.length ? { stories } : {}) };
}

const KEY = 'slime-abyss-save';
/** clave del nombre anterior del juego: se lee una vez para no perder el progreso */
const OLD_KEY = 'blub-save';

export function loadSave(): Save {
  const fresh: Save = { v: 3, control: 'joystick', sound: true, vibration: true, lang: null, floors: {}, collectibles: [], look: { ...DEFAULT_LOOK }, achievements: [], stats: { ...EMPTY_STATS }, joyFixed: false, cameraHint: false, coinsSpent: 0, bought: [], creations: Array(CREATOR_SLOTS).fill(null) };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? '');
    if (s?.v === 3) {
      // los accesorios (owned/equipped/spent/rewards) se quitaron: no se arrastran
      const { owned: _o, equipped: _e, spent: _s, rewards: _r, ...rest } = s;
      // «Museo» pasó de 30 a 25 coleccionables al quitar algunos
      const achievements = (Array.isArray(rest.achievements) ? rest.achievements : []).map((id: string) => (id === 'collector-30' ? 'collector-25' : id));
      // coleccionables que ya no están en el juego (estandarte, cuadro, plano, globo, cartel de la estación)
      const collectibles = (Array.isArray(rest.collectibles) ? rest.collectibles : []).filter((id: string) => COLLECTIBLES.some((c) => c.id === id));
      const bought = Array.isArray(rest.bought) ? rest.bought : [];
      const coinsSpent = Number.isFinite(rest.coinsSpent) ? rest.coinsSpent : 0;
      const creations = Array.from({ length: CREATOR_SLOTS }, (_, k) => sanitizeCreation(Array.isArray(rest.creations) ? rest.creations[k] : null));
      return { ...fresh, ...rest, achievements, collectibles, bought, coinsSpent, creations, stats: { ...EMPTY_STATS, ...rest.stats }, look: sanitizeLook(rest.look, achievements, bought, !!rest.unlockAll) };
    }
    // migración desde v2: se conserva el progreso
    if (s?.v === 2) return { ...fresh, control: s.control ?? 'joystick', sound: s.sound ?? true, floors: s.floors ?? {} };
  } catch { /* primera vez o modo privado */ }
  return fresh;
}

export function writeSave(save: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* modo privado */ }
}
