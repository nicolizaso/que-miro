import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function Harness() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Guardado con éxito')}>ok</button>
      <button onClick={() => showToast('Algo salió mal', 'error')}>fail</button>
    </div>
  );
}

function renderHarness(autoDismissMs?: number) {
  return render(
    <ToastProvider autoDismissMs={autoDismissMs}>
      <Harness />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  it('muestra el mensaje al dispararse un toast', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'ok' }));

    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();
  });

  it('apila varios toasts a la vez', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'ok' }));
    await user.click(screen.getByRole('button', { name: 'fail' }));

    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
  });

  it('se cierra al tocar el botón de cerrar', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'ok' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    // El nodo se desmonta recién cuando termina la animación de salida.
    await waitFor(() =>
      expect(screen.queryByText('Guardado con éxito')).not.toBeInTheDocument(),
    );
  });

  it('se cierra solo al vencer el temporizador', async () => {
    const user = userEvent.setup();
    renderHarness(50);

    await user.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Guardado con éxito')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByText('Guardado con éxito')).not.toBeInTheDocument(),
    );
  });

  it('useToast falla si se usa fuera del provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Harness />)).toThrow(
      /debe ser utilizado dentro de un ToastProvider/,
    );

    spy.mockRestore();
  });
});
