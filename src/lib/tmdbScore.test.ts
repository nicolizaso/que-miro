import { describe, expect, it } from 'vitest';
import { MIN_SCORE_VOTES, formatTmdbScore } from '@/lib/tmdbScore';

describe('formatTmdbScore', () => {
  it('un decimal, con coma', () => {
    expect(formatTmdbScore(7.843, 1200)).toBe('7,8');
    expect(formatTmdbScore(8, 1200)).toBe('8,0');
  });

  it('con pocos votos no se muestra', () => {
    expect(formatTmdbScore(10, 2)).toBeNull();
    expect(formatTmdbScore(7.5, MIN_SCORE_VOTES - 1)).toBeNull();
    expect(formatTmdbScore(7.5, MIN_SCORE_VOTES)).toBe('7,5');
  });

  it('sin puntaje, o con uno roto, no se muestra', () => {
    expect(formatTmdbScore(undefined, 500)).toBeNull();
    expect(formatTmdbScore(0, 500)).toBeNull();
    expect(formatTmdbScore(Number.NaN, 500)).toBeNull();
    expect(formatTmdbScore(7, undefined)).toBeNull();
  });
});
