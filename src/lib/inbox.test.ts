import { describe, expect, it } from 'vitest';
import { buildInbox, suggestions, unreadCount } from './inbox';
import { Follow, MyFollows, Reaction, Recommendation } from './social';

const follow = (follower: string, followed: string, status: Follow['status'], createdAt: string, acceptedAt?: string): Follow => ({
  follower,
  followed,
  status,
  createdAt,
  ...(acceptedAt ? { acceptedAt } : {}),
});

const reaction = (reactor: string, at: string): Reaction => ({
  reactor,
  reactorName: reactor,
  reactorHandle: reactor,
  eventId: 'e1',
  emoji: 'fire',
  at,
});

const recommendation = (from: string, at: string): Recommendation => ({
  id: `${from}_movie1`,
  from,
  fromName: from,
  fromHandle: from,
  tmdbId: 1,
  mediaType: 'movie',
  title: 'X',
  posterPath: null,
  releaseYear: '',
  note: '',
  at,
});

const follows: MyFollows = {
  incoming: [
    follow('ana', 'yo', 'pending', '2026-09-05T00:00:00.000Z'),
    follow('beto', 'yo', 'accepted', '2026-09-01T00:00:00.000Z', '2026-09-03T00:00:00.000Z'),
  ],
  outgoing: [
    follow('yo', 'caro', 'accepted', '2026-09-01T00:00:00.000Z', '2026-09-04T00:00:00.000Z'),
    follow('yo', 'dani', 'accepted', '2026-09-02T00:00:00.000Z'),
  ],
};

describe('buildInbox', () => {
  it('junta solicitudes, seguidores, aceptaciones, reacciones y recomendaciones por fecha', () => {
    const items = buildInbox({
      myUid: 'yo',
      follows,
      reactions: [reaction('beto', '2026-09-06T00:00:00.000Z'), reaction('yo', '2026-09-07T00:00:00.000Z')],
      recommendations: [recommendation('caro', '2026-09-02T00:00:00.000Z')],
    });
    expect(items.map((item) => `${item.kind}:${item.uid}`)).toEqual([
      'reaction:beto',
      'request:ana',
      'accepted:caro',
      'follow:beto',
      'recommendation:caro',
    ]);
  });

  it('las reacciones de silenciados no avisan', () => {
    const items = buildInbox({ myUid: 'yo', follows: { incoming: [], outgoing: [] }, reactions: [reaction('beto', '2026-09-06T00:00:00.000Z')], muted: ['beto'] });
    expect(items).toEqual([]);
  });

  it('cuenta lo nuevo y las solicitudes pendientes aunque ya se hayan visto', () => {
    const items = buildInbox({ myUid: 'yo', follows });
    expect(unreadCount(items, '2026-09-10T00:00:00.000Z')).toBe(1);
    expect(unreadCount(items, '2026-09-03T12:00:00.000Z')).toBe(2);
  });
});

describe('suggestions', () => {
  it('quienes te siguen, te recomendaron o reaccionaron, sin repetir ni a los que ya seguís', () => {
    const result = suggestions({
      myUid: 'yo',
      follows,
      reactions: [reaction('eva', '2026-09-06T00:00:00.000Z'), reaction('beto', '2026-09-07T00:00:00.000Z')],
      recommendations: [recommendation('caro', '2026-09-02T00:00:00.000Z'), recommendation('fede', '2026-09-03T00:00:00.000Z')],
      dismissed: ['eva'],
    });
    expect(result).toEqual([
      { uid: 'beto', reason: 'te-sigue' },
      { uid: 'fede', reason: 'recomendo' },
    ]);
  });
});
