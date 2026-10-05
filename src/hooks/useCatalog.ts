import { useCallback, useEffect, useRef, useState } from 'react';
import { appendCatalogPage, catalogDiscoverParams, catalogQueryKey, CatalogFilters } from '@/lib/catalog';
import { getDiscoverPage } from '@/lib/tmdb';
import { TMDbResult } from '@/types';

interface State {
  /** De qué consulta son estos resultados: si no es la actual, son viejos. */
  key: string;
  results: TMDbResult[];
  /** La última página que llegó; cero antes de la primera. */
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string;
}

function emptyState(key: string): State {
  return { key, results: [], page: 0, totalPages: 1, isLoading: true, error: '' };
}

/**
 * Las páginas del catálogo para unos filtros, de a una por vez.
 *
 * Arranca con la primera y suma la siguiente cada vez que se pide `loadMore`.
 * Cambiar de filtros descarta todo y vuelve a empezar; una respuesta que
 * llega tarde, de filtros que ya no están, se tira en vez de mezclarse con la
 * grilla nueva.
 */
export function useCatalog(filters: CatalogFilters, region: string) {
  const key = catalogQueryKey(filters, region);
  const [state, setState] = useState<State>(() => emptyState(key));
  // La consulta en curso: lo que se compara al llegar cada respuesta.
  const currentKey = useRef(key);
  // Los filtros y la región en un ref para que `fetchPage` no cambie con cada
  // render: lo que define cuándo volver a pedir es la clave. La región sola
  // no la cambia si no hay plataformas elegidas, y ahí no hay nada que pedir
  // de nuevo.
  const queryRef = useRef({ filters, region });
  queryRef.current = { filters, region };

  const fetchPage = useCallback(
    (requestKey: string, page: number) => {
      setState((current) => ({ ...current, isLoading: true, error: '' }));

      const latest = queryRef.current;
      getDiscoverPage(catalogDiscoverParams(latest.filters, latest.region, page))
        .then((data) => {
          if (currentKey.current !== requestKey) return;
          setState((current) => ({
            key: requestKey,
            results: appendCatalogPage(current.results, data.results),
            page: data.page,
            totalPages: data.totalPages,
            isLoading: false,
            error: '',
          }));
        })
        .catch((error: unknown) => {
          if (currentKey.current !== requestKey) return;
          setState((current) => ({
            ...current,
            isLoading: false,
            error:
              error instanceof Error ? error.message : 'No pudimos traer el catálogo.',
          }));
        });
    },
    [],
  );

  useEffect(() => {
    currentKey.current = key;
    setState(emptyState(key));
    fetchPage(key, 1);
  }, [key, fetchPage]);

  // Mientras la clave del estado no es la actual, lo que hay es de antes: se
  // muestra cargando, no la grilla vieja.
  const isStale = state.key !== key;
  const hasMore = !isStale && !state.error && state.page < state.totalPages;

  const loadMore = useCallback(() => {
    if (isStale || state.isLoading || !hasMore) return;
    fetchPage(key, state.page + 1);
  }, [isStale, state.isLoading, state.page, hasMore, fetchPage, key]);

  /** Reintenta la página que falló, sin perder las que ya estaban. */
  const retry = useCallback(() => {
    fetchPage(key, state.page + 1);
  }, [fetchPage, key, state.page]);

  return {
    results: isStale ? [] : state.results,
    isLoading: isStale || state.isLoading,
    error: isStale ? '' : state.error,
    hasMore,
    /** Si ya llegó la primera página: antes no hay nada que decir de vacío. */
    hasLoaded: !isStale && state.page > 0,
    loadMore,
    retry,
  };
}
