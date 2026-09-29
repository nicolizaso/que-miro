import { AvailabilityNews, SavedMedia } from '@/types';
import { toDayKey } from '@/lib/dates';

/**
 * "Llegó a tu plataforma": qué cambió en un título de *Por Ver* desde que se
 * refrescó por última vez.
 *
 * Es el cliente cruzando lo que acaba de traer el refresco con lo que tenía
 * guardado. El servidor no se entera de nada: no sabe qué tiene nadie en *Por
 * Ver*, ni tiene por qué.
 */

/**
 * Lo que queda de un nombre de plataforma para comparar.
 *
 * TMDB cambia nombres —"HBO Max" pasó a "Max"— y lista la misma plataforma con
 * variantes por plan: "Netflix basic with Ads", "Paramount Plus Apple TV
 * Channel". Para esta cuenta son la misma plataforma: que aparezca con otro
 * nombre no es que haya llegado.
 */
export function providerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, ' plus')
    .replace(/\b(standard|basic|premium)?\s*with ads\b/g, '')
    .replace(/\b(amazon|apple tv|roku premium) channels?\b/g, '')
    .replace(/^hbo\s+/, '')
    .replace(/\bamazon\s+(?=prime video)/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function keys(names: string[] | undefined): Set<string> {
  return new Set((names ?? []).map(providerKey));
}

/**
 * Cuántos días después del estreno digital todavía vale avisar. Pasado eso,
 * "ya salió" es noticia vieja: el refresco pudo haber tardado, pero no tanto.
 */
const RELEASE_NEWS_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las novedades de un título después de un refresco, o `undefined` si no
 * cambiaron.
 *
 * - **Llegó a una plataforma**: aparece en lo incluido (`streaming`) una que
 *   antes no estaba. Si hay suscripciones, solo las tuyas: que llegue a una
 *   que no pagás no cambia lo que podés ver esta noche. Hace falta saber qué
 *   había antes —un título que nunca tuvo `streaming` calculado no avisa todo
 *   lo que ya tenía—.
 * - **Salió en digital**: una película cuyo estreno digital estaba en el
 *   futuro la última vez y ahora ya pasó.
 * - **Se fue**: una novedad sin ver de una plataforma que ya no lo tiene se
 *   borra, porque dejó de ser cierta. Las vistas se quedan, para que la misma
 *   no vuelva a aparecer.
 */
export function detectAvailabilityNews(
  before: SavedMedia,
  after: Pick<SavedMedia, 'streaming' | 'digitalRelease'>,
  subscribed: Set<string> | null,
  now = new Date(),
): AvailabilityNews[] | undefined {
  if (before.status !== 'por_ver') return undefined;

  const current = before.availabilityNews ?? [];
  const known = new Set(
    current.filter((news) => news.kind === 'provider').map((news) => providerKey(news.provider)),
  );
  const nowKeys = keys(after.streaming);
  const mine = subscribed ? new Set(Array.from(subscribed, providerKey)) : null;

  const kept = current.filter(
    (news) => news.seenAt || news.kind !== 'provider' || nowKeys.has(providerKey(news.provider)),
  );

  const added: AvailabilityNews[] = [];
  if (before.streaming !== undefined && after.streaming !== undefined) {
    const previous = keys(before.streaming);
    for (const name of after.streaming) {
      const key = providerKey(name);
      if (previous.has(key) || known.has(key)) continue;
      if (mine && mine.size > 0 && !mine.has(key)) continue;
      known.add(key);
      added.push({ kind: 'provider', provider: name, since: now.toISOString() });
    }
  }

  const today = toDayKey(now);
  const release = after.digitalRelease;
  const wasUpcoming =
    before.digitalRelease !== undefined &&
    before.enrichedAt !== undefined &&
    before.digitalRelease > toDayKey(new Date(before.enrichedAt));
  const alreadyNoted = current.some((news) => news.kind === 'release');
  if (
    before.mediaType === 'movie' &&
    release &&
    release <= today &&
    wasUpcoming &&
    !alreadyNoted &&
    now.getTime() - Date.parse(`${release}T00:00:00`) <= RELEASE_NEWS_DAYS * DAY_MS
  ) {
    added.push({ kind: 'release', provider: '', since: now.toISOString() });
  }

  if (added.length === 0 && kept.length === current.length) return undefined;
  return [...kept, ...added];
}

/** Las novedades que todavía no se descartaron. */
export function unseenNews(media: SavedMedia): AvailabilityNews[] {
  if (media.status !== 'por_ver') return [];
  return (media.availabilityNews ?? []).filter((news) => !news.seenAt);
}

/** Todas descartadas, con la fecha de ahora. */
export function markNewsSeen(media: SavedMedia, now = new Date()): AvailabilityNews[] {
  return (media.availabilityNews ?? []).map((news) =>
    news.seenAt ? news : { ...news, seenAt: now.toISOString() },
  );
}

/** "ya está en Max", "ya está en Netflix y Max", "ya salió en digital". */
export function newsLabel(news: AvailabilityNews[]): string {
  const providers = news.filter((item) => item.kind === 'provider').map((item) => item.provider);
  if (providers.length > 0) {
    const list =
      providers.length === 1
        ? providers[0]
        : `${providers.slice(0, -1).join(', ')} y ${providers[providers.length - 1]}`;
    return `ya está en ${list}`;
  }
  return 'ya salió en digital';
}

/** Los títulos con novedades sin ver, de la más reciente a la más vieja. */
export function titlesWithNews(list: SavedMedia[]): { media: SavedMedia; news: AvailabilityNews[] }[] {
  return list
    .map((media) => ({ media, news: unseenNews(media) }))
    .filter(({ news }) => news.length > 0)
    .sort(
      (a, b) =>
        Math.max(...b.news.map((n) => Date.parse(n.since))) -
        Math.max(...a.news.map((n) => Date.parse(n.since))),
    );
}
