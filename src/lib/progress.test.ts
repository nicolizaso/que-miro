import { describe, expect, it } from 'vitest';
import {
  airedEpisodes,
  airedInSeason,
  completeProgress,
  detectNewEpisodes,
  episodeHighlights,
  episodeRating,
  formatEpisode,
  hasNewEpisodes,
  hasWatchedAllAired,
  isCaughtUp,
  isEpisodeWatched,
  isSeriesComplete,
  isStillAiring,
  newEpisodesSummary,
  nextEpisode,
  progressPercent,
  rateEpisode,
  ratedEpisodes,
  toggleEpisode,
  toggleSeason,
  totalEpisodes,
  watchedAiredEpisodes,
  watchedEpisodes,
} from './progress';
import { SavedMedia, SeasonInfo } from '@/types';

const SEASONS: SeasonInfo[] = [
  { seasonNumber: 1, name: 'Temporada 1', episodeCount: 3 },
  { seasonNumber: 2, name: 'Temporada 2', episodeCount: 2 },
];

function makeSeries(
  watched: Record<number, number[]> = {},
  seasons: SeasonInfo[] = SEASONS,
): SavedMedia {
  return {
    tmdbId: 1396,
    mediaType: 'tv',
    title: 'Breaking Bad',
    posterPath: null,
    backdropPath: null,
    releaseYear: '2008',
    genres: ['Drama'],
    status: 'viendo',
    updatedAt: '2024-01-01T00:00:00.000Z',
    seasons,
    progress: Object.keys(watched).length > 0 ? { watched } : undefined,
  };
}

describe('conteo de episodios', () => {
  it('suma los episodios de todas las temporadas', () => {
    expect(totalEpisodes(makeSeries())).toBe(5);
  });

  it('no cuenta la temporada 0, que son los especiales', () => {
    const conEspeciales = makeSeries({}, [
      { seasonNumber: 0, name: 'Especiales', episodeCount: 7 },
      ...SEASONS,
    ]);

    expect(totalEpisodes(conEspeciales)).toBe(5);
  });

  it('cuenta los vistos', () => {
    expect(watchedEpisodes(makeSeries({ 1: [1, 2], 2: [1] }))).toBe(3);
  });

  it('no deja que el progreso pase del total si TMDB recortó episodios', () => {
    // La persona marcó cinco episodios de una temporada que ahora dice tener 3.
    const media = makeSeries({ 1: [1, 2, 3, 4, 5] });
    expect(watchedEpisodes(media)).toBe(3);
    expect(progressPercent(media)).toBeLessThanOrEqual(100);
  });

  it('ignora los episodios de temporadas que ya no existen', () => {
    expect(watchedEpisodes(makeSeries({ 1: [1], 99: [1, 2, 3] }))).toBe(1);
  });
});

describe('progressPercent', () => {
  it('devuelve el porcentaje redondeado', () => {
    expect(progressPercent(makeSeries({ 1: [1, 2, 3] }))).toBe(60);
    expect(progressPercent(makeSeries())).toBe(0);
  });

  it('devuelve 0 si no sabemos cuántos episodios tiene', () => {
    expect(progressPercent(makeSeries({ 1: [1] }, []))).toBe(0);
  });
});

describe('isSeriesComplete', () => {
  it('es verdadero solo con todos los episodios marcados', () => {
    expect(isSeriesComplete(makeSeries({ 1: [1, 2, 3], 2: [1, 2] }))).toBe(true);
    expect(isSeriesComplete(makeSeries({ 1: [1, 2, 3] }))).toBe(false);
  });

  it('es falso si no hay temporadas conocidas', () => {
    expect(isSeriesComplete(makeSeries({}, []))).toBe(false);
  });
});

describe('nextEpisode', () => {
  it('devuelve el primer episodio sin marcar', () => {
    expect(nextEpisode(makeSeries({ 1: [1, 2] }))).toEqual({
      seasonNumber: 1,
      episode: 3,
    });
  });

  it('sigue en la temporada siguiente cuando la actual está completa', () => {
    expect(nextEpisode(makeSeries({ 1: [1, 2, 3] }))).toEqual({
      seasonNumber: 2,
      episode: 1,
    });
  });

  it('encuentra un hueco en el medio', () => {
    expect(nextEpisode(makeSeries({ 1: [1, 3] }))).toEqual({
      seasonNumber: 1,
      episode: 2,
    });
  });

  it('es null si no arrancó o si ya la terminó', () => {
    expect(nextEpisode(makeSeries())).toBeNull();
    expect(nextEpisode(makeSeries({ 1: [1, 2, 3], 2: [1, 2] }))).toBeNull();
  });
});

