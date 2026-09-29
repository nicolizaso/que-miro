import { useId, useState } from 'react';
import { SavedMedia, WatchEntry } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '@/contexts/ToastContext';
import { Dialog } from '@/components/ui/Dialog';
import { StarRatingInput } from '@/components/ui/StarRating';
import { newWatchId, watchCount } from '@/lib/schema';
import { cn } from '@/lib/utils';
import { formatWatchDate } from '@/lib/dates';

/**
 * Etiquetas sugeridas.
 *
 * Son un conjunto cerrado a propósito: con texto libre cada persona termina
 * escribiendo "con amigos", "Con Amigos" y "amigos", y el filtro deja de
 * agrupar nada.
 */
export const MOOD_TAGS = [
  'Para llorar',
  'Para pensar',
  'Con amigos',
  'Livianita',
  'Me voló la cabeza',
  'Para maratonear',
  'Da miedo',
  'De fondo',
] as const;

/**
 * El formulario de reseña.
 *
 * Sin `entry` suma una vez más al historial; con `entry` corrige esa reseña en
 * su lugar, conservando la fecha en que la viste.
 */
export function ReviewDrawer({
  media,
  entry,
  isOpen,
  onClose,
}: {
  media: SavedMedia;
  entry?: WatchEntry;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const [reviewText, setReviewText] = useState(entry?.text ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const { addWatchEntry, updateWatchEntry } = useMediaActions();
  const { showToast } = useToast();
  const titleId = useId();
  const groupId = useId();

  const isEditing = entry !== undefined;
  const previousWatches = watchCount(media);
  // Reseñar algo abandonado no es "completarlo" ni "volver a verlo": es
  // opinar de lo que viste antes de dejarlo.
  const isAbandoned = media.status === 'abandonada';
  const isRewatch = !isEditing && !isAbandoned && previousWatches > 0;

  const handleSave = async () => {
    if (rating === 0 || isSaving) return;
    setIsSaving(true);
    try {
      if (entry) {
        await updateWatchEntry(media, {
          ...entry,
          rating,
          text: reviewText.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        });
        showToast(`Actualizamos tu reseña de "${media.title}".`);
        onClose();
        return;
      }
      await addWatchEntry(media, {
        id: newWatchId(),
        rating,
        // Un comentario en blanco no se guarda como string vacío.
        text: reviewText.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        completedAt: new Date().toISOString(),
      });
      showToast(
        isRewatch
          ? `Anotamos que volviste a ver "${media.title}".`
          : `Guardamos tu reseña de "${media.title}".`,
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      className="z-[65] flex items-end justify-center sm:items-center sm:p-4 bg-overlay backdrop-blur-sm overflow-y-auto"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="bg-bg-card border border-border-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-pop p-6 flex flex-col gap-6 my-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-serif italic font-bold text-2xl mb-1">
              {isEditing
                ? 'Editar reseña'
                : isAbandoned
                  ? 'Lo que viste'
                  : isRewatch
                    ? 'La volviste a ver'
                    : 'Completaste'}
            </h2>
            <p className="text-text-muted">{media.title}</p>
            {entry && (
              <p className="text-xs text-text-subtle mt-1">
                La que viste el {formatWatchDate(entry.completedAt)}.
              </p>
            )}
            {isRewatch && (
              <p className="text-xs text-text-subtle mt-1">
                Va a quedar como la vez número {previousWatches + 1}. Lo que
                escribiste antes no se toca.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 bg-border-card rounded-full text-text-muted hover:text-text-main shrink-0"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <StarRatingInput
          value={rating}
          onChange={setRating}
          legend="Tu calificación"
          caption="TU CALIFICACIÓN"
          announce
          className="py-2"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-2">
            ¿Cómo la describirías?{' '}
            <span className="text-text-subtle font-normal">(opcional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOOD_TAGS.map((tag) => {
              const isSelected = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-sm transition-colors',
                    isSelected
                      ? 'bg-accent text-accent-contrast border-accent'
                      : 'bg-transparent border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${groupId}-texto`} className="sr-only">
            Comentario sobre {media.title}
          </label>
          <textarea
            id={`${groupId}-texto`}
            placeholder="Escribí un comentario breve (opcional)..."
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            className="w-full h-28 bg-bg-main border border-border-control rounded-control p-4 text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-control border border-border-card font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={rating === 0 || isSaving}
            className="btn btn-primary flex-1 py-4"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {isEditing ? 'Guardar cambios' : 'Guardar Reseña'}
          </button>
        </div>
      </motion.div>
    </Dialog>
  );
}
