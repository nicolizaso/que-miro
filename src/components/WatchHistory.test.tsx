import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia } from '@/types';

/** Sin sesión: la biblioteca es el store local, que es lo que miran los tests. */
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, authState: 'guest' }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  isFirebaseConfigured: false,
  isMissingDatabaseError: () => false,
}));

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

const { WatchHistory } = await import('@/components/WatchHistory');
const { ToastProvider } = await import('@/contexts/ToastContext');
const { useMediaStore } = await import('@/store');

const base: Omit<SavedMedia, 'updatedAt'> = {
  tmdbId: 7,
  mediaType: 'movie',
  title: 'Matrix',
  posterPath: null,
  backdropPath: null,
  releaseYear: '1999',
  genres: [],
  status: 'completada',
  history: [
    {
      id: 'w1',
      rating: 3,
      text: 'Rara.',
      tags: ['Para pensar'],
      completedAt: '2020-03-01T12:00:00.000Z',
    },
  ],
};

/** Vuelve a renderizar con lo que haya en el store, como la ficha real. */
function Harness() {
  const media = useMediaStore((state) =>
    state.mediaList.find((m) => m.tmdbId === base.tmdbId),
  );
  return media ? <WatchHistory media={media} /> : null;
}

beforeEach(() => {
  act(() => {
    useMediaStore.getState().reset();
    useMediaStore.getState().addMedia(base);
  });
});

afterEach(() => {
  act(() => useMediaStore.getState().reset());
});

describe('WatchHistory', () => {
  it('edita una reseña guardada sin cambiarle la fecha', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /^Editar la reseña/ }));

    // El formulario arranca con lo que ya estaba guardado.
    const textarea = screen.getByRole('textbox', { name: /Comentario/ });
    expect(textarea).toHaveValue('Rara.');
    expect(screen.getByRole('button', { name: 'Para pensar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.clear(textarea);
    await user.type(textarea, 'Mejor de lo que me acordaba.');
    await user.click(screen.getByRole('button', { name: 'Para pensar' }));
    await user.click(screen.getByRole('button', { name: 'Con amigos' }));
    await user.click(screen.getByLabelText('4,5 de 5 estrellas'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const history = useMediaStore.getState().mediaList[0].history!;
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({
      id: 'w1',
      rating: 4.5,
      text: 'Mejor de lo que me acordaba.',
      tags: ['Con amigos'],
      completedAt: '2020-03-01T12:00:00.000Z',
    });
    expect(screen.getByText('Mejor de lo que me acordaba.')).toBeInTheDocument();
  });
});
