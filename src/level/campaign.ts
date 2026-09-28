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
import c4f6 from './campaign/chapter4/06-c4-remolino.json';
import c4f7 from './campaign/chapter4/07-c4-canonazo.json';
import c4f8 from './campaign/chapter4/08-c4-fuego-del-desierto.json';
import c4f9 from './campaign/chapter4/09-c4-railes-y-pozos.json';
import c4f10 from './campaign/chapter4/10-c4-corazon-de-arena.json';
import c5f1 from './campaign/chapter5/01-c5-balancines.json';
import c5f2 from './campaign/chapter5/02-c5-tablas-y-sierra.json';
import c5f3 from './campaign/chapter5/03-c5-viento-en-la-tabla.json';
import c5f4 from './campaign/chapter5/04-c5-espiral-mareante.json';
import c5f5 from './campaign/chapter5/05-c5-canon-y-tabla.json';
import c5f6 from './campaign/chapter5/06-c5-templo-hundido.json';
import c5f7 from './campaign/chapter5/07-c5-aceite-en-la-balanza.json';
import c5f8 from './campaign/chapter5/08-c5-disco-y-tablas.json';
import c5f9 from './campaign/chapter5/09-c5-pozo-doble.json';
import c5f10 from './campaign/chapter5/10-c5-corazon-del-desierto.json';
import c6f1 from './campaign/chapter6/01-c6-gota-de-jabon.json';
import c6f2 from './campaign/chapter6/02-c6-corrientes-del-oasis.json';
import c6f3 from './campaign/chapter6/03-c6-torres-de-arena.json';
import c6f4 from './campaign/chapter6/04-c6-espuma-y-grietas.json';
import c6f5 from './campaign/chapter6/05-c6-pozos-de-espuma.json';
import c6f6 from './campaign/chapter6/06-c6-vias-del-oasis.json';
import c6f7 from './campaign/chapter6/07-c6-saltos-de-espuma.json';
import c6f8 from './campaign/chapter6/08-c6-canaveral.json';
import c6f9 from './campaign/chapter6/09-c6-laberinto-de-vidrio.json';
import c6f10 from './campaign/chapter6/10-c6-corazon-del-oasis.json';
import c7f1 from './campaign/chapter7/01-c7-primer-hielo.json';
import c7f2 from './campaign/chapter7/02-c7-canon-helado.json';
import c7f3 from './campaign/chapter7/03-c7-cornisas-de-escarcha.json';
import c7f4 from './campaign/chapter7/04-c7-vias-de-hielo.json';
import c7f5 from './campaign/chapter7/05-c7-pozo-de-nieve.json';
import c7f6 from './campaign/chapter7/06-c7-sala-de-los-espejos.json';
import c7f7 from './campaign/chapter7/07-c7-tablas-heladas.json';
import c7f8 from './campaign/chapter7/08-c7-grietas-de-escarcha.json';
import c7f9 from './campaign/chapter7/09-c7-laberinto-de-escarcha.json';
import c7f10 from './campaign/chapter7/10-c7-corazon-del-glaciar.json';
import c8f1 from './campaign/chapter8/01-c8-primeras-rachas.json';
import c8f2 from './campaign/chapter8/02-c8-puertas-de-escarcha.json';
import c8f3 from './campaign/chapter8/03-c8-torre-de-nieve.json';
import c8f4 from './campaign/chapter8/04-c8-vientos-cruzados.json';
import c8f5 from './campaign/chapter8/05-c8-pozo-blanco.json';
import c8f6 from './campaign/chapter8/06-c8-cristales.json';
import c8f7 from './campaign/chapter8/07-c8-cornisas-del-viento.json';
import c8f8 from './campaign/chapter8/08-c8-sala-de-las-corrientes.json';
import c8f9 from './campaign/chapter8/09-c8-laberinto-blanco.json';
import c8f10 from './campaign/chapter8/10-c8-ojo-de-la-ventisca.json';

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
  {
    // balancines: tablas que se inclinan con el peso del limo (segundo capítulo del desierto)
    id: 'dunas-profundas',
    name: 'Capítulo 5',
    subtitle: 'Las Dunas Profundas',
    biome: 'desert',
    floors: [c5f1, c5f2, c5f3, c5f4, c5f5, c5f6, c5f7, c5f8, c5f9, c5f10] as LevelData[],
  },
  {
    // jabón: el limo se hace burbuja, flota y sube con los ventiladores de techo (tercer capítulo del desierto)
    id: 'oasis-hundido',
    name: 'Capítulo 6',
    subtitle: 'El Oasis Hundido',
    biome: 'desert',
    floors: [c6f1, c6f2, c6f3, c6f4, c6f5, c6f6, c6f7, c6f8, c6f9, c6f10] as LevelData[],
  },
  {
    // frío: los chorros congelan y congelado el limo es duro (no se pincha) y vuela entero
    id: 'glaciar-roto',
    name: 'Capítulo 7',
    subtitle: 'El Glaciar Roto',
    biome: 'frost',
    floors: [c7f1, c7f2, c7f3, c7f4, c7f5, c7f6, c7f7, c7f8, c7f9, c7f10] as LevelData[],
  },
  {
    // ventisca: rachas de viento cruzando el hielo y puertas encadenadas a pie
    id: 'la-ventisca',
    name: 'Capítulo 8',
    subtitle: 'La Ventisca',
    biome: 'frost',
    floors: [c8f1, c8f2, c8f3, c8f4, c8f5, c8f6, c8f7, c8f8, c8f9, c8f10] as LevelData[],
  },
];

/** Capítulos anunciados que aún no se pueden jugar. */
export const UPCOMING = [{ name: 'Capítulo 9', subtitle: 'Próximamente' }];

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
