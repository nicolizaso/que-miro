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
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  writeBatch,
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  Unsubscribe,
} from 'firebase/firestore';
import { Collection, SavedMedia } from '@/types';
import { parseCollection, parseMedia, toStoredMedia } from '@/lib/schema';
import { hasPicks, parsePicks } from '@/lib/picks';
import { picksPath, picksToDocument } from '@/hooks/useTastePicks';
import { goalsPath } from '@/hooks/useGoals';
import { goalsToDocument, hasGoals, parseGoals } from '@/lib/goals';
import { subscriptionsPath } from '@/hooks/useSubscriptions';
import {
  hasSubscriptions,
  parseSubscriptions,
  subscriptionsToDocument,
} from '@/lib/subscriptions';
import { restrictionsPath } from '@/hooks/useRestrictions';
import {
  hasRestrictions,
  parseRestrictions,
  restrictionsToDocument,
} from '@/lib/restrictions';
import { followingPath } from '@/hooks/useFollowing';
import { followingToDocument, hasFollowing, parseFollowing } from '@/lib/following';
import { socialSettingsPath } from '@/hooks/useSocialSettings';
import { hasSocialSettings, parseSocialSettings, socialSettingsToDocument } from '@/lib/social';
import { mergeLibraries } from '@/lib/backup';
import { useToast } from '@/contexts/ToastContext';

/**
 * Cuánto tiene que pasar entre dos rechazos para volver a intentar.
 *
 * Un rechazo aislado se reintenta; dos seguidos ya no son mala suerte: son las
 * reglas diciendo que no.
 */
export const PERMISSION_RETRY_WINDOW_MS = 30_000;

/** Respiro antes de volver a suscribirse, para no reintentar en caliente. */
export const PERMISSION_RETRY_DELAY_MS = 1_500;

/**
 * Cómo se resuelve un documento de `profile/`: el cuestionario, las metas, las
 * suscripciones.
 *
 * Los tres son chicos, se tocan cada tanto y no son un historial, así que ante
 * un conflicto gana el más nuevo: si alguien contestó en el celular y después
 * en la compu, lo último que dijo es lo que quiso decir. En la primera
 * sincronización, lo que se guardó sin cuenta —o mientras Firestore rechazaba
 * las escrituras— se sube si es más nuevo que lo de allá: ahí la copia local
 * es la buena.
 */
