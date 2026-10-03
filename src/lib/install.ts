/**
 * Instalar la app en la pantalla de inicio: qué se le puede ofrecer a cada
 * dispositivo.
 *
 * Android y los Chrome de escritorio avisan que se puede instalar con
 * `beforeinstallprompt`, y desde ahí un botón instala de una. iOS no tiene
 * nada parecido: ningún navegador deja que la página dispare la instalación,
 * así que lo único que se puede hacer es mostrar exactamente qué tocar. Y
 * dentro del navegador de Instagram o WhatsApp ni eso: hay que salir a uno de
 * verdad.
 */

export type InstallPlatform =
  /** Ya está abierta como app: no hay nada que ofrecer. */
  | 'installed'
  /** El navegador sabe instalarla: el botón la instala directo. */
  | 'prompt'
  /** Safari en iPhone o iPad: Compartir → Agregar a inicio. */
  | 'ios-safari'
  /** Chrome, Firefox o Edge en iOS: lo mismo, con el Compartir en otro lado. */
  | 'ios-browser'
  /** El navegador de una app (Instagram, WhatsApp…): desde ahí no se puede. */
  | 'ios-in-app'
  /** Ni instala ni hay pasos que explicar: no se muestra nada. */
  | 'unavailable';

export interface InstallEnvironment {
  /** Abierta desde la pantalla de inicio, como app instalada. */
  isStandalone: boolean;
  isIOS: boolean;
  /** Teléfono o tablet: las tarjetas que la ofrecen son para el celular. */
  isMobile: boolean;
  userAgent: string;
  /** Llegó `beforeinstallprompt` y todavía se puede usar. */
  hasPrompt: boolean;
}

// Los otros navegadores de iOS se anuncian con su propia marca. Son WebKit
// igual que Safari, pero desde iOS 16.4 también agregan a inicio.
const IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//;

// Las apps que abren links adentro. La mayoría además omite el `Safari/` del
// final, que es lo que atrapa a las que no están en la lista.
const IN_APP = /FBAN|FBAV|Instagram|WhatsApp|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|BytedanceWebview|GSA\//;

/** Qué navegador de iOS es, a partir del user agent. */
export function iosBrowser(userAgent: string): 'safari' | 'browser' | 'in-app' {
  if (IN_APP.test(userAgent)) return 'in-app';
  if (IOS_BROWSERS.test(userAgent)) return 'browser';
  if (!/Safari\//.test(userAgent)) return 'in-app';
  return 'safari';
}

export function installPlatform(env: InstallEnvironment): InstallPlatform {
  if (env.isStandalone) return 'installed';
  // Primero el evento: si el navegador ofrece instalar, nada le gana a un
  // botón que lo hace solo.
  if (env.hasPrompt) return 'prompt';
  if (env.isIOS) {
    const browser = iosBrowser(env.userAgent);
    return browser === 'safari' ? 'ios-safari' : browser === 'in-app' ? 'ios-in-app' : 'ios-browser';
  }
  return 'unavailable';
}

/** Si en esta plataforma hay algo que ofrecer: un botón o pasos a seguir. */
export function canOfferInstall(platform: InstallPlatform): boolean {
  return platform !== 'installed' && platform !== 'unavailable';
}

/** Cuántos días se calla la tarjeta después de un "Ahora no". */
export const INSTALL_CARD_SNOOZE_DAYS = 30;

/**
 * Si va la tarjeta que ofrece instalarla.
 *
 * Solo en el celular: en la compu la app ya se usa cómoda en una pestaña, y
 * allá queda la opción en Ajustes. Un "Ahora no" la calla un mes, no para
 * siempre: el que la cerró el primer día puede querer instalarla cuando ya
 * la usa.
 */
export function showsInstallCard({
  platform,
  isMobile,
  dismissedAt,
  now,
}: {
  platform: InstallPlatform;
  isMobile: boolean;
  dismissedAt: string | null;
  now: Date;
}): boolean {
  if (!canOfferInstall(platform) || !isMobile) return false;
  if (!dismissedAt) return true;
  const elapsed = now.getTime() - new Date(dismissedAt).getTime();
  // Una fecha que no se entiende no calla nada.
  if (Number.isNaN(elapsed)) return true;
  return elapsed >= INSTALL_CARD_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Si es un iPhone o un iPad. El iPad de ahora se presenta como Mac, así que
 * además se mira que tenga pantalla táctil.
 */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Si está abierta como app instalada y no en una pestaña. */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** El entorno real, leído del navegador. */
export function currentInstallEnvironment(hasPrompt: boolean): InstallEnvironment {
  if (typeof navigator === 'undefined') {
    return { isStandalone: false, isIOS: false, isMobile: false, userAgent: '', hasPrompt };
  }
  const userAgent = navigator.userAgent;
  const isIOS = isIOSDevice(userAgent, navigator.maxTouchPoints ?? 0);
  return {
    isStandalone: isRunningStandalone(),
    isIOS,
    isMobile: isIOS || /Android|Mobi/.test(userAgent),
    userAgent,
    hasPrompt,
  };
}
