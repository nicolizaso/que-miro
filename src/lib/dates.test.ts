import { describe, expect, it } from 'vitest';
import { formatRelative } from './dates';

describe('formatRelative', () => {
  const now = new Date(2026, 8, 29, 15, 0);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it('lo reciente, en minutos y horas', () => {
    expect(formatRelative(ago(0), now)).toBe('hace un momento');
    expect(formatRelative(ago(1), now)).toBe('hace 1 minuto');
    expect(formatRelative(ago(45), now)).toBe('hace 45 minutos');
    expect(formatRelative(ago(60), now)).toBe('hace 1 hora');
    expect(formatRelative(ago(5 * 60), now)).toBe('hace 5 horas');
  });

  it('después, en días de calendario', () => {
    expect(formatRelative(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe('ayer');
    expect(formatRelative(new Date(2026, 8, 25, 20, 0).toISOString(), now)).toBe('hace 4 días');
  });

  it('pasada una semana, la fecha', () => {
    expect(formatRelative(new Date(2026, 8, 1, 12, 0).toISOString(), now)).toBe('el 1 de septiembre de 2026');
  });

  it('una fecha rota no dice nada, y una del futuro cuenta como recién', () => {
    expect(formatRelative('ayer', now)).toBe('');
    expect(formatRelative(ago(-30), now)).toBe('hace un momento');
  });
});
