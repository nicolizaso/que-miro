import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';
import { isFirebaseConfigured } from '@/lib/firebase';
import { refreshQueue } from '@/lib/refresh';

/**
 * Cuánto se espera después de abrir la app para empezar.
 *
 * Lo primero que pide la app es lo que se ve: pósters, la ficha que se abrió,
 * las filas de Explorar. El refresco no apura a nadie y no tiene por qué
 * competir con eso.
 */
export const REFRESH_START_DELAY_MS = 4_000;

/**
 * Las cuentas que ya refrescaron en esta visita.
 *
 * Vive en el módulo y no en un `ref` porque "una visita" es una carga de la
 * página, no un montaje del componente: navegar entre pestañas no tiene que
 * volver a disparar nada. Y se anota por cuenta porque cerrar sesión y entrar
 * con otra es otra biblioteca.
 */
const visited = new Set<string>();

/** Solo para los tests: cada uno arranca como una visita nueva. */
export function resetBackgroundRefresh(): void {
  visited.clear();
}

/**
 * Refresca en segundo plano los títulos cuya ficha envejeció.
 *
 * Sin esto, una serie guardada no se enteraba nunca de lo que pasaba después:
 * ni de una temporada nueva, ni de que terminó. Qué refrescar y en qué orden
 * lo decide `refreshQueue` —lo que estás viendo primero, después lo que sigue
 * saliendo, después *Por Ver*—, con tope por visita; acá solo se decide
 * cuándo, y se hace de a uno, sin apurar a nadie.
 *
 * No corre en el demo, que ya trae su biblioteca completa de TMDB, ni con una
 * cuenta cuya biblioteca todavía no bajó del servidor: refrescar la copia del
 * dispositivo antes de saber qué hay del otro lado sería escribir a ciegas.
 */
export function useBackgroundRefresh(): void {
  const { user, authState } = useAuth();
  const { refreshDetails } = useMediaActions();
  const region = usePreferences((state) => state.region);
  const ownerUid = useMediaStore((state) => state.ownerUid);
  const syncedUid = useMediaStore((state) => state.syncedUid);

  const account =
    authState === 'guest'
      ? 'invitado'
      : authState === 'authenticated' && user && isFirebaseConfigured
        ? user.uid
        : null;
  const isReady =
    account === 'invitado'
      ? ownerUid === null
      : account !== null && ownerUid === account && syncedUid === account;

  useEffect(() => {
    if (!isReady || !account || visited.has(account)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      // Se anota recién al arrancar y no al programarlo: en desarrollo React
      // monta dos veces, y la primera cancela el temporizador antes de que
      // salga.
      visited.add(account);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const queue = refreshQueue(useMediaStore.getState().mediaList, region);
      for (const media of queue) {
        if (cancelled) return;
        try {
          await refreshDetails(media);
        } catch {
          // Sin conexión o TMDB caído: lo que quedó se refresca en la próxima
          // visita, que para eso está vencido.
          return;
        }
      }
    }, REFRESH_START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `refreshDetails` se rearma en cada render; lo que decide si corre es que
    // la biblioteca de esta cuenta esté lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, account, region]);
}
