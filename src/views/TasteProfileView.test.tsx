import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
    getRegionProviders: vi.fn(async () => regionProviders),
  };
});

/** Más que una página, para que aparezcan el buscador y "Ver todas". */
const regionProviders = [
  { id: 8, name: 'Netflix', logoPath: null, priority: 1 },
  { id: 337, name: 'Disney Plus', logoPath: null, priority: 2 },
  ...Array.from({ length: 20 }, (_, i) => ({
    id: 1000 + i,
    name: `Plataforma ${i + 1}`,
    logoPath: null,
    priority: 10 + i,
  })),
  { id: 11, name: 'MUBI', logoPath: null, priority: 99 },
];

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

/**
 * El chip de un género en la pregunta de favoritos. Los mismos nombres están
 * también en "Lo que no te interesa", así que se busca adentro de la pregunta.
 */
function favoriteGenre(name: string) {
  const question = screen.getByRole('heading', { name: 'Tus géneros' }).closest('li')!;
  return within(question).getByRole('button', { name });
}

/** La sección de plataformas. */
function subscriptionsSection() {
  return screen.getByRole('region', { name: 'Tus plataformas' });
}

/** La sección de restricciones. */
function restrictionsSection() {
  return screen.getByRole('region', { name: 'Lo que no te interesa' });
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

    await userEvent.click(favoriteGenre('Terror'));

    expect(saved().genres).toEqual(['Terror']);
    expect(screen.getByText('1 de 7')).toBeInTheDocument();
    expect(favoriteGenre('Terror')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('vuelve a sacar un género al tocarlo de nuevo', async () => {
    renderForm();

    await userEvent.click(favoriteGenre('Comedia'));
    await userEvent.click(favoriteGenre('Comedia'));

    expect(saved().genres).toEqual([]);
    expect(screen.getByText('0 de 7')).toBeInTheDocument();
  });

  it('no deja elegir un cuarto género, pero sí sacar los que ya están', async () => {
    renderForm();

    for (const genre of ['Terror', 'Comedia', 'Drama']) {
      await userEvent.click(favoriteGenre(genre));
    }

    expect(saved().genres).toHaveLength(3);
    expect(favoriteGenre('Western')).toBeDisabled();
    expect(favoriteGenre('Terror')).toBeEnabled();
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

  it('deja sacar la película ya elegida', async () => {
    renderForm();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
      'volver',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Elegir Volver al futuro' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Sacar Volver al futuro' }),
    );

    expect(saved().movie).toBeUndefined();
    expect(
      screen.getByRole('searchbox', { name: 'Buscar tu película favorita' }),
    ).toBeInTheDocument();
  });

  it('suma otra película favorita con el botón, hasta cinco', async () => {
    const movie = (tmdbId: number) => ({
      tmdbId,
      mediaType: 'movie' as const,
      title: `Película ${tmdbId}`,
      posterPath: null,
      releaseYear: '2000',
    });
    act(() => {
      useMediaStore.getState().setPicks({
        ...saved(),
        movie: movie(1),
        moreMovies: [movie(2), movie(3)],
      });
    });
    renderForm();

    // Con favoritas ya elegidas el buscador queda detrás del botón.
    expect(
      screen.queryByRole('searchbox', { name: /película favorita/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Agregar otra película' }),
    );
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar otra película favorita' }),
      'volver',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Elegir Volver al futuro' }),
    );

    expect(saved().movie?.tmdbId).toBe(1);
    expect(saved().moreMovies?.map((title) => title.tmdbId)).toEqual([2, 3, 105]);
    expect(screen.getByRole('button', { name: 'Agregar otra película' })).toBeInTheDocument();

    act(() => {
      useMediaStore.getState().setPicks({
        ...saved(),
        moreMovies: [...saved().moreMovies!, movie(4)],
      });
    });

    expect(
      screen.queryByRole('button', { name: 'Agregar otra película' }),
    ).not.toBeInTheDocument();
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
    // Lo elegido lleva a la página de la persona.
    expect(screen.getByRole('link', { name: 'Christopher Nolan' })).toHaveAttribute(
      'href',
      '/persona/525',
    );

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

    await userEvent.click(favoriteGenre('Terror'));

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Ver cómo quedó Explorar/ }),
      ).toBeInTheDocument(),
    );
  });

  describe('lo que no te interesa', () => {
    it('pone un año mínimo para las dos, lo cambia a películas y lo saca', async () => {
      renderForm();
      const section = restrictionsSection();

      // Sin año no hay a qué aplicarlo: la pregunta aparece recién después.
      expect(within(section).queryByRole('group', { name: 'Aplica a' })).not.toBeInTheDocument();

      await userEvent.click(within(section).getByRole('button', { name: '1990' }));
      expect(useMediaStore.getState().restrictions.minYear).toEqual({ year: 1990, scope: 'both' });

      const scope = within(section).getByRole('group', { name: 'Aplica a' });
      await userEvent.click(within(scope).getByRole('button', { name: 'Películas' }));
      expect(useMediaStore.getState().restrictions.minYear).toEqual({ year: 1990, scope: 'movie' });

      await userEvent.click(within(section).getByRole('button', { name: '1990' }));
      expect(useMediaStore.getState().restrictions.minYear).toBeUndefined();
    });

    it('excluye un género, incluso los que no son un gusto', async () => {
      renderForm();
      const section = restrictionsSection();

      await userEvent.click(within(section).getByRole('button', { name: 'Reality' }));
      await userEvent.click(within(section).getByRole('button', { name: 'Terror' }));

      expect(useMediaStore.getState().restrictions.excludedGenres).toEqual(['Reality', 'Terror']);
      // No cuenta como respuesta del cuestionario: es un filtro, no un gusto.
      expect(screen.getByText('0 de 7')).toBeInTheDocument();
    });

    it('no deja que un género sea favorito y excluido a la vez', async () => {
      renderForm();

      await userEvent.click(favoriteGenre('Comedia'));
      expect(within(restrictionsSection()).getByRole('button', { name: 'Comedia' })).toBeDisabled();

      await userEvent.click(within(restrictionsSection()).getByRole('button', { name: 'Terror' }));
      expect(favoriteGenre('Terror')).toBeDisabled();
    });
  });

  describe('Tus plataformas', () => {
    it('marca una plataforma y recién ahí ofrece limitar Explorar', async () => {
      renderForm();
      const section = subscriptionsSection();
      const switchName = /Recomendame solo lo que está en mis plataformas/;

      expect(within(section).queryByRole('checkbox', { name: switchName })).not.toBeInTheDocument();

      await userEvent.click(await within(section).findByRole('button', { name: 'Netflix' }));
      expect(useMediaStore.getState().subscriptions.providers.map((p) => p.id)).toEqual([8]);

      await userEvent.click(within(section).getByRole('checkbox', { name: switchName }));
      expect(useMediaStore.getState().subscriptions.onlyMine).toBe(true);

      await userEvent.click(within(section).getByRole('checkbox', { name: switchName }));
      expect(useMediaStore.getState().subscriptions.onlyMine).toBeUndefined();
    });

    it('busca en todas, no solo en las de la primera página', async () => {
      renderForm();
      const section = subscriptionsSection();
      await within(section).findByRole('button', { name: 'Netflix' });

      expect(within(section).queryByRole('button', { name: 'MUBI' })).not.toBeInTheDocument();

      await userEvent.type(within(section).getByRole('searchbox', { name: 'Buscar una plataforma' }), 'mubi');

      expect(within(section).getByRole('button', { name: 'MUBI' })).toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: 'Netflix' })).not.toBeInTheDocument();
      expect(within(section).queryByRole('button', { name: /Ver todas/ })).not.toBeInTheDocument();
    });

    it('"Ver todas" muestra la lista completa', async () => {
      renderForm();
      const section = subscriptionsSection();

      await userEvent.click(await within(section).findByRole('button', { name: `Ver todas (${regionProviders.length})` }));

      expect(within(section).getByRole('button', { name: 'MUBI' })).toBeInTheDocument();
    });
  });
});
