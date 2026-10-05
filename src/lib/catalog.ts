/**
 * El catálogo: todo TMDB, filtrado a mano.
 *
 * Explorar elige por vos; el catálogo es para cuando sabés lo que buscás
 * —"una serie coreana de crimen en Netflix"—. Por eso muestra todo: no aplica
 * "Lo que no te interesa", que está pensado para las filas que se arman
 * solas, no para una búsqueda a propósito.
 *
 * Es lógica pura: los filtros, cómo viven en la URL y qué se le pide a
 * `/discover` con ellos. La vista y los hooks solo los conectan.
 */
import { DiscoverParams } from '@/lib/tmdb';
import { genresFor, getGenreId } from '@/lib/genres';
import { MediaType, TMDbResult } from '@/types';

export type CatalogSort = 'popular' | 'rating' | 'recent';
export type CatalogDecade = '2020' | '2010' | '2000' | '1990' | '1980' | 'antes';
export type CatalogRuntime = 'corta' | 'media' | 'larga';

export interface CatalogFilters {
  type: MediaType;
  /** Por nombre, como en la biblioteca. Alcanza con que tenga uno. */
  genres: string[];
  /** Ids de TMDB. Alcanza con que esté incluido en una. */
  providers: number[];
  decade: CatalogDecade | null;
  /** Solo películas: en una serie, la duración es la de un episodio. */
  runtime: CatalogRuntime | null;
  /** Idioma original, ISO 639-1. */
  language: string | null;
  sort: CatalogSort;
  /** Esconder lo que ya está en la biblioteca, en cualquier estado. */
  hideSaved: boolean;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  type: 'movie',
  genres: [],
  providers: [],
  decade: null,
  runtime: null,
  language: null,
  sort: 'popular',
  hideSaved: false,
};

/** Los topes de `/discover`: más de eso el servidor lo rechaza con un 400. */
export const MAX_CATALOG_GENRES = 5;
export const MAX_CATALOG_PROVIDERS = 30;

export const CATALOG_SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'popular', label: 'Populares' },
  { value: 'rating', label: 'Mejor puntuadas' },
  { value: 'recent', label: 'Recientes' },
];

export const CATALOG_DECADES: {
  value: CatalogDecade;
  label: string;
  from?: number;
  to: number;
}[] = [
  { value: '2020', label: '2020s', from: 2020, to: 2029 },
  { value: '2010', label: '2010s', from: 2010, to: 2019 },
  { value: '2000', label: '2000s', from: 2000, to: 2009 },
  { value: '1990', label: '90s', from: 1990, to: 1999 },
  { value: '1980', label: '80s', from: 1980, to: 1989 },
  { value: 'antes', label: 'Antes de 1980', to: 1979 },
];

export const CATALOG_RUNTIMES: {
  value: CatalogRuntime;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { value: 'corta', label: 'Menos de 90 min', max: 89 },
  { value: 'media', label: '90 a 120 min', min: 90, max: 120 },
  { value: 'larga', label: 'Más de 2 horas', min: 121 },
];

/**
 * Los idiomas originales que se ofrecen. Pocos a propósito: son los que más
 * se buscan, y una fila de cuarenta idiomas no la recorre nadie.
 */
export const CATALOG_LANGUAGES: { value: string; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'ko', label: 'Coreano' },
  { value: 'ja', label: 'Japonés' },
  { value: 'fr', label: 'Francés' },
  { value: 'it', label: 'Italiano' },
  { value: 'de', label: 'Alemán' },
  { value: 'pt', label: 'Portugués' },
];

/** Nombres de los parámetros en la URL, en español para que el link se lea. */
const PARAMS = {
  type: 'tipo',
  genres: 'genero',
  providers: 'plataforma',
  decade: 'epoca',
  runtime: 'duracion',
  language: 'idioma',
  sort: 'orden',
  hideSaved: 'ocultar',
} as const;

function oneOf<V extends string>(
  value: string | null,
  options: { value: V }[],
): V | null {
  return options.find((option) => option.value === value)?.value ?? null;
}

