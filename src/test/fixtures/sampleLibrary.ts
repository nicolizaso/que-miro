/**
 * Una biblioteca de ejemplo para los tests: títulos en las cinco listas, una
 * serie a mitad de temporada, otra al día con la próxima anunciada, una
 * película que llegó a una plataforma, reseñas, metas y el cuestionario
 * contestado. Los E2E la siembran en el localStorage del invitado y los tests
 * de componentes la cargan en el store.
 *
 * Fue la biblioteca del modo demo, que ya no existe; los comentarios de cada
 * título siguen diciendo para qué está.
 */
import { newWatchId } from '@/lib/schema';
import { emptyPicks } from '@/lib/picks';
import {
  EpisodeRef,
  Goals,
  MediaStatus,
  Restrictions,
  Subscriptions,
  MediaType,
  SavedMedia,
  SeriesProgress,
  SeriesStatus,
  TastePicks,
  WatchEntry,
} from '@/types';
import { toDayKey } from '@/lib/dates';

/**
 * Las respuestas de "Contanos de vos" de la persona del ejemplo.
 *
 * Sin esto, Explorar no tendría las filas que salen del cuestionario. Son
 * coherentes con su biblioteca: la película y la serie que puntuó 5, y la
 * gente que aparece en ellas.
 */
export function buildSamplePicks(): TastePicks {
  return {
    ...emptyPicks(),
    movie: {
      tmdbId: 496243,
      mediaType: 'movie',
      title: 'Parásitos',
      posterPath: null,
      releaseYear: '2019',
    },
    series: {
      tmdbId: 1396,
      mediaType: 'tv',
      title: 'Breaking Bad',
      posterPath: null,
      releaseYear: '2008',
    },
    genres: ['Drama', 'Ciencia Ficción', 'Suspenso'],
    actors: [{ id: 17604, name: 'Bryan Cranston', profilePath: null }],
    directors: [{ id: 21684, name: 'Bong Joon-ho', profilePath: null }],
    studios: [{ id: 10342, name: 'Studio Ghibli', logoPath: null }],
    decade: 2010,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Las metas del ejemplo, para el año en curso: una ya cumplida —así se ve la
 * tarjeta para compartir— y otra en camino, con su ritmo.
 */
/**
 * Las plataformas del ejemplo: una sola, para que "Lo que puedo ver ya" deje
 * algunas afuera. Sin logo: el de verdad llega con la lista de la región.
 */
export function buildSampleSubscriptions(now = new Date()): Subscriptions {
  return {
    providers: [{ id: 8, name: 'Netflix', logoPath: null }],
    updatedAt: now.toISOString(),
  };
}

/**
 * Lo que al ejemplo no le interesa: formatos que no tienen nada que ver con su
 * biblioteca y un piso en los 70 para películas, que deja adentro a *El
 * padrino* —su favorita más vieja— y afuera el cine mudo.
 */
export function buildSampleRestrictions(now = new Date()): Restrictions {
  return {
    minYear: { year: 1970, scope: 'movie' },
    excludedGenres: ['Reality', 'Talk Show'],
    updatedAt: now.toISOString(),
  };
}

export function buildSampleGoals(now = new Date()): Goals {
  return {
    byYear: { [String(now.getFullYear())]: { movies: 6, series: 3 } },
    updatedAt: now.toISOString(),
  };
}

interface SampleSeedEntry {
  tmdbId: number;
  mediaType: MediaType;
  /** Fallback: si la hidratación desde TMDB funciona, gana lo que diga TMDB. */
  title: string;
  releaseYear: string;
  genres: string[];
  status: MediaStatus;
  /** Días hacia atrás desde hoy, para que el orden por fecha se vea natural. */
  daysAgo: number;
  rating?: number;
  reviewText?: string;
  tags?: string[];
  /**
   * Temporadas de la serie: número de temporada -> cantidad de episodios.
   *
   * Van en el seed y no solo en la hidratación porque sin ellas el progreso no
   * se puede dibujar: marcar "vi nueve episodios" no dice nada si no se sabe
   * cuántos tiene la temporada. Si TMDB responde, sus datos las reemplazan.
   */
  seasons?: Record<number, number>;
  /** Episodios vistos por temporada, para las series empezadas. */
  watched?: Record<number, number[]>;
  /** Puntajes de algunos episodios vistos (`"2x5"`), para "tu mejor episodio". */
  episodeRatings?: Record<string, number>;
  /**
   * Dónde está incluido, para que "Lo que puedo ver ya" tenga algo que
   * mostrar aunque TMDB no conteste. Si contesta, gana lo de TMDB.
   */
  streaming?: string[];
  /** Una novedad sin ver: llegó a esa plataforma hace `daysAgo` días. */
  arrivedAt?: { provider: string; daysAgo: number };
  /**
   * En qué anda la serie y qué salió, para que el ejemplo muestre "al día" y
   * las novedades aunque TMDB no conteste. Si contesta, gana lo de TMDB.
   */
  seriesStatus?: SeriesStatus;
  /** El último episodio que salió, hace `daysAgo` días. */
  lastAired?: { season: number; episode: number; daysAgo: number };
  /** El próximo episodio, dentro de `inDays` días. */
  nextToAir?: { season: number; episode: number; inDays: number; name?: string };
  /** Desde qué episodio hay novedades sin ver, para el aviso de la tarjeta. */
  newSince?: { season: number; episode: number };
  /**
   * Para las que están en pausa o abandonadas: hace cuánto, y el motivo y el
   * puntaje que se dejaron al abandonar.
   */
  archive?: { daysAgo: number; reason?: string; rating?: number };
}

export const SAMPLE_SEED: SampleSeedEntry[] = [
  {
    tmdbId: 496243,
    mediaType: 'movie',
    title: 'Parásitos',
    releaseYear: '2019',
    genres: ['Comedia', 'Suspenso', 'Drama'],
    status: 'completada',
    daysAgo: 4,
    rating: 5,
    reviewText:
      'Empieza como una comedia y termina siendo otra cosa. La escena de la inundación no me la saco más de la cabeza.',
    tags: ['Me voló la cabeza', 'Para pensar'],
  },
  {
    tmdbId: 1396,
    mediaType: 'tv',
    seasons: { 1: 7, 2: 13, 3: 13, 4: 13, 5: 16 },
    title: 'Breaking Bad',
    releaseYear: '2008',
    genres: ['Drama', 'Crimen'],
    status: 'completada',
    daysAgo: 11,
    rating: 5,
    reviewText: 'La quinta temporada justifica todo lo anterior.',
    tags: ['Para maratonear'],
  },
  {
    tmdbId: 157336,
    mediaType: 'movie',
    title: 'Interestelar',
    releaseYear: '2014',
    genres: ['Aventura', 'Drama', 'Ciencia Ficción'],
    status: 'completada',
    daysAgo: 19,
    rating: 4.5,
    reviewText: 'La banda sonora hace la mitad del trabajo, y está perfecto así.',
    tags: ['Para llorar'],
  },
  {
    tmdbId: 87108,
    mediaType: 'tv',
    seasons: { 1: 5 },
    title: 'Chernobyl',
    releaseYear: '2019',
    genres: ['Drama'],
    status: 'completada',
    daysAgo: 27,
    rating: 4.5,
  },
  {
    tmdbId: 244786,
    mediaType: 'movie',
    title: 'Whiplash',
    releaseYear: '2014',
    genres: ['Drama', 'Música'],
    status: 'completada',
    daysAgo: 38,
    rating: 4.5,
    reviewText: 'Salí del cine con taquicardia.',
    tags: ['Me voló la cabeza'],
  },
  {
    tmdbId: 545611,
    mediaType: 'movie',
    title: 'Todo en Todas Partes al Mismo Tiempo',
    releaseYear: '2022',
    genres: ['Acción', 'Aventura', 'Ciencia Ficción'],
    status: 'completada',
    daysAgo: 52,
    rating: 4,
    reviewText: 'Caótica de una forma que funciona. Se me hizo un poco larga.',
  },
  {
    // Terminó la primera temporada y ya salió la segunda: es la que muestra el
    // aviso de "T2 nueva" y el botón para volver a Viendo.
    tmdbId: 100088,
    mediaType: 'tv',
    seasons: { 1: 9, 2: 7 },
    title: 'The Last of Us',
    releaseYear: '2023',
    genres: ['Drama', 'Sci-Fi y Fantasía'],
    status: 'completada',
    daysAgo: 45,
    rating: 4.5,
    reviewText: 'El tercer episodio solo ya vale la temporada.',
    tags: ['Para llorar'],
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    seriesStatus: 'Returning Series',
    lastAired: { season: 2, episode: 7, daysAgo: 12 },
    newSince: { season: 2, episode: 1 },
  },
  {
    tmdbId: 95396,
    mediaType: 'tv',
    seasons: { 1: 9, 2: 10 },
    title: 'Severance',
    releaseYear: '2022',
    genres: ['Drama', 'Misterio', 'Ciencia Ficción'],
    status: 'viendo',
    daysAgo: 1,
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9], 2: [1, 2, 3] },
    episodeRatings: { '1x1': 4, '1x7': 4.5, '1x9': 5, '2x1': 3.5, '2x3': 4 },
    seriesStatus: 'Returning Series',
    nextToAir: { season: 3, episode: 1, inDays: 45 },
  },
  {
    // Al día: vio todo lo que salió de una serie que sigue saliendo.
    tmdbId: 136315,
    mediaType: 'tv',
    seasons: { 1: 8, 2: 10, 3: 10 },
    title: 'The Bear',
    releaseYear: '2022',
    genres: ['Drama', 'Comedia'],
    status: 'viendo',
    daysAgo: 3,
    watched: {
      1: [1, 2, 3, 4, 5, 6, 7, 8],
      2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
    episodeRatings: { '1x7': 5, '2x6': 5, '2x7': 4.5, '3x1': 2.5, '3x2': 3.5 },
    seriesStatus: 'Returning Series',
    lastAired: { season: 3, episode: 10, daysAgo: 20 },
    // Con fecha para la temporada que viene: es lo que llena el calendario.
    nextToAir: { season: 4, episode: 1, inDays: 12 },
  },
  {
    tmdbId: 94605,
    mediaType: 'tv',
    seasons: { 1: 9, 2: 9 },
    title: 'Arcane',
    releaseYear: '2021',
    genres: ['Animación', 'Ciencia Ficción', 'Aventura'],
    status: 'viendo',
    daysAgo: 8,
    watched: { 1: [1, 2, 3, 4, 5] },
  },
  {
    // En pausa: la primera temporada entera y un poco de la segunda. Es la
    // que muestra Archivadas y el "Retomar".
    tmdbId: 65494,
    mediaType: 'tv',
    seasons: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10 },
    title: 'The Crown',
    releaseYear: '2016',
    genres: ['Drama'],
    status: 'en_pausa',
    daysAgo: 20,
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2: [1, 2, 3] },
    seriesStatus: 'Ended',
    archive: { daysAgo: 20 },
  },
  {
    // Abandonada con motivo y puntaje: le da algo que mostrar a "Lo que
    // dejás" en las estadísticas.
    tmdbId: 63247,
    mediaType: 'tv',
    seasons: { 1: 10, 2: 10, 3: 8, 4: 8 },
    title: 'Westworld',
    releaseYear: '2016',
    genres: ['Drama', 'Ciencia Ficción', 'Western'],
    status: 'abandonada',
    daysAgo: 45,
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2: [1, 2, 3, 4] },
    seriesStatus: 'Canceled',
    archive: {
      daysAgo: 45,
      reason: 'Se volvió un laberinto en la segunda temporada',
      rating: 2.5,
    },
  },
  {
    tmdbId: 438631,
    mediaType: 'movie',
    title: 'Duna',
    releaseYear: '2021',
    genres: ['Ciencia Ficción', 'Aventura'],
    status: 'por_ver',
    streaming: ['Max'],
    // La novedad del inicio: "Duna ya está en Max".
    arrivedAt: { provider: 'Max', daysAgo: 1 },
    daysAgo: 2,
  },
  {
    tmdbId: 129,
    mediaType: 'movie',
    title: 'El Viaje de Chihiro',
    releaseYear: '2001',
    genres: ['Animación', 'Familia', 'Fantasía'],
    status: 'por_ver',
    streaming: ['Netflix'],
    daysAgo: 5,
  },
  {
    tmdbId: 335984,
    mediaType: 'movie',
    title: 'Blade Runner 2049',
    releaseYear: '2017',
    genres: ['Ciencia Ficción', 'Drama'],
    status: 'por_ver',
    daysAgo: 9,
  },
  {
    tmdbId: 70523,
    mediaType: 'tv',
    seasons: { 1: 10, 2: 8, 3: 8 },
    title: 'Dark',
    releaseYear: '2017',
    genres: ['Drama', 'Misterio', 'Sci-Fi y Fantasía'],
    status: 'por_ver',
    streaming: ['Netflix'],
    daysAgo: 14,
  },
  {
    tmdbId: 238,
    mediaType: 'movie',
    title: 'El Padrino',
    releaseYear: '1972',
    genres: ['Drama', 'Crimen'],
    status: 'por_ver',
    daysAgo: 21,
  },
  {
    tmdbId: 76331,
    mediaType: 'tv',
    seasons: { 1: 10, 2: 10, 3: 9, 4: 10 },
    title: 'Succession',
    releaseYear: '2018',
    genres: ['Drama'],
    status: 'por_ver',
    streaming: ['Max'],
    daysAgo: 30,
  },
  {
    tmdbId: 680,
    mediaType: 'movie',
    title: 'Pulp Fiction',
    releaseYear: '1994',
    genres: ['Suspenso', 'Crimen'],
    status: 'por_ver',
    daysAgo: 41,
  },
];

function daysAgoToIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Fechas para los episodios vistos del seed, hacia atrás desde la última vez.
 *
 * Un ritmo creíble —a veces dos seguidos, a veces un par de días sin nada— en
 * vez de uno por día exacto: es lo que hace que el mapa de actividad del ejemplo
 * se parezca al de alguien de verdad.
 */
function seedWatchedAt(
  watched: Record<number, number[]>,
  lastDaysAgo: number,
): Record<string, string> {
  const episodes = Object.entries(watched)
    .flatMap(([season, numbers]) => numbers.map((episode) => [Number(season), episode]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const gaps = [0, 1, 1, 3, 0, 2];
  const result: Record<string, string> = {};
  let daysAgo = lastDaysAgo;
  for (let index = episodes.length - 1; index >= 0; index--) {
    const [season, episode] = episodes[index];
    result[`${season}x${episode}`] = daysAgoToIso(daysAgo);
    daysAgo += gaps[index % gaps.length];
  }
  return result;
}

/** Un episodio del seed, con su fecha contada desde hoy. */
function seedEpisode(season: number, episode: number, offsetDays: number, name?: string): EpisodeRef {
  return {
    seasonNumber: season,
    episodeNumber: episode,
    airDate: toDayKey(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)),
    ...(name ? { name } : {}),
  };
}

/**
 * Arma la biblioteca de ejemplo.
 *
 * Sale sin pósters a propósito: las rutas de imagen de TMDB cambian con el
 * tiempo y una hardcodeada rota sin aviso. Las tarjetas muestran su
 * placeholder.
 */
export function buildSampleLibrary(): SavedMedia[] {
  return SAMPLE_SEED.map((entry) => {
    const progress: SeriesProgress | undefined = entry.watched
      ? {
          watched: entry.watched,
          watchedAt: seedWatchedAt(entry.watched, entry.daysAgo),
          episodeRatings: entry.episodeRatings,
          lastWatchedAt: daysAgoToIso(entry.daysAgo),
        }
      : undefined;

    const seasons = entry.seasons
      ? Object.entries(entry.seasons).map(([number, episodeCount]) => ({
          seasonNumber: Number(number),
          name: `Temporada ${number}`,
          episodeCount,
        }))
      : undefined;

    return {
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      title: entry.title,
      posterPath: null,
      backdropPath: null,
      releaseYear: entry.releaseYear,
      genres: entry.genres,
      status: entry.status,
      providers: entry.streaming,
      streaming: entry.streaming,
      availabilityNews: entry.arrivedAt
        ? [
            {
              kind: 'provider' as const,
              provider: entry.arrivedAt.provider,
              since: daysAgoToIso(entry.arrivedAt.daysAgo),
            },
          ]
        : undefined,
      updatedAt: daysAgoToIso(entry.daysAgo),
      seasons,
      progress,
      seriesStatus: entry.seriesStatus,
      lastAired: entry.lastAired
        ? seedEpisode(entry.lastAired.season, entry.lastAired.episode, -entry.lastAired.daysAgo)
        : undefined,
      nextToAir: entry.nextToAir
        ? seedEpisode(
            entry.nextToAir.season,
            entry.nextToAir.episode,
            entry.nextToAir.inDays,
            entry.nextToAir.name,
          )
        : undefined,
      newEpisodesSince: entry.newSince
        ? {
            seasonNumber: entry.newSince.season,
            episodeNumber: entry.newSince.episode,
            detectedAt: daysAgoToIso(entry.lastAired?.daysAgo ?? 1),
          }
        : undefined,
      history: seedHistory(entry),
      archive: entry.archive
        ? {
            at: daysAgoToIso(entry.archive.daysAgo),
            ...(entry.archive.reason ? { reason: entry.archive.reason } : {}),
          }
        : undefined,
    };
  });
}

/** La reseña del seed, o el puntaje que se dejó al abandonar. */
function seedHistory(entry: SampleSeedEntry): WatchEntry[] | undefined {
  if (entry.rating !== undefined) {
    return [
      {
        id: newWatchId(),
        rating: entry.rating,
        text: entry.reviewText,
        tags: entry.tags,
        completedAt: daysAgoToIso(entry.daysAgo),
      },
    ];
  }
  if (entry.archive?.rating !== undefined) {
    return [
      {
        id: newWatchId(),
        rating: entry.archive.rating,
        completedAt: daysAgoToIso(entry.archive.daysAgo),
        abandoned: true,
      },
    ];
  }
  return undefined;
}
