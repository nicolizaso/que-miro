import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRailEdges } from '@/hooks/useRailEdges';

/**
 * Una fila de tarjetas que se desplaza en horizontal.
 *
 * Antes esto era un `overflow-x-auto` pelado, y el único indicio de que la fila
 * seguía era la barra de scroll del sistema: en el celular no se ve, y en
 * escritorio se veía demasiado —una canaleta gris cruzada debajo de cada fila de
 * pósters—. Encima, con mouse "arrastrar la barra" es el peor gesto posible para
 * algo que se mira de a un póster por vez.
 *
 * Ahora la barra no se dibuja (`rail`) y en su lugar hay tres señales:
 *
 * - flechas a la derecha del título, que aparecen solo si hay adónde ir y se
 *   apagan al llegar a la punta;
 * - un degradado en el borde, que dice "hay más" sin ocupar una línea propia;
 * - imantado por tarjeta, para no terminar nunca con media tarjeta a la vista.
 *
 * El gesto nativo —rueda horizontal, trackpad, dedo— sigue funcionando igual:
 * esto le agrega controles, no se los saca.
 */
export function ScrollRail({
  label,
  header,
  fadeFrom = 'main',
  className,
  children,
}: {
  /** Cómo se llama la fila, para el nombre accesible de las flechas. */
  label: string;
  /** El encabezado de la sección. Va a la izquierda de las flechas. */
  header?: ReactNode;
  /** El color sobre el que se apoya la fila, para que el degradado del borde
      termine en el fondo real y no en un gris aproximado. */
  fadeFrom?: 'main' | 'card';
  className?: string;
  /** Los `<li>` de la fila. */
  children: ReactNode;
}) {
  const { ref: scrollerRef, edges, scrollBy } = useRailEdges<HTMLUListElement>();

  const fade =
    fadeFrom === 'card'
      ? 'from-bg-card to-transparent'
      : 'from-bg-main to-transparent';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(header || edges.overflows) && (
        <div className="flex items-end justify-between gap-4">
          {header}

          {/* Solo con mouse: en pantalla táctil el gesto ya existe y dos botones
              más solo le robarían ancho a la fila. */}
          {edges.overflows && (
            <div className="hidden shrink-0 sm:flex items-center gap-1">
              {(
                [
                  ['prev', ChevronLeft, edges.atStart, `Retroceder en ${label}`],
                  ['next', ChevronRight, edges.atEnd, `Avanzar en ${label}`],
                ] as const
              ).map(([key, Icon, isDisabled, ariaLabel]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => scrollBy(key === 'next' ? 1 : -1)}
                  disabled={isDisabled}
                  aria-label={ariaLabel}
                  className={cn(
                    'btn-icon w-9 h-9 border border-border-card text-text-muted',
                    'hover:bg-border-card hover:text-text-main',
                    // Apagada y no escondida: si desaparecieran al llegar a la
                    // punta, la otra saltaría de lugar en cada scroll.
                    'disabled:opacity-30 disabled:pointer-events-none',
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative -mx-4 sm:mx-0">
        <ul
          ref={scrollerRef}
          className="rail flex gap-3 overflow-x-auto px-4 sm:px-0 scroll-px-4 sm:scroll-px-0 py-1"
        >
          {children}
        </ul>

        {/* Los degradados de los bordes. `aria-hidden` y sin eventos: son una
            pista visual, no un control. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r transition-opacity duration-200',
            fade,
            edges.atStart ? 'opacity-0' : 'opacity-100',
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l transition-opacity duration-200',
            fade,
            edges.atEnd ? 'opacity-0' : 'opacity-100',
          )}
        />
      </div>
    </div>
  );
}
