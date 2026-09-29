import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { REFRESH_PER_VISIT, refreshPriority, refreshQueue } from './refresh';

const NOW = new Date(2026, 8, 15, 12);
const DAY = 24 * 60 * 60 * 1000;

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Algo',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'completada',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Un título con la ficha pedida hace `days` días, para Argentina. */
function enrichedDaysAgo(days: number, overrides: Partial<SavedMedia> = {}) {
  return makeMedia({
    providerRegion: 'AR',
    enrichedRegion: 'AR',
    enrichedLanguage: 'es-MX',
    enrichedAt: new Date(NOW.getTime() - days * DAY).toISOString(),
    streaming: [],
    ...overrides,
  });
}

describe('refreshPriority', () => {
  it('lo que estás viendo va primero', () => {
    expect(refreshPriority(makeMedia({ status: 'viendo', mediaType: 'tv' }))).toBe(0);
  });

  it('después las series que siguen saliendo, estén donde estén', () => {
    const terminadaEnEmision = makeMedia({
      mediaType: 'tv',
      status: 'completada',
      seriesStatus: 'Returning Series',
    });
    const conProximoEpisodio = makeMedia({
      mediaType: 'tv',
      status: 'por_ver',
      nextToAir: { seasonNumber: 1, episodeNumber: 1, airDate: '2026-10-01' },
    });

    expect(refreshPriority(terminadaEnEmision)).toBe(1);
    expect(refreshPriority(conProximoEpisodio)).toBe(1);
  });

  it('después Por Ver, y al final todo lo demás', () => {
    expect(refreshPriority(makeMedia({ status: 'por_ver' }))).toBe(2);
    expect(refreshPriority(makeMedia({ status: 'completada' }))).toBe(3);
    expect(
      refreshPriority(
        makeMedia({ mediaType: 'tv', status: 'completada', seriesStatus: 'Ended' }),
      ),
    ).toBe(3);
  });
});

describe('refreshQueue', () => {
  it('solo entra lo vencido', () => {
    const fresh = enrichedDaysAgo(1, { tmdbId: 1 });
    const stale = enrichedDaysAgo(60, { tmdbId: 2 });

    expect(refreshQueue([fresh, stale], 'AR', NOW).map((m) => m.tmdbId)).toEqual([2]);
  });

  it('ordena por urgencia: viendo, en emisión, por ver, el resto', () => {
    const list = [
      makeMedia({ tmdbId: 1, status: 'completada' }),
      makeMedia({ tmdbId: 2, status: 'por_ver' }),
      enrichedDaysAgo(5, {
        tmdbId: 3,
        mediaType: 'tv',
        status: 'completada',
        seriesStatus: 'Returning Series',
      }),
      makeMedia({ tmdbId: 4, status: 'viendo', mediaType: 'tv' }),
    ];

    expect(refreshQueue(list, 'AR', NOW).map((m) => m.tmdbId)).toEqual([4, 3, 2, 1]);
  });

  it('entre dos igual de urgentes, primero el que hace más que no se pide', () => {
    const list = [
      enrichedDaysAgo(40, { tmdbId: 1, status: 'por_ver' }),
      makeMedia({ tmdbId: 2, status: 'por_ver' }),
      enrichedDaysAgo(90, { tmdbId: 3, status: 'por_ver' }),
    ];

    // El que nunca se pidió es el más viejo de todos.
    expect(refreshQueue(list, 'AR', NOW).map((m) => m.tmdbId)).toEqual([2, 3, 1]);
  });

  it('respeta el tope por visita', () => {
    const list = Array.from({ length: REFRESH_PER_VISIT + 5 }, (_, index) =>
      makeMedia({ tmdbId: index + 1 }),
    );

    expect(refreshQueue(list, 'AR', NOW)).toHaveLength(REFRESH_PER_VISIT);
    expect(refreshQueue(list, 'AR', NOW, 2)).toHaveLength(2);
  });

  it('cambiar de país vence todo', () => {
    const list = [enrichedDaysAgo(1, { tmdbId: 1 }), enrichedDaysAgo(1, { tmdbId: 2 })];

    expect(refreshQueue(list, 'AR', NOW)).toHaveLength(0);
    expect(refreshQueue(list, 'MX', NOW)).toHaveLength(2);
  });

  it('con la biblioteca vacía no hay nada que hacer', () => {
    expect(refreshQueue([], 'AR', NOW)).toEqual([]);
  });
});

describe('lo abandonado', () => {
  it('se refresca último, detrás de todo lo demás', () => {
    const dropped = makeMedia({ status: 'abandonada', mediaType: 'tv', seriesStatus: 'Returning Series' });
    const other = makeMedia({ status: 'completada' });

    expect(refreshPriority(dropped)).toBeGreaterThan(refreshPriority(other));
  });
});
