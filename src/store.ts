import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Collection,
  MediaStatus,
  Goals,
  SavedMedia,
  SeriesProgress,
  TastePicks,
  WatchEntry,
} from './types';
import {
  SCHEMA_VERSION,
  parseCollection,
  parseMedia,
  withArchive,
} from './lib/schema';
import { isArchivedStatus } from './lib/archive';
import { emptyPicks, parsePicks } from './lib/picks';
import { emptyGoals, parseGoals } from './lib/goals';

interface MediaState {
  mediaList: SavedMedia[];
  /** Listas propias, más allá de los tres estados fijos. */
  collections: Collection[];
  /**
   * Lo que la persona contestó en "Contanos de vos".
   *
   * Vive con la biblioteca y no en las preferencias del dispositivo porque es
   * dato de la cuenta: se sincroniza, se exporta y, sobre todo, tiene el mismo
   * dueño. Sin eso, el cuestionario de quien usó el celular antes se le
   * aparecería al siguiente que inicie sesión.
   */
  picks: TastePicks;
  /**
   * Las metas del año. Como el cuestionario, son de la cuenta: se sincronizan,
   * van al backup y tienen el mismo dueño que la biblioteca.
   */
  goals: Goals;
  /**
   * UID del usuario dueño de los datos que hay en memoria/localStorage.
   * `null` significa "datos de invitado", todavía no asociados a ninguna cuenta.
   *
   * Es lo que evita que la biblioteca de un usuario se le aparezca al
   * siguiente que inicie sesión en el mismo dispositivo.
   */
  ownerUid: string | null;
  /**
   * UID cuya biblioteca ya bajamos del servidor al menos una vez.
   *
   * Es la diferencia entre "el servidor dice que no tenés nada" y "todavía no
   * hablamos con el servidor". Mientras no coincida con el usuario actual, lo
   * que hay en el dispositivo es la única copia que existe y no se puede
   * pisar con lo que llegue de Firestore.
   */
  syncedUid: string | null;

  addMedia: (media: Omit<SavedMedia, 'updatedAt'>) => void;
  updateStatus: (tmdbId: number, status: MediaStatus) => void;
  /** Cambios sueltos sobre un título: progreso, plataformas, colecciones. */
  patchMedia: (tmdbId: number, patch: Partial<SavedMedia>) => void;
  /**
   * Datos de TMDB refrescados, sin tocar `updatedAt`.
   *
   * `updatedAt` es la fecha en que la persona tocó el título —por ella se
   * ordena "Agregados hace poco" y se decide quién gana en un conflicto—, y un
   * refresco en segundo plano no es algo que la persona haya hecho.
   */
  enrichMedia: (tmdbId: number, patch: Partial<SavedMedia>) => void;
  addWatchEntry: (tmdbId: number, entry: WatchEntry) => void;
  /** Corrige una reseña ya guardada: puntaje, comentario o etiquetas. */
  updateWatchEntry: (tmdbId: number, entry: WatchEntry) => void;
  removeWatchEntry: (tmdbId: number, entryId: string) => void;
  setProgress: (tmdbId: number, progress: SeriesProgress) => void;
  removeMedia: (tmdbId: number) => void;
  setMediaList: (list: SavedMedia[]) => void;

  setPicks: (picks: TastePicks) => void;
  setGoals: (goals: Goals) => void;

  setCollections: (collections: Collection[]) => void;
  addCollection: (collection: Collection) => void;
  renameCollection: (id: string, name: string) => void;
  removeCollection: (id: string) => void;

  setOwnerUid: (uid: string | null) => void;
  /** Marca que la biblioteca de este UID ya llegó desde el servidor. */
  setSyncedUid: (uid: string | null) => void;
  /** Vacía la biblioteca local. Se usa al cerrar sesión y al cambiar de cuenta. */
  reset: () => void;
}

