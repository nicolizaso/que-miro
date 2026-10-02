import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Collection, SavedMedia, TMDbDetail } from '@/types';

/** Sin sesión: la biblioteca es el store local, que es lo que miran los tests. */
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, authState: 'guest' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: false,
  isPushConfigured: false,
  isMissingDatabaseError: () => false,
}));

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

const detail: TMDbDetail = {
  id: 42,
  media_type: 'tv',
  name: 'Severance',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  first_air_date: '2022-02-18',
  genres: [{ id: 1, name: 'Drama' }],
  overview: 'Trabajo y vida, partidos al medio.',
  episode_run_time: [50],
  number_of_episodes: 18,
  seasons: [{ season_number: 1, name: 'Temporada 1', episode_count: 9 }],
};

const getMediaDetail = vi.fn(async () => detail);

vi.mock('@/lib/tmdb', () => ({
  getMediaDetail: (...args: unknown[]) => getMediaDetail(...(args as [])),
  // Sin los episodios, la temporada queda en su grilla de números.
  getSeason: async () => {
    throw new Error('sin red');
  },
  currentLanguage: () => 'es-ES',
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
  TMDB_LOGO_URL: 'https://image.tmdb.org/t/p/w92',
  TMDB_IMAGE_ORIGINAL_URL: 'https://image.tmdb.org/t/p/original',
  TMDB_STILL_URL: 'https://image.tmdb.org/t/p/w300',
}));

const { TitleDetailModal } = await import('@/components/TitleDetailModal');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { usePreferences } = await import('@/preferences');

function makeCollection(name: string): Collection {
  return {
    id: `col-${name}`,
    name,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

/** La ficha tal como la abre Explorar: un título que no está guardado. */
async function renderExploreDetail() {
  render(
    <ToastProvider>
      <TitleDetailModal id={42} mediaType="tv" isOpen onClose={() => {}} />
    </ToastProvider>,
  );
  // El primer render dispara el pedido de la ficha: sin esperarlo, lo que se ve
  // es el esqueleto y no los botones.
  await screen.findByRole('heading', { name: 'Sinopsis' });
}

beforeEach(() => {
  getMediaDetail.mockClear();
  act(() => useMediaStore.getState().reset());
});

afterEach(() => {
  act(() => useMediaStore.getState().reset());
});

describe('TitleDetailModal, sobre un título que no está en la biblioteca', () => {
  it('lo guarda en Por Ver de un clic', async () => {
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Agregar "Severance" a Por Ver' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList).toHaveLength(1),
    );
    const [saved] = useMediaStore.getState().mediaList;
    expect(saved).toMatchObject({
      tmdbId: 42,
      title: 'Severance',
      status: 'por_ver',
      releaseYear: '2022',
      genres: ['Drama'],
    });
    // La ficha ya estaba en pantalla: el título entra completo, sin esperar a
    // que alguien lo vuelva a abrir.
    expect(saved.seasons).toHaveLength(1);
    expect(saved.runtime).toBe(50);
  });

  it('lo guarda en Completadas de un clic y pide la reseña', async () => {
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Marcar "Severance" como completada' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.status).toBe('completada'),
    );
    expect(
      await screen.findByRole('heading', { name: 'Completaste' }),
    ).toBeInTheDocument();
  });

  it('la reseña es opcional: cerrarla deja el título en Completadas', async () => {
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Marcar "Severance" como completada' }));
    await screen.findByRole('heading', { name: 'Completaste' });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Completaste' }),
      ).not.toBeInTheDocument(),
    );
    const [saved] = useMediaStore.getState().mediaList;
    expect(saved.status).toBe('completada');
    expect(saved.history ?? []).toHaveLength(0);
  });

  it('la reseña que se escribe ahí queda guardada en el título', async () => {
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Marcar "Severance" como completada' }));
    await screen.findByRole('heading', { name: 'Completaste' });
    await user.click(screen.getByLabelText('5 de 5 estrellas'));
    await user.click(screen.getByRole('button', { name: 'Guardar Reseña' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.history).toHaveLength(1),
    );
    expect(useMediaStore.getState().mediaList[0]?.history?.[0].rating).toBe(5);
  });

  it('guardarlo en Por Ver no pide ninguna reseña', async () => {
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Agregar "Severance" a Por Ver' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList).toHaveLength(1),
    );
    expect(screen.queryByRole('heading', { name: 'Completaste' })).not.toBeInTheDocument();
  });

  it('sumarlo a una lista propia lo guarda adentro de esa lista', async () => {
    act(() => {
      useMediaStore.setState({ collections: [makeCollection('Maratón')] });
    });
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Maratón' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList).toHaveLength(1),
    );
    const [saved] = useMediaStore.getState().mediaList;
    expect(saved.collections).toEqual(['col-Maratón']);
    // Entra en Por Ver: es lo que anuncia la ayuda de la sección.
    expect(saved.status).toBe('por_ver');
  });

  it('no lo guarda dos veces al elegir una lista después de un estado', async () => {
    act(() => {
      useMediaStore.setState({ collections: [makeCollection('Maratón')] });
    });
    const user = userEvent.setup();
    await renderExploreDetail();

    await user.click(screen.getByRole('button', { name: 'Agregar "Severance" a Por Ver' }));
    await screen.findByText(/Ya está en tu biblioteca, en/);
    await user.click(screen.getByRole('button', { name: 'Maratón' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.collections).toEqual([
        'col-Maratón',
      ]),
    );
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
  });
});

