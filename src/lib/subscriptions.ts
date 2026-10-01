import { SavedMedia, SubscribedProvider, Subscriptions } from '@/types';
import type { DiscoverParams } from '@/lib/tmdb';

/**
 * Las plataformas que la persona paga.
 *
 * Se guardan con id, nombre y logo, y se comparan por nombre: la biblioteca
 * guarda "Netflix", no el 8, desde mucho antes de que esto existiera. Los dos
 * nombres salen de TMDB, así que coinciden; se comparan igual sin mayúsculas
 * ni espacios de más, que no cuestan nada.
 */

/** Tope de suscripciones: nadie paga cuarenta, y es un documento chico. */
export const MAX_SUBSCRIPTIONS = 30;

export function emptySubscriptions(): Subscriptions {
  return { providers: [], updatedAt: new Date(0).toISOString() };
}

function parseProvider(value: unknown): SubscribedProvider | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = Number(raw.id);
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  return {
    id,
    name,
    logoPath: typeof raw.logoPath === 'string' && raw.logoPath.startsWith('/') ? raw.logoPath : null,
  };
}

/** Valida lo que venga de Firestore, de `localStorage` o de un backup. */
export function parseSubscriptions(value: unknown): Subscriptions {
  if (typeof value !== 'object' || value === null) return emptySubscriptions();
  const raw = value as Record<string, unknown>;

  const providers = (Array.isArray(raw.providers) ? raw.providers : [])
    .map(parseProvider)
    .filter((provider): provider is SubscribedProvider => provider !== null)
    .filter((provider, index, list) => list.findIndex((p) => p.id === provider.id) === index)
    .slice(0, MAX_SUBSCRIPTIONS);

  const updatedAt =
    typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date(0).toISOString();

  // Sin plataformas no hay nada a qué limitarse: el interruptor no se guarda
  // prendido sobre una lista vacía.
  const onlyMine = raw.onlyMine === true && providers.length > 0;

  return { providers, ...(onlyMine ? { onlyMine } : {}), updatedAt };
}

export function hasSubscriptions(subscriptions: Subscriptions): boolean {
  return subscriptions.providers.length > 0;
}

/**
 * Firestore rechaza `undefined`: el logo que falta va como `null`.
 *
 * `onlyMine` va solo si está prendido: el documento de quien no lo usa queda
 * igual que el de siempre.
 */
export function subscriptionsToDocument(subscriptions: Subscriptions): Record<string, unknown> {
  return {
    providers: subscriptions.providers.map(({ id, name, logoPath }) => ({
      id,
      name,
      logoPath: logoPath ?? null,
    })),
    ...(subscriptions.onlyMine ? { onlyMine: true } : {}),
    updatedAt: subscriptions.updatedAt,
  };
}

export function isSubscribed(subscriptions: Subscriptions, id: number): boolean {
  return subscriptions.providers.some((provider) => provider.id === id);
}

/** Suma o saca una plataforma, con la fecha de ahora. */
export function toggleSubscription(
  subscriptions: Subscriptions,
  provider: SubscribedProvider,
  now = new Date(),
): Subscriptions {
  const providers = isSubscribed(subscriptions, provider.id)
    ? subscriptions.providers.filter((p) => p.id !== provider.id)
    : [...subscriptions.providers, provider].slice(0, MAX_SUBSCRIPTIONS);
  // Al sacar la última se apaga: volver a marcar una no tiene que prender de
  // sorpresa un filtro que ya no se veía.
  const onlyMine = subscriptions.onlyMine === true && providers.length > 0;
  return { providers, ...(onlyMine ? { onlyMine } : {}), updatedAt: now.toISOString() };
}

/** Prende o apaga "solo lo que está en mis plataformas", con la fecha de ahora. */
export function setOnlyMine(
  subscriptions: Subscriptions,
  onlyMine: boolean,
  now = new Date(),
): Subscriptions {
  const on = onlyMine && subscriptions.providers.length > 0;
  return {
    providers: subscriptions.providers,
    ...(on ? { onlyMine: true } : {}),
    updatedAt: now.toISOString(),
  };
}

/** Si Explorar tiene que limitarse a lo que la persona paga. */
export function recommendsOnlyMine(subscriptions: Subscriptions | undefined): boolean {
  return subscriptions?.onlyMine === true && subscriptions.providers.length > 0;
}

/**
 * Una consulta a `/discover` limitada a lo incluido en tus plataformas.
 *
 * La que ya pide una plataforma ("Está en tu Netflix") queda como está: ya es
 * de una de las tuyas, y sumarle las otras la volvería otra fila.
 */
export function limitToSubscriptions(
  params: DiscoverParams,
  subscriptions: Subscriptions,
  region: string,
): DiscoverParams {
  if (params.provider || params.providers?.length) return params;
  return {
    ...params,
    providers: subscriptions.providers.map((provider) => provider.id),
    region,
  };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** Sin tildes ni mayúsculas: "globoplay" encuentra "Globoplay", "movistar" a "Movistar Plus+". */
function searchable(text: string): string {
  return normalize(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Las plataformas cuyo nombre contiene lo que se escribió. Con la búsqueda
 * vacía, todas: el buscador no esconde nada hasta que se lo usa.
 */
export function searchProviders<T extends { name: string }>(providers: T[], query: string): T[] {
  const wanted = searchable(query);
  if (!wanted) return providers;
  return providers.filter((provider) => searchable(provider.name).includes(wanted));
}

/** Si una plataforma, por su nombre, está entre las que pagás. */
export function paysFor(names: Set<string>, name: string): boolean {
  return names.has(normalize(name));
}

/** Los nombres suscriptos, listos para comparar. */
export function subscribedNames(subscriptions: Subscriptions): Set<string> {
  return new Set(subscriptions.providers.map((provider) => normalize(provider.name)));
}

/**
 * Si un título se puede ver ya con lo que pagás: está incluido —no en
 * alquiler ni en compra— en alguna de tus plataformas.
 */
export function isAvailableNow(media: SavedMedia, names: Set<string>): boolean {
  return (media.streaming ?? []).some((name) => names.has(normalize(name)));
}

/** Las plataformas de tus suscripciones en las que está un título. */
export function subscribedIn(media: SavedMedia, names: Set<string>): string[] {
  return (media.streaming ?? []).filter((name) => names.has(normalize(name)));
}
