import { useId, useRef } from 'react';
import { Check, Copy, Ellipsis, Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/contexts/ToastContext';
import type { InstallPlatform } from '@/lib/install';

type GuidePlatform = Extract<InstallPlatform, 'ios-safari' | 'ios-browser' | 'ios-in-app'>;

interface Step {
  Icon: LucideIcon;
  text: React.ReactNode;
}

/**
 * Los pasos de cada navegador.
 *
 * El ícono de cada paso es el mismo que va a tener que buscar en la
 * pantalla: lo que se reconoce de un vistazo es el dibujo, no el nombre.
 * Safari cambió de lugar el Compartir más de una vez —en la barra de abajo,
 * adentro de "···"—, así que se nombran las dos cosas en vez de señalar un
 * rincón que en su iPhone puede no estar.
 */
const GUIDES: Record<GuidePlatform, { title: string; intro: string; steps: Step[] }> = {
  'ios-safari': {
    title: 'Instalala en tres toques',
    intro: 'En iPhone, Safari no deja que una página se instale sola. Es así:',
    steps: [
      {
        Icon: Share,
        text: (
          <>
            Tocá <strong>Compartir</strong> en la barra de Safari. Si no lo ves, tocá primero{' '}
            <strong>···</strong>.
          </>
        ),
      },
      {
        Icon: SquarePlus,
        text: (
          <>
            Bajá un poco y elegí <strong>Agregar a inicio</strong>.
          </>
        ),
      },
      {
        Icon: Check,
        text: (
          <>
            Tocá <strong>Agregar</strong>, arriba a la derecha. Listo: queda en tu pantalla de
            inicio.
          </>
        ),
      },
    ],
  },
  'ios-browser': {
    title: 'Instalala en tres toques',
    intro: 'En iPhone, ningún navegador deja que una página se instale sola. Es así:',
    steps: [
      {
        Icon: Share,
        text: (
          <>
            Tocá <strong>Compartir</strong>: está en la barra de la dirección o en el menú del
            navegador.
          </>
        ),
      },
      {
        Icon: SquarePlus,
        text: (
          <>
            Elegí <strong>Agregar a inicio</strong>. Si no aparece, bajá o tocá{' '}
            <strong>Más</strong>.
          </>
        ),
      },
      {
        Icon: Check,
        text: (
          <>
            Tocá <strong>Agregar</strong>. Listo: queda en tu pantalla de inicio.
          </>
        ),
      },
    ],
  },
  'ios-in-app': {
    title: 'Abrila en Safari',
    intro: 'Estás en el navegador de otra app, y desde acá no se puede instalar.',
    steps: [
      {
        Icon: Ellipsis,
        text: (
          <>
            Tocá <strong>···</strong> o el ícono de compartir de esta pantalla y elegí{' '}
            <strong>Abrir en Safari</strong>. Si no está, copiá el link y pegalo en Safari.
          </>
        ),
      },
      {
        Icon: Share,
        text: (
          <>
            En Safari, tocá <strong>Compartir</strong> y después{' '}
            <strong>Agregar a inicio</strong>.
          </>
        ),
      },
    ],
  },
};

/** La guía para instalarla en iPhone y iPad, donde no hay botón que lo haga solo. */
export function InstallSheet({
  platform,
  isOpen,
  onClose,
}: {
  platform: GuidePlatform;
  isOpen: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const doneRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  const guide = GUIDES[platform];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      showToast('Copiamos el link: pegalo en Safari.');
    } catch {
      showToast('No pudimos copiar el link. Abrí Safari y entrá a esta misma dirección.', 'error');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={doneRef}
      className="z-[80] flex items-end sm:items-center justify-center p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="surface w-full max-w-md shadow-pop p-6 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {/* El mismo ícono que va a quedar en la pantalla de inicio: es lo que
              después va a buscar para abrirla. */}
          <img
            src="/pwa-192x192.png"
            alt=""
            width={56}
            height={56}
            className="w-14 h-14 rounded-control shrink-0"
          />
          <div className="min-w-0">
            <h2 id={titleId} className="text-section">
              {guide.title}
            </h2>
            <p className="text-sm text-text-muted">{guide.intro}</p>
          </div>
        </div>

        <ol className="flex flex-col gap-3">
          {guide.steps.map(({ Icon, text }, index) => (
            <li key={index} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="w-9 h-9 shrink-0 rounded-control border border-border-card bg-bg-main text-accent flex items-center justify-center"
              >
                {/* El primer paso late para que el ojo arranque ahí; quieto si
                    el sistema pide menos movimiento. */}
                <Icon size={18} className={index === 0 ? 'motion-safe:animate-pulse' : undefined} />
              </span>
              <p className="text-sm leading-relaxed pt-1.5">
                <span className="sr-only">Paso {index + 1}: </span>
                {text}
              </p>
            </li>
          ))}
        </ol>

        <p className="text-xs text-text-subtle">
          Instalada abre sin la barra del navegador, anda sin conexión y, en iPhone, es la única
          forma de recibir los avisos de episodios.
        </p>

        <div className="flex flex-col gap-2">
          {platform === 'ios-in-app' && (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="btn btn-secondary w-full py-3"
            >
              <Copy size={16} aria-hidden="true" />
              Copiar link
            </button>
          )}
          <button ref={doneRef} type="button" onClick={onClose} className="btn btn-primary w-full py-3">
            Entendido
          </button>
        </div>
      </div>
    </Dialog>
  );
}
