import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { buildCalendar } from '@/lib/calendar';
import {
  FEED_TOKEN_PATTERN,
  FeedEvent,
  MAX_FEED_EVENTS,
  feedUrl,
  googleCalendarUrl,
  mergeFeedEvents,
  newFeedToken,
  parseFeedEvents,
  upcomingEvents,
  webcalUrl,
} from './calendarFeed';

const TODAY = '2026-09-29';

function event(overrides: Partial<FeedEvent> = {}): FeedEvent {
  return { tmdbId: 95396, series: 'Severance', season: 2, episode: 3, date: '2026-10-03', ...overrides };
}

function media(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-09-01T00:00:00.000Z',
    seriesStatus: 'Returning Series',
    nextToAir: { seasonNumber: 2, episodeNumber: 3, airDate: '2026-10-03', name: 'Quién está vivo' },
    ...overrides,
  };
}

describe('newFeedToken', () => {
  it('es largo, al azar y seguro para una URL', () => {
    const token = newFeedToken();
    expect(token).toHaveLength(32);
    expect(FEED_TOKEN_PATTERN.test(token)).toBe(true);
    expect(newFeedToken()).not.toBe(token);
  });

  it('usa base64url: nada de `+`, `/` ni `=`', () => {
    const token = newFeedToken((bytes) => bytes.fill(0xfb));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('upcomingEvents', () => {
  it('un evento por episodio, y las películas no', () => {
    const calendar = buildCalendar(
      [
        media(),
        media({
          tmdbId: 693134,
          mediaType: 'movie',
          title: 'Duna: Parte Tres',
          status: 'por_ver',
          releaseDate: '2026-12-18',
          nextToAir: undefined,
        }),
      ],
      TODAY,
    );

    expect(upcomingEvents(calendar)).toEqual([
      { tmdbId: 95396, series: 'Severance', season: 2, episode: 3, name: 'Quién está vivo', date: '2026-10-03' },
    ]);
  });
});

describe('mergeFeedEvents', () => {
  it('conserva lo que salió en el último mes, y no lo de antes', () => {
    const merged = mergeFeedEvents(
      [event({ episode: 2, date: '2026-09-26' }), event({ episode: 1, date: '2026-08-01' })],
      [event()],
      TODAY,
    );
    expect(merged.map((item) => item.episode)).toEqual([2, 3]);
  });

  it('lo próximo lo decide el calendario de hoy: si cambió de fecha, gana la nueva', () => {
    const merged = mergeFeedEvents([event({ date: '2026-09-28' })], [event({ date: '2026-10-10' })], TODAY);
    expect(merged).toEqual([event({ date: '2026-10-10' })]);
  });

  it('lo que se dejó de seguir no queda publicado para adelante', () => {
    expect(mergeFeedEvents([event({ tmdbId: 1, series: 'Andor' })], [event()], TODAY)).toEqual([event()]);
  });

  it('con tope: se cae primero lo más viejo', () => {
    const upcoming = Array.from({ length: MAX_FEED_EVENTS - 1 }, (_, index) =>
      event({ episode: index + 1, date: '2026-10-03' }),
    );
    const merged = mergeFeedEvents(
      [event({ tmdbId: 1, date: '2026-09-20' }), event({ tmdbId: 2, date: '2026-09-25' })],
      upcoming,
      TODAY,
    );
    expect(merged).toHaveLength(MAX_FEED_EVENTS);
    expect(merged[0].tmdbId).toBe(2);
  });
});

describe('parseFeedEvents', () => {
  it('se queda con lo que se puede leer', () => {
    expect(parseFeedEvents([event(), { tmdbId: '1' }, null, event({ date: 'mañana' })])).toEqual([event()]);
    expect(parseFeedEvents('roto')).toEqual([]);
  });
});

describe('las direcciones', () => {
  const url = feedUrl('https://quemiro.app', 'a'.repeat(32));

  it('arma la del .ics y sus variantes para cada calendario', () => {
    expect(url).toBe(`https://quemiro.app/cal/${'a'.repeat(32)}.ics`);
    expect(webcalUrl(url)).toBe(`webcal://quemiro.app/cal/${'a'.repeat(32)}.ics`);
    expect(googleCalendarUrl(url)).toBe(
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(url))}`,
    );
  });
});
