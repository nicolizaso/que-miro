import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TmdbError,
  getList,
  getRecommendations,
  getTrending,
  parseId,
  parseListKind,
  parseMediaType,
  parseTrendingWindow,
  searchMulti,
  toErrorResponse,
} from './tmdb';
import { clearCache } from './cache';

/** Un `fetch` falso que devuelve estos resultados. */
function stubFetch(results: unknown[]) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ results }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('parseMediaType', () => {
  it('acepta los tipos válidos', () => {
    expect(parseMediaType('movie')).toBe('movie');
    expect(parseMediaType('tv')).toBe('tv');
  });

  it.each(['person', '', undefined, 'MOVIE'])(
    'rechaza %o con un 400',
    (value) => {
      expect(() => parseMediaType(value)).toThrow(TmdbError);
      try {
        parseMediaType(value);
      } catch (error) {
        expect((error as TmdbError).status).toBe(400);
      }
    },
  );
});

describe('parseId', () => {
  it('acepta un entero positivo, venga como número o como string', () => {
    expect(parseId(603)).toBe(603);
    expect(parseId('603')).toBe(603);
  });

  it.each([0, -1, 1.5, 'abc', undefined, null])(
    'rechaza %o con un 400',
    (value) => {
      expect(() => parseId(value)).toThrow(TmdbError);
    },
  );
});

describe('searchMulti', () => {
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('descarta los resultados que no son película ni serie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { id: 1, media_type: 'movie' },
            { id: 2, media_type: 'person' },
            { id: 3, media_type: 'tv' },
          ],
        }),
      }),
    );

    const results = await searchMulti('matrix');

    expect(results.map((r) => (r as { id: number }).id)).toEqual([1, 3]);
  });

  it('falla con 500 si el servidor no tiene la API key configurada', async () => {
    delete process.env.TMDB_API_KEY;

    await expect(searchMulti('matrix')).rejects.toMatchObject({ status: 500 });
  });

  it('convierte un 5xx de TMDB en un 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );

    await expect(searchMulti('matrix')).rejects.toMatchObject({ status: 502 });
  });

  it('propaga un 404 de TMDB tal cual', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    await expect(searchMulti('matrix')).rejects.toMatchObject({ status: 404 });
  });

  it('devuelve 502 si no se puede conectar con TMDB', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(searchMulti('matrix')).rejects.toMatchObject({ status: 502 });
  });
});

describe('toErrorResponse', () => {
  it('respeta el status de un TmdbError', () => {
    expect(toErrorResponse(new TmdbError('No existe', 404))).toEqual({
      status: 404,
      body: { error: 'No existe' },
    });
  });

  it('no filtra detalles internos de un error inesperado', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = toErrorResponse(new Error('connect ECONNREFUSED 10.0.0.5'));

    expect(result.status).toBe(500);
    expect(result.body.error).toBe('Error interno del servidor.');
    expect(result.body.error).not.toContain('10.0.0.5');
    spy.mockRestore();
  });
});


describe('parseTrendingWindow', () => {
  it('por defecto es el día', () => {
    expect(parseTrendingWindow(undefined)).toBe('day');
  });

  it('acepta week', () => {
    expect(parseTrendingWindow('week')).toBe('week');
  });

  it('rechaza cualquier otra cosa con un 400', () => {
    expect(() => parseTrendingWindow('month')).toThrow(TmdbError);
  });
});

describe('parseListKind', () => {
  it('por defecto son las populares', () => {
    expect(parseListKind(undefined)).toBe('popular');
  });

  it('acepta top_rated', () => {
    expect(parseListKind('top_rated')).toBe('top_rated');
  });

  it('rechaza cualquier otra cosa con un 400', () => {
    expect(() => parseListKind('upcoming')).toThrow(TmdbError);
  });
});

describe('endpoints cacheados', () => {
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
    clearCache();
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalKey;
    vi.unstubAllGlobals();
    clearCache();
  });

  it('trending descarta lo que no es película ni serie', async () => {
    stubFetch([
      { id: 1, media_type: 'movie' },
      { id: 2, media_type: 'person' },
      { id: 3, media_type: 'tv' },
    ]);

    const results = await getTrending('day');

    expect(results.map((r) => (r as { id: number }).id)).toEqual([1, 3]);
  });

  it('trending le pega a TMDB una sola vez para la misma ventana', async () => {
    const fetchMock = stubFetch([{ id: 1, media_type: 'movie' }]);

    await getTrending('day');
    await getTrending('day');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trending cachea cada ventana por separado', async () => {
    const fetchMock = stubFetch([{ id: 1, media_type: 'movie' }]);

    await getTrending('day');
    await getTrending('week');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('las listas le agregan el media_type que TMDB no manda', async () => {
    stubFetch([{ id: 603 }, { id: 604 }]);

    const results = await getList('movie', 'top_rated');

    expect(results.every((r) => (r as { media_type: string }).media_type === 'movie')).toBe(
      true,
    );
  });

  it('las listas cachean por tipo y categoría', async () => {
    const fetchMock = stubFetch([{ id: 1 }]);

    await getList('movie', 'popular');
    await getList('movie', 'popular');
    await getList('tv', 'popular');
    await getList('movie', 'top_rated');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('las recomendaciones cachean por título', async () => {
    const fetchMock = stubFetch([{ id: 1 }]);

    await getRecommendations('movie', 603);
    await getRecommendations('movie', 603);
    await getRecommendations('movie', 604);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un TMDB caído no queda cacheado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(getTrending('day')).rejects.toMatchObject({ status: 502 });

    stubFetch([{ id: 1, media_type: 'movie' }]);
    await expect(getTrending('day')).resolves.toHaveLength(1);
  });
});
