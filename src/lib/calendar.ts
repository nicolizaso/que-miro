import { SavedMedia, TMDbSeason } from '@/types';
import { fromDayKey, isDayKey, toDayKey } from '@/lib/dates';
import { isStillAiring } from '@/lib/progress';

/**
 * El calendario de lo que sale de lo que seguís.
 *
 * Todo puro y todo en días: TMDB da la fecha de emisión como día y no como
 * hora, así que "hoy" y "esta semana" se deciden con el calendario de quien
 * mira, comparando textos `YYYY-MM-DD`, sin convertir zonas horarias.
 */

/**
 * Hasta dónde se piden las temporadas enteras.
 *
 * `nextToAir` da un solo episodio. Para las series con algo en el próximo mes
 * se pide la temporada y se listan todos sus episodios con fecha: es lo que
 * hace que una temporada que se estrena entera de una vez se vea como tal, y
 * no como un único episodio.
 */
export const DETAIL_WINDOW_DAYS = 30;

/** Cuántas semanas cubre "Próximas semanas" después de esta. */
const UPCOMING_WEEKS = 4;

/** Un día corrido `days` días. */
export function addDays(dayKey: string, days: number): string {
  const date = fromDayKey(dayKey);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

/** El domingo de la semana de ese día: las semanas van de lunes a domingo. */
export function endOfWeek(dayKey: string): string {
  const weekday = fromDayKey(dayKey).getDay(); // 0 es domingo
  return addDays(dayKey, weekday === 0 ? 0 : 7 - weekday);
}

/** Qué entra en el calendario de una serie o una película. */
function follows(media: SavedMedia): boolean {
  if (media.mediaType === 'tv') {
    // Las que estás viendo o terminaste y siguen saliendo, y las de Por Ver
    // que anuncian estreno. Las que pusiste en pausa también: pausar es
    // "después", no "nunca", y saber que viene temporada es lo que te hace
    // volver. Las abandonadas no: ahí ya decidiste.
    if (media.status === 'por_ver') return media.nextToAir !== undefined;
    return (
      (media.status === 'viendo' ||
        media.status === 'completada' ||
        media.status === 'en_pausa') &&
      isStillAiring(media)
    );
  }
  return media.status === 'por_ver' && media.releaseDate !== undefined;
}

/** La temporada a pedir de una serie, si tiene algo en el próximo mes. */
export function seasonsToFetch(
  list: SavedMedia[],
  today: string,
): { tmdbId: number; seasonNumber: number }[] {
  const limit = addDays(today, DETAIL_WINDOW_DAYS);
  return list
    .filter((media) => media.mediaType === 'tv' && follows(media))
    .filter((media) => {
      const date = media.nextToAir?.airDate;
      return date !== undefined && date >= today && date <= limit;
    })
    .map((media) => ({ tmdbId: media.tmdbId, seasonNumber: media.nextToAir!.seasonNumber }));
}

/** La clave con que se buscan las temporadas pedidas. */
export function seasonKey(tmdbId: number, seasonNumber: number): string {
  return `${tmdbId}:${seasonNumber}`;
}

export interface CalendarEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name?: string;
}

/** Lo que sale un día de un título: un episodio, varios, o un estreno. */
export interface CalendarItem {
  key: string;
  media: SavedMedia;
  date: string;
  /** Vacío en una película: lo que sale es la película. */
  episodes: CalendarEpisode[];
  /** Arranca algo: una película, una serie o una temporada. */
  isPremiere: boolean;
  /** Salen todos los episodios de la temporada el mismo día. */
  isWholeSeason: boolean;
}

export type CalendarGroupId = 'hoy' | 'semana' | 'proximas' | 'despues';

export interface CalendarGroup {
  id: CalendarGroupId;
  label: string;
  items: CalendarItem[];
}

export interface Calendar {
  /** Solo los grupos que tienen algo, en orden. */
  groups: CalendarGroup[];
  /** Series en emisión sin próximo episodio anunciado. */
  undated: SavedMedia[];
}

const GROUP_LABELS: Record<CalendarGroupId, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  proximas: 'Próximas semanas',
  despues: 'Más adelante',
};

