import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';

/** El último callback que registró el provider: es por donde Firebase avisa. */
let emitAuth: (user: User | null) => void = () => {};

vi.mock('@/lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  isFirebaseConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: User | null) => void) => {
    emitAuth = callback;
    return () => {};
  },
  signOut: vi.fn(async () => emitAuth(null)),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
}));

vi.mock('@/lib/demo', () => ({ enterDemoMode: vi.fn(), exitDemoMode: vi.fn() }));
vi.mock('@/lib/pushDevice', () => ({ releasePushDevice: vi.fn(async () => {}) }));
vi.mock('@/lib/rescue', () => ({ saveRescue: vi.fn() }));

const { AuthProvider, useAuth } = await import('./AuthContext');
const { useMediaStore } = await import('@/store');
const { saveRescue } = await import('@/lib/rescue');

const DUNA = {
  tmdbId: 438631,
  mediaType: 'movie' as const,
  title: 'Duna',
  posterPath: null,
  backdropPath: null,
  releaseYear: '2021',
  genres: [],
  status: 'por_ver' as const,
  updatedAt: '',
};

let actions: ReturnType<typeof useAuth>;

function Probe() {
  actions = useAuth();
  return <p data-testid="estado">{actions.authState}</p>;
}

function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const estado = () => screen.getByTestId('estado').textContent;

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    useMediaStore.getState().reset();
    vi.mocked(saveRescue).mockClear();
  });

  it('sin sesión se entra como invitado, sin pasar por el login', () => {
    renderProvider();
    act(() => emitAuth(null));
    expect(estado()).toBe('guest');
  });

  it('el demo que quedó abierto sigue siendo el demo', () => {
    localStorage.setItem('que-miro-demo', 'true');
    renderProvider();
    act(() => emitAuth(null));
    expect(estado()).toBe('demo');
  });

  it('salir del demo deja la app sin cuenta, no en el login', () => {
    renderProvider();
    act(() => emitAuth(null));
    act(() => actions.startDemo());
    expect(estado()).toBe('demo');
    act(() => actions.stopDemo());
    expect(estado()).toBe('guest');
  });

  it('si la sesión se va sola, la biblioteca de la cuenta no queda a la vista', () => {
    useMediaStore.getState().setMediaList([DUNA]);
    useMediaStore.getState().setOwnerUid('uid-ana');
    renderProvider();
    act(() => emitAuth(null));
    expect(estado()).toBe('guest');
    expect(useMediaStore.getState().mediaList).toEqual([]);
    // Nunca llegó al servidor: se guarda la copia de rescate antes de vaciar.
    expect(saveRescue).toHaveBeenCalledOnce();
  });

  it('lo guardado sin cuenta se queda: es del invitado', () => {
    useMediaStore.getState().setMediaList([DUNA]);
    renderProvider();
    act(() => emitAuth(null));
    expect(useMediaStore.getState().mediaList).toHaveLength(1);
  });

  it('cerrar sesión deja la app sin cuenta, no en el login', async () => {
    renderProvider();
    act(() => emitAuth({ uid: 'uid-ana' } as User));
    expect(estado()).toBe('authenticated');
    await act(() => actions.logout());
    expect(estado()).toBe('guest');
  });
});
