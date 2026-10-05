import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CatalogFilters, parseCatalogFilters, writeCatalogFilters } from '@/lib/catalog';

/**
 * Los filtros del catálogo, guardados en la query string.
 *
 * Como en la biblioteca: viven en la URL para que "terror coreano en Netflix"
 * se pueda compartir y sobreviva a un refresh, y se escriben con `replace`
 * para no llenar el historial de un paso por cada píldora tocada.
 *
 * `update` recibe una función y no un parche porque varios cambios —pasar a
 * series, por ejemplo— dependen de los filtros que había.
 */
export function useCatalogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => parseCatalogFilters(searchParams), [searchParams]);

  const update = useCallback(
    (change: (current: CatalogFilters) => CatalogFilters) => {
      setSearchParams(
        (current) => writeCatalogFilters(current, change(parseCatalogFilters(current))),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { filters, update };
}
