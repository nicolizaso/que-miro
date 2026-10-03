import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import {
  Account,
  MyFollows,
  Reaction,
  ReactionId,
  Recommendation,
  accountToDocument,
  emptyFollows,
  followCounts,
  followId,
  followToDocument,
  newFollow,
  parseAccount,
  parseFollow,
  parseReaction,
  parseRecommendation,
} from '@/lib/social';
import { followingPath } from '@/hooks/useFollowing';
import { followingToDocument } from '@/lib/following';

/**
 * El estado social de la cuenta, en vivo: tu tarjeta, a quién seguís, quién
 * te sigue, las reacciones a lo tuyo, lo que te recomendaron y a quién
 * bloqueaste. No se persiste: es lo que dice Firestore ahora, y la caché
 * local de Firestore ya cubre el arranque sin red.
 */

export type SocialMode = 'off' | 'remote';

interface SocialState {
  mode: SocialMode;
  uid: string | null;
  /** `undefined` mientras se lee; `null` si todavía no creó su usuario. */
  account: Account | null | undefined;
  follows: MyFollows;
  /** Llegaron las dos consultas de `follows` al menos una vez. */
  followsLoaded: boolean;
  /** Las reacciones a tu actividad, de la más nueva a la más vieja. */
  reactions: Reaction[];
  recommendations: Recommendation[];
  blocked: string[];
  /**
   * Tus reacciones recién puestas, por `{dueño}:{evento}`. La instantánea de
   * la otra persona las cuenta recién cuando su app la republica; mientras
   * tanto, esto hace que la tuya se vea al toque. `null` es "la saqué".
   */
  myReactions: Record<string, ReactionId | null>;
  /** Las tarjetas de otras cuentas que ya se leyeron en esta sesión. */
  people: Record<string, Account | null>;
  /** Firestore rechazó las lecturas: las reglas nuevas no están publicadas. */
  unavailable: boolean;
}

const initial: SocialState = {
  mode: 'off',
  uid: null,
  account: undefined,
  follows: emptyFollows(),
  followsLoaded: false,
  reactions: [],
  recommendations: [],
  blocked: [],
  myReactions: {},
  people: {},
  unavailable: false,
};

export const useSocialStore = create<SocialState>()(() => ({ ...initial }));

const setSocial = (patch: Partial<SocialState>) => useSocialStore.setState(patch);

/** Una tarjeta ajena, leída una vez por sesión. */
export async function loadPerson(uid: string): Promise<Account | null> {
  const state = useSocialStore.getState();
  if (uid in state.people) return state.people[uid];
  if (!isFirebaseConfigured) return null;
  try {
    const snapshot = await getDoc(doc(db, `accounts/${uid}`));
    const account = snapshot.exists() ? parseAccount(snapshot.data()) : null;
    setSocial({ people: { ...useSocialStore.getState().people, [uid]: account } });
    return account;
  } catch (error) {
    console.warn('[social] No se pudo leer la cuenta:', error);
    return null;
  }
}

/** Busca una cuenta por su usuario exacto. */
export async function findByHandle(handle: string): Promise<Account | null> {
  const state = useSocialStore.getState();
  if (!isFirebaseConfigured) return null;
  const snapshot = await getDoc(doc(db, `handles/${handle}`));
  const uid: unknown = snapshot.data()?.uid;
  if (typeof uid !== 'string') return null;
  if (uid === state.uid && state.account) return state.account;
  // Una búsqueda es una pregunta de ahora: se relee aunque esté en caché.
  const account = await getDoc(doc(db, `accounts/${uid}`));
  const parsed = account.exists() ? parseAccount(account.data()) : null;
  setSocial({ people: { ...useSocialStore.getState().people, [uid]: parsed } });
  return parsed;
}

/**
 * Pasa a `follows` a quienes seguías por su perfil público, una vez que esa
 * persona crea su cuenta. Lo que no se puede pasar todavía se queda en la
 * lista vieja: sus reseñas siguen llegando al feed como antes.
 */
async function migrateLegacyFollowing(uid: string, follows: MyFollows) {
  const { following } = useMediaStore.getState();
  if (following.profiles.length === 0) return;
  const followed = new Set(follows.outgoing.map((follow) => follow.followed));
  const keep: typeof following.profiles = [];
  let changed = false;

  for (const profile of following.profiles) {
    if (profile.uid === uid || followed.has(profile.uid)) {
      changed = true;
      continue;
    }
    const target = await loadPerson(profile.uid);
    if (!target) {
      keep.push(profile);
      continue;
    }
    try {
      await setDoc(doc(db, `follows/${followId(uid, target.uid)}`), followToDocument(newFollow(uid, target)));
      changed = true;
    } catch (error) {
      console.warn('[social] No se pudo pasar a quien seguías:', error);
      keep.push(profile);
    }
  }

  if (!changed) return;
  const next = { profiles: keep, updatedAt: new Date().toISOString() };
  useMediaStore.getState().setFollowing(next);
  setDoc(doc(db, followingPath(uid)), followingToDocument(next)).catch((error: unknown) =>
    console.warn('[social] No se pudo actualizar la lista vieja:', error),
  );
}

/**
 * Engancha el estado social a Firestore mientras haya sesión. Vive en el
 * marco de la app, como la sincronización de la biblioteca.
 */
