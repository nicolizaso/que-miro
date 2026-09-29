import { SavedMedia } from '@/types';
import { isStale } from '@/lib/enrich';

/**
 * Cuántos títulos se refrescan por visita.
 *
 * Es una llamada a TMDB y una escritura por título. De a ocho, una biblioteca
 * de cientos se pone al día en unas pocas visitas sin que ninguna se note, y
 * lo urgente —lo que estás viendo, lo que sigue saliendo— entra siempre primero.
 */
export const REFRESH_PER_VISIT = 8;

/**
 * Qué tan urgente es refrescar un título. Menos es más urgente.
 *
 * 1. Lo que estás viendo: es donde un episodio nuevo o una temporada que se
 *    sumó cambian algo esta misma noche.
 * 2. Las series en emisión, estén en la lista que estén: una que terminaste y
 *    sigue saliendo es la que te va a sorprender con una temporada nueva.
 * 3. *Por Ver*: lo que todavía no empezaste puede llegar a tu plataforma.
 * 4. Todo lo demás, que solo cambia de plataforma cada tanto.
 */
export function refreshPriority(media: SavedMedia): number {
  if (media.status === 'viendo') return 0;
  if (isAiring(media)) return 1;
  if (media.status === 'por_ver') return 2;
  return 3;
}

/** Si la serie sigue saliendo, según lo último que dijo TMDB. */
export function isAiring(media: SavedMedia): boolean {
  return (
    media.mediaType === 'tv' &&
    (media.seriesStatus === 'Returning Series' || media.nextToAir !== undefined)
  );
}

/*
 * Por qué no `/tv/changes`.
 *
 * TMDB publica los ids de las series que cambiaron en las últimas 24 horas, y
 * la idea era usarlo como atajo: cruzarlo con la biblioteca y refrescar solo lo
 * que se movió. No se usa, por tres motivos:
 *
 * - Es una lista enorme. Devuelve 100 ids por página y cuenta *cualquier*
 *   edición sobre cualquiera de las series de TMDB —una imagen nueva, una
 *   traducción, un cambio de reparto—, así que un día cualquiera trae miles de
 *   ids repartidos en muchas páginas. El servidor tendría que recorrerlas todas
 *   antes de contestar, y el cliente bajarlas enteras para cruzarlas con una
 *   biblioteca que tiene una docena de series en emisión.
 * - Casi todo lo que marca es ruido: que cambió el póster no dice nada de si
 *   salió un episodio.
 * - Lo que sí importa ya se sabe sin preguntar. La ficha guarda la fecha del
 *   próximo episodio (`nextToAir`), e `isStale` vence la serie al día siguiente
 *   de esa fecha: una serie semanal se entera de cada episodio sin pedir nada
 *   extra, y el resto lo cubre la regla por antigüedad.
 */

/**
 * Los títulos a refrescar en esta visita, del más urgente al menos.
 *
 * Solo entran los vencidos. Entre dos igual de urgentes va primero el que hace
 * más que no se pide —o que no se pidió nunca—, así una biblioteca grande rota
 * entera en vez de insistir siempre con los mismos.
 *
 * Es pura a propósito: el hook que la usa solo decide cuándo, y qué refrescar
 * se puede probar sin montar nada.
 */
export function refreshQueue(
  list: SavedMedia[],
  region: string,
  now: Date = new Date(),
  limit: number = REFRESH_PER_VISIT,
): SavedMedia[] {
  return list
    .filter((media) => isStale(media, region, now))
    .map((media) => ({
      media,
      priority: refreshPriority(media),
      // Nunca pedido cuenta como lo más viejo posible.
      enrichedAt: media.enrichedAt ? Date.parse(media.enrichedAt) : -Infinity,
    }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.enrichedAt - b.enrichedAt ||
        a.media.tmdbId - b.media.tmdbId,
    )
    .slice(0, limit)
    .map(({ media }) => media);
}
