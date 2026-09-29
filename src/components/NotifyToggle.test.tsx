import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedMedia } from '@/types';
import type { PushSupport } from '@/lib/push';
import { NotifyToggle } from './NotifyToggle';

const push = {
  available: true,
  support: 'supported' as PushSupport,
  busy: false,
  toggleSeries: vi.fn(),
};

vi.mock('@/hooks/usePush', () => ({ usePush: () => push }));

function show(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-09-01T00:00:00.000Z',
    seriesStatus: 'Returning Series',
    ...overrides,
  };
}

describe('NotifyToggle', () => {
  beforeEach(() => {
    push.available = true;
    push.support = 'supported';
    push.toggleSeries.mockReset();
  });

  it('es un interruptor que dice si está prendido', async () => {
    const { rerender } = render(<NotifyToggle media={show()} />);
    const button = screen.getByRole('button', { name: 'Avisame de episodios nuevos' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);
    expect(push.toggleSeries).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 95396 }));

    rerender(<NotifyToggle media={show({ notify: true })} />);
    expect(screen.getByRole('button', { name: 'Avisame de episodios nuevos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('en iPhone con Safari explica cómo instalarla en vez de mostrar un botón que no anda', () => {
    push.support = 'install-first';
    render(<NotifyToggle media={show()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Agregar a inicio/)).toBeInTheDocument();
  });

  it('no aparece donde no puede andar', () => {
    const { container, rerender } = render(<NotifyToggle media={show({ seriesStatus: 'Ended' })} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<NotifyToggle media={show({ status: 'abandonada' })} />);
    expect(container).toBeEmptyDOMElement();

    push.support = 'unsupported';
    rerender(<NotifyToggle media={show()} />);
    expect(container).toBeEmptyDOMElement();

    push.available = false;
    push.support = 'supported';
    rerender(<NotifyToggle media={show()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uno prendido se puede apagar desde cualquier dispositivo', () => {
    push.support = 'unsupported';
    render(<NotifyToggle media={show({ notify: true })} />);
    expect(screen.getByRole('button', { name: 'Avisame de episodios nuevos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
