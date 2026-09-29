import { MediaStatus, MediaType, SavedMedia } from '@/types';
import { latestRating } from '@/lib/schema';
import { hasNewEpisodes, progressPercent } from '@/lib/progress';
import { scoreOf } from '@/lib/duel';
import { isArchivedStatus } from '@/lib/archive';

/**
 * Qué se está mirando de la biblioteca: una de las tres pestañas, uno de los
 * dos estados archivados, o `archivadas`, que son los dos juntos.
 */
export type LibraryStatus = MediaStatus | 'archivadas';

/** Si un título entra en lo que se está mirando. */
export function matchesStatus(media: SavedMedia, status: LibraryStatus): boolean {
  return status === 'archivadas' ? isArchivedStatus(media.status) : media.status === status;
}

export type SortOption =
  | 'recientes'
  | 'titulo'
  | 'puntaje'
  | 'anio'
  | 'progreso'
  | 'ranking';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recientes', label: 'Agregados hace poco' },
  { value: 'titulo', label: 'Título (A-Z)' },
  { value: 'puntaje', label: 'Mejor puntuados' },
  { value: 'anio', label: 'Más nuevos' },
  { value: 'progreso', label: 'Más avanzados' },
  { value: 'ranking', label: 'Mi ranking' },
];

export const DEFAULT_SORT: SortOption = 'recientes';

export interface LibraryFilters {
  status: LibraryStatus;
  /** Búsqueda de texto sobre el título. */
  query: string;
  /** Nombre exacto de un género, o `null` para todos. */
  genre: string | null;
  /** `null` para películas y series juntas. */
  type: MediaType | null;
  /** Nombre de una plataforma de streaming, o `null` para todas. */
  provider: string | null;
  /** Id de una colección propia, o `null` para no filtrar por lista. */
  collection: string | null;
  /** Etiqueta de ánimo de alguna reseña del título. */
  tag: string | null;
  /** Solo las series con episodios nuevos que todavía no viste. */
  onlyNew: boolean;
  sort: SortOption;
}

export const EMPTY_FILTERS: Omit<LibraryFilters, 'status'> = {
  query: '',
  genre: null,
  type: null,
  provider: null,
  collection: null,
  tag: null,
  onlyNew: false,
  sort: DEFAULT_SORT,
};

/**
 * Normaliza para comparar: sin acentos, sin mayúsculas.
 *
 * Buscar "matrix" tiene que encontrar "Matrix", y buscar "chihiro" tiene que
 * encontrar "El Viaje de Chihiro" aunque se escriba sin tilde.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Junta valores de todos los títulos, sin repetir y ordenados. */
function collectUnique(
  list: SavedMedia[],
  pick: (media: SavedMedia) => string[] | undefined,
): string[] {
  const values = new Set<string>();
  for (const media of list) {
    for (const value of pick(media) ?? []) values.add(value);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Los géneros presentes en una lista de títulos, ordenados alfabéticamente. */
export function collectGenres(list: SavedMedia[]): string[] {
  return collectUnique(list, (media) => media.genres);
}

/** Las plataformas presentes en una lista de títulos. */
export function collectProviders(list: SavedMedia[]): string[] {
  return collectUnique(list, (media) => media.providers);
}

/** Las etiquetas usadas en las reseñas de una lista de títulos. */
export function collectTags(list: SavedMedia[]): string[] {
  return collectUnique(list, (media) =>
    media.history?.flatMap((entry) => entry.tags ?? []),
  );
}

function compare(a: SavedMedia, b: SavedMedia, sort: SortOption): number {
  const byTitle = () =>
    a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });

  switch (sort) {
    case 'titulo':
      return byTitle();

    case 'puntaje': {
      // Sin reseña no hay puntaje: esos van al fondo en vez de contar como 0,
      // que los mezclaría con los realmente mal puntuados.
      const ratingA = latestRating(a) ?? -1;
      const ratingB = latestRating(b) ?? -1;
      return ratingA !== ratingB ? ratingB - ratingA : byTitle();
    }

    case 'anio': {
      const yearA = Number(a.releaseYear) || 0;
      const yearB = Number(b.releaseYear) || 0;
      return yearA !== yearB ? yearB - yearA : byTitle();
    }

    case 'progreso': {
      // Ordena por lo que te falta menos. Las películas no tienen progreso, así
      // que quedan al final: no hay nada que retomar.
      const progressA = a.mediaType === 'tv' ? progressPercent(a) : -1;
      const progressB = b.mediaType === 'tv' ? progressPercent(b) : -1;
      return progressA !== progressB ? progressB - progressA : byTitle();
    }

    case 'ranking': {
      // Los que nunca pasaron por el duelo van al final: no tienen ranking,
      // y mezclarlos con los que sí lo tienen haría parecer que sí.
      const duelledA = (a.duelCount ?? 0) > 0;
      const duelledB = (b.duelCount ?? 0) > 0;
      if (duelledA !== duelledB) return duelledA ? -1 : 1;
      if (!duelledA) return byTitle();
      return scoreOf(b) - scoreOf(a) || byTitle();
    }

    case 'recientes':
    default:
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }
}

/**
 * Aplica filtros y orden a la biblioteca.
 *
 * Devuelve un array nuevo: `sort` muta el array que recibe, y el del store es
 * el estado de Zustand.
 */
export function filterLibrary(
  list: SavedMedia[],
  filters: LibraryFilters,
): SavedMedia[] {
  const query = normalizeText(filters.query);

  return list
    .filter((media) => {
      if (!matchesStatus(media, filters.status)) return false;
      if (filters.type && media.mediaType !== filters.type) return false;
      if (filters.genre && !media.genres.includes(filters.genre)) return false;
      if (filters.provider && !media.providers?.includes(filters.provider)) {
        return false;
      }
      if (
        filters.collection &&
        !media.collections?.includes(filters.collection)
      ) {
        return false;
      }
      if (
        filters.tag &&
        !media.history?.some((entry) => entry.tags?.includes(filters.tag!))
      ) {
        return false;
      }
      if (filters.onlyNew && !hasNewEpisodes(media)) return false;
      if (query && !normalizeText(media.title).includes(query)) return false;
      return true;
    })
    .sort((a, b) => compare(a, b, filters.sort));
}

/** Si hay algún filtro activo más allá de la pestaña de estado. */
export function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.genre !== null ||
    filters.type !== null ||
    filters.provider !== null ||
    filters.collection !== null ||
    filters.tag !== null ||
    filters.onlyNew ||
    filters.sort !== DEFAULT_SORT
  );
}
