/**
 * El guardado que quedó esperando a que la persona entre a su cuenta.
 *
 * Sin cuenta se explora igual, pero al guardar el primer título se le sugiere
 * entrar: si acepta, lo que quiso guardar se aparta acá, viaja por el login y
 * se aplica recién cuando la cuenta terminó de bajar. Aplicarlo antes —o
 * guardarlo local y dejar que lo suba la migración— perdería el gesto: la
 * migración no pisa un título que la cuenta ya tenía, y la persona acaba de
 * decir en qué lista lo quiere.
 *
 * Vive en `sessionStorage` y no en las preferencias del dispositivo: es de
 * esta visita. Quien vuelve mañana no tiene por qué encontrarse con un
 * guardado que dejó a medias, ni con el "seguí sin cuenta" de ayer.
 */
import { MediaStatus, SavedMedia } from '@/types';
import { parseMedia } from '@/lib/schema';
import { FICHA_PARAM } from '@/lib/deepLink';

export type MediaDraft = Omit<SavedMedia, 'updatedAt'>;

export interface PendingSave {
  draft: MediaDraft;
  /** Adónde vuelve la persona después de entrar. */
  returnTo: string;
}

export const PENDING_SAVE_KEY = 'que-miro-pending-save';
export const GUEST_CHOICE_KEY = 'que-miro-guest-choice';

/**
 * Cuánto vale un guardado pendiente.
 *
 * Holgado a propósito: cubre crear la cuenta, confirmar el mail en otra
 * pestaña y una primera bajada lenta. Lo que corta es el caso raro de alguien
 * que abandonó el login y entra mucho después por otro camino: ahí ya no es
 * lo que estaba haciendo.
 */
export const PENDING_SAVE_TTL_MS = 60 * 60 * 1000;

type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `sessionStorage`, si se puede usar.
 *
 * En una ventana privada o con los datos del sitio bloqueados, tocarlo tira:
 * ahí la app tiene que seguir andando, solo que sin recordar la elección.
 */
function session(): SessionLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function safely<T>(fallback: T, action: (storage: SessionLike) => T, storage = session()): T {
  if (!storage) return fallback;
  try {
    return action(storage);
  } catch {
    return fallback;
  }
}

/**
 * Si al guardar un título nuevo hay que sugerir entrar a la cuenta.
 *
 * Solo a un invitado de una instalación con cuentas, y una vez por visita: si
 * ya dijo que sigue sin cuenta, insistir en cada título lo empuja a irse.
 */
export function shouldPromptSignIn({
  authState,
  isFirebaseConfigured,
  choseGuest,
}: {
  authState: string;
  isFirebaseConfigured: boolean;
  choseGuest: boolean;
}): boolean {
  return isFirebaseConfigured && authState === 'guest' && !choseGuest;
}

export function hasChosenGuest(storage?: SessionLike | null): boolean {
  return safely(false, (s) => s.getItem(GUEST_CHOICE_KEY) === 'true', storage ?? session());
}

/** Dijo que sigue sin cuenta: no se le vuelve a preguntar en esta visita. */
export function chooseGuest(storage?: SessionLike | null): void {
  safely(undefined, (s) => s.setItem(GUEST_CHOICE_KEY, 'true'), storage ?? session());
}

/**
 * Adónde volver después de entrar: la misma página, con la ficha del título
 * abierta encima para que se vea que quedó guardado.
 *
 * Las listas compartidas no llevan la ficha: viven fuera del marco de la app,
 * que es el que sabe abrirla, y ahí el título ya se ve marcado en la lista.
 * El resto de la query se conserva: son los filtros con los que estaba
 * explorando.
 */
export function returnPathFor(
  pathname: string,
  search: string,
  draft: Pick<MediaDraft, 'mediaType' | 'tmdbId'>,
): string {
  if (pathname.startsWith('/l/')) return `${pathname}${search}`;
  const params = new URLSearchParams(search);
  params.set(FICHA_PARAM, `${draft.mediaType}:${draft.tmdbId}`);
  return `${pathname}?${params.toString()}`;
}

export function savePendingSave(
  pending: PendingSave,
  now = Date.now(),
  storage?: SessionLike | null,
): void {
  safely(
    undefined,
    (s) => s.setItem(PENDING_SAVE_KEY, JSON.stringify({ ...pending, savedAt: now })),
    storage ?? session(),
  );
}

export function clearPendingSave(storage?: SessionLike | null): void {
  safely(undefined, (s) => s.removeItem(PENDING_SAVE_KEY), storage ?? session());
}

/**
 * Lee el guardado pendiente, si hay uno vigente.
 *
 * El borrador pasa por `parseMedia` como cualquier otra cosa que entra a la
 * biblioteca: `sessionStorage` se puede editar a mano igual que
 * `localStorage`. Solo se aceptan rutas internas, para que nadie arme un link
 * que después del login mande a otro sitio.
 */
export function readPendingSave(now = Date.now(), storage?: SessionLike | null): PendingSave | null {
  const raw = safely<string | null>(null, (s) => s.getItem(PENDING_SAVE_KEY), storage ?? session());
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { draft, returnTo, savedAt } = value as Record<string, unknown>;

  if (typeof savedAt !== 'number' || now - savedAt > PENDING_SAVE_TTL_MS || savedAt > now) return null;
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) return null;

  const media = parseMedia(draft);
  if (!media) return null;
  const { updatedAt: _updatedAt, ...parsed } = media;
  return { draft: parsed, returnTo };
}

export type ReplayStep =
  | { kind: 'add' }
  | { kind: 'status'; status: MediaStatus }
  | { kind: 'none' };

/**
 * Qué hacer con el guardado pendiente contra la biblioteca de la cuenta.
 *
 * Si la cuenta ya tenía el título, agregarlo de nuevo lo escribiría de cero y
 * se llevaría puestas sus reseñas y su progreso: solo se lo cambia de lista,
 * que es lo que la persona pidió.
 */
export function replayStep(draft: MediaDraft, existing: SavedMedia | undefined): ReplayStep {
  if (!existing) return { kind: 'add' };
  if (existing.status === draft.status) return { kind: 'none' };
  return { kind: 'status', status: draft.status };
}
