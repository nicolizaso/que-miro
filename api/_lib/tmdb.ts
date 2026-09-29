/**
 * Cliente de TMDB que corre exclusivamente del lado del servidor.
 *
 * La API key vive en `TMDB_API_KEY` (sin prefijo `VITE_`), así que nunca entra
 * en el bundle del cliente. Este módulo lo comparten las funciones serverless
 * de `api/` (producción en Vercel) y el server de Express de `server.ts` (dev),
 * para que ambos entornos se comporten igual.
 */

import { withCache } from './cache.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export type MediaType = 'movie' | 'tv';

/**
 * Los idiomas en los que se piden los textos: títulos, sinopsis, nombres de
 * temporada.
 *
 * Castellano de España para quien elige España, y latino para el resto: desde
 * Buenos Aires, *Die Hard* es "Duro de matar" y no "La jungla de cristal". Es
 * una lista cerrada a propósito: la ruta es pública y el idioma entra en la
 * clave de caché, así que con un passthrough cada idioma inventado sería una
 * entrada más desalojando a las que sí se usan.
 */
export const LANGUAGES = ['es-ES', 'es-MX'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Sin parámetro, el de siempre: así un cliente que no lo manda no nota nada. */
export const DEFAULT_LANGUAGE: Language = 'es-ES';

/** Valida el idioma que llega por la request. */
export function parseLanguage(value: unknown): Language {
  if (value === undefined || value === '') return DEFAULT_LANGUAGE;
  if (LANGUAGES.includes(value as Language)) return value as Language;
  throw new TmdbError("El parámetro 'lang' debe ser 'es-ES' o 'es-MX'.", 400);
}

/**
 * Cuánto vive en caché cada respuesta.
 *
 * Las tendencias las recalcula TMDB una vez por día, así que una hora es
 * conservador y ya evita la mayoría de las llamadas. Las recomendaciones de un
 * título no cambian casi nunca: sí valen un día entero.
 */
export const TRENDING_TTL = 60 * 60;
export const RECOMMENDATIONS_TTL = 60 * 60 * 24;
/**
 * Las filas armadas por criterio (género, década, idioma, plataforma) cambian
 * más seguido que la filmografía de nadie, pero tampoco de un día para el otro.
 */
export const DISCOVER_TTL = 60 * 60 * 6;
/** La filmografía de una persona y las partes de una saga: un día entero. */
export const PERSON_TTL = 60 * 60 * 24;
/**
 * Una temporada: seis horas. Los episodios que ya salieron no cambian, pero a
 * los que vienen TMDB les va cargando fecha, nombre y duración a medida que se
 * anuncian, y una temporada en emisión suma uno por semana.
 */
export const SEASON_TTL = 60 * 60 * 6;
/**
 * Las plataformas de una región cambian de a una por mes, cuando mucho: con
 * un día sobra, y es lo que pide el ticket.
 */
export const PROVIDERS_TTL = 60 * 60 * 24;

/** Error con el status HTTP que le corresponde devolver al cliente. */
export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

function getApiKey(): string {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new TmdbError(
      'El servidor no tiene configurada la variable TMDB_API_KEY.',
      500,
    );
  }
  return apiKey;
}

async function fetchTMDB<T>(
  endpoint: string,
  params: Record<string, string> = {},
  language: Language = DEFAULT_LANGUAGE,
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('language', language);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new TmdbError('No se pudo conectar con TMDB.', 502);
  }

  if (!response.ok) {
    // 4xx de TMDB se propagan tal cual; 5xx se reportan como "bad gateway",
    // porque el que falló es el upstream y no nuestro cliente.
    const status = response.status >= 500 ? 502 : response.status;
    throw new TmdbError(`TMDB respondió ${response.status}.`, status);
  }

  return (await response.json()) as T;
}

/** Deja solo películas y series: TMDB mezcla personas y colecciones. */
function onlyMoviesAndShows<T extends { media_type?: string }>(results: T[]): T[] {
  return results.filter(
    (result) => result.media_type === 'movie' || result.media_type === 'tv',
  );
}

/** Busca películas y series por texto, descartando personas y otros tipos. */
export async function searchMulti(
  query: string,
  language: Language = DEFAULT_LANGUAGE,
) {
  const data = await fetchTMDB<{ results?: { media_type?: string }[] }>(
    '/search/multi',
    { query },
    language,
  );
  return onlyMoviesAndShows(data.results ?? []);
}

/**
 * Qué se busca cuando alguien escribe en un campo de búsqueda.
 *
 * `multi` es la búsqueda de siempre —títulos—; las otras dos las estrena el
 * cuestionario de "Contanos de vos", donde hay que poder nombrar a una
 * directora o a una productora que no están en ninguna biblioteca.
 */
export type SearchKind = 'multi' | 'person' | 'company';

export function parseSearchKind(value: unknown): SearchKind {
  if (value === undefined || value === '' || value === 'multi') return 'multi';
  if (value === 'person' || value === 'company') return value;
  throw new TmdbError(
    "El parámetro 'kind' debe ser 'multi', 'person' o 'company'.",
    400,
  );
}

