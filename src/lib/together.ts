import { MediaType, SavedMedia } from '@/types';

/**
 * "¿Qué miramos juntos?": cruzar mi *Por Ver* con el de otra persona.
 *
 * Lo de la otra persona sale de su perfil público, y solo si eligió incluir
 * su *Por Ver* (y, aparte, sus plataformas). De lo que ya vio se sabe solo lo
 * que publicó —sus reseñas y sus favoritas—: el perfil no publica su
 * historial entero, y no hace falta abrirlo para esto.
 */

/** Un título del *Por Ver* publicado: lo justo para mostrarlo y filtrarlo. */
export interface WatchlistItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: string;
  genres: string[];
  /** Minutos: de la película, o de un episodio en una serie. */
  runtime?: number;
  /** Las plataformas donde está incluido, en el país de quien lo publicó. */
  streaming?: string[];
}

/** Tope del *Por Ver* publicado: alcanza y sobra para elegir una noche. */
export const MAX_WATCHLIST = 150;

/** El *Por Ver* que se publica, por nombre. */
export function publicWatchlist(mediaList: SavedMedia[]): WatchlistItem[] {
  return mediaList
    .filter((media) => media.status === 'por_ver')
    .sort((a, b) => a.title.localeCompare(b.title, 'es') || a.tmdbId - b.tmdbId)
    .slice(0, MAX_WATCHLIST)
    .map((media) => ({
      tmdbId: media.tmdbId,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.posterPath,
      releaseYear: media.releaseYear,
      genres: media.genres.slice(0, 5),
      ...(media.runtime ? { runtime: media.runtime } : {}),
      ...(media.streaming?.length ? { streaming: media.streaming.slice(0, 10) } : {}),
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const strings = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, max)
    : [];

/** Lee el *Por Ver* publicado; `undefined` si no se publicó. */
export function parseWatchlist(value: unknown): WatchlistItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .flatMap((raw): WatchlistItem[] => {
      if (!isRecord(raw)) return [];
      const tmdbId = Number(raw.tmdbId);
      const mediaType = raw.mediaType === 'movie' || raw.mediaType === 'tv' ? raw.mediaType : null;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return [];
      const runtime = Number(raw.runtime);
      const streaming = strings(raw.streaming, 10);
      return [
        {
          tmdbId,
          mediaType,
          title,
          posterPath: typeof raw.posterPath === 'string' ? raw.posterPath : null,
          releaseYear: typeof raw.releaseYear === 'string' ? raw.releaseYear : '',
          genres: strings(raw.genres, 5),
          ...(Number.isFinite(runtime) && runtime > 0 ? { runtime } : {}),
          ...(streaming.length ? { streaming } : {}),
        },
      ];
    })
    .slice(0, MAX_WATCHLIST);
}

/** De dónde sale un candidato. */
export type TogetherSource = 'both' | 'mine' | 'theirs';

export interface TogetherCandidate {
  /** El mío si lo tengo —con todo lo que sé de él—, o uno armado con lo publicado. */
  media: SavedMedia;
  source: TogetherSource;
}

const keyOf = (item: { mediaType: MediaType; tmdbId: number }) => `${item.mediaType}:${item.tmdbId}`;

/** Lo que la otra persona tiene en *Por Ver*, como título de biblioteca. */
function fromWatchlist(item: WatchlistItem): SavedMedia {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: null,
    releaseYear: item.releaseYear,
    genres: item.genres,
    status: 'por_ver',
    updatedAt: new Date(0).toISOString(),
    ...(item.runtime ? { runtime: item.runtime } : {}),
    ...(item.streaming ? { streaming: item.streaming, providers: item.streaming } : {}),
  };
}

/**
 * Los candidatos para ver juntos, en orden: primero lo que los dos tienen en
 * *Por Ver*; después lo que uno tiene en *Por Ver* y el otro no vio.
 *
 * Se descarta lo que alguno ya completó o abandonó. De la otra persona, "ya
 * vio" es lo que reseñó o tiene entre sus favoritas: lo único que publica.
 */
export function crossWatchlists(
  mine: SavedMedia[],
  theirs: { watchlist: WatchlistItem[]; seen: { mediaType?: MediaType; tmdbId: number }[] },
): TogetherCandidate[] {
  const myPending = new Map<string, SavedMedia>();
  const mySeen = new Set<string>();
  for (const media of mine) {
    if (media.status === 'por_ver') myPending.set(keyOf(media), media);
    if (media.status === 'completada' || media.status === 'abandonada') mySeen.add(keyOf(media));
  }

  const theirPending = new Map<string, WatchlistItem>();
  for (const item of theirs.watchlist) theirPending.set(keyOf(item), item);
  // Sin el tipo (un perfil de antes) no se puede decir qué título es: no cuenta.
  const theirSeen = new Set(
    theirs.seen
      .filter((item): item is { mediaType: MediaType; tmdbId: number } => item.mediaType !== undefined && item.tmdbId > 0)
      .map(keyOf),
  );

  const byTitle = (a: TogetherCandidate, b: TogetherCandidate) =>
    a.media.title.localeCompare(b.media.title, 'es');

  const both: TogetherCandidate[] = [];
  const oneSide: TogetherCandidate[] = [];

  for (const [key, media] of myPending) {
    if (theirPending.has(key)) both.push({ media, source: 'both' });
    else if (!theirSeen.has(key)) oneSide.push({ media, source: 'mine' });
  }
  for (const [key, item] of theirPending) {
    if (myPending.has(key) || mySeen.has(key)) continue;
    oneSide.push({ media: fromWatchlist(item), source: 'theirs' });
  }

  return [...both.sort(byTitle), ...oneSide.sort(byTitle)];
}

/** Las plataformas que pagan los dos, listas para `isAvailableNow`. */
export function sharedPlatforms(mine: Set<string>, theirs: string[]): Set<string> {
  return new Set(theirs.map((name) => name.trim().toLowerCase()).filter((name) => mine.has(name)));
}

/** "Los dos", "En tu Por Ver", "En el de Ana". */
export function sourceLabel(source: TogetherSource, name: string): string {
  if (source === 'both') return 'Los dos la tienen en Por Ver';
  if (source === 'mine') return 'En tu Por Ver';
  return `En el Por Ver de ${name}`;
}
