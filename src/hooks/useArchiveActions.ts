import { SavedMedia } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';

/**
 * Pausar, abandonar y retomar, cada uno con su aviso y su "Deshacer".
 *
 * Los tres mueven el título de lugar —a *Archivadas* o de vuelta a *Viendo*—, y
 * un título que desaparece de la pantalla sin explicación parece un error. El
 * aviso dice adónde fue, y deshacer lo devuelve tal cual estaba: estado,
 * archivo, historial y aviso de episodios nuevos.
 */
export function useArchiveActions() {
  const { archiveMedia, resumeMedia, patchMedia } = useMediaActions();
  const { showToast } = useToast();

  const undo = (media: SavedMedia) => ({
    label: 'Deshacer',
    onAction: () =>
      void patchMedia(media.tmdbId, {
        status: media.status,
        archive: media.archive,
        history: media.history,
        newEpisodesSince: media.newEpisodesSince,
      }),
  });

  const pause = (media: SavedMedia) => {
    void archiveMedia(media, 'en_pausa');
    showToast(`"${media.title}" quedó en pausa. Está en Archivadas.`, 'success', {
      action: undo(media),
    });
  };

  const abandon = (media: SavedMedia, options: { reason?: string; rating?: number }) => {
    void archiveMedia(media, 'abandonada', options);
    showToast(`Abandonaste "${media.title}". Queda en Archivadas.`, 'success', {
      action: undo(media),
    });
  };

  const resume = (media: SavedMedia) => {
    void resumeMedia(media);
    showToast(`"${media.title}" volvió a Viendo.`, 'success', { action: undo(media) });
  };

  return { pause, abandon, resume };
}
