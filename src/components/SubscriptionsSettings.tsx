import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Search } from 'lucide-react';
import { SubscribedProvider } from '@/types';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { JustWatchCredit } from '@/components/Attribution';
import { RegionProvider, TMDB_LOGO_URL, getRegionProviders } from '@/lib/tmdb';
import { isSubscribed, recommendsOnlyMine, searchProviders } from '@/lib/subscriptions';
import { getRegionName, usePreferences } from '@/preferences';
import { cn } from '@/lib/utils';

/** Las que se ven sin tocar "ver todas": las más usadas del país. */
const FIRST_PAGE = 18;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * "Tus plataformas": qué pagás, elegido con los logos.
 *
 * Vive con "Contanos de vos" y no en Ajustes porque, además de filtrar la
 * biblioteca, decide qué te recomienda Explorar.
 *
 * La lista es la del país elegido en Ajustes, en el orden en que se usan ahí.
 * Lo que ya marcaste se ve siempre, aunque sea de otro país o esté más abajo:
 * si no, no habría forma de desmarcarlo.
 */
export function SubscriptionsSettings() {
  const region = usePreferences((state) => state.region);
  const { subscriptions, toggle, toggleOnlyMine } = useSubscriptions();
  const isOnline = useOnlineStatus();
  const [providers, setProviders] = useState<RegionProvider[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const headingId = useId();
  const statusId = useId();

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

  const isSearching = query.trim() !== '';

  const visible = useMemo(() => {
    // Buscando se busca en todas: escribir "mubi" y no encontrarla porque
    // está después de la página sería un buscador que miente.
    const page = isSearching || showAll ? providers : providers.slice(0, FIRST_PAGE);
    const listed: SubscribedProvider[] = searchProviders(page, query).map(
      ({ id, name, logoPath }) => ({ id, name, logoPath }),
    );
    // Lo marcado que quedó afuera de la página —o que no es de este país— va
    // al final, para poder desmarcarlo.
    const extra = searchProviders(subscriptions.providers, query).filter(
      (subscribed) => !listed.some((provider) => provider.id === subscribed.id),
    );
    return [...listed, ...extra];
  }, [providers, showAll, isSearching, query, subscriptions.providers]);

  const hasProviders = subscriptions.providers.length > 0;
  const onlyMine = recommendsOnlyMine(subscriptions);

  return (
    <section className="surface p-5 flex flex-col gap-5" aria-labelledby={headingId}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-section">
          Tus plataformas
        </h2>
        <p className="text-sm text-text-muted max-w-prose">
          Marcá las que pagás. Explorar te arma filas con su catálogo, y "Lo
          que puedo ver ya" filtra tu biblioteca y el picker. Son las de{' '}
          {getRegionName(region)}: el país se cambia en{' '}
          <Link to="/perfil/ajustes" className="underline underline-offset-4 hover:text-text-main">
            Ajustes
          </Link>
          .
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

          {providers.length > FIRST_PAGE && (
            <div className="relative">
              <Search
                size={16}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar una plataforma"
                aria-label="Buscar una plataforma"
                aria-describedby={statusId}
                className="w-full bg-bg-main border border-border-control rounded-control py-2.5 pl-9 pr-3 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {/* Sin esto la búsqueda es silenciosa para quien no ve la grilla cambiar. */}
          <p id={statusId} role="status" aria-live="polite" className={cn(!isSearching && 'sr-only', 'text-sm text-text-muted')}>
            {isSearching
              ? visible.length === 0
                ? `Ninguna plataforma de ${getRegionName(region)} se llama así.`
                : `${visible.length} ${visible.length === 1 ? 'plataforma' : 'plataformas'}`
              : ''}
          </p>

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
          {!showAll && !isSearching && providers.length > FIRST_PAGE && (
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

      {/* Solo con algo marcado: sin plataformas no hay a qué limitarse. */}
      {hasProviders && (
        <label className="flex items-start gap-3 cursor-pointer border-t border-border-card pt-4">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(event) => toggleOnlyMine(event.target.checked)}
            className="mt-1 w-4 h-4 accent-accent shrink-0"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Recomendame solo lo que está en mis plataformas
            </span>
            <span className="text-xs text-text-subtle">
              Explorar se arma con lo incluido en lo que pagás, sin alquiler ni
              compra. Mientras esté prendido no aparecen las filas que no se
              pueden filtrar así —"Porque viste", filmografías, sagas,
              tendencias—; las de tu biblioteca, sí.
            </span>
          </span>
        </label>
      )}

      <JustWatchCredit />
    </section>
  );
}
