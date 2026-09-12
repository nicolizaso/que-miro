import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SyncIssueBanner } from './SyncIssueBanner';
import { useSyncStatus } from '@/lib/syncStatus';

afterEach(() => {
  // Dentro de `act` porque este hook corre antes del `cleanup` global: el
  // cartel sigue montado y el cambio de estado lo vuelve a renderizar.
  act(() => useSyncStatus.setState({ issue: null }));
});

/** Fuerza lo que el navegador cree sobre la conexión. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    configurable: true,
  });
}

describe('SyncIssueBanner', () => {
  it('no muestra nada mientras la sincronización anda', () => {
    setOnline(true);
    render(<SyncIssueBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('avisa cuando falta la base de Firestore', () => {
    setOnline(true);
    useSyncStatus.setState({ issue: 'missing-database' });
    render(<SyncIssueBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /no se están sincronizando/i,
    );
  });

  it('avisa cuando las reglas rechazan la cuenta, y dice dónde mirar', () => {
    setOnline(true);
    useSyncStatus.setState({ issue: 'permission-denied' });
    render(<SyncIssueBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(/reglas de Firestore/i);
  });

  it('calla si el problema es la red, que ya avisa el otro cartel', () => {
    setOnline(true);
    useSyncStatus.setState({ issue: 'unreachable' });
    render(<SyncIssueBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calla sin conexión: ahí el aviso correcto es el de offline', () => {
    setOnline(false);
    useSyncStatus.setState({ issue: 'missing-database' });
    render(<SyncIssueBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
    setOnline(true);
  });
});
