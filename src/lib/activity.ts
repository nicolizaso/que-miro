import { Collection, Goals, MediaStatus, MediaType, SavedMedia, SocialSettings } from '@/types';
import { allWatches } from '@/lib/stats';
import { GoalKind } from '@/lib/goals';
import { furthestWatched, formatEpisode } from '@/lib/progress';
import { isAbandonedEntry, lastActivity } from '@/lib/archive';
import { latestRating } from '@/lib/schema';
import { toDayKey } from '@/lib/dates';
import { WatchlistItem, parseWatchlist, publicWatchlist } from '@/lib/together';
import { stableJson } from '@/lib/autoPublish';
import { Reaction, ReactionId, isImagePath, isReactionId } from '@/lib/social';

/**
 * La actividad que ven quienes te siguen, en `activity/{uid}`.
 *
 * Es una instantánea y no una ventana, igual que el perfil público: la arma
 * tu app a partir de tu biblioteca, con lo que elegiste compartir, y la
 * republica cuando cambia. Los eventos no se guardan uno por uno cuando
 * pasan: se deducen cada vez de la biblioteca —el historial, las fechas de
 * los episodios, `addedAt`—. Así borrar una reseña la saca del feed sola, y
 * no hay una cola de eventos que se desincronice con lo que de verdad hiciste.
 *
 * Lo que nunca sale de acá: el motivo de un abandono, lo que ocultaste título
 * por título, y todo lo que apagaste en Ajustes.
 */

/** Cuántos eventos se publican: alcanza para ponerse al día, no es un archivo. */
export const MAX_EVENTS = 50;
export const MAX_WATCHING = 10;
/** Tope del resumen de la biblioteca: 3000 títulos son unos 50 KB. */
export const MAX_LIBRARY = 3000;
export const MAX_LISTS = 30;
/** Tope de quiénes reaccionaron, por evento y reacción. */
const MAX_REACTORS = 100;
/** Una reseña larguísima no entra entera al feed de los demás. */
const MAX_TEXT = 1000;
/** Lo que cuenta como "viendo ahora": algo que tocaste en estas dos semanas. */
const WATCHING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/**
 * Terminar una serie marca de golpe lo que faltaba, con la hora de ese
 * momento. Esos episodios ya los cuenta "terminó", así que no se suman como
 * "vio 40 episodios".
 */
const COMPLETION_OVERLAP_MS = 2 * 60 * 1000;

export type ActivityKind = 'completed' | 'abandoned' | 'started' | 'progress' | 'added' | 'goal' | 'list';

/** Lo justo de un título para mostrarlo y guardarlo. */
export interface ActivityTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: string;
}

export interface ActivityEvent {
  /** Estable entre publicaciones: es a lo que apuntan las reacciones. */
  id: string;
  kind: ActivityKind;
  at: string; // ISO
  title?: ActivityTitle;
  /** `completed` y `abandoned`, si hubo puntaje. */
  rating?: number;
  /** `completed`: la reseña, si la escribiste. */
  text?: string;
  tags?: string[];
  /** `completed`: no era la primera vez. */
  rewatch?: boolean;
  /** `progress` y `started`: cuántos episodios ese día, y hasta cuál. */
  episodes?: number;
  season?: number;
  episode?: number;
  /** `goal`: la meta cumplida. */
  goal?: { year: number; kind: GoalKind; target: number };
  /** `list`: la lista publicada, por su id público. */
  list?: { id: string; name: string; count: number };
}

export interface WatchingNow {
  title: ActivityTitle;
  /** "T2E5" en una serie; en una película, nada. */
  label?: string;
  at: string;
}

/** Un título de la biblioteca, resumido: qué es, en qué lista y qué puntaje. */
export interface LibraryEntry {
  tmdbId: number;
  mediaType: MediaType;
  status: MediaStatus;
  rating?: number;
}

export interface PublishedListRef {
  id: string;
  name: string;
  count: number;
}

/** Quiénes reaccionaron a cada evento: evento → reacción → uids. */
export type ReactionSummary = Record<string, Partial<Record<ReactionId, string[]>>>;

export interface Activity {
  uid: string;
  updatedAt: string;
  events: ActivityEvent[];
  watching: WatchingNow[];
  library: LibraryEntry[];
  watchlist: WatchlistItem[];
  lists: PublishedListRef[];
  reactions: ReactionSummary;
}

