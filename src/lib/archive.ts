import { ArchivedStatus, MediaStatus, SavedMedia, WatchEntry } from '@/types';

/**
 * Las pestañas de Mis listas: los tres estados de siempre.
 *
 * Son también los únicos que una versión vieja de la app entiende, así que son
 * los únicos que se escriben en el campo `status` de Firestore (ver
 * `toStoredMedia`).
 */
export const LIST_STATUSES = ['por_ver', 'viendo', 'completada'] as const;

export type ListStatus = (typeof LIST_STATUSES)[number];

export const ARCHIVED_STATUSES: readonly ArchivedStatus[] = ['en_pausa', 'abandonada'];

export const STATUS_LABELS: Record<MediaStatus, string> = {
  por_ver: 'Por Ver',
  viendo: 'Viendo',
  completada: 'Completada',
  en_pausa: 'En pausa',
  abandonada: 'Abandonada',
};

export function isListStatus(value: unknown): value is ListStatus {
  return LIST_STATUSES.includes(value as ListStatus);
}

export function isArchivedStatus(value: unknown): value is ArchivedStatus {
  return ARCHIVED_STATUSES.includes(value as ArchivedStatus);
}

/**
 * Tope del motivo de abandono.
 *
 * Es un motivo y no una reseña: "se puso lenta", "no me enganchó". Para
 * explayarse está la reseña, que sigue disponible.
 */
export const REASON_MAX_LENGTH = 80;

/**
 * Lo que tarda una serie en *Viendo* sin avance en ganarse la pregunta de si
 * la ponés en pausa.
 *
 * Dos meses: más que el hueco entre temporadas de una semanal —que se sigue
 * "viendo" aunque no salga nada— y menos que lo que tarda en olvidarse de qué
 * iba.
 */
export const PAUSE_SUGGESTION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lo último que hiciste con el título: el último episodio o el último cambio. */
export function lastActivity(media: SavedMedia): number {
  const at = Date.parse(media.progress?.lastWatchedAt ?? media.updatedAt);
  return Number.isFinite(at) ? at : 0;
}

/**
 * La serie que conviene preguntar si pausás: la de *Viendo* que lleva más
 * tiempo quieta, pasado el umbral.
 *
 * Es solo la pregunta —pausar lo decide la persona— y de a una: una lista de
 * cinco series "abandonadas por vos" se lee como un reto. Decir que no la
 * calla hasta que vuelva a haber movimiento y otra vez pasen los dos meses.
 */
export function pauseSuggestion(
  list: SavedMedia[],
  dismissed: Record<string, string>,
  now = new Date(),
): SavedMedia | null {
  const limit = now.getTime() - PAUSE_SUGGESTION_DAYS * DAY_MS;

  const candidates = list.filter((media) => {
    if (media.mediaType !== 'tv' || media.status !== 'viendo') return false;
    const activity = lastActivity(media);
    if (activity > limit) return false;
    const dismissedAt = Date.parse(dismissed[media.tmdbId] ?? '');
    return !(Number.isFinite(dismissedAt) && dismissedAt > activity);
  });

  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, media) =>
    lastActivity(media) < lastActivity(oldest) ? media : oldest,
  );
}

/**
 * Cuánto hace que no avanzás, en palabras: "2 meses", "más de un año". Para
 * armar "Hace 2 meses que no avanzás".
 */
export function idleLabel(media: SavedMedia, now = new Date()): string {
  const days = Math.floor((now.getTime() - lastActivity(media)) / DAY_MS);
  if (days >= 365) return 'más de un año';
  const months = Math.floor(days / 30);
  return months >= 2 ? `${months} meses` : `${days} días`;
}

/**
 * Si una entrada del historial es de una vuelta que abandonaste.
 *
 * Cuenta como opinión pero no como "lo viste": no suma a lo terminado en el
 * año, ni a las horas, ni a las veces que lo viste. Lo que viste entero antes
 * de abandonarlo —otra temporada, otra vuelta— sigue contando.
 */
export function isAbandonedEntry(entry: WatchEntry): boolean {
  return entry.abandoned === true;
}
