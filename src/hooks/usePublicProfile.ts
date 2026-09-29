import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { AutoPublisher, createAutoPublisher } from '@/lib/autoPublish';
import {
  MIN_PUBLISH_INTERVAL_MS,
  PUBLISH_DEBOUNCE_MS,
  PublicProfile,
  buildPublicProfile,
  isValidSlug,
  parsePublicProfile,
  sameProfileContent,
} from '@/lib/publicProfile';

/** Error de publicación con un mensaje ya listo para mostrar. */
export class PublishError extends Error {}

const profileDoc = (slug: string) => doc(db, `public_profiles/${slug}`);

/** Lee un perfil público. No necesita sesión: para eso es público. */
export async function fetchPublicProfile(
  slug: string,
): Promise<PublicProfile | null> {
  if (!isFirebaseConfigured) return null;

  const snapshot = await getDoc(profileDoc(slug));
  return snapshot.exists() ? parsePublicProfile(snapshot.data()) : null;
}

/** Carga el perfil de una ruta pública, con sus estados. */
export function usePublicProfileBySlug(slug: string | undefined) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError('');

    fetchPublicProfile(slug)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((cause: unknown) => {
        console.error('[perfil público] No se pudo leer:', cause);
        if (!cancelled) setError('No pudimos cargar este perfil.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { profile, isLoading, error };
}

/**
 * Las opciones del perfil publicado, para volver a publicarlo igual. Las
 * plataformas se leen al momento: son de la cuenta y pueden haber cambiado.
 */
function optionsOf(published: PublicProfile | null | undefined) {
  return {
    autoUpdate: published?.autoUpdate ?? true,
    includeWatchlist: published?.includeWatchlist ?? false,
    includeSubscriptions: published?.includeSubscriptions ?? false,
    subscriptions: useMediaStore.getState().subscriptions.providers.map((provider) => provider.name),
  };
}

/** El nombre con el que se publica: el de la cuenta, o el principio del mail. */
function publicName(user: User): string {
  return user.displayName || user.email?.split('@')[0] || 'Alguien';
}

/**
 * El perfil publicado de la cuenta, en vivo: cuál es su slug (lo guarda
 * `users/{uid}`) y qué dice hoy la instantánea. `undefined` mientras carga.
 *
 * En vivo y no leído una vez: lo republica sola la app, o lo cambia otro
 * dispositivo, y Ajustes tiene que mostrar la fecha de verdad.
 */
function useOwnPublishedProfile(
  uid: string | null,
): { slug: string | null; profile: PublicProfile | null } | undefined {
  const [slugState, setSlugState] = useState<{ uid: string; slug: string | null } | null>(null);
  const [profileState, setProfileState] = useState<{
    slug: string;
    profile: PublicProfile | null;
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, `users/${uid}`),
      (snapshot) => {
        const stored: unknown = snapshot.data()?.publicSlug;
        setSlugState({ uid, slug: typeof stored === 'string' && stored ? stored : null });
      },
      (error) => console.error('[perfil público] No se pudo leer el slug:', error),
    );
  }, [uid]);

  const slug = slugState && slugState.uid === uid ? slugState.slug : undefined;

  useEffect(() => {
    if (!slug) return;
    return onSnapshot(
      profileDoc(slug),
      (snapshot) =>
        setProfileState({
          slug,
          profile: snapshot.exists() ? parsePublicProfile(snapshot.data()) : null,
        }),
      (error) => console.error('[perfil público] No se pudo leer el perfil:', error),
    );
  }, [slug]);

  if (slug === undefined) return undefined;
  if (slug === null) return { slug: null, profile: null };
  if (!profileState || profileState.slug !== slug) return undefined;
  // Un slug que ya es de otra cuenta no es "mi perfil".
  const profile = profileState.profile && profileState.profile.uid === uid ? profileState.profile : null;
  return { slug, profile };
}

