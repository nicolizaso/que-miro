import { describe, expect, it } from 'vitest';
import {
  buildPublicProfile,
  isValidSlug,
  parsePublicProfile,
  toSlug,
} from './publicProfile';
import { SavedMedia } from '@/types';

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
    updatedAt: '2024-01-01T00:00:00.000Z',
    runtime: 136,
    ...overrides,
  };
}

function watch(rating: number, text?: string, id = `w-${rating}-${text ?? ''}`) {
  return { id, rating, text, completedAt: '2025-01-01T00:00:00.000Z' };
}

describe('toSlug', () => {
  it('saca acentos, mayúsculas y símbolos', () => {
    expect(toSlug('Nicolás Lizaso')).toBe('nicolas-lizaso');
    expect(toSlug('  ¿Qué Miro?  ')).toBe('que-miro');
  });

  it('no deja guiones colgando en las puntas', () => {
    expect(toSlug('--hola--')).toBe('hola');
  });

  it('devuelve vacío si no queda nada aprovechable', () => {
    expect(toSlug('¡!¿?')).toBe('');
  });

  it('respeta el largo máximo', () => {
    expect(toSlug('a'.repeat(50)).length).toBeLessThanOrEqual(24);
  });
});

describe('isValidSlug', () => {
  it('acepta letras, números y guiones internos', () => {
    expect(isValidSlug('nico')).toBe(true);
    expect(isValidSlug('nico-lizaso-2')).toBe(true);
  });

  it('rechaza los muy cortos, los muy largos y los mal formados', () => {
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(25))).toBe(false);
    expect(isValidSlug('-nico')).toBe(false);
    expect(isValidSlug('nico--lizaso')).toBe(false);
    expect(isValidSlug('Nico')).toBe(false);
    expect(isValidSlug('nico lizaso')).toBe(false);
  });
});

describe('buildPublicProfile', () => {
  const mediaList = [
    makeMedia({
      tmdbId: 1,
      title: 'Matrix',
      history: [watch(5, 'Un clásico.')],
    }),
    makeMedia({
      tmdbId: 2,
      title: 'Sin comentario',
      genres: ['Drama'],
      history: [watch(4)],
    }),
    makeMedia({ tmdbId: 3, title: 'Sin ver', status: 'por_ver', history: undefined }),
  ];

  const profile = buildPublicProfile({
    slug: 'nico',
    uid: 'user-1',
    displayName: 'Nico',
    mediaList,
  });

  it('resume la biblioteca', () => {
    expect(profile.summary.watches).toBe(2);
    expect(profile.summary.titles).toBe(2);
    expect(profile.summary.averageRating).toBe(4.5);
    expect(profile.summary.timeLabel).toBeTruthy();
  });

  it('publica solo las reseñas escritas', () => {
    // Una lista de puntajes sin texto no le dice nada a quien entra de afuera.
    expect(profile.reviews).toHaveLength(1);
    expect(profile.reviews[0].title).toBe('Matrix');
  });

  it('incluye las favoritas con su puntaje', () => {
    expect(profile.favorites[0].title).toBe('Matrix');
    expect(profile.favorites[0].rating).toBe(5);
  });

  it('no publica lo que no se terminó', () => {
    expect(
      profile.favorites.some((favorite) => favorite.title === 'Sin ver'),
    ).toBe(false);
  });

  it('deja registrado el dueño y la fecha', () => {
    expect(profile.uid).toBe('user-1');
    expect(Date.parse(profile.publishedAt)).not.toBeNaN();
  });
});

describe('parsePublicProfile', () => {
  it('lee lo que escribe buildPublicProfile', () => {
    const original = buildPublicProfile({
      slug: 'nico',
      uid: 'user-1',
      displayName: 'Nico',
      mediaList: [makeMedia({ history: [watch(5, 'Buena.')] })],
    });

    const parsed = parsePublicProfile(JSON.parse(JSON.stringify(original)))!;
    expect(parsed.slug).toBe('nico');
    expect(parsed.reviews).toHaveLength(1);
  });

  it('rechaza lo que no tiene slug ni dueño', () => {
    expect(parsePublicProfile(null)).toBeNull();
    expect(parsePublicProfile({ slug: 'nico' })).toBeNull();
    expect(parsePublicProfile({ uid: 'user-1' })).toBeNull();
  });

  it('sobrevive a un documento a medio escribir', () => {
    // Lo lee cualquiera sin sesión: un documento raro no debería voltear la
    // página pública.
    const parsed = parsePublicProfile({
      slug: 'nico',
      uid: 'user-1',
      summary: 'no soy un objeto',
      favorites: 'tampoco',
      reviews: [{ title: 'Suelta' }],
    })!;

    expect(parsed.displayName).toBe('Alguien');
    expect(parsed.summary.watches).toBe(0);
    expect(parsed.favorites).toEqual([]);
    expect(parsed.reviews[0].rating).toBe(0);
  });
});
