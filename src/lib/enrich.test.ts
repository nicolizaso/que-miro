import { describe, expect, it } from 'vitest';
import {
  AIRING_MAX_AGE_DAYS,
  FINISHED_MAX_AGE_DAYS,
  MOVIE_MAX_AGE_DAYS,
  UPCOMING_MAX_AGE_DAYS,
  enrichFromDetail,
  isStale,
  needsPeople,
} from './enrich';
import { SavedMedia, TMDbDetail } from '@/types';

function makeDetail(overrides: Partial<TMDbDetail> = {}): TMDbDetail {
  return {
    id: 1,
    media_type: 'movie',
    title: 'Matrix',
    poster_path: null,
    backdrop_path: null,
    genre_ids: [],
    overview: '',
    genres: [],
    ...overrides,
  } as TMDbDetail;
}

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: null,
    backdropPath: null,
    releaseYear: '1999',
    genres: [],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('enrichFromDetail', () => {
  it('toma la duración de una película', () => {
    expect(enrichFromDetail(makeDetail({ runtime: 136 }), 'AR').runtime).toBe(136);
  });

  it('en series usa la duración por episodio', () => {
    const enrichment = enrichFromDetail(
      makeDetail({ media_type: 'tv', episode_run_time: [47, 60] }),
      'AR',
    );

    expect(enrichment.runtime).toBe(47);
  });

  it('deja la duración en null cuando TMDB no la trae o es cero', () => {
    expect(enrichFromDetail(makeDetail(), 'AR').runtime).toBeNull();
    expect(enrichFromDetail(makeDetail({ runtime: 0 }), 'AR').runtime).toBeNull();
  });

  it('normaliza las temporadas y descarta las vacías', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        seasons: [
          { season_number: 1, name: 'Temporada 1', episode_count: 8 },
          { season_number: 2, name: '', episode_count: 10 },
          { season_number: 3, name: 'Sin estrenar', episode_count: 0 },
        ],
      }),
      'AR',
    );

    expect(enrichment.seasons).toEqual([
      { seasonNumber: 1, name: 'Temporada 1', episodeCount: 8 },
      { seasonNumber: 2, name: 'Temporada 2', episodeCount: 10 },
    ]);
  });

  it('guarda las plataformas de la región pedida, sin repetir', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        'watch/providers': {
          results: {
            AR: {
              flatrate: [{ provider_name: 'Netflix', logo_path: '/n.jpg' }],
              rent: [
                { provider_name: 'Netflix', logo_path: '/n.jpg' },
                { provider_name: 'Apple TV', logo_path: '/a.jpg' },
              ],
            },
          },
        },
      }),
      'AR',
    );

    expect(enrichment.providers).toEqual(['Netflix', 'Apple TV']);
    expect(enrichment.providerRegion).toBe('AR');
  });

  it('cae en otra región y lo deja registrado', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        'watch/providers': {
          results: {
            ES: { flatrate: [{ provider_name: 'Movistar', logo_path: '/m.jpg' }] },
          },
        },
      }),
      'AR',
    );

    expect(enrichment.providerRegion).toBe('ES');
    expect(enrichment.providers).toEqual(['Movistar']);
  });

  it('sin catálogo no inventa plataformas', () => {
    const enrichment = enrichFromDetail(makeDetail(), 'AR');
    expect(enrichment.providers).toBeUndefined();
    expect(enrichment.providerRegion).toBeUndefined();
  });
});