/** Cuántos resultados devuelve una búsqueda de gente o de productoras. */
const MAX_SEARCH_RESULTS = 12;

/**
 * Busca personas por nombre.
 *
 * Devuelve solo los cuatro campos que la app usa y no la respuesta cruda: el
 * `known_for` de TMDB trae la ficha entera de hasta tres títulos por persona,
 * que acá no mira nadie y multiplica por diez el peso de la respuesta.
 *
 * No lleva idioma: TMDB no traduce los nombres de las personas, así que
 * pedirlos en latino y en castellano de España sería pagar dos veces lo mismo.
 */
export async function searchPeople(query: string) {
  const data = await fetchTMDB<{
    results?: {
      id: number;
      name: string;
      profile_path: string | null;
      known_for_department?: string;
      known_for?: { title?: string; name?: string }[];
    }[];
  }>('/search/person', { query, include_adult: 'false' });

  return (data.results ?? []).slice(0, MAX_SEARCH_RESULTS).map((person) => ({
    id: person.id,
    name: person.name,
    profile_path: person.profile_path,
    known_for_department: person.known_for_department ?? null,
    // Con qué se la reconoce, para distinguir a dos personas con el mismo
    // nombre sin tener que abrir nada.
    known_for: (person.known_for ?? [])
      .map((credit) => credit.title ?? credit.name ?? '')
      .filter(Boolean)
      .slice(0, 2),
  }));
}

/** Busca productoras por nombre: A24, Ghibli, Pixar. */
export async function searchCompanies(query: string) {
  const data = await fetchTMDB<{
    results?: { id: number; name: string; logo_path: string | null }[];
  }>('/search/company', { query });

  return (data.results ?? []).slice(0, MAX_SEARCH_RESULTS).map((company) => ({
    id: company.id,
    name: company.name,
    logo_path: company.logo_path,
  }));
}

/** Ventanas de tendencias que acepta TMDB. */
export type TrendingWindow = 'day' | 'week';

/** Valida la ventana que llega por la request. */
export function parseTrendingWindow(value: unknown): TrendingWindow {
  if (value === undefined || value === 'day') return 'day';
  if (value === 'week') return 'week';
  throw new TmdbError("El parámetro 'window' debe ser 'day' o 'week'.", 400);
}

/**
 * Lo que está mirando todo el mundo.
 *
 * Cacheado porque la respuesta no depende de quién pregunta: es la misma para
 * todos los visitantes durante todo el día.
 */
export async function getTrending(
  window: TrendingWindow = 'day',
  language: Language = DEFAULT_LANGUAGE,
) {
  // El idioma va en la clave: si no, la respuesta en un idioma se serviría a
  // quien pidió el otro.
  return withCache(`trending:${window}:${language}`, TRENDING_TTL, async () => {
    const data = await fetchTMDB<{ results?: { media_type?: string }[] }>(
      `/trending/all/${window}`,
      {},
      language,
    );
    return onlyMoviesAndShows(data.results ?? []);
  });
}

/** Los títulos más populares o mejor puntuados de una categoría. */
export type ListKind = 'popular' | 'top_rated';

export function parseListKind(value: unknown): ListKind {
  if (value === undefined || value === 'popular') return 'popular';
  if (value === 'top_rated') return 'top_rated';
  throw new TmdbError(
    "El parámetro 'list' debe ser 'popular' o 'top_rated'.",
    400,
  );
}

/**
 * Populares o mejor puntuadas, de películas o de series.
 *
 * TMDB no devuelve `media_type` en estos endpoints —el tipo está en la ruta—
 * así que se agrega a mano para que el front reciba siempre la misma forma.
 */
export async function getList(
  mediaType: MediaType,
  kind: ListKind,
  language: Language = DEFAULT_LANGUAGE,
) {
  return withCache(`list:${mediaType}:${kind}:${language}`, TRENDING_TTL, async () => {
    const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
      `/${mediaType}/${kind}`,
      {},
      language,
    );
    return (data.results ?? []).map((result) => ({
      ...result,
      media_type: mediaType,
    }));
  });
}

/**
 * Títulos parecidos a uno dado, según TMDB.
 *
 * Es la materia prima de las recomendaciones: el front pide las de sus mejores
 * puntuados y arma la lista final del lado del cliente, con lo que ya sabe de
 * la biblioteca de esa persona.
 */
export async function getRecommendations(
  mediaType: MediaType,
  id: number,
  language: Language = DEFAULT_LANGUAGE,
) {
  return withCache(
    `recommendations:${mediaType}:${id}:${language}`,
    RECOMMENDATIONS_TTL,
    async () => {
      const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
        `/${mediaType}/${id}/recommendations`,
        {},
        language,
      );
      return (data.results ?? []).map((result) => ({
        media_type: mediaType,
        ...result,
      }));
    },
  );
}

