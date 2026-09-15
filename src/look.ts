/**
  Apariencia del limo (pantalla Mi limo): color del cuerpo y estilo de ojos, boca y mofletes.
  Solo visual. Cada estilo de cara es un modelo de assets.glb:
    ojos face_eye_<id> (con hijo face_eye_<id>_look), bocas face_mouth_<id>, mofletes face_blush_<id>.
  Algunas opciones son raras y se desbloquean con logros (LOOK_UNLOCKS).
*/

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
}

/**
  Colores elegibles: ninguno puede confundirse con un estado del juego
  (aceite marrón apagado, llamas naranjas, congelado celeste). El oro es metálico y brillante.
*/
export const BODY_COLORS = {
  blue: { color: 0x2f8cff, emissive: 0x0b3a8c, rim: [0.45, 0.8, 1.0] },
  green: { color: 0x2fcf6a, emissive: 0x0b5a2a, rim: [0.6, 1.0, 0.65] },
  pink: { color: 0xff5fa8, emissive: 0x8c1d4f, rim: [1.0, 0.72, 0.88] },
  purple: { color: 0x9b5cff, emissive: 0x3d1a8c, rim: [0.8, 0.66, 1.0] },
  black: { color: 0x2e3144, emissive: 0x0e1020, rim: [0.62, 0.68, 0.95] },
  metal: { color: 0xe8edf5, emissive: 0x39424f, rim: [0.95, 0.98, 1.0], metalness: 0.6, roughness: 0.18 },
  gold: { color: 0xffd24a, emissive: 0x8a5a00, rim: [1.0, 0.93, 0.6], metalness: 0.55, roughness: 0.22 },
} satisfies Record<string, BodyColor>;

export type BodyColorId = keyof typeof BODY_COLORS;

export const EYES = ['round', 'dot', 'sparkle', 'cat', 'star', 'heart'] as const;
export const MOUTHS = ['cat', 'smile', 'fang', 'tongue', 'grin', 'pout'] as const;
export const CHEEKS = ['lines', 'spots', 'hearts', 'none', 'stars', 'freckles'] as const;

export interface SlimeLook {
  color: BodyColorId;
  eyes: (typeof EYES)[number];
  mouth: (typeof MOUTHS)[number];
  cheeks: (typeof CHEEKS)[number];
}

export const DEFAULT_LOOK: SlimeLook = { color: 'blue', eyes: 'round', mouth: 'cat', cheeks: 'lines' };

/** Opciones raras: "apartado:opción" → logro que la desbloquea. */
export const LOOK_UNLOCKS: Record<string, string> = {
  'color:gold': 'coins-c1',
  'color:metal': 'stars-30',
  'eyes:star': 'stars-10',
  'eyes:heart': 'full-slime',
  'mouth:grin': 'first-treasure',
  'mouth:pout': 'rider-10',
  'cheeks:stars': 'coins-50',
  'cheeks:freckles': 'secrets-2',
};

export function lookOptionUnlocked(key: keyof SlimeLook, opt: string, achievements: readonly string[]) {
  const needed = LOOK_UNLOCKS[`${key}:${opt}`];
  return !needed || achievements.includes(needed);
}

/** Corrige un aspecto guardado (valores desconocidos o aún bloqueados → por defecto). */
export function sanitizeLook(raw: Partial<SlimeLook> | undefined, achievements: readonly string[] = []): SlimeLook {
  const pick = <K extends keyof SlimeLook>(key: K, list: readonly SlimeLook[K][], v: unknown): SlimeLook[K] =>
    list.includes(v as SlimeLook[K]) && lookOptionUnlocked(key, String(v), achievements) ? (v as SlimeLook[K]) : DEFAULT_LOOK[key];
  return {
    // 'obsidian' se llamaba así antes de ser 'black'; 'red' se quitó (se confundía con las llamas)
    color: pick('color', Object.keys(BODY_COLORS) as BodyColorId[], (raw?.color as string) === 'obsidian' ? 'black' : raw?.color),
    eyes: pick('eyes', EYES, raw?.eyes),
    mouth: pick('mouth', MOUTHS, raw?.mouth),
    cheeks: pick('cheeks', CHEEKS, raw?.cheeks),
  };
}
