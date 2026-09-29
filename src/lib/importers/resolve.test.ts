import { describe, expect, it, vi } from 'vitest';
import { TMDbDetail } from '@/types';
import type { TitleCandidate } from '@/lib/tmdb';
import { ResolveDeps, resolveAll, resolveRecord } from './resolve';

type Query = Parameters<ResolveDeps['find']>[0];
import { ImportRecord } from './types';

function record(overrides: Partial<ImportRecord> = {}): ImportRecord {
  return { source: 'letterboxd', title: 'Past Lives', year: 2023, mediaType: 'movie', ids: {}, status: 'completada', watches: [], ...overrides };
}

const PAST_LIVES: TitleCandidate = { id: 666277, mediaType: 'movie', title: 'Vidas pasadas', originalTitle: 'Past Lives', year: 2023, posterPath: '/pl.jpg' };

describe('resolveRecord', () => {
  it('con el id de TMDB pide la ficha y no busca', async () => {
    const find = vi.fn();
    const detail = vi.fn(async () => ({ id: 95396, name: 'Severance', first_air_date: '2022-02-17', poster_path: '/s.jpg', genres: [{ id: 18, name: 'Drama' }] }) as unknown as TMDbDetail);
    const resolution = await resolveRecord(record({ source: 'trakt', mediaType: 'tv', ids: { tmdb: 95396 } }), { find, detail });

    expect(find).not.toHaveBeenCalled();
    expect(detail).toHaveBeenCalledWith(95396, 'tv');
    expect(resolution.result).toMatchObject({ kind: 'exact', candidate: { id: 95396, title: 'Severance', year: 2022, posterPath: '/s.jpg', genreIds: [18] } });
    expect(resolution.detail).toBeDefined();
  });

  it('si la ficha falla, entra igual con lo que dice el export', async () => {
    const resolution = await resolveRecord(record({ source: 'trakt', ids: { tmdb: 1 } }), {
      find: vi.fn(),
      detail: vi.fn(async () => {
        throw new Error('TMDB caído');
      }),
    });
    expect(resolution.result).toEqual({ kind: 'exact', candidate: { id: 1, mediaType: 'movie', title: 'Past Lives', year: 2023, posterPath: null } });
  });

  it('con el id de IMDb, `/find`', async () => {
    const find = vi.fn(async () => [PAST_LIVES]);
    const resolution = await resolveRecord(record({ source: 'imdb', ids: { imdb: 'tt13238346' } }), { find, detail: vi.fn() });
    expect(find).toHaveBeenCalledWith({ imdb: 'tt13238346' });
    expect(resolution.result.kind).toBe('exact');
  });

  it('por título y año; si no aparece, sin el año', async () => {
    const find = vi.fn(async (query: Query) => ('year' in query && query.year ? [] : [{ ...PAST_LIVES, year: 2024 }]));
    const resolution = await resolveRecord(record(), { find, detail: vi.fn() });
    expect(find.mock.calls.map(([query]) => query)).toEqual([
      { type: 'movie', query: 'Past Lives', year: 2023 },
      { type: 'movie', query: 'Past Lives' },
    ]);
    expect(resolution.result.kind).toBe('doubtful');
  });
});

describe('resolveAll', () => {
  it('uno que falla queda como no encontrado, sin voltear al resto', async () => {
    const find = vi.fn(async (query: Query) => {
      if ('query' in query && query.query === 'Rota') throw new Error('500');
      return [PAST_LIVES];
    });
    const progress: number[] = [];
    const resolutions = await resolveAll([record(), record({ title: 'Rota' })], { find, detail: vi.fn() }, {
      onProgress: (done) => progress.push(done),
    });
    expect(resolutions.map((resolution) => resolution.result.kind)).toEqual(['exact', 'missing']);
    expect(progress).toEqual([1, 2]);
  });
});
