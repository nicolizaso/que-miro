import { describe, expect, it } from 'vitest';
import {
  BASE_SCORE,
  expectedScore,
  nextPair,
  ranking,
  resolveDuel,
  scoreOf,
  suggestedRounds,
} from './duel';
import { SavedMedia } from '@/types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: null,
    backdropPath: null,
    releaseYear: '1999',
    genres: [],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('scoreOf', () => {
  it('un título que nunca peleó arranca en la base', () => {
    expect(scoreOf(makeMedia())).toBe(BASE_SCORE);
  });

  it('respeta el puntaje guardado, incluso el cero', () => {
    expect(scoreOf(makeMedia({ duelScore: 0 }))).toBe(0);
  });
});

describe('expectedScore', () => {
  it('entre iguales es medio y medio', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it('el que está arriba tiene más probabilidad', () => {
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
  });

  it('las dos probabilidades suman uno', () => {
    expect(expectedScore(1400, 1200) + expectedScore(1200, 1400)).toBeCloseTo(1);
  });
});

describe('resolveDuel', () => {
  it('el ganador sube exactamente lo que baja el perdedor', () => {
    const a = makeMedia({ tmdbId: 1 });
    const b = makeMedia({ tmdbId: 2 });

    const { winner, loser } = resolveDuel(a, b);

    expect(winner.duelScore).toBeGreaterThan(BASE_SCORE);
    expect(loser.duelScore).toBeLessThan(BASE_SCORE);
    expect(winner.duelScore - BASE_SCORE).toBe(BASE_SCORE - loser.duelScore);
  });

  it('ganarle a alguien más fuerte suma más que ganarle a alguien débil', () => {
    const retador = makeMedia({ tmdbId: 1, duelScore: 1200 });
    const fuerte = makeMedia({ tmdbId: 2, duelScore: 1600 });
    const debil = makeMedia({ tmdbId: 3, duelScore: 800 });

    const contraFuerte = resolveDuel(retador, fuerte).winner.duelScore - 1200;
    const contraDebil = resolveDuel(retador, debil).winner.duelScore - 1200;

    expect(contraFuerte).toBeGreaterThan(contraDebil);
  });

  it('devuelve los ids que le tocan a cada uno', () => {
    const { winner, loser } = resolveDuel(
      makeMedia({ tmdbId: 7 }),
      makeMedia({ tmdbId: 9 }),
    );

    expect(winner.tmdbId).toBe(7);
    expect(loser.tmdbId).toBe(9);
  });
});

describe('nextPair', () => {
  it('devuelve null si no hay con quién comparar', () => {
    expect(nextPair([])).toBeNull();
    expect(nextPair([makeMedia()])).toBeNull();
  });

  it('empieza por el que menos peleó', () => {
    const pool = [
      makeMedia({ tmdbId: 1, duelCount: 5 }),
      makeMedia({ tmdbId: 2, duelCount: 0 }),
      makeMedia({ tmdbId: 3, duelCount: 3 }),
    ];

    expect(nextPair(pool, () => 0)?.[0].tmdbId).toBe(2);
  });

  it('los dos títulos del par son distintos', () => {
    const pool = [
      makeMedia({ tmdbId: 1 }),
      makeMedia({ tmdbId: 2 }),
      makeMedia({ tmdbId: 3 }),
      makeMedia({ tmdbId: 4 }),
    ];

    for (const random of [0, 0.5, 0.99]) {
      const pair = nextPair(pool, () => random)!;
      expect(pair[0].tmdbId).not.toBe(pair[1].tmdbId);
    }
  });
});

describe('ranking', () => {
  it('solo incluye los que pelearon, de mejor a peor', () => {
    const pool = [
      makeMedia({ tmdbId: 1, title: 'B', duelScore: 1300, duelCount: 2 }),
      makeMedia({ tmdbId: 2, title: 'A', duelScore: 1500, duelCount: 1 }),
      makeMedia({ tmdbId: 3, title: 'Sin pelear' }),
    ];

    expect(ranking(pool).map((m) => m.title)).toEqual(['A', 'B']);
  });
});

describe('suggestedRounds', () => {
  it('crece con la lista pero nunca pide menos de cinco', () => {
    expect(suggestedRounds(2)).toBe(5);
    expect(suggestedRounds(30)).toBe(30);
  });
});
