import { describe, expect, it } from 'vitest';
import {
  episodeTypeLabel,
  isEpisodeAired,
  seasonTotalRuntime,
  withSeasonRuntime,
} from './episodes';
import { mergeSeasons } from './enrich';
import { SeasonInfo } from '@/types';

describe('isEpisodeAired', () => {
  it('el de hoy cuenta como salido: es el que se mira esta noche', () => {
    expect(isEpisodeAired({ air_date: '2026-09-15' }, '2026-09-15')).toBe(true);
    expect(isEpisodeAired({ air_date: '2026-09-14' }, '2026-09-15')).toBe(true);
  });

  it('el de mañana y el que no tiene fecha, todavía no', () => {
    expect(isEpisodeAired({ air_date: '2026-09-16' }, '2026-09-15')).toBe(false);
    expect(isEpisodeAired({ air_date: null }, '2026-09-15')).toBe(false);
  });
});

describe('seasonTotalRuntime', () => {
  it('suma la duración de cada episodio', () => {
    expect(seasonTotalRuntime([{ runtime: 70 }, { runtime: 45 }, { runtime: 52 }])).toBe(
      167,
    );
  });

  it('si a alguno le falta la duración, no inventa una temporada más corta', () => {
    expect(seasonTotalRuntime([{ runtime: 70 }, { runtime: null }])).toBeUndefined();
    expect(seasonTotalRuntime([])).toBeUndefined();
  });
});

describe('episodeTypeLabel', () => {
  it('nombra los finales y deja callados los episodios comunes', () => {
    expect(episodeTypeLabel('finale')).toBe('Final de temporada');
    expect(episodeTypeLabel('mid_season')).toBe('Mitad de temporada');
    expect(episodeTypeLabel('standard')).toBeNull();
    expect(episodeTypeLabel(null)).toBeNull();
  });
});

const seasons: SeasonInfo[] = [
  { seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 },
  { seasonNumber: 2, name: 'Temporada 2', episodeCount: 10 },
];

describe('withSeasonRuntime', () => {
  it('anota la duración de la temporada pedida', () => {
    expect(withSeasonRuntime(seasons, 2, 520)).toEqual([
      seasons[0],
      { ...seasons[1], totalRuntime: 520 },
    ]);
  });

  it('sin nada que cambiar devuelve null, para no escribir de más', () => {
    expect(withSeasonRuntime(seasons, 5, 520)).toBeNull();
    expect(
      withSeasonRuntime([{ ...seasons[0], totalRuntime: 400 }], 1, 400),
    ).toBeNull();
  });
});

describe('mergeSeasons', () => {
  it('un refresco conserva la duración que ya se conocía', () => {
    const saved = [{ ...seasons[0], totalRuntime: 450 }, seasons[1]];

    expect(mergeSeasons(seasons, saved)).toEqual(saved);
  });

  it('si la temporada sumó episodios, esa duración ya no vale', () => {
    const saved = [{ ...seasons[0], episodeCount: 8, totalRuntime: 400 }];

    expect(mergeSeasons(seasons, saved)?.[0].totalRuntime).toBeUndefined();
  });

  it('sin temporadas guardadas deja las nuevas como vinieron', () => {
    expect(mergeSeasons(seasons, undefined)).toBe(seasons);
    expect(mergeSeasons(undefined, seasons)).toBeUndefined();
  });
});
