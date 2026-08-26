import { useEffect, useState } from 'react';
import { TMDbResult } from '@/types';

interface State {
  results: TMDbResult[];
  isLoading: boolean;
  error: string;
}

/**
 * Trae una lista de títulos de TMDB, con sus estados de carga y error.
 *
 * `deps` decide cuándo volver a pedir. La bandera `cancelled` evita que una
 * respuesta lenta pise a una petición más nueva, y que se intente actualizar el
 * estado de un componente ya desmontado.
 */
export function useTmdbList(
  fetcher: () => Promise<TMDbResult[]>,
  deps: unknown[] = [],
): State {
  const [state, setState] = useState<State>({
    results: [],
    isLoading: true,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: '' }));

    fetcher()
      .then((results) => {
        if (!cancelled) setState({ results, isLoading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          results: [],
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'No pudimos traer estos títulos.',
        });
      });

    return () => {
      cancelled = true;
    };
    // `fetcher` es casi siempre una función anónima, así que cambiaría en cada
    // render: quien llama declara sus dependencias reales en `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
