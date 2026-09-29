import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { SavedMedia } from '@/types';
import lbDiary from '@/lib/importers/__fixtures__/letterboxd/diary.csv?raw';
import lbWatchlist from '@/lib/importers/__fixtures__/letterboxd/watchlist.csv?raw';

const saveMany = vi.fn(async (_items: SavedMedia[]) => {});
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ saveMany }) }));

const findTitles = vi.fn();
vi.mock('@/lib/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tmdb')>()),
  findTitles: (...args: unknown[]) => findTitles(...args),
  getMediaDetail: vi.fn(),
  searchMulti: vi.fn(async () => [
    { id: 238, media_type: 'movie', title: 'El padrino', release_date: '1972-03-14', poster_path: null, backdrop_path: null, genre_ids: [18] },
  ]),
}));

const { ImportDialog } = await import('./ImportDialog');

function candidate(id: number, title: string, year: number) {
  return { id, mediaType: 'movie', title, year, posterPath: null, genreIds: [18] };
}

describe('ImportDialog', () => {
  beforeEach(() => {
    saveMany.mockClear();
    findTitles.mockReset();
    useMediaStore.getState().setMediaList([]);
    findTitles.mockImplementation(async (query: { query?: string; year?: number }) => {
      if (query.query === 'Past Lives') return [candidate(666277, 'Vidas pasadas', 2023)];
      if (query.query === 'Oppenheimer') return [candidate(872585, 'Oppenheimer', 2023), candidate(1, 'Oppenheimer', 2023)];
      return [];
    });
  });

  it('de los archivos a la biblioteca, pasando por la revisión', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ImportDialog isOpen onClose={vi.fn()} />
      </ToastProvider>,
    );

    await user.upload(screen.getByLabelText('Elegir los archivos del export'), [
      new File([lbDiary], 'diary.csv', { type: 'text/csv' }),
      new File([lbWatchlist], 'watchlist.csv', { type: 'text/csv' }),
    ]);
    expect(await screen.findByText(/4 títulos/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Buscar en TMDB' }));

    // Uno encontrado, uno dudoso (dos Oppenheimer de 2023) y dos que no aparecieron.
    const counts = await screen.findByText('encontrado');
    expect(counts.previousSibling).toHaveTextContent('1');
    expect(screen.getByText('dudoso').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('no aparecieron').previousSibling).toHaveTextContent('2');

    // Uno de los que no aparecieron se busca a mano.
    const missing = screen.getByRole('heading', { name: 'No aparecieron' }).parentElement!;
    const [godfather] = within(missing)
      .getAllByRole('listitem')
      .filter((item) => item.textContent?.includes('The Godfather'));
    await user.click(within(godfather).getByRole('button', { name: 'Buscarlo' }));
    await user.click(within(godfather).getByRole('button', { name: 'Buscar' }));
    await user.click(await within(godfather).findByRole('button', { name: /El padrino/ }));

    await user.click(screen.getByRole('button', { name: 'Importar 3 títulos' }));

    expect(saveMany).toHaveBeenCalledTimes(1);
    const saved = saveMany.mock.calls[0][0];
    expect(saved.map((media) => media.tmdbId).sort()).toEqual([238, 666277, 872585]);
    expect(saved.find((media) => media.tmdbId === 666277)?.history).toHaveLength(2);
  });
});
