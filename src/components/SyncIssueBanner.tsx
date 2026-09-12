import { DatabaseZap } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncStatus } from '@/lib/syncStatus';

/**
 * Aviso de que la sincronización está rota del lado del servidor.
 *
 * Es el cartel que faltaba para el peor de los casos: Firestore acepta las
 * escrituras en su caché local aunque el servidor las rechace, así que en el
 * dispositivo donde se hizo el cambio todo se ve perfecto y el problema recién
 * aparece en el *otro* dispositivo, donde no hay nada que mostrar. Sin este
 * cartel, la app se veía sana y la biblioteca se partía en dos en silencio.
 *
 * A diferencia del de "sin conexión", este no se arregla solo: dice qué hay
 * que tocar en la consola de Firebase.
 */
/** Qué explicar según lo que esté rompiendo la sincronización. */
const CAUSAS = {
  'missing-database':
    'El proyecto de Firebase no tiene una base de Firestore. Creala en la consola (Firestore Database → Crear base de datos) y publicá las reglas del proyecto.',
  'permission-denied':
    'Las reglas de Firestore están rechazando tu cuenta. Revisá que las reglas del proyecto estén publicadas en la consola (Firestore Database → Reglas) y que sean las de firestore.rules.',
} as const;

export function SyncIssueBanner() {
  const issue = useSyncStatus((state) => state.issue);
  const isOnline = useOnlineStatus();

  // Sin red ya avisa `OfflineBanner`, y ese aviso es el correcto: al volver la
  // conexión se sincroniza solo. Dos carteles de lo mismo son ruido.
  const causa = issue === 'unreachable' || issue === null ? null : CAUSAS[issue];
  if (!causa || !isOnline) return null;

  return (
    <div
      role="alert"
      className="bg-accent/10 border-b border-accent/30 px-4 py-2.5"
    >
      <div className="max-w-5xl mx-auto flex items-start gap-3 text-sm">
        <DatabaseZap
          size={16}
          className="text-accent shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-text-main/90">
          <span className="font-medium">
            Tus cambios no se están sincronizando.
          </span>{' '}
          <span className="text-text-muted">
            Tus títulos quedan guardados solo en este dispositivo. {causa}
          </span>
        </p>
      </div>
    </div>
  );
}