/**
 * Publicar, actualizar y despublicar el perfil propio.
 *
 * El slug elegido se guarda en el documento del usuario, que es lo que permite
 * saber al volver si ya hay algo publicado y con qué nombre.
 */
export function usePublishProfile() {
  const { user, authState } = useAuth();
  const mediaList = useMediaStore((state) => state.mediaList);

  const canPublish =
    isFirebaseConfigured && authState === 'authenticated' && Boolean(user);
  const own = useOwnPublishedProfile(canPublish && user ? user.uid : null);
  const slug = own?.slug ?? null;
  const published = own?.profile ?? null;
  const isLoading = canPublish && own === undefined;

  /**
   * Publica la instantánea con el slug pedido.
   *
   * @throws {PublishError} si el slug no sirve o ya es de otra persona.
   */
  const publish = async (requestedSlug: string): Promise<string> => {
    if (!canPublish || !user) {
      throw new PublishError('Necesitás iniciar sesión para publicar tu perfil.');
    }
    if (!isValidSlug(requestedSlug)) {
      throw new PublishError(
        'La dirección tiene que tener entre 3 y 24 caracteres, con letras, números y guiones.',
      );
    }

    // El chequeo de disponibilidad es del lado del cliente y por eso no alcanza
    // solo: las reglas de Firestore son las que impiden de verdad escribir
    // sobre el perfil de otra persona.
    if (requestedSlug !== slug) {
      const existing = await getDoc(profileDoc(requestedSlug));
      if (existing.exists() && existing.data()?.uid !== user.uid) {
        throw new PublishError('Esa dirección ya está tomada. Probá con otra.');
      }
    }

    const profile = buildPublicProfile({
      slug: requestedSlug,
      uid: user.uid,
      displayName: publicName(user),
      mediaList,
      // Las opciones viajan con el perfil: cambiar de dirección no las resetea.
      ...optionsOf(published),
    });

    try {
      await setDoc(profileDoc(requestedSlug), profile);
      // Si cambió de dirección, la vieja se borra para no dejar dos copias del
      // mismo perfil dando vueltas.
      if (slug && slug !== requestedSlug) {
        await deleteDoc(profileDoc(slug)).catch(() => {});
      }
      await setDoc(
        doc(db, `users/${user.uid}`),
        { publicSlug: requestedSlug },
        { merge: true },
      );
    } catch (error) {
      console.error('[perfil público] No se pudo publicar:', error);
      throw new PublishError('No pudimos publicar tu perfil. Intentá de nuevo.');
    }

    return requestedSlug;
  };

  /** Saca el perfil de circulación. */
  const unpublish = async () => {
    if (!canPublish || !user || !slug) return;

    try {
      await deleteDoc(profileDoc(slug));
      await setDoc(
        doc(db, `users/${user.uid}`),
        { publicSlug: null },
        { merge: true },
      );
    } catch (error) {
      console.error('[perfil público] No se pudo despublicar:', error);
      throw new PublishError('No pudimos despublicar tu perfil.');
    }
  };

  /**
   * Prende o apaga "Mantener actualizado". Sin esperar a Firestore: sin
   * conexión queda encolado como cualquier otra escritura.
   */
  const setAutoUpdate = (autoUpdate: boolean) => {
    if (!canPublish || !slug) return;
    setDoc(profileDoc(slug), { autoUpdate }, { merge: true }).catch((error: unknown) => {
      console.error('[perfil público] No se pudo guardar la opción:', error);
    });
  };

  /**
   * "Incluir mi Por Ver" e "Incluir mis plataformas". Se republica al toque
   * y entero, no solo la opción: quien espera cruzar su Por Ver con el tuyo
   * no tiene por qué esperar los minutos de la actualización sola.
   */
  const setSharing = (change: { includeWatchlist?: boolean; includeSubscriptions?: boolean }) => {
    if (!canPublish || !user || !slug || !published) return;
    const profile = buildPublicProfile({
      slug,
      uid: user.uid,
      displayName: publicName(user),
      mediaList: useMediaStore.getState().mediaList,
      ...optionsOf(published),
      ...change,
    });
    setDoc(profileDoc(slug), profile).catch((error: unknown) => {
      console.error('[perfil público] No se pudo guardar la opción:', error);
    });
  };

  return { slug, published, isLoading, canPublish, publish, unpublish, setAutoUpdate, setSharing };
}

