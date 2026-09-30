import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { Activity, ActivityEvent } from './activity';
import {
  FeedPerson,
  FeedSource,
  buildSocialFeed,
  eventHeadline,
  friendStatusText,
  friendsOnTitle,
  isSpoilerRisk,
  legacyReviewEvent,
  namesText,
  progressDetail,
  socialSignals,
  watchingRow,
} from './socialFeed';

const title = (tmdbId: number, name = `Título ${tmdbId}`) => ({
  tmdbId,
  mediaType: 'movie' as const,
  title: name,
  posterPath: null,
  releaseYear: '2024',
});

function person(uid: string, name = uid): FeedPerson {
  return { uid, handle: uid, name, avatarPath: null };
}

function activity(uid: string, events: ActivityEvent[], extra: Partial<Activity> = {}): Activity {
  return { uid, handle: uid, displayName: uid, avatarPath: null, updatedAt: '', events, watching: [], library: [], watchlist: [], lists: [], reactions: {}, ...extra };
}

const completed = (id: string, at: string, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  kind: 'completed',
  at,
  title: title(1),
  ...extra,
});

describe('buildSocialFeed', () => {
  const sources: FeedSource[] = [
    {
      person: person('ana', 'Ana'),
      activity: activity('ana', [completed('e1', '2026-09-10T00:00:00.000Z', { text: 'Hermosa', rating: 5 })], {
        reactions: { e1: { fire: ['beto'] } },
      }),
    },
    {
      person: person('beto', 'Beto'),
      activity: activity('beto', [{ id: 'e2', kind: 'added', at: '2026-09-12T00:00:00.000Z', title: title(2) }]),
    },
  ];

  it('mezcla por fecha y trae las reacciones de cada evento', () => {
    const feed = buildSocialFeed({ sources });
    expect(feed.map((item) => item.event.id)).toEqual(['e2', 'e1']);
    expect(feed[1].reactions).toEqual({ fire: ['beto'] });
    expect(feed[1].canReact).toBe(true);
  });

  it('silenciados afuera; filtros de reseñas y de amigos', () => {
    expect(buildSocialFeed({ sources, muted: ['beto'] }).map((item) => item.person.uid)).toEqual(['ana']);
    expect(buildSocialFeed({ sources, filter: 'resenas' }).map((item) => item.event.id)).toEqual(['e1']);
    expect(buildSocialFeed({ sources, filter: 'amigos', mutuals: ['beto'] }).map((item) => item.event.id)).toEqual(['e2']);
  });

  it('las reseñas de antes entran sin reacciones, salvo que ya venga su actividad', () => {
    const legacyEvent = completed('r:1', '2026-09-11T00:00:00.000Z', { text: 'De antes' });
    const feed = buildSocialFeed({
      sources,
      legacy: [
        { person: person('caro', 'Caro'), events: [legacyEvent] },
        { person: person('ana', 'Ana'), events: [legacyEvent] },
      ],
    });
    const legacy = feed.filter((item) => !item.canReact);
    expect(legacy.map((item) => item.person.uid)).toEqual(['caro']);
  });
});

describe('titulares', () => {
  it('dice lo que pasó, con los puntajes como se escriben acá', () => {
    expect(eventHeadline('Ana', completed('e', '', { rating: 4.5 }))).toBe('Ana le puso 4,5 a Título 1');
    expect(eventHeadline('Ana', completed('e', '', { rating: 4, rewatch: true }))).toBe('Ana volvió a ver Título 1 y le puso 4');
    expect(eventHeadline('Ana', completed('e', ''))).toBe('Ana terminó Título 1');
    expect(eventHeadline('Ana', { id: 'p', kind: 'progress', at: '', title: title(1), episodes: 1 })).toBe(
      'Ana vio 1 episodio de Título 1',
    );
    expect(eventHeadline('Ana', { id: 'g', kind: 'goal', at: '', goal: { year: 2026, kind: 'movies', target: 50 } })).toBe(
      'Ana cumplió su meta de 50 películas en 2026',
    );
    expect(eventHeadline('Ana', { id: 'l', kind: 'list', at: '', list: { id: 'x', name: 'Terror', count: 3 } })).toBe(
      'Ana publicó la lista "Terror"',
    );
  });

  it('el detalle de episodios', () => {
    expect(progressDetail({ id: 'p', kind: 'started', at: '', season: 1, episode: 3 })).toBe('Hasta T1E3');
    expect(progressDetail(completed('e', ''))).toBeNull();
  });
});

