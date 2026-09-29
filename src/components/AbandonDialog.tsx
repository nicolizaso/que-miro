import { useId, useRef, useState } from 'react';
import { SavedMedia } from '@/types';
import { Dialog } from '@/components/ui/Dialog';
import { StarRatingInput } from '@/components/ui/StarRating';
import { useArchiveActions } from '@/hooks/useArchiveActions';
import { REASON_MAX_LENGTH } from '@/lib/archive';
import { formatEpisode, furthestWatched } from '@/lib/progress';

/**
 * La confirmación de abandonar un título.
 *
 * Pide confirmación porque abandonar no es solo moverlo de lista: lo saca de
 * "Continuar viendo", del calendario y del picker, y le enseña al feed a
 * mostrarte menos de lo parecido. El motivo y el puntaje son opcionales —se
 * abandona con un toque—, pero son lo que después hace útil el dato: "la dejé
 * porque se puso lenta" dice más que "la dejé".
 */
export function AbandonDialog({
  media,
  isOpen,
  onClose,
}: {
  media: SavedMedia;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { abandon } = useArchiveActions();
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(0);
  const titleId = useId();
  const reasonId = useId();
  // El foco arranca en Cancelar, como en toda confirmación: un Enter reflejo
  // no debería ser el que abandona.
  const cancelRef = useRef<HTMLButtonElement>(null);

  const where = media.mediaType === 'tv' ? furthestWatched(media) : null;

  const handleConfirm = () => {
    abandon(media, {
      reason: reason.trim() || undefined,
      rating: rating > 0 ? rating : undefined,
    });
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={cancelRef}
      className="z-[70] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm overflow-y-auto"
    >
      <div className="w-full max-w-md bg-bg-card border border-border-card rounded-3xl shadow-pop p-6 flex flex-col gap-5 my-auto">
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="font-serif italic font-bold text-2xl">
            ¿Abandonás {media.title}?
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">
            {where
              ? `Queda en Archivadas, en ${formatEpisode(where.seasonNumber, where.episode)}. `
              : 'Queda en Archivadas. '}
            Sale de Continuar viendo, del calendario y del picker, y el feed te
            va a mostrar menos de lo parecido. Tu progreso no se borra: podés
            retomarla cuando quieras.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="text-sm font-medium">
            ¿Por qué la dejás?{' '}
            <span className="text-text-subtle font-normal">(opcional)</span>
          </label>
          <input
            id={reasonId}
            type="text"
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Se puso lenta, no me enganchó…"
            className="w-full bg-bg-main border border-border-control rounded-control px-4 py-3 text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span aria-hidden="true" className="text-sm font-medium">
            ¿Qué te pareció lo que viste?{' '}
            <span className="text-text-subtle font-normal">(opcional)</span>
          </span>
          <StarRatingInput
            value={rating}
            onChange={setRating}
            legend="Qué te pareció lo que viste (opcional)"
            size={32}
            clearable
            className="items-start"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-control border border-border-card font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-control font-medium bg-accent text-accent-contrast transition-opacity hover:opacity-90"
          >
            Abandonar
          </button>
        </div>
      </div>
    </Dialog>
  );
}
