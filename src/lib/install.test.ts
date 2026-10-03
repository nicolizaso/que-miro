import { describe, expect, it } from 'vitest';
import {
  INSTALL_CARD_SNOOZE_DAYS,
  InstallEnvironment,
  canOfferInstall,
  installPlatform,
  iosBrowser,
  isIOSDevice,
  showsInstallCard,
} from './install';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; es_AR)',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

function env(overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return {
    isStandalone: false,
    isIOS: false,
    isMobile: false,
    userAgent: UA.desktop,
    hasPrompt: false,
    ...overrides,
  };
}

const ios = (userAgent: string) => env({ isIOS: true, isMobile: true, userAgent });

describe('isIOSDevice', () => {
  it('reconoce el iPhone y el iPad que se hace pasar por Mac', () => {
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIOSDevice('Mozilla/5.0 (Linux; Android 15)', 5)).toBe(false);
  });
});

describe('iosBrowser', () => {
  it('distingue Safari de los otros navegadores', () => {
    expect(iosBrowser(UA.iphoneSafari)).toBe('safari');
    expect(iosBrowser(UA.iphoneChrome)).toBe('browser');
    expect(iosBrowser(UA.iphoneFirefox)).toBe('browser');
  });

  it('reconoce el navegador de una app, también el que no se anuncia', () => {
    expect(iosBrowser(UA.iphoneInstagram)).toBe('in-app');
    expect(iosBrowser(UA.iphoneFacebook)).toBe('in-app');
    expect(iosBrowser(UA.iphoneWebView)).toBe('in-app');
  });
});

describe('installPlatform', () => {
  it('abierta como app no ofrece nada, aunque haya evento', () => {
    expect(installPlatform(env({ isStandalone: true, hasPrompt: true }))).toBe('installed');
    expect(installPlatform({ ...ios(UA.iphoneSafari), isStandalone: true })).toBe('installed');
  });

  it('con el evento del navegador, el botón instala directo', () => {
    expect(installPlatform(env({ isMobile: true, userAgent: UA.android, hasPrompt: true }))).toBe(
      'prompt',
    );
    expect(installPlatform(env({ hasPrompt: true }))).toBe('prompt');
  });

  it('en iOS elige los pasos según el navegador', () => {
    expect(installPlatform(ios(UA.iphoneSafari))).toBe('ios-safari');
    expect(installPlatform(ios(UA.iphoneChrome))).toBe('ios-browser');
    expect(installPlatform(ios(UA.iphoneInstagram))).toBe('ios-in-app');
  });

  it('sin evento y fuera de iOS no hay nada que ofrecer', () => {
    expect(installPlatform(env())).toBe('unavailable');
    expect(installPlatform(env({ isMobile: true, userAgent: UA.android }))).toBe('unavailable');
  });

  it('canOfferInstall deja afuera lo instalado y lo imposible', () => {
    expect(canOfferInstall('installed')).toBe(false);
    expect(canOfferInstall('unavailable')).toBe(false);
    expect(canOfferInstall('prompt')).toBe(true);
    expect(canOfferInstall('ios-in-app')).toBe(true);
  });
});

describe('showsInstallCard', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it('va en el celular si nunca se cerró', () => {
    expect(
      showsInstallCard({ platform: 'ios-safari', isMobile: true, dismissedAt: null, now }),
    ).toBe(true);
    expect(showsInstallCard({ platform: 'prompt', isMobile: true, dismissedAt: null, now })).toBe(
      true,
    );
  });

  it('no va en la compu ni donde no hay nada que ofrecer', () => {
    expect(showsInstallCard({ platform: 'prompt', isMobile: false, dismissedAt: null, now })).toBe(
      false,
    );
    expect(
      showsInstallCard({ platform: 'installed', isMobile: true, dismissedAt: null, now }),
    ).toBe(false);
    expect(
      showsInstallCard({ platform: 'unavailable', isMobile: true, dismissedAt: null, now }),
    ).toBe(false);
  });

  it('un "Ahora no" la calla un mes, y después vuelve', () => {
    const base = { platform: 'ios-safari' as const, isMobile: true, now };
    expect(showsInstallCard({ ...base, dismissedAt: daysAgo(1) })).toBe(false);
    expect(showsInstallCard({ ...base, dismissedAt: daysAgo(INSTALL_CARD_SNOOZE_DAYS - 1) })).toBe(
      false,
    );
    expect(showsInstallCard({ ...base, dismissedAt: daysAgo(INSTALL_CARD_SNOOZE_DAYS) })).toBe(
      true,
    );
  });

  it('una fecha rota no la calla', () => {
    expect(
      showsInstallCard({ platform: 'ios-safari', isMobile: true, dismissedAt: 'ayer', now }),
    ).toBe(true);
  });
});
