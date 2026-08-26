import { describe, expect, it } from 'vitest';
import {
  ImportError,
  SCHEMA_VERSION,
  buildBackup,
  mergeLibraries,
  parseBackup,
  parseMediaEntry,
  toCsv,
} from './backup';
import { SavedMedia } from '@/types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/poster.jpg',
    backdropPath: null,
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function serialize(media: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app: 'que-miro',
    version: SCHEMA_VERSION,
    exportedAt: '2024-01-01T00:00:00.000Z',
    media,
    ...overrides,
  });
}

describe('parseMediaEntry', () => {
  it('acepta un título bien formado', () => {
    expect(parseMediaEntry(makeMedia())?.title).toBe('Matrix');
  });

  it('descarta lo que no tiene id, tipo o título válidos', () => {
    expect(parseMediaEntry(null)).toBeNull();
    expect(parseMediaEntry({ ...makeMedia(), tmdbId: 'abc' })).toBeNull();
    expect(parseMediaEntry({ ...makeMedia(), tmdbId: -3 })).toBeNull();
    expect(parseMediaEntry({ ...makeMedia(), mediaType: 'libro' })).toBeNull();
    expect(parseMediaEntry({ ...makeMedia(), title: '   ' })).toBeNull();
  });

  it('cae en valores por defecto cuando un campo opcional viene mal', () => {
    const parsed = parseMediaEntry({
      ...makeMedia(),
      status: 'inventado',
      genres: ['Drama', 42],
      posterPath: 12,
    });

    expect(parsed?.status).toBe('por_ver');
    expect(parsed?.genres).toEqual(['Drama']);
    expect(parsed?.posterPath).toBeNull();
  });

  it('marca como completada cualquier entrada que traiga reseña', () => {
    const parsed = parseMediaEntry(
      makeMedia({
        status: 'por_ver',
        review: { rating: 4, completedAt: '2024-02-01T00:00:00.000Z' },
      }),
    );

    expect(parsed?.status).toBe('completada');
    expect(parsed?.review?.rating).toBe(4);
  });

  it('ignora una reseña con puntaje fuera de rango', () => {
    const parsed = parseMediaEntry(
      makeMedia({
        review: { rating: 42, completedAt: '2024-02-01T00:00:00.000Z' },
      }),
    );

    expect(parsed?.review).toBeUndefined();
  });
});

describe('parseBackup', () => {
  it('lee un backup válido', () => {
    const { media, skipped } = parseBackup(serialize([makeMedia()]));
    expect(media).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('cuenta las entradas corruptas en vez de fallar', () => {
    const { media, skipped } = parseBackup(
      serialize([makeMedia(), { basura: true }, null]),
    );

    expect(media).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('rechaza un JSON inválido', () => {
    expect(() => parseBackup('{ no es json')).toThrow(ImportError);
  });

  it('rechaza un archivo que no es de la app', () => {
    expect(() => parseBackup(JSON.stringify({ media: [] }))).toThrow(ImportError);
  });

  it('rechaza un backup de una versión más nueva', () => {
    expect(() =>
      parseBackup(serialize([], { version: SCHEMA_VERSION + 1 })),
    ).toThrow(/versión más nueva/);
  });

  it('lee lo que exporta buildBackup', () => {
    const backup = buildBackup([makeMedia()]);
    const { media } = parseBackup(JSON.stringify(backup));
    expect(media[0].tmdbId).toBe(1);
  });
});

describe('mergeLibraries', () => {
  it('suma los títulos que no estaban', () => {
    const result = mergeLibraries(
      [makeMedia({ tmdbId: 1 })],
      [makeMedia({ tmdbId: 2, title: 'Alien' })],
    );

    expect(result.media).toHaveLength(2);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('ante un repetido gana el modificado más tarde', () => {
    const result = mergeLibraries(
      [makeMedia({ updatedAt: '2024-01-01T00:00:00.000Z', status: 'por_ver' })],
      [makeMedia({ updatedAt: '2024-06-01T00:00:00.000Z', status: 'viendo' })],
    );

    expect(result.media[0].status).toBe('viendo');
    expect(result.updated).toBe(1);
  });

  it('no pisa un título más nuevo con uno viejo del backup', () => {
    const result = mergeLibraries(
      [makeMedia({ updatedAt: '2024-06-01T00:00:00.000Z', status: 'viendo' })],
      [makeMedia({ updatedAt: '2024-01-01T00:00:00.000Z', status: 'por_ver' })],
    );

    expect(result.media[0].status).toBe('viendo');
    expect(result.updated).toBe(0);
  });
});

describe('toCsv', () => {
  it('escapa las comillas del comentario', () => {
    const csv = toCsv([
      makeMedia({
        review: {
          rating: 5,
          text: 'Dijo "hola" y se fue',
          completedAt: '2024-01-01T00:00:00.000Z',
        },
      }),
    ]);

    expect(csv).toContain('"Dijo ""hola"" y se fue"');
  });

  it('arranca con el BOM y la fila de encabezados', () => {
    const csv = toCsv([]);
    expect(csv.startsWith('\uFEFFtitulo,tipo,anio')).toBe(true);
  });
});
