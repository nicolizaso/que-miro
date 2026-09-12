import { afterEach, describe, expect, it } from 'vitest';
import { clearRescue, readRescue, saveRescue } from './rescue';
import { SavedMedia } from '@/types';

function makeMedia(tmdbId = 1): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

afterEach(() => {
  clearRescue();
});

describe('copia de rescate', () => {
  it('guarda y devuelve la biblioteca que no llegó al servidor', () => {
    saveRescue([makeMedia(1), makeMedia(2)], []);

    const rescue = readRescue();
    expect(rescue?.media).toHaveLength(2);
    expect(rescue?.savedAt).toBeTruthy();
  });

  it('no guarda nada si no había títulos', () => {
    saveRescue([], []);
    expect(readRescue()).toBeNull();
  });

  it('descarta una copia ilegible en vez de romper', () => {
    localStorage.setItem('que-miro-rescate', '{esto no es json');
    expect(readRescue()).toBeNull();
  });

  it('se limpia cuando ya cumplió', () => {
    saveRescue([makeMedia()], []);
    clearRescue();
    expect(readRescue()).toBeNull();
  });
});