describe('isStale', () => {
  const NOW = new Date(2026, 8, 15, 12);

  /** Un título enriquecido hace `days` días, para la región pedida. */
  function enrichedDaysAgo(days: number, overrides: Partial<SavedMedia> = {}) {
    return makeMedia({
      providerRegion: 'AR',
      enrichedRegion: 'AR',
      enrichedLanguage: 'es-MX',
      enrichedAt: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    });
  }

  it('un título sin datos cacheados hay que completarlo', () => {
    expect(isStale(makeMedia(), 'AR', NOW)).toBe(true);
  });

  it('cambiar de país invalida las plataformas guardadas', () => {
    const media = enrichedDaysAgo(1, { providers: ['Netflix'] });

    expect(isStale(media, 'AR', NOW)).toBe(false);
    expect(isStale(media, 'ES', NOW)).toBe(true);
  });

  it('un título sin plataformas en ningún lado no vence por eso', () => {
    // Antes solo se miraba `providerRegion`, que queda vacío si no hubo
    // catálogo, y el título se volvía a pedir en cada visita.
    const media = enrichedDaysAgo(1, { providerRegion: undefined });
    expect(isStale(media, 'AR', NOW)).toBe(false);
  });

  it('un título con plataformas de otra región no vence por eso', () => {
    // Sin catálogo en Argentina se muestran las de España: la región pedida
    // sigue siendo Argentina.
    const media = enrichedDaysAgo(1, { providerRegion: 'ES' });
    expect(isStale(media, 'AR', NOW)).toBe(false);
  });

  it('lo guardado antes del idioma se pidió en castellano de España', () => {
    // Para quien está en España sigue al día; para quien está en Argentina
    // tiene el título equivocado y hay que volver a pedirlo.
    const spain = enrichedDaysAgo(1, {
      providerRegion: 'ES',
      enrichedRegion: undefined,
      enrichedLanguage: undefined,
    });
    expect(isStale(spain, 'ES', NOW)).toBe(false);
    expect(
      isStale(enrichedDaysAgo(1, { enrichedLanguage: undefined }), 'AR', NOW),
    ).toBe(true);
  });

  it('vuelve a pedirlo si quedó en el castellano de otra región', () => {
    const media = enrichedDaysAgo(1, {
      providerRegion: 'ES',
      enrichedRegion: 'ES',
      enrichedLanguage: 'es-MX',
    });
    expect(isStale(media, 'ES', NOW)).toBe(true);
  });

  it('lo enriquecido antes de que se anotara la fecha se refresca una vez', () => {
    const media = enrichedDaysAgo(1, { enrichedAt: undefined });
    expect(isStale(media, 'AR', NOW)).toBe(true);
  });

  describe('por antigüedad', () => {
    it.each([
      ['una película', { mediaType: 'movie' as const }, MOVIE_MAX_AGE_DAYS],
      [
        'una serie en emisión',
        { mediaType: 'tv' as const, seriesStatus: 'Returning Series' as const },
        AIRING_MAX_AGE_DAYS,
      ],
      [
        'una serie en producción',
        { mediaType: 'tv' as const, seriesStatus: 'In Production' as const },
        UPCOMING_MAX_AGE_DAYS,
      ],
      [
        'una serie planeada',
        { mediaType: 'tv' as const, seriesStatus: 'Planned' as const },
        UPCOMING_MAX_AGE_DAYS,
      ],
      [
        'un piloto',
        { mediaType: 'tv' as const, seriesStatus: 'Pilot' as const },
        UPCOMING_MAX_AGE_DAYS,
      ],
      [
        'una serie terminada',
        { mediaType: 'tv' as const, seriesStatus: 'Ended' as const },
        FINISHED_MAX_AGE_DAYS,
      ],
      [
        'una serie cancelada',
        { mediaType: 'tv' as const, seriesStatus: 'Canceled' as const },
        FINISHED_MAX_AGE_DAYS,
      ],
      [
        'una serie de estado desconocido',
        { mediaType: 'tv' as const },
        UPCOMING_MAX_AGE_DAYS,
      ],
    ])('%s dura %i días', (_label, overrides, days) => {
      expect(isStale(enrichedDaysAgo(days - 0.5, overrides), 'AR', NOW)).toBe(false);
      expect(isStale(enrichedDaysAgo(days + 0.5, overrides), 'AR', NOW)).toBe(true);
    });

    it('lo que sigue saliendo vence antes que lo terminado', () => {
      expect(AIRING_MAX_AGE_DAYS).toBeLessThan(UPCOMING_MAX_AGE_DAYS);
      expect(UPCOMING_MAX_AGE_DAYS).toBeLessThan(MOVIE_MAX_AGE_DAYS);
      expect(MOVIE_MAX_AGE_DAYS).toBeLessThan(FINISHED_MAX_AGE_DAYS);
    });
  });

  describe('el episodio anunciado', () => {
    const airing = { mediaType: 'tv' as const, seriesStatus: 'Returning Series' as const };

    it('vence la serie al día siguiente de que sale', () => {
      // Se refrescó el 14 anunciando un episodio para el 14: el 15 ya salió.
      const media = enrichedDaysAgo(1, {
        ...airing,
        nextToAir: { seasonNumber: 2, episodeNumber: 4, airDate: '2026-09-14' },
      });
      expect(isStale(media, 'AR', NOW)).toBe(true);
    });

    it('no la vence el mismo día: el episodio puede salir a la noche', () => {
      const media = enrichedDaysAgo(1, {
        ...airing,
        nextToAir: { seasonNumber: 2, episodeNumber: 4, airDate: '2026-09-15' },
      });
      expect(isStale(media, 'AR', NOW)).toBe(false);
    });

    it('una vez refrescada después del estreno, no insiste', () => {
      // TMDB puede tardar en mover el episodio de "próximo" a "último": si ya
      // se preguntó después de que salió, se espera a la regla por edad.
      const media = makeMedia({
        ...airing,
        providerRegion: 'AR',
        enrichedRegion: 'AR',
        enrichedLanguage: 'es-MX',
        enrichedAt: new Date(2026, 8, 15, 9).toISOString(),
        nextToAir: { seasonNumber: 2, episodeNumber: 4, airDate: '2026-09-14' },
      });
      expect(isStale(media, 'AR', NOW)).toBe(false);
    });
  });
});

