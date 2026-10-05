import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia, TMDbResult } from '@/types';
import type { DiscoverPage, DiscoverParams } from '@/lib/tmdb';

/** Sin sesión: la biblioteca es el store local. */
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
 * jsdom no trae observadores. Con el de intersección apagado, la página
 * siguiente se pide con el botón, que es el camino que recorren estos tests.
 */
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ObserverStub);
vi.stubGlobal('IntersectionObserver', ObserverStub);

function makeResult(id: number, mediaType: 'movie' | 'tv' = 'movie'): TMDbResult {
  return {
    id,
    media_type: mediaType,
    title: mediaType === 'movie' ? `Película ${id}` : undefined,
    name: mediaType === 'tv' ? `Serie ${id}` : undefined,
    poster_path: `/${id}.jpg`,
    backdrop_path: null,
    release_date: '2020-01-01',
    genre_ids: [],
    overview: '',
  };
}

/**
 * Tres páginas de cuatro títulos, y la segunda repite uno de la primera: es
 * lo que pasa cuando la popularidad se mueve mientras se scrollea.
 */
async function threePages(params: DiscoverParams): Promise<DiscoverPage> {
  const page = params.page ?? 1;
  const first = (page - 1) * 4 + (page > 1 ? -1 : 0);
  return {
    results: [0, 1, 2, 3].map((offset) => makeResult(first + offset + 1, params.mediaType)),
    page,
    totalPages: 3,
  };
}

const discoverPage = vi.fn(threePages);

vi.mock('@/lib/tmdb', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tmdb')>('@/lib/tmdb');
  return {
    ...actual,
    getDiscoverPage: (params: DiscoverParams) => discoverPage(params),
    getRegionProviders: async () => [
      { id: 8, name: 'Netflix', logoPath: null, priority: 1 },
      { id: 337, name: 'Disney Plus', logoPath: null, priority: 2 },
      { id: 11, name: 'MUBI', logoPath: null, priority: 3 },
    ],
  };
});

const { MemoryRouter, useLocation } = await import('react-router-dom');
const { CatalogView } = await import('@/views/CatalogView');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { usePreferences } = await import('@/preferences');