/**
 * Detalle de un título, con trailers, reparto y plataformas en una sola llamada.
 *
 * En latino, la sinopsis puede venir vacía: la traducción de un título la
 * carga la comunidad de TMDB y a veces solo existe la de España. En ese caso se
 * completa con la de `es-ES`, que es una segunda llamada, pero solo en ese caso
 * y liviana: sin `append_to_response`, porque de ella se toma un solo campo.
 *
 * Se eligió esto antes que sumar `translations` al `append_to_response`, que
 * resuelve lo mismo en una llamada pero trae las traducciones a todos los
 * idiomas —decenas— en cada ficha, para usar una sola y solo cuando falta. El
 * título, en cambio, no se completa: si la ficha latina no lo traduce es porque
 * en Latinoamérica suele estrenarse con el original, y el de España sería peor.
 */
export async function getMediaDetail(
  mediaType: MediaType,
  id: number,
  language: Language = DEFAULT_LANGUAGE,
) {
  const detail = await fetchTMDB<Record<string, unknown>>(
    `/${mediaType}/${id}`,
    {
      // `keywords` entra en la misma llamada: es lo que después habilita las
      // filas por tema de Explorar, y pedirlo aparte sería una request más por
      // cada título que alguien agrega. En películas, también las fechas de
      // estreno: de ahí sale cuándo llega a digital.
      append_to_response:
        mediaType === 'movie'
          ? 'videos,credits,keywords,watch/providers,release_dates'
          : 'videos,credits,keywords,watch/providers',
    },
    language,
  );

  if (mediaType === 'movie') {
    detail.digital_releases = digitalReleases(detail.release_dates);
    // Lo que viene de TMDB son todas las fechas —cine, festival, físico,
    // televisión— de todos los países, con su calificación. La app usa una sola
    // por país: no viaja el resto.
    delete detail.release_dates;
  }

  if (language !== DEFAULT_LANGUAGE && !detail.overview) {
    try {
      const fallback = await fetchTMDB<{ overview?: string }>(
        `/${mediaType}/${id}`,
        {},
        DEFAULT_LANGUAGE,
      );
      if (fallback.overview) detail.overview = fallback.overview;
    } catch {
      // Sin la de respaldo queda la ficha como vino: una sinopsis que falta no
      // justifica tirar abajo la ficha entera.
    }
  }

  return detail;
}

/** El tipo de estreno de TMDB que es "digital": plataformas y alquiler. */
const DIGITAL_RELEASE = 4;

/**
 * Cuándo llega cada película a digital, país por país: `{ AR: '2024-05-21' }`.
 *
 * El más temprano de tipo 4 de cada país. Lo que no se puede leer se ignora:
 * una fecha que falta es una novedad que no se avisa, no una ficha rota.
 */
export function digitalReleases(value: unknown): Record<string, string> {
  const results = (value as { results?: unknown } | undefined)?.results;
  if (!Array.isArray(results)) return {};

  const byCountry: Record<string, string> = {};
  for (const entry of results as { iso_3166_1?: unknown; release_dates?: unknown }[]) {
    const country = typeof entry?.iso_3166_1 === 'string' ? entry.iso_3166_1 : '';
    if (!/^[A-Z]{2}$/.test(country) || !Array.isArray(entry.release_dates)) continue;
    for (const release of entry.release_dates as { type?: unknown; release_date?: unknown }[]) {
      if (release?.type !== DIGITAL_RELEASE || typeof release.release_date !== 'string') continue;
      const day = release.release_date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (!byCountry[country] || day < byCountry[country]) byCountry[country] = day;
    }
  }
  return byCountry;
}

/**
 * El número de temporada más alto que se acepta.
 *
 * Holgado: hay series de noticias y concursos con más de cincuenta. El tope
 * existe para que la ruta pública no sirva para barrer números al azar.
 */
export const MAX_SEASON = 200;

/** Valida el número de temporada: un entero, del 0 (especiales) al tope. */
export function parseSeasonNumber(value: unknown): number {
  const season = value === '' || value === undefined ? NaN : Number(value);
  if (!Number.isInteger(season) || season < 0 || season > MAX_SEASON) {
    throw new TmdbError(
      `El parámetro 'season' debe ser un entero entre 0 y ${MAX_SEASON}.`,
      400,
    );
  }
  return season;
}

/** Un episodio con los campos que la app dibuja y ninguno más. */
export interface SeasonEpisode {
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  /** `standard`, `mid_season` o `finale`: así marca TMDB los finales. */
  episode_type: string | null;
}

export interface SeasonDetail {
  season_number: number;
  name: string;
  episodes: SeasonEpisode[];
}

/** Un episodio crudo de TMDB, con lo poco que se lee de él. */
type RawEpisode = Record<string, unknown>;

/**
 * Recorta un episodio a lo que la app usa.
 *
 * Cada episodio de TMDB trae su `crew` y sus `guest_stars` enteros —en una
 * temporada larga, cientos de personas— que acá no mira nadie y multiplican
 * el peso de la respuesta.
 */
