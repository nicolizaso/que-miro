import { useMemo } from 'react';
import { create } from 'zustand';
import { currentInstallEnvironment, installPlatform } from '@/lib/install';

/** El evento de Chrome y Android. No está en los tipos del DOM porque no es estándar. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** El evento guardado, listo para mostrar el cartel del navegador. */
  deferred: BeforeInstallPromptEvent | null;
  /** Se instaló en esta visita: la pestaña sigue abierta, pero ya no hay nada que ofrecer. */
  installed: boolean;
}

const useInstallStore = create<InstallState>(() => ({ deferred: null, installed: false }));

/**
 * Escucha los eventos de instalación.
 *
 * Se llama desde `main.tsx`, antes de montar React: Chrome puede disparar
 * `beforeinstallprompt` apenas carga la página, y si nadie lo escucha se
 * pierde hasta la próxima visita.
 */
export function listenForInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sin esto Chrome muestra su propia barrita abajo, que nadie entiende y
    // compite con la tarjeta de la app.
    event.preventDefault();
    useInstallStore.setState({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstallStore.setState({ deferred: null, installed: true });
  });
}

/** Qué se puede ofrecer acá, y el cartel del navegador cuando lo hay. */
export function useInstallPrompt() {
  const deferred = useInstallStore((state) => state.deferred);
  const installed = useInstallStore((state) => state.installed);
  const environment = useMemo(() => currentInstallEnvironment(deferred !== null), [deferred]);
  const platform = installed ? 'installed' : installPlatform(environment);

  /** Muestra el cartel del navegador. `true` si la instalaron. */
  const promptInstall = async (): Promise<boolean> => {
    if (!deferred) return false;
    // El evento sirve una sola vez: se suelta antes de esperar la respuesta
    // para que un segundo toque no intente usarlo de nuevo.
    useInstallStore.setState({ deferred: null });
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') useInstallStore.setState({ installed: true });
    return outcome === 'accepted';
  };

  return { platform, isMobile: environment.isMobile, promptInstall };
}
