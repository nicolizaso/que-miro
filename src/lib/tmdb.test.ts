import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TMDbRequestError,
  getDiscover,
  getMediaDetail,
  getPersonCredits,
  searchMulti,
  searchTitlesAndPeople,
  searchPeople,
} from './tmdb';
import { usePreferences } from '@/preferences';

beforeEach(() => {
  // España: el idioma por defecto, que no se escribe en la URL. Los tests del
  // latino lo cambian a mano.
  usePreferences.setState({ region: 'ES' });
});

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

describe('searchTitlesAndPeople', () => {
  it('pega contra la misma URL que searchMulti, para compartir el caché', async () => {
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await searchTitlesAndPeople('nolan');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tmdb/search?query=nolan');
  });

  it('separa los títulos de las personas', async () => {
    const nolan = { id: 525, name: 'Christopher Nolan', profile_path: null };
    stubFetch({
      json: async () => ({ results: [{ id: 603 }], people: [nolan], people_first: true }),
    });

    await expect(searchTitlesAndPeople('nolan')).resolves.toEqual({
      titles: [{ id: 603 }],
      people: [nolan],
      peopleFirst: true,
    });
  });

  it('una respuesta vieja, sin personas, cuenta como que no encontró a nadie', async () => {
    stubFetch({ json: async () => ({ results: [{ id: 603 }] }) });

    await expect(searchTitlesAndPeople('matrix')).resolves.toEqual({
      titles: [{ id: 603 }],
      people: [],
      peopleFirst: false,
    });
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

describe('el idioma de los pedidos', () => {
  it('en España no se escribe: es el que el servidor asume', async () => {
    const fetchMock = stubFetch({ json: async () => ({ id: 603 }) });

    await getMediaDetail(603, 'movie');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tmdb/detail?type=movie&id=603');
  });

  it('en Latinoamérica pide los textos en latino', async () => {
    usePreferences.setState({ region: 'AR' });
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await getMediaDetail(603, 'movie');
    await searchMulti('duro de matar');
    await getPersonCredits(525, 'direccion');

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/tmdb/detail?type=movie&id=603&lang=es-MX',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/tmdb/search?query=duro%20de%20matar&lang=es-MX',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      '/api/tmdb/person?id=525&role=direccion&lang=es-MX',
    );
  });

  it('la búsqueda de personas no lleva idioma: TMDB no traduce los nombres', async () => {
    usePreferences.setState({ region: 'AR' });
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await searchPeople('nolan');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tmdb/search?kind=person&query=nolan');
  });

  it('discover pide el idioma original con `original` y el de los textos con `lang`', async () => {
    usePreferences.setState({ region: 'MX' });
    const fetchMock = stubFetch({ json: async () => ({ results: [] }) });

    await getDiscover({ mediaType: 'movie', originalLanguage: 'ko', sort: 'rating' });

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(url.searchParams.get('original')).toBe('ko');
    expect(url.searchParams.get('lang')).toBe('es-MX');
  });
});
