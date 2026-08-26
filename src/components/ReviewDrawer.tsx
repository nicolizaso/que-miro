import { useId, useState } from 'react';
import { SavedMedia } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { Loader2, Star, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '@/contexts/ToastContext';
import { Dialog } from '@/components/ui/Dialog';
import { newWatchId, watchCount } from '@/lib/schema';
import { cn } from '@/lib/utils';

/** Las cinco estrellas; cada una se parte en dos mitades clicables. */
const STARS = [1, 2, 3, 4, 5];

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

function ratingLabel(value: number): string {
  return `${value.toString().replace('.', ',')} de 5 estrellas`;
}

export function ReviewDrawer({
  media,
  isOpen,
  onClose,
}: {
  media: SavedMedia;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { addWatchEntry } = useMediaActions();
  const { showToast } = useToast();
  const titleId = useId();
  const groupId = useId();

  const previousWatches = watchCount(media);
  const isRewatch = previousWatches > 0;

  const handleSave = async () => {
    if (rating === 0 || isSaving) return;
    setIsSaving(true);
    try {
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

  /**
   * Una estrella, partida en dos mitades clicables.
   *
   * Cada mitad es un radio de verdad (visualmente oculto) con su `<label>`
   * encima: así el mouse sigue funcionando igual que antes, pero además se
   * puede calificar con las flechas del teclado y un lector de pantalla anuncia
   * "3,5 de 5 estrellas".
   */
  const renderStar = (position: number) => {
    const half = position - 0.5;
    const shown = hoverRating || rating;
    const isFull = shown >= position;
    const isHalf = !isFull && shown >= half;

    return (
      <div key={position} className="relative w-10 h-10">
        {[half, position].map((value) => (
          <input
            key={value}
            type="radio"
            name={groupId}
            id={`${groupId}-${value}`}
            value={value}
            checked={rating === value}
            onChange={() => setRating(value)}
            className={value === half ? 'peer/half sr-only' : 'peer/full sr-only'}
          />
        ))}

        {[half, position].map((value) => (
          <label
            key={value}
            htmlFor={`${groupId}-${value}`}
            onMouseEnter={() => setHoverRating(value)}
            className={
              'absolute inset-y-0 w-1/2 z-10 cursor-pointer ' +
              (value === half ? 'left-0' : 'right-0')
            }
          >
            <span className="sr-only">{ratingLabel(value)}</span>
          </label>
        ))}

        <span className="block rounded-sm peer-focus-visible/half:outline-2 peer-focus-visible/half:outline-offset-2 peer-focus-visible/half:outline-accent peer-focus-visible/full:outline-2 peer-focus-visible/full:outline-offset-2 peer-focus-visible/full:outline-accent">
          {isFull ? (
            <Star className="text-accent fill-accent" size={40} strokeWidth={1} />
          ) : isHalf ? (
            <span className="relative block">
              <Star className="text-border-card" size={40} strokeWidth={1} />
              <span className="absolute inset-0 overflow-hidden w-1/2">
                <Star
                  className="text-accent fill-accent"
                  size={40}
                  strokeWidth={1}
                />
              </span>
            </span>
          ) : (
            <Star className="text-border-card" size={40} strokeWidth={1} />
          )}
        </span>
      </div>
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
        className="bg-bg-card border border-border-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-6 my-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-serif italic font-bold text-2xl mb-1">
              {isRewatch ? 'La volviste a ver' : 'Completaste'}
            </h2>
            <p className="text-text-muted">{media.title}</p>
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

        <fieldset
          className="flex flex-col items-center gap-4 py-2"
          onMouseLeave={() => setHoverRating(0)}
        >
          <legend className="sr-only">Tu calificación</legend>
          <span aria-hidden="true" className="text-sm text-text-muted font-medium">
            TU CALIFICACIÓN
          </span>
          <div className="flex gap-2">{STARS.map((position) => renderStar(position))}</div>
          <p aria-live="polite" className="text-sm text-text-muted h-5">
            {rating > 0 ? ratingLabel(rating) : ''}
          </p>
        </fieldset>

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
            className="w-full h-28 bg-bg-main border border-border-card rounded-control p-4 text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent resize-none"
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
            className="flex-1 py-4 rounded-control bg-accent text-accent-contrast font-medium disabled:opacity-50 transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Guardar Reseña
          </button>
        </div>
      </motion.div>
    </Dialog>
  );
}
