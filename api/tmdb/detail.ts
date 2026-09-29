import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getMediaDetail,
  parseId,
  parseLanguage,
  parseMediaType,
  toErrorResponse,
} from '../_lib/tmdb.js';

/** GET /api/tmdb/detail?type=movie&id=603[&lang=es-MX] */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const mediaType = parseMediaType(req.query.type);
    const id = parseId(req.query.id);
    const lang = parseLanguage(req.query.lang);

    const detail = await getMediaDetail(mediaType, id, lang);
    // El detalle de un título es prácticamente estático: una hora de CDN.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
    return res.status(200).json(detail);
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
