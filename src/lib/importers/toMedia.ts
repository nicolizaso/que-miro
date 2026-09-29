import { SavedMedia, SeriesProgress, TMDbDetail, WatchEntry } from '@/types';
import { getGenreNames } from '@/lib/genres';
import { newWatchId, parseMedia } from '@/lib/schema';
import { enrichFromDetail } from '@/lib/enrich';
import { episodeKey, isSeriesComplete, isStillAiring } from '@/lib/progress';
import { isArchivedStatus } from '@/lib/archive';
import { Candidate } from '@/lib/importers/match';
import { ImportRecord, ImportWatch } from '@/lib/importers/types';

/** Un registro del export con el título de TMDB que le corresponde. */
export interface Resolved {
  record: ImportRecord;
  candidate: Candidate;
  /** La ficha, si se pidió (Trakt): con ella el título entra enriquecido. */
  detail?: TMDbDetail;
}

/**
 * Una fecha del export como ISO. Un día suelto va al mediodía UTC: así cae
 * en ese mismo día en cualquier huso de América y de España.
 */
function toIso(date: string | undefined, fallback: string): string {
  if (!date) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T12:00:00.000Z`;
  return Number.isNaN(Date.parse(date)) ? fallback : new Date(date).toISOString();
}

/**
 * Las veces vistas, como entradas del historial. Solo las que tienen
 * puntaje: el historial de la app siempre lleva uno, y una vez vista sin
 * puntaje no se puede anotar sin inventarlo.
 */
function historyOf(watches: ImportWatch[], now: string): WatchEntry[] {
  return watches
    .filter((watch): watch is ImportWatch & { rating: number } => watch.rating !== undefined)
    .map((watch) => ({
      id: newWatchId(),
      rating: watch.rating,
      ...(watch.text ? { text: watch.text } : {}),
      ...(watch.tags?.length ? { tags: watch.tags } : {}),
      completedAt: toIso(watch.date, now),
    }));
}

function progressOf(episodes: NonNullable<ImportRecord['episodes']>, now: string): SeriesProgress {
  const watched: Record<number, number[]> = {};
  const watchedAt: Record<string, string> = {};
  for (const { season, episode, watchedAt: at } of episodes) {
    watched[season] = [...(watched[season] ?? []), episode].sort((a, b) => a - b);
    if (at) watchedAt[episodeKey(season, episode)] = toIso(at, now);
  }
  const dates = Object.values(watchedAt).sort();
  return {
    watched,
    ...(dates.length ? { watchedAt, lastWatchedAt: dates[dates.length - 1] } : {}),
  };
}

/**
 * Un registro resuelto, como título de la biblioteca. Pasa por `parseMedia`,
 * la misma puerta que un documento de Firestore o un backup.
 */
export function recordToMedia(
  { record, candidate, detail }: Resolved,
  { now = new Date(), region = 'AR' }: { now?: Date; region?: string } = {},
): SavedMedia | null {
  const at = now.toISOString();
  const progress = record.episodes?.length ? progressOf(record.episodes, at) : undefined;

  const media: SavedMedia = {
    tmdbId: candidate.id,
    mediaType: candidate.mediaType,
    title: candidate.title,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath ?? null,
    releaseYear: candidate.year ? String(candidate.year) : '',
    genres: getGenreNames(candidate.genreIds ?? []),
    status: record.status,
    updatedAt: at,
    ...(progress ? { progress } : {}),
    ...(detail ? enrichFromDetail(detail, region, now) : {}),
  };

  if (detail?.poster_path && !media.posterPath) media.posterPath = detail.poster_path;
  if (detail?.backdrop_path && !media.backdropPath) media.backdropPath = detail.backdrop_path;

  let history = historyOf(record.watches, at);
  if (media.mediaType === 'tv' && progress) {
    // Con la ficha se sabe si la vio entera: terminada y sin nada por salir,
    // es completada, con su puntaje. Si no, sigue en Viendo, y el puntaje de
    // la serie no entra: una entrada en el historial es una vez vista entera.
    if (isSeriesComplete(media) && !isStillAiring(media)) media.status = 'completada';
    else history = [];
  }
  if (history.length) media.history = history;

  return parseMedia(media);
}

const STATUS_RANK = { por_ver: 0, viendo: 1, completada: 2 } as const;

function sameEntry(a: WatchEntry, b: WatchEntry): boolean {
  return a.completedAt.slice(0, 10) === b.completedAt.slice(0, 10) && a.rating === b.rating;
}

function mergeHistory(a: WatchEntry[] = [], b: WatchEntry[] = []): WatchEntry[] {
  const merged = [...a];
  for (const entry of b) if (!merged.some((known) => sameEntry(known, entry))) merged.push(entry);
  return merged.sort((x, y) => Date.parse(y.completedAt) - Date.parse(x.completedAt));
}

function mergeProgress(a?: SeriesProgress, b?: SeriesProgress): SeriesProgress | undefined {
  if (!a || !b) return a ?? b;
  const watched: Record<number, number[]> = { ...a.watched };
  for (const [season, episodes] of Object.entries(b.watched)) {
    watched[Number(season)] = Array.from(new Set([...(watched[Number(season)] ?? []), ...episodes])).sort(
      (x, y) => x - y,
    );
  }
  const watchedAt = { ...(b.watchedAt ?? {}), ...(a.watchedAt ?? {}) };
  const dates = Object.values(watchedAt).sort();
  return {
    ...a,
    watched,
    ...(dates.length ? { watchedAt, lastWatchedAt: dates[dates.length - 1] } : {}),
  };
}

/**
 * El mismo título que llega de dos exports —la misma película en IMDb y en
 * Letterboxd—: uno solo, con todas las veces que se vio.
 */
export function mergeImported(a: SavedMedia, b: SavedMedia): SavedMedia {
  const statusA = isArchivedStatus(a.status) ? 'viendo' : a.status;
  const statusB = isArchivedStatus(b.status) ? 'viendo' : b.status;
  const base = STATUS_RANK[statusB] > STATUS_RANK[statusA] ? b : a;
  const history = mergeHistory(a.history, b.history);
  const progress = mergeProgress(a.progress, b.progress);
  return {
    ...base,
    ...(history.length ? { history } : {}),
    ...(progress ? { progress } : {}),
  };
}

/**
 * Lo importado sobre lo que ya está en la biblioteca: suma, no pisa. Las
 * reseñas, puntajes y estados que ya había se quedan; lo nuevo se agrega.
 * `null` si no cambia nada: no hace falta escribirlo.
 */
export function mergeIntoLibrary(
  existing: SavedMedia | undefined,
  incoming: SavedMedia,
  now = new Date(),
): SavedMedia | null {
  if (!existing) return incoming;

  const history = mergeHistory(existing.history, incoming.history);
  const progress = mergeProgress(existing.progress, incoming.progress);
  const addsHistory = history.length > (existing.history?.length ?? 0);
  const addsEpisodes =
    JSON.stringify(progress?.watched ?? {}) !== JSON.stringify(existing.progress?.watched ?? {});

  let status = existing.status;
  // En pausa o abandonada se respeta, salvo que el export diga que la
  // terminaste: eso es más nuevo que haberla dejado.
  if (isArchivedStatus(status)) {
    if (!(incoming.status === 'completada' && addsHistory)) {
      return addsEpisodes ? { ...existing, progress, updatedAt: now.toISOString() } : null;
    }
    status = 'completada';
  } else if (STATUS_RANK[incoming.status as keyof typeof STATUS_RANK] > STATUS_RANK[status]) {
    status = incoming.status;
  }

  if (!addsHistory && !addsEpisodes && status === existing.status) return null;

  return parseMedia({
    ...existing,
    status,
    ...(history.length ? { history } : {}),
    ...(progress ? { progress } : {}),
    updatedAt: now.toISOString(),
  });
}
