/**
  Apariencia del limo (pantalla Mi limo): color del cuerpo y estilo de ojos, boca y mofletes.
  Solo visual. Cada estilo de cara es un modelo de assets.glb:
    ojos face_eye_<id> (con hijo face_eye_<id>_look), bocas face_mouth_<id>, mofletes face_blush_<id>.
  Algunas opciones son raras y se desbloquean con logros (LOOK_UNLOCKS).
*/
import type { GemKind } from './biomes';

export interface BodyColor {
  /** color del cuerpo */
  color: number;
  /** brillo interior */
  emissive: number;
  /** borde brillante (RGB 0..1) */
  rim: [number, number, number];
  /** colores metálicos: reflejan el entorno */
  metalness?: number;
  roughness?: number;
  /** colores translúcidos (agua): opacidad del centro; los bordes quedan casi opacos */
  opacity?: number;
  /** colores de gema: destellos diminutos que titilan (0..1) */
  sparkle?: number;
  /** destellos de colores (diamante) */
  rainbow?: boolean;
}

/**
  Colores elegibles: ninguno puede confundirse con un estado del juego
  (aceite marrón apagado, llamas naranjas, congelado celeste). El oro es metálico y brillante.
  Los de gema se compran con las gemas secretas: facetados y con destellos (el rubí es rojo intenso, no naranja,
  y el diamante blanco y con reflejos de colores, no celeste).
*/
export const BODY_COLORS = {
  blue: { color: 0x2f8cff, emissive: 0x0b3a8c, rim: [0.45, 0.8, 1.0] },
  green: { color: 0x2fcf6a, emissive: 0x0b5a2a, rim: [0.6, 1.0, 0.65] },
  pink: { color: 0xff5fa8, emissive: 0x8c1d4f, rim: [1.0, 0.72, 0.88] },
  purple: { color: 0x9b5cff, emissive: 0x3d1a8c, rim: [0.8, 0.66, 1.0] },
  black: { color: 0x2e3144, emissive: 0x0e1020, rim: [0.62, 0.68, 0.95] },
  metal: { color: 0xe8edf5, emissive: 0x39424f, rim: [0.95, 0.98, 1.0], metalness: 0.6, roughness: 0.18 },
  gold: { color: 0xffd24a, emissive: 0x8a5a00, rim: [1.0, 0.93, 0.6], metalness: 0.55, roughness: 0.22 },
  rosegold: { color: 0xf3b3a0, emissive: 0x6b3428, rim: [1.0, 0.86, 0.82], metalness: 0.55, roughness: 0.2 },

  midnight: { color: 0x243a8f, emissive: 0x0a1238, rim: [0.6, 0.78, 1.0], roughness: 0.08 },
  // agua: casi incolora y translúcida (el congelado es celeste opaco y no tiembla)
  water: { color: 0xa6e3f2, emissive: 0x0f5266, rim: [0.8, 0.96, 1.0], roughness: 0.03, opacity: 0.22 },
  ruby: { color: 0xd4103c, emissive: 0x5e0016, rim: [1.0, 0.6, 0.72], metalness: 0.3, roughness: 0.03, sparkle: 1 },
  sapphire: { color: 0x1b4fe6, emissive: 0x071b6b, rim: [0.62, 0.8, 1.0], metalness: 0.3, roughness: 0.03, sparkle: 1 },
  emerald: { color: 0x0fbf73, emissive: 0x04452a, rim: [0.6, 1.0, 0.82], metalness: 0.3, roughness: 0.03, sparkle: 1 },
  diamond: { color: 0xeef6ff, emissive: 0x2d4a6a, rim: [1.0, 1.0, 1.0], metalness: 0.4, roughness: 0.02, sparkle: 1, rainbow: true },
} satisfies Record<string, BodyColor>;

export type BodyColorId = keyof typeof BODY_COLORS;

/** 'none' va primero en cada apartado: sin ese rasgo (la vista previa es solo el círculo del color). */
export const EYES = ['none', 'round', 'dot', 'cat', 'sparkle', 'star', 'heart', 'sleepy', 'wink', 'glasses', 'tomoe', 'ripple', 'button', 'spiral', 'moon', 'teary'] as const;
export const MOUTHS = ['none', 'cat', 'smile', 'tongue', 'fang', 'grin', 'pout', 'smirk', 'vampire', 'wobbly', 'flat', 'zigzag', 'bunny', 'kiss', 'drool', 'teeth'] as const;
export const CHEEKS = ['none', 'lines', 'spots', 'whiskers', 'hearts', 'stars', 'freckles', 'swirls', 'bandage', 'sparkles', 'paint', 'flowers', 'mole'] as const;

/** Colores de iris para los ojos con iris normal (material "Iris" del modelo). */
export const IRIS_COLORS = {
  blue: 0x1e3a8a, brown: 0x6b3f1d, green: 0x15803d, violet: 0x6d28d9, amber: 0xb45309, pink: 0xbe185d, gray: 0x475569,
} as const;
export type IrisId = keyof typeof IRIS_COLORS;
export const IRIS_EYES = new Set<string>(['round', 'sparkle', 'wink', 'glasses', 'teary']);

