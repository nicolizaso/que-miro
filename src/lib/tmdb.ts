// src/lib/tmdb.ts
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_ORIGINAL_URL = 'https://image.tmdb.org/t/p/original';

const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics"
};

/**
 * Mapea IDs de géneros a sus nombres correspondientes
 */
export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
}

/**
 * Cliente HTTP base para realizar peticiones a la API de TMDB
 */
async function fetchTMDB(endpoint: string, params: Record<string, string> = {}) {
  const apiKey = import.meta.env.VITE_TMDB_API_KEY;
  
  if (!apiKey) {
    console.error("TMDB API key is missing in environment variables.");
    throw new Error("TMDB API key missing");
  }

  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.append('api_key', apiKey);
  url.searchParams.append('language', 'es-ES');
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API Error: ${response.status}`);
  }
  return response.json();
}

/**
 * Realiza la búsqueda multi-contenido (películas y series)
 */
export async function searchMulti(query: string) {
  try {
    const data = await fetchTMDB('/search/multi', { query });
    return data.results.filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
  } catch (e) {
    console.error('Error al buscar en TMDB:', e);
    return [];
  }
}

/**
 * Obtiene el detalle de un título (película o serie)
 */
export async function getMediaDetail(id: number, mediaType: 'movie' | 'tv') {
  try {
    const data = await fetchTMDB(`/${mediaType}/${id}`, {
      append_to_response: 'videos,credits,watch/providers'
    });
    return data;
  } catch (e) {
    console.error('Error al obtener detalle de TMDB:', e);
    return null;
  }
}