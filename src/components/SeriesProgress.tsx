import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Star } from 'lucide-react';
import { MediaStatus, SavedMedia, SeasonInfo, TMDbEpisode } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useSeasonDetail } from '@/hooks/useSeasonDetail';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import {
  airedBoundary,
  airedEpisodes,
  airedInSeason,
  formatEpisode,
  hasWatchedAllAired,
  isCaughtUp,
  isEpisodeWatched,
  isStillAiring,
  nextEpisode,
  progressPercent,
  toggleEpisode,
  toggleSeason,
  totalEpisodes,
  watchedAiredEpisodes,
  watchedEpisodes,
} from '@/lib/progress';
import {
  episodeTypeLabel,
  isEpisodeAired,
  seasonTotalRuntime,
  withSeasonRuntime,
} from '@/lib/episodes';
import { TMDB_STILL_URL } from '@/lib/tmdb';
import { watchCount } from '@/lib/schema';
import { formatDay, formatShortDay, toDayKey } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** El botón que marca un episodio, igual en la grilla y en la lista. */
function EpisodeToggle({
  episode,
  seasonName,
  watched,
  disabled = false,
  title,
  onToggle,
}: {
  episode: number;
  seasonName: string;
  watched: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={`Episodio ${episode} de ${seasonName}`}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'w-9 h-9 shrink-0 rounded-lg border text-xs font-medium transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        watched
          ? 'bg-accent text-accent-contrast border-accent'
          : 'bg-bg-main border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
      )}
    >
      {episode}
    </button>
  );
}

/**
 * Un episodio con su ficha: nombre, fecha, duración e imagen.
 *
 * La sinopsis de lo que no viste queda escondida detrás de un botón. Es la
 * regla anti-spoiler: quien abre la temporada para marcar el episodio de
 * anoche no tiene por qué enterarse de qué pasa en el siguiente.
 */
function EpisodeRow({
  episode,
  seasonName,
  watched,
  today,
  onToggle,
}: {
  episode: TMDbEpisode;
  seasonName: string;
  watched: boolean;
  today: string;
  onToggle: () => void;
}) {
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const aired = isEpisodeAired(episode, today);
  const typeLabel = episodeTypeLabel(episode.episode_type);

  const when = episode.air_date
    ? aired
      ? formatShortDay(episode.air_date)
      : `Sale el ${formatDay(episode.air_date)}`
    : 'Sin fecha todavía';

  const meta = [
    when,
    episode.runtime && `${episode.runtime} min`,
    episode.vote_average > 0 &&
      `${episode.vote_average.toFixed(1).replace('.', ',')} en TMDB`,
  ].filter(Boolean);

  return (
    <li className="flex gap-3 py-3">
      {/* Lo que todavía no salió no se puede marcar, salvo que ya estuviera
          marcado: si no, no habría forma de desmarcarlo. */}
      <EpisodeToggle
        episode={episode.episode_number}
        seasonName={seasonName}
        watched={watched}
        disabled={!aired && !watched}
        title={!aired && !watched ? 'Todavía no salió' : undefined}
        onToggle={onToggle}
      />

      <div className="hidden min-[420px]:block w-24 aspect-video shrink-0 rounded-md bg-border-card overflow-hidden">
        {episode.still_path && (
          <img
            src={`${TMDB_STILL_URL}${episode.still_path}`}
            alt=""
            loading="lazy"
            className={cn('w-full h-full object-cover', !aired && 'opacity-50')}
          />
        )}
      </div>

      <div className={cn('min-w-0 flex-1', !aired && 'text-text-subtle')}>
        <p className="text-sm font-medium leading-snug">
          {episode.name || `Episodio ${episode.episode_number}`}
          {typeLabel && (
            <span className="ml-2 inline-block align-middle rounded-full border border-accent/40 px-2 py-px text-[10px] font-medium uppercase tracking-wide text-accent">
              {typeLabel}
            </span>
          )}
        </p>
        <p className="text-xs text-text-subtle mt-0.5">{meta.join(' · ')}</p>

        {episode.overview &&
          (watched || isOverviewOpen ? (
            <p className="text-xs text-text-muted leading-relaxed mt-1.5">
              {episode.overview}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setIsOverviewOpen(true)}
              className="text-xs text-text-muted underline underline-offset-2 hover:text-text-main mt-1.5"
            >
              Mostrar sinopsis
              <span className="sr-only">
                {' '}
                del episodio {episode.episode_number}
              </span>
            </button>
          ))}
      </div>
    </li>
  );
}

