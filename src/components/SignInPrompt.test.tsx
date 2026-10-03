import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SavedMedia } from '@/types';

const auth = { user: null as { uid: string } | null, authState: 'guest' };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }));

const setDoc = vi.fn(async (..._args: unknown[]) => {});
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteDoc: vi.fn(async () => {}),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));
vi.mock('@/lib/tmdb', () => ({
  getMediaDetail: vi.fn(async () => {
    throw new Error('sin red');
  }),
}));

const { SignInPrompt } = await import('./SignInPrompt');
const { useMediaActions } = await import('@/hooks/useMediaActions');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');
const { readPendingSave } = await import('@/lib/pendingSave');
const { useSignInPrompt } = await import('@/hooks/useSignInPrompt');

function draft(overrides: Partial<SavedMedia> = {}): Omit<SavedMedia, 'updatedAt'> {
  return {
    tmdbId: 1396,
    mediaType: 'tv',
    title: 'Breaking Bad',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2008',
    genres: [],
    status: 'por_ver',
    ...overrides,
  };
}

const outcomes: string[] = [];

function SaveButton({ media }: { media: Omit<SavedMedia, 'updatedAt'> }) {
  const { addMedia } = useMediaActions();
  return (
    <button type="button" onClick={async () => outcomes.push(await addMedia(media))}>
      Guardar {media.title}
    </button>
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/explorar?genero=drama']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/explorar"
            element={
              <>
                <SaveButton media={draft()} />
                <SaveButton media={draft({ tmdbId: 1399, title: 'Game of Thrones' })} />
              </>
            }
          />
          <Route path="/login" element={<Where />} />
        </Routes>
        <SignInPrompt />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('SignInPrompt', () => {
  beforeEach(() => {
    auth.user = null;
    auth.authState = 'guest';
    outcomes.length = 0;
    setDoc.mockClear();
    useMediaStore.getState().reset();
    useSignInPrompt.getState().close();
  });

  it('el invitado que guarda su primer título ve la sugerencia, y todavía no se guardó nada', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));

    expect(await screen.findByRole('dialog', { name: /Breaking Bad.*con una cuenta/ })).toBeInTheDocument();
    expect(outcomes).toEqual(['pending']);
    expect(useMediaStore.getState().mediaList).toHaveLength(0);
  });

  it('seguir sin cuenta guarda en el navegador y no vuelve a preguntar en la visita', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Seguir sin cuenta' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useMediaStore.getState().mediaList.map((m) => m.title)).toEqual(['Breaking Bad']);
    expect(await screen.findByText(/quedó en Por Ver, en este navegador/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar Game of Thrones' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useMediaStore.getState().mediaList).toHaveLength(2);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('crear cuenta lleva al registro y aparta el guardado con la vuelta a la ficha', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/login?modo=registro&guardar=1');
    const pending = readPendingSave();
    expect(pending?.draft.title).toBe('Breaking Bad');
    const back = new URL(pending!.returnTo, 'https://x.test');
    expect(back.pathname).toBe('/explorar');
    expect(back.searchParams.get('genero')).toBe('drama');
    expect(back.searchParams.get('ficha')).toBe('tv:1396');
    expect(useMediaStore.getState().mediaList).toHaveLength(0);
  });

  it('ya tengo cuenta lleva al ingreso', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ya tengo cuenta' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/login?modo=ingreso&guardar=1');
  });

  it('cerrarlo con Escape no guarda, y la próxima vez pregunta de nuevo', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useMediaStore.getState().mediaList).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('con cuenta no se sugiere nada: guarda directo en la cuenta', async () => {
    auth.authState = 'authenticated';
    auth.user = { uid: 'u1' };
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Breaking Bad' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(outcomes).toEqual(['saved']);
    expect(setDoc.mock.calls[0][0]).toEqual({ path: 'users/u1/saved_media/1396' });
  });
});
