import { describe, expect, it } from 'vitest';
import {
  MAX_GENRES,
  MAX_PEOPLE,
  MAX_STUDIOS,
  answeredCount,
  decadeLabel,
  decadeOptions,
  emptyPicks,
  hasPicks,
  parsePicks,
  pickedTitleIds,
} from './picks';

describe('parsePicks', () => {
  it('de cualquier cosa devuelve un cuestionario en blanco', () => {
    for (const value of [null, undefined, 'texto', 42, []]) {
      expect(parsePicks(value)).toEqual(emptyPicks());
    }
  });

  it('acepta un cuestionario completo tal como se guarda', () => {
    const picks = parsePicks({
      movie: {
        tmdbId: 550,
        mediaType: 'movie',
        title: 'El club de la pelea',
        posterPath: '/p.jpg',
        releaseYear: '1999',
      },
      series: {
        tmdbId: 1398,
        mediaType: 'tv',
        title: 'Los Soprano',
        posterPath: null,
        releaseYear: '1999',
      },
      genres: ['Terror', 'Comedia'],
      actors: [{ id: 1, name: 'Ricardo Darín', profilePath: null }],
      directors: [{ id: 2, name: 'Lucrecia Martel', profilePath: '/m.jpg' }],
      studios: [{ id: 41077, name: 'A24', logoPath: null }],
      decade: 1990,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(picks.movie?.title).toBe('El club de la pelea');
    expect(picks.series?.tmdbId).toBe(1398);
    expect(picks.genres).toEqual(['Terror', 'Comedia']);
    expect(picks.directors[0].profilePath).toBe('/m.jpg');
    expect(picks.decade).toBe(1990);
    expect(picks.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('el tipo del título lo fija la pregunta, no el documento', () => {
    // Un documento que dice que la película favorita es una serie está
    // equivocado: la respuesta se pidió en la pregunta de películas.
    const picks = parsePicks({
      movie: { tmdbId: 1, mediaType: 'tv', title: 'Confundida' },
    });

    expect(picks.movie?.mediaType).toBe('movie');
  });

  it('descarta un título sin id o sin nombre', () => {
    expect(parsePicks({ movie: { tmdbId: 0, title: 'Sin id' } }).movie).toBeUndefined();
    expect(parsePicks({ movie: { tmdbId: 5, title: '  ' } }).movie).toBeUndefined();
  });

  it('respeta los topes de cada pregunta', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: `Persona ${index}`,
      }));

    const picks = parsePicks({
      genres: ['Terror', 'Comedia', 'Drama', 'Western', 'Bélica'],
      actors: many(9),
      directors: many(9),
      studios: many(9).map(({ id, name }) => ({ id, name })),
    });

    expect(picks.genres).toHaveLength(MAX_GENRES);
    expect(picks.actors).toHaveLength(MAX_PEOPLE);
    expect(picks.directors).toHaveLength(MAX_PEOPLE);
    expect(picks.studios).toHaveLength(MAX_STUDIOS);
  });

  it('no repite a la misma persona ni al mismo género', () => {
    const picks = parsePicks({
      genres: ['Terror', 'Terror'],
      actors: [
        { id: 7, name: 'Repetida' },
        { id: 7, name: 'Repetida' },
      ],
    });

    expect(picks.genres).toEqual(['Terror']);
    expect(picks.actors).toHaveLength(1);
  });

  it('ignora una década que no se ofrece', () => {
    expect(parsePicks({ decade: 1910 }).decade).toBeUndefined();
    expect(parsePicks({ decade: 1995 }).decade).toBeUndefined();
    expect(parsePicks({ decade: 1990 }).decade).toBe(1990);
  });

  it('sin fecha válida deja la más vieja posible, para no ganarle a nadie', () => {
    // La fecha decide quién gana entre dos dispositivos: un documento sin fecha
    // nunca debería pisar a uno que sí la tiene.
    expect(parsePicks({ genres: ['Terror'] }).updatedAt).toBe(
      new Date(0).toISOString(),
    );
  });
});

describe('leer el cuestionario', () => {
  it('cuenta una respuesta por pregunta contestada', () => {
    expect(answeredCount(emptyPicks())).toBe(0);
    expect(hasPicks(emptyPicks())).toBe(false);

    const picks = parsePicks({
      genres: ['Terror', 'Comedia'],
      decade: 1990,
      actors: [{ id: 1, name: 'Alguien' }],
    });

    // Tres preguntas contestadas, aunque una de ellas tenga dos respuestas.
    expect(answeredCount(picks)).toBe(3);
    expect(hasPicks(picks)).toBe(true);
  });

  it('devuelve los ids de los títulos elegidos, para no recomendarlos', () => {
    const picks = parsePicks({
      movie: { tmdbId: 550, title: 'Una' },
      series: { tmdbId: 1398, title: 'Otra' },
    });

    expect(pickedTitleIds(picks)).toEqual([550, 1398]);
    expect(pickedTitleIds(emptyPicks())).toEqual([]);
  });
});

describe('las décadas', () => {
  it('llegan hasta la actual y no más', () => {
    const decades = decadeOptions(new Date('2026-09-15T00:00:00.000Z'));

    expect(decades[0]).toBe(1960);
    expect(decades[decades.length - 1]).toBe(2020);
  });

  it('se leen como se dicen', () => {
    expect(decadeLabel(1990)).toBe('Los 90');
    expect(decadeLabel(2000)).toBe('Los 2000');
  });
});