/** Ojos con modelo distinto a cada lado (face_eye_<id>_l / _r). */
export const EYES_PER_SIDE = new Set<string>(['wink']);
/** Ojos cuyo lado derecho es el izquierdo reflejado (las gafas llevan medio puente hacia el centro). */
export const EYES_MIRRORED = new Set<string>(['glasses']);

export interface SlimeLook {
  color: BodyColorId;
  eyes: (typeof EYES)[number];
  mouth: (typeof MOUTHS)[number];
  cheeks: (typeof CHEEKS)[number];
  iris: IrisId;
}

export const DEFAULT_LOOK: SlimeLook = { color: 'blue', eyes: 'round', mouth: 'cat', cheeks: 'lines', iris: 'blue' };

/** Opciones raras: "apartado:opción" → logro que la desbloquea (un logro puede dar varias). */
export const LOOK_UNLOCKS: Record<string, string> = {
  'mouth:grin': 'first-treasure',
  'eyes:star': 'stars-10',
  'eyes:sparkle': 'stars-10',
  'cheeks:stars': 'coins-50',
  'mouth:fang': 'coins-50',
  'cheeks:freckles': 'secrets-2',
  'cheeks:hearts': 'secrets-2',
  'eyes:heart': 'full-slime',
  'mouth:pout': 'rider-10',
  'mouth:wobbly': 'jumper-20',
  'cheeks:bandage': 'burner-10',
  'eyes:wink': 'chapter-1',
  'eyes:tomoe': 'coins-c1',
  'eyes:ripple': 'stars-50',
  'color:water': 'chapter-2',

  'mouth:smirk': 'chapter-2',
  'eyes:sleepy': 'floors-10',
  'color:midnight': 'floors-20',
  'color:rosegold': 'stars-50',
  'mouth:vampire': 'coins-150',
  'cheeks:sparkles': 'secret-roots',
  'eyes:glasses': 'rider-50',
  'cheeks:swirls': 'squeeze-30',

};

/** Opciones que se compran con monedas: "apartado:opción" → precio. Las monedas no se pueden farmear (mejor marca de cada piso). */
export const LOOK_PRICES: Record<string, number> = {
  'color:gold': 999,
};

/** Gemas secretas de cada tipo que hay en el juego (una por piso secreto de sus tres capítulos). */
export const GEMS_PER_KIND = 9;
/** Colores de gema: se consiguen con todas las gemas secretas de su tipo. */
export const LOOK_GEM_PRICES: Record<string, GemKind> = {
  'color:ruby': 'ruby',
  'color:sapphire': 'sapphire',
  'color:emerald': 'emerald',
  'color:diamond': 'diamond',
};

/** Opciones que ya existen pero aún no tienen forma de conseguirse: se ven bloqueadas («Próximamente»). */
export const LOOK_SOON = new Set<string>([
  'color:metal',
  'eyes:button', 'eyes:spiral', 'eyes:moon', 'eyes:teary',
  'mouth:flat', 'mouth:zigzag', 'mouth:bunny', 'mouth:kiss', 'mouth:drool', 'mouth:teeth',
  'cheeks:paint', 'cheeks:flowers', 'cheeks:mole',
]);

/** bought: opciones compradas ("apartado:opción"). */
export function lookOptionUnlocked(key: keyof SlimeLook, opt: string, achievements: readonly string[], bought: readonly string[] = []) {
  const id = `${key}:${opt}`;
  if (LOOK_SOON.has(id)) return false;
  if (LOOK_PRICES[id] || LOOK_GEM_PRICES[id]) return bought.includes(id);
  const needed = LOOK_UNLOCKS[id];
  return !needed || achievements.includes(needed);
}

/** Corrige un aspecto guardado (valores desconocidos o aún bloqueados → por defecto). */
export function sanitizeLook(raw: Partial<SlimeLook> | undefined, achievements: readonly string[] = [], bought: readonly string[] = []): SlimeLook {
  const pick = <K extends keyof SlimeLook>(key: K, list: readonly SlimeLook[K][], v: unknown): SlimeLook[K] =>
    list.includes(v as SlimeLook[K]) && lookOptionUnlocked(key, String(v), achievements, bought) ? (v as SlimeLook[K]) : DEFAULT_LOOK[key];
  return {
    // 'obsidian' se llamaba así antes de ser 'black'; 'red' se quitó (se confundía con las llamas)
    color: pick('color', Object.keys(BODY_COLORS) as BodyColorId[], (raw?.color as string) === 'obsidian' ? 'black' : raw?.color),
    eyes: pick('eyes', EYES, raw?.eyes),
    mouth: pick('mouth', MOUTHS, raw?.mouth),
    cheeks: pick('cheeks', CHEEKS, raw?.cheeks),
    iris: pick('iris', Object.keys(IRIS_COLORS) as IrisId[], raw?.iris),
  };
}