describe('el idioma de la ficha', () => {
  it('guarda en qué castellano se pidió', () => {
    expect(enrichFromDetail(makeDetail(), 'AR').enrichedLanguage).toBe('es-MX');
    expect(enrichFromDetail(makeDetail(), 'ES').enrichedLanguage).toBe('es-ES');
  });

  it('trae el título, para que refrescar lo corrija', () => {
    expect(
      enrichFromDetail(makeDetail({ title: 'Duro de matar' }), 'AR').title,
    ).toBe('Duro de matar');
    // Las series lo mandan en otro campo.
    expect(
      enrichFromDetail(
        makeDetail({ media_type: 'tv', title: undefined, name: 'Los Soprano' }),
        'AR',
      ).title,
    ).toBe('Los Soprano');
  });

  it('nunca pisa el título guardado con uno vacío', () => {
    const enrichment = enrichFromDetail(
      makeDetail({ title: '', name: undefined }),
      'AR',
    );
    expect('title' in enrichment).toBe(false);
  });

  it('nombra los géneros como la app, no como TMDB en cada idioma', () => {
    // "Suspense" es como lo llama TMDB en España; la biblioteca, el filtro y
    // el cuestionario lo llaman "Suspenso".
    const enrichment = enrichFromDetail(
      makeDetail({
        genres: [
          { id: 53, name: 'Suspense' },
          { id: 878, name: 'Ciencia ficción' },
        ],
      }),
      'ES',
    );

    expect(enrichment.genres).toEqual(['Suspenso', 'Ciencia Ficción']);
  });

  it('sin géneros en la ficha no borra los guardados', () => {
    expect('genres' in enrichFromDetail(makeDetail(), 'AR')).toBe(false);
  });
});

describe('la gente que se guarda con el título', () => {
  it('toma el reparto principal y a quien dirigió', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        credits: {
          cast: [
            { id: 1, name: 'Keanu Reeves', character: 'Neo', profile_path: '/k.jpg' },
          ],
          crew: [
            {
              id: 2,
              name: 'Lana Wachowski',
              job: 'Director',
              department: 'Directing',
              profile_path: null,
            },
            {
              id: 3,
              name: 'Alguien',
              job: 'Gaffer',
              department: 'Lighting',
              profile_path: null,
            },
          ],
        },
      }),
      'AR',
    );

    expect(enrichment.people).toEqual([
      { id: 2, name: 'Lana Wachowski', role: 'direccion', profilePath: null },
      { id: 1, name: 'Keanu Reeves', role: 'reparto', profilePath: '/k.jpg' },
    ]);
  });

  it('en series, quien la creó cuenta como dirección', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        media_type: 'tv',
        created_by: [{ id: 9, name: 'Baran bo Odar', profile_path: null }],
      }),
      'AR',
    );

    expect(enrichment.people?.[0]).toMatchObject({
      id: 9,
      role: 'direccion',
    });
  });

  it('no repite a quien dirigió y además actuó', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        credits: {
          cast: [{ id: 1, name: 'Greta Gerwig', character: 'Ella', profile_path: null }],
          crew: [
            {
              id: 1,
              name: 'Greta Gerwig',
              job: 'Director',
              department: 'Directing',
              profile_path: null,
            },
          ],
        },
      }),
      'AR',
    );

    expect(enrichment.people).toHaveLength(1);
    expect(enrichment.people?.[0].role).toBe('direccion');
  });

  it('sin reparto en TMDB guarda una lista vacía, no un vacío', () => {
    // La diferencia importa: `[]` es "ya preguntamos", `undefined` es "todavía
    // no". Es lo que evita que el completado en segundo plano pregunte para
    // siempre por un título que no tiene reparto cargado.
    const enrichment = enrichFromDetail(makeDetail(), 'AR');

    expect(enrichment.people).toEqual([]);
    expect(needsPeople(makeMedia({ people: enrichment.people }))).toBe(false);
  });

  it('toma los temas vengan como vengan de TMDB', () => {
    const pelicula = enrichFromDetail(
      makeDetail({ keywords: { keywords: [{ id: 4379, name: 'viajes en el tiempo' }] } }),
      'AR',
    );
    const serie = enrichFromDetail(
      makeDetail({ keywords: { results: [{ id: 9, name: 'distopía' }] } }),
      'AR',
    );

    expect(pelicula.keywords?.[0].name).toBe('viajes en el tiempo');
    expect(serie.keywords?.[0].name).toBe('distopía');
  });

  it('guarda la saga y el idioma original', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        belongs_to_collection: { id: 230, name: 'El Padrino', poster_path: null },
        original_language: 'it',
      }),
      'AR',
    );

    expect(enrichment.sagaId).toBe(230);
    expect(enrichment.sagaName).toBe('El Padrino');
    expect(enrichment.originalLanguage).toBe('it');
  });
});

