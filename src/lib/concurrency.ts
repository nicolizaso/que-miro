/**
 * Muchos pedidos, pocos a la vez.
 *
 * Para leer decenas de perfiles o buscar cientos de títulos sin tirarle todo
 * junto a Firestore o a TMDB: a lo sumo `limit` en vuelo, con avance para
 * dibujar una barra y la posibilidad de cortar a mitad de camino.
 */
export interface PoolOptions {
  /** Se llama cada vez que termina uno, bien o mal. */
  onProgress?: (done: number, total: number) => void;
  /** Cortado, no arranca ningún pedido más; los que están en vuelo terminan. */
  signal?: AbortSignal;
}

/**
 * `fn` sobre cada elemento, en orden de resultados. Lo que falla queda como
 * `{ ok: false }` en su lugar y no voltea al resto; lo que no llegó a
 * arrancar por un corte, como `undefined`.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  { onProgress, signal }: PoolOptions = {},
): Promise<({ ok: true; value: R } | { ok: false; error: unknown } | undefined)[]> {
  const results: ({ ok: true; value: R } | { ok: false; error: unknown } | undefined)[] = new Array(
    items.length,
  ).fill(undefined);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
