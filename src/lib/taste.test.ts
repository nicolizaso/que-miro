import { describe, expect, it } from 'vitest';
import { tasteProfile } from './taste';
import { Person, SavedMedia } from '@/types';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/poster.jpg',
    backdropPath: null,
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'completada',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function watch(rating: number, completedAt = '2026-01-01T00:00:00.000Z') {
  return { id: `w-${rating}-${completedAt}`, rating, completedAt };
}

function person(id: number, name: string, role: Person['role']): Person {
  return { id, name, role, profilePath: null };
}

describe('tasteProfile', () => {
  it('se queda con el mejor puntaje de cada título', () => {
    const taste = tasteProfile(
      [makeMedia({ history: [watch(2), watch(5)] })],
      NOW,
    );

    expect(taste.favorites).toHaveLength(1);
    expect(taste.favorites[0].rating).toBe(5);
  });

  it('no arma nada con lo que puntuaste bajo', () => {
    const taste = tasteProfile([makeMedia({ history: [watch(2)] })], NOW);

    expect(taste.favorites).toHaveLength(0);
    expect(taste.liked).toHaveLength(0);
    expect(taste.directors).toHaveLength(0);
  });

  it('toma al director solo si le pusiste más de 4', () => {
    const villeneuve = person(100, 'Denis Villeneuve', 'direccion');

    const flojo = tasteProfile(
      [makeMedia({ history: [watch(4)], people: [villeneuve] })],
      NOW,
    );
    expect(flojo.directors).toHaveLength(0);

    const bueno = tasteProfile(
      [makeMedia({ history: [watch(5)], people: [villeneuve] })],
      NOW,
    );
    expect(bueno.directors[0].person.name).toBe('Denis Villeneuve');
    expect(bueno.directors[0].bestRating).toBe(5);
  });

  it('junta a la misma persona a través de varios títulos', () => {
    const actriz = person(7, 'Tilda Swinton', 'reparto');
    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, title: 'Una', history: [watch(4)], people: [actriz] }),
        makeMedia({ tmdbId: 2, title: 'Otra', history: [watch(5)], people: [actriz] }),
      ],
      NOW,
    );

    expect(taste.actors).toHaveLength(1);
    expect(taste.actors[0].titles).toHaveLength(2);
    expect(taste.actors[0].bestRating).toBe(5);
  });

  it('pone primero a quien aparece en más títulos tuyos', () => {
    const repetida = person(1, 'Repetida', 'reparto');
    const unica = person(2, 'Única', 'reparto');

    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, history: [watch(4)], people: [repetida] }),
        makeMedia({ tmdbId: 2, history: [watch(4)], people: [repetida] }),
        makeMedia({ tmdbId: 3, history: [watch(5)], people: [unica] }),
      ],
      NOW,
    );

    expect(taste.actors[0].person.name).toBe('Repetida');
  });

  it('ordena los géneros por cuánto te gustaron y no por cuántos viste', () => {
    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, genres: ['Comedia'], history: [watch(3.5)] }),
        makeMedia({ tmdbId: 2, genres: ['Comedia'], history: [watch(3.5)] }),
        makeMedia({ tmdbId: 3, genres: ['Terror'], history: [watch(5)] }),
        makeMedia({ tmdbId: 4, genres: ['Terror'], history: [watch(5)] }),
      ],
      NOW,
    );

    expect(taste.genres[0].name).toBe('Terror');
    expect(taste.genres[0].count).toBe(2);
  });

  it('marca como punto ciego el género que probaste una vez y te gustó', () => {
    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, genres: ['Drama'], history: [watch(4)] }),
        makeMedia({ tmdbId: 2, genres: ['Drama'], history: [watch(4)] }),
        makeMedia({ tmdbId: 3, genres: ['Documental'], history: [watch(5)] }),
      ],
      NOW,
    );

    expect(taste.blindSpots.map((genre) => genre.name)).toEqual(['Documental']);
  });

  it('agrupa las partes de una saga que tenés', () => {
    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, sagaId: 230, sagaName: 'El Padrino', history: [watch(5)] }),
        makeMedia({ tmdbId: 2, sagaId: 230, sagaName: 'El Padrino', history: [watch(4.5)] }),
      ],
      NOW,
    );

    expect(taste.sagas).toHaveLength(1);
    expect(taste.sagas[0].titles).toHaveLength(2);
  });

  it('descarta el inglés de los idiomas: no es una señal de nada', () => {
    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, originalLanguage: 'en', history: [watch(5)] }),
        makeMedia({ tmdbId: 2, originalLanguage: 'ko', history: [watch(5)] }),
      ],
      NOW,
    );

    expect(taste.languages.map((lang) => lang.code)).toEqual(['ko']);
  });

  it('solo cuenta un tema si se repite entre tus favoritas', () => {
    const tiempo = { id: 4379, name: 'viajes en el tiempo' };
    const otro = { id: 9, name: 'vampiros' };

    const taste = tasteProfile(
      [
        makeMedia({ tmdbId: 1, keywords: [tiempo, otro], history: [watch(5)] }),
        makeMedia({ tmdbId: 2, keywords: [tiempo], history: [watch(4)] }),
      ],
      NOW,
    );

    expect(taste.keywords.map(({ keyword }) => keyword.name)).toEqual([
      'viajes en el tiempo',
    ]);
  });

  it('encuentra las series que quedaron por la mitad', () => {
    const taste = tasteProfile(
      [
        makeMedia({
          tmdbId: 1,
          mediaType: 'tv',
          history: undefined,
          status: 'viendo',
          seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
          progress: { watched: { 1: [1, 2, 3] } },
        }),
      ],
      NOW,
    );

    expect(taste.unfinished).toHaveLength(1);
  });

  it('no propone volver a ver algo que viste el mes pasado', () => {
    const reciente = tasteProfile(
      [makeMedia({ history: [watch(5, '2026-05-01T00:00:00.000Z')] })],
      NOW,
    );
    expect(reciente.rewatchables).toHaveLength(0);

    const viejo = tasteProfile(
      [makeMedia({ history: [watch(5, '2023-01-01T00:00:00.000Z')] })],
      NOW,
    );
    expect(viejo.rewatchables).toHaveLength(1);
  });

  it('separa los pendientes viejos de los de ayer', () => {
    const taste = tasteProfile(
      [
        makeMedia({
          tmdbId: 1,
          status: 'por_ver',
          history: undefined,
          updatedAt: '2026-05-30T00:00:00.000Z',
        }),
        makeMedia({
          tmdbId: 2,
          status: 'por_ver',
          history: undefined,
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
      ],
      NOW,
    );

    expect(taste.pending).toHaveLength(2);
    expect(taste.stalePending.map((media) => media.tmdbId)).toEqual([2]);
  });

  it('con la biblioteca vacía no hay señal ninguna', () => {
    const taste = tasteProfile([], NOW);

    expect(taste.hasSignal).toBe(false);
    expect(taste.savedIds.size).toBe(0);
  });
});
