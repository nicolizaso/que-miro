import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { SavedMedia } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, authState: 'authenticated' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: true,
}));

const setDoc = vi.fn(async (..._args: unknown[]) => {});

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: vi.fn(async () => {}),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

vi.mock('@/lib/tmdb', () => ({
  getMediaDetail: vi.fn(async () => {
    throw new Error('sin red');
  }),
}));

const { useMediaActions } = await import('./useMediaActions');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

function series(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 7,
    mediaType: 'tv',
    title: 'Dark',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2017',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    seasons: [
      { seasonNumber: 1, name: 'T1', episodeCount: 10 },
      { seasonNumber: 2, name: 'T2', episodeCount: 8 },
    ],
    ...overrides,
  };
}

describe('las escrituras en Firestore', () => {
  beforeEach(() => {
    setDoc.mockClear();
    useMediaStore.setState({ mediaList: [series()] });
  });

  it('reemplazan cada campo entero: lo que se borró de un mapa no sobrevive', async () => {
    const { result } = renderHook(() => useMediaActions(), { wrapper });

    // Se desmarcó la temporada 2 entera: en el mapa ya no está.
    await act(async () => {
      await result.current.setProgress(7, { watched: { 1: [1, 2, 3] } });
    });

    const [ref, data, options] = setDoc.mock.calls[0] as [
      { path: string },
      Record<string, unknown>,
      { mergeFields?: string[]; merge?: boolean },
    ];
    expect(ref.path).toBe('users/u1/saved_media/7');
    expect(options.merge).toBeUndefined();
    expect(options.mergeFields?.sort()).toEqual(Object.keys(data).sort());
    expect(options.mergeFields).toContain('progress');
    expect(data.progress).toEqual({ watched: { 1: [1, 2, 3] } });
  });

  it('archivar guarda `viendo` y el estado real en el archivo', async () => {
    const { result } = renderHook(() => useMediaActions(), { wrapper });

    await act(async () => {
      await result.current.archiveMedia(series(), 'abandonada', {
        reason: 'Se enreda',
        rating: 2,
      });
    });

    const [, data] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(data.status).toBe('viendo');
    expect(data.archive).toMatchObject({ status: 'abandonada', reason: 'Se enreda' });
    expect((data.history as { abandoned?: boolean }[])[0].abandoned).toBe(true);
  });

  it('retomar borra el archivo del documento', async () => {
    const { result } = renderHook(() => useMediaActions(), { wrapper });

    await act(async () => {
      await result.current.resumeMedia(series({ status: 'en_pausa' }));
    });

    const [, data, options] = setDoc.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { mergeFields: string[] },
    ];
    expect(data.status).toBe('viendo');
    // `null` es como Firestore guarda la ausencia; con `mergeFields` pisa lo
    // que hubiera.
    expect(data.archive).toBeNull();
    expect(options.mergeFields).toContain('archive');
  });
});
