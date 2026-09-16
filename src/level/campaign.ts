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
import c2f1 from './campaign/chapter2/01-c2-todos-a-una.json';
import c2f2 from './campaign/chapter2/02-c2-sobre-railes.json';
import c2f3 from './campaign/chapter2/03-c2-curvas.json';
import c2f4 from './campaign/chapter2/04-c2-cuesta-arriba.json';
import c2f5 from './campaign/chapter2/05-c2-todos-a-bordo.json';
import c2f6 from './campaign/chapter2/06-c2-plantas-en-la-via.json';
import c2f7 from './campaign/chapter2/07-c2-salto-a-la-estacion.json';
import c2f8 from './campaign/chapter2/08-c2-puente-de-viento.json';
import c2f9 from './campaign/chapter2/09-c2-bifurcacion.json';
import c2f10 from './campaign/chapter2/10-c2-gran-raiz.json';
import c3f1 from './campaign/chapter3/01-c3-suelo-fragil.json';
import c3f2 from './campaign/chapter3/02-c3-puente-quebradizo.json';
import c3f3 from './campaign/chapter3/03-c3-hielo-fundido.json';
import c3f4 from './campaign/chapter3/04-c3-pista-ardiente.json';
import c3f5 from './campaign/chapter3/05-c3-grietas-entre-llamas.json';
import c3f6 from './campaign/chapter3/06-c3-dos-puentes.json';
import c3f7 from './campaign/chapter3/07-c3-saltos-fragiles.json';
import c3f8 from './campaign/chapter3/08-c3-viento-y-grietas.json';
import c3f9 from './campaign/chapter3/09-c3-plaza-rota.json';
import c3f10 from './campaign/chapter3/10-c3-gran-grieta.json';
import c4f1 from './campaign/chapter4/01-c4-dunas.json';
import c4f2 from './campaign/chapter4/02-c4-sendero-diagonal.json';
import c4f3 from './campaign/chapter4/03-c4-sierras.json';
import c4f4 from './campaign/chapter4/04-c4-el-pozo.json';
import c4f5 from './campaign/chapter4/05-c4-pozos-y-rampas.json';
import c4f6 from './campaign/chapter4/06-c4-esquinas-afiladas.json';
import c4f7 from './campaign/chapter4/07-c4-arena-quebrada.json';
import c4f8 from './campaign/chapter4/08-c4-fuego-del-desierto.json';
import c4f9 from './campaign/chapter4/09-c4-railes-y-pozos.json';
import c4f10 from './campaign/chapter4/10-c4-corazon-de-arena.json';

/** Modo historia: capítulos de 10 pisos. Sus coleccionables están en collectibles.ts. */
export const CHAPTERS: ChapterDef[] = [
  {
    id: 'cripta-azul',
    name: 'Capítulo 1',
    subtitle: 'La Cripta Azul',
    biome: 'stone',
    floors: [c1f1, c1f2, c1f3, c1f4, c1f5, c1f6, c1f7, c1f8, c1f9, c1f10] as LevelData[],
  },
  {
    // raíles y botón de apretar; mismo decorado (el decorado cambia cada 4 capítulos)
    id: 'raices-colgantes',
    name: 'Capítulo 2',
    subtitle: 'Las Raíces Colgantes',
    biome: 'stone',
    floors: [c2f1, c2f2, c2f3, c2f4, c2f5, c2f6, c2f7, c2f8, c2f9, c2f10] as LevelData[],
  },
  {
    // roca agrietada y hielo que se derrite bajo el limo en llamas
    id: 'grietas-heladas',
    name: 'Capítulo 3',
    subtitle: 'Las Grietas Heladas',
    biome: 'stone',
    floors: [c3f1, c3f2, c3f3, c3f4, c3f5, c3f6, c3f7, c3f8, c3f9, c3f10] as LevelData[],
  },
  {
    // arena: primer capítulo del desierto (4-6)
    id: 'arenas-hundidas',
    name: 'Capítulo 4',
    subtitle: 'Las Arenas Hundidas',
    biome: 'desert',
    floors: [c4f1, c4f2, c4f3, c4f4, c4f5, c4f6, c4f7, c4f8, c4f9, c4f10] as LevelData[],
  },
];

/** Capítulos anunciados que aún no se pueden jugar. */
export const UPCOMING = [{ name: 'Capítulo 5', subtitle: 'Próximamente' }];

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
