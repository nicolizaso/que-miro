import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

/** Página mínima con un disparador afuera y dos botones adentro del diálogo. */
function Harness({ closeOnBackdrop = true }: { closeOnBackdrop?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Abrir</button>
      <button>Botón de la página</button>
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        label="Diálogo de prueba"
        closeOnBackdrop={closeOnBackdrop}
      >
        <div>
          <button>Primero</button>
          <button>Último</button>
        </div>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('no renderiza nada mientras está cerrado', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al abrir mueve el foco adentro', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus();
  });

  it('atrapa el foco: desde el último elemento Tab vuelve al primero', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();

    // Sin la trampa, este Tab se iría al contenido de la página de atrás.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus();
  });

  it('con Shift+Tab desde el primero salta al último', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();
  });

  it('cierra con Escape y devuelve el foco al disparador', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('traba el scroll del fondo mientras está abierto', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('cierra al hacer clic en el fondo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.click(screen.getByRole('dialog'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no cierra por el fondo cuando se pide lo contrario', async () => {
    const user = userEvent.setup();
    render(<Harness closeOnBackdrop={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.click(screen.getByRole('dialog'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
