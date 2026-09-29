import { describe, expect, it } from 'vitest';
import { mapPool } from './concurrency';

describe('mapPool', () => {
  it('nunca tiene más de `limit` en vuelo, y devuelve en orden', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapPool([30, 10, 20, 5, 15], 2, async (ms) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, ms));
      inFlight -= 1;
      return ms * 2;
    });

    expect(peak).toBe(2);
    expect(results).toEqual([30, 10, 20, 5, 15].map((ms) => ({ ok: true, value: ms * 2 })));
  });

  it('lo que falla queda en su lugar sin voltear al resto', async () => {
    const results = await mapPool([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error('roto');
      return n;
    });
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1]).toMatchObject({ ok: false });
    expect(results[2]).toEqual({ ok: true, value: 3 });
  });

  it('avisa el avance y se puede cortar', async () => {
    const controller = new AbortController();
    const progress: number[] = [];
    const results = await mapPool(
      [1, 2, 3, 4, 5],
      1,
      async (n) => {
        if (n === 2) controller.abort();
        return n;
      },
      { signal: controller.signal, onProgress: (done) => progress.push(done) },
    );

    expect(progress).toEqual([1, 2]);
    expect(results.slice(2)).toEqual([undefined, undefined, undefined]);
  });

  it('sin nada que hacer, termina', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });
});
