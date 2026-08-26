import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Collection, MediaStatus, SavedMedia, SeriesProgress, WatchEntry } from './types';
import { SCHEMA_VERSION, parseCollection, parseMedia } from './lib/schema';

interface MediaState {
  mediaList: SavedMedia[];
  /** Listas propias, más allá de los tres estados fijos. */
  collections: Collection[];
  /**
   * UID del usuario dueño de los datos que hay en memoria/localStorage.
   * `null` significa "datos de invitado", todavía no asociados a ninguna cuenta.
   *
   * Es lo que evita que la biblioteca de un usuario se le aparezca al
   * siguiente que inicie sesión en el mismo dispositivo.
   */
  ownerUid: string | null;

  addMedia: (media: Omit<SavedMedia, 'updatedAt'>) => void;
  updateStatus: (tmdbId: number, status: MediaStatus) => void;
  /** Cambios sueltos sobre un título: progreso, plataformas, colecciones. */
  patchMedia: (tmdbId: number, patch: Partial<SavedMedia>) => void;
  addWatchEntry: (tmdbId: number, entry: WatchEntry) => void;
  removeWatchEntry: (tmdbId: number, entryId: string) => void;
  setProgress: (tmdbId: number, progress: SeriesProgress) => void;
  removeMedia: (tmdbId: number) => void;
  setMediaList: (list: SavedMedia[]) => void;

  setCollections: (collections: Collection[]) => void;
  addCollection: (collection: Collection) => void;
  renameCollection: (id: string, name: string) => void;
  removeCollection: (id: string) => void;

  setOwnerUid: (uid: string | null) => void;
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
      ownerUid: null,
      setMediaList: (list) => set({ mediaList: list }),
      setOwnerUid: (uid) => set({ ownerUid: uid }),
      reset: () => set({ mediaList: [], collections: [], ownerUid: null }),

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
            status,
          })),
        })),

      patchMedia: (tmdbId, patch) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            ...patch,
          })),
        })),

      addWatchEntry: (tmdbId, entry) =>
        set((state) => ({
          mediaList: mapMedia(state.mediaList, tmdbId, (media) => ({
            ...media,
            // Al frente: el historial va de lo más reciente a lo más viejo.
            history: [entry, ...(media.history ?? [])],
            status: 'completada',
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
              status: history.length > 0 ? 'completada' : 'viendo',
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
        } as MediaState;
      },
    },
  ),
);
