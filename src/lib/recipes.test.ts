import { describe, expect, it, vi } from 'vitest';
import { RECIPES, buildBlocks } from './recipes';
import { tasteProfile } from './taste';
import { emptyPicks } from './picks';
import { Person, Restrictions, SavedMedia, TastePicks } from '@/types';

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

const { getDiscover, getPersonCredits, getRecommendations, getSimilar } =
  await import('@/lib/tmdb');

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
  return buildBlocks({ taste: tasteProfile(list, NOW), picks: emptyPicks(), region });
}

/** Las filas que se pueden armar con lo que la persona contestó, y nada más. */
function blocksForPicks(picks: Partial<TastePicks>, region = 'AR') {
  return buildBlocks({
    taste: tasteProfile([], NOW),
    picks: { ...emptyPicks(), ...picks },
    region,
  });
}

describe('el catálogo de recetas', () => {
  it('tiene 36 recetas, cada una con su id', () => {
    expect(RECIPES).toHaveLength(36);
    expect(new Set(RECIPES.map((recipe) => recipe.id)).size).toBe(36);
  });

  it('con la biblioteca vacía y sin contestar nada deja solo las filas de todos', () => {
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

describe('las filas que salen de "Contanos de vos"', () => {
  const favoriteMovie = {
    tmdbId: 550,
    mediaType: 'movie' as const,
    title: 'El club de la pelea',
    posterPath: '/poster.jpg',
    releaseYear: '1999',
  };

  it('recomienda a partir de la película favorita declarada', () => {
    const blocks = blocksForPicks({ movie: favoriteMovie });

    const row = blocks.find((block) => block.id === 'favorita-pelicula-550');
    expect(row?.title).toBe('Si tu película favorita es El club de la pelea');

    row?.fetch();
    expect(getRecommendations).toHaveBeenCalledWith(550, 'movie');
  });

  it('siembra una segunda fila con la otra puerta de TMDB', () => {
    const blocks = blocksForPicks({ movie: favoriteMovie });

    const row = blocks.find((block) => block.id === 'favorita-similar-movie-550');
    expect(row?.title).toBe('Lo más parecido a El club de la pelea');

    row?.fetch();
    expect(getSimilar).toHaveBeenCalledWith(550, 'movie');
  });

  it('pide recomendaciones de series para la serie favorita', () => {
    const blocks = blocksForPicks({
      series: {
        tmdbId: 1398,
        mediaType: 'tv',
        title: 'Los Soprano',
        posterPath: null,
        releaseYear: '1999',
      },
    });

    const row = blocks.find((block) => block.id === 'favorita-serie-1398');
    expect(row?.title).toBe('Si tu serie favorita es Los Soprano');

    row?.fetch();
    expect(getRecommendations).toHaveBeenCalledWith(1398, 'tv');
  });

  it('arma una fila por cada género elegido, y una de series con el que exista', () => {
    // "Terror" no existe como género de series en TMDB y "Comedia" sí: la fila
    // de series se arma con el segundo, no con el id equivocado del primero.
    const blocks = blocksForPicks({ genres: ['Terror', 'Comedia'] });

    expect(blocks.find((block) => block.id === 'genero-elegido-27')?.title).toBe(
      'Lo mejor de terror',
    );
    expect(blocks.find((block) => block.id === 'genero-elegido-35')?.title).toBe(
      'Lo mejor de comedia',
    );
    expect(
      blocks.find((block) => block.id === 'genero-elegido-series-35')?.title,
    ).toBe('Series de comedia');
    expect(blocks.some((block) => block.id === 'genero-elegido-series-27')).toBe(
      false,
    );
  });

  it('propone la filmografía de la gente elegida, cada quien por su oficio', () => {
    const blocks = blocksForPicks({
      directors: [{ id: 240, name: 'Agnès Varda', profilePath: '/varda.jpg' }],
      actors: [{ id: 500, name: 'Ricardo Darín', profilePath: null }],
    });

    const director = blocks.find((block) => block.id === 'director-elegido-240');
    expect(director?.title).toBe('Todo lo de Agnès Varda');
    expect(director?.avatar?.profilePath).toBe('/varda.jpg');
    director?.fetch();
    expect(getPersonCredits).toHaveBeenCalledWith(240, 'direccion');

    const actor = blocks.find((block) => block.id === 'actor-elegido-500');
    expect(actor?.title).toBe('Con Ricardo Darín en pantalla');
    actor?.fetch();
    expect(getPersonCredits).toHaveBeenCalledWith(500, 'reparto');
  });

  it('arma el catálogo de la productora elegida', () => {
    const blocks = blocksForPicks({
      studios: [{ id: 41077, name: 'A24', logoPath: null }],
    });

    const row = blocks.find((block) => block.id === 'productora-elegida-41077');
    expect(row?.title).toBe('Del catálogo de A24');

    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ company: 41077, mediaType: 'movie' }),
    );
  });

  it('cruza la década con el género cuando están las dos respuestas', () => {
    const blocks = blocksForPicks({ decade: 1990, genres: ['Terror'] });

    const row = blocks.find((block) => block.id === 'decada-elegida-1990-27');
    expect(row?.title).toBe('Terror de los 90');

    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1990, to: 1999, genres: [27] }),
    );
  });

  it('con la década sola arma la fila igual', () => {
    const blocks = blocksForPicks({ decade: 2000 });

    expect(blocks.find((block) => block.id === 'decada-elegida-2000')?.title).toBe(
      'Lo mejor de los 2000',
    );
  });

  it('pesan más que las que se deducen de la biblioteca', () => {
    // Quien contestó no está siendo interpretado: dijo cuál es su favorita.
    const declared = blocksForPicks({ movie: favoriteMovie }).find(
      (block) => block.id === 'favorita-pelicula-550',
    );
    const deduced = blocksFor([
      makeMedia({ tmdbId: 1, history: [watch(5)] }),
    ]).find((block) => block.id === 'porque-viste-1');

    expect(declared!.weight).toBeGreaterThan(deduced!.weight);
  });

  it('sin respuestas no arma ninguna de estas filas', () => {
    const ids = blocksForPicks({}).map((block) => block.id);

    expect(ids.some((id) => id.startsWith('favorita-'))).toBe(false);
    expect(ids.some((id) => id.endsWith('-elegido'))).toBe(false);
    expect(ids.some((id) => id.includes('elegida'))).toBe(false);
  });
});

