import { describe, expect, it } from 'vitest';
import { Collection, SavedMedia } from '@/types';
import {
  activityToDocument,
  buildActivity,
  decodeLibraryEntry,
  encodeLibraryEntry,
  parseActivity,
  sameActivityContent,
  summarizeReactions,
  watchingNow,
} from './activity';
import { emptySocialSettings } from './social';
import { emptyGoals } from './goals';

const NOW = new Date('2026-09-30T12:00:00.000Z');

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/matrix.jpg',
    backdropPath: null,
    releaseYear: '1999',
    genres: [],
    status: 'completada',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function build(mediaList: SavedMedia[], extra: Partial<Parameters<typeof buildActivity>[0]> = {}) {
  return buildActivity({
    uid: 'u-ana',
    mediaList,
    collections: [],
    goals: emptyGoals(),
    settings: emptySocialSettings(),
    now: NOW,
    ...extra,
  });
}

describe('buildActivity — eventos', () => {
  it('cada vez que terminaste algo es un evento, con su reseña; la segunda es "volvió a ver"', () => {
    const activity = build([
      makeMedia({
        history: [
          { id: 'b', rating: 5, text: 'Mejor la segunda', completedAt: '2026-09-20T00:00:00.000Z' },
          { id: 'a', rating: 4, completedAt: '2025-01-01T00:00:00.000Z' },
        ],
      }),
    ]);
    const completed = activity.events.filter((event) => event.kind === 'completed');
    expect(completed.map((event) => event.id)).toEqual(['c:m1:b', 'c:m1:a']);
    expect(completed[0]).toMatchObject({ rating: 5, text: 'Mejor la segunda', rewatch: true });
    expect(completed[1].rewatch).toBeUndefined();
  });

  it('un abandono sale sin el motivo', () => {
    const activity = build([
      makeMedia({
        status: 'abandonada',
        archive: { at: '2026-09-10T00:00:00.000Z', reason: 'Aburridísima, y además me la recomendó mi ex' },
        history: [{ id: 'x', rating: 2, completedAt: '2026-09-10T00:00:00.000Z', abandoned: true }],
      }),
    ]);
    const [event] = activity.events;
    expect(event).toMatchObject({ kind: 'abandoned', rating: 2 });
    expect(JSON.stringify(activity)).not.toContain('Aburridísima');
  });

  it('agrupa los episodios por día, y marca "empezó" si ese día vio el primero', () => {
    const series = makeMedia({
      tmdbId: 7,
      mediaType: 'tv',
      title: 'Severance',
      status: 'viendo',
      seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 9 }],
      progress: {
        watched: { 1: [1, 2, 3, 4] },
        watchedAt: {
          '1x1': '2026-09-01T21:00:00.000Z',
          '1x2': '2026-09-01T22:00:00.000Z',
          '1x3': '2026-09-05T21:00:00.000Z',
          '1x4': '2026-09-05T22:00:00.000Z',
        },
      },
    });
    const events = build([series]).events;
    expect(events.map((event) => event.kind)).toEqual(['progress', 'started']);
    expect(events[0]).toMatchObject({ episodes: 2, season: 1, episode: 4 });
  });

  it('los episodios que marcó terminar la serie no se cuentan dos veces', () => {
    const series = makeMedia({
      tmdbId: 7,
      mediaType: 'tv',
      history: [{ id: 'h', rating: 4, completedAt: '2026-09-10T20:00:00.000Z' }],
      progress: {
        watched: { 1: [1, 2] },
        watchedAt: { '1x1': '2026-09-10T20:00:30.000Z', '1x2': '2026-09-10T20:00:30.000Z' },
      },
    });
    expect(build([series]).events.map((event) => event.kind)).toEqual(['completed']);
  });

  it('"agregó a Por Ver" solo con fecha de alta', () => {
    const events = build([
      makeMedia({ tmdbId: 2, status: 'por_ver', addedAt: '2026-09-29T00:00:00.000Z' }),
      makeMedia({ tmdbId: 3, status: 'por_ver' }),
    ]).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'added', id: 'w:m2:2026-09-29T00:00:00.000Z' });
  });

  it('una meta cumplida se fecha con el título que la completó', () => {
    const list = [1, 2, 3].map((id) =>
      makeMedia({ tmdbId: id, history: [{ id: `h${id}`, rating: 4, completedAt: `2026-0${id}-15T00:00:00.000Z` }] }),
    );
    const events = build(list, { goals: { byYear: { '2026': { movies: 2, hours: 10 } }, updatedAt: NOW.toISOString() } }).events;
    const goal = events.find((event) => event.kind === 'goal');
    expect(goal).toMatchObject({ at: '2026-02-15T00:00:00.000Z', goal: { year: 2026, kind: 'movies', target: 2 } });
    // Las de horas no tienen un momento cierto.
    expect(events.filter((event) => event.kind === 'goal')).toHaveLength(1);
  });

  it('una lista publicada con fecha es un evento', () => {
    const collections: Collection[] = [
      { id: 'c1', name: 'Terror', createdAt: '', updatedAt: '', publicId: 'abcdefghijkl', publishedAt: '2026-09-15T00:00:00.000Z' },
      { id: 'c2', name: 'Vieja', createdAt: '', updatedAt: '', publicId: 'mnopqrstuvwx' },
    ];
    const activity = build([makeMedia({ collections: ['c1'] })], { collections });
    expect(activity.events.find((event) => event.kind === 'list')).toMatchObject({
      list: { id: 'abcdefghijkl', name: 'Terror', count: 1 },
    });
    expect(activity.lists).toHaveLength(2);
  });

  it('respeta lo que se apagó y lo que se ocultó', () => {
    const settings = emptySocialSettings();
    settings.sharing.completed = false;
    settings.sharing.library = false;
    settings.sharing.watching = false;
    const activity = build(
      [
        makeMedia({ history: [{ id: 'a', rating: 4, completedAt: '2026-09-01T00:00:00.000Z' }] }),
        makeMedia({ tmdbId: 2, status: 'por_ver', addedAt: '2026-09-02T00:00:00.000Z', hiddenFromFollowers: true }),
      ],
      { settings },
    );
    expect(activity.events).toEqual([]);
    expect(activity.library).toEqual([]);
    expect(activity.watchlist).toEqual([]);
    expect(activity.watching).toEqual([]);
  });

  it('se queda con los 50 más nuevos, sin fechas futuras', () => {
    const list = Array.from({ length: 60 }, (_, i) =>
      makeMedia({ tmdbId: i + 1, status: 'por_ver', addedAt: new Date(NOW.getTime() - i * 60_000).toISOString() }),
    );
    list.push(makeMedia({ tmdbId: 999, status: 'por_ver', addedAt: '2030-01-01T00:00:00.000Z' }));
    const events = build(list).events;
    expect(events).toHaveLength(50);
    expect(events.some((event) => event.title?.tmdbId === 999)).toBe(false);
  });
});

