import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATALOG_FILTERS,
  CatalogFilters,
  appendCatalogPage,
  catalogDiscoverParams,
  catalogQueryKey,
  clearCatalogFilters,
  hasActiveCatalogFilters,
  parseCatalogFilters,
  switchCatalogType,
  catalogProviderOptions,
  MY_PROVIDERS,
  nextProviders,
  providerRailValue,
  selectedFirst,
  titleKey,
  visibleCatalogResults,
  writeCatalogFilters,
} from './catalog';
import { TMDbResult } from '@/types';

function result(id: number, mediaType: 'movie' | 'tv' = 'movie'): TMDbResult {
  return {
    id,
    media_type: mediaType,
    title: `Título ${id}`,
    poster_path: null,
    backdrop_path: null,
    genre_ids: [],
    overview: '',
  };
}

function filters(patch: Partial<CatalogFilters> = {}): CatalogFilters {
  return { ...DEFAULT_CATALOG_FILTERS, ...patch };
}

describe('parseCatalogFilters', () => {
  it('sin parámetros, películas populares sin filtrar', () => {
    expect(parseCatalogFilters(new URLSearchParams())).toEqual(DEFAULT_CATALOG_FILTERS);
  });

  it('lee todos los filtros de una URL compartida', () => {
    const params = new URLSearchParams(
      'tipo=tv&genero=Crimen,Drama&plataforma=8,337&epoca=2010&idioma=ko&orden=rating&ocultar=1',
    );

    expect(parseCatalogFilters(params)).toEqual({
      type: 'tv',
      genres: ['Crimen', 'Drama'],
      providers: [8, 337],
      decade: '2010',
      runtime: null,
      language: 'ko',
      sort: 'rating',
      hideSaved: true,
    });
  });

  it('ignora lo que no entiende en vez de romperse', () => {
    const params = new URLSearchParams(
      'tipo=persona&genero=Inventado&plataforma=netflix,-3,8&epoca=1850&idioma=xx&orden=azar',
    );

    expect(parseCatalogFilters(params)).toEqual(filters({ providers: [8] }));
  });

  it('un género que no existe en el tipo elegido se cae', () => {
    // Terror solo existe en películas.
    expect(parseCatalogFilters(new URLSearchParams('tipo=tv&genero=Terror,Drama')).genres).toEqual([
      'Drama',
    ]);
  });

  it('la duración solo vale para películas', () => {
    expect(parseCatalogFilters(new URLSearchParams('duracion=corta')).runtime).toBe('corta');
    expect(parseCatalogFilters(new URLSearchParams('tipo=tv&duracion=corta')).runtime).toBeNull();
  });

  it('no pasa de los topes que acepta el servidor', () => {
    const params = new URLSearchParams(
      'genero=Acción,Comedia,Drama,Terror,Suspenso,Romance,Western',
    );
    expect(parseCatalogFilters(params).genres).toHaveLength(5);
  });
});

describe('writeCatalogFilters', () => {
  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const original = filters({
      type: 'movie',
      genres: ['Acción', 'Comedia'],
      providers: [8],
      decade: 'antes',
      runtime: 'larga',
      language: 'ja',
      sort: 'recent',
      hideSaved: true,
    });

    expect(parseCatalogFilters(writeCatalogFilters(new URLSearchParams(), original))).toEqual(
      original,
    );
  });

  it('sin filtros, la URL queda limpia', () => {
    const params = writeCatalogFilters(
      new URLSearchParams('tipo=tv&genero=Drama&orden=rating'),
      DEFAULT_CATALOG_FILTERS,
    );
    expect(params.toString()).toBe('');
  });

  it('no toca lo que no es del catálogo', () => {
    const params = writeCatalogFilters(new URLSearchParams('ficha=movie-603'), filters({ type: 'tv' }));
    expect(params.get('ficha')).toBe('movie-603');
    expect(params.get('tipo')).toBe('tv');
  });
});

