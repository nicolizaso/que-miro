import {
  EpisodeRef,
  Keyword,
  Person,
  SavedMedia,
  SeasonInfo,
  SeriesStatus,
  TMDbDetail,
  TMDbEpisodeToAir,
} from '@/types';
import { pickProviders } from '@/lib/providers';
import { canonicalGenreNames } from '@/lib/genres';
import { DEFAULT_LANGUAGE, languageForRegion } from '@/lib/language';
import { isDayKey, toDayKey } from '@/lib/dates';

/** Cuántas plataformas se guardan por título. Más que esto no aporta nada. */
const MAX_PROVIDERS = 8;

/**
 * Cuánta gente se guarda por título.
 *
 * El reparto principal y nada más: en el puesto quince de los créditos de una
 * película están el mozo y el policía de la esquina, y nadie eligió una peli
 * por ellos. Ocho es donde todavía hay caras que alguien podría reconocer.
 */
const MAX_CAST = 8;

/** Temas por título. Son para agrupar, no para describir: con seis alcanza. */
const MAX_KEYWORDS = 8;

/** Los campos que se completan con la ficha de TMDB al guardar un título. */
export type MediaEnrichment = Pick<
  SavedMedia,
  | 'runtime'
  | 'seasons'
  | 'totalEpisodes'
  | 'providers'
  | 'providerRegion'
  | 'people'
  | 'keywords'
  | 'sagaId'
  | 'sagaName'
  | 'originalLanguage'
  | 'enrichedLanguage'
  | 'enrichedRegion'
  | 'enrichedAt'
  | 'seriesStatus'
  | 'lastAired'
  | 'nextToAir'
> & {
  /**
   * El título, en el idioma en que se pidió la ficha.
   *
   * Va en el enriquecimiento para que refrescar lo corrija: un título guardado
   * en castellano de España pasa al latino la próxima vez que se refresca.
   * Opcional porque nunca se pisa con uno vacío.
   */
  title?: string;
  /** Los géneros con el nombre de la app. Opcional por lo mismo. */
  genres?: string[];
};

/**
 * El reparto principal y quienes dirigieron, en una sola lista.
 *
 * En las películas la dirección está en `crew`; en las series, en `created_by`
 * —TMDB no las trata igual, pero para recomendar son lo mismo: la persona
 * cuya firma se reconoce en lo que uno vio.
 */
export function peopleFromDetail(detail: TMDbDetail): Person[] {
  const cast: Person[] = (detail.credits?.cast ?? [])
    .slice(0, MAX_CAST)
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: 'reparto' as const,
      profilePath: member.profile_path,
    }));

  const directors: Person[] = (detail.credits?.crew ?? [])
    .filter((member) => member.job === 'Director')
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: 'direccion' as const,
      profilePath: member.profile_path,
    }));

  const creators: Person[] = (detail.created_by ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    role: 'direccion' as const,
    profilePath: member.profile_path,
  }));

  // Dirección primero: si alguien dirigió y además actuó, el rol que importa
  // para recomendar es el de dirección.
  const all = [...directors, ...creators, ...cast];
  return all.filter(
    (person, index) => all.findIndex((p) => p.id === person.id) === index,
  );
}

/** Los temas del título, vengan del campo de películas o del de series. */
function keywordsFromDetail(detail: TMDbDetail): Keyword[] | undefined {
  const raw = detail.keywords?.keywords ?? detail.keywords?.results ?? [];
  const keywords = raw
    .filter((keyword) => keyword?.id && keyword?.name)
    .slice(0, MAX_KEYWORDS)
    .map((keyword) => ({ id: keyword.id, name: keyword.name }));

  return keywords.length > 0 ? keywords : undefined;
}

const SERIES_STATUSES: SeriesStatus[] = [
  'Returning Series',
  'Planned',
  'In Production',
  'Ended',
  'Canceled',
  'Pilot',
];

/** El `status` de la ficha, si es uno de los que TMDB usa para las series. */
export function parseSeriesStatus(value: unknown): SeriesStatus | undefined {
  return SERIES_STATUSES.includes(value as SeriesStatus)
    ? (value as SeriesStatus)
    : undefined;
}

/** Un episodio de TMDB en la forma de la biblioteca, o `undefined` si no sirve. */
export function episodeFromTmdb(
  episode: TMDbEpisodeToAir | null | undefined,
): EpisodeRef | undefined {
  if (!episode || !isDayKey(episode.air_date)) return undefined;
  const { season_number: seasonNumber, episode_number: episodeNumber } = episode;
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return undefined;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return undefined;

  return {
    seasonNumber,
    episodeNumber,
    airDate: episode.air_date,
    ...(episode.name ? { name: episode.name } : {}),
  };
}

