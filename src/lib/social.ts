import { PickedTitle, SocialSettings, SocialSharing } from '@/types';
import { SLUG_MAX, SLUG_MIN, isValidSlug, toSlug } from '@/lib/publicProfile';

/**
 * La parte social: cuentas, usuarios y quién sigue a quién.
 *
 * Funciona como cualquier red: seguir es de un lado, y si la otra persona te
 * sigue de vuelta son mutuos. Una cuenta pública se sigue al toque; una
 * privada recibe una solicitud. Lo que ven tus seguidores no es tu
 * biblioteca: es una instantánea curada (`lib/activity.ts`), la misma idea
 * que el perfil público.
 *
 * Las reglas de Firestore son las que hacen cumplir todo esto; lo de acá es
 * la misma lógica del lado del cliente, para mostrar bien los estados y no
 * mandar escrituras que se van a rechazar.
 */

export const HANDLE_MIN = SLUG_MIN;
export const HANDLE_MAX = SLUG_MAX;
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 160;
export const TOP_TITLES = 4;
/** Tope de cuentas seguidas: el feed se arma leyendo una por una. */
export const MAX_FOLLOWING = 200;

/**
 * Usuarios que no se pueden tomar: se confundirían con la app o con quien la
 * hace. El usuario es también la dirección del perfil (`/u/…`).
 */
const RESERVED_HANDLES = new Set([
  'admin',
  'administrador',
  'ayuda',
  'soporte',
  'que-miro',
  'quemiro',
  'oficial',
  'staff',
  'moderador',
  'sistema',
  'null',
  'undefined',
]);

/**
 * Si un usuario tiene la forma que aceptamos. La misma que la dirección del
 * perfil público —minúsculas, números y guiones—, porque es la misma cosa.
 */
export function isValidHandle(handle: string): boolean {
  return isValidSlug(handle) && !RESERVED_HANDLES.has(handle);
}

/** Por qué no sirve un usuario, en una frase; `null` si sirve. */
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `Tiene que tener al menos ${HANDLE_MIN} caracteres.`;
  if (handle.length > HANDLE_MAX) return `Puede tener hasta ${HANDLE_MAX} caracteres.`;
  if (!isValidSlug(handle)) return 'Solo letras minúsculas, números y guiones (no al principio ni al final).';
  if (RESERVED_HANDLES.has(handle)) return 'Ese usuario está reservado. Probá con otro.';
  return null;
}

/** Normaliza lo que se tipea: "Ana Pérez" → "ana-perez". */
export function normalizeHandle(value: string): string {
  return toSlug(value.replace(/^@/, ''));
}

/** Un usuario para proponer: el perfil público que ya tenía, o el nombre. */
export function suggestHandle({
  publicSlug,
  displayName,
  email,
}: {
  publicSlug?: string | null;
  displayName?: string | null;
  email?: string | null;
}): string {
  if (publicSlug && isValidHandle(publicSlug)) return publicSlug;
  for (const candidate of [displayName, email?.split('@')[0]]) {
    const slug = candidate ? toSlug(candidate) : '';
    if (isValidHandle(slug)) return slug;
  }
  return '';
}

/** La tarjeta pública de una cuenta, en `accounts/{uid}`. */
export interface Account {
  uid: string;
  handle: string;
  displayName: string;
  bio: string;
  /**
   * Una imagen de TMDB —un póster o una imagen de fondo—. No se suben fotos:
   * así no hay archivos que guardar ni imágenes que moderar.
   */
  avatarPath: string | null;
  /** Tu top 4, como en Letterboxd. */
  top4: PickedTitle[];
  private: boolean;
  /**
   * Cuántos te siguen y a cuántos seguís, aceptados. Los cuenta la app del
   * dueño: nadie más puede listar esas relaciones.
   */
  followers: number;
  following: number;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isoOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

/** Una ruta de imagen de TMDB: "/abc123.jpg". Nada de URLs enteras. */
export function isImagePath(value: unknown): value is string {
  return typeof value === 'string' && /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(value) && value.length <= 100;
}

export function parsePickedTitle(value: unknown): PickedTitle | null {
  if (!isRecord(value)) return null;
  const tmdbId = Number(value.tmdbId);
  const mediaType = value.mediaType === 'movie' || value.mediaType === 'tv' ? value.mediaType : null;
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 200) : '';
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return null;
  return {
    tmdbId,
    mediaType,
    title,
    posterPath: isImagePath(value.posterPath) ? value.posterPath : null,
    releaseYear: typeof value.releaseYear === 'string' ? value.releaseYear.slice(0, 4) : '',
  };
}

