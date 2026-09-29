import { SavedMedia } from '@/types';
import { firstUnwatchedAired, hasNewEpisodes } from '@/lib/progress';
import { isArchivedStatus } from '@/lib/archive';

/** Cuántas series entran en la fila. Más que esto ya es una lista, no un atajo. */
export const CONTINUE_LIMIT = 12;

export interface ContinueItem {
  media: SavedMedia;
  /** El episodio que toca ver ahora. */
  next: { seasonNumber: number; episode: number };
}

/** La última vez que se tocó el progreso, o cuándo se guardó si nunca. */
function lastTouched(media: SavedMedia): number {
  const at = Date.parse(media.progress?.lastWatchedAt ?? media.updatedAt);
  return Number.isFinite(at) ? at : 0;
}

/**
 * Las series para retomar, con el episodio que toca, de la última que miraste
 * a la que hace más que no tocás.
 *
 * Entran las de *Viendo* con algo emitido sin ver —una al día no tiene nada
 * que retomar— y las que estrenaron episodios desde que las terminaste, estén
 * en la lista que estén: son las que más probablemente quieras ver esta
 * noche.
 */
export function continueWatching(
  list: SavedMedia[],
  limit: number = CONTINUE_LIMIT,
): ContinueItem[] {
  return list
    .filter(
      (media) =>
        media.mediaType === 'tv' &&
        // Lo que pusiste en pausa o abandonaste no es para "esta noche",
        // aunque haya salido algo nuevo.
        !isArchivedStatus(media.status) &&
        (media.status === 'viendo' || hasNewEpisodes(media)),
    )
    .map((media) => ({ media, next: firstUnwatchedAired(media) }))
    .filter((item): item is ContinueItem => item.next !== null)
    .sort((a, b) => lastTouched(b.media) - lastTouched(a.media))
    .slice(0, limit);
}
