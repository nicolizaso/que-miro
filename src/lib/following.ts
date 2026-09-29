import { FollowedProfile, Following } from '@/types';
import { PublicProfile } from '@/lib/publicProfile';

/**
 * Seguir perfiles públicos y armar el feed con lo que reseñan.
 *
 * No hace falta backend nuevo ni reglas nuevas: `public_profiles` ya se lee
 * sin sesión, y lo que se guarda de la cuenta es solo la lista de a quién
 * seguís. El feed se arma en el cliente con las instantáneas de cada uno.
 */

/** Tope de perfiles seguidos: el feed se arma leyendo uno por uno. */
export const MAX_FOLLOWING = 100;

/** Cuántos ítems muestra el feed: es para ponerse al día, no un archivo. */
export const MAX_FEED_ITEMS = 60;

/**
 * Cada cuánto se vuelve a leer un perfil. Abrir el feed cuesta una lectura
 * de Firestore por perfil seguido —hasta cien—, y como mucho una vez cada
 * este rato por perfil; entre medio sale de la caché del dispositivo.
 */
export const FEED_TTL_MS = 15 * 60_000;

export function emptyFollowing(): Following {
  return { profiles: [], updatedAt: new Date(0).toISOString() };
}

function parseFollowed(value: unknown): FollowedProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  const uid = typeof raw.uid === 'string' ? raw.uid.trim() : '';
  if (!slug || !uid) return null;
  return {
    slug,
    uid,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : slug,
    since: typeof raw.since === 'string' && !Number.isNaN(Date.parse(raw.since)) ? raw.since : new Date(0).toISOString(),
  };
}

/** Valida lo que venga de Firestore, de `localStorage` o de un backup. */
export function parseFollowing(value: unknown): Following {
  if (typeof value !== 'object' || value === null) return emptyFollowing();
  const raw = value as Record<string, unknown>;
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .map(parseFollowed)
    .filter((profile): profile is FollowedProfile => profile !== null)
    .filter((profile, index, list) => list.findIndex((p) => p.slug === profile.slug) === index)
    .slice(0, MAX_FOLLOWING);
  const updatedAt =
    typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date(0).toISOString();
  return { profiles, updatedAt };
}

export function hasFollowing(following: Following): boolean {
  return following.profiles.length > 0;
}

export function followingToDocument(following: Following): Record<string, unknown> {
  return {
    profiles: following.profiles.map(({ slug, uid, name, since }) => ({ slug, uid, name, since })),
    updatedAt: following.updatedAt,
  };
}

export function isFollowing(following: Following, slug: string): boolean {
  return following.profiles.some((profile) => profile.slug === slug);
}

export type FollowResult =
  | { ok: true; following: Following }
  | { ok: false; reason: 'self' | 'full' };

/** Seguir un perfil. A uno mismo no, y con tope. */
export function follow(
  following: Following,
  profile: Pick<PublicProfile, 'slug' | 'uid' | 'displayName'>,
  myUid: string,
  now = new Date(),
): FollowResult {
  if (profile.uid === myUid) return { ok: false, reason: 'self' };
  if (isFollowing(following, profile.slug)) return { ok: true, following };
  if (following.profiles.length >= MAX_FOLLOWING) return { ok: false, reason: 'full' };
  return {
    ok: true,
    following: {
      profiles: [
        ...following.profiles,
        { slug: profile.slug, uid: profile.uid, name: profile.displayName, since: now.toISOString() },
      ],
      updatedAt: now.toISOString(),
    },
  };
}

export function unfollow(following: Following, slug: string, now = new Date()): Following {
  return {
    profiles: following.profiles.filter((profile) => profile.slug !== slug),
    updatedAt: now.toISOString(),
  };
}

/**
 * Cómo está un perfil que seguís:
 * - `ok`: publicado y de la misma persona.
 * - `gone`: ya no está publicado (o nunca se pudo leer).
 * - `new-owner`: el slug ahora es de otra cuenta; no se muestra nada suyo.
 */
export type FollowStatus = 'ok' | 'gone' | 'new-owner';

export function followStatus(followed: FollowedProfile, profile: PublicProfile | null): FollowStatus {
  if (!profile) return 'gone';
  return profile.uid === followed.uid ? 'ok' : 'new-owner';
}

export type Review = PublicProfile['reviews'][number];

export interface FeedItem {
  key: string;
  slug: string;
  /** El nombre de hoy, no el de cuando lo seguiste. */
  name: string;
  review: Review;
}

/**
 * El feed: las reseñas de todos, de la más nueva a la más vieja.
 *
 * Solo de los perfiles que siguen siendo de quien seguiste. Una reseña sin
 * fecha legible va al final: no se sabe dónde ponerla.
 */
export function buildFollowingFeed(
  following: Following,
  profiles: Map<string, PublicProfile | null>,
): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();

  for (const followed of following.profiles) {
    const profile = profiles.get(followed.slug) ?? null;
    if (followStatus(followed, profile) !== 'ok' || !profile) continue;
    for (const review of profile.reviews) {
      const key = `${followed.slug}:${review.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, slug: followed.slug, name: profile.displayName, review });
    }
  }

  const time = (item: FeedItem) => {
    const at = Date.parse(item.review.completedAt);
    return Number.isNaN(at) ? -Infinity : at;
  };
  return items
    .sort((a, b) => time(b) - time(a) || a.name.localeCompare(b.name, 'es'))
    .slice(0, MAX_FEED_ITEMS);
}

/** "4,5", como se escribe acá. */
export function ratingText(rating: number): string {
  return String(rating).replace('.', ',');
}

/** "Ana le puso 4,5 a *Past Lives*", en texto plano: para leerlo en voz alta. */
export function feedHeadline(item: FeedItem): string {
  return `${item.name} le puso ${ratingText(item.review.rating)} a ${item.review.title}`;
}

/** Los perfiles que hay que volver a leer: sin leer nunca, o leídos hace más de `ttl`. */
export function staleSlugs(
  following: Following,
  fetchedAt: Record<string, string>,
  now: number,
  ttl = FEED_TTL_MS,
): string[] {
  return following.profiles
    .map((profile) => profile.slug)
    .filter((slug) => {
      const at = Date.parse(fetchedAt[slug] ?? '');
      return Number.isNaN(at) || now - at > ttl;
    });
}
