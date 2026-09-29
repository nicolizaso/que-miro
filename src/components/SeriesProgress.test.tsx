import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia, TMDbSeason } from '@/types';

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

/** Hoy, para el componente: lo de ayer salió, lo de dentro de un mes no. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const season: TMDbSeason = {
  season_number: 1,
  name: 'Temporada 1',
  episodes: [
    {
      episode_number: 1,
      name: 'Bienvenidos a Lumon',
      overview: 'Mark tiene una compañera nueva.',
      air_date: dayOffset(-30),
      runtime: 57,
      still_path: '/e1.jpg',
      vote_average: 8.1,
      episode_type: 'standard',
    },
    {
      episode_number: 2,
      name: 'Media Loop',
      overview: 'Helly intenta renunciar.',
      air_date: dayOffset(-23),
      runtime: 53,
      still_path: '/e2.jpg',
      vote_average: 7.9,
      episode_type: 'standard',
    },
    {
      episode_number: 3,
      name: 'Lo que viene',
      overview: 'Algo que todavía no pasó.',
      air_date: dayOffset(30),
      runtime: null,
      still_path: null,
      vote_average: 0,
      episode_type: 'finale',
    },
  ],
};

const getSeason = vi.fn(async (): Promise<TMDbSeason> => season);

vi.mock('@/lib/tmdb', () => ({
  getSeason: () => getSeason(),
  currentLanguage: () => 'es-ES',
  TMDB_STILL_URL: 'https://image.tmdb.org/t/p/w300',
}));

const { SeriesProgress } = await import('@/components/SeriesProgress');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { clearSeasonCache } = await import('@/hooks/useSeasonDetail');

function severance(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2024-01-01T00:00:00.000Z',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 3 }],
    progress: { watched: { 1: [1] } },
    ...overrides,
  };
}

function renderProgress(media: SavedMedia) {
  act(() => useMediaStore.getState().setMediaList([media]));
  return render(
    <ToastProvider>
      <SeriesProgress media={media} seasons={media.seasons!} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  clearSeasonCache();
  getSeason.mockClear();
  act(() => useMediaStore.getState().reset());
});

afterEach(() => {
  act(() => useMediaStore.getState().reset());
});

describe('SeriesProgress, con los episodios de la temporada', () => {
  it('muestra cada episodio con su nombre, su fecha y su duración', async () => {
    renderProgress(severance());

    expect(await screen.findByText('Bienvenidos a Lumon')).toBeInTheDocument();
    expect(screen.getByText(/57 min/)).toBeInTheDocument();
    expect(screen.getByText('Final de temporada')).toBeInTheDocument();
  });

  it('lo que todavía no salió está deshabilitado, con su fecha', async () => {
    renderProgress(severance());

    const future = await screen.findByRole('button', { name: 'Episodio 3 de Temporada 1' });
    expect(future).toBeDisabled();
    expect(screen.getByText(/^Sale el /)).toBeInTheDocument();
  });

  it('esconde la sinopsis de lo que no viste hasta que se pide', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    // El visto la muestra; el que falta, no.
    expect(await screen.findByText('Mark tiene una compañera nueva.')).toBeInTheDocument();
    expect(screen.queryByText('Helly intenta renunciar.')).not.toBeInTheDocument();

    const episode2 = screen.getByText('Media Loop').closest('li')!;
    await user.click(within(episode2).getByRole('button', { name: /Mostrar sinopsis/ }));

    expect(screen.getByText('Helly intenta renunciar.')).toBeInTheDocument();
  });

  it('marcar un episodio de la lista guarda el progreso', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    await user.click(
      await screen.findByRole('button', { name: 'Episodio 2 de Temporada 1' }),
    );

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2]),
    );
  });

  it('anota la duración de la temporada cuando todos los episodios la traen', async () => {
    getSeason.mockResolvedValueOnce({
      ...season,
      episodes: season.episodes.map((episode) => ({ ...episode, runtime: 50 })),
    });
    renderProgress(severance());

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].seasons?.[0].totalRuntime).toBe(150),
    );
    // Es un dato de TMDB, no algo que hizo la persona: no mueve el título.
    expect(useMediaStore.getState().mediaList[0].updatedAt).toBe(
      '2024-01-01T00:00:00.000Z',
    );
  });

  it('sin los episodios queda la grilla de números, que alcanza para marcar', async () => {
    getSeason.mockRejectedValueOnce(new Error('sin red'));
    const user = userEvent.setup();
    renderProgress(severance());

    const third = await screen.findByRole('button', { name: 'Episodio 3 de Temporada 1' });
    // En la grilla no se sabe qué salió: se puede marcar todo.
    expect(third).toBeEnabled();
    expect(screen.queryByText('Bienvenidos a Lumon')).not.toBeInTheDocument();

    await user.click(third);
    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 3]),
    );
  });
});

describe('los puntajes por episodio', () => {
  it('se puntúa un episodio visto desde su fila, y solo los vistos', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    const rate = await screen.findByRole('button', { name: 'Puntuar Bienvenidos a Lumon' });
    expect(screen.queryByRole('button', { name: 'Puntuar Media Loop' })).not.toBeInTheDocument();

    await user.click(rate);
    await user.click(screen.getByLabelText('4,5 de 5 estrellas'));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.episodeRatings).toEqual({
        '1x1': 4.5,
      }),
    );
  });

  it('muestra tu mejor episodio y tu peor, con sus nombres', async () => {
    renderProgress(
      severance({
        progress: { watched: { 1: [1, 2] }, episodeRatings: { '1x1': 5, '1x2': 2 } },
      }),
    );

    const best = (await screen.findByText('Tu mejor episodio')).parentElement!;
    const worst = screen.getByText('Tu peor').parentElement!;
    expect(await within(best).findByText(/Bienvenidos a Lumon/)).toBeInTheDocument();
    expect(within(worst).getByText(/Media Loop/)).toBeInTheDocument();
  });
});
