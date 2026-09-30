import { describe, expect, it } from 'vitest';
import {
  latestRating,
  latestWatch,
  parseCollection,
  parseMedia,
  parseMediaList,
  toStoredMedia,
  toStoredPatch,
  watchCount,
  withArchive,
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

describe('en pausa y abandonada', () => {
  const series = (overrides: Record<string, unknown> = {}) =>
    v1Media({
      tmdbId: 1396,
      mediaType: 'tv',
      title: 'Breaking Bad',
      review: undefined,
      status: 'viendo',
      ...overrides,
    });

  it('lee el formato de Firestore: `viendo` y el estado real en el archivo', () => {
    const media = parseMedia(
      series({
        archive: {
          status: 'abandonada',
          at: '2026-05-03T10:00:00.000Z',
          reason: 'Se puso lenta',
        },
      }),
    )!;

    expect(media.status).toBe('abandonada');
    expect(media.archive).toEqual({ at: '2026-05-03T10:00:00.000Z', reason: 'Se puso lenta' });
  });

  it('lee el formato del dispositivo, con el estado ya en `status`', () => {
    const media = parseMedia(
      series({ status: 'en_pausa', archive: { at: '2026-05-03T10:00:00.000Z' } }),
    )!;

    expect(media.status).toBe('en_pausa');
    expect(media.archive).toEqual({ at: '2026-05-03T10:00:00.000Z' });
  });

  it('si una versión vieja lo movió de lista, gana lo que hizo', () => {
    // Una PWA sin actualizar solo escribe `status`: el archivo queda viejo.
    const media = parseMedia(
      series({
        status: 'completada',
        archive: { status: 'en_pausa', at: '2026-05-03T10:00:00.000Z' },
      }),
    )!;

    expect(media.status).toBe('completada');
    expect(media.archive).toBeUndefined();
  });

  it('un archivo roto no voltea el título ni inventa un estado', () => {
    expect(parseMedia(series({ archive: { status: 'olvidada' } }))!.status).toBe('viendo');
    expect(parseMedia(series({ archive: null }))!.archive).toBeUndefined();
  });

  it('sin fecha legible toma la del último cambio, y recorta el motivo', () => {
    const media = parseMedia(
      series({
        updatedAt: '2026-06-01T00:00:00.000Z',
        archive: { status: 'abandonada', at: 'ayer', reason: `  ${'x'.repeat(200)}  ` },
      }),
    )!;

    expect(media.archive?.at).toBe('2026-06-01T00:00:00.000Z');
    expect(media.archive?.reason).toHaveLength(80);
  });

  it('el motivo es solo de lo abandonado', () => {
    const media = parseMedia(
      series({ archive: { status: 'en_pausa', at: '2026-05-03T10:00:00.000Z', reason: 'x' } }),
    )!;
    expect(media.archive).toEqual({ at: '2026-05-03T10:00:00.000Z' });
  });

  it('un estado desconocido sigue cayendo en Por Ver', () => {
    expect(parseMedia(series({ status: 'archivada' }))!.status).toBe('por_ver');
  });

  it('el puntaje de algo abandonado no lo pasa a Completadas ni cuenta como vez vista', () => {
    const media = parseMedia(
      series({
        status: 'por_ver',
        history: [
          { id: 'a', rating: 2, completedAt: '2026-05-03T10:00:00.000Z', abandoned: true },
        ],
      }),
    )!;

    expect(media.status).toBe('por_ver');
    expect(media.history?.[0].abandoned).toBe(true);
    expect(watchCount(media)).toBe(0);
  });
});

describe('toStoredMedia y toStoredPatch', () => {
  const paused = {
    ...parseMedia(v1Media({ status: 'viendo', review: undefined }))!,
    status: 'en_pausa' as const,
    archive: { at: '2026-05-03T10:00:00.000Z' },
  };

  it('guardan `viendo`, que es lo que entiende una versión vieja', () => {
    const stored = toStoredMedia(paused);

    expect(stored.status).toBe('viendo');
    expect(stored.archive).toEqual({ status: 'en_pausa', at: '2026-05-03T10:00:00.000Z' });
  });

  it('ida y vuelta por parseMedia da lo mismo', () => {
    expect(parseMedia(toStoredMedia(paused))).toEqual(paused);
  });

  it('uno de las listas de siempre se guarda como siempre', () => {
    const media = parseMedia(v1Media())!;
    expect(toStoredMedia(media)).toEqual(media);
  });

  it('volver a una lista borra el archivo del documento', () => {
    const patch = toStoredPatch({ status: 'viendo' });

    expect(patch).toHaveProperty('status', 'viendo');
    expect(patch).toHaveProperty('archive', undefined);
  });

  it('abandonar anota la fecha aunque no venga', () => {
    const patch = toStoredPatch({ status: 'abandonada' });
    const archive = patch.archive as { status: string; at: string };

    expect(patch.status).toBe('viendo');
    expect(archive.status).toBe('abandonada');
    expect(Number.isNaN(Date.parse(archive.at))).toBe(false);
  });

  it('un cambio sin estado pasa tal cual', () => {
    expect(toStoredPatch({ genres: ['Drama'] })).toEqual({ genres: ['Drama'] });
  });
});

describe('withArchive', () => {
  it('limpia el archivo al volver a una lista y lo completa al archivar', () => {
    expect(withArchive({ status: 'completada' })).toEqual({
      status: 'completada',
      archive: undefined,
    });
    const now = new Date('2026-07-01T12:00:00.000Z');
    expect(withArchive({ status: 'en_pausa' }, now)).toEqual({
      status: 'en_pausa',
      archive: { at: '2026-07-01T12:00:00.000Z' },
    });
  });
});

describe('los puntajes por episodio', () => {
  const series = (progress: unknown) =>
    parseMedia(
      v1Media({
        mediaType: 'tv',
        status: 'viendo',
        review: undefined,
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 8 }],
        progress,
      }),
    )!;

  it('un documento sin puntajes sigue igual', () => {
    expect(series({ watched: { 1: [1, 2] } }).progress).not.toHaveProperty('episodeRatings');
  });

  it('conserva los de episodios marcados, redondeados a la media estrella', () => {
    const media = series({
      watched: { 1: [1, 2] },
      episodeRatings: { '1x1': 4.5, '1x2': 3.7 },
    });
    expect(media.progress?.episodeRatings).toEqual({ '1x1': 4.5, '1x2': 3.5 });
  });

  it('descarta lo que no se puede leer, lo fuera de rango y lo que no está marcado', () => {
    const media = series({
      watched: { 1: [1, 2] },
      episodeRatings: { '1x1': 'mucho', '1x2': 9, '1x5': 4, rara: 3 },
    });
    expect(media.progress).not.toHaveProperty('episodeRatings');
  });
});

