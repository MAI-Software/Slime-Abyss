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

export const BODY_COLORS = {
  blue: { color: 0x2f8cff, emissive: 0x0b3a8c, rim: [0.45, 0.8, 1.0] },
  green: { color: 0x2fcf6a, emissive: 0x0b5a2a, rim: [0.6, 1.0, 0.65] },
  pink: { color: 0xff5fa8, emissive: 0x8c1d4f, rim: [1.0, 0.72, 0.88] },
  purple: { color: 0x9b5cff, emissive: 0x3d1a8c, rim: [0.8, 0.66, 1.0] },
  red: { color: 0xf0384e, emissive: 0x7a0f1c, rim: [1.0, 0.62, 0.62] },
  obsidian: { color: 0x474d7a, emissive: 0x1a1d40, rim: [0.7, 0.76, 1.0] },
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
    color: pick(Object.keys(BODY_COLORS) as BodyColorId[], raw?.color, DEFAULT_LOOK.color),
    eyes: pick(EYES, raw?.eyes, DEFAULT_LOOK.eyes),
    mouth: pick(MOUTHS, raw?.mouth, DEFAULT_LOOK.mouth),
    cheeks: pick(CHEEKS, raw?.cheeks, DEFAULT_LOOK.cheeks),
  };
}
