import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useMediaStore } from '@/store';
import { useSocial, useSocialStore } from '@/hooks/useSocial';
import { fetchPublicProfile } from '@/hooks/usePublicProfile';
import { mapPool } from '@/lib/concurrency';
import { Activity, parseActivity } from '@/lib/activity';
import { FEED_TTL_MS, followStatus } from '@/lib/following';
import { PublicProfile, parsePublicProfile } from '@/lib/publicProfile';
import { ReactionId, followedUids, mutualUids } from '@/lib/social';
import {
  FeedFilter,
  FeedItem,
  FeedPerson,
  FeedSource,
  LegacySource,
  buildSocialFeed,
  legacyReviewEvent,
  socialSignals,
  watchingRow,
} from '@/lib/socialFeed';

/** Cuántas lecturas a la vez. */
const FETCH_CONCURRENCY = 6;

/**
 * Qué pasó al leer la actividad de alguien:
 * - una actividad: se pudo leer.
 * - `null`: no publicó nada todavía.
 * - `'locked'`: las reglas no la dejan leer (cuenta privada sin aceptarte, o te bloqueó).
 */
export type ActivityRead = Activity | null | 'locked';

interface SocialCacheState {
  /** De qué cuenta es: la caché de otra no se usa. */
  owner: string | null;
  activities: Record<string, ActivityRead>;
  profiles: Record<string, PublicProfile | null>;
  fetchedAt: Record<string, string>;
  saveActivity: (owner: string, uid: string, read: ActivityRead) => void;
  saveProfile: (owner: string, slug: string, profile: PublicProfile | null) => void;
  /** Se queda con lo que se sigue: lo demás no se vuelve a mirar. */
  keep: (owner: string, keys: string[]) => void;
}

const stamp = () => new Date().toISOString();

/**
 * La caché del feed, en este dispositivo: la actividad de cada uno y los
 * perfiles públicos de antes. Abrir el feed cuesta una lectura por cuenta
 * seguida, y como mucho una vez cada `FEED_TTL_MS`: entre medio sale de acá.
 * Va con el uid, como la del feed de antes: en una compu compartida no se
 * mezclan.
 */
export const useSocialCache = create<SocialCacheState>()(
  persist(
    (set) => ({
      owner: null,
      activities: {},
      profiles: {},
      fetchedAt: {},
      saveActivity: (owner, uid, read) =>
        set((state) => {
          const base = state.owner === owner ? state : { activities: {}, profiles: {}, fetchedAt: {} };
          return {
            owner,
            activities: { ...base.activities, [uid]: read },
            profiles: base.profiles,
            fetchedAt: { ...base.fetchedAt, [`a:${uid}`]: stamp() },
          };
        }),
      saveProfile: (owner, slug, profile) =>
        set((state) => {
          const base = state.owner === owner ? state : { activities: {}, profiles: {}, fetchedAt: {} };
          return {
            owner,
            activities: base.activities,
            profiles: { ...base.profiles, [slug]: profile },
            fetchedAt: { ...base.fetchedAt, [`p:${slug}`]: stamp() },
          };
        }),
      keep: (owner, keys) =>
        set((state) => {
          if (state.owner !== owner) return { owner, activities: {}, profiles: {}, fetchedAt: {} };
          const wanted = new Set(keys);
          const pick = <T,>(record: Record<string, T>, prefix: string) =>
            Object.fromEntries(Object.entries(record).filter(([key]) => wanted.has(`${prefix}${key}`)));
          return {
            activities: pick(state.activities, 'a:'),
            profiles: pick(state.profiles, 'p:'),
            fetchedAt: Object.fromEntries(Object.entries(state.fetchedAt).filter(([key]) => wanted.has(key))),
          };
        }),
    }),
    {
      name: 'que-miro-social-cache',
      // Lo guardado se lee como si viniera de Firestore: no se confía más.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SocialCacheState>) };
        const activities: Record<string, ActivityRead> = {};
        for (const [uid, value] of Object.entries(state.activities ?? {})) {
          activities[uid] = value === null || value === 'locked' ? value : parseActivity(value);
        }
        const profiles: Record<string, PublicProfile | null> = {};
        for (const [slug, value] of Object.entries(state.profiles ?? {})) {
          profiles[slug] = value === null ? null : parsePublicProfile(value);
        }
        return { ...state, activities, profiles };
      },
    },
  ),
);

/** Lee la actividad de alguien. Un rechazo de las reglas no es un error: es "cerrada". */
export async function fetchActivity(uid: string): Promise<ActivityRead> {
  try {
    const snapshot = await getDoc(doc(db, `activity/${uid}`));
    return snapshot.exists() ? parseActivity(snapshot.data()) : null;
  } catch (error) {
    if ((error as { code?: string })?.code === 'permission-denied') return 'locked';
    throw error;
  }
}

function isFresh(fetchedAt: string | undefined, now: number): boolean {
  const at = Date.parse(fetchedAt ?? '');
  return !Number.isNaN(at) && now - at <= FEED_TTL_MS;
}

