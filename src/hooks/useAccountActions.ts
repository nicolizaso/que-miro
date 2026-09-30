import { deleteUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { picksPath } from '@/hooks/useTastePicks';
import { goalsPath } from '@/hooks/useGoals';
import { subscriptionsPath } from '@/hooks/useSubscriptions';
import { restrictionsPath } from '@/hooks/useRestrictions';
import { followingPath } from '@/hooks/useFollowing';
import { pushPath } from '@/lib/push';
import { publicListPath } from '@/lib/publicList';
import { releasePushDevice } from '@/lib/pushDevice';
import { deleteCalendarFeed } from '@/hooks/useCalendarFeed';
import { deletePublicProfile } from '@/hooks/usePublicProfile';
import { socialSettingsPath } from '@/hooks/useSocialSettings';

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
   * Borra las listas propias y, de las publicadas, su instantánea pública.
   *
   * Borrar `users/{uid}` no borra sus subcolecciones: sin esto, las listas
   * sobrevivían a la cuenta, y las publicadas seguían a la vista de todos.
   */
  const deleteRemoteCollections = async (uid: string) => {
    const snapshot = await getDocs(collection(db, `users/${uid}/collections`));
    for (const document of snapshot.docs) {
      const publicId: unknown = document.data().publicId;
      if (typeof publicId === 'string' && publicId) {
        await deleteDoc(doc(db, publicListPath(publicId)));
      }
    }
    for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const document of snapshot.docs.slice(i, i + BATCH_LIMIT)) {
        batch.delete(document.ref);
      }
      await batch.commit();
    }
  };

  /**
   * Borra todo lo social: lo que cuelga de `users/` (bloqueos,
   * recomendaciones recibidas, la configuración) y lo que vive afuera
   * —usuario, tarjeta, actividad con sus reacciones, las relaciones de
   * seguir, las reacciones y recomendaciones que dejaste en otras cuentas—.
   * Afuera de `users/` nada se borra solo.
   */
  const deleteSocial = async (uid: string) => {
    const deleteAll = async (paths: string[]) => {
      for (let i = 0; i < paths.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const path of paths.slice(i, i + BATCH_LIMIT)) batch.delete(doc(db, path));
        await batch.commit();
      }
    };

    const [outgoing, incoming] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where('follower', '==', uid))),
      getDocs(query(collection(db, 'follows'), where('followed', '==', uid))),
    ]);
    const followed = outgoing.docs.map((d) => String(d.data().followed));
    const followers = incoming.docs.map((d) => String(d.data().follower));

    // Lo que dejaste en otras cuentas: tus reacciones a quienes seguías y
    // tus recomendaciones a quienes te seguían. Solo ahí pudiste dejarlas.
    const elsewhere: string[] = [];
    for (const other of followed) {
      const mine = await getDocs(
        query(collection(db, `activity/${other}/reactions`), where('reactor', '==', uid)),
      ).catch(() => null);
      mine?.docs.forEach((d) => elsewhere.push(d.ref.path));
    }
    for (const other of new Set([...followed, ...followers])) {
      const sent = await getDocs(
        query(collection(db, `users/${other}/recommendations`), where('from', '==', uid)),
      ).catch(() => null);
      sent?.docs.forEach((d) => elsewhere.push(d.ref.path));
    }
    await deleteAll(elsewhere);

    const [reactions, recommendations, blocks] = await Promise.all([
      getDocs(collection(db, `activity/${uid}/reactions`)),
      getDocs(collection(db, `users/${uid}/recommendations`)),
      getDocs(collection(db, `users/${uid}/blocks`)),
    ]);
    await deleteAll([
      ...reactions.docs.map((d) => d.ref.path),
      ...recommendations.docs.map((d) => d.ref.path),
      ...blocks.docs.map((d) => d.ref.path),
      ...outgoing.docs.map((d) => d.ref.path),
      ...incoming.docs.map((d) => d.ref.path),
      `activity/${uid}`,
      socialSettingsPath(uid),
    ]);

    // Al final la tarjeta y el usuario: las reglas de lo de arriba miran la cuenta.
    const account = await getDoc(doc(db, `accounts/${uid}`));
    const handle: unknown = account.data()?.handle;
    if (typeof handle === 'string' && handle) await deleteDoc(doc(db, `handles/${handle}`));
    await deleteDoc(doc(db, `accounts/${uid}`));
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
      // Primero el perfil público: el slug está en `users/{uid}`, que se borra
      // con la biblioteca.
      await deletePublicProfile(user.uid);
      await deleteSocial(user.uid);
      await deleteRemoteCollections(user.uid);
      await deleteRemoteLibrary(user.uid);
      // Las respuestas de "Contanos de vos" están fuera de `saved_media`, y
      // borrar el documento de un usuario no borra sus subcolecciones: sin
      // esta línea el cuestionario sobreviviría a la cuenta que lo escribió.
      await deleteDoc(doc(db, picksPath(user.uid)));
      // Las metas, las suscripciones, las restricciones y los perfiles
      // seguidos viven al lado y tienen el mismo problema.
      await deleteDoc(doc(db, goalsPath(user.uid)));
      await deleteDoc(doc(db, subscriptionsPath(user.uid)));
      await deleteDoc(doc(db, restrictionsPath(user.uid)));
      await deleteDoc(doc(db, followingPath(user.uid)));
      // La instantánea de avisos está fuera de `users/`: sin esto, el cron
      // seguiría avisándole a una cuenta que ya no existe.
      await deleteDoc(doc(db, pushPath(user.uid)));
      // El calendario publicado también: su link seguiría andando.
      await deleteCalendarFeed(user.uid);
    } catch (error) {
      console.error('[cuenta] No se pudieron borrar los datos:', error);
      throw new AccountDeletionError(
        'No pudimos borrar tus datos. Revisá tu conexión e intentá de nuevo.',
      );
    }

    // El documento ya no está; esto anula la suscripción de este navegador.
    await releasePushDevice();

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
