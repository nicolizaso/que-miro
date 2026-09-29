import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  MAX_WATCHLIST,
  WatchlistItem,
  crossWatchlists,
  parseWatchlist,
  publicWatchlist,
  sharedPlatforms,
  sourceLabel,
} from './together';

function media(tmdbId: number, title: string, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: ['Drama'],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(tmdbId: number, title: string, overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return { tmdbId, mediaType: 'movie', title, posterPath: null, releaseYear: '2020', genres: ['Drama'], ...overrides };
}

describe('publicWatchlist', () => {
  it('publica solo el Por Ver, con lo justo para filtrar', () => {
    const list = publicWatchlist([
      media(1, 'Past Lives', { runtime: 106, streaming: ['MUBI'], history: [{ id: 'w', rating: 5, completedAt: '' }] }),
      media(2, 'Vista', { status: 'completada' }),
    ]);
    expect(list).toEqual([
      { tmdbId: 1, mediaType: 'movie', title: 'Past Lives', posterPath: null, releaseYear: '2020', genres: ['Drama'], runtime: 106, streaming: ['MUBI'] },
    ]);
  });

  it('con tope', () => {
    const many = Array.from({ length: MAX_WATCHLIST + 10 }, (_, index) => media(index + 1, `T${index}`));
    expect(publicWatchlist(many)).toHaveLength(MAX_WATCHLIST);
  });

  it('se lee sin confiar: sin publicar es `undefined`, lo roto se descarta', () => {
    expect(parseWatchlist(undefined)).toBeUndefined();
    expect(parseWatchlist([item(1, 'Bien'), { tmdbId: 2 }, { tmdbId: 3, mediaType: 'libro', title: 'No' }])).toEqual([
      item(1, 'Bien'),
    ]);
  });
});

describe('crossWatchlists', () => {
  const mine = [
    media(1, 'Past Lives'),
    media(2, 'Aftersun'),
    media(3, 'Dune', { status: 'completada' }),
    media(4, 'Babylon', { status: 'abandonada' }),
    media(5, 'Solo mía, pero ella ya la vio'),
    media(10, 'The Bear', { mediaType: 'tv' }),
  ];
  const theirs = {
    watchlist: [
      item(1, 'Past Lives'),
      item(3, 'Dune'),
      item(4, 'Babylon'),
      item(6, 'Anatomía de una caída', { runtime: 151 }),
      item(10, 'The Bear película que no existe'),
    ],
    seen: [{ mediaType: 'movie' as const, tmdbId: 5 }, { tmdbId: 2 }],
  };

  const cross = crossWatchlists(mine, theirs);

  it('primero lo de los dos, después lo que uno tiene y el otro no vio', () => {
    expect(cross.map(({ media: m, source }) => `${source}: ${m.title}`)).toEqual([
      'both: Past Lives',
      'mine: Aftersun',
      'theirs: Anatomía de una caída',
      'mine: The Bear',
      'theirs: The Bear película que no existe',
    ]);
  });

  it('descarta lo que alguno completó o abandonó', () => {
    const titles = cross.map(({ media: m }) => m.title);
    expect(titles).not.toContain('Dune');
    expect(titles).not.toContain('Babylon');
    expect(titles).not.toContain('Solo mía, pero ella ya la vio');
  });

  it('una película y una serie con el mismo id no son lo mismo', () => {
    expect(cross.filter(({ media: m }) => m.tmdbId === 10)).toHaveLength(2);
  });

  it('lo de la otra persona entra como título de Por Ver, con su duración', () => {
    const anatomy = cross.find(({ media: m }) => m.tmdbId === 6)!.media;
    expect(anatomy).toMatchObject({ status: 'por_ver', runtime: 151, mediaType: 'movie' });
  });
});

describe('lo demás', () => {
  it('las plataformas de los dos', () => {
    expect(sharedPlatforms(new Set(['netflix', 'max']), ['Netflix', ' Disney Plus '])).toEqual(new Set(['netflix']));
  });

  it('de dónde sale cada uno', () => {
    expect(sourceLabel('both', 'Ana')).toBe('Los dos la tienen en Por Ver');
    expect(sourceLabel('theirs', 'Ana')).toBe('En el Por Ver de Ana');
  });
});
