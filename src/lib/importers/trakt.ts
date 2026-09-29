import { MediaType } from '@/types';
import { fromTenPoint } from '@/lib/importers/ratings';
import { ImportFile, ImportRecord, ImportWatch } from '@/lib/importers/types';

/**
 * El export de Trakt: archivos JSON, uno por cosa —el historial, lo visto,
 * los puntajes, la lista para ver—, con la forma de su API. Cada película o
 * serie trae sus ids, entre ellos el de TMDB: el match es directo.
 *
 * No se depende del nombre de cada archivo sino de la forma de cada ítem, que
 * es la de la API y no cambia de un export a otro:
 *
 * - historial: `{ watched_at, type: 'movie' | 'episode', movie | show + episode }`
 * - vistos: `{ plays, last_watched_at, movie }` o `{ show, seasons: [{ number, episodes }] }`
 * - puntajes: `{ rated_at, rating, type, movie | show }` (de 1 a 10)
 * - para ver: `{ listed_at, type, movie | show }`
 */

interface TraktIds {
  trakt?: number;
  tmdb?: number | null;
  imdb?: string | null;
}

interface TraktTitle {
  title?: string;
  year?: number | null;
  ids?: TraktIds;
}

type Item = Record<string, unknown>;

function isRecord(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Si un JSON es un export de Trakt: una lista de ítems con película o serie. */
export function isTraktExport(value: unknown): value is Item[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.some((item) => isRecord(item) && (isRecord(item.movie) || isRecord(item.show)))
  );
}

interface Entry {
  title: string;
  year?: number;
  mediaType: MediaType;
  ids: { imdb?: string; tmdb?: number };
  /** Las fechas de cada vez que se vio. */
  plays: Set<string>;
  /** Cuántas veces dice Trakt que se vio, sepa o no cuándo. */
  playCount: number;
  rating?: number;
  ratedAt?: string;
  onWatchlist: boolean;
  episodes: Map<string, { season: number; episode: number; watchedAt?: string }>;
}

function isoOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

export function parseTrakt(files: ImportFile[]): ImportRecord[] {
  const entries = new Map<string, Entry>();

  const entryFor = (raw: unknown, mediaType: MediaType): Entry | null => {
    if (!isRecord(raw)) return null;
    const title = raw as TraktTitle;
    const name = typeof title.title === 'string' ? title.title.trim() : '';
    const tmdb = Number(title.ids?.tmdb);
    const imdb = typeof title.ids?.imdb === 'string' && /^tt\d+$/.test(title.ids.imdb) ? title.ids.imdb : undefined;
    const key = Number.isInteger(tmdb) && tmdb > 0 ? `${mediaType}:${tmdb}` : imdb ? `imdb:${imdb}` : `${mediaType}:${name.toLowerCase()}:${title.year ?? ''}`;
    if (!name && !(Number.isInteger(tmdb) && tmdb > 0) && !imdb) return null;

    const current = entries.get(key) ?? {
      title: name,
      ...(typeof title.year === 'number' && title.year > 1800 ? { year: title.year } : {}),
      mediaType,
      ids: {
        ...(Number.isInteger(tmdb) && tmdb > 0 ? { tmdb } : {}),
        ...(imdb ? { imdb } : {}),
      },
      plays: new Set<string>(),
      playCount: 0,
      onWatchlist: false,
      episodes: new Map(),
    };
    entries.set(key, current);
    return current;
  };

  const markEpisode = (entry: Entry, season: unknown, episode: unknown, watchedAt?: string) => {
    const s = Number(season);
    const e = Number(episode);
    if (!Number.isInteger(s) || s < 0 || !Number.isInteger(e) || e < 1) return;
    const key = `${s}x${e}`;
    const known = entry.episodes.get(key);
    // Si se vio dos veces, vale la más reciente: es la que dice en qué anda.
    if (!known || (watchedAt && (!known.watchedAt || watchedAt > known.watchedAt))) {
      entry.episodes.set(key, { season: s, episode: e, ...(watchedAt ? { watchedAt } : {}) });
    }
  };

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;

    for (const item of data) {
      if (!isRecord(item)) continue;
      // Un puntaje o un "para ver" de una temporada o un episodio suelto no
      // dice nada de la serie entera: no crea el título.
      if ((item.type === 'season' || item.type === 'episode') && typeof item.watched_at !== 'string') continue;
      const isMovie = isRecord(item.movie);
      const entry = entryFor(isMovie ? item.movie : item.show, isMovie ? 'movie' : 'tv');
      if (!entry) continue;

      if (typeof item.rating === 'number') {
        entry.rating = fromTenPoint(item.rating);
        entry.ratedAt = isoOrUndefined(item.rated_at);
      } else if (typeof item.watched_at === 'string') {
        // Historial: una línea por vez que se vio.
        const at = isoOrUndefined(item.watched_at);
        if (isRecord(item.episode)) markEpisode(entry, item.episode.season, item.episode.number, at);
        else if (at && isMovie) entry.plays.add(at);
      } else if (typeof item.plays === 'number') {
        // Vistos: la cuenta de vistas y la última fecha.
        if (isMovie) {
          const at = isoOrUndefined(item.last_watched_at);
          if (at) entry.plays.add(at);
          entry.playCount = Math.max(entry.playCount, item.plays);
        }
        for (const season of Array.isArray(item.seasons) ? item.seasons : []) {
          if (!isRecord(season)) continue;
          for (const episode of Array.isArray(season.episodes) ? season.episodes : []) {
            if (!isRecord(episode)) continue;
            markEpisode(entry, season.number, episode.number, isoOrUndefined(episode.last_watched_at));
          }
        }
      } else if (typeof item.listed_at === 'string') {
        entry.onWatchlist = true;
      }
    }
  }

  return Array.from(entries.values()).map((entry) => {
    const watched = entry.plays.size > 0 || entry.playCount > 0 || entry.rating !== undefined;
    const episodes = Array.from(entry.episodes.values()).sort(
      (a, b) => a.season - b.season || a.episode - b.episode,
    );

    // El puntaje va a la vez más reciente; las demás, sin puntaje, no entran
    // al historial (ver `toMedia`). Una puntuada sin fecha de vista toma la
    // fecha en que se puntuó.
    const plays = Array.from(entry.plays).sort().reverse();
    const watches: ImportWatch[] = plays.map((date) => ({ date }));
    if (entry.rating !== undefined) {
      if (watches.length === 0) watches.push({ date: entry.ratedAt, rating: entry.rating });
      else watches[0] = { ...watches[0], rating: entry.rating };
    }

    const status: ImportRecord['status'] =
      entry.mediaType === 'tv'
        ? episodes.length > 0
          ? 'viendo'
          : entry.rating !== undefined
            ? 'completada'
            : 'por_ver'
        : watched
          ? 'completada'
          : 'por_ver';

    return {
      source: 'trakt' as const,
      title: entry.title,
      ...(entry.year !== undefined ? { year: entry.year } : {}),
      mediaType: entry.mediaType,
      ids: entry.ids,
      status,
      watches: status === 'por_ver' ? [] : watches,
      ...(episodes.length ? { episodes } : {}),
    };
  });
}
