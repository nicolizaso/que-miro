import { describe, expect, it } from 'vitest';
import {
  allWatches,
  formatDuration,
  genreDistribution,
  monthlyActivity,
  ratingDistribution,
  runtimeMinutes,
  summarize,
  topRated,
  totalMinutes,
} from './stats';
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
    ...overrides,
  };
}

function watch(rating: number, completedAt: string, id = `w-${completedAt}`) {
  return { id, rating, completedAt };
}

describe('allWatches', () => {
  it('aplana el historial y ordena de lo más reciente a lo más viejo', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        history: [watch(5, '2025-01-01T00:00:00.000Z')],
      }),
      makeMedia({
        tmdbId: 2,
        history: [
          watch(4, '2026-01-01T00:00:00.000Z'),
          watch(3, '2020-01-01T00:00:00.000Z'),
        ],
      }),
    ];

    expect(allWatches(list).map(({ entry }) => entry.rating)).toEqual([4, 5, 3]);
  });

  it('ignora los títulos que nunca se terminaron', () => {
    expect(allWatches([makeMedia({ status: 'por_ver' })])).toHaveLength(0);
  });
});

describe('runtimeMinutes', () => {
  it('usa la duración de la película', () => {
    expect(runtimeMinutes(makeMedia({ runtime: 136 }))).toBe(136);
  });

  it('en series multiplica la duración del episodio por el total', () => {
    const serie = makeMedia({
      mediaType: 'tv',
      runtime: 45,
      totalEpisodes: 62,
    });

    expect(runtimeMinutes(serie)).toBe(45 * 62);
  });

  it('cae en un promedio cuando TMDB no trajo la duración', () => {
    // Sin esto, un título sin `runtime` contaría cero y las horas quedarían
    // siempre cortas.
    expect(runtimeMinutes(makeMedia())).toBeGreaterThan(0);
    expect(
      runtimeMinutes(makeMedia({ mediaType: 'tv', totalEpisodes: 10 })),
    ).toBeGreaterThan(0);
  });

  it('en series sin total de episodios suma las temporadas conocidas', () => {
    const serie = makeMedia({
      mediaType: 'tv',
      runtime: 50,
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 8 },
        { seasonNumber: 2, name: 'T2', episodeCount: 2 },
      ],
    });

    expect(runtimeMinutes(serie)).toBe(50 * 10);
  });
});

describe('totalMinutes', () => {
  it('cuenta cada visionado', () => {
    const list = [
      makeMedia({
        runtime: 100,
        history: [
          watch(5, '2025-01-01T00:00:00.000Z'),
          watch(4, '2020-01-01T00:00:00.000Z'),
        ],
      }),
    ];

    expect(totalMinutes(list)).toBe(200);
  });

  it('en una serie a medias cuenta solo los episodios marcados', () => {
    const list = [
      makeMedia({
        mediaType: 'tv',
        runtime: 50,
        status: 'viendo',
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
        progress: { watched: { 1: [1, 2, 3] } },
      }),
    ];

    expect(totalMinutes(list)).toBe(150);
  });

  it('una serie terminada cuenta entera, no solo lo marcado', () => {
    const list = [
      makeMedia({
        mediaType: 'tv',
        runtime: 50,
        totalEpisodes: 10,
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
        progress: { watched: { 1: [1, 2] } },
        history: [watch(5, '2025-01-01T00:00:00.000Z')],
      }),
    ];

    expect(totalMinutes(list)).toBe(500);
  });
});

describe('formatDuration', () => {
  it('usa minutos, horas o días según el tamaño', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(135)).toBe('2 h 15 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(60 * 24 * 3)).toBe('3 días');
    expect(formatDuration(60 * 24 * 3 + 240)).toBe('3 días y 4 h');
  });
});

