import { MediaType, SavedMedia } from '@/types';
import { Activity, ActivityEvent, ActivityTitle, LibraryEntry, WatchingNow, findInLibrary } from '@/lib/activity';
import { ReactionId } from '@/lib/social';
import { goalUnit } from '@/lib/goals';
import { ratingText } from '@/lib/following';

/**
 * El feed de lo social: la actividad de quienes seguís, mezclada por fecha.
 *
 * Se arma en tu dispositivo con las instantáneas de cada uno, como el feed
 * de reseñas de antes: el servidor no sabe a quién seguís ni qué ven. Las
 * reseñas de los perfiles públicos que seguías antes de que existieran las
 * cuentas también entran, convertidas en eventos, hasta que esa persona
 * crea la suya.
 */

/** Cuántos ítems muestra el feed. */
export const MAX_FEED = 80;

/** Alguien del feed: lo que hace falta para nombrarlo y llevar a su perfil. */
export interface FeedPerson {
  uid: string;
  /** Su usuario, que es también la dirección de su perfil. */
  handle: string;
  name: string;
  avatarPath: string | null;
}

export interface FeedItem {
  key: string;
  person: FeedPerson;
  event: ActivityEvent;
  /** Quiénes reaccionaron, por reacción. Vacío en las reseñas de antes. */
  reactions: Partial<Record<ReactionId, string[]>>;
  /** Solo se reacciona a eventos de una actividad: las reseñas de antes no tienen dónde. */
  canReact: boolean;
}

export type FeedFilter = 'todo' | 'resenas' | 'amigos';

export const FEED_FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'resenas', label: 'Reseñas' },
  { id: 'amigos', label: 'Amigos' },
];

export interface FeedSource {
  person: FeedPerson;
  activity: Activity;
}

/** Una reseña de un perfil público de antes, ya como evento. */
export interface LegacySource {
  person: FeedPerson;
  events: ActivityEvent[];
}

/** Si un evento es una reseña escrita: lo que muestra el filtro "Reseñas". */
export function isReview(event: ActivityEvent): boolean {
  return event.kind === 'completed' && Boolean(event.text);
}

export function buildSocialFeed({
  sources,
  legacy = [],
  muted = [],
  mutuals = [],
  filter = 'todo',
  limit = MAX_FEED,
}: {
  sources: FeedSource[];
  legacy?: LegacySource[];
  muted?: string[];
  /** Los uids con quienes se siguen mutuamente: el filtro "Amigos". */
  mutuals?: string[];
  filter?: FeedFilter;
  limit?: number;
}): FeedItem[] {
  const silenced = new Set(muted);
  const friends = new Set(mutuals);
  const withActivity = new Set(sources.map((source) => source.person.uid));
  const items: FeedItem[] = [];

  for (const { person, activity } of sources) {
    if (silenced.has(person.uid)) continue;
    for (const event of activity.events) {
      items.push({
        key: `${person.uid}:${event.id}`,
        person,
        event,
        reactions: activity.reactions[event.id] ?? {},
        canReact: true,
      });
    }
  }
  for (const { person, events } of legacy) {
    // Si ya tiene cuenta y la seguís por ahí, sus reseñas vienen en su actividad.
    if (silenced.has(person.uid) || withActivity.has(person.uid)) continue;
    for (const event of events) {
      items.push({ key: `legacy:${person.handle}:${event.id}`, person, event, reactions: {}, canReact: false });
    }
  }

  return items
    .filter((item) => {
      if (filter === 'resenas') return isReview(item.event);
      if (filter === 'amigos') return friends.has(item.person.uid);
      return true;
    })
    .sort(
      (a, b) =>
        Date.parse(b.event.at) - Date.parse(a.event.at) || a.person.name.localeCompare(b.person.name, 'es'),
    )
    .slice(0, limit);
}

/** "1 episodio", "3 episodios". */
function episodesText(count: number): string {
  return `${count} ${count === 1 ? 'episodio' : 'episodios'}`;
}

/**
 * Qué hizo, en una frase y en texto plano: para leerla en voz alta y para
 * el `aria-label` de la tarjeta. La tarjeta la dibuja con sus partes.
 */
