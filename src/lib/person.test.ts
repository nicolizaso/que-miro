import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import type { PersonPageCredit } from '@/lib/tmdb';
import {
  ageOn,
  buildFilmography,
  creditLine,
  departmentLabel,
  filterByRole,
  lifeFacts,
  markOf,
  personSearchCaption,
  personSummary,
  rolesIn,
} from './person';

function credit(id: number, title: string, overrides: Partial<PersonPageCredit> = {}): PersonPageCredit {
  return {
    id,
    media_type: 'movie',
    title,
    date: '2010-01-01',
    poster_path: null,
    role: 'reparto',
    character: null,
    job: null,
    vote_average: 7,
    vote_count: 1000,
    ...overrides,
  };
}

function media(tmdbId: number, status: SavedMedia['status'], mediaType: SavedMedia['mediaType'] = 'movie'): SavedMedia {
  return {
    tmdbId,
    mediaType,
    title: `T${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2010',
    genres: [],
    status,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const CREDITS = [
  credit(1, 'Vieja', { date: '1999-05-01', character: 'Juan' }),
  credit(2, 'Dirigida y actuada', { date: '2015-03-01', role: 'direccion', job: 'Director' }),
  credit(2, 'Dirigida y actuada', { date: '2015-03-01', role: 'reparto', character: 'Cameo' }),
  credit(3, 'Anunciada', { date: null, role: 'direccion', job: 'Director' }),
  credit(4, 'Serie', { media_type: 'tv', date: '2020-01-01' }),
  credit(4, 'Película con el mismo id', { date: '2001-01-01' }),
];

describe('buildFilmography', () => {
  const items = buildFilmography(CREDITS, [media(1, 'completada'), media(4, 'abandonada', 'tv'), media(2, 'por_ver')]);

  it('quien dirigió y actuó en lo mismo aparece una vez, con los dos papeles', () => {
    const both = items.filter((item) => item.id === 2);
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ roles: ['direccion', 'reparto'], job: 'Director', character: 'Cameo' });
  });

  it('una película y una serie con el mismo id son dos', () => {
    expect(items.filter((item) => item.id === 4).map((item) => item.mediaType).sort()).toEqual(['movie', 'tv']);
  });

  it('lo anunciado arriba, después de lo más nuevo a lo más viejo', () => {
    expect(items.map((item) => item.title)).toEqual([
      'Anunciada',
      'Serie',
      'Dirigida y actuada',
      'Película con el mismo id',
      'Vieja',
    ]);
  });

  it('cada título marcado según la biblioteca, abandonado incluido', () => {
    expect(items.find((item) => item.title === 'Vieja')?.mark).toBe('visto');
    expect(items.find((item) => item.title === 'Serie')?.mark).toBe('abandonado');
    expect(items.find((item) => item.title === 'Dirigida y actuada')?.mark).toBe('por_ver');
    expect(items.find((item) => item.title === 'Película con el mismo id')?.mark).toBeNull();
    expect(markOf(media(9, 'en_pausa'))).toBe('en_pausa');
  });

  it('el filtro por papel', () => {
    expect(rolesIn(items)).toEqual(['reparto', 'direccion']);
    expect(filterByRole(items, 'direccion').map((item) => item.title)).toEqual(['Anunciada', 'Dirigida y actuada']);
    expect(filterByRole(items, null)).toHaveLength(items.length);
  });
});

describe('personSummary', () => {
  it('viste cuántos de los estrenados, sin contar lo anunciado', () => {
    const items = buildFilmography(CREDITS, [media(1, 'completada'), media(2, 'viendo')]);
    const summary = personSummary(items, { today: '2026-09-29' });
    expect(summary.seen).toBe(1);
    expect(summary.total).toBe(4);
  });

  it('te faltan los mejor puntuados, con un mínimo de votos', () => {
    const items = buildFilmography(
      [
        credit(10, 'Obra maestra', { vote_average: 8.6, vote_count: 20000 }),
        credit(11, 'Tres votos de diez', { vote_average: 10, vote_count: 3 }),
        credit(12, 'Muy buena', { vote_average: 7.9, vote_count: 5000 }),
        credit(13, 'Ya la viste', { vote_average: 9, vote_count: 9000 }),
        credit(14, 'Sin estrenar', { vote_average: 9.5, vote_count: 5000, date: '2030-01-01' }),
        credit(15, 'Buena', { vote_average: 7.2, vote_count: 800 }),
        credit(16, 'Correcta', { vote_average: 7.1, vote_count: 800 }),
      ],
      [media(13, 'completada')],
    );
    const summary = personSummary(items, { today: '2026-09-29' });
    expect(summary.missingTopRated.map((item) => item.title)).toEqual(['Obra maestra', 'Muy buena', 'Buena']);
  });

  it('"bien puntuada" tiene un piso: lo mejor de lo flojo no se recomienda', () => {
    const items = buildFilmography(
      [
        credit(20, 'Pasable', { vote_average: 6.4, vote_count: 4000 }),
        credit(21, 'Floja', { vote_average: 5, vote_count: 900 }),
      ],
      [],
    );
    const summary = personSummary(items, { today: '2026-09-29' });
    expect(summary.total).toBe(2);
    expect(summary.missingTopRated).toEqual([]);
  });
});

describe('los datos de la persona', () => {
  it('el departamento en castellano, y nada si no lo conocemos', () => {
    expect(departmentLabel('Acting')).toBe('Actuación');
    expect(departmentLabel('Directing')).toBe('Dirección');
    expect(departmentLabel('Crew')).toBeNull();
    expect(departmentLabel(null)).toBeNull();
  });

  it('la edad cuenta si ya cumplió este año', () => {
    expect(ageOn('1983-07-17', '2026-07-16')).toBe(42);
    expect(ageOn('1983-07-17', '2026-07-17')).toBe(43);
    expect(ageOn('1983-07-17', '2026-12-31')).toBe(43);
  });

  it('dónde y cuándo nació, y la edad que tiene o que tenía al morir', () => {
    expect(
      lifeFacts({ birthday: '1983-07-17', deathday: null, place_of_birth: 'Rosario, Argentina' }, '2026-09-29'),
    ).toBe('Nació el 17 de julio de 1983 en Rosario, Argentina · 43 años');
    expect(
      lifeFacts({ birthday: '1947-01-08', deathday: '2016-01-10', place_of_birth: null }, '2026-09-29'),
    ).toBe('Nació el 8 de enero de 1947 · Murió el 10 de enero de 2016, a los 69 años');
    expect(lifeFacts({ birthday: null, deathday: null, place_of_birth: 'Lima, Perú' }, '2026-09-29')).toBe(
      'Nació en Lima, Perú',
    );
    expect(lifeFacts({ birthday: null, deathday: null, place_of_birth: null }, '2026-09-29')).toBeNull();
  });
});

describe('personSearchCaption', () => {
  const person = { id: 525, name: 'Christopher Nolan', profile_path: null };

  it('de qué trabaja y con qué se la conoce', () => {
    expect(
      personSearchCaption({ ...person, known_for_department: 'Directing', known_for: ['Interestelar', 'El origen'] }),
    ).toBe('Dirección · Interestelar, El origen');
  });

  it('con una sola de las dos cosas, esa', () => {
    expect(personSearchCaption({ ...person, known_for_department: 'Acting', known_for: [] })).toBe('Actuación');
    expect(personSearchCaption({ ...person, known_for_department: 'Crew', known_for: ['Tenet'] })).toBe('Tenet');
  });

  it('sin nada que decir, nada', () => {
    expect(personSearchCaption(person)).toBeNull();
    expect(personSearchCaption({ ...person, known_for_department: null, known_for: [] })).toBeNull();
  });
});

describe('creditLine', () => {
  const [item] = buildFilmography([credit(1, 'X', { date: '2019-02-01', character: 'Lady Bird' })], []);

  it('el año y el personaje', () => {
    expect(creditLine(item)).toBe('2019 · Lady Bird');
  });

  it('lo que dirigió, creó, o dirigió y actuó', () => {
    expect(creditLine({ ...item, roles: ['direccion'], job: 'Director' })).toBe('2019 · Dirigió');
    expect(creditLine({ ...item, roles: ['direccion'], job: 'Creator' })).toBe('2019 · Creó la serie');
    expect(creditLine({ ...item, roles: ['direccion', 'reparto'] })).toBe('2019 · Dirigió y actuó (Lady Bird)');
  });

  it('sin fecha, "Próximamente"; sin personaje, solo el año', () => {
    expect(creditLine({ ...item, year: null, character: null })).toBe('Próximamente');
  });
});
