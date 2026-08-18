import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TMDbRequestError,
  getGenreNames,
  getMediaDetail,
  searchMulti,
} from './tmdb';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stubea `fetch` con una respuesta controlada. */
function stubFetch(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getGenreNames', () => {
  it('traduce los IDs conocidos a nombres en español', () => {
    expect(getGenreNames([28, 878])).toEqual(['Acción', 'Ciencia Ficción']);
  });

  it('descarta los IDs que no están en el mapa', () => {
    expect(getGenreNames([28, 999999])).toEqual(['Acción']);
  });

  it('devuelve una lista vacía si no hay géneros', () => {
    expect(getGenreNames([])).toEqual([]);
  });
});

describe('searchMulti', () => {
  it('pega contra nuestra API y no contra TMDB directamente', async () => {
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await searchMulti('matrix');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('/api/tmdb/search?query=matrix');
    expect(url).not.toContain('themoviedb.org');
    expect(url).not.toContain('api_key');
  });

  it('escapa los caracteres especiales de la búsqueda', async () => {
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await searchMulti('spider-man & más');

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/tmdb/search?query=spider-man%20%26%20m%C3%A1s',
    );
  });

  it('devuelve los resultados que manda la API', async () => {
    stubFetch({ json: async () => ({ results: [{ id: 603 }] }) });

    await expect(searchMulti('matrix')).resolves.toEqual([{ id: 603 }]);
  });

  it('propaga el mensaje de error que devuelve la API', async () => {
    stubFetch({
      ok: false,
      status: 500,
      json: async () => ({ error: 'TMDB no está disponible.' }),
    });

    await expect(searchMulti('matrix')).rejects.toThrow(
      'TMDB no está disponible.',
    );
  });

  it('avisa de forma clara cuando falla la red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    await expect(searchMulti('matrix')).rejects.toBeInstanceOf(
      TMDbRequestError,
    );
  });
});

describe('getMediaDetail', () => {
  it('arma la URL con el tipo y el id', async () => {
    const fetchMock = stubFetch({ json: async () => ({ id: 603 }) });

    await getMediaDetail(603, 'movie');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tmdb/detail?type=movie&id=603');
  });

  it('falla con un mensaje genérico si la API no manda uno', async () => {
    stubFetch({ ok: false, status: 404, json: async () => ({}) });

    await expect(getMediaDetail(1, 'tv')).rejects.toThrow(
      'No pudimos obtener los datos.',
    );
  });
});
