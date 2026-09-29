import {
  NewEpisodesMarker,
  SavedMedia,
  SeasonInfo,
  SeriesProgress,
} from '@/types';

/** Lo único de un título que hace falta para calcular su progreso. */
type WithProgress = Pick<SavedMedia, 'seasons' | 'progress'>;

/**
 * Lo que además hace falta para saber qué salió y qué no.
 *
 * Opcional a propósito: un título que todavía no pasó por el refresco no trae
 * nada de esto, y ahí todo lo cargado cuenta como salido —que es como se
 * calculaba antes de que existiera.
 */
type WithAiring = WithProgress &
  Partial<Pick<SavedMedia, 'mediaType' | 'seriesStatus' | 'lastAired' | 'nextToAir'>>;

/**
 * Temporadas que cuentan para el progreso.
 *
 * La temporada 0 de TMDB son los especiales: navidad, detrás de escena, cosas
 * que casi nadie considera parte de la serie. Contarlas haría que terminar
 * *Breaking Bad* nunca llegue al 100%.
 */
export function countableSeasons(media: WithProgress): SeasonInfo[] {
  return (media.seasons ?? []).filter(
    (season) => season.seasonNumber > 0 && season.episodeCount > 0,
  );
}

/** Total de episodios de la serie, sin contar los especiales. */
export function totalEpisodes(media: WithProgress): number {
  return countableSeasons(media).reduce(
    (total, season) => total + season.episodeCount,
    0,
  );
}

/** Episodios vistos, sin contar los de temporadas que ya no existen. */
export function watchedEpisodes(media: WithProgress): number {
  const watched = media.progress?.watched;
  if (!watched) return 0;

  return countableSeasons(media).reduce((total, season) => {
    const episodes = watched[season.seasonNumber] ?? [];
    // Se acota al total de la temporada por si TMDB recortó episodios después
    // de que la persona los marcara: sin esto el progreso podría pasar de 100%.
    return total + Math.min(episodes.length, season.episodeCount);
  }, 0);
}

/**
 * La serie sigue saliendo, según lo último que dijo TMDB.
 *
 * Es la diferencia entre "la terminé" y "estoy al día": de una serie en
 * emisión se puede haber visto todo lo que salió, pero no terminarla.
 */
export function isStillAiring(media: WithAiring): boolean {
  return (
    media.mediaType !== 'movie' &&
    (media.seriesStatus === 'Returning Series' || media.nextToAir !== undefined)
  );
}

/**
 * Hasta qué episodio salió la serie, o `null` si todo lo cargado ya salió.
 *
 * Sale de `lastAired`; si no está —o es un especial, que no dice nada de las
 * temporadas— se deduce del episodio anterior a `nextToAir`. Una serie
 * anunciada y sin nada emitido no llega a ninguna temporada.
 */
export function airedBoundary(
  media: WithAiring,
): { seasonNumber: number; episodeNumber: number } | null {
  const last = media.lastAired;
  if (last && last.seasonNumber > 0) {
    return { seasonNumber: last.seasonNumber, episodeNumber: last.episodeNumber };
  }

  const next = media.nextToAir;
  if (next && next.seasonNumber > 0) {
    return next.episodeNumber > 1
      ? { seasonNumber: next.seasonNumber, episodeNumber: next.episodeNumber - 1 }
      : { seasonNumber: next.seasonNumber - 1, episodeNumber: Infinity };
  }

  if (
    !last &&
    (media.seriesStatus === 'Planned' ||
      media.seriesStatus === 'In Production' ||
      media.seriesStatus === 'Pilot')
  ) {
    return { seasonNumber: 0, episodeNumber: Infinity };
  }

  return null;
}

/** Cuántos episodios de la temporada ya salieron. */
export function airedInSeason(media: WithAiring, season: SeasonInfo): number {
  const boundary = airedBoundary(media);
  if (!boundary || season.seasonNumber < boundary.seasonNumber) {
    return season.episodeCount;
  }
  if (season.seasonNumber > boundary.seasonNumber) return 0;
  return Math.min(boundary.episodeNumber, season.episodeCount);
}

