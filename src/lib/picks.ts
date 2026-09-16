import {
  MediaType,
  PickedPerson,
  PickedStudio,
  PickedTitle,
  TastePicks,
} from '@/types';

/**
 * Los gustos que la persona declara, con sus topes y su validación.
 *
 * Es la contracara de `taste.ts`: ahí el gusto se deduce de la biblioteca, acá
 * se pregunta. Las dos fuentes alimentan las mismas recetas de Explorar, pero
 * nacen distinto y por eso viven separadas — la deducida cambia sola cada vez
 * que puntuás algo, y esta no cambia hasta que alguien la edita.
 *
 * Como todo lo que entra a la app, pasa por una sola puerta: {@link parsePicks}
 * valida y normaliza lo que venga de Firestore, de `localStorage` o de un
 * backup importado.
 */

/** Cuántas respuestas admite cada pregunta de varias. */
export const MAX_GENRES = 3;
export const MAX_PEOPLE = 5;
export const MAX_STUDIOS = 3;

/** Largo máximo de un nombre guardado, por las dudas de lo que mande TMDB. */
const MAX_NAME = 80;

/**
 * Las décadas que se ofrecen.
 *
 * Arranca en 1960 porque antes de ahí "la década" deja de ser una manera útil
 * de describir lo que a alguien le gusta, y termina en la actual, que se
 * calcula: el día que empiecen los 30 la lista se corre sola.
 */
export function decadeOptions(now = new Date()): number[] {
  const current = Math.floor(now.getFullYear() / 10) * 10;
  const decades: number[] = [];
  for (let decade = 1960; decade <= current; decade += 10) decades.push(decade);
  return decades;
}

/** "Los 90", "Los 2000": cómo se lee una década en castellano. */
export function decadeLabel(decade: number): string {
  return decade < 2000 ? `Los ${String(decade).slice(2)}` : `Los ${decade}`;
}

/** Cuántas preguntas tiene el cuestionario. Es el denominador del progreso. */
export const TOTAL_QUESTIONS = 7;

/** Un cuestionario en blanco. */
export function emptyPicks(): TastePicks {
  return {
    genres: [],
    actors: [],
    directors: [],
    studios: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';
}

function parsePositiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePath(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parsePickedTitle(
  value: unknown,
  mediaType: MediaType,
): PickedTitle | undefined {
  if (!isRecord(value)) return undefined;

  const tmdbId = parsePositiveId(value.tmdbId);
  const title = parseName(value.title);
  if (tmdbId === null || !title) return undefined;

  return {
    tmdbId,
    // El tipo lo fija la pregunta, no el documento: la respuesta a "tu película
    // favorita" es una película aunque alguien haya guardado otra cosa.
    mediaType,
    title,
    posterPath: parsePath(value.posterPath),
    releaseYear:
      typeof value.releaseYear === 'string' && /^\d{4}$/.test(value.releaseYear)
        ? value.releaseYear
        : '',
  };
}

/** Deduplica por id conservando el orden en que se eligieron. */
function parsePeople(value: unknown, limit: number): PickedPerson[] {
  if (!Array.isArray(value)) return [];

  const people = new Map<number, PickedPerson>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = parsePositiveId(item.id);
    const name = parseName(item.name);
    if (id === null || !name || people.has(id)) continue;
    people.set(id, { id, name, profilePath: parsePath(item.profilePath) });
  }

  return Array.from(people.values()).slice(0, limit);
}

function parseStudios(value: unknown): PickedStudio[] {
  if (!Array.isArray(value)) return [];

  const studios = new Map<number, PickedStudio>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = parsePositiveId(item.id);
    const name = parseName(item.name);
    if (id === null || !name || studios.has(id)) continue;
    studios.set(id, { id, name, logoPath: parsePath(item.logoPath) });
  }

  return Array.from(studios.values()).slice(0, MAX_STUDIOS);
}

function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const genres = value
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .map((item) => item.trim());

  return Array.from(new Set(genres)).slice(0, MAX_GENRES);
}

function parseDecade(value: unknown): number | undefined {
  const decade = Number(value);
  if (!Number.isInteger(decade)) return undefined;
  return decadeOptions().includes(decade) ? decade : undefined;
}

/**
 * Valida y normaliza el cuestionario venga de donde venga.
 *
 * Nunca falla: un documento roto vuelve como cuestionario en blanco. Perder una
 * respuesta es molesto; voltear la pantalla del perfil por un campo con basura
 * adentro, mucho peor.
 */
export function parsePicks(value: unknown): TastePicks {
  if (!isRecord(value)) return emptyPicks();

  return {
    movie: parsePickedTitle(value.movie, 'movie'),
    series: parsePickedTitle(value.series, 'tv'),
    genres: parseGenres(value.genres),
    actors: parsePeople(value.actors, MAX_PEOPLE),
    directors: parsePeople(value.directors, MAX_PEOPLE),
    studios: parseStudios(value.studios),
    decade: parseDecade(value.decade),
    updatedAt:
      typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))
        ? value.updatedAt
        : new Date(0).toISOString(),
  };
}

/** Cuántas de las siete preguntas están contestadas. */
export function answeredCount(picks: TastePicks): number {
  return [
    picks.movie !== undefined,
    picks.series !== undefined,
    picks.genres.length > 0,
    picks.actors.length > 0,
    picks.directors.length > 0,
    picks.studios.length > 0,
    picks.decade !== undefined,
  ].filter(Boolean).length;
}

/** Si hay al menos una respuesta con la que armar una fila. */
export function hasPicks(picks: TastePicks): boolean {
  return answeredCount(picks) > 0;
}

/**
 * Los ids de los títulos elegidos.
 *
 * Explorar los descarta igual que a los de la biblioteca: recomendarle a
 * alguien la película que acaba de declarar favorita es el único resultado que
 * seguro ya vio.
 */
export function pickedTitleIds(picks: TastePicks): number[] {
  return [picks.movie?.tmdbId, picks.series?.tmdbId].filter(
    (id): id is number => id !== undefined,
  );
}
