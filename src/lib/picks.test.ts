import { describe, expect, it } from 'vitest';
import {
  MAX_FAVORITE_TITLES,
  MAX_GENRES,
  MAX_PEOPLE,
  MAX_STUDIOS,
  addFavoriteTitle,
  answeredCount,
  decadeLabel,
  decadeOptions,
  emptyPicks,
  favoriteTitles,
  hasPicks,
  parsePicks,
  pickedTitleIds,
  removeFavoriteTitle,
} from './picks';
import { PickedTitle, TastePicks } from '@/types';

function title(tmdbId: number, mediaType: 'movie' | 'tv' = 'movie'): PickedTitle {
  return { tmdbId, mediaType, title: `Título ${tmdbId}`, posterPath: null, releaseYear: '2000' };
}

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

  it('lee las favoritas que siguen a la primera, con su tope', () => {
    const picks = parsePicks({
      movie: title(1),
      moreMovies: [title(2), title(3), title(4), title(5), title(6)],
      series: title(10, 'tv'),
      moreSeries: [title(11, 'movie')],
    });

    expect(favoriteTitles(picks, 'movie').map(({ tmdbId }) => tmdbId)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(favoriteTitles(picks, 'movie')).toHaveLength(MAX_FAVORITE_TITLES);
    // El tipo lo fija la pregunta, también en las que siguen.
    expect(picks.moreSeries?.[0].mediaType).toBe('tv');
  });

  it('no repite la principal entre las que siguen', () => {
    const picks = parsePicks({ movie: title(1), moreMovies: [title(1), title(2)] });

    expect(picks.moreMovies?.map(({ tmdbId }) => tmdbId)).toEqual([2]);
  });

  it('si faltan la principal, sube la primera de las que siguen', () => {
    const picks = parsePicks({ movie: null, moreMovies: [title(2), title(3)] });

    expect(picks.movie?.tmdbId).toBe(2);
    expect(picks.moreMovies?.map(({ tmdbId }) => tmdbId)).toEqual([3]);
  });

  it('un documento de antes de las favoritas extra se lee igual', () => {
    const picks = parsePicks({ movie: title(1), genres: [] });

    expect(picks.movie?.tmdbId).toBe(1);
    expect(picks.moreMovies).toBeUndefined();
    expect(favoriteTitles(picks, 'movie')).toHaveLength(1);
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

  it('cuenta también las favoritas que siguen a la primera', () => {
    const picks = parsePicks({
      movie: title(1),
      moreMovies: [title(2)],
      series: title(10, 'tv'),
      moreSeries: [title(11, 'tv')],
    });

    expect(pickedTitleIds(picks)).toEqual([1, 2, 10, 11]);
  });
});

describe('sumar y sacar favoritas', () => {
  const withMovies = (...ids: number[]): TastePicks => {
    const [first, ...rest] = ids.map((id) => title(id));
    return { ...emptyPicks(), movie: first, moreMovies: rest.length ? rest : undefined };
  };

  it('la primera va a su campo de siempre y las demás detrás', () => {
    expect(addFavoriteTitle(emptyPicks(), title(1))).toEqual({
      movie: title(1),
      moreMovies: undefined,
    });
    expect(addFavoriteTitle(withMovies(1), title(2))).toEqual({
      movie: title(1),
      moreMovies: [title(2)],
    });
  });

  it('no suma una repetida ni una sexta', () => {
    expect(addFavoriteTitle(withMovies(1, 2), title(2))).toBeNull();
    expect(addFavoriteTitle(withMovies(1, 2, 3, 4, 5), title(6))).toBeNull();
  });

  it('las series no ocupan lugar de las películas', () => {
    expect(addFavoriteTitle(withMovies(1, 2, 3, 4, 5), title(6, 'tv'))).toEqual({
      series: title(6, 'tv'),
      moreSeries: undefined,
    });
  });

  it('al sacar la primera, la siguiente ocupa su lugar', () => {
    expect(removeFavoriteTitle(withMovies(1, 2, 3), 'movie', 1)).toEqual({
      movie: title(2),
      moreMovies: [title(3)],
    });
    expect(removeFavoriteTitle(withMovies(1), 'movie', 1)).toEqual({
      movie: undefined,
      moreMovies: undefined,
    });
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
