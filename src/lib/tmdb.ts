// src/lib/tmdb.ts
//
// Cliente del front. No habla con TMDB directamente: pega contra nuestras
// propias rutas `/api/tmdb/*`, que son las que tienen la API key. Así la key
// nunca viaja al navegador.
import { TMDbDetail, TMDbResult } from '@/types';

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

/** Error de red o de la API, con un mensaje ya listo para mostrarle al usuario. */
export class TMDbRequestError extends Error {}

/** Mapea IDs de géneros de TMDB a sus nombres en español. */
export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map((id) => GENRE_MAP[id]).filter(Boolean);
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
