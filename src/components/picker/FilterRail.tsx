import { cn } from '@/lib/utils';
import { FacetOption } from '@/lib/picker';

/**
 * Una fila de filtros del picker: el nombre a la izquierda y las opciones como
 * píldoras.
 *
 * Reemplaza a los `<select>` nativos, que escondían las opciones detrás de un
 * toque y no podían decir cuántos títulos dejaba cada una. Acá están todas a la
 * vista, con su cuenta, y las que vaciarían el sorteo se apagan antes de
 * tocarlas.
 *
 * En el celular la fila se desliza; desde `sm` hay ancho y se acomoda en
 * varias líneas, así nadie con mouse depende de un scroll horizontal.
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
  return (
    <div
      role="group"
      aria-label={name}
      className="flex items-center sm:items-start gap-3 sm:gap-5"
    >
      <span
        aria-hidden="true"
        className="text-eyebrow w-[5.75rem] sm:w-24 shrink-0 sm:text-right sm:pt-3"
      >
        {label}
      </span>

      <div className="relative min-w-0 flex-1 -mr-4 sm:mr-0">
        <div className="rail flex gap-2 overflow-x-auto pr-4 py-0.5 sm:flex-wrap sm:overflow-visible sm:pr-0">
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

        {/* El degradado del borde dice "hay más" en el celular. Desde `sm` la
            fila no se desliza y no hace falta. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-main to-transparent sm:hidden"
        />
      </div>
    </div>
  );
}
