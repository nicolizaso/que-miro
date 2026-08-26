import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  RECOMMENDATIONS_TTL,
  getRecommendations,
  parseId,
  parseMediaType,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/recommendations?type=movie&id=603
 *
 * Títulos parecidos a uno dado. La respuesta depende solo del título, no de
 * quién pregunta: quién recibe qué lo decide el front, cruzando esto con su
 * propia biblioteca. Por eso se puede cachear con total tranquilidad.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const mediaType = parseMediaType(req.query.type);
    const id = parseId(req.query.id);

    const results = await getRecommendations(mediaType, id);

    for (const [header, value] of Object.entries(
      cacheHeaders(RECOMMENDATIONS_TTL),
    )) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
