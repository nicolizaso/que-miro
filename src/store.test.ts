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

    useMediaStore.getState().addWatchEntry(1, {
      id: 'w1',
      rating: 4.5,
      text: 'Un clásico.',
      completedAt: '2024-06-01T00:00:00.000Z',
    });

    const [media] = useMediaStore.getState().mediaList;
    expect(media.status).toBe('completada');
    expect(media.history?.[0].rating).toBe(4.5);
  });

  it('volver a ver algo suma al historial en vez de pisarlo', () => {
    const { addMedia, addWatchEntry } = useMediaStore.getState();
    addMedia(makeMedia());
    addWatchEntry(1, {
      id: 'primera',
      rating: 3,
      completedAt: '2020-01-01T00:00:00.000Z',
    });
    addWatchEntry(1, {
      id: 'segunda',
      rating: 5,
      completedAt: '2025-01-01T00:00:00.000Z',
    });

    const [media] = useMediaStore.getState().mediaList;
    expect(media.history).toHaveLength(2);
    // La más reciente primero: es la que muestra la tarjeta.
    expect(media.history![0].id).toBe('segunda');
  });

  it('borrar el único visionado devuelve el título a viendo', () => {
    const { addMedia, addWatchEntry, removeWatchEntry } = useMediaStore.getState();
    addMedia(makeMedia());
    addWatchEntry(1, { id: 'w1', rating: 4, completedAt: '2024-01-01T00:00:00.000Z' });

    removeWatchEntry(1, 'w1');

    const [media] = useMediaStore.getState().mediaList;
    expect(media.history).toBeUndefined();
    expect(media.status).toBe('viendo');
  });

  it('guarda el progreso de una serie y lo borra cuando queda vacío', () => {
    useMediaStore.getState().addMedia(makeMedia({ mediaType: 'tv' }));

    useMediaStore.getState().setProgress(1, { watched: { 1: [1, 2] } });
    expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([
      1, 2,
    ]);

    useMediaStore.getState().setProgress(1, { watched: {} });
    expect(useMediaStore.getState().mediaList[0].progress).toBeUndefined();
  });

  it('borrar una colección le saca la referencia a sus títulos', () => {
    const { addMedia, patchMedia, addCollection, removeCollection } =
      useMediaStore.getState();
    addMedia(makeMedia({ tmdbId: 1 }));
    addMedia(makeMedia({ tmdbId: 2 }));
    addCollection({
      id: 'abc',
      name: 'Maratón',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    patchMedia(1, { collections: ['abc'] });
    patchMedia(2, { collections: ['abc', 'otra'] });

    removeCollection('abc');

    const { mediaList, collections } = useMediaStore.getState();
    expect(collections).toHaveLength(0);
    expect(mediaList.find((m) => m.tmdbId === 1)?.collections).toBeUndefined();
    expect(mediaList.find((m) => m.tmdbId === 2)?.collections).toEqual(['otra']);
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
