import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_OWNER_UID,
  DEMO_SEED,
  buildDemoLibrary,
  enterDemoMode,
  exitDemoMode,
} from './demo';
import { useMediaStore } from '@/store';
import { SavedMedia } from '@/types';

function makeMedia(overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId: 999,
    mediaType: 'movie',
    title: 'Mi película',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2020',
    genres: [],
    status: 'por_ver',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDemoLibrary', () => {
  it('arma un título por cada entrada del seed', () => {
    expect(buildDemoLibrary()).toHaveLength(DEMO_SEED.length);
  });

  it('no repite ids de TMDB', () => {
    const ids = DEMO_SEED.map((entry) => entry.tmdbId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tiene títulos en los tres estados, para que ninguna lista quede vacía', () => {
    const library = buildDemoLibrary();
    for (const status of ['por_ver', 'viendo', 'completada'] as const) {
      expect(library.some((media) => media.status === status)).toBe(true);
    }
  });

  it('le pone reseña a todas las completadas y solo a ellas', () => {
    for (const media of buildDemoLibrary()) {
      expect(Boolean(media.history?.length)).toBe(media.status === 'completada');
    }
  });

  it('las series que se están viendo arrancan con progreso', () => {
    const viendo = buildDemoLibrary().filter((m) => m.status === 'viendo');

    expect(viendo.length).toBeGreaterThan(0);
    for (const media of viendo) {
      expect(Object.keys(media.progress?.watched ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('toda serie con progreso declara sus temporadas', () => {
    // Sin las temporadas no se puede calcular el porcentaje, así que el demo
    // mostraría episodios marcados y ninguna barra.
    for (const media of buildDemoLibrary()) {
      if (media.progress) expect(media.seasons?.length).toBeGreaterThan(0);
    }
  });

  it('el progreso del seed no supera el total de episodios', () => {
    for (const media of buildDemoLibrary()) {
      for (const [number, episodes] of Object.entries(
        media.progress?.watched ?? {},
      )) {
        const season = media.seasons?.find(
          (s) => s.seasonNumber === Number(number),
        );
        expect(season).toBeDefined();
        expect(Math.max(...episodes)).toBeLessThanOrEqual(season!.episodeCount);
      }
    }
  });

  it('le pone tags a algunas reseñas, para que el filtro por ánimo tenga qué mostrar', () => {
    const conTags = buildDemoLibrary().filter((m) =>
      m.history?.some((entry) => entry.tags?.length),
    );

    expect(conTags.length).toBeGreaterThanOrEqual(2);
  });

  it('deja suficientes títulos por ver como para que el picker tenga de dónde elegir', () => {
    const porVer = buildDemoLibrary().filter((m) => m.status === 'por_ver');
    expect(porVer.length).toBeGreaterThanOrEqual(5);
  });

  it('usa fechas pasadas', () => {
    const now = Date.now();
    for (const media of buildDemoLibrary()) {
      expect(new Date(media.updatedAt).getTime()).toBeLessThanOrEqual(now);
    }
  });
});

describe('modo demo', () => {
  beforeEach(() => {
    useMediaStore.getState().reset();
    localStorage.clear();
  });

  it('carga la biblioteca de ejemplo con el dueño ficticio', () => {
    enterDemoMode();

    const { mediaList, ownerUid } = useMediaStore.getState();
    expect(mediaList).toHaveLength(DEMO_SEED.length);
    // Este ownerUid es lo que hace que SyncManager descarte los datos del demo
    // en vez de migrarlos cuando alguien inicia sesión.
    expect(ownerUid).toBe(DEMO_OWNER_UID);
  });

  it('devuelve la biblioteca de invitado al salir', () => {
    const propia = [makeMedia({ tmdbId: 42, title: 'Lo mío' })];
    useMediaStore.getState().setMediaList(propia);

    enterDemoMode();
    expect(useMediaStore.getState().mediaList).toHaveLength(DEMO_SEED.length);

    exitDemoMode();
    const { mediaList, ownerUid } = useMediaStore.getState();
    expect(mediaList).toEqual(propia);
    expect(ownerUid).toBeNull();
  });

  it('no pisa el respaldo si se entra al demo dos veces seguidas', () => {
    const propia = [makeMedia({ tmdbId: 42 })];
    useMediaStore.getState().setMediaList(propia);

    enterDemoMode();
    enterDemoMode();
    exitDemoMode();

    expect(useMediaStore.getState().mediaList).toEqual(propia);
  });

  it('deja la biblioteca vacía si no había nada antes del demo', () => {
    enterDemoMode();
    exitDemoMode();

    expect(useMediaStore.getState().mediaList).toEqual([]);
  });
});
