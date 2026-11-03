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

const season2: TMDbSeason = {
  season_number: 2,
  name: 'Temporada 2',
  episodes: [
    {
      episode_number: 1,
      name: 'Hola, señora Cobel',
      overview: 'Mark vuelve a la oficina.',
      air_date: dayOffset(-10),
      runtime: 50,
      still_path: '/s2e1.jpg',
      vote_average: 8,
      episode_type: 'standard',
    },
    {
      episode_number: 2,
      name: 'Adiós, señora Selvig',
      overview: 'Afuera también pasan cosas.',
      air_date: dayOffset(-3),
      runtime: 48,
      still_path: '/s2e2.jpg',
      vote_average: 8.2,
      episode_type: 'finale',
    },
  ],
};

const getSeason = vi.fn(
  async (_id: number, seasonNumber: number): Promise<TMDbSeason> =>
    seasonNumber === 2 ? season2 : season,
);

vi.mock('@/lib/tmdb', () => ({
  getSeason: (id: number, seasonNumber: number) => getSeason(id, seasonNumber),
  currentLanguage: () => 'es-ES',
  TMDB_STILL_URL: 'https://image.tmdb.org/t/p/w300',
  TMDB_STILL_LARGE_URL: 'https://image.tmdb.org/t/p/w780',
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

/** La serie como la ve la ficha: desde el store, así cada marca se refleja. */
function LiveProgress({ tmdbId }: { tmdbId: number }) {
  const media = useMediaStore((state) =>
    state.mediaList.find((item) => item.tmdbId === tmdbId),
  );
  return media ? <SeriesProgress media={media} seasons={media.seasons!} /> : null;
}

function renderProgress(media: SavedMedia) {
  act(() => useMediaStore.getState().setMediaList([media]));
  return render(
    <ToastProvider>
      <LiveProgress tmdbId={media.tmdbId} />
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

/** El botón grande de la tarjeta de un episodio. */
function seenButton(episode: number, seasonName = 'Temporada 1') {
  return screen.findByRole('button', { name: `Lo vi: episodio ${episode} de ${seasonName}` });
}

describe('SeriesProgress, un episodio a la vez', () => {
  it('muestra cada episodio con su nombre, su fecha y su duración', async () => {
    renderProgress(severance());

    expect(await screen.findByText('Bienvenidos a Lumon')).toBeInTheDocument();
    expect(screen.getByText(/57 min/)).toBeInTheDocument();
    expect(screen.getByText('Final de temporada')).toBeInTheDocument();
  });

  it('abre en el episodio que te toca', async () => {
    renderProgress(severance());

    await screen.findByText('Bienvenidos a Lumon');
    expect(screen.getByText('Episodio 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir al episodio 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('lo que todavía no salió no se puede marcar, y dice cuándo sale', async () => {
    renderProgress(severance());

    expect(await seenButton(3)).toBeDisabled();
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

  it('"Lo vi" guarda el progreso', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    await user.click(await seenButton(2));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2]),
    );
  });

  it('marcar el primero de una serie en Por Ver la pasa a Viendo y lo avisa', async () => {
    const user = userEvent.setup();
    renderProgress(severance({ status: 'por_ver', progress: undefined }));

    await user.click(await seenButton(1));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].status).toBe('viendo'),
    );
    expect(await screen.findByText('"Severance" pasó a Viendo.')).toBeInTheDocument();
  });

  it('marcar uno más de una que ya estás viendo no avisa nada', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    await user.click(await seenButton(2));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2]),
    );
    expect(screen.queryByText(/pasó a/)).not.toBeInTheDocument();
  });

  it('la tira de números va arriba de la tarjeta, así no salta cuando la tarjeta cambia de alto', async () => {
    renderProgress(severance());

    await screen.findByText('Bienvenidos a Lumon');
    const strip = screen.getByRole('list', { name: 'Ir a un episodio' });
    const cards = screen.getByRole('list', { name: 'Episodios de Temporada 1' });
    expect(strip.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tocar un número lleva la tarjeta a ese episodio, sin marcarlo', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    await screen.findByText('Bienvenidos a Lumon');
    await user.click(screen.getByRole('button', { name: 'Ir al episodio 3' }));

    expect(screen.getByText('Episodio 3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir al episodio 3' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1]);
  });

  it('después de "Lo vi" ofrece puntuarlo y pasar al siguiente', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    await user.click(await seenButton(2));

    const card = screen.getByText('Media Loop').closest('li')!;
    expect(
      await within(card).findByRole('group', { name: 'Tu puntaje para Media Loop' }),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: /Siguiente: E3/ }));

    expect(screen.getByText('Episodio 3 de 3')).toBeInTheDocument();
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

  it('sin los episodios, las tarjetas muestran el número y se marcan igual', async () => {
    getSeason.mockRejectedValueOnce(new Error('sin red'));
    const user = userEvent.setup();
    renderProgress(severance());

    const third = await seenButton(3);
    // Sin los datos de TMDB no se sabe qué salió: se puede marcar todo.
    expect(third).toBeEnabled();
    expect(screen.queryByText('Bienvenidos a Lumon')).not.toBeInTheDocument();

    await user.click(third);
    await user.click(screen.getByRole('button', { name: 'Solo este' }));
    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 3]),
    );
  });

  it('desmarcar la temporada entera avisa y se puede deshacer', async () => {
    const user = userEvent.setup();
    renderProgress(severance({ progress: { watched: { 1: [1, 2, 3] } } }));

    await user.click(await screen.findByRole('button', { name: 'Desmarcar' }));
    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress).toBeUndefined(),
    );

    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2, 3]),
    );
    expect(useMediaStore.getState().mediaList[0].status).toBe('viendo');
  });
});