/**
 * Si la ficha es de una serie.
 *
 * La de TMDB no dice su tipo —está en la ruta con que se pidió—, pero una
 * serie siempre trae su fecha de estreno en `first_air_date` y sus temporadas.
 */
function isSeriesDetail(detail: TMDbDetail): boolean {
  return (
    detail.media_type === 'tv' ||
    detail.first_air_date !== undefined ||
    Array.isArray(detail.seasons) ||
    detail.last_episode_to_air !== undefined ||
    detail.next_episode_to_air !== undefined
  );
}

/**
 * Extrae de la ficha de TMDB lo que la biblioteca necesita cachear.
 *
 * Se guarda en el título, en el momento de agregarlo, porque quienes lo usan
 * —el filtro por plataforma, el progreso por episodio, el picker de la próxima
 * tanda y las filas de Explorar— trabajan sobre la biblioteca entera. Pedirle a
 * TMDB la ficha de cada título cada vez que alguien mueve un filtro o abre
 * Explorar no es viable.
 *
 * La contracara es que son datos que envejecen: una serie suma temporadas y un
 * catálogo de streaming cambia todos los meses. Por eso {@link isStale} marca
 * cuándo conviene refrescarlos.
 */
export function enrichFromDetail(
  detail: TMDbDetail,
  preferredRegion: string,
  now: Date = new Date(),
): MediaEnrichment {
  const picked = pickProviders(detail, preferredRegion);

  const seasons = detail.seasons
    ?.filter((season) => season.episode_count > 0)
    .map((season) => ({
      seasonNumber: season.season_number,
      name: season.name || `Temporada ${season.season_number}`,
      episodeCount: season.episode_count,
    }));

  // En películas TMDB da `runtime`; en series, una lista de duraciones por
  // episodio de la que alcanza con la primera.
  const runtime = detail.runtime ?? detail.episode_run_time?.[0] ?? null;

  const people = peopleFromDetail(detail);
  const title = (detail.title || detail.name || '').trim();
  const genres = canonicalGenreNames(detail.genres);

  return {
    ...(title ? { title } : {}),
    ...(genres.length > 0 ? { genres } : {}),
    runtime: runtime && runtime > 0 ? runtime : null,
    seasons: seasons?.length ? seasons : undefined,
    totalEpisodes: detail.number_of_episodes ?? null,
    providers: picked?.providers
      .slice(0, MAX_PROVIDERS)
      .map((provider) => provider.provider_name),
    providerRegion: picked?.region,
    // Siempre un array, aunque venga vacío: es lo que distingue "este título no
    // tiene reparto cargado en TMDB" de "todavía no le pedimos la ficha", que
    // es lo que mira {@link needsPeople} para no repetir el pedido eternamente.
    people,
    keywords: keywordsFromDetail(detail),
    sagaId: detail.belongs_to_collection?.id ?? null,
    sagaName: detail.belongs_to_collection?.name,
    originalLanguage: detail.original_language,
    // La ficha se pidió en el idioma de esta misma región: es lo que después
    // mira `isStale` para saber si el título quedó en el castellano de otro.
    enrichedLanguage: languageForRegion(preferredRegion),
    enrichedRegion: preferredRegion,
    enrichedAt: now.toISOString(),
    // En una serie van siempre, aunque vengan vacíos: si el próximo episodio
    // ya salió, la escritura tiene que borrar el que estaba guardado.
    ...(isSeriesDetail(detail)
      ? {
          seriesStatus: parseSeriesStatus(detail.status),
          lastAired: episodeFromTmdb(detail.last_episode_to_air),
          nextToAir: episodeFromTmdb(detail.next_episode_to_air),
        }
      : {}),
  };
}

/**
 * Las temporadas recién traídas, con lo que la biblioteca ya sabía de ellas.
 *
 * La ficha de TMDB no trae la duración de cada temporada: esa se calcula
 * cuando alguien la despliega. Sin esto, cada refresco la borraría. Se
 * conserva solo si la temporada tiene los mismos episodios que cuando se
 * calculó: si sumó uno, esa suma ya no es cierta.
 */
