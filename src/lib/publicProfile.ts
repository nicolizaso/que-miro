import { MediaType, SavedMedia } from '@/types';
import { allWatches, formatDuration, genreDistribution, summarize, topRated } from '@/lib/stats';

/**
 * Instantánea pública de una biblioteca.
 *
 * Es una copia curada y no una ventana a los datos en vivo. Se eligió así por
 * dos razones: las reglas de Firestore no pueden abrir la biblioteca entera a
 * lectura anónima sin exponer también lo que no se quiso publicar, y con una
 * copia queda explícito qué se está compartiendo. El precio es que envejece,
 * y por eso el documento lleva su fecha y la UI ofrece volver a publicar.
 */
export interface PublicProfile {
  slug: string;
  uid: string;
  displayName: string;
  publishedAt: string; // ISO
  /**
   * "Mantener actualizado": la app lo republica sola cuando cambia algo de lo
   * que muestra. Se guarda con el perfil; un perfil de antes, sin el campo,
   * cuenta como prendido.
   */
  autoUpdate: boolean;
  summary: {
    watches: number;
    titles: number;
    averageRating: number;
    timeLabel: string;
  };
  topGenres: string[];
  favorites: {
    tmdbId: number;
    /** Aditivo: los perfiles de antes no lo tienen. */
    mediaType?: MediaType;
    title: string;
    posterPath: string | null;
    releaseYear: string;
    rating: number;
  }[];
  reviews: {
    id: string;
    /**
     * De qué título es. Aditivo, como el tipo, el póster y el año: con eso,
     * quien sigue el perfil puede guardarlo en su Por Ver desde la reseña.
     * En un perfil de antes, `tmdbId` es 0.
     */
    tmdbId: number;
    mediaType?: MediaType;
    title: string;
    posterPath: string | null;
    releaseYear: string;
    rating: number;
    text: string;
    tags: string[];
    completedAt: string;
  }[];
}

/** Cuántas reseñas se publican. Un perfil público es una vidriera, no un archivo. */
const MAX_REVIEWS = 12;
const MAX_FAVORITES = 6;

export const SLUG_MIN = 3;
export const SLUG_MAX = 24;

/**
 * Normaliza un texto a un slug usable en una URL.
 *
 * Sin acentos ni mayúsculas y con guiones: una URL que se pueda dictar por
 * teléfono. Devuelve string vacío si no queda nada aprovechable.
 */
export function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

/** Si un slug tiene la forma que aceptamos. */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
  );
}