describe('toggleEpisode', () => {
  it('marca un episodio y lo deja ordenado', () => {
    const progress = toggleEpisode({ watched: { 1: [3, 1] } }, 1, 2);
    expect(progress.watched[1]).toEqual([1, 2, 3]);
  });

  it('desmarca un episodio ya marcado', () => {
    const progress = toggleEpisode({ watched: { 1: [1, 2] } }, 1, 2);
    expect(progress.watched[1]).toEqual([1]);
  });

  it('saca la temporada del mapa cuando queda sin episodios', () => {
    const progress = toggleEpisode({ watched: { 1: [1] } }, 1, 1);
    expect(progress.watched[1]).toBeUndefined();
  });

  it('no muta el progreso que recibe', () => {
    const original = { watched: { 1: [1] } };
    toggleEpisode(original, 1, 2);
    expect(original.watched[1]).toEqual([1]);
  });

  it('arranca desde cero si no había progreso', () => {
    expect(toggleEpisode(undefined, 2, 4).watched[2]).toEqual([4]);
  });
});

describe('toggleSeason', () => {
  it('marca la temporada entera', () => {
    const progress = toggleSeason(undefined, SEASONS[0]);
    expect(progress.watched[1]).toEqual([1, 2, 3]);
  });

  it('desmarca una temporada que ya estaba completa', () => {
    const progress = toggleSeason({ watched: { 1: [1, 2, 3] } }, SEASONS[0]);
    expect(progress.watched[1]).toBeUndefined();
  });

  it('completa una temporada empezada a la mitad en vez de desmarcarla', () => {
    const progress = toggleSeason({ watched: { 1: [1] } }, SEASONS[0]);
    expect(progress.watched[1]).toEqual([1, 2, 3]);
  });
});

describe('helpers de lectura', () => {
  it('isEpisodeWatched responde por episodio', () => {
    const progress = { watched: { 1: [1, 3] } };
    expect(isEpisodeWatched(progress, 1, 3)).toBe(true);
    expect(isEpisodeWatched(progress, 1, 2)).toBe(false);
    expect(isEpisodeWatched(undefined, 1, 1)).toBe(false);
  });

  it('formatEpisode arma la etiqueta corta', () => {
    expect(formatEpisode(2, 5)).toBe('T2E5');
  });
});

describe('completeProgress', () => {
  it('marca todos los episodios de todas las temporadas', () => {
    const progress = completeProgress(makeSeries({ 1: [2] }));
    expect(progress?.watched).toEqual({ 1: [1, 2, 3], 2: [1, 2] });
  });

  it('conserva los especiales marcados sin agregar los que faltan', () => {
    const conEspeciales = makeSeries({ 0: [3] }, [
      { seasonNumber: 0, name: 'Especiales', episodeCount: 7 },
      ...SEASONS,
    ]);

    const progress = completeProgress(conEspeciales);
    expect(progress?.watched).toEqual({ 0: [3], 1: [1, 2, 3], 2: [1, 2] });
  });

  it('no hace nada si la serie ya estaba entera', () => {
    expect(completeProgress(makeSeries({ 1: [1, 2, 3], 2: [1, 2] }))).toBeUndefined();
  });

  it('no hace nada sin temporadas conocidas ni en películas', () => {
    expect(completeProgress(makeSeries({}, []))).toBeUndefined();
    expect(completeProgress({ ...makeSeries(), mediaType: 'movie' })).toBeUndefined();
  });
});