export function mergeSeasons(
  fresh: SeasonInfo[] | undefined,
  saved: SeasonInfo[] | undefined,
): SeasonInfo[] | undefined {
  if (!fresh || !saved?.length) return fresh;

  return fresh.map((season) => {
    const previous = saved.find((item) => item.seasonNumber === season.seasonNumber);
    return previous?.totalRuntime && previous.episodeCount === season.episodeCount
      ? { ...season, totalRuntime: previous.totalRuntime }
      : season;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuánto dura fresca la ficha de una serie en emisión.
 *
 * Pocos días: suma un episodio por semana, y enterarse tarde de uno nuevo es
 * justo lo que el refresco viene a evitar. El episodio anunciado con fecha se
 * detecta aparte, al día siguiente de salir (ver {@link isStale}).
 */
export const AIRING_MAX_AGE_DAYS = 3;
/**
 * En producción, planeada o con un piloto: puede anunciar fecha de estreno
 * cualquier semana, pero no cambia de un día para el otro.
 */
export const UPCOMING_MAX_AGE_DAYS = 7;
/**
 * Terminada o cancelada: ya no suma episodios. Lo único que cambia es en qué
 * plataforma está, y eso rota cada tantos meses.
 */
export const FINISHED_MAX_AGE_DAYS = 90;
/**
 * Películas: la ficha no cambia, pero los catálogos de streaming rotan todos
 * los meses, y el filtro por plataforma vive de ese dato.
 */
export const MOVIE_MAX_AGE_DAYS = 30;

/** Cuántos días puede tener la ficha guardada antes de vencer. */
export function maxAgeDays(media: SavedMedia): number {
  if (media.mediaType === 'movie') return MOVIE_MAX_AGE_DAYS;

  switch (media.seriesStatus) {
    case 'Returning Series':
      return AIRING_MAX_AGE_DAYS;
    case 'Ended':
    case 'Canceled':
      return FINISHED_MAX_AGE_DAYS;
    default:
      // En producción, planeada, piloto, o un estado que TMDB estrenó y la
      // app todavía no conoce: una semana es un punto medio que no se pierde
      // un estreno por mucho ni pregunta de más.
      return UPCOMING_MAX_AGE_DAYS;
  }
}

/**
 * Los datos cacheados de un título están vencidos o nunca se trajeron.
 *
 * Vencen por cuatro motivos: nunca se pidieron, cambió el país (y con él el
 * catálogo y el idioma), pasó más tiempo del que aguanta ese tipo de título
 * ({@link maxAgeDays}), o salió el episodio que la ficha anunciaba.
 *
 * `now` se puede inyectar para los tests.
 */
export function isStale(
  media: SavedMedia,
  region: string,
  now: Date = new Date(),
): boolean {
  // Sin ninguna de las dos, la ficha no se pidió nunca.
  const requestedRegion = media.enrichedRegion ?? media.providerRegion;
  if (requestedRegion === undefined) return true;
  // Cambiar el país de las plataformas invalida lo que se había guardado con
  // el catálogo del país anterior.
  if (requestedRegion !== region) return true;
  // Y el idioma: lo guardado antes de que existiera se pidió en castellano de
  // España, y para quien está en Latinoamérica eso es un título equivocado.
  const language = media.enrichedLanguage ?? DEFAULT_LANGUAGE;
  if (language !== languageForRegion(region)) return true;

  // Lo enriquecido antes de que se anotara la fecha no tiene edad conocida:
  // se refresca una vez y de ahí en más vence por antigüedad.
  const enrichedAt = media.enrichedAt ? Date.parse(media.enrichedAt) : NaN;
  if (!Number.isFinite(enrichedAt)) return true;

  // El episodio que la ficha anunciaba ya salió, y la ficha es de antes: hay
  // que ir a buscar el siguiente. Es el atajo que hace que una serie semanal
  // se entere de cada episodio al día siguiente, sin preguntar todos los días.
  const today = toDayKey(now);
  const next = media.nextToAir?.airDate;
  if (next && next < today && toDayKey(new Date(enrichedAt)) <= next) {
    return true;
  }

  return now.getTime() - enrichedAt > maxAgeDays(media) * DAY_MS;
}

/**
 * Al título le falta el reparto, que se empezó a guardar después que él.
 *
 * Los títulos guardados antes de que existieran las filas por gente no tienen
 * `people`, y sin eso Explorar no puede hablar de directores ni de actrices.
 * Explorar los completa de a poco, en segundo plano.
 */
export function needsPeople(media: SavedMedia): boolean {
  return media.people === undefined;
}
