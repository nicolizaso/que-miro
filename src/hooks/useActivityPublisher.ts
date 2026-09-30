import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useMediaStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSocialStore } from '@/hooks/useSocial';
import { AutoPublisher, createAutoPublisher } from '@/lib/autoPublish';
import {
  ACTIVITY_DEBOUNCE_MS,
  ACTIVITY_MIN_INTERVAL_MS,
  Activity,
  activityToDocument,
  buildActivity,
  parseActivity,
  sameActivityContent,
} from '@/lib/activity';

/**
 * Tu actividad, armada con la biblioteca de este momento. Es lo que ven tus
 * seguidores —con la fecha de ahora— y lo que muestra tu propio perfil.
 *
 * Pasa por el documento y de vuelta por `parseActivity`: así es idéntica a
 * cómo la lee cualquiera, y compararla con la publicada no da diferencias
 * de forma (un póster con otro formato, un campo vacío).
 */
export function useOwnActivity(): Activity | null {
  const account = useSocialStore((state) => state.account);
  const reactions = useSocialStore((state) => state.reactions);
  const mediaList = useMediaStore((state) => state.mediaList);
  const collections = useMediaStore((state) => state.collections);
  const goals = useMediaStore((state) => state.goals);
  const settings = useMediaStore((state) => state.socialSettings);

  return useMemo(() => {
    if (!account) return null;
    const built = buildActivity({
      uid: account.uid,
      person: { handle: account.handle, displayName: account.displayName, avatarPath: account.avatarPath },
      mediaList,
      collections,
      goals,
      settings,
      reactions,
    });
    return parseActivity(activityToDocument(built));
  }, [account, reactions, mediaList, collections, goals, settings]);
}

/**
 * Republica tu actividad sola cuando cambia algo de lo que muestra (ver
 * `lib/autoPublish.ts`): debounce, un mínimo entre publicaciones y, sin red,
 * nada de reintentos. Con "Pausar mi actividad" no publica nada: lo que ya
 * estaba publicado se queda como estaba.
 *
 * Vive en el marco de la app, como el perfil público: la biblioteca cambia
 * desde cualquier pantalla.
 */
export function useActivityPublisher() {
  const mode = useSocialStore((state) => state.mode);
  const uid = useSocialStore((state) => state.uid);
  const syncedUid = useMediaStore((state) => state.syncedUid);
  const paused = useMediaStore((state) => state.socialSettings.paused);
  const isOnline = useOnlineStatus();
  const candidate = useOwnActivity();
  const active = mode === 'remote' && uid !== null && syncedUid === uid && candidate !== null;

  // Lo publicado, en vivo: `undefined` mientras se lee.
  const [published, setPublished] = useState<{ uid: string; activity: Activity | null } | undefined>();
  useEffect(() => {
    if (mode !== 'remote' || !uid || !candidate) return;
    return onSnapshot(
      doc(db, `activity/${uid}`),
      (snapshot) => setPublished({ uid, activity: snapshot.exists() ? parseActivity(snapshot.data()) : null }),
      (error) => console.warn('[actividad] No se pudo leer la publicada:', error),
    );
    // Depende de si hay actividad, no de cada versión: una suscripción nueva
    // por cada cambio de la biblioteca sería leer el documento una y otra vez.
  }, [mode, uid, candidate !== null]);

  const latest = useRef<Activity | null>(null);
  latest.current = published && published.uid === uid ? published.activity : null;
  const publisher = useRef<AutoPublisher<Activity> | null>(null);

  useEffect(() => {
    if (!uid || mode !== 'remote') return;
    const auto = createAutoPublisher<Activity>({
      debounceMs: ACTIVITY_DEBOUNCE_MS,
      minIntervalMs: ACTIVITY_MIN_INTERVAL_MS,
      lastPublishedAt: () => {
        const at = latest.current ? Date.parse(latest.current.updatedAt) : NaN;
        return Number.isNaN(at) ? null : at;
      },
      isPublished: (next) => latest.current !== null && sameActivityContent(latest.current, next),
      publish: (next) => {
        setDoc(doc(db, `activity/${uid}`), activityToDocument({ ...next, updatedAt: new Date().toISOString() })).catch(
          (error: unknown) => console.warn('[actividad] No se pudo publicar:', error),
        );
      },
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    });
    publisher.current = auto;
    return () => {
      auto.cancel();
      publisher.current = null;
    };
  }, [uid, mode]);

  useEffect(() => {
    if (isOnline) publisher.current?.online();
  }, [isOnline]);

  useEffect(() => {
    // Hasta saber qué hay publicado no se decide nada: si no, la primera
    // vuelta republicaría siempre.
    if (!active || paused || published === undefined || published.uid !== uid) {
      publisher.current?.cancel();
      return;
    }
    if (latest.current && sameActivityContent(latest.current, candidate)) return;
    publisher.current?.schedule(candidate);
  }, [active, paused, published, uid, candidate]);
}
