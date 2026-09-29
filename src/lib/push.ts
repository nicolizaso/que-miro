import { SavedMedia } from '@/types';

/**
 * Avisos de episodios nuevos: lo que decide el cliente.
 *
 * El servidor no sabe qué vio nadie. Lo único que se le publica es una
 * instantánea en `push_subscriptions/{uid}` con los tokens de cada
 * dispositivo, la región, el idioma y los ids de las series con aviso: ni
 * estados, ni puntajes, ni el resto de la biblioteca (ver
 * `api/cron/notify.ts`).
 */

/** Dónde vive la instantánea de una cuenta. */
export function pushPath(uid: string): string {
  return `push_subscriptions/${uid}`;
}

/** Cuántos dispositivos por cuenta: un tope para que la lista no crezca sin fin. */
export const MAX_TOKENS = 10;

export type PushSupport =
  /** El deploy no tiene Firebase o la clave VAPID: no se ofrece nada. */
  | 'unconfigured'
  /** El navegador no sabe recibir avisos. */
  | 'unsupported'
  /** iPhone o iPad con la app abierta en Safari: hay que instalarla primero. */
  | 'install-first'
  | 'supported';

export interface PushEnvironment {
  isConfigured: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  /** Abierta desde la pantalla de inicio, como app instalada. */
  isStandalone: boolean;
}

/**
 * Qué se le puede ofrecer a este dispositivo.
 *
 * En iOS los avisos web existen solo para la PWA instalada en la pantalla de
 * inicio: en Safari no aparece `PushManager`. Ahí no se muestra un botón que
 * no puede funcionar, se explica cómo instalarla.
 */
export function pushSupport(env: PushEnvironment): PushSupport {
  if (!env.isConfigured) return 'unconfigured';
  if (env.isIOS && !env.isStandalone) return 'install-first';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return 'unsupported';
  }
  return 'supported';
}

/**
 * Si es un iPhone o un iPad. El iPad de ahora se presenta como Mac, así que
 * además se mira que tenga pantalla táctil.
 */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** El entorno real, leído del navegador. */
export function currentPushEnvironment(isConfigured: boolean): PushEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isConfigured,
      hasServiceWorker: false,
      hasPushManager: false,
      hasNotification: false,
      isIOS: false,
      isStandalone: false,
    };
  }
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    isConfigured,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIOS: isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    isStandalone: standalone,
  };
}

/** Tope de series con aviso: el mismo que ponen las reglas de Firestore. */
export const MAX_SERIES = 1000;

/**
 * Las series con aviso, ordenadas: es lo único de la biblioteca que se
 * publica. Lo abandonado no avisa aunque tenga la marca.
 */
export function alertSeries(list: SavedMedia[]): number[] {
  return list
    .filter(
      (media) => media.mediaType === 'tv' && media.notify === true && media.status !== 'abandonada',
    )
    .map((media) => media.tmdbId)
    .sort((a, b) => a - b)
    .slice(0, MAX_SERIES);
}

/**
 * Si tiene sentido ofrecer el aviso para una serie. Una terminada o
 * cancelada, sin nada anunciado, no va a sacar otro episodio; una abandonada
 * no avisa aunque saliera.
 */
export function canAlert(media: SavedMedia): boolean {
  if (media.mediaType !== 'tv' || media.status === 'abandonada') return false;
  const finished =
    (media.seriesStatus === 'Ended' || media.seriesStatus === 'Canceled') && !media.nextToAir;
  return !finished;
}

/**
 * Las series que se ofrecen en Ajustes para prender o apagar el aviso: las
 * que se están viendo y las que ya lo tienen. Lo demás se elige desde la
 * ficha: una lista con toda la biblioteca no ayuda a elegir.
 */
export function alertCandidates(list: SavedMedia[]): SavedMedia[] {
  return list
    .filter(
      (media) =>
        media.mediaType === 'tv' &&
        media.status !== 'abandonada' &&
        (media.notify === true || (media.status === 'viendo' && canAlert(media))),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

/** La instantánea tal como está en Firestore. */
export interface PushSnapshot {
  tokens: string[];
  series: number[];
  region: string;
  language: string;
  updatedAt: string;
}

export function parsePushSnapshot(value: unknown): PushSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string' && !!item) : [];
  return {
    tokens: strings(raw.tokens).slice(0, MAX_TOKENS),
    series: (Array.isArray(raw.series) ? raw.series : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
    region: typeof raw.region === 'string' ? raw.region : '',
    language: typeof raw.language === 'string' ? raw.language : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Si la instantánea quedó vieja: cambió qué series tienen aviso, o el país o
 * el idioma de los textos. Se compara antes de escribir para no reescribir el
 * documento en cada visita.
 */
export function snapshotIsStale(
  snapshot: PushSnapshot,
  wanted: { series: number[]; region: string; language: string },
): boolean {
  return (
    snapshot.region !== wanted.region ||
    snapshot.language !== wanted.language ||
    snapshot.series.length !== wanted.series.length ||
    snapshot.series.some((id, index) => id !== wanted.series[index])
  );
}

/** Los tokens con uno más, sin repetir y con tope: el más viejo se cae. */
export function withToken(tokens: string[], token: string): string[] {
  return [...tokens.filter((current) => current !== token), token].slice(-MAX_TOKENS);
}

export function withoutToken(tokens: string[], token: string): string[] {
  return tokens.filter((current) => current !== token);
}

/** El dispositivo anotado en las preferencias (ver `pushDevice`). */
export interface PushDeviceRecord {
  token: string;
  uid: string;
}

/**
 * Qué hacer con el token de este dispositivo al abrir la app.
 *
 * - `other-account`: es de otra cuenta que no lo sacó al salir. Se anula acá;
 *   de su documento lo borra el cron la próxima vez que FCM lo rechace.
 * - `revoked`: se quitó el permiso desde el navegador. Se saca de la cuenta:
 *   mandarle avisos a un dispositivo que no los muestra es gastar.
 * - `refresh`: se vuelve a pedir, porque FCM los renueva cada tanto y el
 *   viejo deja de andar.
 */
export type DeviceCheck = 'none' | 'other-account' | 'revoked' | 'refresh';

export function deviceCheck(
  device: PushDeviceRecord | null,
  uid: string,
  permission: NotificationPermission | 'unsupported',
): DeviceCheck {
  if (!device) return 'none';
  if (device.uid !== uid) return 'other-account';
  if (permission !== 'granted') return 'revoked';
  return 'refresh';
}
