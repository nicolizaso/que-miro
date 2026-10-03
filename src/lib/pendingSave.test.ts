import { describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import {
  PENDING_SAVE_KEY,
  PENDING_SAVE_TTL_MS,
  chooseGuest,
  clearPendingSave,
  hasChosenGuest,
  readPendingSave,
  replayStep,
  returnPathFor,
  savePendingSave,
  shouldPromptSignIn,
} from './pendingSave';
import { parseFicha } from './deepLink';

const draft = {
  tmdbId: 1396,
  mediaType: 'tv' as const,
  title: 'Breaking Bad',
  posterPath: null,
  backdropPath: null,
  releaseYear: '2008',
  genres: [],
  status: 'por_ver' as const,
};

function saved(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return { ...draft, updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('shouldPromptSignIn', () => {
  it('le sugiere entrar al invitado que guarda por primera vez', () => {
    expect(shouldPromptSignIn({ authState: 'guest', isFirebaseConfigured: true, choseGuest: false })).toBe(true);
  });

  it('no insiste si ya eligió seguir sin cuenta', () => {
    expect(shouldPromptSignIn({ authState: 'guest', isFirebaseConfigured: true, choseGuest: true })).toBe(false);
  });

  it('sin Firebase no hay cuenta a la que entrar', () => {
    expect(shouldPromptSignIn({ authState: 'guest', isFirebaseConfigured: false, choseGuest: false })).toBe(false);
  });

  it('ni con cuenta ni mientras se resuelve la sesión', () => {
    for (const authState of ['authenticated', 'loading']) {
      expect(shouldPromptSignIn({ authState, isFirebaseConfigured: true, choseGuest: false })).toBe(false);
    }
  });
});

describe('la elección de seguir sin cuenta', () => {
  it('se recuerda durante la visita', () => {
    expect(hasChosenGuest()).toBe(false);
    chooseGuest();
    expect(hasChosenGuest()).toBe(true);
  });

  it('sin sessionStorage usable, la app sigue andando', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => chooseGuest(broken)).not.toThrow();
    expect(hasChosenGuest(broken)).toBe(false);
    expect(readPendingSave(Date.now(), broken)).toBeNull();
  });
});

describe('returnPathFor', () => {
  it('vuelve a la misma página con la ficha abierta', () => {
    const path = returnPathFor('/explorar', '', draft);
    const url = new URL(path, 'https://x.test');
    expect(url.pathname).toBe('/explorar');
    expect(parseFicha(url.searchParams.get('ficha'))).toEqual({ mediaType: 'tv', tmdbId: 1396 });
  });

  it('conserva los filtros con los que estaba explorando', () => {
    const url = new URL(returnPathFor('/picker', '?genero=drama', draft), 'https://x.test');
    expect(url.searchParams.get('genero')).toBe('drama');
    expect(url.searchParams.get('ficha')).toBe('tv:1396');
  });

  it('en una lista compartida vuelve a la lista, sin ficha', () => {
    expect(returnPathFor('/l/abc', '', draft)).toBe('/l/abc');
  });
});

describe('el guardado pendiente', () => {
  const now = Date.parse('2026-10-03T12:00:00.000Z');

  it('sobrevive al viaje por el login', () => {
    savePendingSave({ draft, returnTo: '/explorar?ficha=tv:1396' }, now);
    expect(readPendingSave(now + 60_000)).toMatchObject({ draft, returnTo: '/explorar?ficha=tv:1396' });
  });

  it('vence: un login mucho después ya no es lo que estaba haciendo', () => {
    savePendingSave({ draft, returnTo: '/' }, now);
    expect(readPendingSave(now + PENDING_SAVE_TTL_MS + 1)).toBeNull();
  });

  it('se borra', () => {
    savePendingSave({ draft, returnTo: '/' }, now);
    clearPendingSave();
    expect(readPendingSave(now)).toBeNull();
  });

  it('pasa por parseMedia: lo que no es un título no entra', () => {
    sessionStorage.setItem(
      PENDING_SAVE_KEY,
      JSON.stringify({ draft: { tmdbId: -1, title: '' }, returnTo: '/', savedAt: now }),
    );
    expect(readPendingSave(now)).toBeNull();
    sessionStorage.setItem(PENDING_SAVE_KEY, '{roto');
    expect(readPendingSave(now)).toBeNull();
  });

  it('solo vuelve a rutas de la app, nunca a otro sitio', () => {
    for (const returnTo of ['https://malo.test', '//malo.test', 'javascript:alert(1)']) {
      sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify({ draft, returnTo, savedAt: now }));
      expect(readPendingSave(now)).toBeNull();
    }
  });
});

describe('replayStep', () => {
  it('si la cuenta no lo tenía, lo agrega', () => {
    expect(replayStep(draft, undefined)).toEqual({ kind: 'add' });
  });

  it('si ya lo tenía en otra lista, solo lo cambia de lista: no le pisa el historial', () => {
    expect(replayStep(draft, saved({ status: 'completada' }))).toEqual({ kind: 'status', status: 'por_ver' });
  });

  it('si ya estaba donde lo quería, no hace nada', () => {
    expect(replayStep(draft, saved())).toEqual({ kind: 'none' });
  });
});
