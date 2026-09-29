import { useEffect, useMemo, useState } from 'react';
import { TMDbSeason } from '@/types';
import { requestSeason } from '@/hooks/useSeasonDetail';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { seasonKey } from '@/lib/calendar';

/**
 * Las temporadas que el calendario necesita, pedidas en paralelo.
 *
 * Son pocas —las series con algo en el próximo mes— y comparten la caché de
 * la ficha: desplegar una temporada en la ficha y después abrir el calendario
 * es un solo pedido. La que falla no se reintenta ni se avisa: el calendario
 * ya tiene el próximo episodio que guardó la ficha, y con eso se arregla.
 */
export function useCalendarSeasons(
  wanted: { tmdbId: number; seasonNumber: number }[],
): Map<string, TMDbSeason> {
  const isOnline = useOnlineStatus();
  const [seasons, setSeasons] = useState<Map<string, TMDbSeason>>(new Map());

  // Una clave estable para el efecto: la lista se rearma en cada render.
  const signature = useMemo(
    () => wanted.map(({ tmdbId, seasonNumber }) => seasonKey(tmdbId, seasonNumber)).join(','),
    [wanted],
  );

  useEffect(() => {
    if (!isOnline || !signature) return;

    let cancelled = false;
    for (const key of signature.split(',')) {
      const [tmdbId, seasonNumber] = key.split(':').map(Number);
      requestSeason(tmdbId, seasonNumber)
        .then((season) => {
          if (cancelled) return;
          setSeasons((current) => new Map(current).set(key, season));
        })
        .catch(() => {
          // Queda el próximo episodio que la ficha ya tenía guardado.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [signature, isOnline]);

  return seasons;
}
