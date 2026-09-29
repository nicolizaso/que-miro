import { describe, expect, it } from 'vitest';
import {
  abandonmentStats,
  activityHeatmap,
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

  it('prefiere la duración real de la temporada a estimarla con el primer episodio', () => {
    // El piloto dura 70 y el resto 45: "70 × 8" se pasaba por más de tres horas.
    const serie = makeMedia({
      mediaType: 'tv',
      runtime: 70,
      totalEpisodes: 8,
      seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 8, totalRuntime: 70 + 45 * 7 }],
    });

    expect(runtimeMinutes(serie)).toBe(385);
  });

  it('mezcla temporadas conocidas y estimadas', () => {
    const serie = makeMedia({
      mediaType: 'tv',
      runtime: 50,
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 8, totalRuntime: 380 },
        { seasonNumber: 2, name: 'T2', episodeCount: 10 },
      ],
    });

    expect(runtimeMinutes(serie)).toBe(380 + 50 * 10);
  });

  it('los especiales no suman, ni con su duración conocida', () => {
    const serie = makeMedia({
      mediaType: 'tv',
      runtime: 50,
      seasons: [
        { seasonNumber: 0, name: 'Especiales', episodeCount: 3, totalRuntime: 200 },
        { seasonNumber: 1, name: 'T1', episodeCount: 8, totalRuntime: 400 },
      ],
    });

    expect(runtimeMinutes(serie)).toBe(400);
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

  it('en una serie a medias, lo marcado usa la duración real de su temporada', () => {
    const list = [
      makeMedia({
        mediaType: 'tv',
        status: 'viendo',
        runtime: 70,
        seasons: [
          { seasonNumber: 1, name: 'T1', episodeCount: 4, totalRuntime: 200 },
          { seasonNumber: 2, name: 'T2', episodeCount: 4 },
        ],
        progress: { watched: { 1: [1, 2], 2: [1] } },
      }),
    ];

    // Dos de la primera a 50 de promedio, uno de la segunda estimado en 70.
    expect(totalMinutes(list)).toBe(2 * 50 + 70);
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

describe('la actividad con fechas por episodio', () => {
  const now = new Date(2026, 8, 15, 12);

  /** Una serie de dos temporadas de 4 episodios de 50 minutos. */
  function series(overrides: Partial<SavedMedia> = {}): SavedMedia {
    return makeMedia({
      tmdbId: 2,
      mediaType: 'tv',
      status: 'viendo',
      runtime: 50,
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 4 },
        { seasonNumber: 2, name: 'T2', episodeCount: 4 },
      ],
      ...overrides,
    });
  }

  it('los episodios cuentan en el mes en que se vieron, no cuando se terminó', () => {
    const list = [
      series({
        progress: {
          watched: { 1: [1, 2, 3] },
          watchedAt: {
            '1x1': new Date(2026, 7, 3).toISOString(),
            '1x2': new Date(2026, 7, 20).toISOString(),
            '1x3': new Date(2026, 8, 1).toISOString(),
          },
        },
      }),
    ];

    const activity = monthlyActivity(list, 3, now);
    const august = activity.find((month) => month.key === '2026-08')!;
    const september = activity.find((month) => month.key === '2026-09')!;

    expect(august).toMatchObject({ episodes: 2, titles: 0, minutes: 100, value: 2 });
    expect(september).toMatchObject({ episodes: 1, minutes: 50 });
  });

  it('lo marcado sin fecha no cuenta en ningún mes', () => {
    const list = [series({ progress: { watched: { 1: [1, 2, 3] } } })];
    expect(monthlyActivity(list, 3, now).every((month) => month.value === 0)).toBe(true);
  });

  it('terminar una serie vista con fechas no cuenta sus horas dos veces', () => {
    // Ocho episodios de 50: cuatro fechados en agosto, el resto sin fecha. Al
    // terminarla en septiembre, a septiembre le tocan solo los cuatro que no
    // se contaron.
    const watchedAt: Record<string, string> = {};
    for (const episode of [1, 2, 3, 4]) {
      watchedAt[`1x${episode}`] = new Date(2026, 7, episode * 2).toISOString();
    }
    const list = [
      series({
        status: 'completada',
        progress: { watched: { 1: [1, 2, 3, 4], 2: [1, 2, 3, 4] }, watchedAt },
        history: [watch(4, new Date(2026, 8, 5).toISOString())],
      }),
    ];

    const activity = monthlyActivity(list, 3, now);
    const total = activity.reduce((sum, month) => sum + month.minutes, 0);

    expect(activity.find((m) => m.key === '2026-08')?.minutes).toBe(200);
    expect(activity.find((m) => m.key === '2026-09')?.minutes).toBe(200);
    expect(total).toBe(runtimeMinutes(list[0]));
  });

  it('las películas siguen contando en el mes en que se vieron', () => {
    const list = [
      makeMedia({ runtime: 120, history: [watch(5, new Date(2026, 8, 2).toISOString())] }),
    ];
    expect(monthlyActivity(list, 1, now)[0]).toMatchObject({ titles: 1, minutes: 120 });
  });
});

describe('activityHeatmap', () => {
  const now = new Date(2026, 8, 16, 12); // miércoles

  it('arma semanas de lunes a domingo, la última es la actual', () => {
    const { weeks } = activityHeatmap([], 4, now);

    expect(weeks).toHaveLength(4);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[3][0].date).toBe('2026-09-14'); // lunes
    // Del jueves en adelante todavía no llegó.
    expect(weeks[3].map((day) => day.future)).toEqual([
      false, false, false, true, true, true, true,
    ]);
  });

  it('cuenta episodios y títulos por día, sin repetir la serie terminada ese día', () => {
    const day = new Date(2026, 8, 15, 21);
    const list = [
      makeMedia({ tmdbId: 1, runtime: 100, history: [watch(4, day.toISOString())] }),
      makeMedia({
        tmdbId: 2,
        mediaType: 'tv',
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 2 }],
        progress: {
          watched: { 1: [1, 2] },
          watchedAt: { '1x1': day.toISOString(), '1x2': day.toISOString() },
        },
        history: [watch(5, day.toISOString())],
      }),
    ];

    const heatmap = activityHeatmap(list, 1, now);
    const tuesday = heatmap.weeks[0].find((d) => d.date === '2026-09-15')!;

    // La película, más los dos episodios; la serie terminada ese mismo día ya
    // está en sus episodios.
    expect(tuesday.count).toBe(3);
    expect(heatmap.max).toBe(3);
    expect(heatmap.total).toBe(3);
  });
});

