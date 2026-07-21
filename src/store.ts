import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SavedMedia, MediaStatus, Review } from './types';

interface MediaState {
  mediaList: SavedMedia[];
  addMedia: (media: Omit<SavedMedia, 'updatedAt'>) => void;
  updateStatus: (tmdbId: number, status: MediaStatus) => void;
  addReview: (tmdbId: number, review: Review) => void;
  removeMedia: (tmdbId: number) => void;
  setMediaList: (list: SavedMedia[]) => void;
}

export const useMediaStore = create<MediaState>()(
  persist(
    (set) => ({
      mediaList: [],
      setMediaList: (list) => set({ mediaList: list }),
      addMedia: (media) => set((state) => {
        if (state.mediaList.some(m => m.tmdbId === media.tmdbId)) {
          return state;
        }
        return {
          mediaList: [{ ...media, updatedAt: new Date().toISOString() }, ...state.mediaList]
        };
      }),
      updateStatus: (tmdbId, status) => set((state) => ({
        mediaList: state.mediaList.map(m => 
          m.tmdbId === tmdbId ? { ...m, status, updatedAt: new Date().toISOString() } : m
        )
      })),
      addReview: (tmdbId, review) => set((state) => ({
        mediaList: state.mediaList.map(m =>
          m.tmdbId === tmdbId ? { ...m, review, updatedAt: new Date().toISOString(), status: 'completada' } : m
        )
      })),
      removeMedia: (tmdbId) => set((state) => ({
        mediaList: state.mediaList.filter(m => m.tmdbId !== tmdbId)
      }))
    }),
    {
      name: 'que-miro-storage',
    }
  )
);