const titleOf = (media: SavedMedia): ActivityTitle => ({
  tmdbId: media.tmdbId,
  mediaType: media.mediaType,
  title: media.title,
  posterPath: media.posterPath,
  releaseYear: media.releaseYear,
});

const keyOf = (media: Pick<SavedMedia, 'mediaType' | 'tmdbId'>) =>
  `${media.mediaType === 'movie' ? 'm' : 't'}${media.tmdbId}`;

function completedEvents(list: SavedMedia[]): ActivityEvent[] {
  return list.flatMap((media) => {
    const entries = (media.history ?? [])
      .filter((entry) => !isAbandonedEntry(entry))
      .slice()
      .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt));
    return entries.map((entry, index): ActivityEvent => ({
      id: `c:${keyOf(media)}:${entry.id}`,
      kind: 'completed',
      at: entry.completedAt,
      title: titleOf(media),
      ...(entry.rating > 0 ? { rating: entry.rating } : {}),
      ...(entry.text ? { text: entry.text.slice(0, MAX_TEXT) } : {}),
      ...(entry.tags?.length ? { tags: entry.tags.slice(0, 8) } : {}),
      ...(index > 0 ? { rewatch: true } : {}),
    }));
  });
}

function abandonedEvents(list: SavedMedia[]): ActivityEvent[] {
  return list.flatMap((media): ActivityEvent[] => {
    if (media.status !== 'abandonada' || !media.archive?.at) return [];
    const rating = media.history?.find(isAbandonedEntry)?.rating;
    // El motivo no viaja: es lo que se escribe pensando que nadie lo lee.
    return [
      {
        id: `a:${keyOf(media)}:${media.archive.at}`,
        kind: 'abandoned',
        at: media.archive.at,
        title: titleOf(media),
        ...(rating ? { rating } : {}),
      },
    ];
  });
}

/**
 * Los episodios, agrupados por serie y por día: "vio 3 episodios de
 * *Severance*". Si ese día arrancó por el primero, es "empezó".
 */
function progressEvents(list: SavedMedia[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const media of list) {
    const marks = media.mediaType === 'tv' ? media.progress?.watchedAt : undefined;
    if (!marks) continue;
    const completions = (media.history ?? [])
      .filter((entry) => !isAbandonedEntry(entry))
      .map((entry) => Date.parse(entry.completedAt));

    const byDay = new Map<string, { season: number; episode: number; at: number }[]>();
    for (const [key, iso] of Object.entries(marks)) {
      const at = Date.parse(iso);
      const [season, episode] = key.split('x').map(Number);
      if (Number.isNaN(at) || !season || !episode) continue;
      if (completions.some((done) => Math.abs(done - at) <= COMPLETION_OVERLAP_MS)) continue;
      const day = toDayKey(new Date(at));
      byDay.set(day, [...(byDay.get(day) ?? []), { season, episode, at }]);
    }

    for (const [day, episodes] of byDay) {
      const last = episodes.reduce((best, current) =>
        current.season > best.season || (current.season === best.season && current.episode > best.episode)
          ? current
          : best,
      );
      const at = Math.max(...episodes.map((episode) => episode.at));
      const started = episodes.some((episode) => episode.season === 1 && episode.episode === 1);
      events.push({
        id: `p:${keyOf(media)}:${day}`,
        kind: started ? 'started' : 'progress',
        at: new Date(at).toISOString(),
        title: titleOf(media),
        episodes: episodes.length,
        season: last.season,
        episode: last.episode,
      });
    }
  }
  return events;
}

function addedEvents(list: SavedMedia[]): ActivityEvent[] {
  return list.flatMap((media): ActivityEvent[] =>
    media.status === 'por_ver' && media.addedAt
      ? [{ id: `w:${keyOf(media)}:${media.addedAt}`, kind: 'added', at: media.addedAt, title: titleOf(media) }]
      : [],
  );
}

/**
 * Las metas cumplidas: la fecha es la de la película o la serie que la
 * completó. Las de horas no: saber en qué momento exacto se llegó pide
 * reconstruir cada minuto del año, y "cumplió su meta de horas" sin fecha
 * cierta no es un evento.
 */
