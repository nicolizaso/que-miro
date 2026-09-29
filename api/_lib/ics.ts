/**
 * El calendario `.ics` de los próximos episodios (RFC 5545).
 *
 * Lo pide Google Calendar, Apple Calendar u Outlook cada tantas horas, sin
 * sesión. Se arma con la instantánea que publica la app en
 * `calendar_feeds/{token}` —serie, temporada, episodio, nombre y fecha—, no
 * con la biblioteca: el servidor no sabe qué vio nadie.
 */

/** Un episodio publicado, tal como lo escribe la app (`src/lib/calendarFeed.ts`). */
export interface FeedEvent {
  tmdbId: number;
  series: string;
  season: number;
  episode: number;
  name?: string;
  /** `YYYY-MM-DD`: TMDB da días, no horas. */
  date: string;
}

export interface Feed {
  events: FeedEvent[];
  updatedAt?: string;
}

/** Largo y al azar: el mismo formato que exigen las reglas de Firestore. */
export const FEED_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
};

function restNumber(value: RestValue | undefined): number {
  return Number(value?.integerValue ?? value?.doubleValue ?? NaN);
}

/**
 * Lee el documento tal como lo devuelve la API REST de Firestore, con cada
 * valor envuelto en su tipo. Lo que no se puede leer se descarta: un evento
 * roto no tira abajo el calendario entero.
 */
export function parseFeedDocument(document: unknown): Feed | null {
  const fields = (document as { fields?: Record<string, RestValue> } | null)?.fields;
  if (!fields) return null;

  const events: FeedEvent[] = [];
  for (const raw of fields.events?.arrayValue?.values ?? []) {
    const event = raw.mapValue?.fields ?? {};
    const tmdbId = restNumber(event.tmdbId);
    const season = restNumber(event.season);
    const episode = restNumber(event.episode);
    const series = event.series?.stringValue?.trim() ?? '';
    const date = event.date?.stringValue ?? '';
    const name = event.name?.stringValue?.trim();
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !series || !DAY.test(date)) continue;
    if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1) continue;
    events.push({ tmdbId, series, season, episode, date, ...(name ? { name } : {}) });
  }

  const updatedAt = fields.updatedAt?.stringValue;
  return { events, ...(updatedAt ? { updatedAt } : {}) };
}

/** Escapa un valor de texto: `\`, `;`, `,` y los saltos de línea (RFC 5545, 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Pliega una línea a 75 octetos (RFC 5545, 3.1): lo que sobra sigue en la
 * línea de abajo, que empieza con un espacio.
 *
 * Se cuentan octetos y no caracteres, y nunca se corta en el medio de uno:
 * "Qué" ocupa cuatro, y partir la "é" a la mitad deja un calendario que
 * algunos clientes muestran con signos raros.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      // Las que siguen ya llevan el espacio del principio.
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * El UID de un episodio: siempre el mismo para el mismo episodio. Es lo que
 * hace que un calendario que vuelve a pedir el feed actualice el evento —si
 * cambió de fecha, lo mueve— en vez de duplicarlo.
 */
export function eventUid(tmdbId: number, season: number, episode: number): string {
  return `${tmdbId}-s${season}e${episode}@que-miro`;
}

/** Lo que sale un día de una serie: un episodio, o varios si se estrenan juntos. */
export interface DayGroup {
  tmdbId: number;
  series: string;
  date: string;
  episodes: { season: number; episode: number; name?: string }[];
}

/**
 * Junta los episodios de una misma serie que salen el mismo día.
 *
 * Una temporada que se estrena entera es un evento, no diez apilados en el
 * mismo día de la agenda. Su UID es el del primer episodio del día, así que
 * sigue siendo estable.
 */
export function groupByDay(events: FeedEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const event of events) {
    const key = `${event.tmdbId}:${event.date}`;
    const group = groups.get(key) ?? {
      tmdbId: event.tmdbId,
      series: event.series,
      date: event.date,
      episodes: [],
    };
    if (!group.episodes.some((known) => known.season === event.season && known.episode === event.episode)) {
      group.episodes.push({
        season: event.season,
        episode: event.episode,
        ...(event.name ? { name: event.name } : {}),
      });
    }
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      episodes: group.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series, 'es'));
}

function code(season: number, episode: number): string {
  return `T${season}E${episode}`;
}

/** "Episodio 3", que es lo que pone TMDB cuando no hay nombre, no dice nada. */
function meaningfulName(name: string | undefined): string | undefined {
  return name && !/^(episodio|episode|capítulo)\s*\d+$/i.test(name) ? name : undefined;
}

/** El título del evento: "Severance · T2E3 · Quién está vivo". */
export function eventSummary(group: DayGroup): string {
  const [first] = group.episodes;
  const last = group.episodes[group.episodes.length - 1];

  if (group.episodes.length > 1) {
    const range =
      first.season === last.season
        ? `${code(first.season, first.episode)}–E${last.episode}`
        : `${code(first.season, first.episode)}–${code(last.season, last.episode)}`;
    return `${group.series} · ${range} (${group.episodes.length} episodios)`;
  }
  if (first.episode === 1) {
    return first.season <= 1
      ? `${group.series} · Estreno de la serie`
      : `${group.series} · Estreno de la temporada ${first.season}`;
  }
  const name = meaningfulName(first.name);
  return name
    ? `${group.series} · ${code(first.season, first.episode)} · ${name}`
    : `${group.series} · ${code(first.season, first.episode)}`;
}

/** `2026-10-03` → `20261003`. */
function icsDate(day: string): string {
  return day.replace(/-/g, '');
}

/** El día siguiente: el fin de un evento de día completo no se incluye. */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** `2026-09-29T12:00:00.000Z` → `20260929T120000Z`. */
function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsOptions {
  /** Cuándo se publicó la instantánea: el `DTSTAMP` de cada evento. */
  stamp: Date;
  /** El origen de la app, para enlazar la ficha de cada serie. */
  appOrigin?: string;
}

/**
 * El `.ics` entero, con saltos CRLF como pide la norma.
 *
 * Los eventos son de día completo (`DTSTART;VALUE=DATE`): TMDB da el día y no
 * la hora, y ponerles una hora sería inventarla. Van como "libre" en la
 * agenda, porque un estreno no ocupa el día.
 */
export function buildIcs(events: FeedEvent[], { stamp, appOrigin }: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Que Miro//Proximos episodios//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText('Qué Miro? · Próximos episodios')}`,
    `X-WR-CALDESC:${escapeText('Lo que sale de las series que seguís en Qué Miro?.')}`,
    // Cada cuánto conviene volver a pedirlo. Google lo ignora y va a su
    // ritmo; Apple y Outlook lo respetan.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];

  for (const group of groupByDay(events)) {
    const [first] = group.episodes;
    const details = group.episodes.map((episode) => {
      const name = meaningfulName(episode.name);
      return name ? `${code(episode.season, episode.episode)} · ${name}` : code(episode.season, episode.episode);
    });
    const url = appOrigin ? `${appOrigin}/?ficha=tv:${group.tmdbId}` : undefined;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(group.tmdbId, first.season, first.episode)}`,
      `DTSTAMP:${icsStamp(stamp)}`,
      `DTSTART;VALUE=DATE:${icsDate(group.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(group.date))}`,
      `SUMMARY:${escapeText(eventSummary(group))}`,
      `DESCRIPTION:${escapeText(details.join('\n') + (url ? `\n\n${url}` : ''))}`,
      ...(url ? [`URL:${url}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