export function trimEpisode(raw: RawEpisode): SeasonEpisode {
  const runtime = Number(raw.runtime);
  const vote = Number(raw.vote_average);
  return {
    episode_number: Number(raw.episode_number) || 0,
    name: typeof raw.name === 'string' ? raw.name : '',
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    air_date: typeof raw.air_date === 'string' && raw.air_date ? raw.air_date : null,
    runtime: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
    still_path: typeof raw.still_path === 'string' ? raw.still_path : null,
    vote_average: Number.isFinite(vote) ? vote : 0,
    episode_type: typeof raw.episode_type === 'string' ? raw.episode_type : null,
  };
}

/**
 * Los episodios de una temporada, con nombre, fecha, duración e imagen.
 *
 * En latino, igual que en la ficha, las sinopsis que falten se completan con
 * las de España: una segunda llamada, solo si hace falta, que queda cacheada
 * con la primera.
 */
export async function getSeason(
  id: number,
  season: number,
  language: Language = DEFAULT_LANGUAGE,
): Promise<SeasonDetail> {
  return withCache(`season:${id}:${season}:${language}`, SEASON_TTL, async () => {
    const data = await fetchTMDB<{
      season_number?: number;
      name?: string;
      episodes?: RawEpisode[];
    }>(`/tv/${id}/season/${season}`, {}, language);

    const episodes = (data.episodes ?? [])
      .map(trimEpisode)
      .filter((episode) => episode.episode_number > 0);

    if (language !== DEFAULT_LANGUAGE && episodes.some((episode) => !episode.overview)) {
      try {
        const fallback = await fetchTMDB<{ episodes?: RawEpisode[] }>(
          `/tv/${id}/season/${season}`,
          {},
          DEFAULT_LANGUAGE,
        );
        const overviews = new Map(
          (fallback.episodes ?? []).map((raw) => [
            Number(raw.episode_number),
            typeof raw.overview === 'string' ? raw.overview : '',
          ]),
        );
        for (const episode of episodes) {
          if (!episode.overview) {
            episode.overview = overviews.get(episode.episode_number) ?? '';
          }
        }
      } catch {
        // Sin respaldo, quedan las que había: una sinopsis que falta no
        // justifica perder la temporada entera.
      }
    }

    return {
      season_number: Number(data.season_number ?? season),
      name: data.name || `Temporada ${season}`,
      episodes,
    };
  });
}

/**
 * Una hora: el cron de avisos pide cada serie una sola vez por corrida, y esto
 * cubre una segunda corrida el mismo rato —un reintento, una prueba a mano—
 * sin repetirle las preguntas a TMDB.
 */
export const AIRING_TTL = 60 * 60;

/** El episodio próximo o el último de una serie, con lo que el aviso nombra. */
function trimAiringEpisode(value: unknown) {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as RawEpisode;
  return {
    air_date: typeof raw.air_date === 'string' ? raw.air_date : null,
    season_number: raw.season_number,
    episode_number: raw.episode_number,
    name: typeof raw.name === 'string' ? raw.name : '',
  };
}

/**
 * Lo que el cron de avisos necesita de una serie: el nombre y los episodios
 * de alrededor de hoy.
 *
 * Es la ficha sin `append_to_response`: el reparto, los videos y las
 * plataformas no le sirven a un aviso, y se piden cientos de estas por
 * corrida.
 */
export async function getAiring(id: number, language: Language = DEFAULT_LANGUAGE) {
  return withCache(`airing:${id}:${language}`, AIRING_TTL, async () => {
    const detail = await fetchTMDB<Record<string, unknown>>(`/tv/${id}`, {}, language);
    return {
      name: typeof detail.name === 'string' ? detail.name : '',
      next_episode_to_air: trimAiringEpisode(detail.next_episode_to_air),
      last_episode_to_air: trimAiringEpisode(detail.last_episode_to_air),
    };
  });
}

/**
 * Un día: lo que se busca para importar no cambia de un día para el otro, y
 * una importación grande repite pedidos si se corta y se vuelve a empezar.
 */
export const FIND_TTL = 60 * 60 * 24;

/** Un título candidato para lo que llega de otra app: lo justo para elegirlo. */
export interface FindCandidate {
  id: number;
  media_type: MediaType;
  title: string;
  original_title: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
}

function toCandidate(raw: Record<string, unknown>, mediaType: MediaType): FindCandidate | null {
  const id = Number(raw.id);
  const title = String((mediaType === 'movie' ? raw.title : raw.name) ?? '').trim();
  if (!Number.isInteger(id) || id <= 0 || !title) return null;
  const date = String((mediaType === 'movie' ? raw.release_date : raw.first_air_date) ?? '');
  const year = Number(date.slice(0, 4));
  return {
    id,
    media_type: mediaType,
    title,
    original_title: String((mediaType === 'movie' ? raw.original_title : raw.original_name) ?? title),
    year: Number.isInteger(year) && year > 0 ? year : null,
    poster_path: typeof raw.poster_path === 'string' ? raw.poster_path : null,
    backdrop_path: typeof raw.backdrop_path === 'string' ? raw.backdrop_path : null,
    genre_ids: Array.isArray(raw.genre_ids) ? raw.genre_ids.filter((genre): genre is number => typeof genre === 'number') : [],
  };
}

