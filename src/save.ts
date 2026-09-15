import type { ControlMode } from './input';
import type { Lang } from './i18n';
import { DEFAULT_LOOK, sanitizeLook, type SlimeLook } from './look';

/** Mejor resultado de un piso. */
export interface FloorSave {
  done: boolean;
  allCoins: boolean;
  kept: boolean;
  bestCoins: number;
  bestPct: number;
  bestTime: number;
  secret?: boolean;
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
  /** joysticks fijos en vez de flotantes */
  joyFixed: boolean;
  /** ya se enseñó el aviso del joystick de cámara */
  cameraHint: boolean;
}

const KEY = 'slime-abyss-save';
/** clave del nombre anterior del juego: se lee una vez para no perder el progreso */
const OLD_KEY = 'blub-save';

export function loadSave(): Save {
  const fresh: Save = { v: 3, control: 'joystick', sound: true, vibration: true, lang: null, floors: {}, collectibles: [], look: { ...DEFAULT_LOOK }, joyFixed: false, cameraHint: false };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY) ?? '');
    if (s?.v === 3) {
      // los accesorios (owned/equipped/spent/rewards) se quitaron: no se arrastran
      const { owned: _o, equipped: _e, spent: _s, rewards: _r, ...rest } = s;
      return { ...fresh, ...rest, look: sanitizeLook(rest.look) };
    }
    // migración desde v2: se conserva el progreso
    if (s?.v === 2) return { ...fresh, control: s.control ?? 'joystick', sound: s.sound ?? true, floors: s.floors ?? {} };
  } catch { /* primera vez o modo privado */ }
  return fresh;
}

export function writeSave(save: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* modo privado */ }
}
