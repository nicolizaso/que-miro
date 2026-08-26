import { deleteUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';

/** Tope de operaciones por `writeBatch` en Firestore. */
const BATCH_LIMIT = 400;

/** Error de borrado con un mensaje ya listo para mostrar. */
export class AccountDeletionError extends Error {}

/**
 * Acciones sobre la cuenta entera, separadas de las de la biblioteca porque
 * tocan Firebase Auth y no solo Firestore.
 */
export function useAccountActions() {
  const { user, authState, logout } = useAuth();

  /** Borra todos los documentos de la biblioteca del usuario en Firestore. */
  const deleteRemoteLibrary = async (uid: string) => {
    const snapshot = await getDocs(collection(db, `users/${uid}/saved_media`));

    for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const document of snapshot.docs.slice(i, i + BATCH_LIMIT)) {
        batch.delete(document.ref);
      }
      await batch.commit();
    }

    // El documento del usuario puede no existir: `deleteDoc` sobre algo que no
    // está es un no-op, así que no hace falta chequearlo antes.
    await deleteDoc(doc(db, `users/${uid}`));
  };

  /**
   * Vacía la biblioteca sin tocar la cuenta.
   *
   * @throws {AccountDeletionError} si Firestore rechaza el borrado.
   */
  const clearLibrary = async () => {
    if (authState === 'authenticated' && user && isFirebaseConfigured) {
      try {
        await deleteRemoteLibrary(user.uid);
      } catch (error) {
        console.error('[cuenta] No se pudo vaciar la biblioteca:', error);
        throw new AccountDeletionError(
          'No pudimos borrar tus títulos. Revisá tu conexión e intentá de nuevo.',
        );
      }
      return;
    }
    useMediaStore.getState().setMediaList([]);
  };

  /**
   * Borra la cuenta y todos sus datos: primero Firestore, después el usuario de
   * Auth. En ese orden a propósito — sin sesión ya no se puede escribir en
   * Firestore, así que borrar el usuario primero dejaría los datos huérfanos.
   *
   * @throws {AccountDeletionError} con un mensaje mostrable.
   */
  const deleteAccount = async () => {
    if (authState !== 'authenticated' || !user || !isFirebaseConfigured) {
      throw new AccountDeletionError('No hay una cuenta con la sesión iniciada.');
    }

    try {
      await deleteRemoteLibrary(user.uid);
    } catch (error) {
      console.error('[cuenta] No se pudieron borrar los datos:', error);
      throw new AccountDeletionError(
        'No pudimos borrar tus datos. Revisá tu conexión e intentá de nuevo.',
      );
    }

    try {
      await deleteUser(auth.currentUser!);
    } catch (error) {
      // Firebase exige haber iniciado sesión hace poco para operaciones
      // sensibles. Los datos ya se borraron; falta solo la credencial.
      const code = (error as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        await logout();
        throw new AccountDeletionError(
          'Borramos tus títulos, pero por seguridad Firebase pide que vuelvas a iniciar sesión para eliminar la cuenta. Ingresá de nuevo y repetí el borrado.',
        );
      }
      console.error('[cuenta] No se pudo eliminar el usuario:', error);
      throw new AccountDeletionError(
        'Borramos tus datos, pero no pudimos eliminar la cuenta. Intentá de nuevo.',
      );
    }

    useMediaStore.getState().reset();
  };

  return { clearLibrary, deleteAccount };
}