describe('viendo ahora y resumen', () => {
  it('solo lo tocado en dos semanas, con "T2E5" en series', () => {
    const recent = makeMedia({
      tmdbId: 7,
      mediaType: 'tv',
      status: 'viendo',
      seasons: [
        { seasonNumber: 1, name: 'T1', episodeCount: 9 },
        { seasonNumber: 2, name: 'T2', episodeCount: 9 },
      ],
      progress: { watched: { 2: [1, 5] }, lastWatchedAt: '2026-09-28T00:00:00.000Z' },
    });
    const stale = makeMedia({ tmdbId: 8, status: 'viendo', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(watchingNow([recent, stale], NOW)).toEqual([
      expect.objectContaining({ label: 'T2E5', title: expect.objectContaining({ tmdbId: 7 }) }),
    ]);
  });

  it('el resumen se codifica en texto y vuelve igual', () => {
    const entry = { tmdbId: 603, mediaType: 'movie' as const, status: 'completada' as const, rating: 4.5 };
    expect(encodeLibraryEntry(entry)).toBe('m603:c:4.5');
    expect(decodeLibraryEntry('m603:c:4.5')).toEqual(entry);
    expect(decodeLibraryEntry('t12:w')).toEqual({ tmdbId: 12, mediaType: 'tv', status: 'por_ver' });
    expect(decodeLibraryEntry('m603:c:9')).toBeNull();
    expect(decodeLibraryEntry('x')).toBeNull();
  });
});

describe('reacciones', () => {
  it('cuenta las de los eventos publicados, sin repetir a nadie', () => {
    const at = NOW.toISOString();
    const base = { reactorName: 'X', reactorHandle: 'x', at };
    const summary = summarizeReactions(
      [
        { ...base, reactor: 'a', eventId: 'e1', emoji: 'fire' },
        { ...base, reactor: 'a', eventId: 'e1', emoji: 'fire' },
        { ...base, reactor: 'b', eventId: 'e1', emoji: 'love' },
        { ...base, reactor: 'c', eventId: 'viejo', emoji: 'fire' },
      ],
      new Set(['e1']),
    );
    expect(summary).toEqual({ e1: { fire: ['a'], love: ['b'] } });
  });
});

describe('documento', () => {
  it('ida y vuelta: lo que se publica se lee igual', () => {
    const activity = build([
      makeMedia({ history: [{ id: 'a', rating: 4, text: 'Bien', tags: ['con amigos'], completedAt: '2026-09-01T00:00:00.000Z' }] }),
      makeMedia({ tmdbId: 2, status: 'por_ver', addedAt: '2026-09-02T00:00:00.000Z' }),
    ]);
    const read = parseActivity(activityToDocument(activity))!;
    expect(sameActivityContent(read, activity)).toBe(true);
  });

  it('lo roto se descarta de a uno', () => {
    const read = parseActivity({
      uid: 'u',
      events: [{ id: 'x', kind: 'hackeo', at: NOW.toISOString() }, { id: 'y', kind: 'added', at: 'ayer' }],
      library: ['m1:c', 'basura'],
      reactions: { e1: { fire: ['a', 3], script: ['b'] } },
    })!;
    expect(read.events).toEqual([]);
    expect(read.library).toHaveLength(1);
    expect(read.reactions).toEqual({ e1: { fire: ['a'] } });
    expect(parseActivity({})).toBeNull();
  });
});
