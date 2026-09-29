import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  MAX_SUBSCRIPTIONS,
  emptySubscriptions,
  hasSubscriptions,
  isAvailableNow,
  isSubscribed,
  parseSubscriptions,
  paysFor,
  subscribedIn,
  subscribedNames,
  subscriptionsToDocument,
  toggleSubscription,
} from './subscriptions';

const netflix = { id: 8, name: 'Netflix', logoPath: '/n.png' };
const max = { id: 1899, name: 'Max', logoPath: null };

function media(streaming?: string[]): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Algo',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
    streaming,
  };
}

describe('las suscripciones', () => {
  it('valida lo que llega y descarta lo roto o repetido', () => {
    const parsed = parseSubscriptions({
      providers: [netflix, { id: 'x', name: 'Rota' }, { id: 8, name: 'Netflix otra vez' }, max],
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(parsed.providers).toEqual([netflix, max]);
    expect(parsed.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('un logo que no es una ruta de TMDB no se guarda', () => {
    const parsed = parseSubscriptions({
      providers: [{ id: 8, name: 'Netflix', logoPath: 'javascript:alert(1)' }],
    });
    expect(parsed.providers[0].logoPath).toBeNull();
  });

  it('algo roto es "sin suscripciones"', () => {
    expect(parseSubscriptions(null)).toEqual(emptySubscriptions());
    expect(hasSubscriptions(parseSubscriptions({ providers: 'Netflix' }))).toBe(false);
  });

  it('marcar y desmarcar, con la fecha de ahora', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const one = toggleSubscription(emptySubscriptions(), netflix, now);
    expect(isSubscribed(one, 8)).toBe(true);
    expect(one.updatedAt).toBe(now.toISOString());

    expect(isSubscribed(toggleSubscription(one, netflix, now), 8)).toBe(false);
  });

  it('tiene tope', () => {
    let subscriptions = emptySubscriptions();
    for (let id = 1; id <= MAX_SUBSCRIPTIONS + 5; id++) {
      subscriptions = toggleSubscription(subscriptions, { id, name: `P${id}`, logoPath: null });
    }
    expect(subscriptions.providers).toHaveLength(MAX_SUBSCRIPTIONS);
  });

  it('el documento no lleva `undefined`', () => {
    const document = subscriptionsToDocument({
      providers: [{ id: 8, name: 'Netflix', logoPath: null }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(document)).not.toContain('undefined');
  });
});

describe('Lo que puedo ver ya', () => {
  const names = subscribedNames({ providers: [netflix], updatedAt: '' });

  it('compara por nombre, sin mayúsculas ni espacios de más', () => {
    expect(isAvailableNow(media([' netflix ']), names)).toBe(true);
    expect(paysFor(names, 'NETFLIX')).toBe(true);
  });

  it('solo cuenta lo incluido: sin `streaming` no se sabe, y no entra', () => {
    expect(isAvailableNow(media(['Max']), names)).toBe(false);
    expect(isAvailableNow(media(undefined), names)).toBe(false);
  });

  it('dice en cuáles de las tuyas está', () => {
    expect(subscribedIn(media(['Netflix', 'Max']), names)).toEqual(['Netflix']);
  });
});
