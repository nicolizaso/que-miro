import { describe, expect, it } from 'vitest';
import {
  EMPTY_PICKER_FILTERS,
  PickerFilters,
  POSTER_WALL_MIN,
  RECENT_MEMORY,
  candidates,
  pickRandom,
  pickerFacets,
  posterWall,
  rememberPick,
} from './picker';
import { SavedMedia } from '@/types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: null,
    backdropPath: null,
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function filters(overrides: Partial<PickerFilters> = {}): PickerFilters {
  return { ...EMPTY_PICKER_FILTERS, ...overrides };
}

describe('candidates', () => {
  it('solo considera la lista Por Ver', () => {
    const list = [
      makeMedia({ tmdbId: 1, status: 'por_ver' }),
      makeMedia({ tmdbId: 2, status: 'viendo' }),
      makeMedia({ tmdbId: 3, status: 'completada' }),
    ];

    expect(candidates(list, filters()).map((m) => m.tmdbId)).toEqual([1]);
  });

  it('filtra por tipo, género, plataforma y lista', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        mediaType: 'tv',
        genres: ['Drama'],
        providers: ['Netflix'],
        collections: ['abc'],
      }),
      makeMedia({ tmdbId: 2, mediaType: 'movie' }),
    ];

    expect(candidates(list, filters({ type: 'tv' })).map((m) => m.tmdbId)).toEqual([1]);
    expect(candidates(list, filters({ genre: 'Drama' })).map((m) => m.tmdbId)).toEqual([1]);
    expect(
      candidates(list, filters({ provider: 'Netflix' })).map((m) => m.tmdbId),
    ).toEqual([1]);
    expect(
      candidates(list, filters({ collection: 'abc' })).map((m) => m.tmdbId),
    ).toEqual([1]);
  });

  it('filtra películas por su duración', () => {
    const list = [
      makeMedia({ tmdbId: 1, title: 'Corta', runtime: 85 }),
      makeMedia({ tmdbId: 2, title: 'Larga', runtime: 180 }),
    ];

    expect(
      candidates(list, filters({ duration: 'corta' })).map((m) => m.title),
    ).toEqual(['Corta']);
    expect(candidates(list, filters({ duration: 'larga' }))).toHaveLength(2);
  });

  it('en series mide un episodio y no la serie entera', () => {
    // Nueve temporadas de 45 minutos no deberían quedar afuera del tramo
    // "menos de una hora y media": la pregunta es qué mirar esta noche.
    const serie = makeMedia({
      tmdbId: 1,
      mediaType: 'tv',
      runtime: 45,
      totalEpisodes: 120,
    });

    expect(candidates([serie], filters({ duration: 'corta' }))).toHaveLength(1);
  });

  it('filtra por etiqueta de ánimo', () => {
    const list = [
      makeMedia({
        tmdbId: 1,
        history: [
          { id: 'a', rating: 5, tags: ['Con amigos'], completedAt: '2024-01-01T00:00:00.000Z' },
        ],
      }),
      makeMedia({ tmdbId: 2 }),
    ];

    expect(
      candidates(list, filters({ tag: 'Con amigos' })).map((m) => m.tmdbId),
    ).toEqual([1]);
  });
});

describe('pickRandom', () => {
  const pool = [
    makeMedia({ tmdbId: 1 }),
    makeMedia({ tmdbId: 2 }),
    makeMedia({ tmdbId: 3 }),
  ];

  it('devuelve null con el pool vacío', () => {
    expect(pickRandom([])).toBeNull();
  });

  it('no repite lo que salió hace poco', () => {
    // Con el azar fijado en el primer elemento, sin memoria saldría siempre el 1.
    const picked = pickRandom(pool, [1], () => 0);
    expect(picked?.tmdbId).toBe(2);
  });

  it('si lo reciente agota el pool, repite antes que no contestar', () => {
    const picked = pickRandom(pool, [1, 2, 3], () => 0);
    expect(picked?.tmdbId).toBe(1);
  });
});

describe('rememberPick', () => {
  it('pone el último adelante y no repite', () => {
    expect(rememberPick([2, 1], 1)).toEqual([1, 2]);
  });

  it('recorta al tope de memoria', () => {
    const recent = rememberPick([5, 4, 3, 2, 1], 6);
    expect(recent).toHaveLength(RECENT_MEMORY);
    expect(recent[0]).toBe(6);
  });
});

