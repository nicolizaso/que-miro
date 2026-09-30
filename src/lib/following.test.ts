import { describe, expect, it } from 'vitest';
import { Following } from '@/types';
import { PublicProfile, buildPublicProfile } from '@/lib/publicProfile';
import {
  MAX_FOLLOWING,
  emptyFollowing,
  follow,
  followStatus,
  parseFollowing,
  unfollow,
} from './following';

const NOW = new Date('2026-09-29T12:00:00.000Z');

function profile(slug: string, uid: string, displayName: string, reviews: Partial<PublicProfile['reviews'][number]>[] = []): PublicProfile {
  return {
    ...buildPublicProfile({ slug, uid, displayName, mediaList: [] }),
    reviews: reviews.map((review, index) => ({
      id: `${slug}-${index}`,
      tmdbId: 1,
      mediaType: 'movie',
      title: 'Past Lives',
      posterPath: null,
      releaseYear: '2023',
      rating: 4.5,
      text: 'Hermosa.',
      tags: [],
      completedAt: '2026-09-01T00:00:00.000Z',
      ...review,
    })),
  };
}

function following(...entries: [string, string, string][]): Following {
  return {
    profiles: entries.map(([slug, uid, name]) => ({ slug, uid, name, since: '2026-01-01T00:00:00.000Z' })),
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('seguir y dejar de seguir', () => {
  it('suma el perfil con su dueño y la fecha', () => {
    const result = follow(emptyFollowing(), profile('ana', 'uid-ana', 'Ana'), 'yo', NOW);
    expect(result).toEqual({
      ok: true,
      following: {
        profiles: [{ slug: 'ana', uid: 'uid-ana', name: 'Ana', since: NOW.toISOString() }],
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it('a uno mismo no', () => {
    expect(follow(emptyFollowing(), profile('yo', 'yo', 'Yo'), 'yo', NOW)).toEqual({ ok: false, reason: 'self' });
  });

  it('con tope', () => {
    const full = following(
      ...Array.from({ length: MAX_FOLLOWING }, (_, index): [string, string, string] => [`p${index}`, `u${index}`, `P${index}`]),
    );
    expect(follow(full, profile('otra', 'uid-otra', 'Otra'), 'yo', NOW)).toEqual({ ok: false, reason: 'full' });
  });

  it('seguir dos veces no duplica, y dejar de seguir lo saca', () => {
    const once = following(['ana', 'uid-ana', 'Ana']);
    expect(follow(once, profile('ana', 'uid-ana', 'Ana'), 'yo', NOW)).toEqual({ ok: true, following: once });
    expect(unfollow(once, 'ana', NOW).profiles).toEqual([]);
  });

  it('se lee sin confiar en lo que haya', () => {
    expect(
      parseFollowing({
        profiles: [{ slug: 'ana', uid: 'u1' }, { slug: 'ana', uid: 'u1' }, { slug: '', uid: 'x' }, 'roto'],
        updatedAt: 'ayer',
      }),
    ).toEqual({
      profiles: [{ slug: 'ana', uid: 'u1', name: 'ana', since: new Date(0).toISOString() }],
      updatedAt: new Date(0).toISOString(),
    });
  });
});

describe('los casos borde', () => {
  const ana = following(['ana', 'uid-ana', 'Ana']).profiles[0];

  it('un perfil despublicado ya no está', () => {
    expect(followStatus(ana, null)).toBe('gone');
  });

  it('un slug que pasó a otra cuenta no es la misma persona', () => {
    expect(followStatus(ana, profile('ana', 'uid-otra', 'Otra Ana'))).toBe('new-owner');
    expect(followStatus(ana, profile('ana', 'uid-ana', 'Ana'))).toBe('ok');
  });
});

