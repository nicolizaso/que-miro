import { describe, expect, it, vi } from 'vitest';
import {
  AiringEpisode,
  PlannedMessage,
  PushSubscription,
  airingKey,
  episodeAiringOn,
  isDeadToken,
  parseSubscription,
  planNotifications,
  runNotify,
  seriesToFetch,
  todayUtc,
  tokenOwners,
} from './notify';

const TODAY = '2026-09-29';

const SEVERANCE = 95396;
const THE_BEAR = 136315;
const SLOW_HORSES = 95480;

function subscription(overrides: Partial<PushSubscription> = {}): PushSubscription {
  return { uid: 'ana', tokens: ['token-ana'], series: [SEVERANCE], language: 'es-ES', ...overrides };
}

function episode(seriesName: string, overrides: Partial<AiringEpisode> = {}): AiringEpisode {
  return { seriesName, seasonNumber: 2, episodeNumber: 3, name: 'Quién está vivo', ...overrides };
}

describe('parseSubscription', () => {
  it('se queda con lo que sirve', () => {
    expect(
      parseSubscription('ana', {
        tokens: ['a', '', 7, 'b'],
        series: [SEVERANCE, '136315', -1, 2.5, 'x'],
        language: 'es-MX',
        region: 'AR',
      }),
    ).toEqual({ uid: 'ana', tokens: ['a', 'b'], series: [SEVERANCE, THE_BEAR], language: 'es-MX' });
  });

  it('sin tokens o sin series no hay a quién ni de qué avisar', () => {
    expect(parseSubscription('ana', { tokens: [], series: [SEVERANCE] })).toBeNull();
    expect(parseSubscription('ana', { tokens: ['a'], series: [] })).toBeNull();
    expect(parseSubscription('ana', null)).toBeNull();
    expect(parseSubscription('ana', 'roto')).toBeNull();
  });

  it('un idioma que no se conoce cae en el de España', () => {
    expect(parseSubscription('ana', { tokens: ['a'], series: [1], language: 'en-US' })?.language).toBe(
      'es-ES',
    );
  });
});

describe('seriesToFetch', () => {
  it('cada serie una vez por idioma, aunque la sigan varias cuentas', () => {
    const wanted = seriesToFetch([
      subscription({ uid: 'ana', series: [SEVERANCE, THE_BEAR] }),
      subscription({ uid: 'beto', series: [SEVERANCE] }),
      subscription({ uid: 'caro', series: [SEVERANCE], language: 'es-MX' }),
    ]);

    expect(wanted).toEqual([
      { id: SEVERANCE, language: 'es-ES' },
      { id: THE_BEAR, language: 'es-ES' },
      { id: SEVERANCE, language: 'es-MX' },
    ]);
  });
});

describe('episodeAiringOn', () => {
  const next = { air_date: TODAY, season_number: 2, episode_number: 3, name: 'Quién está vivo' };

  it('el próximo episodio, si sale hoy', () => {
    expect(episodeAiringOn({ name: 'Severance', next_episode_to_air: next }, TODAY)).toEqual(
      episode('Severance'),
    );
  });

  it('o el último, si TMDB ya lo movió', () => {
    expect(
      episodeAiringOn(
        {
          name: 'Severance',
          next_episode_to_air: { ...next, air_date: '2026-10-06', episode_number: 4 },
          last_episode_to_air: next,
        },
        TODAY,
      ),
    ).toEqual(episode('Severance'));
  });

  it('nada si no sale hoy, o si la ficha está incompleta', () => {
    expect(
      episodeAiringOn({ name: 'Severance', next_episode_to_air: { ...next, air_date: '2026-09-30' } }, TODAY),
    ).toBeNull();
    expect(episodeAiringOn({ name: 'Severance', next_episode_to_air: null }, TODAY)).toBeNull();
    expect(episodeAiringOn({ next_episode_to_air: next }, TODAY)).toBeNull();
    expect(
      episodeAiringOn({ name: 'Severance', next_episode_to_air: { ...next, episode_number: null } }, TODAY),
    ).toBeNull();
  });
});

