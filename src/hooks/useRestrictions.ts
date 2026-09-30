import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { RestrictionScope, Restrictions } from '@/types';
import { restrictionsToDocument, toggleExcludedGenre } from '@/lib/restrictions';

/**
 * Dónde viven las restricciones de una cuenta: al lado del cuestionario, bajo
 * la misma regla de `profile/{docId}`.
 */
export function restrictionsPath(uid: string): string {
  return `users/${uid}/profile/restrictions`;
}

/**
 * Leer y cambiar "Lo que no te interesa".
 *
 * Como el cuestionario: se guarda cambio por cambio, sin botón. Con sesión se
 * escribe el documento entero —sacar el último género excluido es una lista
 * vacía que tiene que llegar como tal— y `SyncManager` trae el cambio de
 * vuelta; sin sesión va derecho al store.
 */
export function useRestrictions() {
  const restrictions = useMediaStore((state) => state.restrictions);
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const persist = (next: Restrictions) => {
    if (!isAuth) {
      useMediaStore.getState().setRestrictions(next);
      return;
    }
    // Sin esperar al servidor: la caché de Firestore ya actualizó la pantalla
    // y el cambio queda encolado hasta que vuelva la red.
    setDoc(doc(db, restrictionsPath(user.uid)), restrictionsToDocument(next)).catch(
      (error: unknown) => {
        console.error('[restricciones] No se pudo guardar:', error);
        showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
      },
    );
  };

  const toggleGenre = (genre: string) => {
    persist(toggleExcludedGenre(useMediaStore.getState().restrictions, genre));
  };

  /** Pone, cambia o saca (`undefined`) el año mínimo. */
  const setMinYear = (minYear: { year: number; scope: RestrictionScope } | undefined) => {
    persist({
      ...useMediaStore.getState().restrictions,
      minYear,
      updatedAt: new Date().toISOString(),
    });
  };

  /** Reemplaza todo: lo usa la importación de un backup. */
  const replaceRestrictions = (incoming: Restrictions) => {
    persist({ ...incoming, updatedAt: new Date().toISOString() });
  };

  return { restrictions, toggleGenre, setMinYear, replaceRestrictions };
}
