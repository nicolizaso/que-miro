import { useId, useRef, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { SavedMedia, SeasonInfo, SeriesProgress as Progress } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { useSeasonDetail } from '@/hooks/useSeasonDetail';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { SeasonPanel } from '@/components/series/SeasonPanel';
import { SeasonTabs, seasonTabId } from '@/components/series/SeasonTabs';
import { formatRating } from '@/components/ui/StarRating';
import {
  RatedEpisode,
  airedBoundary,
  airedEpisodes,
  airedInSeason,
  episodeHighlights,
  formatEpisode,
  hasWatchedAllAired,
  isCaughtUp,
  isStillAiring,
  nextEpisode,
  progressPercent,
  rateEpisode,
  statusAfterProgress,
  toggleSeason,
  totalEpisodes,
  watchedAiredEpisodes,
  watchedEpisodes,
} from '@/lib/progress';
import { withSeasonRuntime } from '@/lib/episodes';
import { watchCount } from '@/lib/schema';
import { STATUS_LABELS } from '@/lib/archive';
import { formatDay } from '@/lib/dates';

/**
 * Lo que dicen tus puntajes por episodio: el mejor, el peor y el promedio de
 * cada temporada.
 *
 * El promedio aparece solo si la reseña de la serie no trae puntajes por
 * temporada: si los pusiste a mano, esos mandan, y dos números distintos para
 * la misma temporada se contradirían. Los nombres salen de la temporada que
 * TMDB ya haya mandado; sin conexión queda el "T2E5", que alcanza.
 */
function EpisodeHighlightsPanel({ media }: { media: SavedMedia }) {
  const { best, worst, seasons } = episodeHighlights(media);
  const bestSeason = useSeasonDetail(media.tmdbId, best?.seasonNumber ?? 0, best !== undefined);
  const worstSeason = useSeasonDetail(
    media.tmdbId,
    worst?.seasonNumber ?? 0,
    worst !== undefined,
  );

  const hasSeasonRatings = (media.history ?? []).some(
    (entry) => entry.seasonRatings && Object.keys(entry.seasonRatings).length > 0,
  );
  const averages = hasSeasonRatings ? [] : seasons;
  if (!best && averages.length === 0) return null;

  const nameOf = (episode: RatedEpisode, detail: typeof bestSeason) =>
    detail.season?.episodes.find((e) => e.episode_number === episode.episode)?.name;

  /** Un puntaje con su estrella, igual en las tres puntas de la línea. */
  const score = (value: number) => (
    <>
      {' '}
      <span className="tabular-nums text-text-main">{formatRating(value)}</span>
      <Star size={11} className="inline fill-accent text-accent align-baseline ml-0.5" aria-hidden="true" />
      <span className="sr-only"> de 5 estrellas</span>
    </>
  );

  /** "T1E9 · La sombra 5★": antes eran dos tarjetas que en el celular iban apiladas. */
  const highlight = (label: string, episode: RatedEpisode, name: string | undefined) => (
    <span>
      {label}:{' '}
      <span className="text-text-main font-medium">
        {formatEpisode(episode.seasonNumber, episode.episode)}
        {name && <span className="font-normal"> · {name}</span>}
      </span>
      {score(episode.rating)}
    </span>
  );

  return (
    <div className="flex flex-col gap-1.5 text-sm text-text-muted">
      {best && (
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {highlight('Tu mejor episodio', best, nameOf(best, bestSeason))}
          {worst && highlight('Tu peor', worst, nameOf(worst, worstSeason))}
        </p>
      )}
      {averages.length > 0 && (
        <p>
          Tu promedio por temporada:{' '}
          {averages.map((season, index) => (
            <span key={season.seasonNumber}>
              {index > 0 && ' · '}
              <span className="text-text-main">
                T{season.seasonNumber} {formatRating(season.average)}
              </span>
              <Star
                size={11}
                className="inline fill-accent text-accent align-baseline ml-0.5"
                aria-hidden="true"
              />
              <span className="sr-only">
                {' '}
                de 5 estrellas, con {season.count} episodios puntuados
              </span>
            </span>
          ))}
        </p>
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
 * Se ve una temporada por vez, elegida con las pastillas, y en ella un
 * episodio por vez: es lo que se viene a hacer a la ficha de una serie que
 * estás viendo, marcar el de anoche. Cada temporada pide sus episodios recién
 * al elegirse: nombres, fechas e imágenes cuestan una llamada a TMDB por
 * temporada, y casi siempre se mira una sola.
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
  const { showToast } = useToast();
  /** Temporadas cuya duración ya se anotó en esta apertura, para no repetir. */
  const runtimesWritten = useRef(new Set<number>());
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  /** La temporada elegida en las pastillas; sin elegir, la que se abre sola. */
  const [chosenSeason, setChosenSeason] = useState<number | null>(null);
  const panelId = useId();

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

  /**
   * Guarda el progreso y mueve la serie de lista si corresponde.
   *
   * Devuelve si ya hubo un aviso con "Deshacer", para que quien llamó no
   * ofrezca otro encima.
   */
  const applyProgress = async (progress: Progress): Promise<boolean> => {
    const updated: SavedMedia = { ...mediaWithSeasons, progress };
    const status = statusAfterProgress(
      media.status,
      watchedEpisodes(mediaWithSeasons),
      watchedEpisodes(updated),
    );
    // Si salió de Completadas con el puntaje recién puesto, el aviso con
    // "Deshacer" lo da `setProgress`, que es quien lo borró.
    const notified = await setProgress(media.tmdbId, progress, status);
    if (notified) return true;
    // El cambio de lista lo hace la app, no la persona: sin el aviso, la serie
    // desaparece de *Por Ver* sin que nadie entienda adónde fue.
    if (status && status !== media.status) {
      showToast(`"${media.title}" pasó a ${STATUS_LABELS[status]}.`);
    }
    return false;
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
  const selected =
    countableSeasons.find((season) => season.seasonNumber === chosenSeason) ??
    countableSeasons.find((season) => season.seasonNumber === openSeason) ??
    countableSeasons[0];
  const selectedIndex = countableSeasons.indexOf(selected);
  const followingSeason = countableSeasons[selectedIndex + 1];

  /**
   * Marca o desmarca una temporada entera.
   *
   * Desmarcar se lleva todos sus episodios con sus fechas y puntajes de un
   * toque, sin confirmación: el aviso ofrece deshacerlo, que es más rápido que
   * preguntar antes algo que casi siempre se quiere.
   */
  const handleToggleSeason = async (season: SeasonInfo) => {
    const before = media.progress;
    const aired = airedInSeason(mediaWithSeasons, season);
    const progress = toggleSeason(before, season, aired);
    const isUnmarking =
      (progress.watched[season.seasonNumber]?.length ?? 0) <
      (before?.watched[season.seasonNumber]?.length ?? 0);

    const notified = await applyProgress(progress);
    if (isUnmarking && before && !notified) {
      showToast(`Desmarcaste la ${season.name}.`, 'success', {
        action: {
          label: 'Deshacer',
          onAction: () => void setProgress(media.tmdbId, before, media.status),
        },
      });
    }
  };

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

      {countableSeasons.length > 1 && (
        <SeasonTabs
          tabs={countableSeasons.map((season) => ({
            season,
            seen: (media.progress?.watched[season.seasonNumber] ?? []).filter(
              (episode) => episode <= airedInSeason(mediaWithSeasons, season),
            ).length,
            aired: airedInSeason(mediaWithSeasons, season),
          }))}
          selected={selected.seasonNumber}
          panelId={panelId}
          onSelect={setChosenSeason}
        />
      )}

      {/* Una por temporada: al cambiar de pastilla arranca de nuevo, en el
          episodio que le toca a esa temporada. */}
      <SeasonPanel
        key={selected.seasonNumber}
        media={mediaWithSeasons}
        season={selected}
        aired={airedInSeason(mediaWithSeasons, selected)}
        tabPanel={
          countableSeasons.length > 1
            ? { id: panelId, labelledBy: seasonTabId(panelId, selected.seasonNumber) }
            : undefined
        }
        nextSeason={followingSeason}
        onSelectSeason={setChosenSeason}
        onProgress={(progress) => void applyProgress(progress)}
        onRateEpisode={(seasonNumber, episode, rating) => {
          const progress = rateEpisode(media.progress, seasonNumber, episode, rating);
          if (progress) void setProgress(media.tmdbId, progress);
        }}
        onToggleSeason={(season) => void handleToggleSeason(season)}
        onRuntimeKnown={handleRuntimeKnown}
      />

      <EpisodeHighlightsPanel media={media} />

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
