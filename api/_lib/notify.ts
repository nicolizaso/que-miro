/**
 * "¿A quién le aviso qué?": la parte pura del cron de avisos.
 *
 * Todo lo que decide está acá, sin Firebase ni TMDB, para poder probarlo:
 * qué suscripciones son válidas, qué episodio sale hoy de cada serie y qué
 * mensaje le toca a cada dispositivo. `api/cron/notify.ts` solo conecta esto
 * con Firestore, TMDB y Firebase Cloud Messaging.
 *
 * Lo que se lee es la instantánea de `push_subscriptions/{uid}`: tokens,
 * región, idioma y los ids de las series con aviso. El cron no lee
 * `saved_media`: el servidor no sabe qué vio nadie.
 */

export interface PushSubscription {
  uid: string;
  tokens: string[];
  series: number[];
  /** `es-ES` o `es-MX`: en qué castellano pedirle a TMDB el nombre del episodio. */
  language: 'es-ES' | 'es-MX';
}

/** El episodio que sale hoy de una serie. */
export interface AiringEpisode {
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
  name?: string;
}

/** Un aviso listo para mandar a un dispositivo. */
export interface PlannedMessage {
  token: string;
  title: string;
  body: string;
  /** Relativa: el service worker la abre sobre su propio origen. */
  url: string;
  /** Una notificación por serie: la segunda del mismo día reemplaza a la primera. */
  tag: string;
}

/** Valida un documento de `push_subscriptions`: lo roto no voltea la corrida. */
export function parseSubscription(uid: string, data: unknown): PushSubscription | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens.filter((token): token is string => typeof token === 'string' && token.length > 0)
    : [];
  const series = Array.isArray(raw.series)
    ? raw.series.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (tokens.length === 0 || series.length === 0) return null;
  const language = raw.language === 'es-MX' ? 'es-MX' : 'es-ES';
  return { uid, tokens, series, language };
}

/** La clave con la que se guarda lo que sale hoy de cada serie en cada idioma. */
export function airingKey(id: number, language: string): string {
  return `${id}:${language}`;
}

/** Las series a pedir: cada una una sola vez por idioma, aunque la sigan mil. */
export function seriesToFetch(
  subscriptions: PushSubscription[],
): { id: number; language: PushSubscription['language'] }[] {
  const seen = new Map<string, { id: number; language: PushSubscription['language'] }>();
  for (const { series, language } of subscriptions) {
    for (const id of series) seen.set(airingKey(id, language), { id, language });
  }
  return Array.from(seen.values());
}

interface EpisodeFields {
  air_date?: unknown;
  season_number?: unknown;
  episode_number?: unknown;
  name?: unknown;
}

/** Lo que el cron recibe de TMDB por cada serie (ver `getAiring`). */
export interface AiringSource {
  name?: unknown;
  next_episode_to_air?: unknown;
  last_episode_to_air?: unknown;
}

/**
 * El episodio que sale `today` (`YYYY-MM-DD`) según la ficha de TMDB, o
 * `null`.
 *
 * Se mira el próximo y también el último: el día del estreno, según la hora
 * a la que TMDB actualice, el de hoy puede figurar todavía como "próximo" o
 * ya como "último".
 */
export function episodeAiringOn(detail: AiringSource, today: string): AiringEpisode | null {
  const seriesName = typeof detail.name === 'string' ? detail.name.trim() : '';
  if (!seriesName) return null;

  for (const candidate of [detail.next_episode_to_air, detail.last_episode_to_air]) {
    const episode = candidate as EpisodeFields | null | undefined;
    if (!episode || episode.air_date !== today) continue;
    // `Number(null)` es 0: sin mirar el tipo, un episodio sin número pasaría
    // como el "T2E0".
    const seasonNumber = episode.season_number;
    const episodeNumber = episode.episode_number;
    if (typeof seasonNumber !== 'number' || !Number.isInteger(seasonNumber) || seasonNumber < 0) continue;
    if (typeof episodeNumber !== 'number' || !Number.isInteger(episodeNumber) || episodeNumber < 1) continue;
    const name = typeof episode.name === 'string' && episode.name.trim() ? episode.name.trim() : undefined;
    return { seriesName, seasonNumber, episodeNumber, ...(name ? { name } : {}) };
  }
  return null;
}

function episodeCode(episode: AiringEpisode): string {
  return `T${episode.seasonNumber}E${episode.episodeNumber}`;
}

/**
 * El nombre del episodio, si dice algo: TMDB completa los que todavía no
 * tienen con "Episodio 3", y repetir el número no suma.
 */
function meaningfulName(episode: AiringEpisode): string | undefined {
  if (!episode.name || /^(episodio|episode|capítulo)\s*\d+$/i.test(episode.name)) return undefined;
  return episode.name;
}

/** "The Bear, Severance y 2 más". */
function namesList(names: string[]): string {
  if (names.length <= 2) return names.join(' y ');
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}

/**
 * Qué aviso le toca a cada dispositivo.
 *
 * Uno por dispositivo y no uno por serie: tres series que estrenan el mismo
 * día son un aviso que las nombra a las tres, no tres avisos seguidos. Con
 * una sola, el aviso dice qué episodio es y abre su ficha; con varias, abre
 * el calendario. Un token que aparezca en dos cuentas —el mismo navegador,
 * dos personas— recibe un solo aviso con todo junto.
 */
