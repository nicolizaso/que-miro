import { describe, expect, it } from 'vitest';
import { SavedMedia, TMDbSeason } from '@/types';
import {
  addDays,
  buildCalendar,
  endOfWeek,
  episodesLabel,
  seasonKey,
  seasonsToFetch,
} from './calendar';

/** Un miércoles. */
const TODAY = '2026-09-16';

function series(tmdbId: number, overrides: Partial<SavedMedia> = {}): SavedMedia {
  return {
    tmdbId,
    mediaType: 'tv',
    title: `Serie ${tmdbId}`,
    posterPath: null,
    backdropPath: null,
    releaseYear: '2022',
    genres: [],
    status: 'viendo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    seriesStatus: 'Returning Series',
    seasons: [
      { seasonNumber: 1, name: 'Temporada 1', episodeCount: 8 },
      { seasonNumber: 2, name: 'Temporada 2', episodeCount: 8 },
    ],
    ...overrides,
  };
}

function next(season: number, episode: number, airDate: string, name?: string) {
  return { seasonNumber: season, episodeNumber: episode, airDate, ...(name ? { name } : {}) };
}

function season(number: number, dates: string[]): TMDbSeason {
  return {
    season_number: number,
    name: `Temporada ${number}`,
    episodes: dates.map((date, index) => ({
      episode_number: index + 1,
      name: `Episodio ${index + 1}`,
      overview: '',
      air_date: date,
      runtime: null,
      still_path: null,
      vote_average: 0,
      episode_type: null,
    })),
  };
}

