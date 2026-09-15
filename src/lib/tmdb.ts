// src/lib/tmdb.ts
//
// Cliente del front. No habla con TMDB directamente: pega contra nuestras
// propias rutas `/api/tmdb/*`, que son las que tienen la API key. Así la key
// nunca viaja al navegador.
import { MediaType, TMDbDetail, TMDbResult } from '@/types';

export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_ORIGINAL_URL = 'https://image.tmdb.org/t/p/original';

const GENRE_MAP: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  10770: 'Película de TV',
  53: 'Suspenso',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Sci-Fi y Fantasía',
  10766: 'Telenovela',
  10767: 'Talk Show',
  10768: 'Guerra y Política',
};

/**
 * Qué géneros existen en cada tipo de medio.
 *
 * TMDB no comparte la tabla entre películas y series: "Terror" (27) solo existe
 * en películas, y "Sci-Fi y Fantasía" (10765) solo en series. Pedir una fila de
 * terror en series con el id de películas devuelve cualquier cosa, así que
 * {@link getGenreId} resuelve el id contra el tipo que corresponde y, si ese
 * género no existe ahí, no devuelve nada — y la fila simplemente no se arma.
 */
const MOVIE_GENRE_IDS = new Set([
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770,
  53, 10752, 37,
]);

const TV_GENRE_IDS = new Set([
  10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766,
  10767, 10768, 37,
]);

/** Error de red o de la API, con un mensaje ya listo para mostrarle al usuario. */
export class TMDbRequestError extends Error {}

/** Mapea IDs de géneros de TMDB a sus nombres en español. */
export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map((id) => GENRE_MAP[id]).filter(Boolean);
}

/**
 * El id que TMDB le da a un género, para el tipo de medio que se le pida.
 *
 * La biblioteca guarda los nombres en español —es lo que se muestra y lo que
 * filtra la lista—, pero `/discover` pide ids. Devuelve `undefined` si ese
 * género no existe en ese tipo de medio.
 */
export function getGenreId(
  name: string,
  mediaType: MediaType,
): number | undefined {
  const valid = mediaType === 'movie' ? MOVIE_GENRE_IDS : TV_GENRE_IDS;

  for (const [id, genreName] of Object.entries(GENRE_MAP)) {
    if (genreName === name && valid.has(Number(id))) return Number(id);
  }
  return undefined;
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
    `/api/tmdb/search?query=${encodeURIComponent(query)}`,
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
    `/api/tmdb/trending?window=${window}`,
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
    `/api/tmdb/trending?type=${mediaType}&list=${kind}`,
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
    `/api/tmdb/recommendations?type=${mediaType}&id=${id}`,
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
  return fetchApi<TMDbDetail>(`/api/tmdb/detail?type=${mediaType}&id=${id}`);
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
    `/api/tmdb/recommendations?type=${mediaType}&id=${id}&mode=similar`,
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
  /** Idioma original, ISO 639-1. */
  language?: string;
  keyword?: number;
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
  if (params.language) query.set('lang', params.language);
  if (params.keyword) query.set('keyword', String(params.keyword));
  if (params.provider && params.region) {
    query.set('provider', params.provider);
    query.set('region', params.region);
  }
  if (params.minRuntime) query.set('minRuntime', String(params.minRuntime));
  if (params.maxRuntime) query.set('maxRuntime', String(params.maxRuntime));
  if (params.sort) query.set('sort', params.sort);

  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    `/api/tmdb/discover?${query.toString()}`,
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
    `/api/tmdb/person?id=${id}&role=${role}`,
  );
  return results;
}

/**
 * Las partes de una saga, de la primera a la última.
 * @throws {TMDbRequestError} si la consulta falla.
 */
export async function getSaga(id: number): Promise<TMDbResult[]> {
  const { results } = await fetchApi<{ results: TMDbResult[] }>(
    `/api/tmdb/saga?id=${id}`,
  );
  return results;
}
