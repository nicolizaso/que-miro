import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterRail } from './FilterRail';

// jsdom no trae `ResizeObserver`, que la fila usa para prender sus flechas.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const options = [
  { value: 'Drama', label: 'Drama', count: 4 },
  { value: 'Terror', label: 'Terror', count: 0 },
];

function renderRail(value: string | null, onChange = vi.fn()) {
  render(
    <FilterRail
      label="Género"
      name="Filtrar por género"
      allLabel="Todos"
      options={options}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

/** jsdom no hace layout: todo mide 0. Esto finge una fila más ancha que su caja. */
function fakeOverflow() {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FilterRail', () => {
  it('marca la elegida y dice cuántos deja cada una', () => {
    renderRail('Drama');
    const group = screen.getByRole('group', { name: 'Filtrar por género' });

    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drama (4)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('apaga las que dejarían el sorteo vacío', () => {
    renderRail(null);
    expect(screen.getByRole('button', { name: 'Terror (0)' })).toBeDisabled();
  });

  it('la elegida se destoca con otro toque, aunque haya quedado en cero', async () => {
    const onChange = renderRail('Terror');
    const terror = screen.getByRole('button', { name: 'Terror (0)' });

    expect(terror).toBeEnabled();
    await userEvent.click(terror);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sin flechas si todas las píldoras entran', () => {
    renderRail(null);
    expect(screen.queryByRole('button', { name: /opciones .* de género/ })).not.toBeInTheDocument();
  });

  it('con flechas si la fila desborda, y la de volver apagada en la punta', async () => {
    fakeOverflow();
    // jsdom tampoco trae `scrollBy`.
    const scrollBy = vi.fn();
    const original = HTMLElement.prototype.scrollBy;
    HTMLElement.prototype.scrollBy = scrollBy;
    onTestFinished(() => {
      HTMLElement.prototype.scrollBy = original;
    });

    renderRail(null);

    expect(screen.getByRole('button', { name: 'Ver opciones anteriores de género' })).toBeDisabled();
    const next = screen.getByRole('button', { name: 'Ver más opciones de género' });
    expect(next).toBeEnabled();

    await userEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 240 }));
  });
});
