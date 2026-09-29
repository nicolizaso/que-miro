import { SavedMedia, SeasonInfo, WatchEntry } from '@/types';
import { countableSeasons, watchedEpisodes } from '@/lib/progress';

/** Un visionado junto al título al que pertenece. */
export interface Watch {
  media: SavedMedia;
  entry: WatchEntry;
}

/**
 * Duración por defecto cuando TMDB no la trae.
 *
 * Las horas vistas quedarían siempre cortas si un título sin `runtime` contara
 * cero. Estos promedios se acercan bastante y hacen que el número sirva como
 * orden de magnitud, que es para lo que se mira.
 */
const DEFAULT_MOVIE_RUNTIME = 110;
const DEFAULT_EPISODE_RUNTIME = 45;

/**
 * El historial completo, aplanado y ordenado de lo más reciente a lo más viejo.
 *
 * Es la base de casi todo lo demás: la unidad de las estadísticas es "una vez
 * que viste algo", no "un título". Ver *Matrix* tres veces son tres entradas.
 */
export function allWatches(list: SavedMedia[]): Watch[] {
  return list
    .flatMap((media) => (media.history ?? []).map((entry) => ({ media, entry })))
    .sort(
      (a, b) => Date.parse(b.entry.completedAt) - Date.parse(a.entry.completedAt),
    );
}

/**
 * Minutos que dura un episodio de esa temporada, en promedio.
 *
 * Si ya se sabe cuánto dura la temporada entera, sale de ahí; si no, de lo
 * que dura un episodio de la serie según TMDB, que en realidad es el primero.
 */
function minutesPerEpisode(media: SavedMedia, season: SeasonInfo): number {
  if (season.totalRuntime && season.episodeCount > 0) {
    return season.totalRuntime / season.episodeCount;
  }
  return media.runtime || DEFAULT_EPISODE_RUNTIME;
}

/**
 * Minutos que lleva ver un título una vez, de punta a punta.
 *
 * En una serie, temporada por temporada: la que ya se desplegó alguna vez
 * aporta su duración real, sumada episodio por episodio, y el resto se
 * estima con la del primer episodio. Estimar todo así se equivocaba feo con un
 * piloto largo o un final de dos horas.
 */
export function runtimeMinutes(media: SavedMedia): number {
  if (media.mediaType === 'movie') {
    return media.runtime || DEFAULT_MOVIE_RUNTIME;
  }

  const seasons = countableSeasons(media);
  if (seasons.length === 0) {
    return (media.runtime || DEFAULT_EPISODE_RUNTIME) * (media.totalEpisodes || 0);
  }

  return seasons.reduce(
    (total, season) =>
      total + (season.totalRuntime ?? minutesPerEpisode(media, season) * season.episodeCount),
    0,
  );
}

/** Minutos de los episodios marcados, temporada por temporada. */
function watchedMinutes(media: SavedMedia): number {
  const watched = media.progress?.watched;
  if (!watched) return 0;

  return countableSeasons(media).reduce((total, season) => {
    const seen = Math.min(watched[season.seasonNumber]?.length ?? 0, season.episodeCount);
    return total + seen * minutesPerEpisode(media, season);
  }, 0);
}

/**
 * Minutos vistos en total.
 *
 * Una serie terminada cuenta entera por cada vez que aparece en el historial.
 * Una serie a medias cuenta solo los episodios marcados: es lo que hace que el
 * número suba mientras alguien la está mirando y no de golpe al final.
 */
export function totalMinutes(list: SavedMedia[]): number {
  return list.reduce((total, media) => {
    const times = media.history?.length ?? 0;
    const completed = runtimeMinutes(media) * times;

    if (media.mediaType !== 'tv' || times > 0) return total + completed;

    return total + watchedMinutes(media);
  }, 0);
}

/** "3 días y 4 h", o "2 h 15 min" si es poco. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = Math.round(minutes % 60);
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} días y ${restHours} h` : `${days} días`;
}

export interface Slice {
  label: string;
  value: number;
}

/**
 * Cuántas veces aparece cada género en el historial, de mayor a menor.
 *
 * Un título de tres géneros suma en los tres: la pregunta que responde es "qué
 * mirás", no "cómo se reparte tu tiempo en porcentajes que sumen 100".
 */
export function genreDistribution(list: SavedMedia[], limit = 8): Slice[] {
  const counts = new Map<string, number>();

  for (const { media } of allWatches(list)) {
    for (const genre of media.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))
    .slice(0, limit);
}

/** Cuántos puntajes hay de cada valor, de 0,5 a 5. */
export function ratingDistribution(list: SavedMedia[]): Slice[] {
  const counts = new Map<number, number>();
  for (const { entry } of allWatches(list)) {
    counts.set(entry.rating, (counts.get(entry.rating) ?? 0) + 1);
  }

  const values = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  return values.map((rating) => ({
    label: rating.toString().replace('.', ','),
    value: counts.get(rating) ?? 0,
  }));
}

export interface MonthlyActivity {
  /** `2026-03`, para ordenar sin ambigüedades. */
  key: string;
  label: string;
  value: number;
}

/**
 * Cuántos títulos terminaste por mes, incluyendo los meses en cero.
 *
 * Los huecos importan: sin ellos, un gráfico de actividad junta marzo con
 * agosto y hace parecer constante algo que fueron dos rachas separadas.
 */
export function monthlyActivity(
  list: SavedMedia[],
  months = 12,
  now = new Date(),
): MonthlyActivity[] {
  const counts = new Map<string, number>();

  for (const { entry } of allWatches(list)) {
    const date = new Date(entry.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: MonthlyActivity[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      key,
      label: date.toLocaleDateString('es-AR', { month: 'short' }),
      value: counts.get(key) ?? 0,
    });
  }
  return result;
}

export interface LibrarySummary {
  totalWatches: number;
  uniqueTitles: number;
  averageRating: number;
  minutes: number;
  movies: number;
  series: number;
  /** Series empezadas y sin terminar. */
  inProgress: number;
}

/** Los números grandes del panel. */
export function summarize(list: SavedMedia[]): LibrarySummary {
  const watches = allWatches(list);
  const ratings = watches.map(({ entry }) => entry.rating);

  return {
    totalWatches: watches.length,
    uniqueTitles: new Set(watches.map(({ media }) => media.tmdbId)).size,
    averageRating:
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0,
    minutes: totalMinutes(list),
    movies: watches.filter(({ media }) => media.mediaType === 'movie').length,
    series: watches.filter(({ media }) => media.mediaType === 'tv').length,
    inProgress: list.filter(
      (media) =>
        media.mediaType === 'tv' &&
        watchedEpisodes(media) > 0 &&
        (media.history?.length ?? 0) === 0,
    ).length,
  };
}

/**
 * Los títulos mejor puntuados, sin repetir.
 *
 * Se queda con el mejor puntaje de cada título: si viste algo tres veces, es un
 * favorito, no tres.
 */
export function topRated(list: SavedMedia[], limit = 5): Watch[] {
  const best = new Map<number, Watch>();

  for (const watch of allWatches(list)) {
    const current = best.get(watch.media.tmdbId);
    if (!current || watch.entry.rating > current.entry.rating) {
      best.set(watch.media.tmdbId, watch);
    }
  }

  return Array.from(best.values())
    .sort(
      (a, b) =>
        b.entry.rating - a.entry.rating ||
        a.media.title.localeCompare(b.media.title, 'es'),
    )
    .slice(0, limit);
}
