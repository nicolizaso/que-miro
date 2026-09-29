import type { VercelRequest, VercelResponse } from '@vercel/node';
import detail from './detail.js';
import discover from './discover.js';
import find from './find.js';
import person from './person.js';
import personPage from './person-page.js';
import providers from './providers.js';
import recommendations from './recommendations.js';
import saga from './saga.js';
import search from './search.js';
import season from './season.js';
import trending from './trending.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

/**
 * Las rutas de `/api/tmdb/*`, por nombre.
 *
 * Cada una sigue en su archivo, con su lista blanca y su caché; lo que
 * cambió es que no son una función de Vercel cada una. El plan Hobby admite
 * hasta 12 funciones por deploy y cada archivo de `api/` cuenta como una: con
 * un archivo por endpoint eran quince y Vercel rechazaba el deploy entero.
 * Ahora todas pasan por `api/tmdb/[endpoint].ts`, y esta carpeta, por el
 * guion bajo, no cuenta.
 *
 * Un endpoint nuevo se suma acá, además de montarse en `server.ts`.
 */
export const TMDB_ROUTES: Record<string, Handler> = {
  detail,
  discover,
  find,
  person,
  'person-page': personPage,
  providers,
  recommendations,
  saga,
  search,
  season,
  trending,
};

/** `/api/tmdb/{endpoint}`: el nombre llega como `req.query.endpoint`. */
export async function dispatchTmdb(req: VercelRequest, res: VercelResponse) {
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
  const route = Object.hasOwn(TMDB_ROUTES, endpoint) ? TMDB_ROUTES[endpoint] : undefined;
  if (!route) return res.status(404).json({ error: 'No existe esa ruta.' });
  return route(req, res);
}
