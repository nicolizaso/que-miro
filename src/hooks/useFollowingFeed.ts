import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFollowing } from '@/hooks/useFollowing';
import { fetchPublicProfile } from '@/hooks/usePublicProfile';
import { mapPool } from '@/lib/concurrency';
import { PublicProfile, parsePublicProfile } from '@/lib/publicProfile';
import { FollowStatus, buildFollowingFeed, followStatus, staleSlugs } from '@/lib/following';

/** Cuántos perfiles se leen a la vez. */
const FETCH_CONCURRENCY = 6;

interface FeedCacheState {
  /** De qué cuenta es: la caché de otra no se usa. */
  uid: string | null;
  /** Lo último que se leyó de cada perfil; `null` si no estaba publicado. */
  profiles: Record<string, PublicProfile | null>;
  fetchedAt: Record<string, string>;
  save: (uid: string, slug: string, profile: PublicProfile | null) => void;
  /** Se queda solo con los que se siguen: lo demás no se vuelve a mirar. */
  keep: (uid: string, slugs: string[]) => void;
}

/**
 * La caché del feed, en este dispositivo.
 *
 * Abrir el feed cuesta una lectura de Firestore por perfil seguido. Con esto,
 * volver a abrirlo dentro de `FEED_TTL_MS` no cuesta ninguna: sale de acá, y
 * se relee solo lo vencido. Es del dispositivo como una preferencia, pero va
 * con el uid: en una compu compartida no se mezclan los feeds.
 */
const useFeedCache = create<FeedCacheState>()(
  persist(
    (set) => ({
      uid: null,
      profiles: {},
      fetchedAt: {},
      save: (uid, slug, profile) =>
        set((state) => {
          const base = state.uid === uid ? state : { profiles: {}, fetchedAt: {} };
          return {
            uid,
            profiles: { ...base.profiles, [slug]: profile },
            fetchedAt: { ...base.fetchedAt, [slug]: new Date().toISOString() },
          };
        }),
      keep: (uid, slugs) =>
        set((state) => {
          if (state.uid !== uid) return { uid, profiles: {}, fetchedAt: {} };
          const wanted = new Set(slugs);
          const pick = <T,>(record: Record<string, T>) =>
            Object.fromEntries(Object.entries(record).filter(([slug]) => wanted.has(slug)));
          return { profiles: pick(state.profiles), fetchedAt: pick(state.fetchedAt) };
        }),
    }),
    {
      name: 'que-miro-feed-cache',
      // Lo guardado se lee como cualquier perfil público: no se confía en
      // `localStorage` más que en Firestore.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<FeedCacheState>) };
        const profiles: Record<string, PublicProfile | null> = {};
        for (const [slug, value] of Object.entries(state.profiles ?? {})) {
          profiles[slug] = value === null ? null : parsePublicProfile(value);
        }
        return { ...state, profiles };
      },
    },
  ),
);

/**
 * El feed de los perfiles que seguís: sus reseñas mezcladas por fecha, y cómo
 * está cada uno (ver `followStatus`).
 */
export function useFollowingFeed() {
  const { following, uid } = useFollowing();
  const cache = useFeedCache();
  const [isLoading, setIsLoading] = useState(false);
  // "Actualizar" relee todo, vencido o no, una vez.
  const [forceKey, setForceKey] = useState(0);
  const handledForce = useRef(0);

  useEffect(() => {
    if (!uid) return;
    const state = useFeedCache.getState();
    state.keep(uid, following.profiles.map((profile) => profile.slug));

    const force = forceKey !== handledForce.current;
    handledForce.current = forceKey;
    const fetchedAt = state.uid === uid ? state.fetchedAt : {};
    const toFetch = force
      ? following.profiles.map((profile) => profile.slug)
      : staleSlugs(following, fetchedAt, Date.now());
    if (toFetch.length === 0) {
      // Una corrida anterior cortada a la mitad pudo dejar la ruedita puesta.
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    mapPool(
      toFetch,
      FETCH_CONCURRENCY,
      async (slug) => {
        const profile = await fetchPublicProfile(slug);
        if (!controller.signal.aborted) useFeedCache.getState().save(uid, slug, profile);
      },
      { signal: controller.signal },
    ).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [uid, following, forceKey]);

  const profiles = useMemo(() => {
    const map = new Map<string, PublicProfile | null>();
    if (cache.uid !== uid) return map;
    for (const [slug, profile] of Object.entries(cache.profiles)) map.set(slug, profile);
    return map;
  }, [cache.uid, cache.profiles, uid]);

  const items = useMemo(() => buildFollowingFeed(following, profiles), [following, profiles]);

  /** Cómo está cada uno; `undefined` mientras no se leyó nunca. */
  const statuses = useMemo(() => {
    const result = new Map<string, FollowStatus | undefined>();
    for (const followed of following.profiles) {
      result.set(
        followed.slug,
        profiles.has(followed.slug) ? followStatus(followed, profiles.get(followed.slug) ?? null) : undefined,
      );
    }
    return result;
  }, [following, profiles]);

  return {
    following,
    items,
    statuses,
    isLoading,
    refresh: () => setForceKey((key) => key + 1),
  };
}
