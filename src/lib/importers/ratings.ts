/**
 * Puntajes de otras apps, a la escala de la app: de 0,5 a 5 en medias
 * estrellas.
 */

/** IMDb y Trakt puntúan de 1 a 10: cada punto es media estrella. */
export function fromTenPoint(value: unknown): number | undefined {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) return undefined;
  return Math.round(rating) / 2;
}

/** Letterboxd ya usa medias estrellas, de 0,5 a 5. */
export function fromStars(value: unknown): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0.5 || rating > 5) return undefined;
  return Math.round(rating * 2) / 2;
}