describe('needsPeople', () => {
  it('marca los títulos guardados antes de que existiera el reparto', () => {
    expect(needsPeople(makeMedia())).toBe(true);
    expect(needsPeople(makeMedia({ people: [] }))).toBe(false);
  });
});

describe('lo que se sabe de una serie', () => {
  const NOW = new Date('2026-09-15T12:00:00.000Z');

  it('guarda en qué anda, el último episodio y el próximo', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        media_type: 'tv',
        status: 'Returning Series',
        last_episode_to_air: {
          season_number: 2,
          episode_number: 3,
          air_date: '2026-09-10',
          name: 'Hola, señora Cobel',
        },
        next_episode_to_air: {
          season_number: 2,
          episode_number: 4,
          air_date: '2026-09-17',
          name: 'La tuya es la mía',
        },
      }),
      'AR',
      NOW,
    );

    expect(enrichment.seriesStatus).toBe('Returning Series');
    expect(enrichment.lastAired).toEqual({
      seasonNumber: 2,
      episodeNumber: 3,
      airDate: '2026-09-10',
      name: 'Hola, señora Cobel',
    });
    expect(enrichment.nextToAir?.airDate).toBe('2026-09-17');
  });

  it('sin próximo episodio lo deja explícito, para borrar el que había', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        media_type: 'tv',
        status: 'Ended',
        next_episode_to_air: null,
      }),
      'AR',
      NOW,
    );

    // La clave está, vacía: una escritura con `merge` tiene que pisar el
    // próximo episodio que se había guardado cuando la serie seguía saliendo.
    expect('nextToAir' in enrichment).toBe(true);
    expect(enrichment.nextToAir).toBeUndefined();
  });

  it('descarta un episodio sin fecha', () => {
    const enrichment = enrichFromDetail(
      makeDetail({
        media_type: 'tv',
        next_episode_to_air: { season_number: 3, episode_number: 1, air_date: null },
      }),
      'AR',
      NOW,
    );

    expect(enrichment.nextToAir).toBeUndefined();
  });

  it('anota cuándo y para qué región se pidió', () => {
    const enrichment = enrichFromDetail(makeDetail(), 'UY', NOW);

    expect(enrichment.enrichedAt).toBe(NOW.toISOString());
    expect(enrichment.enrichedRegion).toBe('UY');
  });

  it('una película no trae nada de series', () => {
    const enrichment = enrichFromDetail(
      makeDetail({ status: 'Released', release_date: '1999-03-31' }),
      'AR',
      NOW,
    );

    expect('seriesStatus' in enrichment).toBe(false);
    expect('nextToAir' in enrichment).toBe(false);
  });

  it('no trae progreso: refrescar no toca los episodios vistos', () => {
    // Los vistos se guardan por número de temporada, así que sobreviven a que
    // la serie sume una temporada: lo único que cambia son las temporadas.
    const enrichment = enrichFromDetail(
      makeDetail({
        media_type: 'tv',
        seasons: [
          { season_number: 1, name: 'Temporada 1', episode_count: 9 },
          { season_number: 2, name: 'Temporada 2', episode_count: 10 },
        ],
        number_of_episodes: 19,
      }),
      'AR',
      NOW,
    );

    expect('progress' in enrichment).toBe(false);
    expect(enrichment.seasons).toHaveLength(2);
    expect(enrichment.totalEpisodes).toBe(19);
  });
});
