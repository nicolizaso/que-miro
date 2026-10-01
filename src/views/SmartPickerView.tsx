import { useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMediaStore } from '@/store';
import { PickerRoulette } from '@/components/PickerRoulette';
import { DuelMode } from '@/components/DuelMode';
import { ModeSwitch, PickerMode } from '@/components/picker/ModeSwitch';
import { PosterWall } from '@/components/picker/PosterWall';
import { posterWall } from '@/lib/picker';

/**
 * Las dos formas de decidir qué mirar.
 *
 * Comparten pantalla porque responden la misma pregunta con distinta paciencia:
 * el sorteo la contesta en un segundo, el duelo se toma unos minutos y a cambio
 * deja la lista ordenada para las próximas veces.
 */
export function SmartPickerView() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const [mode, setMode] = useState<PickerMode>('azar');

  const pending = useMemo(
    () => mediaList.filter((media) => media.status === 'por_ver'),
    [mediaList],
  );
  const posters = useMemo(() => posterWall(pending), [pending]);

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
    <div className="relative isolate w-full">
      <PosterWall posters={posters} />

      <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 pt-12 sm:pt-16">
        <p className="text-eyebrow mb-3">Esta noche</p>
        <h1 className="text-hero text-center mb-3">Qué ver hoy</h1>
        <p className="text-text-muted mb-6 text-center max-w-xs sm:max-w-none">
          {mode === 'azar'
            ? 'Dejá que el destino elija tu próxima historia.'
            : 'Elegí de a dos y armá tu ranking.'}
        </p>

        <div className="mb-10">
          <ModeSwitch value={mode} onChange={setMode} label="Modo del picker" />
        </div>

        {mode === 'azar' ? (
          <PickerRoulette pending={pending} />
        ) : (
          <DuelMode pending={pending} />
        )}
      </div>
    </div>
  );
}
