import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { SavedMedia } from '@/types';

const getIdToken = vi.fn(async (_forceRefresh?: boolean) => 'token');
const user = { uid: 'u1', email: 'yo@ejemplo.com', getIdToken };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user, authState: 'authenticated' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: true,
  isMissingDatabaseError: () => false,
  isPermissionDeniedError: (error: { code?: string }) =>
    error?.code === 'permission-denied',
}));

const batchSet = vi.fn();
const batchCommit = vi.fn(async () => {});
/** Callbacks de cada `onSnapshot`, en orden: biblioteca y después listas. */
const listeners: ((snapshot: unknown) => void)[] = [];
/** Callbacks de error de cada `onSnapshot`, en el mismo orden. */
const errorListeners: ((error: unknown) => void)[] = [];
/** Rutas suscriptas, en orden: sirve para ver quién se volvió a suscribir. */
const subscribedPaths: string[] = [];

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  writeBatch: () => ({ set: batchSet, commit: batchCommit }),
  onSnapshot: (
    ref: { path: string },
    onNext: (snapshot: unknown) => void,
    onError: (error: unknown) => void,
  ) => {
    listeners.push(onNext);
    errorListeners.push(onError);
    subscribedPaths.push(ref.path);
    return () => {};
  },
}));

const { SyncManager, PERMISSION_RETRY_DELAY_MS } = await import(
  '@/components/SyncManager'
);
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { useSyncStatus } = await import('@/lib/syncStatus');

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
  errorListeners.length = 0;
  subscribedPaths.length = 0;
  getIdToken.mockClear();
  useSyncStatus.setState({ issue: null });
  batchSet.mockClear();
  batchCommit.mockClear();
  batchCommit.mockImplementation(async () => {});
  useMediaStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  describe('permisos rechazados', () => {
    const denied = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };

    it('un rechazo al abrir la app renueva el token y vuelve a escuchar, sin cartel', async () => {
      // El caso del celular: la app vuelve del fondo con un token vencido y la
      // primera escucha rebota aunque las reglas estén bien.
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderSync();
      const mediaPath = subscribedPaths[0];

      await act(async () => {
        errorListeners[0](denied);
      });
      expect(getIdToken).toHaveBeenCalledWith(true);
      expect(useSyncStatus.getState().issue).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PERMISSION_RETRY_DELAY_MS);
      });
      expect(subscribedPaths.filter((p) => p === mediaPath)).toHaveLength(2);

      // La nueva escucha anda: baja lo del servidor.
      await act(async () => {
        listeners[listeners.length - 1](snapshot([makeMedia(3)]));
      });
      expect(useMediaStore.getState().mediaList).toHaveLength(1);
      expect(useSyncStatus.getState().issue).toBeNull();
    });

    it('si el rechazo se repite enseguida, son las reglas: muestra el cartel', async () => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      renderSync();

      await act(async () => {
        errorListeners[0](denied);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PERMISSION_RETRY_DELAY_MS);
      });
      await act(async () => {
        errorListeners[errorListeners.length - 1](denied);
      });

      expect(getIdToken).toHaveBeenCalledTimes(1);
      expect(useSyncStatus.getState().issue).toBe('permission-denied');
    });
  });
});
