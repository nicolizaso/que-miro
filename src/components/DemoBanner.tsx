import { useEffect, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { hydrateDemoLibrary } from '@/lib/demo';
import { usePreferences } from '@/preferences';

/**
 * Aviso persistente de que lo que se está viendo son datos de ejemplo.
 *
 * También es el lugar donde se dispara la hidratación de los pósters desde
 * TMDB: se monta una sola vez por sesión de demo, junto con el layout.
 */
export function DemoBanner() {
  const { authState, stopDemo } = useAuth();
  const region = usePreferences((state) => state.region);
  const hydrated = useRef(false);

  useEffect(() => {
    if (authState !== 'demo' || hydrated.current) return;
    hydrated.current = true;
    // Sin `await` ni manejo de error: si TMDB no responde, la biblioteca queda
    // con los datos del seed y las tarjetas muestran su placeholder.
    void hydrateDemoLibrary(region);
  }, [authState, region]);

  if (authState !== 'demo') return null;

  return (
    <div className="bg-accent/10 border-b border-accent/30 px-4 py-2.5">
      <div className="max-w-5xl mx-auto flex items-center gap-3 text-sm">
        <Sparkles size={16} className="text-accent shrink-0" aria-hidden="true" />
        <p className="flex-1 text-text-main/90">
          <span className="font-medium">Estás viendo el demo.</span>{' '}
          {/* La aclaración se esconde en pantalla angosta: ahí el cartel
              entero le come tres renglones a la vista, y lo que hay que
              entender —que esto es el demo— ya lo dice la primera frase. */}
          <span className="text-text-muted hidden sm:inline">
            Los títulos son de ejemplo y nada se guarda en la nube.
          </span>
        </p>
        <button
          onClick={stopDemo}
          className="btn btn-ghost shrink-0 px-2 py-1 text-sm"
        >
          <X size={14} aria-hidden="true" />
          Salir del demo
        </button>
      </div>
    </div>
  );
}
