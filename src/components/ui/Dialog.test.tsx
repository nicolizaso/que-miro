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

  it('cierra con Escape aunque el elemento enfocado se haya desmontado', async () => {
    // El caso real: un formulario adentro del diálogo se cierra y quien tenía
    // el foco desaparece del DOM. El foco cae en <body>, y con el listener
    // colgado del contenedor el Escape no llegaba nunca.
    function ConFormulario() {
      const [isOpen, setIsOpen] = useState(true);
      const [showInput, setShowInput] = useState(true);

      return (
        <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} label="Con formulario">
          <div>
            {showInput && <input aria-label="Nombre" />}
            <button onClick={() => setShowInput(false)}>Ocultar</button>
          </div>
        </Dialog>
      );
    }

    const user = userEvent.setup();
    render(<ConFormulario />);

    await user.click(screen.getByRole('textbox', { name: 'Nombre' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con dos diálogos apilados, Escape cierra solo el de arriba', async () => {
    // Como se apilan en la app: desde la ficha de un título se abre una
    // confirmación. El segundo se monta por un clic, no en el primer render.
    function Apilados() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(false);

      return (
        <Dialog isOpen={outer} onClose={() => setOuter(false)} label="De abajo">
          <div>
            <button onClick={() => setInner(true)}>Abrir el de arriba</button>
            {inner && (
              <Dialog isOpen onClose={() => setInner(false)} label="De arriba">
                <button>Arriba</button>
              </Dialog>
            )}
          </div>
        </Dialog>
      );
    }

    const user = userEvent.setup();
    render(<Apilados />);
    await user.click(screen.getByRole('button', { name: 'Abrir el de arriba' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    await user.keyboard('{Escape}');

    const remaining = screen.getAllByRole('dialog');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute('aria-label', 'De abajo');
    // El de abajo sigue trabando el scroll: el contador no se desbalanceó.
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('no cierra por el fondo cuando se pide lo contrario', async () => {
    const user = userEvent.setup();
    render(<Harness closeOnBackdrop={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.click(screen.getByRole('dialog'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
