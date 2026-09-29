import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  MAX_TOKENS,
  PushEnvironment,
  alertCandidates,
  alertSeries,
  canAlert,
  deviceCheck,
  isIOSDevice,
  parsePushSnapshot,
  pushPath,
  pushSupport,
  snapshotIsStale,
  withToken,
  withoutToken,
} from './push';

function series(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-09-01T00:00:00.000Z',
    seriesStatus: 'Returning Series',
    ...overrides,
  };
}

const DESKTOP: PushEnvironment = {
  isConfigured: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: false,
  isStandalone: false,
};

describe('pushSupport', () => {
  it('un navegador de escritorio con todo, puede', () => {
    expect(pushSupport(DESKTOP)).toBe('supported');
  });

  it('sin la clave VAPID no se ofrece nada', () => {
    expect(pushSupport({ ...DESKTOP, isConfigured: false })).toBe('unconfigured');
  });

  it('en iPhone, solo con la app instalada', () => {
    const safari = { ...DESKTOP, isIOS: true, hasPushManager: false };
    expect(pushSupport(safari)).toBe('install-first');
    expect(pushSupport({ ...safari, isStandalone: true, hasPushManager: true })).toBe('supported');
  });

  it('sin service worker o sin PushManager, no puede', () => {
    expect(pushSupport({ ...DESKTOP, hasServiceWorker: false })).toBe('unsupported');
    expect(pushSupport({ ...DESKTOP, hasPushManager: false })).toBe('unsupported');
  });
});

describe('isIOSDevice', () => {
  it('reconoce el iPhone y el iPad que se hace pasar por Mac', () => {
    expect(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIOSDevice('Mozilla/5.0 (Linux; Android 15)', 5)).toBe(false);
  });
});

describe('lo que se publica', () => {
  it('solo los ids de las series con aviso, ordenados', () => {
    expect(
      alertSeries([
        series({ tmdbId: 3, notify: true }),
        series({ tmdbId: 1, notify: true }),
        series({ tmdbId: 2, notify: false }),
        series({ tmdbId: 4 }),
        series({ tmdbId: 5, mediaType: 'movie', notify: true }),
      ]),
    ).toEqual([1, 3]);
  });

  it('lo abandonado no avisa aunque tenga la marca', () => {
    expect(alertSeries([series({ notify: true, status: 'abandonada' })])).toEqual([]);
  });

  it('la ruta es por cuenta y fuera de users/', () => {
    expect(pushPath('abc')).toBe('push_subscriptions/abc');
  });
});

describe('qué series se ofrecen', () => {
  it('una terminada sin nada anunciado no va a sacar otro episodio', () => {
    expect(canAlert(series({ seriesStatus: 'Ended' }))).toBe(false);
    expect(canAlert(series({ seriesStatus: 'Canceled' }))).toBe(false);
    expect(
      canAlert(
        series({
          seriesStatus: 'Ended',
          nextToAir: { seasonNumber: 3, episodeNumber: 1, airDate: '2026-10-01' },
        }),
      ),
    ).toBe(true);
    expect(canAlert(series())).toBe(true);
    expect(canAlert(series({ mediaType: 'movie' }))).toBe(false);
  });

  it('en Ajustes: lo que se está viendo y lo que ya tiene aviso', () => {
    const candidates = alertCandidates([
      series({ tmdbId: 1, title: 'Slow Horses', status: 'viendo' }),
      series({ tmdbId: 2, title: 'Andor', status: 'por_ver', notify: true }),
      series({ tmdbId: 3, title: 'The Bear', status: 'por_ver' }),
      series({ tmdbId: 4, title: 'Dark', status: 'viendo', seriesStatus: 'Ended' }),
      series({ tmdbId: 5, title: 'Lost', status: 'abandonada', notify: true }),
    ]);
    expect(candidates.map((media) => media.title)).toEqual(['Andor', 'Slow Horses']);
  });
});

describe('la instantánea', () => {
  it('se lee sin confiar en lo que haya', () => {
    expect(
      parsePushSnapshot({
        tokens: ['a', '', 3, 'b'],
        series: [2, '1', 'x', -4],
        region: 'AR',
        language: 'es-MX',
        updatedAt: '2026-09-29T00:00:00.000Z',
      }),
    ).toEqual({
      tokens: ['a', 'b'],
      series: [2, 1],
      region: 'AR',
      language: 'es-MX',
      updatedAt: '2026-09-29T00:00:00.000Z',
    });
    expect(parsePushSnapshot(null)).toBeNull();
  });

  it('está vieja si cambiaron las series, el país o el idioma', () => {
    const snapshot = {
      tokens: ['a'],
      series: [1, 3],
      region: 'AR',
      language: 'es-MX',
      updatedAt: '2026-09-29T00:00:00.000Z',
    };
    const wanted = { series: [1, 3], region: 'AR', language: 'es-MX' };

    expect(snapshotIsStale(snapshot, wanted)).toBe(false);
    expect(snapshotIsStale(snapshot, { ...wanted, series: [1] })).toBe(true);
    expect(snapshotIsStale(snapshot, { ...wanted, series: [1, 4] })).toBe(true);
    expect(snapshotIsStale(snapshot, { ...wanted, region: 'ES', language: 'es-ES' })).toBe(true);
  });
});

describe('los tokens', () => {
  it('uno nuevo va al final, sin repetirse', () => {
    expect(withToken(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(withToken(['a'], 'c')).toEqual(['a', 'c']);
    expect(withoutToken(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('con tope: el más viejo se cae', () => {
    const full = Array.from({ length: MAX_TOKENS }, (_, index) => `t${index}`);
    const next = withToken(full, 'nuevo');
    expect(next).toHaveLength(MAX_TOKENS);
    expect(next[0]).toBe('t1');
    expect(next.at(-1)).toBe('nuevo');
  });
});

describe('deviceCheck', () => {
  const device = { token: 'abc', uid: 'ana' };

  it('sin dispositivo anotado no hay nada que revisar', () => {
    expect(deviceCheck(null, 'ana', 'granted')).toBe('none');
  });

  it('un token de otra cuenta se anula', () => {
    expect(deviceCheck(device, 'beto', 'granted')).toBe('other-account');
  });

  it('sin permiso, se saca de la cuenta', () => {
    expect(deviceCheck(device, 'ana', 'denied')).toBe('revoked');
    expect(deviceCheck(device, 'ana', 'default')).toBe('revoked');
  });

  it('con permiso, se refresca', () => {
    expect(deviceCheck(device, 'ana', 'granted')).toBe('refresh');
  });
});
