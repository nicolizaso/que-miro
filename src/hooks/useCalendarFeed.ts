import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { useCalendarSeasons } from '@/hooks/useCalendarSeasons';
import { buildCalendar, seasonsToFetch } from '@/lib/calendar';
import { toDayKey } from '@/lib/dates';
import {
  FEED_TOKEN_PATTERN,
  FeedEvent,
  feedPath,
  feedSettingsPath,
  feedUrl,
  mergeFeedEvents,
  newFeedToken,
  parseFeedEvents,
  sameEvents,
  upcomingEvents,
} from '@/lib/calendarFeed';

/**
 * Cuánto se espera antes de republicar. Al abrir la app, las temporadas del
 * calendario llegan de a una: se publica una vez, con todas, y no una por
 * cada una que llega.
 */
const FEED_DEBOUNCE_MS = 5_000;

function accountUid(authState: string, uid: string | undefined): string | null {
  return isFirebaseConfigured && authState === 'authenticated' && uid ? uid : null;
}

/** El token del calendario de la cuenta: `undefined` mientras carga, `null` si no hay. */
function useFeedToken(uid: string | null): string | null | undefined {
  const [state, setState] = useState<{ uid: string; token: string | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, feedSettingsPath(uid)),
      (snapshot) => {
        const token: unknown = snapshot.data()?.token;
        setState({
          uid,
          token: typeof token === 'string' && FEED_TOKEN_PATTERN.test(token) ? token : null,
        });
      },
      (error) => console.warn('[calendario] No se pudo leer el token:', error),
    );
  }, [uid]);

  return state && state.uid === uid ? state.token : undefined;
}

/** Lo publicado: `undefined` mientras carga, `null` si el documento no existe. */
function usePublishedFeed(token: string | null | undefined): FeedEvent[] | null | undefined {
  const [state, setState] = useState<{ token: string; events: FeedEvent[] | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    return onSnapshot(
      doc(db, feedPath(token)),
      (snapshot) =>
        setState({ token, events: snapshot.exists() ? parseFeedEvents(snapshot.data().events) : null }),
      (error) => console.warn('[calendario] No se pudo leer lo publicado:', error),
    );
  }, [token]);

  return token && state && state.token === token ? state.events : undefined;
}

/**
 * Mantiene al día el calendario publicado, si la cuenta tiene uno.
 *
 * Vive en el marco de la app: el calendario cambia cuando el refresco trae
 * un episodio nuevo o cuando la persona sigue una serie, y eso pasa en
 * cualquier pantalla. Solo actualiza un documento que ya existe; crearlo es
 * activar el calendario, y eso se hace a mano en Ajustes.
 */
