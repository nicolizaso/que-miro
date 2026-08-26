import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { SavedMedia, MediaStatus, Review } from '@/types';

/** Tope de operaciones por `writeBatch` en Firestore. */
const BATCH_LIMIT = 400;

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

  /**
   * Guarda varios títulos de una. Lo usa la importación de un backup.
   *
   * Escribe en lotes de {@link BATCH_LIMIT} porque un `writeBatch` de Firestore
   * no admite más de 500 operaciones, y una biblioteca importada puede pasarse.
   */
  const saveMany = async (items: SavedMedia[]) => {
    if (items.length === 0) return;

    if (!isAuth) {
      const current = useMediaStore.getState().mediaList;
      const byId = new Map(current.map((media) => [media.tmdbId, media]));
      for (const item of items) byId.set(item.tmdbId, item);
      useMediaStore.getState().setMediaList(Array.from(byId.values()));
      return;
    }

    await withErrorToast(async () => {
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const item of items.slice(i, i + BATCH_LIMIT)) {
          batch.set(mediaDoc(item.tmdbId), sanitizeData(item));
        }
        await batch.commit();
      }
    });
  };

  return { addMedia, updateStatus, addReview, removeMedia, saveMany };
}
