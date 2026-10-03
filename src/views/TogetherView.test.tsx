import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { buildPublicProfile, PublicProfile } from '@/lib/publicProfile';
import { SavedMedia } from '@/types';

const patchMedia = vi.fn();
const state = { profile: null as PublicProfile | null };

vi.mock('@/hooks/usePublicProfile', () => ({
  usePublicProfileBySlug: () => ({ profile: state.profile, isLoading: false, error: '' }),
}));
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ patchMedia }) }));
vi.mock('@/components/TitleDetailModal', () => ({ TitleDetailModal: () => null }));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  // Sin animación: el sorteo es instantáneo, como con movimiento reducido.
  useReducedMotion: () => true,
}));

// jsdom no trae `ResizeObserver`, que las filas de filtros usan para sus flechas.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const { TogetherView } = await import('./TogetherView');

function media(tmdbId: number, title: string, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2023',
    genres: ['Drama'],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function profileWith(theirLibrary: SavedMedia[], options: Partial<Parameters<typeof buildPublicProfile>[0]> = {}) {
  return buildPublicProfile({
    slug: 'ana',
    uid: 'uid-ana',
    displayName: 'Ana',
    mediaList: theirLibrary,
    includeWatchlist: true,
    ...options,
  });
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/juntos/ana']}>
      <ToastProvider>
        <Routes>
          <Route path="/juntos/:slug" element={<TogetherView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('TogetherView', () => {
  beforeEach(() => {
    patchMedia.mockClear();
    useMediaStore.getState().setMediaList([
      media(1, 'Past Lives', { streaming: ['Netflix'] }),
      media(2, 'Aftersun'),
    ]);
    useMediaStore.getState().setSubscriptions({
      providers: [{ id: 8, name: 'Netflix', logoPath: null }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    state.profile = profileWith([media(1, 'Past Lives'), media(3, 'Anatomía de una caída')]);
  });

  it('cuenta qué tienen en común y qué no', () => {
    renderView();
    expect(
      screen.getByText(/1 título que tienen los dos en Por Ver, y 2 más que uno quiere ver y el otro no vio/),
    ).toBeInTheDocument();
  });

  it('sortea sobre la lista cruzada y dice de quién era', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: /Elegir/ }));
    expect(await screen.findByText(/Los dos la tienen en Por Ver|En tu Por Ver|En el Por Ver de Ana/)).toBeInTheDocument();
  });

  it('"En plataformas de los dos", solo si ella publicó las suyas', () => {
    renderView();
    expect(screen.queryByRole('button', { name: 'En plataformas de los dos' })).not.toBeInTheDocument();

    state.profile = profileWith([media(1, 'Past Lives')], {
      includeSubscriptions: true,
      subscriptions: ['Netflix'],
    });
    renderView();
    expect(screen.getByRole('button', { name: 'En plataformas de los dos' })).toBeInTheDocument();
  });

  it('el duelo de a dos no toca tu lista', async () => {
    renderView();
    await userEvent.click(screen.getByRole('tab', { name: 'Duelo' }));
    const [first] = screen.getAllByRole('button', { name: /^Elegir / });
    await userEvent.click(first);

    expect(patchMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'El ranking de los dos' })).toBeInTheDocument();
  });

  it('si no comparte su Por Ver, lo explica', () => {
    state.profile = profileWith([media(1, 'Past Lives')], { includeWatchlist: false });
    renderView();
    expect(screen.getByRole('heading', { name: 'Su Por Ver no es público' })).toBeInTheDocument();
  });
});
