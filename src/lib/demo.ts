import { useMediaStore } from '@/store';
import { getMediaDetail } from '@/lib/tmdb';
import { enrichFromDetail } from '@/lib/enrich';
import { newWatchId } from '@/lib/schema';
import { MediaStatus, MediaType, SavedMedia, SeriesProgress } from '@/types';

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

/** Copia de la biblioteca de invitado mientras el demo está activo. */
const SNAPSHOT_KEY = 'que-miro-pre-demo';

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
    tmdbId: 95396,
    mediaType: 'tv',
    seasons: { 1: 9, 2: 10 },
    title: 'Severance',
    releaseYear: '2022',
    genres: ['Drama', 'Misterio', 'Ciencia Ficción'],
    status: 'viendo',
    daysAgo: 1,
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9], 2: [1, 2, 3] },
  },
  {
    tmdbId: 136315,
    mediaType: 'tv',
    seasons: { 1: 8, 2: 10, 3: 10 },
    title: 'The Bear',
    releaseYear: '2022',
    genres: ['Drama', 'Comedia'],
    status: 'viendo',
    daysAgo: 3,
    watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8] },
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
 * Arma la biblioteca de ejemplo.
 *
 * Sale sin pósters a propósito: las rutas de imagen de TMDB cambian con el
 * tiempo y una hardcodeada rota sin aviso. Las trae `hydrateDemoLibrary` desde
 * la API, y mientras tanto las tarjetas muestran su placeholder.
 */
export function buildDemoLibrary(): SavedMedia[] {
  return DEMO_SEED.map((entry) => {
    const progress: SeriesProgress | undefined = entry.watched
      ? { watched: entry.watched, lastWatchedAt: daysAgoToIso(entry.daysAgo) }
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
      history:
        entry.rating === undefined
          ? undefined
          : [
              {
                id: newWatchId(),
                rating: entry.rating,
                text: entry.reviewText,
                tags: entry.tags,
                completedAt: daysAgoToIso(entry.daysAgo),
              },
            ],
    };
  });
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
    const genres = detail.genres?.map((genre) => genre.name).filter(Boolean);

    patches.set(DEMO_SEED[index].tmdbId, {
      title: detail.title || detail.name || DEMO_SEED[index].title,
      posterPath: detail.poster_path,
      backdropPath: detail.backdrop_path,
      releaseYear: date ? date.split('-')[0] : DEMO_SEED[index].releaseYear,
      genres: genres?.length ? genres : DEMO_SEED[index].genres,
      // Temporadas y plataformas: sin esto el demo no puede mostrar ni el
      // progreso por episodio ni el filtro por plataforma.
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
  const { mediaList, ownerUid, setMediaList, setOwnerUid } =
    useMediaStore.getState();

  if (ownerUid !== DEMO_OWNER_UID) {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(mediaList));
    } catch {
      // Sin storage disponible se pierde el respaldo, pero el demo funciona.
    }
  }

  setMediaList(buildDemoLibrary());
  setOwnerUid(DEMO_OWNER_UID);
}

/** Sale del demo y restituye la biblioteca previa. */
export function exitDemoMode(): void {
  const { setMediaList, setOwnerUid } = useMediaStore.getState();

  let restored: SavedMedia[] = [];
  try {
    const snapshot = localStorage.getItem(SNAPSHOT_KEY);
    if (snapshot) restored = JSON.parse(snapshot) as SavedMedia[];
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    restored = [];
  }

  setMediaList(Array.isArray(restored) ? restored : []);
  setOwnerUid(null);
}
