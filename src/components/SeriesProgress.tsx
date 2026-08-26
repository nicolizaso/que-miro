import { useState } from 'react';
import { Check, ChevronDown, Star } from 'lucide-react';
import { SavedMedia, SeasonInfo } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import {
  formatEpisode,
  isEpisodeWatched,
  isSeriesComplete,
  nextEpisode,
  progressPercent,
  toggleEpisode,
  toggleSeason,
  totalEpisodes,
  watchedEpisodes,
  watchedInSeason,
} from '@/lib/progress';
import { cn } from '@/lib/utils';

/** Una temporada, con su grilla de episodios. */
function Season({
  media,
  season,
  defaultOpen,
  onToggleEpisode,
  onToggleSeason,
}: {
  media: SavedMedia;
  season: SeasonInfo;
  defaultOpen: boolean;
  onToggleEpisode: (seasonNumber: number, episode: number) => void;
  onToggleSeason: (season: SeasonInfo) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const seen = watchedInSeason(media.progress, season.seasonNumber);
  const isComplete = seen >= season.episodeCount;

  return (
    <div className="border border-border-card rounded-control overflow-hidden">
      <div className="flex items-center gap-2 bg-bg-main px-3 py-2">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn('shrink-0 transition-transform', !isOpen && '-rotate-90')}
          />
          <span className="font-medium truncate">{season.name}</span>
          <span
            className={cn(
              'text-xs shrink-0',
              isComplete ? 'text-status-completada' : 'text-text-subtle',
            )}
          >
            {seen}/{season.episodeCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleSeason(season)}
          className="text-xs text-text-muted hover:text-text-main transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-border-card"
        >
          {isComplete ? 'Desmarcar' : 'Marcar toda'}
        </button>
      </div>

      {isOpen && (
        <ul className="flex flex-wrap gap-1.5 p-3">
          {Array.from({ length: season.episodeCount }, (_, index) => {
            const episode = index + 1;
            const watched = isEpisodeWatched(
              media.progress,
              season.seasonNumber,
              episode,
            );

            return (
              <li key={episode}>
                <button
                  type="button"
                  aria-pressed={watched}
                  aria-label={`Episodio ${episode} de ${season.name}`}
                  onClick={() => onToggleEpisode(season.seasonNumber, episode)}
                  className={cn(
                    'w-9 h-9 rounded-lg border text-xs font-medium transition-colors',
                    watched
                      ? 'bg-accent text-accent-contrast border-accent'
                      : 'bg-bg-main border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
                  )}
                >
                  {episode}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Progreso de una serie: qué episodios viste y por dónde vas.
 *
 * Los episodios se marcan de a uno o por temporada entera. El estado del título
 * se acomoda solo —marcar el primer episodio lo pasa a *Viendo*— porque nadie
 * se acuerda de ir a cambiarlo a mano, y una lista *Por Ver* con series ya
 * empezadas deja de servir.
 *
 * La grilla es de números y no de títulos de episodio a propósito: los nombres
 * exigen una llamada a TMDB por temporada, y para marcar lo que viste alcanza
 * con el número.
 */
export function SeriesProgress({
  media,
  seasons,
}: {
  media: SavedMedia;
  /** Temporadas de TMDB, por si el título se guardó antes de cachearlas. */
  seasons: SeasonInfo[];
}) {
  const { setProgress } = useMediaActions();
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // El progreso se calcula sobre las temporadas que se estén mostrando, que
  // pueden venir de la ficha recién traída y no de lo cacheado en el título.
  const mediaWithSeasons: SavedMedia = { ...media, seasons };

  const total = totalEpisodes(mediaWithSeasons);
  const seen = watchedEpisodes(mediaWithSeasons);
  const percent = progressPercent(mediaWithSeasons);
  const next = nextEpisode(mediaWithSeasons);
  const isComplete = isSeriesComplete(mediaWithSeasons);
  const alreadyRated = (media.history?.length ?? 0) > 0;

  if (total === 0) return null;

  /** Estado que le corresponde al título después de un cambio de progreso. */
  const statusFor = (watchedCount: number) => {
    if (watchedCount === 0) return media.status === 'viendo' ? 'por_ver' : undefined;
    // Terminar la serie no la marca como completada por su cuenta: eso lo
    // decide la reseña, igual que en las películas.
    return media.status === 'por_ver' ? 'viendo' : undefined;
  };

  const applyProgress = (progress: ReturnType<typeof toggleEpisode>) => {
    const updated: SavedMedia = { ...mediaWithSeasons, progress };
    setProgress(media.tmdbId, progress, statusFor(watchedEpisodes(updated)));
  };

  const countableSeasons = seasons.filter(
    (season) => season.seasonNumber > 0 && season.episodeCount > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-section">Tu progreso</h3>
        <span className="text-sm text-text-muted tabular-nums">
          {seen} de {total} episodios
        </span>
      </div>

      <div>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso de ${media.title}`}
          className="h-2 w-full bg-border-card rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm text-text-muted mt-2">
          {isComplete ? (
            <span className="text-status-completada font-medium">
              La terminaste.
            </span>
          ) : next ? (
            <>
              Vas por{' '}
              <span className="text-text-main font-medium">
                {formatEpisode(next.seasonNumber, next.episode)}
              </span>
              .
            </>
          ) : (
            'Marcá los episodios que ya viste.'
          )}
        </p>
      </div>

      {isComplete && !alreadyRated && (
        <button
          type="button"
          onClick={() => setIsReviewOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-control border border-accent/40 text-accent text-sm font-medium hover:bg-accent/10 transition-colors"
        >
          <Star size={16} aria-hidden="true" />
          Puntuar la serie
        </button>
      )}

      {isComplete && alreadyRated && (
        <p className="flex items-center gap-2 text-sm text-text-subtle">
          <Check size={16} className="text-status-completada" aria-hidden="true" />
          Ya la puntuaste.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {countableSeasons.map((season) => (
          <Season
            key={season.seasonNumber}
            media={mediaWithSeasons}
            season={season}
            // Se abre sola la temporada donde quedó la persona, para no
            // obligarla a buscar dónde retomar.
            defaultOpen={
              next
                ? season.seasonNumber === next.seasonNumber
                : season.seasonNumber === countableSeasons[0]?.seasonNumber
            }
            onToggleEpisode={(seasonNumber, episode) =>
              applyProgress(
                toggleEpisode(media.progress, seasonNumber, episode),
              )
            }
            onToggleSeason={(target) =>
              applyProgress(toggleSeason(media.progress, target))
            }
          />
        ))}
      </div>

      {isReviewOpen && (
        <ReviewDrawer
          media={media}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </div>
  );
}
