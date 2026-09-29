import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { SubscribedProvider } from '@/types';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { JustWatchCredit } from '@/components/Attribution';
import { RegionProvider, TMDB_LOGO_URL, getRegionProviders } from '@/lib/tmdb';
import { isSubscribed } from '@/lib/subscriptions';
import { getRegionName, usePreferences } from '@/preferences';
import { cn } from '@/lib/utils';

/** Las que se ven sin tocar "ver todas": las más usadas del país. */
const FIRST_PAGE = 18;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * "Tus plataformas": qué pagás, elegido con los logos.
 *
 * La lista es la del país elegido en Preferencias, en el orden en que se usan
 * ahí. Lo que ya marcaste se ve siempre, aunque sea de otro país o esté más
 * abajo: si no, no habría forma de desmarcarlo.
 */
export function SubscriptionsSettings() {
  const region = usePreferences((state) => state.region);
  const { subscriptions, toggle } = useSubscriptions();
  const isOnline = useOnlineStatus();
  const [providers, setProviders] = useState<RegionProvider[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setState('error');
      return;
    }
    let cancelled = false;
    setState('loading');
    getRegionProviders(region)
      .then((list) => {
        if (cancelled) return;
        setProviders(list);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [region, isOnline]);

  const visible = useMemo(() => {
    const listed: SubscribedProvider[] = (showAll ? providers : providers.slice(0, FIRST_PAGE)).map(
      ({ id, name, logoPath }) => ({ id, name, logoPath }),
    );
    // Lo marcado que quedó afuera de la página —o que no es de este país— va
    // al final, para poder desmarcarlo.
    const extra = subscriptions.providers.filter(
      (subscribed) => !listed.some((provider) => provider.id === subscribed.id),
    );
    return [...listed, ...extra];
  }, [providers, showAll, subscriptions.providers]);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Tus plataformas</h2>
        <p className="text-sm text-text-muted mt-1">
          Marcá las que pagás. Con eso, "Lo que puedo ver ya" filtra tu
          biblioteca y el picker, y Explorar te muestra primero lo que tenés.
          Vale para todos tus dispositivos.
        </p>
      </div>

      {state === 'loading' && providers.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-muted py-4">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Buscando las plataformas de {getRegionName(region)}…
        </p>
      ) : (
        <>
          {state === 'error' && (
            <p className="text-sm text-text-muted">
              No pudimos traer las plataformas de {getRegionName(region)}
              {isOnline ? '' : ' sin conexión'}. Lo que ya marcaste sigue acá.
            </p>
          )}
          {visible.length > 0 && (
            <ul className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-6 gap-3">
              {visible.map((provider) => {
                const isOn = isSubscribed(subscriptions, provider.id);
                return (
                  <li key={provider.id}>
                    <button
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggle(provider)}
                      className={cn(
                        'relative w-full h-full flex flex-col items-center gap-1.5 p-2 rounded-control border transition-colors',
                        isOn
                          ? 'border-accent bg-accent/10'
                          : 'border-border-card hover:border-text-subtle',
                      )}
                    >
                      <span className="block w-12 h-12 rounded-control bg-border-card overflow-hidden">
                        {provider.logoPath && (
                          <img
                            src={`${TMDB_LOGO_URL}${provider.logoPath}`}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </span>
                      <span className="text-xs text-center leading-tight line-clamp-2">
                        {provider.name}
                      </span>
                      {isOn && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-accent-contrast flex items-center justify-center">
                          <Check size={12} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!showAll && providers.length > FIRST_PAGE && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="self-start text-sm text-text-muted underline underline-offset-4 hover:text-text-main"
            >
              Ver todas ({providers.length})
            </button>
          )}
        </>
      )}

      <JustWatchCredit />
    </section>
  );
}