function goalEvents(list: SavedMedia[], goals: Goals): ActivityEvent[] {
  const watches = allWatches(list);
  const events: ActivityEvent[] = [];
  for (const [yearKey, goal] of Object.entries(goals.byYear)) {
    const year = Number(yearKey);
    for (const kind of ['movies', 'series'] as const) {
      const target = goal[kind];
      if (!target) continue;
      const type: MediaType = kind === 'movies' ? 'movie' : 'tv';
      const inYear = watches
        .filter(({ media, entry }) => media.mediaType === type && new Date(entry.completedAt).getFullYear() === year)
        .sort((a, b) => Date.parse(a.entry.completedAt) - Date.parse(b.entry.completedAt));
      const reached = inYear[target - 1];
      if (!reached) continue;
      events.push({
        id: `g:${year}:${kind}:${target}`,
        kind: 'goal',
        at: reached.entry.completedAt,
        goal: { year, kind, target },
      });
    }
  }
  return events;
}

function listRefs(list: SavedMedia[], collections: Collection[]): (PublishedListRef & { publishedAt?: string })[] {
  return collections
    .filter((collection) => collection.publicId)
    .map((collection) => ({
      id: collection.publicId!,
      name: collection.name,
      count: list.filter((media) => media.collections?.includes(collection.id)).length,
      publishedAt: collection.publishedAt,
    }));
}

/** Lo que estás viendo: lo de *Viendo* que tocaste en estas dos semanas. */
export function watchingNow(list: SavedMedia[], now = new Date()): WatchingNow[] {
  return list
    .filter((media) => media.status === 'viendo' && now.getTime() - lastActivity(media) <= WATCHING_WINDOW_MS)
    .sort((a, b) => lastActivity(b) - lastActivity(a))
    .slice(0, MAX_WATCHING)
    .map((media) => {
      const furthest = media.mediaType === 'tv' ? furthestWatched(media) : null;
      return {
        title: titleOf(media),
        ...(furthest ? { label: formatEpisode(furthest.seasonNumber, furthest.episode) } : {}),
        at: new Date(lastActivity(media)).toISOString(),
      };
    });
}

/** El resumen de la biblioteca: lo puntuado y lo tocado último, primero. */
export function libraryIndex(list: SavedMedia[]): LibraryEntry[] {
  return list
    .slice()
    .sort((a, b) => Number(latestRating(b) !== undefined) - Number(latestRating(a) !== undefined) || lastActivity(b) - lastActivity(a))
    .slice(0, MAX_LIBRARY)
    .map((media) => {
      const rating = latestRating(media);
      return {
        tmdbId: media.tmdbId,
        mediaType: media.mediaType,
        status: media.status,
        ...(rating ? { rating } : {}),
      };
    });
}

/**
 * Cuenta las reacciones de los eventos que siguen publicados. Las de eventos
 * que ya no están —una reseña borrada— se quedan afuera sin más.
 */
export function summarizeReactions(reactions: Reaction[], eventIds: Set<string>): ReactionSummary {
  const summary: ReactionSummary = {};
  const sorted = reactions.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const reaction of sorted) {
    if (!eventIds.has(reaction.eventId)) continue;
    const byEmoji = (summary[reaction.eventId] ??= {});
    const uids = (byEmoji[reaction.emoji] ??= []);
    if (uids.length < MAX_REACTORS && !uids.includes(reaction.reactor)) uids.push(reaction.reactor);
  }
  return summary;
}

export interface BuildActivityInput {
  uid: string;
  mediaList: SavedMedia[];
  collections: Collection[];
  goals: Goals;
  settings: SocialSettings;
  reactions?: Reaction[];
  now?: Date;
}