describe('lo abandonado', () => {
  const series = {
    mediaType: 'tv' as const,
    history: undefined,
    seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 8 }],
    progress: { watched: { 1: [1, 2, 3] } },
  };

  it('sale de "Terminá lo que empezaste"', () => {
    const blocks = blocksFor([
      makeMedia({ tmdbId: 1, title: 'Dejada', status: 'abandonada', ...series }),
    ]);

    expect(blocks.some((block) => block.id === 'terminar')).toBe(false);
  });

  it('no es un pendiente del que salga "Porque tenés… en Por Ver"', () => {
    const blocks = blocksFor([makeMedia({ tmdbId: 1, status: 'abandonada' })]);
    expect(blocks.some((block) => block.id.startsWith('pendiente'))).toBe(false);
  });

  it('no siembra "Porque viste", aunque la hayas puntuado alto', () => {
    const blocks = blocksFor([
      makeMedia({ tmdbId: 1, status: 'abandonada', history: [watch(5)] }),
    ]);
    expect(blocks.some((block) => block.id.startsWith('porque-viste'))).toBe(false);
  });

  it('le baja el peso a la fila de algo muy parecido', () => {
    const favorite = makeMedia({ tmdbId: 1, title: 'Alien', sagaId: 8091, history: [watch(5)] });
    const alone = blocksFor([favorite]).find((b) => b.id === 'porque-viste-1')!;

    const withDropped = blocksFor([
      favorite,
      makeMedia({ tmdbId: 2, title: 'Alien 3', sagaId: 8091, status: 'abandonada' }),
    ]).find((b) => b.id === 'porque-viste-1')!;

    expect(withDropped.weight).toBeLessThan(alone.weight);
    expect(withDropped.weight).toBeGreaterThan(0);
  });

  it('y a la del director de algo que dejaste', () => {
    const director = person(1, 'Una Directora', 'direccion');
    const loved = makeMedia({ tmdbId: 1, history: [watch(5)], people: [director] });
    const alone = blocksFor([loved]).find((b) => b.id === 'director-1')!;

    const withDropped = blocksFor([
      loved,
      makeMedia({ tmdbId: 2, status: 'abandonada', people: [director] }),
    ]).find((b) => b.id === 'director-1')!;

    expect(withDropped.weight).toBeLessThan(alone.weight);
  });
});

