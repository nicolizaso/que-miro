import { Collection, MediaType, SavedMedia } from '@/types';
import { ShareCardData } from '@/lib/shareCard';
import { stableJson } from '@/lib/autoPublish';

/**
 * Una lista propia publicada con un link: `/l/{id}`.
 *
 * Como el perfil público, es una instantánea curada y no una ventana a la
 * biblioteca: lo que viaja es el nombre, una descripción opcional y, de cada
 * título, lo mínimo para mostrarlo y guardarlo —id, tipo, título, póster y
 * año—. Ni estados, ni puntajes, ni el resto de la biblioteca.
 */

export interface PublicListItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: string;
}

export interface PublicList {
  id: string;
  uid: string;
  /** El nombre de quien la publica, para "una lista de Ana". */
  ownerName: string;
  name: string;
  description: string;
  items: PublicListItem[];
  publishedAt: string; // ISO
  /** "Mantener actualizada", como el perfil. Sin el campo, prendido. */
  autoUpdate: boolean;
}

/** Tope de títulos publicados: es una lista para compartir, no un catálogo. */
export const MAX_LIST_ITEMS = 200;
export const MAX_LIST_DESCRIPTION = 280;

/** El formato del id: el mismo que exigen las reglas. */
export const PUBLIC_LIST_ID = /^[A-Za-z0-9_-]{12,32}$/;

/**
 * Un id nuevo, al azar: 16 caracteres de base64url. No es el id de la
 * colección: el link se comparte, y así no dice nada de cómo está guardada.
 */
export function newPublicListId(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  let binary = '';
  for (const byte of random(new Uint8Array(12))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function publicListPath(id: string): string {
  return `public_lists/${id}`;
}

/** Los títulos de una colección, por nombre: el orden no depende de cuándo se tocaron. */
export function listItemsOf(collectionId: string, mediaList: SavedMedia[]): PublicListItem[] {
  return mediaList
    .filter((media) => media.collections?.includes(collectionId))
    .sort((a, b) => a.title.localeCompare(b.title, 'es') || a.tmdbId - b.tmdbId)
    .slice(0, MAX_LIST_ITEMS)
    .map((media) => ({
      tmdbId: media.tmdbId,
      mediaType: media.mediaType,
      title: media.title,
      posterPath: media.posterPath,
      releaseYear: media.releaseYear,
    }));
}

export function buildPublicList({
  id,
  uid,
  ownerName,
  collection,
  description = '',
  mediaList,
  autoUpdate = true,
  now = new Date(),
}: {
  id: string;
  uid: string;
  ownerName: string;
  collection: Collection;
  description?: string;
  mediaList: SavedMedia[];
  autoUpdate?: boolean;
  now?: Date;
}): PublicList {
  return {
    id,
    uid,
    ownerName,
    name: collection.name,
    description: description.trim().slice(0, MAX_LIST_DESCRIPTION),
    items: listItemsOf(collection.id, mediaList),
    publishedAt: now.toISOString(),
    autoUpdate,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseItem(value: unknown): PublicListItem | null {
  if (!isRecord(value)) return null;
  const tmdbId = Number(value.tmdbId);
  const mediaType = value.mediaType === 'movie' || value.mediaType === 'tv' ? value.mediaType : null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType || !title) return null;
  return {
    tmdbId,
    mediaType,
    title,
    posterPath: typeof value.posterPath === 'string' ? value.posterPath : null,
    releaseYear: typeof value.releaseYear === 'string' ? value.releaseYear : '',
  };
}

/**
 * Valida una lista leída de Firestore. La lee cualquiera sin sesión, así que
 * no se confía en su forma: lo roto se descarta sin voltear la página.
 */
export function parsePublicList(value: unknown): PublicList | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const uid = typeof value.uid === 'string' ? value.uid : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !uid || !name) return null;

  return {
    id,
    uid,
    ownerName: typeof value.ownerName === 'string' && value.ownerName.trim() ? value.ownerName.trim() : 'Alguien',
    name,
    description: typeof value.description === 'string' ? value.description.slice(0, MAX_LIST_DESCRIPTION) : '',
    items: (Array.isArray(value.items) ? value.items : [])
      .map(parseItem)
      .filter((item): item is PublicListItem => item !== null)
      .slice(0, MAX_LIST_ITEMS),
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : new Date(0).toISOString(),
    autoUpdate: value.autoUpdate !== false,
  };
}

/** Si dos instantáneas muestran lo mismo: sin mirar cuándo se publicaron ni la opción. */
export function samePublicListContent(a: PublicList, b: PublicList): boolean {
  const content = ({ publishedAt: _p, autoUpdate: _a, ...rest }: PublicList) => rest;
  return stableJson(content(a)) === stableJson(content(b));
}

/**
 * Un nombre libre para guardar la lista de otro como propia: "Terror",
 * "Terror (2)", "Terror (3)". Los nombres se comparan como los compara la
 * app al crear una lista: sin mayúsculas.
 */
export function uniqueCollectionName(name: string, existing: string[], maxLength = 40): string {
  const taken = new Set(existing.map((item) => item.toLowerCase()));
  const base = name.trim().slice(0, maxLength);
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, maxLength - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** La tarjeta para compartir: sin pósters, por lo del canvas (ver `shareCard`). */
export function listShareCard(list: PublicList, url: string): ShareCardData {
  const movies = list.items.filter((item) => item.mediaType === 'movie').length;
  const series = list.items.length - movies;
  return {
    eyebrow: `Una lista de ${list.ownerName}`,
    headline: list.name,
    subline: url.replace(/^https?:\/\//, ''),
    stats: [
      { value: String(list.items.length), label: list.items.length === 1 ? 'título' : 'títulos' },
      ...(movies ? [{ value: String(movies), label: movies === 1 ? 'película' : 'películas' }] : []),
      ...(series ? [{ value: String(series), label: series === 1 ? 'serie' : 'series' }] : []),
    ],
  };
}
