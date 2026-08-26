import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolveTheme } from './theme';

/** Simula la respuesta del sistema operativo a `prefers-color-scheme: dark`. */
function mockSystemPrefersDark(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? prefersDark : !prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('resolveTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve tal cual una preferencia explícita', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('consulta al sistema cuando la preferencia es "system"', () => {
    mockSystemPrefersDark(true);
    expect(resolveTheme('system')).toBe('dark');

    mockSystemPrefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML =
      '<meta name="theme-color" content="#000000" />';
    mockSystemPrefersDark(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fija el atributo con una preferencia explícita', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('saca el atributo con "system", para que mande el CSS', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('actualiza el color de la barra del navegador', () => {
    const meta = () =>
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

    applyTheme('light');
    expect(meta()).toBe('#faf8f5');

    applyTheme('dark');
    expect(meta()).toBe('#0b0d0e');
  });
});
