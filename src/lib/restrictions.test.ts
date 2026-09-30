import { describe, expect, it } from 'vitest';
import {
  emptyRestrictions,
  hasRestrictions,
  minYearOptions,
  parseRestrictions,
  passesRestrictions,
  restrictDiscover,
  restrictionsToDocument,
  toggleExcludedGenre,
} from './restrictions';
import { Restrictions, TMDbResult } from '@/types';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function restrictions(overrides: Partial<Restrictions> = {}): Restrictions {
  return { ...emptyRestrictions(), ...overrides };
}

function movie(overrides: Partial<TMDbResult> = {}): TMDbResult {
  return {
    id: 1,
    media_type: 'movie',
    title: 'Volver al futuro',
    poster_path: '/p.jpg',
    backdrop_path: null,
    release_date: '1985-07-03',
    genre_ids: [12, 35, 878],
    overview: '',
    ...overrides,
  };
}

function series(overrides: Partial<TMDbResult> = {}): TMDbResult {
  return {
    id: 2,
    media_type: 'tv',
    name: 'Twin Peaks',
    poster_path: '/p.jpg',
    backdrop_path: null,
    first_air_date: '1990-04-08',
    genre_ids: [80, 18, 9648],
    overview: '',
    ...overrides,
  };
}

describe('parseRestrictions', () => {
  it('lo que no es un objeto vuelve vacío', () => {
    expect(parseRestrictions(null)).toEqual(emptyRestrictions());
    expect(parseRestrictions('terror')).toEqual(emptyRestrictions());
    expect(parseRestrictions([])).toEqual(emptyRestrictions());
  });

  it('conserva un documento válido', () => {
    const value = {
      minYear: { year: 1990, scope: 'movie' },
      excludedGenres: ['Terror', 'Reality'],
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    expect(parseRestrictions(value, NOW)).toEqual(value);
  });

  it('descarta un año fuera de rango o roto', () => {
    for (const year of [1899, 2027, 1990.5, 'mil novecientos', null]) {
      expect(parseRestrictions({ minYear: { year, scope: 'both' } }, NOW).minYear).toBeUndefined();
    }
    expect(parseRestrictions({ minYear: 1990 }, NOW).minYear).toBeUndefined();
  });

  it('un alcance desconocido se lee como las dos', () => {
    expect(parseRestrictions({ minYear: { year: 1990, scope: 'anime' } }, NOW).minYear).toEqual({
      year: 1990,
      scope: 'both',
    });
  });

  it('se queda solo con géneros que la app sabe traducir, sin repetir', () => {
    expect(
      parseRestrictions({ excludedGenres: [' Terror ', 'Terror', 'Gore', 3, 'Reality'] })
        .excludedGenres,
    ).toEqual(['Terror', 'Reality']);
  });

  it('una fecha rota vuelve a la época cero, para que cualquier otra gane', () => {
    expect(parseRestrictions({ updatedAt: 'ayer' }).updatedAt).toBe(new Date(0).toISOString());
  });
});

describe('hasRestrictions y restrictionsToDocument', () => {
  it('vacías no cuentan', () => {
    expect(hasRestrictions(emptyRestrictions())).toBe(false);
    expect(hasRestrictions(restrictions({ excludedGenres: ['Terror'] }))).toBe(true);
    expect(hasRestrictions(restrictions({ minYear: { year: 1990, scope: 'both' } }))).toBe(true);
  });

  it('el año que falta va como null, que Firestore sí acepta', () => {
    expect(restrictionsToDocument(emptyRestrictions())).toEqual({
      minYear: null,
      excludedGenres: [],
      updatedAt: new Date(0).toISOString(),
    });
  });

  it('ida y vuelta por Firestore queda igual', () => {
    const value = restrictions({
      minYear: { year: 2000, scope: 'tv' },
      excludedGenres: ['Talk Show'],
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    expect(parseRestrictions(restrictionsToDocument(value), NOW)).toEqual(value);
  });
});

describe('passesRestrictions', () => {
  it('sin restricciones pasa todo', () => {
    expect(passesRestrictions(movie(), emptyRestrictions())).toBe(true);
  });

  it('el año mínimo de películas deja afuera películas viejas y no toca las series', () => {
    const onlyMovies = restrictions({ minYear: { year: 1990, scope: 'movie' } });

    expect(passesRestrictions(movie(), onlyMovies)).toBe(false);
    expect(passesRestrictions(movie({ release_date: '1990-01-01' }), onlyMovies)).toBe(true);
    expect(passesRestrictions(series({ first_air_date: '1983-01-01' }), onlyMovies)).toBe(true);
  });

  it('con alcance en las dos, filtra también las series por su estreno', () => {
    const both = restrictions({ minYear: { year: 1991, scope: 'both' } });

    expect(passesRestrictions(series(), both)).toBe(false);
    expect(passesRestrictions(movie({ release_date: '2001-01-01' }), both)).toBe(true);
  });

  it('un título sin fecha pasa: no hay con qué juzgarlo', () => {
    const both = restrictions({ minYear: { year: 1990, scope: 'both' } });
    expect(passesRestrictions(movie({ release_date: '' }), both)).toBe(true);
    expect(passesRestrictions(movie({ release_date: undefined }), both)).toBe(true);
  });

  it('descarta lo que tiene un género excluido', () => {
    const noComedy = restrictions({ excludedGenres: ['Comedia'] });

    expect(passesRestrictions(movie(), noComedy)).toBe(false);
    expect(passesRestrictions(series(), noComedy)).toBe(true);
  });

  it('los géneros que solo existen en series también se filtran', () => {
    expect(
      passesRestrictions(
        series({ genre_ids: [10764] }),
        restrictions({ excludedGenres: ['Reality'] }),
      ),
    ).toBe(false);
  });

  it('uno sin géneros pasa el filtro de géneros', () => {
    expect(
      passesRestrictions(movie({ genre_ids: [] }), restrictions({ excludedGenres: ['Comedia'] })),
    ).toBe(true);
  });
});

describe('restrictDiscover', () => {
  it('sin restricciones devuelve los mismos criterios', () => {
    const params = { mediaType: 'movie' as const, genres: [27], sort: 'rating' as const };
    expect(restrictDiscover(params, emptyRestrictions())).toBe(params);
  });

  it('suma el año mínimo como piso, o sube el que ya había', () => {
    const floor = restrictions({ minYear: { year: 1990, scope: 'both' } });

    expect(restrictDiscover({ mediaType: 'movie' }, floor)).toEqual({
      mediaType: 'movie',
      from: 1990,
    });
    expect(restrictDiscover({ mediaType: 'movie', from: 1980, to: 1999 }, floor)).toEqual({
      mediaType: 'movie',
      from: 1990,
      to: 1999,
    });
    expect(restrictDiscover({ mediaType: 'movie', from: 2010 }, floor)).toEqual({
      mediaType: 'movie',
      from: 2010,
    });
  });

  it('el año mínimo de películas no toca las filas de series', () => {
    const onlyMovies = restrictions({ minYear: { year: 1990, scope: 'movie' } });
    expect(restrictDiscover({ mediaType: 'tv', to: 1985 }, onlyMovies)).toEqual({
      mediaType: 'tv',
      to: 1985,
    });
  });

  it('una fila que termina antes del piso no se arma', () => {
    const floor = restrictions({ minYear: { year: 1990, scope: 'both' } });
    expect(restrictDiscover({ mediaType: 'movie', from: 1980, to: 1989 }, floor)).toBeNull();
  });

  it('una fila de un género excluido no se arma', () => {
    const noHorror = restrictions({ excludedGenres: ['Terror'] });
    expect(restrictDiscover({ mediaType: 'movie', genres: [27] }, noHorror)).toBeNull();
  });

  it('suma los géneros excluidos que existen en ese tipo, sin pasarse del tope', () => {
    const many = restrictions({
      excludedGenres: ['Terror', 'Reality', 'Animación', 'Documental', 'Western'],
    });

    // "Reality" no existe en películas: no se manda un id que no corresponde.
    expect(restrictDiscover({ mediaType: 'movie' }, many)?.withoutGenres).toEqual([27, 16, 99]);
    // La fila ya excluía algo: eso va primero.
    expect(
      restrictDiscover({ mediaType: 'tv', withoutGenres: [10762] }, many)?.withoutGenres,
    ).toEqual([10762, 10764, 16]);
  });
});

describe('toggleExcludedGenre', () => {
  it('pone y saca, con la fecha de ahora', () => {
    const added = toggleExcludedGenre(emptyRestrictions(), 'Terror', NOW);
    expect(added).toEqual({ excludedGenres: ['Terror'], updatedAt: NOW.toISOString() });
    expect(toggleExcludedGenre(added, 'Terror', NOW).excludedGenres).toEqual([]);
  });
});

describe('minYearOptions', () => {
  it('va de los 60 a la década actual', () => {
    expect(minYearOptions(NOW)).toEqual([1960, 1970, 1980, 1990, 2000, 2010, 2020]);
    expect(minYearOptions(new Date('2031-01-01T00:00:00.000Z')).at(-1)).toBe(2030);
  });
});
