import { ReactNode, useId, useState } from 'react';
import { Table2 } from 'lucide-react';

export interface ChartDatum {
  label: string;
  value: number;
}

/**
 * Marco común de los gráficos: título, el gráfico y su tabla.
 *
 * La tabla no es un extra: es el canal que hace legible el gráfico para quien
 * usa un lector de pantalla, y de paso deja leer los valores exactos a
 * cualquiera. Está plegada para no competir con el gráfico, pero siempre
 * presente — el `<svg>` va con `aria-hidden` justamente porque la tabla ya
 * cuenta lo mismo mejor.
 */
export function ChartFrame({
  title,
  subtitle,
  data,
  valueLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  /** Encabezado de la columna de valores en la tabla. */
  valueLabel: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <section className="surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-section">{title}</h3>
          {subtitle && (
            <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="flex items-center gap-1.5 shrink-0 text-xs text-text-muted hover:text-text-main transition-colors px-2 py-1 rounded-lg hover:bg-border-card"
        >
          <Table2 size={14} aria-hidden="true" />
          {showTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {!showTable && children}

      <div id={tableId} className={showTable ? '' : 'sr-only'}>
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-text-muted text-left">
              <th scope="col" className="font-medium pb-2">
                {subtitle ?? 'Categoría'}
              </th>
              <th scope="col" className="font-medium pb-2 text-right">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.label} className="border-t border-border-card">
                <th scope="row" className="font-normal py-1.5 text-left">
                  {datum.label}
                </th>
                <td className="py-1.5 text-right tabular-nums">{datum.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
