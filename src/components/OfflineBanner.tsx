import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Aviso de que se cortó la conexión.
 *
 * No es una advertencia de que algo se va a perder, porque no se pierde:
 * Firestore encola las escrituras en IndexedDB y las manda solas al volver la
 * red. El cartel está para explicar por qué un cambio todavía no aparece en el
 * otro dispositivo, que si no se lee como un bug.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { authState } = useAuth();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-status-por-ver/10 border-b border-status-por-ver/30 px-4 py-2.5"
    >
      <div className="max-w-5xl mx-auto flex items-center gap-3 text-sm">
        <CloudOff
          size={16}
          className="text-status-por-ver shrink-0"
          aria-hidden="true"
        />
        <p className="text-text-main/90">
          <span className="font-medium">Estás sin conexión.</span>{' '}
          <span className="text-text-muted">
            {authState === 'authenticated'
              ? 'Podés seguir usando la app: tus cambios se sincronizan solos cuando vuelva la red.'
              : 'Tus cambios quedan guardados en este dispositivo.'}
          </span>
        </p>
      </div>
    </div>
  );
}
