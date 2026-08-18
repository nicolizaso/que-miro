import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { SavedMedia } from '@/types';
import { useToast } from '@/contexts/ToastContext';

/**
 * Mantiene sincronizada la biblioteca local (Zustand + localStorage) con
 * Firestore mientras haya sesión iniciada.
 *
 * Reglas:
 * - Al entrar con una cuenta, si en el dispositivo había datos de *invitado*
 *   (sin dueño), se migran a la cuenta. Es el caso "probé la app sin cuenta y
 *   después me registré".
 * - Si los datos locales pertenecen a *otra* cuenta, se descartan antes de
 *   suscribirse. Sin esto, la biblioteca de quien usó el dispositivo antes se
 *   le filtraría al siguiente usuario.
 * - Sin sesión, no se toca nada: el modo invitado vive solo en localStorage.
 */
export function SyncManager() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (authState !== 'authenticated' || !user) return;

    const { ownerUid, mediaList, reset, setOwnerUid, setMediaList } =
      useMediaStore.getState();

    // Datos de otra cuenta en este dispositivo: se descartan, no se migran.
    if (ownerUid && ownerUid !== user.uid) {
      reset();
    }
    // Los datos de invitado (ownerUid === null) sí son de quien acaba de entrar.
    const guestMediaToMigrate = ownerUid === null ? mediaList : [];
    setOwnerUid(user.uid);

    const savedMediaRef = collection(db, `users/${user.uid}/saved_media`);
    let migrated = false;

    const unsubscribe = onSnapshot(
      savedMediaRef,
      async (snapshot) => {
        const remote = snapshot.docs.map((d) => d.data() as SavedMedia);

        // Migración one-shot de lo que el usuario había guardado como invitado.
        if (!migrated) {
          migrated = true;
          const remoteIds = new Set(remote.map((m) => m.tmdbId));
          const pending = guestMediaToMigrate.filter(
            (m) => !remoteIds.has(m.tmdbId),
          );

          if (pending.length > 0) {
            try {
              const batch = writeBatch(db);
              for (const media of pending) {
                batch.set(
                  doc(db, `users/${user.uid}/saved_media/${media.tmdbId}`),
                  media,
                );
              }
              await batch.commit();
              showToast(
                `Sincronizamos ${pending.length} ${
                  pending.length === 1 ? 'título' : 'títulos'
                } de tu sesión de invitado.`,
              );
              // El propio onSnapshot va a emitir de nuevo con los datos ya
              // escritos, así que no hace falta tocar el estado acá.
              return;
            } catch (error) {
              console.error('[sync] No se pudo migrar la biblioteca:', error);
              showToast(
                'No pudimos sincronizar tus títulos guardados sin cuenta.',
                'error',
              );
            }
          }
        }

        setMediaList(
          remote.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
      },
      (error) => {
        console.error('[sync] Error de conexión con Firestore:', error);
        showToast(
          'Perdimos la conexión con el servidor. Tus cambios pueden no guardarse.',
          'error',
        );
      },
    );

    return () => unsubscribe();
  }, [user, authState, showToast]);

  return null;
}
