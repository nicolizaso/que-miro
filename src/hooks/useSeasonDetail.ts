import { useEffect, useState } from 'react';
import { TMDbSeason } from '@/types';
import { currentLanguage, getSeason } from '@/lib/tmdb';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Temporadas ya pedidas en esta visita, por serie, temporada e idioma.
 *
 * Se guarda la promesa y no el resultado: desplegar la misma temporada dos
 * veces seguidas —o dos componentes que la piden a la vez— es un solo pedido.
 * Tiene tope porque una visita larga puede recorrer muchas series, y lo que
 * se cae de acá lo sigue teniendo el borde.
 */
const cache = new Map<string, Promise<TMDbSeason>>();
const MAX_CACHED = 40;

/** Pide una temporada, o devuelve el pedido que ya estaba en curso o resuelto. */
export function requestSeason(tvId: number, seasonNumber: number): Promise<TMDbSeason> {
  const key = `${tvId}:${seasonNumber}:${currentLanguage()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  const request = getSeason(tvId, seasonNumber);
  cache.set(key, request);
  // Un error no se guarda: la próxima vez que se despliegue, se vuelve a
  // intentar en vez de quedar trabado en la grilla por toda la visita.
  request.catch(() => cache.delete(key));
  return request;
}

/** Solo para los tests. */
export function clearSeasonCache(): void {
  cache.clear();
}

export type SeasonDetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Los episodios de una temporada, pedidos recién cuando se despliega.
 *
 * Perezoso a propósito: una serie de nueve temporadas son nueve pedidos, y
 * casi siempre se mira una sola. Sin conexión no se pide nada y queda la
 * grilla de números de siempre, que para marcar lo visto alcanza.
 */
export function useSeasonDetail(
  tvId: number,
  seasonNumber: number,
  enabled: boolean,
): { season: TMDbSeason | null; status: SeasonDetailStatus } {
  const isOnline = useOnlineStatus();
  const [state, setState] = useState<{
    season: TMDbSeason | null;
    status: SeasonDetailStatus;
  }>({ season: null, status: 'idle' });

  useEffect(() => {
    if (!enabled || !isOnline) return;

    let cancelled = false;
    setState((current) =>
      current.status === 'ready' ? current : { season: null, status: 'loading' },
    );

    requestSeason(tvId, seasonNumber)
      .then((season) => {
        if (!cancelled) setState({ season, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setState({ season: null, status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [tvId, seasonNumber, enabled, isOnline]);

  return state;
}
