/**
  Coleccionables: piezas de adorno que se exponen en la habitación del menú.
  Cada una tiene su modelo (col_* en assets.glb), su hueco en la habitación (slot_col_*)
  y una condición que se comprueba al terminar un piso.
*/

export type Unlock =
  /** tesoro secreto (gema) de un piso concreto: se llega por rutas escondidas */
  | { kind: 'secret'; floor: string }
  /** todos los pisos del capítulo completados */
  | { kind: 'chapterDone' }
  /** todas las monedas de todos los pisos del capítulo */
  | { kind: 'allCoins' }
  /** todas las estrellas del capítulo */
  | { kind: 'allStars' }
  /** un logro concreto */
  | { kind: 'achievement'; id: string };

/** Dónde se expone en la habitación: estanterías (caben 9 en cada una), vitrinas, colgado en la pared o en el suelo. */
export type Place = 'shelf' | 'vitrina' | 'wall' | 'floor';

export interface Collectible {
  id: string;
  /** capítulo al que pertenece (los de logros no tienen) */
  chapter?: string;
  place: Place;
  unlock: Unlock;
}

/**
  Mundo alternativo (por diseñar): se abrirá al completar todos los pisos del juego con todas sus gemas secretas.
*/
export function altWorldUnlocked(chapters: { floors: { id: string; tiles: string[] }[] }[], floors: Record<string, { done: boolean; secret?: boolean } | undefined>) {
  return chapters.every((ch) => ch.floors.every((f) => {
    const s = floors[f.id];
    return !!s?.done && (!f.tiles.some((r) => r.includes('G')) || !!s.secret);
  }));
}

const C1 = 'cripta-azul', C2 = 'raices-colgantes', C3 = 'grietas-heladas', C4 = 'arenas-hundidas';

export const COLLECTIBLES: Collectible[] = [
  // capítulo 1
  { id: 'col_crystal_skull', chapter: C1, place: 'vitrina', unlock: { kind: 'secret', floor: 'c1-filo-de-cuchilla' } },
  { id: 'col_ancient_vase', chapter: C1, place: 'vitrina', unlock: { kind: 'secret', floor: 'c1-salto-al-abismo' } },
  { id: 'col_blue_orb', chapter: C1, place: 'shelf', unlock: { kind: 'secret', floor: 'c1-gran-cripta' } },
  { id: 'col_crypt_key', chapter: C1, place: 'shelf', unlock: { kind: 'chapterDone' } },
  { id: 'col_coin_chest', chapter: C1, place: 'shelf', unlock: { kind: 'allCoins' } },
  { id: 'col_trophy', chapter: C1, place: 'vitrina', unlock: { kind: 'allStars' } },
  // capítulo 2
  { id: 'col_root_lantern', chapter: C2, place: 'shelf', unlock: { kind: 'secret', floor: 'c2-bifurcacion' } },
  { id: 'col_mini_train', chapter: C2, place: 'shelf', unlock: { kind: 'secret', floor: 'c2-sobre-railes' } },
  { id: 'col_spring_toy', chapter: C2, place: 'shelf', unlock: { kind: 'secret', floor: 'c2-salto-a-la-estacion' } },
  { id: 'col_station_sign', chapter: C2, place: 'wall', unlock: { kind: 'chapterDone' } },
  { id: 'col_acorn_jar', chapter: C2, place: 'shelf', unlock: { kind: 'allCoins' } },
  { id: 'col_leaf_frame', chapter: C2, place: 'wall', unlock: { kind: 'allStars' } },
  // capítulo 3
  { id: 'col_ice_crystal', chapter: C3, place: 'shelf', unlock: { kind: 'secret', floor: 'c3-gran-grieta' } },
  { id: 'col_cracked_egg', chapter: C3, place: 'shelf', unlock: { kind: 'secret', floor: 'c3-suelo-fragil' } },
  { id: 'col_fire_lamp', chapter: C3, place: 'shelf', unlock: { kind: 'secret', floor: 'c3-pista-ardiente' } },
  { id: 'col_pickaxes', chapter: C3, place: 'wall', unlock: { kind: 'chapterDone' } },
  { id: 'col_geode', chapter: C3, place: 'shelf', unlock: { kind: 'allCoins' } },
  { id: 'col_crystal_crown', chapter: C3, place: 'shelf', unlock: { kind: 'allStars' } },
  // capítulo 4
  { id: 'col_scarab', chapter: C4, place: 'shelf', unlock: { kind: 'secret', floor: 'c4-dunas' } },
  { id: 'col_hourglass', chapter: C4, place: 'shelf', unlock: { kind: 'secret', floor: 'c4-sendero-diagonal' } },
  { id: 'col_compass', chapter: C4, place: 'shelf', unlock: { kind: 'secret', floor: 'c4-remolino' } },
  { id: 'col_desert_mask', chapter: C4, place: 'wall', unlock: { kind: 'chapterDone' } },
  { id: 'col_cactus_pot', chapter: C4, place: 'floor', unlock: { kind: 'allCoins' } },
  { id: 'col_sphinx', chapter: C4, place: 'floor', unlock: { kind: 'allStars' } },
  // logros
  { id: 'col_slime_plush', place: 'shelf', unlock: { kind: 'achievement', id: 'squeeze-100' } },
  { id: 'col_dizzy_top', place: 'shelf', unlock: { kind: 'achievement', id: 'dizzy-20' } },
  { id: 'col_snow_globe', place: 'shelf', unlock: { kind: 'achievement', id: 'frozen-10' } },
  { id: 'col_star_banner', place: 'wall', unlock: { kind: 'achievement', id: 'stars-120' } },
  { id: 'col_painting', place: 'wall', unlock: { kind: 'achievement', id: 'style-10' } },
  { id: 'col_blueprint', place: 'wall', unlock: { kind: 'achievement', id: 'creator-10' } },
  { id: 'col_globe', place: 'floor', unlock: { kind: 'achievement', id: 'floors-40' } },
  { id: 'col_cannonballs', place: 'floor', unlock: { kind: 'achievement', id: 'cannon-25' } },
];
