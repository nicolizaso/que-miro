import { useEffect, useState } from 'react';

/**
 * Si el navegador cree tener conexión.
 *
 * `navigator.onLine` miente hacia el lado optimista —dice `true` con wifi
 * conectado pero sin salida— así que sirve para avisar que *no* hay red, no
 * para garantizar que sí la hay. Alcanza para lo que se usa acá: mostrar el
 * cartel de "sin conexión" cuando efectivamente se cortó.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
