import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstallPlatform } from '@/lib/install';
import { ToastProvider } from '@/contexts/ToastContext';
import { usePreferences } from '@/preferences';
import { InstallCard } from './InstallCard';

const install = {
  platform: 'ios-safari' as InstallPlatform,
  isMobile: true,
  promptInstall: vi.fn(async () => true),
};

vi.mock('@/hooks/useInstallPrompt', () => ({ useInstallPrompt: () => install }));

function renderCard() {
  return render(
    <ToastProvider>
      <InstallCard />
    </ToastProvider>,
  );
}

describe('InstallCard', () => {
  beforeEach(() => {
    install.platform = 'ios-safari';
    install.isMobile = true;
    install.promptInstall.mockClear();
    usePreferences.setState({ installCardDismissedAt: null });
  });

  it('en iPhone abre la guía con los pasos de Safari', async () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Tenela a un toque' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Instalar la app' }));

    const guide = screen.getByRole('dialog', { name: 'Instalala en tres toques' });
    expect(guide).toHaveTextContent('Compartir');
    expect(guide).toHaveTextContent('Agregar a inicio');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('en el navegador de otra app manda a Safari y deja copiar el link', async () => {
    install.platform = 'ios-in-app';
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Instalar la app' }));

    expect(screen.getByRole('dialog', { name: 'Abrila en Safari' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
  });

  it('donde el navegador sabe instalar, el botón instala directo', async () => {
    install.platform = 'prompt';
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Instalar la app' }));

    expect(install.promptInstall).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Ahora no" la cierra y lo recuerda en el dispositivo', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }));

    expect(screen.queryByRole('heading', { name: 'Tenela a un toque' })).not.toBeInTheDocument();
    expect(usePreferences.getState().installCardDismissedAt).not.toBeNull();
  });

  it('no aparece instalada, en la compu, ni donde no se puede', () => {
    install.platform = 'installed';
    const { container, rerender } = renderCard();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    install.platform = 'prompt';
    install.isMobile = false;
    rerender(
      <ToastProvider>
        <InstallCard />
      </ToastProvider>,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    install.platform = 'unavailable';
    install.isMobile = true;
    rerender(
      <ToastProvider>
        <InstallCard />
      </ToastProvider>,
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('section')).toBeNull();
  });
});
