import { Calendar, addDays } from '@/lib/calendar';

/**
 * El calendario para suscribirse desde afuera: `/cal/{token}.ics`.
 *
 * Google Calendar y Apple Calendar piden la dirección cada tantas horas, sin
 * sesión, y el servidor no puede leer la biblioteca de nadie. Así que la app
 * publica una instantánea en `calendar_feeds/{token}` —solo los episodios:
 * serie, temporada, episodio, nombre y fecha— y el servidor arma el `.ics`
 * con eso (`api/cal/[token].ts`). Es el mismo patrón que el perfil público.
 */

/** Un episodio publicado. El servidor lee exactamente esto (`api/_lib/ics.ts`). */
export interface FeedEvent {
  tmdbId: number;
  series: string;
  season: number;
  episode: number;
  name?: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

/** El tope de eventos: el mismo que ponen las reglas de Firestore. */
export const MAX_FEED_EVENTS = 500;

/**
 * Cuántos días de lo que ya salió se siguen publicando. Un calendario
 * suscripto borra lo que el feed deja de nombrar: sin esto, el episodio de
 * ayer desaparecería de la agenda de un día para el otro.
 */
export const FEED_HISTORY_DAYS = 30;

/** Largo y al azar: el formato que exigen las reglas. */
export const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * Un token nuevo: 24 bytes al azar en base64url, 32 caracteres.
 *
 * No es el slug del perfil, que es público y se adivina: quien tiene esta
 * dirección ve los próximos episodios de la persona, y nada más que eso.
 */
export function newFeedToken(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  let binary = '';
  for (const byte of random(new Uint8Array(24))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function feedPath(token: string): string {
  return `calendar_feeds/${token}`;
}

/** Dónde guarda la cuenta cuál es su token: al lado de las metas y las plataformas. */
export function feedSettingsPath(uid: string): string {
  return `users/${uid}/profile/calendar`;
}

/** Un episodio, como clave. La misma idea que el UID del `.ics`. */
export function eventKey(event: Pick<FeedEvent, 'tmdbId' | 'season' | 'episode'>): string {
  return `${event.tmdbId}-s${event.season}e${event.episode}`;
}

/** Los episodios del calendario de la app, uno por uno. Las películas no van: es un calendario de episodios. */
export function upcomingEvents(calendar: Calendar): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const group of calendar.groups) {
    for (const item of group.items) {
      if (item.media.mediaType !== 'tv') continue;
      for (const episode of item.episodes) {
        events.push({
          tmdbId: item.media.tmdbId,
          series: item.media.title,
          season: episode.seasonNumber,
          episode: episode.episodeNumber,
          ...(episode.name ? { name: episode.name } : {}),
          date: item.date,
        });
      }
    }
  }
  return events;
}

function byDate(a: FeedEvent, b: FeedEvent): number {
  return (
    a.date.localeCompare(b.date) ||
    a.series.localeCompare(b.series, 'es') ||
    a.season - b.season ||
    a.episode - b.episode
  );
}

/**
 * Lo que se publica: lo próximo, más lo del último mes que ya salió.
 *
 * Para adelante manda el calendario de hoy: un episodio que cambió de fecha
 * se publica con la nueva, y el de una serie que dejaste de seguir se va. Lo
 * pasado sale de lo que ya estaba publicado. Si sobra, se cae primero lo más
 * viejo y después lo más lejano.
 */
export function mergeFeedEvents(
  previous: FeedEvent[],
  upcoming: FeedEvent[],
  today: string,
): FeedEvent[] {
  const since = addDays(today, -FEED_HISTORY_DAYS);
  const ahead = upcoming.filter((event) => event.date >= today).sort(byDate);
  const keys = new Set(ahead.map(eventKey));
  const history = previous
    .filter((event) => event.date < today && event.date >= since && !keys.has(eventKey(event)))
    .sort(byDate);

  const kept = ahead.slice(0, MAX_FEED_EVENTS);
  const room = MAX_FEED_EVENTS - kept.length;
  return [...(room > 0 ? history.slice(-room) : []), ...kept];
}

/** Lee los eventos de un documento publicado: lo roto se descarta. */
export function parseFeedEvents(value: unknown): FeedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): FeedEvent[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const event = raw as Record<string, unknown>;
    const { tmdbId, season, episode, series, date, name } = event;
    if (
      typeof tmdbId !== 'number' ||
      typeof season !== 'number' ||
      typeof episode !== 'number' ||
      typeof series !== 'string' ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return [];
    }
    return [{ tmdbId, series, season, episode, date, ...(typeof name === 'string' && name ? { name } : {}) }];
  });
}

/** Si dos listas publican lo mismo: para no reescribir el documento de gusto. */
export function sameEvents(a: FeedEvent[], b: FeedEvent[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** La dirección para suscribirse. */
export function feedUrl(origin: string, token: string): string {
  return `${origin}/cal/${token}.ics`;
}

/** La misma con `webcal://`: Apple Calendar y Outlook la abren directo como suscripción. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://');
}

/** "Agregar calendario desde URL" de Google Calendar, ya con la dirección puesta. */
export function googleCalendarUrl(url: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(url))}`;
}
