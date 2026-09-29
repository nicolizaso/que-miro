import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Collection, TMDbDetail } from '@/types';

/** Sin sesión: la biblioteca es el store local, que es lo que miran los tests. */
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, authState: 'guest' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: false,
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
  await screen.findByRole('heading', { name: 'Tu biblioteca' });
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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Por Ver' }));

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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Completada' }));

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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Completada' }));
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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Completada' }));
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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Por Ver' }));

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

    await user.click(screen.getByRole('button', { name: 'Guardar "Severance" en Por Ver' }));
    await screen.findByText(/Ya está en tu biblioteca/);
    await user.click(screen.getByRole('button', { name: 'Maratón' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.collections).toEqual([
        'col-Maratón',
      ]),
    );
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
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
