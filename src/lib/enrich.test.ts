import { describe, expect, it } from 'vitest';
import { enrichFromDetail, isStale } from './enrich';
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
    const media = makeMedia({ providerRegion: 'AR', providers: ['Netflix'] });

    expect(isStale(media, 'AR')).toBe(false);
    expect(isStale(media, 'ES')).toBe(true);
  });

  it('un título sin plataformas en su región no se vuelve a pedir', () => {
    // `providerRegion` marca que ya se consultó, aunque no haya dado resultado.
    expect(isStale(makeMedia({ providerRegion: 'AR' }), 'AR')).toBe(false);
  });
});
