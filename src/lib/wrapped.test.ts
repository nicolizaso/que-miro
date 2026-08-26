import { describe, expect, it } from 'vitest';
import { availableYears, buildWrapped } from './wrapped';
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
    status: 'completada',
    updatedAt: '2024-01-01T00:00:00.000Z',
    runtime: 120,
    ...overrides,
  };
}

function watch(rating: number, completedAt: string, id = `w-${completedAt}`) {
  return { id, rating, completedAt };
}

describe('availableYears', () => {
  it('devuelve los años con actividad, del más nuevo al más viejo', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        history: [
          watch(5, '2024-03-01T00:00:00.000Z'),
          watch(4, '2026-01-01T00:00:00.000Z'),
        ],
      }),
      makeMedia({ tmdbId: 2, history: [watch(3, '2025-06-01T00:00:00.000Z')] }),
    ];

    expect(availableYears(list)).toEqual([2026, 2025, 2024]);
  });

  it('sobre una biblioteca sin historial devuelve nada', () => {
    expect(availableYears([makeMedia({ status: 'por_ver' })])).toEqual([]);
  });
});

describe('buildWrapped', () => {
  const list = [
    makeMedia({
      tmdbId: 1,
      title: 'De 2026',
      genres: ['Drama'],
      runtime: 120,
      history: [watch(5, '2026-02-01T00:00:00.000Z')],
    }),
    makeMedia({
      tmdbId: 2,
      title: 'También de 2026',
      genres: ['Drama'],
      runtime: 90,
      history: [watch(3, '2026-02-15T00:00:00.000Z')],
    }),
    makeMedia({
      tmdbId: 3,
      title: 'De 2025',
      genres: ['Comedia'],
      history: [watch(4, '2025-05-01T00:00:00.000Z')],
    }),
  ];

  it('solo cuenta lo terminado en ese año', () => {
    const wrapped = buildWrapped(list, 2026)!;

    expect(wrapped.watches).toBe(2);
    expect(wrapped.titles).toBe(2);
    expect(wrapped.averageRating).toBe(4);
  });

  it('suma los minutos de lo visto en el año', () => {
    expect(buildWrapped(list, 2026)!.minutes).toBe(210);
  });

  it('saca el género más frecuente del año, no de toda la biblioteca', () => {
    // En 2025 el único género es Comedia, aunque Drama domine el total.
    expect(buildWrapped(list, 2025)!.topGenre).toBe('Comedia');
    expect(buildWrapped(list, 2026)!.topGenre).toBe('Drama');
  });

  it('marca el mes más activo', () => {
    expect(buildWrapped(list, 2026)!.busiestMonth).toBe('febrero');
  });

  it('elige lo mejor puntuado y lo más largo', () => {
    const wrapped = buildWrapped(list, 2026)!;

    expect(wrapped.best?.media.title).toBe('De 2026');
    expect(wrapped.longest?.media.title).toBe('De 2026');
  });

  it('separa películas de series', () => {
    const conSerie = [
      ...list,
      makeMedia({
        tmdbId: 4,
        mediaType: 'tv',
        title: 'Serie',
        runtime: 45,
        totalEpisodes: 10,
        history: [watch(4, '2026-03-01T00:00:00.000Z')],
      }),
    ];

    const wrapped = buildWrapped(conSerie, 2026)!;
    expect(wrapped.movies).toBe(2);
    expect(wrapped.series).toBe(1);
  });

  it('devuelve null si ese año no hubo nada', () => {
    expect(buildWrapped(list, 2020)).toBeNull();
  });
});
