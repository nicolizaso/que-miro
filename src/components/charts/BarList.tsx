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
 */
export function BarList({ data }: { data: ChartDatum[] }) {
  const max = Math.max(...data.map((datum) => datum.value), 1);

  return (
    <ul aria-hidden="true" className="flex flex-col gap-2.5">
      {data.map((datum) => (
        <li key={datum.label} className="flex items-center gap-3">
          <span className="w-28 sm:w-36 shrink-0 text-sm text-text-muted truncate">
            {datum.label}
          </span>
          <span className="flex-1 flex items-center gap-2 min-w-0">
            <span
              // Punta redondeada y base recta: la barra crece desde el eje.
              className="h-3 bg-accent rounded-r-[4px] min-w-[2px]"
              style={{ width: `${Math.max((datum.value / max) * 100, 1.5)}%` }}
            />
            <span className="text-sm text-text-muted tabular-nums shrink-0">
              {datum.value}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
