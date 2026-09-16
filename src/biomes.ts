/**
  Temas del abismo: cambian las texturas de suelos y muros, el cielo, la niebla, las luces y las motas del fondo.
    capítulos 1-3 piedra y roca · 4-6 arena · 7-9 hielo · 10-12 tecnológico (mezcla todas las mecánicas)
  Las texturas de cada tema (menos la piedra) se cargan al entrar en uno de sus pisos: ver Assets.loadBiome.
*/

export type Biome = 'stone' | 'desert' | 'frost' | 'tech';

export interface BiomeLook {
  /** degradado del cielo: arriba, medio, abajo */
  sky: [string, string, string];
  fog: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  rim: number;
  /** motas que suben y resplandor lejano bajo el nivel */
  dots: number;
  glow: [string, string, string];
}

export const BIOMES: Record<Biome, BiomeLook> = {
  stone: {
    sky: ['#3a2b78', '#241a52', '#0e0a22'], fog: 0x191336,
    hemiSky: 0xd2e2ff, hemiGround: 0x3d2d5c, sun: 0xffe4c0, rim: 0x86a8ff,
    dots: 0xa8d4ff, glow: ['rgba(90,120,255,0.55)', 'rgba(80,60,200,0.22)', 'rgba(40,20,90,0)'],
  },
  desert: {
    sky: ['#c2713f', '#6e3244', '#1f0f1c'], fog: 0x3a1c24,
    hemiSky: 0xffe2bd, hemiGround: 0x6b3d2a, sun: 0xffcf96, rim: 0xffa66b,
    dots: 0xffd08a, glow: ['rgba(255,150,70,0.5)', 'rgba(200,80,60,0.2)', 'rgba(80,30,30,0)'],
  },
  frost: {
    sky: ['#5f98c8', '#2a5582', '#0a1830'], fog: 0x14304e,
    hemiSky: 0xe4f4ff, hemiGround: 0x36577f, sun: 0xf2f8ff, rim: 0x9fd8ff,
    dots: 0xe8f7ff, glow: ['rgba(140,220,255,0.5)', 'rgba(80,150,230,0.22)', 'rgba(20,50,100,0)'],
  },
  tech: {
    sky: ['#1f3346', '#0d1826', '#04070d'], fog: 0x0b1420,
    hemiSky: 0xd2ecff, hemiGround: 0x2b2244, sun: 0xe2ebff, rim: 0x6ff7ff,
    dots: 0x6ff7ff, glow: ['rgba(60,240,255,0.45)', 'rgba(200,60,220,0.2)', 'rgba(30,10,60,0)'],
  },
};

/** Tema de un capítulo por su posición (0 = capítulo 1). */
export function biomeOfChapter(index: number): Biome {
  return index < 3 ? 'stone' : index < 6 ? 'desert' : index < 9 ? 'frost' : 'tech';
}

/** Prefijo de las texturas de cada tema en src/textures ('' = las de siempre). */
export const TEXTURE_PREFIX: Record<Biome, string> = { stone: '', desert: 'desert_', frost: 'frost_', tech: 'tech_' };
