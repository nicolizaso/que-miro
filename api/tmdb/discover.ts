import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  DISCOVER_TTL,
  getDiscover,
  parseDiscoverQuery,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/discover?type=movie&genre=27&sort=rating
 *
 * Títulos que cumplen un criterio: de terror bien puntuadas, de los 90, en
 * coreano, disponibles en Netflix en Argentina. Es lo que alimenta la mayoría
 * de las filas de Explorar.
 *
 * Los criterios son una lista blanca, no un passthrough a TMDB: la ruta es
 * pública, y sin esa validación cualquiera podría usar nuestra API key para
 * consultar TMDB con lo que quisiera.
 *
 * La respuesta no depende de quién pregunta —cruzarla con la biblioteca es
 * trabajo del front—, así que se cachea en el proceso y en el borde.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const query = parseDiscoverQuery(req.query as Record<string, unknown>);
    const results = await getDiscover(query);

    for (const [header, value] of Object.entries(cacheHeaders(DISCOVER_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
