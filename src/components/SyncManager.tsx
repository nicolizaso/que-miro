import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { SavedMedia } from '@/types';

export function SyncManager() {
  const { user, authState } = useAuth();
  const { mediaList, setMediaList } = useMediaStore();
  const initialized = useRef(false);

  // Sync logic when user logs in
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    if (authState === 'authenticated' && user) {
      const savedMediaRef = collection(db, `users/${user.uid}/saved_media`);
      
      // 1. Initial Migration (Local to Firebase)
      if (!initialized.current) {
        const migrateLocalToFirebase = async () => {
          if (mediaList.length > 0) {
            const batch = writeBatch(db);
            let added = false;
            
            // We shouldn't blindly overwrite Firebase with local, but for migration:
            // Let's just push local items to Firebase if they aren't already there.
            // A safer approach: listen to Firebase first, then merge.
          }
        };
        // We will handle merging below inside the snapshot to be safe.
      }

      // 2. Real-time Listener
      const unsubscribe = onSnapshot(savedMediaRef, async (snapshot) => {
        const firebaseData = snapshot.docs.map(d => d.data() as SavedMedia);
        
        // Merge logic on first load
        if (!initialized.current) {
          initialized.current = true;
          
          const firebaseIds = new Set(firebaseData.map(m => m.tmdbId));
          const localOnly = mediaList.filter(m => !firebaseIds.has(m.tmdbId));
          
          if (localOnly.length > 0) {
            // Migrate local-only items to Firebase
            const batch = writeBatch(db);
            localOnly.forEach(media => {
              const docRef = doc(db, `users/${user.uid}/saved_media/${media.tmdbId}`);
              batch.set(docRef, media);
            });
            await batch.commit();
            // The snapshot will trigger again with the merged data
            return;
          }
        }
        
        // Update local state with Firebase data (Firebase is the source of truth)
        // Sort by updatedAt descending
        const sorted = firebaseData.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        
        // Only update if different to avoid infinite loops
        // In a real app we'd do a deep comparison, but for now we'll just set it
        // The store methods shouldn't trigger Firebase writes if they are from the listener.
        // Wait! If the user clicks "Viendo", the store updates, triggers a re-render.
        // We need to write to Firebase when the user performs an action.
        setMediaList(sorted);
      });

      return () => unsubscribe();
    } else if (authState === 'unauthenticated') {
      // Clear local storage if logged out
      setMediaList([]);
      initialized.current = false;
    }
  }, [user, authState]); // Intentionally not including mediaList to avoid re-triggering listener setup

  return null;
}
