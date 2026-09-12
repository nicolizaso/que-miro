import { Collection, SavedMedia } from '@/types';
import { LibraryBackup, buildBackup, parseBackup } from '@/lib/backup';

/** Dónde queda la copia de rescate. Fuera del store, que se vacía al salir. */
const RESCUE_KEY = 'que-miro-rescate';

export interface RescueStash {
  savedAt: string;
  media: SavedMedia[];
  collections: Collection[];
}

/**
 * Copia de seguridad de una biblioteca que nunca llegó al servidor.
 *
 * Cerrar sesión vacía la biblioteca del dispositivo, y está bien: la de la
 * cuenta anterior no tiene por qué quedar a la vista de quien entre después.
 * El problema es cuando esa copia local era la *única* —porque Firestore
 * estuvo rechazando las escrituras, o porque nunca hubo red—: ahí salir borra
 * lo único que había.
 *
 * Así que antes de vaciar se guarda esto: no se muestra en ninguna lista, no
 * viaja a ninguna cuenta, y queda a mano para volver a importarlo desde
 * Ajustes. Es el mismo formato que el backup que se descarga, para que entre
 * por el mismo camino ya probado.
 */
export function saveRescue(media: SavedMedia[], collections: Collection[]) {
  if (media.length === 0) return;
  try {
    localStorage.setItem(
      RESCUE_KEY,
      JSON.stringify(buildBackup(media, collections)),
    );
  } catch (error) {
    // Sin espacio en localStorage no hay nada que hacer, pero tampoco puede
    // romper el cierre de sesión.
    console.warn('[rescate] No pudimos guardar la copia local:', error);
  }
}

/** Lee la copia de rescate, o `null` si no hay o si quedó ilegible. */
export function readRescue(): RescueStash | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RESCUE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const { media, collections } = parseBackup(raw);
    if (media.length === 0) return null;
    const savedAt = (JSON.parse(raw) as LibraryBackup).exportedAt;
    return { savedAt, media, collections };
  } catch {
    return null;
  }
}

export function clearRescue() {
  try {
    localStorage.removeItem(RESCUE_KEY);
  } catch {
    // Nada que hacer: si no se puede escribir, tampoco se pudo guardar.
  }
}
