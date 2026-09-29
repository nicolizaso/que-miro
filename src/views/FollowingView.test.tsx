import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import type { FeedItem, FollowStatus } from '@/lib/following';
import { Following } from '@/types';

const addMedia = vi.fn(async () => {});
const unfollowProfile = vi.fn();

const feed = {
  following: { profiles: [], updatedAt: '' } as Following,
  items: [] as FeedItem[],
  statuses: new Map<string, FollowStatus | undefined>(),
  isLoading: false,
  refresh: vi.fn(),
};

vi.mock('@/hooks/useFollowingFeed', () => ({ useFollowingFeed: () => feed }));
vi.mock('@/hooks/useFollowing', () => ({ useFollowing: () => ({ unfollowProfile }) }));
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ addMedia }) }));
vi.mock('@/components/TitleDetailModal', () => ({ TitleDetailModal: () => null }));

const { FollowingView } = await import('./FollowingView');

function item(overrides: Partial<FeedItem['review']> = {}, name = 'Ana', slug = 'ana'): FeedItem {
  return {
    key: `${slug}:${overrides.id ?? 'r1'}`,
    slug,
    name,
    review: {
      id: 'r1',
      tmdbId: 666277,
      mediaType: 'movie',
      title: 'Past Lives',
      posterPath: null,
      releaseYear: '2023',
      rating: 4.5,
      text: 'Hermosa.',
      tags: [],
      completedAt: new Date().toISOString(),
      ...overrides,
    },
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <FollowingView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('FollowingView', () => {
  beforeEach(() => {
    useMediaStore.getState().setMediaList([]);
    addMedia.mockClear();
    unfollowProfile.mockClear();
    feed.following = {
      profiles: [
        { slug: 'ana', uid: 'u-ana', name: 'Ana', since: '' },
        { slug: 'beto', uid: 'u-beto', name: 'Beto', since: '' },
      ],
      updatedAt: '',
    };
    feed.items = [item()];
    feed.statuses = new Map([
      ['ana', 'ok'],
      ['beto', 'gone'],
    ]);
  });

  it('cuenta quién le puso cuánto a qué', () => {
    renderView();
    const card = screen.getByRole('article', { name: 'Ana le puso 4,5 a Past Lives' });
    expect(within(card).getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/u/ana');
  });

  it('se guarda en Por Ver desde la reseña', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar "Past Lives" en Por Ver' }));
    expect(addMedia).toHaveBeenCalledWith(
      expect.objectContaining({ tmdbId: 666277, mediaType: 'movie', status: 'por_ver' }),
    );
  });

  it('lo que ya está en la biblioteca no se ofrece de nuevo', () => {
    useMediaStore.getState().setMediaList([
      {
        tmdbId: 666277,
        mediaType: 'movie',
        title: 'Past Lives',
        posterPath: null,
        backdropPath: null,
        releaseYear: '2023',
        genres: [],
        status: 'completada',
        updatedAt: '',
      },
    ]);
    renderView();
    expect(screen.queryByRole('button', { name: /Por Ver/ })).not.toBeInTheDocument();
    expect(screen.getByText('Ya está en tu biblioteca')).toBeInTheDocument();
  });

  it('una reseña de un perfil viejo, sin el id del título, se lee pero no se guarda', () => {
    feed.items = [item({ tmdbId: 0, mediaType: undefined })];
    renderView();
    expect(screen.queryByRole('button', { name: /Por Ver/ })).not.toBeInTheDocument();
  });

  it('dice qué pasó con un perfil que ya no está, y se puede dejar de seguir', async () => {
    renderView();
    const list = screen.getByRole('heading', { name: 'Seguís a 2 perfiles' }).parentElement!;
    expect(within(list).getByText('Ya no está publicado.')).toBeInTheDocument();

    const [, beto] = within(list).getAllByRole('listitem');
    await userEvent.click(within(beto).getByRole('button', { name: 'Dejar de seguir' }));
    expect(unfollowProfile).toHaveBeenCalledWith('beto');
  });

  it('sin nadie a quien seguir, explica cómo empezar', () => {
    feed.following = { profiles: [], updatedAt: '' };
    feed.items = [];
    renderView();
    expect(screen.getByText(/Todavía no seguís a nadie/)).toBeInTheDocument();
  });
});
