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

export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
}

export async function searchMulti(query: string) {
  try {
    const url = new URL(window.location.origin + '/api/tmdb/search/multi');
    url.searchParams.append('query', query);
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    const data = await response.json();
    return data.results.filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function getMediaDetail(id: number, mediaType: 'movie' | 'tv') {
  try {
    const response = await fetch(`/api/tmdb/${mediaType}/${id}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (e) {
    console.error(e);
    return null;
  }
}
