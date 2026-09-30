import { cn } from '@/lib/utils';

/** Un botón que se prende y se apaga: un género, una década. */
export function ToggleChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      aria-pressed={selected}
      className={cn(
        'px-3 py-1.5 rounded-full border text-sm transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        selected
          ? 'bg-accent text-accent-contrast border-accent font-medium'
          : 'border-border-control text-text-muted hover:text-text-main hover:border-accent',
      )}
    >
      {label}
    </button>
  );
}
