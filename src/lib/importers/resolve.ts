import { MediaType, TMDbDetail } from '@/types';
import type { TitleCandidate } from '@/lib/tmdb';
import { mapPool } from '@/lib/concurrency';
import { MatchResult, classifyMatch } from '@/lib/importers/match';
import { ImportRecord } from '@/lib/importers/types';

/** Lo que hace falta de TMDB para resolver: en la app, `findTitles` y `getMediaDetail`. */
export interface ResolveDeps {
  find: (
    query: { imdb: string } | { type: MediaType; query: string; year?: number },
  ) => Promise<TitleCandidate[]>;
  detail: (id: number, mediaType: MediaType) => Promise<TMDbDetail>;
}

export interface Resolution {
  record: ImportRecord;
  result: MatchResult;
  /** La ficha, cuando se pidió: con el id de TMDB ya en la mano (Trakt). */
  detail?: TMDbDetail;
}

/** Cuántos pedidos a la vez: TMDB aguanta unos 40 por segundo, y pasan por nuestra función. */
export const RESOLVE_CONCURRENCY = 6;

/**
 * A qué título de TMDB corresponde un registro.
 *
 * - Con el id de TMDB (Trakt) no hay nada que buscar: se pide la ficha, que
 *   trae el póster y deja el título ya enriquecido. Si falla, entra igual con
 *   lo que dice el export, y el refresco en segundo plano lo completa.
 * - Con el id de IMDb, `/find`.
 * - Si no, por título y año; si con el año no aparece nada, sin el año, que
 *   a veces las apps anotan el de otro estreno.
 */
export async function resolveRecord(record: ImportRecord, deps: ResolveDeps): Promise<Resolution> {
  if (record.ids.tmdb && record.mediaType) {
    const fallback: TitleCandidate = {
      id: record.ids.tmdb,
      mediaType: record.mediaType,
      title: record.title,
      ...(record.year ? { year: record.year } : {}),
      posterPath: null,
    };
    try {
      const detail = await deps.detail(record.ids.tmdb, record.mediaType);
      const date = detail.release_date || detail.first_air_date || '';
      const year = Number(date.slice(0, 4));
      return {
        record,
        detail,
        result: {
          kind: 'exact',
          candidate: {
            ...fallback,
            title: (detail.title || detail.name || record.title).trim(),
            ...(Number.isInteger(year) && year > 0 ? { year } : {}),
            posterPath: detail.poster_path ?? null,
            backdropPath: detail.backdrop_path ?? null,
            genreIds: (detail.genres ?? []).map((genre) => genre.id),
          },
        },
      };
    } catch {
      return { record, result: { kind: 'exact', candidate: fallback } };
    }
  }

  if (record.ids.imdb) {
    return { record, result: classifyMatch(record, await deps.find({ imdb: record.ids.imdb })) };
  }

  const type = record.mediaType ?? 'movie';
  let results = await deps.find({ type, query: record.title, ...(record.year ? { year: record.year } : {}) });
  if (results.length === 0 && record.year) results = await deps.find({ type, query: record.title });
  return { record, result: classifyMatch(record, results) };
}

/**
 * Todos, de a pocos a la vez, con avance y la posibilidad de cortar. Uno que
 * falla —TMDB caído un momento— queda como "no apareció": se puede buscar a
 * mano en la revisión.
 */
export async function resolveAll(
  records: ImportRecord[],
  deps: ResolveDeps,
  options: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Resolution[]> {
  const results = await mapPool(records, RESOLVE_CONCURRENCY, (record) => resolveRecord(record, deps), options);
  return results.flatMap((outcome, index): Resolution[] => {
    if (outcome === undefined) return [];
    return [outcome.ok ? outcome.value : { record: records[index], result: { kind: 'missing' } }];
  });
}
