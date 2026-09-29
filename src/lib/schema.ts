import {
  ArchiveInfo,
  ArchivedStatus,
  EpisodeRef,
  Keyword,
  MediaStatus,
  NewEpisodesMarker,
  MediaType,
  Person,
  SavedMedia,
  SeasonInfo,
  SeriesProgress,
  StoredArchive,
  WatchEntry,
} from '@/types';
import { parseLanguage } from '@/lib/language';
import {
  REASON_MAX_LENGTH,
  isAbandonedEntry,
  isArchivedStatus,
  isListStatus,
} from '@/lib/archive';
import { isDayKey } from '@/lib/dates';
import { parseSeriesStatus } from '@/lib/enrich';

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
    ...(value.abandoned === true ? { abandoned: true } : {}),
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

      const totalRuntime = Number(season.totalRuntime);

      return {
        seasonNumber,
        name:
          typeof season.name === 'string' && season.name
            ? season.name
            : `Temporada ${seasonNumber}`,
        episodeCount,
        ...(Number.isFinite(totalRuntime) && totalRuntime > 0 ? { totalRuntime } : {}),
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

  // Las fechas por episodio: solo las de episodios marcados, y solo si son
  // fechas. Lo que no tiene fecha queda así —no se inventa ninguna—, que es
  // lo que pasa con todo lo marcado antes de que existieran.
  const watchedAt: Record<string, string> = {};
  if (isRecord(value.watchedAt)) {
    for (const [key, at] of Object.entries(value.watchedAt)) {
      const match = /^(\d+)x(\d+)$/.exec(key);
      if (!match || typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue;
      if (!watched[Number(match[1])]?.includes(Number(match[2]))) continue;
      watchedAt[key] = at;
    }
  }

  // Los puntajes por episodio, con la misma regla: solo de lo marcado. Se
  // redondean a la media estrella, que es lo único que se puede elegir.
  const episodeRatings: Record<string, number> = {};
  if (isRecord(value.episodeRatings)) {
    for (const [key, raw] of Object.entries(value.episodeRatings)) {
      const match = /^(\d+)x(\d+)$/.exec(key);
      const rating = Math.round(Number(raw) * 2) / 2;
      if (!match || !Number.isFinite(rating) || rating < 0.5 || rating > 5) continue;
      if (!watched[Number(match[1])]?.includes(Number(match[2]))) continue;
      episodeRatings[key] = rating;
    }
  }

  return {
    watched,
    ...(Object.keys(watchedAt).length > 0 ? { watchedAt } : {}),
    ...(Object.keys(episodeRatings).length > 0 ? { episodeRatings } : {}),
    lastWatchedAt:
      typeof value.lastWatchedAt === 'string' ? value.lastWatchedAt : undefined,
  };
}

/**
 * El reparto y la dirección guardados con el título.
 *
 * Un array vacío no es lo mismo que `undefined`: el vacío significa "TMDB no
 * tenía reparto para esto", y `undefined`, "nunca le preguntamos". Explorar usa
 * esa diferencia para completar solo los títulos que le faltan y no repetir el
 * pedido para siempre.
 */
function parsePeople(value: unknown): Person[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((person): Person | null => {
      if (!isRecord(person)) return null;
      const id = Number(person.id);
      const name = typeof person.name === 'string' ? person.name.trim() : '';
      if (!Number.isInteger(id) || id <= 0 || !name) return null;

      return {
        id,
        name,
        role: person.role === 'direccion' ? 'direccion' : 'reparto',
        profilePath:
          typeof person.profilePath === 'string' ? person.profilePath : null,
      };
    })
    .filter((person): person is Person => person !== null);
}

/** Los temas de TMDB guardados con el título. */
function parseKeywords(value: unknown): Keyword[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const keywords = value
    .map((keyword): Keyword | null => {
      if (!isRecord(keyword)) return null;
      const id = Number(keyword.id);
      const name = typeof keyword.name === 'string' ? keyword.name.trim() : '';
      if (!Number.isInteger(id) || id <= 0 || !name) return null;
      return { id, name };
    })
    .filter((keyword): keyword is Keyword => keyword !== null);

  return keywords.length > 0 ? keywords : undefined;
}

/** Un episodio anunciado por TMDB, guardado con el título. */
function parseEpisodeRef(value: unknown): EpisodeRef | undefined {
  if (!isRecord(value)) return undefined;

  const seasonNumber = Number(value.seasonNumber);
  const episodeNumber = Number(value.episodeNumber);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return undefined;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return undefined;
  if (!isDayKey(value.airDate)) return undefined;

  return {
    seasonNumber,
    episodeNumber,
    airDate: value.airDate,
    ...(typeof value.name === 'string' && value.name ? { name: value.name } : {}),
  };
}

/** Desde qué episodio hay novedades sin ver. */
function parseNewEpisodes(value: unknown): NewEpisodesMarker | undefined {
  if (!isRecord(value)) return undefined;

  const seasonNumber = Number(value.seasonNumber);
  const episodeNumber = Number(value.episodeNumber);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) return undefined;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return undefined;

  return { seasonNumber, episodeNumber, detectedAt: isoOrNow(value.detectedAt) };
}