/** El id de IMDb: `tt` y los números. Es lo único externo que se acepta por ahora. */
export function parseImdbId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!/^tt\d{5,10}$/.test(id)) {
    throw new TmdbError("El parámetro 'imdb' debe ser un id de IMDb (tt…).", 400);
  }
  return id;
}

/** El año de estreno, si viene: sin él la búsqueda es por título solo. */
export function parseReleaseYear(value: unknown): number | undefined {
  return parseYear(value, 'year');
}

/** Cuántos candidatos devuelve una búsqueda: con más no se elige mejor. */
const MAX_FIND_RESULTS = 10;

/**
 * El título de TMDB para un id de IMDb (`/find`, con `external_source`
 * fijo): el match exacto de un export de IMDb. Películas y series, no
 * personas ni episodios sueltos.
 */
export async function findByImdbId(imdbId: string, language: Language = DEFAULT_LANGUAGE) {
  return withCache(`find:imdb:${imdbId}:${language}`, FIND_TTL, async () => {
    const data = await fetchTMDB<{ movie_results?: Record<string, unknown>[]; tv_results?: Record<string, unknown>[] }>(
      `/find/${imdbId}`,
      { external_source: 'imdb_id' },
      language,
    );
    return [
      ...(data.movie_results ?? []).map((raw) => toCandidate(raw, 'movie')),
      ...(data.tv_results ?? []).map((raw) => toCandidate(raw, 'tv')),
    ].filter((candidate): candidate is FindCandidate => candidate !== null);
  });
}

/**
 * Una película o una serie por título y año: el match de un export que no
 * trae ids (Letterboxd). El año va en el filtro que corresponde a cada tipo.
 */
export async function searchByTitle(
  mediaType: MediaType,
  query: string,
  year: number | undefined,
  language: Language = DEFAULT_LANGUAGE,
) {
  const key = `find:${mediaType}:${query.toLowerCase()}:${year ?? ''}:${language}`;
  return withCache(key, FIND_TTL, async () => {
    const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
      `/search/${mediaType}`,
      {
        query,
        ...(year !== undefined
          ? { [mediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year']: String(year) }
          : {}),
      },
      language,
    );
    return (data.results ?? [])
      .slice(0, MAX_FIND_RESULTS)
      .map((raw) => toCandidate(raw, mediaType))
      .filter((candidate): candidate is FindCandidate => candidate !== null);
  });
}

/** Valida el `mediaType` que llega por la request antes de pegarle a TMDB. */
export function parseMediaType(value: unknown): MediaType {
  if (value === 'movie' || value === 'tv') return value;
  throw new TmdbError("El parámetro 'type' debe ser 'movie' o 'tv'.", 400);
}

/** Valida el id numérico que llega por la request. */
export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TmdbError("El parámetro 'id' debe ser un entero positivo.", 400);
  }
  return id;
}

/** Normaliza cualquier error a un par `{ status, body }` listo para responder. */
export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string };
} {
  if (error instanceof TmdbError) {
    return { status: error.status, body: { error: error.message } };
  }
  console.error('[tmdb] Error inesperado:', error);
  return { status: 500, body: { error: 'Error interno del servidor.' } };
}

// ---------------------------------------------------------------------------
// Descubrimiento: filas armadas por criterio, filmografías y sagas.
//
// Son la materia prima de Explorar. Igual que las recomendaciones, ninguna de
// estas respuestas depende de quién pregunta: el servidor no sabe —ni necesita
// saber— qué vio nadie. El front pide "películas de terror bien puntuadas" o
// "qué más dirigió esta persona", y cruza lo que recibe con su propia
// biblioteca.
// ---------------------------------------------------------------------------

/** Cómo se ordena una fila de descubrimiento. */
export type DiscoverSort = 'popular' | 'rating' | 'recent';

/**
 * Los criterios que acepta `/api/tmdb/discover`.
 *
 * Es una lista blanca y no un passthrough a TMDB a propósito: la ruta es
 * pública y sin ella cualquiera podría usar nuestra API key para consultar
 * TMDB con parámetros arbitrarios.
 */
export interface DiscoverQuery {
  mediaType: MediaType;
  /** Se piden todos juntos: `28,35` es "acción **y** comedia". */
  genres: number[];
  withoutGenres: number[];
  /** Años, inclusive. */
  from?: number;
  to?: number;
  /** Idioma original, ISO 639-1: lo que se filma en coreano, no lo que se lee. */
  originalLanguage?: string;
  keyword?: number;
  /** Id de la productora, para las filas que salen de un estudio. */
  company?: number;
  /** Nombre de la plataforma, tal como lo guarda la biblioteca. */
  provider?: string;
  /** País cuyo catálogo se consulta. Obligatorio si hay `provider`. */
  region?: string;
  maxRuntime?: number;
  minRuntime?: number;
  sort: DiscoverSort;
  /** En qué idioma vienen los títulos, como en el resto de los endpoints. */
  lang: Language;
}

