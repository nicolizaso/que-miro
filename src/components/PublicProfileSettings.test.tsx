import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import { buildPublicProfile } from '@/lib/publicProfile';
import { PublicProfileSettings } from './PublicProfileSettings';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'user-1', displayName: 'Nico' }, authState: 'authenticated' }),
}));

const published = {
  ...buildPublicProfile({ slug: 'nico', uid: 'user-1', displayName: 'Nico', mediaList: [] }),
  publishedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
};

const hook = {
  slug: 'nico' as string | null,
  published: published as typeof published | null,
  isLoading: false,
  canPublish: true,
  publish: vi.fn(),
  unpublish: vi.fn(),
  setAutoUpdate: vi.fn(),
};

vi.mock('@/hooks/usePublicProfile', () => ({
  PublishError: class extends Error {},
  usePublishProfile: () => hook,
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <PublicProfileSettings />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('PublicProfileSettings', () => {
  beforeEach(() => {
    hook.published = published;
    hook.setAutoUpdate.mockReset();
  });

  it('dice cuándo se actualizó y que se pone al día solo', () => {
    renderSettings();
    expect(screen.getByText('hace 3 minutos')).toBeInTheDocument();
    expect(screen.getByText(/se pone al día sola/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Mantener actualizado/ })).toBeChecked();
  });

  it('la opción se puede apagar, y entonces pide actualizar a mano', async () => {
    const { rerender } = renderSettings();
    await userEvent.click(screen.getByRole('checkbox', { name: /Mantener actualizado/ }));
    expect(hook.setAutoUpdate).toHaveBeenCalledWith(false);

    hook.published = { ...published, autoUpdate: false };
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <PublicProfileSettings />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('checkbox', { name: /Mantener actualizado/ })).not.toBeChecked();
    expect(screen.getByText(/tocá "Actualizar"/)).toBeInTheDocument();
  });
});
