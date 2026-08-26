import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  LibraryFilters,
  collectGenres,
  filterLibrary,
  hasActiveFilters,
  normalizeText,
} from './library';
import { SavedMedia } from '@/types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: null,
    backdropPath: null,
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFilters(overrides: Partial<LibraryFilters> = {}): LibraryFilters {
  return {
    status: 'por_ver',
    query: '',
    genre: null,
    type: null,
    provider: null,
    collection: null,
    tag: null,
    sort: DEFAULT_SORT,
    ...overrides,
  };
}

function makeWatch(rating: number, tags?: string[]) {
  return {
    id: `w-${rating}-${tags?.join('') ?? ''}`,
    rating,
    tags,
    completedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('normalizeText', () => {
  it('saca acentos y mayúsculas', () => {
    expect(normalizeText('Parásitos')).toBe('parasitos');
    expect(normalizeText('  EL PADRINO ')).toBe('el padrino');
  });
});

describe('collectGenres', () => {
  it('devuelve los géneros sin repetir y ordenados', () => {
    const genres = collectGenres([
      makeMedia({ tmdbId: 1, genres: ['Drama', 'Crimen'] }),
      makeMedia({ tmdbId: 2, genres: ['Crimen', 'Acción'] }),
    ]);

    expect(genres).toEqual(['Acción', 'Crimen', 'Drama']);
  });
});

describe('filterLibrary', () => {
  const library = [
    makeMedia({
      tmdbId: 1,
      title: 'Parásitos',
      status: 'por_ver',
      mediaType: 'movie',
      genres: ['Drama'],
      releaseYear: '2019',
      updatedAt: '2024-03-01T00:00:00.000Z',
    }),
    makeMedia({
      tmdbId: 2,
      title: 'Breaking Bad',
      status: 'por_ver',
      mediaType: 'tv',
      genres: ['Crimen'],
      releaseYear: '2008',
      updatedAt: '2024-05-01T00:00:00.000Z',
    }),
    makeMedia({
      tmdbId: 3,
      title: 'Dune',
      status: 'viendo',
      mediaType: 'movie',
      genres: ['Ciencia Ficción'],
      releaseYear: '2021',
      updatedAt: '2024-04-01T00:00:00.000Z',
    }),
  ];

  it('solo devuelve los del estado pedido', () => {
    const result = filterLibrary(library, makeFilters({ status: 'viendo' }));
    expect(result.map((m) => m.tmdbId)).toEqual([3]);
  });

  it('filtra por tipo', () => {
    const result = filterLibrary(library, makeFilters({ type: 'tv' }));
    expect(result.map((m) => m.title)).toEqual(['Breaking Bad']);
  });

  it('filtra por género', () => {
    const result = filterLibrary(library, makeFilters({ genre: 'Drama' }));
    expect(result.map((m) => m.title)).toEqual(['Parásitos']);
  });

  it('busca ignorando acentos y mayúsculas', () => {
    const result = filterLibrary(library, makeFilters({ query: 'PARASITOS' }));
    expect(result.map((m) => m.title)).toEqual(['Parásitos']);
  });

  it('ordena por más reciente de forma predeterminada', () => {
    const result = filterLibrary(library, makeFilters());
    expect(result.map((m) => m.title)).toEqual(['Breaking Bad', 'Parásitos']);
  });

  it('ordena alfabéticamente sin que los acentos alteren el orden', () => {
    const result = filterLibrary(library, makeFilters({ sort: 'titulo' }));
    expect(result.map((m) => m.title)).toEqual(['Breaking Bad', 'Parásitos']);
  });

  it('ordena por año descendente', () => {
    const result = filterLibrary(library, makeFilters({ sort: 'anio' }));
    expect(result.map((m) => m.releaseYear)).toEqual(['2019', '2008']);
  });

  it('manda al fondo los títulos sin puntaje al ordenar por puntaje', () => {
    const conReseña = makeMedia({
      tmdbId: 4,
      title: 'Whiplash',
      history: [makeWatch(4.5)],
    });
    const result = filterLibrary(
      [...library, conReseña],
      makeFilters({ sort: 'puntaje' }),
    );

    expect(result[0].title).toBe('Whiplash');
    expect(result.at(-1)?.history).toBeUndefined();
  });

  it('usa el puntaje del visionado más reciente', () => {
    const revisto = makeMedia({
      tmdbId: 5,
      title: 'Alien',
      history: [
        { id: 'nueva', rating: 5, completedAt: '2024-06-01T00:00:00.000Z' },
        { id: 'vieja', rating: 2, completedAt: '2020-01-01T00:00:00.000Z' },
      ],
    });
    const otro = makeMedia({ tmdbId: 6, title: 'Otra', history: [makeWatch(4)] });

    const result = filterLibrary([revisto, otro], makeFilters({ sort: 'puntaje' }));
    expect(result[0].title).toBe('Alien');
  });

  it('filtra por plataforma', () => {
    const enNetflix = makeMedia({
      tmdbId: 7,
      title: 'En Netflix',
      providers: ['Netflix', 'Max'],
    });
    const result = filterLibrary(
      [...library, enNetflix],
      makeFilters({ provider: 'Netflix' }),
    );

    expect(result.map((m) => m.title)).toEqual(['En Netflix']);
  });

  it('filtra por colección propia', () => {
    const enLista = makeMedia({
      tmdbId: 8,
      title: 'En la lista',
      collections: ['abc'],
    });
    const result = filterLibrary(
      [...library, enLista],
      makeFilters({ collection: 'abc' }),
    );

    expect(result.map((m) => m.title)).toEqual(['En la lista']);
  });

  it('filtra por etiqueta de cualquiera de sus reseñas', () => {
    const conTag = makeMedia({
      tmdbId: 9,
      title: 'Con tag',
      history: [makeWatch(3), makeWatch(5, ['Para llorar'])],
    });
    const result = filterLibrary(
      [...library, conTag],
      makeFilters({ tag: 'Para llorar' }),
    );

    expect(result.map((m) => m.title)).toEqual(['Con tag']);
  });

  it('no muta la lista que recibe', () => {
    const original = [...library];
    filterLibrary(library, makeFilters({ sort: 'titulo' }));
    expect(library).toEqual(original);
  });

  it('combina filtros', () => {
    const result = filterLibrary(
      library,
      makeFilters({ type: 'movie', query: 'para' }),
    );
    expect(result.map((m) => m.title)).toEqual(['Parásitos']);
  });
});

describe('hasActiveFilters', () => {
  it('es falso cuando solo cambió la pestaña de estado', () => {
    expect(hasActiveFilters(makeFilters({ status: 'completada' }))).toBe(false);
  });

  it('es verdadero con cualquier filtro puesto', () => {
    expect(hasActiveFilters(makeFilters({ query: 'dune' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ genre: 'Drama' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ type: 'tv' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ provider: 'Netflix' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ collection: 'abc' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ tag: 'Para llorar' }))).toBe(true);
    expect(hasActiveFilters(makeFilters({ sort: 'titulo' }))).toBe(true);
  });
});
