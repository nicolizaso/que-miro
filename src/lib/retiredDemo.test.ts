import { beforeEach, describe, expect, it } from 'vitest';
import { SavedMedia } from '@/types';
import { useMediaStore } from '@/store';
import { emptyPicks } from '@/lib/picks';
import { emptyRestrictions } from '@/lib/restrictions';
import { DEMO_FLAG_KEY, DEMO_OWNER_UID, PRE_DEMO_KEY, parsePreDemo, retireDemo } from './retiredDemo';

function media(tmdbId: number, title: string): SavedMedia {
  return {
    tmdbId,
    mediaType: 'movie',
    title,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'por_ver',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Alguien que estaba en el demo cuando se sacó. */
function inDemo(snapshot?: unknown) {
  useMediaStore.setState({
    mediaList: [media(1, 'De ejemplo')],
    ownerUid: DEMO_OWNER_UID,
    picks: { ...emptyPicks(), updatedAt: '2026-01-01T00:00:00.000Z' },
  });
  localStorage.setItem(DEMO_FLAG_KEY, 'true');
  if (snapshot !== undefined) localStorage.setItem(PRE_DEMO_KEY, JSON.stringify(snapshot));
}

describe('retireDemo', () => {
  beforeEach(() => {
    useMediaStore.getState().reset();
  });

  it('a quien estaba en el demo le devuelve lo que tenía antes de entrar', () => {
    const restrictions = { ...emptyRestrictions(), updatedAt: '2025-06-01T00:00:00.000Z' };
    inDemo({ media: [media(2, 'La mía')], restrictions });
    retireDemo();

    const state = useMediaStore.getState();
    expect(state.mediaList.map((m) => m.title)).toEqual(['La mía']);
    expect(state.restrictions.updatedAt).toBe('2025-06-01T00:00:00.000Z');
    expect(state.ownerUid).toBeNull();
    expect(localStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
    expect(localStorage.getItem(PRE_DEMO_KEY)).toBeNull();
  });

  it('si no tenía nada antes, queda vacío: los títulos de ejemplo no son suyos', () => {
    inDemo();
    retireDemo();
    expect(useMediaStore.getState().mediaList).toEqual([]);
    expect(useMediaStore.getState().ownerUid).toBeNull();
  });

  it('la biblioteca de ejemplo se reconoce aunque se haya perdido la marca', () => {
    inDemo();
    localStorage.removeItem(DEMO_FLAG_KEY);
    retireDemo();
    expect(useMediaStore.getState().mediaList).toEqual([]);
  });

  it('a un invitado común no le toca nada', () => {
    useMediaStore.setState({ mediaList: [media(3, 'Suya')], ownerUid: null });
    retireDemo();
    expect(useMediaStore.getState().mediaList.map((m) => m.title)).toEqual(['Suya']);
  });

  it('a una cuenta no le toca la biblioteca, pero limpia las marcas viejas', () => {
    useMediaStore.setState({ mediaList: [media(4, 'De la cuenta')], ownerUid: 'u1' });
    localStorage.setItem(PRE_DEMO_KEY, JSON.stringify({ media: [media(5, 'Vieja')] }));
    retireDemo();
    expect(useMediaStore.getState().mediaList.map((m) => m.title)).toEqual(['De la cuenta']);
    expect(localStorage.getItem(PRE_DEMO_KEY)).toBeNull();
  });
});

describe('parsePreDemo', () => {
  it('entiende la copia del formato viejo, un array pelado', () => {
    expect(parsePreDemo(JSON.stringify([media(6, 'Vieja')])).media.map((m) => m.title)).toEqual(['Vieja']);
  });

  it('pasa los títulos por parseMedia: lo roto no entra', () => {
    const data = parsePreDemo(JSON.stringify({ media: [media(7, 'Buena'), { tmdbId: -1 }] }));
    expect(data.media.map((m) => m.title)).toEqual(['Buena']);
  });

  it('una copia ilegible no rompe el arranque', () => {
    expect(parsePreDemo('{roto').media).toEqual([]);
    expect(parsePreDemo(null).media).toEqual([]);
  });
});
