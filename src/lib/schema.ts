import {
  MediaStatus,
  MediaType,
  SavedMedia,
  SeasonInfo,
  SeriesProgress,
  WatchEntry,
} from '@/types';

/**
 * Versión del formato de la biblioteca.
 *
 * - **v1** — un único `review` por título.
 * - **v2** — `history` con todas las veces que lo viste, más progreso por
 *   episodio, tags, plataformas y colecciones.
 *
 * Todo lo que entra a la app pasa por {@link parseMedia}: los documentos de
 * Firestore, lo que había en localStorage y los backups importados. Así la
 * migración vive en un solo lugar en vez de repartida en cada punto de lectura.
 */
export const SCHEMA_VERSION = 2;

const VALID_STATUSES: MediaStatus[] = ['por_ver', 'viendo', 'completada'];
const VALID_TYPES: MediaType[] = ['movie', 'tv'];

/** Id para una entrada del historial. */
export function newWatchId(): string {
  // `randomUUID` no está en todos lados (contextos inseguros, jsdom viejo), así
  // que hay un plan B: el id solo tiene que ser único dentro de un título.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isoOrNow(value: unknown): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : new Date().toISOString();
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && !!item);
}

/** Puntajes por temporada: las claves llegan como texto desde JSON. */
function parseSeasonRatings(value: unknown): Record<number, number> | undefined {
  if (!isRecord(value)) return undefined;

  const result: Record<number, number> = {};
  for (const [key, rating] of Object.entries(value)) {
    const season = Number(key);
    const score = Number(rating);
    if (Number.isInteger(season) && score >= 0 && score <= 5) {
      result[season] = score;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseWatchEntry(value: unknown): WatchEntry | null {
  if (!isRecord(value)) return null;

  const rating = Number(value.rating);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return null;

  const tags = parseStringArray(value.tags);

  return {
    id: typeof value.id === 'string' && value.id ? value.id : newWatchId(),
    rating,
    text: typeof value.text === 'string' && value.text ? value.text : undefined,
    tags: tags.length > 0 ? tags : undefined,
    seasonRatings: parseSeasonRatings(value.seasonRatings),
    completedAt: isoOrNow(value.completedAt),
  };
}

/**
 * Historial del título, de la vez más reciente a la más vieja.
 *
 * Acá está la migración de v1: un documento viejo trae un `review` suelto, que
 * se convierte en la única entrada del historial.
 */
function parseHistory(raw: Record<string, unknown>): WatchEntry[] {
  const fromHistory = Array.isArray(raw.history)
    ? raw.history.map(parseWatchEntry).filter((entry): entry is WatchEntry => entry !== null)
    : [];

  if (fromHistory.length > 0) {
    return fromHistory.sort(
      (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
    );
  }

  const legacy = parseWatchEntry(raw.review);
  return legacy ? [legacy] : [];
}

function parseSeasons(value: unknown): SeasonInfo[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seasons = value
    .map((season) => {
      if (!isRecord(season)) return null;
      // Se aceptan las dos formas: la nuestra y la cruda de TMDB, porque una
      // biblioteca vieja puede tener cualquiera de las dos.
      const seasonNumber = Number(season.seasonNumber ?? season.season_number);
      const episodeCount = Number(season.episodeCount ?? season.episode_count);
      if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return null;
      if (!Number.isInteger(episodeCount) || episodeCount < 0) return null;

      return {
        seasonNumber,
        name:
          typeof season.name === 'string' && season.name
            ? season.name
            : `Temporada ${seasonNumber}`,
        episodeCount,
      };
    })
    .filter((season): season is SeasonInfo => season !== null);

  return seasons.length > 0 ? seasons : undefined;
}

function parseProgress(value: unknown): SeriesProgress | undefined {
  if (!isRecord(value) || !isRecord(value.watched)) return undefined;

  const watched: Record<number, number[]> = {};
  for (const [key, episodes] of Object.entries(value.watched)) {
    const season = Number(key);
    if (!Number.isInteger(season) || season < 0 || !Array.isArray(episodes)) {
      continue;
    }

    const clean = Array.from(
      new Set(
        episodes
          .map(Number)
          .filter((episode) => Number.isInteger(episode) && episode > 0),
      ),
    ).sort((a, b) => a - b);

    if (clean.length > 0) watched[season] = clean;
  }

  if (Object.keys(watched).length === 0) return undefined;

  return {
    watched,
    lastWatchedAt:
      typeof value.lastWatchedAt === 'string' ? value.lastWatchedAt : undefined,
  };
}

/** Un número finito, o `undefined` si no lo es. Admite el cero y los negativos. */
function parseFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/**
 * Valida y normaliza un título venga de donde venga, migrándolo si es de una
 * versión vieja del schema.
 *
 * Devuelve `null` en vez de tirar: un título corrupto no debería voltear la
 * lectura entera de la biblioteca; quien llama decide si lo descarta en
 * silencio o lo cuenta.
 */
export function parseMedia(value: unknown): SavedMedia | null {
  if (!isRecord(value)) return null;

  const tmdbId = Number(value.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const mediaType = value.mediaType as MediaType;
  if (!VALID_TYPES.includes(mediaType)) return null;

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) return null;

  const history = parseHistory(value);
  const declaredStatus = VALID_STATUSES.includes(value.status as MediaStatus)
    ? (value.status as MediaStatus)
    : 'por_ver';

  return {
    tmdbId,
    mediaType,
    title,
    posterPath: typeof value.posterPath === 'string' ? value.posterPath : null,
    backdropPath:
      typeof value.backdropPath === 'string' ? value.backdropPath : null,
    releaseYear: typeof value.releaseYear === 'string' ? value.releaseYear : '',
    genres: parseStringArray(value.genres),
    // Haber terminado algo alguna vez implica el estado "completada", aunque el
    // documento diga otra cosa: es la regla que aplica el store al guardar.
    status: history.length > 0 ? 'completada' : declaredStatus,
    updatedAt: isoOrNow(value.updatedAt),

    runtime: parseNullableNumber(value.runtime),
    seasons: mediaType === 'tv' ? parseSeasons(value.seasons) : undefined,
    totalEpisodes: parseNullableNumber(value.totalEpisodes),
    providers: parseStringArray(value.providers).length
      ? parseStringArray(value.providers)
      : undefined,
    providerRegion:
      typeof value.providerRegion === 'string' ? value.providerRegion : undefined,

    progress: mediaType === 'tv' ? parseProgress(value.progress) : undefined,
    history: history.length > 0 ? history : undefined,
    collections: parseStringArray(value.collections).length
      ? parseStringArray(value.collections)
      : undefined,

    duelScore: parseFiniteNumber(value.duelScore),
    duelCount: parseFiniteNumber(value.duelCount),
  };
}

/** Aplica {@link parseMedia} a una lista, contando lo que se descartó. */
export function parseMediaList(values: unknown[]): {
  media: SavedMedia[];
  skipped: number;
} {
  const media: SavedMedia[] = [];
  let skipped = 0;

  for (const value of values) {
    const parsed = parseMedia(value);
    if (parsed) media.push(parsed);
    else skipped++;
  }

  return { media, skipped };
}

/** Valida una colección venida de Firestore o de un backup. */
export function parseCollection(value: unknown) {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return null;

  return {
    id,
    name,
    createdAt: isoOrNow(value.createdAt),
    updatedAt: isoOrNow(value.updatedAt),
  };
}

// --- Lecturas del historial -------------------------------------------------

/** La última vez que lo viste, o `undefined` si nunca lo terminaste. */
export function latestWatch(media: SavedMedia): WatchEntry | undefined {
  return media.history?.[0];
}

/** El puntaje más reciente. Es el que se muestra en la tarjeta. */
export function latestRating(media: SavedMedia): number | undefined {
  return latestWatch(media)?.rating;
}

/** Cuántas veces lo viste de punta a punta. */
export function watchCount(media: SavedMedia): number {
  return media.history?.length ?? 0;
}
