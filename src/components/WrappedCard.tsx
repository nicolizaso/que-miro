import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useMediaStore } from '@/store';
import { ShareButton } from '@/components/ShareButton';
import { availableYears, buildWrapped } from '@/lib/wrapped';

/**
 * "Tu año en Qué Miro?": el resumen anual, listo para compartir.
 *
 * Aparece solo si hay un año con algo adentro. Un wrapped con dos películas no
 * es un logro, es un recordatorio de que la app está vacía.
 */
const MIN_WATCHES = 3;

export function WrappedCard() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const years = useMemo(() => availableYears(mediaList), [mediaList]);
  const [year, setYear] = useState<number | null>(null);

  const selectedYear = year ?? years[0] ?? null;
  const wrapped = useMemo(
    () => (selectedYear ? buildWrapped(mediaList, selectedYear) : null),
    [mediaList, selectedYear],
  );

  if (!wrapped || wrapped.watches < MIN_WATCHES) return null;

  const highlights = [
    { value: String(wrapped.watches), label: 'vistas' },
    { value: wrapped.timeLabel, label: 'mirando' },
    { value: wrapped.averageRating.toFixed(1), label: 'promedio' },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-section">Tu año en Qué Miro?</h3>
        {years.length > 1 && (
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Año del resumen"
            className="bg-bg-card border border-border-control rounded-control pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* El panel se destaca con el acento, no con un negro fijo: la imagen
          que se comparte se dibuja aparte en `shareCard`, con su propia paleta,
          así que acá no hay nada que igualar y sí un tema que respetar. Un
          bloque #0b0d0e en medio de una página crema se leía como un error. */}
      <div className="relative overflow-hidden rounded-surface border border-accent/30 bg-accent/10 p-6 sm:p-8 flex flex-col gap-6">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5 bg-accent"
        />

        <div>
          <p className="flex items-center gap-2 text-eyebrow text-accent">
            <Sparkles size={14} aria-hidden="true" />
            Tu {wrapped.year}
          </p>
          <p className="text-display mt-2">{wrapped.timeLabel} mirando</p>
          <p className="text-text-muted mt-1">
            {wrapped.titles} {wrapped.titles === 1 ? 'título' : 'títulos'}
            {wrapped.topGenre && `, sobre todo de ${wrapped.topGenre.toLowerCase()}`}
            {wrapped.busiestMonth && `. Tu mes fuerte fue ${wrapped.busiestMonth}`}.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-4">
          {highlights.map(({ value, label }) => (
            // `justify-between` con `h-full`: en el teléfono "2 días y 9 h"
            // ocupa dos renglones y los otros dos uno, y sin esto las
            // etiquetas quedaban a tres alturas distintas.
            <div key={label} className="flex h-full flex-col justify-between">
              <dt className="sr-only">{label}</dt>
              <dd className="font-serif italic font-bold text-2xl text-accent">
                {value}
              </dd>
              <p className="text-xs text-text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </dl>

        {wrapped.best && (
          <p className="text-sm text-text-muted">
            Lo mejor del año:{' '}
            <span className="text-text-main font-medium">
              {wrapped.best.media.title}
            </span>{' '}
            ({wrapped.best.entry.rating}★)
          </p>
        )}
      </div>

      <ShareButton
        className="self-start"
        label="Compartir mi año"
        title={`Mi ${wrapped.year} en Qué Miro?`}
        text={`En ${wrapped.year} vi ${wrapped.watches} títulos: ${wrapped.timeLabel} mirando, promedio ${wrapped.averageRating.toFixed(
          1,
        )}.`}
        card={{
          eyebrow: `Mi año ${wrapped.year}`,
          headline: `${wrapped.timeLabel} mirando`,
          subline: wrapped.topGenre
            ? `Sobre todo, ${wrapped.topGenre.toLowerCase()}`
            : undefined,
          stats: highlights,
        }}
      />
    </section>
  );
}
