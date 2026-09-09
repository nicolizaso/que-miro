import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, usePreferences } from '@/preferences';
import { cn } from '@/lib/utils';

const OPTIONS: {
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

/** Botón compacto que rota entre claro, oscuro y sistema. Va en el header. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = usePreferences();

  const currentIndex = OPTIONS.findIndex((option) => option.value === theme);
  const current = OPTIONS[currentIndex] ?? OPTIONS[2];
  const next = OPTIONS[(currentIndex + 1) % OPTIONS.length];
  const { Icon } = current;

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      // El nombre accesible dice el estado actual *y* qué pasa al activarlo: un
      // icono de sol no le dice nada a quien usa un lector de pantalla.
      aria-label={`Tema: ${current.label}. Cambiar a ${next.label.toLowerCase()}`}
      title={`Tema: ${current.label}`}
      className={cn(
        'btn-icon w-10 h-10 rounded-full text-text-muted hover:text-text-main hover:bg-border-card',
        className,
      )}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/** Control de tres opciones para la pantalla de ajustes. */
export function ThemeRadioGroup() {
  const { theme, setTheme } = usePreferences();

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la aplicación"
      className="flex bg-bg-main p-1 rounded-control border border-border-card"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm rounded-lg transition-colors',
            theme === value
              ? 'bg-border-card text-text-main font-medium'
              : 'text-text-muted hover:text-text-main',
          )}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