/**
 * Republica el perfil solo, cuando cambia algo de lo que muestra (ver
 * `lib/autoPublish.ts`).
 *
 * Vive en el marco de la app: las reseñas y los puntajes cambian desde
 * cualquier pantalla. Arma la instantánea con la biblioteca de la cuenta y la
 * compara con la publicada; si son iguales, no escribe. Espera a que la
 * biblioteca haya bajado del servidor: antes, los números podrían salir a
 * medias.
 */
export function useAutoPublishProfile() {
  const { user, authState } = useAuth();
  const uid = isFirebaseConfigured && authState === 'authenticated' && user ? user.uid : null;
  const own = useOwnPublishedProfile(uid);
  const mediaList = useMediaStore((state) => state.mediaList);
  const syncedUid = useMediaStore((state) => state.syncedUid);
  const isOnline = useOnlineStatus();

  // Lo publicado, para el que decide cuándo publicar: lo lee al momento, no
  // cuando se armó.
  const latest = useRef<PublicProfile | null>(null);
  latest.current = own?.profile ?? null;

  const publisher = useRef<AutoPublisher<PublicProfile> | null>(null);

  useEffect(() => {
    if (!uid) return;
    const auto = createAutoPublisher<PublicProfile>({
      debounceMs: PUBLISH_DEBOUNCE_MS,
      minIntervalMs: MIN_PUBLISH_INTERVAL_MS,
      lastPublishedAt: () => {
        const at = latest.current ? Date.parse(latest.current.publishedAt) : NaN;
        return Number.isNaN(at) ? null : at;
      },
      isPublished: (candidate) =>
        latest.current !== null && sameProfileContent(latest.current, candidate),
      publish: (candidate) => {
        // Sin `await`: la escritura va a la caché local al toque, y el
        // snapshot trae la instantánea nueva para la próxima comparación.
        setDoc(profileDoc(candidate.slug), {
          ...candidate,
          publishedAt: new Date().toISOString(),
        }).catch((error: unknown) =>
          console.warn('[perfil público] No se pudo republicar:', error),
        );
      },
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    });
    publisher.current = auto;
    return () => {
      auto.cancel();
      publisher.current = null;
    };
  }, [uid]);

  useEffect(() => {
    if (isOnline) publisher.current?.online();
  }, [isOnline]);

  const published = own?.profile ?? null;
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const candidate = useMemo(() => {
    if (!uid || !user || !published || !published.autoUpdate || syncedUid !== uid) return null;
    return buildPublicProfile({
      slug: published.slug,
      uid,
      displayName: publicName(user),
      mediaList,
      ...optionsOf(published),
    });
    // `subscriptions` entra por `optionsOf`, que lo lee del store.
  }, [uid, user, published, syncedUid, mediaList, subscriptions]);

  useEffect(() => {
    if (!candidate) {
      publisher.current?.cancel();
      return;
    }
    if (latest.current && sameProfileContent(latest.current, candidate)) return;
    publisher.current?.schedule(candidate);
  }, [candidate]);
}

/**
 * Borra el perfil publicado de una cuenta. Lo usa el borrado de cuenta:
 * `public_profiles` está fuera de `users/`, y sin esto el perfil de alguien
 * que se fue seguiría a la vista de cualquiera.
 */
export async function deletePublicProfile(uid: string): Promise<void> {
  const user = await getDoc(doc(db, `users/${uid}`));
  const slug: unknown = user.data()?.publicSlug;
  if (typeof slug !== 'string' || !slug) return;
  const profile = await getDoc(profileDoc(slug));
  if (profile.exists() && profile.data()?.uid === uid) {
    await deleteDoc(profileDoc(slug));
  }
}
