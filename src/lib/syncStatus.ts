import { create } from 'zustand';

/**
 * Por qué no está llegando nada al servidor.
 *
 * - `missing-database`: el proyecto de Firebase no tiene la base de Firestore
 *   que la app pide. No se arregla solo ni esperando: hay que crearla.
 * - `permission-denied`: la base existe pero sus reglas rechazan a esta
 *   cuenta. Tampoco se arregla solo: hay que publicar las reglas.
 * - `unreachable`: el servidor no responde (red, corte). Se reintenta solo,
 *   así que alcanza con avisar.
 */
export type SyncIssue = 'missing-database' | 'permission-denied' | 'unreachable';

interface SyncStatusState {
  issue: SyncIssue | null;
  setIssue: (issue: SyncIssue | null) => void;
}

/**
 * Estado de la sincronización con Firestore.
 *
 * Vive fuera de React porque quien detecta el problema es el listener de
 * Firestore y quien lo muestra es un cartel en el marco de la app, que no es
 * su hijo. No se persiste: al recargar, el propio listener vuelve a decir si
 * el problema sigue.
 */
export const useSyncStatus = create<SyncStatusState>((set) => ({
  issue: null,
  setIssue: (issue) => set({ issue }),
}));
