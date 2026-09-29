import { MediaType, SavedMedia } from '@/types';
import type { PersonPageCredit } from '@/lib/tmdb';
import { formatDay, isDayKey } from '@/lib/dates';

/**
 * La filmografía de una persona, marcada según la biblioteca.
 *
 * Todo puro: la lista viene de TMDB (`/api/tmdb/person-page`) y la marca de
 * cada título sale de la biblioteca de quien mira.
 */

export type PersonRole = 'reparto' | 'direccion';

/** Cómo está un título en tu biblioteca, en palabras de la página. */
export type LibraryMark = 'visto' | 'viendo' | 'por_ver' | 'en_pausa' | 'abandonado';

export const MARK_LABELS: Record<LibraryMark, string> = {
  visto: 'Visto',
  viendo: 'Viendo',
  por_ver: 'Por ver',
  en_pausa: 'En pausa',
  abandonado: 'Abandonado',
};

export interface FilmographyItem {
  id: number;
  mediaType: MediaType;
  title: string;
  /** `YYYY-MM-DD`, o `null` si todavía no tiene fecha. */
  date: string | null;
  year: number | null;
  posterPath: string | null;
  /** Qué hizo: actuó, dirigió, o las dos cosas. */
  roles: PersonRole[];
  character: string | null;
  job: string | null;
  voteAverage: number;
  voteCount: number;
  mark: LibraryMark | null;
}

export function markOf(media: SavedMedia | undefined): LibraryMark | null {
  if (!media) return null;
  switch (media.status) {
    case 'completada':
      return 'visto';
    case 'viendo':
      return 'viendo';
    case 'por_ver':
      return 'por_ver';
    case 'en_pausa':
      return 'en_pausa';
    case 'abandonada':
      return 'abandonado';
  }
}

/**
 * La filmografía sin repetidos: quien dirigió y actuó en lo mismo aparece una
 * vez, con los dos papeles. De lo más nuevo a lo más viejo; lo que todavía
 * no tiene fecha, arriba de todo, que es lo que viene.
 */
export function buildFilmography(credits: PersonPageCredit[], mediaList: SavedMedia[]): FilmographyItem[] {
  const library = new Map(mediaList.map((media) => [`${media.mediaType}:${media.tmdbId}`, media]));
  const byTitle = new Map<string, FilmographyItem>();

  for (const credit of credits) {
    const key = `${credit.media_type}:${credit.id}`;
    const known = byTitle.get(key);
    if (known) {
      if (!known.roles.includes(credit.role)) known.roles.push(credit.role);
      known.character ??= credit.character;
      known.job ??= credit.job;
      continue;
    }
    const year = credit.date ? Number(credit.date.slice(0, 4)) : null;
    byTitle.set(key, {
      id: credit.id,
      mediaType: credit.media_type,
      title: credit.title,
      date: credit.date,
      year: year && Number.isInteger(year) ? year : null,
      posterPath: credit.poster_path,
      roles: [credit.role],
      character: credit.character,
      job: credit.job,
      voteAverage: credit.vote_average,
      voteCount: credit.vote_count,
      mark: markOf(library.get(key)),
    });
  }

  return Array.from(byTitle.values()).sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title, 'es');
    if (a.date === null) return -1;
    if (b.date === null) return 1;
    return b.date.localeCompare(a.date);
  });
}

/** Los papeles que tiene la filmografía: el filtro se ofrece solo si hay dos. */
export function rolesIn(items: FilmographyItem[]): PersonRole[] {
  const roles = new Set(items.flatMap((item) => item.roles));
  return (['reparto', 'direccion'] as const).filter((role) => roles.has(role));
}

export function filterByRole(items: FilmographyItem[], role: PersonRole | null): FilmographyItem[] {
  return role ? items.filter((item) => item.roles.includes(role)) : items;
}

/**
 * Con cuántos votos un puntaje de TMDB empieza a decir algo: sin mínimo, una
 * película con tres votos de 10 le gana a una obra maestra.
 */
export const MIN_VOTES = 300;

