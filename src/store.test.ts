import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaStore } from './store';
import { SavedMedia } from './types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseYear: '1999',
    genres: ['Ciencia Ficción'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useMediaStore', () => {
  beforeEach(() => {
    useMediaStore.getState().reset();
  });

  it('agrega un título a la biblioteca', () => {
    useMediaStore.getState().addMedia(makeMedia());

    const { mediaList } = useMediaStore.getState();
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].title).toBe('Matrix');
  });

  it('no duplica un título que ya está guardado', () => {
    const { addMedia } = useMediaStore.getState();
    addMedia(makeMedia());
    addMedia(makeMedia({ title: 'Matrix (duplicado)' }));

    const { mediaList } = useMediaStore.getState();
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].title).toBe('Matrix');
  });

  it('cambia el estado de un título y refresca updatedAt', () => {
    useMediaStore.getState().addMedia(makeMedia());
    const before = useMediaStore.getState().mediaList[0].updatedAt;

    useMediaStore.getState().updateStatus(1, 'viendo');

    const [media] = useMediaStore.getState().mediaList;
    expect(media.status).toBe('viendo');
    expect(new Date(media.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });

  it('al guardar una reseña marca el título como completada', () => {
    useMediaStore.getState().addMedia(makeMedia());

    useMediaStore.getState().addReview(1, {
      rating: 4.5,
      text: 'Un clásico.',
      completedAt: '2024-06-01T00:00:00.000Z',
    });

    const [media] = useMediaStore.getState().mediaList;
    expect(media.status).toBe('completada');
    expect(media.review?.rating).toBe(4.5);
  });

  it('elimina solo el título indicado', () => {
    const { addMedia, removeMedia } = useMediaStore.getState();
    addMedia(makeMedia({ tmdbId: 1, title: 'Matrix' }));
    addMedia(makeMedia({ tmdbId: 2, title: 'Alien' }));

    removeMedia(1);

    const { mediaList } = useMediaStore.getState();
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].tmdbId).toBe(2);
  });

  it('reset limpia la biblioteca y el dueño de los datos', () => {
    const { addMedia, setOwnerUid, reset } = useMediaStore.getState();
    addMedia(makeMedia());
    setOwnerUid('user-123');

    reset();

    expect(useMediaStore.getState().mediaList).toHaveLength(0);
    expect(useMediaStore.getState().ownerUid).toBeNull();
  });

  it('ignora acciones sobre un tmdbId que no existe', () => {
    useMediaStore.getState().addMedia(makeMedia({ tmdbId: 1 }));

    useMediaStore.getState().updateStatus(999, 'completada');

    expect(useMediaStore.getState().mediaList[0].status).toBe('por_ver');
  });
});
