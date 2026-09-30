import { MediaType } from '@/types';
import { Activity, ActivityEvent, ActivityTitle, LibraryEntry } from '@/lib/activity';
import { Account, Follow, MyFollows, Reaction, Recommendation } from '@/lib/social';

/**
 * La parte social del demo: cuatro personas inventadas, con su actividad,
 * para recorrer el feed, las notificaciones y los perfiles sin cuenta.
 *
 * Coherente con la biblioteca del demo (`lib/demo.ts`): Ana puntuó varias
 * de las que el demo ya terminó —así "En común" tiene con qué calcular—, y
 * reseñó *Severance*, que el demo está viendo, para que se vea la reseña
 * tapada por spoilers. Sin pósters, por lo mismo que la biblioteca: las
 * rutas de imagen de TMDB cambian y una hardcodeada se rompe sin aviso.
 */

export const DEMO_SOCIAL_UID = 'demo';

export interface DemoPerson {
  account: Account;
  activity: Activity;
}

export interface DemoSocial {
  me: Account;
  people: DemoPerson[];
  follows: MyFollows;
  reactions: Reaction[];
  recommendations: Recommendation[];
}

const DAY = 24 * 60 * 60 * 1000;

const t = (tmdbId: number, mediaType: MediaType, title: string, releaseYear: string): ActivityTitle => ({
  tmdbId,
  mediaType,
  title,
  posterPath: null,
  releaseYear,
});

const TITLES = {
  parasitos: t(496243, 'movie', 'Parásitos', '2019'),
  breakingBad: t(1396, 'tv', 'Breaking Bad', '2008'),
  interestelar: t(157336, 'movie', 'Interestelar', '2014'),
  chernobyl: t(87108, 'tv', 'Chernobyl', '2019'),
  whiplash: t(244786, 'movie', 'Whiplash', '2014'),
  eeaao: t(545611, 'movie', 'Todo en Todas Partes al Mismo Tiempo', '2022'),
  lastOfUs: t(100088, 'tv', 'The Last of Us', '2023'),
  severance: t(95396, 'tv', 'Severance', '2022'),
  theBear: t(136315, 'tv', 'The Bear', '2022'),
  pastLives: t(666277, 'movie', 'Past Lives', '2023'),
  aftersun: t(965150, 'movie', 'Aftersun', '2022'),
  anatomia: t(915935, 'movie', 'Anatomía de una caída', '2023'),
  sociedad: t(906126, 'movie', 'La sociedad de la nieve', '2023'),
  perfectDays: t(976893, 'movie', 'Perfect Days', '2023'),
  shogun: t(126308, 'tv', 'Shōgun', '2024'),
  fleabag: t(67070, 'tv', 'Fleabag', '2016'),
};

function account(uid: string, handle: string, displayName: string, bio: string, isPrivate: boolean, now: Date): Account {
  return {
    uid,
    handle,
    displayName,
    bio,
    avatarPath: null,
    top4: [],
    private: isPrivate,
    followers: 0,
    following: 0,
    createdAt: new Date(now.getTime() - 200 * DAY).toISOString(),
    updatedAt: now.toISOString(),
  };
}

function entry(title: ActivityTitle, status: LibraryEntry['status'], rating?: number): LibraryEntry {
  return { tmdbId: title.tmdbId, mediaType: title.mediaType, status, ...(rating ? { rating } : {}) };
}

