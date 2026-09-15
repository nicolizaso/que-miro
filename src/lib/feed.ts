import { TMDbResult } from '@/types';
import { FeedBlock } from '@/lib/recipes';

/** Cuántas filas entran por tanda antes de que haya que seguir scrolleando. */
export const PAGE_SIZE = 4;

/**
 * Mínimo de títulos para que una fila valga la pena.
 *
 * Con dos pósters la fila parece rota: mejor que no exista, porque el feed
 * tiene de sobra con qué reemplazarla. Las filas que son cortas por naturaleza
 * —la parte que te falta de una saga, la única serie que dejaste a medias—
 * declaran su propio mínimo en {@link FeedBlock.minResults}.
 */
export const MIN_RESULTS = 3;

/**
 * Generador de números al azar con semilla (mulberry32).
 *
 * Hace falta *con semilla* y no `Math.random()` porque el feed se pagina: la
 * tanda 3 tiene que ser la misma si volvés a subir y a bajar. Con azar puro, el
 * orden se recalcularía en cada render y las filas se moverían abajo del dedo.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una semilla nueva. Cada visita a Explorar estrena la suya. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Ordena las filas: mezcla con peso y separa las de la misma familia.
 *
 * Son dos reglas peleadas entre sí. El peso quiere que lo más personal aparezca
 * primero —"tu cara me suena" antes que "películas populares"—, y el azar
 * quiere que no sea siempre lo mismo. El empate se resuelve con un peso
 * sacudido: cada fila se mueve dentro de su rango, pero una fila de peso 10
 * nunca termina detrás de una de peso 3.
 *
 * La segunda pasada es la que más se nota: sin ella el feed abre con tres
 * "porque viste" seguidas, que se leen como una sola recomendación repetida.
 */
export function orderBlocks(blocks: FeedBlock[], seed: number): FeedBlock[] {
  const random = mulberry32(seed);

  const shuffled = blocks
    .map((block) => ({ block, score: block.weight * (0.6 + random() * 0.8) }))
    .sort(
      (a, b) => b.score - a.score || a.block.id.localeCompare(b.block.id, 'es'),
    )
    .map(({ block }) => block);

  const ordered: FeedBlock[] = [];
  const pending = [...shuffled];

  while (pending.length > 0) {
    const previous = ordered[ordered.length - 1];
    // La primera que no repita la familia de la anterior. Si todas repiten
    // —porque quedan solo filas de gente, por ejemplo—, se toma la primera
    // igual: separar vale, pero no a costa de perder una fila.
    const index = previous
      ? Math.max(
          pending.findIndex((block) => block.family !== previous.family),
          0,
        )
      : 0;

    ordered.push(pending.splice(index, 1)[0]);
  }

  return ordered;
}

/**
 * Quién muestra cada título, para que no aparezca dos veces en el feed.
 *
 * Las filas piden sus títulos en paralelo y varias pueden traer el mismo —tres
 * recetas distintas pueden llegar a la misma película—. La primera que lo
 * reclama se lo queda.
 *
 * Reclamar dos veces desde la misma fila devuelve lo mismo que la primera vez.
 * Eso importa: en desarrollo React monta cada componente dos veces, y sin esto
 * la segunda pasada encontraría todo "ya tomado" por ella misma y dejaría la
 * fila vacía.
 */
export interface TitleRegistry {
  /**
   * Se queda con los títulos de `results` que no haya tomado otra fila.
   *
   * Las filas locales muestran la biblioteca a propósito, así que para ellas no
   * se descarta lo ya guardado.
   */
  claim(blockId: string, results: TMDbResult[], local?: boolean): TMDbResult[];
}

export function createRegistry(saved: Set<number>): TitleRegistry {
  /** Qué fila se quedó con cada título. */
  const owners = new Map<number, string>();

  return {
    claim(blockId, results, local = false) {
      // Se sueltan los títulos que esta misma fila tenía: si vuelve a pedir, es
      // porque se está rearmando, y sus propios títulos siguen siendo suyos.
      for (const [id, owner] of owners) {
        if (owner === blockId) owners.delete(id);
      }

      const claimed: TMDbResult[] = [];

      for (const result of results) {
        // Sin póster la fila queda con huecos grises.
        if (!result.poster_path) continue;
        if (!local && saved.has(result.id)) continue;
        if (owners.has(result.id)) continue;

        owners.set(result.id, blockId);
        claimed.push(result);
      }

      return claimed;
    },
  };
}