describe('planNotifications', () => {
  const airing = new Map<string, AiringEpisode | null>([
    [airingKey(SEVERANCE, 'es-ES'), episode('Severance')],
    [airingKey(THE_BEAR, 'es-ES'), episode('The Bear', { seasonNumber: 4, episodeNumber: 1, name: undefined })],
    [airingKey(SLOW_HORSES, 'es-ES'), null],
  ]);

  it('una serie: dice qué episodio es y abre su ficha', () => {
    expect(planNotifications([subscription()], airing)).toEqual<PlannedMessage[]>([
      {
        token: 'token-ana',
        title: 'Sale hoy: Severance',
        body: 'T2E3 · Quién está vivo',
        url: '/?ficha=tv:95396',
        tag: 'serie-95396',
      },
    ]);
  });

  it('sin nombre de episodio —o con el de relleno de TMDB— dice temporada y número', () => {
    const [message] = planNotifications([subscription({ series: [THE_BEAR] })], airing);
    expect(message.body).toBe('Temporada 4, episodio 1.');

    const placeholder = new Map([[airingKey(SEVERANCE, 'es-ES'), episode('Severance', { name: 'Episodio 3' })]]);
    expect(planNotifications([subscription()], placeholder)[0].body).toBe('Temporada 2, episodio 3.');
  });

  it('varias el mismo día: un aviso que las nombra y abre el calendario', () => {
    const [message] = planNotifications(
      [subscription({ series: [SEVERANCE, THE_BEAR, SLOW_HORSES] })],
      airing,
    );
    expect(message).toMatchObject({
      title: 'Hoy salen episodios de 2 series',
      body: 'Severance y The Bear',
      url: '/calendario',
      tag: 'episodios-del-dia',
    });
  });

  it('con muchas, nombra dos y cuenta el resto', () => {
    const many = new Map(
      ['Andor', 'Bluey', 'Cobra Kai', 'Dark'].map((name, index) => [airingKey(index + 1, 'es-ES'), episode(name)]),
    );
    const [message] = planNotifications([subscription({ series: [4, 3, 2, 1] })], many);
    expect(message.body).toBe('Andor, Bluey y 2 más');
  });

  it('a cada uno lo suyo, en su idioma', () => {
    const mexican = new Map(airing);
    mexican.set(airingKey(SEVERANCE, 'es-MX'), episode('Severance', { name: '¿Quién está vivo?' }));

    const messages = planNotifications(
      [
        subscription({ uid: 'ana', tokens: ['celu-ana', 'compu-ana'] }),
        subscription({ uid: 'beto', tokens: ['celu-beto'], series: [SLOW_HORSES] }),
        subscription({ uid: 'caro', tokens: ['celu-caro'], language: 'es-MX' }),
      ],
      mexican,
    );

    expect(messages.map((message) => [message.token, message.body])).toEqual([
      ['celu-ana', 'T2E3 · Quién está vivo'],
      ['compu-ana', 'T2E3 · Quién está vivo'],
      ['celu-caro', 'T2E3 · ¿Quién está vivo?'],
    ]);
  });

  it('un navegador con dos cuentas recibe un solo aviso con todo junto', () => {
    const messages = planNotifications(
      [
        subscription({ uid: 'ana', tokens: ['compartida'], series: [SEVERANCE] }),
        subscription({ uid: 'beto', tokens: ['compartida'], series: [THE_BEAR, SEVERANCE] }),
      ],
      airing,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('Severance y The Bear');
  });

  it('si hoy no sale nada, no hay avisos', () => {
    expect(planNotifications([subscription({ series: [SLOW_HORSES] })], airing)).toEqual([]);
  });
});

describe('tokens', () => {
  it('reconoce los que ya no sirven', () => {
    expect(isDeadToken('messaging/registration-token-not-registered')).toBe(true);
    expect(isDeadToken('messaging/invalid-registration-token')).toBe(true);
    expect(isDeadToken('messaging/internal-error')).toBe(false);
    expect(isDeadToken(undefined)).toBe(false);
  });

  it('sabe de qué cuentas es cada uno', () => {
    const owners = tokenOwners([
      subscription({ uid: 'ana', tokens: ['compartida', 'celu-ana'] }),
      subscription({ uid: 'beto', tokens: ['compartida'] }),
    ]);
    expect(owners.get('compartida')).toEqual(['ana', 'beto']);
    expect(owners.get('celu-ana')).toEqual(['ana']);
  });

  it('el día es el de UTC', () => {
    expect(todayUtc(new Date('2026-09-29T23:30:00-03:00'))).toBe('2026-09-30');
  });
});

describe('runNotify', () => {
  const details: Record<number, unknown> = {
    [SEVERANCE]: {
      name: 'Severance',
      next_episode_to_air: { air_date: TODAY, season_number: 2, episode_number: 3, name: 'Quién está vivo' },
    },
    [THE_BEAR]: {
      name: 'The Bear',
      next_episode_to_air: { air_date: '2026-10-02', season_number: 4, episode_number: 2 },
    },
  };

  function deps(overrides: Partial<Parameters<typeof runNotify>[0]> = {}) {
    return {
      readSubscriptions: vi.fn().mockResolvedValue([
        { uid: 'ana', data: { tokens: ['celu-ana', 'vieja-ana'], series: [SEVERANCE, THE_BEAR] } },
        { uid: 'beto', data: { tokens: ['celu-beto'], series: [SEVERANCE, SLOW_HORSES] } },
        { uid: 'rota', data: { tokens: 'no es una lista' } },
      ]),
      fetchAiring: vi.fn(async (id: number) => {
        if (id === SLOW_HORSES) throw new Error('TMDB respondió 500.');
        return details[id] as object;
      }),
      send: vi.fn(async (messages: PlannedMessage[]) =>
        messages.map((message) =>
          message.token === 'vieja-ana' ? 'messaging/registration-token-not-registered' : undefined,
        ),
      ),
      removeTokens: vi.fn().mockResolvedValue(undefined),
      today: TODAY,
      ...overrides,
    };
  }

  it('pide cada serie una vez, avisa y borra los tokens muertos', async () => {
    const send = vi.fn(async (messages: PlannedMessage[]) =>
      messages.map((message) =>
        message.token === 'vieja-ana' ? 'messaging/registration-token-not-registered' : undefined,
      ),
    );
    const world = deps({ send });
    const summary = await runNotify(world);

    expect(world.fetchAiring).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map((message) => message.token)).toEqual([
      'celu-ana',
      'vieja-ana',
      'celu-beto',
    ]);
    expect(world.removeTokens).toHaveBeenCalledWith('ana', ['vieja-ana']);
    expect(summary).toEqual({
      subscriptions: 2,
      series: 3,
      airing: 1,
      sent: 2,
      failed: 1,
      seriesErrors: 1,
      removedTokens: 1,
    });
  });

  it('un error que no es del token no lo borra', async () => {
    const send = vi.fn(async (messages: PlannedMessage[]) => messages.map(() => 'messaging/internal-error'));
    const world = deps({ send });
    const summary = await runNotify(world);

    expect(world.removeTokens).not.toHaveBeenCalled();
    expect(summary.failed).toBe(3);
  });

  it('manda en lotes de a 500', async () => {
    const many = Array.from({ length: 501 }, (_, index) => `token-${index}`);
    const send = vi.fn(async (messages: PlannedMessage[]) => messages.map(() => undefined));
    const world = deps({
      readSubscriptions: vi.fn().mockResolvedValue([{ uid: 'ana', data: { tokens: many, series: [SEVERANCE] } }]),
      send,
    });
    const summary = await runNotify(world);

    expect(send.mock.calls.map((call) => call[0].length)).toEqual([500, 1]);
    expect(summary.sent).toBe(501);
  });
});