/**
 * Episodios que ya salieron, sin contar los especiales.
 *
 * TMDB carga los episodios de una temporada antes de que salgan —con nombre y
 * fecha—, así que contra el total una serie en emisión nunca llegaba al 100%.
 */
export function airedEpisodes(media: WithAiring): number {
  return countableSeasons(media).reduce(
    (total, season) => total + airedInSeason(media, season),
    0,
  );
}

/** Episodios vistos de entre los que ya salieron. */
export function watchedAiredEpisodes(media: WithAiring): number {
  const watched = media.progress?.watched;
  if (!watched) return 0;

  return countableSeasons(media).reduce((total, season) => {
    const aired = airedInSeason(media, season);
    const seen = (watched[season.seasonNumber] ?? []).filter(
      (episode) => episode <= aired,
    ).length;
    return total + seen;
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

/**
 * Porcentaje visto de lo que ya salió, de 0 a 100.
 *
 * Contra lo emitido y no contra el total: una serie en emisión con la
 * temporada entera cargada de antemano no llegaba nunca al 100% por más que
 * se viera todo. Devuelve 0 si no sabemos cuántos episodios hay.
 */
export function progressPercent(media: WithAiring): number {
  const aired = airedEpisodes(media);
  if (aired === 0) return 0;
  return Math.round((watchedAiredEpisodes(media) / aired) * 100);
}

/** Si están marcados todos los episodios de todas las temporadas. */
export function isSeriesComplete(media: WithProgress): boolean {
  const total = totalEpisodes(media);
  return total > 0 && watchedEpisodes(media) >= total;
}

/** Si viste todo lo que salió hasta ahora. */
export function hasWatchedAllAired(media: WithAiring): boolean {
  const aired = airedEpisodes(media);
  return aired > 0 && watchedAiredEpisodes(media) >= aired;
}

/**
 * "Al día": viste todo lo que salió de una serie que sigue saliendo.
 *
 * Es un estado derivado y no uno más de la biblioteca: se calcula, no se
 * guarda. La serie sigue en *Viendo* —la estás viendo, solo que al ritmo en
 * que sale—, y el día que sale un episodio nuevo deja de estar al día sin que
 * nadie tenga que tocar nada.
 */
export function isCaughtUp(media: WithAiring): boolean {
  return isStillAiring(media) && hasWatchedAllAired(media);
}

/**
 * El primer episodio sin marcar, recorriendo en orden, de entre los que ya
 * salieron.
 *
 * Es lo que responde "¿por dónde iba?" cuando alguien retoma una serie después
 * de meses. `null` si no arrancó, si ya la terminó o si está al día: el
 * episodio que todavía no salió no es "el siguiente" de nadie.
 */
export function nextEpisode(
  media: WithAiring,
): { seasonNumber: number; episode: number } | null {
  if (watchedEpisodes(media) === 0) return null;
  return firstUnwatchedAired(media);
}

/**
 * El primer episodio emitido sin marcar, aunque la serie no haya arrancado.
 *
 * Es el "siguiente" de quien pasó una serie a *Viendo* sin marcar nada
 * todavía: el primero.
 */
export function firstUnwatchedAired(
  media: WithAiring,
): { seasonNumber: number; episode: number } | null {
  for (const season of countableSeasons(media)) {
    const seen = media.progress?.watched[season.seasonNumber] ?? [];
    const aired = airedInSeason(media, season);
    for (let episode = 1; episode <= aired; episode++) {
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

/** Los números del 1 al `count`, más los que ya había, sin repetir y en orden. */
function withRange(current: number[], count: number): number[] {
  const all = new Set(current);
  for (let episode = 1; episode <= count; episode++) all.add(episode);
  return Array.from(all).sort((a, b) => a - b);
}

/** La clave de un episodio en `watchedAt`: `"2x5"`. */
export function episodeKey(seasonNumber: number, episode: number): string {
  return `${seasonNumber}x${episode}`;
}

/**
 * El progreso con las fechas de los episodios recién marcados.
 *
 * Solo los recién marcados: lo que ya tenía fecha la conserva —marcar la
 * temporada entera no reescribe cuándo viste los primeros episodios—, y lo que
 * estaba marcado sin fecha sigue sin ella.
 */
function withDates(
  watched: Record<number, number[]>,
  previous: SeriesProgress | undefined,
  now: Date,
): SeriesProgress {
  const at = now.toISOString();
  const watchedAt: Record<string, string> = {};

  for (const [season, episodes] of Object.entries(watched)) {
    const before = previous?.watched[Number(season)] ?? [];
    for (const episode of episodes) {
      const key = episodeKey(Number(season), episode);
      const known = previous?.watchedAt?.[key];
      if (known) watchedAt[key] = known;
      else if (!before.includes(episode)) watchedAt[key] = at;
    }
  }

  return {
    watched,
    ...(Object.keys(watchedAt).length > 0 ? { watchedAt } : {}),
    lastWatchedAt: at,
  };
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
  now: Date = new Date(),
): SeriesProgress {
  const watched = { ...(progress?.watched ?? {}) };
  const current = watched[seasonNumber] ?? [];

  const next = current.includes(episode)
    ? current.filter((e) => e !== episode)
    : [...current, episode].sort((a, b) => a - b);

  if (next.length > 0) watched[seasonNumber] = next;
  else delete watched[seasonNumber];

  // Desmarcar borra la fecha: no se vio, así que tampoco cuándo.
  return withDates(watched, progress, now);
}

/**
 * Marca o desmarca una temporada entera.
 *
 * Marcar la temporada completa es el atajo más pedido: nadie quiere tildar
 * veintitrés episodios de a uno para registrar una serie que ya vio.
 *
 * `aired` es cuántos episodios de la temporada ya salieron: en una temporada
 * en emisión, "marcar toda" marca lo que se pudo ver, no lo que todavía no
 * existe. Por defecto, todos.
 */
export function toggleSeason(
  progress: SeriesProgress | undefined,
  season: SeasonInfo,
  aired: number = season.episodeCount,
  now: Date = new Date(),
): SeriesProgress {
  const watched = { ...(progress?.watched ?? {}) };
  const target = Math.min(aired, season.episodeCount);
  const current = watched[season.seasonNumber] ?? [];
  const isComplete =
    target > 0 && current.filter((episode) => episode <= target).length >= target;

  if (isComplete) {
    delete watched[season.seasonNumber];
  } else if (target > 0) {
    watched[season.seasonNumber] = withRange(current, target);
  }

  // Marcar la temporada de golpe les pone a todos los episodios nuevos la
  // misma fecha, la de ahora: es lo único que se sabe. Quien la marca entera
  // casi siempre está anotando algo que vio antes, así que en las
  // estadísticas va a aparecer como un día de mucha actividad, y es honesto:
  // es el día en que la registró.
  return withDates(watched, progress, now);
}

/**
 * El progreso de una serie con todos sus episodios vistos.
 *
 * Es lo que corresponde al marcarla como completada: decir que la terminaste
 * y que la grilla siga en 0 de 7 no tiene sentido. Los especiales que ya
 * estuvieran marcados se conservan, pero no se agregan: no cuentan para
 * terminarla. En una serie en emisión marca solo lo que ya salió.
 *
 * `undefined` si no hay nada que marcar: no es una serie, todavía no sabemos
 * sus temporadas o ya estaba entera.
 */
export function completeProgress(
  media: WithAiring & Pick<SavedMedia, 'mediaType'>,
  now: Date = new Date(),
): SeriesProgress | undefined {
  if (media.mediaType !== 'tv') return undefined;
  if (airedEpisodes(media) === 0 || hasWatchedAllAired(media)) return undefined;

  const watched = { ...(media.progress?.watched ?? {}) };
  for (const season of countableSeasons(media)) {
    const aired = airedInSeason(media, season);
    if (aired === 0) continue;
    watched[season.seasonNumber] = withRange(watched[season.seasonNumber] ?? [], aired);
  }

  // Igual que marcar una temporada entera: lo que faltaba queda con la fecha
  // de ahora, y lo que ya tenía la suya la conserva.
  return withDates(watched, media.progress, now);
}

// --- Episodios nuevos -------------------------------------------------------

type WithNews = WithAiring & Pick<SavedMedia, 'newEpisodesSince'>;

/**
 * Si el refresco trajo episodios nuevos que valga la pena avisar.
 *
 * Solo en una serie que habías terminado o en la que estabas al día: en una
 * que estás viendo a tu ritmo, que salga otro episodio no es noticia. "Nuevo"
 * es lo que salió entre un refresco y otro, no lo que te falta ver: una serie
 * guardada hace años sin progreso no se llena de avisos la primera vez que se
 * refresca.
 *
 * Devuelve la marca a guardar —desde qué episodio hay novedades— o
 * `undefined`. Si ya había una, se conserva: el aviso habla de desde cuándo hay
 * cosas nuevas, y correrlo con cada episodio que sale lo achicaría.
 */
export function detectNewEpisodes(
  before: WithNews & Pick<SavedMedia, 'status' | 'mediaType'>,
  after: WithAiring,
  now: Date = new Date(),
): NewEpisodesMarker | undefined {
  if (before.mediaType !== 'tv') return undefined;
  if (before.newEpisodesSince) return before.newEpisodesSince;
  // Sin temporadas conocidas no se sabe qué había antes: todo parecería nuevo.
  if (totalEpisodes(before) === 0) return undefined;

  const wasFollowing = before.status === 'completada' || isCaughtUp(before);
  if (!wasFollowing) return undefined;
  if (airedEpisodes(after) <= airedEpisodes(before)) return undefined;

  const seasonsBefore = new Map(
    countableSeasons(before).map((season) => [season.seasonNumber, season]),
  );

  for (const season of countableSeasons(after)) {
    const previous = seasonsBefore.get(season.seasonNumber);
    const airedBefore = previous ? airedInSeason(before, previous) : 0;
    const airedNow = airedInSeason(after, season);
    const seen = after.progress?.watched[season.seasonNumber] ?? [];

    for (let episode = airedBefore + 1; episode <= airedNow; episode++) {
      if (!seen.includes(episode)) {
        return {
          seasonNumber: season.seasonNumber,
          episodeNumber: episode,
          detectedAt: now.toISOString(),
        };
      }
    }
  }
  return undefined;
}

/**
 * Lo que queda por ver de las novedades, para el aviso: "T3 nueva", "2
 * episodios nuevos". `null` si no hay nada —o si ya lo viste todo—.
 */
export function newEpisodesSummary(
  media: WithNews,
): { count: number; label: string } | null {
  const since = media.newEpisodesSince;
  if (!since) return null;

  const pending: { seasonNumber: number; episode: number }[] = [];
  for (const season of countableSeasons(media)) {
    if (season.seasonNumber < since.seasonNumber) continue;
    const aired = airedInSeason(media, season);
    const seen = media.progress?.watched[season.seasonNumber] ?? [];
    const first = season.seasonNumber === since.seasonNumber ? since.episodeNumber : 1;
    for (let episode = first; episode <= aired; episode++) {
      if (!seen.includes(episode)) pending.push({ seasonNumber: season.seasonNumber, episode });
    }
  }

  if (pending.length === 0) return null;

  // Una temporada que arrancó entera sin que la hayas empezado se nombra como
  // temporada: "T3 nueva" dice más que "2 episodios nuevos".
  const onlySeason = pending.every((item) => item.seasonNumber === since.seasonNumber);
  if (since.episodeNumber === 1 && onlySeason && pending[0].episode === 1) {
    return { count: pending.length, label: `T${since.seasonNumber} nueva` };
  }

  return {
    count: pending.length,
    label: `${pending.length} ${pending.length === 1 ? 'episodio nuevo' : 'episodios nuevos'}`,
  };
}

/** Si hay novedades sin ver. Es lo que mira el filtro de la biblioteca. */
export function hasNewEpisodes(media: WithNews): boolean {
  return newEpisodesSummary(media) !== null;
}
