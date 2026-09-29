import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  bestStreakInYear,
  doneInYear,
  emptyGoals,
  goalProgress,
  hasGoals,
  paceLabel,
  parseGoals,
  weekIndex,
  weekYear,
  weeklyStreaks,
  withYearGoal,
  yearFraction,
} from './goals';

/** Un día a las 12 del mediodía local: lejos de cualquier borde de huso. */
function day(year: number, month: number, date: number): Date {
  return new Date(year, month - 1, date, 12);
}

function movie(tmdbId: number, completedAt: Date, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title: `Película ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'completada',
    updatedAt: completedAt.toISOString(),
    runtime: 120,
    history: [{ id: `w${tmdbId}`, rating: 4, completedAt: completedAt.toISOString() }],
    ...overrides,
  };
}

/** Una serie a medias con episodios vistos en esas fechas. */
function watchingSeries(tmdbId: number, dates: Date[]): SavedMedia {
  const watchedAt: Record<string, string> = {};
  dates.forEach((date, index) => {
    watchedAt[`1x${index + 1}`] = date.toISOString();
  });
  return {
    tmdbId,
    mediaType: 'tv',
    title: `Serie ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    runtime: 60,
    seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 20 }],
    progress: {
      watched: { 1: dates.map((_, index) => index + 1) },
      watchedAt,
    },
  };
}

