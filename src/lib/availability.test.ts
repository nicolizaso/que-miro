import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  detectAvailabilityNews,
  markNewsSeen,
  newsLabel,
  providerKey,
  titlesWithNews,
  unseenNews,
} from './availability';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function pending(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 693134,
    mediaType: 'movie',
    title: 'Duna: Parte Dos',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2024',
    genres: [],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
    streaming: [],
    enrichedAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('el nombre de una plataforma, para comparar', () => {
  it('junta renombres y variantes de plan', () => {
    expect(providerKey('HBO Max')).toBe(providerKey('Max'));
    expect(providerKey('Netflix basic with Ads')).toBe(providerKey('Netflix'));
    expect(providerKey('Amazon Prime Video')).toBe(providerKey('Prime Video'));
    expect(providerKey('Amazon Prime Video with Ads')).toBe(providerKey('Prime Video'));
    expect(providerKey('Disney+')).toBe(providerKey('Disney Plus'));
    expect(providerKey('Paramount Plus Apple TV Channel')).toBe(providerKey('Paramount Plus'));
  });

  it('no junta lo que es distinto', () => {
    expect(providerKey('Apple TV+')).not.toBe(providerKey('Apple TV'));
    expect(providerKey('Max')).not.toBe(providerKey('Mubi'));
  });
});

describe('detectAvailabilityNews', () => {
  it('una plataforma nueva es una novedad', () => {
    const news = detectAvailabilityNews(pending(), { streaming: ['Max'] }, null, NOW);
    expect(news).toEqual([{ kind: 'provider', provider: 'Max', since: NOW.toISOString() }]);
  });

  it('la misma plataforma con otro nombre no lo es', () => {
    const before = pending({ streaming: ['HBO Max'] });
    expect(detectAvailabilityNews(before, { streaming: ['Max'] }, null, NOW)).toBeUndefined();
  });

  it('una que se fue borra la novedad sin ver, que ya no es cierta', () => {
    const before = pending({
      streaming: ['Max'],
      availabilityNews: [{ kind: 'provider', provider: 'Max', since: '2026-09-01T00:00:00.000Z' }],
    });

    expect(detectAvailabilityNews(before, { streaming: [] }, null, NOW)).toEqual([]);
  });

  it('una ya vista no vuelve, aunque la plataforma se vaya y vuelva', () => {
    const seen = {
      kind: 'provider' as const,
      provider: 'Max',
      since: '2026-08-01T00:00:00.000Z',
      seenAt: '2026-08-02T00:00:00.000Z',
    };
    const before = pending({ streaming: [], availabilityNews: [seen] });

    expect(detectAvailabilityNews(before, { streaming: ['Max'] }, null, NOW)).toBeUndefined();
  });

  it('con suscripciones, solo avisa de las tuyas', () => {
    const news = detectAvailabilityNews(
      pending(),
      { streaming: ['Max', 'Netflix'] },
      new Set(['netflix']),
      NOW,
    );
    expect(news?.map((item) => item.provider)).toEqual(['Netflix']);
  });

  it('sin saber qué había antes no avisa de lo que ya estaba', () => {
    const neverComputed = pending({ streaming: undefined });
    expect(detectAvailabilityNews(neverComputed, { streaming: ['Max'] }, null, NOW)).toBeUndefined();
  });

  it('solo en Por Ver', () => {
    const watching = pending({ status: 'viendo' });
    expect(detectAvailabilityNews(watching, { streaming: ['Max'] }, null, NOW)).toBeUndefined();
  });

  describe('el estreno digital', () => {
    it('avisa cuando pasa una fecha que estaba en el futuro', () => {
      const before = pending({ digitalRelease: '2026-09-25' });
      const news = detectAvailabilityNews(before, { streaming: [], digitalRelease: '2026-09-25' }, null, NOW);
      expect(news).toEqual([{ kind: 'release', provider: '', since: NOW.toISOString() }]);
    });

    it('no avisa de algo que ya había salido cuando se anotó', () => {
      const before = pending({ digitalRelease: '2024-05-21', enrichedAt: '2026-09-20T12:00:00.000Z' });
      expect(
        detectAvailabilityNews(before, { streaming: [], digitalRelease: '2024-05-21' }, null, NOW),
      ).toBeUndefined();
    });

    it('ni de una fecha que todavía no llegó, ni dos veces', () => {
      const future = pending({ digitalRelease: '2026-10-10' });
      expect(
        detectAvailabilityNews(future, { streaming: [], digitalRelease: '2026-10-10' }, null, NOW),
      ).toBeUndefined();

      const noted = pending({
        digitalRelease: '2026-09-25',
        availabilityNews: [{ kind: 'release', provider: '', since: '2026-09-26T00:00:00.000Z' }],
      });
      expect(
        detectAvailabilityNews(noted, { streaming: [], digitalRelease: '2026-09-25' }, null, NOW),
      ).toBeUndefined();
    });
  });
});

describe('lo que se muestra', () => {
  const withNews = pending({
    availabilityNews: [
      { kind: 'provider', provider: 'Max', since: '2026-09-28T00:00:00.000Z' },
      { kind: 'provider', provider: 'Netflix', since: '2026-09-28T00:00:00.000Z' },
    ],
  });

  it('arma la frase', () => {
    expect(newsLabel(unseenNews(withNews))).toBe('ya está en Max y Netflix');
    expect(newsLabel([{ kind: 'release', provider: '', since: '' }])).toBe('ya salió en digital');
  });

  it('descartar marca todo como visto y lo saca de la lista', () => {
    const seen = { ...withNews, availabilityNews: markNewsSeen(withNews, NOW) };
    expect(unseenNews(seen)).toEqual([]);
    expect(titlesWithNews([seen, withNews]).map(({ media }) => media)).toEqual([withNews]);
  });

  it('si ya no está en Por Ver, la novedad no se muestra', () => {
    expect(unseenNews({ ...withNews, status: 'viendo' })).toEqual([]);
  });
});
