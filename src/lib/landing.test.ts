import { describe, expect, it } from 'vitest';
import { isNewVisitor, landsOnExplore } from './landing';

describe('isNewVisitor', () => {
  it('es quien entra sin cuenta y sin nada guardado', () => {
    expect(isNewVisitor({ isGuest: true, librarySize: 0 })).toBe(true);
  });

  it('deja de serlo apenas guarda algo', () => {
    expect(isNewVisitor({ isGuest: true, librarySize: 1 })).toBe(false);
  });

  it('con cuenta no lo es aunque la biblioteca todavía no haya bajado', () => {
    expect(isNewVisitor({ isGuest: false, librarySize: 0 })).toBe(false);
  });
});

describe('landsOnExplore', () => {
  it('al abrir la app sin nada guardado, va a Explorar', () => {
    expect(landsOnExplore({ isGuest: true, librarySize: 0, isInitialLoad: true })).toBe(true);
  });

  it('si llega a sus listas navegando, se queda ahí', () => {
    expect(landsOnExplore({ isGuest: true, librarySize: 0, isInitialLoad: false })).toBe(false);
  });

  it('con algo guardado, abre en sus listas', () => {
    expect(landsOnExplore({ isGuest: true, librarySize: 3, isInitialLoad: true })).toBe(false);
  });

  it('con cuenta, abre en sus listas', () => {
    expect(landsOnExplore({ isGuest: false, librarySize: 0, isInitialLoad: true })).toBe(false);
  });
});