describe('genreDistribution', () => {
  it('cuenta cada género del historial y ordena por frecuencia', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        genres: ['Drama', 'Crimen'],
        history: [watch(5, '2025-01-01T00:00:00.000Z')],
      }),
      makeMedia({
        tmdbId: 2,
        genres: ['Drama'],
        history: [watch(4, '2025-02-01T00:00:00.000Z')],
      }),
    ];

    expect(genreDistribution(list)).toEqual([
      { label: 'Drama', value: 2 },
      { label: 'Crimen', value: 1 },
    ]);
  });

  it('respeta el tope', () => {
    const list = [
      makeMedia({
        genres: ['A', 'B', 'C', 'D'],
        history: [watch(5, '2025-01-01T00:00:00.000Z')],
      }),
    ];

    expect(genreDistribution(list, 2)).toHaveLength(2);
  });
});

describe('ratingDistribution', () => {
  it('devuelve los diez valores, incluidos los que están en cero', () => {
    const list = [
      makeMedia({
        history: [
          watch(5, '2025-01-01T00:00:00.000Z'),
          watch(5, '2024-01-01T00:00:00.000Z'),
        ],
      }),
    ];

    const distribution = ratingDistribution(list);
    expect(distribution).toHaveLength(10);
    expect(distribution.at(-1)).toEqual({ label: '5', value: 2 });
    expect(distribution[0]).toEqual({ label: '0,5', value: 0 });
  });
});

describe('monthlyActivity', () => {
  const now = new Date('2026-03-15T00:00:00.000Z');

  it('devuelve un punto por mes, incluidos los vacíos', () => {
    const activity = monthlyActivity([], 6, now);

    expect(activity).toHaveLength(6);
    expect(activity.every((month) => month.value === 0)).toBe(true);
  });

  it('cuenta los visionados en su mes', () => {
    const list = [
      makeMedia({
        history: [
          watch(5, '2026-03-02T00:00:00.000Z'),
          watch(4, '2026-03-20T00:00:00.000Z'),
          watch(3, '2026-01-05T00:00:00.000Z'),
        ],
      }),
    ];

    const activity = monthlyActivity(list, 6, now);

    expect(activity.at(-1)?.value).toBe(2);
    expect(activity.find((m) => m.key === '2026-01')?.value).toBe(1);
  });

  it('termina en el mes actual', () => {
    expect(monthlyActivity([], 3, now).at(-1)?.key).toBe('2026-03');
  });
});

describe('summarize', () => {
  it('separa visionados de títulos distintos', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        history: [
          watch(5, '2025-01-01T00:00:00.000Z'),
          watch(3, '2020-01-01T00:00:00.000Z'),
        ],
      }),
    ];

    const summary = summarize(list);
    expect(summary.totalWatches).toBe(2);
    expect(summary.uniqueTitles).toBe(1);
    expect(summary.averageRating).toBe(4);
  });

  it('cuenta las series empezadas y sin terminar', () => {
    const list = [
      makeMedia({
        mediaType: 'tv',
        status: 'viendo',
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
        progress: { watched: { 1: [1] } },
      }),
    ];

    expect(summarize(list).inProgress).toBe(1);
  });

  it('sobre una biblioteca vacía devuelve ceros y no NaN', () => {
    const summary = summarize([]);
    expect(summary.averageRating).toBe(0);
    expect(summary.minutes).toBe(0);
  });
});

describe('topRated', () => {
  it('se queda con el mejor puntaje de cada título', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        title: 'Matrix',
        history: [
          watch(2, '2025-01-01T00:00:00.000Z'),
          watch(5, '2020-01-01T00:00:00.000Z'),
        ],
      }),
      makeMedia({
        tmdbId: 2,
        title: 'Alien',
        history: [watch(4, '2025-01-01T00:00:00.000Z')],
      }),
    ];

    const best = topRated(list);
    expect(best).toHaveLength(2);
    expect(best[0].media.title).toBe('Matrix');
    expect(best[0].entry.rating).toBe(5);
  });
});