/** Arma la instantánea con lo que se eligió compartir. */
export function buildActivity({
  uid,
  mediaList,
  collections,
  goals,
  settings,
  reactions = [],
  now = new Date(),
}: BuildActivityInput): Activity {
  const { sharing } = settings;
  const visible = mediaList.filter((media) => !media.hiddenFromFollowers);
  const lists = sharing.lists ? listRefs(visible, collections) : [];

  const events = [
    ...(sharing.completed ? completedEvents(visible) : []),
    ...(sharing.abandoned ? abandonedEvents(visible) : []),
    ...(sharing.progress ? progressEvents(visible) : []),
    ...(sharing.added ? addedEvents(visible) : []),
    ...(sharing.goals ? goalEvents(visible, goals) : []),
    ...lists.flatMap(({ publishedAt, ...list }): ActivityEvent[] =>
      publishedAt ? [{ id: `l:${list.id}`, kind: 'list', at: publishedAt, list }] : [],
    ),
  ]
    // Lo que tiene fecha rota o futura no se puede ordenar con sentido.
    .filter((event) => {
      const at = Date.parse(event.at);
      return !Number.isNaN(at) && at <= now.getTime() + 60_000;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, MAX_EVENTS);

  return {
    uid,
    updatedAt: now.toISOString(),
    events,
    watching: sharing.watching ? watchingNow(visible, now) : [],
    library: sharing.library ? libraryIndex(visible) : [],
    watchlist: sharing.library ? publicWatchlist(visible) : [],
    lists: lists.map(({ publishedAt: _publishedAt, ...list }) => list),
    reactions: summarizeReactions(reactions, new Set(events.map((event) => event.id))),
  };
}

// --- Documento -------------------------------------------------------------------

const STATUS_CODES: Record<MediaStatus, string> = {
  por_ver: 'w',
  viendo: 'v',
  completada: 'c',
  en_pausa: 'p',
  abandonada: 'a',
};
const CODE_STATUS = Object.fromEntries(Object.entries(STATUS_CODES).map(([status, code]) => [code, status])) as Record<
  string,
  MediaStatus
>;

/**
 * Un título del resumen, en texto: "m603:c:4.5". Miles de mapas de cuatro
 * claves pesan varias veces más que esto, y Firestore no admite listas de
 * listas.
 */
export function encodeLibraryEntry(entry: LibraryEntry): string {
  const base = `${entry.mediaType === 'movie' ? 'm' : 't'}${entry.tmdbId}:${STATUS_CODES[entry.status]}`;
  return entry.rating ? `${base}:${entry.rating}` : base;
}

export function decodeLibraryEntry(value: unknown): LibraryEntry | null {
  if (typeof value !== 'string') return null;
  const match = /^([mt])(\d{1,9}):([wvcpa])(?::(\d(?:\.\d)?))?$/.exec(value);
  if (!match) return null;
  const tmdbId = Number(match[2]);
  const rating = match[4] ? Number(match[4]) : undefined;
  if (tmdbId <= 0 || (rating !== undefined && (rating <= 0 || rating > 5))) return null;
  return {
    tmdbId,
    mediaType: match[1] === 'm' ? 'movie' : 'tv',
    status: CODE_STATUS[match[3]],
    ...(rating ? { rating } : {}),
  };
}

/** El documento, con las claves exactas que aceptan las reglas y sin `undefined`. */
export function activityToDocument(activity: Activity): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({
      uid: activity.uid,
      updatedAt: activity.updatedAt,
      events: activity.events,
      watching: activity.watching,
      library: activity.library.map(encodeLibraryEntry),
      watchlist: activity.watchlist,
      lists: activity.lists,
      reactions: activity.reactions,
    }),
  ) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const positiveInt = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};
const iso = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

function parseTitle(value: unknown): ActivityTitle | null {
  if (!isRecord(value)) return null;
  const tmdbId = positiveInt(value.tmdbId);
  const mediaType = value.mediaType === 'movie' || value.mediaType === 'tv' ? value.mediaType : null;
  const title = text(value.title, 200).trim();
  if (!tmdbId || !mediaType || !title) return null;
  return {
    tmdbId,
    mediaType,
    title,
    posterPath: isImagePath(value.posterPath) ? value.posterPath : null,
    releaseYear: text(value.releaseYear, 4),
  };
}

const KINDS: ActivityKind[] = ['completed', 'abandoned', 'started', 'progress', 'added', 'goal', 'list'];

