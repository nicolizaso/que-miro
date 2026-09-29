import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import type { PublicList } from '@/lib/publicList';

const state = {
  list: null as PublicList | null,
  isLoading: false,
  error: '',
  canSave: true,
  authState: 'authenticated',
};
const saveOne = vi.fn(async () => {});
const saveAll = vi.fn(async () => true);

vi.mock('@/hooks/usePublicList', () => ({
  usePublicListById: () => ({ list: state.list, isLoading: state.isLoading, error: state.error }),
  useSaveFromList: () => ({ canSave: state.canSave, saveOne, saveAll }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ authState: state.authState }) }));

const { PublicListView } = await import('./PublicListView');

const LIST: PublicList = {
  id: 'abcdefghijkl1234',
  uid: 'uid-ana',
  ownerName: 'Ana',
  name: 'Terror del bueno',
  description: 'Para no dormir.',
  items: [
    { tmdbId: 1, mediaType: 'movie', title: 'Hereditary', posterPath: null, releaseYear: '2018' },
    { tmdbId: 2, mediaType: 'tv', title: 'Bly Manor', posterPath: null, releaseYear: '2020' },
  ],
  publishedAt: new Date().toISOString(),
  autoUpdate: true,
};

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/l/abcdefghijkl1234']}>
      <ToastProvider>
        <Routes>
          <Route path="/l/:id" element={<PublicListView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('PublicListView', () => {
  beforeEach(() => {
    state.list = LIST;
    state.canSave = true;
    state.authState = 'authenticated';
    saveOne.mockClear();
    saveAll.mockClear();
    useMediaStore.getState().setMediaList([]);
  });

  it('muestra de quién es, qué tiene y la descripción', () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Terror del bueno' })).toBeInTheDocument();
    expect(screen.getByText('Una lista de Ana')).toBeInTheDocument();
    expect(screen.getByText('Para no dormir.')).toBeInTheDocument();
    expect(screen.getByText('Hereditary')).toBeInTheDocument();
    expect(screen.getByText('2020 · Serie')).toBeInTheDocument();
  });

  it('se guarda entera o de a un título', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar toda la lista' }));
    expect(saveAll).toHaveBeenCalledWith(LIST);
    expect(await screen.findByRole('button', { name: 'Guardada en tus listas' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar "Hereditary" en Por Ver' }));
    expect(saveOne).toHaveBeenCalledWith(LIST.items[0]);
  });

  it('lo que ya está en la biblioteca no se ofrece de nuevo', () => {
    useMediaStore.getState().setMediaList([
      {
        tmdbId: 1,
        mediaType: 'movie',
        title: 'Hereditary',
        posterPath: null,
        backdropPath: null,
        releaseYear: '2018',
        genres: [],
        status: 'completada',
        updatedAt: '',
      },
    ]);
    renderView();
    expect(screen.queryByRole('button', { name: 'Guardar "Hereditary" en Por Ver' })).not.toBeInTheDocument();
    expect(screen.getByText('En tu biblioteca')).toBeInTheDocument();
  });

  it('sin biblioteca donde guardar, solo se mira', () => {
    state.canSave = false;
    state.authState = 'unauthenticated';
    renderView();
    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Armá la tuya' })).toBeInTheDocument();
  });

  it('una lista que no existe tiene su propia página', () => {
    state.list = null;
    renderView();
    expect(screen.getByRole('heading', { name: 'Esta lista no existe' })).toBeInTheDocument();
  });
});