/** La query string actual, para ver qué filtros quedaron en la URL. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderCatalog(search = '') {
  render(
    <MemoryRouter initialEntries={[`/explorar/catalogo${search}`]}>
      <ToastProvider>
        <CatalogView />
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function urlParams(): URLSearchParams {
  return new URLSearchParams(screen.getByTestId('search').textContent ?? '');
}

function lastParams(): DiscoverParams {
  return discoverPage.mock.calls.at(-1)![0];
}

function group(name: RegExp) {
  return screen.getByRole('group', { name });
}

function savedMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 2,
    mediaType: 'movie',
    title: 'Película 2',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CatalogView', () => {
  beforeEach(() => {
    // Cada test arranca con las tres páginas, aunque el anterior las haya
    // cambiado por otra respuesta.
    discoverPage.mockReset();
    discoverPage.mockImplementation(threePages);
    act(() => {
      useMediaStore.getState().reset();
      usePreferences.setState({ region: 'AR' });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('arranca con películas populares y suma páginas sin repetir títulos', async () => {
    renderCatalog();

    expect(await screen.findByText('Película 1')).toBeInTheDocument();
    expect(lastParams()).toEqual({ mediaType: 'movie', sort: 'popular', page: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(screen.getByText('Película 7')).toBeInTheDocument());
    expect(lastParams().page).toBe(2);
    // La 4 vino en las dos páginas y se dibuja una sola vez.
    expect(screen.getAllByText('Película 4')).toHaveLength(1);
  });

  it('con varios géneros pide cualquiera de ellos y los deja en la URL', async () => {
    renderCatalog();
    await screen.findByText('Película 1');

    const genres = group(/Filtrar por género/);
    await userEvent.click(within(genres).getByRole('button', { name: 'Acción' }));
    await userEvent.click(within(genres).getByRole('button', { name: 'Comedia' }));

    await waitFor(() =>
      expect(lastParams()).toMatchObject({ genres: [28, 35], genreMatch: 'any', page: 1 }),
    );
    expect(urlParams().get('genero')).toBe('Acción,Comedia');
  });

  it('el género elegido pasa adelante y se marca en rojo', async () => {
    renderCatalog();
    await screen.findByText('Película 1');

    const genres = group(/Filtrar por género/);
    await userEvent.click(within(genres).getByRole('button', { name: 'Terror' }));

    const pills = within(genres).getAllByRole('button');
    expect(pills[0]).toHaveTextContent('Todos');
    expect(pills[1]).toHaveTextContent('Terror');
    expect(pills[1]).toHaveAttribute('aria-pressed', 'true');
    expect(pills[1]).toHaveClass('pill-accent');
  });

  it('un link compartido muestra sus filtros adelante de cada fila', async () => {
    renderCatalog('?genero=Western,Terror&idioma=ko');
    await screen.findByText('Película 1');

    const genres = within(group(/Filtrar por género/)).getAllByRole('button');
    expect(genres.slice(1, 3).map((pill) => pill.textContent)).toEqual(['Western', 'Terror']);
    expect(within(group(/Filtrar por idioma/)).getAllByRole('button')[1]).toHaveTextContent(
      'Coreano',
    );
  });

  it('al pasar a series traduce los géneros y saca la duración', async () => {
    renderCatalog('?genero=Acción,Terror&duracion=corta');
    await screen.findByText('Película 1');
    expect(group(/Filtrar por duración/)).toBeInTheDocument();

    await userEvent.click(
      within(group(/Películas o series/)).getByRole('button', { name: 'Series' }),
    );

    expect(await screen.findByText('Serie 1')).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ mediaType: 'tv', genres: [10759] });
    expect(urlParams().get('genero')).toBe('Acción y Aventura');
    expect(urlParams().get('duracion')).toBeNull();
    expect(screen.queryByRole('group', { name: /Filtrar por duración/ })).not.toBeInTheDocument();
  });

  it('ordena de lo más viejo a lo más nuevo, y lo deja en la URL', async () => {
    renderCatalog();
    await screen.findByText('Película 1');

    const sort = group(/Ordenar el catálogo/);
    expect(within(sort).getAllByRole('button').map((pill) => pill.textContent)).toEqual([
      'Populares',
      'Mejor puntuadas',
      'Más nuevas',
      'Más viejas',
    ]);
    await userEvent.click(within(sort).getByRole('button', { name: 'Más viejas' }));

    await waitFor(() => expect(lastParams()).toMatchObject({ sort: 'oldest', page: 1 }));
    expect(urlParams().get('orden')).toBe('oldest');
  });

  it('esconde lo que ya está en la biblioteca, sin volver a pedir nada', async () => {
    act(() => {
      useMediaStore.getState().setMediaList([savedMedia()]);
    });
    renderCatalog();
    await screen.findByText('Película 2');
    const calls = discoverPage.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar lo que ya tengo' }));

    expect(screen.queryByText('Película 2')).not.toBeInTheDocument();
    expect(screen.getByText('Película 1')).toBeInTheDocument();
    expect(discoverPage.mock.calls.length).toBe(calls);
    expect(urlParams().get('ocultar')).toBe('1');
  });

  it('"Mis plataformas" elige las que pagás, con el crédito de JustWatch', async () => {
    act(() => {
      useMediaStore.getState().setSubscriptions({
        providers: [
          { id: 11, name: 'MUBI', logoPath: null },
          { id: 8, name: 'Netflix', logoPath: null },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
    renderCatalog();
    await screen.findByText('Película 1');

    const providers = group(/Filtrar por plataforma/);
    await userEvent.click(within(providers).getByRole('button', { name: 'Mis plataformas' }));

    await waitFor(() =>
      expect(lastParams()).toMatchObject({ providers: [11, 8], region: 'AR' }),
    );
    expect(
      within(providers).getByRole('button', { name: 'Mis plataformas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /JustWatch/ })).toBeInTheDocument();
  });

  it('sin resultados lo dice y ofrece limpiar los filtros', async () => {
    discoverPage.mockImplementation(async (params) => ({
      results: [],
      page: params.page ?? 1,
      totalPages: 0,
    }));
    renderCatalog('?tipo=tv&idioma=ko&orden=rating');

    expect(await screen.findByText('No hay nada con estos filtros.')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);

    // Limpiar conserva el tipo y el orden: no son filtros, son lo que mirás.
    await waitFor(() => expect(urlParams().toString()).toBe('tipo=tv&orden=rating'));
  });

  it('si falla, lo dice y deja reintentar', async () => {
    discoverPage.mockRejectedValueOnce(new Error('TMDB respondió 500.'));
    renderCatalog();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos traer el catálogo.');
    discoverPage.mockImplementation(async (params) => ({
      results: [makeResult(42)],
      page: params.page ?? 1,
      totalPages: 1,
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Película 42')).toBeInTheDocument();
  });
});
