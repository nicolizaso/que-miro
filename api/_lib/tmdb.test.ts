import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TmdbError,
  getDiscover,
  getList,
  getMediaDetail,
  getPersonCredits,
  getRecommendations,
  getSeason,
  getTrending,
  parseDiscoverQuery,
  parseId,
  parseLanguage,
  parseListKind,
  parseMediaType,
  parseSearchKind,
  parseSeasonNumber,
  parseTrendingWindow,
  searchCompanies,
  searchMulti,
  searchPeople,
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

describe('parseSearchKind', () => {
  it('sin parámetro busca títulos, como siempre', () => {
    expect(parseSearchKind(undefined)).toBe('multi');
    expect(parseSearchKind('')).toBe('multi');
  });

  it('acepta gente y productoras', () => {
    expect(parseSearchKind('person')).toBe('person');
    expect(parseSearchKind('company')).toBe('company');
  });

  it('rechaza cualquier otra cosa con un 400', () => {
    expect(() => parseSearchKind('keyword')).toThrow(TmdbError);
  });
});

describe('buscar gente y productoras', () => {
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('de una persona devuelve solo lo que la app dibuja', async () => {
    // `known_for` viene con la ficha entera de hasta tres títulos: si se
    // reenviara tal cual, la respuesta pesaría diez veces más para mostrar dos
    // nombres.
    stubFetch([
      {
        id: 525,
        name: 'Christopher Nolan',
        profile_path: '/nolan.jpg',
        known_for_department: 'Directing',
        known_for: [
          { title: 'Interestelar', overview: 'Una sinopsis larguísima' },
          { title: 'El origen' },
          { title: 'Tenet' },
        ],
        adult: false,
      },
    ]);

    const [person] = await searchPeople('nolan');

    expect(person).toEqual({
      id: 525,
      name: 'Christopher Nolan',
      profile_path: '/nolan.jpg',
      known_for_department: 'Directing',
      known_for: ['Interestelar', 'El origen'],
    });
  });

  it('de una serie conocida usa el nombre, que TMDB manda en otro campo', async () => {
    stubFetch([
      { id: 1, name: 'Alguien', profile_path: null, known_for: [{ name: 'Fargo' }] },
    ]);

    const [person] = await searchPeople('alguien');

    expect(person.known_for).toEqual(['Fargo']);
    expect(person.known_for_department).toBeNull();
  });

  it('de una productora devuelve el id, el nombre y el logo', async () => {
    stubFetch([
      { id: 41077, name: 'A24', logo_path: '/a24.png', origin_country: 'US' },
    ]);

    expect(await searchCompanies('a24')).toEqual([
      { id: 41077, name: 'A24', logo_path: '/a24.png' },
    ]);
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

describe('parseDiscoverQuery', () => {
  it('acepta el criterio mínimo y pone los valores por defecto', () => {
    expect(parseDiscoverQuery({ type: 'movie' })).toMatchObject({
      mediaType: 'movie',
      genres: [],
      sort: 'popular',
    });
  });

  it('parsea la lista de géneros', () => {
    expect(parseDiscoverQuery({ type: 'movie', genre: '27,53' }).genres).toEqual([
      27, 53,
    ]);
  });

  it('no acepta más de tres géneros: sería una fila vacía', () => {
    expect(() =>
      parseDiscoverQuery({ type: 'movie', genre: '1,2,3,4' }),
    ).toThrow(TmdbError);
  });

  it.each([
    { type: 'person' },
    { type: 'movie', genre: 'terror' },
    { type: 'movie', from: '90' },
    { type: 'movie', lang: 'Castellano' },
    { type: 'movie', region: 'argentina' },
    { type: 'movie', sort: 'aleatorio' },
    { type: 'movie', keyword: '-3' },
  ])('rechaza %o con un 400', (query) => {
    expect(() => parseDiscoverQuery(query)).toThrow(TmdbError);
    try {
      parseDiscoverQuery(query);
    } catch (error) {
      expect((error as TmdbError).status).toBe(400);
    }
  });

  it('acepta el id de una productora', () => {
    expect(parseDiscoverQuery({ type: 'movie', company: '41077' })).toMatchObject({
      company: 41077,
    });
    expect(() =>
      parseDiscoverQuery({ type: 'movie', company: 'A24' }),
    ).toThrow(TmdbError);
  });

  it('pide la región junto con la plataforma', () => {
    // Un catálogo de streaming es distinto en cada país: sin región, la fila
    // diría "está en tu Netflix" mostrando el catálogo de otro lado.
    expect(() =>
      parseDiscoverQuery({ type: 'movie', provider: 'Netflix' }),
    ).toThrow(TmdbError);

    expect(
      parseDiscoverQuery({ type: 'movie', provider: 'Netflix', region: 'AR' }),
    ).toMatchObject({ provider: 'Netflix', region: 'AR' });
  });
});

describe('getDiscover', () => {
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
    clearCache();
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  /** La URL con la que se llamó a TMDB en la enésima llamada. */
  function calledUrl(fetchMock: ReturnType<typeof vi.fn>, index = 0): URL {
    return new URL(fetchMock.mock.calls[index][0] as string);
  }

  it('le agrega el tipo a cada resultado, que TMDB no manda', async () => {
    stubFetch([{ id: 1 }]);

    const results = await getDiscover(parseDiscoverQuery({ type: 'tv' }));

    expect(results[0]).toMatchObject({ id: 1, media_type: 'tv' });
  });

  it('pide un piso de votos al ordenar por puntaje', async () => {
    const fetchMock = stubFetch([]);

    await getDiscover(parseDiscoverQuery({ type: 'movie', sort: 'rating' }));

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get('sort_by')).toBe('vote_average.desc');
    expect(Number(url.searchParams.get('vote_count.gte'))).toBeGreaterThan(0);
  });

  it('usa el campo de fecha que corresponde a cada tipo', async () => {
    const fetchMock = stubFetch([]);

    await getDiscover(parseDiscoverQuery({ type: 'tv', from: '1990', to: '1999' }));

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get('first_air_date.gte')).toBe('1990-01-01');
    expect(url.searchParams.get('first_air_date.lte')).toBe('1999-12-31');
  });

  it('nunca ofrece estrenos que todavía no estrenaron', async () => {
    const fetchMock = stubFetch([]);

    await getDiscover(parseDiscoverQuery({ type: 'movie', sort: 'recent' }));

    const hasta = calledUrl(fetchMock).searchParams.get('primary_release_date.lte');
    expect(hasta).toBe(new Date().toISOString().slice(0, 10));
  });

  it('resuelve el nombre de la plataforma contra la lista de TMDB', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/watch/providers/')
          ? { results: [{ provider_id: 8, provider_name: 'Netflix' }] }
          : { results: [{ id: 1 }] },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getDiscover(
      parseDiscoverQuery({ type: 'movie', provider: 'Netflix', region: 'AR' }),
    );

    const url = calledUrl(fetchMock, 1);
    expect(url.searchParams.get('with_watch_providers')).toBe('8');
    expect(url.searchParams.get('watch_region')).toBe('AR');
  });

  it('filtra por productora cuando se pide una', async () => {
    const fetchMock = stubFetch([]);

    await getDiscover(parseDiscoverQuery({ type: 'movie', company: '41077' }));

    expect(calledUrl(fetchMock).searchParams.get('with_companies')).toBe('41077');
  });

  it('cachea cada productora por separado', async () => {
    const fetchMock = stubFetch([]);

    await getDiscover(parseDiscoverQuery({ type: 'movie', company: '41077' }));
    await getDiscover(parseDiscoverQuery({ type: 'movie', company: '41077' }));
    await getDiscover(parseDiscoverQuery({ type: 'movie', company: '2' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('con una plataforma que TMDB no conoce devuelve vacío en vez de fallar', async () => {
    // Las plataformas se renombran y se fusionan. Una fila que no se dibuja es
    // mucho mejor que un error en pantalla.
    stubFetch([]);

    const results = await getDiscover(
      parseDiscoverQuery({ type: 'movie', provider: 'Blockbuster', region: 'AR' }),
    );

    expect(results).toEqual([]);
  });
});

describe('getPersonCredits', () => {
  const originalKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
    clearCache();
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('de la dirección devuelve solo lo que dirigió o creó', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          cast: [{ id: 99, media_type: 'movie' }],
          crew: [
            { id: 1, media_type: 'movie', job: 'Director', vote_count: 10 },
            { id: 2, media_type: 'movie', job: 'Producer', vote_count: 500 },
          ],
        }),
      }),
    );

    const results = await getPersonCredits(525, 'direccion');

    expect(results.map((credit) => credit.id)).toEqual([1]);
  });

  it('no repite el título de quien dirigió y además escribió', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          crew: [
            { id: 1, media_type: 'movie', job: 'Director', vote_count: 10 },
            { id: 1, media_type: 'movie', job: 'Creator', vote_count: 10 },
          ],
        }),
      }),
    );

    expect(await getPersonCredits(525, 'direccion')).toHaveLength(1);
  });

  it('ordena por votos y no por lo último que hizo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          cast: [
            { id: 1, media_type: 'movie', vote_count: 10 },
            { id: 2, media_type: 'tv', vote_count: 900 },
          ],
        }),
      }),
    );

    const results = await getPersonCredits(7, 'reparto');

    expect(results.map((credit) => credit.id)).toEqual([2, 1]);
  });
});