describe('lo abandonado', () => {
  const abandonedEntry = {
    ...watch(2, '2026-03-01T00:00:00.000Z', 'abandono'),
    abandoned: true,
  };

  function droppedSeries(tmdbId: number, watched: Record<number, number[]>): SavedMedia {
    return makeMedia({
      tmdbId,
      mediaType: 'tv',
      status: 'abandonada',
      runtime: 50,
      totalEpisodes: 20,
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 10 },
        { seasonNumber: 2, name: 'T2', episodeCount: 10 },
      ],
      progress: { watched },
      archive: { at: '2026-03-01T00:00:00.000Z' },
    });
  }

  it('el puntaje de abandono no es una vez que lo viste', () => {
    const media = { ...droppedSeries(1, { 1: [1, 2] }), history: [abandonedEntry] };

    expect(allWatches([media])).toHaveLength(0);
    expect(summarize([media]).totalWatches).toBe(0);
  });

  it('suma solo los episodios que llegaste a ver, no la serie entera', () => {
    const media = { ...droppedSeries(1, { 1: [1, 2] }), history: [abandonedEntry] };
    expect(totalMinutes([media])).toBe(100);
  });

  it('no cuenta como serie empezada', () => {
    expect(summarize([droppedSeries(1, { 1: [1, 2] })]).inProgress).toBe(0);
  });

  describe('abandonmentStats', () => {
    it('sin nada abandonado no hay panel', () => {
      expect(abandonmentStats([makeMedia({ history: [watch(4, '2025-01-01T00:00:00.000Z')] })])).toBeNull();
    });

    it('mide lo abandonado contra todo lo que tuvo final', () => {
      const finished = [1, 2, 3].map((id) =>
        makeMedia({ tmdbId: 10 + id, history: [watch(4, '2025-01-01T00:00:00.000Z')] }),
      );
      const stats = abandonmentStats([...finished, droppedSeries(1, { 1: [1, 2, 3] })])!;

      expect(stats.abandoned).toBe(1);
      expect(stats.finished).toBe(3);
      expect(stats.rate).toBe(0.25);
    });

    it('en qué episodio se suele dejar: la mediana, y cuántas en la primera temporada', () => {
      const stats = abandonmentStats([
        droppedSeries(1, { 1: [1, 2] }),
        droppedSeries(2, { 1: [1, 2, 3] }),
        droppedSeries(3, { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2: [1, 2] }),
        // Sin progreso no dice en qué episodio: no entra en la cuenta.
        droppedSeries(4, {}),
      ])!;

      expect(stats.seriesWithProgress).toBe(3);
      expect(stats.usualEpisode).toBe(3);
      expect(stats.inFirstSeason).toBe(2);
    });

    it('con una cantidad par, redondea el promedio de las dos del medio', () => {
      const stats = abandonmentStats([
        droppedSeries(1, { 1: [1, 2] }),
        droppedSeries(2, { 1: [1, 2, 3, 4, 5] }),
      ])!;
      expect(stats.usualEpisode).toBe(4);
    });

    it('una película abandonada cuenta para la tasa pero no para el episodio', () => {
      const stats = abandonmentStats([makeMedia({ status: 'abandonada' })])!;

      expect(stats.rate).toBe(1);
      expect(stats.usualEpisode).toBeUndefined();
    });
  });
});
