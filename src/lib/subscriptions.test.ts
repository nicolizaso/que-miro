import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  MAX_SUBSCRIPTIONS,
  emptySubscriptions,
  hasSubscriptions,
  isAvailableNow,
  isSubscribed,
  limitToSubscriptions,
  parseSubscriptions,
  paysFor,
  recommendsOnlyMine,
  searchProviders,
  setOnlyMine,
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

describe('solo lo que está en mis plataformas', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');
  const mine = { providers: [netflix, max], updatedAt: '2026-01-01T00:00:00.000Z' };

  it('se prende y se apaga, con la fecha de ahora', () => {
    const on = setOnlyMine(mine, true, now);
    expect(recommendsOnlyMine(on)).toBe(true);
    expect(on.updatedAt).toBe(now.toISOString());
    expect(recommendsOnlyMine(setOnlyMine(on, false, now))).toBe(false);
  });

  it('no se prende sin plataformas', () => {
    expect(recommendsOnlyMine(setOnlyMine(emptySubscriptions(), true, now))).toBe(false);
    expect(recommendsOnlyMine(undefined)).toBe(false);
  });

  it('se apaga al sacar la última plataforma, y no vuelve sola', () => {
    const on = setOnlyMine({ providers: [netflix], updatedAt: '' }, true, now);
    const none = toggleSubscription(on, netflix, now);
    expect(none.onlyMine).toBeUndefined();
    expect(recommendsOnlyMine(toggleSubscription(none, netflix, now))).toBe(false);
  });

  it('marcar otra plataforma no lo apaga', () => {
    const on = setOnlyMine(mine, true, now);
    expect(recommendsOnlyMine(toggleSubscription(on, { id: 337, name: 'Disney Plus', logoPath: null }, now))).toBe(true);
  });

  it('viaja en el documento solo si está prendido, y vuelve igual', () => {
    expect(subscriptionsToDocument(mine)).not.toHaveProperty('onlyMine');
    const document = subscriptionsToDocument(setOnlyMine(mine, true, now));
    expect(document.onlyMine).toBe(true);
    expect(recommendsOnlyMine(parseSubscriptions(document))).toBe(true);
  });

  it('un documento viejo, o uno roto, queda apagado', () => {
    expect(parseSubscriptions(subscriptionsToDocument(mine)).onlyMine).toBeUndefined();
    expect(parseSubscriptions({ ...subscriptionsToDocument(mine), onlyMine: 'sí' }).onlyMine).toBeUndefined();
    expect(parseSubscriptions({ providers: [], onlyMine: true }).onlyMine).toBeUndefined();
  });

  it('limita una consulta a /discover a los ids de lo que pagás', () => {
    expect(limitToSubscriptions({ mediaType: 'movie', genres: [27] }, mine, 'AR')).toEqual({
      mediaType: 'movie',
      genres: [27],
      providers: [8, 1899],
      region: 'AR',
    });
  });

  it('no toca la consulta que ya es de una plataforma', () => {
    const netflixRow = { mediaType: 'movie' as const, provider: 'Netflix', region: 'AR' };
    expect(limitToSubscriptions(netflixRow, mine, 'AR')).toBe(netflixRow);
    const idRow = { mediaType: 'tv' as const, providers: [8], region: 'AR' };
    expect(limitToSubscriptions(idRow, mine, 'AR')).toBe(idRow);
  });
});

describe('buscar una plataforma', () => {
  const list = [netflix, max, { id: 2, name: 'Apple TV', logoPath: null }, { id: 3, name: 'Clarovídeo', logoPath: null }];

  it('busca por una parte del nombre, sin mayúsculas ni tildes', () => {
    expect(searchProviders(list, 'apple').map((p) => p.id)).toEqual([2]);
    expect(searchProviders(list, ' CLAROVIDEO ').map((p) => p.id)).toEqual([3]);
  });

  it('vacía, devuelve todas', () => {
    expect(searchProviders(list, '  ')).toBe(list);
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
