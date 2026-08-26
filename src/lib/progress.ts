import { SavedMedia, SeasonInfo, SeriesProgress } from '@/types';

/**
 * Temporadas que cuentan para el progreso.
 *
 * La temporada 0 de TMDB son los especiales: navidad, detrás de escena, cosas
 * que casi nadie considera parte de la serie. Contarlas haría que terminar
 * *Breaking Bad* nunca llegue al 100%.
 */
export function countableSeasons(media: SavedMedia): SeasonInfo[] {
  return (media.seasons ?? []).filter(
    (season) => season.seasonNumber > 0 && season.episodeCount > 0,
  );
}

/** Total de episodios de la serie, sin contar los especiales. */
export function totalEpisodes(media: SavedMedia): number {
  return countableSeasons(media).reduce(
    (total, season) => total + season.episodeCount,
    0,
  );
}

/** Episodios vistos, sin contar los de temporadas que ya no existen. */
export function watchedEpisodes(media: SavedMedia): number {
  const watched = media.progress?.watched;
  if (!watched) return 0;

  return countableSeasons(media).reduce((total, season) => {
    const episodes = watched[season.seasonNumber] ?? [];
    // Se acota al total de la temporada por si TMDB recortó episodios después
    // de que la persona los marcara: sin esto el progreso podría pasar de 100%.
    return total + Math.min(episodes.length, season.episodeCount);
  }, 0);
}

/** Si un episodio puntual está marcado como visto. */
export function isEpisodeWatched(
  progress: SeriesProgress | undefined,
  seasonNumber: number,
  episode: number,
): boolean {
  return progress?.watched[seasonNumber]?.includes(episode) ?? false;
}

/** Episodios vistos de una temporada. */
export function watchedInSeason(
  progress: SeriesProgress | undefined,
  seasonNumber: number,
): number {
  return progress?.watched[seasonNumber]?.length ?? 0;
}

/** Porcentaje visto, de 0 a 100. Devuelve 0 si no sabemos cuántos episodios hay. */
export function progressPercent(media: SavedMedia): number {
  const total = totalEpisodes(media);
  if (total === 0) return 0;
  return Math.round((watchedEpisodes(media) / total) * 100);
}

/** Si están marcados todos los episodios de todas las temporadas. */
export function isSeriesComplete(media: SavedMedia): boolean {
  const total = totalEpisodes(media);
  return total > 0 && watchedEpisodes(media) >= total;
}

/**
 * El primer episodio sin marcar, recorriendo en orden.
 *
 * Es lo que responde "¿por dónde iba?" cuando alguien retoma una serie después
 * de meses. `null` si no arrancó o si ya la terminó.
 */
export function nextEpisode(
  media: SavedMedia,
): { seasonNumber: number; episode: number } | null {
  if (watchedEpisodes(media) === 0) return null;

  for (const season of countableSeasons(media)) {
    const seen = media.progress?.watched[season.seasonNumber] ?? [];
    for (let episode = 1; episode <= season.episodeCount; episode++) {
      if (!seen.includes(episode)) {
        return { seasonNumber: season.seasonNumber, episode };
      }
    }
  }
  return null;
}

/** "T2E5", para mostrar al lado del progreso. */
export function formatEpisode(seasonNumber: number, episode: number): string {
  return `T${seasonNumber}E${episode}`;
}

/**
 * Marca o desmarca un episodio, devolviendo el progreso nuevo.
 *
 * Es pura: no toca el argumento. Quien llama decide qué hacer con el resultado
 * —guardarlo en Firestore o en el store local—, que es lo que permite testear
 * la regla sin levantar nada.
 */
export function toggleEpisode(
  progress: SeriesProgress | undefined,
  seasonNumber: number,
  episode: number,
): SeriesProgress {
  const watched = { ...(progress?.watched ?? {}) };
  const current = watched[seasonNumber] ?? [];

  const next = current.includes(episode)
    ? current.filter((e) => e !== episode)
    : [...current, episode].sort((a, b) => a - b);

  if (next.length > 0) watched[seasonNumber] = next;
  else delete watched[seasonNumber];

  return { watched, lastWatchedAt: new Date().toISOString() };
}

/**
 * Marca o desmarca una temporada entera.
 *
 * Marcar la temporada completa es el atajo más pedido: nadie quiere tildar
 * veintitrés episodios de a uno para registrar una serie que ya vio.
 */
export function toggleSeason(
  progress: SeriesProgress | undefined,
  season: SeasonInfo,
): SeriesProgress {
  const watched = { ...(progress?.watched ?? {}) };
  const isComplete =
    (watched[season.seasonNumber]?.length ?? 0) >= season.episodeCount;

  if (isComplete) {
    delete watched[season.seasonNumber];
  } else {
    watched[season.seasonNumber] = Array.from(
      { length: season.episodeCount },
      (_, index) => index + 1,
    );
  }

  return { watched, lastWatchedAt: new Date().toISOString() };
}
