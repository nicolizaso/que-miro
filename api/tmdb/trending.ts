import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  TRENDING_TTL,
  getList,
  getTrending,
  parseLanguage,
  parseListKind,
  parseMediaType,
  parseTrendingWindow,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/trending
 *
 * Sin parámetros devuelve las tendencias del día. Con `type` y `list` devuelve
 * populares o mejor puntuadas de películas o series:
 *
 *     /api/tmdb/trending?window=week
 *     /api/tmdb/trending?type=movie&list=top_rated
 *
 * Las dos formas aceptan `lang=es-MX` para los títulos en latino.
 *
 * Las tres respuestas son iguales para todo el mundo, así que se cachean en el
 * proceso y en el borde.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const lang = parseLanguage(req.query.lang);
    const results = req.query.type
      ? await getList(
          parseMediaType(req.query.type),
          parseListKind(req.query.list),
          lang,
        )
      : await getTrending(parseTrendingWindow(req.query.window), lang);

    for (const [header, value] of Object.entries(cacheHeaders(TRENDING_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