describe('el idioma de los textos', () => {
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

  /** La URL con la que se llamó a TMDB en la enésima llamada. */
  function calledUrl(fetchMock: ReturnType<typeof vi.fn>, index = 0): URL {
    return new URL(fetchMock.mock.calls[index][0] as string);
  }

  describe('parseLanguage', () => {
    it('sin parámetro es castellano de España, para no romper a nadie', () => {
      expect(parseLanguage(undefined)).toBe('es-ES');
      expect(parseLanguage('')).toBe('es-ES');
    });

    it('acepta los dos castellanos', () => {
      expect(parseLanguage('es-ES')).toBe('es-ES');
      expect(parseLanguage('es-MX')).toBe('es-MX');
    });

    it.each(['es', 'en-US', 'es-AR', 'ES-MX', ['es-MX']])(
      'rechaza %o con un 400',
      (value) => {
        expect(() => parseLanguage(value)).toThrow(TmdbError);
      },
    );
  });

  it('le pasa el idioma a TMDB', async () => {
    const fetchMock = stubFetch([]);

    await searchMulti('duro de matar', 'es-MX');
    await searchMulti('la jungla de cristal');

    expect(calledUrl(fetchMock, 0).searchParams.get('language')).toBe('es-MX');
    expect(calledUrl(fetchMock, 1).searchParams.get('language')).toBe('es-ES');
  });

  it('cachea cada idioma por separado', async () => {
    // Sin el idioma en la clave, la respuesta en un idioma se serviría a quien
    // pidió el otro.
    const fetchMock = stubFetch([{ id: 1, media_type: 'movie' }]);

    await getTrending('day', 'es-ES');
    await getTrending('day', 'es-MX');
    await getTrending('day', 'es-MX');
    await getPersonCredits(525, 'reparto', 'es-ES');
    await getPersonCredits(525, 'reparto', 'es-MX');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  describe('getMediaDetail', () => {
    /** Un `fetch` que contesta distinto según el idioma pedido. */
    function stubDetail(byLanguage: Record<string, Record<string, unknown>>) {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        const language = new URL(url).searchParams.get('language') ?? '';
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...byLanguage[language] }),
        };
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('en latino, sin sinopsis, la completa con la de España', async () => {
      const fetchMock = stubDetail({
        'es-MX': { id: 562, title: 'Duro de matar', overview: '' },
        'es-ES': { id: 562, title: 'La jungla de cristal', overview: 'Un policía...' },
      });

      const detail = await getMediaDetail('movie', 562, 'es-MX');

      expect(detail.overview).toBe('Un policía...');
      // El título no se toca: el latino es el que se pidió.
      expect(detail.title).toBe('Duro de matar');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // La segunda es liviana: de ella solo se usa la sinopsis.
      expect(calledUrl(fetchMock, 1).searchParams.get('append_to_response')).toBeNull();
    });

    it('en latino, con sinopsis, es una sola llamada', async () => {
      const fetchMock = stubDetail({
        'es-MX': { id: 562, title: 'Duro de matar', overview: 'Un policía...' },
      });

      await getMediaDetail('movie', 562, 'es-MX');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('en castellano de España no hay a quién pedirle respaldo', async () => {
      const fetchMock = stubDetail({ 'es-ES': { id: 562, overview: '' } });

      await getMediaDetail('movie', 562);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('si el respaldo falla, la ficha llega igual', async () => {
      let calls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          calls++;
          if (calls > 1) throw new Error('ECONNRESET');
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 562, title: 'Duro de matar', overview: '' }),
          };
        }),
      );

      const detail = await getMediaDetail('movie', 562, 'es-MX');

      expect(detail.title).toBe('Duro de matar');
      expect(detail.overview).toBe('');
    });
  });

  describe('discover', () => {
    it('el idioma original se pide con `original`', () => {
      expect(
        parseDiscoverQuery({ type: 'movie', original: 'ko', lang: 'es-MX' }),
      ).toMatchObject({ originalLanguage: 'ko', lang: 'es-MX' });
    });

    it('un cliente viejo que manda `lang=ko` sigue pidiendo coreanas', () => {
      // Antes `lang` era el idioma original. Un código pelado no puede ser un
      // idioma de textos, así que se lee como el original que quería decir.
      expect(parseDiscoverQuery({ type: 'movie', lang: 'ko' })).toMatchObject({
        originalLanguage: 'ko',
        lang: 'es-ES',
      });
    });

    it.each([
      { type: 'movie', original: 'Coreano' },
      { type: 'movie', lang: 'en-US' },
    ])('rechaza %o con un 400', (query) => {
      expect(() => parseDiscoverQuery(query)).toThrow(TmdbError);
    });

    it('manda a TMDB los dos idiomas, cada uno donde va', async () => {
      const fetchMock = stubFetch([]);

      await getDiscover(
        parseDiscoverQuery({ type: 'movie', original: 'ko', lang: 'es-MX' }),
      );

      const url = calledUrl(fetchMock);
      expect(url.searchParams.get('with_original_language')).toBe('ko');
      expect(url.searchParams.get('language')).toBe('es-MX');
    });

    it('cachea cada idioma por separado', async () => {
      const fetchMock = stubFetch([]);

      await getDiscover(parseDiscoverQuery({ type: 'movie', genre: '27' }));
      await getDiscover(parseDiscoverQuery({ type: 'movie', genre: '27', lang: 'es-MX' }));
      await getDiscover(parseDiscoverQuery({ type: 'movie', genre: '27', lang: 'es-MX' }));

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('la temporada de una serie', () => {
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

  /** Un episodio como lo manda TMDB, con todo lo que la app no usa. */
  function rawEpisode(number: number, overrides: Record<string, unknown> = {}) {
    return {
      id: 1000 + number,
      episode_number: number,
      season_number: 2,
      name: `Episodio ${number}`,
      overview: `Pasa algo en el ${number}.`,
      air_date: '2025-01-17',
      runtime: 52,
      still_path: `/still-${number}.jpg`,
      vote_average: 8.4,
      vote_count: 120,
      episode_type: 'standard',
      production_code: '',
      show_id: 95396,
      crew: [{ id: 1, name: 'Alguien', job: 'Director' }],
      guest_stars: [{ id: 2, name: 'Otra persona', character: 'Invitada' }],
      ...overrides,
    };
  }

  function stubSeason(byLanguage: Record<string, unknown>) {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const language = new URL(url).searchParams.get('language') ?? '';
      return { ok: true, status: 200, json: async () => byLanguage[language] };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  describe('parseSeasonNumber', () => {
    it('acepta los especiales y las temporadas normales', () => {
      expect(parseSeasonNumber('0')).toBe(0);
      expect(parseSeasonNumber(3)).toBe(3);
    });

    it.each([undefined, '', '-1', '1.5', 'dos', '201'])('rechaza %o con un 400', (value) => {
      expect(() => parseSeasonNumber(value)).toThrow(TmdbError);
    });
  });

  it('reenvía solo lo que la app dibuja de cada episodio', async () => {
    stubSeason({
      'es-ES': {
        _id: 'x',
        season_number: 2,
        name: 'Temporada 2',
        overview: 'La temporada entera.',
        episodes: [rawEpisode(1, { episode_type: 'finale' })],
      },
    });

    const season = await getSeason(95396, 2);

    expect(season).toEqual({
      season_number: 2,
      name: 'Temporada 2',
      episodes: [
        {
          episode_number: 1,
          name: 'Episodio 1',
          overview: 'Pasa algo en el 1.',
          air_date: '2025-01-17',
          runtime: 52,
          still_path: '/still-1.jpg',
          vote_average: 8.4,
          episode_type: 'finale',
        },
      ],
    });
    // Ni el equipo ni las invitadas: son cientos de personas por temporada.
    expect(JSON.stringify(season)).not.toContain('guest_stars');
    expect(JSON.stringify(season)).not.toContain('crew');
  });

  it('un episodio sin anunciar llega con fecha y duración vacías', async () => {
    stubSeason({
      'es-ES': {
        season_number: 3,
        episodes: [rawEpisode(1, { air_date: '', runtime: null, still_path: null })],
      },
    });

    const [episode] = (await getSeason(95396, 3)).episodes;

    expect(episode.air_date).toBeNull();
    expect(episode.runtime).toBeNull();
    expect(episode.still_path).toBeNull();
  });

  it('en latino completa las sinopsis que faltan con las de España', async () => {
    const fetchMock = stubSeason({
      'es-MX': {
        season_number: 2,
        episodes: [rawEpisode(1), rawEpisode(2, { overview: '' })],
      },
      'es-ES': {
        season_number: 2,
        episodes: [rawEpisode(1, { overview: 'Otra' }), rawEpisode(2, { overview: 'La de España.' })],
      },
    });

    const season = await getSeason(95396, 2, 'es-MX');

    expect(season.episodes.map((episode) => episode.overview)).toEqual([
      'Pasa algo en el 1.',
      'La de España.',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cachea por serie, temporada e idioma', async () => {
    const fetchMock = stubSeason({
      'es-ES': { season_number: 1, episodes: [rawEpisode(1)] },
      'es-MX': { season_number: 1, episodes: [rawEpisode(1)] },
    });

    await getSeason(95396, 1);
    await getSeason(95396, 1);
    await getSeason(95396, 2);
    await getSeason(95396, 1, 'es-MX');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
