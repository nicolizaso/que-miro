import { useState } from 'react';
import { ChevronDown, ListPlus } from 'lucide-react';
import { MediaStatus, SavedMedia } from '@/types';
import { QuickStatusButtons } from '@/components/QuickStatusButtons';
import { StatusActions } from '@/components/StatusActions';
import { NotifyToggle } from '@/components/NotifyToggle';
import { CollectionPicker } from '@/components/CollectionPicker';
import { ShareButton } from '@/components/ShareButton';
import { ShareCardData } from '@/lib/shareCard';
import { STATUS_LABELS, isArchivedStatus, pauseSuggestion } from '@/lib/archive';
import { cn } from '@/lib/utils';

/** El color del puntito de cada estado, el mismo que usan las listas. */
const STATUS_DOT: Record<MediaStatus, string> = {
  viendo: 'bg-status-viendo',
  por_ver: 'bg-status-por-ver',
  completada: 'bg-status-completada',
  en_pausa: 'bg-text-subtle',
  abandonada: 'bg-text-subtle',
};

/** Estados desde los que hay algo para hacer: pausar, abandonar, retomar. */
const HAS_STATUS_ACTIONS: MediaStatus[] = ['viendo', 'por_ver', 'en_pausa', 'abandonada'];

type Panel = 'status' | 'lists';

interface Props {
  title: string;
  saved: SavedMedia | null;
  savingStatus: MediaStatus | null;
  onQuickSave: (status: MediaStatus) => void;
  onSaveInto: (collectionId: string) => Promise<void>;
  share: { text: string; card: ShareCardData };
}

/**
 * La fila de acciones de la ficha, debajo de la imagen.
 *
 * Antes el estado aparecía en tres lugares —dos íconos al lado de la sinopsis,
 * una frase en "Tu biblioteca" y los botones de pausa— y compartir y las
 * listas quedaban al final de todo. Acá va todo junto: la píldora del estado
 * dice en qué lista está y adentro guarda lo que se usa poco (pausar,
 * abandonar, los avisos); las listas se despliegan en el lugar.
 */
export function TitleActions({ title, saved, savingStatus, onQuickSave, onSaveInto, share }: Props) {
  // Lo archivado y lo que hace rato no avanza abren con el panel desplegado:
  // ahí "Retomar" o "¿La ponés en pausa?" son justo lo que hay que ver.
  const [open, setOpen] = useState<Panel | null>(() =>
    saved && (isArchivedStatus(saved.status) || pauseSuggestion([saved], {}) !== null)
      ? 'status'
      : null,
  );
  const toggle = (panel: Panel) => setOpen((current) => (current === panel ? null : panel));

  const hasStatusPanel = saved !== null && HAS_STATUS_ACTIONS.includes(saved.status);
  const listCount = saved?.collections?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {saved &&
          (hasStatusPanel ? (
            <button
              type="button"
              aria-expanded={open === 'status'}
              onClick={() => toggle('status')}
              className="btn btn-secondary h-11 px-3.5 text-sm"
            >
              <span aria-hidden="true" className={cn('w-2 h-2 rounded-full', STATUS_DOT[saved.status])} />
              <span className="sr-only">En tu biblioteca:</span>
              {STATUS_LABELS[saved.status]}
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn('transition-transform', open === 'status' && 'rotate-180')}
              />
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 h-11 px-3.5 rounded-control border border-border-card text-sm font-medium">
              <span aria-hidden="true" className={cn('w-2 h-2 rounded-full', STATUS_DOT[saved.status])} />
              <span className="sr-only">En tu biblioteca:</span>
              {STATUS_LABELS[saved.status]}
            </span>
          ))}

        <QuickStatusButtons
          title={title}
          saved={saved}
          savingStatus={savingStatus}
          onSave={onQuickSave}
          hideIndicators
        />

        <button
          type="button"
          aria-expanded={open === 'lists'}
          onClick={() => toggle('lists')}
          className="btn btn-secondary h-11 px-3.5 text-sm"
        >
          <ListPlus size={16} aria-hidden="true" />
          Listas
          {listCount > 0 && (
            <span className="tabular-nums text-text-subtle">
              <span className="sr-only">, en</span> {listCount}
            </span>
          )}
        </button>

        <ShareButton
          title={title}
          text={share.text}
          card={share.card}
          iconOnlyOnMobile
          className="h-11 px-3.5"
        />
      </div>

      {open === 'status' && saved && (
        <div className="flex flex-col gap-3">
          <StatusActions media={saved} />
          <NotifyToggle media={saved} />
        </div>
      )}
      {/* Una completada no tiene qué pausar ni abandonar, pero sí puede seguir
          avisando de episodios nuevos: el interruptor queda a la vista. */}
      {saved && !hasStatusPanel && <NotifyToggle media={saved} />}

      {open === 'lists' && (
        <CollectionPicker title={title} media={saved ?? undefined} onSaveInto={onSaveInto} />
      )}
    </div>
  );
}
