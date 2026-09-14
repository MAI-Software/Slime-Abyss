import type { ChapterDef, LevelData } from './format';
import { validateLevel } from './format';
import sendero from './campaign/00-sendero-largo.json';
import c1f1 from './campaign/chapter1/01-c1-primeros-pasos.json';
import c1f2 from './campaign/chapter1/02-c1-filo-de-cuchilla.json';
import c1f3 from './campaign/chapter1/03-c1-pasillo-de-fuego.json';
import c1f4 from './campaign/chapter1/04-c1-divide-y-venceras.json';
import c1f5 from './campaign/chapter1/05-c1-salto-al-abismo.json';

/** Modo historia: capítulos con sus pisos en orden. */
export const CHAPTERS: ChapterDef[] = [
  {
    id: 'cripta-azul',
    name: 'Capítulo 1',
    subtitle: 'La Cripta Azul',
    floors: [c1f1, c1f2, c1f3, c1f4, c1f5] as LevelData[],
  },
];

/** Capítulos anunciados que aún no se pueden jugar. */
export const UPCOMING = [{ name: 'Capítulo 2', subtitle: 'Próximamente' }];

/** Nivel de pruebas sin trampas (desde Ajustes). */
export const PRACTICE = sendero as LevelData;

if (import.meta.env.DEV) {
  for (const level of [PRACTICE, ...CHAPTERS.flatMap((c) => c.floors)]) {
    const errors = validateLevel(level);
    if (errors.length) console.warn(`Nivel "${level.name}" con problemas:`, errors);
  }
}
