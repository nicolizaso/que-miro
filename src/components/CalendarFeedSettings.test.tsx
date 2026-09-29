import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/contexts/ToastContext';
import { CalendarFeedSettings } from './CalendarFeedSettings';

const TOKEN = 'a'.repeat(32);
const URL_ICS = `https://quemiro.app/cal/${TOKEN}.ics`;

const feed = {
  available: true,
  isLoading: false,
  token: null as string | null,
  url: null as string | null,
  activate: vi.fn(),
  regenerate: vi.fn(),
  deactivate: vi.fn(),
};

vi.mock('@/hooks/useCalendarFeed', () => ({ useCalendarFeed: () => feed }));

function renderSettings() {
  return render(
    <ToastProvider>
      <CalendarFeedSettings />
    </ToastProvider>,
  );
}

describe('CalendarFeedSettings', () => {
  beforeEach(() => {
    feed.available = true;
    feed.token = null;
    feed.url = null;
    feed.activate.mockReset();
    feed.regenerate.mockReset();
    feed.deactivate.mockReset();
  });

  it('sin cuenta no existe', () => {
    feed.available = false;
    renderSettings();
    expect(screen.queryByRole('heading', { name: 'Tu calendario en la agenda' })).not.toBeInTheDocument();
  });

  it('se activa de un toque', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Crear la dirección del calendario' }));
    expect(feed.activate).toHaveBeenCalled();
  });

  it('activado, muestra la dirección y cómo agregarla', () => {
    feed.token = TOKEN;
    feed.url = URL_ICS;
    renderSettings();

    expect(screen.getByLabelText('Dirección del calendario')).toHaveValue(URL_ICS);
    expect(screen.getByRole('link', { name: 'Agregar a Google Calendar' })).toHaveAttribute(
      'href',
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://quemiro.app/cal/${TOKEN}.ics`)}`,
    );
    expect(screen.getByRole('link', { name: 'Abrir en Apple Calendar u Outlook' })).toHaveAttribute(
      'href',
      `webcal://quemiro.app/cal/${TOKEN}.ics`,
    );
  });

  it('una dirección nueva se confirma antes, porque la anterior deja de andar', async () => {
    feed.token = TOKEN;
    feed.url = URL_ICS;
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: 'Generar una dirección nueva' }));
    expect(feed.regenerate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('deja de andar');

    await userEvent.click(screen.getByRole('button', { name: 'Generar' }));
    expect(feed.regenerate).toHaveBeenCalled();
  });
});