/** Cuántos votos pedimos según el orden, para que no salga cualquier cosa. */
const MIN_VOTES: Record<DiscoverSort, number> = {
  // Ordenar por puntaje sin piso devuelve títulos con cuatro votos y un 10.
  rating: 300,
  popular: 50,
  recent: 20,
};

const MAX_GENRES = 3;

function parseIntParam(value: unknown, name: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new TmdbError(`El parámetro '${name}' debe ser un entero positivo.`, 400);
  }
  return num;
}

function parseGenreList(value: unknown, name: string): number[] {
  if (value === undefined || value === '') return [];
  const ids = String(value)
    .split(',')
    .map((part) => parseIntParam(part.trim(), name));

  if (ids.length > MAX_GENRES) {
    throw new TmdbError(
      `El parámetro '${name}' admite hasta ${MAX_GENRES} géneros.`,
      400,
    );
  }
  return ids;
}

function parseYear(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new TmdbError(`El parámetro '${name}' debe ser un año válido.`, 400);
  }
  return year;
}

function parseDiscoverSort(value: unknown): DiscoverSort {
  if (value === undefined || value === 'popular') return 'popular';
  if (value === 'rating' || value === 'recent') return value;
  throw new TmdbError(
    "El parámetro 'sort' debe ser 'popular', 'rating' o 'recent'.",
    400,
  );
}

/** Valida los criterios que llegan por la request. */
export function parseDiscoverQuery(
  query: Record<string, unknown>,
): DiscoverQuery {
  /**
   * `lang` es el idioma de los textos, como en todos los endpoints, y el
   * idioma original se pide con `original`.
   *
   * Antes `lang` era el original, y un cliente que ya estaba abierto cuando
   * cambió lo sigue mandando así: `lang=ko`. Un código pelado, sin región, no
   * puede ser un idioma de textos de la lista blanca, así que se lo lee como
   * el original que quería decir en vez de rechazar la fila entera.
   */
  const legacyOriginal =
    typeof query.lang === 'string' && /^[a-z]{2,3}$/.test(query.lang)
      ? query.lang
      : undefined;

  const originalLanguage =
    query.original === undefined || query.original === ''
      ? legacyOriginal
      : String(query.original);
  if (originalLanguage !== undefined && !/^[a-z]{2,3}$/.test(originalLanguage)) {
    throw new TmdbError(
      "El parámetro 'original' debe ser un código ISO 639-1.",
      400,
    );
  }

  const region =
    query.region === undefined || query.region === ''
      ? undefined
      : String(query.region);
  if (region !== undefined && !/^[A-Z]{2}$/.test(region)) {
    throw new TmdbError("El parámetro 'region' debe ser un código ISO 3166-1.", 400);
  }

  const provider =
    query.provider === undefined || query.provider === ''
      ? undefined
      : String(query.provider).slice(0, 60);
  if (provider !== undefined && region === undefined) {
    throw new TmdbError(
      "El parámetro 'provider' necesita también 'region': un catálogo de streaming es distinto en cada país.",
      400,
    );
  }

  return {
    mediaType: parseMediaType(query.type),
    genres: parseGenreList(query.genre, 'genre'),
    withoutGenres: parseGenreList(query.without, 'without'),
    from: parseYear(query.from, 'from'),
    to: parseYear(query.to, 'to'),
    originalLanguage,
    keyword:
      query.keyword === undefined || query.keyword === ''
        ? undefined
        : parseIntParam(query.keyword, 'keyword'),
    company:
      query.company === undefined || query.company === ''
        ? undefined
        : parseIntParam(query.company, 'company'),
    provider,
    region,
    maxRuntime:
      query.maxRuntime === undefined || query.maxRuntime === ''
        ? undefined
        : parseIntParam(query.maxRuntime, 'maxRuntime'),
    minRuntime:
      query.minRuntime === undefined || query.minRuntime === ''
        ? undefined
        : parseIntParam(query.minRuntime, 'minRuntime'),
    sort: parseDiscoverSort(query.sort),
    lang: parseLanguage(legacyOriginal ? undefined : query.lang),
  };
}

/** Clave de caché estable: los mismos criterios, en el mismo orden, siempre. */
function discoverCacheKey(query: DiscoverQuery): string {
  return [
    'discover',
    query.mediaType,
    query.genres.join('+'),
    query.withoutGenres.join('-'),
    query.from ?? '',
    query.to ?? '',
    query.originalLanguage ?? '',
    query.keyword ?? '',
    query.company ?? '',
    query.provider ?? '',
    query.region ?? '',
    query.minRuntime ?? '',
    query.maxRuntime ?? '',
    query.sort,
    query.lang,
  ].join(':');
}

