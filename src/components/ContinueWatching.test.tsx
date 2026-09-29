import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, authState: 'guest' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: false,
}));

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

vi.mock('@/lib/tmdb', () => ({
  // Sin red: la tarjeta se arregla sin el nombre del episodio.
  getSeason: async () => {
    throw new Error('sin red');
  },
  getMediaDetail: async () => {
    throw new Error('sin red');
  },
  currentLanguage: () => 'es-ES',
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
  TMDB_IMAGE_ORIGINAL_URL: 'https://image.tmdb.org/t/p/original',
  TMDB_STILL_URL: 'https://image.tmdb.org/t/p/w300',
}));

// jsdom no trae `ResizeObserver`, que la fila usa para prender sus flechas.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const { ContinueWatching } = await import('@/components/ContinueWatching');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

function chernobyl(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 87108,
    mediaType: 'tv',
    title: 'Chernobyl',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2019',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 5 }],
    seriesStatus: 'Ended',
    progress: { watched: { 1: [1, 2, 3, 4] }, lastWatchedAt: '2026-09-01T00:00:00.000Z' },
    ...overrides,
  };
}

function renderRow(list: SavedMedia[]) {
  act(() => useMediaStore.getState().setMediaList(list));
  render(
    <ToastProvider>
      <ContinueWatching />
    </ToastProvider>,
  );
}

beforeEach(() => act(() => useMediaStore.getState().reset()));
afterEach(() => act(() => useMediaStore.getState().reset()));

describe('ContinueWatching', () => {
  it('sin nada para retomar, la fila no existe', () => {
    renderRow([chernobyl({ status: 'por_ver', progress: undefined })]);
    expect(screen.queryByRole('heading', { name: 'Continuar viendo' })).toBeNull();
  });

  it('el +1 marca el episodio y ofrece deshacerlo', async () => {
    const user = userEvent.setup();
    renderRow([chernobyl({ progress: { watched: { 1: [1, 2] } } })]);

    await user.click(
      screen.getByRole('button', { name: 'Marcar T1E3 de Chernobyl como visto' }),
    );
    expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2, 3]);

    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2]),
    );
  });

  it('con el último episodio de una serie que terminó, ofrece la reseña', async () => {
    const user = userEvent.setup();
    renderRow([chernobyl()]);

    await user.click(
      screen.getByRole('button', { name: 'Marcar T1E5 de Chernobyl como visto' }),
    );

    expect(await screen.findByRole('heading', { name: 'Completaste' })).toBeInTheDocument();
    // La reseña es una oferta: el estado no cambia hasta guardarla.
    expect(useMediaStore.getState().mediaList[0].status).toBe('viendo');
  });

  it('con el último de una serie que sigue saliendo, avisa que está al día', async () => {
    const user = userEvent.setup();
    renderRow([chernobyl({ seriesStatus: 'Returning Series' })]);

    await user.click(
      screen.getByRole('button', { name: 'Marcar T1E5 de Chernobyl como visto' }),
    );

    expect(await screen.findByText(/estás al día/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Completaste' })).toBeNull();
  });
});
