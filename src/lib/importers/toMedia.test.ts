import { describe, expect, it } from 'vitest';
import { SavedMedia, TMDbDetail } from '@/types';
import { mergeImported, mergeIntoLibrary, recordToMedia } from './toMedia';
import { Candidate } from './match';
import { ImportRecord } from './types';

const NOW = new Date('2026-09-29T12:00:00.000Z');

const PAST_LIVES: Candidate = {
  id: 666277,
  mediaType: 'movie',
  title: 'Vidas pasadas',
  originalTitle: 'Past Lives',
  year: 2023,
  posterPath: '/pl.jpg',
  backdropPath: '/pl-b.jpg',
  genreIds: [18, 10749],
};

function record(overrides: Partial<ImportRecord> = {}): ImportRecord {
  return {
    source: 'letterboxd',
    title: 'Past Lives',
    year: 2023,
    mediaType: 'movie',
    ids: {},
    status: 'completada',
    watches: [
      { date: '2024-01-02', rating: 5 },
      { date: '2023-05-14', rating: 4.5, text: 'Hermosa.', tags: ['cine'] },
      { date: '2023-01-01' },
    ],
    ...overrides,
  };
}

describe('recordToMedia', () => {
  it('cada vez con puntaje es una entrada del historial; sin puntaje, no', () => {
    const media = recordToMedia({ record: record(), candidate: PAST_LIVES }, { now: NOW })!;
    expect(media).toMatchObject({
      tmdbId: 666277,
      mediaType: 'movie',
      title: 'Vidas pasadas',
      posterPath: '/pl.jpg',
      releaseYear: '2023',
      status: 'completada',
    });
    expect(media.genres.length).toBeGreaterThan(0);
    expect(media.history?.map((entry) => [entry.completedAt, entry.rating, entry.text])).toEqual([
      ['2024-01-02T12:00:00.000Z', 5, undefined],
      ['2023-05-14T12:00:00.000Z', 4.5, 'Hermosa.'],
    ]);
  });

  it('lo que está para ver entra a Por Ver, sin historial', () => {
    const media = recordToMedia({ record: record({ status: 'por_ver', watches: [] }), candidate: PAST_LIVES }, { now: NOW })!;
    expect(media.status).toBe('por_ver');
    expect(media.history ?? []).toEqual([]);
  });

  describe('una serie con episodios', () => {
    const severance: Candidate = { id: 95396, mediaType: 'tv', title: 'Severance', year: 2022, posterPath: null };
    const traktRecord = record({
      source: 'trakt',
      title: 'Severance',
      mediaType: 'tv',
      status: 'viendo',
      watches: [{ date: '2025-01-01', rating: 5 }],
      episodes: [
        { season: 1, episode: 1, watchedAt: '2022-02-20T03:00:00.000Z' },
        { season: 1, episode: 2 },
      ],
    });

    function detail(overrides: Partial<TMDbDetail> = {}): TMDbDetail {
      return {
        id: 95396,
        name: 'Severance',
        overview: '',
        poster_path: '/sev.jpg',
        backdrop_path: null,
        genres: [{ id: 18, name: 'Drama' }],
        seasons: [{ season_number: 1, episode_count: 2, name: 'Temporada 1' }],
        number_of_episodes: 2,
        status: 'Ended',
        ...overrides,
      } as TMDbDetail;
    }

    it('a medio ver sigue en Viendo, con su progreso y sin el puntaje de la serie', () => {
      const media = recordToMedia({ record: traktRecord, candidate: severance }, { now: NOW })!;
      expect(media.status).toBe('viendo');
      expect(media.progress?.watched).toEqual({ 1: [1, 2] });
      expect(media.progress?.watchedAt).toEqual({ '1x1': '2022-02-20T03:00:00.000Z' });
      expect(media.history ?? []).toEqual([]);
    });

    it('con la ficha: si la vio entera y terminó, completada con su puntaje y su póster', () => {
      const media = recordToMedia({ record: traktRecord, candidate: severance, detail: detail() }, { now: NOW })!;
      expect(media.status).toBe('completada');
      expect(media.posterPath).toBe('/sev.jpg');
      expect(media.history?.[0].rating).toBe(5);
    });

    it('si sigue saliendo, sigue en Viendo aunque esté al día', () => {
      const airing = detail({ status: 'Returning Series' });
      const media = recordToMedia({ record: traktRecord, candidate: severance, detail: airing }, { now: NOW })!;
      expect(media.status).toBe('viendo');
    });
  });
});

function library(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 666277,
    mediaType: 'movie',
    title: 'Vidas pasadas',
    posterPath: '/pl.jpg',
    backdropPath: null,
    releaseYear: '2023',
    genres: ['Drama'],
    status: 'por_ver',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sobre lo que ya está en la biblioteca', () => {
  const imported = recordToMedia({ record: record(), candidate: PAST_LIVES }, { now: NOW })!;

  it('lo que no estaba entra entero', () => {
    expect(mergeIntoLibrary(undefined, imported, NOW)).toBe(imported);
  });

  it('suma lo visto a lo que estaba en Por Ver', () => {
    const merged = mergeIntoLibrary(library(), imported, NOW)!;
    expect(merged.status).toBe('completada');
    expect(merged.history).toHaveLength(2);
    expect(merged.updatedAt).toBe(NOW.toISOString());
  });

  it('no duplica una vez que ya estaba, ni pisa la reseña de acá', () => {
    const existing = library({
      status: 'completada',
      history: [{ id: 'mia', rating: 5, text: 'La mía.', completedAt: '2024-01-02T20:00:00.000Z' }],
    });
    const merged = mergeIntoLibrary(existing, imported, NOW)!;
    expect(merged.history?.map((entry) => entry.text ?? null)).toEqual(['La mía.', 'Hermosa.']);
  });

  it('si no cambia nada, no hay que escribir', () => {
    const same = library({ status: 'completada', history: imported.history });
    expect(mergeIntoLibrary(same, imported, NOW)).toBeNull();
    expect(mergeIntoLibrary(library({ status: 'viendo' }), { ...imported, status: 'por_ver', history: undefined }, NOW)).toBeNull();
  });

  it('abandonada se respeta, salvo que el export diga que la terminaste', () => {
    const abandoned = library({ status: 'abandonada', archive: { at: '2025-01-01T00:00:00.000Z' } });
    expect(mergeIntoLibrary(abandoned, { ...imported, status: 'por_ver', history: undefined }, NOW)).toBeNull();
    expect(mergeIntoLibrary(abandoned, imported, NOW)?.status).toBe('completada');
  });

  it('el mismo título de dos exports es uno, con todas sus veces', () => {
    const fromImdb = recordToMedia(
      { record: record({ source: 'imdb', watches: [{ date: '2024-03-03', rating: 4 }] }), candidate: PAST_LIVES },
      { now: NOW },
    )!;
    expect(mergeImported(imported, fromImdb).history).toHaveLength(3);
  });
});
