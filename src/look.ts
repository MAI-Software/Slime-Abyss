/**
  Apariencia del limo (pantalla Mi limo): color del cuerpo y estilo de ojos, boca y mofletes.
  Solo visual. Cada estilo de cara es un modelo de assets.glb:
    ojos face_eye_<id> (con hijo face_eye_<id>_look), bocas face_mouth_<id>, mofletes face_blush_<id>.
*/

export interface BodyColor {
  /** color del cuerpo */
  color: number;
  /** brillo interior */
  emissive: number;
  /** borde brillante (RGB 0..1) */
  rim: [number, number, number];
}

/**
  Colores elegibles: ninguno puede confundirse con un estado del juego
  (aceite marrón amarillento, llamas naranjas, congelado celeste).
*/
export const BODY_COLORS = {
  blue: { color: 0x2f8cff, emissive: 0x0b3a8c, rim: [0.45, 0.8, 1.0] },
  green: { color: 0x2fcf6a, emissive: 0x0b5a2a, rim: [0.6, 1.0, 0.65] },
  pink: { color: 0xff5fa8, emissive: 0x8c1d4f, rim: [1.0, 0.72, 0.88] },
  purple: { color: 0x9b5cff, emissive: 0x3d1a8c, rim: [0.8, 0.66, 1.0] },
  black: { color: 0x2e3144, emissive: 0x0e1020, rim: [0.62, 0.68, 0.95] },
} satisfies Record<string, BodyColor>;

export type BodyColorId = keyof typeof BODY_COLORS;

export const EYES = ['round', 'dot', 'sparkle', 'cat'] as const;
export const MOUTHS = ['cat', 'smile', 'fang', 'tongue'] as const;
export const CHEEKS = ['lines', 'spots', 'hearts', 'none'] as const;

export interface SlimeLook {
  color: BodyColorId;
  eyes: (typeof EYES)[number];
  mouth: (typeof MOUTHS)[number];
  cheeks: (typeof CHEEKS)[number];
}

export const DEFAULT_LOOK: SlimeLook = { color: 'blue', eyes: 'round', mouth: 'cat', cheeks: 'lines' };

/** Corrige un aspecto guardado (valores desconocidos → por defecto). */
export function sanitizeLook(raw: Partial<SlimeLook> | undefined): SlimeLook {
  const pick = <T extends string>(list: readonly T[], v: unknown, def: T): T => (list.includes(v as T) ? (v as T) : def);
  return {
    // 'obsidian' se llamaba así antes de ser 'black'; 'red' se quitó (se confundía con las llamas)
    color: pick(Object.keys(BODY_COLORS) as BodyColorId[], (raw?.color as string) === 'obsidian' ? 'black' : raw?.color, DEFAULT_LOOK.color),
    eyes: pick(EYES, raw?.eyes, DEFAULT_LOOK.eyes),
    mouth: pick(MOUTHS, raw?.mouth, DEFAULT_LOOK.mouth),
    cheeks: pick(CHEEKS, raw?.cheeks, DEFAULT_LOOK.cheeks),
  };
}
