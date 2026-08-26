import { useEffect } from 'react';
import { ThemePreference, usePreferences } from '@/preferences';

/** Color de la barra del navegador para cada tema, igual al `--qm-bg-main`. */
const THEME_COLORS = { light: '#faf8f5', dark: '#0b0d0e' } as const;

/**
 * Traduce la preferencia a un tema concreto. `system` consulta al sistema
 * operativo en el momento.
 */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Escribe el tema en el DOM.
 *
 * Con `system` se saca el atributo en vez de fijarlo: así el CSS puede seguir a
 * `prefers-color-scheme` por su cuenta y el tema cambia solo si la persona
 * cambia el del sistema mientras la app está abierta.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;

  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[resolveTheme(preference)]);
}

/**
 * Mantiene el DOM en sintonía con la preferencia guardada.
 *
 * El primer pintado ya lo resuelve el script inline de `index.html` — este hook
 * cubre los cambios posteriores, incluido el caso de tener elegido "sistema" y
 * que el sistema cambie de tema con la app abierta (hay que actualizar el
 * `theme-color`, que no se deduce del CSS).
 */
export function useApplyTheme(): void {
  const theme = usePreferences((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system' || !window.matchMedia) return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);
}
