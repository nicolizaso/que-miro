import { describe, expect, it } from 'vitest';
import { availableYears, bestEpisodeOfYear, buildWrapped } from './wrapped';
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

describe('el episodio del año', () => {
  function series(
    tmdbId: number,
    title: string,
    ratings: Record<string, number>,
    watchedAt: Record<string, string> = {},
    overrides: Partial<SavedMedia> = {},
  ): SavedMedia {
    return makeMedia({
      tmdbId,
      title,
      mediaType: 'tv',
      runtime: 50,
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 8 },
        { seasonNumber: 2, name: 'T2', episodeCount: 8 },
      ],
      progress: {
        watched: { 1: [1, 2, 3, 4, 5, 6, 7, 8], 2: [1, 2, 3, 4, 5, 6, 7, 8] },
        watchedAt,
        episodeRatings: ratings,
      },
      ...overrides,
    });
  }

  it('sale de los episodios puntuados que viste ese año', () => {
    const list = [
      series(1, 'The Bear', { '2x6': 5, '1x1': 4 }, {
        '2x6': '2026-03-10T21:00:00.000Z',
        '1x1': '2026-01-05T21:00:00.000Z',
      }),
      // Un cinco de otro año no cuenta.
      series(2, 'Dark', { '1x8': 5 }, { '1x8': '2025-11-01T21:00:00.000Z' }),
    ];

    expect(bestEpisodeOfYear(list, 2026)).toMatchObject({
      media: { title: 'The Bear' },
      seasonNumber: 2,
      episode: 6,
      rating: 5,
      dated: true,
    });
  });

  it('a igual puntaje, el más reciente', () => {
    const list = [
      series(1, 'Uno', { '1x1': 5 }, { '1x1': '2026-02-01T21:00:00.000Z' }),
      series(2, 'Dos', { '1x2': 5 }, { '1x2': '2026-08-01T21:00:00.000Z' }),
    ];

    expect(bestEpisodeOfYear(list, 2026)?.media.title).toBe('Dos');
  });

  it('sin fechas, sale de la serie mejor puntuada que terminaste ese año', () => {
    const list = [
      series(1, 'Floja', { '1x1': 5 }, {}, {
        history: [watch(3, '2026-04-01T00:00:00.000Z')],
      }),
      series(2, 'Buena', { '1x3': 4.5, '2x1': 4 }, {}, {
        history: [watch(5, '2026-05-01T00:00:00.000Z')],
      }),
    ];

    expect(bestEpisodeOfYear(list, 2026)).toMatchObject({
      media: { title: 'Buena' },
      seasonNumber: 1,
      episode: 3,
      dated: false,
    });
  });

  it('sin puntajes, no hay episodio del año', () => {
    const list = [series(1, 'Sin puntajes', {}, {}, { history: [watch(5, '2026-05-01T00:00:00.000Z')] })];
    expect(bestEpisodeOfYear(list, 2026)).toBeNull();
  });

  it('va en el resumen del año', () => {
    const list = [
      series(1, 'The Bear', { '2x6': 5 }, { '2x6': '2026-03-10T21:00:00.000Z' }, {
        history: [watch(4.5, '2026-06-01T00:00:00.000Z')],
      }),
    ];

    expect(buildWrapped(list, 2026)?.bestEpisode?.episode).toBe(6);
  });
});

describe('las metas y la racha en el resumen del año', () => {
  const movies = [1, 2, 3].map((id) =>
    makeMedia({
      tmdbId: id,
      title: `Película ${id}`,
      // Tres semanas seguidas de enero.
      history: [watch(4, new Date(2026, 0, 5 + (id - 1) * 7, 12).toISOString())],
    }),
  );

  it('dice qué metas del año se cumplieron', () => {
    const goals = { byYear: { '2026': { movies: 3, series: 5 } }, updatedAt: '2026-01-01T00:00:00.000Z' };
    const wrapped = buildWrapped(movies, 2026, goals, new Date(2026, 11, 31, 12))!;

    expect(wrapped.goalsMet.map((goal) => goal.kind)).toEqual(['movies']);
  });

  it('sin metas, no hay nada cumplido', () => {
    expect(buildWrapped(movies, 2026)!.goalsMet).toEqual([]);
  });

  it('trae la mejor racha del año', () => {
    expect(buildWrapped(movies, 2026)!.bestStreak).toBe(3);
  });
});
