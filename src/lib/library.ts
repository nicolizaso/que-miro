import { MediaStatus, MediaType, SavedMedia } from '@/types';

export type SortOption = 'recientes' | 'titulo' | 'puntaje' | 'anio';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recientes', label: 'Agregados hace poco' },
  { value: 'titulo', label: 'Título (A-Z)' },
  { value: 'puntaje', label: 'Mejor puntuados' },
  { value: 'anio', label: 'Más nuevos' },
];

export const DEFAULT_SORT: SortOption = 'recientes';

export interface LibraryFilters {
  status: MediaStatus;
  /** Búsqueda de texto sobre el título. */
  query: string;
  /** Nombre exacto de un género, o `null` para todos. */
  genre: string | null;
  /** `null` para películas y series juntas. */
  type: MediaType | null;
  sort: SortOption;
}

export const EMPTY_FILTERS: Omit<LibraryFilters, 'status'> = {
  query: '',
  genre: null,
  type: null,
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

/** Los géneros presentes en una lista de títulos, ordenados alfabéticamente. */
export function collectGenres(list: SavedMedia[]): string[] {
  const genres = new Set<string>();
  for (const media of list) {
    for (const genre of media.genres) genres.add(genre);
  }
  return Array.from(genres).sort((a, b) => a.localeCompare(b, 'es'));
}

function compare(a: SavedMedia, b: SavedMedia, sort: SortOption): number {
  switch (sort) {
    case 'titulo':
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });

    case 'puntaje': {
      // Sin reseña no hay puntaje: esos van al fondo en vez de contar como 0,
      // que los mezclaría con los realmente mal puntuados.
      const ratingA = a.review?.rating ?? -1;
      const ratingB = b.review?.rating ?? -1;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    }

    case 'anio': {
      const yearA = Number(a.releaseYear) || 0;
      const yearB = Number(b.releaseYear) || 0;
      if (yearA !== yearB) return yearB - yearA;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    }

    case 'recientes':
    default:
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
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
      if (media.status !== filters.status) return false;
      if (filters.type && media.mediaType !== filters.type) return false;
      if (filters.genre && !media.genres.includes(filters.genre)) return false;
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
    filters.sort !== DEFAULT_SORT
  );
}
