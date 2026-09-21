import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia, TMDbDetail, TMDbResult } from '@/types';

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

const result: TMDbResult = {
  id: 1399,
  media_type: 'tv',
  name: 'Juego de tronos',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  first_air_date: '2011-04-17',
  genre_ids: [10765],
  overview: 'Nueve familias por un trono.',
};

const detail: TMDbDetail = {
  id: 1399,
  media_type: 'tv',
  name: 'Juego de tronos',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  first_air_date: '2011-04-17',
  genres: [{ id: 10765, name: 'Sci-Fi & Fantasía' }],
  overview: 'Nueve familias por un trono.',
  episode_run_time: [60],
  number_of_episodes: 73,
  seasons: [{ season_number: 1, name: 'Temporada 1', episode_count: 10 }],
};

const searchMulti = vi.fn(async () => [result]);

vi.mock('@/lib/tmdb', () => ({
  searchMulti: (...args: unknown[]) => searchMulti(...(args as [])),
  getMediaDetail: async () => detail,
  getGenreNames: (ids: number[]) =>
    ids.map((id) => (id === 10765 ? 'Sci-Fi & Fantasía' : '')).filter(Boolean),
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
  TMDB_IMAGE_ORIGINAL_URL: 'https://image.tmdb.org/t/p/original',
}));

const { SearchModal } = await import('@/components/SearchModal');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

function savedThrones(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 1399,
    mediaType: 'tv',
    title: 'Juego de tronos',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    releaseYear: '2011',
    genres: ['Sci-Fi & Fantasía'],
    status: 'viendo',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Abre el buscador y escribe, hasta que el resultado está en pantalla. */
async function search(onClose = () => {}) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <SearchModal isOpen onClose={onClose} />
    </ToastProvider>,
  );

  await user.type(
    screen.getByLabelText('Buscar películas o series'),
    'juego de tronos',
  );
  // La búsqueda va con debounce: sin esperar al resultado, lo que hay en
  // pantalla es el esqueleto.
  await screen.findByRole('button', { name: 'Ver detalle de Juego de tronos' });

  return user;
}

beforeEach(() => {
  searchMulti.mockClear();
  act(() => useMediaStore.getState().reset());
});

afterEach(() => {
  act(() => useMediaStore.getState().reset());
});

describe('SearchModal', () => {
  it('abre la ficha del título al tocar el resultado', async () => {
    const user = await search();

    await user.click(
      screen.getByRole('button', { name: 'Ver detalle de Juego de tronos' }),
    );

    // La sección de la ficha, que el resultado de la búsqueda no tiene.
    expect(await screen.findByRole('heading', { name: 'Tu biblioteca' })).toBeInTheDocument();
    expect(await screen.findByText('Nueve familias por un trono.')).toBeInTheDocument();
    // Abrir la ficha no guarda nada.
    expect(useMediaStore.getState().mediaList).toHaveLength(0);
  });

  it('el + guarda el título en Por Ver', async () => {
    const onClose = vi.fn();
    const user = await search(onClose);

    await user.click(
      screen.getByRole('button', { name: 'Agregar "Juego de tronos" a Por Ver' }),
    );

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList).toHaveLength(1),
    );
    expect(useMediaStore.getState().mediaList[0]).toMatchObject({
      tmdbId: 1399,
      title: 'Juego de tronos',
      status: 'por_ver',
      releaseYear: '2011',
      genres: ['Sci-Fi & Fantasía'],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('el tilde guarda el título en Completadas y pide la reseña', async () => {
    const user = await search();

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar "Juego de tronos" como completada',
      }),
    );

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.status).toBe('completada'),
    );
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
    expect(
      await screen.findByRole('heading', { name: 'Completaste' }),
    ).toBeInTheDocument();
  });

  it('la reseña es opcional: cerrarla deja el título en Completadas', async () => {
    const user = await search();

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar "Juego de tronos" como completada',
      }),
    );
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
    // El buscador sigue abierto, con la fila ya marcada.
    expect(screen.getByText('Ya está en Completadas')).toBeInTheDocument();
  });

  it('la reseña que se escribe ahí queda guardada en el título', async () => {
    const user = await search();

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar "Juego de tronos" como completada',
      }),
    );
    await screen.findByRole('heading', { name: 'Completaste' });
    await user.click(screen.getByLabelText('4 de 5 estrellas'));
    await user.click(screen.getByRole('button', { name: 'Guardar Reseña' }));

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.history).toHaveLength(1),
    );
    const [saved] = useMediaStore.getState().mediaList;
    expect(saved.status).toBe('completada');
    expect(saved.history?.[0].rating).toBe(4);
  });

  it('sobre un título ya guardado, el tilde lo pasa a Completadas sin pisar lo suyo', async () => {
    // Un título con reseña previa: volver a guardarlo de cero la borraría.
    act(() => {
      useMediaStore.setState({
        mediaList: [
          savedThrones({
            history: [
              {
                id: 'w1',
                rating: 4,
                completedAt: '2024-02-02T00:00:00.000Z',
              },
            ],
          }),
        ],
      });
    });
    const user = await search();

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar "Juego de tronos" como completada',
      }),
    );

    await waitFor(() =>
      expect(useMediaStore.getState().mediaList[0]?.status).toBe('completada'),
    );
    const [saved] = useMediaStore.getState().mediaList;
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
    expect(saved.history).toHaveLength(1);
  });

  it('marca el resultado que ya está en la biblioteca', async () => {
    act(() => {
      useMediaStore.setState({ mediaList: [savedThrones({ status: 'completada' })] });
    });
    await search();

    expect(screen.getByText('Ya está en tu biblioteca')).toBeInTheDocument();
    expect(screen.getByText('Ya está en Completadas')).toBeInTheDocument();
    // Ya guardado, el + no tiene nada que agregar.
    expect(
      screen.queryByRole('button', { name: 'Agregar "Juego de tronos" a Por Ver' }),
    ).not.toBeInTheDocument();
  });
});
