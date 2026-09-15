import { es, type Dict } from './es';
import { en } from './en';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import type { LevelData } from '../level/format';

/*
  Idiomas del juego. Uso:
    t('menu.story')                 → texto
    t('story.floor', { n: 3 })      → "Piso 3"
    <span data-i18n="menu.story">   → applyDom() rellena el texto
    data-i18n-aria="common.back"    → rellena aria-label
*/

export const LANGS = ['es', 'en', 'fr', 'de', 'it'] as const;
export type Lang = (typeof LANGS)[number];

const DICTS: Record<Lang, Dict> = { es, en, fr, de, it };
let current: Lang = 'es';

export function detectLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.slice(0, 2).toLowerCase();
    if ((LANGS as readonly string[]).includes(code)) return code as Lang;
  }
  return 'en';
}

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
  applyDom();
}

export function getLang(): Lang {
  return current;
}

function lookup(dict: Dict, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = lookup(DICTS[current], key) ?? lookup(es, key);
  if (typeof s !== 'string') return key;
  if (params) for (const [k, v] of Object.entries(params)) s = (s as string).replaceAll(`{${k}}`, String(v));
  return s as string;
}

export function levelName(level: LevelData): string {
  return DICTS[current].levels[level.id]?.name ?? es.levels[level.id]?.name ?? level.name;
}

export function levelTip(level: LevelData, k: number): string {
  return DICTS[current].levels[level.id]?.tips[k] ?? es.levels[level.id]?.tips[k] ?? level.tips?.[k]?.text ?? '';
}

/** Rellena los textos marcados en el HTML. */
export function applyDom(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria!)));
  document.title = 'Slime Abyss';
}