export function eventHeadline(name: string, event: ActivityEvent): string {
  const title = event.title?.title ?? '';
  switch (event.kind) {
    case 'completed':
      if (event.rewatch) {
        return event.rating
          ? `${name} volvió a ver ${title} y le puso ${ratingText(event.rating)}`
          : `${name} volvió a ver ${title}`;
      }
      return event.rating ? `${name} le puso ${ratingText(event.rating)} a ${title}` : `${name} terminó ${title}`;
    case 'abandoned':
      return `${name} abandonó ${title}`;
    case 'started':
      return `${name} empezó ${title}`;
    case 'progress':
      return `${name} vio ${episodesText(event.episodes ?? 1)} de ${title}`;
    case 'added':
      return `${name} sumó ${title} a su Por Ver`;
    case 'goal':
      return event.goal
        ? `${name} cumplió su meta de ${goalUnit(event.goal.kind, event.goal.target)} en ${event.goal.year}`
        : `${name} cumplió una meta`;
    case 'list':
      return `${name} publicó la lista "${event.list?.name ?? ''}"`;
  }
}

/** "Hasta T2E5", para las tarjetas de episodios. */
export function progressDetail(event: ActivityEvent): string | null {
  if ((event.kind !== 'progress' && event.kind !== 'started') || !event.season || !event.episode) return null;
  return `Hasta T${event.season}E${event.episode}`;
}

export interface WatchingBubble {
  person: FeedPerson;
  now: WatchingNow;
}

/**
 * La fila de "Viendo ahora": una burbuja por persona, con lo último que está
 * viendo, de quien lo tocó más recientemente a quien menos.
 */
export function watchingRow(sources: FeedSource[], muted: string[] = []): WatchingBubble[] {
  const silenced = new Set(muted);
  return sources
    .filter((source) => !silenced.has(source.person.uid) && source.activity.watching.length > 0)
    .map((source) => ({ person: source.person, now: source.activity.watching[0] }))
    .sort((a, b) => Date.parse(b.now.at) - Date.parse(a.now.at));
}

// --- "Lo vieron tus amigos" ---------------------------------------------------

export interface FriendOnTitle {
  person: FeedPerson;
  entry: LibraryEntry;
  /** La reseña, si la escribió y sigue entre sus eventos. */
  review?: string;
}

const STATUS_ORDER: Record<LibraryEntry['status'], number> = {
  completada: 0,
  viendo: 1,
  en_pausa: 2,
  por_ver: 3,
  abandonada: 4,
};

/**
 * Quiénes de los que seguís tienen este título, y qué hicieron con él. Del
 * resumen de su biblioteca, o de sus eventos si no comparte el resumen.
 */
export function friendsOnTitle(
  sources: FeedSource[],
  tmdbId: number,
  mediaType: MediaType,
  muted: string[] = [],
): FriendOnTitle[] {
  const silenced = new Set(muted);
  const result: FriendOnTitle[] = [];
  for (const { person, activity } of sources) {
    if (silenced.has(person.uid)) continue;
    const events = activity.events.filter(
      (event) => event.title?.tmdbId === tmdbId && event.title.mediaType === mediaType,
    );
    const review = events.find((event) => event.kind === 'completed' && event.text)?.text;
    const entry = findInLibrary(activity, tmdbId, mediaType) ?? entryFromEvents(tmdbId, mediaType, events);
    if (entry) result.push({ person, entry, ...(review ? { review } : {}) });
  }
  return result.sort(
    (a, b) =>
      STATUS_ORDER[a.entry.status] - STATUS_ORDER[b.entry.status] ||
      (b.entry.rating ?? 0) - (a.entry.rating ?? 0) ||
      a.person.name.localeCompare(b.person.name, 'es'),
  );
}

function entryFromEvents(tmdbId: number, mediaType: MediaType, events: ActivityEvent[]): LibraryEntry | undefined {
  const latest = events.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!latest) return undefined;
  const status: LibraryEntry['status'] =
    latest.kind === 'completed'
      ? 'completada'
      : latest.kind === 'abandoned'
        ? 'abandonada'
        : latest.kind === 'added'
          ? 'por_ver'
          : 'viendo';
  return { tmdbId, mediaType, status, ...(latest.rating ? { rating: latest.rating } : {}) };
}

/** "le puso 4,5", "lo tiene en Por Ver": lo que va al lado del nombre. */
export function friendStatusText(entry: LibraryEntry): string {
  switch (entry.status) {
    case 'completada':
      return entry.rating ? `le puso ${ratingText(entry.rating)}` : 'lo vio';
    case 'viendo':
      return 'lo está viendo';
    case 'en_pausa':
      return 'lo tiene en pausa';
    case 'por_ver':
      return 'lo tiene en Por Ver';
    case 'abandonada':
      return 'lo abandonó';
  }
}

