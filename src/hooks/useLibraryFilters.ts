import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_SORT,
  LibraryFilters,
  LibraryStatus,
  SORT_OPTIONS,
  SortOption,
} from '@/lib/library';
import { MediaType } from '@/types';

const VALID_STATUSES: LibraryStatus[] = [
  'por_ver',
  'viendo',
  'completada',
  'archivadas',
  'en_pausa',
  'abandonada',
];
const DEFAULT_STATUS: LibraryStatus = 'por_ver';

/** Nombres de los parámetros en la URL, en español para que el link se lea. */
const PARAMS = {
  status: 'estado',
  query: 'q',
  genre: 'genero',
  type: 'tipo',
  provider: 'plataforma',
  collection: 'lista',
  tag: 'tag',
  onlyNew: 'nuevos',
  availableNow: 'ya',
  sort: 'orden',
} as const;

/**
 * Filtros de la biblioteca, guardados en la query string.
 *
 * Vivir en la URL y no en `useState` es lo que hace que una vista filtrada se
 * pueda compartir, marcar como favorita y sobrevivir a un refresh. Los cambios
 * se escriben con `replace` para no llenar el historial: si no, volver atrás
 * después de escribir en el buscador significaría deshacer letra por letra.
 */
export function useLibraryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<LibraryFilters>(() => {
    const status = searchParams.get(PARAMS.status) as LibraryStatus | null;
    const type = searchParams.get(PARAMS.type) as MediaType | null;
    const sort = searchParams.get(PARAMS.sort) as SortOption | null;

    return {
      status: status && VALID_STATUSES.includes(status) ? status : DEFAULT_STATUS,
      query: searchParams.get(PARAMS.query) ?? '',
      genre: searchParams.get(PARAMS.genre) || null,
      type: type === 'movie' || type === 'tv' ? type : null,
      provider: searchParams.get(PARAMS.provider) || null,
      collection: searchParams.get(PARAMS.collection) || null,
      tag: searchParams.get(PARAMS.tag) || null,
      onlyNew: searchParams.get(PARAMS.onlyNew) === '1',
      availableNow: searchParams.get(PARAMS.availableNow) === '1',
      sort: SORT_OPTIONS.some((option) => option.value === sort)
        ? (sort as SortOption)
        : DEFAULT_SORT,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<LibraryFilters>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          for (const [key, value] of Object.entries(patch)) {
            const param = PARAMS[key as keyof typeof PARAMS];
            // Los valores por defecto se sacan de la URL en vez de escribirse:
            // así una lista sin filtrar tiene una URL limpia.
            const isDefault =
              value === null ||
              value === '' ||
              value === false ||
              (key === 'sort' && value === DEFAULT_SORT) ||
              (key === 'status' && value === DEFAULT_STATUS);

            if (isDefault) next.delete(param);
            else next.set(param, value === true ? '1' : String(value));
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setFilters({
      query: '',
      genre: null,
      type: null,
      provider: null,
      collection: null,
      tag: null,
      onlyNew: false,
      availableNow: false,
      sort: DEFAULT_SORT,
    });
  }, [setFilters]);

  return { filters, setFilters, clearFilters };
}
