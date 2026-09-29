import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Regiones ofrecidas para el catálogo de plataformas de streaming.
 *
 * Son códigos ISO 3166-1 alpha-2, que es lo que espera TMDB en
 * `watch/providers`. La lista está acotada a propósito: el catálogo de TMDB
 * cubre decenas de países, pero un desplegable de 90 opciones no ayuda a nadie.
 */
export const REGIONS = [
  { code: 'AR', name: 'Argentina' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'ES', name: 'España' },
  { code: 'MX', name: 'México' },
  { code: 'PE', name: 'Perú' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'UY', name: 'Uruguay' },
] as const;

export type RegionCode = (typeof REGIONS)[number]['code'];

const DEFAULT_REGION: RegionCode = 'AR';

/** Nombre legible de una región, o el código si no está en la lista. */
export function getRegionName(code: string): string {
  return REGIONS.find((region) => region.code === code)?.name ?? code;
}

/**
 * Detecta la región a partir del idioma del navegador (`es-AR` → `AR`).
 * Si no se puede deducir una región que ofrezcamos, cae en el default.
 */
export function detectRegion(): RegionCode {
  if (typeof navigator === 'undefined') return DEFAULT_REGION;

  for (const locale of navigator.languages ?? [navigator.language]) {
    const region = locale?.split('-')[1]?.toUpperCase();
    if (region && REGIONS.some((r) => r.code === region)) {
      return region as RegionCode;
    }
  }
  return DEFAULT_REGION;
}

/** Cuántas respuestas a "¿La ponés en pausa?" se recuerdan. */
const MAX_PAUSE_HINTS = 100;

interface PreferencesState {
  theme: ThemePreference;
  /** País cuyo catálogo de plataformas se muestra en la ficha del título. */
  region: RegionCode;
  /**
   * Las series a las que ya les dijiste que no a "¿La ponés en pausa?", con
   * cuándo. Es del dispositivo como el resto de acá: es un cartel que se
   * calla, no un dato de tu biblioteca.
   */
  pauseHintsDismissed: Record<string, string>;
  setTheme: (theme: ThemePreference) => void;
  setRegion: (region: RegionCode) => void;
  dismissPauseHint: (tmdbId: number) => void;
}

/**
 * Preferencias de la persona que usa la app, separadas de su biblioteca.
 *
 * Viven solo en el dispositivo: no se sincronizan con Firestore ni se van en el
 * export. Son ajustes de "cómo veo la app acá", no datos de la cuenta.
 */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      region: detectRegion(),
      pauseHintsDismissed: {},
      setTheme: (theme) => set({ theme }),
      setRegion: (region) => set({ region }),
      dismissPauseHint: (tmdbId) =>
        set((state) => {
          // Se queda con las más recientes: una respuesta de hace un año ya no
          // calla nada, porque la serie o se movió o se terminó.
          const all: Record<string, string> = {
            ...state.pauseHintsDismissed,
            [tmdbId]: new Date().toISOString(),
          };
          const entries = Object.entries(all)
            .sort((a, b) => b[1].localeCompare(a[1]))
            .slice(0, MAX_PAUSE_HINTS);
          return { pauseHintsDismissed: Object.fromEntries(entries) };
        }),
    }),
    { name: 'que-miro-preferences' },
  ),
);
