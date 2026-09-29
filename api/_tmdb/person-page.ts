import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import { PERSON_TTL, getPersonPage, parseId, parseLanguage, toErrorResponse } from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/person-page?id=525[&lang=es-MX]
 *
 * La página de una persona: sus datos y su filmografía, en una llamada. Es
 * igual para todos; qué de eso está en tu biblioteca lo marca el cliente.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const result = await getPersonPage(parseId(req.query.id), parseLanguage(req.query.lang));
    for (const [header, value] of Object.entries(cacheHeaders(PERSON_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json(result);
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
