import type { TMDbImage } from '@/lib/tmdb';

/** Cuántas fotos muestra la galería de la ficha. */
export const MAX_GALLERY_IMAGES = 20;

/**
 * Elige y ordena las fotos de la galería.
 *
 * Primero las más votadas en TMDB: son las que la comunidad eligió como las
 * mejores, y suelen ser los fotogramas más reconocibles. A igual puntaje, la
 * que juntó más votos, que es un puntaje más confiable.
 *
 * Se saca la que ya está de fondo en la ficha: repetida arriba de todo, la
 * primera foto de la galería parecería un error.
 */
export function pickGalleryImages(
  images: TMDbImage[],
  heroPath?: string | null,
  max = MAX_GALLERY_IMAGES,
): TMDbImage[] {
  const seen = new Set<string>();
  if (heroPath) seen.add(heroPath);

  const unique = images.filter((image) => {
    if (!image.file_path || seen.has(image.file_path)) return false;
    seen.add(image.file_path);
    return true;
  });

  return unique
    .map((image, index) => ({ image, index }))
    .sort(
      (a, b) =>
        b.image.vote_average - a.image.vote_average ||
        b.image.vote_count - a.image.vote_count ||
        // El orden de TMDB desempata, para que la galería no baile entre
        // aperturas.
        a.index - b.index,
    )
    .slice(0, max)
    .map(({ image }) => image);
}

/** El índice siguiente o anterior del visor, dando la vuelta en las puntas. */
export function stepIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return (((current + delta) % total) + total) % total;
}
