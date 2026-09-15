import { describe, expect, it, vi } from 'vitest';
import { RECIPES, buildBlocks } from './recipes';
import { tasteProfile } from './taste';
import { Person, SavedMedia } from '@/types';

vi.mock('@/lib/tmdb', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tmdb')>('@/lib/tmdb');
  return {
    ...actual,
    getDiscover: vi.fn(async () => []),
    getPersonCredits: vi.fn(async () => []),
    getRecommendations: vi.fn(async () => []),
    getSimilar: vi.fn(async () => []),
    getSaga: vi.fn(async () => []),
    getTrending: vi.fn(async () => []),
    getList: vi.fn(async () => []),
  };
});

const { getDiscover, getPersonCredits } = await import('@/lib/tmdb');

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

/** Las filas que se pueden armar con esta biblioteca. */
function blocksFor(list: SavedMedia[], region = 'AR') {
  return buildBlocks({ taste: tasteProfile(list, NOW), region });
}

describe('el catálogo de recetas', () => {
  it('tiene 25 recetas, cada una con su id', () => {
    expect(RECIPES).toHaveLength(25);
    expect(new Set(RECIPES.map((recipe) => recipe.id)).size).toBe(25);
  });

  it('con la biblioteca vacía deja solo las filas que no hablan de vos', () => {
    const blocks = blocksFor([]);

    // Sigue habiendo pestaña el primer día: tendencias, populares, estrenos y
    // las que se arman con un criterio y nada más.
    expect(blocks.length).toBeGreaterThan(0);
    expect(new Set(blocks.map((block) => block.family))).toEqual(
      new Set(['general', 'catalogo']),
    );
  });

  it('no arma dos filas con el mismo id', () => {
    const list = Array.from({ length: 12 }, (_, index) =>
      makeMedia({
        tmdbId: index + 1,
        title: `Título ${index}`,
        genres: ['Terror', 'Drama'],
        history: [watch(5)],
        people: [person(1, 'Repetida', 'reparto'), person(2, 'Alguien', 'direccion')],
        providers: ['Netflix'],
      }),
    );

    const ids = blocksFor(list).map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('las filas que hablan de gente', () => {
  it('propone otros trabajos del director que puntuaste arriba de 4', () => {
    const blocks = blocksFor([
      makeMedia({
        title: 'Duna',
        history: [watch(5)],
        people: [person(100, 'Denis Villeneuve', 'direccion')],
      }),
    ]);

    const row = blocks.find((block) => block.id === 'director-100');
    expect(row?.title).toBe('Otros trabajos de Denis Villeneuve');
    expect(row?.subtitle).toContain('Duna');
    expect(row?.avatar?.name).toBe('Denis Villeneuve');

    row?.fetch();
    expect(getPersonCredits).toHaveBeenCalledWith(100, 'direccion');
  });

  it('separa al actor de una sola película del que se repite', () => {
    const blocks = blocksFor([
      makeMedia({
        tmdbId: 1,
        history: [watch(4)],
        people: [person(7, 'Una Vez', 'reparto')],
      }),
      makeMedia({
        tmdbId: 2,
        history: [watch(5)],
        people: [person(8, 'Dos Veces', 'reparto')],
      }),
      makeMedia({
        tmdbId: 3,
        history: [watch(5)],
        people: [person(8, 'Dos Veces', 'reparto')],
      }),
    ]);

    expect(blocks.find((block) => block.id === 'actor-7')?.title).toBe(
      'Si te gustó Una Vez',
    );
    expect(blocks.find((block) => block.id === 'cara-conocida-8')?.title).toBe(
      'Tu cara me suena: Dos Veces',
    );
    // Quien se repite no aparece además como actor suelto.
    expect(blocks.find((block) => block.id === 'actor-8')).toBeUndefined();
  });

  it('no habla de nadie si la biblioteca no tiene reparto cargado', () => {
    const blocks = blocksFor([makeMedia({ history: [watch(5)] })]);

    expect(blocks.some((block) => block.family === 'gente')).toBe(false);
  });
});

describe('las filas por género', () => {
  it('propone el género del que ya viste un par', () => {
    const blocks = blocksFor([
      makeMedia({ tmdbId: 1, genres: ['Terror'], history: [watch(5)] }),
      makeMedia({ tmdbId: 2, genres: ['Terror'], history: [watch(4.5)] }),
    ]);

    const row = blocks.find((block) => block.id.startsWith('genero-afin'));
    expect(row?.title).toBe('Estas películas de terror te pueden gustar');

    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'movie', genres: [27], sort: 'rating' }),
    );
  });

  it('no arma una fila de un género que no existe en ese tipo de medio', () => {
    // "Terror" no existe como género de series en TMDB: la fila de series se
    // arma con otro género o no se arma.
    const blocks = blocksFor([
      makeMedia({ tmdbId: 1, mediaType: 'tv', genres: ['Terror'], history: [watch(5)] }),
      makeMedia({ tmdbId: 2, mediaType: 'tv', genres: ['Terror'], history: [watch(5)] }),
    ]);

    expect(blocks.some((block) => block.id === 'genero-afin-tv-27')).toBe(false);
  });
});

describe('las filas de tu propia biblioteca', () => {
  it('ofrece terminar la serie que dejaste a medias', () => {
    const blocks = blocksFor([
      makeMedia({
        mediaType: 'tv',
        status: 'viendo',
        history: undefined,
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
        progress: { watched: { 1: [1, 2] } },
      }),
    ]);

    const row = blocks.find((block) => block.id === 'terminar');
    expect(row?.local).toBe(true);
  });

  it('se dibuja aunque tenga un solo título', () => {
    // Una sola serie a medias sigue siendo la fila más pertinente del feed:
    // esconderla por corta sería esconder justo lo que hay que mostrar.
    const blocks = blocksFor([
      makeMedia({
        mediaType: 'tv',
        status: 'viendo',
        history: undefined,
        seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
        progress: { watched: { 1: [1, 2] } },
      }),
    ]);

    expect(blocks.find((block) => block.id === 'terminar')?.minResults).toBe(1);
  });

  it('resuelve sus títulos sin pedirle nada a TMDB', async () => {
    const blocks = blocksFor([
      makeMedia({
        tmdbId: 42,
        status: 'por_ver',
        history: undefined,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);

    const row = blocks.find((block) => block.id === 'pendiente-viejo');
    const results = await row!.fetch();

    expect(results.map((result) => result.id)).toEqual([42]);
    expect(results[0].title).toBe('Matrix');
  });
});

describe('la fila de una saga', () => {
  it('con una sola parte faltante se dibuja igual', () => {
    const blocks = blocksFor([
      makeMedia({
        tmdbId: 1,
        sagaId: 230,
        sagaName: 'El Padrino',
        history: [watch(5)],
      }),
    ]);

    expect(blocks.find((block) => block.id === 'saga-230')?.minResults).toBe(1);
  });
});

describe('la fila de plataformas', () => {
  it('usa el nombre guardado y la región elegida', () => {
    const blocks = blocksFor(
      [
        makeMedia({ tmdbId: 1, providers: ['Netflix'] }),
        makeMedia({ tmdbId: 2, providers: ['Netflix'] }),
      ],
      'UY',
    );

    const row = blocks.find((block) => block.id === 'plataforma-Netflix');
    expect(row?.title).toBe('Está en tu Netflix');

    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'Netflix', region: 'UY' }),
    );
  });
});