describe('lo que ya salió', () => {
  // Una serie en emisión con la tercera temporada cargada de antemano: TMDB ya
  // tiene sus diez episodios, con nombre y fecha, y salieron cuatro.
  const SEASONS_EN_EMISION: SeasonInfo[] = [
    { seasonNumber: 0, name: 'Especiales', episodeCount: 4 },
    { seasonNumber: 1, name: 'Temporada 1', episodeCount: 8 },
    { seasonNumber: 2, name: 'Temporada 2', episodeCount: 10 },
    { seasonNumber: 3, name: 'Temporada 3', episodeCount: 10 },
  ];

  function airing(
    watched: Record<number, number[]> = {},
    overrides: Partial<SavedMedia> = {},
  ): SavedMedia {
    return {
      ...makeSeries(watched, SEASONS_EN_EMISION),
      seriesStatus: 'Returning Series',
      lastAired: { seasonNumber: 3, episodeNumber: 4, airDate: '2026-09-10' },
      nextToAir: { seasonNumber: 3, episodeNumber: 5, airDate: '2026-09-17' },
      ...overrides,
    };
  }

  const TODO_LO_EMITIDO = {
    1: [1, 2, 3, 4, 5, 6, 7, 8],
    2: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    3: [1, 2, 3, 4],
  };

  it('cuenta lo emitido y no lo cargado, sin los especiales', () => {
    const media = airing();
    expect(totalEpisodes(media)).toBe(28);
    expect(airedEpisodes(media)).toBe(22);
    expect(airedInSeason(media, SEASONS_EN_EMISION[3])).toBe(4);
    expect(airedInSeason(media, SEASONS_EN_EMISION[1])).toBe(8);
  });

  it('el porcentaje llega a 100 con todo lo emitido, aunque haya episodios futuros', () => {
    expect(progressPercent(airing(TODO_LO_EMITIDO))).toBe(100);
    expect(isSeriesComplete(airing(TODO_LO_EMITIDO))).toBe(false);
  });

  it('marcar un episodio futuro no infla el porcentaje', () => {
    const media = airing({ 1: [1, 2, 3, 4, 5, 6, 7, 8], 3: [9, 10] });
    expect(watchedAiredEpisodes(media)).toBe(8);
    expect(progressPercent(media)).toBe(36);
  });

  it('al día: viste todo lo emitido de una serie que sigue saliendo', () => {
    expect(isCaughtUp(airing(TODO_LO_EMITIDO))).toBe(true);
    expect(isCaughtUp(airing({ 1: [1, 2] }))).toBe(false);
  });

  it('una terminada no está al día: está terminada', () => {
    const ended = makeSeries({ 1: [1, 2, 3], 2: [1, 2] });
    ended.seriesStatus = 'Ended';

    expect(isStillAiring(ended)).toBe(false);
    expect(isCaughtUp(ended)).toBe(false);
    expect(hasWatchedAllAired(ended)).toBe(true);
  });

  it('los especiales vistos no cuentan para estar al día ni les falta nada', () => {
    const media = airing({ ...TODO_LO_EMITIDO, 0: [1] });
    expect(isCaughtUp(media)).toBe(true);
    expect(progressPercent(media)).toBe(100);
  });

  it('si el último emitido es un especial, se guía por el próximo episodio', () => {
    const media = airing(
      {},
      { lastAired: { seasonNumber: 0, episodeNumber: 4, airDate: '2026-09-01' } },
    );
    // El próximo es T3E5: salió hasta T3E4.
    expect(airedEpisodes(media)).toBe(22);
  });

  it('una serie anunciada sin nada emitido no tiene episodios salidos', () => {
    const media = airing({}, { seriesStatus: 'Planned', lastAired: undefined, nextToAir: undefined });
    expect(airedEpisodes(media)).toBe(0);
    expect(progressPercent(media)).toBe(0);
  });

  it('sin datos de emisión, todo lo cargado cuenta como salido, como antes', () => {
    expect(airedEpisodes(makeSeries())).toBe(5);
    expect(progressPercent(makeSeries({ 1: [1, 2, 3], 2: [1, 2] }))).toBe(100);
  });

  it('el siguiente episodio es uno que ya salió', () => {
    expect(nextEpisode(airing(TODO_LO_EMITIDO))).toBeNull();
    expect(nextEpisode(airing({ 1: [1, 2, 3, 4, 5, 6, 7, 8], 2: [1] }))).toEqual({
      seasonNumber: 2,
      episode: 2,
    });
  });

  it('completar una serie en emisión marca solo lo emitido', () => {
    const progress = completeProgress(airing({ 3: [9] }))!;

    expect(progress.watched[3]).toEqual([1, 2, 3, 4, 9]);
    expect(progress.watched[2]).toHaveLength(10);
    // Los especiales no se agregan.
    expect(progress.watched[0]).toBeUndefined();
  });

  it('completar no hace nada si ya viste todo lo emitido', () => {
    expect(completeProgress(airing(TODO_LO_EMITIDO))).toBeUndefined();
  });

  it('marcar toda una temporada en emisión marca lo que salió', () => {
    const progress = toggleSeason(undefined, SEASONS_EN_EMISION[3], 4);
    expect(progress.watched[3]).toEqual([1, 2, 3, 4]);

    // Y con lo emitido completo, la desmarca.
    expect(toggleSeason(progress, SEASONS_EN_EMISION[3], 4).watched[3]).toBeUndefined();
  });
});

