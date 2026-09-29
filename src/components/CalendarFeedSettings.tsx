import { useState } from 'react';
import { CalendarPlus, Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { googleCalendarUrl, webcalUrl } from '@/lib/calendarFeed';

/**
 * "Tu calendario en la agenda": una dirección `.ics` para suscribirse desde
 * Google Calendar, Apple Calendar u Outlook.
 *
 * Necesita cuenta, porque lo que lee el servidor es una instantánea guardada
 * en Firestore; sin sesión, la sección no existe.
 */
export function CalendarFeedSettings() {
  const { available, isLoading, token, url, activate, regenerate, deactivate } = useCalendarFeed();
  const { showToast } = useToast();
  const [justCopied, setJustCopied] = useState(false);
  const [confirming, setConfirming] = useState<'regenerate' | 'deactivate' | null>(null);

  if (!available) return null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      showToast('Copiamos la dirección del calendario.');
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      showToast('No pudimos copiarla: seleccionala y copiala a mano.', 'error');
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Tu calendario en la agenda</h2>
        <p className="text-sm text-text-muted mt-1">
          Una dirección para suscribirte desde Google Calendar, Apple Calendar
          u Outlook: los próximos episodios de las series que seguís aparecen
          solos en tu agenda, como eventos de todo el día.
        </p>
      </div>

      <div className="surface p-4 flex flex-col gap-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-text-subtle">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : !token || !url ? (
          <button type="button" onClick={activate} className="btn btn-primary self-start px-4 py-2.5 text-sm">
            <CalendarPlus size={16} aria-hidden="true" />
            Crear la dirección del calendario
          </button>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="calendar-feed-url" className="text-sm font-medium">
                Dirección del calendario
              </label>
              <div className="flex gap-2">
                <input
                  id="calendar-feed-url"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-control border border-border-card bg-bg-main px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="btn btn-secondary shrink-0 px-3 py-2 text-sm"
                >
                  {justCopied ? (
                    <Check size={16} className="text-status-completada" aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  Copiar
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={googleCalendarUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary flex-1 px-4 py-2.5 text-sm"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Agregar a Google Calendar
              </a>
              <a href={webcalUrl(url)} className="btn btn-secondary flex-1 px-4 py-2.5 text-sm">
                <CalendarPlus size={16} aria-hidden="true" />
                Abrir en Apple Calendar u Outlook
              </a>
            </div>

            <p className="text-xs text-text-subtle">
              Quien tenga esta dirección ve tus próximos episodios, y nada más.
              Si la compartiste de más, generá una nueva: la anterior deja de
              andar. Google Calendar tarda unas horas en traer los cambios.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={() => setConfirming('regenerate')}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-main transition-colors"
              >
                <RefreshCw size={14} aria-hidden="true" />
                Generar una dirección nueva
              </button>
              <button
                type="button"
                onClick={() => setConfirming('deactivate')}
                className="text-text-muted hover:text-accent transition-colors"
              >
                Desactivar
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirming === 'regenerate'}
        title="Generar una dirección nueva"
        confirmLabel="Generar"
        onConfirm={() => {
          regenerate();
          setConfirming(null);
          showToast('Listo: la dirección anterior dejó de andar.');
        }}
        onClose={() => setConfirming(null)}
        description={
          <p>
            La dirección que usás ahora deja de andar, en todos los calendarios
            donde la agregaste. Después vas a tener que suscribirte con la
            nueva.
          </p>
        }
      />
      <ConfirmDialog
        isOpen={confirming === 'deactivate'}
        title="Desactivar el calendario"
        confirmLabel="Desactivar"
        destructive
        onConfirm={() => {
          deactivate();
          setConfirming(null);
          showToast('Desactivamos el calendario.');
        }}
        onClose={() => setConfirming(null)}
        description={
          <p>
            La dirección deja de andar y los calendarios donde la agregaste se
            quedan sin estos eventos. Podés crear una nueva cuando quieras.
          </p>
        }
      />
    </section>
  );
}
