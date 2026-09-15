/**
  Coleccionables: piezas de adorno que se exponen en la habitación del menú.
  Cada una tiene su modelo (col_* en assets.glb), su hueco en la habitación (slot_col_*)
  y una condición que se comprueba al terminar un piso.
*/

export type Unlock =
  /** tesoro secreto (gema) de un piso concreto */
  | { kind: 'secret'; floor: string }
  /** todos los pisos del capítulo completados */
  | { kind: 'chapterDone' }
  /** todas las monedas de todos los pisos del capítulo */
  | { kind: 'allCoins' }
  /** capítulo al 100 %: todas las estrellas y secretos */
  | { kind: 'perfect' };

export interface Collectible {
  id: string;
  chapter: string;
  unlock: Unlock;
}

export const COLLECTIBLES: Collectible[] = [
  { id: 'col_crystal_skull', chapter: 'cripta-azul', unlock: { kind: 'secret', floor: 'c1-filo-de-cuchilla' } },
  { id: 'col_ancient_vase', chapter: 'cripta-azul', unlock: { kind: 'secret', floor: 'c1-salto-al-abismo' } },
  { id: 'col_blue_orb', chapter: 'cripta-azul', unlock: { kind: 'secret', floor: 'c1-gran-cripta' } },
  { id: 'col_crypt_key', chapter: 'cripta-azul', unlock: { kind: 'chapterDone' } },
  { id: 'col_coin_chest', chapter: 'cripta-azul', unlock: { kind: 'allCoins' } },
  { id: 'col_trophy', chapter: 'cripta-azul', unlock: { kind: 'perfect' } },
];
