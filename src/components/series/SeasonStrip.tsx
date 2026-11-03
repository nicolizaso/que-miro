import { cn } from '@/lib/utils';

/**
 * El mapa de la temporada: un número por episodio.
 *
 * Lleno es visto y el anillo marca el que está en la tarjeta. Tocar un número
 * lleva la tarjeta ahí, no lo marca: si el mismo número a veces navegara y a
 * veces marcara, un toque de más desmarcaría algo sin querer. Para marcar
 * varios están la pregunta por los anteriores y "Marcar toda".
 */
export function SeasonStrip({
  episodeCount,
  current,
  isAired,
  isWatched,
  onGo,
}: {
  episodeCount: number;
  current: number;
  /** Lo que todavía no salió va atenuado. */
  isAired: (episode: number) => boolean;
  isWatched: (episode: number) => boolean;
  onGo: (episode: number) => void;
}) {
  return (
    <ol aria-label="Ir a un episodio" className="flex flex-wrap gap-1.5">
      {Array.from({ length: episodeCount }, (_, index) => {
        const episode = index + 1;
        const watched = isWatched(episode);
        const isCurrent = episode === current;
        return (
          <li key={episode}>
            <button
              type="button"
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
