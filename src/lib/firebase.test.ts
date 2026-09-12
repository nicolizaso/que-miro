import { describe, expect, it } from 'vitest';
import { isMissingDatabaseError, isPermissionDeniedError } from './firebase';

/**
 * El clasificador decide entre dos carteles muy distintos —"esperá a que
 * vuelva la red" y "andá a crear la base"— así que lo que importa es que no
 * confunda un corte de conexión con una base inexistente.
 */
describe('isMissingDatabaseError', () => {
  it('reconoce el error de Firestore por su código', () => {
    expect(isMissingDatabaseError({ code: 'not-found' })).toBe(true);
  });

  it('reconoce el mensaje que tira el SDK cuando falta la base', () => {
    expect(
      isMissingDatabaseError({
        code: 'unknown',
        message:
          "Database '(default)' not found. Please check your project configuration.",
      }),
    ).toBe(true);
  });

  it('no confunde un corte de red con una base inexistente', () => {
    expect(
      isMissingDatabaseError({
        code: 'unavailable',
        message: 'The client is offline',
      }),
    ).toBe(false);
  });

  it('no confunde un rechazo de las reglas con una base inexistente', () => {
    expect(
      isMissingDatabaseError({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      }),
    ).toBe(false);
  });

  it('tolera lo que no es un error', () => {
    expect(isMissingDatabaseError(null)).toBe(false);
    expect(isMissingDatabaseError('not-found')).toBe(false);
    expect(isMissingDatabaseError(undefined)).toBe(false);
  });
});

describe('isPermissionDeniedError', () => {
  it('reconoce el rechazo de las reglas', () => {
    expect(
      isPermissionDeniedError({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      }),
    ).toBe(true);
  });

  it('no marca como rechazo lo que es falta de base o de red', () => {
    expect(isPermissionDeniedError({ code: 'not-found' })).toBe(false);
    expect(isPermissionDeniedError({ code: 'unavailable' })).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
  });
});
