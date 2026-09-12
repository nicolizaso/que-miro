import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { db, isFirebaseConfigured, isMissingDatabaseError } from '@/lib/firebase';
import { useSyncStatus } from '@/lib/syncStatus';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { Collection, SavedMedia } from '@/types';
import { parseCollection, parseMedia } from '@/lib/schema';
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
 *   le filtraría al siguiente usuario. Los datos del modo demo caen acá: su
 *   `ownerUid` ficticio nunca coincide con un UID real.
 * - Sin sesión, no se toca nada: el modo invitado vive solo en localStorage.
 *
 * Todo lo que llega de Firestore pasa por `parseMedia`, que migra los
 * documentos guardados con versiones viejas del schema.
 */
export function SyncManager() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (authState !== 'authenticated' || !user) return;

    const { ownerUid, mediaList, reset, setOwnerUid, setMediaList, setCollections } =
      useMediaStore.getState();

    // Datos de otra cuenta en este dispositivo: se descartan, no se migran.
    if (ownerUid && ownerUid !== user.uid) {
      reset();
    }
    // Los datos de invitado (ownerUid === null) sí son de quien acaba de entrar.
    const guestMediaToMigrate = ownerUid === null ? mediaList : [];
    setOwnerUid(user.uid);

    const savedMediaRef = collection(db, `users/${user.uid}/saved_media`);
    const collectionsRef = collection(db, `users/${user.uid}/collections`);
    let migrated = false;

    const { setIssue } = useSyncStatus.getState();

    const onError = (error: unknown) => {
      console.error('[sync] Error de conexión con Firestore:', error);

      // Que falte la base no es un corte de red: no se reintenta hasta
      // arreglarlo, así que en vez de un aviso que se va a los 5 segundos deja
      // un cartel fijo explicando qué pasa. Un toast acá miente por omisión:
      // hace creer que los cambios están a salvo esperando la red.
      if (isMissingDatabaseError(error)) {
        setIssue('missing-database');
        return;
      }

      setIssue('unreachable');
      showToast(
        'Perdimos la conexión con el servidor. Tus cambios pueden no guardarse.',
        'error',
      );
    };

    const unsubscribeMedia = onSnapshot(
      savedMediaRef,
      async (snapshot) => {
        // Solo las emisiones que vienen del servidor prueban que hay
        // sincronización: con caché persistente, Firestore emite igual desde
        // IndexedDB aunque el servidor no conteste, y limpiar el cartel con
        // eso sería justo el engaño que el cartel viene a evitar.
        if (!snapshot.metadata.fromCache) setIssue(null);

        const remote = snapshot.docs
          .map((d) => parseMedia(d.data()))
          .filter((media): media is SavedMedia => media !== null);

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
      onError,
    );

    const unsubscribeCollections = onSnapshot(
      collectionsRef,
      (snapshot) => {
        setCollections(
          snapshot.docs
            .map((d) => parseCollection(d.data()))
            .filter((item): item is Collection => item !== null)
            .sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
      },
      onError,
    );

    return () => {
      unsubscribeMedia();
      unsubscribeCollections();
      // Sin listeners no hay nada que sincronizar: el cartel dejaría de
      // describir el estado de la app.
      setIssue(null);
    };
  }, [user, authState, showToast]);

  return null;
}
