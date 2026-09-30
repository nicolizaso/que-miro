import { FollowedProfile, Following } from '@/types';
import { PublicProfile } from '@/lib/publicProfile';

/**
 * Seguir perfiles públicos por su dirección: cómo se seguía antes de que
 * existieran las cuentas sociales (`lib/social.ts`).
 *
 * Queda para lo que todavía no se pudo pasar a `follows`: alguien con perfil
 * público que no creó su cuenta. Sus reseñas siguen llegando al feed
 * (`lib/socialFeed.ts`), y cuando crea la cuenta se lo pasa solo. Y para el
 * botón "Seguir" de esos perfiles.
 */

/** Tope de perfiles seguidos: el feed se arma leyendo uno por uno. */
export const MAX_FOLLOWING = 100;

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

/** "4,5", como se escribe acá. */
export function ratingText(rating: number): string {
  return String(rating).replace('.', ',');
}
