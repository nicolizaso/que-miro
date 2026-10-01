import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type PickerMode = 'azar' | 'duelo';

const MODES: { value: PickerMode; label: string }[] = [
  { value: 'azar', label: 'Al azar' },
  { value: 'duelo', label: 'Duelo' },
];

/**
 * Al azar o duelo.
 *
 * Dos palabras con una línea debajo de la elegida, en vez de una caja con
 * botones: es la primera decisión de la pantalla y no compite con los
 * filtros, que sí son controles de a muchos.
 */
export function ModeSwitch({
  value,
  onChange,
  label,
}: {
  value: PickerMode;
  onChange: (mode: PickerMode) => void;
  /** El nombre accesible de la lista de pestañas. */
  label: string;
}) {
  // Un `layoutId` por instancia: con uno fijo, la línea saltaría entre el
  // picker propio y el de a dos si alguna vez conviven en el árbol.
  const indicator = useId();

  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-2">
      {MODES.map(({ value: mode, label: modeLabel }, index) => (
        <div key={mode} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-border-control" />
          )}
          <button
            type="button"
            role="tab"
            aria-selected={value === mode}
            onClick={() => onChange(mode)}
            className={cn(
              'relative px-3 py-2.5 font-serif italic text-xl transition-colors',
              value === mode ? 'text-text-main' : 'text-text-muted hover:text-text-main',
            )}
          >
            {modeLabel}
            {value === mode && (
              <motion.span
                layoutId={indicator}
                aria-hidden="true"
                className="absolute left-3 right-3 bottom-1 h-px bg-accent"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
