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
} from '@/types';
import { usePreferences } from '@/preferences';
import {
  DEFAULT_LANGUAGE,
  TmdbLanguage,
  languageForRegion,
} from '@/lib/language';

export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_ORIGINAL_URL = 'https://image.tmdb.org/t/p/original';

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
  /** País cuyo catálogo se consulta. Va siempre junto a `provider`. */
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
