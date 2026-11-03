import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
  TMDB_STILL_LARGE_URL: 'https://image.tmdb.org/t/p/w780',
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

    await user.click(screen.getByRole('button', { name: 'Listas' }));
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
    await screen.findByRole('button', { name: /En tu biblioteca: Por Ver/ });
    await user.click(screen.getByRole('button', { name: 'Listas' }));
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

  it('las acciones van debajo de la imagen, y después la sinopsis y el reparto', async () => {
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
    const name = screen.getByRole('heading', { level: 2, name: 'Severance' });
    const trailer = screen.getByRole('link', { name: /Tráiler/ });
    const share = screen.getByRole('button', { name: 'Compartir' });
    const cast = screen.getByRole('heading', { name: 'Reparto' });

    // El tráiler va chico, sobre la imagen, junto al nombre.
    expect(name.closest('.relative')).toContainElement(trailer);
    expect(isBefore(share, synopsis)).toBe(true);
    expect(isBefore(synopsis, cast)).toBe(true);
  });

  it('los atajos van en la fila de acciones, solo con ícono', async () => {
    await renderExploreDetail();

    for (const name of ['Agregar "Severance" a Por Ver', 'Marcar "Severance" como completada']) {
      const button = screen.getByRole('button', { name });
      expect(button.textContent).toBe('');
      expect(isBefore(button, screen.getByRole('heading', { name: 'Sinopsis' }))).toBe(true);
    }
  });

  it('una serie que estás viendo arranca por tu progreso', async () => {
    const watching: SavedMedia = {
      tmdbId: 42,
      mediaType: 'tv',
      title: 'Severance',
      posterPath: null,
      backdropPath: null,
      releaseYear: '2022',
      genres: ['Drama'],
      status: 'viendo',
      updatedAt: '2024-01-01T00:00:00.000Z',
      seasons: [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 }],
      progress: { watched: { 1: [1] } },
    };
    act(() => useMediaStore.setState({ mediaList: [watching] }));
    render(
      <ToastProvider>
        <TitleDetailModal id={42} mediaType="tv" media={watching} isOpen onClose={() => {}} />
      </ToastProvider>,
    );

    const synopsis = await screen.findByRole('heading', { name: 'Sinopsis' });
    const progress = screen.getByRole('heading', { name: 'Tu progreso' });
    expect(isBefore(progress, synopsis)).toBe(true);
  });

  it('una que todavía no empezaste arranca por la sinopsis', async () => {
    const pending: SavedMedia = {
      tmdbId: 42,
      mediaType: 'tv',
      title: 'Severance',
      posterPath: null,
      backdropPath: null,
      releaseYear: '2022',
      genres: ['Drama'],
      status: 'por_ver',
      updatedAt: '2024-01-01T00:00:00.000Z',
      seasons: [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 }],
    };
    act(() => useMediaStore.setState({ mediaList: [pending] }));
    render(
      <ToastProvider>
        <TitleDetailModal id={42} mediaType="tv" media={pending} isOpen onClose={() => {}} />
      </ToastProvider>,
    );

    const synopsis = await screen.findByRole('heading', { name: 'Sinopsis' });
    const progress = screen.getByRole('heading', { name: 'Tu progreso' });
    expect(isBefore(synopsis, progress)).toBe(true);
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

  it('dice en qué lista está, y no ofrece agregarlo de nuevo', async () => {
    renderSavedDetail(saved);

    expect(
      await screen.findByRole('button', { name: /En tu biblioteca: Por Ver/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agregar "Severance" a Por Ver' }),
    ).not.toBeInTheDocument();
    // Ya no hay frase que lo repita ni ícono que lo repita otra vez.
    expect(screen.queryByText(/Ya está en tu biblioteca/)).not.toBeInTheDocument();
  });

  it('pausar y abandonar quedan adentro de la píldora del estado', async () => {
    const user = userEvent.setup();
    // Con actividad reciente: una que hace rato no avanza abre con el panel
    // desplegado, para sugerir la pausa.
    renderSavedDetail({ ...saved, status: 'viendo', updatedAt: new Date().toISOString() });

    const status = await screen.findByRole('button', { name: /En tu biblioteca: Viendo/ });
    expect(screen.queryByRole('button', { name: /Poner en pausa/ })).not.toBeInTheDocument();

    await user.click(status);

    expect(status).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Poner en pausa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abandonar/ })).toBeInTheDocument();
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

  it('una que hace rato no avanza abre con la pausa a la vista', async () => {
    renderSavedDetail({ ...saved, status: 'viendo' });

    expect(
      await screen.findByRole('button', { name: /En tu biblioteca: Viendo/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/que no avanzás/)).toBeInTheDocument();
  });

  it('una completada no ofrece completarla de nuevo', async () => {
    renderSavedDetail({ ...saved, status: 'completada' });

    expect(await screen.findByText('Completada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Marcar "Severance" como completada' }),
    ).not.toBeInTheDocument();
  });
});

describe('TitleDetailModal, el puntaje de TMDB', () => {
  afterEach(() => {
    getMediaDetail.mockImplementation(async () => detail);
  });

  it('va al lado del nombre', async () => {
    getMediaDetail.mockImplementation(async () => ({
      ...detail,
      vote_average: 8.37,
      vote_count: 2500,
    }));
    await renderExploreDetail();

    const heading = screen.getByRole('heading', { level: 2, name: 'Severance' });
    const score = screen.getByText('Puntaje en TMDB: 8,4 de 10');
    expect(heading.parentElement).toContainElement(score);
  });

  it('con pocos votos no aparece', async () => {
    getMediaDetail.mockImplementation(async () => ({
      ...detail,
      vote_average: 10,
      vote_count: 3,
    }));
    await renderExploreDetail();

    expect(screen.queryByText(/Puntaje en TMDB/)).not.toBeInTheDocument();
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

  it('sin plataformas no muestra la sección, ni una fila que lo explique', async () => {
    await renderExploreDetail();

    expect(screen.queryByRole('heading', { name: /Dónde ver/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No encontramos plataformas/)).not.toBeInTheDocument();
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
