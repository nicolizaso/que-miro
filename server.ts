/**
 * Server de desarrollo.
 *
 * En producción (Vercel) la app se sirve como estático y `api/` corre como
 * funciones serverless. Este archivo existe para que `npm run dev` levante lo
 * mismo en local: Vite en modo middleware para el front y las rutas `/api/tmdb`
 * reusando exactamente la misma lógica que las funciones serverless.
 */
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { cacheHeaders } from './api/_lib/cache.js';
import {
  DISCOVER_TTL,
  PERSON_TTL,
  PROVIDERS_TTL,
  RECOMMENDATIONS_TTL,
  SEASON_TTL,
  TRENDING_TTL,
  getDiscover,
  getList,
  getMediaDetail,
  getPersonCredits,
  getProviders,
  getRecommendations,
  getSaga,
  getSeason,
  getSimilar,
  getTrending,
  parseDiscoverQuery,
  parseId,
  parseLanguage,
  parseListKind,
  parseMediaType,
  parsePersonRole,
  parseRegion,
  parseSearchKind,
  parseSeasonNumber,
  parseTrendingWindow,
  searchCompanies,
  searchMulti,
  searchPeople,
  toErrorResponse,
} from './api/_lib/tmdb.js';

// `.env.local` primero: dotenv no pisa variables ya definidas, así que lo que
// esté ahí gana sobre `.env` y sobre el entorno del shell no se impone.
dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const app = express();

  app.get('/api/tmdb/search', async (req, res) => {
    const query = String(req.query.query ?? '').trim();
    if (!query) {
      return res.status(400).json({ error: "Falta el parámetro 'query'." });
    }
    try {
      const kind = parseSearchKind(req.query.kind);
      const lang = parseLanguage(req.query.lang);
      const results =
        kind === 'person'
          ? await searchPeople(query)
          : kind === 'company'
            ? await searchCompanies(query)
            : await searchMulti(query, lang);

      return res.status(200).json({ results });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/detail', async (req, res) => {
    try {
      const mediaType = parseMediaType(req.query.type);
      const id = parseId(req.query.id);
      const lang = parseLanguage(req.query.lang);
      return res.status(200).json(await getMediaDetail(mediaType, id, lang));
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/trending', async (req, res) => {
    try {
      const lang = parseLanguage(req.query.lang);
      const results = req.query.type
        ? await getList(
            parseMediaType(req.query.type),
            parseListKind(req.query.list),
            lang,
          )
        : await getTrending(parseTrendingWindow(req.query.window), lang);

      res.set(cacheHeaders(TRENDING_TTL));
      return res.status(200).json({ results });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/recommendations', async (req, res) => {
    try {
      const mediaType = parseMediaType(req.query.type);
      const id = parseId(req.query.id);
      const lang = parseLanguage(req.query.lang);

      const results =
        req.query.mode === 'similar'
          ? await getSimilar(mediaType, id, lang)
          : await getRecommendations(mediaType, id, lang);

      res.set(cacheHeaders(RECOMMENDATIONS_TTL));
      return res.status(200).json({ results });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/discover', async (req, res) => {
    try {
      const query = parseDiscoverQuery(req.query as Record<string, unknown>);

      res.set(cacheHeaders(DISCOVER_TTL));
      return res.status(200).json({ results: await getDiscover(query) });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/person', async (req, res) => {
    try {
      const id = parseId(req.query.id);
      const role = parsePersonRole(req.query.role);
      const lang = parseLanguage(req.query.lang);

      res.set(cacheHeaders(PERSON_TTL));
      return res
        .status(200)
        .json({ results: await getPersonCredits(id, role, lang) });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/saga', async (req, res) => {
    try {
      const results = await getSaga(
        parseId(req.query.id),
        parseLanguage(req.query.lang),
      );
      res.set(cacheHeaders(PERSON_TTL));
      return res.status(200).json({ results });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/providers', async (req, res) => {
    try {
      const results = await getProviders(
        parseMediaType(req.query.type),
        parseRegion(req.query.region),
      );
      res.set(cacheHeaders(PROVIDERS_TTL));
      return res.status(200).json({ results });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/season', async (req, res) => {
    try {
      const result = await getSeason(
        parseId(req.query.id),
        parseSeasonNumber(req.query.season),
        parseLanguage(req.query.lang),
      );
      res.set(cacheHeaders(SEASON_TTL));
      return res.status(200).json(result);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`▶ Qué Miro? corriendo en http://localhost:${PORT}`);
    if (!process.env.TMDB_API_KEY) {
      console.warn(
        '⚠ Falta TMDB_API_KEY en .env.local — la búsqueda va a fallar. Ver .env.example',
      );
    }
  });
}

startServer();