describe('las semanas', () => {
  it('van de lunes a domingo', () => {
    expect(endOfWeek('2026-09-16')).toBe('2026-09-20'); // miércoles → domingo
    expect(endOfWeek('2026-09-20')).toBe('2026-09-20'); // el domingo cierra la suya
    expect(endOfWeek('2026-09-21')).toBe('2026-09-27'); // el lunes abre otra
  });

  it('se cuentan en días, cruzando meses y años', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('buildCalendar', () => {
  it('agrupa en hoy, esta semana, próximas semanas y más adelante', () => {
    const list = [
      series(1, { nextToAir: next(2, 3, TODAY) }),
      series(2, { nextToAir: next(2, 3, '2026-09-19') }),
      series(3, { nextToAir: next(2, 3, '2026-10-05') }),
      series(4, { nextToAir: next(2, 3, '2026-12-01') }),
    ];

    const { groups } = buildCalendar(list, TODAY);

    expect(groups.map((group) => [group.label, group.items.map((i) => i.media.tmdbId)])).toEqual([
      ['Hoy', [1]],
      ['Esta semana', [2]],
      ['Próximas semanas', [3]],
      ['Más adelante', [4]],
    ]);
  });

  it('deja afuera los grupos vacíos', () => {
    const { groups } = buildCalendar([series(1, { nextToAir: next(2, 3, TODAY) })], TODAY);
    expect(groups.map((group) => group.id)).toEqual(['hoy']);
  });

  it('entran Viendo, las terminadas que siguen saliendo y lo de Por Ver con estreno', () => {
    const list = [
      series(1, { status: 'viendo', nextToAir: next(2, 3, '2026-09-18') }),
      series(2, { status: 'completada', nextToAir: next(3, 1, '2026-09-18') }),
      series(3, {
        status: 'por_ver',
        seriesStatus: 'Planned',
        nextToAir: next(1, 1, '2026-09-18'),
      }),
      {
        ...series(4, { status: 'por_ver' }),
        mediaType: 'movie' as const,
        releaseDate: '2026-09-18',
      },
    ];

    const ids = buildCalendar(list, TODAY).groups.flatMap((group) =>
      group.items.map((item) => item.media.tmdbId),
    );
    expect(ids.sort()).toEqual([1, 2, 3, 4]);
  });

  it('deja afuera lo terminado que ya no sale y lo que ya pasó', () => {
    const list = [
      series(1, { status: 'completada', seriesStatus: 'Ended' }),
      series(2, { nextToAir: next(2, 3, '2026-09-10') }),
      series(3, { status: 'por_ver' }),
    ];

    expect(buildCalendar(list, TODAY).groups).toEqual([]);
  });

  it('las series en emisión sin fecha van en "Sin fecha confirmada"', () => {
    const { undated, groups } = buildCalendar([series(1), series(2, { title: 'Arranca' })], TODAY);

    expect(groups).toEqual([]);
    expect(undated.map((media) => media.title)).toEqual(['Arranca', 'Serie 1']);
  });

  it('con la temporada pedida lista todos sus episodios con fecha', () => {
    const media = series(1, { nextToAir: next(2, 3, '2026-09-18', 'El tres') });
    const seasons = new Map([
      [
        seasonKey(1, 2),
        season(2, ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02']),
      ],
    ]);

    const items = buildCalendar([media], TODAY, seasons).groups.flatMap((g) => g.items);

    expect(items.map((item) => [item.date, episodesLabel(item)])).toEqual([
      ['2026-09-18', 'T2E3'],
      ['2026-09-25', 'T2E4'],
      ['2026-10-02', 'T2E5'],
    ]);
    // El de `nextToAir` no aparece dos veces, y conserva su nombre.
    expect(items[0].episodes).toEqual([{ seasonNumber: 2, episodeNumber: 3, name: 'El tres' }]);
  });

  it('una temporada que sale entera de una vez es una sola entrada', () => {
    const media = series(1, {
      status: 'completada',
      nextToAir: next(3, 1, '2026-09-18'),
      seasons: [
        { seasonNumber: 1, name: 'Temporada 1', episodeCount: 8 },
        { seasonNumber: 3, name: 'Temporada 3', episodeCount: 4 },
      ],
    });
    const seasons = new Map([[seasonKey(1, 3), season(3, Array(4).fill('2026-09-18'))]]);

    const [item] = buildCalendar([media], TODAY, seasons).groups[0].items;

    expect(episodesLabel(item)).toBe('T3E1–E4');
    expect(item.isWholeSeason).toBe(true);
    expect(item.isPremiere).toBe(true);
  });

  it('ordena por día y, el mismo día, por título', () => {
    const list = [
      series(1, { title: 'Zeta', nextToAir: next(1, 2, '2026-09-18') }),
      series(2, { title: 'Alfa', nextToAir: next(1, 2, '2026-09-18') }),
      series(3, { title: 'Beta', nextToAir: next(1, 2, '2026-09-17') }),
    ];

    const [week] = buildCalendar(list, TODAY).groups;
    expect(week.items.map((item) => item.media.title)).toEqual(['Beta', 'Alfa', 'Zeta']);
  });
});

describe('seasonsToFetch', () => {
  it('pide la temporada solo de lo que sale en el próximo mes', () => {
    const list = [
      series(1, { nextToAir: next(2, 3, '2026-09-20') }),
      series(2, { nextToAir: next(4, 1, '2026-12-20') }),
      series(3),
    ];

    expect(seasonsToFetch(list, TODAY)).toEqual([{ tmdbId: 1, seasonNumber: 2 }]);
  });
});

describe('lo archivado en el calendario', () => {
  it('lo que está en pausa sigue entrando; lo abandonado no', () => {
    const list = [
      series(1, { status: 'en_pausa', nextToAir: next(2, 3, '2026-09-18') }),
      series(2, { status: 'abandonada', nextToAir: next(2, 3, '2026-09-18') }),
      series(3, { status: 'abandonada' }),
    ];

    const { groups, undated } = buildCalendar(list, TODAY);
    expect(groups.flatMap((g) => g.items.map((i) => i.media.tmdbId))).toEqual([1]);
    expect(undated).toEqual([]);
  });
});
