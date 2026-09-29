import { MediaType } from '@/types';

/**
 * El enlace directo a una ficha: `/?ficha=tv:1396`.
 *
 * Las fichas son modales, no páginas: no tienen dirección propia. Esta es la
 * forma de abrir una desde afuera —un aviso de episodio nuevo— sin inventar
 * una ruta que después haya que mantener. Funciona sobre cualquier página, así
 * que el aviso puede mandar al inicio y la ficha se abre encima.
 *
 * `api/cron/notify.ts` arma el mismo formato del lado del servidor.
 */
export const FICHA_PARAM = 'ficha';

export function fichaUrl(mediaType: MediaType, tmdbId: number, base = '/'): string {
  return `${base}?${FICHA_PARAM}=${mediaType}:${tmdbId}`;
}

/** Lee el parámetro; lo que no tenga la forma exacta se ignora. */
export function parseFicha(value: string | null): { mediaType: MediaType; tmdbId: number } | null {
  const match = /^(movie|tv):(\d{1,9})$/.exec(value ?? '');
  if (!match) return null;
  const tmdbId = Number(match[2]);
  return tmdbId > 0 ? { mediaType: match[1] as MediaType, tmdbId } : null;
}
