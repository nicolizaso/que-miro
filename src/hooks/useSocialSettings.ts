import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { SocialSettings, SocialSharing } from '@/types';
import { socialSettingsToDocument } from '@/lib/social';

/** Dónde vive: al lado de las metas y las plataformas. */
export function socialSettingsPath(uid: string): string {
  return `users/${uid}/profile/social`;
}

/**
 * Qué compartís, a quién silenciaste y hasta dónde leíste las
 * notificaciones. Como las metas: va al store al toque y a Firestore sin
 * esperar, así sin conexión queda encolado y la pantalla ya cambió.
 */
export function useSocialSettings() {
  const settings = useMediaStore((state) => state.socialSettings);
  const { user, authState } = useAuth();
  const { showToast } = useToast();
  const uid = isFirebaseConfigured && authState === 'authenticated' && user ? user.uid : null;

  const persist = (change: Partial<SocialSettings>, { quiet = false } = {}) => {
    const next: SocialSettings = {
      ...useMediaStore.getState().socialSettings,
      ...change,
      updatedAt: new Date().toISOString(),
    };
    useMediaStore.getState().setSocialSettings(next);
    if (!uid) return;
    setDoc(doc(db, socialSettingsPath(uid)), socialSettingsToDocument(next)).catch((error: unknown) => {
      console.error('[social] No se pudo guardar la configuración:', error);
      if (!quiet) showToast('No pudimos guardar el cambio. Intentá de nuevo.', 'error');
    });
  };

  const setSharing = (key: keyof SocialSharing, value: boolean) =>
    persist({ sharing: { ...useMediaStore.getState().socialSettings.sharing, [key]: value } });

  const setPaused = (paused: boolean) => persist({ paused });

  const mute = (targetUid: string) => {
    const muted = useMediaStore.getState().socialSettings.muted;
    if (!muted.includes(targetUid)) persist({ muted: [...muted, targetUid] });
  };

  const unmute = (targetUid: string) =>
    persist({ muted: useMediaStore.getState().socialSettings.muted.filter((muted) => muted !== targetUid) });

  /** Abriste las notificaciones: lo de hasta ahora deja de contar como nuevo. */
  const markInboxSeen = () => persist({ inboxSeenAt: new Date().toISOString() }, { quiet: true });

  /** Reemplaza todo: lo usa la importación de un backup. */
  const replaceSettings = (incoming: SocialSettings) => persist({ ...incoming });

  return { settings, setSharing, setPaused, mute, unmute, markInboxSeen, replaceSettings };
}
