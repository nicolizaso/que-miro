import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { SavedMedia, TMDbDetail } from '@/types';

const auth = { user: null as null | { uid: string }, authState: 'guest' };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: false,
}));

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

const getMediaDetail = vi.fn(
  async (id: number): Promise<TMDbDetail> =>
    ({
      id,
      name: `Serie ${id}`,
      first_air_date: '2020-01-01',
      poster_path: null,
      backdrop_path: null,
      overview: '',
      genres: [],
      status: 'Returning Series',
      seasons: [
        { season_number: 1, name: 'Temporada 1', episode_count: 8 },
        { season_number: 2, name: 'Temporada 2', episode_count: 10 },
      ],
      number_of_episodes: 18,
    }) as unknown as TMDbDetail,
);

vi.mock('@/lib/tmdb', () => ({
  getMediaDetail: (id: number) => getMediaDetail(id),
}));

const { useBackgroundRefresh, resetBackgroundRefresh, REFRESH_START_DELAY_MS } =
  await import('./useBackgroundRefresh');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { usePreferences } = await import('@/preferences');
const { REFRESH_PER_VISIT } = await import('@/lib/refresh');

function series(tmdbId: number, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'tv',
    title: `Serie ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'completada',
    updatedAt: '2024-01-01T00:00:00.000Z',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 8 }],
    ...overrides,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

/** Deja correr el temporizador de arranque y todas las promesas encadenadas. */
async function runRefresh() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REFRESH_START_DELAY_MS + 10);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetBackgroundRefresh();
  getMediaDetail.mockClear();
  auth.user = null;
  auth.authState = 'guest';
  usePreferences.setState({ region: 'AR' });
  act(() => useMediaStore.getState().reset());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBackgroundRefresh', () => {
  it('refresca lo vencido, lo que estás viendo primero, sin tocar el progreso', async () => {
    act(() =>
      useMediaStore.getState().setMediaList([
        series(1, { status: 'por_ver' }),
        series(2, { status: 'viendo', progress: { watched: { 1: [1, 2, 3] } } }),
      ]),
    );

    renderHook(() => useBackgroundRefresh(), { wrapper });
    // Antes del arranque no se pide nada: lo primero es lo que se ve.
    expect(getMediaDetail).not.toHaveBeenCalled();

    await runRefresh();

    expect(getMediaDetail.mock.calls.map(([id]) => id)).toEqual([2, 1]);
    const viendo = useMediaStore.getState().mediaList.find((m) => m.tmdbId === 2)!;
    expect(viendo.seasons).toHaveLength(2);
    expect(viendo.seriesStatus).toBe('Returning Series');
    expect(viendo.enrichedAt).toBeDefined();
    expect(viendo.progress?.watched[1]).toEqual([1, 2, 3]);
    // Un refresco no es algo que hizo la persona: no la mueve en la lista.
    expect(viendo.updatedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('respeta el tope por visita', async () => {
    act(() =>
      useMediaStore
        .getState()
        .setMediaList(
          Array.from({ length: REFRESH_PER_VISIT + 3 }, (_, index) => series(index + 1)),
        ),
    );

    renderHook(() => useBackgroundRefresh(), { wrapper });
    await runRefresh();

    expect(getMediaDetail).toHaveBeenCalledTimes(REFRESH_PER_VISIT);
  });

  it('corre una sola vez por visita', async () => {
    act(() => useMediaStore.getState().setMediaList([series(1)]));

    const first = renderHook(() => useBackgroundRefresh(), { wrapper });
    await runRefresh();
    first.unmount();

    // Otro título que venció mientras tanto: la próxima visita lo toma.
    act(() => useMediaStore.getState().setMediaList([series(2)]));
    renderHook(() => useBackgroundRefresh(), { wrapper });
    await runRefresh();

    expect(getMediaDetail).toHaveBeenCalledTimes(1);
  });

  it('en el demo no refresca: su biblioteca ya viene completa', async () => {
    auth.authState = 'demo';
    act(() => useMediaStore.getState().setMediaList([series(1)]));

    renderHook(() => useBackgroundRefresh(), { wrapper });
    await runRefresh();

    expect(getMediaDetail).not.toHaveBeenCalled();
  });

  it('si TMDB falla, deja el resto para la próxima visita', async () => {
    getMediaDetail.mockRejectedValueOnce(new Error('sin red'));
    act(() => useMediaStore.getState().setMediaList([series(1), series(2)]));

    renderHook(() => useBackgroundRefresh(), { wrapper });
    await runRefresh();

    expect(getMediaDetail).toHaveBeenCalledTimes(1);
  });
});
