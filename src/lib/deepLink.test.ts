import { describe, expect, it } from 'vitest';
import { fichaUrl, parseFicha } from './deepLink';

describe('el enlace a una ficha', () => {
  it('va y vuelve', () => {
    const url = fichaUrl('tv', 1396);
    expect(url).toBe('/?ficha=tv:1396');
    expect(parseFicha(new URL(url, 'https://x.app').searchParams.get('ficha'))).toEqual({
      mediaType: 'tv',
      tmdbId: 1396,
    });
  });

  it('ignora lo que no tiene la forma exacta', () => {
    for (const value of [null, '', 'tv', 'tv:', 'person:1', 'tv:0', 'tv:12a', 'tv:1396;x']) {
      expect(parseFicha(value)).toBeNull();
    }
  });
});
