import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia, TMDbResult } from '@/types';

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

/**
 * jsdom no trae observadores.
 *
 * Los usan la fila horizontal (para saber si hay adónde scrollear) y el
 * centinela del final del feed. Con el de intersección apagado, la tanda
 * siguiente se pide con el botón, que es justamente el camino que este test
 * recorre.
 */
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ObserverStub);
vi.stubGlobal('IntersectionObserver', ObserverStub);

/** Un resultado cualquiera de TMDB, con póster para que la tarjeta se dibuje. */
function makeResult(id: number): TMDbResult {
  return {
    id,
    media_type: 'movie',
    title: `Título ${id}`,
    poster_path: `/${id}.jpg`,
    backdrop_path: null,
    release_date: '2020-01-01',
    genre_ids: [],
    overview: '',
  };
}

/**
 * Cada fila recibe seis títulos, de los cuales tres ya se los dieron a la
 * anterior.
 *
 * El solapamiento es a propósito: es lo que pasa de verdad —dos recetas
 * distintas llegan a la misma película— y lo que tiene que resolver el reparto
 * de títulos entre filas.
 */
let call = 0;

const remote = vi.fn(async () => {
  const first = call++ * 3;
  return [0, 1, 2, 3, 4, 5].map((offset) => makeResult(first + offset));
});

vi.mock('@/lib/tmdb', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tmdb')>('@/lib/tmdb');
  return {
    ...actual,
    getTrending: () => remote(),
    getList: () => remote(),
    getDiscover: () => remote(),
    getRecommendations: () => remote(),
    getSimilar: () => remote(),
    getPersonCredits: () => remote(),
    getSaga: () => remote(),
    getMediaDetail: vi.fn(async () => {
      throw new Error('no hace falta en este test');
    }),
  };
});

const { MemoryRouter } = await import('react-router-dom');
const { ExploreView } = await import('@/views/ExploreView');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { emptyPicks } = await import('@/lib/picks');

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 900,
    mediaType: 'movie',
    title: 'Duna',
    posterPath: '/duna.jpg',
    backdropPath: null,
    releaseYear: '2021',
    genres: ['Ciencia Ficción'],
    status: 'completada',
    updatedAt: '2026-01-01T00:00:00.000Z',
    people: [
      { id: 100, name: 'Denis Villeneuve', role: 'direccion', profilePath: null },
      { id: 200, name: 'Zendaya', role: 'reparto', profilePath: null },
    ],
    history: [
      { id: 'w1', rating: 5, completedAt: '2026-01-01T00:00:00.000Z' },
    ],
    ...overrides,
  };
}

async function renderExplore() {
  // Con router: la vista enlaza a "Contanos de vos" cuando el cuestionario
  // está sin contestar, y un `Link` sin router alrededor no se puede dibujar.
  render(
    <MemoryRouter>
      <ToastProvider>
        <ExploreView />
      </ToastProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(remote).toHaveBeenCalled());
}

/**
 * Pide todas las tandas que queden.
 *
 * El orden del feed se baraja con una semilla nueva en cada visita, así que una
 * fila puede caer en la primera tanda o en la tercera. Un test que busca una
 * fila concreta tiene que bajar hasta el final, o pasa unas veces sí y otras no.
 */
async function loadAllRows() {
  for (let guard = 0; guard < 12; guard++) {
    const button = screen.queryByRole('button', { name: 'Cargar más filas' });
    if (!button) return;
    await userEvent.click(button);
  }
}

/** Los títulos de las filas dibujadas, en orden. */
function rowTitles(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '');
}

describe('ExploreView', () => {
  beforeEach(() => {
    call = 0;
    remote.mockClear();
    act(() => {
      useMediaStore.getState().reset();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con la biblioteca vacía muestra igual las filas de todos', async () => {
    await renderExplore();

    await waitFor(() => expect(rowTitles().length).toBeGreaterThan(0));
    expect(
      screen.getByText(/Puntuá lo que ya viste y esta pestaña se rearma sola/),
    ).toBeInTheDocument();
  });

  it('arma filas con el director y el reparto de lo que puntuaste alto', async () => {
    act(() => {
      useMediaStore.getState().setMediaList([makeMedia()]);
    });

    await renderExplore();
    // Hasta el final del feed: con una biblioteca así hay más filas que tanda,
    // y cuál entra primero lo decide la semilla de esta visita.
    await loadAllRows();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Otros trabajos de Denis Villeneuve' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: 'Si te gustó Zendaya' }),
    ).toBeInTheDocument();

    // Las filas que hablan de alguien llevan a su página.
    expect(
      screen.getByRole('link', { name: 'Otros trabajos de Denis Villeneuve' }),
    ).toHaveAttribute('href', '/persona/100');
    expect(screen.getByRole('link', { name: 'Si te gustó Zendaya' })).toHaveAttribute(
      'href',
      '/persona/200',
    );
  });

  it('no repite el mismo título en dos filas', async () => {
    act(() => {
      useMediaStore.getState().setMediaList([makeMedia()]);
    });

    await renderExplore();
    await waitFor(() => expect(rowTitles().length).toBeGreaterThan(1));

    const shown = screen
      .getAllByRole('button', { name: /Ver detalle de/ })
      .map((button) => button.textContent);

    expect(new Set(shown).size).toBe(shown.length);
  });

  it('carga más filas al pedirlas', async () => {
    act(() => {
      useMediaStore.getState().setMediaList([makeMedia()]);
    });

    await renderExplore();
    await waitFor(() => expect(rowTitles().length).toBeGreaterThan(0));

    const before = rowTitles().length;
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más filas' }));

    await waitFor(() => expect(rowTitles().length).toBeGreaterThan(before));
  });

  it('arma filas con lo que contestaste en "Contanos de vos"', async () => {
    // Sin un solo título en la biblioteca: es el caso que el cuestionario viene
    // a resolver, el del primer día.
    act(() => {
      useMediaStore.getState().setPicks({
        ...emptyPicks(),
        movie: {
          tmdbId: 105,
          mediaType: 'movie',
          title: 'Volver al futuro',
          posterPath: null,
          releaseYear: '1985',
        },
        updatedAt: new Date().toISOString(),
      });
    });

    await renderExplore();
    await loadAllRows();

    expect(
      await screen.findByRole('heading', {
        name: 'Si tu película favorita es Volver al futuro',
      }),
    ).toBeInTheDocument();
  });

  it('ofrece contestar el cuestionario solo mientras esté en blanco', async () => {
    await renderExplore();
    await waitFor(() => expect(rowTitles().length).toBeGreaterThan(0));
    expect(
      screen.getByRole('link', { name: /Contanos tus favoritos/ }),
    ).toBeInTheDocument();
  });

  it('avisa si TMDB no contesta nada', async () => {
    remote.mockRejectedValue(new Error('TMDB caído'));

    await renderExplore();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No pudimos conectarnos con TMDB/,
    );
  });
});