describe('la fila de plataformas con suscripciones', () => {
  const subscriptions = {
    providers: [{ id: 337, name: 'Disney Plus', logoPath: null }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('usa lo que la persona paga antes que lo deducido, y pesa más', () => {
    const library = [
      makeMedia({ tmdbId: 1, providers: ['Netflix'] }),
      makeMedia({ tmdbId: 2, providers: ['Netflix'] }),
    ];
    const deduced = blocksFor(library).find((b) => b.id.startsWith('plataforma-'))!;

    const blocks = buildBlocks({
      taste: tasteProfile(library, NOW),
      picks: emptyPicks(),
      region: 'AR',
      subscriptions,
    }).filter((b) => b.id.startsWith('plataforma-'));

    expect(blocks.map((b) => b.id)).toEqual([
      'plataforma-Disney Plus',
      'plataforma-series-Disney Plus',
    ]);
    expect(blocks[0].weight).toBeGreaterThan(deduced.weight);
  });

  it('pide por id, en películas y en series', () => {
    const blocks = buildBlocks({
      taste: tasteProfile([], NOW),
      picks: emptyPicks(),
      region: 'UY',
      subscriptions,
    }).filter((b) => b.id.startsWith('plataforma-'));

    vi.mocked(getDiscover).mockClear();
    blocks.forEach((block) => block.fetch());
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'movie', providers: [337], region: 'UY' }),
    );
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'tv', providers: [337], region: 'UY' }),
    );
  });

  it('arma filas para cada plataforma, con tope', () => {
    const many = {
      providers: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, logoPath: null })),
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const blocks = buildBlocks({
      taste: tasteProfile([], NOW),
      picks: emptyPicks(),
      region: 'AR',
      subscriptions: many,
    }).filter((b) => b.id.startsWith('plataforma-'));

    expect(blocks.length).toBeGreaterThan(4);
    expect(blocks.length).toBeLessThan(20);
  });

  it('sin suscripciones sigue saliendo de la biblioteca', () => {
    const library = [
      makeMedia({ tmdbId: 1, providers: ['Netflix'] }),
      makeMedia({ tmdbId: 2, providers: ['Netflix'] }),
    ];
    const blocks = buildBlocks({
      taste: tasteProfile(library, NOW),
      picks: emptyPicks(),
      region: 'AR',
      subscriptions: { providers: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(blocks.some((b) => b.id === 'plataforma-Netflix')).toBe(true);
  });
});

describe('solo lo que está en mis plataformas', () => {
  const mine = {
    providers: [
      { id: 8, name: 'Netflix', logoPath: null },
      { id: 337, name: 'Disney Plus', logoPath: null },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const library = [
    makeMedia({ tmdbId: 1, genres: ['Terror'], history: [watch(5)] }),
    makeMedia({ tmdbId: 2, genres: ['Terror'], history: [watch(4.5)] }),
    makeMedia({ tmdbId: 3, genres: ['Terror'], history: [watch(4)] }),
    makeMedia({
      tmdbId: 4,
      mediaType: 'tv',
      title: 'Dark',
      status: 'viendo',
      history: undefined,
      seasons: [{ seasonNumber: 1, name: 'T1', episodeCount: 10 }],
      progress: { watched: { 1: [1, 2] } },
    }),
  ];

  function blocksWith(onlyMine: boolean) {
    return buildBlocks({
      taste: tasteProfile(library, NOW),
      picks: emptyPicks(),
      region: 'AR',
      subscriptions: { ...mine, ...(onlyMine ? { onlyMine: true } : {}) },
    });
  }

  it('apagado, el feed es el de siempre', () => {
    const blocks = blocksWith(false);
    expect(blocks.some((b) => b.id.startsWith('porque-viste'))).toBe(true);
  });

  it('pide cada fila de /discover limitada a lo que pagás', () => {
    const blocks = blocksWith(true);
    const discoverRows = blocks.filter((b) => !b.local && !b.id.startsWith('plataforma-'));
    expect(discoverRows.length).toBeGreaterThan(0);

    vi.mocked(getDiscover).mockClear();
    discoverRows.forEach((block) => block.fetch());
    for (const [params] of vi.mocked(getDiscover).mock.calls) {
      expect(params).toMatchObject({ providers: [8, 337], region: 'AR' });
    }
  });

  it('las filas de una plataforma siguen pidiendo solo la suya', () => {
    vi.mocked(getDiscover).mockClear();
    blocksWith(true)
      .find((b) => b.id === 'plataforma-Netflix')!
      .fetch();
    expect(getDiscover).toHaveBeenCalledWith(expect.objectContaining({ providers: [8] }));
  });

  it('esconde lo que no se puede pedir filtrado, pero no tu biblioteca', () => {
    const before = blocksWith(false);
    const after = blocksWith(true);

    vi.mocked(getRecommendations).mockClear();
    vi.mocked(getSimilar).mockClear();
    after.forEach((block) => block.fetch());
    expect(getRecommendations).not.toHaveBeenCalled();
    expect(getSimilar).not.toHaveBeenCalled();

    const localBefore = before.filter((b) => b.local).map((b) => b.id);
    expect(localBefore.length).toBeGreaterThan(0);
    expect(after.filter((b) => b.local).map((b) => b.id)).toEqual(localBefore);
  });

  it('sin plataformas, el interruptor no hace nada', () => {
    const blocks = buildBlocks({
      taste: tasteProfile(library, NOW),
      picks: emptyPicks(),
      region: 'AR',
      subscriptions: { providers: [], onlyMine: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(blocks.some((b) => b.id.startsWith('porque-viste'))).toBe(true);
  });
});

describe('las filas de la gente que seguís', () => {
  const signal = (tmdbId: number, names: string[]) => ({
    title: { tmdbId, mediaType: 'movie' as const, title: `T${tmdbId}`, posterPath: null, releaseYear: '2024' },
    names,
  });

  function socialBlocks(social: Parameters<typeof buildBlocks>[0]['social']) {
    return buildBlocks({ taste: tasteProfile([], NOW), picks: emptyPicks(), region: 'AR', social }).filter(
      (block) => block.family === 'social',
    );
  }

  it('con menos de tres títulos no hay fila', () => {
    expect(socialBlocks({ watching: [signal(1, ['Ana']), signal(2, ['Beto'])], loved: [] })).toEqual([]);
    expect(socialBlocks(undefined)).toEqual([]);
  });

  it('arma "lo que están viendo" y "les encantó" nombrando a quiénes, sin pedirle nada a TMDB', async () => {
    const blocks = socialBlocks({
      watching: [signal(1, ['Ana']), signal(2, ['Beto']), signal(3, ['Caro', 'Ana'])],
      loved: [signal(4, ['Ana']), signal(5, ['Ana']), signal(6, ['Ana'])],
    });
    expect(blocks.map((block) => block.id)).toEqual(['amigos-viendo', 'amigos-encantados']);
    expect(blocks[0].subtitle).toBe('Ana, Beto y 1 más, estas semanas.');
    expect(blocks[1].subtitle).toBe('Con 4,5 estrellas o más, de Ana.');
    const results = await blocks[0].fetch();
    expect(results.map((result) => result.id)).toEqual([1, 2, 3]);
    expect(results[0]).toMatchObject({ media_type: 'movie', title: 'T1', release_date: '2024-01-01' });
  });
});

describe('lo que no te interesa', () => {
  function blocksWith(picks: Partial<TastePicks>, restrictions: Partial<Restrictions>) {
    return buildBlocks({
      taste: tasteProfile([], NOW),
      picks: { ...emptyPicks(), ...picks },
      region: 'AR',
      restrictions: { excludedGenres: [], updatedAt: NOW.toISOString(), ...restrictions },
    });
  }

  it('las filas de /discover se piden con el piso y los géneros excluidos adentro', () => {
    vi.mocked(getDiscover).mockClear();
    const blocks = blocksWith(
      { genres: ['Drama'] },
      { minYear: { year: 1990, scope: 'movie' }, excludedGenres: ['Terror'] },
    );

    const row = blocks.find((block) => block.id.startsWith('genero-elegido-18'));
    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ genres: [18], from: 1990, withoutGenres: [27] }),
    );
  });

  it('no arma la fila de una década anterior al piso', () => {
    const blocks = blocksWith({ decade: 1980 }, { minYear: { year: 1990, scope: 'both' } });
    expect(blocks.some((block) => block.id.startsWith('decada-elegida'))).toBe(false);
  });

  it('pero sí la de una década que el piso solo recorta', () => {
    vi.mocked(getDiscover).mockClear();
    const blocks = blocksWith({ decade: 1990 }, { minYear: { year: 1995, scope: 'movie' } });

    const row = blocks.find((block) => block.id === 'decada-elegida-1990');
    row?.fetch();
    expect(getDiscover).toHaveBeenCalledWith(expect.objectContaining({ from: 1995, to: 1999 }));
  });

  it('no arma filas de un género excluido, aunque también sea favorito', () => {
    const blocks = blocksWith({ genres: ['Terror'] }, { excludedGenres: ['Terror'] });
    expect(blocks.some((block) => block.id.startsWith('genero-elegido-27'))).toBe(false);
  });

  it('las filas que no salen de /discover se arman igual: se filtran al reclamar', () => {
    const picks = {
      movie: {
        tmdbId: 105,
        mediaType: 'movie' as const,
        title: 'Volver al futuro',
        posterPath: null,
        releaseYear: '1985',
      },
    };
    const without = blocksWith(picks, {}).map((block) => block.id);
    const withFloor = blocksWith(picks, { minYear: { year: 1990, scope: 'both' } }).map(
      (block) => block.id,
    );

    expect(withFloor.filter((id) => id.includes('105'))).toEqual(
      without.filter((id) => id.includes('105')),
    );
    expect(without.some((id) => id.includes('105'))).toBe(true);
  });
});

