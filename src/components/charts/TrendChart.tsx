import { useId, useState } from 'react';
import { ChartDatum } from './ChartFrame';

const WIDTH = 600;
const HEIGHT = 140;
const PADDING = { top: 12, right: 8, bottom: 4, left: 8 };

/**
 * Serie de tiempo con área tenue y línea encima.
 *
 * El eje horizontal es el tiempo, así que los meses sin actividad tienen que
 * ocupar su lugar: si se saltearan, dos rachas separadas por medio año se verían
 * como una sola continua.
 *
 * El `viewBox` fijo con `preserveAspectRatio="none"` deja que el SVG se estire a
 * lo ancho del contenedor sin recalcular nada en JavaScript; los grosores se
 * compensan con `vector-effect` para que la línea no se deforme al estirarse.
 */
export function TrendChart({ data }: { data: ChartDatum[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId();

  if (data.length < 2) return null;

  const max = Math.max(...data.map((datum) => datum.value), 1);
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (index: number) =>
    PADDING.left + (index / (data.length - 1)) * innerWidth;
  const y = (value: number) =>
    PADDING.top + innerHeight - (value / max) * innerHeight;

  const points = data.map((datum, index) => `${x(index)},${y(datum.value)}`);
  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${x(data.length - 1)},${HEIGHT} L ${x(0)},${HEIGHT} Z`;

  const active = hovered !== null ? data[hovered] : null;

  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-32 overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--qm-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--qm-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Línea de base: una sola, sólida y discreta. */}
          <line
            x1={0}
            y1={HEIGHT}
            x2={WIDTH}
            y2={HEIGHT}
            stroke="var(--qm-border-card)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--qm-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hovered !== null && (
            <line
              x1={x(hovered)}
              y1={PADDING.top}
              x2={x(hovered)}
              y2={HEIGHT}
              stroke="var(--qm-text-subtle)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* El punto marcado lleva un anillo del color de la superficie, para
              que se despegue de la línea que cruza por detrás. */}
          {hovered !== null && (
            <circle
              cx={x(hovered)}
              cy={y(data[hovered].value)}
              r={4}
              fill="var(--qm-accent)"
              stroke="var(--qm-bg-card)"
              strokeWidth={2}
            />
          )}

          {/* Zonas de contacto: más anchas que la marca, para que apuntar sea
              fácil también con el dedo. */}
          {data.map((datum, index) => (
            <rect
              key={datum.label + index}
              x={x(index) - innerWidth / (data.length - 1) / 2}
              y={0}
              width={innerWidth / (data.length - 1)}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {active && (
          <div
            className="absolute -top-1 px-2 py-1 rounded-lg bg-bg-main border border-border-card text-xs whitespace-nowrap pointer-events-none -translate-x-1/2"
            style={{ left: `${(hovered! / (data.length - 1)) * 100}%` }}
          >
            <span className="font-medium">{active.value}</span>{' '}
            <span className="text-text-muted">en {active.label}</span>
          </div>
        )}
      </div>

      <ul className="flex justify-between text-[10px] text-text-subtle">
        {data.map((datum, index) => (
          <li key={datum.label + index}>{datum.label}</li>
        ))}
      </ul>
    </div>
  );
}