describe('switchCatalogType', () => {
  it('traduce los géneros a su equivalente y suelta los que no tienen', () => {
    const next = switchCatalogType(
      filters({ genres: ['Acción', 'Aventura', 'Terror', 'Drama'] }),
      'tv',
    );
    expect(next.type).toBe('tv');
    expect(next.genres).toEqual(['Acción y Aventura', 'Drama']);
  });

  it('de series a películas, también', () => {
    expect(
      switchCatalogType(filters({ type: 'tv', genres: ['Sci-Fi y Fantasía'] }), 'movie').genres,
    ).toEqual(['Ciencia Ficción']);
  });

  it('en series se pierde la duración, y lo demás queda', () => {
    const next = switchCatalogType(
      filters({ runtime: 'corta', providers: [8], decade: '1990', hideSaved: true }),
      'tv',
    );
    expect(next).toMatchObject({ runtime: null, providers: [8], decade: '1990', hideSaved: true });
  });

  it('al mismo tipo no cambia nada', () => {
    const current = filters({ runtime: 'corta' });
    expect(switchCatalogType(current, 'movie')).toBe(current);
  });
});

describe('selectedFirst', () => {
  const options = ['Acción', 'Comedia', 'Drama', 'Terror'].map((value) => ({
    value,
    label: value,
  }));
  const values = (list: { value: string }[]) => list.map((option) => option.value);

  it('pone las elegidas adelante, en el orden en que se eligieron', () => {
    expect(values(selectedFirst(options, ['Terror', 'Comedia']))).toEqual([
      'Terror',
      'Comedia',
      'Acción',
      'Drama',
    ]);
  });

  it('sin nada elegido, devuelve la misma lista', () => {
    expect(selectedFirst(options, [])).toBe(options);
  });

  it('ignora lo elegido que no es una opción de la fila', () => {
    expect(values(selectedFirst(options, ['Western', 'Drama']))).toEqual([
      'Drama',
      'Acción',
      'Comedia',
      'Terror',
    ]);
  });
});

describe('las plataformas', () => {
  const netflix = { id: 8, name: 'Netflix' };
  const max = { id: 1899, name: 'Max' };
  const disney = { id: 337, name: 'Disney Plus' };
  const mubi = { id: 11, name: 'MUBI' };

  it('ofrece primero las tuyas, después las del país y al final las elegidas que faltan', () => {
    expect(
      catalogProviderOptions([netflix, max, disney, mubi], [mubi], [disney.id], 2).map(
        (provider) => provider.name,
      ),
    ).toEqual(['MUBI', 'Netflix', 'Max', 'Disney Plus']);
  });

  it('una elegida que no es de este país no se puede nombrar, y no se ofrece', () => {
    expect(catalogProviderOptions([netflix], [], [999])).toEqual([netflix]);
  });

  it('"Mis plataformas" se prende cuando lo elegido son justo las tuyas', () => {
    expect(providerRailValue([337, 8], [8, 337])).toEqual([MY_PROVIDERS]);
    expect(providerRailValue([8], [8, 337])).toEqual(['8']);
    expect(providerRailValue([], [])).toEqual([]);
  });

  it('tocar "Mis plataformas" elige las tuyas', () => {
    expect(nextProviders(['11', MY_PROVIDERS], [11], [8, 337])).toEqual([8, 337]);
  });

  it('con las tuyas elegidas, tocar otra la deja sola, y tocarla de nuevo limpia', () => {
    expect(nextProviders([MY_PROVIDERS, '11'], [8, 337], [8, 337])).toEqual([11]);
    expect(nextProviders([], [8, 337], [8, 337])).toEqual([]);
  });

  it('sin "Mis plataformas", pone y saca de a una', () => {
    expect(nextProviders(['8', '337'], [8], [])).toEqual([8, 337]);
  });
});

