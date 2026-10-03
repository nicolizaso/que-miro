import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { useSocialStore } from '@/hooks/useSocial';
import { SAMPLE_ME_UID, loadSampleSocial } from '@/test/fixtures/sampleSocial';
import { emptySocialSettings } from '@/lib/social';
import { SavedMedia } from '@/types';

type TestUser = { uid: string; displayName: string; email: string };
const me: TestUser = { uid: SAMPLE_ME_UID, displayName: 'Vos', email: 'vos@example.com' };
const auth = { authState: 'authenticated' as string, user: me as TestUser | null };

/**
 * Las escrituras de las acciones sociales, contra una Firestore de mentira
 * que hace lo que hace la caché local de verdad: el cambio se ve al toque.
 */
const updateDoc = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  const { useSocialStore: store } = await import('@/hooks/useSocial');
  const { follows } = store.getState();
  store.setState({
    follows: {
      ...follows,
      incoming: follows.incoming.map((f) => (ref.path === `follows/${f.follower}_${f.followed}` ? { ...f, ...data } : f)),
    },
  });
});
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, path: string) => ({ path }),
  updateDoc: (ref: { path: string }, data: Record<string, unknown>) => updateDoc(ref, data),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ ...auth, logout: vi.fn() }),
}));
vi.mock('@/hooks/usePublicProfile', () => ({
  usePublishProfile: () => ({ slug: null, isLoading: false, publish: vi.fn(), unpublish: vi.fn() }),
  fetchPublicProfile: vi.fn(async () => null),
}));
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ addMedia: vi.fn(), patchMedia: vi.fn() }) }));
vi.mock('@/components/TitleDetailModal', () => ({ TitleDetailModal: () => null }));

// jsdom no trae `ResizeObserver`, que la fila de "Viendo ahora" usa para sus flechas.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const { SocialView, SocialFeedTab, SocialInboxTab, SocialSearchTab } = await import('./SocialView');

const NOW = new Date();

function severance(status: SavedMedia['status']): SavedMedia {
  return {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status,
    updatedAt: NOW.toISOString(),
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/social" element={<SocialView />}>
            <Route index element={<SocialFeedTab />} />
            <Route path="notificaciones" element={<SocialInboxTab />} />
            <Route path="buscar" element={<SocialSearchTab />} />
          </Route>
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SocialView — feed', () => {
  beforeEach(() => {
    auth.authState = 'authenticated';
    auth.user = me;
    useMediaStore.getState().setMediaList([severance('viendo')]);
    useMediaStore.getState().setSocialSettings(emptySocialSettings());
    loadSampleSocial(NOW);
  });

  it('mezcla la actividad de quienes seguís, con "Viendo ahora" arriba', () => {
    renderAt('/social');
    expect(screen.getByRole('article', { name: 'Ana le puso 5 a Past Lives' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Beto empezó Shōgun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana está viendo The Bear/ })).toBeInTheDocument();
    // A Dani no la sigue: su actividad no aparece.
    expect(screen.queryByText(/Dani/)).not.toBeInTheDocument();
  });

  it('tapa la reseña de algo que estás viendo, y la muestra si la pedís', async () => {
    renderAt('/social');
    const card = screen.getByRole('article', { name: /Ana le puso 4,5 a Severance/ });
    expect(within(card).queryByText(/cuando Helly/)).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /Mostrar la reseña/ }));
    expect(within(card).getByText(/cuando Helly/)).toBeInTheDocument();
  });

  it('filtra solo reseñas', async () => {
    renderAt('/social');
    await userEvent.click(screen.getByRole('button', { name: 'Reseñas' }));
    expect(screen.queryByRole('article', { name: /empezó Shōgun/ })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Beto le puso 5 a Fleabag/ })).toBeInTheDocument();
  });

  it('silenciar a alguien lo saca del feed', () => {
    useMediaStore.getState().setSocialSettings({ ...emptySocialSettings(), muted: ['demo-beto'] });
    renderAt('/social');
    expect(screen.queryByRole('article', { name: /Beto/ })).not.toBeInTheDocument();
  });
});

describe('SocialView — notificaciones', () => {
  beforeEach(() => {
    auth.authState = 'authenticated';
    auth.user = me;
    updateDoc.mockClear();
    useMediaStore.getState().setSocialSettings(emptySocialSettings());
    loadSampleSocial(NOW);
  });

  it('muestra la solicitud pendiente y aceptarla la vuelve un seguidor', async () => {
    renderAt('/social/notificaciones');
    expect(await screen.findByText(/quiere seguirte/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Aceptar/ }));
    expect(screen.queryByText(/quiere seguirte/)).not.toBeInTheDocument();
    expect(updateDoc).toHaveBeenCalledWith(
      { path: `follows/demo-dani_${SAMPLE_ME_UID}` },
      expect.objectContaining({ status: 'accepted' }),
    );
    expect(useSocialStore.getState().follows.incoming.find((f) => f.follower === 'demo-dani')?.status).toBe('accepted');
  });

  it('muestra la recomendación con su nota', () => {
    renderAt('/social/notificaciones');
    expect(screen.getByText(/te recomendó/)).toBeInTheDocument();
    expect(screen.getByText('Para un domingo tranquilo. Después me contás.')).toBeInTheDocument();
  });
});

describe('SocialView — sin usuario o sin cuenta', () => {
  it('con sesión y sin usuario, pide crearlo', () => {
    auth.authState = 'authenticated';
    auth.user = { uid: 'u1', displayName: 'Ana Pérez', email: 'ana@example.com' };
    useSocialStore.setState({ mode: 'remote', uid: 'u1', account: null, unavailable: false });
    renderAt('/social');
    expect(screen.getByLabelText('Usuario')).toHaveValue('ana-perez');
    expect(screen.getByRole('button', { name: 'Crear mi usuario' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Cuenta pública/ })).toBeChecked();
  });

  it('en modo invitado explica que hace falta una cuenta', () => {
    auth.authState = 'guest';
    auth.user = null;
    useSocialStore.setState({ mode: 'off', uid: null, account: undefined });
    renderAt('/social');
    expect(screen.getByText('Lo social necesita una cuenta')).toBeInTheDocument();
  });
});
