import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { selectedFirst } from '@/lib/catalog';
import { useRailEdges } from '@/hooks/useRailEdges';

/** Una píldora. Sin `count`, no se muestra cuenta ni se apaga sola. */
export interface RailOption<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/**
 * Una sola elegida, o varias: el catálogo deja marcar "acción" y "comedia"
 * juntas. En las dos, la primera píldora es la de no filtrar.
 */
type Selection<V extends string> =
  | { multiple?: false; value: V | null; onChange: (value: V | null) => void }
  | { multiple: true; value: V[]; onChange: (value: V[]) => void };

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
 *
 * El catálogo la usa también: ahí no hay cuentas —es todo TMDB—, algunas
 * filas dejan elegir varias, y con `selectedFirst` lo elegido pasa adelante
 * —deslizándose a su lugar— para que nunca quede fuera de la vista.
 */
export function FilterRail<V extends string>({
  label,
  name,
  allLabel,
  options,
  selectedFirst: chosenFirst = false,
  tone = 'neutral',
  ...selection
}: {
  /** El rótulo corto que se ve ("Género"). */
  label: string;
  /** El nombre accesible del grupo ("Filtrar por género"). */
  name: string;
  /** La primera píldora, la de no filtrar ("Todos", "Cualquiera"). */
  allLabel: string;
  options: RailOption<V>[];
  /** Las elegidas van adelante, en el orden en que se eligieron. */
  selectedFirst?: boolean;
  /** `accent` pinta en rojo las opciones elegidas; "Todos" queda como siempre. */
  tone?: 'neutral' | 'accent';
} & Selection<V>) {
  const { ref, edges, scrollBy } = useRailEdges<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const subject = label.toLowerCase();

  const selectedValues: V[] = selection.multiple
    ? selection.value
    : selection.value === null
      ? []
      : [selection.value];
  const ordered = chosenFirst ? selectedFirst(options, selectedValues) : options;

  // Al elegir una, la fila vuelve al principio, que es adonde fue a parar.
  // Va en un efecto y no en el clic: recién después del render está en su
  // lugar nuevo.
  const scrollToStart = useRef(false);
  useEffect(() => {
    if (!scrollToStart.current) return;
    scrollToStart.current = false;
    ref.current?.scrollTo?.({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  const isSelected = (option: V) =>
    selection.multiple ? selection.value.includes(option) : selection.value === option;
  const noneSelected = selection.multiple
    ? selection.value.length === 0
    : selection.value === null;

  const clear = () => {
    if (selection.multiple) selection.onChange([]);
    else selection.onChange(null);
  };

  const toggle = (option: V) => {
    if (chosenFirst && !isSelected(option)) scrollToStart.current = true;
    if (selection.multiple) {
      selection.onChange(
        isSelected(option)
          ? selection.value.filter((current) => current !== option)
          : [...selection.value, option],
      );
    } else {
      selection.onChange(isSelected(option) ? null : option);
    }
  };

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
        {/* `layoutScroll` le dice a Motion que esta caja se desplaza: sin eso,
            una píldora que pasa adelante con la fila deslizada calcularía mal
            desde dónde viene. */}
        <motion.div
          ref={ref}
          layoutScroll={chosenFirst}
          className="rail flex gap-2 overflow-x-auto pr-4 py-0.5 sm:pr-0"
        >
          <button
            type="button"
            aria-pressed={noneSelected}
            onClick={clear}
            className="pill rail-item"
          >
            {allLabel}
          </button>

          {ordered.map((option) => {
            const selected = isSelected(option.value);
            return (
              <motion.button
                key={option.value}
                // Con `selectedFirst`, la elegida se desliza adelante en vez de
                // aparecer ahí de golpe. `MotionConfig` la deja quieta para
                // quien pidió menos movimiento.
                layout={chosenFirst ? 'position' : false}
                transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                type="button"
                aria-pressed={selected}
                // La elegida nunca se apaga, aunque haya quedado en cero por
                // otro filtro: tiene que poder destocarse.
                disabled={option.count === 0 && !selected}
                onClick={() => toggle(option.value)}
                className={cn('pill rail-item', tone === 'accent' && 'pill-accent')}
              >
                {option.label}
                {option.count !== undefined && (
                  <>
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
                  </>
                )}
              </motion.button>
            );
          })}
        </motion.div>

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