/**
 * Valida una cuenta leída de Firestore. La lee cualquiera y la escribe
 * cualquier versión de la app: no se confía en su forma.
 */
export function parseAccount(value: unknown): Account | null {
  if (!isRecord(value)) return null;
  const uid = typeof value.uid === 'string' ? value.uid : '';
  const handle = typeof value.handle === 'string' ? value.handle : '';
  if (!uid || !isValidSlug(handle)) return null;
  const epoch = new Date(0).toISOString();
  const top4 = (Array.isArray(value.top4) ? value.top4 : [])
    .map(parsePickedTitle)
    .filter((title): title is PickedTitle => title !== null)
    .slice(0, TOP_TITLES);
  return {
    uid,
    handle,
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim()
        ? value.displayName.trim().slice(0, DISPLAY_NAME_MAX)
        : handle,
    bio: typeof value.bio === 'string' ? value.bio.trim().slice(0, BIO_MAX) : '',
    avatarPath: isImagePath(value.avatarPath) ? value.avatarPath : null,
    top4,
    private: value.private === true,
    followers: count(value.followers),
    following: count(value.following),
    createdAt: isoOr(value.createdAt, epoch),
    updatedAt: isoOr(value.updatedAt, epoch),
  };
}

/** El documento, con las claves exactas que aceptan las reglas. */
export function accountToDocument(account: Account): Record<string, unknown> {
  return {
    uid: account.uid,
    handle: account.handle,
    displayName: account.displayName.trim().slice(0, DISPLAY_NAME_MAX) || account.handle,
    bio: account.bio.trim().slice(0, BIO_MAX),
    avatarPath: account.avatarPath,
    top4: account.top4.slice(0, TOP_TITLES).map(({ tmdbId, mediaType, title, posterPath, releaseYear }) => ({
      tmdbId,
      mediaType,
      title,
      posterPath,
      releaseYear,
    })),
    private: account.private,
    followers: account.followers,
    following: account.following,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

// --- Seguir -----------------------------------------------------------------

export type FollowStatus = 'pending' | 'accepted';

/** Una relación de `follows/{seguidor}_{seguido}`. */
export interface Follow {
  follower: string;
  followed: string;
  status: FollowStatus;
  createdAt: string;
  /** Cuándo se aceptó una solicitud. Las de cuentas públicas no lo tienen. */
  acceptedAt?: string;
}

/** El id del documento: uno por par, en ese orden. */
export function followId(follower: string, followed: string): string {
  return `${follower}_${followed}`;
}

export function parseFollow(value: unknown): Follow | null {
  if (!isRecord(value)) return null;
  const follower = typeof value.follower === 'string' ? value.follower : '';
  const followed = typeof value.followed === 'string' ? value.followed : '';
  const status = value.status === 'pending' || value.status === 'accepted' ? value.status : null;
  if (!follower || !followed || !status || follower === followed) return null;
  const acceptedAt = typeof value.acceptedAt === 'string' && !Number.isNaN(Date.parse(value.acceptedAt))
    ? value.acceptedAt
    : undefined;
  return {
    follower,
    followed,
    status,
    createdAt: isoOr(value.createdAt, new Date(0).toISOString()),
    ...(acceptedAt ? { acceptedAt } : {}),
  };
}

/** La relación nueva: la pide el seguidor, y el estado lo da la privacidad. */
export function newFollow(follower: string, followed: Account, now = new Date()): Follow {
  return {
    follower,
    followed: followed.uid,
    status: followed.private ? 'pending' : 'accepted',
    createdAt: now.toISOString(),
  };
}

export function followToDocument(follow: Follow): Record<string, unknown> {
  return {
    follower: follow.follower,
    followed: follow.followed,
    status: follow.status,
    createdAt: follow.createdAt,
  };
}

/**
 * Tus relaciones, tal como las devuelven las dos consultas que se pueden
 * hacer: a quién seguís y quién te sigue.
 */
export interface MyFollows {
  /** Donde sos el seguidor. */
  outgoing: Follow[];
  /** Donde te siguen o te lo pidieron. */
  incoming: Follow[];
}

export function emptyFollows(): MyFollows {
  return { outgoing: [], incoming: [] };
}

export interface Relationship {
  /** Lo seguís y te aceptó (o era pública). */
  following: boolean;
  /** Le mandaste solicitud y todavía no respondió. */
  requested: boolean;
  /** Te sigue, aceptado. */
  followsYou: boolean;
  /** Te pidió seguirte y no respondiste. */
  requestedYou: boolean;
  /** Se siguen los dos: lo que desbloquea recomendar y ver juntos. */
  mutual: boolean;
}

export function relationship(follows: MyFollows, uid: string): Relationship {
  const out = follows.outgoing.find((follow) => follow.followed === uid);
  const inc = follows.incoming.find((follow) => follow.follower === uid);
  const following = out?.status === 'accepted';
  const followsYou = inc?.status === 'accepted';
  return {
    following,
    requested: out?.status === 'pending',
    followsYou,
    requestedYou: inc?.status === 'pending',
    mutual: following && followsYou,
  };
}

/** Los uids que seguís con acceso: de ellos se lee la actividad. */
export function followedUids(follows: MyFollows): string[] {
  return follows.outgoing.filter((follow) => follow.status === 'accepted').map((follow) => follow.followed);
}

export function mutualUids(follows: MyFollows): string[] {
  const followers = new Set(
    follows.incoming.filter((follow) => follow.status === 'accepted').map((follow) => follow.follower),
  );
  return followedUids(follows).filter((uid) => followers.has(uid));
}

/** Los números que se publican en la tarjeta: solo relaciones aceptadas. */
export function followCounts(follows: MyFollows): { followers: number; following: number } {
  return {
    followers: follows.incoming.filter((follow) => follow.status === 'accepted').length,
    following: follows.outgoing.filter((follow) => follow.status === 'accepted').length,
  };
}

/** Solicitudes que esperan tu respuesta, de la más nueva a la más vieja. */
export function pendingRequests(follows: MyFollows): Follow[] {
  return follows.incoming
    .filter((follow) => follow.status === 'pending')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** El texto del botón según la relación: "Seguir", "Solicitado", "Siguiendo". */
export function followButtonLabel(rel: Relationship, target: Pick<Account, 'private'>): string {
  if (rel.following) return 'Siguiendo';
  if (rel.requested) return 'Solicitado';
  if (rel.followsYou) return 'Seguir también';
  return target.private ? 'Solicitar seguir' : 'Seguir';
}

// --- Configuración ------------------------------------------------------------

export function defaultSharing(): SocialSharing {
  return {
    completed: true,
    progress: true,
    added: true,
    abandoned: true,
    goals: true,
    lists: true,
    watching: true,
    library: true,
  };
}

export const SHARING_KEYS = Object.keys(defaultSharing()) as (keyof SocialSharing)[];

export function emptySocialSettings(): SocialSettings {
  const epoch = new Date(0).toISOString();
  return { sharing: defaultSharing(), paused: false, muted: [], inboxSeenAt: epoch, updatedAt: epoch };
}

/** Valida la configuración venga de Firestore, `localStorage` o un backup. */
export function parseSocialSettings(value: unknown): SocialSettings {
  const empty = emptySocialSettings();
  if (!isRecord(value)) return empty;
  const rawSharing = isRecord(value.sharing) ? value.sharing : {};
  const sharing = { ...empty.sharing };
  // Lo que no dice nada queda prendido: una opción nueva arranca como las demás.
  for (const key of SHARING_KEYS) sharing[key] = rawSharing[key] !== false;
  const muted = (Array.isArray(value.muted) ? value.muted : [])
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0 && uid.length <= 128)
    .filter((uid, index, list) => list.indexOf(uid) === index)
    .slice(0, 500);
  return {
    sharing,
    paused: value.paused === true,
    muted,
    inboxSeenAt: isoOr(value.inboxSeenAt, empty.inboxSeenAt),
    updatedAt: isoOr(value.updatedAt, empty.updatedAt),
  };
}

/** Si hay algo distinto de lo de fábrica: lo que decide si va al backup. */
export function hasSocialSettings(settings: SocialSettings): boolean {
  return (
    settings.paused ||
    settings.muted.length > 0 ||
    SHARING_KEYS.some((key) => !settings.sharing[key]) ||
    Date.parse(settings.updatedAt) > 0
  );
}

export function socialSettingsToDocument(settings: SocialSettings): Record<string, unknown> {
  return {
    sharing: { ...settings.sharing },
    paused: settings.paused,
    muted: [...settings.muted],
    inboxSeenAt: settings.inboxSeenAt,
    updatedAt: settings.updatedAt,
  };
}

// --- Reacciones ---------------------------------------------------------------

export const REACTIONS = [
  { id: 'fire', emoji: '🔥', label: 'Fuego' },
  { id: 'love', emoji: '❤️', label: 'Me encanta' },
  { id: 'laugh', emoji: '😂', label: 'Me hizo reír' },
  { id: 'cry', emoji: '😭', label: 'Me hizo llorar' },
  { id: 'wow', emoji: '🤯', label: 'Me voló la cabeza' },
] as const;

export type ReactionId = (typeof REACTIONS)[number]['id'];

export function isReactionId(value: unknown): value is ReactionId {
  return REACTIONS.some((reaction) => reaction.id === value);
}

/** Una reacción, en `activity/{dueño}/reactions/{quien}_{evento}`. */
export interface Reaction {
  reactor: string;
  reactorName: string;
  reactorHandle: string;
  eventId: string;
  emoji: ReactionId;
  at: string;
}

export function reactionId(reactor: string, eventId: string): string {
  return `${reactor}_${eventId}`;
}

export function parseReaction(value: unknown): Reaction | null {
  if (!isRecord(value)) return null;
  const reactor = typeof value.reactor === 'string' ? value.reactor : '';
  const eventId = typeof value.eventId === 'string' ? value.eventId : '';
  if (!reactor || !eventId || !isReactionId(value.emoji)) return null;
  return {
    reactor,
    reactorName: typeof value.reactorName === 'string' && value.reactorName ? value.reactorName.slice(0, 60) : 'Alguien',
    reactorHandle: typeof value.reactorHandle === 'string' ? value.reactorHandle : '',
    eventId,
    emoji: value.emoji,
    at: isoOr(value.at, new Date(0).toISOString()),
  };
}

// --- Recomendaciones ------------------------------------------------------------

export const NOTE_MAX = 280;

/** "Te lo recomiendo", en `users/{destinatario}/recommendations/{id}`. */
export interface Recommendation {
  id: string;
  from: string;
  fromName: string;
  fromHandle: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  releaseYear: string;
  note: string;
  at: string;
}

/** Una por persona y título: recomendar dos veces lo mismo pisa la anterior. */
export function recommendationId(from: string, mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `${from}_${mediaType}${tmdbId}`;
}

export function parseRecommendation(id: string, value: unknown): Recommendation | null {
  if (!isRecord(value)) return null;
  const title = parsePickedTitle(value);
  const from = typeof value.from === 'string' ? value.from : '';
  if (!title || !from) return null;
  return {
    id,
    from,
    fromName: typeof value.fromName === 'string' && value.fromName ? value.fromName.slice(0, 60) : 'Alguien',
    fromHandle: typeof value.fromHandle === 'string' ? value.fromHandle : '',
    ...title,
    note: typeof value.note === 'string' ? value.note.trim().slice(0, NOTE_MAX) : '',
    at: isoOr(value.at, new Date(0).toISOString()),
  };
}

export function recommendationToDocument(rec: Omit<Recommendation, 'id'>): Record<string, unknown> {
  return {
    from: rec.from,
    fromName: rec.fromName.slice(0, 60),
    fromHandle: rec.fromHandle,
    tmdbId: rec.tmdbId,
    mediaType: rec.mediaType,
    title: rec.title.slice(0, 200),
    posterPath: rec.posterPath,
    releaseYear: rec.releaseYear,
    note: rec.note.trim().slice(0, NOTE_MAX),
    at: rec.at,
  };
}

// --- Invitaciones ---------------------------------------------------------------

/** El link para invitar: tu perfil, con la marca de que viene de una invitación. */
export function inviteUrl(origin: string, handle: string): string {
  return `${origin}/u/${handle}?invitado=1`;
}

/** El texto que acompaña al link, listo para WhatsApp. */
export function inviteText(account: Pick<Account, 'displayName'>, url: string): string {
  return `${account.displayName} te invita a Qué Miro? para ver qué anda mirando y compartir lo tuyo: ${url}`;
}

/** Un link de WhatsApp con el texto ya escrito. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
