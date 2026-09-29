import { doc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { Collection, SavedMedia } from '@/types';
import { newWatchId } from '@/lib/schema';
import { publicListPath } from '@/lib/publicList';

/** Tope de operaciones por `writeBatch` en Firestore. */
const BATCH_LIMIT = 400;

export const MAX_COLLECTION_NAME = 40;

/**
 * Acciones sobre las colecciones.
 *
 * El modelo tiene dos mitades: la colección en sí —solo su nombre— vive en
 * `users/{uid}/collections`, y la pertenencia vive en cada título, en
 * `media.collections`. Se eligió así porque la operación frecuente es "agregar
 * este título a esta lista": con la pertenencia del lado del título es una sola
 * escritura, mientras que con un array de ids en la colección habría que leer,
 * modificar y reescribir un documento que crece sin techo.
 *
 * El precio se paga al borrar una colección, que obliga a limpiar la referencia
 * en cada título que la tuviera. Es una operación mucho más rara.
 */
export function useCollectionActions() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const collectionDoc = (id: string) =>
    doc(db, `users/${user!.uid}/collections/${id}`);
  const mediaDoc = (tmdbId: number) =>
    doc(db, `users/${user!.uid}/saved_media/${tmdbId}`);

  const withErrorToast = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      console.error('[colecciones] No se pudo guardar el cambio:', error);
      showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
    }
  };

  /** Crea una colección y devuelve su id, o `null` si el nombre no sirve. */
  const createCollection = async (rawName: string): Promise<string | null> => {
    const name = rawName.trim().slice(0, MAX_COLLECTION_NAME);
    if (!name) return null;

    const existing = useMediaStore
      .getState()
      .collections.find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
    if (existing) {
      showToast(`Ya tenés una lista llamada "${existing.name}".`, 'error');
      return null;
    }

    const now = new Date().toISOString();
    const collection: Collection = {
      id: newWatchId(),
      name,
      createdAt: now,
      updatedAt: now,
    };

    if (!isAuth) {
      useMediaStore.getState().addCollection(collection);
      return collection.id;
    }

    let saved = false;
    await withErrorToast(async () => {
      await setDoc(collectionDoc(collection.id), collection);
      saved = true;
    });
    return saved ? collection.id : null;
  };

  const renameCollection = async (id: string, rawName: string) => {
    const name = rawName.trim().slice(0, MAX_COLLECTION_NAME);
    if (!name) return;

    if (!isAuth) {
      useMediaStore.getState().renameCollection(id, name);
      return;
    }
    await withErrorToast(async () => {
      await setDoc(
        collectionDoc(id),
        { name, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    });
  };

  /** Borra la colección y le saca la referencia a todos sus títulos. */
  const deleteCollection = async (id: string) => {
    const { mediaList } = useMediaStore.getState();
    const members = mediaList.filter((media) => media.collections?.includes(id));

    if (!isAuth) {
      useMediaStore.getState().removeCollection(id);
      return;
    }

    // Una lista publicada deja de estarlo: el link no puede quedar mostrando
    // una colección que ya no existe.
    const publicId = useMediaStore.getState().collections.find((item) => item.id === id)?.publicId;
    if (publicId) {
      deleteDoc(doc(db, publicListPath(publicId))).catch((error: unknown) => {
        console.error('[colecciones] No se pudo despublicar la lista:', error);
      });
    }

    await withErrorToast(async () => {
      for (let i = 0; i < members.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const media of members.slice(i, i + BATCH_LIMIT)) {
          batch.set(
            mediaDoc(media.tmdbId),
            {
              collections: (media.collections ?? []).filter((c) => c !== id),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
        await batch.commit();
      }
      await deleteDoc(collectionDoc(id));
    });
  };

  /** Suma o saca un título de una colección. */
  const toggleMembership = async (media: SavedMedia, collectionId: string) => {
    const current = media.collections ?? [];
    const collections = current.includes(collectionId)
      ? current.filter((id) => id !== collectionId)
      : [...current, collectionId];

    const patch = {
      collections: collections.length > 0 ? collections : undefined,
      updatedAt: new Date().toISOString(),
    };

    if (!isAuth) {
      useMediaStore.getState().patchMedia(media.tmdbId, patch);
      return;
    }
    await withErrorToast(async () => {
      // `collections: null` y no `undefined`: es como Firestore representa la
      // ausencia, y `sanitizeData` hace lo mismo en el otro hook.
      await setDoc(
        mediaDoc(media.tmdbId),
        { ...patch, collections: patch.collections ?? null },
        { merge: true },
      );
    });
  };

  /**
   * Suma varios títulos que ya están en la biblioteca a una colección, en
   * lotes. Sin esperar: sin conexión quedan encolados.
   */
  const addToCollection = (items: SavedMedia[], collectionId: string) => {
    const pending = items.filter((media) => !(media.collections ?? []).includes(collectionId));
    if (pending.length === 0) return;
    const updatedAt = new Date().toISOString();

    if (!isAuth) {
      for (const media of pending) {
        useMediaStore
          .getState()
          .patchMedia(media.tmdbId, { collections: [...(media.collections ?? []), collectionId], updatedAt });
      }
      return;
    }
    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const media of pending.slice(i, i + BATCH_LIMIT)) {
        batch.set(
          mediaDoc(media.tmdbId),
          { collections: [...(media.collections ?? []), collectionId], updatedAt },
          { merge: true },
        );
      }
      batch.commit().catch((error: unknown) => {
        console.error('[colecciones] No se pudo guardar el cambio:', error);
        showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
      });
    }
  };

  return {
    createCollection,
    renameCollection,
    deleteCollection,
    toggleMembership,
    addToCollection,
  };
}
