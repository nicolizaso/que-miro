import { describe, expect, it } from 'vitest';
import { Candidate, classifyMatch, normalizeTitle } from './match';
import { ImportRecord } from './types';

function record(overrides: Partial<ImportRecord> = {}): ImportRecord {
  return { source: 'letterboxd', title: 'Past Lives', year: 2023, mediaType: 'movie', ids: {}, status: 'completada', watches: [], ...overrides };
}

function candidate(id: number, title: string, year?: number, overrides: Partial<Candidate> = {}): Candidate {
  return { id, mediaType: 'movie', title, ...(year ? { year } : {}), posterPath: null, ...overrides };
}

describe('normalizeTitle', () => {
  it('sin acentos, mayúsculas ni puntuación, y "&" como "and"', () => {
    expect(normalizeTitle('Amélie')).toBe(normalizeTitle('amelie'));
    expect(normalizeTitle('Love, Death & Robots')).toBe(normalizeTitle('Love Death and Robots'));
    expect(normalizeTitle('Se7en')).not.toBe(normalizeTitle('Seven'));
  });
});

describe('qué cuenta como dudoso', () => {
  it('mismo título y año: exacto, aunque haya otros de ese año', () => {
    const result = classifyMatch(record(), [
      candidate(1, 'Past Lives', 2023),
      candidate(2, 'Past Lives: Making Of', 2023),
    ]);
    expect(result).toEqual({ kind: 'exact', candidate: candidate(1, 'Past Lives', 2023) });
  });

  it('con el título original también vale: TMDB contesta en castellano', () => {
    const result = classifyMatch(record({ title: 'Parasite', year: 2019 }), [
      candidate(496243, 'Parásitos', 2019, { originalTitle: 'Parasite' }),
      candidate(9, 'Parasite', 1982),
    ]);
    expect(result).toMatchObject({ kind: 'exact', candidate: { id: 496243 } });
  });

  it('el único de ese año es exacto aunque el título no coincida', () => {
    expect(classifyMatch(record({ title: 'The Godfather', year: 1972 }), [candidate(238, 'El padrino', 1972)])).toMatchObject({
      kind: 'exact',
    });
  });

  it('dos con el mismo título y año: dudoso', () => {
    const result = classifyMatch(record({ title: 'Heat', year: 1995 }), [candidate(949, 'Heat', 1995), candidate(5, 'Heat', 1995)]);
    expect(result).toMatchObject({ kind: 'doubtful', options: [{ id: 949 }, { id: 5 }] });
  });

  it('varios de ese año sin el título: dudoso', () => {
    const result = classifyMatch(record({ title: 'Otra cosa' }), [candidate(1, 'Past', 2023), candidate(2, 'Lives', 2023)]);
    expect(result.kind).toBe('doubtful');
  });

  it('ninguno de ese año: dudoso, puede ser el año de otro estreno', () => {
    expect(classifyMatch(record(), [candidate(1, 'Past Lives', 2024)])).toMatchObject({ kind: 'doubtful' });
  });

  it('sin resultados, no apareció', () => {
    expect(classifyMatch(record(), [])).toEqual({ kind: 'missing' });
  });

  it('con el id de IMDb, uno solo es ese; si no coincide el tipo pero hay uno, también', () => {
    const imdb = record({ source: 'imdb', ids: { imdb: 'tt1' }, mediaType: 'movie' });
    expect(classifyMatch(imdb, [candidate(1, 'X')])).toMatchObject({ kind: 'exact' });
    expect(classifyMatch(imdb, [candidate(1, 'X', undefined, { mediaType: 'tv' })])).toMatchObject({ kind: 'exact' });
    expect(classifyMatch(imdb, [candidate(1, 'X'), candidate(2, 'Y')])).toMatchObject({ kind: 'doubtful' });
  });

  it('de otro tipo que el pedido no sirve', () => {
    expect(classifyMatch(record(), [candidate(1, 'Past Lives', 2023, { mediaType: 'tv' })])).toEqual({ kind: 'missing' });
  });
});
