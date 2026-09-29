import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { SubscribedProvider, Subscriptions } from '@/types';
import { subscriptionsToDocument, toggleSubscription } from '@/lib/subscriptions';

/**
 * Dónde viven las suscripciones de una cuenta: al lado del cuestionario y de
 * las metas, bajo la misma regla de `profile/{docId}`.
 */
export function subscriptionsPath(uid: string): string {
  return `users/${uid}/profile/subscriptions`;
}

/**
 * Leer y marcar las plataformas que la persona paga.
 *
 * Como el cuestionario: con sesión se escribe el documento entero —sacar la
 * última plataforma es una lista vacía que tiene que llegar como tal— y
 * `SyncManager` trae el cambio de vuelta; sin sesión va derecho al store.
 */
export function useSubscriptions() {
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  const persist = (next: Subscriptions) => {
    if (!isAuth) {
      useMediaStore.getState().setSubscriptions(next);
      return;
    }
    setDoc(doc(db, subscriptionsPath(user.uid)), subscriptionsToDocument(next)).catch(
      (error: unknown) => {
        console.error('[suscripciones] No se pudo guardar:', error);
        showToast('No pudimos guardar tus plataformas. Intentá de nuevo.', 'error');
      },
    );
  };

  const toggle = (provider: SubscribedProvider) => {
    persist(toggleSubscription(useMediaStore.getState().subscriptions, provider));
  };

  /** Reemplaza todo: lo usa la importación de un backup. */
  const replaceSubscriptions = (incoming: Subscriptions) => {
    persist({ ...incoming, updatedAt: new Date().toISOString() });
  };

  return { subscriptions, toggle, replaceSubscriptions };
}
