import { describe, expect, it } from 'vitest';
import {
  FEED_TOKEN,
  FeedEvent,
  buildIcs,
  escapeText,
  eventSummary,
  eventUid,
  foldLine,
  groupByDay,
  parseFeedDocument,
} from './ics';

const STAMP = new Date('2026-09-29T12:00:00.000Z');

function event(overrides: Partial<FeedEvent> = {}): FeedEvent {
  return {
    tmdbId: 95396,
    series: 'Severance',
    season: 2,
    episode: 3,
    name: 'Quién está vivo',
    date: '2026-10-03',
    ...overrides,
  };
}

/** Las líneas lógicas: se despliegan las plegadas. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('escapeText', () => {
  it('escapa barras, punto y coma, comas y saltos de línea', () => {
    expect(escapeText('Love, Death & Robots')).toBe('Love\\, Death & Robots');
    expect(escapeText('uno; dos')).toBe('uno\\; dos');
    expect(escapeText('C:\\ruta')).toBe('C:\\\\ruta');
    expect(escapeText('una\nlínea\r\nmás')).toBe('una\\nlínea\\nmás');
  });

  it('la barra se escapa primero: no duplica las de los otros escapes', () => {
    expect(escapeText('a\\,b')).toBe('a\\\\\\,b');
  });
});

describe('foldLine', () => {
  const octets = (line: string) => new TextEncoder().encode(line).length;

  it('deja igual una línea que entra', () => {
    expect(foldLine('SUMMARY:Severance · T2E3')).toBe('SUMMARY:Severance · T2E3');
  });

  it('pliega a 75 octetos, con un espacio al principio de cada continuación', () => {
    const line = `DESCRIPTION:${'a'.repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((part) => part.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('cuenta octetos y no parte un carácter por la mitad', () => {
    const line = `SUMMARY:${'é'.repeat(60)}🍿${'ñ'.repeat(30)}`;
    const folded = foldLine(line);

    for (const part of folded.split('\r\n')) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      // Si se hubiera cortado un carácter, el pedazo no sería UTF-8 válido.
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(part))).not.toThrow();
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('el UID', () => {
  it('es el mismo para el mismo episodio, cambie lo que cambie', () => {
    const before = buildIcs([event()], { stamp: STAMP });
    const moved = buildIcs([event({ date: '2026-10-10', name: 'Otro nombre' })], {
      stamp: new Date('2026-10-01T00:00:00.000Z'),
    });
    const uid = (ics: string) => unfold(ics).find((line) => line.startsWith('UID:'));

    expect(uid(before)).toBe(`UID:${eventUid(95396, 2, 3)}`);
    expect(uid(moved)).toBe(uid(before));
  });

  it('distingue episodios y series', () => {
    expect(eventUid(95396, 2, 3)).not.toBe(eventUid(95396, 2, 4));
    expect(eventUid(95396, 2, 3)).not.toBe(eventUid(95396, 3, 2));
    expect(eventUid(95396, 2, 3)).not.toBe(eventUid(136315, 2, 3));
  });
});

describe('buildIcs', () => {
  it('arma eventos de día completo, con saltos CRLF', () => {
    const ics = buildIcs([event()], { stamp: STAMP, appOrigin: 'https://quemiro.app' });
    const lines = unfold(ics);

    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261003');
    expect(lines).toContain('DTEND;VALUE=DATE:20261004');
    expect(lines).toContain('DTSTAMP:20260929T120000Z');
    expect(lines).toContain('SUMMARY:Severance · T2E3 · Quién está vivo');
    expect(lines).toContain('URL:https://quemiro.app/?ficha=tv:95396');
    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('el fin de un evento del último día del año cae en el año siguiente', () => {
    const lines = unfold(buildIcs([event({ date: '2026-12-31' })], { stamp: STAMP }));
    expect(lines).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('escapa lo que viene de TMDB', () => {
    const lines = unfold(
      buildIcs([event({ series: 'Love, Death & Robots', name: 'Tres robots; la salida' })], { stamp: STAMP }),
    );
    expect(lines).toContain('SUMMARY:Love\\, Death & Robots · T2E3 · Tres robots\\; la salida');
  });

  it('sin episodios es un calendario vacío, pero válido', () => {
    const lines = unfold(buildIcs([], { stamp: STAMP }));
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('END:VCALENDAR');
    expect(lines).not.toContain('BEGIN:VEVENT');
  });
});

describe('los eventos', () => {
  it('una temporada que sale entera es un solo evento', () => {
    const drop = Array.from({ length: 8 }, (_, index) =>
      event({ tmdbId: 136315, series: 'The Bear', season: 4, episode: index + 1, name: undefined, date: '2026-10-01' }),
    );
    const groups = groupByDay([...drop].reverse());

    expect(groups).toHaveLength(1);
    expect(eventSummary(groups[0])).toBe('The Bear · T4E1–E8 (8 episodios)');
    const ics = unfold(buildIcs(drop, { stamp: STAMP }));
    expect(ics).toContain(`UID:${eventUid(136315, 4, 1)}`);
  });

  it('nombra los estrenos y no repite el nombre de relleno de TMDB', () => {
    expect(eventSummary(groupByDay([event({ season: 3, episode: 1 })])[0])).toBe(
      'Severance · Estreno de la temporada 3',
    );
    expect(eventSummary(groupByDay([event({ season: 1, episode: 1 })])[0])).toBe(
      'Severance · Estreno de la serie',
    );
    expect(eventSummary(groupByDay([event({ name: 'Episodio 3' })])[0])).toBe('Severance · T2E3');
  });

  it('ordenados por día', () => {
    const groups = groupByDay([
      event({ date: '2026-10-10', episode: 4 }),
      event({ tmdbId: 1, series: 'Andor', date: '2026-10-03' }),
      event(),
    ]);
    expect(groups.map((group) => `${group.date} ${group.series}`)).toEqual([
      '2026-10-03 Andor',
      '2026-10-03 Severance',
      '2026-10-10 Severance',
    ]);
  });
});

describe('parseFeedDocument', () => {
  const rest = (fields: Record<string, unknown>) => ({ mapValue: { fields } });

  it('lee el formato de la API REST de Firestore', () => {
    expect(
      parseFeedDocument({
        name: 'projects/x/databases/(default)/documents/calendar_feeds/abc',
        fields: {
          uid: { stringValue: 'ana' },
          updatedAt: { stringValue: '2026-09-29T12:00:00.000Z' },
          events: {
            arrayValue: {
              values: [
                rest({
                  tmdbId: { integerValue: '95396' },
                  series: { stringValue: 'Severance' },
                  season: { integerValue: '2' },
                  episode: { integerValue: '3' },
                  name: { stringValue: 'Quién está vivo' },
                  date: { stringValue: '2026-10-03' },
                }),
                rest({ tmdbId: { integerValue: '1' }, series: { stringValue: 'Rota' } }),
              ],
            },
          },
        },
      }),
    ).toEqual({ events: [event()], updatedAt: '2026-09-29T12:00:00.000Z' });
  });

  it('sin campos no hay calendario; sin eventos, uno vacío', () => {
    expect(parseFeedDocument({})).toBeNull();
    expect(parseFeedDocument(null)).toBeNull();
    expect(parseFeedDocument({ fields: { uid: { stringValue: 'ana' } } })).toEqual({ events: [] });
  });
});

describe('FEED_TOKEN', () => {
  it('acepta tokens largos y nada que sirva para salirse de la ruta', () => {
    expect(FEED_TOKEN.test('a'.repeat(32))).toBe(true);
    expect(FEED_TOKEN.test('Ab3_-'.repeat(8))).toBe(true);
    expect(FEED_TOKEN.test('corto')).toBe(false);
    expect(FEED_TOKEN.test(`${'a'.repeat(32)}/../x`)).toBe(false);
    expect(FEED_TOKEN.test(`${'a'.repeat(32)}.ics`)).toBe(false);
  });
});
