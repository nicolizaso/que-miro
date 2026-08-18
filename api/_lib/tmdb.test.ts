import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TmdbError,
  parseId,
  parseMediaType,
  searchMulti,
  toErrorResponse,
} from './tmdb';

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