export function personOf(activity: Activity): FeedPerson {
  return { uid: activity.uid, handle: activity.handle, name: activity.displayName, avatarPath: activity.avatarPath };
}

/**
 * El feed: la actividad de quienes seguís y, mientras no creen su cuenta,
 * las reseñas de los perfiles públicos que seguías antes. También da lo que
 * usan la ficha ("Lo vieron tus amigos"), Explorar y "Viendo ahora".
 */
export function useSocialFeed({ filter = 'todo' }: { filter?: FeedFilter } = {}) {
  const { mode, uid, follows, followsLoaded, isReady } = useSocial();
  const legacyFollowing = useMediaStore((state) => state.following);
  const muted = useMediaStore((state) => state.socialSettings.muted);
  const cache = useSocialCache();
  const [isLoading, setIsLoading] = useState(false);
  const [forceKey, setForceKey] = useState(0);
  const handledForce = useRef(0);

  const followed = useMemo(() => followedUids(follows), [follows]);
  const followedKey = followed.join(',');

  useEffect(() => {
    if (mode !== 'remote' || !uid || !isReady || !followsLoaded || !isFirebaseConfigured) return;
    const state = useSocialCache.getState();
    const legacySlugs = legacyFollowing.profiles.map((profile) => profile.slug);
    state.keep(uid, [...followed.map((f) => `a:${f}`), ...legacySlugs.map((slug) => `p:${slug}`)]);

    const force = forceKey !== handledForce.current;
    handledForce.current = forceKey;
    const fetchedAt = state.owner === uid ? state.fetchedAt : {};
    const now = Date.now();
    const jobs = [
      ...followed.filter((f) => force || !isFresh(fetchedAt[`a:${f}`], now)).map((f) => ({ kind: 'a' as const, key: f })),
      ...legacySlugs.filter((slug) => force || !isFresh(fetchedAt[`p:${slug}`], now)).map((slug) => ({ kind: 'p' as const, key: slug })),
    ];
    if (jobs.length === 0) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    mapPool(
      jobs,
      FETCH_CONCURRENCY,
      async (job) => {
        try {
          if (job.kind === 'a') {
            const read = await fetchActivity(job.key);
            if (!controller.signal.aborted) useSocialCache.getState().saveActivity(uid, job.key, read);
          } else {
            const profile = await fetchPublicProfile(job.key);
            if (!controller.signal.aborted) useSocialCache.getState().saveProfile(uid, job.key, profile);
          }
        } catch (error) {
          console.warn('[feed] No se pudo leer:', error);
        }
      },
      { signal: controller.signal },
    ).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
    // `followedKey` resume a `followed`: cambia solo si cambia a quién seguís.
  }, [mode, uid, isReady, followsLoaded, followedKey, legacyFollowing, forceKey]);

  const sources: FeedSource[] = useMemo(() => {
    if (cache.owner !== uid) return [];
    return followed.flatMap((f) => {
      const read = cache.activities[f];
      return read && read !== 'locked' ? [{ person: personOf(read), activity: read }] : [];
    });
  }, [followed, cache.owner, cache.activities, uid]);

  const legacy: LegacySource[] = useMemo(() => {
    if (mode !== 'remote' || cache.owner !== uid) return [];
    return legacyFollowing.profiles.flatMap((followedProfile) => {
      const profile = cache.profiles[followedProfile.slug] ?? null;
      if (!profile || followStatus(followedProfile, profile) !== 'ok') return [];
      const events = profile.reviews.map(legacyReviewEvent).filter((event) => event !== null);
      return [
        {
          person: { uid: profile.uid, handle: profile.slug, name: profile.displayName, avatarPath: null },
          events,
        },
      ];
    });
  }, [mode, cache.owner, cache.profiles, legacyFollowing, uid]);

  const mutuals = useMemo(() => mutualUids(follows), [follows]);
  const myReactions = useSocialStore((state) => state.myReactions);

  const items: FeedItem[] = useMemo(() => {
    const feed = buildSocialFeed({ sources, legacy, muted, mutuals, filter });
    // Tus reacciones recién puestas, encima de lo que dice cada instantánea.
    return feed.map((item) => {
      const mine = myReactions[`${item.person.uid}:${item.event.id}`];
      if (mine === undefined || !uid) return item;
      const reactions: Partial<Record<ReactionId, string[]>> = {};
      for (const [emoji, uids] of Object.entries(item.reactions) as [ReactionId, string[]][]) {
        const others = uids.filter((reactor) => reactor !== uid);
        if (others.length) reactions[emoji] = others;
      }
      if (mine) reactions[mine] = [...(reactions[mine] ?? []), uid];
      return { ...item, reactions };
    });
  }, [sources, legacy, muted, mutuals, filter, myReactions, uid]);

  const watching = useMemo(() => watchingRow(sources, muted), [sources, muted]);
  const signals = useMemo(() => socialSignals(sources, muted), [sources, muted]);

  return {
    sources,
    items,
    watching,
    signals,
    mutuals,
    isLoading,
    /** Relee todo, vencido o no. */
    refresh: () => setForceKey((key) => key + 1),
  };
}
