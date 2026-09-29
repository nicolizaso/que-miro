import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  PROVIDERS_TTL,
  getProviders,
  parseMediaType,
  parseRegion,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/providers?type=movie&region=AR
 *
 * Las plataformas de streaming de un país, con su logo y el orden en que se
 * muestran ahí. Es lo que usa Ajustes para elegir las suscripciones. Solo
 * viaja id, nombre, logo y prioridad: la lista de TMDB trae además el orden
 * de cada uno de los doscientos países, que acá no sirve.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const type = parseMediaType(req.query.type);
    const region = parseRegion(req.query.region);

    const results = await getProviders(type, region);

    for (const [header, value] of Object.entries(cacheHeaders(PROVIDERS_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
