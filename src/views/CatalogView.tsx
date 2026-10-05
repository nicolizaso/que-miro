import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LibraryBig } from 'lucide-react';
import { CardSkeleton, ResultCard } from '@/components/TitleCarousel';
import { FilterRail, RailOption } from '@/components/picker/FilterRail';
import { JustWatchCredit } from '@/components/Attribution';
import { useCatalog } from '@/hooks/useCatalog';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import {
  CATALOG_DECADES,
  CATALOG_LANGUAGES,
  CATALOG_RUNTIMES,
  CATALOG_SORTS,
  CatalogDecade,
  CatalogProvider,
  CatalogRuntime,
  CatalogSort,
  MAX_CATALOG_GENRES,
  MY_PROVIDERS,
  catalogProviderOptions,
  clearCatalogFilters,
  hasActiveCatalogFilters,
  nextProviders,
  providerRailValue,
  switchCatalogType,
  titleKey,
  visibleCatalogResults,
} from '@/lib/catalog';
import { genresFor } from '@/lib/genres';
import { getRegionProviders } from '@/lib/tmdb';
import { usePreferences } from '@/preferences';
import { useMediaStore } from '@/store';
import { MediaType } from '@/types';

const TYPES: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
];

/** El ancho lo pone la columna de la grilla, no la tarjeta. */
const CELL = 'min-w-0';

/**
 * Una elección obligatoria entre pocas opciones —el tipo, el orden—, con el
 * mismo rótulo a la izquierda que las filas de filtros para que todo quede en
 * columna. No lleva "Todos": siempre hay una elegida.
 *
 * En una sola línea que se desliza, como las otras: en un celular "Mejor
 * puntuadas" no entra al lado de "Populares", y partida en dos renglones la
 * fila quedaba más alta que todas las demás.
 */
function ChoiceRow<V extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div role="group" aria-label={name} className="flex items-center gap-3 sm:gap-5">
      <span aria-hidden="true" className="text-eyebrow w-[5.75rem] sm:w-24 shrink-0 sm:text-right">
        {label}
      </span>
      <div className="rail min-w-0 flex-1 flex gap-2 overflow-x-auto -mr-4 pr-4 py-0.5 sm:mr-0 sm:pr-0">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className="pill rail-item"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Las plataformas del país, para ofrecerlas como filtro.
 *
 * Si no llegan —sin red, TMDB caído— la fila se arma igual con las tuyas, que
 * ya están en el dispositivo.
 */
