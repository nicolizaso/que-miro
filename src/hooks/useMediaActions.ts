import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { SavedMedia, MediaStatus, Review } from '@/types';

function sanitizeData<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData) as unknown as T;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      result[key] = null;
    } else {
      result[key] = sanitizeData(value);
    }
  }
  return result;
}

export function useMediaActions() {
  const { addMedia: localAdd, updateStatus: localUpdate, addReview: localReview, removeMedia: localRemove, mediaList } = useMediaStore();
  const { user, authState } = useAuth();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const addMedia = async (media: Omit<SavedMedia, 'updatedAt'>) => {
    const fullMedia = { ...media, updatedAt: new Date().toISOString() };
    if (isAuth) {
      await setDoc(doc(db, `users/${user.uid}/saved_media/${media.tmdbId}`), sanitizeData(fullMedia));
    } else {
      localAdd(media);
    }
  };

  const updateStatus = async (tmdbId: number, status: MediaStatus) => {
    if (isAuth) {
      const media = mediaList.find(m => m.tmdbId === tmdbId);
      if (media) {
        await setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), sanitizeData({ ...media, status, updatedAt: new Date().toISOString() }));
      } else {
        setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), sanitizeData({ status, updatedAt: new Date().toISOString() }), { merge: true });
      }
    } else {
      localUpdate(tmdbId, status);
    }
  };

  const addReview = async (tmdbId: number, review: Review) => {
    if (isAuth) {
      const media = mediaList.find(m => m.tmdbId === tmdbId);
      if (media) {
        await setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), sanitizeData({ ...media, review, status: 'completada', updatedAt: new Date().toISOString() }));
      } else {
        setDoc(doc(db, `users/${user.uid}/saved_media/${tmdbId}`), sanitizeData({ review, status: 'completada', updatedAt: new Date().toISOString() }), { merge: true });
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