function profileDocHandler<T extends { updatedAt: string }>({
  ref,
  parse,
  hasContent,
  toDocument,
  localToUpload,
  getLocal,
  setLocal,
  what,
}: {
  ref: DocumentReference;
  parse: (data: unknown) => T;
  hasContent: (value: T) => boolean;
  toDocument: (value: T) => Record<string, unknown>;
  localToUpload: T | null;
  getLocal: () => T;
  setLocal: (value: T) => void;
  /** Para el registro de errores: "los gustos", "las metas". */
  what: string;
}) {
  return (snapshot: DocumentSnapshot) => {
    const remote = snapshot.exists() ? parse(snapshot.data()) : null;

    if (
      localToUpload &&
      hasContent(localToUpload) &&
      (!remote || Date.parse(remote.updatedAt) < Date.parse(localToUpload.updatedAt))
    ) {
      setDoc(ref, toDocument(localToUpload)).catch((error: unknown) => {
        console.error(`[sync] No se pudieron subir ${what}:`, error);
      });
      return;
    }

    if (!remote) return;
    if (Date.parse(remote.updatedAt) < Date.parse(getLocal().updatedAt)) return;
    setLocal(remote);
  };
}

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
 * - El cuestionario de "Contanos de vos", las metas y las suscripciones viajan
 *   con la biblioteca: mismo dueño, mismas reglas.
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
    const {
      mediaList,
      collections: localCollections,
      picks: localPicks,
      goals: localGoals,
      subscriptions: localSubscriptions,
      restrictions: localRestrictions,
      following: localFollowing,
      socialSettings: localSocialSettings,
      syncedUid,
      setSyncedUid,
    } = useMediaStore.getState();

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
    const localPicksToUpload = isFirstSync ? localPicks : null;
    const localGoalsToUpload = isFirstSync ? localGoals : null;
    const localSubscriptionsToUpload = isFirstSync ? localSubscriptions : null;
    const localRestrictionsToUpload = isFirstSync ? localRestrictions : null;
    const localFollowingToUpload = isFirstSync ? localFollowing : null;
    const localSocialToUpload = isFirstSync ? localSocialSettings : null;

    setOwnerUid(user.uid);

    const savedMediaRef = collection(db, `users/${user.uid}/saved_media`);
    const collectionsRef = collection(db, `users/${user.uid}/collections`);
    const picksRef = doc(db, picksPath(user.uid));
    const goalsRef = doc(db, goalsPath(user.uid));
    const subscriptionsRef = doc(db, subscriptionsPath(user.uid));
    const restrictionsRef = doc(db, restrictionsPath(user.uid));
    const followingRef = doc(db, followingPath(user.uid));
    const socialRef = doc(db, socialSettingsPath(user.uid));
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

    let disposed = false;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * `onSnapshot` que sobrevive a un `permission-denied` pasajero.
     *
     * Al abrir la app en el celular, sobre todo como PWA que vuelve del fondo,
     * Auth ya dio a la persona por conectada pero el token que viaja con la
     * primera escucha todavía no sirve (venció mientras la app dormía y la red
     * recién se está despertando). Las reglas lo rechazan y Firestore mata la
     * escucha para siempre: sin esto quedaba el cartel de "tus cambios no se
     * están sincronizando" aunque todo anduviera, y esa escucha no volvía a
     * bajar nada hasta recargar.
     *
     * Por eso el primer rechazo pide un token nuevo y se vuelve a suscribir.
     * Si el rechazo se repite enseguida ya no es el arranque: son las reglas,
     * y ahí sí se avisa.
     */
    const listen = (
      subscribe: (onListenError: (error: FirestoreError) => void) => Unsubscribe,
    ): Unsubscribe => {
      let unsubscribe: Unsubscribe = () => {};
      let lastRetryAt = -Infinity;

      const start = () => {
        unsubscribe = subscribe((error) => {
          const now = Date.now();
          if (
            !isPermissionDeniedError(error) ||
            now - lastRetryAt < PERMISSION_RETRY_WINDOW_MS
          ) {
            onError(error);
            return;
          }

          lastRetryAt = now;
          console.warn(
            '[sync] Firestore rechazó la escucha; reintentamos con un token nuevo:',
            error,
          );
          user
            .getIdToken(true)
            .catch(() => {
              // Sin red para renovarlo: se reintenta igual con el que haya.
            })
            .finally(() => {
              if (disposed) return;
              const timer = setTimeout(() => {
                retryTimers.delete(timer);
                if (!disposed) start();
              }, PERMISSION_RETRY_DELAY_MS);
              retryTimers.add(timer);
            });
        });
      };

      start();
      return () => unsubscribe();
    };

    const unsubscribeMedia = listen((onListenError) => onSnapshot(
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
                  toStoredMedia(media),
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
      onListenError,
    ));

    let collectionsUploaded = false;

    const unsubscribeCollections = listen((onListenError) => onSnapshot(
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
      onListenError,
    ));

    const unsubscribePicks = listen((onListenError) => onSnapshot(
      picksRef,
      profileDocHandler({
        ref: picksRef,
        parse: parsePicks,
        hasContent: hasPicks,
        toDocument: picksToDocument,
        localToUpload: localPicksToUpload,
        getLocal: () => useMediaStore.getState().picks,
        setLocal: (picks) => useMediaStore.getState().setPicks(picks),
        what: 'los gustos',
      }),
      onListenError,
    ));

    const unsubscribeGoals = listen((onListenError) => onSnapshot(
      goalsRef,
      profileDocHandler({
        ref: goalsRef,
        parse: parseGoals,
        hasContent: hasGoals,
        toDocument: goalsToDocument,
        localToUpload: localGoalsToUpload,
        getLocal: () => useMediaStore.getState().goals,
        setLocal: (goals) => useMediaStore.getState().setGoals(goals),
        what: 'las metas',
      }),
      onListenError,
    ));

    const unsubscribeSubscriptions = listen((onListenError) => onSnapshot(
      subscriptionsRef,
      profileDocHandler({
        ref: subscriptionsRef,
        parse: parseSubscriptions,
        hasContent: hasSubscriptions,
        toDocument: subscriptionsToDocument,
        localToUpload: localSubscriptionsToUpload,
        getLocal: () => useMediaStore.getState().subscriptions,
        setLocal: (subscriptions) => useMediaStore.getState().setSubscriptions(subscriptions),
        what: 'las suscripciones',
      }),
      onListenError,
    ));

    const unsubscribeRestrictions = listen((onListenError) => onSnapshot(
      restrictionsRef,
      profileDocHandler({
        ref: restrictionsRef,
        parse: (value) => parseRestrictions(value),
        hasContent: hasRestrictions,
        toDocument: restrictionsToDocument,
        localToUpload: localRestrictionsToUpload,
        getLocal: () => useMediaStore.getState().restrictions,
        setLocal: (restrictions) => useMediaStore.getState().setRestrictions(restrictions),
        what: 'lo que no te interesa',
      }),
      onListenError,
    ));

    const unsubscribeFollowing = listen((onListenError) => onSnapshot(
      followingRef,
      profileDocHandler({
        ref: followingRef,
        parse: parseFollowing,
        hasContent: hasFollowing,
        toDocument: followingToDocument,
        localToUpload: localFollowingToUpload,
        getLocal: () => useMediaStore.getState().following,
        setLocal: (following) => useMediaStore.getState().setFollowing(following),
        what: 'los perfiles que seguís',
      }),
      onListenError,
    ));

    const unsubscribeSocial = listen((onListenError) => onSnapshot(
      socialRef,
      profileDocHandler({
        ref: socialRef,
        parse: parseSocialSettings,
        hasContent: hasSocialSettings,
        toDocument: socialSettingsToDocument,
        localToUpload: localSocialToUpload,
        getLocal: () => useMediaStore.getState().socialSettings,
        setLocal: (settings) => useMediaStore.getState().setSocialSettings(settings),
        what: 'lo que compartís',
      }),
      onListenError,
    ));

    return () => {
      disposed = true;
      retryTimers.forEach(clearTimeout);
      unsubscribeSocial();
      unsubscribeMedia();
      unsubscribeCollections();
      unsubscribePicks();
      unsubscribeGoals();
      unsubscribeSubscriptions();
      unsubscribeRestrictions();
      unsubscribeFollowing();
      // Sin listeners no hay nada que sincronizar: el cartel dejaría de
      // describir el estado de la app.
      setIssue(null);
    };
  }, [user, authState, showToast]);

  return null;
}
