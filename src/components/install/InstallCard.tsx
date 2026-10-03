import { useId, useState } from 'react';
import { InstallButton } from '@/components/install/InstallButton';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { usePreferences } from '@/preferences';
import { showsInstallCard } from '@/lib/install';

/**
 * La tarjeta que ofrece instalar la app, en el celular.
 *
 * Va en Explorar, que es donde cae quien llega por primera vez: el que entra
 * desde un link compartido es justo el que no sabe que esto se instala. Se
 * calla con "Ahora no" y no vuelve hasta dentro de un mes.
 */
export function InstallCard() {
  const { platform, isMobile } = useInstallPrompt();
  const dismissedAt = usePreferences((state) => state.installCardDismissedAt);
  const dismiss = usePreferences((state) => state.dismissInstallCard);
  // La hora de cuando se montó alcanza: nadie se queda un mes en la misma pantalla.
  const [now] = useState(() => new Date());
  const titleId = useId();

  if (!showsInstallCard({ platform, isMobile, dismissedAt, now })) return null;

  return (
    <section aria-labelledby={titleId} className="surface p-5 flex items-start gap-4">
      {/* El ícono real: es lo que va a ver en la pantalla de inicio. */}
      <img
        src="/pwa-192x192.png"
        alt=""
        width={56}
        height={56}
        className="w-14 h-14 rounded-control shrink-0"
      />
      <div className="min-w-0 flex flex-col gap-3">
        <div>
          <h2 id={titleId} className="text-section mb-1">
            Tenela a un toque
          </h2>
          <p className="text-sm text-text-muted max-w-md">
            Instalala en tu celu: se abre desde la pantalla de inicio, sin la barra del navegador,
            y anda sin conexión.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InstallButton />
          <button type="button" onClick={dismiss} className="btn btn-ghost px-4 py-2 text-sm">
            Ahora no
          </button>
        </div>
      </div>
    </section>
  );
}
