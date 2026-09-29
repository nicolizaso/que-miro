import { describe, expect, it } from 'vitest';
import {
  completeProgress,
  formatEpisode,
  isEpisodeWatched,
  isSeriesComplete,
  nextEpisode,
  progressPercent,
  toggleEpisode,
  toggleSeason,
  totalEpisodes,
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
