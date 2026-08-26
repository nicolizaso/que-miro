import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Si un elemento enfocable está realmente a la vista.
 *
 * No se usa `offsetParent`, que es el atajo habitual: devuelve `null` para
 * cualquier elemento dentro de un contenedor `position: fixed` —que es
 * justamente lo que es este diálogo— y también en entornos sin layout como
 * jsdom, donde dejaría la lista vacía y el foco trabado.
 */
function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Contador de diálogos abiertos.
 *
 * Los modales se apilan (desde una tarjeta se abre el detalle y desde el
 * detalle la reseña), así que el scroll del body se destraba recién cuando se
 * cierra el último: con un booleano, cerrar el de arriba lo destrabaría con el
 * de abajo todavía abierto.
 */
let openDialogCount = 0;

function lockBodyScroll(): () => void {
  if (openDialogCount === 0) {
    // Se compensa el ancho de la barra de scroll para que la página no salte
    // de costado al ocultarla.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  openDialogCount++;

  return () => {
    openDialogCount--;
    if (openDialogCount === 0) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  };
}

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nombre accesible del diálogo. Alternativa a `labelledBy`. */
  label?: string;
  /** Id del elemento que titula el diálogo, cuando el título está a la vista. */
  labelledBy?: string;
  /** Elemento que recibe el foco al abrir. Por defecto, el primero enfocable. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Si el clic en el fondo cierra el diálogo. */
  closeOnBackdrop?: boolean;
  /** Clases del contenedor de pantalla completa que centra el contenido. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Diálogo modal accesible.
 *
 * Se encarga de lo que los modales sueltos de la app no hacían: atrapar el foco
 * adentro mientras está abierto, devolverlo a donde estaba al cerrar, trabar el
 * scroll del fondo y cerrar con Escape. Sin esto, con teclado o lector de
 * pantalla se podía "salir" del modal y seguir tabulando por la página de atrás.
 */
export function Dialog({
  isOpen,
  onClose,
  label,
  labelledBy,
  initialFocusRef,
  closeOnBackdrop = true,
  className,
  children,
}: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Se guarda en un ref y no en una variable del efecto para que el cleanup
  // devuelva el foco al elemento correcto aunque el árbol haya cambiado.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const releaseScroll = lockBodyScroll();

    const focusTarget =
      initialFocusRef?.current ??
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      containerRef.current;
    focusTarget?.focus();

    return () => {
      releaseScroll();
      previouslyFocused.current?.focus();
    };
  }, [isOpen, initialFocusRef]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ) ?? [],
      ).filter(isVisible);

      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      // El ciclo se cierra a mano en los extremos: sin esto el foco se escapa a
      // la barra del navegador y de ahí a la página de atrás.
      if (event.shiftKey && (active === first || active === containerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      className={cn('fixed inset-0 z-50 outline-none', className)}
    >
      {children}
    </div>,
    document.body,
  );
}