export function useSocialSync() {
  const { user, authState } = useAuth();
  const uid = isFirebaseConfigured && authState === 'authenticated' && user ? user.uid : null;

  useEffect(() => {
    if (!uid) {
      setSocial({ ...initial });
      return;
    }

    setSocial({ ...initial, mode: 'remote', uid });
    let outgoingLoaded = false;
    let incomingLoaded = false;

    const onError = (what: string) => (error: unknown) => {
      console.error(`[social] No se pudo leer ${what}:`, error);
      if ((error as { code?: string })?.code === 'permission-denied') setSocial({ unavailable: true });
    };

    const unsubscribers = [
      onSnapshot(
        doc(db, `accounts/${uid}`),
        (snapshot) => setSocial({ account: snapshot.exists() ? parseAccount(snapshot.data()) : null }),
        (error) => {
          onError('tu cuenta')(error);
          setSocial({ account: null });
        },
      ),
      onSnapshot(
        query(collection(db, 'follows'), where('follower', '==', uid)),
        (snapshot) => {
          outgoingLoaded = true;
          const outgoing = snapshot.docs.map((d) => parseFollow(d.data())).filter((f) => f !== null);
          const { follows } = useSocialStore.getState();
          setSocial({ follows: { ...follows, outgoing }, followsLoaded: outgoingLoaded && incomingLoaded });
        },
        onError('a quién seguís'),
      ),
      onSnapshot(
        query(collection(db, 'follows'), where('followed', '==', uid)),
        (snapshot) => {
          incomingLoaded = true;
          const incoming = snapshot.docs.map((d) => parseFollow(d.data())).filter((f) => f !== null);
          const { follows } = useSocialStore.getState();
          setSocial({ follows: { ...follows, incoming }, followsLoaded: outgoingLoaded && incomingLoaded });
        },
        onError('quién te sigue'),
      ),
      onSnapshot(
        collection(db, `users/${uid}/recommendations`),
        (snapshot) =>
          setSocial({
            recommendations: snapshot.docs
              .map((d) => parseRecommendation(d.id, d.data()))
              .filter((rec) => rec !== null)
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
          }),
        onError('las recomendaciones'),
      ),
      onSnapshot(
        collection(db, `users/${uid}/blocks`),
        (snapshot) => setSocial({ blocked: snapshot.docs.map((d) => d.id) }),
        onError('los bloqueos'),
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [uid]);

  const account = useSocialStore((state) => state.account);
  const hasAccount = Boolean(account);
  const follows = useSocialStore((state) => state.follows);
  const followsLoaded = useSocialStore((state) => state.followsLoaded);
  const mode = useSocialStore((state) => state.mode);

  // Las reacciones a tu actividad: recién cuando hay cuenta, que es cuando
  // hay actividad a la que reaccionar.
  useEffect(() => {
    if (!uid || !hasAccount) return;
    return onSnapshot(
      query(collection(db, `activity/${uid}/reactions`), orderBy('at', 'desc'), limit(300)),
      (snapshot) =>
        setSocial({
          reactions: snapshot.docs.map((d) => parseReaction(d.data())).filter((r) => r !== null),
        }),
      (error) => console.error('[social] No se pudieron leer las reacciones:', error),
    );
  }, [uid, hasAccount]);

  // Los números de la tarjeta los cuenta el dueño: nadie más puede listar
  // sus relaciones. Se escriben solo si cambiaron.
  useEffect(() => {
    if (mode !== 'remote' || !uid || !account || !followsLoaded) return;
    const counts = followCounts(follows);
    if (counts.followers === account.followers && counts.following === account.following) return;
    setDoc(
      doc(db, `accounts/${uid}`),
      accountToDocument({ ...account, ...counts, updatedAt: new Date().toISOString() }),
    ).catch((error: unknown) => console.warn('[social] No se pudieron actualizar los números:', error));
  }, [mode, uid, account, follows, followsLoaded]);

  // Quienes seguías por su perfil público pasan a `follows`, una vez por sesión.
  const migrated = useRef(false);
  useEffect(() => {
    if (mode !== 'remote' || !uid || !account || !followsLoaded || migrated.current) return;
    migrated.current = true;
    void migrateLegacyFollowing(uid, follows);
  }, [mode, uid, account, follows, followsLoaded]);
}

/** Lo que casi todas las pantallas sociales necesitan. */
export function useSocial() {
  const mode = useSocialStore((state) => state.mode);
  const uid = useSocialStore((state) => state.uid);
  const account = useSocialStore((state) => state.account);
  const follows = useSocialStore((state) => state.follows);
  const followsLoaded = useSocialStore((state) => state.followsLoaded);
  const reactions = useSocialStore((state) => state.reactions);
  const recommendations = useSocialStore((state) => state.recommendations);
  const blocked = useSocialStore((state) => state.blocked);
  const unavailable = useSocialStore((state) => state.unavailable);
  return {
    mode,
    uid,
    account,
    follows,
    followsLoaded,
    reactions,
    recommendations,
    blocked,
    unavailable,
    /** Hay sesión y ya eligió su usuario: puede usar lo social. */
    isReady: mode !== 'off' && Boolean(account),
    /** Hay sesión pero todavía no eligió usuario. */
    needsOnboarding: mode === 'remote' && account === null,
    isLoading: mode === 'remote' && account === undefined,
  };
}

/** Borra un documento sin esperar, avisando en la consola si falla. */
export function removeQuietly(path: string, what: string) {
  deleteDoc(doc(db, path)).catch((error: unknown) => console.warn(`[social] No se pudo borrar ${what}:`, error));
}