describe('viendo ahora y señales', () => {
  const sources: FeedSource[] = [
    {
      person: person('ana', 'Ana'),
      activity: activity('ana', [completed('e1', '2026-09-10T00:00:00.000Z', { rating: 5, title: title(9) })], {
        watching: [{ title: title(5), at: '2026-09-20T00:00:00.000Z' }],
      }),
    },
    {
      person: person('beto', 'Beto'),
      activity: activity('beto', [completed('e2', '2026-09-11T00:00:00.000Z', { rating: 4.5, title: title(9) })], {
        watching: [{ title: title(6), at: '2026-09-25T00:00:00.000Z' }],
      }),
    },
  ];

  it('una burbuja por persona, la más reciente primero', () => {
    expect(watchingRow(sources).map((bubble) => bubble.person.uid)).toEqual(['beto', 'ana']);
  });

  it('junta a quienes vieron lo mismo', () => {
    const signals = socialSignals(sources);
    expect(signals.loved).toEqual([{ title: title(9), names: ['Beto', 'Ana'] }]);
    expect(signals.watching).toHaveLength(2);
  });

  it('nombra a los primeros y cuenta el resto', () => {
    expect(namesText(['Ana'])).toBe('Ana');
    expect(namesText(['Ana', 'Beto'])).toBe('Ana y Beto');
    expect(namesText(['Ana', 'Beto', 'Caro', 'Dani'])).toBe('Ana, Beto y 2 más');
  });
});

describe('lo vieron tus amigos', () => {
  it('del resumen, o de los eventos si no lo comparte', () => {
    const sources: FeedSource[] = [
      {
        person: person('ana', 'Ana'),
        activity: activity('ana', [], { library: [{ tmdbId: 1, mediaType: 'movie', status: 'por_ver' }] }),
      },
      {
        person: person('beto', 'Beto'),
        activity: activity('beto', [completed('e', '2026-09-01T00:00:00.000Z', { rating: 4, text: 'Buena' })]),
      },
      { person: person('caro'), activity: activity('caro', []) },
    ];
    const friends = friendsOnTitle(sources, 1, 'movie');
    expect(friends.map((friend) => friend.person.uid)).toEqual(['beto', 'ana']);
    expect(friends[0]).toMatchObject({ review: 'Buena', entry: { status: 'completada', rating: 4 } });
    expect(friendStatusText(friends[0].entry)).toBe('le puso 4');
    expect(friendStatusText(friends[1].entry)).toBe('lo tiene en Por Ver');
  });
});

describe('spoilers', () => {
  const mine = (status: SavedMedia['status']): SavedMedia => ({
    tmdbId: 1,
    mediaType: 'movie',
    title: 'X',
    posterPath: null,
    backdropPath: null,
    releaseYear: '',
    genres: [],
    status,
    updatedAt: '',
  });
  const review = completed('e', '', { text: 'El final es que...' });

  it('tapa la reseña de algo que tenés pendiente', () => {
    expect(isSpoilerRisk(review, [mine('por_ver')])).toBe(true);
    expect(isSpoilerRisk(review, [mine('viendo')])).toBe(true);
    expect(isSpoilerRisk(review, [mine('completada')])).toBe(false);
    expect(isSpoilerRisk(review, [])).toBe(false);
    expect(isSpoilerRisk(completed('e', ''), [mine('por_ver')])).toBe(false);
  });
});

describe('reseñas de antes', () => {
  it('se convierten en eventos; sin tipo no se pueden usar', () => {
    const base = {
      id: 'r1',
      tmdbId: 1,
      title: 'X',
      posterPath: null,
      releaseYear: '',
      rating: 4,
      text: 'Bien',
      tags: [],
      completedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(legacyReviewEvent({ ...base, mediaType: 'movie' })).toMatchObject({ id: 'r:r1', kind: 'completed', rating: 4 });
    expect(legacyReviewEvent(base)).toBeNull();
  });
});
