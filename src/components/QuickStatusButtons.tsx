import { BookmarkCheck, Check, Loader2, Plus } from 'lucide-react';
import { MediaStatus, SavedMedia } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  /** El título guardado, si ya está en la biblioteca. */
  saved?: SavedMedia | null;
  /** Estado que se está guardando, para el spinner del botón que lo pidió. */
  savingStatus: MediaStatus | null;
  onSave: (status: MediaStatus) => void;
  className?: string;
}

/**
 * Los dos atajos a *Por Ver* y *Completadas*, solo con ícono.
 *
 * Los comparten el buscador y la ficha para que el mismo ícono quiera decir
 * lo mismo en los dos lados. Lo que ya está hecho deja de ser botón y queda
 * como indicador: ofrecer "agregar" algo que ya está en la biblioteca invita
 * a pisarlo.
 */
export function QuickStatusButtons({
  title,
  saved,
  savingStatus,
  onSave,
  className,
}: Props) {
  const isCompleted = saved?.status === 'completada';

  return (
    <div className={cn('flex items-center gap-2 shrink-0', className)}>
      {saved ? (
        // Un marcador y no un tilde pelado: el tilde de al lado quiere decir
        // "completada", y dos tildes juntos no dicen ninguna de las dos
        // cosas.
        <span
          className="btn-icon w-11 h-11 bg-border-card text-text-muted"
          title="Ya está en tu biblioteca"
        >
          <BookmarkCheck size={20} aria-hidden="true" />
          <span className="sr-only">Ya está en tu biblioteca</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onSave('por_ver')}
          disabled={savingStatus !== null}
          className="btn-icon w-11 h-11 bg-bg-main border border-border-card text-status-por-ver hover:bg-border-card"
          aria-label={`Agregar "${title}" a Por Ver`}
          title="Agregar a Por Ver"
        >
          {savingStatus === 'por_ver' ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={20} aria-hidden="true" />
          )}
        </button>
      )}

      {isCompleted ? (
        <span
          className="btn-icon w-11 h-11 bg-status-completada/15 text-status-completada"
          title="Ya está en Completadas"
        >
          <Check size={20} aria-hidden="true" />
          <span className="sr-only">Ya está en Completadas</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onSave('completada')}
          disabled={savingStatus !== null}
          className="btn-icon w-11 h-11 bg-bg-main border border-border-card text-status-completada hover:bg-border-card"
          aria-label={`Marcar "${title}" como completada`}
          title="Marcar Completada"
        >
          {savingStatus === 'completada' ? (
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={20} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
