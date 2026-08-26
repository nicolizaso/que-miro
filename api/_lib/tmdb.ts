/**
 * Cliente de TMDB que corre exclusivamente del lado del servidor.
 *
 * La API key vive en `TMDB_API_KEY` (sin prefijo `VITE_`), así que nunca entra
 * en el bundle del cliente. Este módulo lo comparten las funciones serverless
 * de `api/` (producción en Vercel) y el server de Express de `server.ts` (dev),
 * para que ambos entornos se comporten igual.
 */

import { withCache } from './cache.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_LANGUAGE = 'es-ES';

export type MediaType = 'movie' | 'tv';

/**
 * Cuánto vive en caché cada respuesta.
 *
 * Las tendencias las recalcula TMDB una vez por día, así que una hora es
 * conservador y ya evita la mayoría de las llamadas. Las recomendaciones de un
 * título no cambian casi nunca: sí valen un día entero.
 */
export const TRENDING_TTL = 60 * 60;
export const RECOMMENDATIONS_TTL = 60 * 60 * 24;

/** Error con el status HTTP que le corresponde devolver al cliente. */
export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

function getApiKey(): string {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new TmdbError(
      'El servidor no tiene configurada la variable TMDB_API_KEY.',
      500,
    );
  }
  return apiKey;
}

async function fetchTMDB<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('language', TMDB_LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new TmdbError('No se pudo conectar con TMDB.', 502);
  }

  if (!response.ok) {
    // 4xx de TMDB se propagan tal cual; 5xx se reportan como "bad gateway",
    // porque el que falló es el upstream y no nuestro cliente.
    const status = response.status >= 500 ? 502 : response.status;
    throw new TmdbError(`TMDB respondió ${response.status}.`, status);
  }

  return (await response.json()) as T;
}

/** Deja solo películas y series: TMDB mezcla personas y colecciones. */
function onlyMoviesAndShows<T extends { media_type?: string }>(results: T[]): T[] {
  return results.filter(
    (result) => result.media_type === 'movie' || result.media_type === 'tv',
  );
}

/** Busca películas y series por texto, descartando personas y otros tipos. */
export async function searchMulti(query: string) {
  const data = await fetchTMDB<{ results?: { media_type?: string }[] }>(
    '/search/multi',
    { query },
  );
  return onlyMoviesAndShows(data.results ?? []);
}

/** Ventanas de tendencias que acepta TMDB. */
export type TrendingWindow = 'day' | 'week';

/** Valida la ventana que llega por la request. */
export function parseTrendingWindow(value: unknown): TrendingWindow {
  if (value === undefined || value === 'day') return 'day';
  if (value === 'week') return 'week';
  throw new TmdbError("El parámetro 'window' debe ser 'day' o 'week'.", 400);
}

/**
 * Lo que está mirando todo el mundo.
 *
 * Cacheado porque la respuesta no depende de quién pregunta: es la misma para
 * todos los visitantes durante todo el día.
 */
export async function getTrending(window: TrendingWindow = 'day') {
  return withCache(`trending:${window}`, TRENDING_TTL, async () => {
    const data = await fetchTMDB<{ results?: { media_type?: string }[] }>(
      `/trending/all/${window}`,
    );
    return onlyMoviesAndShows(data.results ?? []);
  });
}

/** Los títulos más populares o mejor puntuados de una categoría. */
export type ListKind = 'popular' | 'top_rated';

export function parseListKind(value: unknown): ListKind {
  if (value === undefined || value === 'popular') return 'popular';
  if (value === 'top_rated') return 'top_rated';
  throw new TmdbError(
    "El parámetro 'list' debe ser 'popular' o 'top_rated'.",
    400,
  );
}

/**
 * Populares o mejor puntuadas, de películas o de series.
 *
 * TMDB no devuelve `media_type` en estos endpoints —el tipo está en la ruta—
 * así que se agrega a mano para que el front reciba siempre la misma forma.
 */
export async function getList(mediaType: MediaType, kind: ListKind) {
  return withCache(`list:${mediaType}:${kind}`, TRENDING_TTL, async () => {
    const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
      `/${mediaType}/${kind}`,
    );
    return (data.results ?? []).map((result) => ({
      ...result,
      media_type: mediaType,
    }));
  });
}

/**
 * Títulos parecidos a uno dado, según TMDB.
 *
 * Es la materia prima de las recomendaciones: el front pide las de sus mejores
 * puntuados y arma la lista final del lado del cliente, con lo que ya sabe de
 * la biblioteca de esa persona.
 */
export async function getRecommendations(mediaType: MediaType, id: number) {
  return withCache(
    `recommendations:${mediaType}:${id}`,
    RECOMMENDATIONS_TTL,
    async () => {
      const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
        `/${mediaType}/${id}/recommendations`,
      );
      return (data.results ?? []).map((result) => ({
        media_type: mediaType,
        ...result,
      }));
    },
  );
}

/** Detalle de un título, con trailers, reparto y plataformas en una sola llamada. */
export async function getMediaDetail(mediaType: MediaType, id: number) {
  return fetchTMDB(`/${mediaType}/${id}`, {
    append_to_response: 'videos,credits,watch/providers',
  });
}

/** Valida el `mediaType` que llega por la request antes de pegarle a TMDB. */
export function parseMediaType(value: unknown): MediaType {
  if (value === 'movie' || value === 'tv') return value;
  throw new TmdbError("El parámetro 'type' debe ser 'movie' o 'tv'.", 400);
}

/** Valida el id numérico que llega por la request. */
export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TmdbError("El parámetro 'id' debe ser un entero positivo.", 400);
  }
  return id;
}

/** Normaliza cualquier error a un par `{ status, body }` listo para responder. */
export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string };
} {
  if (error instanceof TmdbError) {
    return { status: error.status, body: { error: error.message } };
  }
  console.error('[tmdb] Error inesperado:', error);
  return { status: 500, body: { error: 'Error interno del servidor.' } };
}