describe('episodios nuevos', () => {
  const T1: SeasonInfo = { seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 };
  const T2: SeasonInfo = { seasonNumber: 2, name: 'Temporada 2', episodeCount: 7 };
  const TODA_T1 = { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
  const NOW = new Date('2026-09-15T12:00:00.000Z');

  function series(overrides: Partial<SavedMedia>): SavedMedia {
    return { ...makeSeries(TODA_T1, [T1]), ...overrides };
  }

  it('una terminada que suma temporada anota desde dónde hay novedades', () => {
    const before = series({ status: 'completada', seriesStatus: 'Ended' });
    const after = { ...before, seasons: [T1, T2], seriesStatus: 'Returning Series' as const };

    expect(detectNewEpisodes(before, after, NOW)).toEqual({
      seasonNumber: 2,
      episodeNumber: 1,
      detectedAt: NOW.toISOString(),
    });
  });

  it('una abandonada no avisa: ahí ya decidiste', () => {
    const before = series({ status: 'abandonada', seriesStatus: 'Ended' });
    const after = { ...before, seasons: [T1, T2], seriesStatus: 'Returning Series' as const };

    expect(detectNewEpisodes(before, after, NOW)).toBeUndefined();
  });

  it('una al día que suma episodios también', () => {
    const before = series({
      status: 'viendo',
      seasons: [T1, T2],
      progress: { watched: { ...TODA_T1, 2: [1, 2] } },
      seriesStatus: 'Returning Series',
      lastAired: { seasonNumber: 2, episodeNumber: 2, airDate: '2026-09-01' },
    });
    const after = {
      ...before,
      lastAired: { seasonNumber: 2, episodeNumber: 4, airDate: '2026-09-15' },
    };

    expect(detectNewEpisodes(before, after, NOW)).toMatchObject({
      seasonNumber: 2,
      episodeNumber: 3,
    });
  });

  it('en una que estás viendo a tu ritmo, otro episodio no es noticia', () => {
    const before = series({
      status: 'viendo',
      seasons: [T1, T2],
      progress: { watched: { 1: [1, 2] } },
      seriesStatus: 'Returning Series',
      lastAired: { seasonNumber: 2, episodeNumber: 2, airDate: '2026-09-01' },
    });
    const after = {
      ...before,
      lastAired: { seasonNumber: 2, episodeNumber: 3, airDate: '2026-09-15' },
    };

    expect(detectNewEpisodes(before, after, NOW)).toBeUndefined();
  });

  it('sin temporadas conocidas antes, no hay con qué comparar', () => {
    const before = series({ status: 'completada', seasons: undefined, progress: undefined });
    expect(detectNewEpisodes(before, { ...before, seasons: [T1, T2] }, NOW)).toBeUndefined();
  });

  it('episodios futuros cargados no son novedades', () => {
    // TMDB cargó la T2 entera, pero no salió nada todavía.
    const before = series({ status: 'completada', seriesStatus: 'Returning Series' });
    const after = {
      ...before,
      seasons: [T1, T2],
      lastAired: { seasonNumber: 1, episodeNumber: 9, airDate: '2025-01-01' },
      nextToAir: { seasonNumber: 2, episodeNumber: 1, airDate: '2026-10-01' },
    };

    expect(detectNewEpisodes(before, after, NOW)).toBeUndefined();
  });

  it('la marca que ya estaba se conserva', () => {
    const marker = { seasonNumber: 2, episodeNumber: 1, detectedAt: '2026-08-01T00:00:00.000Z' };
    const before = series({ status: 'completada', newEpisodesSince: marker });
    expect(detectNewEpisodes(before, { ...before, seasons: [T1, T2] }, NOW)).toBe(marker);
  });

  describe('el aviso', () => {
    const marker = { seasonNumber: 2, episodeNumber: 1, detectedAt: '2026-08-01T00:00:00.000Z' };

    it('una temporada entera sin empezar se nombra como temporada', () => {
      const media = series({ seasons: [T1, T2], newEpisodesSince: marker });
      expect(newEpisodesSummary(media)).toEqual({ count: 7, label: 'T2 nueva' });
    });

    it('si ya la empezaste, cuenta los episodios que faltan', () => {
      const media = series({
        seasons: [T1, T2],
        newEpisodesSince: marker,
        progress: { watched: { ...TODA_T1, 2: [1, 2, 3, 4, 5, 6] } },
      });
      expect(newEpisodesSummary(media)).toEqual({ count: 1, label: '1 episodio nuevo' });
    });

    it('cuenta solo lo que ya salió', () => {
      const media = series({
        seasons: [T1, T2],
        newEpisodesSince: marker,
        lastAired: { seasonNumber: 2, episodeNumber: 2, airDate: '2026-09-10' },
      });
      expect(newEpisodesSummary(media)?.count).toBe(2);
    });

    it('se apaga cuando viste todo lo nuevo', () => {
      const media = series({
        seasons: [T1, T2],
        newEpisodesSince: marker,
        progress: { watched: { ...TODA_T1, 2: [1, 2, 3, 4, 5, 6, 7] } },
      });
      expect(newEpisodesSummary(media)).toBeNull();
      expect(hasNewEpisodes(media)).toBe(false);
    });
  });
});

describe('la fecha de cada episodio', () => {
  const NOW = new Date('2026-08-10T21:30:00.000Z');
  const LATER = new Date('2026-08-12T22:00:00.000Z');
  const T1: SeasonInfo = { seasonNumber: 1, name: 'Temporada 1', episodeCount: 3 };

  it('marcar un episodio anota cuándo, y desmarcarlo lo borra', () => {
    const marked = toggleEpisode(undefined, 1, 2, NOW);
    expect(marked.watchedAt).toEqual({ '1x2': NOW.toISOString() });

    const unmarked = toggleEpisode(marked, 1, 2, LATER);
    expect(unmarked.watchedAt).toBeUndefined();
  });

  it('marcar otro no le cambia la fecha a los que ya estaban', () => {
    const first = toggleEpisode(undefined, 1, 1, NOW);
    const second = toggleEpisode(first, 1, 2, LATER);

    expect(second.watchedAt).toEqual({
      '1x1': NOW.toISOString(),
      '1x2': LATER.toISOString(),
    });
  });

  it('marcar una temporada entera les pone a todos la misma fecha', () => {
    const progress = toggleSeason(undefined, T1, 3, NOW);
    expect(Object.values(progress.watchedAt ?? {})).toEqual([
      NOW.toISOString(),
      NOW.toISOString(),
      NOW.toISOString(),
    ]);
  });

  it('completar la temporada respeta la fecha de lo que ya tenía', () => {
    const first = toggleEpisode(undefined, 1, 1, NOW);
    const progress = toggleSeason(first, T1, 3, LATER);

    expect(progress.watchedAt?.['1x1']).toBe(NOW.toISOString());
    expect(progress.watchedAt?.['1x3']).toBe(LATER.toISOString());
  });

  it('desmarcar la temporada entera borra todas sus fechas', () => {
    const progress = toggleSeason(toggleSeason(undefined, T1, 3, NOW), T1, 3, LATER);
    expect(progress.watchedAt).toBeUndefined();
  });

  it('lo marcado sin fecha sigue sin fecha: no se inventa', () => {
    // Un progreso de antes de que se anotaran las fechas.
    const old = { watched: { 1: [1, 2] } };
    const progress = toggleEpisode(old, 1, 3, NOW);

    expect(progress.watchedAt).toEqual({ '1x3': NOW.toISOString() });
  });

  it('completar la serie fecha solo lo que faltaba', () => {
    const media = makeSeries({ 1: [1] });
    media.progress = { watched: { 1: [1] }, watchedAt: { '1x1': NOW.toISOString() } };

    const progress = completeProgress(media, LATER)!;

    expect(progress.watchedAt?.['1x1']).toBe(NOW.toISOString());
    expect(progress.watchedAt?.['1x2']).toBe(LATER.toISOString());
    expect(progress.watchedAt?.['2x2']).toBe(LATER.toISOString());
  });
});

describe('puntajes por episodio', () => {
  const NOW = new Date('2026-09-20T20:00:00.000Z');
  const watched = { watched: { 1: [1, 2, 3], 2: [1] }, lastWatchedAt: '2026-09-01T00:00:00.000Z' };

  it('se puntúa lo visto, y con 0 se saca', () => {
    const rated = rateEpisode(watched, 1, 2, 4.5)!;
    expect(episodeRating(rated, 1, 2)).toBe(4.5);

    const cleared = rateEpisode(rated, 1, 2, 0)!;
    expect(episodeRating(cleared, 1, 2)).toBeUndefined();
    // Sin puntajes no queda un mapa vacío colgando.
    expect(cleared).not.toHaveProperty('episodeRatings');
  });

  it('lo que no viste no se puede puntuar', () => {
    expect(rateEpisode(watched, 2, 5, 5)).toBe(watched);
    expect(rateEpisode(undefined, 1, 1, 5)).toBeUndefined();
  });

  it('puntuar no es ver: no mueve la última vez que miraste', () => {
    expect(rateEpisode(watched, 1, 1, 3)!.lastWatchedAt).toBe(watched.lastWatchedAt);
  });

  it('desmarcar un episodio se lleva su puntaje, y el resto se queda', () => {
    const rated = { ...watched, episodeRatings: { '1x2': 4, '1x3': 5 } };
    const after = toggleEpisode(rated, 1, 2, NOW);

    expect(after.episodeRatings).toEqual({ '1x3': 5 });
  });

  it('marcar una temporada entera no borra lo puntuado', () => {
    const rated = { ...watched, episodeRatings: { '1x2': 4 } };
    const after = toggleSeason(rated, SEASONS[1], 2, NOW);

    expect(after.episodeRatings).toEqual({ '1x2': 4 });
  });

  it('ordena del mejor al peor y, a igual puntaje, como viene la serie', () => {
    const media = makeSeries({ 1: [1, 2, 3], 2: [1, 2] });
    media.progress!.episodeRatings = { '2x1': 5, '1x3': 5, '1x1': 2, '2x2': 3 };

    expect(ratedEpisodes(media).map((e) => `${e.seasonNumber}x${e.episode}`)).toEqual([
      '1x3',
      '2x1',
      '2x2',
      '1x1',
    ]);
  });

  describe('episodeHighlights', () => {
    it('el mejor, el peor y el promedio de cada temporada con dos o más', () => {
      const media = makeSeries({ 1: [1, 2, 3], 2: [1, 2] });
      media.progress!.episodeRatings = { '1x1': 3, '1x2': 4, '1x3': 5, '2x1': 2 };

      const { best, worst, seasons } = episodeHighlights(media);
      expect(best).toEqual({ seasonNumber: 1, episode: 3, rating: 5 });
      expect(worst).toEqual({ seasonNumber: 2, episode: 1, rating: 2 });
      // La T2 tiene uno solo: no es un promedio.
      expect(seasons).toEqual([{ seasonNumber: 1, average: 4, count: 3 }]);
    });

    it('si todos valen lo mismo, no hay "peor"', () => {
      const media = makeSeries({ 1: [1, 2] });
      media.progress!.episodeRatings = { '1x1': 4, '1x2': 4 };

      const { best, worst } = episodeHighlights(media);
      expect(best?.episode).toBe(1);
      expect(worst).toBeUndefined();
    });

    it('sin puntajes no hay nada', () => {
      expect(episodeHighlights(makeSeries({ 1: [1] }))).toEqual({
        best: undefined,
        worst: undefined,
        seasons: [],
      });
    });

    it('redondea el promedio a un decimal', () => {
      const media = makeSeries({ 1: [1, 2, 3] });
      media.progress!.episodeRatings = { '1x1': 4, '1x2': 4.5, '1x3': 3.5 };
      expect(episodeHighlights(media).seasons[0].average).toBe(4);

      media.progress!.episodeRatings = { '1x1': 5, '1x2': 4.5, '1x3': 4.5 };
      expect(episodeHighlights(media).seasons[0].average).toBe(4.7);
    });
  });
});
