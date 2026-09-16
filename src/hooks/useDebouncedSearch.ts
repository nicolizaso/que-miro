import { useEffect, useRef, useState } from 'react';

/** Lo que tarda en salir la consulta después de la última tecla. */
const DEBOUNCE_MS = 350;

/** Con una letra sola no hay búsqueda que sirva, y sí un pedido al servidor. */
const MIN_LENGTH = 2;

interface SearchState<T> {
  results: T[];
  isSearching: boolean;
  error: string;
}

/**
 * Busca mientras se escribe, sin pedir una vez por tecla.
 *
 * Es el mismo baile que hacía el buscador de títulos —esperar a que la persona
 * pare de escribir, descartar la respuesta que llega tarde— pero sobre
 * cualquier tipo de resultado: el cuestionario de "Contanos de vos" busca
 * títulos, personas y productoras con la misma mecánica.
 *
 * `search` se guarda en una ref y no en las dependencias: casi siempre llega
 * como función anónima, que cambiaría en cada render y volvería a disparar la
 * búsqueda sola.
 */
export function useDebouncedSearch<T>(
  search: (query: string) => Promise<T[]>,
  query: string,
): SearchState<T> {
  const [state, setState] = useState<SearchState<T>>({
    results: [],
    isSearching: false,
    error: '',
  });

  const searchRef = useRef(search);
  searchRef.current = search;

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_LENGTH) {
      setState({ results: [], isSearching: false, error: '' });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isSearching: true, error: '' }));

    const timer = setTimeout(async () => {
      try {
        const results = await searchRef.current(trimmed);
        if (!cancelled) setState({ results, isSearching: false, error: '' });
      } catch (error) {
        if (cancelled) return;
        setState({
          results: [],
          isSearching: false,
          error:
            error instanceof Error ? error.message : 'No pudimos buscar eso.',
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  return state;
}
