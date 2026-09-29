import { describe, expect, it } from 'vitest';
import { pickProviders } from './providers';
import { TMDbDetail } from '@/types';

type Region = NonNullable<TMDbDetail['watch/providers']>['results'][string];

function makeDetail(results: Record<string, Region>): TMDbDetail {
  return {
    id: 550,
    media_type: 'movie',
    title: 'El club de la pelea',
    poster_path: null,
    backdrop_path: null,
    overview: '',
    genres: [],
    'watch/providers': { results },
  } as TMDbDetail;
}

const netflix = { provider_name: 'Netflix', logo_path: '/n.jpg' };
const apple = { provider_name: 'Apple TV', logo_path: '/a.jpg' };
const movistar = { provider_name: 'Movistar Plus+', logo_path: '/m.jpg' };

describe('pickProviders', () => {
  it('junta incluido, alquiler y compra sin repetir la misma plataforma', () => {
    const picked = pickProviders(
      makeDetail({
        AR: { flatrate: [netflix], rent: [netflix, apple], buy: [apple] },
      }),
      'AR',
    );

    expect(picked?.region).toBe('AR');
    expect(picked?.providers.map((p) => p.provider_name)).toEqual([
      'Netflix',
      'Apple TV',
    ]);
  });

  it('trae el enlace a la página de TMDB con dónde verlo', () => {
    const link = 'https://www.themoviedb.org/movie/550-fight-club/watch?locale=AR';

    const picked = pickProviders(
      makeDetail({ AR: { link, flatrate: [netflix] } }),
      'AR',
    );

    expect(picked?.link).toBe(link);
  });

  it('si cae en otra región, el enlace es el de esa región', () => {
    // El de la región pedida llevaría a una página que dice que no está en
    // ningún lado.
    const picked = pickProviders(
      makeDetail({
        AR: { link: 'https://www.themoviedb.org/movie/550/watch?locale=AR' },
        ES: {
          link: 'https://www.themoviedb.org/movie/550/watch?locale=ES',
          flatrate: [movistar],
        },
      }),
      'AR',
    );

    expect(picked?.region).toBe('ES');
    expect(picked?.link).toBe('https://www.themoviedb.org/movie/550/watch?locale=ES');
  });

  it('sin enlace devuelve igual las plataformas', () => {
    const picked = pickProviders(makeDetail({ AR: { flatrate: [netflix] } }), 'AR');

    expect(picked?.providers).toHaveLength(1);
    expect(picked?.link).toBeUndefined();
  });

  it.each([
    'javascript:alert(1)',
    'http://www.themoviedb.org/movie/550/watch',
    'https://themoviedb.org.ejemplo.com/movie/550',
    'no es una url',
  ])('descarta un enlace que no es de TMDB por https: %s', (link) => {
    const picked = pickProviders(
      makeDetail({ AR: { link, flatrate: [netflix] } }),
      'AR',
    );

    expect(picked?.link).toBeUndefined();
  });

  it('sin plataformas en ninguna región no devuelve nada, ni el enlace', () => {
    expect(
      pickProviders(
        makeDetail({ AR: { link: 'https://www.themoviedb.org/movie/550/watch' } }),
        'AR',
      ),
    ).toBeNull();
    expect(pickProviders(null, 'AR')).toBeNull();
  });
});

describe('lo incluido y lo que se alquila', () => {
  it('separa suscripción, gratis y con publicidad de alquiler y compra', () => {
    const picked = pickProviders(
      {
        'watch/providers': {
          results: {
            AR: {
              flatrate: [{ provider_name: 'Netflix', logo_path: '/n.png' }],
              free: [{ provider_name: 'Cine.ar', logo_path: '/c.png' }],
              rent: [
                { provider_name: 'Apple TV', logo_path: '/a.png' },
                { provider_name: 'Netflix', logo_path: '/n.png' },
              ],
              buy: [{ provider_name: 'Apple TV', logo_path: '/a.png' }],
            },
          },
        },
      } as unknown as TMDbDetail,
      'AR',
    )!;

    expect(picked.included.map((p) => p.provider_name)).toEqual(['Netflix', 'Cine.ar']);
    // Apple TV una sola vez; Netflix no, porque ya está incluido.
    expect(picked.rentOrBuy.map((p) => p.provider_name)).toEqual(['Apple TV']);
    expect(picked.providers.map((p) => p.provider_name)).toEqual(['Netflix', 'Cine.ar', 'Apple TV']);
  });
});