/** Aplica un cambio a un título por id, refrescando `updatedAt`. */
function mapMedia(
  list: SavedMedia[],
  tmdbId: number,
  change: (media: SavedMedia) => SavedMedia,
): SavedMedia[] {
  return list.map((media) =>
    media.tmdbId === tmdbId
      ? { ...change(media), updatedAt: new Date().toISOString() }
      : media,
  );
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set) => ({
      mediaList: [],
      collections: [],
      picks: emptyPicks(),
      goals: emptyGoals(),
      ownerUid: null,
      syncedUid: null,
      setMediaList: (list) => set({ mediaList: list }),
      setPicks: (picks) => set({ picks }),
      setGoals: (goals) => set({ goals }),
      setOwnerUid: (uid) => set({ ownerUid: uid }),
      setSyncedUid: (uid) => set({ syncedUid: uid }),
      reset: () =>
        set({
          mediaList: [],
          collections: [],
          picks: emptyPicks(),
          goals: emptyGoals(),
          ownerUid: null,
          syncedUid: null,
        }),

      addMedia: (media) =>
        set((state) => {
          if (state.mediaList.some((m) => m.tmdbId === media.tmdbId)) {
            return state;
          }
          return {
            mediaList: [
              { ...media, updatedAt: new Date().toISOString() },
              ...state.mediaList,
            ],
          };
        }),

      updateStatus: (tmdbId, status) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            ...withArchive({ status }),
          })),
        })),

      patchMedia: (tmdbId, patch) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            ...withArchive(patch),
          })),
        })),

      enrichMedia: (tmdbId, patch) =>
        set((state) => ({
          mediaList: state.mediaList.map((media) =>
            media.tmdbId === tmdbId ? { ...media, ...patch } : media,
          ),
        })),

      addWatchEntry: (tmdbId, entry) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            // Al frente: el historial va de lo más reciente a lo más viejo.
            history: [entry, ...(media.history ?? [])],
            // Reseñar algo abandonado no lo termina: es opinar de lo que viste.
            ...(media.status === 'abandonada'
              ? {}
              : withArchive({ status: 'completada' })),
          })),
        })),

      updateWatchEntry: (tmdbId, entry) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            // En su lugar: editar no la convierte en la vez más reciente.
            history: (media.history ?? []).map((e) =>
              e.id === entry.id ? entry : e,
            ),
          })),
        })),

      removeWatchEntry: (tmdbId, entryId) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => {
            const history = (media.history ?? []).filter((e) => e.id !== entryId);
            return {
              ...media,
              history: history.length > 0 ? history : undefined,
              // Borrar el último visionado deja el título como "viendo": lo
              // tenías, lo abriste, pero ya no consta que lo hayas terminado.
              // Uno archivado se queda donde está: borrar una reseña no lo
              // saca de la pausa ni lo retoma.
              ...(isArchivedStatus(media.status)
                ? {}
                : { status: history.length > 0 ? 'completada' : 'viendo' }),
            };
          }),
        })),

      setProgress: (tmdbId, progress) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            progress:
              Object.keys(progress.watched).length > 0 ? progress : undefined,
          })),
        })),

      removeMedia: (tmdbId) =>
        set((state) => ({
          mediaList: state.mediaList.filter((m) => m.tmdbId !== tmdbId),
        })),

      setCollections: (collections) => set({ collections }),

      addCollection: (collection) =>
        set((state) => ({ collections: [...state.collections, collection] })),

      renameCollection: (id, name) =>
        set((state) => ({
          collections: state.collections.map((collection) =>
            collection.id === id
              ? { ...collection, name, updatedAt: new Date().toISOString() }
              : collection,
          ),
        })),

      removeCollection: (id) =>
        set((state) => ({
          collections: state.collections.filter((c) => c.id !== id),
          // La pertenencia vive en cada título, así que borrar la colección
          // obliga a limpiarles la referencia: si no, quedan apuntando a una
          // lista que ya no existe.
          mediaList: state.mediaList.map((media) => {
            if (!media.collections?.includes(id)) return media;
            const collections = media.collections.filter((c) => c !== id);
            return {
              ...media,
              collections: collections.length > 0 ? collections : undefined,
            };
          }),
        })),
    }),
    {
      name: 'que-miro-storage',
      version: SCHEMA_VERSION,
      /**
       * El cuestionario se valida en cada arranque, no solo al migrar.
       *
       * `migrate` corre únicamente cuando cambia la versión del schema, así que
       * un documento de gustos editado a mano —o guardado por una versión de la
       * app que pedía otra cosa— entraría sin revisar y rompería el perfil al
       * dibujarlo. Pasarlo siempre por `parsePicks` cuesta nada: son siete
       * campos.
       */
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<MediaState>) };
        return { ...state, picks: parsePicks(state.picks), goals: parseGoals(state.goals) };
      },
      /**
       * Migra lo que ya estaba guardado en el dispositivo.
       *
       * Pasa cada título por `parseMedia`, que es el mismo camino que recorren
       * los documentos de Firestore y los backups importados: una sola
       * implementación de la migración para las tres puertas de entrada.
       */
      migrate: (persisted) => {
        const state = persisted as Partial<MediaState> | undefined;
        const rawMedia = Array.isArray(state?.mediaList) ? state.mediaList : [];
        const rawCollections = Array.isArray(state?.collections)
          ? state.collections
          : [];

        return {
          ...state,
          mediaList: rawMedia
            .map(parseMedia)
            .filter((media): media is SavedMedia => media !== null),
          collections: rawCollections
            .map(parseCollection)
            .filter((collection): collection is Collection => collection !== null),
          picks: parsePicks(state?.picks),
          goals: parseGoals(state?.goals),
        } as MediaState;
      },
    },
  ),
);
