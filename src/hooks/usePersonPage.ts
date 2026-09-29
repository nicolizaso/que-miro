import { useCallback, useEffect, useState } from 'react';
import { PersonPage, getPersonPage } from '@/lib/tmdb';
import { languageForRegion } from '@/lib/language';
import { usePreferences } from '@/preferences';

interface State {
  page: PersonPage | null;
  isLoading: boolean;
  error: string;
}

/**
 * La página de una persona, pedida al servidor.
 *
 * Vuelve a pedirla si cambia el idioma: el nombre no se traduce, pero los
 * títulos de la filmografía y la biografía sí. Un id que no es un entero
 * positivo ni se pide: es un link roto, no un problema de red.
 */
export function usePersonPage(id: number): State & { retry: () => void } {
  const language = usePreferences((state) => languageForRegion(state.region));
  const isValid = Number.isInteger(id) && id > 0;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ page: null, isLoading: isValid, error: '' });

  useEffect(() => {
    if (!isValid) {
      setState({ page: null, isLoading: false, error: '' });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true, error: '' }));
    getPersonPage(id)
      .then((page) => {
        if (!cancelled) setState({ page, isLoading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          page: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'No pudimos traer esta página.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id, isValid, language, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
