import { SavedMedia } from '@/types';
import {
  Watch,
  allWatches,
  formatDuration,
  genreDistribution,
  runtimeMinutes,
} from '@/lib/stats';

export interface WrappedYear {
  year: number;
  watches: number;
  titles: number;
  minutes: number;
  timeLabel: string;
  averageRating: number;
  topGenre: string | null;
  /** El mes con más actividad, ya escrito. */
  busiestMonth: string | null;
  best: Watch | null;
  /** Lo más largo que te bancaste. */
  longest: Watch | null;
  movies: number;
  series: number;
}

/** Los años en los que hay algo que resumir, del más nuevo al más viejo. */
export function availableYears(list: SavedMedia[]): number[] {
  const years = new Set<number>();

  for (const { entry } of allWatches(list)) {
    const year = new Date(entry.completedAt).getFullYear();
    if (!Number.isNaN(year)) years.add(year);
  }

  return Array.from(years).sort((a, b) => b - a);
}

/**
 * El resumen de un año.
 *
 * Solo cuenta lo que se terminó *dentro* de ese año: una serie que empezaste en
 * diciembre y terminaste en enero pertenece al año en que la terminaste, que es
 * cuando la puntuaste. Es la única regla que no obliga a explicar nada.
 */
export function buildWrapped(
  list: SavedMedia[],
  year: number,
): WrappedYear | null {
  const watches = allWatches(list).filter(
    ({ entry }) => new Date(entry.completedAt).getFullYear() === year,
  );

  if (watches.length === 0) return null;

  const minutes = watches.reduce(
    (total, { media }) => total + runtimeMinutes(media),
    0,
  );

  const byMonth = new Map<number, number>();
  for (const { entry } of watches) {
    const month = new Date(entry.completedAt).getMonth();
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const busiest = Array.from(byMonth).sort((a, b) => b[1] - a[1])[0];

  // La distribución se calcula sobre los títulos de este año nada más, así que
  // se arma una lista acotada a ellos en vez de usar la biblioteca entera.
  const yearLibrary = watches.map(({ media, entry }) => ({
    ...media,
    history: [entry],
  }));

  const sortedByRating = [...watches].sort(
    (a, b) => b.entry.rating - a.entry.rating,
  );
  const sortedByLength = [...watches].sort(
    (a, b) => runtimeMinutes(b.media) - runtimeMinutes(a.media),
  );

  return {
    year,
    watches: watches.length,
    titles: new Set(watches.map(({ media }) => media.tmdbId)).size,
    minutes,
    timeLabel: formatDuration(minutes),
    averageRating:
      watches.reduce((sum, { entry }) => sum + entry.rating, 0) / watches.length,
    topGenre: genreDistribution(yearLibrary, 1)[0]?.label ?? null,
    busiestMonth: busiest
      ? new Date(year, busiest[0], 1).toLocaleDateString('es-AR', {
          month: 'long',
        })
      : null,
    best: sortedByRating[0] ?? null,
    longest: sortedByLength[0] ?? null,
    movies: watches.filter(({ media }) => media.mediaType === 'movie').length,
    series: watches.filter(({ media }) => media.mediaType === 'tv').length,
  };
}
