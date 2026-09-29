import { describe, expect, it } from 'vitest';
import { enrichFromDetail, isStale, needsPeople } from './enrich';
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
  it('un título sin datos cacheados hay que completarlo', () => {
    expect(isStale(makeMedia(), 'AR')).toBe(true);
  });

  it('cambiar de país invalida las plataformas guardadas', () => {
    const media = makeMedia({
      providerRegion: 'AR',
      providers: ['Netflix'],
      enrichedLanguage: 'es-MX',
    });

    expect(isStale(media, 'AR')).toBe(false);
    expect(isStale(media, 'ES')).toBe(true);
  });

  it('un título sin plataformas en su región no se vuelve a pedir', () => {
    // `providerRegion` marca que ya se consultó, aunque no haya dado resultado.
    expect(
      isStale(makeMedia({ providerRegion: 'AR', enrichedLanguage: 'es-MX' }), 'AR'),
    ).toBe(false);
  });

  it('lo guardado antes del idioma se pidió en castellano de España', () => {
    // Para quien está en España sigue al día; para quien está en Argentina
    // tiene el título equivocado y hay que volver a pedirlo.
    expect(isStale(makeMedia({ providerRegion: 'ES' }), 'ES')).toBe(false);
    expect(isStale(makeMedia({ providerRegion: 'AR' }), 'AR')).toBe(true);
  });

  it('un título enriquecido en el idioma de la región no vence por eso', () => {
    const media = makeMedia({ providerRegion: 'MX', enrichedLanguage: 'es-MX' });
    expect(isStale(media, 'MX')).toBe(false);
  });

  it('vuelve a pedirlo si quedó en el castellano de otra región', () => {
    const media = makeMedia({ providerRegion: 'ES', enrichedLanguage: 'es-MX' });
    expect(isStale(media, 'ES')).toBe(true);
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
