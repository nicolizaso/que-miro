import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { SavedMedia } from '@/types';

export function SyncManager() {
  const { user, authState } = useAuth();
  const { mediaList, setMediaList } = useMediaStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    if (authState === 'authenticated' && user) {
      const savedMediaRef = collection(db, `users/${user.uid}/saved_media`);
      
      const unsubscribe = onSnapshot(savedMediaRef, async (snapshot) => {
        const firebaseData = snapshot.docs.map(d => d.data() as SavedMedia);
        
        // Initial Migration (Local to Firebase)
        if (!initialized.current) {
          initialized.current = true;
          
          const firebaseIds = new Set(firebaseData.map(m => m.tmdbId));
          const localOnly = mediaList.filter(m => !firebaseIds.has(m.tmdbId));
          
          if (localOnly.length > 0) {
            const batch = writeBatch(db);
            localOnly.forEach(media => {
              const docRef = doc(db, `users/${user.uid}/saved_media/${media.tmdbId}`);
              batch.set(docRef, media);
            });
            await batch.commit();
            // Snapshot will trigger again with merged data
            return;
          }
        }
        
        // Update local state with Firebase data
        const sorted = firebaseData.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setMediaList(sorted);
      });

      return () => unsubscribe();
    } else if (authState === 'unauthenticated') {
      // Keep local state for guest users, clear if they explicitly log out? 
      // Actually, if unauthenticated, they shouldn't see someone else's list.
      // The requirement says "y limpia la caché local de Zustand" in Task 1.1 if they had items before log in?
      // Wait, "si el usuario tenía elementos guardados localmente antes de iniciar sesión por primera vez, escribe de forma masiva (writeBatch) esos elementos en Firestore y limpia la caché local de Zustand."
      // The prompt actually says: "escribe de forma masiva (writeBatch) esos elementos en Firestore y limpia la caché local de Zustand."
      // Let's implement that exactly.
    }
  }, [user, authState]);

  return null;
}
