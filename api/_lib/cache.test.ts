import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheHeaders, clearCache, withCache } from './cache';

describe('withCache', () => {
  afterEach(() => {
    clearCache();
    vi.useRealTimers();
  });

  it('calcula una sola vez mientras el TTL no venció', async () => {
    const compute = vi.fn().mockResolvedValue('resultado');

    expect(await withCache('k', 60, compute)).toBe('resultado');
    expect(await withCache('k', 60, compute)).toBe('resultado');

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('vuelve a calcular cuando venció el TTL', async () => {
    vi.useFakeTimers();
    const compute = vi.fn().mockResolvedValue('resultado');

    await withCache('k', 60, compute);
    vi.advanceTimersByTime(61_000);
    await withCache('k', 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('separa por clave', async () => {
    const compute = vi.fn().mockImplementation((): Promise<string> => Promise.resolve('x'));

    await withCache('a', 60, compute);
    await withCache('b', 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('no cachea un error: el próximo intento vuelve a probar', async () => {
    const compute = vi
      .fn()
      .mockRejectedValueOnce(new Error('TMDB caído'))
      .mockResolvedValue('anduvo');

    await expect(withCache('k', 60, compute)).rejects.toThrow('TMDB caído');
    expect(await withCache('k', 60, compute)).toBe('anduvo');
  });

  it('no crece sin techo', async () => {
    // Se cargan más entradas que el tope y se comprueba que la primera fue
    // desalojada: si no, una caché en un proceso de larga vida se come la RAM.
    for (let i = 0; i < 120; i++) {
      await withCache(`k${i}`, 60, async () => i);
    }

    const compute = vi.fn().mockResolvedValue(0);
    await withCache('k0', 60, compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('cacheHeaders', () => {
  it('deja cachear en el borde pero no en el navegador', () => {
    const header = cacheHeaders(3600)['Cache-Control'];

    expect(header).toContain('max-age=0');
    expect(header).toContain('s-maxage=3600');
    expect(header).toContain('stale-while-revalidate=7200');
  });
});
