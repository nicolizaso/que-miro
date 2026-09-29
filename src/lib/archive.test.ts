import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  PAUSE_SUGGESTION_DAYS,
  idleLabel,
  isArchivedStatus,
  isListStatus,
  pauseSuggestion,
} from './archive';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function series(tmdbId: number, idleDays: number, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'tv',
    title: `Serie ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'viendo',
    updatedAt: daysAgo(idleDays + 30),
    progress: { watched: { 1: [1, 2] }, lastWatchedAt: daysAgo(idleDays) },
    ...overrides,
  };
}

describe('los estados', () => {
  it('distingue las listas de siempre de lo archivado', () => {
    expect(isListStatus('viendo')).toBe(true);
    expect(isListStatus('en_pausa')).toBe(false);
    expect(isArchivedStatus('abandonada')).toBe(true);
    expect(isArchivedStatus('por_ver')).toBe(false);
    expect(isArchivedStatus(undefined)).toBe(false);
  });
});

describe('pauseSuggestion', () => {
  it('pregunta por una serie de Viendo que pasó los dos meses sin avance', () => {
    const quiet = series(1, PAUSE_SUGGESTION_DAYS + 1);
    expect(pauseSuggestion([quiet, series(2, 3)], {}, NOW)).toBe(quiet);
  });

  it('antes de los dos meses no dice nada', () => {
    expect(pauseSuggestion([series(1, PAUSE_SUGGESTION_DAYS - 1)], {}, NOW)).toBeNull();
  });

  it('de a una: la que lleva más tiempo quieta', () => {
    const older = series(1, 200);
    expect(pauseSuggestion([series(2, 90), older, series(3, 70)], {}, NOW)).toBe(older);
  });

  it('solo series en Viendo: ni películas, ni otras listas, ni lo ya archivado', () => {
    const list = [
      series(1, 100, { mediaType: 'movie' }),
      series(2, 100, { status: 'por_ver' }),
      series(3, 100, { status: 'en_pausa' }),
      series(4, 100, { status: 'abandonada' }),
    ];
    expect(pauseSuggestion(list, {}, NOW)).toBeNull();
  });

  it('sin episodios marcados cuenta desde el último cambio', () => {
    const untouched = series(1, 0, { progress: undefined, updatedAt: daysAgo(90) });
    expect(pauseSuggestion([untouched], {}, NOW)).toBe(untouched);
  });

  it('decir que no la calla, hasta que haya movimiento y vuelvan a pasar los dos meses', () => {
    const quiet = series(1, 100);
    expect(pauseSuggestion([quiet], { 1: daysAgo(10) }, NOW)).toBeNull();

    // El "no" es de antes del último episodio: ya no vale.
    const movedSince = series(1, 70);
    expect(pauseSuggestion([movedSince], { 1: daysAgo(90) }, NOW)).toBe(movedSince);
  });
});

describe('idleLabel', () => {
  it('habla en días, meses o "más de un año"', () => {
    expect(idleLabel(series(1, 45), NOW)).toBe('45 días');
    expect(idleLabel(series(1, 95), NOW)).toBe('3 meses');
    expect(idleLabel(series(1, 400), NOW)).toBe('más de un año');
  });
});
