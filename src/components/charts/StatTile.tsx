import { cn } from '@/lib/utils';

/**
 * Un número con su etiqueta.
 *
 * Cuando el dato es un solo valor, el número *es* el gráfico: un gráfico de
 * barras de una sola barra no agrega nada y ocupa diez veces más.
 */
export function StatTile({
  label,
  value,
  hint,
  emphasis = false,
  className,
}: {
  label: string;
  value: string | number;
  /** Aclaración chica debajo del número. */
  hint?: string;
  /** El número que encabeza el panel. Uno solo por vista. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-bg-card border border-border-card rounded-2xl p-5 flex flex-col justify-center min-h-28',
        className,
      )}
    >
      <span
        className={cn(
          'font-serif italic font-bold text-accent leading-none text-balance',
          // El destacado es el número que encabeza el panel, pero su valor
          // puede ser un texto largo ("3 días y 4 h"): baja de tamaño en
          // pantallas chicas en vez de partirse en dos renglones.
          emphasis ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-3xl sm:text-4xl',
        )}
      >
        {value}
      </span>
      <span className="text-sm text-text-muted mt-2">{label}</span>
      {hint && <span className="text-xs text-text-subtle mt-1">{hint}</span>}
    </div>
  );
}