/** Arma la instantánea que se va a publicar. */
export function buildPublicProfile({
  slug,
  uid,
  displayName,
  mediaList,
  autoUpdate = true,
}: {
  slug: string;
  uid: string;
  displayName: string;
  mediaList: SavedMedia[];
  autoUpdate?: boolean;
}): PublicProfile {
  const summary = summarize(mediaList);

  return {
    slug,
    uid,
    displayName,
    publishedAt: new Date().toISOString(),
    autoUpdate,
    summary: {
      watches: summary.totalWatches,
      titles: summary.uniqueTitles,
      averageRating: Number(summary.averageRating.toFixed(1)),
      timeLabel: formatDuration(summary.minutes),
    },
    topGenres: genreDistribution(mediaList, 5).map((slice) => slice.label),
    favorites: topRated(mediaList, MAX_FAVORITES).map(({ media, entry }) => ({
      tmdbId: media.tmdbId,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.posterPath,
      releaseYear: media.releaseYear,
      rating: entry.rating,
    })),
    // Solo las reseñas escritas: una lista de puntajes sin texto no le dice
    // nada a quien entra desde afuera.
    reviews: allWatches(mediaList)
      .filter(({ entry }) => Boolean(entry.text))
      .slice(0, MAX_REVIEWS)
      .map(({ media, entry }) => ({
        id: entry.id,
        tmdbId: media.tmdbId,
        mediaType: media.mediaType,
        title: media.title,
        posterPath: media.posterPath,
        releaseYear: media.releaseYear,
        rating: entry.rating,
        text: entry.text ?? '',
        tags: entry.tags ?? [],
        completedAt: entry.completedAt,
      })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El tipo, si es uno válido: `{}` si no, para que el campo quede ausente. */
function mediaTypeOf(value: unknown): { mediaType?: MediaType } {
  return value === 'movie' || value === 'tv' ? { mediaType: value } : {};
}

/**
 * Valida un perfil leído de Firestore.
 *
 * Lo lee cualquiera sin sesión, así que no se confía en su forma: un documento
 * a medio escribir no debería romper la página pública.
 */
export function parsePublicProfile(value: unknown): PublicProfile | null {
  if (!isRecord(value)) return null;

  const slug = typeof value.slug === 'string' ? value.slug : '';
  const uid = typeof value.uid === 'string' ? value.uid : '';
  if (!slug || !uid) return null;

  const summary = isRecord(value.summary) ? value.summary : {};

  return {
    slug,
    uid,
    displayName:
      typeof value.displayName === 'string' && value.displayName
        ? value.displayName
        : 'Alguien',
    publishedAt:
      typeof value.publishedAt === 'string'
        ? value.publishedAt
        : new Date().toISOString(),
    autoUpdate: value.autoUpdate !== false,
    summary: {
      watches: Number(summary.watches) || 0,
      titles: Number(summary.titles) || 0,
      averageRating: Number(summary.averageRating) || 0,
      timeLabel: typeof summary.timeLabel === 'string' ? summary.timeLabel : '',
    },
    topGenres: Array.isArray(value.topGenres)
      ? value.topGenres.filter((genre): genre is string => typeof genre === 'string')
      : [],
    favorites: Array.isArray(value.favorites)
      ? value.favorites.filter(isRecord).map((favorite) => ({
          tmdbId: Number(favorite.tmdbId) || 0,
          ...mediaTypeOf(favorite.mediaType),
          title: typeof favorite.title === 'string' ? favorite.title : '',
          posterPath:
            typeof favorite.posterPath === 'string' ? favorite.posterPath : null,
          releaseYear:
            typeof favorite.releaseYear === 'string' ? favorite.releaseYear : '',
          rating: Number(favorite.rating) || 0,
        }))
      : [],
    reviews: Array.isArray(value.reviews)
      ? value.reviews.filter(isRecord).map((review, index) => ({
          id: typeof review.id === 'string' ? review.id : `r-${index}`,
          tmdbId: Number(review.tmdbId) || 0,
          ...mediaTypeOf(review.mediaType),
          title: typeof review.title === 'string' ? review.title : '',
          posterPath: typeof review.posterPath === 'string' ? review.posterPath : null,
          releaseYear: typeof review.releaseYear === 'string' ? review.releaseYear : '',
          rating: Number(review.rating) || 0,
          text: typeof review.text === 'string' ? review.text : '',
          tags: Array.isArray(review.tags)
            ? review.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
          completedAt:
            typeof review.completedAt === 'string' ? review.completedAt : '',
        }))
      : [],
  };
}

/**
 * Lo que el perfil muestra, sin cuándo se publicó ni la opción de
 * actualizarlo. Dos instantáneas con el mismo contenido son la misma: volver
 * a escribirla solo cambiaría la fecha.
 */
export function profileContent(profile: PublicProfile): Omit<PublicProfile, 'publishedAt' | 'autoUpdate'> {
  const { publishedAt: _publishedAt, autoUpdate: _autoUpdate, ...content } = profile;
  return content;
}

export function sameProfileContent(a: PublicProfile, b: PublicProfile): boolean {
  return JSON.stringify(profileContent(a)) === JSON.stringify(profileContent(b));
}

/**
 * Cuánto se espera después del último cambio: el que suma una reseña suele
 * corregirla enseguida, o puntuar otra. Se publica una vez, con todo.
 */
export const PUBLISH_DEBOUNCE_MS = 30_000;

/** El mínimo entre dos publicaciones solas: un perfil no es un chat en vivo. */
export const MIN_PUBLISH_INTERVAL_MS = 5 * 60_000;

/** Texto que acompaña al link cuando se comparte el perfil. */
export function shareText(profile: PublicProfile): string {
  const { watches, averageRating } = profile.summary;
  return `Mi biblioteca en Qué Miro?: ${watches} ${
    watches === 1 ? 'vista' : 'vistas'
  }, promedio ${averageRating.toString().replace('.', ',')}.`;
}
