import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type ToastVariant = 'success' | 'error';

/** Un botón dentro del aviso: "Deshacer", "Puntuarla". */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextType {
  /**
   * Muestra un aviso efímero. Se cierra solo a los 5 segundos.
   *
   * Con `action` lleva un botón: es la forma de deshacer algo que se hizo de
   * un toque, sin pedir una confirmación antes para lo que casi nunca se
   * quiere deshacer.
   */
  showToast: (
    message: string,
    variant?: ToastVariant,
    options?: { action?: ToastAction },
  ) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({
  children,
  /** Sobrescribible sobre todo para los tests, que no pueden esperar 5 segundos. */
  autoDismissMs = AUTO_DISMISS_MS,
}: {
  children: React.ReactNode;
  autoDismissMs?: number;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Guardamos los timers para poder limpiarlos si el usuario cierra a mano.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'success',
      options?: { action?: ToastAction },
    ) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current,
        { id, message, variant, action: options?.action },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), autoDismissMs),
      );
    },
    [dismiss, autoDismissMs],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `pointer-events-none` en el contenedor para no tapar la UI de abajo;
          cada toast lo reactiva para poder cerrarlo. */}
      <div
        className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className={
                'pointer-events-auto flex items-start gap-3 rounded-surface border px-4 py-3 shadow-lg backdrop-blur-md ' +
                (toast.variant === 'error'
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-bg-card/95 border-border-card text-text-main')
              }
            >
              {toast.variant === 'error' ? (
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2
                  size={18}
                  className="shrink-0 mt-0.5 text-status-completada"
                />
              )}
              <p className="text-sm leading-snug flex-1">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onAction();
                    dismiss(toast.id);
                  }}
                  className="shrink-0 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
}
