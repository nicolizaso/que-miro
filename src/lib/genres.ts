/**
 * Los géneros de TMDB con el nombre que usa la app.
 *
 * Es lógica pura, sin red: vive aparte del cliente HTTP para que quien solo
 * necesita traducir un género —el enriquecimiento, las recetas— no arrastre
 * los pedidos a la API.
 */
import { MediaType } from '@/types';

const GENRE_MAP: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  10770: 'Película de TV',
  53: 'Suspenso',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Sci-Fi y Fantasía',
  10766: 'Telenovela',
  10767: 'Talk Show',
  10768: 'Guerra y Política',
};

/**
 * Qué géneros existen en cada tipo de medio.
 *
 * TMDB no comparte la tabla entre películas y series: "Terror" (27) solo existe
 * en películas, y "Sci-Fi y Fantasía" (10765) solo en series. Pedir una fila de
 * terror en series con el id de películas devuelve cualquier cosa, así que
 * {@link getGenreId} resuelve el id contra el tipo que corresponde y, si ese
 * género no existe ahí, no devuelve nada — y la fila simplemente no se arma.
 */
const MOVIE_GENRE_IDS = new Set([
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770,
  53, 10752, 37,
]);

const TV_GENRE_IDS = new Set([
  10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766,
  10767, 10768, 37,
]);

/** Mapea IDs de géneros de TMDB a sus nombres en español. */
export function getGenreNames(genreIds: number[]): string[] {
  return genreIds.map((id) => GENRE_MAP[id]).filter(Boolean);
}

/**
 * Los géneros de una ficha con el nombre de la app, no con el que manda TMDB.
 *
 * TMDB los nombra distinto según el idioma —"Suspense" en España, "Suspenso"
 * en latino— y la biblioteca los compara como texto: el filtro, las filas de
 * Explorar y el cuestionario. Traducirlos por id deja un solo nombre por
 * género, lo haya guardado quien lo haya guardado. Un id que el mapa no conoce
 * conserva el nombre de TMDB antes que perderse.
 */
export function canonicalGenreNames(
  genres: { id: number; name: string }[] | undefined,
): string[] {
  const names = (genres ?? [])
    .map((genre) => GENRE_MAP[genre.id] ?? genre.name?.trim())
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
}

/**
 * El id que TMDB le da a un género, para el tipo de medio que se le pida.
 *
 * La biblioteca guarda los nombres en español —es lo que se muestra y lo que
 * filtra la lista—, pero `/discover` pide ids. Devuelve `undefined` si ese
 * género no existe en ese tipo de medio.
 */
export function getGenreId(
  name: string,
  mediaType: MediaType,
): number | undefined {
  const valid = mediaType === 'movie' ? MOVIE_GENRE_IDS : TV_GENRE_IDS;

  for (const [id, genreName] of Object.entries(GENRE_MAP)) {
    if (genreName === name && valid.has(Number(id))) return Number(id);
  }
  return undefined;
}

/**
 * Los géneros que se pueden elegir como favoritos, en un solo lugar.
 *
 * Sale del mismo mapa que traduce los ids de TMDB, así que el cuestionario no
 * puede ofrecer un género que después no se sepa buscar. Quedan afuera los que
 * describen un formato y no un gusto —"Película de TV", "Noticias", "Talk
 * Show", "Telenovela"—: nadie contesta "reality" cuando le preguntan qué le
 * gusta mirar, y si lo contestara, `/discover` no tiene con qué responderle.
 */
const NOT_A_TASTE = new Set([
  'Película de TV',
  'Noticias',
  'Talk Show',
  'Telenovela',
  'Infantil',
]);

export function genreOptions(): string[] {
  const names = new Set(
    Object.values(GENRE_MAP).filter((name) => !NOT_A_TASTE.has(name)),
  );
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
}