describe('marcar un episodio avanzado', () => {
  it('sin nada visto antes, pregunta por los anteriores y los marca todos', async () => {
    const user = userEvent.setup();
    renderProgress(severance({ status: 'por_ver', progress: undefined }));

    await user.click(await seenButton(2));
    expect(screen.getByText('¿Viste también el T1E1?')).toBeInTheDocument();
    // Hasta que se contesta, no se marca nada.
    expect(useMediaStore.getState().mediaList[0].progress).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Sí, marcarlos' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([1, 2]),
    );
    expect(screen.queryByText('¿Viste también el T1E1?')).not.toBeInTheDocument();
  });

  it('"Solo este" marca ese y deja los anteriores como estaban', async () => {
    const user = userEvent.setup();
    renderProgress(severance({ status: 'por_ver', progress: undefined }));

    await user.click(await seenButton(2));
    await user.click(screen.getByRole('button', { name: 'Solo este' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched[1]).toEqual([2]),
    );
  });

  it('"Cancelar" no marca nada y devuelve el foco a "Lo vi"', async () => {
    const user = userEvent.setup();
    renderProgress(severance({ status: 'por_ver', progress: undefined }));

    await user.click(await seenButton(2));
    // Mientras se pregunta, "Lo vi" se corre y el foco va a la respuesta.
    expect(screen.queryByRole('button', { name: /Lo vi: episodio 2/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, marcarlos' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await seenButton(2)).toHaveFocus();
    expect(useMediaStore.getState().mediaList[0].progress).toBeUndefined();
  });

  it('pregunta también por lo que falta de las temporadas anteriores', async () => {
    const user = userEvent.setup();
    renderProgress(
      severance({
        seasons: [
          { seasonNumber: 1, name: 'Temporada 1', episodeCount: 3 },
          { seasonNumber: 2, name: 'Temporada 2', episodeCount: 2 },
        ],
      }),
    );

    await user.click(await screen.findByRole('tab', { name: /Temporada 2/ }));
    expect(await screen.findByText('Hola, señora Cobel')).toBeInTheDocument();

    await user.click(await seenButton(1, 'Temporada 2'));
    expect(screen.getByText('¿Viste también del T1E2 al T1E3?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sí, marcarlos' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0].progress?.watched).toEqual({
        1: [1, 2, 3],
        2: [1],
      }),
    );
  });
});

describe('las temporadas', () => {
  it('se ve una por vez, y se cambia con las pastillas', async () => {
    const user = userEvent.setup();
    renderProgress(
      severance({
        seasons: [
          { seasonNumber: 1, name: 'Temporada 1', episodeCount: 3 },
          { seasonNumber: 2, name: 'Temporada 2', episodeCount: 2 },
        ],
      }),
    );

    expect(await screen.findByText('Bienvenidos a Lumon')).toBeInTheDocument();
    expect(screen.queryByText('Hola, señora Cobel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Temporada 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: /Temporada 2/ }));

    expect(await screen.findByText('Hola, señora Cobel')).toBeInTheDocument();
    expect(screen.queryByText('Bienvenidos a Lumon')).not.toBeInTheDocument();
  });

  it('con una sola temporada no hay pastillas', async () => {
    renderProgress(severance());

    await screen.findByText('Bienvenidos a Lumon');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('los puntajes por episodio', () => {
  it('se puntúa un episodio visto desde su tarjeta, y solo los vistos', async () => {
    const user = userEvent.setup();
    renderProgress(severance());

    expect(
      await screen.findByRole('group', { name: 'Tu puntaje para Bienvenidos a Lumon' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Tu puntaje para Media Loop' }),
    ).not.toBeInTheDocument();

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

    const best = await screen.findByText(/Tu mejor episodio/);
    const worst = screen.getByText(/Tu peor/);
    expect(await within(best).findByText(/Bienvenidos a Lumon/)).toBeInTheDocument();
    expect(within(worst).getByText(/Media Loop/)).toBeInTheDocument();
  });
});
