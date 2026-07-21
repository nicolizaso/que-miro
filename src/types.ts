export type MediaType = 'movie' | 'tv';
export type MediaStatus = 'por_ver' | 'viendo' | 'completada';

export interface Review {
  rating: number; // 0.5 a 5.0
  text?: string;
  seasonRatings?: Record<number, number>; // season number -> rating
  completedAt: string; // ISO
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
  review?: Review;
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
