import { MediaType } from '@/types';
import { csvRecords } from '@/lib/importers/csv';
import { fromTenPoint } from '@/lib/importers/ratings';
import { ImportRecord } from '@/lib/importers/types';

/**
 * El CSV de IMDb: el de "Tus puntajes" (`ratings.csv`) o el de una lista
 * —la de "Para ver" incluida—, que trae una columna `Position` de más.
 *
 * El `Const` es el id `tt…`, que TMDB resuelve exacto con `/find`. Lo
 * puntuado entra como visto, con su puntaje de 1 a 10 pasado a estrellas;
 * lo de una lista sin puntaje, a *Por Ver*.
 */

/**
 * El tipo de título. IMDb lo escribió de dos formas según la época del
 * export —`tvSeries` y `TV Series`—: se comparan sin mayúsculas ni espacios.
 * Los episodios sueltos, los videojuegos y los podcasts no son títulos de la
 * biblioteca.
 */
const TYPES: Record<string, MediaType> = {
  movie: 'movie',
  tvmovie: 'movie',
  short: 'movie',
  video: 'movie',
  tvspecial: 'movie',
  tvshort: 'movie',
  tvseries: 'tv',
  tvminiseries: 'tv',
};

export function imdbMediaType(value: string): MediaType | null {
  return TYPES[value.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

/** Si un encabezado es de un export de IMDb. */
export function isImdbHeader(header: string[]): boolean {
  return header.includes('Const') && (header.includes('Your Rating') || header.includes('Position'));
}

function day(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

export interface ImdbParseResult {
  records: ImportRecord[];
  /** Filas que no son títulos de la biblioteca: episodios sueltos, juegos. */
  skipped: number;
}

export function parseImdbCsv(text: string): ImdbParseResult {
  const records: ImportRecord[] = [];
  let skipped = 0;

  for (const row of csvRecords(text)) {
    const imdb = row.Const;
    const title = row.Title || row['Original Title'];
    const mediaType = imdbMediaType(row['Title Type'] ?? '');
    if (!imdb || !/^tt\d+$/.test(imdb) || !title || !mediaType) {
      skipped += 1;
      continue;
    }

    const rating = fromTenPoint(row['Your Rating']);
    const year = Number(row.Year);
    records.push({
      source: 'imdb',
      title,
      ...(Number.isInteger(year) && year > 1800 ? { year } : {}),
      mediaType,
      ids: { imdb },
      status: rating !== undefined ? 'completada' : 'por_ver',
      watches: rating !== undefined ? [{ rating, date: day(row['Date Rated']) }] : [],
    });
  }

  return { records, skipped };
}
