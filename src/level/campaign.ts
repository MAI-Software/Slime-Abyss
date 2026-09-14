import type { LevelData } from './format';
import { validateLevel } from './format';
import sendero from './campaign/00-sendero-largo.json';
import primer from './campaign/01-primer-deslizamiento.json';
import fuego from './campaign/02-pasillo-de-fuego.json';
import divide from './campaign/03-divide-y-venceras.json';
import salto from './campaign/04-salto-al-abismo.json';

/** Niveles del juego en orden. Los niveles del futuro editor usarán el mismo formato. */
export const CAMPAIGN = [sendero, primer, fuego, divide, salto] as LevelData[];

if (import.meta.env.DEV) {
  for (const level of CAMPAIGN) {
    const errors = validateLevel(level);
    if (errors.length) console.warn(`Nivel "${level.name}" con problemas:`, errors);
  }
}
