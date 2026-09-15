import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  PERSON_TTL,
  getPersonCredits,
  parseId,
  parsePersonRole,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/person?id=525&role=direccion
 *
 * Qué más hizo alguien. Con `role=reparto`, lo que actuó; con `role=direccion`,
 * lo que dirigió o creó.
 *
 * Quién es "alguien" lo decide el front a partir de su biblioteca: acá llega un
 * id de TMDB y nada más.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = parseId(req.query.id);
    const role = parsePersonRole(req.query.role);

    const results = await getPersonCredits(id, role);

    for (const [header, value] of Object.entries(cacheHeaders(PERSON_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
