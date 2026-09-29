import { useState } from 'react';
import { Ban, Pause, PenLine, Play } from 'lucide-react';
import { SavedMedia } from '@/types';
import { AbandonDialog } from '@/components/AbandonDialog';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { useArchiveActions } from '@/hooks/useArchiveActions';
import { idleLabel, pauseSuggestion } from '@/lib/archive';
import { formatWatchDate } from '@/lib/dates';
import { formatEpisode, furthestWatched } from '@/lib/progress';

/**
 * Dónde está un título archivado, en una frase: "En pausa desde el 3 de mayo
 * de 2026." o "La abandonaste el 3 de mayo de 2026, en T2E4."
 */
export function archiveSummary(media: SavedMedia): string | null {
  if (!media.archive) return null;
  const date = formatWatchDate(media.archive.at);

  if (media.status === 'en_pausa') return `En pausa desde el ${date}.`;
  if (media.status !== 'abandonada') return null;

  const where = media.mediaType === 'tv' ? furthestWatched(media) : null;
  return where
    ? `La abandonaste el ${date}, en ${formatEpisode(where.seasonNumber, where.episode)}.`
    : `La abandonaste el ${date}.`;
}

/**
 * Pausar, abandonar y retomar, desde la ficha.
 *
 * Qué se ofrece depende de dónde está: pausar es para lo que estás viendo,
 * abandonar para lo que empezaste o anotaste, y retomar para lo archivado. Lo
 * terminado no ofrece nada: ya tuvo su final.
 */
export function StatusActions({ media }: { media: SavedMedia }) {
  const { pause, resume } = useArchiveActions();
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const canPause = media.status === 'viendo';
  const canAbandon =
    media.status === 'viendo' || media.status === 'por_ver' || media.status === 'en_pausa';
  const canResume = media.status === 'en_pausa' || media.status === 'abandonada';
  // Abandonar no te quita la reseña. Si al abandonar no dejaste puntaje, la
  // puerta está acá: sin historial, la ficha no muestra la sección de reseñas.
  const canReview = media.status === 'abandonada' && (media.history?.length ?? 0) === 0;
  // La misma pregunta que el cartel de Mis listas, sin tener en cuenta si ahí
  // se descartó: acá la persona abrió la ficha, y los botones están igual.
  const isIdle = pauseSuggestion([media], {}) !== null;

  if (!canPause && !canAbandon && !canResume) return null;

  const summary = archiveSummary(media);

  return (
    <div className="flex flex-col gap-3">
      {summary && <p className="text-sm text-text-muted">{summary}</p>}
      {media.status === 'abandonada' && media.archive?.reason && (
        <blockquote className="text-sm text-text-main border-l-2 border-accent pl-3 italic">
          {media.archive.reason}
        </blockquote>
      )}
      {isIdle && (
        <p className="text-sm text-text-muted">
          Hace {idleLabel(media)} que no avanzás. ¿La ponés en pausa?
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canResume && (
          <button
            type="button"
            onClick={() => resume(media)}
            className="btn btn-primary px-3 py-2 text-sm"
          >
            <Play size={16} aria-hidden="true" />
            Retomar
          </button>
        )}
        {canReview && (
          <button
            type="button"
            onClick={() => setIsReviewing(true)}
            className="btn btn-secondary px-3 py-2 text-sm"
          >
            <PenLine size={16} aria-hidden="true" />
            Contá qué te pareció
          </button>
        )}
        {canPause && (
          <button
            type="button"
            onClick={() => pause(media)}
            className="btn btn-secondary px-3 py-2 text-sm"
          >
            <Pause size={16} aria-hidden="true" />
            Poner en pausa
          </button>
        )}
        {canAbandon && (
          <button
            type="button"
            onClick={() => setIsAbandoning(true)}
            className="btn btn-secondary px-3 py-2 text-sm"
          >
            <Ban size={16} aria-hidden="true" />
            Abandonar
          </button>
        )}
      </div>

      {isReviewing && (
        <ReviewDrawer media={media} isOpen onClose={() => setIsReviewing(false)} />
      )}

      {isAbandoning && (
        <AbandonDialog
          media={media}
          isOpen={isAbandoning}
          onClose={() => setIsAbandoning(false)}
        />
      )}
    </div>
  );
}
