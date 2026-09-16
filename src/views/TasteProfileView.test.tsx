import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TMDbResult } from '@/types';

/** Sin sesión: las respuestas se guardan en el store local, que es lo que se mira. */
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
}));

/** La búsqueda de títulos devuelve una película y una serie, a propósito. */
const searchMulti = vi.fn(
  async (): Promise<TMDbResult[]> => [
    {
      id: 105,
      media_type: 'movie',
      title: 'Volver al futuro',
      poster_path: '/bttf.jpg',
      backdrop_path: null,
      release_date: '1985-07-03',
      genre_ids: [],
      overview: '',
    },
    {
      id: 1400,
      media_type: 'tv',
      name: 'Volver al futuro: la serie',
      poster_path: null,
      backdrop_path: null,
      first_air_date: '1991-09-14',
      genre_ids: [],
      overview: '',
    },
  ],
);

const searchPeople = vi.fn(async () => [
  {
    id: 525,
    name: 'Christopher Nolan',
    profile_path: null,
    known_for_department: 'Directing',
    known_for: ['Interestelar'],
  },
]);

vi.mock('@/lib/tmdb', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tmdb')>('@/lib/tmdb');
  return {
    ...actual,
    searchMulti: () => searchMulti(),
    searchPeople: () => searchPeople(),
    searchCompanies: vi.fn(async () => []),
  };
});

const { TasteProfileView } = await import('@/views/TasteProfileView');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

function renderForm() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <TasteProfileView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Lo que quedó guardado en el cuestionario. */
function saved() {
  return useMediaStore.getState().picks;
}

describe('Contanos de vos', () => {
  beforeEach(() => {
    searchMulti.mockClear();
    act(() => {
      useMediaStore.getState().reset();
    });
  });

  it('arranca con las siete preguntas sin contestar', () => {
    renderForm();

    expect(screen.getByText('0 de 7')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(7);
  });

  it('guarda el género que se elige y cuenta la respuesta', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Terror' }));

    expect(saved().genres).toEqual(['Terror']);
    expect(screen.getByText('1 de 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terror' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('vuelve a sacar un género al tocarlo de nuevo', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Comedia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Comedia' }));

    expect(saved().genres).toEqual([]);
    expect(screen.getByText('0 de 7')).toBeInTheDocument();
  });

  it('no deja elegir un cuarto género, pero sí sacar los que ya están', async () => {
    renderForm();

    for (const genre of ['Terror', 'Comedia', 'Drama']) {
      await userEvent.click(screen.getByRole('button', { name: genre }));
    }

    expect(saved().genres).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Western' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Terror' })).toBeEnabled();
  });

  it('busca la película favorita y guarda lo mínimo para recomendarla', async () => {
    renderForm();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
      'volver',
    );

    const option = await screen.findByRole('button', {
      name: 'Elegir Volver al futuro',
    });
    // La pregunta es por una película: la serie del mismo nombre no se ofrece.
    expect(
      screen.queryByRole('button', { name: /Volver al futuro: la serie/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(option);

    expect(saved().movie).toEqual({
      tmdbId: 105,
      mediaType: 'movie',
      title: 'Volver al futuro',
      posterPath: '/bttf.jpg',
      releaseYear: '1985',
    });
  });

  it('no busca hasta tener dos letras escritas', async () => {
    renderForm();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
      'v',
    );

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(searchMulti).not.toHaveBeenCalled();
  });

  it('deja cambiar la película ya elegida', async () => {
    renderForm();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
      'volver',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Elegir Volver al futuro' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Cambiar Volver al futuro' }),
    );

    expect(saved().movie).toBeUndefined();
    expect(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
    ).toBeInTheDocument();
  });

  it('suma gente a la lista y la saca', async () => {
    renderForm();

    await userEvent.type(
      screen.getByRole('searchbox', {
        name: 'Buscar un director o una directora',
      }),
      'nolan',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Elegir Christopher Nolan' }),
    );

    expect(saved().directors).toEqual([
      { id: 525, name: 'Christopher Nolan', profilePath: null },
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sacar a Christopher Nolan' }),
    );

    expect(saved().directors).toEqual([]);
  });

  it('elige una década y la cambia por otra', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Los 90' }));
    expect(saved().decade).toBe(1990);

    await userEvent.click(screen.getByRole('button', { name: 'Los 2000' }));
    expect(saved().decade).toBe(2000);

    await userEvent.click(screen.getByRole('button', { name: 'Los 2000' }));
    expect(saved().decade).toBeUndefined();
  });

  it('recién con algo contestado ofrece ir a ver Explorar', async () => {
    renderForm();

    expect(
      screen.queryByRole('link', { name: /Ver cómo quedó Explorar/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Terror' }));

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Ver cómo quedó Explorar/ }),
      ).toBeInTheDocument(),
    );
  });
});