describe('las novedades de disponibilidad', () => {
  it('conserva las válidas y descarta las rotas', () => {
    const media = parseMedia(
      v1Media({
        status: 'por_ver',
        review: undefined,
        digitalRelease: '2026-09-25',
        availabilityNews: [
          { kind: 'provider', provider: 'Max', since: '2026-09-26T00:00:00.000Z' },
          { kind: 'release', provider: '', since: '2026-09-26T00:00:00.000Z', seenAt: '2026-09-27T00:00:00.000Z' },
          { kind: 'provider', provider: '', since: '2026-09-26T00:00:00.000Z' },
          { kind: 'rumor', provider: 'X', since: '2026-09-26T00:00:00.000Z' },
        ],
      }),
    )!;

    expect(media.digitalRelease).toBe('2026-09-25');
    expect(media.availabilityNews).toEqual([
      { kind: 'provider', provider: 'Max', since: '2026-09-26T00:00:00.000Z' },
      {
        kind: 'release',
        provider: '',
        since: '2026-09-26T00:00:00.000Z',
        seenAt: '2026-09-27T00:00:00.000Z',
      },
    ]);
  });

  it('el estreno digital es solo de películas', () => {
    const series = parseMedia(
      v1Media({ mediaType: 'tv', review: undefined, digitalRelease: '2026-09-25' }),
    )!;
    expect(series.digitalRelease).toBeUndefined();
  });
});

describe('el aviso de episodios nuevos', () => {
  const show = { tmdbId: 95396, mediaType: 'tv', title: 'Severance', status: 'viendo' };

  it('se conserva en una serie', () => {
    expect(parseMedia({ ...show, notify: true })!.notify).toBe(true);
  });

  it('apagado, roto o en una película es lo mismo que no tenerlo', () => {
    expect(parseMedia({ ...show, notify: false })!.notify).toBeUndefined();
    expect(parseMedia({ ...show, notify: 'sí' })!.notify).toBeUndefined();
    expect(parseMedia({ ...show, mediaType: 'movie', notify: true })!.notify).toBeUndefined();
  });
});

describe('parseMedia — lo social', () => {
  it('lee cuándo entró, de quién vino y si está oculto', () => {
    const media = parseMedia(
      v1Media({
        addedAt: '2026-09-01T10:00:00.000Z',
        addedFrom: { uid: 'u-ana', name: 'Ana', via: 'recommendation' },
        hiddenFromFollowers: true,
      }),
    )!;
    expect(media.addedAt).toBe('2026-09-01T10:00:00.000Z');
    expect(media.addedFrom).toEqual({ uid: 'u-ana', name: 'Ana', via: 'recommendation' });
    expect(media.hiddenFromFollowers).toBe(true);
  });

  it('no inventa la fecha ni el origen cuando faltan o están rotos', () => {
    const media = parseMedia(
      v1Media({ addedAt: 'ayer', addedFrom: { name: 'Ana', via: 'feed' }, hiddenFromFollowers: 'sí' }),
    )!;
    expect(media.addedAt).toBeUndefined();
    expect(media.addedFrom).toBeUndefined();
    expect(media.hiddenFromFollowers).toBeUndefined();
  });

  it('acepta los nulos con que Firestore guarda lo ausente', () => {
    const media = parseMedia(v1Media({ addedAt: null, addedFrom: null, hiddenFromFollowers: null }))!;
    expect(media.addedAt).toBeUndefined();
    expect(media.addedFrom).toBeUndefined();
  });
});

describe('parseCollection — publishedAt', () => {
  it('lo conserva si es una fecha, y lo descarta si no', () => {
    const base = { id: 'c1', name: 'Terror', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    expect(parseCollection({ ...base, publishedAt: '2026-02-01T00:00:00.000Z' })?.publishedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(parseCollection({ ...base, publishedAt: 'x' })).not.toHaveProperty('publishedAt');
  });
});
