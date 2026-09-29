import { useState } from 'react';
import { Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import { SavedMedia, WatchEntry } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatWatchDate } from '@/lib/dates';
import { isAbandonedEntry } from '@/lib/archive';

/**
 * Las veces que viste un título, con su puntaje y su comentario.
 *
 * Volver a ver algo suma una entrada en vez de pisar la anterior: el puntaje
 * que le pusiste a *Matrix* a los quince años y el que le ponés ahora son dos
 * datos distintos, y perder el primero era lo que pasaba con el `review` único
 * de la versión anterior del schema.
 */
export function WatchHistory({ media }: { media: SavedMedia }) {
  const { removeWatchEntry } = useMediaActions();
  const { showToast } = useToast();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [editing, setEditing] = useState<WatchEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const history = media.history ?? [];
  if (history.length === 0) return null;
  // Las veces que lo terminaste: lo puntuado al abandonarlo es opinión, no
  // una vuelta más.
  const finished = history.filter((entry) => !isAbandonedEntry(entry)).length;
  const isAbandoned = media.status === 'abandonada';

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await removeWatchEntry(media, pendingDelete);
    setPendingDelete(null);
    showToast('Borramos esa vez del historial.');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">
          {finished > 1 ? `La viste ${finished} veces` : 'Tu reseña'}
        </h3>
        {/* "La volví a ver" no tiene sentido en algo que dejaste: para
            opinar de lo que viste está el lápiz de cada entrada. */}
        {!isAbandoned && (
          <button
            type="button"
            onClick={() => setIsReviewOpen(true)}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
          >
            <RotateCcw size={14} aria-hidden="true" />
            La volví a ver
          </button>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="bg-bg-main border border-border-card rounded-control p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 font-bold text-sm">
                  {entry.rating}
                  <Star
                    size={12}
                    className="fill-accent text-accent"
                    aria-hidden="true"
                  />
                  <span className="sr-only">de 5 estrellas</span>
                </span>
                <span className="text-xs text-text-subtle">
                  {formatWatchDate(entry.completedAt)}
                  {isAbandonedEntry(entry) && ' · al abandonarla'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  aria-label={`Editar la reseña del ${formatWatchDate(entry.completedAt)}`}
                  className="p-1.5 rounded-lg text-text-subtle hover:text-text-main hover:bg-border-card transition-colors"
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(entry.id)}
                  aria-label={`Borrar la reseña del ${formatWatchDate(entry.completedAt)}`}
                  className="p-1.5 rounded-lg text-text-subtle hover:text-accent hover:bg-border-card transition-colors"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            {entry.tags && entry.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <li
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-border-card text-[11px] text-text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {entry.text && (
              <p className="text-sm text-text-muted italic leading-relaxed">
                {entry.text}
              </p>
            )}
          </li>
        ))}
      </ol>

      {isReviewOpen && (
        <ReviewDrawer
          media={media}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}

      {editing && (
        <ReviewDrawer
          key={editing.id}
          media={media}
          entry={editing}
          isOpen
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Borrar del historial"
        confirmLabel="Borrar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
        description={
          <p>
            Se borra esa vez que viste <strong className="text-text-main">{media.title}</strong>,
            con su puntaje y su comentario. Las otras veces quedan.
          </p>
        }
      />
    </div>
  );
}
