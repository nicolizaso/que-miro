import { MediaType } from '@/types';

/**
 * Lo que sale de leer el export de otra app, antes de buscarlo en TMDB.
 *
 * Cada parser devuelve esto y nada más: título, año, fechas, puntaje, estado
 * e IDs externos. Resolver a qué título de TMDB corresponde y convertirlo en
 * un título de la biblioteca es trabajo de `match.ts` y de `toMedia.ts`, que
 * son los mismos para las tres fuentes.
 */

export type ImportSource = 'imdb' | 'letterboxd' | 'trakt';

/** Una vez que se vio, con lo que la otra app sepa de esa vez. */
export interface ImportWatch {
  /** `YYYY-MM-DD` o ISO completo; ausente si la app no lo anotó. */
  date?: string;
  /** De 0,5 a 5, ya convertido. */
  rating?: number;
  text?: string;
  tags?: string[];
}

export interface ImportRecord {
  source: ImportSource;
  title: string;
  year?: number;
  /** Sabido en IMDb y Trakt; Letterboxd es solo de películas. */
  mediaType?: MediaType;
  ids: { imdb?: string; tmdb?: number };
  /** `viendo` solo para series con episodios vistos y sin terminar. */
  status: 'completada' | 'viendo' | 'por_ver';
  /** Una por vez que se vio. Vacío en lo que está para ver. */
  watches: ImportWatch[];
  /** Episodios vistos de una serie, con su fecha (Trakt). */
  episodes?: { season: number; episode: number; watchedAt?: string }[];
}

/** Un archivo del export, ya leído como texto. */
export interface ImportFile {
  name: string;
  text: string;
}
