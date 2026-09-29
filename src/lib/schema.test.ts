import { describe, expect, it } from 'vitest';
import {
  latestRating,
  latestWatch,
  parseCollection,
  parseMedia,
  parseMediaList,
  watchCount,
} from './schema';

/** Un título tal como lo guardaba la v1 del schema: con un `review` suelto. */
function v1Media(overrides: Record<string, unknown> = {}) {
  return {
    tmdbId: 603,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/poster.jpg',
    backdropPath: null,
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'completada',
    updatedAt: '2024-01-01T00:00:00.000Z',
    review: {
      rating: 4.5,
      text: 'Un clásico.',
      completedAt: '2024-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('parseMedia — migración de v1 a v2', () => {
  it('convierte el review único en la primera entrada del historial', () => {
    const media = parseMedia(v1Media())!;

    expect(media.history).toHaveLength(1);
    expect(media.history![0].rating).toBe(4.5);
    expect(media.history![0].text).toBe('Un clásico.');
    expect(media.history![0].completedAt).toBe('2024-01-01T00:00:00.000Z');
    // El id lo genera la migración: los documentos v1 no tenían.
    expect(media.history![0].id).toBeTruthy();
  });

  it('conserva los puntajes por temporada que traía el review viejo', () => {
    const media = parseMedia(
      v1Media({
        mediaType: 'tv',
        review: {
          rating: 5,
          seasonRatings: { 1: 4, 2: 5 },
          completedAt: '2024-01-01T00:00:00.000Z',
        },
      }),
    )!;

    expect(media.history![0].seasonRatings).toEqual({ 1: 4, 2: 5 });
  });

  it('un título v1 sin review queda sin historial', () => {
    const media = parseMedia(v1Media({ review: undefined, status: 'por_ver' }))!;

    expect(media.history).toBeUndefined();
    expect(media.status).toBe('por_ver');
  });

  it('el historial nuevo tiene prioridad sobre el review viejo', () => {
    const media = parseMedia({
      ...v1Media(),
      history: [
        { id: 'a', rating: 3, completedAt: '2025-01-01T00:00:00.000Z' },
      ],
    })!;

    expect(media.history).toHaveLength(1);
    expect(media.history![0].rating).toBe(3);
  });

  it('ordena el historial de lo más reciente a lo más viejo', () => {
    const media = parseMedia({
      ...v1Media(),
      review: undefined,
      history: [
        { id: 'vieja', rating: 2, completedAt: '2020-01-01T00:00:00.000Z' },
        { id: 'nueva', rating: 5, completedAt: '2025-01-01T00:00:00.000Z' },
      ],
    })!;

    expect(media.history!.map((entry) => entry.id)).toEqual(['nueva', 'vieja']);
  });
});

describe('parseMedia — validación', () => {
  it('descarta lo que no tiene id, tipo o título válidos', () => {
    expect(parseMedia(null)).toBeNull();
    expect(parseMedia(v1Media({ tmdbId: 'abc' }))).toBeNull();
    expect(parseMedia(v1Media({ tmdbId: -3 }))).toBeNull();
    expect(parseMedia(v1Media({ mediaType: 'libro' }))).toBeNull();
    expect(parseMedia(v1Media({ title: '   ' }))).toBeNull();
  });

  it('cae en valores por defecto cuando un campo opcional viene mal', () => {
    const media = parseMedia(
      v1Media({
        review: undefined,
        status: 'inventado',
        genres: ['Drama', 42],
        posterPath: 12,
      }),
    )!;

    expect(media.status).toBe('por_ver');
    expect(media.genres).toEqual(['Drama']);
    expect(media.posterPath).toBeNull();
  });

  it('descarta un visionado con puntaje fuera de rango', () => {
    const media = parseMedia(v1Media({ review: { rating: 42 } }))!;
    expect(media.history).toBeUndefined();
  });

  it('haber terminado algo implica el estado completada', () => {
    const media = parseMedia(v1Media({ status: 'por_ver' }))!;
    expect(media.status).toBe('completada');
  });

  it('algo ya visto sí puede volver a Viendo', () => {
    // Una serie terminada que estrena temporada vuelve a Viendo sin perder su
    // reseña: forzarla a completada la dejaba trabada ahí.
    const media = parseMedia(v1Media({ mediaType: 'tv', status: 'viendo' }))!;
    expect(media.status).toBe('viendo');
    expect(media.history).toHaveLength(1);
  });

  it('ignora el progreso en las películas', () => {
    const media = parseMedia(
      v1Media({ mediaType: 'movie', progress: { watched: { 1: [1, 2] } } }),
    )!;

    expect(media.progress).toBeUndefined();
  });

  it('limpia el progreso: sin repetidos, ordenado y sin episodios inválidos', () => {
    const media = parseMedia(
      v1Media({
        mediaType: 'tv',
        progress: { watched: { 1: [3, 1, 1, 2, 0, -5, 'x'] } },
      }),
    )!;

    expect(media.progress!.watched[1]).toEqual([1, 2, 3]);
  });

  it('lee las temporadas tanto en nuestra forma como en la cruda de TMDB', () => {
    const nuestra = parseMedia(
      v1Media({
        mediaType: 'tv',
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 8 }],
      }),
    )!;
    const deTmdb = parseMedia(
      v1Media({
        mediaType: 'tv',
        seasons: [{ season_number: 1, name: 'T1', episode_count: 8 }],
      }),
    )!;

    expect(nuestra.seasons).toEqual(deTmdb.seasons);
    expect(deTmdb.seasons![0].episodeCount).toBe(8);
  });
});

