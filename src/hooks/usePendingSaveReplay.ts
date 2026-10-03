import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { STATUS_LABELS } from '@/lib/archive';
import { clearPendingSave, readPendingSave, replayStep } from '@/lib/pendingSave';

/**
 * Retoma el guardado que llevó a la persona a entrar a su cuenta.
 *
 * Espera a que la cuenta haya bajado del servidor (`syncedUid`), no solo a que
 * haya sesión: antes de eso no se sabe si la cuenta ya tenía el título, y la
 * primera bajada pisaría lo que se escribiera en el medio. Para entonces
 * `SyncManager` ya subió lo que había guardado sin cuenta, así que esto es lo
 * último que falta.
 */
export function usePendingSaveReplay() {
  const { user, authState } = useAuth();
  const syncedUid = useMediaStore((state) => state.syncedUid);
  const { addMedia, updateStatus } = useMediaActions();
  const { showToast } = useToast();

  const ready = authState === 'authenticated' && !!user && syncedUid === user.uid;

  useEffect(() => {
    if (!ready) return;
    const pending = readPendingSave();
    if (!pending) return;
    // Se consume antes de escribir: un segundo render no lo vuelve a aplicar.
    clearPendingSave();

    const { draft } = pending;
    const existing = useMediaStore
      .getState()
      .mediaList.find((media) => media.tmdbId === draft.tmdbId);
    const step = replayStep(draft, existing);

    if (step.kind === 'add') void addMedia(draft);
    if (step.kind === 'status') void updateStatus(draft.tmdbId, step.status);
    showToast(`Listo: "${draft.title}" quedó en ${STATUS_LABELS[draft.status]}.`);
    // Las acciones cambian de identidad en cada render; lo que dispara esto es
    // que la cuenta esté lista, una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
