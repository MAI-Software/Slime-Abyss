import type { ControlMode } from './input';
import type { Lang } from './i18n';

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
  /** accesorios que tiene el jugador */
  owned: string[];
  equipped: string | null;
  /** monedas gastadas en la tienda (el saldo = monedas conseguidas − gastadas) */
  spent: number;
  /** capítulos cuya recompensa ya se entregó */
  rewards: string[];
}

const KEY = 'blub-save';

export function loadSave(): Save {
  const fresh: Save = { v: 3, control: 'joystick', sound: true, vibration: true, lang: null, floors: {}, owned: [], equipped: null, spent: 0, rewards: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (s?.v === 3) return { ...fresh, ...s };
    // migración desde v2: se conserva el progreso
    if (s?.v === 2) return { ...fresh, control: s.control ?? 'joystick', sound: s.sound ?? true, floors: s.floors ?? {} };
  } catch { /* primera vez o modo privado */ }
  return fresh;
}

export function writeSave(save: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* modo privado */ }
}