export function buildDemoSocial(now = new Date()): DemoSocial {
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * 60 * 60 * 1000).toISOString();

  const me = { ...account(DEMO_SOCIAL_UID, 'demo', 'Vos (demo)', 'Probando Qué Miro? sin cuenta.', false, now), followers: 3, following: 3 };

  const ana = account('demo-ana', 'ana-demo', 'Ana', 'Drama, cine coreano y todo lo que me haga llorar.', false, now);
  const beto = account('demo-beto', 'beto-demo', 'Beto', 'Series de a una temporada por finde.', false, now);
  const caro = account('demo-caro', 'caro-demo', 'Caro', 'Terror y documentales. Cuenta privada.', true, now);
  const dani = account('demo-dani', 'dani-demo', 'Dani', '', true, now);
  const eva = account('demo-eva', 'eva-demo', 'Eva', 'Recién llegada. Recomiéndenme algo.', false, now);

  const activity = (acc: Account, events: ActivityEvent[], extra: Partial<Activity> = {}): Activity => ({
    uid: acc.uid,
    handle: acc.handle,
    displayName: acc.displayName,
    avatarPath: null,
    updatedAt: now.toISOString(),
    events,
    watching: [],
    library: [],
    watchlist: [],
    lists: [],
    reactions: {},
    ...extra,
  });

  const anaActivity = activity(
    ana,
    [
      {
        id: 'c:m666277:a1',
        kind: 'completed',
        at: ago(0, 3),
        title: TITLES.pastLives,
        rating: 5,
        text: 'La vi dos veces en una semana. Esa escena del bar me dejó mirando el techo un rato largo.',
        tags: ['para llorar'],
      },
      {
        id: 'c:t95396:a2',
        kind: 'completed',
        at: ago(2),
        title: TITLES.severance,
        rating: 4.5,
        text: 'El final de temporada es de lo mejor que vi en años: cuando Helly se da cuenta de dónde está, todo cambia.',
      },
      { id: 'p:t136315:a3', kind: 'progress', at: ago(3), title: TITLES.theBear, episodes: 3, season: 2, episode: 7 },
      { id: 'w:m965150:a4', kind: 'added', at: ago(5), title: TITLES.aftersun },
      { id: 'c:m496243:a5', kind: 'completed', at: ago(40), title: TITLES.parasitos, rating: 5 },
    ],
    {
      watching: [{ title: TITLES.theBear, label: 'T2E7', at: ago(3) }],
      library: [
        entry(TITLES.pastLives, 'completada', 5),
        entry(TITLES.severance, 'completada', 4.5),
        entry(TITLES.parasitos, 'completada', 5),
        entry(TITLES.breakingBad, 'completada', 4.5),
        entry(TITLES.interestelar, 'completada', 3),
        entry(TITLES.chernobyl, 'completada', 5),
        entry(TITLES.whiplash, 'completada', 4.5),
        entry(TITLES.eeaao, 'completada', 4.5),
        entry(TITLES.theBear, 'viendo'),
        entry(TITLES.aftersun, 'por_ver'),
        entry(TITLES.perfectDays, 'por_ver'),
      ],
      watchlist: [
        { ...TITLES.aftersun, genres: ['Drama'], runtime: 102 },
        { ...TITLES.perfectDays, genres: ['Drama'], runtime: 124 },
      ],
      reactions: { 'c:m666277:a1': { love: ['demo-beto'], cry: ['demo-caro'] } },
    },
  );

  const betoActivity = activity(
    beto,
    [
      { id: 'p:t126308:b1', kind: 'started', at: ago(0, 8), title: TITLES.shogun, episodes: 2, season: 1, episode: 2 },
      {
        id: 'c:t67070:b2',
        kind: 'completed',
        at: ago(4),
        title: TITLES.fleabag,
        rating: 5,
        text: 'Dos temporadas perfectas. La mejor serie corta que existe, y no se discute.',
      },
      { id: 'g:2026:movies:20', kind: 'goal', at: ago(6), goal: { year: now.getFullYear(), kind: 'movies', target: 20 } },
      { id: 'a:m157336:b3', kind: 'abandoned', at: ago(9), title: TITLES.interestelar, rating: 2 },
    ],
    {
      watching: [{ title: TITLES.shogun, label: 'T1E2', at: ago(0, 8) }],
      library: [entry(TITLES.fleabag, 'completada', 5), entry(TITLES.shogun, 'viendo'), entry(TITLES.interestelar, 'abandonada', 2)],
    },
  );

  const caroActivity = activity(
    caro,
    [
      { id: 'c:m906126:c1', kind: 'completed', at: ago(1), title: TITLES.sociedad, rating: 4.5, text: 'Durísima. No la vean cenando.' },
      { id: 'c:m915935:c2', kind: 'completed', at: ago(7), title: TITLES.anatomia, rating: 4 },
    ],
    {
      watching: [{ title: TITLES.lastOfUs, label: 'T2E3', at: ago(1, 5) }],
      library: [entry(TITLES.sociedad, 'completada', 4.5), entry(TITLES.anatomia, 'completada', 4), entry(TITLES.lastOfUs, 'viendo')],
    },
  );

  const follow = (follower: string, followed: string, status: Follow['status'], createdDaysAgo: number, acceptedDaysAgo?: number): Follow => ({
    follower,
    followed,
    status,
    createdAt: ago(createdDaysAgo),
    ...(acceptedDaysAgo !== undefined ? { acceptedAt: ago(acceptedDaysAgo) } : {}),
  });

  return {
    me,
    people: [
      { account: { ...ana, followers: 12, following: 9 }, activity: anaActivity },
      { account: { ...beto, followers: 4, following: 6 }, activity: betoActivity },
      { account: { ...caro, followers: 7, following: 5 }, activity: caroActivity },
      { account: { ...dani, followers: 1, following: 2 }, activity: activity(dani, []) },
      {
        account: { ...eva, followers: 1, following: 1 },
        activity: activity(eva, [{ id: 'w:t67070:e1', kind: 'added', at: ago(2), title: TITLES.fleabag }], {
          library: [entry(TITLES.fleabag, 'por_ver')],
        }),
      },
    ],
    follows: {
      outgoing: [
        follow(me.uid, ana.uid, 'accepted', 60),
        follow(me.uid, beto.uid, 'accepted', 30),
        follow(me.uid, caro.uid, 'accepted', 20, 19),
      ],
      incoming: [
        follow(ana.uid, me.uid, 'accepted', 59),
        follow(caro.uid, me.uid, 'accepted', 18),
        follow(eva.uid, me.uid, 'accepted', 2),
        follow(dani.uid, me.uid, 'pending', 0),
      ],
    },
    reactions: [
      { reactor: ana.uid, reactorName: 'Ana', reactorHandle: ana.handle, eventId: 'c:m496243:demo', emoji: 'fire', at: ago(0, 2) },
    ],
    recommendations: [
      {
        id: `${ana.uid}_movie${TITLES.perfectDays.tmdbId}`,
        from: ana.uid,
        fromName: 'Ana',
        fromHandle: ana.handle,
        ...TITLES.perfectDays,
        mediaType: 'movie',
        note: 'Para un domingo tranquilo. Después me contás.',
        at: ago(1),
      },
    ],
  };
}