export function useCalendarFeedSync() {
  const { user, authState } = useAuth();
  const uid = accountUid(authState, user?.uid);
  const token = useFeedToken(uid);
  const published = usePublishedFeed(token);
  const mediaList = useMediaStore((state) => state.mediaList);
  const syncedUid = useMediaStore((state) => state.syncedUid);

  // El día, una vez por visita, como en la vista del calendario.
  const [today] = useState(() => toDayKey(new Date()));
  // Las temporadas se piden solo con el calendario activado: sin él, nadie
  // las va a mirar.
  const wanted = useMemo(
    () => (token ? seasonsToFetch(mediaList, today) : []),
    [token, mediaList, today],
  );
  const seasons = useCalendarSeasons(wanted);
  const upcoming = useMemo(
    () => (token ? upcomingEvents(buildCalendar(mediaList, today, seasons)) : []),
    [token, mediaList, today, seasons],
  );

  /**
   * Lo último que este dispositivo calculó y publicó. Si el documento cambia
   * y acá no cambió nada, lo publicó otro dispositivo —quizás con temporadas
   * que este no bajó— y no se le contesta: dos que se corrigen entre sí no
   * terminarían nunca.
   */
  const lastUpcoming = useRef<string | null>(null);

  useEffect(() => {
    // Sin la biblioteca bajada del servidor, el calendario local puede estar
    // a medias: publicarlo borraría de la agenda episodios que sí siguen.
    if (!uid || !token || !published || syncedUid !== uid) return;

    const upcomingKey = JSON.stringify(upcoming);
    if (lastUpcoming.current === upcomingKey) return;
    const next = mergeFeedEvents(published, upcoming, today);
    if (sameEvents(next, published)) {
      lastUpcoming.current = upcomingKey;
      return;
    }

    const timer = setTimeout(() => {
      lastUpcoming.current = upcomingKey;
      // Sin `await`: sin conexión queda encolada, como el resto.
      setDoc(doc(db, feedPath(token)), { uid, events: next, updatedAt: new Date().toISOString() }).catch(
        (error: unknown) => console.warn('[calendario] No se pudo republicar:', error),
      );
    }, FEED_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [uid, token, published, upcoming, today, syncedUid]);
}

/**
 * Borra el calendario publicado de una cuenta. Lo usa el borrado de cuenta:
 * `calendar_feeds` está fuera de `users/`, y sin esto el link seguiría
 * andando después de que la cuenta ya no existe.
 */
export async function deleteCalendarFeed(uid: string): Promise<void> {
  const settings = await getDoc(doc(db, feedSettingsPath(uid)));
  const token: unknown = settings.data()?.token;
  if (typeof token === 'string' && FEED_TOKEN_PATTERN.test(token)) {
    await deleteDoc(doc(db, feedPath(token)));
  }
  await deleteDoc(doc(db, feedSettingsPath(uid)));
}

/** Activar, regenerar y desactivar el calendario, desde Ajustes. */
export function useCalendarFeed() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();
  const uid = accountUid(authState, user?.uid);
  const token = useFeedToken(uid);

  const url = token && typeof window !== 'undefined' ? feedUrl(window.location.origin, token) : null;

  /** Las escrituras se lanzan sin esperar: sin conexión quedan encoladas. */
  const fireAndForget = (promise: Promise<unknown>) => {
    promise.catch((error: unknown) => {
      console.error('[calendario] No se pudo guardar:', error);
      showToast('No pudimos guardar el calendario. Intentá de nuevo.', 'error');
    });
  };

  /**
   * Publica con un token nuevo. Primero el calendario y después el token:
   * así la dirección que se muestra ya tiene algo adentro.
   */
  const publishNew = (uidToUse: string): string => {
    const next = newFeedToken();
    const today = toDayKey(new Date());
    const events = mergeFeedEvents(
      [],
      upcomingEvents(buildCalendar(useMediaStore.getState().mediaList, today)),
      today,
    );
    const updatedAt = new Date().toISOString();
    fireAndForget(setDoc(doc(db, feedPath(next)), { uid: uidToUse, events, updatedAt }));
    fireAndForget(setDoc(doc(db, feedSettingsPath(uidToUse)), { token: next, updatedAt }));
    return next;
  };

  const activate = () => {
    if (!uid) return;
    publishNew(uid);
  };

  /** Un link nuevo; el anterior deja de andar. */
  const regenerate = () => {
    if (!uid || !token) return;
    publishNew(uid);
    fireAndForget(deleteDoc(doc(db, feedPath(token))));
  };

  const deactivate = () => {
    if (!uid || !token) return;
    // Primero el token: si no, el que mantiene el calendario al día podría
    // alcanzar a ver el documento borrado con el token todavía puesto.
    fireAndForget(
      setDoc(doc(db, feedSettingsPath(uid)), { token: null, updatedAt: new Date().toISOString() }),
    );
    fireAndForget(deleteDoc(doc(db, feedPath(token))));
  };

  return {
    /** Si hay algo para ofrecer: con cuenta, que es donde vive la instantánea. */
    available: uid !== null,
    isLoading: uid !== null && token === undefined,
    token: token ?? null,
    url,
    activate,
    regenerate,
    deactivate,
  };
}
