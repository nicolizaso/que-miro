import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  FIND_TTL,
  TmdbError,
  findByImdbId,
  parseImdbId,
  parseLanguage,
  parseMediaType,
  parseReleaseYear,
  searchByTitle,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/find?imdb=tt6751668[&lang=es-MX]
 * GET /api/tmdb/find?type=movie&query=Past%20Lives&year=2023[&lang=es-MX]
 *
 * Encontrar en TMDB lo que llega de otra app: por el id de IMDb —el único
 * externo que se acepta por ahora— o por título y año. Devuelve candidatos
 * recortados a lo que hace falta para elegir: título, año, póster y géneros.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const lang = parseLanguage(req.query.lang);
    let results;
    if (req.query.imdb !== undefined) {
      results = await findByImdbId(parseImdbId(req.query.imdb), lang);
    } else {
      const query = String(req.query.query ?? '').trim().slice(0, 200);
      if (!query) throw new TmdbError("Falta el parámetro 'imdb' o 'query'.", 400);
      results = await searchByTitle(parseMediaType(req.query.type), query, parseReleaseYear(req.query.year), lang);
    }

    for (const [header, value] of Object.entries(cacheHeaders(FIND_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
