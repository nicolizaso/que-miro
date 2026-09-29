import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePreferences } from '@/preferences';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getMediaDetail } from '@/lib/tmdb';
import { MediaEnrichment, enrichFromDetail, mergeSeasons } from '@/lib/enrich';
import {
  completeProgress,
  detectNewEpisodes,
  hasNewEpisodes,
} from '@/lib/progress';
import {
  ArchivedStatus,
  SavedMedia,
  MediaStatus,
  SeriesProgress,
  WatchEntry,
} from '@/types';
import { newWatchId, toStoredMedia, toStoredPatch, withArchive } from '@/lib/schema';
import { isArchivedStatus } from '@/lib/archive';
import { detectAvailabilityNews, markNewsSeen } from '@/lib/availability';
import { hasSubscriptions, subscribedNames } from '@/lib/subscriptions';

/** Tope de operaciones por `writeBatch` en Firestore. */
const BATCH_LIMIT = 400;

/**
 * Firestore rechaza documentos con `undefined`. Los campos opcionales de
 * `SavedMedia` (poster, backdrop, historial, progreso) pueden venir así, por
 * eso se normalizan a `null` antes de escribir.
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
 * el estado local; sin sesión escribe directo en el store local (modo invitado
 * y demo).
 */
export function useMediaActions() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();
  const region = usePreferences((state) => state.region);

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

  /**
   * Lanza una escritura sin esperar a que el servidor la confirme.
   *
   * Firestore resuelve la promesa de `setDoc` recién cuando el cambio llegó al
   * servidor: sin conexión no resuelve nunca, y esperarla dejaba a la app con
   * el spinner girando para siempre. Lo que sí es inmediato es la caché local,
   * que dispara `onSnapshot` al toque — así que el estado ya se actualizó
   * cuando esta función vuelve, y el cambio queda encolado hasta que haya red.
   *
   * El `catch` sigue enganchado para los errores que sí importan, como que las
   * reglas rechacen la escritura.
   */
  const fireAndForget = (promise: Promise<unknown>) => {
    promise.catch((error) => {
      console.error('[media] No se pudo guardar el cambio:', error);
      showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
    });
  };

  /**
   * Escribe los campos de un cambio parcial, cada uno entero.
   *
   * Parcial a propósito: el documento remoto puede tener campos más nuevos que
   * los del estado local, y reescribirlo entero desde acá los perdería.
   *
   * Pero `mergeFields` y no `merge: true`. Con `merge`, Firestore mezcla
   * también los mapas de adentro: lo que se borró acá de `progress` —la
   * temporada que se desmarcó entera, el puntaje que se sacó— no viajaba, y
   * seguía vivo allá hasta volver con el próximo snapshot. Lo mismo el nombre
   * de un episodio de `nextToAir` que ya no es el próximo. Así, cada campo que
   * se manda queda exactamente como se mandó, y los que no se mandan no se
   * tocan.
   */
  const setFields = (tmdbId: number, data: Record<string, unknown>) =>
    setDoc(mediaDoc(tmdbId), data, { mergeFields: Object.keys(data) });

  /** Escribe un cambio parcial sobre un título (ver {@link setFields}). */
  const write = async (tmdbId: number, patch: Partial<SavedMedia>) => {
    const withTimestamp = {
      ...withArchive(patch),
      updatedAt: new Date().toISOString(),
    };

    if (!isAuth) {
      useMediaStore.getState().patchMedia(tmdbId, withTimestamp);
      return;
    }
    fireAndForget(setFields(tmdbId, sanitizeData(toStoredPatch(withTimestamp))));
  };

  /**
   * Escribe datos refrescados de TMDB sin tocar `updatedAt`.
   *
   * Es la diferencia entre algo que hizo la persona y algo que hizo la app
   * por su cuenta: `updatedAt` ordena "Agregados hace poco", y un refresco en
   * segundo plano que lo moviera reacomodaría la lista en cada visita.
   *
   * Los errores no se avisan: nadie pidió este cambio, así que un toast de
   * "no pudimos guardar" hablaría de algo que la persona no hizo. El próximo
   * refresco lo vuelve a intentar.
   */
  const writeSilently = (tmdbId: number, patch: Partial<SavedMedia>) => {
    if (!isAuth) {
      useMediaStore.getState().enrichMedia(tmdbId, patch);
      return;
    }
    const data = sanitizeData(toStoredPatch(patch));
    if (Object.keys(data).length === 0) return;
    setFields(tmdbId, data).catch((error: unknown) => {
      console.warn('[media] No se pudo guardar el refresco:', error);
    });
  };

  /**
   * Los episodios que hay que marcar si el título pasa a completada.
   *
   * Solo en el paso a completada: una serie que ya lo estaba puede tener
   * episodios desmarcados a propósito —la está volviendo a ver— y sumarle una
   * reseña más no debería pisarlos.
   */
  const progressOnComplete = (media: SavedMedia | undefined) =>
    media && media.status !== 'completada' ? completeProgress(media) : undefined;

  /**
   * Agrega un título y le completa los datos de su ficha.
   *
   * El título se guarda primero con lo que ya trae el resultado de búsqueda, y
   * el enriquecimiento va después, sin bloquear: si TMDB tarda o falla, el
   * título queda igual en la biblioteca y solo se pierde el filtro por
   * plataforma. Al revés —esperar la ficha antes de guardar— un TMDB caído
   * impediría agregar nada.
   */
  const addMedia = async (draft: Omit<SavedMedia, 'updatedAt'>) => {
    // Una serie que entra directo a Completadas entra con todo visto. Si
    // todavía no trae sus temporadas, se marca cuando llegue la ficha.
    const isCompleted = draft.status === 'completada';
    const progress = isCompleted ? completeProgress(draft) : undefined;
    const media = progress ? { ...draft, progress } : draft;

    if (!isAuth) {
      useMediaStore.getState().addMedia(media);
    } else {
      const fullMedia = { ...media, updatedAt: new Date().toISOString() };
      fireAndForget(
        setDoc(mediaDoc(media.tmdbId), sanitizeData(toStoredMedia(fullMedia))),
      );
    }

    try {
      const detail = await getMediaDetail(media.tmdbId, media.mediaType);
      const enrichment = enrichFromDetail(detail, region);
      const lateProgress =
        isCompleted && !progress
          ? completeProgress({ ...media, ...enrichment })
          : undefined;
      await write(media.tmdbId, {
        ...enrichment,
        ...(lateProgress ? { progress: lateProgress } : {}),
      });
    } catch (error) {
      console.warn('[media] No pudimos completar la ficha del título:', error);
    }
  };

  /**
   * Vuelve a pedirle la ficha a TMDB y actualiza los datos cacheados.
   *
   * No toca el progreso: los episodios vistos se guardan por número de
   * temporada, así que sobreviven a que la serie sume una temporada nueva.
   */
  const refreshDetails = async (media: SavedMedia) => {
    const detail = await getMediaDetail(media.tmdbId, media.mediaType);
    applyEnrichment(media, enrichFromDetail(detail, region));
  };

  /**
   * Guarda datos de TMDB sobre un título ya guardado, sin moverlo de lugar.
   *
   * Es la puerta de todo lo que la app trae sola: el refresco en segundo
   * plano, el completado del reparto y lo que la ficha completa al abrirse.
   */
  const applyEnrichment = (media: SavedMedia, enrichment: MediaEnrichment) => {
    const patch: Partial<SavedMedia> =
      'seasons' in enrichment
        ? { ...enrichment, seasons: mergeSeasons(enrichment.seasons, media.seasons) }
        : enrichment;

    // Si trajo episodios que salieron desde el refresco anterior, en una serie
    // que habías terminado o en la que estabas al día, queda anotado desde
    // cuál: es lo que muestra el aviso de la tarjeta. El estado no se toca —
    // mudarla a *Viendo* lo decide la persona.
    const marker = media.newEpisodesSince
      ? undefined
      : detectNewEpisodes(media, { ...media, ...patch });

    // Lo mismo con lo que llegó a una plataforma o salió en digital, en lo
    // que está en Por Ver: se anota, y se muestra hasta que se descarte.
    const { subscriptions } = useMediaStore.getState();
    const availabilityNews = detectAvailabilityNews(
      media,
      { ...media, ...patch },
      hasSubscriptions(subscriptions) ? subscribedNames(subscriptions) : null,
    );

    writeSilently(media.tmdbId, {
      ...patch,
      ...(marker ? { newEpisodesSince: marker } : {}),
      ...(availabilityNews ? { availabilityNews } : {}),
    });
  };

  /**
   * Descarta las novedades de un título.
   *
   * Sin tocar `updatedAt`, como el refresco que las trajo: descartar un aviso
   * no es algo que se haya hecho con el título, y lo subiría al principio de
   * "Agregados hace poco".
   */
  const dismissAvailabilityNews = (media: SavedMedia) => {
    writeSilently(media.tmdbId, { availabilityNews: markNewsSeen(media) });
  };

  const updateStatus = async (tmdbId: number, status: MediaStatus) => {
    const current = useMediaStore
      .getState()
      .mediaList.find((media) => media.tmdbId === tmdbId);
    const progress =
      status === 'completada' ? progressOnComplete(current) : undefined;
    await write(tmdbId, { status, ...(progress ? { progress } : {}) });
  };

  const patchMedia = async (tmdbId: number, patch: Partial<SavedMedia>) => {
    await write(tmdbId, patch);
  };

  /**
   * Suma un visionado al historial.
   *
   * El historial se reescribe entero en vez de usar `arrayUnion`: las entradas
   * son objetos y `arrayUnion` compara por igualdad estructural, así que ver
   * dos veces lo mismo con el mismo puntaje y sin comentario se perdería.
   */
  const addWatchEntry = async (media: SavedMedia, entry: WatchEntry) => {
    // Reseñar algo que abandonaste es opinar de lo que viste, no terminarlo:
    // no se mueve a Completadas ni se le marcan los episodios que faltaban.
    const isAbandoned = media.status === 'abandonada';
    const progress = isAbandoned ? undefined : progressOnComplete(media);
    const saved: WatchEntry = isAbandoned ? { ...entry, abandoned: true } : entry;
    if (!isAuth) {
      useMediaStore.getState().addWatchEntry(media.tmdbId, saved);
      if (progress) useMediaStore.getState().setProgress(media.tmdbId, progress);
      return;
    }
    await write(media.tmdbId, {
      history: [saved, ...(media.history ?? [])],
      ...(isAbandoned ? {} : { status: 'completada' as const }),
      ...(progress ? { progress } : {}),
    });
  };

  /**
   * Reemplaza una entrada del historial por su versión corregida.
   *
   * Mantiene su lugar en la lista y su fecha: corregir una reseña no es volver
   * a ver el título.
   */
  const updateWatchEntry = async (media: SavedMedia, entry: WatchEntry) => {
    if (!isAuth) {
      useMediaStore.getState().updateWatchEntry(media.tmdbId, entry);
      return;
    }
    await write(media.tmdbId, {
      history: (media.history ?? []).map((current) =>
        current.id === entry.id ? entry : current,
      ),
    });
  };

  const removeWatchEntry = async (media: SavedMedia, entryId: string) => {
    if (!isAuth) {
      useMediaStore.getState().removeWatchEntry(media.tmdbId, entryId);
      return;
    }
    const history = (media.history ?? []).filter((entry) => entry.id !== entryId);
    await write(media.tmdbId, {
      history,
      // Uno en pausa o abandonado se queda donde está: borrar una reseña no
      // lo retoma.
      ...(isArchivedStatus(media.status)
        ? {}
        : { status: history.length > 0 ? ('completada' as const) : ('viendo' as const) }),
    });
  };

  /**
   * Pone un título en pausa o lo abandona.
   *
   * Al abandonar se puede dejar un motivo corto y un puntaje de lo que se vio.
   * El puntaje va al historial como cualquier otro —así lo lee el gusto, que
   * lo toma como señal en contra—, pero marcado como de una vuelta abandonada,
   * que es lo que lo separa de las veces que sí lo terminaste (ver
   * `isAbandonedEntry`).
   */
  const archiveMedia = async (
    media: SavedMedia,
    status: ArchivedStatus,
    options: { reason?: string; rating?: number } = {},
  ) => {
    const at = new Date().toISOString();
    const entry: WatchEntry | undefined =
      status === 'abandonada' && options.rating
        ? { id: newWatchId(), rating: options.rating, completedAt: at, abandoned: true }
        : undefined;

    await write(media.tmdbId, {
      status,
      archive: { at, ...(options.reason ? { reason: options.reason } : {}) },
      ...(entry ? { history: [entry, ...(media.history ?? [])] } : {}),
      // Lo abandonado no avisa más de episodios nuevos: si igual te enterás y
      // la retomás, el progreso sigue ahí.
      ...(status === 'abandonada' && media.newEpisodesSince
        ? { newEpisodesSince: undefined }
        : {}),
    });
  };

  /** Saca un título de la pausa o del abandono y lo devuelve a *Viendo*. */
  const resumeMedia = async (media: SavedMedia) => {
    await write(media.tmdbId, { status: 'viendo' });
  };

  const setProgress = async (
    tmdbId: number,
    progress: SeriesProgress,
    status?: MediaStatus,
  ) => {
    const hasProgress = Object.keys(progress.watched).length > 0;
    const current = useMediaStore
      .getState()
      .mediaList.find((media) => media.tmdbId === tmdbId);
    // Viste lo nuevo: el aviso ya no tiene de qué hablar y se apaga en la
    // misma escritura.
    const clearsNews =
      current?.newEpisodesSince !== undefined &&
      !hasNewEpisodes({ ...current, progress });

    await write(tmdbId, {
      progress: hasProgress ? progress : undefined,
      ...(status ? { status } : {}),
      ...(clearsNews ? { newEpisodesSince: undefined } : {}),
    });
  };

  const removeMedia = async (tmdbId: number) => {
    if (!isAuth) {
      useMediaStore.getState().removeMedia(tmdbId);
      return;
    }
    fireAndForget(deleteDoc(mediaDoc(tmdbId)));
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

    // Acá sí se espera la confirmación: importar es una operación en bloque
    // sobre la que quien la hizo está esperando un resultado, no un cambio
    // suelto que pueda quedar encolado sin que se note.
    await withErrorToast(async () => {
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const item of items.slice(i, i + BATCH_LIMIT)) {
          batch.set(mediaDoc(item.tmdbId), sanitizeData(toStoredMedia(item)));
        }
        await batch.commit();
      }
    });
  };

  return {
    addMedia,
    refreshDetails,
    applyEnrichment,
    dismissAvailabilityNews,
    updateStatus,
    patchMedia,
    addWatchEntry,
    updateWatchEntry,
    removeWatchEntry,
    archiveMedia,
    resumeMedia,
    setProgress,
    removeMedia,
    saveMany,
  };
}