export function planNotifications(
  subscriptions: PushSubscription[],
  airing: Map<string, AiringEpisode | null>,
): PlannedMessage[] {
  const byToken = new Map<string, Map<number, AiringEpisode>>();

  for (const subscription of subscriptions) {
    const episodes = new Map<number, AiringEpisode>();
    for (const id of subscription.series) {
      const episode = airing.get(airingKey(id, subscription.language));
      if (episode) episodes.set(id, episode);
    }
    if (episodes.size === 0) continue;

    for (const token of subscription.tokens) {
      const current = byToken.get(token) ?? new Map<number, AiringEpisode>();
      for (const [id, episode] of episodes) current.set(id, episode);
      byToken.set(token, current);
    }
  }

  return Array.from(byToken, ([token, episodes]) => {
    const list = Array.from(episodes.entries()).sort((a, b) =>
      a[1].seriesName.localeCompare(b[1].seriesName, 'es'),
    );

    if (list.length === 1) {
      const [[id, episode]] = list;
      const name = meaningfulName(episode);
      return {
        token,
        title: `Sale hoy: ${episode.seriesName}`,
        body: name
          ? `${episodeCode(episode)} · ${name}`
          : `Temporada ${episode.seasonNumber}, episodio ${episode.episodeNumber}.`,
        url: `/?ficha=tv:${id}`,
        tag: `serie-${id}`,
      };
    }

    return {
      token,
      title: `Hoy salen episodios de ${list.length} series`,
      body: namesList(list.map(([, episode]) => episode.seriesName)),
      url: '/calendario',
      tag: 'episodios-del-dia',
    };
  });
}

/**
 * De qué cuentas es cada token. Un token muerto se borra de todas las que lo
 * registraron, aunque hoy solo una tuviera algo para avisar.
 */
export function tokenOwners(subscriptions: PushSubscription[]): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const { uid, tokens } of subscriptions) {
    for (const token of tokens) owners.set(token, [...(owners.get(token) ?? []), uid]);
  }
  return owners;
}

/**
 * Los errores de FCM que dicen que el token ya no sirve: la app se
 * desinstaló, se revocó el permiso o el navegador lo renovó. Se borran del
 * documento para no volver a intentarlo cada día. Cualquier otro error —FCM
 * caído, una cuota— no dice nada del token, y se lo deja.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export function isDeadToken(code: string | undefined): boolean {
  return code !== undefined && DEAD_TOKEN_CODES.has(code);
}

/** El día de hoy, en UTC: el cron corre una vez por día a la misma hora. */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** FCM acepta hasta 500 mensajes por envío. */
export const SEND_BATCH = 500;

/** Cuántas series se le piden a TMDB a la vez: rápido sin rozar su límite. */
const FETCH_CONCURRENCY = 8;

/** `fn` sobre cada elemento, con a lo sumo `limit` en vuelo a la vez. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Lo que el cron necesita del mundo; en los tests, dobles. */
export interface NotifyDeps {
  readSubscriptions: () => Promise<{ uid: string; data: unknown }[]>;
  fetchAiring: (id: number, language: PushSubscription['language']) => Promise<AiringSource>;
  /** Manda un lote; devuelve, por mensaje, el código de error o `undefined`. */
  send: (messages: PlannedMessage[]) => Promise<(string | undefined)[]>;
  removeTokens: (uid: string, tokens: string[]) => Promise<void>;
  today: string;
}

export interface NotifySummary {
  subscriptions: number;
  series: number;
  airing: number;
  sent: number;
  failed: number;
  seriesErrors: number;
  removedTokens: number;
}

/**
 * Una corrida entera: leer suscripciones, preguntar a TMDB por cada serie una
 * sola vez, avisar y limpiar los tokens muertos.
 *
 * Una serie que TMDB no devuelve no voltea la corrida: esa hoy no avisa y el
 * resto sí.
 */
export async function runNotify(deps: NotifyDeps): Promise<NotifySummary> {
  const subscriptions = (await deps.readSubscriptions())
    .map(({ uid, data }) => parseSubscription(uid, data))
    .filter((subscription): subscription is PushSubscription => subscription !== null);

  const wanted = seriesToFetch(subscriptions);
  let seriesErrors = 0;
  const found = await mapPool(wanted, FETCH_CONCURRENCY, async ({ id, language }) => {
    try {
      return episodeAiringOn(await deps.fetchAiring(id, language), deps.today);
    } catch {
      seriesErrors += 1;
      return null;
    }
  });
  const airing = new Map(wanted.map(({ id, language }, index) => [airingKey(id, language), found[index]]));

  const messages = planNotifications(subscriptions, airing);
  const dead: string[] = [];
  let sent = 0;
  let failed = 0;
  for (let start = 0; start < messages.length; start += SEND_BATCH) {
    const batch = messages.slice(start, start + SEND_BATCH);
    const errors = await deps.send(batch);
    batch.forEach((message, index) => {
      const code = errors[index];
      if (code === undefined) sent += 1;
      else {
        failed += 1;
        if (isDeadToken(code)) dead.push(message.token);
      }
    });
  }

  const owners = tokenOwners(subscriptions);
  const toRemove = new Map<string, string[]>();
  for (const token of dead) {
    for (const uid of owners.get(token) ?? []) toRemove.set(uid, [...(toRemove.get(uid) ?? []), token]);
  }
  await Promise.all(Array.from(toRemove, ([uid, tokens]) => deps.removeTokens(uid, tokens)));

  return {
    subscriptions: subscriptions.length,
    series: wanted.length,
    airing: found.filter(Boolean).length,
    sent,
    failed,
    seriesErrors,
    removedTokens: dead.length,
  };
}
