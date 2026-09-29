import { Heatmap as HeatmapData } from '@/lib/stats';
import { formatDay, fromDayKey } from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * De menos a más: el fondo de un casillero vacío y cuatro intensidades del
 * acento. Un solo color, porque lo que se mide es una sola cosa; la intensidad
 * alcanza para ver las rachas sin tener que leer ningún número.
 */
const LEVELS = [
  'bg-border-card',
  'bg-accent/25',
  'bg-accent/50',
  'bg-accent/75',
  'bg-accent',
];

function level(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  return Math.max(1, Math.ceil((count / max) * 4));
}

/** Semanas que se ven en pantallas chicas: medio año entra a lo ancho. */
const NARROW_WEEKS = 26;

/**
 * Mapa de actividad, un casillero por día, estilo el de contribuciones de
 * GitHub.
 *
 * Es `aria-hidden`: su tabla, en el `ChartFrame` de al lado, cuenta lo mismo
 * semana por semana. En el teléfono muestra el último medio año, que es lo que
 * entra sin scroll lateral; desde `lg`, el año entero.
 */
export function Heatmap({ data }: { data: HeatmapData }) {
  const olderThanNarrow = data.weeks.length - NARROW_WEEKS;

  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex gap-[3px]">
        {data.weeks.map((week, index) => {
          // El mes se nombra en la columna donde empieza. Además, la primera
          // columna visible lleva el suyo: en pantallas chicas es otra que en
          // las grandes, así que son dos etiquetas y cada una se ve en la suya.
          const monthStart = week.find((day) => day.date.endsWith('-01'));
          const monthOf = (dayKey: string) =>
            fromDayKey(dayKey).toLocaleDateString('es-AR', { month: 'short' });
          const label = monthStart || index === 0 ? monthOf((monthStart ?? week[0]).date) : '';
          const narrowLabel = !label && index === olderThanNarrow ? monthOf(week[0].date) : '';

          return (
            <div
              key={week[0].date}
              className={cn(
                'flex flex-col gap-[3px]',
                index < olderThanNarrow && 'hidden lg:flex',
              )}
            >
              {/* La etiqueta flota sobre la columna: si ocupara su ancho, las
                  semanas con nombre de mes quedarían más separadas que el
                  resto. */}
              <span className="relative h-3">
                <span className="absolute left-0 top-0 text-[10px] leading-3 text-text-subtle whitespace-nowrap">
                  {label}
                  {narrowLabel && <span className="lg:hidden">{narrowLabel}</span>}
                </span>
              </span>
              {week.map((day) => (
                <span
                  key={day.date}
                  title={day.future ? undefined : `${formatDay(day.date)}: ${day.count}`}
                  className={cn(
                    'w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[3px]',
                    day.future ? 'bg-transparent' : LEVELS[level(day.count, data.max)],
                  )}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 self-end text-[11px] text-text-subtle">
        Menos
        {LEVELS.map((color) => (
          <span key={color} className={cn('w-2.5 h-2.5 rounded-[3px]', color)} />
        ))}
        Más
      </div>
    </div>
  );
}
