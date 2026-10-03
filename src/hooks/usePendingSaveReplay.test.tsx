import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, render } from '@testing-library/react';
import { ReactNode } from 'react';
import { SavedMedia } from '@/types';

const auth = { user: { uid: 'u1' } as { uid: string } | null, authState: 'authenticated' };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }));

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

const { usePendingSaveReplay } = await import('./usePendingSaveReplay');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { readPendingSave, savePendingSave } = await import('@/lib/pendingSave');

const draft = {
  tmdbId: 1396,
  mediaType: 'tv' as const,
  title: 'Breaking Bad',
  posterPath: null,
  backdropPath: null,
  releaseYear: '2008',
  genres: [],
  status: 'viendo' as const,
};

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

function Probe() {
  usePendingSaveReplay();
  return null;
}

function writtenPaths() {
  return setDoc.mock.calls.map(([ref]) => (ref as { path: string }).path);
}

describe('usePendingSaveReplay', () => {
  beforeEach(() => {
    auth.user = { uid: 'u1' };
    auth.authState = 'authenticated';
    setDoc.mockClear();
    useMediaStore.getState().reset();
    savePendingSave({ draft, returnTo: '/explorar?ficha=tv:1396' });
  });

  it('espera a que la cuenta termine de bajar antes de guardar', () => {
    useMediaStore.setState({ ownerUid: 'u1', syncedUid: null });
    const { rerender } = renderHook(() => usePendingSaveReplay(), { wrapper });

    expect(setDoc).not.toHaveBeenCalled();
    expect(readPendingSave()).not.toBeNull();

    useMediaStore.setState({ syncedUid: 'u1' });
    rerender();
    expect(writtenPaths()).toEqual(['users/u1/saved_media/1396']);
    expect(readPendingSave()).toBeNull();
  });

  it('si la cuenta ya lo tenía, solo lo cambia de lista', () => {
    const existing: SavedMedia = {
      ...draft,
      status: 'completada',
      history: [{ id: 'w1', completedAt: '2025-01-01T00:00:00.000Z', rating: 5 }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useMediaStore.setState({ ownerUid: 'u1', syncedUid: 'u1', mediaList: [existing] });
    renderHook(() => usePendingSaveReplay(), { wrapper });

    const [, data, options] = setDoc.mock.calls[0] as [unknown, Record<string, unknown>, { mergeFields?: string[] }];
    // Un cambio parcial: el historial de la cuenta no se toca.
    expect(options.mergeFields).toBeDefined();
    expect(data.status).toBe('viendo');
    expect(data).not.toHaveProperty('history');
  });

  it('avisa que quedó guardado', async () => {
    useMediaStore.setState({ ownerUid: 'u1', syncedUid: 'u1' });
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    expect(await screen.findByText('Listo: "Breaking Bad" quedó en Viendo.')).toBeInTheDocument();
  });

  it('sin sesión no hace nada', () => {
    auth.user = null;
    auth.authState = 'guest';
    renderHook(() => usePendingSaveReplay(), { wrapper });
    expect(setDoc).not.toHaveBeenCalled();
    expect(readPendingSave()).not.toBeNull();
  });
});
