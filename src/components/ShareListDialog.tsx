import { useEffect, useId, useState } from 'react';
import { Globe, Loader2, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog } from '@/components/ui/Dialog';
import { ShareButton } from '@/components/ShareButton';
import { useListSharing } from '@/hooks/usePublicList';
import { useToast } from '@/contexts/ToastContext';
import { Collection } from '@/types';
import { MAX_LIST_DESCRIPTION, listShareCard } from '@/lib/publicList';
import { formatRelative, formatWatchDate } from '@/lib/dates';

/**
 * Publicar una lista propia con un link: la descripción, el link para
 * compartir, "Mantener actualizada" y despublicar. Lo que se publica es una
 * instantánea: nombre, descripción y, de cada título, lo que hace falta para
 * mostrarlo.
 */
export function ShareListDialog({
  collection,
  isOpen,
  onClose,
}: {
  collection: Collection;
  isOpen: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const { published, url, publish, unpublish, setAutoUpdate } = useListSharing(collection);
  const { showToast } = useToast();
  const [description, setDescription] = useState('');

  // La descripción arranca en la publicada, y no se pisa mientras se escribe.
  useEffect(() => {
    if (isOpen) setDescription(published?.description ?? '');
  }, [isOpen, published?.description]);

  const isPublished = Boolean(collection.publicId);
  const isLoading = isPublished && published === undefined;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      className="z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="w-full sm:max-w-lg bg-bg-card border border-border-card rounded-t-3xl sm:rounded-3xl shadow-pop p-6 flex flex-col gap-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif italic font-bold text-2xl">
            Compartir “{collection.name}”
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="btn-icon w-9 h-9 shrink-0 rounded-full text-text-muted hover:text-text-main hover:bg-border-card"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-text-muted">
          Se publica el nombre, la descripción y, de cada título, el nombre, el
          año y el póster. Nada de tus puntajes, reseñas ni estados.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${titleId}-description`} className="text-sm font-medium">
            Descripción <span className="text-text-subtle font-normal">(opcional)</span>
          </label>
          <textarea
            id={`${titleId}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={MAX_LIST_DESCRIPTION}
            rows={3}
            placeholder="Para no dormir en toda la semana."
            className="bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent resize-none"
          />
        </div>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-text-subtle">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Cargando…
          </p>
        ) : isPublished && url && published ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  publish(description);
                  showToast('Actualizamos la lista publicada.');
                }}
                className="btn btn-primary flex-1 px-4 py-2.5 text-sm"
              >
                <RefreshCw size={16} aria-hidden="true" />
                Actualizar
              </button>
              <ShareButton
                className="flex-1"
                label="Compartir"
                title={published.name}
                text={`${published.name}, una lista en Qué Miro?`}
                url={url}
                card={listShareCard(published, url)}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={published.autoUpdate}
                onChange={(event) => setAutoUpdate(event.target.checked)}
                className="mt-1 w-4 h-4 accent-accent shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Mantener actualizada</span>
                <span className="text-xs text-text-subtle">
                  Cuando sumás o sacás un título, la lista publicada se pone al
                  día sola unos minutos después.
                </span>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <Link
                to={`/l/${collection.publicId}`}
                className="flex items-center gap-1.5 text-accent hover:underline min-w-0"
              >
                <Globe size={14} aria-hidden="true" className="shrink-0" />
                <span className="truncate">/l/{collection.publicId}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  unpublish();
                  showToast('La lista ya no es pública: el link dejó de andar.');
                }}
                className="text-text-muted hover:text-accent transition-colors shrink-0"
              >
                Despublicar
              </button>
            </div>

            <p className="text-xs text-text-subtle">
              Actualizada{' '}
              <time dateTime={published.publishedAt} title={formatWatchDate(published.publishedAt)}>
                {formatRelative(published.publishedAt)}
              </time>
              .
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              publish(description);
              showToast('Publicamos la lista: ya tiene su link.');
            }}
            className="btn btn-primary px-4 py-2.5 text-sm"
          >
            <Globe size={16} aria-hidden="true" />
            Publicar la lista
          </button>
        )}
      </div>
    </Dialog>
  );
}
