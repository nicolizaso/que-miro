import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    authState: 'guest',
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    registerWithEmail: vi.fn(),
  }),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }));
vi.mock('@/lib/tmdb', () => ({
  getMediaDetail: vi.fn(async () => {
    throw new Error('sin red');
  }),
}));

const { LoginView } = await import('./LoginView');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { hasChosenGuest, readPendingSave, savePendingSave } = await import('@/lib/pendingSave');

const draft = {
  tmdbId: 1396,
  mediaType: 'tv' as const,
  title: 'Breaking Bad',
  posterPath: null,
  backdropPath: null,
  releaseYear: '2008',
  genres: [],
  status: 'por_ver' as const,
};

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderLogin(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('LoginView', () => {
  beforeEach(() => {
    useMediaStore.getState().reset();
    savePendingSave({ draft, returnTo: '/explorar?ficha=tv:1396' });
  });

  it('desde el cartel de crear cuenta abre en el registro y cuenta qué va a guardar', () => {
    renderLogin('/login?modo=registro&guardar=1');
    expect(screen.getByRole('heading', { name: 'Registrarse' })).toBeInTheDocument();
    expect(screen.getByText('Creá tu cuenta y guardamos "Breaking Bad" en Por Ver.')).toBeInTheDocument();
  });

  it('volver sin entrar guarda igual en el navegador y vuelve a donde estaba', async () => {
    renderLogin('/login?modo=ingreso&guardar=1');
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Seguir sin cuenta' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/explorar?ficha=tv:1396');
    expect(useMediaStore.getState().mediaList.map((m) => m.title)).toEqual(['Breaking Bad']);
    expect(readPendingSave()).toBeNull();
    expect(hasChosenGuest()).toBe(true);
  });

  it('entrar por otro camino descarta un guardado que quedó de antes', () => {
    renderLogin('/login');
    expect(readPendingSave()).toBeNull();
    expect(screen.getByText(/se sincroniza entre el celular y la compu/)).toBeInTheDocument();
  });
});