describe('TitleDetailModal, el orden de la ficha', () => {
  /** La fila del reparto mide su ancho con un observador que jsdom no trae. */
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    getMediaDetail.mockImplementation(async () => detail);
    vi.unstubAllGlobals();
  });

  /** Si `first` aparece antes que `second` en la página. */
  function isBefore(first: Element, second: Element) {
    return Boolean(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }

  it('arranca por la sinopsis, sigue con el reparto y después el tráiler', async () => {
    getMediaDetail.mockImplementation(async () => ({
      ...detail,
      credits: { cast: [{ id: 525, name: 'Adam Scott', character: 'Mark S.', profile_path: null }] },
      videos: { results: [{ type: 'Trailer', site: 'YouTube', key: 'abc' }] },
    }));

    render(
      <MemoryRouter>
        <ToastProvider>
          <TitleDetailModal id={42} mediaType="tv" isOpen onClose={() => {}} />
        </ToastProvider>
      </MemoryRouter>,
    );

    const synopsis = await screen.findByRole('heading', { name: 'Sinopsis' });
    const cast = screen.getByRole('heading', { name: 'Reparto Principal' });
    const trailer = screen.getByRole('link', { name: /Ver Tráiler/ });
    const collections = screen.getByRole('heading', { name: 'Mis listas' });

    expect(isBefore(synopsis, cast)).toBe(true);
    expect(isBefore(cast, trailer)).toBe(true);
    expect(isBefore(trailer, collections)).toBe(true);
  });

  it('los atajos van en la línea de la sinopsis, solo con ícono', async () => {
    await renderExploreDetail();

    const row = screen.getByRole('heading', { name: 'Sinopsis' }).parentElement!;
    for (const name of ['Agregar "Severance" a Por Ver', 'Marcar "Severance" como completada']) {
      const button = within(row).getByRole('button', { name });
      expect(button.textContent).toBe('');
    }
    // Sin el título guardado, "Tu biblioteca" no tendría nada adentro.
    expect(screen.queryByRole('heading', { name: 'Tu biblioteca' })).not.toBeInTheDocument();
  });
});

describe('TitleDetailModal, sobre un título que ya está en la biblioteca', () => {
  const saved: SavedMedia = {
    tmdbId: 42,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseYear: '2022',
    genres: ['Drama'],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  function renderSavedDetail(media: SavedMedia) {
    act(() => useMediaStore.setState({ mediaList: [media] }));
    render(
      <ToastProvider>
        <TitleDetailModal id={42} mediaType="tv" media={media} isOpen onClose={() => {}} />
      </ToastProvider>,
    );
  }

  it('muestra los mismos indicadores que el buscador, y no ofrece agregarlo de nuevo', async () => {
    renderSavedDetail(saved);

    const row = (await screen.findByRole('heading', { name: 'Sinopsis' })).parentElement!;
    expect(within(row).getByText('Ya está en tu biblioteca')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Agregar "Severance" a Por Ver' }),
    ).not.toBeInTheDocument();
  });

  it('el tilde lo pasa a Completadas sin escribirlo de cero', async () => {
    const user = userEvent.setup();
    renderSavedDetail({ ...saved, collections: ['col-Maratón'] });

    await screen.findByRole('heading', { name: 'Sinopsis' });
    await user.click(screen.getByRole('button', { name: 'Marcar "Severance" como completada' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.status).toBe('completada'),
    );
    expect(useMediaStore.getState().mediaList[0]?.collections).toEqual(['col-Maratón']);
  });

  it('una completada muestra el tilde como indicador', async () => {
    renderSavedDetail({ ...saved, status: 'completada' });

    const row = (await screen.findByRole('heading', { name: 'Sinopsis' })).parentElement!;
    expect(within(row).getByText('Ya está en Completadas')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Marcar "Severance" como completada' }),
    ).not.toBeInTheDocument();
  });
});

describe('TitleDetailModal, las plataformas', () => {
  it('ofrece la página de TMDB con dónde verlo y le atribuye los datos a JustWatch', async () => {
    const link = 'https://www.themoviedb.org/tv/95396-severance/watch?locale=AR';
    // jsdom anuncia `en-US`: sin fijarla, la región detectada sería otra.
    act(() => usePreferences.setState({ region: 'AR' }));
    getMediaDetail.mockResolvedValueOnce({
      ...detail,
      'watch/providers': {
        results: {
          AR: {
            link,
            flatrate: [{ provider_name: 'Apple TV+', logo_path: '/apple.jpg' }],
          },
        },
      },
    });

    await renderExploreDetail();

    const whereToWatch = await screen.findByRole('link', { name: /Ver dónde verlo/ });
    expect(whereToWatch).toHaveAttribute('href', link);
    expect(whereToWatch).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Datos de plataformas/)).toHaveTextContent('JustWatch');
  });
});

describe('TitleDetailModal, el reparto', () => {
  it('cada persona lleva a su página, y la ficha se cierra al irse', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    // El reparto va en una fila deslizable, que mide su ancho con un
    // observador que jsdom no trae.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    getMediaDetail.mockImplementation(async () => ({
      ...detail,
      credits: { cast: [{ id: 525, name: 'Adam Scott', character: 'Mark S.', profile_path: null }] },
    }));

    try {
      render(
        <MemoryRouter initialEntries={['/explorar']}>
          <ToastProvider>
            <Routes>
              <Route
                path="/explorar"
                element={<TitleDetailModal id={42} mediaType="tv" isOpen onClose={onClose} />}
              />
              <Route path="/persona/:id" element={<p>La página de la persona</p>} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>,
      );

      const link = await screen.findByRole('link', { name: 'Adam Scott' });
      expect(link).toHaveAttribute('href', '/persona/525');

      await user.click(link);
      expect(onClose).toHaveBeenCalled();
      expect(await screen.findByText('La página de la persona')).toBeInTheDocument();
    } finally {
      getMediaDetail.mockImplementation(async () => detail);
      vi.unstubAllGlobals();
    }
  });
});
