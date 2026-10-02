/**
 * Con cuántos votos se muestra el puntaje de TMDB en la ficha.
 *
 * Más bajo que el de la página de persona (`MIN_VOTES`): acá no se ordena ni
 * se recomienda nada, solo se informa. Pero un 10,0 de dos votos dice menos
 * que no mostrar nada, y un título recién estrenado no tiene por qué cargar
 * con eso.
 */
export const MIN_SCORE_VOTES = 20;

/**
 * El puntaje de TMDB en la forma que se muestra: "7,8", con coma decimal.
 *
 * Devuelve `null` cuando no hay puntaje o no alcanza los votos: en ese caso
 * el chip no va, en vez de mostrar un número que no dice nada.
 */
export function formatTmdbScore(
  voteAverage: number | null | undefined,
  voteCount: number | null | undefined,
): string | null {
  if (!voteAverage || !Number.isFinite(voteAverage) || voteAverage <= 0) return null;
  if (!voteCount || voteCount < MIN_SCORE_VOTES) return null;

  return Math.min(voteAverage, 10).toFixed(1).replace('.', ',');
}
