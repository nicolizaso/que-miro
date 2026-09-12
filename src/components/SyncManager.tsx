import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import {
  db,
  isFirebaseConfigured,
  isMissingDatabaseError,
  isPermissionDeniedError,
} from '@/lib/firebase';
import { useSyncStatus } from '@/lib/syncStatus';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { Collection, SavedMedia } from '@/types';
import { parseCollection, parseMedia } from '@/lib/schema';
import { mergeLibraries } from '@/lib/backup';
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

    const { ownerUid, reset, setOwnerUid, setMediaList, setCollections } =
      useMediaStore.getState();

    // Datos de otra cuenta en este dispositivo: se descartan, no se migran.
    if (ownerUid && ownerUid !== user.uid) {
      reset();
    }

    // Se relee después del posible `reset`: leer antes dejaría en la mano la
    // biblioteca que se acaba de descartar y la subiría a la cuenta nueva.
    const { mediaList, collections: localCollections, syncedUid, setSyncedUid } =
      useMediaStore.getState();

    /**
     * Nunca bajamos la biblioteca de esta cuenta desde el servidor.
     *
     * Mientras eso sea cierto, lo que hay en el dispositivo puede ser la única
     * copia que existe: la de quien probó la app sin cuenta, o la de quien
     * estuvo guardando títulos contra un Firestore que los rechazaba. En los
     * dos casos hay que subirla, no pisarla.
     */
    const isFirstSync = syncedUid !== user.uid;
    const localMediaToUpload = isFirstSync ? mediaList : [];
    const localCollectionsToUpload = isFirstSync ? localCollections : [];

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

      // Las reglas rechazan a esta cuenta: mismo caso, otro cartel.
      if (isPermissionDeniedError(error)) {
        setIssue('permission-denied');
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
        const fromServer = !snapshot.metadata.fromCache;
        if (fromServer) setIssue(null);

        const remote = snapshot.docs
          .map((d) => parseMedia(d.data()))
          .filter((media): media is SavedMedia => media !== null);

        /**
         * Mientras el servidor no haya confirmado esta cuenta, la caché no
         * puede probar un borrado.
         *
         * Una caché vacía no significa "no tenés nada": significa que en este
         * navegador todavía no bajó nada, o que Firestore acaba de revertir
         * las escrituras que el servidor rechazó. Pisar el estado con eso
         * borra la biblioteca del dispositivo, así que se unen las dos
         * puntas y ante un repetido gana el que se tocó más tarde.
         */
        if (!fromServer && useMediaStore.getState().syncedUid !== user.uid) {
          const { mediaList: local } = useMediaStore.getState();
          setMediaList(
            mergeLibraries(local, remote).media.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            ),
          );
          return;
        }

        /**
         * Primera bajada de verdad: se sube lo que el servidor no tiene.
         *
         * Va contra una emisión del servidor y no contra una de la caché: la
         * caché puede estar vacía sin que eso diga nada de lo que hay del otro
         * lado, y subir contra esa foto pisaría documentos remotos más nuevos
         * con la copia vieja del dispositivo.
         */
        if (fromServer && !migrated) {
          migrated = true;
          const remoteIds = new Set(remote.map((m) => m.tmdbId));
          const pending = localMediaToUpload.filter(
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
                `Subimos ${pending.length} ${
                  pending.length === 1 ? 'título' : 'títulos'
                } que estaban solo en este dispositivo.`,
              );
            } catch (error) {
              console.error('[sync] No se pudo subir la biblioteca local:', error);
              showToast(
                'No pudimos subir los títulos que están solo en este dispositivo. Siguen acá.',
                'error',
              );
            }
            // Con o sin éxito se corta acá, y es lo importante: si la subida
            // falló, escribir `remote` encima borraría del dispositivo la
            // única copia que quedaba. Si salió bien, `onSnapshot` vuelve a
            // emitir con los títulos ya escritos.
            return;
          }
        }

        setMediaList(
          remote.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );

        // Recién acá el servidor pasa a ser la fuente de verdad para esta
        // cuenta: lo que baje de ahora en más puede pisar lo local, borrados
        // hechos en otro dispositivo incluidos.
        if (fromServer) setSyncedUid(user.uid);
      },
      onError,
    );

    let collectionsUploaded = false;

    const unsubscribeCollections = onSnapshot(
      collectionsRef,
      async (snapshot) => {
        const fromServer = !snapshot.metadata.fromCache;
        const remote = snapshot.docs
          .map((d) => parseCollection(d.data()))
          .filter((item): item is Collection => item !== null);

        // Igual que la biblioteca: una emisión de la caché no alcanza para
        // borrar listas que solo existen acá.
        if (!fromServer && useMediaStore.getState().syncedUid !== user.uid) {
          const { collections: local } = useMediaStore.getState();
          const remoteIds = new Set(remote.map((c) => c.id));
          setCollections(
            [...local.filter((c) => !remoteIds.has(c.id)), ...remote].sort(
              (a, b) => a.name.localeCompare(b.name, 'es'),
            ),
          );
          return;
        }

        // Mismo trato que la biblioteca: las listas que la persona armó en
        // este dispositivo se suben, no se pierden contra un servidor vacío.
        if (fromServer && !collectionsUploaded) {
          collectionsUploaded = true;
          const remoteIds = new Set(remote.map((c) => c.id));
          const pending = localCollectionsToUpload.filter(
            (c) => !remoteIds.has(c.id),
          );

          if (pending.length > 0) {
            try {
              const batch = writeBatch(db);
              for (const item of pending) {
                batch.set(
                  doc(db, `users/${user.uid}/collections/${item.id}`),
                  item,
                );
              }
              await batch.commit();
            } catch (error) {
              console.error('[sync] No se pudieron subir las listas:', error);
            }
            return;
          }
        }

        setCollections(
          remote.sort((a, b) => a.name.localeCompare(b.name, 'es')),
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
