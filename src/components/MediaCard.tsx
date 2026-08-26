import { useState } from 'react';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { SavedMedia, MediaStatus } from '@/types';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { latestRating, watchCount } from '@/lib/schema';
import { progressPercent, watchedEpisodes } from '@/lib/progress';
import { Check, Tv, Film, Repeat, Trash2, Star } from 'lucide-react';
import { ReviewDrawer } from './ReviewDrawer';
import { TitleDetailModal } from './TitleDetailModal';
import { ConfirmDialog } from './ConfirmDialog';

const STATUS_LABELS: Record<MediaStatus, string> = {
  por_ver: 'Por Ver',
  viendo: 'Viendo',
  completada: 'Completada',
};

export function MediaCard({
  media,
  onClick,
}: {
  media: SavedMedia;
  onClick?: () => void;
}) {
  const { updateStatus, removeMedia } = useMediaActions();
  const { showToast } = useToast();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleStatusChange = (newStatus: MediaStatus) => {
    // Pasar a "completada" abre la reseña en vez de cambiar el estado directo:
    // el estado lo termina de guardar el drawer junto con la calificación.
    if (newStatus === 'completada' && media.status !== 'completada') {
      setIsReviewOpen(true);
      return;
    }
    updateStatus(media.tmdbId, newStatus);
  };

  const rating = latestRating(media);
  const times = watchCount(media);
  // El progreso solo se muestra en series empezadas y sin terminar: al 0% no
  // dice nada y al 100% lo dice el puntaje.
  const percent = media.mediaType === 'tv' ? progressPercent(media) : 0;
  const showProgress =
    media.mediaType === 'tv' && watchedEpisodes(media) > 0 && percent < 100;

  const handleDelete = async () => {
    await removeMedia(media.tmdbId);
    setIsConfirmingDelete(false);
    showToast(`Sacamos "${media.title}" de tu biblioteca.`);
  };

  return (
    <>
      <article className="group relative bg-bg-card border border-border-card rounded-2xl overflow-hidden hover:border-text-subtle transition-colors flex flex-col h-full">
        {/* Un botón de verdad y no un div con onClick: es la única forma de que
            la tarjeta se pueda abrir con teclado. Los botones de acción quedan
            afuera porque no se pueden anidar dentro de otro botón. */}
        <button
          type="button"
          onClick={() => {
            setIsDetailOpen(true);
            onClick?.();
          }}
          className="text-left cursor-pointer"
        >
          <span className="relative block aspect-[2/3] w-full bg-border-card overflow-hidden">
            {media.posterPath ? (
              <img
                src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-text-subtle">
                {media.mediaType === 'movie' ? (
                  <Film size={48} aria-hidden="true" />
                ) : (
                  <Tv size={48} aria-hidden="true" />
                )}
              </span>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-bg-card to-transparent" />

            {rating !== undefined && (
              <span className="absolute top-3 right-3 flex items-center gap-1 bg-bg-main/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold">
                {rating}
                <Star size={12} className="fill-accent text-accent" aria-hidden="true" />
                <span className="sr-only">de 5 estrellas</span>
              </span>
            )}

            {times > 1 && (
              <span className="absolute top-3 left-3 flex items-center gap-1 bg-bg-main/80 backdrop-blur-sm px-2 py-1 rounded-lg text-[11px] font-medium">
                <Repeat size={11} aria-hidden="true" />
                {times}
                <span className="sr-only">veces vista</span>
              </span>
            )}

            <span className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
              <span className="font-serif italic font-bold text-lg leading-tight line-clamp-2">
                {media.title}
              </span>
              <span className="flex flex-wrap gap-2 text-xs text-text-muted">
                <span>{media.releaseYear}</span>
                {media.genres.length > 0 && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="truncate">{media.genres[0]}</span>
                  </>
                )}
              </span>

              {showProgress && (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-1 flex-1 bg-border-card rounded-full overflow-hidden"
                  >
                    <span
                      className="block h-full bg-accent rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {percent}%
                  </span>
                </span>
              )}
            </span>
          </span>
          <span className="sr-only">
            Ver detalle de {media.title}. Estado: {STATUS_LABELS[media.status]}.
            {showProgress && ` Progreso: ${percent}%.`}
          </span>
        </button>

        {/* Sin chip de estado: la tarjeta siempre se ve dentro de la pestaña de
            su estado, así que repetirlo solo servía para robarle ancho a los
            botones y dejar el texto cortado en "P..". Para lectores de pantalla
            el estado sigue estando, en el nombre accesible del botón de arriba. */}
        <div className="p-3 flex items-center justify-end gap-2 border-t border-border-card mt-auto shrink-0">
          <div className="flex items-center gap-1 shrink-0">
            {media.status === 'por_ver' && (
              <button
                onClick={() => handleStatusChange('viendo')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-text-muted"
                aria-label={`Mover "${media.title}" a Viendo`}
                title="Mover a Viendo"
              >
                <Tv size={16} aria-hidden="true" />
              </button>
            )}
            {media.status !== 'completada' && (
              <button
                onClick={() => handleStatusChange('completada')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-status-completada"
                aria-label={`Marcar "${media.title}" como completada`}
                title="Marcar Completada"
              >
                <Check size={16} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={() => setIsConfirmingDelete(true)}
              className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-text-muted hover:text-accent transition-colors"
              aria-label={`Eliminar "${media.title}" de la biblioteca`}
              title="Eliminar de mi biblioteca"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Sacar de tu biblioteca"
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setIsConfirmingDelete(false)}
        description={
          <p>
            ¿Sacar <strong className="text-text-main">{media.title}</strong> de tu
            biblioteca? Si tenía reseña, también se borra.
          </p>
        }
      />

      {isReviewOpen && (
        <ReviewDrawer
          media={media}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}

      {isDetailOpen && (
        <TitleDetailModal
          id={media.tmdbId}
          mediaType={media.mediaType}
          media={media}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </>
  );
}
