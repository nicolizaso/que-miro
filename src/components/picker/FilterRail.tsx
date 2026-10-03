import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FacetOption } from '@/lib/picker';
import { useRailEdges } from '@/hooks/useRailEdges';

/**
 * Una fila de filtros del picker: el nombre a la izquierda y las opciones como
 * píldoras.
 *
 * Reemplaza a los `<select>` nativos, que escondían las opciones detrás de un
 * toque y no podían decir cuántos títulos dejaba cada una. Acá están todas a la
 * vista, con su cuenta, y las que vaciarían el sorteo se apagan antes de
 * tocarlas.
 *
 * Las píldoras van siempre en una sola línea que se desliza, también en
 * escritorio: si se acomodaran en varias líneas, un filtro con muchos géneros o
 * plataformas empujaría la ruleta hacia abajo y cada fila tendría otra altura.
 * Para que nadie con mouse dependa de un scroll horizontal, desde `sm` aparecen
 * flechas cuando la fila no entra entera.
 */
export function FilterRail<V extends string>({
  label,
  name,
  allLabel,
  options,
  value,
  onChange,
}: {
  /** El rótulo corto que se ve ("Género"). */
  label: string;
  /** El nombre accesible del grupo ("Filtrar por género"). */
  name: string;
  /** La primera píldora, la de no filtrar ("Todos", "Cualquiera"). */
  allLabel: string;
  options: FacetOption<V>[];
  value: V | null;
  onChange: (value: V | null) => void;
}) {
  const { ref, edges, scrollBy } = useRailEdges<HTMLDivElement>();
  const subject = label.toLowerCase();

  return (
    <div
      role="group"
      aria-label={name}
      className="flex items-center gap-3 sm:gap-5"
    >
      <span
        aria-hidden="true"
        className="text-eyebrow w-[5.75rem] sm:w-24 shrink-0 sm:text-right"
      >
        {label}
      </span>

      <div className="relative min-w-0 flex-1 -mr-4 sm:mr-0">
        <div
          ref={ref}
          className="rail flex gap-2 overflow-x-auto pr-4 py-0.5 sm:pr-0"
        >
          <button
            type="button"
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className="pill rail-item"
          >
            {allLabel}
          </button>

          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                // La elegida nunca se apaga, aunque haya quedado en cero por
                // otro filtro: tiene que poder destocarse.
                disabled={option.count === 0 && !selected}
                onClick={() => onChange(selected ? null : option.value)}
                className="pill rail-item"
              >
                {option.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'text-xs tabular-nums',
                    selected ? 'opacity-60' : 'text-text-subtle',
                  )}
                >
                  {option.count}
                </span>
                <span className="sr-only"> ({option.count})</span>
              </button>
            );
          })}
        </div>

        {/* Los degradados dicen "hay más" de cada lado, y se van al llegar a
            la punta. Son una pista visual, no un control. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-bg-main to-transparent transition-opacity duration-200',
            edges.atStart ? 'opacity-0' : 'opacity-100',
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-main to-transparent transition-opacity duration-200',
            edges.atEnd ? 'opacity-0' : 'opacity-100',
          )}
        />
      </div>

      {/* Solo con mouse: en pantalla táctil el gesto ya existe y dos botones
          más le robarían ancho a la fila. */}
      {edges.overflows && (
        <div className="hidden shrink-0 sm:flex items-center gap-1">
          {(
            [
              ['prev', ChevronLeft, edges.atStart, `Ver opciones anteriores de ${subject}`],
              ['next', ChevronRight, edges.atEnd, `Ver más opciones de ${subject}`],
            ] as const
          ).map(([key, Icon, isDisabled, ariaLabel]) => (
            <button
              key={key}
              type="button"
              onClick={() => scrollBy(key === 'next' ? 1 : -1)}
              disabled={isDisabled}
              aria-label={ariaLabel}
              className={cn(
                'btn-icon w-8 h-8 border border-border-card text-text-muted',
                'hover:bg-border-card hover:text-text-main',
                // Apagada y no escondida: si desaparecieran al llegar a la
                // punta, la otra saltaría de lugar en cada scroll.
                'disabled:opacity-30 disabled:pointer-events-none',
              )}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
