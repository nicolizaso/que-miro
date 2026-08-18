import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchMulti, toErrorResponse } from '../_lib/tmdb.js';

/** GET /api/tmdb/search?query=matrix */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = String(req.query.query ?? '').trim();

  if (!query) {
    return res.status(400).json({ error: "Falta el parámetro 'query'." });
  }

  try {
    const results = await searchMulti(query);
    // Los resultados de búsqueda cambian poco: cacheamos en el CDN 5 minutos
    // y permitimos servir una copia vieja mientras se revalida.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=600',
    );
    return res.status(200).json({ results });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
