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

interface PreferencesState {
  theme: ThemePreference;
  /** País cuyo catálogo de plataformas se muestra en la ficha del título. */
  region: RegionCode;
  setTheme: (theme: ThemePreference) => void;
  setRegion: (region: RegionCode) => void;
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
      setTheme: (theme) => set({ theme }),
      setRegion: (region) => set({ region }),
    }),
    { name: 'que-miro-preferences' },
  ),
);
