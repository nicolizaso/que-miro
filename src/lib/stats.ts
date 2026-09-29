import { SavedMedia, SeasonInfo, WatchEntry } from '@/types';
import { countableSeasons, watchedEpisodes } from '@/lib/progress';
import { toDayKey } from '@/lib/dates';
import { isAbandonedEntry } from '@/lib/archive';

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
 *
 * Lo que puntuaste al abandonar algo no entra: no es una vez que lo viste (ver
 * `isAbandonedEntry`). Sin esto, abandonar una serie con puntaje la sumaba
 * entera a las horas y a lo terminado en el año.
 */
export function allWatches(list: SavedMedia[]): Watch[] {
  return list
    .flatMap((media) =>
      (media.history ?? [])
        .filter((entry) => !isAbandonedEntry(entry))
        .map((entry) => ({ media, entry })),
    )
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
    const times = (media.history ?? []).filter(
      (entry) => !isAbandonedEntry(entry),
    ).length;
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

/** Un episodio visto con fecha, con lo que dura. */
export interface DatedEpisode {
  media: SavedMedia;
  seasonNumber: number;
  episode: number;
  watchedAt: Date;
  minutes: number;
}

/**
 * Los episodios marcados con fecha, de toda la biblioteca.
 *
 * Solo los que tienen fecha: lo marcado antes de que se anotara no dice
 * cuándo se vio, y ponerle una fecha inventada movería la actividad de un mes
 * a otro. Tampoco los especiales, que no cuentan para nada más.
 */
export function datedEpisodes(list: SavedMedia[]): DatedEpisode[] {
  const result: DatedEpisode[] = [];

  for (const media of list) {
    if (media.mediaType !== 'tv' || !media.progress?.watchedAt) continue;
    const seasons = new Map(countableSeasons(media).map((s) => [s.seasonNumber, s]));

    for (const [key, at] of Object.entries(media.progress.watchedAt)) {
      const [seasonNumber, episode] = key.split('x').map(Number);
      const season = seasons.get(seasonNumber);
      const watchedAt = new Date(at);
      if (!season || Number.isNaN(watchedAt.getTime())) continue;
      result.push({
        media,
        seasonNumber,
        episode,
        watchedAt,
        minutes: minutesPerEpisode(media, season),
      });
    }
  }

  return result;
}

/**
 * Los minutos de una vez que se terminó una serie que no están ya contados
 * episodio por episodio.
 *
 * Una serie vista con fechas suma sus horas el día de cada episodio; si además
 * sumara la serie entera el día en que se la terminó, esas horas contarían
 * dos veces. A cada vez que se terminó le tocan los episodios fechados entre
 * la vez anterior y esa: lo demás —lo marcado sin fecha, o una segunda vuelta
 * sin marcar episodios— va al día en que se terminó, como antes.
 */
function completionMinutes(
  media: SavedMedia,
  entry: WatchEntry,
  dated: DatedEpisode[],
): number {
  const total = runtimeMinutes(media);
  if (media.mediaType !== 'tv') return total;

  const completedAt = Date.parse(entry.completedAt);
  const previous = (media.history ?? [])
    .filter((other) => !isAbandonedEntry(other))
    .map((other) => Date.parse(other.completedAt))
    .filter((at) => at < completedAt)
    .sort((a, b) => b - a)[0] ?? -Infinity;

  const covered = dated
    .filter(
      (episode) =>
        episode.media.tmdbId === media.tmdbId &&
        episode.watchedAt.getTime() > previous &&
        episode.watchedAt.getTime() <= completedAt,
    )
    .reduce((sum, episode) => sum + episode.minutes, 0);

  return Math.max(total - covered, 0);
}

/**
 * Minutos que miraste en un año, con la misma regla que la actividad por mes:
 * los episodios con fecha suman el día que se vieron, y cada vez que
 * terminaste algo suma lo que no estaba ya contado episodio por episodio.
 */
export function minutesInYear(list: SavedMedia[], year: number): number {
  const dated = datedEpisodes(list);
  const fromEpisodes = dated
    .filter((episode) => episode.watchedAt.getFullYear() === year)
    .reduce((sum, episode) => sum + episode.minutes, 0);

  const fromCompletions = allWatches(list)
    .filter(({ entry }) => new Date(entry.completedAt).getFullYear() === year)
    .reduce((sum, { media, entry }) => sum + completionMinutes(media, entry, dated), 0);

  return fromEpisodes + fromCompletions;
}

export interface MonthlyActivity {
  /** `2026-03`, para ordenar sin ambigüedades. */
  key: string;
  label: string;
  /** Títulos terminados más episodios vistos: todo lo que se hizo ese mes. */
  value: number;
  titles: number;
  episodes: number;
  minutes: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Qué miraste cada mes, incluyendo los meses en cero.
 *
 * Cuenta títulos terminados y, desde que se guarda la fecha de cada episodio,
 * también episodios: una serie que miraste todo agosto aparece en agosto, no
 * recién el día en que la terminaste. Las horas siguen la misma regla.
 *
 * Los huecos importan: sin ellos, un gráfico de actividad junta marzo con
 * agosto y hace parecer constante algo que fueron dos rachas separadas.
 */
export function monthlyActivity(
  list: SavedMedia[],
  months = 12,
  now = new Date(),
): MonthlyActivity[] {
  const byMonth = new Map<string, { titles: number; episodes: number; minutes: number }>();
  const bump = (key: string, change: { titles?: number; episodes?: number; minutes?: number }) => {
    const current = byMonth.get(key) ?? { titles: 0, episodes: 0, minutes: 0 };
    byMonth.set(key, {
      titles: current.titles + (change.titles ?? 0),
      episodes: current.episodes + (change.episodes ?? 0),
      minutes: current.minutes + (change.minutes ?? 0),
    });
  };

  const dated = datedEpisodes(list);
  for (const episode of dated) {
    bump(monthKey(episode.watchedAt), { episodes: 1, minutes: episode.minutes });
  }

  for (const { media, entry } of allWatches(list)) {
    const date = new Date(entry.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    bump(monthKey(date), { titles: 1, minutes: completionMinutes(media, entry, dated) });
  }

  const result: MonthlyActivity[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = monthKey(date);
    const month = byMonth.get(key) ?? { titles: 0, episodes: 0, minutes: 0 };
    result.push({
      key,
      label: date.toLocaleDateString('es-AR', { month: 'short' }),
      value: month.titles + month.episodes,
      ...month,
    });
  }
  return result;
}

export interface HeatmapDay {
  /** `YYYY-MM-DD`, en la zona horaria del dispositivo. */
  date: string;
  count: number;
  /** Los días que todavía no llegaron, al final de la semana actual. */
  future: boolean;
}

export interface Heatmap {
  /** Columnas de lunes a domingo, de la semana más vieja a la actual. */
  weeks: HeatmapDay[][];
  /** El día con más actividad, para la escala de color. */
  max: number;
  total: number;
}

/**
 * Cuánto miraste cada día, en semanas de lunes a domingo, estilo el mapa de
 * contribuciones de GitHub.
 *
 * Cada episodio fechado es uno, y cada película o serie terminada, otro. Una
 * serie terminada el mismo día que su último episodio fechado no suma dos
 * veces: ese día ya tiene su marca.
 */
export function activityHeatmap(
  list: SavedMedia[],
  weeks = 52,
  now = new Date(),
): Heatmap {
  const counts = new Map<string, number>();
  const add = (date: Date) => {
    const key = toDayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  const dated = datedEpisodes(list);
  const episodeDays = new Set(
    dated.map((episode) => `${episode.media.tmdbId}:${toDayKey(episode.watchedAt)}`),
  );
  for (const episode of dated) add(episode.watchedAt);

  for (const { media, entry } of allWatches(list)) {
    const date = new Date(entry.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    if (episodeDays.has(`${media.tmdbId}:${toDayKey(date)}`)) continue;
    add(date);
  }

  const today = toDayKey(now);
  // El lunes de hace `weeks - 1` semanas: la última columna es la actual.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);

  const columns: HeatmapDay[][] = [];
  let max = 0;
  let total = 0;
  for (let week = 0; week < weeks; week++) {
    const days: HeatmapDay[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      const key = toDayKey(date);
      const count = counts.get(key) ?? 0;
      max = Math.max(max, count);
      total += count;
      days.push({ date: key, count, future: key > today });
    }
    columns.push(days);
  }

  return { weeks: columns, max, total };
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
        media.status !== 'abandonada' &&
        watchedEpisodes(media) > 0 &&
        (media.history?.length ?? 0) === 0,
    ).length,
  };
}

export interface AbandonmentStats {
  abandoned: number;
  /** Títulos que terminaste alguna vez: contra eso se mide lo abandonado. */
  finished: number;
  /** Abandonados sobre todo lo que tuvo final —terminado o abandonado—, de 0 a 1. */
  rate: number;
  /** Series abandonadas con algún episodio marcado: la base de las dos de abajo. */
  seriesWithProgress: number;
  /**
   * Cuántos episodios solés ver antes de dejar una serie: la mediana, que no
   * se deja arrastrar por esa que abandonaste en la sexta temporada.
   */
  usualEpisode?: number;
  /** Cuántas de esas quedaron en la primera temporada. */
  inFirstSeason: number;
}

/**
 * Lo que dejaste: cuánto abandonás y en qué episodio se te suele caer.
 *
 * `null` si no abandonaste nada, que es la mayoría: un panel en cero sería una
 * fila vacía con una excusa.
 */
export function abandonmentStats(list: SavedMedia[]): AbandonmentStats | null {
  const abandoned = list.filter((media) => media.status === 'abandonada');
  if (abandoned.length === 0) return null;

  const finished = new Set(allWatches(list).map(({ media }) => media.tmdbId)).size;
  const quitting = abandoned
    .filter((media) => media.mediaType === 'tv')
    .map((media) => {
      const watched = media.progress?.watched ?? {};
      const seasons = countableSeasons(media)
        .filter((season) => (watched[season.seasonNumber]?.length ?? 0) > 0)
        .map((season) => season.seasonNumber);
      return { episodes: watchedEpisodes(media), lastSeason: Math.max(0, ...seasons) };
    })
    .filter(({ episodes }) => episodes > 0);

  const counts = quitting.map(({ episodes }) => episodes).sort((a, b) => a - b);
  const middle = Math.floor(counts.length / 2);
  const median =
    counts.length === 0
      ? undefined
      : counts.length % 2 === 1
        ? counts[middle]
        : Math.round((counts[middle - 1] + counts[middle]) / 2);

  return {
    abandoned: abandoned.length,
    finished,
    rate: abandoned.length / (abandoned.length + finished),
    seriesWithProgress: quitting.length,
    usualEpisode: median,
    inFirstSeason: quitting.filter(({ lastSeason }) => lastSeason === 1).length,
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
