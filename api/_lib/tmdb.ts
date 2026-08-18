/**
 * Cliente de TMDB que corre exclusivamente del lado del servidor.
 *
 * La API key vive en `TMDB_API_KEY` (sin prefijo `VITE_`), así que nunca entra
 * en el bundle del cliente. Este módulo lo comparten las funciones serverless
 * de `api/` (producción en Vercel) y el server de Express de `server.ts` (dev),
 * para que ambos entornos se comporten igual.
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_LANGUAGE = 'es-ES';

export type MediaType = 'movie' | 'tv';

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

/** Busca películas y series por texto, descartando personas y otros tipos. */
export async function searchMulti(query: string) {
  const data = await fetchTMDB<{ results?: { media_type?: string }[] }>(
    '/search/multi',
    { query },
  );
  const results = data.results ?? [];
  return results.filter(
    (result) => result.media_type === 'movie' || result.media_type === 'tv',
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