describe('hasActiveCatalogFilters y clearCatalogFilters', () => {
  it('el tipo y el orden no cuentan como filtro', () => {
    expect(hasActiveCatalogFilters(filters({ type: 'tv', sort: 'rating' }))).toBe(false);
    expect(hasActiveCatalogFilters(filters({ hideSaved: true }))).toBe(true);
    expect(hasActiveCatalogFilters(filters({ genres: ['Drama'] }))).toBe(true);
  });

  it('limpiar conserva el tipo y el orden', () => {
    expect(
      clearCatalogFilters(
        filters({ type: 'tv', sort: 'rating', genres: ['Drama'], providers: [8], language: 'ko' }),
      ),
    ).toEqual(filters({ type: 'tv', sort: 'rating' }));
  });
});

describe('catalogDiscoverParams', () => {
  it('sin filtros, solo el tipo, el orden y la página', () => {
    expect(catalogDiscoverParams(DEFAULT_CATALOG_FILTERS, 'AR')).toEqual({
      mediaType: 'movie',
      sort: 'popular',
      page: 1,
    });
  });

  it('los géneros van con "o", traducidos al id del tipo', () => {
    expect(
      catalogDiscoverParams(filters({ type: 'tv', genres: ['Acción y Aventura', 'Comedia'] }), 'AR'),
    ).toMatchObject({ genres: [10759, 35], genreMatch: 'any' });
  });

  it('las plataformas van con la región', () => {
    expect(catalogDiscoverParams(filters({ providers: [8, 337] }), 'ES', 2)).toMatchObject({
      providers: [8, 337],
      region: 'ES',
      page: 2,
    });
    expect(catalogDiscoverParams(DEFAULT_CATALOG_FILTERS, 'ES')).not.toHaveProperty('region');
  });

  it('traduce la década, la duración y el idioma', () => {
    expect(
      catalogDiscoverParams(
        filters({ decade: '1990', runtime: 'media', language: 'ko' }),
        'AR',
      ),
    ).toMatchObject({ from: 1990, to: 1999, minRuntime: 90, maxRuntime: 120, originalLanguage: 'ko' });

    const old = catalogDiscoverParams(filters({ decade: 'antes', runtime: 'corta' }), 'AR');
    expect(old).toMatchObject({ to: 1979, maxRuntime: 89 });
    expect(old).not.toHaveProperty('from');
    expect(old).not.toHaveProperty('minRuntime');
  });
});

describe('catalogQueryKey', () => {
  it('"Ocultar lo que ya tengo" no vuelve a pedir nada', () => {
    expect(catalogQueryKey(filters({ hideSaved: true }), 'AR')).toBe(
      catalogQueryKey(filters(), 'AR'),
    );
  });

  it('cambia con los filtros y con la región si hay plataformas', () => {
    expect(catalogQueryKey(filters({ genres: ['Drama'] }), 'AR')).not.toBe(
      catalogQueryKey(filters(), 'AR'),
    );
    expect(catalogQueryKey(filters({ providers: [8] }), 'AR')).not.toBe(
      catalogQueryKey(filters({ providers: [8] }), 'ES'),
    );
  });
});

describe('appendCatalogPage', () => {
  it('no repite un título que cambió de página mientras se scrolleaba', () => {
    expect(
      appendCatalogPage([result(1), result(2)], [result(2), result(3)]).map((item) => item.id),
    ).toEqual([1, 2, 3]);
  });

  it('una película y una serie con el mismo id son dos títulos', () => {
    expect(appendCatalogPage([result(1)], [result(1, 'tv')])).toHaveLength(2);
  });

  it('si no hay nada nuevo, devuelve la misma lista', () => {
    const current = [result(1)];
    expect(appendCatalogPage(current, [result(1)])).toBe(current);
  });
});

describe('visibleCatalogResults', () => {
  const results = [result(1), result(2), result(2, 'tv')];
  const saved = new Set([titleKey('movie', 2)]);

  it('muestra todo si no se pide esconder', () => {
    expect(visibleCatalogResults(results, saved, false)).toBe(results);
  });

  it('esconde lo guardado, sin confundir una serie con una película', () => {
    expect(
      visibleCatalogResults(results, saved, true).map((item) => titleKey(item.media_type, item.id)),
    ).toEqual(['movie-1', 'tv-2']);
  });
});
