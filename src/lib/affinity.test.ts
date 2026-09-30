import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { LibraryEntry } from './activity';
import { MIN_COMMON, affinity, affinityLabel, seenFromLibrary } from './affinity';

function rated(tmdbId: number, rating: number): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title: `Título ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '',
    genres: [],
    status: 'completada',
    updatedAt: '2026-01-01T00:00:00.000Z',
    history: [{ id: `h${tmdbId}`, rating, completedAt: '2026-01-01T00:00:00.000Z' }],
  };
}

const entry = (tmdbId: number, rating?: number): LibraryEntry => ({
  tmdbId,
  mediaType: 'movie',
  status: 'completada',
  ...(rating ? { rating } : {}),
});

describe('affinity', () => {
  it('sin suficientes títulos puntuados en común no hay número', () => {
    const mine = [1, 2, 3, 4].map((id) => rated(id, 4));
    expect(affinity(mine, [1, 2, 3, 4].map((id) => entry(id, 4)))).toBeNull();
    expect(MIN_COMMON).toBe(5);
  });

  it('mismos puntajes es 100; siempre a una estrella, 78', () => {
    const mine = [1, 2, 3, 4, 5].map((id) => rated(id, 4));
    expect(affinity(mine, [1, 2, 3, 4, 5].map((id) => entry(id, 4)))!.percent).toBe(100);
    expect(affinity(mine, [1, 2, 3, 4, 5].map((id) => entry(id, 5)))!.percent).toBe(78);
  });

  it('lista lo que les encantó a los dos y en qué no coinciden', () => {
    const mine = [rated(1, 5), rated(2, 5), rated(3, 1), rated(4, 3), rated(5, 3), rated(6, 3)];
    const theirs = [entry(1, 5), entry(2, 4.5), entry(3, 5), entry(4, 3), entry(5, 3), entry(6)];
    const result = affinity(mine, theirs)!;
    expect(result.rated).toBe(5);
    expect(result.seenBoth).toBe(6);
    expect(result.bothLoved.map((pair) => pair.media.tmdbId)).toEqual([1, 2]);
    expect(result.disagreements.map((pair) => pair.media.tmdbId)).toEqual([3]);
  });

  it('en palabras', () => {
    expect(affinityLabel(90)).toBe('Tienen el mismo gusto');
    expect(affinityLabel(40)).toBe('Gustos distintos');
  });

  it('lo visto del otro, para ver juntos', () => {
    expect(
      seenFromLibrary([entry(1), { tmdbId: 2, mediaType: 'tv', status: 'por_ver' }, { tmdbId: 3, mediaType: 'tv', status: 'abandonada' }]),
    ).toEqual([
      { mediaType: 'movie', tmdbId: 1 },
      { mediaType: 'tv', tmdbId: 3 },
    ]);
  });
});
