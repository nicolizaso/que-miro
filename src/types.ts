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

/**
 * Alguien del reparto o de la dirección, como lo identifica TMDB.
 *
 * Se guarda con el título porque es lo que hace posibles las filas de Explorar
 * que hablan de gente: "otros trabajos de este director", "si te gustó esta
 * actriz". Calcularlas pidiendo la ficha de la biblioteca entera cada vez que
 * alguien abre la pestaña no es viable — el mismo motivo por el que ya se
 * cachean plataformas y duración.
 */
export interface Person {
  id: number;
  name: string;
  /** `direccion` incluye a quienes crearon una serie: es el mismo rol. */
  role: 'reparto' | 'direccion';
  profilePath?: string | null;
}

/** Un tema de TMDB: "viajes en el tiempo", "distopía", "vampiros". */
export interface Keyword {
  id: number;
  name: string;
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

  /** Reparto principal y dirección, para las recomendaciones por gente. */
  people?: Person[];
  /** Temas de TMDB, para las recomendaciones por tema. */
  keywords?: Keyword[];
  /** Saga de TMDB a la que pertenece: *El Padrino*, *Alien*. Solo en películas. */
  sagaId?: number | null;
  sagaName?: string;
  /** Idioma original, en ISO 639-1. Distingue lo que ves doblado de lo que no. */
  originalLanguage?: string;

  /** Episodios vistos. Solo en series. */
  progress?: SeriesProgress;

  /** Veces que lo viste, de la más reciente a la más vieja. */
  history?: WatchEntry[];

  /** Ids de las colecciones a las que pertenece. */
  collections?: string[];

  /**
   * Puntaje del modo duelo, estilo Elo.
   *
   * Ausente mientras el título no haya peleado; `duel.ts` lo trata como el
   * puntaje base. Son campos opcionales que se suman al schema v2 sin migración:
   * un documento viejo simplemente no los trae.
   */
  duelScore?: number;
  duelCount?: number;
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
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
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
    crew?: {
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path: string | null;
    }[];
  };
  /** Quiénes crearon la serie. En TMDB no vienen en `crew`, vienen acá. */
  created_by?: {
    id: number;
    name: string;
    profile_path: string | null;
  }[];
  /**
   * Temas del título. TMDB los devuelve bajo `keywords` en películas y bajo
   * `results` en series — el mismo dato, dos nombres.
   */
  keywords?: {
    keywords?: { id: number; name: string }[];
    results?: { id: number; name: string }[];
  };
  /** La saga a la que pertenece la película, si pertenece a alguna. */
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
  } | null;
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
