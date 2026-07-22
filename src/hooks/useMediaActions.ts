import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { SavedMedia, MediaStatus, Review } from '@/types';

export function useMediaActions() {
  const { addMedia: localAdd, updateStatus: localUpdate, addReview: localReview, removeMedia: localRemove, mediaList } = useMediaStore();
  const { user, authState } = useAuth();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const addMedia = async (media: Omit<SavedMedia, 'updatedAt'>) => {
    const fullMedia = { ...media, updatedAt: new Date().toISOString() };
    if (isAuth) {
      await setDoc(doc(db, `users/${user.uid}/saved_media/${media.tmdbId}`), fullMedia);
    } else {
      localAdd(media);
    }
  };

  const updateStatus = async (tmdbId: number, status: MediaStatus) => {
    if (isAuth) {
      const media = mediaList.find(m => m.tmdbId === tmdbId);
      if (media) {
        await setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), { ...media, status, updatedAt: new Date().toISOString() });
      }
    } else {
      localUpdate(tmdbId, status);
    }
  };

  const addReview = async (tmdbId: number, review: Review) => {
    if (isAuth) {
      const media = mediaList.find(m => m.tmdbId === tmdbId);
      if (media) {
        await setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), { ...media, review, status: 'completada', updatedAt: new Date().toISOString() });
      }
    } else {
      localReview(tmdbId, review);
    }
  };

  const removeMedia = async (tmdbId: number) => {
    if (isAuth) {
      await deleteDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`));
    } else {
      localRemove(tmdbId);
    }
  };

  return { addMedia, updateStatus, addReview, removeMedia };
}