function groupFor(date: string, today: string): CalendarGroupId {
  if (date === today) return 'hoy';
  const weekEnd = endOfWeek(today);
  if (date <= weekEnd) return 'semana';
  if (date <= addDays(weekEnd, UPCOMING_WEEKS * 7)) return 'proximas';
  return 'despues';
}

/**
 * Arma el calendario.
 *
 * `seasons` son las temporadas que ya se pidieron (ver {@link seasonsToFetch}),
 * con la clave de {@link seasonKey}. Las que no llegaron —sin conexión, TMDB
 * caído— no hacen falta: queda el próximo episodio que la ficha ya guardaba.
 *
 * Deduplica por título y día: una temporada que sale entera es una sola
 * entrada con sus diez episodios, y el episodio de `nextToAir` no aparece dos
 * veces por venir también en la temporada.
 */
export function buildCalendar(
  list: SavedMedia[],
  today: string,
  seasons: Map<string, TMDbSeason> = new Map(),
): Calendar {
  const byDay = new Map<string, CalendarItem>();
  const undated: SavedMedia[] = [];

  const add = (media: SavedMedia, date: string, episode?: CalendarEpisode) => {
    if (!isDayKey(date) || date < today) return;
    const key = `${media.tmdbId}:${date}`;
    const item = byDay.get(key) ?? {
      key,
      media,
      date,
      episodes: [],
      isPremiere: false,
      isWholeSeason: false,
    };
    if (
      episode &&
      !item.episodes.some(
        (known) =>
          known.seasonNumber === episode.seasonNumber &&
          known.episodeNumber === episode.episodeNumber,
      )
    ) {
      item.episodes.push(episode);
    }
    byDay.set(key, item);
  };

  for (const media of list) {
    if (!follows(media)) continue;

    if (media.mediaType === 'movie') {
      add(media, media.releaseDate!);
      continue;
    }

    const next = media.nextToAir;
    if (!next) {
      // En emisión y sin fecha: TMDB todavía no la anunció.
      if (media.status !== 'por_ver') undated.push(media);
      continue;
    }

    add(media, next.airDate, {
      seasonNumber: next.seasonNumber,
      episodeNumber: next.episodeNumber,
      name: next.name,
    });

    const season = seasons.get(seasonKey(media.tmdbId, next.seasonNumber));
    for (const episode of season?.episodes ?? []) {
      if (!episode.air_date || episode.episode_number < next.episodeNumber) continue;
      add(media, episode.air_date, {
        seasonNumber: next.seasonNumber,
        episodeNumber: episode.episode_number,
        name: episode.name || undefined,
      });
    }
  }

  const items = Array.from(byDay.values()).map((item) => {
    const episodes = [...item.episodes].sort(
      (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
    );
    const seasonNumber = episodes[0]?.seasonNumber;
    const season =
      seasonNumber !== undefined
        ? item.media.seasons?.find((known) => known.seasonNumber === seasonNumber)
        : undefined;
    const fetched =
      seasonNumber !== undefined
        ? seasons.get(seasonKey(item.media.tmdbId, seasonNumber))
        : undefined;
    const seasonSize = fetched?.episodes.length ?? season?.episodeCount ?? 0;

    return {
      ...item,
      episodes,
      isPremiere: item.media.mediaType === 'movie' || episodes[0]?.episodeNumber === 1,
      isWholeSeason:
        episodes.length > 1 &&
        episodes[0].episodeNumber === 1 &&
        episodes.length === seasonSize,
    };
  });

  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.media.title.localeCompare(b.media.title, 'es'),
  );

  const groups: CalendarGroup[] = (['hoy', 'semana', 'proximas', 'despues'] as const)
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      items: items.filter((item) => groupFor(item.date, today) === id),
    }))
    .filter((group) => group.items.length > 0);

  return {
    groups,
    undated: undated.sort((a, b) => a.title.localeCompare(b.title, 'es')),
  };
}

/** "T2E4", "T2E1–E10": qué episodios sale ese día. */
export function episodesLabel(item: CalendarItem): string {
  const [first] = item.episodes;
  if (!first) return '';
  const last = item.episodes[item.episodes.length - 1];
  if (item.episodes.length === 1) return `T${first.seasonNumber}E${first.episodeNumber}`;
  return `T${first.seasonNumber}E${first.episodeNumber}–E${last.episodeNumber}`;
}
