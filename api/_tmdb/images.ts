import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  IMAGES_TTL,
  getImages,
  parseId,
  parseMediaType,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/images?type=tv&id=95396
 *
 * Los fondos de un título para la galería de la ficha. Va aparte de `detail`
 * porque la ficha también la piden el refresco en segundo plano y los
 * importadores, que no muestran fotos: así solo las baja quien abre el modal.
 *
 * No lleva idioma: son fotogramas sin texto, iguales en todos los países.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const mediaType = parseMediaType(req.query.type);
    const id = parseId(req.query.id);

    const result = await getImages(mediaType, id);

    for (const [header, value] of Object.entries(cacheHeaders(IMAGES_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json(result);
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
