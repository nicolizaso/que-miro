import type { TmdbLanguage } from '@/types';

/**
 * En qué castellano se le piden los textos a TMDB.
 *
 * TMDB tiene una traducción por país, y no son intercambiables: *Die Hard* es
 * "La jungla de cristal" en España y "Duro de matar" en Latinoamérica. La app
 * ya sabe de dónde es cada persona —la región de las plataformas—, así que el
 * idioma sale de ahí en vez de ser una preferencia más para configurar.
 */
export type { TmdbLanguage };

/** El que se usó siempre, y el que asume el servidor si no se le pide otro. */
export const DEFAULT_LANGUAGE: TmdbLanguage = 'es-ES';

const LANGUAGES: TmdbLanguage[] = ['es-ES', 'es-MX'];

/**
 * El idioma que le corresponde a una región.
 *
 * España lee en castellano de España y el resto en latino. `es-MX` es el
 * latino de TMDB: no hay uno por país, y el mexicano es el que la comunidad
 * mantiene completo. Brasil y Estados Unidos van por el mismo lado porque la
 * app está en castellano: a quien la usa desde ahí le sirve el latino.
 */
export function languageForRegion(region: string): TmdbLanguage {
  return region === 'ES' ? 'es-ES' : 'es-MX';
}

/** Valida un idioma guardado, o `undefined` si no es uno de los que se usan. */
export function parseLanguage(value: unknown): TmdbLanguage | undefined {
  return LANGUAGES.includes(value as TmdbLanguage)
    ? (value as TmdbLanguage)
    : undefined;
}
