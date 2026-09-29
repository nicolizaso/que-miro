import { useMemo, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useMediaStore } from '@/store';
import { usePush } from '@/hooks/usePush';
import { alertCandidates } from '@/lib/push';
import { INSTALL_FIRST_HINT, NotifyChip } from '@/components/NotifyToggle';

/**
 * "Avisos de episodios", en Ajustes: activarlos en este dispositivo y elegir
 * de qué series.
 *
 * La lista ofrece lo que se está viendo y lo que ya tiene aviso; el resto se
 * prende desde la ficha de cada serie. Sin cuenta, o en un navegador que no
 * puede recibirlos, la sección no existe.
 */
export function NotificationsSettings() {
  const { available, support, permission, enabledHere, busy, enable, disable, toggleSeries } =
    usePush();
  const mediaList = useMediaStore((state) => state.mediaList);
  const candidates = useMemo(() => alertCandidates(mediaList), [mediaList]);
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (!available || support === 'unconfigured' || support === 'unsupported') return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Avisos de episodios</h2>
        <p className="text-sm text-text-muted mt-1">
          El día que sale un episodio de una serie con aviso, te llega una
          notificación: una por día, aunque salgan varias. El aviso de cada
          serie se prende desde su ficha.
        </p>
      </div>

      {support === 'install-first' ? (
        <p className="text-sm text-text-muted">{INSTALL_FIRST_HINT}</p>
      ) : permission === 'denied' ? (
        <p className="text-sm text-text-muted">
          Los avisos están bloqueados para Qué Miro? en este navegador. Se
          habilitan desde la configuración del sitio —el candado al lado de la
          dirección— y después se activan acá.
        </p>
      ) : enabledHere ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Este dispositivo recibe avisos.</p>
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="btn btn-secondary px-4 py-2 text-sm"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <BellOff size={16} aria-hidden="true" />
            )}
            Dejar de avisar acá
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="btn btn-primary self-start px-4 py-2 text-sm"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Bell size={16} aria-hidden="true" />
          )}
          Avisame de episodios nuevos
        </button>
      )}

      {/* Las series son de la cuenta y valen para todos los dispositivos
          con avisos. La lista va solo donde se pueden activar: prender una
          en un dispositivo que todavía no los recibe los activa acá también. */}
      {support === 'supported' && permission !== 'denied' && candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-eyebrow">Elegí de cuáles</h3>
          <ul className="flex flex-wrap gap-2">
            {candidates.map((media) => (
              <li key={media.tmdbId}>
                <NotifyChip
                  media={media}
                  label={media.title}
                  pending={busy && pendingId === media.tmdbId}
                  disabled={busy}
                  onToggle={(target) => {
                    setPendingId(target.tmdbId);
                    void toggleSeries(target);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