/** Una fecha ISO válida, o `undefined`. Sin inventar "ahora" como `isoOrNow`. */
function parseIso(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
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

/** El motivo de abandono, recortado al tope. Vacío cuenta como ausente. */
function parseReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const reason = value.trim().slice(0, REASON_MAX_LENGTH);
  return reason || undefined;
}

/**
 * El estado de un título, leído de cualquiera de sus dos formas.
 *
 * - La de Firestore y los backups: `status` en `viendo` y el estado real en
 *   `archive.status` (ver {@link toStoredMedia}). El archivo vale solo si
 *   `status` sigue en `viendo`: si una versión vieja de la app lo movió a otra
 *   lista, eso es lo último que hizo la persona y gana.
 * - La del dispositivo: `status` ya dice `en_pausa` o `abandonada`. Es lo que
 *   guarda el store local, y lo que trae una copia de rescate.
 *
 * Un estado desconocido cae en *Por Ver*, como siempre. Y algo que ya se vio no
 * puede estar "por ver": haberlo terminado alguna vez lo saca de ahí. Sí puede
 * volver a *Viendo*, que es lo que pasa con una serie terminada que estrena
 * temporada.
 */
function parseStatus(
  value: Record<string, unknown>,
  hasHistory: boolean,
  updatedAt: string,
): { status: MediaStatus; archive?: ArchiveInfo } {
  const stored = isRecord(value.archive) ? value.archive : undefined;

  let archived: ArchivedStatus | undefined;
  if (isArchivedStatus(value.status)) archived = value.status;
  else if (value.status === 'viendo' && isArchivedStatus(stored?.status)) {
    archived = stored.status;
  }

  if (archived) {
    const reason = archived === 'abandonada' ? parseReason(stored?.reason) : undefined;
    return {
      status: archived,
      // Sin fecha legible se toma la del último cambio: perder la fecha es
      // menos grave que perder el estado.
      archive: { at: parseIso(stored?.at) ?? updatedAt, ...(reason ? { reason } : {}) },
    };
  }

  const declared = isListStatus(value.status) ? value.status : 'por_ver';
  return { status: hasHistory && declared === 'por_ver' ? 'completada' : declared };
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
  const updatedAt = isoOrNow(value.updatedAt);
  const { status, archive } = parseStatus(
    value,
    history.some((entry) => !isAbandonedEntry(entry)),
    updatedAt,
  );

  return {
    tmdbId,
    mediaType,
    title,
    posterPath: typeof value.posterPath === 'string' ? value.posterPath : null,
    backdropPath:
      typeof value.backdropPath === 'string' ? value.backdropPath : null,
    releaseYear: typeof value.releaseYear === 'string' ? value.releaseYear : '',
    genres: parseStringArray(value.genres),
    status,
    updatedAt,

    runtime: parseNullableNumber(value.runtime),
    seasons: mediaType === 'tv' ? parseSeasons(value.seasons) : undefined,
    totalEpisodes: parseNullableNumber(value.totalEpisodes),
    providers: parseStringArray(value.providers).length
      ? parseStringArray(value.providers)
      : undefined,
    // Un array vacío se conserva: dice "no está incluido en ninguna", que no es
    // lo mismo que no saberlo (ver `isStale`).
    streaming: Array.isArray(value.streaming) ? parseStringArray(value.streaming) : undefined,
    providerRegion:
      typeof value.providerRegion === 'string' ? value.providerRegion : undefined,

    people: parsePeople(value.people),
    keywords: parseKeywords(value.keywords),
    sagaId: parseNullableNumber(value.sagaId) ?? null,
    sagaName: typeof value.sagaName === 'string' && value.sagaName
      ? value.sagaName
      : undefined,
    originalLanguage:
      typeof value.originalLanguage === 'string' && value.originalLanguage
        ? value.originalLanguage
        : undefined,
    releaseDate:
      mediaType === 'movie' && isDayKey(value.releaseDate) ? value.releaseDate : undefined,
    // Uno desconocido cuenta como ausente: el título se refresca con el
    // idioma que corresponda, que es lo mismo que pasa con uno viejo.
    enrichedLanguage: parseLanguage(value.enrichedLanguage),
    enrichedRegion:
      typeof value.enrichedRegion === 'string' && /^[A-Z]{2}$/.test(value.enrichedRegion)
        ? value.enrichedRegion
        : undefined,
    // Una fecha rota no es "ahora": sería dar por fresca una ficha que no se
    // sabe cuándo se pidió. Ausente, se vuelve a pedir.
    enrichedAt: parseIso(value.enrichedAt),
    seriesStatus: mediaType === 'tv' ? parseSeriesStatus(value.seriesStatus) : undefined,
    lastAired: mediaType === 'tv' ? parseEpisodeRef(value.lastAired) : undefined,
    nextToAir: mediaType === 'tv' ? parseEpisodeRef(value.nextToAir) : undefined,
    newEpisodesSince:
      mediaType === 'tv' ? parseNewEpisodes(value.newEpisodesSince) : undefined,
    archive,

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

/**
 * Un cambio de estado, con el archivo que le corresponde.
 *
 * Pasar a *En pausa* o *Abandonada* anota desde cuándo; volver a cualquier
 * lista lo borra. Así ningún camino —la tarjeta, la ficha, el "+1", el deshacer
 * de un aviso— puede dejar un título en *Viendo* con un archivo colgado.
 */
export function withArchive(
  patch: Partial<SavedMedia>,
  now = new Date(),
): Partial<SavedMedia> {
  if (patch.status === undefined) return patch;
  if (!isArchivedStatus(patch.status)) return { ...patch, archive: undefined };

  const reason =
    patch.status === 'abandonada' ? parseReason(patch.archive?.reason) : undefined;
  return {
    ...patch,
    archive: { at: patch.archive?.at ?? now.toISOString(), ...(reason ? { reason } : {}) },
  };
}

/** El archivo tal como se guarda afuera: con el estado adentro. */
function storedArchive(status: ArchivedStatus, archive: ArchiveInfo | undefined, fallback: string): StoredArchive {
  return {
    status,
    at: archive?.at ?? fallback,
    ...(archive?.reason ? { reason: archive.reason } : {}),
  };
}

/**
 * Un título listo para escribirse en Firestore o en un backup.
 *
 * Por qué no se guarda `status: 'abandonada'` tal cual: una versión vieja de la
 * app —la PWA que quedó sin actualizar en otro dispositivo— valida `status`
 * contra los tres de siempre y cambia lo que no conoce por *Por Ver*. Con eso
 * solo mostraría mal el título; lo grave es que en la próxima escritura que
 * incluya el estado —borrar una reseña, importar un backup— lo guarda así, y
 * el dato se pierde. Con `status` en `viendo`, esa versión ve el título en
 * *Viendo*, que es donde estaba antes de archivarse, y no tiene nada que
 * corregir.
 */
export function toStoredMedia(media: SavedMedia): Record<string, unknown> {
  const { archive, ...rest } = media;
  if (!isArchivedStatus(media.status)) return rest;

  return {
    ...rest,
    status: 'viendo',
    archive: storedArchive(media.status, archive, media.updatedAt),
  };
}

/**
 * Lo mismo que {@link toStoredMedia}, para un cambio parcial.
 *
 * Un cambio sin estado pasa como está. Uno que vuelve a una lista escribe
 * `archive` vacío, que es lo que lo borra del documento.
 */
export function toStoredPatch(patch: Partial<SavedMedia>): Record<string, unknown> {
  const normalized = withArchive(patch);
  if (normalized.status === undefined) {
    const { archive: _ignored, ...rest } = normalized;
    return rest;
  }
  if (!isArchivedStatus(normalized.status)) return normalized;

  const { archive, ...rest } = normalized;
  return {
    ...rest,
    status: 'viendo',
    archive: storedArchive(normalized.status, archive, new Date().toISOString()),
  };
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

/**
 * Cuántas veces lo viste de punta a punta.
 *
 * Sin contar lo que puntuaste con el título abandonado: esa vuelta no la
 * terminaste.
 */
export function watchCount(media: SavedMedia): number {
  return (media.history ?? []).filter((entry) => !isAbandonedEntry(entry)).length;
}
