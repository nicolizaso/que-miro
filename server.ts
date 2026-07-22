import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // TMDB API Routes
  app.get('/api/tmdb/search/multi', async (req, res) => {
    try {
      const apiKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'TMDB API key is missing.' });
      }
      
      const { query } = req.query;
      const url = new URL('https://api.themoviedb.org/3/search/multi');
      url.searchParams.append('api_key', apiKey);
      url.searchParams.append('language', 'es-ES');
      url.searchParams.append('query', String(query || ''));

      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: `TMDB API Error: ${response.status}` });
      }
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/tmdb/:mediaType/:id', async (req, res) => {
    try {
      const apiKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'TMDB API key is missing.' });
      }
      
      const { mediaType, id } = req.params;
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        return res.status(400).json({ error: 'Invalid mediaType' });
      }

      const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}`);
      url.searchParams.append('api_key', apiKey);
      url.searchParams.append('language', 'es-ES');
      url.searchParams.append('append_to_response', 'videos,credits,watch/providers');

      const response = await fetch(url.toString());
      if (!response.ok) {
        return res.status(response.status).json({ error: `TMDB API Error: ${response.status}` });
      }
      const data = await response.json();
      return res.json(data);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
