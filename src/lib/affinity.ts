import { MediaType, SavedMedia } from '@/types';
import { LibraryEntry } from '@/lib/activity';
import { latestRating } from '@/lib/schema';

/**
 * "En común": cuánto se parece tu gusto al de otra persona.
 *
 * Se compara título por título lo que los dos puntuaron: con el resumen de su
 * biblioteca que publica en su actividad, y la tuya entera. Nada viaja al
 * servidor; el cálculo es de tu dispositivo.
 */

/** Con menos títulos puntuados en común, un porcentaje sería ruido. */
export const MIN_COMMON = 5;
/** Lo que cuenta como "les encantó a los dos". */
const LOVED = 4.5;
/** Lo que cuenta como "no coinciden": dos estrellas de diferencia o más. */
const DISAGREE = 2;
const MAX_LIST = 12;

export interface RatedPair {
  media: SavedMedia;
  mine: number;
  theirs: number;
}

export interface Affinity {
  /** De 0 a 100. */
  percent: number;
  /** Cuántos puntuaron los dos. */
  rated: number;
  /** Cuántos vieron los dos, con o sin puntaje. */
  seenBoth: number;
  bothLoved: RatedPair[];
  disagreements: RatedPair[];
}

const keyOf = (item: { mediaType: MediaType; tmdbId: number }) => `${item.mediaType}:${item.tmdbId}`;

const seen = (status: SavedMedia['status']) => status === 'completada' || status === 'viendo' || status === 'en_pausa';

/**
 * La afinidad, o `null` si no puntuaron suficientes cosas en común.
 *
 * El número es simple a propósito, para poder explicarlo: 100 menos la
 * diferencia promedio de estrellas, llevada a porcentaje. Dos personas que
 * le ponen siempre lo mismo a todo tienen 100; si siempre están a una
 * estrella de distancia, 78.
 */
export function affinity(mine: SavedMedia[], theirs: LibraryEntry[]): Affinity | null {
  const theirByKey = new Map(theirs.map((entry) => [keyOf(entry), entry]));
  const pairs: RatedPair[] = [];
  let seenBoth = 0;

  for (const media of mine) {
    const other = theirByKey.get(keyOf(media));
    if (!other) continue;
    if (seen(media.status) && seen(other.status)) seenBoth++;
    const rating = latestRating(media);
    if (rating && other.rating) pairs.push({ media, mine: rating, theirs: other.rating });
  }

  if (pairs.length < MIN_COMMON) return null;

  const meanGap = pairs.reduce((sum, pair) => sum + Math.abs(pair.mine - pair.theirs), 0) / pairs.length;
  // La mayor diferencia posible es de 0,5 a 5: 4,5 estrellas.
  const percent = Math.round(Math.max(0, 1 - meanGap / 4.5) * 100);
  const byTitle = (a: RatedPair, b: RatedPair) => a.media.title.localeCompare(b.media.title, 'es');

  return {
    percent,
    rated: pairs.length,
    seenBoth,
    bothLoved: pairs
      .filter((pair) => pair.mine >= LOVED && pair.theirs >= LOVED)
      .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs) || byTitle(a, b))
      .slice(0, MAX_LIST),
    disagreements: pairs
      .filter((pair) => Math.abs(pair.mine - pair.theirs) >= DISAGREE)
      .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs) || byTitle(a, b))
      .slice(0, MAX_LIST),
  };
}

/** "Se parecen mucho", en palabras, para acompañar el número. */
export function affinityLabel(percent: number): string {
  if (percent >= 85) return 'Tienen el mismo gusto';
  if (percent >= 70) return 'Se parecen mucho';
  if (percent >= 55) return 'Coinciden bastante';
  return 'Gustos distintos';
}

/**
 * Lo que la otra persona ya vio, para "¿Qué miramos juntos?": lo terminado
 * o abandonado de su resumen. Mismo criterio que con uno mismo.
 */
export function seenFromLibrary(library: LibraryEntry[]): { mediaType: MediaType; tmdbId: number }[] {
  return library
    .filter((entry) => entry.status === 'completada' || entry.status === 'abandonada')
    .map(({ mediaType, tmdbId }) => ({ mediaType, tmdbId }));
}
