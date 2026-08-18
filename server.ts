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
import {
  getMediaDetail,
  parseId,
  parseMediaType,
  searchMulti,
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
      return res.status(200).json({ results: await searchMulti(query) });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      return res.status(status).json(body);
    }
  });

  app.get('/api/tmdb/detail', async (req, res) => {
    try {
      const mediaType = parseMediaType(req.query.type);
      const id = parseId(req.query.id);
      return res.status(200).json(await getMediaDetail(mediaType, id));
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
