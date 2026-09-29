import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheHeaders } from '../_lib/cache.js';
import {
  SEASON_TTL,
  getSeason,
  parseId,
  parseLanguage,
  parseSeasonNumber,
  toErrorResponse,
} from '../_lib/tmdb.js';

/**
 * GET /api/tmdb/season?id=95396&season=2[&lang=es-MX]
 *
 * Los episodios de una temporada: nombre, sinopsis, fecha, duración e imagen.
 * La ficha de una serie los pide recién cuando alguien despliega esa
 * temporada, y lo que llega es un recorte: ni el equipo técnico ni las
 * estrellas invitadas de cada episodio, que acá no se muestran.
 *
 * Como todo lo que viene de TMDB, es igual para todos: se cachea en el
 * proceso y en el borde.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = parseId(req.query.id);
    const season = parseSeasonNumber(req.query.season);
    const lang = parseLanguage(req.query.lang);

    const result = await getSeason(id, season, lang);

    for (const [header, value] of Object.entries(cacheHeaders(SEASON_TTL))) {
      res.setHeader(header, value);
    }
    return res.status(200).json(result);
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return res.status(status).json(body);
  }
}
