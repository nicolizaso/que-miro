import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Lo que se deja de margen al acercar el elegido: que no quede pegado al borde. */
const EDGE = 24;

/**
 * El mapa de la temporada: un número por episodio.
 *
 * Lleno es visto y el anillo marca el que está en la tarjeta. Tocar un número
 * lleva la tarjeta ahí, no lo marca: si el mismo número a veces navegara y a
 * veces marcara, un toque de más desmarcaría algo sin querer. Para marcar
 * varios están la pregunta por los anteriores y "Marcar toda".
 *
 * Va en una sola fila, arriba de la tarjeta. Abajo saltaba cada vez que la
 * tarjeta cambiaba de alto —una vista, con estrellas, mide más que una sin
 * ver—, a veces justo debajo del dedo. En un renglón y no en varios para que
 * su alto tampoco dependa de cuántos episodios tenga la temporada: si no
 * entran, la fila se desliza y el elegido siempre queda a la vista.
 */
export function SeasonStrip({
  episodeCount,
  current,
  isAired,
  isWatched,
  onGo,
  className,
}: {
  episodeCount: number;
  current: number;
  /** Lo que todavía no salió va atenuado. */
  isAired: (episode: number) => boolean;
  isWatched: (episode: number) => boolean;
  onGo: (episode: number) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const reduceMotion = useReducedMotion();
  const isFirstRender = useRef(true);

  // Si el elegido quedó fuera de la fila —se llegó deslizando la tarjeta, o
  // la temporada abre en el episodio 15—, la fila lo trae al medio. Al abrir,
  // de golpe; después, con animación, salvo que se pida menos movimiento.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>(`[data-episode="${current}"]`);
    const smooth = !isFirstRender.current && !reduceMotion;
    isFirstRender.current = false;
    if (!list || !button) return;

    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    const isVisible =
      left - EDGE >= list.scrollLeft && right + EDGE <= list.scrollLeft + list.clientWidth;
    if (isVisible) return;

    const target = left - (list.clientWidth - button.offsetWidth) / 2;
    // jsdom no implementa el scroll de elementos.
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    } else {
      list.scrollLeft = target;
    }
  }, [current, reduceMotion]);

  return (
    <ol
      ref={listRef}
      aria-label="Ir a un episodio"
      // El relleno es para el anillo del elegido: la fila recorta lo que se
      // le sale, y sin relleno el anillo quedaba cortado.
      className={cn(
        'relative flex gap-1.5 overflow-x-auto overscroll-x-contain py-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {Array.from({ length: episodeCount }, (_, index) => {
        const episode = index + 1;
        const watched = isWatched(episode);
        const isCurrent = episode === current;
        return (
          <li key={episode} className="shrink-0">
            <button
              type="button"
              data-episode={episode}
              onClick={() => onGo(episode)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Ir al episodio ${episode}${watched ? ', visto' : ''}`}
              className={cn(
                'w-9 h-9 rounded-lg border text-xs font-medium tabular-nums transition-colors',
                watched
                  ? 'bg-accent text-accent-contrast border-accent'
                  : 'bg-bg-main border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
                !watched && !isAired(episode) && 'opacity-50',
                isCurrent && 'outline-2 outline-offset-2 outline-text-main',
              )}
            >
              {episode}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
