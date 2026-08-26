export type MediaType = 'movie' | 'tv';
export type MediaStatus = 'por_ver' | 'viendo' | 'completada';

/**
 * Una vez que viste un título, de principio a fin.
 *
 * Reemplaza al `review` único de la v1 del schema: volver a ver algo ya no pisa
 * lo que habías escrito la primera vez, queda como una entrada más del
 * historial.
 */
export interface WatchEntry {
  /** Identifica la entrada dentro del historial de su título. */
  id: string;
  /** 0,5 a 5,0. */
  rating: number;
  text?: string;
  /** Etiquetas de ánimo: "para llorar", "con amigos". */
  tags?: string[];
  /** Puntaje por temporada, para series. Número de temporada -> puntaje. */
  seasonRatings?: Record<number, number>;
  completedAt: string; // ISO
}

/** Una temporada, como la describe TMDB. */
export interface SeasonInfo {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

/**
 * Qué episodios viste de una serie.
 *
 * `watched` es un mapa de número de temporada a la lista de episodios vistos.
 * Se guarda la lista y no un contador porque la gente no mira en orden: se
 * saltea un episodio, vuelve a uno viejo, retoma una temporada a la mitad.
 */
export interface SeriesProgress {
  watched: Record<number, number[]>;
  lastWatchedAt?: string; // ISO
}

export interface SavedMedia {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  genres: string[];
  status: MediaStatus;
  updatedAt: string; // ISO

  /**
   * Datos traídos de TMDB en el momento de guardar el título.
   *
   * Se cachean acá en vez de pedirlos cada vez porque los necesitan la lista y
   * el picker, que trabajan sobre la biblioteca entera: pedir la ficha de cada
   * título para poder filtrar sería impagable.
   */
  /** Minutos: la duración de la película, o la de un episodio en las series. */
  runtime?: number | null;
  /** Temporadas de la serie, para poder marcar episodios sin volver a TMDB. */
  seasons?: SeasonInfo[];
  totalEpisodes?: number | null;
  /** Plataformas donde estaba disponible, según la región de abajo. */
  providers?: string[];
  /** Región cuyo catálogo se consultó al guardar. */
  providerRegion?: string;

  /** Episodios vistos. Solo en series. */
  progress?: SeriesProgress;

  /** Veces que lo viste, de la más reciente a la más vieja. */
  history?: WatchEntry[];

  /** Ids de las colecciones a las que pertenece. */
  collections?: string[];
}

/** Una lista propia, más allá de los tres estados fijos. */
export interface Collection {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface TMDbResult {
  id: number;
  media_type: MediaType;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  overview: string;
}

export interface TMDbDetail extends Omit<TMDbResult, 'genre_ids'> {
  genres: { id: number; name: string }[];
  /** Minutos. Solo en películas. */
  runtime?: number | null;
  /** Minutos por episodio. Solo en series; TMDB devuelve una lista. */
  episode_run_time?: number[];
  number_of_episodes?: number;
  videos?: {
    results: {
      type: string;
      key: string;
      site: string;
    }[];
  };
  credits?: {
    cast: {
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }[];
  };
  seasons?: {
    season_number: number;
    name: string;
    episode_count: number;
  }[];
  'watch/providers'?: {
    results: Record<string, {
      flatrate?: { provider_name: string; logo_path: string }[];
      rent?: { provider_name: string; logo_path: string }[];
      buy?: { provider_name: string; logo_path: string }[];
    }>;
  };
}
