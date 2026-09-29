import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useMediaStore } from '@/store';
import type { PersonPage, PersonPageCredit } from '@/lib/tmdb';
import { SavedMedia } from '@/types';

const getPersonPage = vi.fn<(id: number) => Promise<PersonPage>>();

vi.mock('@/lib/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tmdb')>()),
  getPersonPage: (id: number) => getPersonPage(id),
}));
// La ficha tiene sus propios tests: acá alcanza con saber cuál se abrió.
vi.mock('@/components/TitleDetailModal', () => ({
  TitleDetailModal: ({ id, mediaType, onClose }: { id: number; mediaType: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`Ficha ${mediaType}-${id}`}>
      <button type="button" onClick={onClose}>
        Cerrar
      </button>
    </div>
  ),
}));

const { PersonView } = await import('./PersonView');

function credit(id: number, title: string, overrides: Partial<PersonPageCredit> = {}): PersonPageCredit {
  return {
    id,
    media_type: 'movie',
    title,
    date: '2015-01-01',
    poster_path: null,
    role: 'direccion',
    character: null,
    job: 'Director',
    vote_average: 7.5,
    vote_count: 5000,
    ...overrides,
  };
}

const PAGE: PersonPage = {
  person: {
    id: 45400,
    name: 'Greta Gerwig',
    profile_path: null,
    biography: 'Actriz, guionista y directora.',
    birthday: '1983-08-04',
    deathday: null,
    place_of_birth: 'Sacramento, California, EE. UU.',
    known_for_department: 'Directing',
  },
  credits: [
    credit(1, 'Lady Bird', { date: '2017-11-03', vote_average: 7.3 }),
    credit(2, 'Mujercitas', { date: '2019-12-25', vote_average: 7.9 }),
    credit(3, 'Frances Ha', { date: '2012-05-17', role: 'reparto', job: null, character: 'Frances' }),
    credit(4, 'Barbie', { date: '2023-07-19', vote_average: 7 }),
    credit(5, 'Nights and Weekends', { date: '2008-09-05', vote_count: 50 }),
    credit(5, 'Nights and Weekends', { date: '2008-09-05', role: 'reparto', job: null, character: 'Mattie' }),
    credit(6, 'Narnia', { date: null }),
  ],
};

function media(tmdbId: number, status: SavedMedia['status']): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title: `T${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2017',
    genres: [],
    status,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/persona/:id" element={<PersonView />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** La grilla de la filmografía, sin el filtro que tiene arriba. */
function filmography() {
  return within(screen.getByRole('region', { name: /Filmografía/ })).getByRole('list');
}

describe('PersonView', () => {
  beforeEach(() => {
    getPersonPage.mockReset();
    getPersonPage.mockResolvedValue(PAGE);
    useMediaStore.getState().setMediaList([media(1, 'completada'), media(3, 'por_ver')]);
  });

  it('dice quién es y cuánto de lo suyo viste', async () => {
    renderAt('/persona/45400');

    expect(await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' })).toBeInTheDocument();
    expect(getPersonPage).toHaveBeenCalledWith(45400);
    expect(screen.getByText('Dirección', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Nació el 4 de agosto de 1983 en Sacramento/)).toBeInTheDocument();
    // Cinco estrenados —lo anunciado no cuenta— y viste uno.
    expect(screen.getByText('Viste 1 de 5')).toBeInTheDocument();
    // Frances Ha está en Por Ver y Nights and Weekends tiene pocos votos.
    const missing = screen.getByRole('list', { name: 'Te faltan estas 2 bien puntuadas' });
    expect(within(missing).getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Mujercitas'),
      expect.stringContaining('Barbie'),
    ]);
  });

  it('la filmografía, sin repetidos y marcada según tu biblioteca', async () => {
    renderAt('/persona/45400');
    await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' });

    const list = within(filmography());
    expect(list.getAllByRole('button')).toHaveLength(6);
    expect(list.getByRole('button', { name: /Lady Bird/ })).toHaveTextContent('Visto');
    expect(list.getByRole('button', { name: /Frances Ha/ })).toHaveTextContent('Por ver');
    expect(list.getByRole('button', { name: /Nights and Weekends/ })).toHaveTextContent(
      '2008 · Dirigió y actuó (Mattie)',
    );
    expect(list.getByRole('button', { name: /Narnia/ })).toHaveTextContent('Próximamente');
  });

  it('filtra por papel', async () => {
    const user = userEvent.setup();
    renderAt('/persona/45400');
    await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' });

    await user.click(screen.getByRole('button', { name: 'Reparto' }));

    expect(screen.getByRole('button', { name: 'Reparto' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(filmography())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([expect.stringContaining('Frances Ha'), expect.stringContaining('Nights and Weekends')]);
  });

  it('sin un segundo papel no hay filtro', async () => {
    getPersonPage.mockResolvedValue({
      ...PAGE,
      credits: [credit(3, 'Frances Ha', { role: 'reparto', job: null, character: 'Frances' })],
    });
    renderAt('/persona/45400');
    await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' });

    expect(screen.queryByRole('group', { name: 'Filtrar por papel' })).not.toBeInTheDocument();
  });

  it('abre la ficha de un título', async () => {
    const user = userEvent.setup();
    renderAt('/persona/45400');
    await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' });

    await user.click(within(filmography()).getByRole('button', { name: /Lady Bird/ }));
    expect(screen.getByRole('dialog', { name: 'Ficha movie-1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('de a treinta, con "Mostrar más"', async () => {
    const user = userEvent.setup();
    getPersonPage.mockResolvedValue({
      ...PAGE,
      credits: Array.from({ length: 35 }, (_, index) =>
        credit(100 + index, `Película ${index}`, { date: `${1980 + index}-01-01`, vote_count: 10 }),
      ),
    });
    renderAt('/persona/45400');
    await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' });

    expect(within(filmography()).getAllByRole('button', { name: /Película/ })).toHaveLength(30);
    await user.click(screen.getByRole('button', { name: 'Mostrar más (5)' }));
    expect(within(filmography()).getAllByRole('button', { name: /Película/ })).toHaveLength(35);
    expect(screen.queryByRole('button', { name: /Mostrar más/ })).not.toBeInTheDocument();
  });

  it('un link roto ni se pide', async () => {
    renderAt('/persona/abc');

    expect(await screen.findByRole('heading', { name: 'Esta persona no existe' })).toBeInTheDocument();
    expect(getPersonPage).not.toHaveBeenCalled();
  });

  it('si falla, se puede reintentar', async () => {
    const user = userEvent.setup();
    getPersonPage.mockRejectedValueOnce(new Error('No pudimos conectarnos. Revisá tu conexión a internet.'));
    renderAt('/persona/45400');

    expect(await screen.findByRole('heading', { name: 'No pudimos cargar esta página' })).toBeInTheDocument();
    expect(screen.getByText(/Revisá tu conexión/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Greta Gerwig' })).toBeInTheDocument();
    expect(getPersonPage).toHaveBeenCalledTimes(2);
  });
});
