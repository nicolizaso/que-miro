import { strFromU8, unzipSync } from 'fflate';
import { csvHeader } from '@/lib/importers/csv';
import { isImdbHeader, parseImdbCsv } from '@/lib/importers/imdb';
import { isLetterboxdHeader, letterboxdFileKind, parseLetterboxd } from '@/lib/importers/letterboxd';
import { isTraktExport, parseTrakt } from '@/lib/importers/trakt';
import { ImportFile, ImportRecord, ImportSource } from '@/lib/importers/types';

/**
 * Qué se eligió y de qué app es. Se reconoce por el contenido y no por el
 * nombre del archivo, salvo en Letterboxd, donde el nombre dice cuál de sus
 * CSV es (el de lo visto y el de para ver tienen las mismas columnas).
 */

/** Los archivos de adentro de un ZIP, como texto. Solo CSV y JSON. */
export function unzipTextFiles(bytes: Uint8Array): ImportFile[] {
  const entries = unzipSync(bytes, {
    filter: (file) => /\.(csv|json)$/i.test(file.name) && !file.name.startsWith('__MACOSX/'),
  });
  return Object.entries(entries).map(([name, data]) => ({ name, text: strFromU8(data) }));
}

export interface ParsedImport {
  records: ImportRecord[];
  bySource: Partial<Record<ImportSource, number>>;
  /** Filas que no son títulos de la biblioteca: episodios sueltos, juegos. */
  skipped: number;
  /** Archivos que no se reconocieron como de ninguna app. */
  unknown: string[];
}

/**
 * Un CSV de Letterboxd sin su nombre de siempre: se deduce por las columnas.
 * Lo visto y lo para ver son iguales; sin el nombre, cuenta como visto.
 */
function letterboxdName(file: ImportFile, header: string[]): string {
  if (letterboxdFileKind(file.name)) return file.name;
  if (header.includes('Review')) return 'reviews.csv';
  if (header.includes('Watched Date')) return 'diary.csv';
  if (header.includes('Rating')) return 'ratings.csv';
  return /watchlist/i.test(file.name) ? 'watchlist.csv' : 'watched.csv';
}

export function parseImportFiles(files: ImportFile[]): ParsedImport {
  const letterboxd: ImportFile[] = [];
  const trakt: ImportFile[] = [];
  const records: ImportRecord[] = [];
  const unknown: string[] = [];
  let skipped = 0;

  for (const file of files) {
    if (/\.json$/i.test(file.name)) {
      try {
        if (isTraktExport(JSON.parse(file.text))) {
          trakt.push(file);
          continue;
        }
      } catch {
        // No es JSON: va a desconocidos.
      }
      unknown.push(file.name);
      continue;
    }

    const header = csvHeader(file.text);
    if (isLetterboxdHeader(header)) {
      letterboxd.push({ name: letterboxdName(file, header), text: file.text });
    } else if (isImdbHeader(header)) {
      const result = parseImdbCsv(file.text);
      records.push(...result.records);
      skipped += result.skipped;
    } else {
      unknown.push(file.name);
    }
  }

  if (letterboxd.length) records.push(...parseLetterboxd(letterboxd));
  if (trakt.length) records.push(...parseTrakt(trakt));

  const bySource: Partial<Record<ImportSource, number>> = {};
  for (const record of records) bySource[record.source] = (bySource[record.source] ?? 0) + 1;

  return { records, bySource, skipped, unknown };
}
