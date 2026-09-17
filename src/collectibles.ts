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
  /** coleccionable escondido (casilla L) en un camino oculto o bloqueado de un piso sin gema */
  | { kind: 'found'; floor: string }
  /** un logro concreto */
  | { kind: 'achievement'; id: string }
  /** el tesoro más valioso: todos los pisos con todas sus gemas secretas */
  | { kind: 'legend' };

/** Dónde se expone en la habitación: estanterías (caben 9 en cada una), vitrinas, colgado en la pared o en el suelo. */
export type Place = 'shelf' | 'vitrina' | 'wall' | 'floor';

export interface Collectible {
  id: string;
  /** capítulo al que pertenece (los de logros no tienen) */
  chapter?: string;
  place: Place;
  unlock: Unlock;
  /** pieza plana hecha para colgar (sin espalda): en vitrina no gira, mira hacia donde se la ve */
  flat?: boolean;
}

/**
  Mundo alternativo (por diseñar): se abrirá al completar todos los pisos del juego con todas sus gemas secretas.
*/
export function altWorldUnlocked(chapters: { floors: { id: string; tiles: string[]; stories?: { tiles: string[] }[] }[] }[], floors: Record<string, { done: boolean; secret?: boolean } | undefined>) {
  return chapters.every((ch) => ch.floors.every((f) => {
    const s = floors[f.id];
    const hasGem = [f.tiles, ...(f.stories ?? []).map((st) => st.tiles)].some((rows) => rows.some((r) => r.includes('G')));
    return !!s?.done && (!hasGem || !!s.secret);
  }));
}

const C1 = 'cripta-azul', C2 = 'raices-colgantes', C3 = 'grietas-heladas', C4 = 'arenas-hundidas';

export const COLLECTIBLES: Collectible[] = [
  // capítulo 1
  { id: 'col_crystal_skull', chapter: C1, place: 'vitrina', unlock: { kind: 'found', floor: 'c1-hielo-que-arde' } },
  { id: 'col_ancient_vase', chapter: C1, place: 'vitrina', unlock: { kind: 'found', floor: 'c1-aceite-y-chispas' } },
  { id: 'col_blue_orb', chapter: C1, place: 'shelf', unlock: { kind: 'found', floor: 'c1-ventiladores' } },
  { id: 'col_crypt_key', chapter: C1, place: 'shelf', unlock: { kind: 'found', floor: 'c1-pasillo-de-fuego' } },
  { id: 'col_coin_chest', chapter: C1, place: 'shelf', unlock: { kind: 'found', floor: 'c1-corriente-helada' } },
  { id: 'col_trophy', chapter: C1, place: 'vitrina', unlock: { kind: 'allStars' } },
  // capítulo 2
  { id: 'col_root_lantern', chapter: C2, place: 'shelf', unlock: { kind: 'found', floor: 'c2-gran-raiz' } },
  { id: 'col_mini_train', chapter: C2, place: 'shelf', unlock: { kind: 'found', floor: 'c2-curvas' } },
  { id: 'col_spring_toy', chapter: C2, place: 'shelf', unlock: { kind: 'found', floor: 'c2-cuesta-arriba' } },
  { id: 'col_mine_cart', chapter: C2, place: 'vitrina', unlock: { kind: 'found', floor: 'c2-todos-a-bordo' } },
  { id: 'col_acorn_jar', chapter: C2, place: 'shelf', unlock: { kind: 'found', floor: 'c2-plantas-en-la-via' } },
  { id: 'col_leaf_frame', chapter: C2, place: 'vitrina', flat: true, unlock: { kind: 'allStars' } },
  // capítulo 3
  { id: 'col_ice_crystal', chapter: C3, place: 'shelf', unlock: { kind: 'found', floor: 'c3-hielo-fundido' } },
  { id: 'col_cracked_egg', chapter: C3, place: 'shelf', unlock: { kind: 'found', floor: 'c3-viento-y-grietas' } },
  { id: 'col_fire_lamp', chapter: C3, place: 'shelf', unlock: { kind: 'found', floor: 'c3-grietas-entre-llamas' } },
  { id: 'col_pickaxes', chapter: C3, place: 'vitrina', flat: true, unlock: { kind: 'found', floor: 'c3-dos-puentes' } },
  { id: 'col_geode', chapter: C3, place: 'shelf', unlock: { kind: 'found', floor: 'c3-plaza-rota' } },
  { id: 'col_crystal_crown', chapter: C3, place: 'shelf', unlock: { kind: 'allStars' } },
  // capítulo 4
  { id: 'col_scarab', chapter: C4, place: 'shelf', unlock: { kind: 'found', floor: 'c4-sierras' } },
  { id: 'col_hourglass', chapter: C4, place: 'shelf', unlock: { kind: 'found', floor: 'c4-canonazo' } },
  { id: 'col_compass', chapter: C4, place: 'shelf', unlock: { kind: 'found', floor: 'c4-pozos-y-rampas' } },
  { id: 'col_desert_mask', chapter: C4, place: 'vitrina', flat: true, unlock: { kind: 'found', floor: 'c4-fuego-del-desierto' } },
  { id: 'col_cactus_pot', chapter: C4, place: 'floor', unlock: { kind: 'found', floor: 'c4-corazon-de-arena' } },
  { id: 'col_sphinx', chapter: C4, place: 'floor', unlock: { kind: 'allStars' } },
  // logros
  { id: 'col_slime_plush', place: 'shelf', unlock: { kind: 'achievement', id: 'squeeze-100' } },
  { id: 'col_dizzy_top', place: 'shelf', unlock: { kind: 'achievement', id: 'dizzy-20' } },
  { id: 'col_snow_globe', place: 'shelf', unlock: { kind: 'achievement', id: 'frozen-10' } },
  { id: 'col_cannonballs', place: 'floor', unlock: { kind: 'achievement', id: 'cannon-25' } },
  // lo único colgado en la pared: donde estaba la ventana del salón
  { id: 'col_abyss_heart', place: 'wall', unlock: { kind: 'legend' } },
];
