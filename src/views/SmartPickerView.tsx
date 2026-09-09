import { useMemo, useState } from 'react';
import { Shuffle, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMediaStore } from '@/store';
import { PickerRoulette } from '@/components/PickerRoulette';
import { DuelMode } from '@/components/DuelMode';
import { cn } from '@/lib/utils';

type Mode = 'azar' | 'duelo';

const MODES: { value: Mode; label: string; Icon: typeof Shuffle }[] = [
  { value: 'azar', label: 'Al azar', Icon: Shuffle },
  { value: 'duelo', label: 'Duelo', Icon: Swords },
];

/**
 * Las dos formas de decidir qué mirar.
 *
 * Comparten pantalla porque responden la misma pregunta con distinta paciencia:
 * el sorteo la contesta en un segundo, el duelo se toma unos minutos y a cambio
 * deja la lista ordenada para las próximas veces.
 */
export function SmartPickerView() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const [mode, setMode] = useState<Mode>('azar');

  const pending = useMemo(
    () => mediaList.filter((media) => media.status === 'por_ver'),
    [mediaList],
  );

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-lg mx-auto">
        <Shuffle className="text-border-card w-16 h-16 mb-6" aria-hidden="true" />
        <h1 className="text-display mb-2">Qué ver hoy</h1>
        <p className="text-text-muted mb-6">
          Agregá títulos a tu lista "Por Ver" y volvé: acá se decide por vos.
        </p>
        <Link
          to="/explorar"
          className="btn btn-primary px-4 py-2.5 text-sm"
        >
          Explorar títulos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 pt-8">
      <h1 className="text-display mb-2">Qué ver hoy</h1>
      <p className="text-text-muted mb-6 text-center">
        {mode === 'azar'
          ? 'Dejá que el destino elija tu próxima historia.'
          : 'Elegí de a dos y armá tu ranking.'}
      </p>

      <div
        role="tablist"
        aria-label="Modo del picker"
        className="flex bg-bg-card p-1 rounded-control border border-border-card mb-8"
      >
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-colors',
              mode === value
                ? 'bg-border-card text-text-main'
                : 'text-text-muted hover:text-text-main',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'azar' ? (
        <PickerRoulette pending={pending} />
      ) : (
        <DuelMode pending={pending} />
      )}
    </div>
  );
}
