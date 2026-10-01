// src/lib/tmdb.ts
//
// Cliente del front. No habla con TMDB directamente: pega contra nuestras
// propias rutas `/api/tmdb/*`, que son las que tienen la API key. Así la key
// nunca viaja al navegador.
import {
  MediaType,
  TMDbCompany,
  TMDbDetail,
  TMDbPerson,
  TMDbResult,
  TMDbSeason,
} from '@/types';
import { usePreferences } from '@/preferences';
import {
  DEFAULT_LANGUAGE,
  TmdbLanguage,
  languageForRegion,
} from '@/lib/language';

export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_ORIGINAL_URL = 'https://image.tmdb.org/t/p/original';
/** Las imágenes de episodio van chicas: con 300 px de ancho sobra. */
export const TMDB_STILL_URL = 'https://image.tmdb.org/t/p/w300';
/** Avatares: un póster recortado en un círculo de 40 a 96 px. */
export const TMDB_AVATAR_URL = 'https://image.tmdb.org/t/p/w185';
/** Logos de plataformas: se muestran a 48 px, y el de 500 pesaba diez veces más. */
export const TMDB_LOGO_URL = 'https://image.tmdb.org/t/p/w92';

/** Error de red o de la API, con un mensaje ya listo para mostrarle al usuario. */
export class TMDbRequestError extends Error {}

export {
  canonicalGenreNames,
  genreOptions,
  getGenreId,
  getGenreNames,
} from '@/lib/genres';

/**
 * El idioma de los textos, según la región elegida.
 *
 * Se lee en el momento de cada pedido y no se pasa por parámetro: así cambiar
 * de país en Ajustes cambia también los títulos, sin que cada una de las
 * decenas de llamadas —las filas de Explorar, la ficha, el buscador— tenga que
 * acordarse de mandarlo.
 */
export function currentLanguage(): TmdbLanguage {
  return languageForRegion(usePreferences.getState().region);
}

/**
 * La ruta con el idioma de los textos.
 *
 * El de España no se escribe: es el que el servidor asume sin parámetro, y
 * así su respuesta comparte caché en el borde con la de los clientes que
 * todavía no lo mandan.
 */
function withLanguage(path: string): string {
  const language = currentLanguage();
  if (language === DEFAULT_LANGUAGE) return path;
  return `${path}${path.includes('?') ? '&' : '?'}lang=${language}`;
}

async function fetchApi<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    throw new TMDbRequestError(
      'No pudimos conectarnos. Revisá tu conexión a internet.',
    );
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((body) => (body as { error?: string })?.error)
      .catch(() => undefined);
    throw new TMDbRequestError(message ?? 'No pudimos obtener los datos.');
  }

  return (await response.json()) as T;
}

/**
 * Busca películas y series por texto.
 * @throws {TMDbRequestError} si la búsqueda falla, para que la UI pueda avisar.
 */
export async function searchMulti(query: string): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/search?query=${encodeURIComponent(query)}`),
  );
  return results;
}

/**
 * Busca personas por nombre: actores, actrices, directores.
 *
 * La usa el cuestionario de "Contanos de vos", donde hace falta poder nombrar a
 * alguien que no aparece en ninguna película de la biblioteca. No lleva idioma:
 * TMDB no traduce los nombres de las personas.
 * @throws {TMDbRequestError} si la búsqueda falla.
 */
export async function searchPeople(query: string): Promise<TMDbPerson[]> {
  const { results } = await fetchApi<{ results: TMDbPerson[] }>(
    `/api/tmdb/search?kind=person&query=${encodeURIComponent(query)}`,
  );
  return results;
}

/**
 * Busca productoras por nombre.
 * @throws {TMDbRequestError} si la búsqueda falla.
 */
export async function searchCompanies(query: string): Promise<TMDbCompany[]> {
  const { results } = await fetchApi<{ results: TMDbCompany[] }>(
    `/api/tmdb/search?kind=company&query=${encodeURIComponent(query)}`,
  );
  return results;
}

/**
 * Lo que está mirando todo el mundo.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getTrending(
  window: 'day' | 'week' = 'day',
): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/trending?window=${window}`),
  );
  return results;
}

/**
 * Populares o mejor puntuadas de una categoría.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getList(
  mediaType: 'movie' | 'tv',
  kind: 'popular' | 'top_rated',
): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/trending?type=${mediaType}&list=${kind}`),
  );
  return results;
}

/**
 * Títulos parecidos a uno dado.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getRecommendations(
  id: number,
  mediaType: 'movie' | 'tv',
): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/recommendations?type=${mediaType}&id=${id}`),
  );
  return results;
}

/**
 * Trae el detalle de un título (sinopsis, reparto, trailer, plataformas).
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getMediaDetail(
  id: number,
  mediaType: 'movie' | 'tv',
): Promise<TMDbDetail> {
  return fetchApi<TMDbDetail>(
    withLanguage(`/api/tmdb/detail?type=${mediaType}&id=${id}`),
  );
}

/** Un candidato de `/api/tmdb/find`, como lo manda el servidor. */
interface FindResult {
  id: number;
  media_type: MediaType;
  title: string;
  original_title: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
}

/** Un título posible para lo que llega de otra app (ver `lib/importers/match.ts`). */
export interface TitleCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  posterPath: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
}

function fromFindResult(result: FindResult): TitleCandidate {
  return {
    id: result.id,
    mediaType: result.media_type,
    title: result.title,
    originalTitle: result.original_title,
    ...(result.year ? { year: result.year } : {}),
    posterPath: result.poster_path,
    backdropPath: result.backdrop_path,
    genreIds: result.genre_ids,
  };
}