/**
 * Desde dónde un puntaje de TMDB es "bien puntuada". Sin piso, a quien hizo
 * pocas cosas buenas se le recomendaría igual lo mejor de lo flojo.
 */
export const MIN_RATING = 7;

export interface PersonSummary {
  /** Los estrenados que viste. */
  seen: number;
  /** Los estrenados: lo anunciado no cuenta como algo que "te falta". */
  total: number;
  /** Los mejor puntuados que no tenés en la biblioteca. */
  missingTopRated: FilmographyItem[];
}

/** "Viste 7 de 23" y "Te faltan estas 3 bien puntuadas". */
export function personSummary(
  items: FilmographyItem[],
  {
    today,
    minVotes = MIN_VOTES,
    minRating = MIN_RATING,
    limit = 3,
  }: { today: string; minVotes?: number; minRating?: number; limit?: number },
): PersonSummary {
  const released = items.filter((item) => item.date !== null && item.date <= today);
  return {
    seen: released.filter((item) => item.mark === 'visto').length,
    total: released.length,
    missingTopRated: released
      .filter((item) => item.mark === null && item.voteCount >= minVotes && item.voteAverage >= minRating)
      .sort((a, b) => b.voteAverage - a.voteAverage || b.voteCount - a.voteCount)
      .slice(0, limit),
  };
}

/**
 * El departamento de TMDB en castellano. Lo que no está en la lista no se
 * muestra: mejor nada que "Crew" en inglés en medio de la página.
 */
const DEPARTMENTS: Record<string, string> = {
  Acting: 'Actuación',
  Directing: 'Dirección',
  Writing: 'Guion',
  Production: 'Producción',
  Camera: 'Fotografía',
  Editing: 'Montaje',
  Sound: 'Sonido',
  Art: 'Arte',
  'Costume & Make-Up': 'Vestuario y maquillaje',
  'Visual Effects': 'Efectos visuales',
  Lighting: 'Iluminación',
};

export function departmentLabel(department: string | null): string | null {
  return department ? (DEPARTMENTS[department] ?? null) : null;
}

/** Los años cumplidos entre dos días `YYYY-MM-DD`. */
export function ageOn(birthday: string, day: string): number {
  const years = Number(day.slice(0, 4)) - Number(birthday.slice(0, 4));
  // Todavía no cumplió este año si el mes y el día de hoy van antes.
  return day.slice(5) < birthday.slice(5) ? years - 1 : years;
}

/**
 * La línea de datos bajo el nombre: dónde y cuándo nació, y la edad —la que
 * tiene, o la que tenía al morir—. Sin fechas, lo que haya; sin nada, `null`.
 */
export function lifeFacts(
  person: { birthday: string | null; deathday: string | null; place_of_birth: string | null },
  today: string,
): string | null {
  const { birthday, deathday, place_of_birth: place } = person;
  const facts: string[] = [];
  if (birthday && isDayKey(birthday)) {
    facts.push(`Nació el ${formatDay(birthday)}${place ? ` en ${place}` : ''}`);
    if (deathday && isDayKey(deathday)) {
      facts.push(`Murió el ${formatDay(deathday)}, a los ${ageOn(birthday, deathday)} años`);
    } else {
      facts.push(`${ageOn(birthday, today)} años`);
    }
  } else if (place) {
    facts.push(`Nació en ${place}`);
  }
  return facts.length > 0 ? facts.join(' · ') : null;
}

/**
 * El renglón bajo cada póster: el año y qué hizo ahí —el personaje, o que lo
 * dirigió o creó—. Lo que todavía no tiene fecha dice "Próximamente".
 */
export function creditLine(item: FilmographyItem): string {
  const directed = item.roles.includes('direccion');
  const acted = item.roles.includes('reparto');
  const what = directed
    ? acted
      ? `Dirigió y actuó${item.character ? ` (${item.character})` : ''}`
      : item.job === 'Creator'
        ? 'Creó la serie'
        : 'Dirigió'
    : item.character;
  return [item.year ?? 'Próximamente', what].filter(Boolean).join(' · ');
}
