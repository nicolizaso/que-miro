import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterRail } from './FilterRail';

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
});
