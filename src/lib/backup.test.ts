import { describe, expect, it } from 'vitest';
import {
  ImportError,
  SCHEMA_VERSION,
  buildBackup,
  mergeLibraries,
  parseBackup,
  toCsv,
} from './backup';
import { emptyPicks } from './picks';
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

describe('parseBackup', () => {
  it('acepta y migra un backup de la versión 1 del schema', () => {
    const v1 = JSON.stringify({
      app: 'que-miro',
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      media: [
        {
          ...makeMedia(),
          status: 'completada',
          review: { rating: 4, completedAt: '2024-01-01T00:00:00.000Z' },
        },
      ],
    });

    const { media } = parseBackup(v1);
    expect(media[0].history).toHaveLength(1);
    expect(media[0].history![0].rating).toBe(4);
  });

  it('lee las colecciones del backup', () => {
    const withCollections = JSON.stringify({
      app: 'que-miro',
      version: SCHEMA_VERSION,
      exportedAt: '2024-01-01T00:00:00.000Z',
      media: [],
      collections: [
        {
          id: 'abc',
          name: 'Maratón',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        { name: 'sin id' },
      ],
    });

    const { collections } = parseBackup(withCollections);
    expect(collections).toHaveLength(1);
    expect(collections[0].name).toBe('Maratón');
  });

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

  it('exporta lo archivado en el formato de Firestore, y vuelve igual', () => {
    const abandoned = makeMedia({
      status: 'abandonada',
      archive: { at: '2026-05-03T10:00:00.000Z', reason: 'No me enganchó' },
    });
    const backup = buildBackup([abandoned]);

    // Una versión vieja que importe este archivo lo deja en Viendo, no en
    // Por Ver.
    expect(backup.media[0].status).toBe('viendo');
    expect(backup.media[0].archive).toEqual({
      status: 'abandonada',
      at: '2026-05-03T10:00:00.000Z',
      reason: 'No me enganchó',
    });

    const { media } = parseBackup(JSON.stringify(backup));
    expect(media[0].status).toBe('abandonada');
    expect(media[0].archive?.reason).toBe('No me enganchó');
  });
});

describe('el cuestionario en el backup', () => {
  it('viaja con la biblioteca y vuelve entero', () => {
    const picks = {
      ...emptyPicks(),
      genres: ['Terror'],
      decade: 1990,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const backup = buildBackup([makeMedia()], [], picks);
    const parsed = parseBackup(JSON.stringify(backup));

    expect(parsed.picks).toEqual(picks);
  });

  it('en blanco no se escribe: no es una respuesta', () => {
    const backup = buildBackup([makeMedia()], [], emptyPicks());

    expect(backup.picks).toBeUndefined();
  });

  it('un backup de antes de que existiera se lee igual', () => {
    const parsed = parseBackup(serialize([makeMedia()]));

    expect(parsed.picks).toBeNull();
    expect(parsed.media).toHaveLength(1);
  });

  it('un cuestionario corrupto no voltea la importación', () => {
    const parsed = parseBackup(
      serialize([makeMedia()], { picks: 'cualquier cosa' }),
    );

    expect(parsed.picks).toBeNull();
    expect(parsed.media).toHaveLength(1);
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
        history: [
          {
            id: 'a',
            rating: 5,
            text: 'Dijo "hola" y se fue',
            completedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      }),
    ]);

    expect(csv).toContain('"Dijo ""hola"" y se fue"');
  });

  it('arranca con el BOM y la fila de encabezados', () => {
    const csv = toCsv([]);
    expect(csv.startsWith('\uFEFFtitulo,tipo,anio')).toBe(true);
  });

  it('aplana el historial y el progreso', () => {
    const csv = toCsv([
      makeMedia({
        mediaType: 'tv',
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 4 }],
        progress: { watched: { 1: [1, 2] } },
        providers: ['Netflix'],
        history: [
          { id: 'b', rating: 5, completedAt: '2025-01-01T00:00:00.000Z' },
          { id: 'a', rating: 3, completedAt: '2020-01-01T00:00:00.000Z' },
        ],
      }),
    ]);

    // Dos visionados, el puntaje del más reciente, y el progreso en porcentaje.
    expect(csv).toContain('"2","5"');
    expect(csv).toContain('"Netflix"');
    expect(csv).toContain('"50%"');
  });
});

describe('las metas en el backup', () => {
  it('viajan con la biblioteca y vuelven enteras', () => {
    const goals = {
      byYear: { '2026': { movies: 30, hours: 200 } },
      updatedAt: '2026-02-01T00:00:00.000Z',
    };

    const backup = buildBackup([makeMedia()], [], undefined, goals);
    const { goals: restored } = parseBackup(JSON.stringify(backup));

    expect(restored).toEqual(goals);
  });

  it('sin metas no se escriben, y un backup viejo vuelve sin ellas', () => {
    const backup = buildBackup([makeMedia()], [], undefined, {
      byYear: {},
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(backup).not.toHaveProperty('goals');
    expect(parseBackup(JSON.stringify(backup)).goals).toBeNull();
  });
});

describe('las suscripciones en el backup', () => {
  it('viajan con la biblioteca y vuelven enteras', () => {
    const subscriptions = {
      providers: [{ id: 8, name: 'Netflix', logoPath: '/n.png' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    };
    const backup = buildBackup([makeMedia()], [], undefined, undefined, subscriptions);

    expect(parseBackup(JSON.stringify(backup)).subscriptions).toEqual(subscriptions);
  });
});

describe('los perfiles seguidos en el backup', () => {
  it('viajan con la biblioteca y vuelven enteros', () => {
    const following = {
      profiles: [{ slug: 'ana', uid: 'uid-ana', name: 'Ana', since: '2026-03-01T00:00:00.000Z' }],
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    const backup = buildBackup([makeMedia()], [], undefined, undefined, undefined, following);

    expect(parseBackup(JSON.stringify(backup)).following).toEqual(following);
  });

  it('sin seguidos no se escriben, y un backup viejo vuelve sin ellos', () => {
    const backup = buildBackup([makeMedia()], [], undefined, undefined, undefined, {
      profiles: [],
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(backup).not.toHaveProperty('following');
    expect(parseBackup(JSON.stringify(backup)).following).toBeNull();
  });
});
