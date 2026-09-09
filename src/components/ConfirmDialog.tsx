import { useId, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  /** Pinta el botón de confirmar como destructivo. */
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmación modal para acciones que no se pueden deshacer. */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  destructive = false,
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  // El foco arranca en Cancelar: en un diálogo destructivo, un Enter reflejo no
  // debería ser el que confirma.
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={cancelRef}
      className="z-[70] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-bg-card border border-border-card rounded-3xl shadow-pop p-6 flex flex-col gap-4">
        <h2 id={titleId} className="font-serif italic font-bold text-2xl">
          {title}
        </h2>
        <div className="text-sm text-text-muted leading-relaxed">
          {description}
        </div>
        <div className="flex gap-3 pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 py-3 rounded-control border border-border-card font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={
              'flex-1 py-3 rounded-control font-medium transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 ' +
              (destructive
                ? 'bg-accent text-accent-contrast'
                : 'bg-text-main text-bg-main')
            }
          >
            {isPending && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
