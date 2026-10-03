import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { Goals, YearGoal } from '@/types';
import { goalsToDocument, withYearGoal } from '@/lib/goals';

/**
 * Dónde viven las metas de una cuenta.
 *
 * Al lado de `profile/taste`, bajo la misma regla de `profile/{docId}` en
 * `firestore.rules`: lee y escribe solo el dueño. No hizo falta tocar las
 * reglas.
 */
export function goalsPath(uid: string): string {
  return `users/${uid}/profile/goals`;
}

/**
 * Leer y escribir las metas del año.
 *
 * Igual que el cuestionario: con sesión se escribe el documento entero y
 * `SyncManager` trae el cambio de vuelta; sin sesión va derecho al store.
 * Entero y no con `merge`, porque vaciar una meta es sacar un año del mapa, y
 * eso con `merge` no viaja.
 */
export function useGoals() {
  const goals = useMediaStore((state) => state.goals);
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const persist = (next: Goals) => {
    if (!isAuth) {
      useMediaStore.getState().setGoals(next);
      return;
    }

    setDoc(doc(db, goalsPath(user.uid)), goalsToDocument(next)).catch((error: unknown) => {
      console.error('[metas] No se pudo guardar la meta:', error);
      showToast('No pudimos guardar la meta. Intentá de nuevo.', 'error');
    });
  };

  /** Pone, cambia o saca la meta de un año. */
  const saveYearGoal = (year: number, goal: YearGoal) => {
    persist(withYearGoal(useMediaStore.getState().goals, year, goal));
  };

  /**
   * Reemplaza todas las metas: lo usa la importación de un backup. La fecha
   * la pone el reloj de acá, como en el cuestionario: marca cuándo se guardó.
   */
  const replaceGoals = (incoming: Goals) => {
    persist({ ...incoming, updatedAt: new Date().toISOString() });
  };

  return { goals, saveYearGoal, replaceGoals };
}
