/*
  Accesorios de cabeza: solo visuales, no cambian nada del juego.
  - price: coste en monedas en la tienda (null = no se vende)
  - reward: id del capítulo que lo regala al completarse al 100 % (todas las estrellas y secretos)
  El id coincide con el objeto del modelo en assets.glb y con la clave de traducción items.<id>.
*/

export interface Accessory {
  id: string;
  price: number | null;
  reward?: string;
}

export const ACCESSORIES: Accessory[] = [
  { id: 'hat_beanie', price: null, reward: 'cripta-azul' },
  { id: 'hat_leaf', price: 10 },
  { id: 'hat_bow', price: 15 },
  { id: 'hat_party', price: 20 },
  { id: 'hat_top', price: 30 },
  { id: 'hat_crown', price: 45 },
];

export const accessoryById = (id: string) => ACCESSORIES.find((a) => a.id === id);
