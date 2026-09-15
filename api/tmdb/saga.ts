import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import { PERSON_TTL, getSaga, parseId, toErrorResponse } from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/saga?id=230
 *
 * Las partes de una saga, de la primera a la última. Es lo que deja decirte que
 * viste la segunda y la tercera, pero nunca la primera.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const results = await getSaga(parseId(req.query.id));

    for (const [header, value] of Object.entries(cacheHeaders(PERSON_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