describe('lo archivado', () => {
  it('no entra al picker: ni lo abandonado ni lo que está en pausa', () => {
    const list = [
      makeMedia({ tmdbId: 1, status: 'por_ver' }),
      makeMedia({ tmdbId: 2, status: 'abandonada' }),
      makeMedia({ tmdbId: 3, status: 'en_pausa' }),
    ];

    expect(candidates(list, filters()).map((m) => m.tmdbId)).toEqual([1]);
  });
});

describe('Lo que puedo ver ya, en el picker', () => {
  it('sortea solo entre lo incluido en lo que pagás', () => {
    const list = [
      makeMedia({ tmdbId: 1, streaming: ['Disney Plus'] }),
      makeMedia({ tmdbId: 2, streaming: ['Netflix'] }),
      makeMedia({ tmdbId: 3 }),
    ];

    const ids = candidates(list, filters({ availableNow: true }), new Set(['disney plus']));
    expect(ids.map((m) => m.tmdbId)).toEqual([1]);
  });
});

describe('pickerFacets', () => {
  const list = [
    makeMedia({ tmdbId: 1, mediaType: 'movie', genres: ['Drama'], runtime: 80, providers: ['Netflix'] }),
    makeMedia({ tmdbId: 2, mediaType: 'movie', genres: ['Drama', 'Comedia'], runtime: 140 }),
    makeMedia({ tmdbId: 3, mediaType: 'tv', genres: ['Comedia', 'Drama'], runtime: 30, providers: ['Max'] }),
    makeMedia({ tmdbId: 4, mediaType: 'movie', genres: ['Terror'], status: 'completada' }),
  ];

  it('cuenta cuántos quedarían con cada opción, con el resto de los filtros puestos', () => {
    const facets = pickerFacets(list, filters({ type: 'movie' }));

    expect(facets.genre).toEqual([
      { value: 'Drama', label: 'Drama', count: 2 },
      { value: 'Comedia', label: 'Comedia', count: 1 },
    ]);
    // La fila del propio filtro se cuenta reemplazándolo, no sumándolo.
    expect(facets.type).toEqual([
      { value: 'movie', label: 'Películas', count: 2 },
      { value: 'tv', label: 'Series', count: 1 },
    ]);
  });

  it('ordena por frecuencia en toda la lista, y el orden no cambia al filtrar', () => {
    const all = pickerFacets(list, filters()).genre.map((option) => option.value);
    const filtered = pickerFacets(list, filters({ type: 'tv' })).genre.map((option) => option.value);

    expect(all).toEqual(['Drama', 'Comedia']);
    expect(filtered).toEqual(all);
  });

  it('no ofrece lo que no tiene sentido tocar', () => {
    const onlyMovies = [makeMedia({ tmdbId: 1 }), makeMedia({ tmdbId: 2 })];
    const facets = pickerFacets(onlyMovies, filters(), new Set(), [], false);

    expect(facets.type.map((option) => option.value)).toEqual(['movie']);
    expect(facets.duration.map((option) => option.value)).not.toContain('larga');
    expect(facets.tag).toEqual([]);
  });

  it('las listas van en el orden de la persona y con su nombre', () => {
    const inList = [makeMedia({ tmdbId: 1, collections: ['b'] })];
    const facets = pickerFacets(inList, filters(), new Set(), [
      { id: 'a', name: 'Domingo' },
      { id: 'b', name: 'Clásicos' },
    ]);

    expect(facets.collection).toEqual([
      { value: 'a', label: 'Domingo', count: 0 },
      { value: 'b', label: 'Clásicos', count: 1 },
    ]);
  });
});

describe('posterWall', () => {
  it('usa los pósters de Por Ver, sin repetir', () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      makeMedia({ tmdbId: i, posterPath: `/p${i % 7}.jpg` }),
    );

    expect(posterWall(list)).toHaveLength(7);
  });

  it('no arma nada si no alcanzan para llenar el fondo', () => {
    const list = Array.from({ length: POSTER_WALL_MIN - 1 }, (_, i) =>
      makeMedia({ tmdbId: i, posterPath: `/p${i}.jpg` }),
    );

    expect(posterWall(list)).toEqual([]);
  });
});
