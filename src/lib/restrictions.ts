import { MediaType, RestrictionScope, Restrictions, TMDbResult } from '@/types';
import type { DiscoverParams } from '@/lib/tmdb';
import { excludableGenreOptions, getGenreId, getGenreNames } from '@/lib/genres';

/**
 * Lo que la persona dijo que no le interesa, y cómo se aplica a Explorar.
 *
 * Se aplica en dos lugares y hacen falta los dos. Las filas de `/discover` se
 * piden ya filtradas, porque si no vuelven flacas y se caen: pedir "terror de
 * los 80" para descartar todo después es tirar la fila. El resto —parecidos,
 * tendencias, filmografías— no se puede pedir filtrado, así que se descarta
 * título por título cuando cada fila reclama los suyos (ver `feed.ts`).
 */

/** El primer año que se puede elegir: antes de eso TMDB tiene muy poco. */
export const MIN_YEAR_FLOOR = 1900;

/**
 * Cuántos géneros excluidos se le mandan a `/discover`.
 *
 * Es el tope que acepta el servidor para `without`. Los que no entran se
 * filtran igual, del lado de acá, al reclamar los títulos.
 */
const MAX_DISCOVER_WITHOUT = 3;

export function emptyRestrictions(): Restrictions {
  return { excludedGenres: [], updatedAt: new Date(0).toISOString() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseScope(value: unknown): RestrictionScope {
  return value === 'movie' || value === 'tv' ? value : 'both';
}

function parseMinYear(value: unknown, now: Date): Restrictions['minYear'] {
  if (!isRecord(value)) return undefined;
  const year = Number(value.year);
  if (!Number.isInteger(year) || year < MIN_YEAR_FLOOR || year > now.getFullYear()) {
    return undefined;
  }
  return { year, scope: parseScope(value.scope) };
}

function parseExcludedGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Solo los que la app sabe traducir: un género que no está en el mapa no
  // descartaría nada y ocuparía un lugar en la pantalla.
  const known = new Set(excludableGenreOptions());
  const genres = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => known.has(item));
  return Array.from(new Set(genres));
}

/**
 * Valida lo que venga de Firestore, de `localStorage` o de un backup.
 *
 * Nunca falla, como el cuestionario: lo roto vuelve vacío, que en este caso
 * quiere decir "sin restricciones" y Explorar sigue andando.
 */
export function parseRestrictions(value: unknown, now = new Date()): Restrictions {
  if (!isRecord(value)) return emptyRestrictions();

  return {
    minYear: parseMinYear(value.minYear, now),
    excludedGenres: parseExcludedGenres(value.excludedGenres),
    updatedAt:
      typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))
        ? value.updatedAt
        : new Date(0).toISOString(),
  };
}

export function hasRestrictions(restrictions: Restrictions): boolean {
  return restrictions.minYear !== undefined || restrictions.excludedGenres.length > 0;
}

/** Firestore rechaza `undefined`: el año que falta va como `null`. */
export function restrictionsToDocument(restrictions: Restrictions): Record<string, unknown> {
  return {
    minYear: restrictions.minYear ?? null,
    excludedGenres: restrictions.excludedGenres,
    updatedAt: restrictions.updatedAt,
  };
}

/** El año mínimo que corre para este tipo de título, si corre alguno. */
function minYearFor(restrictions: Restrictions, mediaType: MediaType): number | undefined {
  const { minYear } = restrictions;
  if (!minYear) return undefined;
  return minYear.scope === 'both' || minYear.scope === mediaType ? minYear.year : undefined;
}

/**
 * Si un título se puede recomendar.
 *
 * Uno sin fecha pasa: no hay con qué juzgarlo, y descartarlo castigaría a los
 * que TMDB tiene incompletos. Uno sin géneros —los que llegan de la actividad
 * de la gente que seguís— pasa el filtro de géneros por el mismo motivo.
 */
export function passesRestrictions(result: TMDbResult, restrictions: Restrictions): boolean {
  const floor = minYearFor(restrictions, result.media_type);
  if (floor !== undefined) {
    const year = Number((result.release_date || result.first_air_date || '').slice(0, 4));
    if (year > 0 && year < floor) return false;
  }

  if (restrictions.excludedGenres.length > 0) {
    const excluded = new Set(restrictions.excludedGenres);
    if (getGenreNames(result.genre_ids).some((name) => excluded.has(name))) return false;
  }

  return true;
}

/**
 * Los criterios de una fila de `/discover`, con las restricciones adentro.
 *
 * Devuelve `null` cuando la fila las contradice —"los 80" con un piso en
 * 1990, "terror" con el terror excluido—: esa fila no tiene nada que mostrar y
 * no se arma.
 */
export function restrictDiscover(
  params: DiscoverParams,
  restrictions: Restrictions,
): DiscoverParams | null {
  if (!hasRestrictions(restrictions)) return params;

  const floor = minYearFor(restrictions, params.mediaType);
  if (floor !== undefined && params.to !== undefined && params.to < floor) return null;

  const excludedIds = restrictions.excludedGenres
    .map((name) => getGenreId(name, params.mediaType))
    .filter((id): id is number => id !== undefined);
  if (params.genres?.some((id) => excludedIds.includes(id))) return null;

  const withoutGenres = Array.from(
    new Set([...(params.withoutGenres ?? []), ...excludedIds]),
  ).slice(0, MAX_DISCOVER_WITHOUT);

  return {
    ...params,
    ...(floor !== undefined ? { from: Math.max(params.from ?? floor, floor) } : {}),
    ...(withoutGenres.length > 0 ? { withoutGenres } : {}),
  };
}

/** Pone o saca un género de la lista de excluidos, con la fecha de ahora. */
export function toggleExcludedGenre(
  restrictions: Restrictions,
  genre: string,
  now = new Date(),
): Restrictions {
  const excludedGenres = restrictions.excludedGenres.includes(genre)
    ? restrictions.excludedGenres.filter((name) => name !== genre)
    : [...restrictions.excludedGenres, genre];
  return { ...restrictions, excludedGenres, updatedAt: now.toISOString() };
}

/**
 * Los años que se ofrecen como piso: el comienzo de cada década.
 *
 * Nadie piensa "nada anterior a 1987"; piensa "nada de antes de los 90". La
 * última es la década actual, que se calcula para que la lista se corra sola.
 */
export function minYearOptions(now = new Date()): number[] {
  const current = Math.floor(now.getFullYear() / 10) * 10;
  const years: number[] = [];
  for (let year = 1960; year <= current; year += 10) years.push(year);
  return years;
}