/**
 * El id que TMDB le da a una plataforma, a partir de su nombre.
 *
 * La biblioteca guarda "Netflix", no el 8: el nombre es lo que se muestra en la
 * ficha. Resolverlo acá contra la lista real de TMDB evita una tabla de ids
 * escrita a mano que envejece mal — las plataformas se fusionan y se renombran
 * seguido, y un id equivocado no falla: devuelve títulos de otra plataforma,
 * que es peor.
 */
async function getProviderId(
  mediaType: MediaType,
  region: string,
  name: string,
): Promise<number | null> {
  const providers = await providerList(mediaType, region);

  const wanted = name.trim().toLowerCase();
  return (
    providers.find((provider) => provider.provider_name.toLowerCase() === wanted)
      ?.provider_id ?? null
  );
}

interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
  display_priority?: number;
  display_priorities?: Record<string, number>;
}

/**
 * La lista de plataformas de TMDB para una región, tal como viene.
 *
 * La comparten la resolución de nombres de `/discover` y `/api/tmdb/providers`:
 * es la misma llamada, así que es la misma entrada de la caché.
 */
function providerList(mediaType: MediaType, region: string): Promise<RawProvider[]> {
  return withCache(`providers:${mediaType}:${region}`, PROVIDERS_TTL, async () => {
    const data = await fetchTMDB<{ results?: RawProvider[] }>(
      `/watch/providers/${mediaType}`,
      { watch_region: region },
    );
    return data.results ?? [];
  });
}

/** Una plataforma, con lo que la app muestra y nada más. */
export interface ProviderInfo {
  id: number;
  name: string;
  logoPath: string | null;
  /** El orden en que TMDB la muestra en esa región: menos es más arriba. */
  priority: number;
}

/** Valida el país: dos letras mayúsculas, ISO 3166-1. */
export function parseRegion(value: unknown): string {
  if (typeof value === 'string' && /^[A-Z]{2}$/.test(value)) return value;
  throw new TmdbError("El parámetro 'region' debe ser un código ISO 3166-1.", 400);
}

/**
 * Las plataformas de streaming de una región, en el orden en que se muestran
 * ahí: primero las que más se usan.
 *
 * El orden es el de la región y no el global, que es el que manda TMDB por
 * defecto: en Argentina Flow va arriba y en España, no. Sin orden de la región
 * se usa el global, y sin ninguno, al final.
 */
