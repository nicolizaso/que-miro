import { Goals, SavedMedia } from '@/types';
import { GoalProgress, bestStreakInYear, emptyGoals, goalProgress } from '@/lib/goals';
import { episodeKey, ratedEpisodes } from '@/lib/progress';
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
  /** El episodio mejor puntuado del año (ver {@link bestEpisodeOfYear}). */
  bestEpisode: YearEpisode | null;
  /** Lo más largo que te bancaste. */
  longest: Watch | null;
  /** Las metas de ese año que se cumplieron. */
  goalsMet: GoalProgress[];
  /** La racha más larga de semanas seguidas mirando algo, dentro del año. */
  bestStreak: number;
  movies: number;
  series: number;
}

export interface YearEpisode {
  media: SavedMedia;
  seasonNumber: number;
  episode: number;
  rating: number;
  /**
   * `false` si no se sabe cuándo lo viste y salió de la serie mejor puntuada
   * del año: lo marcado antes de que los episodios tuvieran fecha no se puede
   * ubicar en ningún año.
   */
  dated: boolean;
}

/**
 * El episodio mejor puntuado del año.
 *
 * El año lo pone la fecha en que se marcó el episodio. Si ninguno puntuado
 * tiene fecha de ese año —se marcaron antes de que se anotara cuándo—, sale
 * el mejor episodio de la serie mejor puntuada entre las que terminaste ese
 * año, que es lo más cercano que se puede decir sin inventar una fecha.
 */
export function bestEpisodeOfYear(
  list: SavedMedia[],
  year: number,
  watches: Watch[] = allWatches(list),
): YearEpisode | null {
  let best: (YearEpisode & { at: number }) | null = null;

  for (const media of list) {
    if (media.mediaType !== 'tv') continue;
    for (const rated of ratedEpisodes(media)) {
      const iso = media.progress?.watchedAt?.[episodeKey(rated.seasonNumber, rated.episode)];
      const at = iso ? Date.parse(iso) : Number.NaN;
      if (!Number.isFinite(at) || new Date(at).getFullYear() !== year) continue;
      // A igual puntaje gana el más reciente: es el que se recuerda del año.
      if (!best || rated.rating > best.rating || (rated.rating === best.rating && at > best.at)) {
        best = { media, ...rated, dated: true, at };
      }
    }
  }
  if (best) {
    const { at: _at, ...episode } = best;
    return episode;
  }

  const seriesOfYear = watches
    .filter(
      ({ media, entry }) =>
        media.mediaType === 'tv' && new Date(entry.completedAt).getFullYear() === year,
    )
    .sort((a, b) => b.entry.rating - a.entry.rating);

  for (const { media } of seriesOfYear) {
    const [top] = ratedEpisodes(media);
    if (top) return { media, ...top, dated: false };
  }
  return null;
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
  goals: Goals = emptyGoals(),
  now = new Date(),
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
    bestEpisode: bestEpisodeOfYear(list, year, watches),
    longest: sortedByLength[0] ?? null,
    goalsMet: goalProgress(list, goals, year, now).filter((goal) => goal.met),
    bestStreak: bestStreakInYear(list, year),
    movies: watches.filter(({ media }) => media.mediaType === 'movie').length,
    series: watches.filter(({ media }) => media.mediaType === 'tv').length,
  };
}
