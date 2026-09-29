import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { Following } from '@/types';
import { PublicProfile } from '@/lib/publicProfile';
import { MAX_FOLLOWING, follow, followingToDocument, unfollow } from '@/lib/following';

/** Dónde vive la lista: al lado de las metas y las plataformas. */
export function followingPath(uid: string): string {
  return `users/${uid}/profile/following`;
}

/**
 * Seguir y dejar de seguir perfiles públicos. Necesita cuenta: la lista es un
 * dato de la cuenta, que se sincroniza y se va con el backup.
 *
 * El cambio va al store al toque, además de a Firestore: el botón "Seguir"
 * está en la página pública, que vive fuera del marco de la app y de su
 * `SyncManager`, y sin esto no se enteraría de lo que acaba de tocar.
 */
export function useFollowing() {
  const following = useMediaStore((state) => state.following);
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const uid = isFirebaseConfigured && authState === 'authenticated' && user ? user.uid : null;

  const persist = (next: Following) => {
    useMediaStore.getState().setFollowing(next);
    if (!uid) return;
    // Sin `await`: sin conexión queda encolada y la lista ya cambió acá.
    setDoc(doc(db, followingPath(uid)), followingToDocument(next)).catch((error: unknown) => {
      console.error('[seguir] No se pudo guardar:', error);
      showToast('No pudimos guardar a quién seguís. Intentá de nuevo.', 'error');
    });
  };

  const followProfile = (profile: PublicProfile): boolean => {
    if (!uid) return false;
    const result = follow(useMediaStore.getState().following, profile, uid);
    if (!result.ok) {
      showToast(
        result.reason === 'self'
          ? 'Ese perfil es el tuyo.'
          : `Ya seguís ${MAX_FOLLOWING} perfiles, que es el tope. Dejá de seguir alguno para sumar otro.`,
        'error',
      );
      return false;
    }
    persist(result.following);
    return true;
  };

  const unfollowProfile = (slug: string) => {
    persist(unfollow(useMediaStore.getState().following, slug));
  };

  /** Reemplaza todo: lo usa la importación de un backup. */
  const replaceFollowing = (incoming: Following) => {
    persist({ ...incoming, updatedAt: new Date().toISOString() });
  };

  return { following, canFollow: uid !== null, uid, followProfile, unfollowProfile, replaceFollowing };
}