/**
 * Encontrar en TMDB lo que llega de otra app: por id de IMDb, o por título y
 * año de película o serie.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function findTitles(
  query: { imdb: string } | { type: MediaType; query: string; year?: number },
): Promise<TitleCandidate[]> {
  const params =
    'imdb' in query
      ? `imdb=${encodeURIComponent(query.imdb)}`
      : `type=${query.type}&query=${encodeURIComponent(query.query)}${query.year ? `&year=${query.year}` : ''}`;
  const { results } = await fetchApi<{ results: FindResult[] }>(withLanguage(`/api/tmdb/find?${params}`));
  return results.map(fromFindResult);
}

/** Un crédito de la página de persona, como lo manda el servidor. */
export interface PersonPageCredit {
  id: number;
  media_type: MediaType;
  title: string;
  date: string | null;
  poster_path: string | null;
  role: 'reparto' | 'direccion';
  character: string | null;
  job: string | null;
  vote_average: number;
  vote_count: number;
}

export interface PersonPage {
  person: {
    id: number;
    name: string;
    profile_path: string | null;
    biography: string;
    birthday: string | null;
    deathday: string | null;
    place_of_birth: string | null;
    known_for_department: string | null;
  };
  credits: PersonPageCredit[];
}

/**
 * La página de una persona: sus datos y su filmografía.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getPersonPage(id: number): Promise<PersonPage> {
  return fetchApi<PersonPage>(withLanguage(`/api/tmdb/person-page?id=${id}`));
}

/**
 * Los episodios de una temporada: nombre, sinopsis, fecha, duración e imagen.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getSeason(id: number, seasonNumber: number): Promise<TMDbSeason> {
  return fetchApi<TMDbSeason>(
    withLanguage(`/api/tmdb/season?id=${id}&season=${seasonNumber}`),
  );
}

/** Una plataforma de streaming de un país, como la manda `/api/tmdb/providers`. */
export interface RegionProvider {
  id: number;
  name: string;
  logoPath: string | null;
  priority: number;
}

/**
 * Las plataformas de un país, de películas y de series juntas.
 *
 * Son dos listas en TMDB, y casi todas las plataformas están en las dos: se
 * juntan por id y queda el mejor lugar de cada una, que es lo que alguien
 * espera ver primero al elegir qué paga.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getRegionProviders(region: string): Promise<RegionProvider[]> {
  const lists = await Promise.all(
    (['movie', 'tv'] as const).map((type) =>
      fetchApi<{ results: RegionProvider[] }>(
        `/api/tmdb/providers?type=${type}&region=${encodeURIComponent(region)}`,
      ),
    ),
  );

  const byId = new Map<number, RegionProvider>();
  for (const provider of lists.flatMap(({ results }) => results)) {
    const current = byId.get(provider.id);
    if (!current || provider.priority < current.priority) byId.set(provider.id, provider);
  }
  return Array.from(byId.values()).sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'es'),
  );
}

/**
 * Títulos parecidos a uno dado, por metadatos en vez de por quién mira qué.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getSimilar(
  id: number,
  mediaType: MediaType,
): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/recommendations?type=${mediaType}&id=${id}&mode=similar`),
  );
  return results;
}

/** Los criterios con los que se puede armar una fila de Explorar. */
export interface DiscoverParams {
  mediaType: MediaType;
  /** Se piden todos juntos: `[35, 80]` es "comedia **y** crimen". */
  genres?: number[];
  withoutGenres?: number[];
  /** Años, inclusive. */
  from?: number;
  to?: number;
  /** Idioma original, ISO 639-1: en qué se filmó, no en qué se lee. */
  originalLanguage?: string;
  keyword?: number;
  /** Id de la productora en TMDB. */
  company?: number;
  /** Nombre de la plataforma, tal como lo guarda la biblioteca. */
  provider?: string;
  /**
   * Ids de las plataformas que la persona paga: solo lo incluido en alguna de
   * ellas, ni alquiler ni compra.
   */
  providers?: number[];
  /** País cuyo catálogo se consulta. Va siempre junto a `provider` o `providers`. */
  region?: string;
  minRuntime?: number;
  maxRuntime?: number;
  sort?: 'popular' | 'rating' | 'recent';
}

/**
 * Títulos que cumplen un criterio: de terror, de los 90, en tu plataforma.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getDiscover(
  params: DiscoverParams,
): Promise<TMDbResult[]> {
  const query = new URLSearchParams({ type: params.mediaType });

  if (params.genres?.length) query.set('genre', params.genres.join(','));
  if (params.withoutGenres?.length) {
    query.set('without', params.withoutGenres.join(','));
  }
  if (params.from) query.set('from', String(params.from));
  if (params.to) query.set('to', String(params.to));
  if (params.originalLanguage) query.set('original', params.originalLanguage);
  if (params.keyword) query.set('keyword', String(params.keyword));
  if (params.company) query.set('company', String(params.company));
  if (params.provider && params.region) {
    query.set('provider', params.provider);
    query.set('region', params.region);
  }
  if (params.providers?.length && params.region) {
    query.set('providers', params.providers.join(','));
    query.set('region', params.region);
  }
  if (params.minRuntime) query.set('minRuntime', String(params.minRuntime));
  if (params.maxRuntime) query.set('maxRuntime', String(params.maxRuntime));
  if (params.sort) query.set('sort', params.sort);

  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/discover?${query.toString()}`),
  );
  return results;
}

/**
 * Qué más hizo alguien: lo que actuó, o lo que dirigió y creó.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getPersonCredits(
  id: number,
  role: 'reparto' | 'direccion',
): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/person?id=${id}&role=${role}`),
  );
  return results;
}

/**
 * Las partes de una saga, de la primera a la última.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getSaga(id: number): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    withLanguage(`/api/tmdb/saga?id=${id}`),
  );
  return results;
}
