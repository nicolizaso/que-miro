import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { SavedMedia } from '@/types';

const user = { uid: 'u1', email: 'yo@ejemplo.com' };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user, authState: 'authenticated' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: true,
  isMissingDatabaseError: () => false,
}));

const batchSet = vi.fn();
const batchCommit = vi.fn(async () => {});
/** Callbacks de cada `onSnapshot`, en orden: biblioteca y después listas. */
const listeners: ((snapshot: unknown) => void)[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  writeBatch: () => ({ set: batchSet, commit: batchCommit }),
  onSnapshot: (_ref: unknown, onNext: (snapshot: unknown) => void) => {
    listeners.push(onNext);
    return () => {};
  },
}));

const { SyncManager } = await import('@/components/SyncManager');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

function makeMedia(tmdbId: number): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title: `Peli ${tmdbId}`,
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseYear: '1999',
    genres: ['Drama'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

/** Emisión de Firestore, con el origen que la app usa para decidir. */
function snapshot(media: SavedMedia[], { fromCache = false } = {}) {
  return {
    metadata: { fromCache },
    docs: media.map((m) => ({ data: () => m })),
  };
}

function renderSync() {
  return render(
    <ToastProvider>
      <SyncManager />
    </ToastProvider>,
  );
}

beforeEach(() => {
  listeners.length = 0;
  batchSet.mockClear();
  batchCommit.mockClear();
  batchCommit.mockImplementation(async () => {});
  useMediaStore.getState().reset();
});

afterEach(() => {
  act(() => useMediaStore.getState().reset());
});

describe('SyncManager', () => {
  it('sube la biblioteca local en vez de borrarla contra un servidor vacío', async () => {
    // El caso que rompió de verdad: títulos guardados contra un Firestore que
    // los rechazaba, y una cuenta que del otro lado está vacía.
    act(() => {
      useMediaStore.setState({
        mediaList: [makeMedia(1), makeMedia(2)],
        ownerUid: 'u1',
        syncedUid: null,
      });
    });

    renderSync();
    await act(async () => {
      listeners[0](snapshot([]));
    });

    await waitFor(() => expect(batchCommit).toHaveBeenCalled());
    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(useMediaStore.getState().mediaList).toHaveLength(2);
  });

  it('conserva lo local si la subida falla', async () => {
    batchCommit.mockImplementation(async () => {
      throw new Error('permission-denied');
    });
    act(() => {
      useMediaStore.setState({
        mediaList: [makeMedia(1)],
        ownerUid: 'u1',
        syncedUid: null,
      });
    });

    renderSync();
    await act(async () => {
      listeners[0](snapshot([]));
    });

    await waitFor(() => expect(batchCommit).toHaveBeenCalled());
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
  });

  it('no sube contra una emisión de la caché, que no dice nada del servidor', async () => {
    act(() => {
      useMediaStore.setState({
        mediaList: [makeMedia(1)],
        ownerUid: 'u1',
        syncedUid: null,
      });
    });

    renderSync();
    await act(async () => {
      listeners[0](snapshot([], { fromCache: true }));
    });

    expect(batchCommit).not.toHaveBeenCalled();
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
  });

  it('una vez sincronizada la cuenta, el servidor manda y los borrados bajan', async () => {
    act(() => {
      useMediaStore.setState({
        mediaList: [makeMedia(1)],
        ownerUid: 'u1',
        syncedUid: 'u1',
      });
    });

    renderSync();
    await act(async () => {
      listeners[0](snapshot([]));
    });

    expect(batchCommit).not.toHaveBeenCalled();
    expect(useMediaStore.getState().mediaList).toHaveLength(0);
  });

  it('marca la cuenta como sincronizada cuando el servidor contesta', async () => {
    renderSync();
    await act(async () => {
      listeners[0](snapshot([makeMedia(7)]));
    });

    expect(useMediaStore.getState().syncedUid).toBe('u1');
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
  });
});
