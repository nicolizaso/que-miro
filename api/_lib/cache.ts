/**
 * Caché en memoria para las respuestas de TMDB que son iguales para todos.
 *
 * *Trending* y *populares* no dependen de quién pregunta y cambian una vez por
 * día: pedirlas a TMDB en cada visita gasta cuota de la API y suma latencia sin
 * devolver nada nuevo.
 *
 * Vive en el proceso, así que en Vercel la comparten las requests que caen en
 * la misma instancia tibia y se pierde cuando la instancia se recicla. Es una
 * optimización oportunista, no una garantía: la caché de verdad la hace el
 * borde con los headers de {@link cacheHeaders}. Por eso tampoco hay
 * invalidación — el TTL alcanza.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** Tope de entradas, para que la caché no crezca sin techo. */
const MAX_ENTRIES = 100;

/**
 * Devuelve el valor cacheado, o lo calcula y lo guarda.
 *
 * Las promesas rechazadas no se cachean: un error de red no debería quedar
 * pegado durante toda la ventana del TTL.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const value = await compute();

  // Desalojo simple: cuando se llena, se tira la entrada más vieja del Map, que
  // conserva el orden de inserción. No es un LRU, y no hace falta que lo sea
  // con un puñado de claves posibles.
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}

/**
 * Headers para que el CDN cachee la respuesta.
 *
 * `s-maxage` es lo que mira el borde de Vercel; `max-age=0` evita que el
 * navegador se quede con una copia propia que no podemos invalidar.
 * `stale-while-revalidate` deja servir la copia vieja mientras se busca la
 * nueva por detrás, así una expiración nunca se le nota a nadie.
 */
export function cacheHeaders(ttlSeconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=0, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`,
  };
}

/** Solo para los tests. */
export function clearCache(): void {
  store.clear();
}
