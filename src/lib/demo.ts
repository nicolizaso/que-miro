import { useMediaStore } from '@/store';
import { getMediaDetail } from '@/lib/tmdb';
import { enrichFromDetail } from '@/lib/enrich';
import { newWatchId } from '@/lib/schema';
import { emptyPicks, parsePicks } from '@/lib/picks';
import {
  EpisodeRef,
  MediaStatus,
  MediaType,
  SavedMedia,
  SeriesProgress,
  SeriesStatus,
  TastePicks,
  WatchEntry,
} from '@/types';
import { toDayKey } from '@/lib/dates';

/**
 * Dueño ficticio de la biblioteca de demostración.
 *
 * Es la pieza que impide que los datos de ejemplo contaminen una cuenta real:
 * `SyncManager` descarta la biblioteca local cuando su `ownerUid` no coincide
 * con el del usuario que inicia sesión, y este valor nunca va a coincidir con
 * un UID de Firebase. Los datos de invitado (`ownerUid === null`) sí se migran;
 * los del demo, no.
 */
export const DEMO_OWNER_UID = 'demo';

/** Copia de los datos de invitado mientras el demo está activo. */
const SNAPSHOT_KEY = 'que-miro-pre-demo';

/**
 * Las respuestas de "Contanos de vos" de la persona ficticia del demo.
 *
 * Sin esto, el demo mostraría el cuestionario en blanco y ninguna de las filas
 * que salen de él —que son justo las que conviene mostrarle a alguien que está
 * mirando la app por primera vez—. Son coherentes con su biblioteca: la
 * película y la serie que puntuó 5, y la gente que aparece en ellas.
 */
export function buildDemoPicks(): TastePicks {
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

interface DemoSeedEntry {
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
   * En qué anda la serie y qué salió, para que el demo muestre "al día" y
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

export const DEMO_SEED: DemoSeedEntry[] = [
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
    daysAgo: 2,
  },
  {
    tmdbId: 129,
    mediaType: 'movie',
    title: 'El Viaje de Chihiro',
    releaseYear: '2001',
    genres: ['Animación', 'Familia', 'Fantasía'],
    status: 'por_ver',
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
 * vez de uno por día exacto: es lo que hace que el mapa de actividad del demo
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
 * tiempo y una hardcodeada rota sin aviso. Las trae `hydrateDemoLibrary` desde
 * la API, y mientras tanto las tarjetas muestran su placeholder.
 */
export function buildDemoLibrary(): SavedMedia[] {
  return DEMO_SEED.map((entry) => {
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
function seedHistory(entry: DemoSeedEntry): WatchEntry[] | undefined {
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

/**
 * Completa la biblioteca del demo con los datos reales de TMDB.
 *
 * Toma de la API también el título, el año y los géneros, no solo el póster:
 * así la tarjeta queda coherente aunque un id del seed apunte a otra cosa.
 * Si la API no responde, la biblioteca sigue en pie con los datos del seed.
 */
export async function hydrateDemoLibrary(region: string): Promise<void> {
  const results = await Promise.allSettled(
    DEMO_SEED.map((entry) => getMediaDetail(entry.tmdbId, entry.mediaType)),
  );

  const patches = new Map<number, Partial<SavedMedia>>();
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;

    const detail = result.value;
    const date = detail.release_date || detail.first_air_date || '';

    patches.set(DEMO_SEED[index].tmdbId, {
      posterPath: detail.poster_path,
      backdropPath: detail.backdrop_path,
      releaseYear: date ? date.split('-')[0] : DEMO_SEED[index].releaseYear,
      // Temporadas y plataformas: sin esto el demo no puede mostrar ni el
      // progreso por episodio ni el filtro por plataforma. Trae también el
      // título y los géneros, en el castellano de la región elegida; si TMDB
      // no los manda, quedan los del seed.
      ...enrichFromDetail(detail, region),
    });
  });

  if (patches.size === 0) return;

  const { mediaList, ownerUid, setMediaList } = useMediaStore.getState();
  // Si el demo se cerró mientras las respuestas estaban en vuelo, no se toca
  // la biblioteca que haya quedado en su lugar.
  if (ownerUid !== DEMO_OWNER_UID) return;

  setMediaList(
    mediaList.map((media) => {
      const patch = patches.get(media.tmdbId);
      return patch ? { ...media, ...patch } : media;
    }),
  );
}

/**
 * Entra al modo demo, guardando antes lo que la persona tuviera como invitado
 * para poder devolvérselo al salir.
 */
export function enterDemoMode(): void {
  const { mediaList, picks, ownerUid, setMediaList, setPicks, setOwnerUid } =
    useMediaStore.getState();

  if (ownerUid !== DEMO_OWNER_UID) {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ media: mediaList, picks }));
    } catch {
      // Sin storage disponible se pierde el respaldo, pero el demo funciona.
    }
  }

  setMediaList(buildDemoLibrary());
  setPicks(buildDemoPicks());
  setOwnerUid(DEMO_OWNER_UID);
}

/** Sale del demo y restituye lo que había antes: biblioteca y respuestas. */
export function exitDemoMode(): void {
  const { setMediaList, setPicks, setOwnerUid } = useMediaStore.getState();

  let media: SavedMedia[] = [];
  let picks: TastePicks = emptyPicks();

  try {
    const snapshot = localStorage.getItem(SNAPSHOT_KEY);
    if (snapshot) {
      const parsed: unknown = JSON.parse(snapshot);
      // El respaldo era un array pelado antes de que existiera el
      // cuestionario: quien entró al demo con la versión anterior y sale con
      // esta tiene que recuperar igual su biblioteca.
      if (Array.isArray(parsed)) {
        media = parsed as SavedMedia[];
      } else if (parsed && typeof parsed === 'object') {
        const snapshotObject = parsed as { media?: unknown; picks?: unknown };
        media = Array.isArray(snapshotObject.media)
          ? (snapshotObject.media as SavedMedia[])
          : [];
        picks = parsePicks(snapshotObject.picks);
      }
    }
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    media = [];
  }

  setMediaList(media);
  setPicks(picks);
  setOwnerUid(null);
}
