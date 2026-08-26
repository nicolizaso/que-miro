import { useState } from 'react';
import { ChartDatum } from './ChartFrame';
import { cn } from '@/lib/utils';

/**
 * Columnas para una escala ordenada, como los puntajes de 0,5 a 5.
 *
 * El orden lo lleva el eje, no el color: las diez columnas son del mismo tono.
 * Solo se etiqueta la más alta — un número sobre cada columna se convierte en
 * ruido y termina sin leerse.
 */
export function ColumnChart({
  data,
  unit,
}: {
  data: ChartDatum[];
  /** Se usa en el globo al pasar el mouse: "3 reseñas". */
  unit: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((datum) => datum.value), 1);
  const peak = data.reduce(
    (best, datum, index) => (datum.value > data[best].value ? index : best),
    0,
  );

  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <ul className="flex items-end gap-1 h-32">
        {data.map((datum, index) => {
          const height = (datum.value / max) * 100;
          const isPeak = index === peak && datum.value > 0;

          return (
            <li
              key={datum.label}
              className="flex-1 h-full flex flex-col justify-end items-center gap-1 relative"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {(hovered === index || (hovered === null && isPeak)) &&
                datum.value > 0 && (
                  <span className="absolute -top-1 text-[11px] font-medium text-text-main whitespace-nowrap">
                    {hovered === index
                      ? `${datum.value} ${unit}`
                      : datum.value}
                  </span>
                )}
              <span
                className={cn(
                  'w-full rounded-t-[4px] transition-colors',
                  hovered === index ? 'bg-accent' : 'bg-accent/70',
                  datum.value === 0 && 'bg-border-card',
                )}
                style={{ height: `${Math.max(height, datum.value > 0 ? 4 : 2)}%` }}
              />
            </li>
          );
        })}
      </ul>

      <ul className="flex gap-1 border-t border-border-card pt-1.5">
        {data.map((datum) => (
          <li
            key={datum.label}
            className="flex-1 text-center text-[10px] text-text-subtle tabular-nums"
          >
            {datum.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