export async function getProviders(
  mediaType: MediaType,
  region: string,
): Promise<ProviderInfo[]> {
  const providers = await providerList(mediaType, region);

  return providers
    .filter((provider) => Number.isInteger(provider.provider_id) && provider.provider_name)
    .map((provider) => ({
      id: provider.provider_id,
      name: provider.provider_name,
      logoPath: provider.logo_path ?? null,
      priority:
        provider.display_priorities?.[region] ?? provider.display_priority ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/** Los parámetros de TMDB que salen de unos criterios ya validados. */
function discoverParams(
  query: DiscoverQuery,
  providerId: number | null,
): Record<string, string> {
  const isMovie = query.mediaType === 'movie';
  const dateField = isMovie ? 'primary_release_date' : 'first_air_date';
  const today = new Date().toISOString().slice(0, 10);

  const sortBy: Record<DiscoverSort, string> = {
    popular: 'popularity.desc',
    rating: 'vote_average.desc',
    recent: `${dateField}.desc`,
  };

  const params: Record<string, string> = {
    sort_by: sortBy[query.sort],
    include_adult: 'false',
    'vote_count.gte': String(MIN_VOTES[query.sort]),
  };

  if (query.genres.length > 0) params.with_genres = query.genres.join(',');
  if (query.withoutGenres.length > 0) {
    params.without_genres = query.withoutGenres.join(',');
  }
  if (query.from) params[`${dateField}.gte`] = `${query.from}-01-01`;
  // Nada de estrenos que todavía no estrenaron: con `recent` serían la lista
  // entera, y son títulos que nadie puede mirar esta noche.
  const upperDate = query.to ? `${query.to}-12-31` : today;
  params[`${dateField}.lte`] = upperDate < today ? upperDate : today;

  if (query.originalLanguage) {
    params.with_original_language = query.originalLanguage;
  }
  if (query.keyword) params.with_keywords = String(query.keyword);
  if (query.company) params.with_companies = String(query.company);
  if (query.minRuntime) params['with_runtime.gte'] = String(query.minRuntime);
  if (query.maxRuntime) params['with_runtime.lte'] = String(query.maxRuntime);
  if (providerId !== null && query.region) {
    params.with_watch_providers = String(providerId);
    params.watch_region = query.region;
  }

  return params;
}

/**
 * Títulos que cumplen un criterio: de terror, de los 90, en tu plataforma.
 *
 * Si se pidió una plataforma que TMDB no conoce con ese nombre, devuelve vacío
 * en vez de fallar: quien llama esconde la fila y no pasa nada. Un error 500
 * por una plataforma renombrada sería mucho ruido para tan poco.
 */
export async function getDiscover(query: DiscoverQuery) {
  return withCache(discoverCacheKey(query), DISCOVER_TTL, async () => {
    let providerId: number | null = null;
    if (query.provider && query.region) {
      providerId = await getProviderId(
        query.mediaType,
        query.region,
        query.provider,
      );
      if (providerId === null) return [];
    }

    const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
      `/discover/${query.mediaType}`,
      discoverParams(query, providerId),
      query.lang,
    );

    // `/discover` no devuelve `media_type` —el tipo está en la ruta—, igual que
    // `/popular` y `/top_rated`.
    return (data.results ?? []).map((result) => ({
      ...result,
      media_type: query.mediaType,
    }));
  });
}

/** Qué se le pide a la filmografía de alguien: lo que actuó o lo que dirigió. */
export type PersonRole = 'reparto' | 'direccion';

export function parsePersonRole(value: unknown): PersonRole {
  if (value === undefined || value === 'reparto') return 'reparto';
  if (value === 'direccion') return 'direccion';
  throw new TmdbError("El parámetro 'role' debe ser 'reparto' o 'direccion'.", 400);
}

/** Cuántos trabajos devolvemos de una persona. Una fila no muestra más. */
const MAX_CREDITS = 40;

/** Un crédito de `combined_credits`, con lo poco que se mira para ordenarlo. */
type Credit = Record<string, unknown> & {
  media_type?: string;
  id?: number;
  vote_count?: number;
  popularity?: number;
};

/**
 * Qué más hizo alguien: su filmografía, de lo más conocido a lo menos.
 *
 * Se usa `combined_credits` y no `/discover` porque `/discover/tv` no filtra
 * por persona: sembrando desde una serie, un actor no tendría con qué
 * responder. Acá vienen las películas y las series en la misma lista.
 *
 * El orden es por cantidad de votos y no por popularidad: la popularidad de
 * TMDB premia lo reciente, y la pregunta que responde esta fila es "qué más
 * hizo que valga la pena", no "qué hizo último".
 */
export async function getPersonCredits(
  id: number,
  role: PersonRole,
  language: Language = DEFAULT_LANGUAGE,
) {
  // El idioma es por los títulos de la filmografía, no por el nombre de la
  // persona, que TMDB no traduce.
  return withCache(`person:${id}:${role}:${language}`, PERSON_TTL, async () => {
    const data = await fetchTMDB<{
      cast?: Record<string, unknown>[];
      crew?: Record<string, unknown>[];
    }>(`/person/${id}/combined_credits`, {}, language);

    const credits =
      role === 'direccion'
        ? (data.crew ?? []).filter(
            (credit) => credit.job === 'Director' || credit.job === 'Creator',
          )
        : (data.cast ?? []);

    return onlyMoviesAndShows<Credit>(credits as Credit[])
      .filter(
        (credit, index, list) =>
          // `combined_credits` repite un título por cada papel o tarea: quien
          // dirigió y además escribió aparece dos veces.
          list.findIndex((other) => other.id === credit.id) === index,
      )
      .sort(
        (a, b) =>
          Number(b.vote_count ?? 0) - Number(a.vote_count ?? 0) ||
          Number(b.popularity ?? 0) - Number(a.popularity ?? 0),
      )
      .slice(0, MAX_CREDITS);
  });
}

/**
 * Las partes de una saga, de la primera a la última.
 *
 * Es lo que permite decirte que viste la segunda y la tercera pero nunca la
 * primera.
 */
export async function getSaga(id: number, language: Language = DEFAULT_LANGUAGE) {
  return withCache(`saga:${id}:${language}`, PERSON_TTL, async () => {
    const data = await fetchTMDB<{ parts?: Record<string, unknown>[] }>(
      `/collection/${id}`,
      {},
      language,
    );
    return (data.parts ?? [])
      .sort((a, b) =>
        String(a.release_date ?? '').localeCompare(String(b.release_date ?? '')),
      )
      .map((part) => ({ ...part, media_type: 'movie' as const }));
  });
}

/**
 * Títulos parecidos a uno dado, por la otra puerta.
 *
 * `/recommendations` es colaborativo —lo arma quien mira qué— y `/similar` es
 * por metadatos: género, palabras clave, época. Devuelven cosas distintas para
 * el mismo título, y eso es justamente lo que se busca: dos filas sembradas
 * con la misma película que no sean la misma fila.
 */
export async function getSimilar(
  mediaType: MediaType,
  id: number,
  language: Language = DEFAULT_LANGUAGE,
) {
  return withCache(
    `similar:${mediaType}:${id}:${language}`,
    RECOMMENDATIONS_TTL,
    async () => {
      const data = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
        `/${mediaType}/${id}/similar`,
        {},
        language,
      );
      return (data.results ?? []).map((result) => ({
        media_type: mediaType,
        ...result,
      }));
    },
  );
}
