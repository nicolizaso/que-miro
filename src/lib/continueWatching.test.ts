import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { CONTINUE_LIMIT, continueWatching } from './continueWatching';

function series(tmdbId: number, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'tv',
    title: `Serie ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    seasons: [
      { seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 },
      { seasonNumber: 2, name: 'Temporada 2', episodeCount: 10 },
    ],
    ...overrides,
  };
}

function watchedAt(iso: string, watched: Record<number, number[]>) {
  return { watched, lastWatchedAt: iso };
}

const TODA_T1 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('continueWatching', () => {
  it('trae cada serie de Viendo con el episodio que toca', () => {
    const [item] = continueWatching([
      series(1, { progress: watchedAt('2026-09-01T00:00:00Z', { 1: TODA_T1, 2: [1, 2, 3] }) }),
    ]);

    expect(item.media.tmdbId).toBe(1);
    expect(item.next).toEqual({ seasonNumber: 2, episode: 4 });
  });

  it('ordena por la última que miraste, la más reciente primero', () => {
    const list = [
      series(1, { progress: watchedAt('2026-09-01T00:00:00Z', { 1: [1] }) }),
      series(2, { progress: watchedAt('2026-09-10T00:00:00Z', { 1: [1] }) }),
      series(3, { progress: watchedAt('2026-08-01T00:00:00Z', { 1: [1] }) }),
    ];

    expect(continueWatching(list).map((item) => item.media.tmdbId)).toEqual([2, 1, 3]);
  });

  it('una de Viendo sin nada marcado arranca por el primero', () => {
    expect(continueWatching([series(1)])[0].next).toEqual({ seasonNumber: 1, episode: 1 });
  });

  it('una al día no tiene nada que retomar', () => {
    const alDia = series(1, {
      seriesStatus: 'Returning Series',
      lastAired: { seasonNumber: 2, episodeNumber: 3, airDate: '2026-09-10' },
      progress: watchedAt('2026-09-11T00:00:00Z', { 1: TODA_T1, 2: [1, 2, 3] }),
    });

    expect(continueWatching([alDia])).toEqual([]);
  });

  it('suma las terminadas que estrenaron episodios, estén donde estén', () => {
    const conNovedades = series(1, {
      status: 'completada',
      progress: watchedAt('2026-05-01T00:00:00Z', { 1: TODA_T1 }),
      newEpisodesSince: {
        seasonNumber: 2,
        episodeNumber: 1,
        detectedAt: '2026-09-01T00:00:00Z',
      },
    });

    expect(continueWatching([conNovedades])[0].next).toEqual({
      seasonNumber: 2,
      episode: 1,
    });
  });

  it('deja afuera películas, lo que está por ver y lo terminado sin novedades', () => {
    const list = [
      series(1, { mediaType: 'movie' }),
      series(2, { status: 'por_ver' }),
      series(3, { status: 'completada', progress: watchedAt('2026-01-01T00:00:00Z', { 1: [1] }) }),
    ];

    expect(continueWatching(list)).toEqual([]);
  });

  it('tiene tope', () => {
    const list = Array.from({ length: CONTINUE_LIMIT + 3 }, (_, index) => series(index + 1));
    expect(continueWatching(list)).toHaveLength(CONTINUE_LIMIT);
  });
});
