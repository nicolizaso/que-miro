import { SeasonInfo, TMDbEpisode } from '@/types';

/**
 * Lo que se lee de los episodios de una temporada: si ya salieron, cuánto
 * duran, cuáles son finales.
 *
 * Todo puro, sobre lo que manda `/api/tmdb/season`: la grilla de progreso lo
 * dibuja y la biblioteca guarda solo lo que vale la pena cachear.
 */

/**
 * Si el episodio ya salió.
 *
 * `today` es el día de quien mira (`toDayKey`): TMDB da días y no horas, y el
 * episodio que sale hoy cuenta como salido, porque es el que alguien va a
 * querer marcar esta noche.
 */
export function isEpisodeAired(episode: Pick<TMDbEpisode, 'air_date'>, today: string): boolean {
  return episode.air_date !== null && episode.air_date <= today;
}

/**
 * Minutos que dura la temporada entera, o `undefined` si no se sabe.
 *
 * Solo si todos los episodios traen su duración: sumar los que la tienen y
 * callar los que no daría una temporada más corta de lo que es, y ese número
 * terminaría en "horas mirando" como si fuera cierto.
 */
export function seasonTotalRuntime(
  episodes: Pick<TMDbEpisode, 'runtime'>[],
): number | undefined {
  if (episodes.length === 0) return undefined;
  let total = 0;
  for (const episode of episodes) {
    if (!episode.runtime || episode.runtime <= 0) return undefined;
    total += episode.runtime;
  }
  return total;
}

/** Cómo se lee el tipo de episodio, o `null` si es uno común. */
export function episodeTypeLabel(type: string | null): string | null {
  if (type === 'finale') return 'Final de temporada';
  if (type === 'mid_season') return 'Mitad de temporada';
  return null;
}

/**
 * Las temporadas con la duración de una de ellas anotada.
 *
 * Devuelve `null` si no hay nada que cambiar —la temporada no está, o ya tenía
 * esa duración—: quien llama se ahorra una escritura que no cambia nada.
 */
export function withSeasonRuntime(
  seasons: SeasonInfo[],
  seasonNumber: number,
  totalRuntime: number,
): SeasonInfo[] | null {
  const index = seasons.findIndex((season) => season.seasonNumber === seasonNumber);
  if (index === -1 || seasons[index].totalRuntime === totalRuntime) return null;

  return seasons.map((season, position) =>
    position === index ? { ...season, totalRuntime } : season,
  );
}