describe('las metas', () => {
  it('valida lo que llega: años de cuatro cifras y metas enteras dentro del tope', () => {
    const goals = parseGoals({
      byYear: {
        '2026': { movies: 50, series: 0, hours: 'muchas' },
        '2025': { hours: 300 },
        veinte: { movies: 3 },
        '2024': { movies: 5000 },
      },
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(goals.byYear).toEqual({ '2026': { movies: 50 }, '2025': { hours: 300 } });
    expect(goals.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('algo roto es "sin metas"', () => {
    expect(parseGoals(null)).toEqual(emptyGoals());
    expect(hasGoals(parseGoals({ byYear: 'x' }))).toBe(false);
  });

  it('cambiar la meta de un año no toca las otras, y vaciarla la borra', () => {
    const now = day(2026, 3, 1);
    const base = withYearGoal(emptyGoals(), 2025, { movies: 20 }, now);
    const both = withYearGoal(base, 2026, { movies: 30, hours: 200 }, now);

    expect(both.byYear).toEqual({ '2025': { movies: 20 }, '2026': { movies: 30, hours: 200 } });
    expect(both.updatedAt).toBe(now.toISOString());
    expect(withYearGoal(both, 2026, {}, now).byYear).toEqual({ '2025': { movies: 20 } });
  });
});

describe('el progreso de la meta', () => {
  it('cuenta solo lo del año: el cambio de año arranca de cero', () => {
    const list = [
      movie(1, day(2025, 12, 31)),
      movie(2, day(2026, 1, 1)),
      movie(3, day(2026, 6, 15)),
    ];

    expect(doneInYear(list, 2025).movies).toBe(1);
    expect(doneInYear(list, 2026).movies).toBe(2);
    expect(doneInYear(list, 2027).movies).toBe(0);
  });

  it('mide contra el ritmo: a mitad de año, la mitad de la meta', () => {
    const goals = withYearGoal(emptyGoals(), 2026, { movies: 20 });
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((id) =>
      movie(id, day(2026, 2, id)),
    );

    const [progress] = goalProgress(list, goals, 2026, day(2026, 7, 2));
    expect(progress.done).toBe(13);
    expect(progress.expected).toBeCloseTo(10, 0);
    expect(paceLabel(progress)).toBe('Vas 3 películas arriba del ritmo.');
  });

  it('dice cuándo vas abajo, al ritmo o ya cumpliste', () => {
    const goals = withYearGoal(emptyGoals(), 2026, { series: 4, movies: 1 });
    const list = [movie(1, day(2026, 1, 10))];

    const [movies, series] = goalProgress(list, goals, 2026, day(2026, 12, 31));
    expect(movies.met).toBe(true);
    expect(paceLabel(movies)).toBe('Cumpliste: 1 película.');
    expect(paceLabel(series)).toBe('Vas 4 series abajo del ritmo.');

    const [, fresh] = goalProgress([], goals, 2026, day(2026, 1, 1));
    expect(paceLabel(fresh)).toBe('Vas justo al ritmo.');
  });

  it('el año que viene todavía no empezó y el pasado ya terminó', () => {
    expect(yearFraction(2027, day(2026, 9, 29))).toBe(0);
    expect(yearFraction(2025, day(2026, 9, 29))).toBe(1);
  });

  it('las horas salen de los episodios con fecha de ese año', () => {
    const list = [watchingSeries(1, [day(2025, 12, 30), day(2026, 1, 2), day(2026, 1, 3)])];
    expect(doneInYear(list, 2026).hours).toBe(2);
  });

  it('con la biblioteca vacía no hay nada hecho, y sin meta no hay progreso', () => {
    expect(doneInYear([], 2026)).toEqual({ movies: 0, series: 0, hours: 0 });
    expect(goalProgress([], emptyGoals(), 2026)).toEqual([]);
  });
});

describe('las semanas', () => {
  it('van de lunes a domingo, crucen o no un mes', () => {
    // Domingo 31 de agosto y lunes 1 de septiembre de 2025: semanas seguidas.
    expect(weekIndex(day(2025, 9, 1)) - weekIndex(day(2025, 8, 31))).toBe(1);
    // Viernes 29 de agosto y martes 2 de septiembre: también.
    expect(weekIndex(day(2025, 9, 2)) - weekIndex(day(2025, 8, 29))).toBe(1);
    // Sábado 30 y domingo 31 de agosto: la misma.
    expect(weekIndex(day(2025, 8, 31))).toBe(weekIndex(day(2025, 8, 30)));
  });

  it('el año de una semana es el de su jueves', () => {
    // El lunes 29 de diciembre de 2025 ya es la semana 1 de 2026.
    expect(weekYear(weekIndex(day(2025, 12, 29)))).toBe(2026);
    expect(weekYear(weekIndex(day(2025, 12, 28)))).toBe(2025);
  });

  it('la semana es la del reloj de acá, no la de UTC', () => {
    // Domingo a las 23:30: sigue siendo domingo, pase lo que pase en Greenwich.
    const lateSunday = new Date(2025, 7, 31, 23, 30);
    expect(weekIndex(lateSunday)).toBe(weekIndex(day(2025, 8, 31)));
  });
});

describe('la racha semanal', () => {
  const NOW = day(2026, 9, 30); // un miércoles

  it('con la biblioteca vacía no hay racha', () => {
    expect(weeklyStreaks([], NOW)).toEqual({ current: 0, best: 0, activeThisWeek: false });
  });

  it('cuenta semanas seguidas hasta esta, cruzando el cambio de mes', () => {
    const list = [
      movie(1, day(2026, 9, 17)),
      movie(2, day(2026, 9, 22)),
      watchingSeries(3, [day(2026, 9, 29)]),
    ];
    expect(weeklyStreaks(list, NOW)).toEqual({ current: 3, best: 3, activeThisWeek: true });
  });

  it('una semana que todavía no arrancó no corta la racha', () => {
    const list = [movie(1, day(2026, 9, 17)), movie(2, day(2026, 9, 22))];
    expect(weeklyStreaks(list, NOW)).toMatchObject({ current: 2, activeThisWeek: false });
  });

  it('una semana entera sin nada sí la corta, y la mejor queda', () => {
    const list = [
      movie(1, day(2026, 8, 3)),
      movie(2, day(2026, 8, 10)),
      movie(3, day(2026, 8, 17)),
      movie(4, day(2026, 9, 15)),
    ];
    expect(weeklyStreaks(list, NOW)).toEqual({ current: 0, best: 3, activeThisWeek: false });
  });

  it('la mejor racha del año no cuenta las semanas del año anterior', () => {
    const list = [
      movie(1, day(2025, 12, 15)),
      movie(2, day(2025, 12, 22)),
      movie(3, day(2026, 1, 5)),
      movie(4, day(2026, 1, 12)),
    ];
    // La del 29 de diciembre no tiene nada: la racha de fin de 2025 no sigue.
    expect(bestStreakInYear(list, 2026)).toBe(2);
    expect(bestStreakInYear(list, 2025)).toBe(2);
  });
});
