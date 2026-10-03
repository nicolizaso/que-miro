import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { buildSampleLibrary } from '@/test/fixtures/sampleLibrary';
import {
  SAMPLE_ME_UID,
  SampleSocial,
  loadSampleSocial,
  sampleActivityRead,
} from '@/test/fixtures/sampleSocial';
import { emptySocialSettings } from '@/lib/social';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: 'authenticated', user: { uid: SAMPLE_ME_UID } }),
}));

/** La gente de ejemplo hace de Firestore: buscar un usuario y leer su actividad. */
let sample: SampleSocial;
const personBy = (match: (handle: string, uid: string) => boolean) =>
  sample.people.find((person) => match(person.account.handle, person.account.uid));
vi.mock('@/hooks/useSocial', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSocial')>()),
  findByHandle: async (handle: string) => personBy((h) => h === handle)?.account ?? null,
}));
vi.mock('@/hooks/useSocialFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSocialFeed')>()),
  fetchActivity: async (uid: string) => {
    const person = personBy((_h, u) => u === uid);
    return person ? sampleActivityRead(sample, person) : null;
  },
}));
vi.mock('@/hooks/usePublicProfile', () => ({
  usePublishProfile: () => ({ slug: null, isLoading: false, publish: vi.fn(), unpublish: vi.fn() }),
  fetchPublicProfile: vi.fn(async () => null),
}));
vi.mock('@/hooks/useMediaActions', () => ({ useMediaActions: () => ({ addMedia: vi.fn(), patchMedia: vi.fn() }) }));
vi.mock('@/components/TitleDetailModal', () => ({ TitleDetailModal: () => null }));

const { UserProfileView } = await import('./UserProfileView');

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
    useMediaStore.getState().setMediaList(buildSampleLibrary());
    useMediaStore.getState().setSocialSettings(emptySocialSettings());
    sample = loadSampleSocial(new Date());
  });

  it('una cuenta privada que no te aceptó muestra su tarjeta y nada más', async () => {
    renderAt('/u/dani-demo');
    expect(await screen.findByText('Esta cuenta es privada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Dani/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar seguir/ })).toBeInTheDocument();
  });

  it('una privada que te aceptó muestra su actividad', async () => {
    renderAt('/u/caro-demo');
    expect(await screen.findByRole('article', { name: /Caro le puso 4,5 a La sociedad de la nieve/ })).toBeInTheDocument();
    expect(screen.queryByText('Esta cuenta es privada')).not.toBeInTheDocument();
  });

  it('con un mutuo: recomendar, ver juntos y "En común"', async () => {
    renderAt('/u/ana-demo');
    expect(await screen.findByRole('button', { name: /Recomendar/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Qué miramos juntos/ })).toHaveAttribute('href', '/juntos/ana-demo');
    await userEvent.click(screen.getByRole('tab', { name: 'En común' }));
    expect(screen.getByText(/Sobre \d+ títulos que puntuaron los dos/)).toBeInTheDocument();
    expect(screen.getByText('Les encantó a los dos')).toBeInTheDocument();
  });

  it('la invitación saluda a quien todavía no la sigue', async () => {
    renderAt('/u/eva-demo?invitado=1');
    expect(await screen.findByText(/te invitó a Qué Miro\?/)).toBeInTheDocument();
  });

  it('un usuario que no existe', async () => {
    renderAt('/u/nadie-demo');
    expect(await screen.findByRole('heading', { name: 'Este perfil no existe' })).toBeInTheDocument();
  });
});