describe('parseMediaList', () => {
  it('cuenta lo que descarta en vez de fallar', () => {
    const { media, skipped } = parseMediaList([v1Media(), { basura: true }, null]);

    expect(media).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe('parseCollection', () => {
  it('acepta una colección bien formada', () => {
    const collection = parseCollection({
      id: 'abc',
      name: 'Maratón',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    })!;

    expect(collection.name).toBe('Maratón');
  });

  it('rechaza las que no tienen id o nombre', () => {
    expect(parseCollection({ name: 'Sin id' })).toBeNull();
    expect(parseCollection({ id: 'abc', name: '   ' })).toBeNull();
  });
});

describe('lecturas del historial', () => {
  const media = parseMedia({
    ...v1Media(),
    review: undefined,
    history: [
      { id: 'nueva', rating: 5, completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'vieja', rating: 2, completedAt: '2020-01-01T00:00:00.000Z' },
    ],
  })!;

  it('devuelve el visionado más reciente', () => {
    expect(latestWatch(media)?.id).toBe('nueva');
    expect(latestRating(media)).toBe(5);
  });

  it('cuenta las veces que se vio', () => {
    expect(watchCount(media)).toBe(2);
  });

  it('sobre un título sin historial no rompe', () => {
    const sinVer = parseMedia(v1Media({ review: undefined }))!;
    expect(latestWatch(sinVer)).toBeUndefined();
    expect(latestRating(sinVer)).toBeUndefined();
    expect(watchCount(sinVer)).toBe(0);
  });
});

describe('la gente y los temas del título', () => {
  it('valida el reparto y descarta lo que viene roto', () => {
    const media = parseMedia(
      v1Media({
        people: [
          { id: 1, name: 'Keanu Reeves', role: 'reparto', profilePath: '/k.jpg' },
          { id: 2, name: 'Lana Wachowski', role: 'direccion' },
          { id: 0, name: 'Sin id' },
          { name: 'Sin nada' },
          'texto suelto',
        ],
      }),
    )!;

    expect(media.people).toEqual([
      { id: 1, name: 'Keanu Reeves', role: 'reparto', profilePath: '/k.jpg' },
      { id: 2, name: 'Lana Wachowski', role: 'direccion', profilePath: null },
    ]);
  });

  it('distingue "sin reparto" de "todavía no preguntamos"', () => {
    expect(parseMedia(v1Media({ people: [] }))!.people).toEqual([]);
    expect(parseMedia(v1Media())!.people).toBeUndefined();
  });

  it('un rol desconocido cae en reparto', () => {
    const media = parseMedia(
      v1Media({ people: [{ id: 1, name: 'Alguien', role: 'sonido' }] }),
    )!;

    expect(media.people?.[0].role).toBe('reparto');
  });

  it('valida los temas, la saga y el idioma', () => {
    const media = parseMedia(
      v1Media({
        keywords: [
          { id: 4379, name: 'viajes en el tiempo' },
          { id: 'x', name: 'roto' },
        ],
        sagaId: 230,
        sagaName: 'El Padrino',
        originalLanguage: 'it',
      }),
    )!;

    expect(media.keywords).toEqual([{ id: 4379, name: 'viajes en el tiempo' }]);
    expect(media.sagaId).toBe(230);
    expect(media.sagaName).toBe('El Padrino');
    expect(media.originalLanguage).toBe('it');
  });

  it('un título de antes no trae nada de esto y sigue siendo válido', () => {
    const media = parseMedia(v1Media())!;

    expect(media.keywords).toBeUndefined();
    expect(media.sagaId).toBeNull();
    expect(media.originalLanguage).toBeUndefined();
  });
});

describe('el idioma en que se enriqueció el título', () => {
  it('conserva los dos idiomas que se usan', () => {
    expect(parseMedia(v1Media({ enrichedLanguage: 'es-MX' }))!.enrichedLanguage).toBe(
      'es-MX',
    );
    expect(parseMedia(v1Media({ enrichedLanguage: 'es-ES' }))!.enrichedLanguage).toBe(
      'es-ES',
    );
  });

  it('uno desconocido cuenta como ausente, igual que en un documento viejo', () => {
    // Ausente es "se pidió en es-ES": el título se refresca con el idioma que
    // corresponda, en vez de quedar marcado con uno que la app no sabe pedir.
    expect(parseMedia(v1Media({ enrichedLanguage: 'klingon' }))!.enrichedLanguage).toBe(
      undefined,
    );
    expect(parseMedia(v1Media())!.enrichedLanguage).toBeUndefined();
  });
});

describe('lo que el refresco sabe de una serie', () => {
  const series = (overrides: Record<string, unknown>) =>
    v1Media({ mediaType: 'tv', review: undefined, status: 'viendo', ...overrides });

  it('conserva el estado, los episodios y cuándo se pidió la ficha', () => {
    const media = parseMedia(
      series({
        seriesStatus: 'Returning Series',
        lastAired: { seasonNumber: 2, episodeNumber: 3, airDate: '2026-09-10', name: 'Uno' },
        nextToAir: { seasonNumber: 2, episodeNumber: 4, airDate: '2026-09-17' },
        enrichedAt: '2026-09-11T10:00:00.000Z',
        enrichedRegion: 'AR',
      }),
    )!;

    expect(media.seriesStatus).toBe('Returning Series');
    expect(media.lastAired).toEqual({
      seasonNumber: 2,
      episodeNumber: 3,
      airDate: '2026-09-10',
      name: 'Uno',
    });
    expect(media.nextToAir?.episodeNumber).toBe(4);
    expect(media.enrichedAt).toBe('2026-09-11T10:00:00.000Z');
    expect(media.enrichedRegion).toBe('AR');
  });

  it('descarta lo que viene roto sin voltear el título', () => {
    const media = parseMedia(
      series({
        seriesStatus: 'Rumoreada',
        lastAired: { seasonNumber: 1, episodeNumber: 0, airDate: '2026-09-10' },
        nextToAir: { seasonNumber: 1, episodeNumber: 2, airDate: 'el jueves' },
        enrichedAt: 'ayer',
        enrichedRegion: 'argentina',
      }),
    )!;

    expect(media.seriesStatus).toBeUndefined();
    expect(media.lastAired).toBeUndefined();
    expect(media.nextToAir).toBeUndefined();
    // Una fecha rota no se toma por "ahora": el título se vuelve a pedir.
    expect(media.enrichedAt).toBeUndefined();
    expect(media.enrichedRegion).toBeUndefined();
  });

  it('en una película no guarda nada de series', () => {
    const media = parseMedia(
      v1Media({
        seriesStatus: 'Ended',
        nextToAir: { seasonNumber: 1, episodeNumber: 1, airDate: '2026-09-17' },
      }),
    )!;

    expect(media.seriesStatus).toBeUndefined();
    expect(media.nextToAir).toBeUndefined();
  });
});

describe('la marca de episodios nuevos', () => {
  it('se conserva en una serie', () => {
    const media = parseMedia(
      v1Media({
        mediaType: 'tv',
        newEpisodesSince: {
          seasonNumber: 3,
          episodeNumber: 1,
          detectedAt: '2026-09-10T00:00:00.000Z',
        },
      }),
    )!;
    expect(media.newEpisodesSince).toEqual({
      seasonNumber: 3,
      episodeNumber: 1,
      detectedAt: '2026-09-10T00:00:00.000Z',
    });
  });

  it('se descarta rota, o en una película', () => {
    expect(
      parseMedia(v1Media({ mediaType: 'tv', newEpisodesSince: { seasonNumber: 0 } }))!
        .newEpisodesSince,
    ).toBeUndefined();
    expect(
      parseMedia(
        v1Media({ newEpisodesSince: { seasonNumber: 1, episodeNumber: 1 } }),
      )!.newEpisodesSince,
    ).toBeUndefined();
  });
});

describe('las fechas de los episodios', () => {
  const series = (progress: unknown) =>
    parseMedia(v1Media({ mediaType: 'tv', review: undefined, status: 'viendo', progress }))!;

  it('un documento viejo sin fechas sigue igual: no se inventa ninguna', () => {
    const media = series({ watched: { 1: [1, 2, 3] } });

    expect(media.progress?.watched[1]).toEqual([1, 2, 3]);
    expect(media.progress?.watchedAt).toBeUndefined();
  });

  it('conserva las fechas de los episodios marcados', () => {
    const media = series({
      watched: { 1: [1, 2] },
      watchedAt: { '1x1': '2026-08-01T22:00:00.000Z', '1x2': '2026-08-02T22:00:00.000Z' },
    });

    expect(media.progress?.watchedAt).toEqual({
      '1x1': '2026-08-01T22:00:00.000Z',
      '1x2': '2026-08-02T22:00:00.000Z',
    });
  });

  it('descarta fechas rotas y las de episodios que no están marcados', () => {
    const media = series({
      watched: { 1: [1] },
      watchedAt: {
        '1x1': 'ayer',
        '1x5': '2026-08-02T22:00:00.000Z',
        'T1E1': '2026-08-02T22:00:00.000Z',
      },
    });

    expect(media.progress?.watchedAt).toBeUndefined();
  });
});