function parseEvent(value: unknown): ActivityEvent | null {
  if (!isRecord(value)) return null;
  const id = text(value.id, 200);
  const kind = KINDS.find((candidate) => candidate === value.kind);
  const at = iso(value.at);
  if (!id || !kind || !at) return null;

  if (kind === 'goal') {
    const goal = isRecord(value.goal) ? value.goal : {};
    const year = positiveInt(goal.year);
    const target = positiveInt(goal.target);
    const goalKind = goal.kind === 'movies' || goal.kind === 'series' || goal.kind === 'hours' ? goal.kind : null;
    return year && target && goalKind ? { id, kind, at, goal: { year, kind: goalKind, target } } : null;
  }
  if (kind === 'list') {
    const list = isRecord(value.list) ? value.list : {};
    const listId = text(list.id, 32);
    const name = text(list.name, 80).trim();
    if (!/^[A-Za-z0-9_-]{12,32}$/.test(listId) || !name) return null;
    return { id, kind, at, list: { id: listId, name, count: positiveInt(list.count) ?? 0 } };
  }

  const title = parseTitle(value.title);
  if (!title) return null;
  const rating = Number(value.rating);
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '').slice(0, 8)
    : [];
  return {
    id,
    kind,
    at,
    title,
    ...(Number.isFinite(rating) && rating > 0 && rating <= 5 ? { rating } : {}),
    ...(kind === 'completed' && text(value.text, MAX_TEXT) ? { text: text(value.text, MAX_TEXT) } : {}),
    ...(kind === 'completed' && tags.length ? { tags } : {}),
    ...(kind === 'completed' && value.rewatch === true ? { rewatch: true } : {}),
    ...(positiveInt(value.episodes) ? { episodes: positiveInt(value.episodes) } : {}),
    ...(positiveInt(value.season) ? { season: positiveInt(value.season) } : {}),
    ...(positiveInt(value.episode) ? { episode: positiveInt(value.episode) } : {}),
  };
}

function parseReactions(value: unknown): ReactionSummary {
  if (!isRecord(value)) return {};
  const summary: ReactionSummary = {};
  for (const [eventId, byEmoji] of Object.entries(value)) {
    if (!isRecord(byEmoji)) continue;
    for (const [emoji, uids] of Object.entries(byEmoji)) {
      if (!isReactionId(emoji) || !Array.isArray(uids)) continue;
      const clean = uids.filter((uid): uid is string => typeof uid === 'string' && uid !== '').slice(0, MAX_REACTORS);
      if (clean.length) (summary[eventId] ??= {})[emoji] = clean;
    }
  }
  return summary;
}

/**
 * Lee la actividad de otra persona. La escribe su app, que puede ser vieja
 * o no ser la nuestra: lo roto se descarta de a uno, sin voltear el resto.
 */
export function parseActivity(value: unknown): Activity | null {
  if (!isRecord(value)) return null;
  const uid = text(value.uid, 128);
  if (!uid) return null;
  const list = <T,>(raw: unknown, parse: (item: unknown) => T | null, max: number): T[] =>
    (Array.isArray(raw) ? raw : []).map(parse).filter((item): item is T => item !== null).slice(0, max);

  return {
    uid,
    updatedAt: iso(value.updatedAt) ?? new Date(0).toISOString(),
    events: list(value.events, parseEvent, MAX_EVENTS),
    watching: list(
      value.watching,
      (raw) => {
        if (!isRecord(raw)) return null;
        const title = parseTitle(raw.title);
        const at = iso(raw.at);
        if (!title || !at) return null;
        const label = text(raw.label, 12);
        return { title, at, ...(label ? { label } : {}) };
      },
      MAX_WATCHING,
    ),
    library: list(value.library, decodeLibraryEntry, MAX_LIBRARY),
    watchlist: parseWatchlist(value.watchlist) ?? [],
    lists: list(
      value.lists,
      (raw) => {
        if (!isRecord(raw)) return null;
        const id = text(raw.id, 32);
        const name = text(raw.name, 80).trim();
        return /^[A-Za-z0-9_-]{12,32}$/.test(id) && name ? { id, name, count: positiveInt(raw.count) ?? 0 } : null;
      },
      MAX_LISTS,
    ),
    reactions: parseReactions(value.reactions),
  };
}

/** Dos instantáneas con lo mismo, sin mirar la fecha: no hace falta republicar. */
export function sameActivityContent(a: Activity, b: Activity): boolean {
  const content = ({ updatedAt: _updatedAt, ...rest }: Activity) => rest;
  return stableJson(content(a)) === stableJson(content(b));
}

/** Busca un título en el resumen de otra persona. */
export function findInLibrary(
  activity: Pick<Activity, 'library'>,
  tmdbId: number,
  mediaType: MediaType,
): LibraryEntry | undefined {
  return activity.library.find((entry) => entry.tmdbId === tmdbId && entry.mediaType === mediaType);
}
