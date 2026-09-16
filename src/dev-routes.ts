/*
  Solo en desarrollo: rutas del piloto automático para cada piso de la historia.
  Cada ruta recoge todas las monedas y llega al tesoro; la prueba (__auto.all) exige más del 90 % del limo.
  Coordenadas en casillas del mundo: x = columna + 0.5, z = fila + 0.5.
  Pasos: to (ir), dir (empujar), wait (esperar), fire (esperar a que se apague esa llama), squeeze (apretar sí/no).
*/

export type Step = { to?: [number, number]; radius?: number; t?: number; dir?: [number, number]; wait?: number; fire?: [number, number]; squeeze?: boolean };

export const ROUTES: Record<string, Step[]> = {
  // ------------------------------------------------------------------ capítulo 1
  'c1-primeros-pasos': [
    { to: [10.5, 32.5], radius: 0.5 }, { to: [8.5, 32.5], radius: 0.4 }, { to: [4.0, 32.5], radius: 0.5 },
    { to: [4.0, 28.5], radius: 0.5 }, { to: [3.7, 26.0], radius: 0.5 }, { to: [4.5, 22.5], radius: 0.4 },
    { to: [7.0, 21.2], radius: 0.5 }, { to: [9.9, 21.2], radius: 0.5 }, { to: [9.6, 18.5], radius: 0.4 },
    { to: [10.0, 15.0], radius: 0.5 }, { to: [10.5, 13.5], radius: 0.4 }, { to: [10.5, 10.6], radius: 0.5 },
    { to: [5.5, 10.6], radius: 0.5 }, { to: [5.5, 11.5], radius: 0.4 }, { to: [7.5, 9.0], radius: 0.5 },
    { to: [7.5, 6.5], radius: 0.4 }, { to: [7.5, 3.5], radius: 0.5 }, { to: [2.5, 3.3], radius: 0.5 },
    { to: [2.5, 2.5], radius: 0.4 }, { to: [3.5, 3.4], radius: 0.5 }, { to: [13.5, 3.4], radius: 0.5 },
    { to: [13.5, 2.5], radius: 0.4 }, { to: [7.5, 1.5], t: 8 },
  ],
  'c1-filo-de-cuchilla': [
    { to: [7.5, 20.5], radius: 0.4 }, { to: [7.5, 18.2], radius: 0.4 },
    { dir: [0, -0.6], t: 3.2 },
    { squeeze: true, to: [7.5, 7.8], radius: 0.4, t: 6 }, { wait: 1.5 }, { squeeze: false, to: [2.5, 5.5], radius: 0.3 },
    { squeeze: true, wait: 2.5 }, { squeeze: false, to: [1.5, 4.2], radius: 0.4 }, { to: [1.5, 1.5], radius: 0.4 },
    { to: [1.5, 4.5], radius: 0.4 }, { to: [12.5, 5.5], radius: 0.4, t: 8 }, { to: [12.5, 2.5], radius: 0.4 }, { to: [7.5, 1.5], t: 8 },
  ],
  'c1-pasillo-de-fuego': [
    { to: [7.5, 15.5], radius: 0.5 }, { to: [6.5, 13.3], radius: 0.4 }, { to: [8.5, 13.3], radius: 0.4 },
    { to: [7.5, 10.3], radius: 0.4 }, { to: [7.5, 10.0], radius: 0.2 }, { fire: [7, 8] }, { to: [7.5, 6.5], radius: 0.4 },
    { to: [7.5, 6.0], radius: 0.2 }, { fire: [7, 4] }, { to: [7.5, 1.5], t: 8 },
  ],
  'c1-divide-y-venceras': [
    { to: [5.5, 10.5], radius: 0.4 }, { dir: [0, -1], t: 4.5 }, { dir: [1, -0.3], t: 2 },
    { dir: [0, -1], t: 1.5 }, { dir: [-1, 0.25], t: 4 }, { to: [1.5, 1.5], t: 6 },
  ],
  'c1-salto-al-abismo': [
    { to: [5.5, 13.5], radius: 0.4 }, { to: [6.5, 14.6], radius: 0.3 }, { dir: [0, -1], t: 1.8 }, { to: [6.5, 7.5], radius: 0.4 },
    { to: [5.5, 6.5], radius: 0.4 }, { to: [7.5, 6.5], radius: 0.4 }, { to: [6.5, 4.2], radius: 0.4 }, { to: [6.5, 1.5], t: 8 },
  ],
  'c1-aceite-y-chispas': [
    { to: [6.5, 13.5], radius: 0.4 }, { to: [6.5, 11.0], radius: 0.4 }, { to: [6.5, 9.4], radius: 0.4 },
    { to: [4.5, 10.5], radius: 0.4 }, { to: [8.5, 10.5], radius: 0.4 }, { to: [6.5, 7.5], radius: 0.4 },
    { to: [6.5, 5.5], radius: 0.4 }, { to: [6.5, 3.3], radius: 0.3, t: 4 }, { to: [6.5, 1.5], t: 8 },
  ],
  'c1-hielo-que-arde': [
    { to: [4.5, 16.5], radius: 0.4 }, { to: [5.5, 13.5], radius: 0.5 }, { to: [5.5, 12.5], radius: 0.4 },
    { to: [5.5, 10.6], radius: 0.5 }, { to: [2.5, 9.6], radius: 0.4 }, { to: [2.5, 8.5], radius: 0.4 },
    { to: [5.5, 8.4], radius: 0.4 }, { to: [5.5, 6.5], radius: 0.4, t: 5 }, { to: [5.5, 5.5], radius: 0.4 },
    { to: [5.5, 2.6], radius: 0.4, t: 5 }, { to: [7.5, 2.5], radius: 0.4 }, { to: [4.5, 1.5], t: 8 },
  ],
  'c1-ventiladores': [
    { to: [6.5, 19.5], radius: 0.4 }, { to: [7.3, 17.5], radius: 0.4 }, { to: [6.0, 15.5], radius: 0.5 },
    { to: [5.5, 14.5], radius: 0.4 }, { to: [5.5, 12.5], radius: 0.4 }, { to: [6.0, 10.5], radius: 0.5 },
    { to: [7.4, 9.5], radius: 0.4 }, { to: [7.4, 7.5], radius: 0.4 }, { to: [6.5, 5.5], radius: 0.4 }, { to: [6.5, 1.5], t: 8 },
  ],
  'c1-corriente-helada': [
    { to: [3.5, 11.8], radius: 0.4 }, { to: [3.5, 9.5], radius: 0.4 }, { to: [3.5, 11.8], radius: 0.4 },
    { to: [7.5, 11.8], radius: 0.4 }, { to: [7.5, 9.5], radius: 0.4 }, { to: [5.5, 10.5], radius: 0.4 },
    { to: [3.5, 9.4], radius: 0.4 }, { to: [3.5, 7.4], radius: 0.4 }, { to: [5.5, 7.3], radius: 0.4 },
    { dir: [0, -0.5], t: 6 }, { to: [5.5, 1.5], t: 8 },
  ],
  'c1-gran-cripta': [
    { to: [8.5, 21.5], radius: 0.4 }, { to: [8.5, 20.5], radius: 0.4 }, { to: [6.5, 20.5], radius: 0.4 },
    { to: [5.5, 19.0], radius: 0.4 }, { to: [5.5, 17.0], radius: 0.4 }, { to: [6.5, 16.5], radius: 0.4 },
    { to: [7.5, 17.3], radius: 0.4 }, { dir: [0, -0.5], t: 7 }, { to: [7.5, 8.5], radius: 0.4, t: 6 },
    { to: [7.5, 5.5], radius: 0.4 }, { to: [7.5, 3.3], radius: 0.3, t: 4 }, { to: [6.5, 2.5], radius: 0.4 },
    { to: [10.5, 2.5], radius: 0.3, t: 4 }, { to: [13.5, 1.5], radius: 0.4 }, { to: [2.5, 1.5], t: 10 },
  ],
  // ------------------------------------------------------------------ capítulo 2
  'c2-todos-a-una': [
    { to: [6.5, 14.5], radius: 0.4 }, { squeeze: true, to: [6.5, 10.5], radius: 0.5, t: 6 }, { wait: 1 },
    { squeeze: false, to: [4.5, 9.5], radius: 0.4 }, { to: [8.5, 9.5], radius: 0.4 },
    { squeeze: true, to: [6.5, 4.5], radius: 0.4, t: 8 }, { wait: 1.5 }, { squeeze: false, to: [6.5, 1.5], t: 8 },
  ],
  'c2-sobre-railes': [
    { to: [5.5, 10.5], radius: 0.4 }, { to: [7.5, 10.5], radius: 0.4 }, { to: [6.5, 8.5], radius: 0.2 }, { wait: 4 }, { to: [7.5, 1.5], t: 6 },
  ],
  'c2-curvas': [
    { to: [10.5, 17.5], radius: 0.2 }, { wait: 4 }, { to: [8.5, 12.5], radius: 0.4 }, { to: [8.5, 10.5], radius: 0.4 },
    { to: [8.5, 8.5], radius: 0.2 }, { wait: 8 }, { to: [2.5, 1.5], t: 6 },
  ],
  'c2-cuesta-arriba': [
    { to: [5.5, 17.5], radius: 0.4 }, { to: [6.5, 15.5], radius: 0.2 }, { wait: 6 }, { wait: 3.5 },
    { to: [5.5, 11.5], radius: 0.4 }, { to: [6.5, 8.6], radius: 0.4 }, { to: [6.5, 7.5], radius: 0.2 }, { wait: 5 }, { to: [7.5, 1.5], t: 6 },
  ],
  'c2-todos-a-bordo': [
    { to: [4.5, 11.5], radius: 0.4 }, { to: [8.5, 11.5], radius: 0.4 }, { squeeze: true, to: [6.5, 7.5], radius: 0.2, t: 10 },
    { wait: 1.5 }, { squeeze: false, wait: 5 }, { to: [7.5, 1.5], t: 6 },
  ],
  'c2-plantas-en-la-via': [
    { to: [6.5, 12.5], radius: 0.4 }, { to: [5.5, 11.5], radius: 0.4 }, { to: [4.5, 10.5], radius: 0.4 },
    { to: [7.5, 11.5], radius: 0.4 }, { to: [6.5, 9.5], radius: 0.4 }, { to: [6.5, 8.3], radius: 0.3, t: 4 },
    { to: [6.5, 7.5], radius: 0.2 }, { wait: 5 }, { to: [7.5, 1.5], t: 6 },
  ],
  'c2-salto-a-la-estacion': [
    { dir: [0, -1], t: 1.6 }, { to: [5.5, 9.5], radius: 0.4 }, { to: [7.5, 9.5], radius: 0.4 },
    { to: [6.5, 7.5], radius: 0.2 }, { wait: 5 }, { to: [7.5, 1.5], t: 6 },
  ],
  'c2-puente-de-viento': [
    { to: [3.5, 10.5], radius: 0.4 }, { to: [3.5, 8.5], radius: 0.2 }, { wait: 5 }, { to: [2.5, 2.5], radius: 0.4 }, { to: [6.5, 1.5], t: 6 },
  ],
  'c2-bifurcacion': [
    { to: [3.5, 9.5], radius: 0.4 }, { to: [3.5, 7.5], radius: 0.2 }, { wait: 5 }, { to: [3.5, 1.6], radius: 0.3 },
    { squeeze: true, wait: 3 }, { squeeze: false, to: [1.5, 2.5], radius: 0.4 }, { to: [1.5, 1.5], radius: 0.4 },
    { to: [3.5, 3.5], radius: 0.2 }, { wait: 5 }, { to: [11.5, 9.5], radius: 0.4, t: 8 }, { to: [11.5, 7.5], radius: 0.2 },
    { wait: 5 }, { to: [11.5, 1.5], t: 6 },
  ],
  'c2-gran-raiz': [
    { to: [4.5, 22.5], radius: 0.4 }, { to: [8.5, 22.5], radius: 0.4 }, { squeeze: true, to: [6.5, 19.5], radius: 0.4, t: 6 },
    { wait: 1 }, { squeeze: false, to: [5.5, 18.5], radius: 0.4 }, { to: [7.5, 18.5], radius: 0.4 },
    { to: [6.5, 16.5], radius: 0.4 }, { dir: [0, -1], t: 1.8 }, { to: [5.5, 11.5], radius: 0.4 }, { to: [7.5, 11.5], radius: 0.4 },
    { to: [4.5, 9.6], radius: 0.4 }, { to: [6.5, 8.4], radius: 0.3, t: 4 }, { to: [6.5, 7.5], radius: 0.2 }, { wait: 7 }, { to: [7.5, 1.5], t: 6 },
  ],
  // ------------------------------------------------------------------ capítulo 3
  'c3-suelo-fragil': [
    { to: [6.5, 9.5], radius: 0.4 }, { to: [5.5, 6.5], radius: 0.4 }, { to: [7.5, 6.5], radius: 0.4 }, { to: [3.5, 3.5], radius: 0.5 },
    { to: [2.5, 1.5], radius: 0.4 }, { to: [3.5, 3.5], radius: 0.5 }, { to: [9.5, 3.5], radius: 0.5 }, { to: [10.5, 1.5], radius: 0.4 },
    { to: [6.5, 1.5], t: 6 },
  ],
  'c3-puente-quebradizo': [
    { to: [9.5, 11.5], radius: 0.5 }, { to: [9.5, 6.5], radius: 0.7 }, { to: [4.5, 6.5], radius: 0.7 },
    { to: [4.5, 2.5], radius: 0.7 }, { to: [8.5, 1.5], radius: 0.4 }, { to: [2.5, 1.5], t: 6 },
  ],
  'c3-hielo-fundido': [
    { to: [6.5, 11.5], radius: 0.4 }, { to: [6.5, 9.3], radius: 0.4 }, { to: [6.5, 7.3], radius: 0.3, t: 4 },
    { to: [6.5, 5.5], radius: 0.4 }, { to: [6.5, 2.4], radius: 0.5 }, { to: [10.5, 1.5], radius: 0.4 }, { to: [1.5, 1.5], t: 8 },
  ],
  'c3-pista-ardiente': [
    { to: [5.5, 14.5], radius: 0.4 }, { to: [5.5, 12.3], radius: 0.4 }, { to: [5.5, 10.3], radius: 0.3, t: 4 },
    { to: [5.5, 9.5], radius: 0.4 }, { to: [5.5, 2.5], radius: 0.5, t: 6 }, { to: [5.5, 1.5], t: 4 },
  ],
  'c3-grietas-entre-llamas': [
    { to: [4.5, 14.5], radius: 0.4 }, { to: [6.5, 14.5], radius: 0.4 }, { to: [5.5, 13.3], radius: 0.2 }, { fire: [5, 11] },
    { to: [5.5, 9.6], radius: 0.25 }, { fire: [5, 7] }, { to: [5.5, 1.5], t: 6 },
  ],
  'c3-dos-puentes': [
    { dir: [0, -1], t: 3.4 }, { squeeze: true, to: [6.5, 2.5], radius: 0.4, t: 6 }, { wait: 1 }, { squeeze: false, to: [6.5, 1.5], t: 6 },
  ],
  'c3-saltos-fragiles': [
    { to: [4.5, 15.5], radius: 0.4 }, { to: [6.5, 15.5], radius: 0.4 }, { to: [5.5, 16.3], radius: 0.3 }, { dir: [0, -1], t: 3.5 }, { to: [5.5, 1.5], t: 6 },
  ],
  'c3-viento-y-grietas': [
    { to: [4.5, 10.5], radius: 0.4 }, { to: [3.9, 2.5], radius: 0.6, t: 8 }, { to: [5.5, 1.5], t: 6 },
  ],
  'c3-plaza-rota': [
    { to: [5.5, 10.5], radius: 0.4 }, { squeeze: true, to: [5.5, 3.5], radius: 0.6, t: 8 }, { squeeze: false, to: [5.5, 1.5], t: 6 },
  ],
  'c3-gran-grieta': [
    { to: [6.5, 23.5], radius: 0.4 }, { to: [6.5, 21.3], radius: 0.4 }, { to: [6.5, 19.3], radius: 0.3, t: 4 },
    { to: [6.5, 15.5], radius: 0.6 }, { to: [4.5, 15.5], radius: 0.4 }, { to: [10.5, 14.5], radius: 0.4, t: 6 },
    { to: [5.5, 14.3], radius: 0.25 }, { fire: [5, 12] }, { to: [4.5, 9.3], radius: 0.5 }, { to: [6.5, 9.3], radius: 0.4 },
    { to: [5.5, 7.5], radius: 0.2 }, { wait: 8 }, { to: [6.5, 1.5], t: 6 },
  ],
  // ------------------------------------------------------------------ capítulo 4
  'c4-dunas': [
    { to: [4.5, 11.5], radius: 0.4 }, { to: [5.5, 8.5], radius: 0.5 }, { to: [4.5, 5.5], radius: 0.4 }, { to: [6.5, 5.5], radius: 0.4 }, { to: [5.5, 1.5], t: 8 },
  ],
  'c4-sendero-diagonal': [
    { to: [3.5, 9.5], radius: 0.5 }, { to: [5.5, 7.5], radius: 0.4 }, { to: [7.5, 5.5], radius: 0.4 }, { to: [9.5, 3.5], radius: 0.5 },
    { to: [10.5, 1.5], radius: 0.4 }, { to: [6.5, 1.5], radius: 0.4 }, { to: [2.5, 1.5], t: 6 },
  ],
  'c4-sierras': [
    { to: [2.5, 5.5], radius: 0.4 }, { to: [3.5, 7.4], radius: 0.4 }, { to: [7.5, 7.4], radius: 0.4 }, { to: [8.5, 5.5], radius: 0.4 },
    { to: [8.5, 2.5], radius: 0.4 }, { to: [5.5, 1.5], t: 8 },
  ],
  'c4-el-pozo': [
    { to: [3.5, 8.8], radius: 0.4 }, { to: [3.5, 7.5], radius: 0.4 }, { to: [3.5, 9.3], radius: 0.4 }, { to: [7.5, 9.3], radius: 0.4 },
    { to: [7.5, 7.5], radius: 0.4 }, { to: [5.5, 7.5], radius: 0.05, t: 5 }, { wait: 2 }, { to: [5.5, 1.5], t: 6 },
  ],
  'c4-pozos-y-rampas': [
    { to: [3.5, 12.5], radius: 0.4 }, { to: [8.5, 11.5], radius: 0.05, t: 5 }, { wait: 2 }, { to: [7.5, 8.5], radius: 0.4 },
    { to: [5.5, 7.5], radius: 0.5 }, { to: [5.5, 1.5], t: 10 },
  ],
  'c4-remolino': [
    { to: [3.5, 9.5], radius: 0.4 }, { to: [7.5, 9.5], radius: 0.4 }, { to: [5.5, 7.5], radius: 0.4 }, { to: [3.5, 4.4], radius: 0.4 },
    { wait: 4 }, { to: [5.5, 1.5], t: 10 },
  ],
  'c4-arena-quebrada': [
    { to: [3.5, 10.5], radius: 0.4 }, { to: [7.5, 10.5], radius: 0.4 }, { to: [5.5, 9.3], radius: 0.4 }, { to: [5.5, 1.5], t: 8 },
  ],
  'c4-fuego-del-desierto': [
    { to: [2.5, 13.5], radius: 0.4 }, { to: [8.5, 13.5], radius: 0.4 }, { to: [5.5, 12.5], radius: 0.4 }, { to: [5.5, 11.3], radius: 0.4 },
    { squeeze: true, to: [5.5, 4.3], radius: 0.4, t: 8 }, { squeeze: false, to: [5.5, 3.3], radius: 0.3, t: 3 }, { to: [5.5, 1.5], t: 6 },
  ],
  'c4-railes-y-pozos': [
    { to: [3.5, 14.5], radius: 0.4 }, { to: [7.5, 14.5], radius: 0.4 }, { to: [5.5, 12.5], radius: 0.2 }, { wait: 9 },
    { to: [5.5, 6.5], radius: 0.05, t: 4 }, { wait: 2 }, { to: [4.5, 3.5], radius: 0.4 }, { to: [1.5, 1.5], t: 8 },
  ],
  'c4-corazon-de-arena': [
    { to: [2.5, 23.5], radius: 0.4 }, { to: [4.5, 23.5], radius: 0.4 }, { to: [3.5, 19.4], radius: 0.4, t: 6 }, { wait: 4 },
    { squeeze: true, to: [3.5, 16.5], radius: 0.4, t: 6 }, { wait: 1.5 }, { squeeze: false, to: [2.5, 15.5], radius: 0.4 },
    { to: [4.5, 15.5], radius: 0.4 }, { to: [3.5, 14.2], radius: 0.4 }, { to: [4.5, 12.5], radius: 0.4 }, { to: [5.5, 11.5], radius: 0.4 },
    { to: [7.5, 9.5], radius: 0.5 }, { to: [8.5, 7.8], radius: 0.5 }, { squeeze: true, to: [8.5, 6.5], radius: 0.05, t: 4 }, { wait: 3 }, { squeeze: false },
    { to: [9.5, 1.5], radius: 0.4 }, { to: [9.5, 3.5], radius: 0.5 }, { to: [3.5, 3.5], radius: 0.5 }, { to: [3.5, 1.5], radius: 0.4 },
    { to: [6.5, 1.5], t: 6 },
  ],
};
