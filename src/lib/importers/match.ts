import type { TitleCandidate } from '@/lib/tmdb';
import { ImportRecord } from '@/lib/importers/types';

/** Un título de TMDB que puede ser el del export (lo que devuelve `findTitles`). */
export type Candidate = TitleCandidate;

export type MatchResult =
  | { kind: 'exact'; candidate: Candidate }
  /** Más de uno posible: lo elige la persona en la revisión. */
  | { kind: 'doubtful'; options: Candidate[] }
  | { kind: 'missing' };

/** Cuántas opciones se ofrecen en un dudoso: más que eso ya no ayuda a elegir. */
const MAX_OPTIONS = 5;

/**
 * Un título para comparar: sin mayúsculas, acentos ni puntuación, y con "&"
 * como "and". "Amélie" y "Amelie", "Love, Death & Robots" y "Love Death and
 * Robots" son el mismo.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sameTitle(record: ImportRecord, candidate: Candidate): boolean {
  const wanted = normalizeTitle(record.title);
  return (
    normalizeTitle(candidate.title) === wanted ||
    (candidate.originalTitle !== undefined && normalizeTitle(candidate.originalTitle) === wanted)
  );
}

/**
 * Cuál de los resultados de TMDB es el título del export.
 *
 * - Con el id de IMDb, TMDB contesta exacto: uno solo es ese. Si el tipo que
 *   dice IMDb no coincide pero hay uno solo, también.
 * - Por título y año (Letterboxd): el que tiene el mismo año y el mismo
 *   título, o el único de ese año. Dos con el mismo título y año —una
 *   remake estrenada el mismo año, un corto con el nombre de la película—
 *   son un dudoso. Sin ninguno de ese año, lo que haya es un dudoso: puede
 *   ser el año de otro estreno.
 */
export function classifyMatch(record: ImportRecord, results: Candidate[]): MatchResult {
  if (results.length === 0) return { kind: 'missing' };

  if (record.ids.imdb) {
    const ofType = record.mediaType ? results.filter((result) => result.mediaType === record.mediaType) : results;
    const pool = ofType.length > 0 ? ofType : results;
    return pool.length === 1
      ? { kind: 'exact', candidate: pool[0] }
      : { kind: 'doubtful', options: pool.slice(0, MAX_OPTIONS) };
  }

  const ofType = record.mediaType ? results.filter((result) => result.mediaType === record.mediaType) : results;
  if (ofType.length === 0) return { kind: 'missing' };

  if (record.year === undefined) {
    const titled = ofType.filter((result) => sameTitle(record, result));
    return titled.length === 1
      ? { kind: 'exact', candidate: titled[0] }
      : { kind: 'doubtful', options: (titled.length > 0 ? titled : ofType).slice(0, MAX_OPTIONS) };
  }

  const sameYear = ofType.filter((result) => result.year === record.year);
  const exactTitle = sameYear.filter((result) => sameTitle(record, result));
  if (exactTitle.length === 1) return { kind: 'exact', candidate: exactTitle[0] };
  if (exactTitle.length > 1) return { kind: 'doubtful', options: exactTitle.slice(0, MAX_OPTIONS) };
  if (sameYear.length === 1) return { kind: 'exact', candidate: sameYear[0] };
  if (sameYear.length > 1) return { kind: 'doubtful', options: sameYear.slice(0, MAX_OPTIONS) };
  return { kind: 'doubtful', options: ofType.slice(0, MAX_OPTIONS) };
}
