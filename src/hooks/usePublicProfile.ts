import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import {
  PublicProfile,
  buildPublicProfile,
  isValidSlug,
  parsePublicProfile,
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
 * Publicar, actualizar y despublicar el perfil propio.
 *
 * El slug elegido se guarda en el documento del usuario, que es lo que permite
 * saber al volver si ya hay algo publicado y con qué nombre.
 */
export function usePublishProfile() {
  const { user, authState } = useAuth();
  const mediaList = useMediaStore((state) => state.mediaList);
  const [slug, setSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canPublish =
    isFirebaseConfigured && authState === 'authenticated' && Boolean(user);

  useEffect(() => {
    if (!canPublish || !user) {
      setSlug(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    getDoc(doc(db, `users/${user.uid}`))
      .then((snapshot) => {
        if (cancelled) return;
        const stored = snapshot.data()?.publicSlug;
        setSlug(typeof stored === 'string' ? stored : null);
      })
      .catch((error: unknown) => {
        console.error('[perfil público] No se pudo leer el slug:', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canPublish, user]);

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
      displayName: user.displayName || user.email?.split('@')[0] || 'Alguien',
      mediaList,
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

    setSlug(requestedSlug);
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

    setSlug(null);
  };

  return { slug, isLoading, canPublish, publish, unpublish };
}
