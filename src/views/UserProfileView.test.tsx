import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { useSocialStore } from '@/hooks/useSocial';
import { buildDemoSocial } from '@/lib/demoSocial';
import { buildDemoLibrary } from '@/lib/demo';
import { emptySocialSettings } from '@/lib/social';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: 'demo', user: null }),
}));
vi.mock('@/hooks/usePublicProfile', () => ({
  usePublishProfile: () => ({ slug: null, isLoading: false, publish: vi.fn(), unpublish: vi.fn() }),
  fetchPublicProfile: vi.fn(async () => null),
}));
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ addMedia: vi.fn(), patchMedia: vi.fn() }) }));
vi.mock('@/components/TitleDetailModal', () => ({ TitleDetailModal: () => null }));

const { UserProfileView } = await import('./UserProfileView');

function loadDemo() {
  const demo = buildDemoSocial(new Date());
  useSocialStore.setState({
    mode: 'demo',
    uid: demo.me.uid,
    account: demo.me,
    follows: demo.follows,
    followsLoaded: true,
    reactions: [],
    recommendations: [],
    blocked: [],
    myReactions: {},
    people: {},
    demo,
    unavailable: false,
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/u/:slug" element={<UserProfileView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('UserProfileView', () => {
  beforeEach(() => {
    useMediaStore.getState().setMediaList(buildDemoLibrary());
    useMediaStore.getState().setSocialSettings(emptySocialSettings());
    loadDemo();
  });

  it('una cuenta privada que no te aceptó muestra su tarjeta y nada más', () => {
    renderAt('/u/dani-demo');
    expect(screen.getByRole('heading', { name: /Dani/ })).toBeInTheDocument();
    expect(screen.getByText('Esta cuenta es privada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar seguir/ })).toBeInTheDocument();
  });

  it('una privada que te aceptó muestra su actividad', () => {
    renderAt('/u/caro-demo');
    expect(screen.queryByText('Esta cuenta es privada')).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Caro le puso 4,5 a La sociedad de la nieve/ })).toBeInTheDocument();
  });

  it('con un mutuo: recomendar, ver juntos y "En común"', async () => {
    renderAt('/u/ana-demo');
    expect(screen.getByRole('button', { name: /Recomendar/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Qué miramos juntos/ })).toHaveAttribute('href', '/juntos/ana-demo');
    await userEvent.click(screen.getByRole('tab', { name: 'En común' }));
    expect(screen.getByText(/Sobre \d+ títulos que puntuaron los dos/)).toBeInTheDocument();
    expect(screen.getByText('Les encantó a los dos')).toBeInTheDocument();
  });

  it('la invitación saluda a quien todavía no la sigue', () => {
    renderAt('/u/eva-demo?invitado=1');
    expect(screen.getByText(/te invitó a Qué Miro\?/)).toBeInTheDocument();
  });

  it('un usuario que no existe', () => {
    renderAt('/u/nadie-demo');
    expect(screen.getByRole('heading', { name: 'Este perfil no existe' })).toBeInTheDocument();
  });
});
