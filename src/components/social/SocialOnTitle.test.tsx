import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { useSocialStore } from '@/hooks/useSocial';
import { buildDemoSocial } from '@/lib/demoSocial';
import { emptySocialSettings } from '@/lib/social';
import { SavedMedia } from '@/types';

const patchMedia = vi.fn();
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ addMedia: vi.fn(), patchMedia }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ authState: 'demo', user: null }) }));

const { SocialOnTitle } = await import('./SocialOnTitle');

const parasitos = { tmdbId: 496243, mediaType: 'movie' as const, title: 'Parásitos', posterPath: null, releaseYear: '2019' };
const saved: SavedMedia = { ...parasitos, backdropPath: null, genres: [], status: 'completada', updatedAt: '' };

function renderIt(media: SavedMedia | null) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SocialOnTitle title={parasitos} saved={media} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SocialOnTitle', () => {
  beforeEach(() => {
    patchMedia.mockClear();
    useMediaStore.getState().setSocialSettings(emptySocialSettings());
    const demo = buildDemoSocial(new Date());
    useSocialStore.setState({
      mode: 'demo',
      uid: demo.me.uid,
      account: demo.me,
      follows: demo.follows,
      followsLoaded: true,
      demo,
      people: {},
    });
  });

  it('dice quiénes de los que seguís lo vieron y qué le pusieron', () => {
    renderIt(saved);
    expect(screen.getByText('Lo vieron tus amigos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/u/ana-demo');
    expect(screen.getByText(/le puso 5/)).toBeInTheDocument();
  });

  it('ocultarlo de tus seguidores lo marca en el título', async () => {
    renderIt(saved);
    await userEvent.click(screen.getByRole('checkbox', { name: /No compartir este título/ }));
    expect(patchMedia).toHaveBeenCalledWith(496243, { hiddenFromFollowers: true });
  });

  it('sin cuenta social no muestra nada', () => {
    useSocialStore.setState({ mode: 'off', account: undefined });
    renderIt(saved);
    expect(screen.queryByText('Lo vieron tus amigos')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
