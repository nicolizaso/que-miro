import { useEffect, useRef } from 'react';
import { SavedMedia } from '@/types';
import { needsPeople } from '@/lib/enrich';
import { useMediaActions } from '@/hooks/useMediaActions';

/**
 * Cuántos títulos se completan por visita.
 *
 * Es una llamada a TMDB y una escritura por título: de a seis, una biblioteca
 * grande queda completa en unas pocas visitas y ninguna se nota.
 */
const PER_VISIT = 6;

/**
 * Completa de a poco el reparto de los títulos guardados antes de que existiera.
 *
 * Las filas por gente —"otros trabajos de", "si te gustó"— dependen de un dato
 * que la biblioteca vieja no tiene. Migrarla de una sola vez serían cientos de
 * llamadas a TMDB apenas alguien abre la pestaña; migrar nada dejaría esas
 * filas apagadas para siempre en las bibliotecas que más señal tienen.
 *
 * Se empieza por lo mejor puntuado, que es de donde salen las recomendaciones.
 * Si TMDB no contesta, no pasa nada: la próxima visita lo intenta de nuevo.
 */
export function usePeopleBackfill(list: SavedMedia[]): void {
  const { refreshDetails } = useMediaActions();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    const pending = list
      .filter(needsPeople)
      .sort((a, b) => bestRating(b) - bestRating(a))
      .slice(0, PER_VISIT);

    if (pending.length === 0) return;
    started.current = true;

    let cancelled = false;

    (async () => {
      for (const media of pending) {
        if (cancelled) return;
        try {
          await refreshDetails(media);
        } catch {
          // Sin conexión o TMDB caído: se reintenta en la próxima visita.
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `refreshDetails` se rearma en cada render; el guard de arriba es lo que
    // garantiza que esto corra una sola vez por visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
}

/** El mejor puntaje que tiene el título, o cero si nunca se puntuó. */
function bestRating(media: SavedMedia): number {
  return (media.history ?? []).reduce(
    (best, entry) => Math.max(best, entry.rating),
    0,
  );
}
