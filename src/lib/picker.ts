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

/** Un valor posible de un filtro y cuántos candidatos quedarían con él. */
export interface FacetOption<V extends string = string> {
  value: V;
  label: string;
  count: number;
}

export interface PickerFacets {
  type: FacetOption<MediaType>[];
  duration: FacetOption<DurationBucket>[];
  genre: FacetOption[];
  provider: FacetOption[];
  collection: FacetOption[];
  tag: FacetOption[];
}

const TYPE_LABELS: Record<MediaType, string> = { movie: 'Películas', tv: 'Series' };

/**
 * Los valores de un campo, del más frecuente al menos.
 *
 * El orden sale de la lista entera y no de lo que queda filtrado: si se
 * recalculara con cada filtro, las píldoras cambiarían de lugar justo cuando
 * la persona está por tocar la siguiente.
 */
function byFrequency(
  list: SavedMedia[],
  pick: (media: SavedMedia) => string[] | undefined,
): string[] {
  const counts = new Map<string, number>();
  for (const media of list) {
    // Un `Set` por título: una etiqueta repetida en dos reseñas no lo cuenta dos veces.
    for (const value of new Set(pick(media) ?? [])) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts.keys()).sort(
    (a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b, 'es'),
  );
}

/**
 * Las opciones de cada fila de filtros, con cuántos candidatos deja cada una.
 *
 * Cada cuenta se hace con los otros filtros puestos y el de su fila
 * reemplazado: es la respuesta a "si toco esta, ¿cuántos me quedan?", que es
 * lo que hace falta para apagar las que dejarían el sorteo en cero.
 */
export function pickerFacets(
  list: SavedMedia[],
  filters: PickerFilters,
  subscribed: Set<string> = new Set(),
  /** Las listas propias para ofrecer, en el orden de la persona. */
  collections: { id: string; name: string }[] = [],
  /** Sin la biblioteca propia (de a dos), el ánimo de las reseñas no se ofrece. */
  includeTags = true,
): PickerFacets {
  const pending = list.filter((media) => media.status === 'por_ver');
  const facet = <V extends string>(
    key: keyof PickerFacets,
    values: { value: V; label: string }[],
  ): FacetOption<V>[] =>
    values.map(({ value, label }) => ({
      value,
      label,
      count: candidates(pending, { ...filters, [key]: value }, subscribed).length,
    }));

  const plain = (values: string[]) => values.map((value) => ({ value, label: value }));

  return {
    // Solo los tipos que hay: con todo películas, "Series" sería una píldora
    // que siempre da cero.
    type: facet(
      'type',
      (['movie', 'tv'] as const)
        .filter((type) => pending.some((media) => media.mediaType === type))
        .map((type) => ({ value: type, label: TYPE_LABELS[type] })),
    ),
    // "Sin límite" es lo mismo que no filtrar, así que no se ofrece aparte.
    duration: facet(
      'duration',
      DURATION_BUCKETS.filter((bucket) => Number.isFinite(bucket.max)),
    ),
    genre: facet('genre', plain(byFrequency(pending, (media) => media.genres))),
    provider: facet('provider', plain(byFrequency(pending, (media) => media.providers))),
    collection: facet(
      'collection',
      collections.map(({ id, name }) => ({ value: id, label: name })),
    ),
    tag: includeTags
      ? facet(
          'tag',
          plain(
            byFrequency(pending, (media) =>
              media.history?.flatMap((entry) => entry.tags ?? []),
            ),
          ),
        )
      : [],
  };
}

/** Con menos pósters que esto, el fondo de la pantalla se ve como un hueco. */
export const POSTER_WALL_MIN = 6;
/** Los que entran en el fondo sin repetirse. */
export const POSTER_WALL_MAX = 18;

/**
 * Los pósters para el fondo del picker: los de la propia lista *Por Ver*.
 *
 * Vacío si no alcanzan para llenarlo: un fondo de dos pósters sueltos se lee
 * como un error de carga, y mejor no mostrar nada.
 */
export function posterWall(list: SavedMedia[]): string[] {
  const posters = list
    .filter((media) => media.status === 'por_ver' && media.posterPath)
    .map((media) => media.posterPath!);
  const unique = Array.from(new Set(posters)).slice(0, POSTER_WALL_MAX);
  return unique.length >= POSTER_WALL_MIN ? unique : [];
}
