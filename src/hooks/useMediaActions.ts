import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePreferences } from '@/preferences';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getMediaDetail } from '@/lib/tmdb';
import { MediaEnrichment, enrichFromDetail } from '@/lib/enrich';
import { completeProgress } from '@/lib/progress';
import { SavedMedia, MediaStatus, SeriesProgress, WatchEntry } from '@/types';

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
   * Escribe un cambio parcial sobre un título.
   *
   * Con `merge` a propósito: el documento remoto puede tener campos más nuevos
   * que los del estado local, y reescribirlo entero desde acá los perdería.
   */
  const write = async (tmdbId: number, patch: Partial<SavedMedia>) => {
    const withTimestamp = { ...patch, updatedAt: new Date().toISOString() };

    if (!isAuth) {
      useMediaStore.getState().patchMedia(tmdbId, withTimestamp);
      return;
    }
    fireAndForget(
      setDoc(mediaDoc(tmdbId), sanitizeData(withTimestamp), { merge: true }),
    );
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
    setDoc(mediaDoc(tmdbId), sanitizeData(patch), { merge: true }).catch(
      (error: unknown) => {
        console.warn('[media] No se pudo guardar el refresco:', error);
      },
    );
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
      fireAndForget(setDoc(mediaDoc(media.tmdbId), sanitizeData(fullMedia)));
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
    writeSilently(media.tmdbId, enrichment);
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
    const progress = progressOnComplete(media);
    if (!isAuth) {
      useMediaStore.getState().addWatchEntry(media.tmdbId, entry);
      if (progress) useMediaStore.getState().setProgress(media.tmdbId, progress);
      return;
    }
    await write(media.tmdbId, {
      history: [entry, ...(media.history ?? [])],
      status: 'completada',
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
      status: history.length > 0 ? 'completada' : 'viendo',
    });
  };

  const setProgress = async (
    tmdbId: number,
    progress: SeriesProgress,
    status?: MediaStatus,
  ) => {
    const hasProgress = Object.keys(progress.watched).length > 0;
    await write(tmdbId, {
      progress: hasProgress ? progress : undefined,
      ...(status ? { status } : {}),
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
          batch.set(mediaDoc(item.tmdbId), sanitizeData(item));
        }
        await batch.commit();
      }
    });
  };

  return {
    addMedia,
    refreshDetails,
    applyEnrichment,
    updateStatus,
    patchMedia,
    addWatchEntry,
    updateWatchEntry,
    removeWatchEntry,
    setProgress,
    removeMedia,
    saveMany,
  };
}
