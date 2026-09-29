import { useMemo, useState } from 'react';
import { isPushConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaActions } from '@/hooks/useMediaActions';
import { usePreferences } from '@/preferences';
import { SavedMedia } from '@/types';
import { currentPushEnvironment, pushSupport } from '@/lib/push';
import {
  addToken,
  currentPermission,
  fetchToken,
  removeToken,
  unsubscribeThisDevice,
} from '@/lib/pushDevice';

const BLOCKED_MESSAGE =
  'Los avisos quedaron bloqueados para Qué Miro? en este navegador. Se habilitan desde la configuración del sitio.';

/**
 * Activar y desactivar los avisos en este dispositivo, y prender o apagar el
 * de cada serie.
 *
 * El permiso se pide solo acá, siempre desde un toque: un navegador que ve
 * pedir permisos al cargar la página aprende a bloquearlos, y Safari
 * directamente no muestra el cartel si el pedido no sale de un gesto.
 */
export function usePush() {
  const { user, authState } = useAuth();
  const { showToast } = useToast();
  const { setNotify } = useMediaActions();
  const pushDevice = usePreferences((state) => state.pushDevice);
  const [permission, setPermission] = useState(currentPermission);
  const [busy, setBusy] = useState(false);
  const support = useMemo(() => pushSupport(currentPushEnvironment(isPushConfigured)), []);

  // Los avisos necesitan cuenta: el servidor lee una instantánea guardada en
  // Firestore, y sin sesión no hay dónde guardarla.
  const uid = isPushConfigured && authState === 'authenticated' && user ? user.uid : null;
  const enabledHere = uid !== null && pushDevice?.uid === uid && permission === 'granted';

  /** Pide el permiso y anota este dispositivo. `true` si quedó activado. */
  const enable = async (): Promise<boolean> => {
    if (!uid || support !== 'supported') return false;
    setBusy(true);
    try {
      // Es lo primero, antes de cualquier otra espera: Safari muestra el
      // cartel solo si el pedido sale directo del toque.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        showToast(
          result === 'denied' ? BLOCKED_MESSAGE : 'Sin tu permiso no podemos avisarte.',
          'error',
        );
        return false;
      }
      const token = await fetchToken();
      const previous = usePreferences.getState().pushDevice;
      await addToken(uid, token, previous?.uid === uid ? previous.token : undefined);
      usePreferences.getState().setPushDevice({ token, uid });
      return true;
    } catch (error) {
      console.error('[avisos] No se pudieron activar:', error);
      showToast('No pudimos activar los avisos. Revisá tu conexión e intentá de nuevo.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Este dispositivo deja de recibir avisos; los demás de la cuenta, no. */
  const disable = async () => {
    const device = usePreferences.getState().pushDevice;
    if (!uid || !device) return;
    setBusy(true);
    try {
      await removeToken(uid, device.token);
      usePreferences.getState().setPushDevice(null);
      await unsubscribeThisDevice().catch(() => undefined);
      showToast('Listo: este dispositivo ya no recibe avisos.');
    } catch (error) {
      console.error('[avisos] No se pudieron desactivar:', error);
      showToast('No pudimos desactivar los avisos. Revisá tu conexión e intentá de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Prende o apaga el aviso de una serie. Prenderlo en un dispositivo que
   * todavía no recibe avisos es pedirlos: se activa primero, y si no hay
   * permiso la marca no se guarda.
   */
  const toggleSeries = async (media: SavedMedia) => {
    if (media.notify) {
      setNotify(media.tmdbId, false);
      return;
    }
    if (!enabledHere) {
      if (!(await enable())) return;
      showToast(`Listo: te avisamos cuando salga un episodio de "${media.title}".`);
    }
    setNotify(media.tmdbId, true);
  };

  return {
    /** Si hay algo para ofrecer: deploy con avisos y sesión iniciada. */
    available: uid !== null,
    support,
    permission,
    enabledHere,
    busy,
    enable,
    disable,
    toggleSeries,
  };
}
