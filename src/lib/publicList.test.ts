import { describe, expect, it } from 'vitest';
import { Collection, SavedMedia } from '@/types';
import {
  MAX_LIST_DESCRIPTION,
  PUBLIC_LIST_ID,
  buildPublicList,
  listShareCard,
  newPublicListId,
  parsePublicList,
  samePublicListContent,
  uniqueCollectionName,
} from './publicList';

const TERROR: Collection = {
  id: 'col-1',
  name: 'Terror del bueno',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function media(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Hereditary',
    posterPath: '/h.jpg',
    backdropPath: '/b.jpg',
    releaseYear: '2018',
    genres: ['Terror'],
    status: 'completada',
    updatedAt: '2026-01-01T00:00:00.000Z',
    collections: ['col-1'],
    history: [{ id: 'w', rating: 5, text: 'Privado', completedAt: '2026-01-01T00:00:00.000Z' }],
    ...overrides,
  };
}

const LIBRARY = [
  media(),
  media({ tmdbId: 2, title: 'Midsommar', status: 'por_ver', history: undefined }),
  media({ tmdbId: 3, mediaType: 'tv', title: 'Bly Manor', releaseYear: '2020' }),
  media({ tmdbId: 4, title: 'Fuera de la lista', collections: ['otra'] }),
];

function build(list = LIBRARY) {
  return buildPublicList({
    id: 'abcdefghijkl1234',
    uid: 'uid-ana',
    ownerName: 'Ana',
    collection: TERROR,
    description: '  Para no dormir.  ',
    mediaList: list,
    now: new Date('2026-09-29T12:00:00.000Z'),
  });
}

describe('buildPublicList', () => {
  it('publica lo mínimo de cada título, por nombre, y nada de la biblioteca', () => {
    const list = build();
    expect(list.items).toEqual([
      { tmdbId: 3, mediaType: 'tv', title: 'Bly Manor', posterPath: '/h.jpg', releaseYear: '2020' },
      { tmdbId: 1, mediaType: 'movie', title: 'Hereditary', posterPath: '/h.jpg', releaseYear: '2018' },
      { tmdbId: 2, mediaType: 'movie', title: 'Midsommar', posterPath: '/h.jpg', releaseYear: '2018' },
    ]);
    // Ni estados, ni puntajes, ni reseñas.
    expect(JSON.stringify(list)).not.toContain('Privado');
    expect(JSON.stringify(list)).not.toContain('completada');
  });

  it('recorta la descripción y guarda de quién es', () => {
    const list = build();
    expect(list.description).toBe('Para no dormir.');
    expect(list).toMatchObject({ uid: 'uid-ana', ownerName: 'Ana', name: 'Terror del bueno', autoUpdate: true });
    const long = buildPublicList({
      id: 'abcdefghijkl1234',
      uid: 'u',
      ownerName: 'Ana',
      collection: TERROR,
      description: 'x'.repeat(1000),
      mediaList: [],
    });
    expect(long.description).toHaveLength(MAX_LIST_DESCRIPTION);
  });
});

describe('parsePublicList', () => {
  it('lee lo que se armó, y compara igual', () => {
    const original = build();
    const parsed = parsePublicList(JSON.parse(JSON.stringify(original)))!;
    expect(parsed).toEqual(original);
    expect(samePublicListContent(original, { ...parsed, publishedAt: '2027-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('una lista con un título más no es la misma', () => {
    const more = build([...LIBRARY, media({ tmdbId: 5, title: 'Suspiria' })]);
    expect(samePublicListContent(build(), more)).toBe(false);
  });

  it('descarta lo roto sin voltear la lista', () => {
    const parsed = parsePublicList({
      id: 'x',
      uid: 'u',
      name: 'Lista',
      items: [{ tmdbId: 1, mediaType: 'movie', title: 'Bien' }, { tmdbId: 'dos' }, { tmdbId: 3, mediaType: 'libro', title: 'No' }],
    })!;
    expect(parsed.items.map((item) => item.title)).toEqual(['Bien']);
    expect(parsed.ownerName).toBe('Alguien');
    expect(parsed.autoUpdate).toBe(true);
  });

  it('sin id, dueño o nombre no hay lista', () => {
    expect(parsePublicList({ uid: 'u', name: 'Lista' })).toBeNull();
    expect(parsePublicList({ id: 'x', name: 'Lista' })).toBeNull();
    expect(parsePublicList({ id: 'x', uid: 'u', name: '  ' })).toBeNull();
    expect(parsePublicList(null)).toBeNull();
  });
});

describe('lo demás', () => {
  it('un id nuevo tiene el formato que piden las reglas', () => {
    expect(PUBLIC_LIST_ID.test(newPublicListId())).toBe(true);
    expect(newPublicListId()).not.toBe(newPublicListId());
  });

  it('guardar la lista de otro no pisa una propia con el mismo nombre', () => {
    expect(uniqueCollectionName('Terror', ['Drama'])).toBe('Terror');
    expect(uniqueCollectionName('Terror', ['terror'])).toBe('Terror (2)');
    expect(uniqueCollectionName('Terror', ['Terror', 'Terror (2)'])).toBe('Terror (3)');
    expect(uniqueCollectionName('x'.repeat(40), ['x'.repeat(40)])).toHaveLength(40);
  });

  it('la tarjeta cuenta películas y series, sin pósters', () => {
    const card = listShareCard(build(), 'https://quemiro.app/l/abcdefghijkl1234');
    expect(card).toEqual({
      eyebrow: 'Una lista de Ana',
      headline: 'Terror del bueno',
      subline: 'quemiro.app/l/abcdefghijkl1234',
      stats: [
        { value: '3', label: 'títulos' },
        { value: '2', label: 'películas' },
        { value: '1', label: 'serie' },
      ],
    });
  });
});
