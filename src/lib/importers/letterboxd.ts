import { csvHeader, csvRecords } from '@/lib/importers/csv';
import { fromStars } from '@/lib/importers/ratings';
import { ImportFile, ImportRecord, ImportWatch } from '@/lib/importers/types';

/**
 * El export de Letterboxd: un ZIP con varios CSV. Se leen cinco:
 *
 * - `diary.csv`: cada vez que se vio algo, con su fecha (`Watched Date`), el
 *   puntaje de esa vez y si fue una vuelta a ver (`Rewatch`). Cada fila es
 *   una entrada del historial.
 * - `reviews.csv`: lo mismo que el diario, más el texto de la reseña.
 * - `ratings.csv`: el puntaje actual de cada película.
 * - `watched.csv`: lo marcado como visto, aunque no tenga fecha ni puntaje.
 * - `watchlist.csv`: lo que está para ver.
 *
 * Letterboxd identifica las películas por su propio link, no por un id de
 * TMDB: el match es por título y año. Es solo de películas.
 */

const FILES = ['diary', 'reviews', 'ratings', 'watched', 'watchlist'] as const;
type LetterboxdFile = (typeof FILES)[number];

/** Qué CSV del export es, por el nombre; `null` si no es uno que se lea. */
export function letterboxdFileKind(name: string): LetterboxdFile | null {
  const base = name.split('/').pop()?.toLowerCase().replace(/\.csv$/, '') ?? '';
  return (FILES as readonly string[]).includes(base) ? (base as LetterboxdFile) : null;
}

export function isLetterboxdHeader(header: string[]): boolean {
  return header.includes('Letterboxd URI') && header.includes('Name');
}

function day(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

/** Las etiquetas vienen en un solo campo: "con amigos, para llorar". */
function tags(value: string | undefined): string[] | undefined {
  const list = (value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
  return list.length ? list : undefined;
}

/** Las reseñas pueden traer HTML simple: queda el texto. */
function plainText(value: string | undefined): string | undefined {
  const text = (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return text || undefined;
}

interface Film {
  title: string;
  year?: number;
  watches: ImportWatch[];
  watched: boolean;
  onWatchlist: boolean;
  /** El puntaje actual, de `ratings.csv`. */
  rating?: number;
  ratedAt?: string;
}

/**
 * Arma un registro por película juntando lo que dicen los cinco archivos.
 *
 * El historial de la app lleva siempre un puntaje: una vez vista sin puntaje
 * no se puede anotar como entrada. El puntaje actual de la película va a la
 * vez más reciente si esa no tenía; con eso, una película puntuada pero sin
 * diario también queda con su entrada, con la fecha en que se puntuó.
 */
export function parseLetterboxd(files: ImportFile[]): ImportRecord[] {
  const films = new Map<string, Film>();
  const film = (row: Record<string, string>): Film | null => {
    const title = row.Name?.trim();
    if (!title) return null;
    const year = Number(row.Year);
    const key = `${title.toLowerCase()}|${row.Year ?? ''}`;
    const current = films.get(key) ?? {
      title,
      ...(Number.isInteger(year) && year > 1800 ? { year } : {}),
      watches: [],
      watched: false,
      onWatchlist: false,
    };
    films.set(key, current);
    return current;
  };

  const byKind = (kind: LetterboxdFile) =>
    files.filter((file) => letterboxdFileKind(file.name) === kind).flatMap((file) => csvRecords(file.text));

  // El diario primero: las reseñas completan sus entradas.
  for (const row of byKind('diary')) {
    const entry = film(row);
    if (!entry) continue;
    entry.watched = true;
    entry.watches.push({
      date: day(row['Watched Date']) ?? day(row.Date),
      ...optional('rating', fromStars(row.Rating)),
      ...optional('tags', tags(row.Tags)),
    });
  }

  for (const row of byKind('reviews')) {
    const entry = film(row);
    if (!entry) continue;
    entry.watched = true;
    const date = day(row['Watched Date']) ?? day(row.Date);
    const text = plainText(row.Review);
    const same = entry.watches.find((watch) => watch.date === date && !watch.text);
    if (same) {
      if (text) same.text = text;
    } else {
      entry.watches.push({
        date,
        ...optional('rating', fromStars(row.Rating)),
        ...optional('text', text),
        ...optional('tags', tags(row.Tags)),
      });
    }
  }

  for (const row of byKind('ratings')) {
    const entry = film(row);
    if (!entry) continue;
    entry.watched = true;
    entry.rating = fromStars(row.Rating);
    entry.ratedAt = day(row.Date);
  }

  for (const row of byKind('watched')) {
    const entry = film(row);
    if (entry) entry.watched = true;
  }

  for (const row of byKind('watchlist')) {
    const entry = film(row);
    if (entry) entry.onWatchlist = true;
  }

  return Array.from(films.values()).map((entry) => {
    const watches = [...entry.watches].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    if (entry.rating !== undefined) {
      if (watches.length === 0) watches.push({ date: entry.ratedAt, rating: entry.rating });
      else if (watches[0].rating === undefined) watches[0] = { ...watches[0], rating: entry.rating };
    }
    return {
      source: 'letterboxd' as const,
      title: entry.title,
      ...(entry.year !== undefined ? { year: entry.year } : {}),
      mediaType: 'movie' as const,
      ids: {},
      status: entry.watched ? ('completada' as const) : ('por_ver' as const),
      watches: entry.watched ? watches : [],
    };
  });
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

/** Si un CSV suelto es de Letterboxd, aunque se llame distinto. */
export function looksLikeLetterboxd(text: string): boolean {
  return isLetterboxdHeader(csvHeader(text));
}
