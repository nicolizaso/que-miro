import { useMemo, useState } from 'react';
import { Plus, Tv } from 'lucide-react';
import { SavedMedia } from '@/types';
import { useMediaStore } from '@/store';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useSeasonDetail } from '@/hooks/useSeasonDetail';
import { useToast } from '@/contexts/ToastContext';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { ContinueItem, continueWatching } from '@/lib/continueWatching';
import {
  formatEpisode,
  hasWatchedAllAired,
  isCaughtUp,
  isStillAiring,
  progressPercent,
  toggleEpisode,
} from '@/lib/progress';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';

/**
 * El nombre del episodio que toca, si se sabe.
 *
 * Si es el último que salió, la ficha ya lo trae guardado; si no, sale de la
 * temporada, que se pide una vez por visita y queda en caché. Sin conexión no
 * hay nombre, y la tarjeta se arregla con "T2E6".
 */
function useEpisodeName(item: ContinueItem): string | undefined {
  const { media, next } = item;
  const last = media.lastAired;
  const known =
    last && last.seasonNumber === next.seasonNumber && last.episodeNumber === next.episode
      ? last.name
      : undefined;

  const { season } = useSeasonDetail(media.tmdbId, next.seasonNumber, !known);
  return (
    known ??
    season?.episodes.find((episode) => episode.episode_number === next.episode)?.name
  );
}

function ContinueCard({
  item,
  onMark,
  onOpen,
}: {
  item: ContinueItem;
  onMark: () => void;
  onOpen: () => void;
}) {
  const { media, next } = item;
  const label = formatEpisode(next.seasonNumber, next.episode);
  const name = useEpisodeName(item);
  const percent = progressPercent(media);

  return (
    <li className="rail-item w-72 shrink-0">
      {/* Un `div` y no un `article`, y "Abrir" y no "Ver detalle de": las
          tarjetas de la biblioteca son las que se nombran así, y esta es un
          atajo encima de ellas, no una más. */}
      <div className="surface shadow-card h-full p-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Abrir ${media.title}: sigue ${label}`}
          className="flex flex-1 min-w-0 items-stretch gap-3 text-left"
        >
          <span className="w-14 aspect-[2/3] shrink-0 rounded-lg bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
            {media.posterPath ? (
              <img
                src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Tv size={20} aria-hidden="true" />
            )}
          </span>

          <span className="flex flex-1 min-w-0 flex-col justify-center gap-1">
            <span className="font-semibold leading-snug truncate">{media.title}</span>
            <span className="text-sm text-text-muted truncate">
              <span className="text-text-main font-medium">{label}</span>
              {name && ` · ${name}`}
            </span>
            <span className="flex items-center gap-2 mt-1" aria-hidden="true">
              <span className="h-1 flex-1 bg-border-card rounded-full overflow-hidden">
                <span
                  className="block h-full bg-accent rounded-full transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="text-[10px] text-text-muted tabular-nums">{percent}%</span>
            </span>
          </span>
        </button>

        {/* El atajo de la fila: marcar el que sigue sin abrir nada. */}
        <button
          type="button"
          onClick={onMark}
          aria-label={`Marcar ${label} de ${media.title} como visto`}
          title={`Marcar ${label} como visto`}
          className="btn-icon w-11 h-11 bg-accent text-accent-contrast font-semibold text-sm hover:opacity-90"
        >
          <Plus size={14} aria-hidden="true" />1
        </button>
      </div>
    </li>
  );
}

/**
 * "Continuar viendo": las series para retomar, con un botón para marcar el
 * episodio que sigue sin abrir la ficha.
 *
 * "Vas por T2E5" vivía adentro de la ficha, y para anotar el episodio de anoche
 * había que buscar la serie, abrirla y encontrar el número en la grilla. Acá es
 * un toque, con un "Deshacer" por si el dedo se adelantó.
 *
 * Sin nada para retomar, la fila no existe.
 */
export function ContinueWatching() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const items = useMemo(() => continueWatching(mediaList), [mediaList]);
  const { setProgress, patchMedia } = useMediaActions();
  const { showToast } = useToast();

  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);

  // La ficha y la reseña leen el título del store, no de la fila: una serie
  // que se terminó con el "+1" sale de la fila, y la reseña tiene que seguir.
  const detailMedia = mediaList.find((media) => media.tmdbId === detailId);
  const reviewMedia = mediaList.find((media) => media.tmdbId === reviewId);

  const markNext = ({ media, next }: ContinueItem) => {
    const label = formatEpisode(next.seasonNumber, next.episode);
    const before: Partial<SavedMedia> = {
      progress: media.progress,
      status: media.status,
      newEpisodesSince: media.newEpisodesSince,
    };
    const progress = toggleEpisode(media.progress, next.seasonNumber, next.episode);
    void setProgress(media.tmdbId, progress);

    const after: SavedMedia = { ...media, progress };

    // El último episodio de una serie que ya no sale: igual que al marcarla
    // completada desde la tarjeta, se ofrece la reseña. Cerrarla la deja como
    // está, en Viendo.
    if (
      media.status !== 'completada' &&
      hasWatchedAllAired(after) &&
      !isStillAiring(after)
    ) {
      setReviewId(media.tmdbId);
      return;
    }

    showToast(
      isCaughtUp(after)
        ? `Marcaste ${label} de "${media.title}": estás al día.`
        : `Marcaste ${label} de "${media.title}".`,
      'success',
      {
        action: {
          label: 'Deshacer',
          onAction: () => void patchMedia(media.tmdbId, before),
        },
      },
    );
  };

  if (items.length === 0 && !reviewMedia && !detailMedia) return null;

  return (
    <>
      {items.length > 0 && (
        <section>
          <ScrollRail
            label="Continuar viendo"
            header={<h2 className="text-section">Continuar viendo</h2>}
          >
            {items.map((item) => (
              <ContinueCard
                key={item.media.tmdbId}
                item={item}
                onMark={() => markNext(item)}
                onOpen={() => setDetailId(item.media.tmdbId)}
              />
            ))}
          </ScrollRail>
        </section>
      )}

      {detailMedia && (
        <TitleDetailModal
          id={detailMedia.tmdbId}
          mediaType={detailMedia.mediaType}
          media={detailMedia}
          isOpen
          onClose={() => setDetailId(null)}
        />
      )}

      {reviewMedia && (
        <ReviewDrawer
          media={reviewMedia}
          isOpen
          onClose={() => setReviewId(null)}
        />
      )}
    </>
  );
}