/** Mientras llegan los episodios: la forma de la lista, sin saltos. */
function EpisodeSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className="divide-y divide-border-card px-3">
      {Array.from({ length: Math.min(count, 4) }, (_, index) => (
        <li key={index} className="flex gap-3 py-3">
          <span className="w-9 h-9 rounded-lg bg-border-card animate-pulse shrink-0" />
          <span className="flex-1 flex flex-col gap-2 pt-1">
            <span className="h-3 w-3/5 rounded bg-border-card animate-pulse" />
            <span className="h-2.5 w-2/5 rounded bg-border-card animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una temporada: la lista de episodios, o su grilla de números.
 *
 * Al desplegarse pide sus episodios a TMDB. Mientras no llegan —o si no hay
 * conexión, o TMDB no contesta— queda la grilla de números de siempre, que
 * para marcar lo visto alcanza y no depende de nadie.
 */
function Season({
  media,
  season,
  aired,
  defaultOpen,
  onToggleEpisode,
  onToggleSeason,
  onRuntimeKnown,
}: {
  media: SavedMedia;
  season: SeasonInfo;
  /** Cuántos episodios de la temporada ya salieron. */
  aired: number;
  defaultOpen: boolean;
  onToggleEpisode: (seasonNumber: number, episode: number) => void;
  onToggleSeason: (season: SeasonInfo) => void;
  /** Avisa cuánto dura la temporada entera, cuando se supo. */
  onRuntimeKnown: (seasonNumber: number, totalRuntime: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Contra lo que salió: en una temporada en emisión, "4/10" en rojo dice que
  // faltan seis que todavía nadie pudo ver.
  const seen = (media.progress?.watched[season.seasonNumber] ?? []).filter(
    (episode) => episode <= aired,
  ).length;
  const isComplete = aired > 0 && seen >= aired;
  const upcoming = season.episodeCount - aired;
  const { season: detail, status } = useSeasonDetail(
    media.tmdbId,
    season.seasonNumber,
    isOpen,
  );
  const today = toDayKey(new Date());

  const episodes = detail?.episodes ?? [];

  // La duración se anota solo si la temporada trae los mismos episodios que
  // la biblioteca cree que tiene: si no, la suma sería de otra temporada.
  const totalRuntime =
    episodes.length === season.episodeCount ? seasonTotalRuntime(episodes) : undefined;
  useEffect(() => {
    if (totalRuntime !== undefined && totalRuntime !== season.totalRuntime) {
      onRuntimeKnown(season.seasonNumber, totalRuntime);
    }
    // `onRuntimeKnown` cambia en cada render del padre; lo que importa es el dato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalRuntime, season.totalRuntime, season.seasonNumber]);

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
            {seen}/{aired}
            {upcoming > 0 && (
              <span className="text-text-subtle"> · {upcoming} por salir</span>
            )}
          </span>
        </button>

        {/* Una temporada que todavía no salió no tiene nada para marcar. */}
        {aired > 0 && (
          <button
            type="button"
            onClick={() => onToggleSeason(season)}
            className="text-xs text-text-muted hover:text-text-main transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-border-card"
          >
            {isComplete ? 'Desmarcar' : 'Marcar toda'}
          </button>
        )}
      </div>

      {isOpen &&
        (status === 'loading' ? (
          <EpisodeSkeleton count={season.episodeCount} />
        ) : status === 'ready' && episodes.length > 0 ? (
          <ul className="divide-y divide-border-card px-3">
            {episodes.map((episode) => (
              <EpisodeRow
                key={episode.episode_number}
                episode={episode}
                seasonName={season.name}
                today={today}
                watched={isEpisodeWatched(
                  media.progress,
                  season.seasonNumber,
                  episode.episode_number,
                )}
                onToggle={() =>
                  onToggleEpisode(season.seasonNumber, episode.episode_number)
                }
              />
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-1.5 p-3">
            {Array.from({ length: season.episodeCount }, (_, index) => {
              const episode = index + 1;
              return (
                <li key={episode}>
                  <EpisodeToggle
                    episode={episode}
                    seasonName={season.name}
                    watched={isEpisodeWatched(
                      media.progress,
                      season.seasonNumber,
                      episode,
                    )}
                    onToggle={() => onToggleEpisode(season.seasonNumber, episode)}
                  />
                </li>
              );
            })}
          </ul>
        ))}
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
 * Cada temporada pide sus episodios recién al desplegarse: nombres, fechas e
 * imágenes cuestan una llamada a TMDB por temporada, y casi siempre se mira
 * una sola. Hasta que llegan —o si no llegan— queda la grilla de números.
 */
export function SeriesProgress({
  media,
  seasons,
}: {
  media: SavedMedia;
  /** Temporadas de TMDB, por si el título se guardó antes de cachearlas. */
  seasons: SeasonInfo[];
}) {
  const { setProgress, applyEnrichment } = useMediaActions();
  /** Temporadas cuya duración ya se anotó en esta apertura, para no repetir. */
  const runtimesWritten = useRef(new Set<number>());
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // El progreso se calcula sobre las temporadas que se estén mostrando, que
  // pueden venir de la ficha recién traída y no de lo cacheado en el título.
  const mediaWithSeasons: SavedMedia = { ...media, seasons };

  const total = totalEpisodes(mediaWithSeasons);
  const aired = airedEpisodes(mediaWithSeasons);
  const seen = watchedAiredEpisodes(mediaWithSeasons);
  const percent = progressPercent(mediaWithSeasons);
  const next = nextEpisode(mediaWithSeasons);
  // Estar al día no es haberla terminado: de una serie que sigue saliendo se
  // puede haber visto todo lo emitido, pero no se la puede puntuar como
  // terminada ni decir "la terminaste".
  const caughtUp = isCaughtUp(mediaWithSeasons);
  const isComplete =
    hasWatchedAllAired(mediaWithSeasons) && !isStillAiring(mediaWithSeasons);
  // Lo puntuado al abandonarla no cuenta: esa vuelta no la terminaste.
  const alreadyRated = watchCount(media) > 0;
  const upcomingNext = media.nextToAir;

  if (total === 0) return null;

  /** Estado que le corresponde al título después de un cambio de progreso. */
  const statusFor = (watchedCount: number): MediaStatus | undefined => {
    if (watchedCount === 0) return media.status === 'viendo' ? 'por_ver' : undefined;
    // Marcar un episodio más de una serie en pausa es retomarla. Una abandonada
    // no se retoma sola: completar hasta dónde llegaste es corregir el dato,
    // no volver a mirarla.
    if (media.status === 'en_pausa' && watchedCount > watchedEpisodes(mediaWithSeasons)) {
      return 'viendo';
    }
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

  // Se abre sola la temporada donde quedó la persona, para no obligarla a
  // buscar dónde retomar. Al día, la que está saliendo.
  const boundary = airedBoundary(mediaWithSeasons);
  const openSeason =
    next?.seasonNumber ??
    (caughtUp && boundary && Number.isFinite(boundary.episodeNumber)
      ? boundary.seasonNumber
      : countableSeasons[0]?.seasonNumber);

  /**
   * Anota cuánto dura una temporada, ahora que llegaron sus episodios.
   *
   * Es lo que usan las estadísticas para no estimar con el primer episodio.
   * Solo sobre las temporadas guardadas: las que vienen de la ficha recién
   * traída no son de la biblioteca todavía.
   */
  const handleRuntimeKnown = (seasonNumber: number, totalRuntime: number) => {
    if (runtimesWritten.current.has(seasonNumber)) return;
    const updated = media.seasons
      ? withSeasonRuntime(media.seasons, seasonNumber, totalRuntime)
      : null;
    if (!updated) return;

    runtimesWritten.current.add(seasonNumber);
    applyEnrichment(media, { seasons: updated });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-section">Tu progreso</h3>
        <span className="text-sm text-text-muted tabular-nums">
          {seen} de {aired} episodios
          {total > aired && (
            <span className="text-text-subtle"> · {total - aired} por salir</span>
          )}
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
          ) : caughtUp ? (
            <>
              <span className="text-status-viendo font-medium">Estás al día.</span>
              {upcomingNext && (
                <>
                  {' '}
                  El próximo,{' '}
                  {formatEpisode(upcomingNext.seasonNumber, upcomingNext.episodeNumber)},
                  sale el {formatDay(upcomingNext.airDate)}.
                </>
              )}
            </>
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
            aired={airedInSeason(mediaWithSeasons, season)}
            defaultOpen={season.seasonNumber === openSeason}
            onToggleEpisode={(seasonNumber, episode) =>
              applyProgress(
                toggleEpisode(media.progress, seasonNumber, episode),
              )
            }
            onToggleSeason={(target) =>
              applyProgress(
                toggleSeason(
                  media.progress,
                  target,
                  airedInSeason(mediaWithSeasons, target),
                ),
              )
            }
            onRuntimeKnown={handleRuntimeKnown}
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