function splitList(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Los filtros que dice una URL.
 *
 * Una URL es algo que alguien escribió, copió o recortó: lo que no se entiende
 * se ignora en vez de romper la vista, y un género que no existe en el tipo
 * elegido —terror en series— se cae solo.
 */
export function parseCatalogFilters(params: URLSearchParams): CatalogFilters {
  const type: MediaType = params.get(PARAMS.type) === 'tv' ? 'tv' : 'movie';
  const validGenres = new Set(genresFor(type));

  const genres = Array.from(
    new Set(splitList(params.get(PARAMS.genres)).filter((name) => validGenres.has(name))),
  ).slice(0, MAX_CATALOG_GENRES);

  const providers = Array.from(
    new Set(
      splitList(params.get(PARAMS.providers))
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ).slice(0, MAX_CATALOG_PROVIDERS);

  return {
    type,
    genres,
    providers,
    decade: oneOf(params.get(PARAMS.decade), CATALOG_DECADES),
    runtime: type === 'movie' ? oneOf(params.get(PARAMS.runtime), CATALOG_RUNTIMES) : null,
    language: oneOf(params.get(PARAMS.language), CATALOG_LANGUAGES),
    sort: oneOf(params.get(PARAMS.sort), CATALOG_SORTS) ?? DEFAULT_CATALOG_FILTERS.sort,
    hideSaved: params.get(PARAMS.hideSaved) === '1',
  };
}

/**
 * Escribe los filtros en la URL, encima de lo que ya tenía.
 *
 * Los valores por defecto se sacan en vez de escribirse —un catálogo sin
 * filtrar tiene la URL limpia—, y lo que no es del catálogo, como un `?ficha=`,
 * se deja como estaba.
 */
export function writeCatalogFilters(
  current: URLSearchParams,
  filters: CatalogFilters,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const values: Record<keyof typeof PARAMS, string | null> = {
    type: filters.type === DEFAULT_CATALOG_FILTERS.type ? null : filters.type,
    genres: filters.genres.length > 0 ? filters.genres.join(',') : null,
    providers: filters.providers.length > 0 ? filters.providers.join(',') : null,
    decade: filters.decade,
    runtime: filters.runtime,
    language: filters.language,
    sort: filters.sort === DEFAULT_CATALOG_FILTERS.sort ? null : filters.sort,
    hideSaved: filters.hideSaved ? '1' : null,
  };

  for (const [key, value] of Object.entries(values)) {
    const param = PARAMS[key as keyof typeof PARAMS];
    if (value === null) next.delete(param);
    else next.set(param, value);
  }
  return next;
}

/**
 * El género que más se le parece del otro lado.
 *
 * TMDB no comparte la tabla: en series no hay "Acción" sino "Acción y
 * Aventura", ni "Ciencia Ficción" sino "Sci-Fi y Fantasía". Quien filtró
 * acción y pasa a series quiere seguir viendo acción, no perder el filtro.
 */
const GENRE_COUNTERPARTS: Record<MediaType, Record<string, string>> = {
  tv: {
    Acción: 'Acción y Aventura',
    Aventura: 'Acción y Aventura',
    'Ciencia Ficción': 'Sci-Fi y Fantasía',
    Fantasía: 'Sci-Fi y Fantasía',
    Bélica: 'Guerra y Política',
  },
  movie: {
    'Acción y Aventura': 'Acción',
    'Sci-Fi y Fantasía': 'Ciencia Ficción',
    'Guerra y Política': 'Bélica',
  },
};

/**
 * Los filtros al pasar de películas a series o al revés.
 *
 * Los géneros se traducen al equivalente del otro tipo y los que no tienen
 * equivalente se caen; la duración, que en series no se puede pedir, también.
 */
export function switchCatalogType(filters: CatalogFilters, type: MediaType): CatalogFilters {
  if (filters.type === type) return filters;

  const valid = new Set(genresFor(type));
  const genres = Array.from(
    new Set(
      filters.genres
        .map((name) => (valid.has(name) ? name : GENRE_COUNTERPARTS[type][name]))
        .filter((name): name is string => Boolean(name)),
    ),
  );

  return {
    ...filters,
    type,
    genres,
    runtime: type === 'movie' ? filters.runtime : null,
  };
}

/** Una plataforma como la conoce el catálogo: su id y cómo se llama. */
export interface CatalogProvider {
  id: number;
  name: string;
}

/** Cuántas plataformas del país se ofrecen además de las tuyas. */
const PROVIDER_OPTIONS = 15;

/**
 * Las plataformas que se ofrecen como filtro, en orden.
 *
 * Primero las que pagás, que son las que más se van a tocar; después las más
 * usadas del país, y al final las elegidas que no entraron en ninguna de las
 * dos —una URL compartida desde otro país—, para poder sacarlas.
 */
export function catalogProviderOptions(
  regionProviders: CatalogProvider[],
  subscribed: CatalogProvider[],
  selected: number[],
  limit = PROVIDER_OPTIONS,
): CatalogProvider[] {
  const options = new Map<number, CatalogProvider>();
  for (const provider of subscribed) options.set(provider.id, provider);
  for (const provider of regionProviders.slice(0, limit)) {
    if (!options.has(provider.id)) options.set(provider.id, provider);
  }
  for (const id of selected) {
    if (options.has(id)) continue;
    const known = regionProviders.find((provider) => provider.id === id);
    if (known) options.set(id, known);
  }
  return Array.from(options.values());
}

/** El valor de la píldora "Mis plataformas", que no es el id de ninguna. */
export const MY_PROVIDERS = 'mias';

/** Si lo elegido son exactamente las plataformas que pagás. */
export function isMyProviders(selected: number[], mine: number[]): boolean {
  if (mine.length === 0 || selected.length !== mine.length) return false;
  const set = new Set(mine);
  return selected.every((id) => set.has(id));
}

/**
 * Lo que muestra la fila de plataformas: "Mis plataformas" prendida cuando lo
 * elegido son justo las tuyas, y si no, cada una por separado.
 */
export function providerRailValue(selected: number[], mine: number[]): string[] {
  return isMyProviders(selected, mine) ? [MY_PROVIDERS] : selected.map(String);
}

/**
 * Las plataformas elegidas después de tocar una píldora de la fila.
 *
 * Tocar "Mis plataformas" elige todas las tuyas de una vez. Con eso prendido,
 * tocar otra la deja sola a ella: lo más probable es que quieras mirar una en
 * particular, no las tuyas más esa.
 */
export function nextProviders(railValue: string[], selected: number[], mine: number[]): number[] {
  const mineWasOn = isMyProviders(selected, mine);
  const others = railValue
    .filter((value) => value !== MY_PROVIDERS)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!mineWasOn && railValue.includes(MY_PROVIDERS)) return [...mine];
  return others.slice(0, MAX_CATALOG_PROVIDERS);
}

/** Si hay algo filtrado, sin contar el tipo ni el orden: es lo que limpia "Limpiar filtros". */
export function hasActiveCatalogFilters(filters: CatalogFilters): boolean {
  return (
    filters.genres.length > 0 ||
    filters.providers.length > 0 ||
    filters.decade !== null ||
    filters.runtime !== null ||
    filters.language !== null ||
    filters.hideSaved
  );
}

/** Los filtros sin nada filtrado, conservando el tipo y el orden que se eligieron. */
export function clearCatalogFilters(filters: CatalogFilters): CatalogFilters {
  return { ...DEFAULT_CATALOG_FILTERS, type: filters.type, sort: filters.sort };
}

/**
 * Lo que se le pide a `/discover` para una página del catálogo.
 *
 * Los géneros van con "o": quien marca acción y comedia espera las dos cosas,
 * no solo las comedias de acción. Las plataformas, con la región, porque el
 * catálogo de cada una cambia de país en país.
 */
export function catalogDiscoverParams(
  filters: CatalogFilters,
  region: string,
  page = 1,
): DiscoverParams {
  const genres = filters.genres
    .map((name) => getGenreId(name, filters.type))
    .filter((id): id is number => id !== undefined);
  const decade = CATALOG_DECADES.find((option) => option.value === filters.decade);
  const runtime =
    filters.type === 'movie'
      ? CATALOG_RUNTIMES.find((option) => option.value === filters.runtime)
      : undefined;

  return {
    mediaType: filters.type,
    sort: filters.sort,
    page,
    ...(genres.length > 0 ? { genres, genreMatch: 'any' as const } : {}),
    ...(filters.providers.length > 0 ? { providers: filters.providers, region } : {}),
    ...(decade?.from ? { from: decade.from } : {}),
    ...(decade ? { to: decade.to } : {}),
    ...(runtime?.min ? { minRuntime: runtime.min } : {}),
    ...(runtime?.max ? { maxRuntime: runtime.max } : {}),
    ...(filters.language ? { originalLanguage: filters.language } : {}),
  };
}

/**
 * Una clave que cambia cuando cambia lo que hay que pedir, y solo entonces.
 *
 * "Ocultar lo que ya tengo" no entra: se resuelve con lo ya traído, sin volver
 * a preguntarle nada a TMDB.
 */
export function catalogQueryKey(filters: CatalogFilters, region: string): string {
  return JSON.stringify(catalogDiscoverParams(filters, region));
}

/**
 * Suma una página nueva a lo que ya se mostraba.
 *
 * Mientras se scrollea, la popularidad en TMDB se mueve y un título puede
 * pasar de la página 2 a la 3: sin esto aparecería dos veces en la grilla.
 */
export function appendCatalogPage(current: TMDbResult[], incoming: TMDbResult[]): TMDbResult[] {
  const seen = new Set(current.map((result) => titleKey(result.media_type, result.id)));
  const fresh = incoming.filter((result) => {
    const key = titleKey(result.media_type, result.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return fresh.length > 0 ? [...current, ...fresh] : current;
}

/**
 * Cómo se identifica un título sin confundirlo con otro: una película y una
 * serie pueden tener el mismo id en TMDB.
 */
export function titleKey(mediaType: MediaType, id: number): string {
  return `${mediaType}-${id}`;
}

/**
 * Lo que se muestra: todo, o sin lo que ya está en la biblioteca.
 * `savedKeys` son las claves de {@link titleKey} de lo guardado.
 */
export function visibleCatalogResults(
  results: TMDbResult[],
  savedKeys: ReadonlySet<string>,
  hideSaved: boolean,
): TMDbResult[] {
  if (!hideSaved) return results;
  return results.filter((result) => !savedKeys.has(titleKey(result.media_type, result.id)));
}
