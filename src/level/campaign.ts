import type { ChapterDef, LevelData } from './format';
import { validateLevel } from './format';
import sendero from './campaign/00-sendero-largo.json';
import c1f1 from './campaign/chapter1/01-c1-primeros-pasos.json';
import c1f2 from './campaign/chapter1/02-c1-filo-de-cuchilla.json';
import c1f3 from './campaign/chapter1/03-c1-pasillo-de-fuego.json';
import c1f4 from './campaign/chapter1/04-c1-divide-y-venceras.json';
import c1f5 from './campaign/chapter1/05-c1-salto-al-abismo.json';
import c1f6 from './campaign/chapter1/06-c1-aceite-y-chispas.json';
import c1f7 from './campaign/chapter1/07-c1-hielo-que-arde.json';
import c1f8 from './campaign/chapter1/08-c1-ventiladores.json';
import c1f9 from './campaign/chapter1/09-c1-corriente-helada.json';
import c1f10 from './campaign/chapter1/10-c1-gran-cripta.json';

/** Modo historia: capítulos de 10 pisos. Sus coleccionables están en collectibles.ts. */
export const CHAPTERS: ChapterDef[] = [
  {
    id: 'cripta-azul',
    name: 'Capítulo 1',
    subtitle: 'La Cripta Azul',
    floors: [c1f1, c1f2, c1f3, c1f4, c1f5, c1f6, c1f7, c1f8, c1f9, c1f10] as LevelData[],
  },
];

/** Capítulos anunciados que aún no se pueden jugar. */
export const UPCOMING = [{ name: 'Capítulo 2', subtitle: 'Próximamente' }];

/** Suelo del menú: 9x7 casillas bajo la habitación (solo sostiene al limo; el mundo no se dibuja). */
export const MENU_STAGE: LevelData = {
  format: 1,
  id: 'menu-stage',
  name: 'Menú',
  count: 80,
  tiles: ['000000000', '000000000', '000000000', '0000P0000', '000000000', '000000000', '000000000'],
  heights: Array(7).fill('000000000'),
};

/** Nivel de pruebas sin trampas (desde Ajustes). */
export const PRACTICE = sendero as LevelData;

if (import.meta.env.DEV) {
  for (const level of [PRACTICE, ...CHAPTERS.flatMap((c) => c.floors)]) {
    const errors = validateLevel(level);
    if (errors.length) console.warn(`Nivel "${level.name}" con problemas:`, errors);
  }
}
