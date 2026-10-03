import { Bell, BellRing, Loader2 } from 'lucide-react';
import { SavedMedia } from '@/types';
import { InstallButton } from '@/components/install/InstallButton';
import { usePush } from '@/hooks/usePush';
import { canAlert } from '@/lib/push';
import { cn } from '@/lib/utils';

/** El texto de iPhone y iPad, igual en la ficha y en Ajustes. */
export const INSTALL_FIRST_HINT =
  'En iPhone y iPad, los avisos llegan solo a la app instalada. Instalala y activalos desde ahí.';

/** Prender o apagar el aviso, con el mismo aspecto que los otros interruptores. */
export function NotifyChip({
  media,
  label,
  pending,
  disabled,
  onToggle,
}: {
  media: SavedMedia;
  label: string;
  /** Esperando el permiso o el token: la ruedita va en este y no en todos. */
  pending: boolean;
  disabled: boolean;
  onToggle: (media: SavedMedia) => void;
}) {
  const isOn = media.notify === true;
  return (
    <button
      type="button"
      aria-pressed={isOn}
      disabled={disabled}
      onClick={() => onToggle(media)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        isOn
          ? 'bg-accent text-accent-contrast border-accent'
          : 'bg-transparent border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
      )}
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : isOn ? (
        <BellRing size={14} aria-hidden="true" />
      ) : (
        <Bell size={14} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

/**
 * "Avisame de episodios nuevos", en la ficha de una serie.
 *
 * No aparece donde no puede andar —sin cuenta, en una serie terminada, en un
 * navegador sin avisos—, salvo para apagar uno que ya está prendido: la marca
 * es de la cuenta y se puede sacar desde cualquier lado. En iPhone y iPad con
 * la app abierta en Safari, en lugar del interruptor va el botón para instalarla.
 */
export function NotifyToggle({ media }: { media: SavedMedia }) {
  const { available, support, busy, toggleSeries } = usePush();
  if (!available || media.mediaType !== 'tv') return null;

  const isOn = media.notify === true;
  if (!isOn) {
    if (!canAlert(media)) return null;
    if (support === 'install-first') {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-start gap-2 text-sm text-text-muted">
            <Bell size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{INSTALL_FIRST_HINT}</span>
          </p>
          <InstallButton variant="secondary" />
        </div>
      );
    }
    if (support !== 'supported') return null;
  }

  return (
    <div className="flex">
      <NotifyChip
        media={media}
        label="Avisame de episodios nuevos"
        pending={busy}
        disabled={busy}
        onToggle={(target) => void toggleSeries(target)}
      />
    </div>
  );
}