function useRegionProviders(region: string): CatalogProvider[] {
  const [providers, setProviders] = useState<CatalogProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    getRegionProviders(region)
      .then((list) => {
        if (!cancelled) setProviders(list.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  return providers;
}

/**
 * El catálogo: películas o series de todo TMDB, filtradas a mano.
 *
 * Explorar elige por vos; acá elegís vos. Por eso no aplica "Lo que no te
 * interesa": quien busca terror a propósito tiene que poder encontrarlo. Los
 * filtros viven en la URL, así que una búsqueda se comparte con el link.
 */
export function CatalogView() {
  const region = usePreferences((state) => state.region);
  const mediaList = useMediaStore((state) => state.mediaList);
  const subscribed = useMediaStore((state) => state.subscriptions.providers);
  const { filters, update } = useCatalogFilters();
  const { results, isLoading, error, hasMore, hasLoaded, loadMore, retry } = useCatalog(
    filters,
    region,
  );
  const regionProviders = useRegionProviders(region);

  const savedKeys = useMemo(
    () => new Set(mediaList.map((media) => titleKey(media.mediaType, media.tmdbId))),
    [mediaList],
  );
  const visible = useMemo(
    () => visibleCatalogResults(results, savedKeys, filters.hideSaved),
    [results, savedKeys, filters.hideSaved],
  );

  const mine = useMemo(() => subscribed.map((provider) => provider.id), [subscribed]);
  const providerOptions = useMemo<RailOption<string>[]>(() => {
    const options = catalogProviderOptions(regionProviders, subscribed, filters.providers).map(
      (provider) => ({ value: String(provider.id), label: provider.name }),
    );
    return mine.length > 0
      ? [{ value: MY_PROVIDERS, label: 'Mis plataformas' }, ...options]
      : options;
  }, [regionProviders, subscribed, filters.providers, mine.length]);

  const genreOptions = useMemo(
    () => genresFor(filters.type).map((name) => ({ value: name, label: name })),
    [filters.type],
  );

  const isFiltered = hasActiveCatalogFilters(filters);
  const clear = () => update(clearCatalogFilters);

  // Scroll infinito. Mientras el final esté a la vista se sigue pidiendo: con
  // "Ocultar lo que ya tengo" una página entera puede quedar vacía, y sin esto
  // la grilla se quedaría quieta esperando un scroll que no puede pasar.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [nearEnd, setNearEnd] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setNearEnd(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '800px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (nearEnd && hasMore && !isLoading) loadMore();
  }, [nearEnd, hasMore, isLoading, loadMore]);

  const isEmpty = hasLoaded && !isLoading && !error && !hasMore && visible.length === 0;
  const isFirstLoad = isLoading && visible.length === 0;

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto px-4 pt-8 pb-4">
      <header className="flex flex-col gap-3">
        <Link
          to="/explorar"
          className="inline-flex items-center gap-1.5 self-start text-sm text-text-muted hover:text-text-main transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Explorar
        </Link>
        <div>
          <h1 className="text-display mb-1">Catálogo</h1>
          <p className="text-text-muted">
            Todas las películas y series, filtradas como quieras.
          </p>
        </div>
      </header>

      <section aria-label="Filtros del catálogo" className="flex flex-col gap-3">
        <ChoiceRow
          label="Tipo"
          name="Películas o series"
          options={TYPES}
          value={filters.type}
          onChange={(type) => update((current) => switchCatalogType(current, type))}
        />
        <FilterRail
          multiple
          label="Género"
          name="Filtrar por género: alcanza con que tenga uno"
          allLabel="Todos"
          options={genreOptions}
          value={filters.genres}
          onChange={(genres) =>
            update((current) => ({ ...current, genres: genres.slice(0, MAX_CATALOG_GENRES) }))
          }
        />
        {providerOptions.length > 0 && (
          <FilterRail
            multiple
            label="Plataforma"
            name="Filtrar por plataforma: incluido en la suscripción"
            allLabel="Todas"
            options={providerOptions}
            value={providerRailValue(filters.providers, mine)}
            onChange={(value) =>
              update((current) => ({
                ...current,
                providers: nextProviders(value, current.providers, mine),
              }))
            }
          />
        )}
        <FilterRail<CatalogDecade>
          label="Época"
          name="Filtrar por época"
          allLabel="Cualquiera"
          options={CATALOG_DECADES}
          value={filters.decade}
          onChange={(decade) => update((current) => ({ ...current, decade }))}
        />
        {filters.type === 'movie' && (
          <FilterRail<CatalogRuntime>
            label="Duración"
            name="Filtrar por duración"
            allLabel="Cualquiera"
            options={CATALOG_RUNTIMES}
            value={filters.runtime}
            onChange={(runtime) => update((current) => ({ ...current, runtime }))}
          />
        )}
        <FilterRail
          label="Idioma"
          name="Filtrar por idioma original"
          allLabel="Cualquiera"
          options={CATALOG_LANGUAGES}
          value={filters.language}
          onChange={(language) => update((current) => ({ ...current, language }))}
        />
        <ChoiceRow<CatalogSort>
          label="Orden"
          name="Ordenar el catálogo"
          options={CATALOG_SORTS}
          value={filters.sort}
          onChange={(sort) => update((current) => ({ ...current, sort }))}
        />

        <div className="flex flex-wrap items-center gap-2 sm:pl-[7.25rem]">
          <button
            type="button"
            aria-pressed={filters.hideSaved}
            onClick={() => update((current) => ({ ...current, hideSaved: !current.hideSaved }))}
            className="pill"
          >
            Ocultar lo que ya tengo
          </button>
          {isFiltered && (
            <button
              type="button"
              onClick={clear}
              className="h-10 px-3 text-sm font-medium text-accent hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        {filters.providers.length > 0 && <JustWatchCredit className="sm:pl-[7.25rem]" />}
      </section>

      <section aria-label="Resultados" aria-busy={isLoading}>
        {isEmpty ? (
          <div className="flex flex-col items-center text-center gap-3 py-16 text-text-muted">
            <LibraryBig className="text-border-card w-12 h-12" aria-hidden="true" />
            <p className="max-w-sm">
              {filters.hideSaved && results.length > 0
                ? 'Ya tenés todo lo que hay con estos filtros.'
                : 'No hay nada con estos filtros.'}
            </p>
            {isFiltered && (
              <button
                type="button"
                onClick={clear}
                className="px-4 h-10 rounded-control border border-border-control text-sm font-medium hover:bg-bg-card transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-6">
            {visible.map((result) => (
              <ResultCard
                key={titleKey(result.media_type, result.id)}
                result={result}
                className={CELL}
              />
            ))}
            {isLoading &&
              Array.from({ length: isFirstLoad ? 12 : 6 }, (_, index) => (
                <CardSkeleton key={`skeleton-${index}`} className={CELL} />
              ))}
          </ul>
        )}

        {error && (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-text-muted">
            <p className="max-w-sm">
              No pudimos traer {visible.length > 0 ? 'más títulos' : 'el catálogo'}. Tu
              biblioteca sigue funcionando igual.
            </p>
            <button
              type="button"
              onClick={retry}
              className="px-4 h-10 rounded-control border border-border-control text-sm font-medium hover:bg-bg-card transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* El observador pide la página siguiente al acercarse; el botón hace
            lo mismo con el teclado y cuando el navegador no tiene observador. */}
        <div ref={sentinelRef} className="flex justify-center pt-8 pb-6">
          {hasMore && !isLoading && (
            <button
              type="button"
              onClick={loadMore}
              className="px-4 h-10 rounded-control border border-border-control text-sm font-medium hover:bg-bg-card transition-colors"
            >
              Cargar más
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
