import React, { useState } from 'react';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { SavedMedia, MediaStatus } from '@/types';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { Check, Tv, Film, Trash2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewDrawer } from './ReviewDrawer';
import { TitleDetailModal } from './TitleDetailModal';

const STATUS_COLORS: Record<MediaStatus, string> = {
  por_ver: 'text-status-por-ver bg-status-por-ver/10 border-status-por-ver/20',
  viendo: 'text-status-viendo bg-status-viendo/10 border-status-viendo/20',
  completada:
    'text-status-completada bg-status-completada/10 border-status-completada/20',
};

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

  const handleStatusChange = (e: React.MouseEvent, newStatus: MediaStatus) => {
    e.stopPropagation();
    // Pasar a "completada" abre la reseña en vez de cambiar el estado directo:
    // el estado lo termina de guardar el drawer junto con la calificación.
    if (newStatus === 'completada' && media.status !== 'completada') {
      setIsReviewOpen(true);
      return;
    }
    updateStatus(media.tmdbId, newStatus);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await removeMedia(media.tmdbId);
    showToast(`Sacamos "${media.title}" de tu biblioteca.`);
  };

  return (
    <>
      <div
        onClick={() => {
          setIsDetailOpen(true);
          onClick?.();
        }}
        className="group relative bg-bg-card border border-border-card rounded-2xl overflow-hidden cursor-pointer hover:border-gray-500 transition-colors flex flex-col h-full"
      >
        <div className="relative aspect-[2/3] w-full bg-border-card overflow-hidden">
          {media.posterPath ? (
            <img
              src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              {media.mediaType === 'movie' ? (
                <Film size={48} />
              ) : (
                <Tv size={48} />
              )}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-card to-transparent" />

          {media.review && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-bg-main/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold">
              {media.review.rating}
              <Star size={12} className="fill-accent text-accent" />
            </div>
          )}

          <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1">
            <h3 className="font-serif italic font-bold text-lg leading-tight line-clamp-2">
              {media.title}
            </h3>
            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
              <span>{media.releaseYear}</span>
              {media.genres.length > 0 && (
                <>
                  <span>•</span>
                  <span className="truncate">{media.genres[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-3 flex items-center justify-between gap-2 border-t border-border-card mt-auto shrink-0">
          <span
            className={cn(
              'text-[10px] sm:text-xs px-2 py-1 rounded-md border truncate',
              STATUS_COLORS[media.status],
            )}
          >
            {STATUS_LABELS[media.status]}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {media.status === 'por_ver' && (
              <button
                onClick={(e) => handleStatusChange(e, 'viendo')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-gray-400"
                aria-label={`Mover "${media.title}" a Viendo`}
                title="Mover a Viendo"
              >
                <Tv size={16} />
              </button>
            )}
            {media.status !== 'completada' && (
              <button
                onClick={(e) => handleStatusChange(e, 'completada')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-status-completada"
                aria-label={`Marcar "${media.title}" como completada`}
                title="Marcar Completada"
              >
                <Check size={16} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmingDelete(true);
              }}
              className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-gray-400 hover:text-accent transition-colors"
              aria-label={`Eliminar "${media.title}" de la biblioteca`}
              title="Eliminar de mi biblioteca"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {isConfirmingDelete && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-10 bg-bg-main/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-4 text-center"
          >
            <p className="text-sm text-text-main/80">
              ¿Sacar <span className="font-bold">{media.title}</span> de tu
              biblioteca?
            </p>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="flex-1 py-2 rounded-xl border border-border-card text-sm hover:bg-border-card transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        )}
      </div>

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
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </>
  );
}
