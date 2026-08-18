import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { SavedMedia, MediaStatus, Review } from '@/types';

/**
 * Firestore rechaza documentos con `undefined`. Los campos opcionales de
 * `SavedMedia` (poster, backdrop, review) pueden venir así, por eso se
 * normalizan a `null` antes de escribir.
 */
function sanitizeData<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === undefined ? null : sanitizeData(value);
  }
  return result as T;
}

/**
 * Punto único para modificar la biblioteca.
 *
 * Con sesión iniciada escribe en Firestore y deja que `SyncManager` refresque
 * el estado local; sin sesión escribe directo en el store local (modo invitado).
 */
export function useMediaActions() {
  const {
    addMedia: localAdd,
    updateStatus: localUpdate,
    addReview: localReview,
    removeMedia: localRemove,
  } = useMediaStore();
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const mediaDoc = (tmdbId: number) =>
    doc(db, `users/${user!.uid}/saved_media/${tmdbId}`);

  /** Ejecuta una escritura remota avisando al usuario si falla. */
  const withErrorToast = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      console.error('[media] No se pudo guardar el cambio:', error);
      showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
    }
  };

  const addMedia = async (media: Omit<SavedMedia, 'updatedAt'>) => {
    if (!isAuth) return localAdd(media);
    const fullMedia = { ...media, updatedAt: new Date().toISOString() };
    await withErrorToast(async () => {
      await setDoc(mediaDoc(media.tmdbId), sanitizeData(fullMedia));
    });
  };

  const updateStatus = async (tmdbId: number, status: MediaStatus) => {
    if (!isAuth) return localUpdate(tmdbId, status);
    await withErrorToast(async () => {
      await setDoc(
        mediaDoc(tmdbId),
        sanitizeData({ status, updatedAt: new Date().toISOString() }),
        { merge: true },
      );
    });
  };

  const addReview = async (tmdbId: number, review: Review) => {
    if (!isAuth) return localReview(tmdbId, review);
    await withErrorToast(async () => {
      await setDoc(
        mediaDoc(tmdbId),
        sanitizeData({
          review,
          status: 'completada',
          updatedAt: new Date().toISOString(),
        }),
        { merge: true },
      );
    });
  };

  const removeMedia = async (tmdbId: number) => {
    if (!isAuth) return localRemove(tmdbId);
    await withErrorToast(async () => {
      await deleteDoc(mediaDoc(tmdbId));
    });
  };

  return { addMedia, updateStatus, addReview, removeMedia };
}