// --- Spoilers -----------------------------------------------------------------

/**
 * Si una reseña puede arruinarte algo: es de un título que tenés pendiente
 * —en *Por Ver*, viéndolo o en pausa—. Se muestra tapada, con "Mostrar".
 * Lo que ya terminaste o abandonaste, o nunca anotaste, se ve directo.
 */
export function isSpoilerRisk(event: ActivityEvent, library: SavedMedia[]): boolean {
  if (event.kind !== 'completed' || !event.text || !event.title) return false;
  const { tmdbId, mediaType } = event.title;
  const mine = library.find((media) => media.tmdbId === tmdbId && media.mediaType === mediaType);
  return mine !== undefined && (mine.status === 'por_ver' || mine.status === 'viendo' || mine.status === 'en_pausa');
}

// --- Reseñas de antes -----------------------------------------------------------

/** Una reseña de perfil público, con la forma de un evento del feed. */
export function legacyReviewEvent(review: {
  id: string;
  tmdbId: number;
  mediaType?: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: string;
  rating: number;
  text: string;
  tags: string[];
  completedAt: string;
}): ActivityEvent | null {
  // Sin el tipo, un perfil de antes no dice qué título es: no se puede guardar ni abrir.
  if (!review.mediaType || review.tmdbId <= 0 || Number.isNaN(Date.parse(review.completedAt))) return null;
  const title: ActivityTitle = {
    tmdbId: review.tmdbId,
    mediaType: review.mediaType,
    title: review.title,
    posterPath: review.posterPath,
    releaseYear: review.releaseYear,
  };
  return {
    id: `r:${review.id}`,
    kind: 'completed',
    at: review.completedAt,
    title,
    ...(review.rating > 0 ? { rating: review.rating } : {}),
    ...(review.text ? { text: review.text } : {}),
    ...(review.tags.length ? { tags: review.tags } : {}),
  };
}

// --- Señales para Explorar -------------------------------------------------------

export interface SocialTitleSignal {
  title: ActivityTitle;
  /** Quiénes, por nombre, del más reciente al más viejo. */
  names: string[];
}

export interface SocialSignals {
  /** Lo que están viendo ahora. */
  watching: SocialTitleSignal[];
  /** Lo que terminaron con 4,5 o más. */
  loved: SocialTitleSignal[];
}

const LOVED_RATING = 4.5;

function collect(entries: { title: ActivityTitle; name: string; at: string }[]): SocialTitleSignal[] {
  const byKey = new Map<string, { title: ActivityTitle; names: string[]; at: number }>();
  for (const entry of entries.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const key = `${entry.title.mediaType}:${entry.title.tmdbId}`;
    const current = byKey.get(key);
    if (current) {
      if (!current.names.includes(entry.name)) current.names.push(entry.name);
    } else {
      byKey.set(key, { title: entry.title, names: [entry.name], at: Date.parse(entry.at) });
    }
  }
  // Primero lo que comparten más personas; a igualdad, lo más reciente.
  return Array.from(byKey.values())
    .sort((a, b) => b.names.length - a.names.length || b.at - a.at)
    .map(({ title, names }) => ({ title, names }));
}

/** Lo que Explorar puede usar de la gente que seguís. */
export function socialSignals(sources: FeedSource[], muted: string[] = []): SocialSignals {
  const silenced = new Set(muted);
  const active = sources.filter((source) => !silenced.has(source.person.uid));
  return {
    watching: collect(
      active.flatMap(({ person, activity }) =>
        activity.watching.map((now) => ({ title: now.title, name: person.name, at: now.at })),
      ),
    ),
    loved: collect(
      active.flatMap(({ person, activity }) =>
        activity.events
          .filter((event) => event.kind === 'completed' && (event.rating ?? 0) >= LOVED_RATING && event.title)
          .map((event) => ({ title: event.title!, name: person.name, at: event.at })),
      ),
    ),
  };
}

/** "Ana, Beto y 2 más". */
export function namesText(names: string[], max = 2): string {
  if (names.length <= max) return names.join(names.length === 2 ? ' y ' : ', ');
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} y ${rest} más`;
}
