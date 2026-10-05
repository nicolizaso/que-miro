import { describe, expect, it } from 'vitest';
import { canonicalGenreNames, genresFor, getGenreId, getGenreNames } from './genres';

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

describe('canonicalGenreNames', () => {
  it('nombra cada género como la app, sin importar el idioma de TMDB', () => {
    expect(
      canonicalGenreNames([
        { id: 53, name: 'Suspense' },
        { id: 878, name: 'Ciencia ficción' },
      ]),
    ).toEqual(['Suspenso', 'Ciencia Ficción']);
  });

  it('un id desconocido conserva el nombre que mandó TMDB', () => {
    expect(canonicalGenreNames([{ id: 424242, name: 'Kaiju' }])).toEqual(['Kaiju']);
  });

  it('sin géneros devuelve una lista vacía', () => {
    expect(canonicalGenreNames(undefined)).toEqual([]);
  });
});

describe('getGenreId', () => {
  it('resuelve el id del tipo de medio que corresponde', () => {
    expect(getGenreId('Terror', 'movie')).toBe(27);
    // "Terror" no existe en series: sin id, la fila no se arma.
    expect(getGenreId('Terror', 'tv')).toBeUndefined();
  });
});

describe('genresFor', () => {
  it('ofrece cada género solo en el tipo donde existe', () => {
    expect(genresFor('movie')).toContain('Terror');
    expect(genresFor('movie')).not.toContain('Sci-Fi y Fantasía');
    expect(genresFor('tv')).toContain('Sci-Fi y Fantasía');
    expect(genresFor('tv')).not.toContain('Terror');
  });

  it('cada nombre se puede volver a traducir a un id del mismo tipo', () => {
    for (const type of ['movie', 'tv'] as const) {
      for (const name of genresFor(type)) {
        expect(getGenreId(name, type)).toBeDefined();
      }
    }
  });

  it('viene en orden alfabético', () => {
    const genres = genresFor('tv');
    expect(genres).toEqual([...genres].sort((a, b) => a.localeCompare(b, 'es')));
  });
});
