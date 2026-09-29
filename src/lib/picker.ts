import { MediaType, SavedMedia } from '@/types';
import { runtimeMinutes } from '@/lib/stats';
import { isAvailableNow } from '@/lib/subscriptions';

/** Tramos de duración que se pueden pedir. */
export type DurationBucket = 'corta' | 'media' | 'larga';

export const DURATION_BUCKETS: {
  value: DurationBucket;
  label: string;
  /** Minutos, tope incluido. */
  max: number;
}[] = [
  { value: 'corta', label: 'Menos de 1 h 30', max: 90 },
  { value: 'media', label: 'Hasta 2 h 30', max: 150 },
  { value: 'larga', label: 'Sin límite', max: Number.POSITIVE_INFINITY },
];

export interface PickerFilters {
  genre: string | null;
  type: MediaType | null;
  provider: string | null;
  tag: string | null;
  collection: string | null;
  duration: DurationBucket | null;
  /** Solo lo incluido en alguna plataforma que pagás. */
  availableNow: boolean;
}

export const EMPTY_PICKER_FILTERS: PickerFilters = {
  genre: null,
  type: null,
  provider: null,
  tag: null,
  collection: null,
  duration: null,
  availableNow: false,
};

/** Los títulos de la lista *Por Ver* que cumplen los filtros. */
export function candidates(
  list: SavedMedia[],
  filters: PickerFilters,
  /** Las plataformas que se pagan (ver `subscribedNames`). */
  subscribed: Set<string> = new Set(),
): SavedMedia[] {
  const maxMinutes = filters.duration
    ? (DURATION_BUCKETS.find((bucket) => bucket.value === filters.duration)?.max ??
      Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;

  return list.filter((media) => {
    if (media.status !== 'por_ver') return false;
    if (filters.type && media.mediaType !== filters.type) return false;
    if (filters.genre && !media.genres.includes(filters.genre)) return false;
    if (filters.provider && !media.providers?.includes(filters.provider)) {
      return false;
    }
    if (filters.availableNow && !isAvailableNow(media, subscribed)) return false;
    if (filters.collection && !media.collections?.includes(filters.collection)) {
      return false;
    }
    if (
      filters.tag &&
      !media.history?.some((entry) => entry.tags?.includes(filters.tag!))
    ) {
      return false;
    }

    if (Number.isFinite(maxMinutes)) {
      // En series se mide un episodio y no la serie entera: "tengo hora y
      // media" es una pregunta sobre esta noche, no sobre las nueve temporadas.
      const minutes =
        media.mediaType === 'tv'
          ? media.runtime || 45
          : runtimeMinutes(media);
      if (minutes > maxMinutes) return false;
    }

    return true;
  });
}

/**
 * Elige uno al azar, evitando lo que salió hace poco.
 *
 * Sin memoria, un pool de tres títulos repite el mismo dos veces seguidas
 * bastante seguido y el sorteo parece roto. Si lo reciente agota el pool, se
 * ignora la memoria antes que devolver nada: es preferible repetir a no
 * contestar.
 */
export function pickRandom(
  pool: SavedMedia[],
  recentIds: number[] = [],
  random: () => number = Math.random,
): SavedMedia | null {
  if (pool.length === 0) return null;

  const fresh = pool.filter((media) => !recentIds.includes(media.tmdbId));
  const from = fresh.length > 0 ? fresh : pool;

  return from[Math.floor(random() * from.length)] ?? null;
}

/** Cuántos sorteos se recuerdan para no repetir. */
export const RECENT_MEMORY = 5;

/** Agrega un id a la memoria de sorteos recientes, con tope. */
export function rememberPick(recent: number[], tmdbId: number): number[] {
  return [tmdbId, ...recent.filter((id) => id !== tmdbId)].slice(0, RECENT_MEMORY);
}
