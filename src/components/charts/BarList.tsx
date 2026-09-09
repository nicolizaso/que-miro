import { ChartDatum } from './ChartFrame';

/**
 * Barras horizontales, una por categoría.
 *
 * Horizontales y no columnas porque las etiquetas son nombres largos —"Ciencia
 * Ficción", "Guerra y Política"— que en vertical habría que rotar o abreviar.
 *
 * Todas las barras van del mismo color: las categorías no tienen orden propio,
 * así que pintarlas más oscuras cuanto más grandes sería re-codificar en color
 * lo que el largo de la barra ya dice, y gastar el único canal libre que queda.
 *
 * La barra es fina y va sobre una guía tenue que llega hasta el máximo. La guía
 * no es adorno: sin ella, una barra corta flota en el vacío y no hay contra qué
 * medirla. La barra sí es del color de acento, pero ocupa poca altura, así que
 * la fila entera se lee como un dato y no como una franja roja.
 */
export function BarList({ data }: { data: ChartDatum[] }) {
  const max = Math.max(...data.map((datum) => datum.value), 1);

  return (
    <ul aria-hidden="true" className="flex flex-col gap-3">
      {data.map((datum) => (
        <li key={datum.label} className="flex items-center gap-3">
          <span className="w-24 sm:w-32 shrink-0 text-sm text-text-muted truncate">
            {datum.label}
          </span>
          <span className="flex-1 flex items-center gap-3 min-w-0">
            <span className="h-1.5 flex-1 rounded-full bg-border-card overflow-hidden">
              <span
                className="block h-full rounded-full bg-accent"
                // El mínimo de 2% es para que un valor de 1 se vea como una
                // marca y no como una fila vacía.
                style={{ width: `${Math.max((datum.value / max) * 100, 2)}%` }}
              />
            </span>
            {/* Ancho fijo: sin él, un 12 empuja su barra un carácter más a la
                izquierda que un 3 y las puntas dejan de estar alineadas. */}
            <span className="w-6 shrink-0 text-right text-sm text-text-muted tabular-nums">
              {datum.value}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
