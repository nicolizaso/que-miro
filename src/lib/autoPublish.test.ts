import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoPublisher } from './autoPublish';

const DEBOUNCE = 30_000;
const MIN_INTERVAL = 5 * 60_000;

describe('createAutoPublisher', () => {
  let published: string[];
  let lastAt: number | null;
  let online: boolean;

  function publisher() {
    return createAutoPublisher<string>({
      debounceMs: DEBOUNCE,
      minIntervalMs: MIN_INTERVAL,
      lastPublishedAt: () => lastAt,
      isPublished: (value) => published.at(-1) === value,
      publish: (value) => {
        published.push(value);
        lastAt = Date.now();
      },
      isOnline: () => online,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
    published = [];
    lastAt = null;
    online = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('espera a que las cosas se queden quietas y publica lo último, una vez', () => {
    const auto = publisher();
    auto.schedule('una reseña');
    vi.advanceTimersByTime(DEBOUNCE - 1);
    auto.schedule('una reseña, corregida');
    vi.advanceTimersByTime(DEBOUNCE - 1);
    expect(published).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(published).toEqual(['una reseña, corregida']);
  });

  it('no escribe lo que ya está publicado', () => {
    published = ['lo mismo'];
    const auto = publisher();
    auto.schedule('lo mismo');
    vi.advanceTimersByTime(DEBOUNCE);
    expect(published).toEqual(['lo mismo']);
  });

  it('respeta el mínimo entre publicaciones', () => {
    lastAt = Date.now() - 60_000;
    const auto = publisher();
    auto.schedule('otra');

    vi.advanceTimersByTime(MIN_INTERVAL - 60_000 - 1);
    expect(published).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(published).toEqual(['otra']);
  });

  it('sin red no intenta, ni en loop: publica lo último cuando vuelve', () => {
    online = false;
    const auto = publisher();
    auto.schedule('versión 1');
    vi.advanceTimersByTime(DEBOUNCE);
    auto.schedule('versión 2');
    vi.advanceTimersByTime(DEBOUNCE * 10);
    expect(published).toEqual([]);
    // Nada quedó programado: sin red no se reintenta solo.
    expect(vi.getTimerCount()).toBe(0);

    online = true;
    auto.online();
    vi.advanceTimersByTime(DEBOUNCE);
    expect(published).toEqual(['versión 2']);
  });

  it('volver a tener red sin nada pendiente no hace nada', () => {
    const auto = publisher();
    auto.online();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancelar descarta lo pendiente', () => {
    const auto = publisher();
    auto.schedule('algo');
    auto.cancel();
    vi.advanceTimersByTime(MIN_INTERVAL);
    expect(published).toEqual([]);
  });
});
